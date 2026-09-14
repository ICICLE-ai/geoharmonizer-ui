/*
 * Fixtures for the lake services.
 *
 * Shaped to the documented API contract, not to the backend that is
 * running today — several of these endpoints do not exist server-side
 * yet (see README). The values are drawn from the real lake where it
 * has them, so the mixed-resolution path is the default experience
 * rather than something you have to go looking for:
 *
 *   - Sentinel-2 at 10 m every ~5 days, Landsat at 30 m every ~16 days
 *   - eight acquisitions across June–October 2025
 *   - Madison County, Ohio (Molly Caren, ~39.945 -83.445)
 *
 * Any layer backed by both sensors therefore carries a resolution
 * range of 10–30 m and a warning, which is the case the UI most needs
 * to render correctly.
 */

export const AOI_BOUNDS = [-83.487, 39.912, -83.403, 39.978];

export const SENTINEL = "stac:sentinel-2-l2a";
export const LANDSAT = "stac:landsat-c2-l2";

const SOURCE_META = {
  [SENTINEL]: { resolution_m: 10.0, temporal_granularity: "5day" },
  [LANDSAT]: { resolution_m: 30.0, temporal_granularity: "16day" },
};


function layer(sourceId, name, displayName, extra = {}) {
  return {
    layer_id: `${sourceId}:${name}`,
    source_id: sourceId,
    layer_name: name,
    display_name: displayName,
    units: "reflectance",
    resolution_m: SOURCE_META[sourceId].resolution_m,
    temporal_granularity: SOURCE_META[sourceId].temporal_granularity,
    valid_min: 0.0,
    valid_max: 0.4,
    temporal_start: "2025-06-01",
    temporal_end: "2025-10-31",
    region_bounds: AOI_BOUNDS,
    provider: sourceId === SENTINEL ? "ESA" : "USGS",
    renderable: true,
    ...extra,
  };
}


export const MOCK_LAYERS = [
  layer(SENTINEL, "red", "Red"),
  layer(SENTINEL, "green", "Green"),
  layer(SENTINEL, "blue", "Blue"),
  layer(SENTINEL, "nir", "Nir"),
  layer(LANDSAT, "red", "Red"),
  layer(LANDSAT, "green", "Green"),
  layer(LANDSAT, "blue", "Blue"),
  layer(LANDSAT, "nir08", "Nir08"),

  /* An index layer, unitless, spanning both sensors. */
  {
    ...layer(SENTINEL, "ndvi", "NDVI"),
    layer_id: `${SENTINEL}:ndvi`,
    units: null,
    valid_min: -0.2,
    valid_max: 1.0,
  },

  /*
   * Queryable but with no COG behind it — exercises the
   * renderable: false branch in the picker.
   */
  {
    ...layer(LANDSAT, "swir16", "Swir16"),
    renderable: false,
  },
];


export const MOCK_SOURCES = [
  {
    source_id: SENTINEL,
    title: "Sentinel-2 L2A",
    provider: "ESA",
    source_type: "raster",
    native_resolution_m: 10.0,
    license: "CC-BY",
    update_cadence: "5day",
    temporal_start: "2025-06-01",
    temporal_end: "2025-10-31",
  },
  {
    source_id: LANDSAT,
    title: "Landsat Collection 2 L2",
    provider: "USGS",
    source_type: "raster",
    native_resolution_m: 30.0,
    license: "PDDL",
    update_cadence: "16day",
    temporal_start: "2025-06-01",
    temporal_end: "2025-10-31",
  },
];


/*
 * Eight acquisitions alternating between the two sensors, so stepping
 * the slider crosses a resolution change — the case the slider has to
 * make visible rather than smooth over.
 */
const ACQUISITIONS = [
  { date: "2025-06-08", source_id: SENTINEL, cloud_cover: 2.1 },
  { date: "2025-06-24", source_id: LANDSAT, cloud_cover: 11.4 },
  { date: "2025-07-13", source_id: SENTINEL, cloud_cover: 0.8 },
  { date: "2025-07-26", source_id: LANDSAT, cloud_cover: 18.9 },
  { date: "2025-08-15", source_id: SENTINEL, cloud_cover: 4.2 },
  { date: "2025-08-31", source_id: LANDSAT, cloud_cover: 6.7 },
  { date: "2025-09-19", source_id: SENTINEL, cloud_cover: 22.5 },
  { date: "2025-10-11", source_id: SENTINEL, cloud_cover: 9.3 },
];


