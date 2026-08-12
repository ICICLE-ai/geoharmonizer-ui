import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMap,
  ZoomControl,
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

import {
  AlertTriangle,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  MapPin,
  Trash2,
  UploadCloud,
} from "lucide-react";

import {
  readGeoFiles,
  rehydrateLayers,
  UPLOAD_ACCEPT,
} from "../../services/geoFiles";

import {
  loadCachedLayers,
  saveCachedLayers,
} from "../../services/layerCache";

import {
  featureCollectionBounds,
} from "../../utils/geometry";


const OSM_URL =
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/* Roughly the continental US — only used before anything is loaded. */
const DEFAULT_CENTER = [39.5, -95];
const DEFAULT_ZOOM = 4;


/* Deeper than the palette green so boundaries read on light tiles. */
const BASE_STYLE = {
  color: "#2f7d52",
  weight: 2.5,
  dashArray: "5 4",
  fillColor: "#7cb88f",
  fillOpacity: 0.2,
};

const SELECTED_STYLE = {
  color: "#55d6c4",
  weight: 3,
  dashArray: null,
  fillColor: "#55d6c4",
  fillOpacity: 0.25,
};


/*
 * Leaflet caches the container size, so it has to be told whenever
 * the workspace around it changes shape (drawers, window resize).
 */
function KeepMapSized() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [map]);

  return null;
}


/* Points would otherwise render as markers with missing icon assets. */
const pointToLayer = (feature, latlng) =>
  L.circleMarker(latlng, {
    radius: 6,
  });


const layerArea = (layer) =>
  layer.features.reduce(
    (sum, feature) => sum + feature.__gh.areaKm2,
    0
  );


