import {
  useEffect,
  useState,
} from "react";

import {
  CircleCheck,
  Clock3,
  Loader2,
  Play,
  ShieldCheck,
  TriangleAlert,
  Trophy,
  Workflow,
} from "lucide-react";

import Drawer from "../layout/Drawer";

import {
  WORKFLOW_PERSONAS,
  confirmWorkflow,
  createWorkflow,
  getWorkflow,
  setWorkflowUser,
} from "../../services/workflows";

/* The three tasks the v2 engine documents — one per outcome. */
const SUGGESTED_TASKS = [
  "map corn and soybeans around molly caren for 2024",
  "predict corn yield per acre for molly caren",
  "map tillage practice for molly caren",
];

const STAGES = [
  {
    key: "select",
    label: "Select",
    hint: "registry × lake holdings",
  },
  {
    key: "curate",
    label: "Curate",
    hint: "cube → feature stack",
  },
  {
    key: "model",
    label: "Model",
    hint: "search + spatial holdout",
  },
];

/*
 * Derive one stage's display status from the workflow record. The
 * service never reports per-stage progress directly — the record
 * simply grows a `curation` block, then a `leaderboard`.
 */
function stageStatus(record, key) {
  if (!record) {
    return "pending";
  }

  const blocked =
    record.status === "blocked_on_data_gap" ||
    record.status === "refused";

  if (key === "select") {
    return blocked ? "blocked" : "done";
  }

  if (
    blocked ||
    record.status === "awaiting_confirm"
  ) {
    return "pending";
  }

  if (record.status === "done") {
    return "done";
  }

  if (key === "curate") {
    return record.curation
      ? "done"
      : "running";
  }

  if (record.leaderboard) {
    return "done";
  }

  return record.curation
    ? "running"
    : "pending";
}

function StageIcon({ status }) {
  switch (status) {
    case "done":
      return (
        <CircleCheck size={15} />
      );

    case "running":
      return (
        <Loader2
          size={15}
          className="spinner"
        />
      );

    case "blocked":
      return (
        <TriangleAlert size={15} />
      );

    default:
      return (
        <Clock3 size={15} />
      );
  }
}

