import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Boxes,
  CheckCircle2,
  Loader2,
  Lock,
  RefreshCw,
  Satellite,
  ShieldCheck,
  ShieldQuestion,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";

import Drawer from "../layout/Drawer";

import {
  checkAvailability,
} from "../../services/availability";

import {
  APP_ID,
  APP_VERSION,
  buildCollectArgs,
  buildSchedulerOptions,
  submitJob,
} from "../../services/tapis";

import {
  getExecutionSystems,
  getSystemQueues,
} from "../../services/systems";

import {
  AVAILABLE_BANDS,
} from "../../state/jobSpec";

import {
  TAPIS_TOKEN_COOKIE,
} from "../../services/auth";

import {
  useTapisAuth,
} from "../../hooks/useTapisAuth";


function JobSetupDrawer({
  open,
  onClose,
  jobSpec,
  onChange,
}) {
  const [
    checkingAvailability,
    setCheckingAvailability,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    submitSuccess,
    setSubmitSuccess,
  ] = useState(null);

  /*
   * Where the current error belongs. Validation failures used to
   * render only next to Check Availability, far above the submit
   * button — a rejected submit looked like nothing happening.
   */
  const [
    errorSource,
    setErrorSource,
  ] = useState("availability");

  const {
    authenticated,
    blocked,
    checking,
    user,
  } = useTapisAuth();

  const [
    systems,
    setSystems,
  ] = useState([]);

  const [
    systemsState,
    setSystemsState,
  ] = useState("loading");


  /*
   * Queues are read per system and kept here, keyed by system id.
   * An absent entry means "not fetched yet", which is what drives
   * the loading state — no state has to be set synchronously.
   */
  const [
    queuesBySystem,
    setQueuesBySystem,
  ] = useState({});

  const [
    systemsError,
    setSystemsError,
  ] = useState("");


  const applySystems = (request) =>
    request.then(
      (result) => {
        setSystems(result);
        setSystemsError("");
        setSystemsState("ready");
      },
      (error) => {
        setSystems([]);
        setSystemsError(
          error?.message ||
            "Execution systems could not be loaded."
        );
        setSystemsState("error");
      }
    );

  /*
   * The full list of execution systems the user can reach, loaded
   * once. State starts as "loading", so the effect only has to
   * resolve the request.
   */
  useEffect(() => {
    applySystems(getExecutionSystems());
  }, []);

  const reloadSystems = () => {
    setSystemsState("loading");

    /* A failed systems call usually took the queue call down with
     * it, so one retry should recover both. */
    setQueuesBySystem((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([, entry]) => entry.state !== "error"
        )
      )
    );

    applySystems(getExecutionSystems());
  };


  /* Queues for whichever system is selected. */
  useEffect(() => {
    const systemId = jobSpec.systemId;

    if (
      !systemId ||
      queuesBySystem[systemId]
    ) {
      return;
    }

    getSystemQueues(systemId).then(
      (result) =>
        setQueuesBySystem((current) => ({
          ...current,
          [systemId]: {
            state: "ready",
            queues: result.queues,
          },
        })),
      () =>
        setQueuesBySystem((current) => ({
          ...current,
          [systemId]: {
            state: "error",
            queues: [],
          },
        }))
    );
  }, [jobSpec.systemId, queuesBySystem]);


  const reloadQueues = () => {
    setQueuesBySystem((current) => {
      const next = { ...current };

      delete next[jobSpec.systemId];

      return next;
    });
  };


  const selectedSystem = systems.find(
    (system) => system.id === jobSpec.systemId
  );

  const queueEntry =
    queuesBySystem[jobSpec.systemId];

  const queuesState = !jobSpec.systemId
    ? "idle"
    : queueEntry?.state ?? "loading";

  /* Stable identity so the default-queue effect below can depend on it. */
  const queues = useMemo(
    () => queueEntry?.queues ?? [],
    [queueEntry]
  );

  const selectedQueue = queues.find(
    (queue) => queue.name === jobSpec.queue
  );

  /*
   * A configured default can name a system or queue that is not in
   * the fetched list — because the list has not arrived, or because
   * the user cannot see it. Keep the value visible instead of
   * silently dropping it.
   */
  const systemMissing =
    jobSpec.systemId && !selectedSystem;

  const queueMissing =
    jobSpec.queue &&
    queuesState === "ready" &&
    !selectedQueue;


  /*
   * Every edit goes through here so the last verdict is dropped: a
   * validation error the user has just fixed, and a success that
   * belongs to the spec as it was when it was submitted.
   */
  const patchSpec = (patch) => {
    setError("");
    setSubmitSuccess(null);

    onChange(patch);
  };


  /*
   * Mirrors what jobs/collect/run.py will accept, so a job is not
   * sent off just to fail on argument validation.
   */
  const validateForm = () => {
    if (!jobSpec.aoi) {
      return "Select at least one field first.";
    }

    if (
      jobSpec.aoiMode === "bbox" &&
      !jobSpec.aoi.bbox
    ) {
      return "The selected area has no usable extent for --bbox.";
    }

    if (!jobSpec.startDate) {
      return "Start date is required.";
    }

    if (!jobSpec.endDate) {
      return "End date is required.";
    }

    if (jobSpec.startDate > jobSpec.endDate) {
      return "Start date must be before end date.";
    }

    if (
      jobSpec.cloudMax < 0 ||
      jobSpec.cloudMax > 100
    ) {
      return "Cloud cover must be between 0 and 100.";
    }

    if (
      !Number.isInteger(jobSpec.maxScenes) ||
      jobSpec.maxScenes < 1
    ) {
      return "Max scenes must be a whole number of at least 1.";
    }

    if (
      !Number.isInteger(jobSpec.epsg) ||
      jobSpec.epsg < 1024
    ) {
      return "EPSG must be a valid numeric code (for example 32617).";
    }

    if (jobSpec.bands.length === 0) {
      return "Select at least one band.";
    }

    return "";
  };


  const validateOutput = () => {
    const output = jobSpec.output.trim();

    if (!output) {
      return "Output Zarr store path is required.";
    }

    if (/\s/.test(output)) {
      return "Output path cannot contain spaces.";
    }

    if (!/\.zarr$/i.test(output)) {
      return "Output must be a .zarr store path.";
    }

    return "";
  };


  /*
   * Queues belong to a system, so switching systems clears the queue
   * rather than keeping a name from the previous one. It refills from
   * that system's default once its queues arrive.
   */
  const selectSystem = (systemId) => {
    patchSpec({
      systemId,
      queue: "",
    });
  };


  /*
   * Once a system's queues load, fall back to its default queue if
   * nothing is chosen — without overwriting an explicit choice.
   */
  useEffect(() => {
    if (
      jobSpec.queue ||
      queuesState !== "ready" ||
      queues.length === 0
    ) {
      return;
    }

    const system = systems.find(
      (candidate) =>
        candidate.id === jobSpec.systemId
    );

    const preferred = queues.some(
      (queue) =>
        queue.name === system?.defaultQueue
    )
      ? system.defaultQueue
      : queues[0].name;

    onChange({ queue: preferred });
  }, [
    jobSpec.queue,
    jobSpec.systemId,
    queuesState,
    queues,
    systems,
    onChange,
  ]);


  const validateRunConfig = () => {
    if (!jobSpec.systemId) {
      return "Select an execution system.";
    }

    /*
     * Only insist on a queue once we know the system has some. If
     * the queue lookup failed, the configured value is trusted
     * rather than blocking the job on a listing call.
     */
    if (
      queuesState === "ready" &&
      queues.length > 0 &&
      !jobSpec.queue
    ) {
      return `Select a queue on ${jobSpec.systemId}.`;
    }

    const limits = [
      [
        "maxMinutes",
        "Max time",
        selectedQueue?.maxMinutes,
      ],
      [
        "memoryMB",
        "Memory",
        selectedQueue?.maxMemoryMB,
      ],
      [
        "nodeCount",
        "Nodes",
        selectedQueue?.maxNodeCount,
      ],
      [
        "coresPerNode",
        "Cores per node",
        selectedQueue?.maxCoresPerNode,
      ],
    ];

    for (const [
      field,
      label,
      limit,
    ] of limits) {
      const raw = jobSpec[field];

      /* Blank is valid — it means "use the defaults". */
      if (raw === "" || raw === null) {
        continue;
      }

      const value = Number(raw);

      if (
        !Number.isInteger(value) ||
        value < 1
      ) {
        return `${label} must be a whole number of at least 1.`;
      }

      if (limit && value > limit) {
        return `${label} exceeds the ${jobSpec.queue} queue limit of ${limit}.`;
      }
    }

    return "";
  };


  const toggleBand = (band) => {
    const selected =
      jobSpec.bands.includes(band);

    patchSpec({
      bands: selected
        ? jobSpec.bands.filter(
            (item) => item !== band
          )
        : [
            ...jobSpec.bands,
            band,
          ],
    });
  };


  /*
   * Same list that goes to Tapis, with the inline GeoJSON shortened
   * so a large AOI does not bury the rest of the command.
   */
  const argsPreview = () =>
    buildCollectArgs(jobSpec)
      .map((arg) =>
        arg.length > 72
          ? `${arg.slice(0, 69)}...`
          : arg
      )
      .join(" ");


  const runAvailability = async () => {
    const validationError =
      validateForm();

    setErrorSource("availability");

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSubmitSuccess(null);
    setCheckingAvailability(true);

    try {
      const result =
        await checkAvailability(jobSpec);

      patchSpec({
        availability: result,
        selectedDates: [],
      });
    } catch {
      setError(
        "Availability service could not be reached."
      );
    } finally {
      setCheckingAvailability(false);
    }
  };


  const toggleScene = (date) => {
    const alreadySelected =
      jobSpec.selectedDates.includes(date);

    const nextDates = alreadySelected
      ? jobSpec.selectedDates.filter(
          (item) => item !== date
        )
      : [
          ...jobSpec.selectedDates,
          date,
        ];

    patchSpec({
      selectedDates: nextDates,
    });
  };


  const handleSubmit = async () => {
    /* Errors from here belong next to the button that caused them. */
    setErrorSource("submit");

    /*
     * Only signed-in users can publish, but "we could not check"
     * is not "signed out" — only a confirmed absence of a session
     * blocks the attempt.
     */
    if (blocked) {
      setError(
        "Sign in to Tapis before submitting a job."
      );

      return;
    }

    const validationError =
      validateForm() ||
      validateOutput() ||
      validateRunConfig();

    if (validationError) {
      setError(validationError);
      return;
    }

    /*
     * The availability check stays an exploration aid: the collect
     * entrypoint takes --start/--end, not a list of scene dates, so
     * picking scenes cannot gate submission.
     */

    setError("");
    setSubmitSuccess(null);
    setSubmitting(true);

    try {
      const result =
        await submitJob(jobSpec);

      setSubmitSuccess(result);
    } catch (submitError) {
      setError(
        submitError?.message ||
          "The job could not be submitted. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Job Setup"
      icon={SlidersHorizontal}
    >
      <section className="drawer-section">
        <div className="section-label">
          Selected Area
        </div>

        {!jobSpec.aoi ? (
          <div className="empty-state">
            No fields selected on the map yet.
          </div>
        ) : (
          <>
            <div className="selected-aoi">
              <strong>
                {jobSpec.aoi.label}
              </strong>

              <span>
                {jobSpec.aoi.n_features} field
                {jobSpec.aoi.n_features !== 1
                  ? "s"
                  : ""}{" "}
                · {jobSpec.aoi.area_km2} km²
              </span>
            </div>

            <div className="segmented">
              {[
                {
                  value: "bbox",
                  label: "Bounding box",
                  hint: "--bbox",
                },
                {
                  value: "geojson",
                  label: "Exact geometry",
                  hint: "--aoi-json",
                },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    jobSpec.aoiMode ===
                    option.value
                      ? "segmented-option segmented-option-active"
                      : "segmented-option"
                  }
                  onClick={() =>
                    patchSpec({
                      aoiMode: option.value,
                    })
                  }
                >
                  {option.label}

                  <em>{option.hint}</em>
                </button>
              ))}
            </div>

            {jobSpec.aoiMode === "bbox" &&
            jobSpec.aoi.bbox ? (
              <div className="bbox-readout">
                {jobSpec.aoi.bbox
                  .map((value) =>
                    Number(value.toFixed(6))
                  )
                  .join(", ")}
              </div>
            ) : null}
          </>
        )}
      </section>


      <div className="date-grid">
        <label className="form-field">
          <span>
            Start Date
          </span>

          <input
            type="date"
            value={jobSpec.startDate}
            onChange={(event) =>
              patchSpec({
                startDate:
                  event.target.value,

                availability: null,
                selectedDates: [],
              })
            }
          />
        </label>


        <label className="form-field">
          <span>
            End Date
          </span>

          <input
            type="date"
            value={jobSpec.endDate}
            onChange={(event) =>
              patchSpec({
                endDate:
                  event.target.value,

                availability: null,
                selectedDates: [],
              })
            }
          />
        </label>
      </div>


      <label className="form-field">
        <span>
          Maximum Cloud Cover ·{" "}
          {jobSpec.cloudMax}%
        </span>

        <input
          type="range"
          min="0"
          max="100"
          value={jobSpec.cloudMax}
          onChange={(event) =>
            patchSpec({
              cloudMax:
                Number(
                  event.target.value
                ),

              availability: null,
              selectedDates: [],
            })
          }
        />
      </label>


      <div className="date-grid">
        <label className="form-field">
          <span>
            Max Scenes
          </span>

          <input
            type="number"
            min="1"
            step="1"
            value={jobSpec.maxScenes}
            onChange={(event) =>
              patchSpec({
                maxScenes: Number(
                  event.target.value
                ),
              })
            }
          />
        </label>


        <label className="form-field">
          <span>
            Target EPSG
          </span>

          <input
            type="number"
            min="1024"
            step="1"
            value={jobSpec.epsg}
            onChange={(event) =>
              patchSpec({
                epsg: Number(
                  event.target.value
                ),
              })
            }
          />
        </label>
      </div>


      <section className="drawer-section">
        <div className="section-label">
          Bands
        </div>

        <div className="band-chips">
          {AVAILABLE_BANDS.map((band) => {
            const selected =
              jobSpec.bands.includes(band);

            return (
              <button
                key={band}
                type="button"
                className={
                  selected
                    ? "band-chip band-chip-selected"
                    : "band-chip"
                }
                aria-pressed={selected}
                onClick={() =>
                  toggleBand(band)
                }
              >
                {band}
              </button>
            );
          })}
        </div>
      </section>


      <div className="toggle-row">
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={jobSpec.groupSolarDay}
            onChange={(event) =>
              patchSpec({
                groupSolarDay:
                  event.target.checked,
              })
            }
          />

          <span>
            <strong>
              Group by solar day
            </strong>

            Off sends --no-group-solar-day
          </span>
        </label>


        <label className="toggle-field">
          <input
            type="checkbox"
            checked={jobSpec.dryRun}
            onChange={(event) =>
              patchSpec({
                dryRun: event.target.checked,
              })
            }
          />

          <span>
            <strong>
              Dry run
            </strong>

            Validate and echo, collect nothing
          </span>
        </label>
      </div>


      <button
        type="button"
        className="secondary-button full-width"
        disabled={checkingAvailability}
        onClick={runAvailability}
      >
        {checkingAvailability ? (
          <>
            <Loader2
              size={15}
              className="spinner"
            />

            Checking...
          </>
        ) : (
          <>
            <Satellite size={15} />

            Check Availability
          </>
        )}
      </button>


      {error && errorSource === "availability" && (
        <div className="form-error">
          {error}
        </div>
      )}


      {jobSpec.availability && (
        <section
          className="drawer-section availability-section"
        >
          <div className="section-label">
            Satellite Availability
          </div>

          <div className="availability-summary">
            <CheckCircle2 size={16} />

            {
              jobSpec.availability.count
            }{" "}
            usable scenes found
          </div>


          <div className="availability-grid">
            {jobSpec.availability.dates.map(
              (date) => {
                const selected =
                  jobSpec.selectedDates.includes(
                    date
                  );

                return (
                  <button
                    key={date}
                    type="button"
                    className={
                      selected
                        ? "availability-date availability-date-selected"
                        : "availability-date"
                    }
                    onClick={() =>
                      toggleScene(date)
                    }
                  >
                    {date}
                  </button>
                );
              }
            )}
          </div>


          <div className="availability-selection-summary">
            {
              jobSpec.selectedDates.length
            }{" "}
            scene
            {jobSpec.selectedDates.length !== 1
              ? "s"
              : ""}{" "}
            selected
          </div>
        </section>
      )}


      <label className="form-field">
        <span>
          Output Zarr Store · --output
        </span>

        <input
          type="text"
          value={jobSpec.output}
          placeholder="./output/raw_sentinel_cube.zarr"
          spellCheck="false"
          onChange={(event) =>
            patchSpec({
              output: event.target.value,
            })
          }
        />
      </label>


      <section className="drawer-section">
        <div className="section-label">
          Run Configuration
        </div>

        <div className="app-chip">
          <Boxes size={15} />

          <div>
            <strong>{APP_ID}</strong>

            <span>
              Tapis app version {APP_VERSION}
            </span>
          </div>
        </div>


        <label className="form-field">
          <span>
            Execution System
          </span>

          <select
            value={jobSpec.systemId}
            disabled={
              systemsState === "loading"
            }
            onChange={(event) =>
              selectSystem(event.target.value)
            }
          >
            <option value="">
              {systemsState === "loading"
                ? "Loading systems..."
                : "Select a system"}
            </option>

            {/* Keep a configured default selectable even while the
                list is loading or unavailable. */}
            {systemMissing ? (
              <option value={jobSpec.systemId}>
                {jobSpec.systemId}
                {systemsState === "ready"
                  ? " — not in your systems list"
                  : ""}
              </option>
            ) : null}

            {systems.map((system) => (
              <option
                key={system.id}
                value={system.id}
              >
                {system.id}
                {system.description
                  ? ` — ${system.description}`
                  : ""}
              </option>
            ))}
          </select>
        </label>

        {systemsState === "error" ? (
          <button
            type="button"
            className="secondary-button full-width retry-button"
            onClick={reloadSystems}
          >
            <RefreshCw size={14} />
            {systemsError} Retry
          </button>
        ) : null}


        <label className="form-field">
          <span>
            Queue
          </span>

          <select
            value={jobSpec.queue}
            disabled={
              !jobSpec.systemId ||
              queuesState === "loading" ||
              (queuesState === "ready" &&
                queues.length === 0)
            }
            onChange={(event) =>
              patchSpec({
                queue: event.target.value,
              })
            }
          >
            {!jobSpec.systemId ? (
              <option value="">
                Select a system first
              </option>
            ) : queuesState === "loading" ? (
              <option value={jobSpec.queue}>
                {jobSpec.queue
                  ? `${jobSpec.queue} — checking...`
                  : "Loading queues..."}
              </option>
            ) : queuesState === "ready" &&
              queues.length === 0 ? (
              <option value="">
                No batch queues on this system
              </option>
            ) : (
              <>
                <option value="">
                  Select a queue
                </option>

                {queueMissing ||
                (queuesState === "error" &&
                  jobSpec.queue) ? (
                  <option value={jobSpec.queue}>
                    {jobSpec.queue} — not listed
                    for this system
                  </option>
                ) : null}

                {queues.map((queue) => (
                  <option
                    key={queue.name}
                    value={queue.name}
                  >
                    {queue.name}
                    {queue.maxMinutes
                      ? ` — up to ${queue.maxMinutes} min, ${queue.maxNodeCount} nodes`
                      : ""}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>

        {queuesState === "error" ? (
          <button
            type="button"
            className="secondary-button full-width retry-button"
            onClick={reloadQueues}
          >
            <RefreshCw size={14} />
            Queues for {jobSpec.systemId} could not
            be loaded — retry
          </button>
        ) : null}


        <div className="resource-grid">
          {[
            {
              field: "maxMinutes",
              label: "Max Time (min)",
              limit: selectedQueue?.maxMinutes,
            },
            {
              field: "memoryMB",
              label: "Memory (MB)",
              limit: selectedQueue?.maxMemoryMB,
            },
            {
              field: "nodeCount",
              label: "Nodes",
              limit: selectedQueue?.maxNodeCount,
            },
            {
              field: "coresPerNode",
              label: "Cores / Node",
              limit:
                selectedQueue?.maxCoresPerNode,
            },
          ].map((resource) => (
            <label
              key={resource.field}
              className="form-field"
            >
              <span>
                {resource.label}
              </span>

              <input
                type="number"
                min="1"
                step="1"
                value={
                  jobSpec[resource.field]
                }
                placeholder={
                  resource.limit
                    ? `max ${resource.limit}`
                    : "default"
                }
                onChange={(event) =>
                  patchSpec({
                    [resource.field]:
                      event.target.value === ""
                        ? ""
                        : Number(
                            event.target.value
                          ),
                  })
                }
              />
            </label>
          ))}
        </div>

        <p className="field-hint">
          All four are optional — leave blank to use
          the app and queue defaults.
        </p>
      </section>


      <section className="drawer-section">
        <div className="section-label">
          Job Arguments
        </div>

        <div className="args-target">
          {APP_ID}@{APP_VERSION} →{" "}
          {jobSpec.systemId || "no system"}
          {jobSpec.queue
            ? ` (${jobSpec.queue})`
            : ""}
        </div>

        <pre className="args-preview">
          {argsPreview()}
        </pre>

        <div className="args-target">
          scheduler:{" "}
          {buildSchedulerOptions()
            .map((option) => option.arg)
            .join(" ")}
        </div>
      </section>


      <div className="submit-section">
        {checking ? (
          <div className="auth-state">
            <Loader2
              size={15}
              className="spinner"
            />

            <span>
              Checking Tapis session...
            </span>
          </div>
        ) : authenticated ? (
          <div className="auth-state auth-state-ok">
            <ShieldCheck size={15} />

            <span>
              Signed in to Tapis
              {user ? ` as ${user}` : ""}
            </span>
          </div>
        ) : blocked ? (
          <div className="auth-state auth-state-locked">
            <Lock size={15} />

            <div>
              <strong>
                Not signed in to Tapis
              </strong>

              <span>
                Jobs can only be submitted with a
                valid {TAPIS_TOKEN_COOKIE} session
                cookie.
              </span>
            </div>
          </div>
        ) : (
          /*
           * Session could not be checked — Tapis unreachable or
           * CORS-blocked. Submitting is still allowed; the submit
           * call is the real authority.
           */
          <div className="auth-state auth-state-unknown">
            <ShieldQuestion size={15} />

            <div>
              <strong>
                Tapis session not verified
              </strong>

              <span>
                Submitting anyway — Tapis will
                reject the job if the session is
                not valid.
              </span>
            </div>
          </div>
        )}

        {error && errorSource === "submit" && (
          <div className="form-error submit-error">
            {error}
          </div>
        )}

        <button
          type="button"
          className="primary-button full-width"
          onClick={handleSubmit}
          disabled={
            submitting || checking || blocked
          }
          title={
            blocked
              ? "Sign in to Tapis to submit jobs"
              : undefined
          }
        >
          {submitting ? (
            <>
              <Loader2
                size={16}
                className="spinner"
              />

              Submitting...
            </>
          ) : (
            <>
              Submit Collection Job

              <ChevronRight size={16} />
            </>
          )}
        </button>


        {submitSuccess && (
          <div className="submit-success">
            <CheckCircle2 size={16} />

            <div>
              <strong>
                Job submitted
              </strong>

              <span>
                Job ID: {submitSuccess.id}
              </span>
            </div>
          </div>
        )}


        <p>
          Review all settings. Nothing is
          submitted to Tapis until you click
          Submit.
        </p>
      </div>
    </Drawer>
  );
}

export default JobSetupDrawer;