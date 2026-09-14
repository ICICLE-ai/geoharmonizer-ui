import { useEffect, useState } from "react";

import { Loader2, X } from "lucide-react";

import { getPointTimeseries, LakeError } from "../../services/lake";

import {
  buildSourceColors,
  formatValue,
  shortSourceName,
} from "../../utils/lakeScale";

import TimeseriesChart from "./TimeseriesChart";
import ProvenancePanel from "./ProvenancePanel";

/*
 * Time series for a clicked point.
 *
 * One line per source, plotted on a shared y axis and never merged.
 * The API keeps them apart deliberately: a 10 m and a 30 m measurement
 * of the same ground are different quantities, and averaging them
 * would draw a resolution difference as change over time.
 *
 * Each legend entry carries its own ground resolution for the same
 * reason — that is the fact that decides whether the two lines can be
 * read against each other at all.
 */

function PointTimeseriesPanel({
  lon,
  lat,
  layer,
  units,
  markedDate,
  onClose,
}) {
  const requestKey = `${lon.toFixed(5)}|${lat.toFixed(5)}|${layer}`;

  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    getPointTimeseries(
      { lon, lat, layer },
      { signal: controller.signal }
    )
      .then((data) =>
        setResult({ key: requestKey, status: "ready", data })
      )
      .catch((error) => {
        if (error?.name === "AbortError") {
          return;
        }

        setResult({
          key: requestKey,
          status: "error",
          error:
            error instanceof LakeError
              ? error
              : new LakeError("http", "Time series request failed."),
        });
      });

    return () => controller.abort();
  }, [lon, lat, layer, requestKey]);

  const state =
    result?.key === requestKey ? result : { status: "loading" };

  const series = state.data?.series ?? [];

  const colors = buildSourceColors(
    series.map((entry) => entry.source_id)
  );

  const resolutions = [
    ...new Set(
      series
        .map((entry) => entry.resolution_m)
        .filter((value) => Number.isFinite(value))
    ),
  ].sort((a, b) => a - b);

  return (
    <aside className="lake-cell-panel">
      <div className="lake-cell-head">
        <div>
          <div className="lake-panel-heading">Point time series</div>

          <code className="lake-h3">
            {lat.toFixed(4)}, {lon.toFixed(4)}
          </code>
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close time series"
        >
          <X size={17} />
        </button>
      </div>

      {state.status === "loading" ? (
        <p className="lake-muted lake-inline-status">
          <Loader2 size={14} className="spin" /> Loading series…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="lake-error-text">{state.error.message}</p>
      ) : null}

      {state.status === "ready" ? (
        series.length === 0 ? (
          <p className="lake-muted">
            No observations at this location for {layer}.
          </p>
        ) : (
          <>
            <TimeseriesChart
              series={series}
              colors={colors}
              units={units}
              markedDate={markedDate}
            />

            <ul className="lake-series-legend">
              {series.map((entry) => {
                const marked = entry.points.find(
                  (point) => point.date === markedDate
                );

                const latest =
                  marked ?? entry.points[entry.points.length - 1];

                return (
                  <li key={entry.source_id}>
                    <span
                      className="lake-swatch"
                      style={{
                        background: colors.get(entry.source_id),
                      }}
                    />

                    <div className="lake-series-label">
                      <strong>
                        {shortSourceName(entry.source_id)}
                      </strong>

                      <span className="lake-muted">
                        {entry.resolution_m} m
                        {entry.temporal_granularity
                          ? ` · ${entry.temporal_granularity}`
                          : ""}
                        {" · "}
                        {entry.points.length}{" "}
                        {entry.points.length === 1 ? "date" : "dates"}
                      </span>
                    </div>

                    <div className="lake-series-value">
                      {latest ? formatValue(latest.value) : "—"}
                    </div>
                  </li>
                );
              })}
            </ul>

            {resolutions.length > 1 ? (
              <p className="lake-inline-warning">
                These series were measured at{" "}
                {resolutions.join(" m and ")} m. The offset between
                them is partly a resolution difference, not only a
                difference on the ground — read each line on its own
                terms.
              </p>
            ) : null}

            <ProvenancePanel
              provenance={state.data.provenance}
              layerName={layer}
            />
          </>
        )
      ) : null}
    </aside>
  );
}

export default PointTimeseriesPanel;
