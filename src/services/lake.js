/*
 * Client for the Geo Harmonizer lake query API.
 *
 * Follows the service convention used by availability.js and chat.js:
 * one exported function per endpoint, each with a mock implementation
 * behind VITE_USE_MOCK_SERVICES.
 *
 * Mocks remain useful for offline demos and fast iteration on layout,
 * but every endpoint in the contract is now implemented server-side —
 * `describeLiveGaps()` returns empty in live mode. Tiles, timesteps,
 * zonal stats and vector upload were added to harvest-iceberg-datalake
 * alongside this UI (see that repo's acquisition_registry table and
 * /tiles route) rather than staying UI-only mocks.
 *
 * Two adapters keep the rest of the app writing against the contract
 * even where the live service differs:
 *
 *   - the live timeseries endpoint is keyed by H3 cell, not lon/lat,
 *     so a clicked point is converted here. H3 is a query mechanism
 *     and never reaches the UI.
 *   - the live /layers rows carry no `renderable` flag, no cadence and
 *     no valid range; those are normalised to the contract's shape.
 */

import { latLngToCell } from "h3-js";

import { authHeaders } from "./lakeIdentity";

import {
  MOCK_FEATURES,
  MOCK_LAYERS,
  MOCK_SOURCES,
  mockProvenance,
  mockSeries,
  mockTimesteps,
  mockZonalStats,
  SENTINEL,
  LANDSAT,
} from "./lakeFixtures";

export const USE_MOCK_SERVICES =
  import.meta.env.VITE_USE_MOCK_SERVICES !== "false";

export const LAKE_API_URL =
  import.meta.env.VITE_LAKE_API_URL || "http://localhost:8000";

/* H3 resolution used for point lookups. ~65 m across — finer than a
 * Landsat pixel, so it does not merge distinct ground. */
const POINT_H3_RES = 9;

const MOCK_DELAY = 260;


export class LakeError extends Error {
  constructor(kind, message, { status = null, detail = null } = {}) {
    super(message);

    this.name = "LakeError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}


/*
 * Endpoints the contract specifies that this backend does not serve.
 * Named so the UI can tell the user exactly what is missing instead of
 * showing a blank map. Empty now that every contract endpoint is live —
 * kept as a seam rather than deleted, since a future contract addition
 * (or a backend rollback) should degrade the same explicit way.
 */
export const UNIMPLEMENTED_LIVE_ENDPOINTS = [];

export function describeLiveGaps() {
  return USE_MOCK_SERVICES ? [] : UNIMPLEMENTED_LIVE_ENDPOINTS;
}


function settle(value) {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_DELAY)
  );
}


function isStorageFailure(status, detail) {
  if (status !== 503) {
    return false;
  }

  const text = String(detail ?? "").toLowerCase();

  return (
    text.includes("object storage") ||
    text.includes("access_denied") ||
    text.includes("credential")
  );
}


async function lakeFetch(path, { params, signal, method, body } = {}) {
  const url = new URL(path, LAKE_API_URL);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  /*
   * Reads are the overwhelming majority of this API, so GET with no
   * body stays the default — but uploads and layer management are
   * POST/PATCH/DELETE with JSON, and routing those through the same
   * function keeps identity headers and error classification in one
   * place rather than hand-rolled per call site.
   */
  const init = { headers: authHeaders(), signal };

  if (method) {
    init.method = method;
  }

  if (body !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }

    throw new LakeError(
      "unreachable",
      `Cannot reach the lake API at ${LAKE_API_URL}.`,
      { detail: error?.message ?? null }
    );
  }

  if (!response.ok) {
    let detail;

    try {
      detail = (await response.clone().json())?.detail ?? null;
    } catch {
      detail = (await response.text().catch(() => "")) || null;
    }

    if (isStorageFailure(response.status, detail)) {
      throw new LakeError(
        "storage",
        "The backend reached the Iceberg catalog but could not read object storage.",
        { status: response.status, detail }
      );
    }

    if (response.status === 404) {
      /*
       * A 404 with a detail message is the route answering — "no such
       * layer", "no imagery for this date". Only a bare 404 means the
       * route itself is absent, which is the "backend does not
       * implement this yet" case the UI reports differently.
       */
      throw new LakeError(
        detail ? "http" : "unimplemented",
        detail
          ? normaliseDetail(detail)
          : `${path} is not implemented on this backend yet.`,
        { status: 404, detail: normaliseDetail(detail) }
      );
    }

    throw new LakeError(
      "http",
      `${path} failed with ${response.status}.`,
      { status: response.status, detail: normaliseDetail(detail) }
    );
  }

  return response.json();
}


