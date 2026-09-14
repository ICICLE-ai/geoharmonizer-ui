import { useCallback, useMemo } from "react";

import { GeoJSON } from "react-leaflet";

import {
  MIXED_STROKE,
  VECTOR_SELECTED_STYLE,
  VECTOR_STYLE,
} from "../../utils/lakeMapConfig";

import { colorForValue, formatValue } from "../../utils/lakeScale";

/*
 * Field boundaries, and optionally the zonal statistic painted onto
 * them.
 *
 * Two modes on one layer:
 *   outline — boundaries over imagery, almost no fill, so the crop
 *             texture underneath stays the thing you are looking at
 *   zonal   — the same polygons filled by their aggregate value
 *
 * A polygon whose statistic blends sensors of differing resolution
 * gets the amber stroke. That is per-polygon rather than a single note
 * on the panel, because in a mixed result some fields are blended and
 * others are not, and which is which changes how each number reads.
 */

function VectorFeaturesLayer({
  features,
  zonalByFeature,
  showZonal,
  domain,
  selectedId,
  onSelect,
}) {
  const collection = useMemo(
    () => ({
      type: "FeatureCollection",
      features: features.map((feature) => ({
        type: "Feature",
        properties: feature,
        geometry: feature.geometry,
      })),
    }),
    [features]
  );

  const dataKey = useMemo(
    () =>
      `${features.length}:${showZonal}:${domain?.min}:${domain?.max}:${selectedId}`,
    [features, showZonal, domain, selectedId]
  );

  const styleFor = useCallback(
    (feature) => {
      const record = feature.properties;
      const isSelected = record.feature_id === selectedId;

      if (!showZonal) {
        return isSelected ? VECTOR_SELECTED_STYLE : VECTOR_STYLE;
      }

      const stat = zonalByFeature.get(record.feature_id);

      /* No statistic for this polygon is a real answer, not an error. */
      if (!stat) {
        return {
          ...VECTOR_STYLE,
          fillOpacity: 0,
          dashArray: "4 4",
        };
      }

      const isMixed = (stat.sources?.length ?? 0) > 1;

      return {
        color: isMixed ? MIXED_STROKE : VECTOR_STYLE.color,
        weight: isSelected ? 3 : isMixed ? 2.5 : 1.5,
        fillColor: colorForValue(stat.value, domain),
        fillOpacity: 0.78,
      };
    },
    [showZonal, zonalByFeature, domain, selectedId]
  );

  const onEachFeature = useCallback(
    (feature, layer) => {
      const record = feature.properties;
      const stat = zonalByFeature.get(record.feature_id);

      const name =
        record.attributes?.field_name ?? record.feature_id;

      const lines = [`<strong>${name}</strong>`];

      if (record.attributes?.crop_type) {
        lines.push(record.attributes.crop_type);
      }

      if (showZonal && stat) {
        lines.push(
          `${formatValue(stat.value)} · ${stat.count.toLocaleString()} px`
        );

        if ((stat.sources?.length ?? 0) > 1) {
          lines.push(
            `<em>blends ${stat.sources.length} sensors</em>`
          );
        }
      }

      layer.bindTooltip(lines.join("<br/>"), { sticky: true });

      layer.on("click", (event) => {
        /* The map's own click opens the point series; a polygon click
         * selects the polygon instead. */
        event.originalEvent?.stopPropagation();

        onSelect(record);
      });
    },
    [zonalByFeature, showZonal, onSelect]
  );

  if (features.length === 0) {
    return null;
  }

  return (
    <GeoJSON
      key={dataKey}
      data={collection}
      style={styleFor}
      onEachFeature={onEachFeature}
    />
  );
}

export default VectorFeaturesLayer;
