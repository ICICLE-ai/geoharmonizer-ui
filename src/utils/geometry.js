/*
 * Geometry helpers for WGS84 (EPSG:4326) GeoJSON.
 *
 * Everything the map loads is reprojected to 4326 before it
 * gets here, so areas are computed on the sphere rather than
 * in a planar CRS.
 */

const EARTH_RADIUS_M = 6378137;


const toRadians = (degrees) =>
  (degrees * Math.PI) / 180;


/*
 * Signed spherical area of a linear ring, in square metres.
 * Same excess formula used by turf/geojson-area.
 */
function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) {
    return 0;
  }

  let total = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const [lowerX, lowerY] = ring[i];

    const [upperX, upperY] =
      ring[(i + 1) % ring.length];

    total +=
      (toRadians(upperX) - toRadians(lowerX)) *
      (2 +
        Math.sin(toRadians(lowerY)) +
        Math.sin(toRadians(upperY)));
  }

  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;
}


function polygonArea(rings) {
  if (!Array.isArray(rings) || rings.length === 0) {
    return 0;
  }

  const outer = Math.abs(ringArea(rings[0]));

  const holes = rings
    .slice(1)
    .reduce(
      (sum, ring) => sum + Math.abs(ringArea(ring)),
      0
    );

  return Math.max(outer - holes, 0);
}


/*
 * Area of any GeoJSON geometry in square metres.
 * Non-areal geometries (points, lines) contribute 0.
 */
export function geometryAreaM2(geometry) {
  if (!geometry) {
    return 0;
  }

  switch (geometry.type) {
    case "Polygon":
      return polygonArea(geometry.coordinates);

    case "MultiPolygon":
      return (geometry.coordinates || []).reduce(
        (sum, rings) => sum + polygonArea(rings),
        0
      );

    case "GeometryCollection":
      return (geometry.geometries || []).reduce(
        (sum, geom) => sum + geometryAreaM2(geom),
        0
      );

    default:
      return 0;
  }
}


export function geometryAreaKm2(geometry) {
  return geometryAreaM2(geometry) / 1e6;
}


/*
 * [minX, minY, maxX, maxY] over every coordinate in a geometry.
 * Returns null when the geometry carries no coordinates.
 */
export function geometryBounds(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "GeometryCollection") {
    return (geometry.geometries || []).reduce(
      (acc, geom) =>
        mergeBounds(acc, geometryBounds(geom)),
      null
    );
  }

  let bounds = null;

  const walk = (node) => {
    if (!Array.isArray(node)) {
      return;
    }

    if (typeof node[0] === "number") {
      const [x, y] = node;

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }

      bounds = bounds
        ? [
            Math.min(bounds[0], x),
            Math.min(bounds[1], y),
            Math.max(bounds[2], x),
            Math.max(bounds[3], y),
          ]
        : [x, y, x, y];

      return;
    }

    node.forEach(walk);
  };

  walk(geometry.coordinates);

  return bounds;
}


function mergeBounds(a, b) {
  if (!a) {
    return b;
  }

  if (!b) {
    return a;
  }

  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}


export function featureCollectionBounds(features) {
  return (features || []).reduce(
    (acc, feature) =>
      mergeBounds(acc, geometryBounds(feature.geometry)),
    null
  );
}


/*
 * Collapses a selection into a single Feature, which is what
 * `--aoi-json` accepts (Polygon/Feature JSON, not a collection).
 * Several selected polygons become one MultiPolygon.
 */
export function toAoiFeature(features) {
  const usable = (features || []).filter(
    (feature) => feature?.geometry
  );

  if (usable.length === 0) {
    return null;
  }

  if (usable.length === 1) {
    return {
      type: "Feature",

      properties: usable[0].properties ?? {},

      geometry: usable[0].geometry,
    };
  }

  const polygons = [];

  for (const feature of usable) {
    const { type, coordinates } = feature.geometry;

    if (type === "Polygon") {
      polygons.push(coordinates);
    } else if (type === "MultiPolygon") {
      polygons.push(...coordinates);
    }
  }

  /* Nothing areal to merge — send the first geometry as-is. */
  if (polygons.length === 0) {
    return {
      type: "Feature",

      properties: {},

      geometry: usable[0].geometry,
    };
  }

  return {
    type: "Feature",

    properties: {},

    geometry: {
      type: "MultiPolygon",

      coordinates: polygons,
    },
  };
}
