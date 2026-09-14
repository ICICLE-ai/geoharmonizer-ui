import { useId, useMemo, useState } from "react";

import { formatValue, shortSourceName } from "../../utils/lakeScale";

/*
 * One line per source. Never a combined line.
 *
 * The API deliberately does not merge these series, and neither does
 * this chart: a 10 m and a 30 m measurement of the same ground are
 * different quantities, and averaging them into one line would draw a
 * resolution difference as though it were change over time.
 *
 * Both series share a single y axis. Two scales on one plot would
 * invent a correlation that is not in the data.
 *
 * A series may hold a single point — the live lake currently has one
 * acquisition. That is a real shape, not a failure: marks are drawn as
 * dots first and connected only where a series actually has more than
 * one point, so a one-point series is fully visible rather than an
 * invisible zero-length line.
 *
 * `markedDate` draws the slider's current date onto the chart, so the
 * image on screen and its place in the season are the same glance.
 */

const WIDTH = 320;
const HEIGHT = 150;
const PAD = { top: 12, right: 14, bottom: 26, left: 44 };

const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;


function TimeseriesChart({ series, colors, units, markedDate }) {
  const titleId = useId();
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    const all = series.flatMap((entry) =>
      entry.points.map((point) => ({
        ...point,
        sourceId: entry.source_id,
        time: new Date(point.date).getTime(),
      }))
    );

    if (all.length === 0) {
      return null;
    }

    const values = all.map((point) => point.value);

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    /* Pad a flat domain so marks do not sit on the axis line. */
    if (minValue === maxValue) {
      const nudge = Math.abs(minValue) * 0.2 || 0.01;
      minValue -= nudge;
      maxValue += nudge;
    } else {
      const headroom = (maxValue - minValue) * 0.15;
      minValue -= headroom;
      maxValue += headroom;
    }

    const times = all.map((point) => point.time);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const x = (time) =>
      maxTime === minTime
        ? PAD.left + PLOT_W / 2
        : PAD.left +
          ((time - minTime) / (maxTime - minTime)) * PLOT_W;

    const y = (value) =>
      PAD.top +
      PLOT_H -
      ((value - minValue) / (maxValue - minValue)) * PLOT_H;

    const dates = [...new Set(all.map((point) => point.date))].sort();

    return {
      x,
      y,
      minValue,
      maxValue,
      dates,
      /* A marked date outside this cell's observations must not be
       * drawn as though it sat on the axis. */
      hasDate: (date) => dates.includes(date),
    };
  }, [series]);

  if (!model) {
    return null;
  }

  return (
    <figure className="lake-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        className="lake-chart-svg"
      >
        <title id={titleId}>
          Value over time, one line per source
        </title>

        {/* Recessive axes — the data is the subject. */}
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + PLOT_H}
          className="lake-axis"
        />

        <line
          x1={PAD.left}
          y1={PAD.top + PLOT_H}
          x2={PAD.left + PLOT_W}
          y2={PAD.top + PLOT_H}
          className="lake-axis"
        />

        <text x={PAD.left - 6} y={PAD.top + 4} className="lake-tick-label" textAnchor="end">
          {formatValue(model.maxValue)}
        </text>

        <text
          x={PAD.left - 6}
          y={PAD.top + PLOT_H}
          className="lake-tick-label"
          textAnchor="end"
        >
          {formatValue(model.minValue)}
        </text>

        {/* The date currently shown on the map. */}
        {markedDate && model.hasDate(markedDate) ? (
          <g>
            <line
              x1={model.x(new Date(markedDate).getTime())}
              y1={PAD.top}
              x2={model.x(new Date(markedDate).getTime())}
              y2={PAD.top + PLOT_H}
              className="lake-marker-rule"
            />

            <text
              x={model.x(new Date(markedDate).getTime())}
              y={PAD.top - 3}
              className="lake-marker-label"
              textAnchor="middle"
            >
              shown
            </text>
          </g>
        ) : null}

        {/* Only the ends and the shown date get labels — one per
          * acquisition would collide across a season. */}
        {[
          ...new Set(
            [
              model.dates[0],
              markedDate && model.hasDate(markedDate)
                ? markedDate
                : null,
              model.dates[model.dates.length - 1],
            ].filter(Boolean)
          ),
        ].map((date) => (
          <text
            key={date}
            x={model.x(new Date(date).getTime())}
            y={HEIGHT - 8}
            className="lake-tick-label"
            textAnchor="middle"
          >
            {date.slice(5)}
          </text>
        ))}

        {series.map((entry) => {
          const color = colors.get(entry.source_id);

          const points = [...entry.points].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );

          const path = points
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"} ${model.x(
                  new Date(point.date).getTime()
                )} ${model.y(point.value)}`
            )
            .join(" ");

          return (
            <g key={entry.source_id}>
              {points.length > 1 ? (
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {points.map((point) => {
                const cx = model.x(new Date(point.date).getTime());
                const cy = model.y(point.value);

                const isHovered =
                  hover?.sourceId === entry.source_id &&
                  hover?.date === point.date;

                return (
                  <g key={point.date}>
                    {/* A 2px surface ring keeps overlapping marks apart. */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 7 : 5.5}
                      fill={color}
                      stroke="var(--surface)"
                      strokeWidth="2"
                    />

                    {/* Hit target larger than the mark. */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="12"
                      fill="transparent"
                      onMouseEnter={() =>
                        setHover({
                          sourceId: entry.source_id,
                          date: point.date,
                          value: point.value,
                          count: point.count,
                          resolution: entry.resolution_m,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {hover ? (
        <div className="lake-chart-tooltip">
          <strong>{shortSourceName(hover.sourceId)}</strong>

          <span>
            {hover.date} · {formatValue(hover.value)}
            {units ? ` ${units}` : ""}
          </span>

          <span className="lake-muted">
            {hover.count.toLocaleString()} px at {hover.resolution} m
          </span>
        </div>
      ) : null}
    </figure>
  );
}

export default TimeseriesChart;
