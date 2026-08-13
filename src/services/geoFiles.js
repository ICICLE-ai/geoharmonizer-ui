/*
 * Reads field boundaries from the formats the app accepts and
 * normalizes everything to WGS84 GeoJSON features:
 *
 *   - GeoJSON        .geojson / .json
 *   - Shapefile      .zip (bundle) or loose .shp + .dbf + .prj
 *   - GeoPackage     .gpkg
 *
 * Shapefiles are reprojected by shpjs using the .prj, GeoPackage
 * features are reprojected by the reader from their SRS. Both end
 * up as EPSG:4326, which is what Leaflet and the job spec expect.
 */

import {
  combine,
  parseDbf,
  parseShp,
  parseZip,
} from "shpjs";

import {
  geometryAreaKm2,
} from "../utils/geometry";


export const UPLOAD_ACCEPT =
  ".geojson,.json,.zip,.shp,.shx,.dbf,.prj,.cpg,.gpkg";


const NAME_KEYS = [
  "name",
  "field_name",
  "fieldname",
  "field",
  "label",
  "title",
  "plot",
  "parcel",
  "id",
];


const extensionOf = (fileName) => {
  const dot = fileName.lastIndexOf(".");

  return dot === -1
    ? ""
    : fileName.slice(dot).toLowerCase();
};


const baseNameOf = (fileName) => {
  const dot = fileName.lastIndexOf(".");

  return dot === -1
    ? fileName
    : fileName.slice(0, dot);
};


/*
 * NAME_KEYS is ordered by preference, so a layer carrying both
 * "id" and "name" shows the name.
 */
function featureName(properties, fallbackIndex) {
  if (properties) {
    const lookup = new Map(
      Object.keys(properties).map((key) => [
        key.toLowerCase(),
        key,
      ])
    );

    for (const candidate of NAME_KEYS) {
      const key = lookup.get(candidate);

      if (key === undefined) {
        continue;
      }

      const value = properties[key];

      if (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
      ) {
        return String(value).trim();
      }
    }
  }

  return `Feature ${fallbackIndex + 1}`;
}


/*
 * Flattens whatever a parser handed back — FeatureCollection,
 * single Feature, bare geometry, or an array of any of those —
 * into a plain array of Features.
 */
function collectFeatures(parsed) {
  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap(collectFeatures);
  }

  if (parsed.type === "FeatureCollection") {
    return collectFeatures(parsed.features);
  }

  if (parsed.type === "Feature") {
    return parsed.geometry ? [parsed] : [];
  }

  if (parsed.type === "GeometryCollection") {
    return (parsed.geometries || []).map((geometry) => ({
      type: "Feature",
      geometry,
      properties: {},
    }));
  }

  if (parsed.type && parsed.coordinates) {
    return [
      {
        type: "Feature",
        geometry: parsed,
        properties: {},
      },
    ];
  }

  return [];
}


/*
 * Layer ids have to stay unique across uploads (the same file can be
 * dropped twice) and across sessions, since restored layers keep the
 * ids they were cached under.
 */
let layerCounter = 0;

const nextLayerId = () => {
  layerCounter += 1;

  return `layer-${Date.now().toString(
    36
  )}-${layerCounter}`;
};


/*
 * Attaches the bookkeeping the map needs (stable id, display name,
 * area) without polluting the GeoJSON that gets sent to the backend —
 * the metadata is non-enumerable, so JSON.stringify and structured
 * clone both skip it.
 */
function decorateFeatures(features, layerId, layerName) {
  return features.map((feature, index) => {
    const meta = {
      id: `${layerId}:${index}`,

      name: featureName(feature.properties, index),

      areaKm2: geometryAreaKm2(feature.geometry),

      layerId,

      layerName,
    };

    Object.defineProperty(feature, "__gh", {
      value: meta,
      enumerable: false,
      configurable: true,
      writable: true,
    });

    return feature;
  });
}


/* Wraps one file's features into a layer. */
function toLayer(features, sourceLabel) {
  const layerId = nextLayerId();

  return {
    id: layerId,

    name: sourceLabel,

    features: decorateFeatures(
      features,
      layerId,
      sourceLabel
    ),

    visible: true,
  };
}


/*
 * Rebuilds cached layers into the shape the map works with. The
 * stored ids are kept so a restored layer is the same layer.
 */
export function rehydrateLayers(stored) {
  return (stored || [])
    .filter(
      (layer) =>
        layer?.id &&
        Array.isArray(layer.features) &&
        layer.features.length > 0
    )
    .map((layer) => ({
      id: layer.id,

      name: layer.name ?? "Cached layer",

      features: decorateFeatures(
        layer.features,
        layer.id,
        layer.name
      ),

      visible: layer.visible !== false,
    }));
}


async function readGeoJsonFile(file) {
  const text = await file.text();

  try {
    return collectFeatures(JSON.parse(text));
  } catch {
    throw new Error(
      `${file.name} is not valid JSON.`
    );
  }
}


