import { useEffect, useRef } from "react";

import { Cloud, Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { shortSourceName } from "../../utils/lakeScale";

/*
 * Steps through acquisition dates.
 *
 * Discrete, not a continuous scrub: observations exist on these dates
 * and nowhere between them, and a smooth track would imply data that
 * is not there.
 *
 * Each stop is tinted by the sensor that produced it, because moving
 * from a 10 m image to a 30 m one is a change in the data and not only
 * in time — the ticks make that visible on the control itself rather
 * than leaving it to the provenance panel.
 */

const SPEEDS = [
  { label: "0.5x", ms: 2000 },
  { label: "1x", ms: 1000 },
  { label: "2x", ms: 500 },
];


function TimeSlider({
  timesteps,
  index,
  onIndexChange,
  sourceColors,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
}) {
  const timer = useRef(null);

  useEffect(() => {
    if (!playing || timesteps.length < 2) {
      return undefined;
    }

    timer.current = setInterval(() => {
      onIndexChange((current) => (current + 1) % timesteps.length);
    }, speed);

    return () => clearInterval(timer.current);
  }, [playing, speed, timesteps.length, onIndexChange]);

  if (timesteps.length === 0) {
    return null;
  }

  const current = timesteps[index];

  const step = (delta) =>
    onIndexChange(
      (value) =>
        (value + delta + timesteps.length) % timesteps.length
    );

  return (
    <div className="lake-slider">
      <div className="lake-slider-head">
        <div className="lake-slider-date">
          <strong>{current.date}</strong>

          <span
            className="lake-slider-source"
            style={{ color: sourceColors.get(current.source_id) }}
          >
            {shortSourceName(current.source_id)} ·{" "}
            {current.resolution_m} m
          </span>
        </div>

        <div className="lake-slider-meta">
          {Number.isFinite(current.cloud_cover) ? (
            <span className="lake-slider-cloud">
              <Cloud size={12} />
              {current.cloud_cover.toFixed(1)}% cloud
            </span>
          ) : null}

          <span className="lake-muted">
            {index + 1} / {timesteps.length}
          </span>
        </div>
      </div>

      {/*
        * The ticks are the control. Each carries its sensor's colour,
        * so a run of one resolution and the point it changes are both
        * legible before you move anything.
        */}
      <div className="lake-slider-track">
        {timesteps.map((step_, position) => (
          <button
            key={step_.date}
            type="button"
            className={`lake-slider-tick ${
              position === index ? "lake-slider-tick-active" : ""
            }`}
            style={{
              "--tick-color": sourceColors.get(step_.source_id),
            }}
            onClick={() => onIndexChange(position)}
            title={`${step_.date} · ${shortSourceName(
              step_.source_id
            )} · ${step_.resolution_m} m`}
            aria-label={`${step_.date}, ${step_.resolution_m} metre`}
            aria-pressed={position === index}
          />
        ))}
      </div>

      <div className="lake-slider-controls">
        <button
          type="button"
          className="icon-button"
          onClick={() => step(-1)}
          aria-label="Previous date"
        >
          <SkipBack size={15} />
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => onPlayingChange(!playing)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => step(1)}
          aria-label="Next date"
        >
          <SkipForward size={15} />
        </button>

        <div className="lake-speed">
          {SPEEDS.map((option) => (
            <button
              key={option.label}
              type="button"
              className={`lake-speed-option ${
                speed === option.ms ? "lake-speed-option-active" : ""
              }`}
              onClick={() => onSpeedChange(option.ms)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TimeSlider;
