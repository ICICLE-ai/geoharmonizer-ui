import { AlertTriangle, Info, Layers3 } from "lucide-react";

import {
  formatResolution,
  shortSourceName,
} from "../../utils/lakeScale";

/*
 * The provenance block, rendered in full.
 *
 * This panel is the reason the platform exists. A map blending 10 m
 * Sentinel-2 with 30 m Landsat looks exactly the same as one that does
 * not, so the numbers on screen are only defensible if what produced
 * them is on screen too.
 *
 * Consequences of that, all deliberate:
 *   - warnings render expanded, every time, at the top. They are never
 *     behind a disclosure control, a tooltip, or a "details" link.
 *   - every contributing source is listed with its own ground
 *     resolution and cadence. Nothing is summarised into an average.
 *   - a mixed-resolution result is called mixed in the heading, not
 *     only implied by the row list.
 */

function ProvenancePanel({ provenance, layerName }) {
  if (!provenance) {
    return null;
  }

  const sources = provenance.sources ?? [];
  const warnings = provenance.warnings ?? [];
  const range = provenance.resolution_range_m;

  const isMixed =
    Array.isArray(range) &&
    range.length === 2 &&
    range[0] !== range[1];

  const granularities = provenance.temporal_granularities ?? [];
  const mixedCadence = granularities.length > 1;

  const dateRange = provenance.date_range;

  return (
    <section className="lake-provenance">
      {/*
        * Warnings first and always open. A non-empty list means a
        * reasonable person would read the numbers differently knowing
        * it, so it cannot be something the user has to go find.
        */}
      {warnings.length > 0 ? (
        <div className="lake-warnings" role="alert">
          <div className="lake-warnings-head">
            <AlertTriangle size={15} />

            <strong>
              {warnings.length === 1
                ? "1 provenance warning"
                : `${warnings.length} provenance warnings`}
            </strong>
          </div>

          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="lake-panel-block">
        <div className="lake-panel-heading">
          <Layers3 size={14} />

          <span>
            Sources contributing
            {layerName ? ` to ${layerName}` : ""}
          </span>

          {isMixed ? (
            <span className="lake-chip lake-chip-warn">
              Mixed {range[0]}–{range[1]} m
            </span>
          ) : null}
        </div>

        {sources.length === 0 ? (
          <p className="lake-muted">
            No sources contributed to this result.
          </p>
        ) : (
          <ul className="lake-source-list">
            {sources.map((source) => (
              <li key={source.source_id} className="lake-source-row">
                <div className="lake-source-name">
                  {shortSourceName(source.source_id)}
                </div>

                <dl className="lake-source-facts">
                  {/*
                    * Ground resolution is the field that decides
                    * whether a comparison across these rows is sound,
                    * so it leads and is never abbreviated away.
                    */}
                  <div>
                    <dt>Ground resolution</dt>
                    <dd className="lake-strong">
                      {formatResolution(source.resolution_m)}
                    </dd>
                  </div>

                  <div>
                    <dt>Cadence</dt>
                    <dd>{source.temporal_granularity ?? "—"}</dd>
                  </div>

                  <div>
                    <dt>Native H3</dt>
                    <dd>
                      {source.h3_native_res != null
                        ? `res ${source.h3_native_res}`
                        : "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Rows</dt>
                    <dd>{source.row_count.toLocaleString()}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="lake-panel-block">
        <dl className="lake-facts">
          <div>
            <dt>Rows aggregated</dt>
            <dd>{(provenance.row_count ?? 0).toLocaleString()}</dd>
          </div>

          <div>
            <dt>Date range</dt>
            <dd>
              {Array.isArray(dateRange) && dateRange.length === 2
                ? dateRange[0] === dateRange[1]
                  ? dateRange[0]
                  : `${dateRange[0]} → ${dateRange[1]}`
                : "—"}
            </dd>
          </div>

          <div>
            <dt>Cadences</dt>
            <dd>
              {granularities.length > 0 ? granularities.join(", ") : "—"}

              {mixedCadence ? (
                <span className="lake-chip lake-chip-warn">mixed</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {sources.length > 1 ? (
        <p className="lake-note">
          <Info size={13} />

          <span>
            Cell values are means over all contributing rows, so a cell
            is weighted toward whichever source has more pixels in it.
            Open a cell to see each source measured separately.
          </span>
        </p>
      ) : null}
    </section>
  );
}

export default ProvenancePanel;
