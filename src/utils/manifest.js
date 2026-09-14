/*
 * Reads the manifest that accompanies a multi-scene upload.
 *
 * JSON or YAML: the parser used here reads both, since JSON is a subset
 * of YAML. The portal's manifests are JSON.
 *
 * This is a MIRROR of the server's parser (query_api/manifest.py), not
 * the authority — the server re-reads and re-validates the same file,
 * and its answer is the one that counts. Parsing here buys two things
 * the server cannot offer in time to be useful:
 *
 *   · the scene table appears the moment the files are chosen, before
 *     anything is uploaded
 *   · "your manifest names nir_2024-09.tif but you did not select it"
 *     is only answerable in the browser, where the selection exists —
 *     and catching it here saves uploading gigabytes that were going
 *     to be rejected anyway
 *
 * Keep the two in step. Where they disagree, the server wins and the
 * upload fails with its message.
 */

import { parse as parseYaml } from "yaml";

/*
 * Any .json / .yaml / .yml file in a selection is the manifest.
 *
 * Matching an exact name was too strict — people name it after the
 * dataset — and the failure mode was silent: the file fell through to
 * the single-raster path and reported "Invalid byte order value" from
 * the GeoTIFF reader, which says nothing about the real mistake.
 * Nothing else in a raster upload is JSON or YAML, so the extension is
 * signal enough; anything that is not actually a manifest fails
 * validation immediately with a message that says so.
 */
export function isManifestFile(file) {
  return /\.(json|ya?ml)$/i.test(file.name);
}

/* Rasters this upload can carry. */
export function isRasterFile(file) {
  return /\.tiff?$/i.test(file.name);
}


/*
 * A manifest's file reference is matched by BASENAME, never by path.
 *
 * The manifest and the rasters it names routinely live in different
 * directories — a manifest written beside the data it describes says
 * "scenes/ndvi_2024-06.tif", and the person uploading picks that raster
 * from wherever it actually sits. A browser File carries only a
 * basename regardless, so the directory part can never match anything
 * and would silently mark every scene "need file".
 *
 * The original string is kept for display, so an error still quotes the
 * manifest as written.
 */
/*
 * The date an entry names, and what kind of period it is.
 *
 * `date` is one acquisition. `month` is the legacy spelling and names a
 * monthly COMPOSITE: anchored to the first of the month so the slider
 * can sort it, but labelled monthly so it is never read as a single
 * overpass. The server records the same distinction.
 */
function timeOf(entry, where) {
  const hasDate = entry.date !== undefined && entry.date !== null;
  const hasMonth = entry.month !== undefined && entry.month !== null;

  if (hasDate && hasMonth) {
    fail(`${where}: has both 'date' and 'month' — use one`);
  }

  if (hasMonth) {
    const month = String(entry.month).trim();

    if (!/^\d{4}-\d{2}$/.test(month)) {
      fail(`${where}: month '${month}' is not a month (YYYY-MM)`);
    }

    return { date: `${month}-01`, granularity: "monthly" };
  }

  if (!hasDate) {
    fail(`${where} is missing 'date' (or 'month')`);
  }

  return { date: asDate(entry.date, where), granularity: "instant" };
}


function baseName(path) {
  return String(path).split(/[/\\]/).pop();
}


function fail(message) {
  const error = new Error(message);
  error.isManifestError = true;
  throw error;
}


function asDate(value, where) {
  /* The YAML parser already yields a Date for an unquoted ISO date. */
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    fail(`${where}: date ${JSON.stringify(value)} is not an ISO date (YYYY-MM-DD)`);
  }

  return text;
}


/*
 * Returns { title, visibility, scenes[], files[], layerNames[] }, or
 * throws with a message naming the offending entry.
 */
