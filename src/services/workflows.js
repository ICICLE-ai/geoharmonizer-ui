const USE_MOCK_SERVICES =
  import.meta.env.VITE_USE_MOCK_SERVICES !== "false";

const WORKFLOW_API_URL = import.meta.env.VITE_WORKFLOW_API_URL;

// Whether to offer AI Workflows at all — same reasoning as CHAT_ENABLED:
// without a configured service the drawer can only replay canned plans,
// so it is shown when a service is configured or when mocks were asked
// for explicitly (local development / demos).
export const WORKFLOWS_ENABLED =
  Boolean(WORKFLOW_API_URL) ||
  import.meta.env.VITE_USE_MOCK_SERVICES === "true";

// Identity sent with each workflow request. The lake enforces per-user
// ACLs on private layers (e.g. FMIS yield), so the service needs to know
// who is asking; a real deployment would take this from the Tapis session.
const WORKFLOW_USER = "aswathn1";

// The workflow service speaks the v2 AutoML contract:
//   POST {WORKFLOW_API_URL}/api/workflow           {task, user}
//     -> {id, status: awaiting_confirm | blocked_on_data_gap | refused,
//         plan: {selection...}}
//   POST {WORKFLOW_API_URL}/api/workflow/{id}/confirm -> {id, status: running}
//   GET  {WORKFLOW_API_URL}/api/workflow/{id}      -> full record
//                                                     (incl leaderboard when done)
//   GET  {WORKFLOW_API_URL}/api/registry           -> source registry
//
// Nothing runs until the user confirms the plan; creation only compiles
// the task and selects data, and a task the service cannot ground comes
// back blocked/refused with the exact data gap instead of an answer.

/*
 * Normalize a service record into the one shape the drawer renders.
 * The plan/selection block stays snake_case exactly as the service
 * emitted it — the drawer shows gap + unblock text verbatim.
 */
function toUiRecord(data, task) {
  const modelSearch = data.model_search || {};

  return {
    id: data.id,
    status: data.status,
    task: data.task ?? task ?? "",
    selection: data.plan ?? data.selection ?? null,
    curation: data.curation ?? null,
    leaderboard:
      data.leaderboard ?? modelSearch.leaderboard ?? null,
    winner: data.winner ?? modelSearch.winner ?? null,
    note: data.note ?? null,
    reason: data.reason ?? null,
  };
}

/* =========================================
   MOCK SERVICE
   =========================================
   Canned replay of the 2026-08-28 local run of ghz_automl_v2.py on the
   molly_caren cube (run_record.json). The plans, gap messages, and
   leaderboard numbers below are copied from that record verbatim, but
   this module never runs a model — every mock record says so in `note`.
*/

const MOCK_NOTE =
  "synthetic-demo replay of a real local run (ghz_automl_v2.py on molly_caren, run_record.json 2026-08-28) — no model was trained in this session";

const MOCK_CROP_SELECTION = {
  stage: "select",
  site: "molly_caren",
  window: ["2024-05-01", "2024-09-30"],
  chosen: [
    { source: "sentinel-2", as: "feature" },
    { source: "usda-cdl", as: "target/reference" },
  ],
  feature_gate: [
    {
      source: "usda-cdl",
      decision: "target/reference ONLY",
      rule: "a source may serve as target or feature, never both",
    },
  ],
  gaps: [
    {
      source: "ssurgo",
      why: "soil",
      unblock: "prototype adapter",
      optional: true,
    },
    {
      source: "daymet",
      why: "weather",
      unblock: "registered, no ingest yet",
      optional: true,
    },
    {
      source: "yield-monitor",
      why: "yield",
      unblock: "requires data-use agreement",
      optional: true,
    },
    {
      source: "usda-nass",
      why: "county statistics",
      unblock: "needs NASS_API_KEY",
      optional: true,
    },
  ],
  reuse: {
    months_wanted: ["2024-05", "2024-06", "2024-07", "2024-08", "2024-09"],
    months_held: ["2024-05", "2024-06", "2024-07", "2024-08", "2024-09"],
    scenes_to_collect: 0,
  },
  budget_node_min: 10,
  status: "ready",
};

const MOCK_YIELD_SELECTION = {
  stage: "select",
  site: "molly_caren",
  window: ["2024-05-01", "2024-09-30"],
  chosen: [],
  feature_gate: [],
  gaps: [
    {
      source: "yield-monitor",
      why: "target 'yield' needs yield-monitor",
      unblock: "requires data-use agreement",
    },
  ],
  reuse: {},
  status: "blocked_on_data_gap",
};

const MOCK_TILLAGE_SELECTION = {
  stage: "select",
  site: "molly_caren",
  window: ["2024-05-01", "2024-09-30"],
  chosen: [],
  feature_gate: [],
  gaps: [
    {
      source: "sentinel-2 swir16/swir22",
      why: "tillage/residue needs SWIR (NDTI); the default collection records blue/green/red/nir/scl only",
      unblock:
        "re-collect with --bands red,nir,swir16,swir22 — and note the manifest is band-blind today, so the planner must be told this is a distinct request (v2 fix: put the band set in the dedup key)",
      labels: "OACI field surveys (~450/watershed) for calibration",
    },
  ],
  reuse: {},
  status: "blocked_on_data_gap",
};