/* FastAPI validation errors arrive as arrays of objects. */
function normaliseDetail(detail) {
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => `${entry.loc?.join(".")}: ${entry.msg}`)
      .join("; ");
  }

  return detail;
}


/*
 * Live /layers rows are missing three fields the contract promises.
 * Normalising here keeps every consumer on one shape.
 */
function normaliseLayer(row) {
  return {
    ...row,
    display_name: row.display_name || row.layer_name,
    /*
     * The live /layers row still carries no `renderable` flag, but the
     * backend now has a real COG story (acquisition_registry + /tiles)
     * for any layer with at least one acquisition — there is no longer
     * a fixed subset that is structurally non-renderable, only layers
     * that happen to have zero acquisitions today.
     *
     * So this defaults optimistic rather than pessimistic, and
     * getTimesteps() returning an empty list is the real signal — the
     * map's "no acquisitions for this layer" state already handles
     * that without the picker needing to predict it in advance.
     */
    renderable: row.renderable ?? true,
  };
}


/* ---- endpoints ---- */

export function getSources({ signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ sources: MOCK_SOURCES });
  }

  return lakeFetch("/sources", { signal });
}


export async function getLayers({ signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layers: MOCK_LAYERS });
  }

  const data = await lakeFetch("/layers", { signal });

  return { layers: (data.layers ?? []).map(normaliseLayer) };
}


export function getTimesteps(layerId, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    const timesteps = mockTimesteps(layerId);

    return settle({
      layer_id: layerId,
      timesteps,
      provenance: mockProvenance(
        [...new Set(timesteps.map((step) => step.source_id))],
        {
          dateRange: [
            timesteps[0]?.date,
            timesteps[timesteps.length - 1]?.date,
          ],
        }
      ),
    });
  }

  return lakeFetch(
    `/layers/${encodeURIComponent(layerId)}/timesteps`,
    { signal }
  );
}


export function getVectorFeatures(
  { bbox, layer, sources, limit = 1000 } = {},
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    return settle({
      features: MOCK_FEATURES,
      provenance: mockProvenance([SENTINEL], { rowCount: MOCK_FEATURES.length }),
    });
  }

  return lakeFetch("/vector/features", {
    params: {
      bbox: bbox ? formatBbox(bbox) : undefined,
      layer,
      sources: sources?.length ? sources.join(",") : undefined,
      limit,
    },
    signal,
  });
}


export function getZonalStats(
  { layer, dateFrom, dateTo, vectorLayer, sources } = {},
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    const features = mockZonalStats();

    return settle({
      layer,
      features,
      provenance: mockProvenance(
        [...new Set(features.flatMap((entry) => entry.sources))],
        { dateRange: [dateFrom, dateTo] }
      ),
    });
  }

  return lakeFetch("/zonal/stats", {
    params: {
      layer,
      date_from: dateFrom,
      date_to: dateTo,
      vector_layer: vectorLayer,
      sources: sources?.length ? sources.join(",") : undefined,
    },
    signal,
  });
}


/*
 * Point time series.
 *
 * The contract takes lon/lat. The running backend takes an H3 cell, so
 * the point is snapped to one here — the conversion is an
 * implementation detail of this module and nothing above it deals in
 * hexagons.
 */
export function getPointTimeseries(
  { lon, lat, layer, sources } = {},
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    const series = mockSeries(layer);

    return settle({
      lon,
      lat,
      layer,
      series,
      provenance: mockProvenance([SENTINEL, LANDSAT]),
    });
  }

  return lakeFetch("/observations/timeseries", {
    params: {
      h3: latLngToCell(lat, lon, POINT_H3_RES),
      h3_res: POINT_H3_RES,
      layer,
      sources: sources?.length ? sources.join(",") : undefined,
    },
    signal,
  }).then((data) => ({ ...data, lon, lat }));
}


export function uploadVectorFeature(
  { layerTitle, visibility = "private", geometry, attributes = {} },
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    const id = `drawn-${Date.now().toString(36)}`;

    return settle({
      layer_id: `upload:demo:${id}`,
      feature_id: id,
      status: "ingested",
    });
  }

  const url = new URL("/vector/upload", LAKE_API_URL);

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      layer_title: layerTitle,
      visibility,
      geometry,
      attributes,
    }),
    signal,
  }).then((response) => {
    if (response.status === 404) {
      throw new LakeError(
        "unimplemented",
        "POST /vector/upload is not implemented on this backend yet.",
        { status: 404 }
      );
    }

    if (!response.ok) {
      throw new LakeError(
        "http",
        `Upload failed with ${response.status}.`,
        { status: response.status }
      );
    }

    return response.json();
  });
}


