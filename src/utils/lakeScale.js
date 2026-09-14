/*
 * Color and scale for lake observations.
 *
 * Colors here are not hand-picked. They come from the validated data
 * palette and were checked with the palette validator against this
 * app's dark surface (#121c18):
 *
 *   Sequential ramp (choropleth) — one hue, blue, dark-anchored so the
 *   low end recedes toward the dark map without disappearing into it:
 *   monotone lightness PASS, adjacent dL >= 0.06 PASS, light-end
 *   contrast 3.23:1 PASS, single hue (3 deg spread) PASS.
 *
 *   Series colors (time series) — categorical slots 1 and 2 for the
 *   dark surface: worst-pair CVD dE 26.8 protan, 31.8 normal vision,
 *   both >= 3:1 on surface. All checks PASS.
 *
 * Do not substitute values by eye; re-run the validator if these change.
 */

/* Low -> high. Used for the zonal-statistics choropleth. Every step
 * clears the map surface. */
export const SEQUENTIAL_RAMP = [
  "#256abf",
  "#3987e5",
  "#6da7ec",
  "#9ec5f4",
  "#cde2fb",
];

/*
 * Categorical slots, dark-mode steps, in fixed palette order. Used for
 * the per-source series in the point time series.
 *
 * A choropleth is an "all pairs" form — any two polygons can sit side
 * by side — where the validated palette carries a hard cap of three
 * slots. Past three, categories fold into "Other" rather than growing
 * the palette.
 */
export const CATEGORICAL_SLOTS = ["#3987e5", "#d95926", "#199e70"];

export const CATEGORICAL_OTHER = "#8ca79b";

export const MAX_CATEGORICAL_CLASSES = CATEGORICAL_SLOTS.length;


/*
 * Series color follows the source, never its position in the current
 * result — filtering one source out must not repaint the other. Source
 * ids are sorted so the assignment is identical on every request.
 */
export function buildSourceColors(sourceIds) {
  const ordered = [...new Set(sourceIds)].sort();

  const colors = new Map();

  ordered.forEach((sourceId, index) => {
    colors.set(
      sourceId,
      index < CATEGORICAL_SLOTS.length
        ? CATEGORICAL_SLOTS[index]
        : CATEGORICAL_OTHER
    );
  });

  return colors;
}


function quantile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);

  if (low === high) {
    return sorted[low];
  }

  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}


/*
 * The color domain for a set of cells.
 *
 * `valid_min` / `valid_max` are used when the layer declares them. They
 * are null for every layer currently in the lake, so the domain is
 * computed from the values that came back — and reflectance is heavily
 * right-skewed (measured over the Molly Caren AOI: p50 0.035, p99
 * 0.111, max 0.237). Stretching the ramp across the full min..max would
 * put 99% of cells in the bottom fifth of it and render the map nearly
 * flat.
 *
 * So the ramp spans p2..p98 and the outliers clamp to the ends. That is
 * a real editorial choice about how the numbers look, so `clipped` is
 * returned alongside the true extent and the legend states it outright
 * rather than quietly showing a stretched scale.
 */
export function computeDomain(cells, layer) {
  const values = cells
    .map((cell) => cell.value)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return null;
  }

  const dataMin = values[0];
  const dataMax = values[values.length - 1];

  const declaredMin = layer?.valid_min;
  const declaredMax = layer?.valid_max;

  if (Number.isFinite(declaredMin) && Number.isFinite(declaredMax)) {
    return {
      min: declaredMin,
      max: declaredMax,
      dataMin,
      dataMax,
      clipped: false,
      source: "declared",
    };
  }

  const low = quantile(values, 0.02);
  const high = quantile(values, 0.98);

  /*
   * A degenerate spread divides by zero in the ramp and paints every
   * pixel the same colour. It happens for real — a sample that lands
   * in one H3 cell, or a genuinely uniform layer — so widen it to a
   * band around the value rather than rendering a flat image that
   * looks like a broken layer.
   */
  const usable = high > low;

  const flatSpread = Math.abs(dataMin) * 0.1 || 1;

  return {
    min: usable ? low : dataMin - flatSpread,
    max: usable ? high : dataMax + flatSpread,
    dataMin,
    dataMax,
    clipped: usable && (low > dataMin || high < dataMax),
    source: "computed",
  };
}