/*
 * A mock tile is one flat SVG carrying its date and sensor, so that
 * stepping the slider is unmistakably doing something. Real tiles come
 * from the server as PNG; this only has to exercise the wiring.
 */
function mockTileUrl(date, sourceId, index) {
  const hue = 90 + index * 14;
  const isCoarse = SOURCE_META[sourceId].resolution_m > 10;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="hsl(${hue} 45% 32%)"/>
    <rect width="256" height="256" fill="none" stroke="hsl(${hue} 45% 46%)" stroke-width="2"/>
    <text x="128" y="120" fill="hsl(${hue} 30% 88%)" font-family="monospace"
          font-size="19" text-anchor="middle">${date}</text>
    <text x="128" y="146" fill="hsl(${hue} 25% 76%)" font-family="monospace"
          font-size="15" text-anchor="middle">${isCoarse ? "30 m" : "10 m"}</text>
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}


export function mockTimesteps(layerId) {
  /*
   * A band layer only has acquisitions from the sensor that produced
   * it. Matching just one prefix would silently hand a single-sensor
   * layer the other sensor's dates and fake a mixed-resolution result.
   */
  const layerSource = layerId.startsWith(LANDSAT)
    ? LANDSAT
    : layerId.startsWith(SENTINEL)
      ? SENTINEL
      : null;

  /*
   * An index layer draws on both sensors; a band layer only on the one
   * that produced it.
   */
  const isIndex = layerId.endsWith(":ndvi");

  const usable = ACQUISITIONS.filter(
    (entry) =>
      isIndex || !layerSource || entry.source_id === layerSource
  );

  return usable.map((entry, index) => ({
    date: entry.date,
    tile_url: mockTileUrl(entry.date, entry.source_id, index),
    source_id: entry.source_id,
    resolution_m: SOURCE_META[entry.source_id].resolution_m,
    cloud_cover: entry.cloud_cover,
    bounds: AOI_BOUNDS,
  }));
}


/* Field boundaries around Molly Caren, roughly on the section grid. */
function field(id, name, crop, acres, [west, south], size) {
  const east = west + size[0];
  const north = south + size[1];

  return {
    feature_id: id,
    source_id: "upload:demo:fields_2025",
    layer_name: "crop_type",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
    bbox: [west, south, east, north],
    attributes: {
      field_name: name,
      crop_type: crop,
      acres,
    },
    valid_from: "2025-04-01",
    valid_to: "2025-11-30",
  };
}


export const MOCK_FEATURES = [
  field("mc-01a", "MC-01A", "corn", 285.2, [-83.470, 39.940], [0.018, 0.012]),
  field("mc-02b", "MC-02B", "soybean", 194.7, [-83.450, 39.940], [0.016, 0.012]),
  field("mc-03c", "MC-03C", "corn", 320.5, [-83.470, 39.926], [0.018, 0.012]),
  field("mc-04d", "MC-04D", "wheat", 141.3, [-83.450, 39.926], [0.016, 0.012]),
  field("mc-05e", "MC-05E", "soybean", 208.9, [-83.432, 39.940], [0.017, 0.012]),
  field("mc-06f", "MC-06F", "fallow", 96.4, [-83.432, 39.926], [0.017, 0.012]),
];


/*
 * Zonal means per field. Two of the six blend both sensors, so the
 * "this statistic mixes resolutions" flag has something to mark and
 * the rest stay clean for contrast.
 */
const ZONAL_VALUES = {
  "mc-01a": { value: 0.841, count: 974, sources: [SENTINEL, LANDSAT] },
  "mc-02b": { value: 0.612, count: 655, sources: [SENTINEL] },
  "mc-03c": { value: 0.788, count: 1102, sources: [SENTINEL, LANDSAT] },
  "mc-04d": { value: 0.305, count: 412, sources: [SENTINEL] },
  "mc-05e": { value: 0.694, count: 731, sources: [SENTINEL] },
  "mc-06f": { value: 0.187, count: 288, sources: [SENTINEL] },
};