/*
 * A coarse value sample for one layer, used ONLY to pick a display
 * stretch for imagery whose valid_min/valid_max are null (every layer
 * in the lake today). This is the one place this build still calls
 * /observations/cells — never to draw hexagons, only to ask "roughly
 * what range do these values run in" the same way computeDomain()
 * already does for the zonal choropleth.
 *
 * h3_res 7 keeps this cheap regardless of the layer's true footprint —
 * a few dozen cells is plenty to estimate a percentile stretch from,
 * and this runs once per layer, not per pan.
 */
export function sampleLayerValues({ bbox, layer }, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ cells: [] });
  }

  return lakeFetch("/observations/cells", {
    params: {
      bbox: formatBbox(bbox),
      layer,
      h3_res: sampleResForBbox(bbox),
    },
    signal,
  });
}


/*
 * H3 resolution to sample a layer's values at.
 *
 * Coarse is the right default — a few dozen cells is plenty to estimate
 * a percentile stretch from, and coarse means cheap. But a fixed res 7
 * (~1.2 km cells) collapses a small uploaded raster into a SINGLE cell,
 * whose min and max are the same number: a degenerate stretch that
 * renders the whole layer one flat colour. So the resolution follows
 * the layer's own extent, staying coarse for a scene-sized footprint
 * and going finer for a field-sized one.
 */
function sampleResForBbox(bbox) {
  const [west, south, east, north] = bbox;

  const midLat = ((south + north) / 2) * (Math.PI / 180);
  const widthKm = Math.abs(east - west) * 111.32 * Math.cos(midLat);
  const heightKm = Math.abs(north - south) * 110.57;
  const areaKm2 = widthKm * heightKm;

  if (areaKm2 > 400) return 7;    // ~1.2 km cells
  if (areaKm2 > 10) return 9;     // ~174 m cells
  return 11;                      // ~25 m — a single small field
}


export function getReady({ signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({
      status: "ok",
      catalog: "mock",
      storage: "mock",
    });
  }

  return lakeFetch("/ready", { signal });
}


/* The API wants lon_min,lat_min,lon_max,lat_max. */
export function formatBbox(bbox) {
  return bbox.map((value) => Number(value).toFixed(6)).join(",");
}


/*
 * Builds the URL Leaflet requests tiles from.
 *
 * `tile_url` comes from the server, keeping the decision about how
 * tiles are served on the server side. A mock timestep hands back a
 * self-contained data URI, which Leaflet uses unchanged; a live one is
 * a {z}/{x}/{y} template that has to be resolved against the API base
 * and carry the colour-stretch parameters.
 */
export function buildTileUrl(tileUrl, { rescale, colormap } = {}) {
  if (!tileUrl || tileUrl.startsWith("data:")) {
    return tileUrl;
  }

  const absolute = tileUrl.startsWith("http")
    ? tileUrl
    : `${LAKE_API_URL.replace(/\/$/, "")}${tileUrl}`;

  const query = [];

  if (Array.isArray(rescale) && rescale.length === 2) {
    query.push(`rescale=${rescale[0]},${rescale[1]}`);
  }

  if (colormap) {
    query.push(`colormap=${encodeURIComponent(colormap)}`);
  }

  if (query.length === 0) {
    return absolute;
  }

  return `${absolute}${absolute.includes("?") ? "&" : "?"}${query.join("&")}`;
}

/* ---- raster upload + layer management ---- */

/*
 * Upload is three steps on purpose: ask for a presigned URL, PUT the
 * file straight to S3 from the browser, then register it. The GeoTIFF's
 * bytes never pass through the query API — and because ingestion (an
 * H3 tag per pixel) runs in the background, registering returns a
 * layer that is visible but not yet queryable. `ingest_status` on
 * /layers/mine is what says when it is ready.
 */
export async function uploadRaster(
  { file, layerName, displayName, units, obsDate, visibility, onStage },
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    await settle(null);
    onStage?.("registering");
    await settle(null);
    return {
      layer_id: `upload:demo:${layerName}`,
      source_id: "upload:demo",
      layer_name: layerName,
      ingest_status: "pending",
    };
  }

  onStage?.("presigning");
  const presigned = await lakeFetch("/uploads/presign", {
    method: "POST",
    body: { filename: file.name },
    signal,
  });

  onStage?.("uploading");
  const put = await fetch(presigned.upload_url, {
    method: "PUT",
    body: file,
    signal,
  });

  if (!put.ok) {
    throw new LakeError(
      "http",
      `Upload to S3 failed with ${put.status}.`,
      { status: put.status }
    );
  }

  onStage?.("registering");
  return lakeFetch("/layers/raster-upload", {
    method: "POST",
    body: {
      s3_uri: presigned.s3_uri,
      layer_name: layerName,
      display_name: displayName || null,
      units: units || null,
      obs_date: obsDate,
      visibility,
    },
    signal,
  });
}