const MOCK_CURATION = {
  stage: "curate",
  months: ["2024-05", "2024-06", "2024-07", "2024-08", "2024-09"],
  n_features: 25,
  pixels_usable: 207386,
  usable_frac: 0.991,
};

const MOCK_LEADERBOARD = [
  {
    family: "hist-gradient-boosting",
    held_out_agreement: 0.8923,
    macro_f1: 0.8776,
  },
  {
    family: "logistic-regression",
    held_out_agreement: 0.8714,
    macro_f1: 0.8601,
  },
  {
    family: "majority-baseline",
    held_out_agreement: 0.6057,
    macro_f1: 0.2515,
  },
];

const MOCK_REGISTRY = {
  "sentinel-2": { kind: "imagery", role: "feature" },
  "usda-cdl": { kind: "crop label", role: "target_or_reference" },
  ssurgo: { kind: "soil", role: "feature", status: "prototype adapter" },
  daymet: { kind: "weather", role: "feature", status: "registered, no ingest yet" },
  "yield-monitor": {
    kind: "yield",
    role: "target",
    status: "requires data-use agreement",
  },
  "usda-nass": {
    kind: "county statistics",
    role: "reference",
    status: "needs NASS_API_KEY",
  },
};

const mockWorkflows = new Map();

let mockCounter = 0;

function mockCreate(task) {
  const id = `wf-mock-${++mockCounter}`;
  const text = task.toLowerCase();

  let record;

  // Same routing order as the engine: "corn yield" is a yield task.
  if (/yield|bushel|production per/.test(text)) {
    record = {
      id,
      status: "blocked_on_data_gap",
      task,
      plan: MOCK_YIELD_SELECTION,
      note: MOCK_NOTE,
    };
  } else if (/till|residue|cover crop/.test(text)) {
    record = {
      id,
      status: "blocked_on_data_gap",
      task,
      plan: MOCK_TILLAGE_SELECTION,
      note: MOCK_NOTE,
    };
  } else if (
    /corn|soy|crop.?type|what.*(grown|planted)|crop map/.test(text)
  ) {
    record = {
      id,
      status: "awaiting_confirm",
      task,
      plan: MOCK_CROP_SELECTION,
      note: MOCK_NOTE,
    };
  } else {
    record = {
      id,
      status: "refused",
      task,
      reason:
        "task not in the compilable set (crop type, yield, tillage); answering anyway would be ungrounded",
      note: MOCK_NOTE,
    };
  }

  mockWorkflows.set(id, {
    record,
    confirmedAt: null,
  });

  return record;
}

/*
 * Replays the run's timeline after confirm: curation appears after
 * ~1s, the leaderboard ~2s in — so the stage trace advances live.
 */
function mockGet(id) {
  const entry = mockWorkflows.get(id);

  if (!entry) {
    throw new Error(`Unknown workflow ${id}`);
  }

  const { record, confirmedAt } = entry;

  if (record.status === "running" && confirmedAt) {
    const elapsed = Date.now() - confirmedAt;

    if (elapsed >= 1000) {
      record.curation = MOCK_CURATION;
    }

    if (elapsed >= 2000) {
      record.status = "done";
      record.leaderboard = MOCK_LEADERBOARD;
      record.winner = "hist-gradient-boosting";
    }
  }

  return { ...record };
}

/* =========================================
   PUBLIC API
   ========================================= */

async function request(path, options) {
  const response = await fetch(
    `${WORKFLOW_API_URL}${path}`,
    options
  );

  if (!response.ok) {
    throw new Error(
      `Workflow request failed with status ${response.status}`
    );
  }

  return response.json();
}

export async function createWorkflow(task) {
  if (USE_MOCK_SERVICES || !WORKFLOW_API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return toUiRecord(mockCreate(task), task);
  }

  const data = await request("/api/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      user: WORKFLOW_USER,
    }),
  });

  return toUiRecord(data, task);
}

export async function confirmWorkflow(id) {
  if (USE_MOCK_SERVICES || !WORKFLOW_API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const entry = mockWorkflows.get(id);

    if (!entry) {
      throw new Error(`Unknown workflow ${id}`);
    }

    entry.record.status = "running";
    entry.confirmedAt = Date.now();

    return { id, status: "running" };
  }

  return request(`/api/workflow/${id}/confirm`, {
    method: "POST",
  });
}

export async function getWorkflow(id) {
  if (USE_MOCK_SERVICES || !WORKFLOW_API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return toUiRecord(mockGet(id));
  }

  const data = await request(`/api/workflow/${id}`);

  return toUiRecord(data);
}

export async function getRegistry() {
  if (USE_MOCK_SERVICES || !WORKFLOW_API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_REGISTRY;
  }

  return request("/api/registry");
}
