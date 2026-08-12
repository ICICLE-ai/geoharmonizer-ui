/*
 * Tapis Jobs API.
 *
 * Jobs are submitted and listed against the real tenant — there is no
 * mock path here for the same reason there is none for systems: a
 * job that only exists in browser memory is worse than an error.
 */

import {
  getSessionState,
  TAPIS_API_URL,
  tapisFetch,
} from "./auth";

import {
  toAoiFeature,
} from "../utils/geometry";


export const NOT_AUTHENTICATED = "NOT_AUTHENTICATED";

/* The registered Tapis app this UI submits to. */
export const APP_ID = "geoharmonizer-collect";
export const APP_VERSION = "1.0.0";

/* Optional resource fields -> Tapis job request keys. */
const RESOURCE_FIELDS = [
  "maxMinutes",
  "memoryMB",
  "nodeCount",
  "coresPerNode",
];


/* Enough precision for ~10cm at the equator; keeps the arg readable. */
const formatCoordinate = (value) =>
  Number(value.toFixed(6));


/*
 * Translates the job spec into the flat argument list that
 * `jobs/collect/run.py` takes — the same arguments the Tapis
 * apptainer image is invoked with. No config file is written.
 *
 * Argument order follows the entrypoint's own table so the command
 * reads the way the docs do.
 */
export function buildCollectArgs(jobSpec) {
  const args = [];

  const features =
    jobSpec.aoi?.geojson?.features ?? [];

  if (jobSpec.aoiMode === "geojson") {
    const feature = toAoiFeature(features);

    if (feature) {
      args.push(
        "--aoi-json",
        JSON.stringify(feature)
      );
    }
  } else if (jobSpec.aoi?.bbox) {
    args.push(
      `--bbox=${jobSpec.aoi.bbox
        .map(formatCoordinate)
        .join(",")}`
    );
  }

  args.push("--start", jobSpec.startDate);
  args.push("--end", jobSpec.endDate);
  args.push("--output", jobSpec.output);

  args.push(
    "--cloud-max",
    String(jobSpec.cloudMax)
  );

  args.push(
    "--max-scenes",
    String(jobSpec.maxScenes)
  );

  args.push("--epsg", String(jobSpec.epsg));

  args.push("--bands", jobSpec.bands.join(","));

  if (!jobSpec.groupSolarDay) {
    args.push("--no-group-solar-day");
  }

  if (jobSpec.dryRun) {
    args.push("--dry-run");
  }

  return args;
}


/*
 * The Tapis job request: which app, on which system and queue, with
 * the collect arguments as appArgs. The four resource fields are only
 * included when the user set them — otherwise Tapis falls back to the
 * app definition and the queue's own defaults.
 */
export function buildJobRequest(jobSpec) {
  const request = {
    name:
      outputBaseName(jobSpec.output) || APP_ID,

    appId: APP_ID,

    appVersion: APP_VERSION,

    execSystemId: jobSpec.systemId,

    parameterSet: {
      appArgs: buildCollectArgs(jobSpec).map(
        (arg) => ({
          arg,
          include: true,
        })
      ),
    },
  };

  if (jobSpec.queue) {
    request.execSystemLogicalQueue =
      jobSpec.queue;
  }

  for (const field of RESOURCE_FIELDS) {
    const value = jobSpec[field];

    if (value === "" || value === null) {
      continue;
    }

    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      request[field] = numeric;
    }
  }

  return request;
}


/*
 * "./output/raw_sentinel_cube.zarr" -> "raw_sentinel_cube",
 * used as the display name in the jobs list.
 */
export function outputBaseName(output) {
  const leaf = (output || "")
    .split("/")
    .filter(Boolean)
    .pop();

  if (!leaf) {
    return "";
  }

  return leaf.replace(/\.zarr$/i, "");
}




/*
 * Tapis job statuses collapsed onto the three the jobs view filters
 * by. Every active phase — staging, queued, archiving — reads as
 * running, because from the user's side the job is in flight.
 */
const STATUS_MAP = {
  FINISHED: "complete",
  FAILED: "failed",
  CANCELLED: "cancelled",
  PAUSED: "paused",
  BLOCKED: "blocked",
};


function toUiStatus(status) {
  if (!status) {
    return "running";
  }

  return (
    STATUS_MAP[status.toUpperCase()] ?? "running"
  );
}


/*
 * Short, glanceable timestamp: time today, "Yesterday", then date.
 */
function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  const created = new Date(value);

  if (Number.isNaN(created.getTime())) {
    return "";
  }

  const now = new Date();

  const sameDay =
    created.toDateString() === now.toDateString();

  if (sameDay) {
    return created.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(now);

  yesterday.setDate(now.getDate() - 1);

  if (
    created.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return created.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}


/* One Tapis job record -> the shape the jobs list renders. */
function toJobCard(job) {
  const target = [
    job.execSystemId,
    job.execSystemLogicalQueue
      ? `(${job.execSystemLogicalQueue})`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: job.uuid,

    name: job.name || job.uuid,

    status: toUiStatus(job.status),

    /* Keep the raw status — the mapped one loses detail. */
    tapisStatus: job.status,

    meta: [
      job.appId
        ? `${job.appId}@${job.appVersion ?? ""}`.replace(
            /@$/,
            ""
          )
        : null,
      target || null,
    ]
      .filter(Boolean)
      .join(" · "),

    time: formatTimestamp(
      job.created || job.lastUpdated
    ),

    job,
  };
}


/*
 * Pulls a useful message out of a Tapis error body.
 */
async function describeFailure(response) {
  const fallback = `Tapis responded with status ${response.status}`;

  try {
    const data = await response.json();

    return (
      data?.message ||
      data?.result?.message ||
      fallback
    );
  } catch {
    return fallback;
  }
}


function notAuthenticated(message) {
  const error = new Error(message);

  error.code = NOT_AUTHENTICATED;

  return error;
}


/*
 * Submits the job to Tapis.
 *
 * Publishing requires a session, and the check lives here rather than
 * in the drawer so no caller can submit around it — but it refuses
 * only when Tapis has confirmed there is no session. An unreadable
 * cookie is not proof of being signed out.
 */
export async function submitJob(jobSpec) {
  if (getSessionState() === "anonymous") {
    throw notAuthenticated(
      "You are not signed in to Tapis, so this job cannot be submitted."
    );
  }

  const request = buildJobRequest(jobSpec);

  const response = await tapisFetch(
    `${TAPIS_API_URL}/v3/jobs/submit`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(request),
    }
  );

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    throw notAuthenticated(
      "Tapis rejected the session — sign in again and resubmit."
    );
  }

  if (!response.ok) {
    throw new Error(
      `Job was not accepted: ${await describeFailure(
        response
      )}`
    );
  }

  const data = await response.json();

  const job = data?.result ?? {};

  return {
    id: job.uuid ?? "",

    status: job.status ?? "PENDING",

    message:
      data?.message || "Job submitted to Tapis.",

    job,

    request,
  };
}


/*
 * The caller's most recent jobs, newest first.
 */
export async function getJobs() {
  const response = await tapisFetch(
    `${TAPIS_API_URL}/v3/jobs/list?limit=100&orderBy=created(desc)`
  );

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    throw notAuthenticated(
      "Sign in to Tapis to see your jobs."
    );
  }

  if (!response.ok) {
    throw new Error(
      await describeFailure(response)
    );
  }

  const data = await response.json();

  return (data?.result ?? []).map(toJobCard);
}