/*
 * Multi-scene upload: every raster plus the manifest.json that says
 * which file is which scene.
 *
 * Each file is presigned and PUT to S3 individually — same path as a
 * single upload, just repeated — and only then is the set registered.
 * The manifest goes up too, because the server re-parses it as the
 * authority rather than trusting what the browser read.
 */
export async function uploadManifestScenes(
  { manifestFile, rasterFiles, onProgress },
  { signal } = {}
) {
  if (USE_MOCK_SERVICES) {
    await settle(null);
    return {
      source_id: "upload:demo",
      layers: [{ layer_id: "upload:demo:demo", layer_name: "demo", scene_count: rasterFiles.length }],
      ingest_status: "pending",
    };
  }

  const all = [manifestFile, ...rasterFiles];
  const uploaded = {};
  let manifestUri = null;

  for (let i = 0; i < all.length; i += 1) {
    const file = all[i];

    onProgress?.({ index: i, total: all.length, name: file.name });

    const presigned = await lakeFetch("/uploads/presign", {
      method: "POST",
      body: { filename: file.name },
      signal,
    });

    const put = await fetch(presigned.upload_url, {
      method: "PUT",
      body: file,
      signal,
    });

    if (!put.ok) {
      throw new LakeError(
        "http",
        `Uploading ${file.name} to S3 failed with ${put.status}.`,
        { status: put.status }
      );
    }

    if (file === manifestFile) {
      manifestUri = presigned.s3_uri;
    } else {
      uploaded[file.name] = presigned.s3_uri;
    }
  }

  onProgress?.({ index: all.length, total: all.length, name: "registering" });

  return lakeFetch("/layers/manifest-upload", {
    method: "POST",
    body: { manifest_s3_uri: manifestUri, files: uploaded },
    signal,
  });
}


/*
 * Which of a manifest's scenes are already in the lake.
 *
 * Returns a Set of "layerName|date" keys. This is what makes an upload
 * resumable across sittings without tracking upload sessions anywhere:
 * the manifest says what the whole set should be, acquisition_registry
 * records what actually landed, and the difference is the work left.
 *
 * A layer that does not exist yet simply contributes nothing — the
 * 404 for an unknown layer is an expected answer here, not a failure.
 */
export async function findIngestedScenes(manifest, ownerId, { signal } = {}) {
  const done = new Set();

  if (USE_MOCK_SERVICES || !ownerId) {
    return done;
  }

  for (const name of manifest.layerNames) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/^_+|_+$/g, "");

    try {
      const data = await getTimesteps(
        `upload:${ownerId}:${slug}`, { signal }
      );

      for (const step of data.timesteps ?? []) {
        done.add(`${name}|${step.date}`);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      /* No such layer yet — nothing of this one has been ingested. */
    }
  }

  return done;
}


export function getMyLayers({ signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layers: [] });
  }

  return lakeFetch("/layers/mine", { signal });
}


export function setLayerVisibility(layerId, visibility, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layer_id: layerId, visibility });
  }

  return lakeFetch(`/layers/${encodeURIComponent(layerId)}/visibility`, {
    method: "PATCH",
    body: { visibility },
    signal,
  });
}


export function getLayerGrants(layerId, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layer_id: layerId, grants: [] });
  }

  return lakeFetch(`/layers/${encodeURIComponent(layerId)}/grants`, {
    signal,
  });
}


export function addLayerGrant(layerId, granteeId, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layer_id: layerId, grantee_id: granteeId });
  }

  return lakeFetch(`/layers/${encodeURIComponent(layerId)}/grants`, {
    method: "POST",
    body: { grantee_id: granteeId, grantee_type: "user" },
    signal,
  });
}


export function revokeLayerGrant(layerId, granteeId, { signal } = {}) {
  if (USE_MOCK_SERVICES) {
    return settle({ layer_id: layerId, revoked: granteeId });
  }

  return lakeFetch(
    `/layers/${encodeURIComponent(layerId)}/grants/${encodeURIComponent(granteeId)}`,
    { method: "DELETE", signal }
  );
}


export { SENTINEL, LANDSAT };
