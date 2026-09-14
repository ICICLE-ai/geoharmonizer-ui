import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ImageOverlay,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  AlertTriangle,
  FolderCog,
  Grid2x2,
  Layers,
  Loader2,
  PencilLine,
  RefreshCw,
  ServerCog,
  UploadCloud,
  X,
} from "lucide-react";

import {
  describeLiveGaps,
  getLayers,
  getSources,
  getTimesteps,
  getVectorFeatures,
  getZonalStats,
  LAKE_API_URL,
  sampleLayerValues,
  uploadVectorFeature,
  USE_MOCK_SERVICES,
} from "../../services/lake";

import {
  buildSourceColors,
  computeDomain,
  COLORMAPS,
  formatDomainPair,
  formatValue,
  rescaleFor,
  shortSourceName,
} from "../../utils/lakeScale";

import { AOI_CENTER, AOI_ZOOM } from "../../utils/lakeMapConfig";

import {
  getIdentity,
  setIdentity as persistIdentity,
  subscribeIdentity,
} from "../../services/lakeIdentity";

import RasterTileLayer from "./RasterTileLayer";
import VectorFeaturesLayer from "./VectorFeaturesLayer";
import DrawTool from "./DrawTool";
import TimeSlider from "./TimeSlider";
import LayerPicker from "./LayerPicker";
import Legend from "./Legend";
import ProvenancePanel from "./ProvenancePanel";
import PointTimeseriesPanel from "./PointTimeseriesPanel";
import IdentitySwitcher from "./IdentitySwitcher";
import RasterUploadForm from "./RasterUploadForm";
import MyLayersPanel from "./MyLayersPanel";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';


/*
 * Frames a pending upload when its preview first appears. Showing an
 * overlay the user has to go hunting for would defeat the point of
 * previewing where the scene lands.
 */
function FitToPreview({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [bounds, map]);

  return null;
}


/* Clicking bare map opens the point series; drawing suppresses it. */
function MapClickHandler({ enabled, onPick }) {
  useMapEvents({
    click(event) {
      if (enabled) {
        onPick(event.latlng);
      }
    },
  });

  return null;
}


