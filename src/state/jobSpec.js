/*
 * Job spec for `jobs/collect` — the Sentinel STAC collect entrypoint.
 * Every field here maps to one flat argument on the Tapis app; see
 * buildCollectArgs() in services/tapis.js for the translation.
 */

/* Sentinel-2 asset keys the collect stage understands. */
export const AVAILABLE_BANDS = [
  "coastal",
  "blue",
  "green",
  "red",
  "rededge1",
  "rededge2",
  "rededge3",
  "nir",
  "nir08",
  "nir09",
  "swir16",
  "swir22",
  "scl",
];

/* Entrypoint defaults, repeated here so the form starts where the job would. */
export const DEFAULT_BANDS = [
  "red",
  "green",
  "blue",
  "nir",
];

export const DEFAULT_CLOUD_MAX = 20;
export const DEFAULT_MAX_SCENES = 50;
export const DEFAULT_EPSG = 32617;

/* Where collect jobs go unless the user picks somewhere else. */
export const DEFAULT_SYSTEM_ID = "pitzer-tapis";
export const DEFAULT_QUEUE = "cpu";


export const initialJobSpec = {
  aoi: null,

  /* "bbox" -> --bbox=W,S,E,N ; "geojson" -> --aoi-json '<geojson>' */
  aoiMode: "bbox",

  startDate: "",
  endDate: "",

  cloudMax: DEFAULT_CLOUD_MAX,
  maxScenes: DEFAULT_MAX_SCENES,

  epsg: DEFAULT_EPSG,

  bands: [...DEFAULT_BANDS],

  /* Off maps to --no-group-solar-day (the legacy per-item axis). */
  groupSolarDay: true,

  dryRun: false,

  selectedDates: [],

  /* --output: the Zarr store path. */
  output: "",

  availability: null,

  /*
   * Run configuration. The four resource fields are optional —
   * clearing one drops it from the job request so the app and queue
   * defaults apply — but they start at the values below.
   */
  systemId: DEFAULT_SYSTEM_ID,
  queue: DEFAULT_QUEUE,

  maxMinutes: 120,
  memoryMB: 8000,
  nodeCount: 1,
  coresPerNode: 8,
};
