import {
  SEQUENTIAL_RAMP,
  colormapStops,
  formatDomainPair,
  formatValue,
} from "../../utils/lakeScale";

import { MIXED_STROKE } from "../../utils/lakeMapConfig";

/*
 * Two legends, because two things on this map carry colour.
 *
 * "raster" decodes the imagery stretch. The stretch is fixed for the
 * whole layer, and the legend says so — if it moved per date, stepping
 * the slider would recolour unchanged ground and read as real change.
 *
 * "zonal" decodes the aggregate choropleth, and also carries the key
 * for a polygon whose statistic blends resolutions.
 */

function Ramp({ stops }) {
  return (
    <div
      className="lake-ramp"
      style={{
        background: `linear-gradient(90deg, ${stops.join(", ")})`,
      }}
    />
  );
}


function Legend({ mode, domain, units, colormap, layerName }) {
  if (!domain) {
    return null;
  }

  const stops =
    mode === "zonal" ? SEQUENTIAL_RAMP : colormapStops(colormap);

  const [low, high] = formatDomainPair(domain.min, domain.max);

  return (
    <div className="lake-legend">
      <div className="lake-legend-title">
        <span>
          {mode === "zonal" ? "Zonal mean" : layerName || "Value"}
        </span>

        {units ? <span className="lake-units">{units}</span> : null}
      </div>

      <Ramp stops={stops} />

      <div className="lake-ramp-labels">
        <span>{low}</span>
        <span>{high}</span>
      </div>

      {mode === "raster" ? (
        <p className="lake-legend-note">
          Stretch held fixed across all dates, so a change of colour is
          a change on the ground.
        </p>
      ) : null}

      {mode === "zonal" ? (
        <>
          {domain.clipped ? (
            <p className="lake-legend-note">
              Scale clipped to the 2nd–98th percentile. Full extent{" "}
              {formatValue(domain.dataMin)} –{" "}
              {formatValue(domain.dataMax)}.
            </p>
          ) : null}

          <ul className="lake-legend-keys">
            <li>
              <span
                className="lake-key-hex"
                style={{
                  borderColor: MIXED_STROKE,
                  borderStyle: "solid",
                }}
              />

              <span>
                Statistic blends more than one ground resolution
              </span>
            </li>

            <li>
              <span
                className="lake-key-hex"
                style={{
                  borderColor: "var(--text-dim)",
                  borderStyle: "dashed",
                  background: "transparent",
                }}
              />

              <span>No statistic for this polygon</span>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default Legend;