export function parseManifest(text) {
  let raw;

  try {
    /* The YAML parser reads JSON too — JSON is a subset of YAML. */
    raw = parseYaml(text);
  } catch (error) {
    fail(`manifest is not valid JSON or YAML: ${error.message}`);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail("manifest must be an object with a top-level 'layers' key");
  }

  const layers = raw.layers;

  if (!Array.isArray(layers) || layers.length === 0) {
    fail("manifest needs a non-empty 'layers' list");
  }

  const visibility = String(raw.visibility ?? "private");

  if (!["public", "private"].includes(visibility)) {
    fail(`visibility must be 'public' or 'private', got '${visibility}'`);
  }

  const scenes = [];
  const seen = new Set();

  layers.forEach((layer, i) => {
    const whereLayer = `layers[${i}]`;

    if (!layer || typeof layer !== "object") {
      fail(`${whereLayer} must be a mapping`);
    }

    const name = String(layer.name ?? "").trim();

    if (!name) {
      fail(`${whereLayer} is missing 'name'`);
    }

    const units = layer.units ?? raw.units ?? null;
    const times = layer.times;

    if (!Array.isArray(times) || times.length === 0) {
      fail(`${whereLayer} (${name}) needs a non-empty 'times' list`);
    }

    times.forEach((entry, j) => {
      const where = `${whereLayer}.times[${j}]`;

      if (!entry || typeof entry !== "object") {
        fail(`${where} must be a mapping`);
      }

      /* `cog` is the legacy scene_manifest.json spelling of `file`. */
      const file = String(entry.file ?? entry.cog ?? "").trim();

      if (!file) {
        fail(`${where} is missing 'file' (or 'cog')`);
      }

      const { date, granularity } = timeOf(entry, where);
      const key = `${name}|${date}`;

      if (seen.has(key)) {
        fail(
          `${where}: layer '${name}' already has a scene on ${date} — ` +
          `each date may appear once per layer`
        );
      }

      seen.add(key);

      scenes.push({
        layerName: name,
        date,
        file: baseName(file),
        /* As written in the manifest — shown, never matched on. */
        path: file,
        granularity,
        units: units ? String(units) : null,
        cloudCover:
          entry.cloud_cover === undefined || entry.cloud_cover === null
            ? null
            : Number(entry.cloud_cover),
      });
    });
  });

  /*
   * Two different paths that reduce to the same basename cannot both be
   * uploaded — the second would silently overwrite the first's slot.
   * Better to say so than to ingest one file under two scenes' names.
   */
  const byBase = new Map();

  for (const scene of scenes) {
    const seenPath = byBase.get(scene.file);

    if (seenPath && seenPath !== scene.path) {
      fail(
        `'${seenPath}' and '${scene.path}' have the same filename — ` +
        `rename one, since an upload keeps only the filename`
      );
    }

    byBase.set(scene.file, scene.path);
  }

  return {
    title: raw.title ? String(raw.title) : null,
    visibility,
    scenes,
    files: [...new Set(scenes.map((s) => s.file))],
    layerNames: [...new Set(scenes.map((s) => s.layerName))],
  };
}


/*
 * Which manifest-referenced files are absent from the user's selection,
 * and which selected rasters the manifest never mentions.
 *
 * The second half matters as much as the first: a file that is selected
 * but unreferenced is silently ignored by the upload, and someone who
 * mistyped a filename in the manifest would otherwise see a successful
 * upload that is quietly missing a scene.
 */
export function reconcile(manifest, selectedFiles, ingested = new Set()) {
  const selected = new Set(selectedFiles.map((f) => f.name));

  /*
   * Three states per scene, and they drive the whole incremental flow:
   *
   *   done    — already in the lake from an earlier batch
   *   ready   — its file is in hand now, so this batch will ingest it
   *   waiting — still needs its file, from this sitting or a later one
   */
  const scenes = manifest.scenes.map((scene) => {
    const key = `${scene.layerName}|${scene.date}`;

    if (ingested.has(key)) {
      return { ...scene, state: "done" };
    }

    return {
      ...scene,
      state: selected.has(scene.file) ? "ready" : "waiting",
    };
  });

  const unreferenced = selectedFiles
    .filter((f) => !isManifestFile(f) && !manifest.files.includes(f.name))
    .map((f) => f.name);

  return {
    scenes,
    unreferenced,
    ready: scenes.filter((s) => s.state === "ready"),
    waiting: scenes.filter((s) => s.state === "waiting"),
    done: scenes.filter((s) => s.state === "done"),
  };
}
