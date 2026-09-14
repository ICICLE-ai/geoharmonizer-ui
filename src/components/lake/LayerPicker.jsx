import { Ban } from "lucide-react";

import { shortSourceName } from "../../utils/lakeScale";

/*
 * Layer picker, driven by /layers.
 *
 * Each row is one sensor's version of a band, because timesteps and
 * tiles are addressed by layer_id. The source filter is the point: a
 * blended view is not always the right one, and this is how the user
 * gets a clean single-sensor read without having to interpret a
 * mixed-resolution caveat.
 *
 * Layers with renderable: false have no COG behind them. They stay
 * listed — they can still be queried for statistics and time series —
 * but cannot be selected for imagery, and say why.
 */

function LayerPicker({
  layers,
  sources,
  value,
  onChange,
  sourceFilter,
  onSourceFilterChange,
}) {
  const visible = sourceFilter
    ? layers.filter((layer) => layer.source_id === sourceFilter)
    : layers;

  return (
    <div className="lake-layer-picker">
      <div className="lake-source-filter">
        <button
          type="button"
          className={`lake-filter-option ${
            sourceFilter === null ? "lake-filter-option-active" : ""
          }`}
          onClick={() => onSourceFilterChange(null)}
        >
          All sources
        </button>

        {sources.map((source) => (
          <button
            key={source.source_id}
            type="button"
            className={`lake-filter-option ${
              sourceFilter === source.source_id
                ? "lake-filter-option-active"
                : ""
            }`}
            onClick={() => onSourceFilterChange(source.source_id)}
            title={`${source.title ?? source.source_id} · ${
              source.native_resolution_m
            } m`}
          >
            {shortSourceName(source.source_id)}
          </button>
        ))}
      </div>

      <div className="lake-layer-list">
        {visible.map((layer) => {
          const active = layer.layer_id === value;
          const disabled = !layer.renderable;

          return (
            <button
              key={layer.layer_id}
              type="button"
              className={`lake-layer-option ${
                active ? "lake-layer-option-active" : ""
              } ${disabled ? "lake-layer-option-disabled" : ""}`}
              onClick={() => !disabled && onChange(layer)}
              aria-pressed={active}
              aria-disabled={disabled}
              title={
                disabled
                  ? "No imagery available for this layer — queryable but not renderable"
                  : undefined
              }
            >
              <div className="lake-layer-line">
                <strong>
                  {layer.display_name || layer.layer_name}
                </strong>

                {disabled ? (
                  <span className="lake-chip lake-chip-off">
                    <Ban size={10} /> no imagery
                  </span>
                ) : null}
              </div>

              <div className="lake-layer-meta">
                <span className="lake-muted">
                  {shortSourceName(layer.source_id)}
                </span>

                <span className="lake-chip">
                  {layer.resolution_m} m
                </span>

                {layer.temporal_granularity ? (
                  <span className="lake-chip">
                    {layer.temporal_granularity}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}

        {visible.length === 0 ? (
          <p className="lake-muted">
            No layers for this source.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default LayerPicker;