async function readZippedShapefile(file) {
  const parsed = await parseZip(
    await file.arrayBuffer()
  );

  return collectFeatures(parsed);
}


/*
 * Loose shapefile parts that arrived in the same selection.
 * .shp alone works, but without .dbf there are no attributes
 * and without .prj coordinates are assumed to already be 4326.
 */
async function readLooseShapefile(parts) {
  const geometries = parseShp(
    await parts.shp.arrayBuffer(),
    parts.prj ? await parts.prj.text() : undefined
  );

  const attributes = parts.dbf
    ? parseDbf(
        await parts.dbf.arrayBuffer(),
        parts.cpg ? await parts.cpg.text() : undefined
      )
    : undefined;

  return collectFeatures(
    combine([geometries, attributes])
  );
}


async function readGeoPackage(file) {
  /*
   * Loaded on demand: the GeoPackage reader ships its own
   * SQLite wasm build and is far too heavy for the main bundle.
   */
  const [
    { GeoPackageAPI, setSqljsWasmLocateFile },
    { default: sqlWasmUrl },
  ] = await Promise.all([
    import("@ngageoint/geopackage"),
    import(
      "@ngageoint/geopackage/dist/sql-wasm.wasm?url"
    ),
  ]);

  setSqljsWasmLocateFile(() => sqlWasmUrl);

  const geoPackage = await GeoPackageAPI.open(
    new Uint8Array(await file.arrayBuffer())
  );

  try {
    const tables = geoPackage.getFeatureTables();

    if (tables.length === 0) {
      throw new Error(
        `${file.name} contains no feature tables.`
      );
    }

    const features = [];

    for (const table of tables) {
      for (const feature of geoPackage.iterateGeoJSONFeatures(
        table
      )) {
        if (feature && feature.geometry) {
          features.push(feature);
        }
      }
    }

    return features;
  } finally {
    geoPackage.close();
  }
}


/*
 * Buckets a selection into the units we can actually parse.
 * Loose shapefile parts are grouped by base name so that
 * "fields.shp" + "fields.dbf" + "fields.prj" load as one layer.
 */
function groupSelection(files) {
  const standalone = [];
  const shapefileParts = new Map();
  const ignored = [];

  for (const file of files) {
    const extension = extensionOf(file.name);

    switch (extension) {
      case ".geojson":
      case ".json":
      case ".zip":
      case ".gpkg":
        standalone.push({ file, extension });
        break;

      case ".shp":
      case ".dbf":
      case ".prj":
      case ".cpg":
      case ".shx": {
        const base = baseNameOf(file.name);

        const parts =
          shapefileParts.get(base) || {};

        parts[extension.slice(1)] = file;

        shapefileParts.set(base, parts);
        break;
      }

      default:
        ignored.push(file.name);
    }
  }

  return {
    standalone,
    shapefileParts,
    ignored,
  };
}


/*
 * Main entry point. Takes a FileList (or array of File) and resolves
 * to { layers, warnings }, one layer per source file — a selection of
 * three files becomes three independently toggleable layers.
 *
 * Layer:   { id, name, features, visible }
 * Feature: decorated with a non-enumerable `__gh` block
 *          { id, name, areaKm2, layerId, layerName }.
 */
export async function readGeoFiles(fileList) {
  const files = Array.from(fileList || []);

  if (files.length === 0) {
    throw new Error("No files selected.");
  }

  const {
    standalone,
    shapefileParts,
    ignored,
  } = groupSelection(files);

  const warnings = ignored.map(
    (name) => `Skipped unsupported file "${name}".`
  );

  const layers = [];

  for (const { file, extension } of standalone) {
    const parsed =
      extension === ".gpkg"
        ? await readGeoPackage(file)
        : extension === ".zip"
        ? await readZippedShapefile(file)
        : await readGeoJsonFile(file);

    if (parsed.length === 0) {
      warnings.push(
        `"${file.name}" contains no usable features.`
      );

      continue;
    }

    layers.push(toLayer(parsed, file.name));
  }

  for (const [base, parts] of shapefileParts) {
    if (!parts.shp) {
      warnings.push(
        `Skipped "${base}" — the .shp file is missing.`
      );

      continue;
    }

    if (!parts.dbf) {
      warnings.push(
        `"${base}" has no .dbf, so features carry no attributes.`
      );
    }

    if (!parts.prj) {
      warnings.push(
        `"${base}" has no .prj — coordinates are assumed to be EPSG:4326.`
      );
    }

    const parsed = await readLooseShapefile(parts);

    if (parsed.length === 0) {
      warnings.push(
        `"${base}.shp" contains no usable features.`
      );

      continue;
    }

    layers.push(toLayer(parsed, `${base}.shp`));
  }

  if (layers.length === 0) {
    throw new Error(
      "No usable features were found in that selection."
    );
  }

  return {
    layers,
    warnings,
  };
}