function WorkflowsDrawer({
  open,
  onClose,
}) {
  const [
    task,
    setTask,
  ] = useState("");

  const [
    record,
    setRecord,
  ] = useState(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    confirming,
    setConfirming,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /*
   * While the workflow runs, poll it. Each fresh record schedules
   * the next poll, so this is a 1.2s chain rather than an interval.
   */
  useEffect(() => {
    if (
      !record ||
      record.status !== "running"
    ) {
      return undefined;
    }

    let cancelled = false;

    const timer = setTimeout(
      async () => {
        try {
          const next =
            await getWorkflow(
              record.id
            );

          if (!cancelled) {
            setRecord(next);
          }
        } catch {
          if (!cancelled) {
            setError(
              "Lost contact with the workflow service."
            );
          }
        }
      },
      1200
    );

    return () => {
      cancelled = true;

      clearTimeout(timer);
    };
  }, [
    record,
  ]);

  const run = async (value) => {
    const text = (
      value ?? task
    ).trim();

    if (
      !text ||
      submitting
    ) {
      return;
    }

    setTask(text);
    setSubmitting(true);
    setError("");
    setRecord(null);

    try {
      const created =
        await createWorkflow(
          text
        );

      setRecord(created);
    } catch {
      setError(
        "The workflow service is currently unavailable."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirm = async () => {
    if (
      !record ||
      record.status !==
        "awaiting_confirm" ||
      confirming
    ) {
      return;
    }

    setConfirming(true);
    setError("");

    try {
      await confirmWorkflow(
        record.id
      );

      setRecord(
        (current) =>
          current && {
            ...current,
            status: "running",
          }
      );
    } catch {
      setError(
        "Could not confirm the workflow."
      );
    } finally {
      setConfirming(false);
    }
  };

  const selection =
    record?.selection;

  const reuse =
    selection?.reuse ?? {};

  const monthsHeld =
    reuse.months_held ?? [];

  const monthsWanted =
    reuse.months_wanted ?? [];

  const gaps =
    selection?.gaps ?? [];

  const blockingGaps =
    gaps.filter(
      (gap) => !gap.optional
    );

  const optionalGaps =
    gaps.filter(
      (gap) => gap.optional
    );

  const showPlan =
    selection &&
    selection.status === "ready";

  const showRefusal =
    record &&
    (record.status ===
      "blocked_on_data_gap" ||
      record.status === "refused");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="AI Workflows"
      icon={Workflow}
    >
      {/* Task input */}
      <div className="drawer-section">
        <span className="section-label">
          Task
        </span>

        {/* Demo persona switch: private FMIS layers are ACL'd per user,
            so the same question can succeed for an owner and be refused
            for a guest. A real deployment derives this from the Tapis
            session instead of a select. */}
        <label className="wf-persona">
          Asking as{" "}
          <select
            defaultValue={
              WORKFLOW_PERSONAS[0]
                .id
            }
            onChange={(
              event
            ) =>
              setWorkflowUser(
                event.target
                  .value
              )
            }
            aria-label="Requesting user"
          >
            {WORKFLOW_PERSONAS.map(
              (p) => (
                <option
                  key={p.id}
                  value={p.id}
                >
                  {p.label}
                </option>
              )
            )}
          </select>
        </label>

        <div className="wf-compose">
          <input
            value={task}
            placeholder="Describe the map or prediction you need..."
            onChange={(
              event
            ) =>
              setTask(
                event.target
                  .value
              )
            }
            onKeyDown={(
              event
            ) => {
              if (
                event.key ===
                "Enter"
              ) {
                run();
              }
            }}
          />

          <button
            type="button"
            className="primary-button wf-run"
            onClick={() =>
              run()
            }
            disabled={
              submitting
            }
            aria-label="Compile task"
          >
            {submitting ? (
              <Loader2
                size={15}
                className="spinner"
              />
            ) : (
              <Play size={15} />
            )}
          </button>
        </div>

        <div className="wf-chips">
          {SUGGESTED_TASKS.map(
            (item) => (
              <button
                key={item}
                type="button"
                className="wf-chip"
                onClick={() =>
                  run(item)
                }
                disabled={
                  submitting
                }
              >
                {item}
              </button>
            )
          )}
        </div>
      </div>

      {/* Stage trace */}
      <div className="drawer-section">
        <span className="section-label">
          Stages
        </span>

        <div className="wf-stage-list">
          {STAGES.map(
            (stage) => {
              const status =
                stageStatus(
                  record,
                  stage.key
                );

              return (
                <div
                  key={
                    stage.key
                  }
                  className={`wf-stage wf-stage-${status}`}
                >
                  <StageIcon
                    status={
                      status
                    }
                  />

                  <strong>
                    {
                      stage.label
                    }
                  </strong>

                  <span>
                    {stage.hint}
                  </span>
                </div>
              );
            }
          )}
        </div>
      </div>

      {error && (
        <div className="form-error">
          {error}
        </div>
      )}

      {/* Plan — what would run, and what it costs */}
      {showPlan && (
        <div className="wf-plan-card">
          <div className="wf-plan-heading">
            Plan · {selection.site}{" "}
            {selection.window?.join(
              " → "
            )}
          </div>

          <div className="wf-plan-row">
            <span>
              Months held
            </span>

            <strong>
              {monthsHeld.length}
              /
              {
                monthsWanted.length
              }{" "}
              already in the lake
            </strong>
          </div>

          <div className="wf-plan-row">
            <span>
              Scenes to collect
            </span>

            <strong>
              {String(
                reuse.scenes_to_collect ??
                  "?"
              )}
            </strong>
          </div>

          {(selection.feature_gate ??
            []).map(
            (gate) => (
              <div
                key={
                  gate.source
                }
                className="wf-gate"
              >
                <div className="wf-gate-decision">
                  <ShieldCheck
                    size={13}
                  />

                  {gate.source}
                  {" — "}
                  {
                    gate.decision
                  }
                </div>

                <div className="wf-gate-rule">
                  {gate.rule}
                </div>
              </div>
            )
          )}

          {optionalGaps.length >
            0 && (
            <div className="wf-optional-gaps">
              Optional sources
              unavailable:{" "}
              {optionalGaps
                .map(
                  (gap) =>
                    gap.source
                )
                .join(", ")}
            </div>
          )}

          <div className="wf-cost-note">
            {reuse.scenes_to_collect ===
            0
              ? "Runs entirely on held data — no new collection cost."
              : "New collection is required before modeling."}
            {selection.budget_node_min
              ? ` Model budget: ${selection.budget_node_min} node-min.`
              : ""}
          </div>
        </div>
      )}

      {/* Refusal — the exact gap and its unblock path */}
      {showRefusal && (
        <div className="wf-refusal-card">
          <div className="wf-refusal-heading">
            <TriangleAlert
              size={14}
            />

            {record.status ===
            "refused"
              ? "Refused"
              : "Blocked on data gap"}
          </div>

          {record.reason && (
            <div className="wf-gap">
              {record.reason}
            </div>
          )}

          {blockingGaps.map(
            (gap) => (
              <div
                key={
                  gap.source
                }
                className="wf-gap"
              >
                <strong>
                  {gap.source}
                </strong>

                <div>
                  {gap.why}
                </div>

                <div className="wf-gap-unblock">
                  Unblock:{" "}
                  {gap.unblock}
                </div>

                {gap.labels && (
                  <div className="wf-gap-unblock">
                    Labels:{" "}
                    {gap.labels}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Leaderboard */}
      {record?.leaderboard && (
        <div className="drawer-section">
          <span className="section-label">
            Leaderboard
          </span>

          {/* Classification runs report agreement/macro-F1; regression
              runs (e.g. FMIS yield) report R2/MAE. Detect from the rows
              rather than the task so the table never crashes on a shape
              it did not expect. */}
          <table className="wf-leaderboard">
            <thead>
              <tr>
                <th>Family</th>

                {record
                  .leaderboard[0]
                  ?.held_out_agreement !==
                undefined ? (
                  <>
                    <th>
                      Agreement
                    </th>

                    <th>
                      Macro-F1
                    </th>
                  </>
                ) : (
                  <>
                    <th>
                      Held-out R²
                    </th>

                    <th>
                      MAE (bu/ac)
                    </th>
                  </>
                )}
              </tr>
            </thead>

            <tbody>
              {record.leaderboard.map(
                (row) => (
                  <tr
                    key={
                      row.family
                    }
                    className={
                      row.family ===
                      record.winner
                        ? "wf-winner"
                        : ""
                    }
                  >
                    <td>
                      {row.family ===
                        record.winner && (
                        <Trophy
                          size={
                            12
                          }
                        />
                      )}

                      {
                        row.family
                      }
                    </td>

                    {row.held_out_agreement !==
                    undefined ? (
                      <>
                        <td>
                          {(
                            row.held_out_agreement *
                            100
                          ).toFixed(
                            1
                          )}
                          %
                        </td>

                        <td>
                          {row.macro_f1?.toFixed(
                            3
                          ) ??
                            "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          {row.r2?.toFixed(
                            3
                          ) ??
                            "—"}
                        </td>

                        <td>
                          {row.mae_bu_ac?.toFixed(
                            1
                          ) ??
                            "—"}
                        </td>
                      </>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>

          {record.note && (
            <p className="wf-note">
              {record.note}
            </p>
          )}
        </div>
      )}

      {/* Confirm gate */}
      <div className="wf-confirm-section">
        <button
          type="button"
          className="primary-button full-width"
          onClick={confirm}
          disabled={
            record?.status !==
              "awaiting_confirm" ||
            confirming
          }
        >
          {confirming ||
          record?.status ===
            "running" ? (
            <Loader2
              size={15}
              className="spinner"
            />
          ) : (
            <ShieldCheck
              size={15}
            />
          )}

          {record?.status ===
          "running"
            ? "Running..."
            : record?.status ===
              "done"
            ? "Run Complete"
            : "Confirm & Run"}
        </button>

        <p className="chat-guardrail">
          Plans never run on their
          own — only you can
          confirm one.
        </p>
      </div>
    </Drawer>
  );
}

export default WorkflowsDrawer;
