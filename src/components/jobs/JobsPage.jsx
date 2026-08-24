import { useEffect, useState } from "react";

import {
  RefreshCw,
  Loader2,
  BriefcaseBusiness,
  CircleCheck,
  CircleX,
  Clock3,
} from "lucide-react";

import {
  getJobs,
} from "../../services/tapis";


function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  /*
   * Used when the user manually clicks Refresh.
   */
  const loadJobs = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getJobs();

      setJobs(result);
    } catch (err) {
      console.error(
        "Failed to load jobs:",
        err
      );

      setError(
        err?.message ||
          "Could not load jobs. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };


  /*
   * Load jobs when the Jobs page first opens.
   *
   * The loading logic lives inside the effect
   * instead of calling loadJobs() directly.
   */
  useEffect(() => {
    let cancelled = false;

    const loadInitialJobs = async () => {
      try {
        const result = await getJobs();

        if (!cancelled) {
          setJobs(result);
          setError("");
        }
      } catch (err) {
        console.error(
          "Failed to load jobs:",
          err
        );

        if (!cancelled) {
          setError(
            err?.message ||
              "Could not load jobs. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInitialJobs();

    return () => {
      cancelled = true;
    };
  }, []);


  /*
   * Filter jobs based on the selected status.
   */
  const filteredJobs =
    filter === "all"
      ? jobs
      : jobs.filter(
          (job) =>
            job.status.toLowerCase() === filter
        );


  /*
   * Return an icon based on job status.
   */
  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case "complete":
        return (
          <CircleCheck size={16} />
        );

      case "failed":
        return (
          <CircleX size={16} />
        );

      case "running":
        return (
          <Loader2 size={16} />
        );

      default:
        return (
          <Clock3 size={16} />
        );
    }
  };


  return (
    <main className="jobs-page">

      {/* Header */}
      <div className="jobs-header">
        <div>
          <div className="jobs-title-row">
            <BriefcaseBusiness size={20} />

            <h1>
              Jobs
            </h1>
          </div>

          <p>
            Collection and harmonization jobs
            submitted to Tapis.
          </p>
        </div>


        {/* Refresh jobs */}
        <button
          type="button"
          className="secondary-button"
          onClick={loadJobs}
          disabled={loading}
        >
          {loading ? (
            <Loader2
              size={15}
              className="spinner"
            />
          ) : (
            <RefreshCw size={15} />
          )}

          Refresh
        </button>
      </div>


      {/* Status filters */}
      <div className="jobs-filters">
        {[
          "all",
          "running",
          "complete",
          "failed",
        ].map((item) => (
          <button
            key={item}
            type="button"
            className={
              filter === item
                ? "job-filter active"
                : "job-filter"
            }
            onClick={() =>
              setFilter(item)
            }
          >
            {item.charAt(0).toUpperCase() +
              item.slice(1)}
          </button>
        ))}
      </div>


      {/* Loading state */}
      {loading && (
        <div className="jobs-state">
          <Loader2
            size={22}
            className="spinner"
          />

          <span>
            Loading jobs...
          </span>
        </div>
      )}


      {/* Error state */}
      {!loading && error && (
        <div className="jobs-state jobs-error">
          <CircleX size={20} />

          <span>
            {error}
          </span>

          <button
            type="button"
            className="secondary-button"
            onClick={loadJobs}
          >
            Try Again
          </button>
        </div>
      )}


      {/* Empty state */}
      {!loading &&
        !error &&
        filteredJobs.length === 0 && (
          <div className="jobs-state">
            <BriefcaseBusiness size={24} />

            <strong>
              No jobs found
            </strong>

            <span>
              {filter === "all"
                ? "No collection jobs have been submitted yet."
                : `No ${filter} collection jobs.`}
            </span>
          </div>
        )}


      {/* Jobs */}
      {!loading &&
        !error &&
        filteredJobs.length > 0 && (
          <div className="jobs-list">
            {filteredJobs.map((job) => (
              <article
                key={job.id}
                className="job-card"
              >
                <div className="job-card-main">
                  <div className="job-name">
                    {job.name}
                  </div>

                  <div className="job-meta">
                    <span>
                      {job.id}
                    </span>

                    <span>
                      ·
                    </span>

                    <span>
                      {job.meta}
                    </span>
                  </div>
                </div>


                <div className="job-card-right">
                  <div
                    className={
                      `job-status job-status-${job.status.toLowerCase()}`
                    }
                  >
                    {getStatusIcon(
                      job.status
                    )}

                    <span>
                      {job.status
                        .charAt(0)
                        .toUpperCase() +
                        job.status.slice(1)}
                    </span>
                  </div>

                  <span className="job-time">
                    {job.time}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
    </main>
  );
}

export default JobsPage;