function MapViewer({
  selectedIds,
  onSelectionChange,
  uploadRequested,
  onUploadHandled,
}) {
  /* One layer per uploaded file; uploads add to the list. */
  const [layers, setLayers] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [dragging, setDragging] = useState(false);

  /* Until the cache has been read, there is nothing safe to write. */
  const [cacheRead, setCacheRead] = useState(false);

  const fileInputRef = useRef(null);
  const mapRef = useRef(null);

  /* Leaflet GeoJSON layer instances, keyed by our layer id. */
  const geoJsonRefs = useRef(new Map());

  const visibleFeatures = useMemo(
    () =>
      layers
        .filter((layer) => layer.visible)
        .flatMap((layer) => layer.features),
    [layers]
  );

  /*
   * Leaflet binds each feature's click handler once, so the current
   * selection has to come from a ref rather than a closure. The ref
   * is written synchronously on every change too — React batches
   * state updates, so two clicks in one tick would otherwise both
   * read the pre-batch selection and the first would be lost.
   */
  const selectionRef = useRef(selectedIds);
  const featuresRef = useRef(visibleFeatures);

  useEffect(() => {
    selectionRef.current = selectedIds;
    featuresRef.current = visibleFeatures;
  }, [selectedIds, visibleFeatures]);


  const emitSelection = useCallback(
    (nextIds) => {
      selectionRef.current = nextIds;

      const byId = new Map(
        featuresRef.current.map((feature) => [
          feature.__gh.id,
          feature,
        ])
      );

      onSelectionChange(
        nextIds,
        nextIds
          .map((id) => byId.get(id))
          .filter(Boolean)
      );
    },
    [onSelectionChange]
  );


  const fitTo = useCallback((features) => {
    const bounds = featureCollectionBounds(features);

    if (!bounds || !mapRef.current) {
      return;
    }

    const [minX, minY, maxX, maxY] = bounds;

    mapRef.current.fitBounds(
      [
        [minY, minX],
        [maxY, maxX],
      ],
      {
        padding: [48, 48],
        maxZoom: 16,
      }
    );
  }, []);


  const loadFiles = useCallback(
    async (fileList) => {
      setLoading(true);
      setError(null);
      setWarnings([]);

      try {
        const result = await readGeoFiles(fileList);

        featuresRef.current = [
          ...featuresRef.current,
          ...result.layers.flatMap(
            (layer) => layer.features
          ),
        ];

        setLayers((current) => [
          ...current,
          ...result.layers,
        ]);

        setWarnings(result.warnings);

        fitTo(
          result.layers.flatMap(
            (layer) => layer.features
          )
        );
      } catch (loadError) {
        setError(
          loadError?.message ||
            "That file could not be read."
        );
      } finally {
        setLoading(false);
      }
    },
    [fitTo]
  );


  /* Anything no longer on the map cannot stay selected. */
  const dropFromSelection = useCallback(
    (features) => {
      const dropped = new Set(
        features.map((feature) => feature.__gh.id)
      );

      const next = selectionRef.current.filter(
        (id) => !dropped.has(id)
      );

      if (next.length !== selectionRef.current.length) {
        emitSelection(next);
      }
    },
    [emitSelection]
  );


  const toggleLayerVisibility = useCallback(
    (layerId) => {
      setLayers((current) =>
        current.map((layer) =>
          layer.id === layerId
            ? { ...layer, visible: !layer.visible }
            : layer
        )
      );

      const layer = layers.find(
        (candidate) => candidate.id === layerId
      );

      if (layer?.visible) {
        dropFromSelection(layer.features);
      }
    },
    [layers, dropFromSelection]
  );


  const removeLayer = useCallback(
    (layerId) => {
      const layer = layers.find(
        (candidate) => candidate.id === layerId
      );

      geoJsonRefs.current.delete(layerId);

      setLayers((current) =>
        current.filter(
          (candidate) => candidate.id !== layerId
        )
      );

      if (layer) {
        dropFromSelection(layer.features);
      }
    },
    [layers, dropFromSelection]
  );


  /*
   * Restore whatever was uploaded in an earlier session. Switching
   * between the map and jobs views does not come through here — the
   * map stays mounted — so this runs once, on a cold start.
   */
  useEffect(() => {
    let cancelled = false;

    loadCachedLayers().then((stored) => {
      if (cancelled) {
        return;
      }

      const restored = rehydrateLayers(stored);

      if (restored.length > 0) {
        setLayers(restored);

        fitTo(
          restored.flatMap((layer) => layer.features)
        );
      }

      setCacheRead(true);
    });

    return () => {
      cancelled = true;
    };
  }, [fitTo]);


  useEffect(() => {
    if (!cacheRead) {
      return;
    }

    saveCachedLayers(layers);
  }, [layers, cacheRead]);


  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);


  /*
   * The Upload button in the top bar flips this flag; opening the
   * picker here keeps the file input owned by the map.
   */
  useEffect(() => {
    if (!uploadRequested) {
      return;
    }

    openFilePicker();

    onUploadHandled();
  }, [
    uploadRequested,
    onUploadHandled,
    openFilePicker,
  ]);


  /*
   * Restyle in place on selection changes — rebuilding the vector
   * layers on every click would be needlessly expensive.
   */
  useEffect(() => {
    const styleFor = (feature) =>
      selectedIds.includes(feature.__gh?.id)
        ? SELECTED_STYLE
        : BASE_STYLE;

    for (const layer of geoJsonRefs.current.values()) {
      layer.setStyle(styleFor);
    }
  }, [selectedIds, layers]);


  const onEachFeature = useCallback(
    (feature, layer) => {
      const meta = feature.__gh;

      if (!meta) {
        return;
      }

      layer.bindTooltip(
        `${meta.name} · ${meta.areaKm2.toFixed(2)} km²`,
        {
          sticky: true,
        }
      );

      layer.on("click", () => {
        const current = selectionRef.current;

        emitSelection(
          current.includes(meta.id)
            ? current.filter((id) => id !== meta.id)
            : [...current, meta.id]
        );
      });
    },
    [emitSelection]
  );


  const handleDrop = (event) => {
    event.preventDefault();

    setDragging(false);

    if (event.dataTransfer?.files?.length) {
      loadFiles(event.dataTransfer.files);
    }
  };


  const selectedFeatures = visibleFeatures.filter(
    (feature) => selectedIds.includes(feature.__gh.id)
  );

  const totalArea = selectedFeatures.reduce(
    (sum, feature) => sum + feature.__gh.areaKm2,
    0
  );


  return (
    <main className="map-workspace">
      <div
        className={`map-background ${
          dragging ? "drag-active" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(
              event.relatedTarget
            )
          ) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        <MapContainer
          ref={mapRef}
          className="leaflet-root"
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          zoomControl={false}
          scrollWheelZoom
        >
          {/* Top left belongs to the layer panel. */}
          <ZoomControl position="topright" />

          <TileLayer
            url={OSM_URL}
            attribution={OSM_ATTRIBUTION}
            maxZoom={19}
          />

          {layers
            .filter((layer) => layer.visible)
            .map((layer) => (
              <GeoJSON
                key={layer.id}
                ref={(instance) => {
                  if (instance) {
                    geoJsonRefs.current.set(
                      layer.id,
                      instance
                    );
                  } else {
                    geoJsonRefs.current.delete(
                      layer.id
                    );
                  }
                }}
                data={{
                  type: "FeatureCollection",
                  features: layer.features,
                }}
                style={BASE_STYLE}
                pointToLayer={pointToLayer}
                onEachFeature={onEachFeature}
              />
            ))}

          <KeepMapSized />
        </MapContainer>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="map-file-input"
          onChange={(event) => {
            if (event.target.files?.length) {
              loadFiles(event.target.files);
            }

            /* Allow re-selecting the same file. */
            event.target.value = "";
          }}
        />

        {layers.length === 0 ? (
          <button
            type="button"
            className="map-upload-hint"
            onClick={openFilePicker}
          >
            <UploadCloud size={17} />

            <div>
              <strong>
                Upload field boundaries
              </strong>

              <span>
                Shapefile (.zip or .shp+.dbf+.prj) ·
                GeoPackage (.gpkg) · GeoJSON
              </span>
            </div>
          </button>
        ) : (
          <div className="map-layers-panel">
            <div className="map-layers-head">
              <Layers size={14} />

              <strong>
                Layers ({layers.length})
              </strong>

              <button
                type="button"
                onClick={openFilePicker}
                aria-label="Upload another file"
                title="Upload boundaries"
              >
                <UploadCloud size={14} />
              </button>
            </div>

            <ul className="map-layer-list">
              {layers.map((layer) => (
                <li
                  key={layer.id}
                  className={
                    layer.visible
                      ? "map-layer-row"
                      : "map-layer-row layer-off"
                  }
                >
                  <button
                    type="button"
                    className="layer-toggle"
                    onClick={() =>
                      toggleLayerVisibility(
                        layer.id
                      )
                    }
                    aria-pressed={layer.visible}
                    aria-label={`${
                      layer.visible
                        ? "Hide"
                        : "Show"
                    } ${layer.name}`}
                    title={
                      layer.visible
                        ? "Hide layer"
                        : "Show layer"
                    }
                  >
                    {layer.visible ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                  </button>

                  <button
                    type="button"
                    className="layer-name"
                    onClick={() =>
                      fitTo(layer.features)
                    }
                    title={`Zoom to ${layer.name}`}
                  >
                    <strong>{layer.name}</strong>

                    <span>
                      {layer.features.length} feature
                      {layer.features.length === 1
                        ? ""
                        : "s"}{" "}
                      · {layerArea(layer).toFixed(1)}{" "}
                      km²
                    </span>
                  </button>

                  <span className="layer-actions">
                    <button
                      type="button"
                      onClick={() =>
                        fitTo(layer.features)
                      }
                      aria-label={`Zoom to ${layer.name}`}
                      title="Zoom to layer"
                    >
                      <Crosshair size={14} />
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        removeLayer(layer.id)
                      }
                      aria-label={`Remove ${layer.name}`}
                      title="Remove layer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="map-toast">
            <Loader2 size={15} className="spin" />
            Reading boundaries…
          </div>
        ) : null}

        {error ? (
          <div className="map-toast map-toast-error">
            <AlertTriangle size={15} />
            {error}
          </div>
        ) : null}

        {!error && warnings.length > 0 ? (
          <div className="map-toast map-toast-warn">
            <AlertTriangle size={15} />
            {warnings[0]}
          </div>
        ) : null}

        {dragging ? (
          <div className="map-drop-overlay">
            <UploadCloud size={26} />
            Drop shapefile, GeoPackage or GeoJSON
          </div>
        ) : null}

        <div className="map-status">
          <MapPin size={14} />

          {selectedIds.length === 0
            ? layers.length === 0
              ? "No boundaries loaded"
              : `${visibleFeatures.length} feature${
                  visibleFeatures.length === 1
                    ? ""
                    : "s"
                } shown · none selected`
            : `${selectedIds.length} field${
                selectedIds.length > 1 ? "s" : ""
              } selected · ${totalArea.toFixed(
                1
              )} km²`}
        </div>

        <div className="map-crs">
          EPSG:4326 · OpenStreetMap
        </div>
      </div>
    </main>
  );
}


export default MapViewer;