function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);

  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ];
}


/* Interpolating in sRGB between adjacent steps of one hue is safe —
 * the ramp is already perceptually stepped, this only fills between. */
export function colorForValue(value, domain) {
  if (!domain || !Number.isFinite(value)) {
    return SEQUENTIAL_RAMP[0];
  }

  const span = domain.max - domain.min;

  const t = span > 0
    ? Math.min(1, Math.max(0, (value - domain.min) / span))
    : 0;

  const scaled = t * (SEQUENTIAL_RAMP.length - 1);
  const index = Math.min(
    SEQUENTIAL_RAMP.length - 2,
    Math.floor(scaled)
  );

  const local = scaled - index;

  const from = hexToRgb(SEQUENTIAL_RAMP[index]);
  const to = hexToRgb(SEQUENTIAL_RAMP[index + 1]);

  const mixed = from.map((channel, i) =>
    Math.round(channel + (to[i] - channel) * local)
  );

  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}


/* Reflectance runs 0.0–0.4; percentages would read as false precision. */
export function formatValue(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }

  return value.toFixed(4);
}


/*
 * Both ends of a scale, at one shared precision.
 *
 * Formatting each end independently gives pairs like "-0.2000 – 1.00",
 * where the differing decimals read as differing precision rather than
 * as the same scale.
 */
export function formatDomainPair(min, max) {
  const span = Math.abs(max - min);

  const decimals = span >= 10 ? 0 : span >= 1 ? 2 : 4;

  return [min.toFixed(decimals), max.toFixed(decimals)];
}


export function formatResolution(resolutionM) {
  return Number.isFinite(resolutionM) ? `${resolutionM} m` : "unknown";
}


/*
 * `provider` and `license` arrive as the literal string "unknown" on
 * both sources currently in the lake. Rendering that where attribution
 * belongs would read as though it were the real answer.
 */
export function realOrNull(text) {
  if (!text) {
    return null;
  }

  const trimmed = String(text).trim();

  return trimmed && trimmed.toLowerCase() !== "unknown" ? trimmed : null;
}


/* The API's own threshold for a statistically weak aggregate. */
export const LOW_COUNT_THRESHOLD = 5;


/*
 * Colour stretches offered for the raster tiles.
 *
 * The server renders the tile, so these values only have to describe
 * the ramp accurately enough to draw a legend beside it. `null` sends
 * no `colormap` param at all, which the contract defines as true
 * greyscale.
 */
export const COLORMAPS = [
  {
    id: null,
    label: "Greyscale",
    stops: ["#111111", "#4d4d4d", "#8a8a8a", "#c6c6c6", "#ffffff"],
  },
  {
    id: "viridis",
    label: "Viridis",
    stops: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  },
  {
    id: "rdylgn",
    label: "RdYlGn",
    stops: ["#a50026", "#f46d43", "#ffffbf", "#a6d96a", "#006837"],
  },
];

export function colormapStops(id) {
  return (
    COLORMAPS.find((entry) => entry.id === id) ?? COLORMAPS[0]
  ).stops;
}


/*
 * The colour stretch sent to the tile server.
 *
 * Held constant for the whole layer rather than recomputed per
 * timestep. If each date rescaled to its own range, unchanged ground
 * would appear to shift every time the slider moved — an artifact that
 * looks exactly like real change and is very easy to miss.
 */
export function rescaleFor(layer) {
  if (
    Number.isFinite(layer?.valid_min) &&
    Number.isFinite(layer?.valid_max)
  ) {
    return [layer.valid_min, layer.valid_max];
  }

  return null;
}

export function shortSourceName(sourceId) {
  return String(sourceId).replace(/^stac:/, "");
}