export function mockZonalStats() {
  return MOCK_FEATURES.map((feature) => ({
    feature_id: feature.feature_id,
    ...ZONAL_VALUES[feature.feature_id],
  }));
}


/*
 * A plausible seasonal curve, sampled on each sensor's own cadence so
 * the two series have different point counts — which is what makes a
 * merged line wrong rather than merely imprecise.
 */
export function mockSeries(layerName) {
  const isIndex = layerName === "ndvi";

  const curve = (dayOfYear, peak) => {
    const t = (dayOfYear - 160) / 95;
    const base = peak * Math.exp(-((t - 0.55) ** 2) / 0.18);

    return isIndex ? 0.12 + base : 0.03 + base * 0.22;
  };

  const build = (sourceId, dates, offset) =>
    dates.map((date) => {
      const day = Math.round(
        (new Date(date) - new Date("2025-01-01")) / 86400000
      );

      return {
        date,
        value: Number((curve(day, 0.86) * offset).toFixed(4)),
        count: sourceId === SENTINEL ? 881 : 93,
      };
    });

  return [
    {
      source_id: SENTINEL,
      resolution_m: 10.0,
      temporal_granularity: "5day",
      points: build(
        SENTINEL,
        ACQUISITIONS.filter((a) => a.source_id === SENTINEL).map(
          (a) => a.date
        ),
        1
      ),
    },
    {
      /*
       * Offset slightly low: a 30 m pixel averages in field margins a
       * 10 m pixel resolves separately. The gap between the lines is
       * mostly resolution, not the ground changing.
       */
      source_id: LANDSAT,
      resolution_m: 30.0,
      temporal_granularity: "16day",
      points: build(
        LANDSAT,
        ACQUISITIONS.filter((a) => a.source_id === LANDSAT).map(
          (a) => a.date
        ),
        0.93
      ),
    },
  ];
}


/*
 * Provenance for a set of sources. Warnings are generated from the
 * same conditions the backend uses, so mock and live responses read
 * identically to the panel.
 */
export function mockProvenance(sourceIds, { rowCount = 0, dateRange } = {}) {
  const sources = sourceIds.map((sourceId) => ({
    source_id: sourceId,
    resolution_m: SOURCE_META[sourceId].resolution_m,
    temporal_granularity: SOURCE_META[sourceId].temporal_granularity,
    h3_native_res: sourceId === SENTINEL ? 12 : 11,
    row_count: sourceId === SENTINEL ? 521640 : 57938,
    layers: ["red"],
  }));

  const resolutions = [
    ...new Set(sources.map((s) => s.resolution_m)),
  ].sort((a, b) => a - b);

  const granularities = [
    ...new Set(sources.map((s) => s.temporal_granularity)),
  ].sort();

  const warnings = [];

  if (resolutions.length > 1) {
    const ratio = (
      (resolutions[resolutions.length - 1] / resolutions[0]) ** 2
    ).toFixed(0);

    warnings.push(
      `Result mixes ground resolutions ${resolutions
        .map((r) => `${r} m`)
        .join(", ")}. Values are aggregated per hexagon, so cells are ` +
        `weighted toward the finer source by pixel count. The coarsest ` +
        `source covers ${ratio}x the ground area per pixel of the finest.`
    );
  }

  if (granularities.length > 1) {
    warnings.push(
      `Result mixes temporal granularities ${JSON.stringify(
        granularities
      )}. Values aggregating different time windows are not directly ` +
        `comparable; aggregate to '${granularities[0]}' or filter to ` +
        `one granularity.`
    );
  }

  if (sourceIds.length === 1) {
    warnings.push(
      `Only one source (${sourceIds[0]}) covers this view. Values are ` +
        `not cross-validated against another sensor.`
    );
  }

  return {
    sources,
    resolution_range_m:
      resolutions.length > 0
        ? [resolutions[0], resolutions[resolutions.length - 1]]
        : null,
    temporal_granularities: granularities,
    date_range: dateRange ?? ["2025-06-01", "2025-10-31"],
    row_count:
      rowCount || sources.reduce((sum, s) => sum + s.row_count, 0),
    warnings,
  };
}
