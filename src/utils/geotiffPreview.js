/*
 * Read a GeoTIFF in the browser, before it is uploaded anywhere.
 *
 * The point is to answer three questions while the file is still just
 * a file on the user's disk, when backing out costs nothing:
 *
 *   1. is this the file I meant?          (a picture of it)
 *   2. is it georeferenced correctly?     (it lands where it should)
 *   3. is there actually data in it?      (a real value range, not
 *                                          all-nodata)
 *
 * Nothing here uploads, and nothing here is authoritative: the server
 * re-reads the file properly at ingest, and its numbers win. This is a
 * preview, so it reads a DOWNSAMPLED overview rather than every pixel —
 * a full-resolution read of a large scene in the main thread would
 * freeze the tab for exactly the user who most needs the warning.
 */

import { fromBlob } from "geotiff";
import proj4 from "proj4";

/* Enough to judge a scene, small enough to decode instantly. */
const MAX_PREVIEW_SIDE = 512;

/* Common projected CRSs carry an EPSG code in the GeoTIFF keys; proj4
 * knows 4326 and 3857 natively and we register UTM zones on demand. */
function projectionFor(epsgCode) {
  if (!epsgCode) {
    return null;
  }

  const name = `EPSG:${epsgCode}`;

  if (proj4.defs(name)) {
    return name;
  }

  /* WGS84 UTM north (326xx) and south (327xx) are formulaic, so they
   * can be defined without a lookup table or a network call. */
  const zoneNorth = epsgCode >= 32601 && epsgCode <= 32660;
  const zoneSouth = epsgCode >= 32701 && epsgCode <= 32760;

  if (zoneNorth || zoneSouth) {
    const zone = epsgCode - (zoneNorth ? 32600 : 32700);

    proj4.defs(
      name,
      `+proj=utm +zone=${zone}${zoneSouth ? " +south" : ""} ` +
        `+datum=WGS84 +units=m +no_defs`
    );

    return name;
  }

  return null;
}


function toWgs84Bounds(bbox, epsgCode) {
  const [minX, minY, maxX, maxY] = bbox;

  if (!epsgCode || epsgCode === 4326) {
    return [minX, minY, maxX, maxY];
  }

  const from = projectionFor(epsgCode);

  if (!from) {
    /* An unknown CRS is a real limitation, not something to paper over
     * with a wrong guess — the caller reports it instead of drawing
     * the overlay in the wrong place. */
    return null;
  }

  const [west, south] = proj4(from, "EPSG:4326", [minX, minY]);
  const [east, north] = proj4(from, "EPSG:4326", [maxX, maxY]);

  return [west, south, east, north];
}


/*
 * Renders one band to a grayscale RGBA canvas, stretched between the
 * 2nd and 98th percentile of the values actually present — the same
 * clipping the map legend uses, and for the same reason: satellite
 * bands are usually skewed enough that a raw min/max stretch shows a
 * nearly black image and tells the user nothing.
 */
function renderToDataUrl(values, width, height, nodata) {
  const finite = [];

  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];

    if (Number.isFinite(v) && (nodata === null || v !== nodata)) {
      finite.push(v);
    }
  }

  if (finite.length === 0) {
    return { dataUrl: null, min: null, max: null, validCount: 0 };
  }

  finite.sort((a, b) => a - b);

  const at = (p) =>
    finite[Math.min(finite.length - 1, Math.floor(p * finite.length))];

  const low = at(0.02);
  const high = at(0.98);
  const span = high - low || 1;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);

  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    const offset = i * 4;

    const isNodata =
      !Number.isFinite(v) || (nodata !== null && v === nodata);

    if (isNodata) {
      image.data[offset + 3] = 0; /* transparent, not black — nodata is
                                   * absence, and painting it as a
                                   * value would misrepresent it */
      continue;
    }

    const scaled = Math.max(0, Math.min(1, (v - low) / span));
    const level = Math.round(scaled * 255);

    image.data[offset] = level;
    image.data[offset + 1] = level;
    image.data[offset + 2] = level;
    image.data[offset + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    min: finite[0],
    max: finite[finite.length - 1],
    stretchLow: low,
    stretchHigh: high,
    validCount: finite.length,
  };
}


export async function readGeotiffPreview(file) {
  const tiff = await fromBlob(file);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const bands = image.getSamplesPerPixel();

  const geoKeys = image.getGeoKeys?.() ?? {};
  const epsgCode =
    geoKeys.ProjectedCSTypeGeoKey ??
    geoKeys.GeographicTypeGeoKey ??
    null;

  let bbox;
  try {
    bbox = image.getBoundingBox();
  } catch {
    bbox = null;
  }

  const wgs84 = bbox ? toWgs84Bounds(bbox, epsgCode) : null;

  /* Ground resolution, in metres where the CRS is projected. A
   * geographic CRS reports degrees, converted at the scene's own
   * latitude — the same approximation the ingest adapter uses. */
  let resolutionM;
  try {
    const [resX] = image.getResolution();
    const px = Math.abs(resX);

    if (epsgCode === 4326 && wgs84) {
      const centreLat = (wgs84[1] + wgs84[3]) / 2;
      resolutionM = px * 111320 * Math.cos((centreLat * Math.PI) / 180);
    } else {
      resolutionM = px;
    }
  } catch {
    resolutionM = null;
  }

  const scale = Math.min(
    1,
    MAX_PREVIEW_SIDE / Math.max(width, height)
  );

  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  const rasters = await image.readRasters({
    width: outWidth,
    height: outHeight,
    samples: [0], // first band — a preview, not a composite
  });

  const nodataRaw = image.getGDALNoData?.();
  const nodata =
    nodataRaw === null || nodataRaw === undefined
      ? null
      : Number(nodataRaw);

  const rendered = renderToDataUrl(
    rasters[0], outWidth, outHeight, nodata
  );

  return {
    width,
    height,
    bands,
    epsgCode,
    resolutionM,
    nodata,
    bboxWgs84: wgs84,
    /* Non-null only when the CRS could be resolved; the form says so
     * rather than silently skipping the map overlay. */
    unsupportedCrs: bbox !== null && wgs84 === null,
    ...rendered,
  };
}
