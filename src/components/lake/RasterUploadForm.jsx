import { useCallback, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";

import {
  findIngestedScenes,
  uploadManifestScenes,
  uploadRaster,
  LakeError,
} from "../../services/lake";
import {
  isManifestFile,
  isRasterFile,
  parseManifest,
  reconcile,
} from "../../utils/manifest";
import { readGeotiffPreview } from "../../utils/geotiffPreview";
import { formatValue } from "../../utils/lakeScale";

/*
 * Upload a GeoTIFF as a new layer.
 *
 * The file goes straight from the browser to S3 via a presigned URL —
 * it never passes through the query API. Registration then returns
 * immediately with the layer in an "ingesting" state rather than
 * waiting: turning pixels into queryable rows means an H3 tag per
 * pixel, which is far too slow to hold an HTTP request open for.
 *
 * `obs_date` is required and deliberately has no default. A raw
 * GeoTIFF carries no acquisition date, and defaulting it to today
 * would stamp every upload with provenance that is simply untrue —
 * the same reason the vector adapter refuses to invent valid_from.
 */

const STAGE_LABEL = {
  presigning: "Requesting upload URL…",
  uploading: "Uploading to S3…",
  registering: "Registering layer…",
};


function RasterUploadForm({ onClose, onUploaded, onPreview, ownerId }) {
  const fileRef = useRef(null);
  const addFilesRef = useRef(null);
  const addFolderRef = useRef(null);

  const [file, setFile] = useState(null);
  const [layerName, setLayerName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [units, setUnits] = useState("");
  const [obsDate, setObsDate] = useState("");
  const [visibility, setVisibility] = useState("private");

  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);

  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);

  /* Multi-scene mode: a manifest.json plus the rasters it names. */
  const [manifest, setManifest] = useState(null);
  const [rasterFiles, setRasterFiles] = useState([]);
  const [ingested, setIngested] = useState(() => new Set());
  const [progress, setProgress] = useState(null);
  const [checking, setChecking] = useState(false);

  const isMulti = manifest !== null;

  /*
   * Derived, not stored: the scene states depend on the manifest, the
   * files gathered so far AND what previous batches already ingested,
   * and keeping a copy in state would just be three things to forget
   * to update.
   */
  const reconciliation = useMemo(
    () => (manifest ? reconcile(manifest, rasterFiles, ingested) : null),
    [manifest, rasterFiles, ingested]
  );

  const busy = stage !== null;

  const canSubmit = isMulti
    /*
     * Whatever files are in hand is enough — the rest can follow in a
     * later batch. The only requirement is that this batch would
     * actually ingest something.
     */
    ? reconciliation?.ready.length > 0 && !busy
    : file && layerName.trim() && obsDate && !busy;

  /*
   * Load a manifest and work out what is left to do.
   *
   * The manifest may arrive on its own — that is the point of the
   * incremental flow: see the whole plan first, then bring files in
   * whatever batches are practical.
   */
  const loadManifest = useCallback(
    async (manifestFile, initialRasters = []) => {
      setReading(true);
      setError(null);

      try {
        const parsed = parseManifest(await manifestFile.text());

        parsed.file = manifestFile;

        setManifest(parsed);
        setRasterFiles(initialRasters);
        setFile(null);
        setVisibility(parsed.visibility);

        /* What earlier batches already put in the lake. */
        setChecking(true);
        try {
          setIngested(await findIngestedScenes(parsed, ownerId));
        } finally {
          setChecking(false);
        }

        const firstNamed = parsed.files
          .map((name) => initialRasters.find((f) => f.name === name))
          .find(Boolean);

        if (firstNamed) {
          const result = await readGeotiffPreview(firstNamed);
          setPreview(result);
          onPreview?.(result);
        }
      } catch (err) {
        setManifest(null);
        setRasterFiles([]);
        setIngested(new Set());
        setError(
          err?.isManifestError
            ? `${manifestFile.name} — ${err.message}`
            : `Could not read the manifest: ${err?.message}`
        );
      } finally {
        setReading(false);
      }
    },
    [ownerId, onPreview]
  );


  /*
   * Files gathered in a later batch ADD to what is already in hand
   * rather than replacing it, so several picks — and a folder — can be
   * combined before uploading. A folder pick brings everything in the
   * directory, so non-rasters are filtered out here rather than
   * bothering the user about them.
   */
  const addRasters = useCallback(async (incoming) => {
    const rasters = incoming.filter(isRasterFile);

    if (rasters.length === 0) {
      return;
    }

    setRasterFiles((current) => {
      const byName = new Map(current.map((f) => [f.name, f]));
      for (const f of rasters) {
        byName.set(f.name, f);
      }
      return [...byName.values()];
    });
  }, []);


  const submit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setError(null);

    try {
      let result;

      if (isMulti) {
        setStage("uploading");

        /* Only the files backing scenes this batch can ingest. */
        const needed = new Set(reconciliation.ready.map((s) => s.file));

        result = await uploadManifestScenes({
          manifestFile: manifest.file,
          rasterFiles: rasterFiles.filter((f) => needed.has(f.name)),
          onProgress: setProgress,
        });
      } else {
        result = await uploadRaster({
          file,
          layerName: layerName.trim(),
          displayName: displayName.trim(),
          units: units.trim(),
          obsDate,
          visibility,
          onStage: setStage,
        });
      }

      setStage(null);
      setProgress(null);

      if (isMulti) {
        /*
         * Stay on the manifest instead of closing. A partial upload is
         * the expected case, so the natural next step is to see what
         * just landed and add the next batch — not to start over.
         */
        setRasterFiles([]);
        setChecking(true);
        try {
          setIngested(await findIngestedScenes(manifest, ownerId));
        } finally {
          setChecking(false);
        }
      }

      /*
       * No onClose() here — the parent decides what to show next (it
       * switches to My Layers so the new layer's ingest status is
       * immediately visible). Calling both would close the form and
       * then instantly undo the parent's navigation.
       */
      onUploaded?.(result);
    } catch (err) {
      setStage(null);
      setProgress(null);
      setError(
        err instanceof LakeError
          ? err.detail || err.message
          : err?.message || "Upload failed."
      );
    }
  };

  return (
    <form className="lake-upload-form" onSubmit={submit}>
      <div className="lake-cell-head">
        <div className="lake-panel-heading">
          <UploadCloud size={15} />
          <span>Upload a raster layer</span>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close upload form"
          disabled={busy}
        >
          <X size={17} />
        </button>
      </div>

      <button
        type="button"
        className={`lake-file-drop ${file ? "lake-file-drop-set" : ""}`}
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {isMulti ? (
          <>
            <strong>
              {manifest.title || "manifest.json"}
            </strong>
            <span className="lake-muted">
              {manifest.scenes.length} scene
              {manifest.scenes.length === 1 ? "" : "s"} ·{" "}
              {manifest.layerNames.length} layer
              {manifest.layerNames.length === 1 ? "" : "s"} ·{" "}
              {rasterFiles.length} file
              {rasterFiles.length === 1 ? "" : "s"} selected
            </span>
          </>
        ) : file ? (
          <>
            <strong>{file.name}</strong>
            <span className="lake-muted">
              {(file.size / 1_048_576).toFixed(1)} MB
            </span>
          </>
        ) : (
          <>
            <strong>Choose a GeoTIFF</strong>
            <span className="lake-muted">
              one .tif, or several plus a manifest.json
            </span>
          </>
        )}
      </button>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".tif,.tiff,image/tiff,.json,.yaml,.yml,application/json"
        className="map-file-input"
        onChange={async (event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = "";

          if (chosen.length === 0) {
            return;
          }

          setError(null);
          setPreview(null);
          onPreview?.(null);

          /*
           * A manifest in the selection switches this into multi-scene
           * mode: the manifest, not the form, then supplies every
           * scene's layer, date and units.
           */
          const manifests = chosen.filter(isManifestFile);

          if (manifests.length > 1) {
            setError(
              `Select one manifest, not ${manifests.length}: ` +
              manifests.map((f) => f.name).join(", ")
            );
            return;
          }

          const manifestFile = manifests[0];

          if (manifestFile) {
            const rasters = chosen.filter((f) => !isManifestFile(f));

            await loadManifest(manifestFile, rasters);
            return;
          }

          /* No manifest: the original single-file path. */
          const picked = chosen[0];

          setManifest(null);
          setRasterFiles([]);
          setIngested(new Set());
          setFile(picked);

          /* A sensible starting name, still fully editable. */
          if (!layerName) {
            setLayerName(
              picked.name.replace(/\.tiff?$/i, "").toLowerCase()
            );
          }

          /*
           * Read it locally before anything is uploaded, so a wrong
           * file or a broken georeference is caught here rather than
           * after it has been written to S3 and ingested.
           */
          setReading(true);

          try {
            const result = await readGeotiffPreview(picked);
            setPreview(result);
            onPreview?.(result);
          } catch (err) {
            setPreview(null);
            onPreview?.(null);
            setError(
              `Could not read this file as a GeoTIFF: ${err?.message}`
            );
          } finally {
            setReading(false);
          }
        }}
      />

      {/* Later batches: more files, or a whole directory. */}
      <input
        ref={addFilesRef}
        type="file"
        multiple
        accept=".tif,.tiff,image/tiff"
        className="map-file-input"
        onChange={(event) => {
          addRasters([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      <input
        ref={addFolderRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        className="map-file-input"
        onChange={(event) => {
          addRasters([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      {reading ? (
        <p className="lake-muted lake-inline-status">
          <Loader2 size={13} className="spin" /> Reading the file…
        </p>
      ) : null}

      {/*
        * What the manifest says will be ingested, shown before anything
        * is uploaded. Scenes sharing a layer become that layer's
        * timesteps — which is the whole reason to upload a set rather
        * than one file at a time.
        */}
      {isMulti ? (
        <div className="lake-preview">
          {/*
            * Files can arrive across several sittings, so this is the
            * plan AND the progress: what the lake already has, what
            * this batch will add, and what is still outstanding.
            */}
          <div className="lake-batch-summary">
            <span className="lake-chip lake-chip-ok">
              {reconciliation.done.length} in the lake
            </span>
            <span className="lake-chip">
              {reconciliation.ready.length} ready now
            </span>
            {reconciliation.waiting.length ? (
              <span className="lake-chip lake-chip-warn">
                {reconciliation.waiting.length} still needed
              </span>
            ) : null}
            {checking ? (
              <span className="lake-muted lake-inline-status">
                <Loader2 size={11} className="spin" /> checking…
              </span>
            ) : null}
          </div>

          <div className="lake-control-row">
            <button
              type="button"
              className="lake-filter-option"
              onClick={() => addFilesRef.current?.click()}
              disabled={busy}
            >
              <Plus size={12} /> Add files
            </button>

            <button
              type="button"
              className="lake-filter-option"
              onClick={() => addFolderRef.current?.click()}
              disabled={busy}
            >
              <FolderOpen size={12} /> Add folder
            </button>
          </div>

          {manifest.layerNames.map((name) => {
            const scenes = reconciliation.scenes.filter(
              (s) => s.layerName === name
            );

            return (
              <div key={name} className="lake-scene-layer">
                <div className="lake-layer-line">
                  <strong>{name}</strong>

                  <span className="lake-chip">
                    {scenes.length} timestep
                    {scenes.length === 1 ? "" : "s"}
                  </span>
                </div>

                <ul className="lake-scene-list">
                  {scenes.map((scene) => (
                    <li
                      key={`${name}-${scene.date}`}
                      className={`lake-scene-${scene.state}`}
                    >
                      <span className="lake-scene-date">
                        {scene.granularity === "monthly"
                          ? scene.date.slice(0, 7)
                          : scene.date}
                      </span>

                      {/*
                        * A month names a composite, not an overpass.
                        * Saying so here is the only place the uploader
                        * sees it before it becomes provenance.
                        */}
                      {scene.granularity === "monthly" ? (
                        <span className="lake-chip">monthly</span>
                      ) : null}

                      <code>{scene.file}</code>

                      {scene.state === "done" ? (
                        <Check size={12} className="lake-scene-tick" />
                      ) : scene.state === "waiting" ? (
                        <span className="lake-chip lake-chip-warn">
                          need file
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {reconciliation.waiting.length ? (
            <p className="lake-muted lake-res-note">
              The remaining {reconciliation.waiting.length} scene
              {reconciliation.waiting.length === 1 ? "" : "s"} can come
              later — upload what you have, then reopen this manifest
              and add the rest. Scenes already in the lake are skipped.
            </p>
          ) : null}

          {reconciliation.unreferenced.length ? (
            <p className="lake-inline-warning">
              <AlertTriangle size={12} />{" "}
              {reconciliation.unreferenced.length} selected file
              {reconciliation.unreferenced.length === 1 ? " is" : "s are"}{" "}
              not named in the manifest and will be ignored:{" "}
              {reconciliation.unreferenced.slice(0, 3).join(", ")}
              {reconciliation.unreferenced.length > 3 ? ", …" : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        * Everything below is read from the file on this machine — no
        * upload has happened yet. It is here so a wrong file, a bad
        * georeference or an all-nodata scene is caught while backing
        * out is still free.
        */}
      {preview ? (
        <div className="lake-preview">
          {preview.dataUrl ? (
            <img
              className="lake-preview-image"
              src={preview.dataUrl}
              alt="Preview of the selected raster"
            />
          ) : (
            <p className="lake-inline-warning">
              Every pixel in this file is nodata — there is nothing to
              ingest.
            </p>
          )}

          <dl className="lake-source-facts">
            <div>
              <dt>Size</dt>
              <dd>
                {preview.width} × {preview.height}
                {preview.bands > 1 ? ` · ${preview.bands} bands` : ""}
              </dd>
            </div>

            <div>
              <dt>Resolution</dt>
              <dd>
                {preview.resolutionM
                  ? `${preview.resolutionM.toFixed(1)} m`
                  : "—"}
              </dd>
            </div>

            <div>
              <dt>CRS</dt>
              <dd>
                {preview.epsgCode ? `EPSG:${preview.epsgCode}` : "—"}
              </dd>
            </div>

            <div>
              <dt>Value range</dt>
              <dd>
                {preview.min === null
                  ? "—"
                  : `${formatValue(preview.min)} – ${formatValue(preview.max)}`}
              </dd>
            </div>
          </dl>

          {preview.bands > 1 ? (
            <p className="lake-muted lake-res-note">
              Preview shows band 1. Uploading ingests band 1 as this
              layer — multi-band files are split by the CLI ingester,
              not here.
            </p>
          ) : null}

          {preview.unsupportedCrs ? (
            <p className="lake-inline-warning">
              <AlertTriangle size={12} /> This file&apos;s CRS could not
              be converted for the map preview, so it is not shown in
              place. Ingestion still handles it — the server reprojects
              with the full PROJ database.
            </p>
          ) : null}

          {!preview.bboxWgs84 && !preview.unsupportedCrs ? (
            <p className="lake-inline-warning">
              <AlertTriangle size={12} /> No georeference found. The
              pixels can still be read, but nothing can place them on
              the ground.
            </p>
          ) : null}
        </div>
      ) : null}

      {isMulti ? null : (
      <>
      <label className="lake-field">
        <span>Layer name <em>required</em></span>

        <input
          value={layerName}
          onChange={(event) => setLayerName(event.target.value)}
          placeholder="soil_moisture"
          disabled={busy}
        />
      </label>

      <label className="lake-field">
        <span>Display name</span>

        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Soil Moisture"
          disabled={busy}
        />
      </label>

      <div className="lake-field-row">
        <label className="lake-field">
          <span>Units</span>

          <input
            value={units}
            onChange={(event) => setUnits(event.target.value)}
            placeholder="m3/m3"
            disabled={busy}
          />
        </label>

        <label className="lake-field">
          <span>Date <em>required</em></span>

          <input
            type="date"
            value={obsDate}
            onChange={(event) => setObsDate(event.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      {/*
        * The date carries real weight: it is what every time series and
        * cross-source comparison will place this raster at. There is
        * nothing in the file to derive it from.
        */}
      <p className="lake-muted lake-res-note">
        The date is not read from the file — a GeoTIFF carries no
        acquisition date, so this is what the lake will record as when
        these pixels were measured.
      </p>
      </>
      )}

      <div className="lake-field">
        <span>
          Visibility
          {isMulti ? <em>from manifest</em> : null}
        </span>

        <div className="lake-control-row">
          {["private", "public"].map((option) => (
            <button
              key={option}
              type="button"
              className={`lake-filter-option ${
                visibility === option ? "lake-filter-option-active" : ""
              }`}
              onClick={() => setVisibility(option)}
              disabled={busy || isMulti}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="lake-error-text">{error}</p> : null}

      <div className="lake-control-row">
        <button
          type="submit"
          className="primary-button full-width"
          disabled={!canSubmit}
        >
          {busy ? (
            <>
              <Loader2 size={14} className="spin" />
              {progress && progress.index < progress.total
                ? `Uploading ${progress.index + 1}/${progress.total} — ${progress.name}`
                : progress
                  ? "Registering scenes…"
                  : STAGE_LABEL[stage]}
            </>
          ) : isMulti ? (
            `Upload ${reconciliation.ready.length} scene${
              reconciliation.ready.length === 1 ? "" : "s"
            } and ingest`
          ) : (
            "Upload and ingest"
          )}
        </button>
      </div>

      <p className="lake-muted lake-res-note">
        The file uploads straight to S3, then ingests in the background.
        It appears under My Layers immediately and becomes queryable
        when ingestion finishes.
      </p>
    </form>
  );
}

export default RasterUploadForm;