function LakeExplorer() {
  const [catalogue, setCatalogue] = useState(null);
  const [layerId, setLayerId] = useState(null);
  const [sourceFilter, setSourceFilter] = useState(null);

  const [timestepState, setTimestepState] = useState(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);

  const [opacity, setOpacity] = useState(0.85);
  const [colormap, setColormap] = useState(null);

  const [vectorState, setVectorState] = useState(null);
  const [showZonal, setShowZonal] = useState(false);
  const [zonalState, setZonalState] = useState(null);

  const [selectedFeature, setSelectedFeature] = useState(null);
  const [point, setPoint] = useState(null);

  const [drawing, setDrawing] = useState(false);
  const [drawStatus, setDrawStatus] = useState(null);

  const [identity, setIdentityState] = useState(getIdentity);
  const [sidePanel, setSidePanel] = useState(null);

  /* Bumped after an upload so My Layers refetches without a full reload. */
  const [uploadsVersion, setUploadsVersion] = useState(0);

  /* A locally-read GeoTIFF awaiting upload — see geotiffPreview.js. */
  const [preview, setPreview] = useState(null);

  const liveGaps = describeLiveGaps();

  /*
   * The Tapis session is verified asynchronously, so the identity at
   * mount is usually "no session yet" and only becomes the real
   * username a moment later. Without subscribing, the panel would sit
   * on that stale first read and uploads would look unavailable to a
   * user who is in fact signed in.
   */
  useEffect(() => subscribeIdentity(setIdentityState), []);

  /* ---- catalogue ---- */

  const loadCatalogue = useCallback(() => {
    const controller = new AbortController();

    Promise.all([
      getLayers({ signal: controller.signal }),
      getSources({ signal: controller.signal }),
    ])
      .then(([layerData, sourceData]) =>
        setCatalogue({
          status: "ready",
          layers: layerData.layers ?? [],
          sources: sourceData.sources ?? [],
        })
      )
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setCatalogue({ status: "error", error });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => loadCatalogue(), [loadCatalogue]);

  const layers = useMemo(
    () => catalogue?.layers ?? [],
    [catalogue]
  );

  /*
   * The active layer is derived rather than defaulted in an effect:
   * the first renderable layer stands in until something is chosen.
   */
  const activeLayer = useMemo(() => {
    if (layerId) {
      return layers.find((entry) => entry.layer_id === layerId) ?? null;
    }

    return layers.find((entry) => entry.renderable) ?? layers[0] ?? null;
  }, [layers, layerId]);

  const sourceColors = useMemo(
    () =>
      buildSourceColors(
        (catalogue?.sources ?? []).map((source) => source.source_id)
      ),
    [catalogue]
  );

  /* ---- timesteps ---- */

  const activeLayerId = activeLayer?.layer_id ?? null;

  useEffect(() => {
    if (!activeLayerId) {
      return undefined;
    }

    const controller = new AbortController();

    getTimesteps(activeLayerId, { signal: controller.signal })
      .then((data) =>
        setTimestepState({
          key: activeLayerId,
          status: "ready",
          data,
        })
      )
      .catch((error) => {
        if (error?.name === "AbortError") return;

        setTimestepState({
          key: activeLayerId,
          status: "error",
          error,
        });
      });

    return () => controller.abort();
  }, [activeLayerId]);

  const timesteps = useMemo(() => {
    if (timestepState?.key !== activeLayerId) {
      return [];
    }

    return timestepState?.data?.timesteps ?? [];
  }, [timestepState, activeLayerId]);

  /* Clamp rather than reset: the index is meaningless across layers
   * with different acquisition counts. */
  const safeIndex = timesteps.length
    ? Math.min(index, timesteps.length - 1)
    : 0;

  const currentStep = timesteps[safeIndex] ?? null;

  const neighbours = useMemo(() => {
    if (timesteps.length < 2) {
      return [];
    }

    return [
      timesteps[(safeIndex + 1) % timesteps.length],
      timesteps[
        (safeIndex - 1 + timesteps.length) % timesteps.length
      ],
    ];
  }, [timesteps, safeIndex]);

  /* ---- vector + zonal ---- */

  useEffect(() => {
    const controller = new AbortController();

    getVectorFeatures({}, { signal: controller.signal })
      .then((data) =>
        setVectorState({ status: "ready", data })
      )
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setVectorState({ status: "error", error });
      });

    return () => controller.abort();
  }, []);

  const features = vectorState?.data?.features ?? [];

  const layerName = activeLayer?.layer_name ?? null;

  useEffect(() => {
    if (!showZonal || !layerName) {
      return undefined;
    }

    const controller = new AbortController();

    getZonalStats(
      {
        layer: layerName,
        dateFrom: timesteps[0]?.date,
        dateTo: timesteps[timesteps.length - 1]?.date,
      },
      { signal: controller.signal }
    )
      .then((data) =>
        setZonalState({ key: layerName, status: "ready", data })
      )
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setZonalState({ key: layerName, status: "error", error });
      });

    return () => controller.abort();
  }, [showZonal, layerName, timesteps]);

  const zonalFeatures = useMemo(
    () =>
      showZonal && zonalState?.key === layerName
        ? zonalState?.data?.features ?? []
        : [],
    [showZonal, zonalState, layerName]
  );

  const zonalByFeature = useMemo(
    () =>
      new Map(
        zonalFeatures.map((entry) => [entry.feature_id, entry])
      ),
    [zonalFeatures]
  );

  const zonalDomain = useMemo(
    () =>
      zonalFeatures.length > 0
        ? computeDomain(zonalFeatures, activeLayer)
        : null,
    [zonalFeatures, activeLayer]
  );

  /*
   * The imagery stretch comes from the layer's declared range where one
   * exists. Every layer in the lake today declares none, so a computed
   * fallback below stands in — same shape as computeDomain() for the
   * zonal choropleth, held for the whole layer (never per date) for the
   * same reason: rescaling per timestep would draw a colour shift that
   * is really just this frame's stretch, not a change on the ground.
   */
  const declaredRescale = useMemo(
    () => rescaleFor(activeLayer),
    [activeLayer]
  );

  const [computedRescales, setComputedRescales] = useState(() => new Map());

  useEffect(() => {
    if (!activeLayer || declaredRescale) {
      return undefined;
    }

    const key = activeLayer.layer_id;

    if (computedRescales.has(key) || !activeLayer.region_bounds) {
      return undefined;
    }

    const controller = new AbortController();

    sampleLayerValues(
      { bbox: activeLayer.region_bounds, layer: activeLayer.layer_name },
      { signal: controller.signal }
    )
      .then((data) => {
        const domain = computeDomain(data.cells ?? [], activeLayer);

        // Recorded either way, including `null` on a flat/empty sample —
        // the map below distinguishes "not tried yet" from "tried, no
        // domain available," and only the former should hold the tile
        // layer back from mounting.
        setComputedRescales((current) =>
          new Map(current).set(key, domain ? [domain.min, domain.max] : null)
        );
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setComputedRescales((current) => new Map(current).set(key, null));
        }
      });

    return () => controller.abort();
  }, [activeLayer, declaredRescale, computedRescales]);

  const rescale =
    declaredRescale ??
    (activeLayer ? computedRescales.get(activeLayer.layer_id) : null) ??
    null;

  /*
   * Whether the stretch decision is final for this layer — either a
   * declared range, a resolved sample (found or not), or a layer with
   * no bounds to sample in the first place. The raster layer waits for
   * this rather than mounting once unstretched and again once a sample
   * arrives: mounting twice means fetching every tile in the viewport
   * twice, which is the single biggest cost on a layer's first paint.
   */
  const rescaleSettled =
    Boolean(declaredRescale) ||
    !activeLayer?.region_bounds ||
    (activeLayer ? computedRescales.has(activeLayer.layer_id) : false);

  const rasterDomain = rescale
    ? { min: rescale[0], max: rescale[1] }
    : null;

  /* geotiffPreview reports [west, south, east, north]; Leaflet wants
   * [[south, west], [north, east]]. */
  const previewBounds = useMemo(() => {
    const box = preview?.bboxWgs84;

    if (!box || !preview?.dataUrl) {
      return null;
    }

    return [
      [box[1], box[0]],
      [box[3], box[2]],
    ];
  }, [preview]);

  /* ---- drawing ---- */

  const handleDrawComplete = useCallback((geometry) => {
    setDrawing(false);
    setDrawStatus({ status: "saving" });

    uploadVectorFeature({
      layerTitle: "Drawn field",
      geometry,
      attributes: {},
    })
      .then((result) => {
        setDrawStatus({ status: "saved", result });

        /* Show it immediately rather than waiting for a refetch. */
        setVectorState((current) => ({
          status: "ready",
          data: {
            ...current?.data,
            features: [
              ...(current?.data?.features ?? []),
              {
                feature_id: result.feature_id,
                source_id: result.layer_id,
                layer_name: "drawn",
                geometry,
                attributes: { field_name: "Drawn field" },
              },
            ],
          },
        }));
      })
      .catch((error) =>
        setDrawStatus({ status: "error", error })
      );
  }, []);

  /* ---- provenance for whatever is currently on screen ---- */

  const activeProvenance = showZonal
    ? zonalState?.data?.provenance
    : timestepState?.data?.provenance;

  /* ---- catalogue failure ---- */

  if (catalogue?.status === "error") {
    const error = catalogue.error;

    return (
      <div className="lake-blocked">
        <AlertTriangle size={26} />

        <h2>
          {error?.kind === "storage"
            ? "The lake backend cannot read object storage"
            : "The lake backend is not reachable"}
        </h2>

        {error?.kind === "storage" ? (
          <>
            <p>
              The Iceberg catalog answered, but the query service could
              not read the data behind it. Its AWS credentials are not
              set — a backend problem that retrying from here cannot
              fix.
            </p>

            {error.detail ? (
              <pre className="lake-detail">{error.detail}</pre>
            ) : null}
          </>
        ) : (
          <p>
            Nothing answered at <code>{LAKE_API_URL}</code>. Start the
            query API, or set <code>VITE_USE_MOCK_SERVICES=true</code>{" "}
            to work against fixtures.
          </p>
        )}

        <button
          type="button"
          className="secondary-button"
          onClick={loadCatalogue}
        >
          <RefreshCw size={15} /> Check again
        </button>
      </div>
    );
  }

  return (
    <div className="lake-workspace">
      <div className="lake-map-pane">
        <MapContainer
          className="leaflet-root"
          center={AOI_CENTER}
          zoom={AOI_ZOOM}
          zoomControl={false}
          scrollWheelZoom
        >
          <ZoomControl position="topright" />

          <TileLayer
            url={OSM_URL}
            attribution={OSM_ATTRIBUTION}
            maxZoom={19}
          />

          {/* Imagery sits between the basemap and the boundaries. Held
            * back until the stretch decision is settled — see
            * rescaleSettled — so the tile layer mounts once, not twice. */}
          {currentStep && rescaleSettled ? (
            <RasterTileLayer
              timestep={currentStep}
              neighbours={neighbours}
              rescale={rescale}
              colormap={colormap}
              opacity={opacity}
            />
          ) : null}

          {/*
            * The pending upload, drawn from the local file. Sits above
            * the lake's own imagery so it is unmistakably the thing
            * being previewed, and disappears the moment the form
            * closes or the file is swapped.
            */}
          {previewBounds ? (
            <>
              <ImageOverlay
                url={preview.dataUrl}
                bounds={previewBounds}
                opacity={0.9}
                zIndex={400}
              />

              <FitToPreview bounds={previewBounds} />
            </>
          ) : null}

          <VectorFeaturesLayer
            features={features}
            zonalByFeature={zonalByFeature}
            showZonal={showZonal}
            domain={zonalDomain}
            selectedId={selectedFeature?.feature_id ?? null}
            onSelect={setSelectedFeature}
          />

          <DrawTool
            active={drawing}
            onComplete={handleDrawComplete}
            onCancel={() => setDrawing(false)}
          />

          <MapClickHandler
            enabled={!drawing}
            onPick={(latlng) =>
              setPoint({ lon: latlng.lng, lat: latlng.lat })
            }
          />
        </MapContainer>

        {/* Warnings ride over the map, attached to what they qualify. */}
        {activeProvenance?.warnings?.length ? (
          <div
            className={`lake-map-banner ${
              point ? "lake-map-banner-narrow" : ""
            }`}
            role="alert"
          >
            <AlertTriangle size={16} />

            <div>
              {activeProvenance.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        ) : null}

        {/* An empty legend box would sit on the map saying nothing. */}
        {(showZonal ? zonalDomain : rasterDomain) ? (
          <div className="lake-map-legend">
            <Legend
              mode={showZonal ? "zonal" : "raster"}
              domain={showZonal ? zonalDomain : rasterDomain}
              units={activeLayer?.units}
              colormap={colormap}
              layerName={activeLayer?.display_name}
            />
          </div>
        ) : null}

        {timesteps.length > 0 ? (
          <div className="lake-slider-dock">
            <TimeSlider
              timesteps={timesteps}
              index={safeIndex}
              onIndexChange={setIndex}
              sourceColors={sourceColors}
              playing={playing}
              onPlayingChange={setPlaying}
              speed={speed}
              onSpeedChange={setSpeed}
            />
          </div>
        ) : null}

        {drawing ? (
          <div className="lake-map-status">
            <PencilLine size={13} /> Click to place vertices ·
            double-click to finish · Esc to cancel
          </div>
        ) : null}

        {!drawing && currentStep && !rescaleSettled ? (
          <div className="lake-map-status">
            <Loader2 size={13} className="spin" /> Estimating display
            stretch…
          </div>
        ) : null}

        {!drawing && timestepState?.status === "error" ? (
          <div className="lake-map-status lake-map-status-empty">
            {timestepState.error?.kind === "unimplemented"
              ? "No imagery: this backend has no timestep endpoint yet"
              : "Could not load acquisition dates"}
          </div>
        ) : null}

        {!drawing &&
        timestepState?.status === "ready" &&
        timesteps.length === 0 ? (
          <div className="lake-map-status lake-map-status-empty">
            No acquisitions for this layer
          </div>
        ) : null}

        {point && !sidePanel ? (
          <PointTimeseriesPanel
            lon={point.lon}
            lat={point.lat}
            layer={layerName}
            units={activeLayer?.units}
            markedDate={currentStep?.date}
            onClose={() => setPoint(null)}
          />
        ) : null}

        {sidePanel === "upload" ? (
          <aside className="lake-cell-panel">
            <RasterUploadForm
              ownerId={identity.id}
              onPreview={setPreview}
              onClose={() => {
                setPreview(null);
                setSidePanel(null);
              }}
              onUploaded={() => {
                setPreview(null);
                setUploadsVersion((v) => v + 1);
                setSidePanel("mine");
                /* A new layer changes the catalogue the picker reads. */
                loadCatalogue();
              }}
            />
          </aside>
        ) : null}

        {sidePanel === "mine" ? (
          <MyLayersPanel
            identityId={identity.id}
            refreshKey={uploadsVersion}
            onClose={() => setSidePanel(null)}
          />
        ) : null}
      </div>

      <aside className="lake-side">
        {/*
          * Identity is back in the panel because it is now load-bearing,
          * not just a demo toggle: uploading a layer, changing its
          * visibility, and sharing it all require an owner to attribute
          * the action to, and anonymous cannot do any of them.
          */}
        <IdentitySwitcher
          identity={identity}
          onChange={(next) => {
            persistIdentity(next);
            setIdentityState(next);
            setSidePanel(null);
            /* Which layers are visible depends on who is asking. */
            loadCatalogue();
          }}
        />

        <div className="lake-control-row">
          <button
            type="button"
            className={`lake-filter-option ${
              sidePanel === "upload" ? "lake-filter-option-active" : ""
            }`}
            onClick={() =>
              setSidePanel(sidePanel === "upload" ? null : "upload")
            }
            disabled={!identity.id}
            title={
              identity.id
                ? "Upload a GeoTIFF as a new layer"
                : "Pick an identity first — uploads need an owner"
            }
          >
            <UploadCloud size={12} /> Upload
          </button>

          <button
            type="button"
            className={`lake-filter-option ${
              sidePanel === "mine" ? "lake-filter-option-active" : ""
            }`}
            onClick={() =>
              setSidePanel(sidePanel === "mine" ? null : "mine")
            }
            disabled={!identity.id}
            title={
              identity.id
                ? "Manage layers you own"
                : "Pick an identity first"
            }
          >
            <FolderCog size={12} /> My layers
          </button>
        </div>

        {/*
          * Mock mode and the live gaps are stated up front. Silently
          * showing fixtures, or an empty map where an endpoint is
          * missing, both read as "no data here" — which is a
          * different and much worse claim.
          */}
        {USE_MOCK_SERVICES ? (
          <div className="lake-mode-note">
            <ServerCog size={14} />

            <div>
              <strong>Fixture data</strong>

              <p className="lake-muted">
                <code>VITE_USE_MOCK_SERVICES</code> is on. Nothing here
                came from the lake.
              </p>
            </div>
          </div>
        ) : null}

        {liveGaps.length > 0 ? (
          <div className="lake-mode-note lake-mode-note-warn">
            <AlertTriangle size={14} />

            <div>
              <strong>Imagery unavailable</strong>

              <p className="lake-muted">
                This backend does not implement these yet:
              </p>

              <ul className="lake-gap-list">
                {liveGaps.map((gap) => (
                  <li key={gap}>
                    <code>{gap}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="lake-panel-block">
          <div className="lake-panel-heading">
            <Layers size={14} />
            <span>Layer</span>
          </div>

          {!catalogue ? (
            <p className="lake-muted lake-inline-status">
              <Loader2 size={14} className="spin" /> Loading layers…
            </p>
          ) : (
            <LayerPicker
              layers={layers}
              sources={catalogue.sources}
              value={activeLayerId}
              onChange={(layer) => {
                setLayerId(layer.layer_id);
                setIndex(0);
                setPlaying(false);
              }}
              sourceFilter={sourceFilter}
              onSourceFilterChange={setSourceFilter}
            />
          )}
        </div>

        <div className="lake-panel-block">
          <div className="lake-panel-heading">
            <span>Imagery</span>
          </div>

          <label className="lake-control">
            <span>Opacity</span>

            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) =>
                setOpacity(Number(event.target.value))
              }
            />

            <span className="lake-control-value">
              {Math.round(opacity * 100)}%
            </span>
          </label>

          <div className="lake-control-row">
            {COLORMAPS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`lake-filter-option ${
                  colormap === option.id
                    ? "lake-filter-option-active"
                    : ""
                }`}
                onClick={() => setColormap(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {rescale ? (
            <p className="lake-muted lake-res-note">
              Stretch {formatDomainPair(rescale[0], rescale[1])[0]} –{" "}
              {formatDomainPair(rescale[0], rescale[1])[1]}
              {declaredRescale ? "" : " (estimated from sampled values)"},
              fixed for every date in this layer.
            </p>
          ) : (
            <p className="lake-muted lake-res-note">
              This layer declares no valid range and none could be
              estimated, so no stretch is sent and the server's default
              applies.
            </p>
          )}
        </div>

        <div className="lake-panel-block">
          <div className="lake-panel-heading">
            <Grid2x2 size={14} />
            <span>Fields</span>
          </div>

          <div className="lake-control-row">
            <button
              type="button"
              className={`lake-filter-option ${
                showZonal ? "lake-filter-option-active" : ""
              }`}
              onClick={() => setShowZonal((value) => !value)}
            >
              {showZonal ? "Showing zonal stats" : "Show zonal stats"}
            </button>

            <button
              type="button"
              className={`lake-filter-option ${
                drawing ? "lake-filter-option-active" : ""
              }`}
              onClick={() => {
                setDrawing((value) => !value);
                setDrawStatus(null);
              }}
            >
              <PencilLine size={12} /> {drawing ? "Cancel" : "Draw"}
            </button>
          </div>

          <p className="lake-muted lake-res-note">
            {features.length === 0
              ? "No field boundaries returned for this view."
              : `${features.length} boundaries.`}
          </p>

          {showZonal && zonalState?.status === "error" ? (
            <p className="lake-error-text">
              {zonalState.error?.kind === "unimplemented"
                ? "Zonal statistics are not implemented on this backend yet."
                : zonalState.error?.message}
            </p>
          ) : null}

          {drawStatus?.status === "saving" ? (
            <p className="lake-muted lake-inline-status">
              <Loader2 size={13} className="spin" /> Saving polygon…
            </p>
          ) : null}

          {drawStatus?.status === "saved" ? (
            <p className="lake-muted">
              Saved as <code>{drawStatus.result.feature_id}</code>.
            </p>
          ) : null}

          {drawStatus?.status === "error" ? (
            <p className="lake-error-text">
              {drawStatus.error?.kind === "unimplemented"
                ? "Upload is not implemented on this backend yet — the polygon was not saved."
                : drawStatus.error?.message}
            </p>
          ) : null}
        </div>

        {selectedFeature ? (
          <div className="lake-panel-block">
            <div className="lake-panel-heading">
              <span>
                {selectedFeature.attributes?.field_name ??
                  selectedFeature.feature_id}
              </span>

              <button
                type="button"
                className="icon-button lake-heading-action"
                onClick={() => setSelectedFeature(null)}
                aria-label="Clear selection"
              >
                <X size={14} />
              </button>
            </div>

            <dl className="lake-facts">
              {Object.entries(
                selectedFeature.attributes ?? {}
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}

              {zonalByFeature.get(selectedFeature.feature_id) ? (
                <div>
                  <dt>zonal mean</dt>
                  <dd className="lake-strong">
                    {formatValue(
                      zonalByFeature.get(selectedFeature.feature_id)
                        .value
                    )}

                    {(zonalByFeature.get(selectedFeature.feature_id)
                      .sources?.length ?? 0) > 1 ? (
                      <span className="lake-chip lake-chip-warn">
                        mixed
                      </span>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            {(zonalByFeature.get(selectedFeature.feature_id)?.sources
              ?.length ?? 0) > 1 ? (
              <p className="lake-inline-warning">
                This statistic blends{" "}
                {zonalByFeature
                  .get(selectedFeature.feature_id)
                  .sources.map(shortSourceName)
                  .join(" and ")}
                , which measure at different ground resolutions.
              </p>
            ) : null}
          </div>
        ) : null}

        <ProvenancePanel
          provenance={activeProvenance}
          layerName={layerName}
        />
      </aside>
    </div>
  );
}

export default LakeExplorer;
