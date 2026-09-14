import { useEffect, useMemo } from "react";

import { TileLayer } from "react-leaflet";
import L from "leaflet";

import { buildTileUrl } from "../../services/lake";

/*
 * The imagery layer.
 *
 * Leaflet is pointed straight at the tile URL — tiles are never
 * fetched in JavaScript and re-drawn. COGs carry their own overviews,
 * so the server returns whatever resolution suits the zoom and the
 * payload per tile stays roughly flat.
 *
 * Adjacent timesteps are warmed in a detached image cache so stepping
 * the slider shows the next date immediately instead of flashing
 * half-loaded tiles. Only the neighbours are preloaded: fetching every
 * date would defeat the point of tiling.
 */

function preload(url) {
  if (!url) {
    return;
  }

  const image = new Image();
  image.src = url;
}


function RasterTileLayer({
  timestep,
  neighbours = [],
  rescale,
  colormap,
  opacity,
}) {
  const url = useMemo(
    () => buildTileUrl(timestep?.tile_url, { rescale, colormap }),
    [timestep, rescale, colormap]
  );

  useEffect(() => {
    for (const neighbour of neighbours) {
      preload(buildTileUrl(neighbour?.tile_url, { rescale, colormap }));
    }
  }, [neighbours, rescale, colormap]);

  /*
   * Imagery covers only the acquisition footprint. Bounding the layer
   * stops Leaflet requesting tiles for the rest of the world, which
   * would be 404s billed as egress.
   */
  const bounds = useMemo(() => {
    if (!Array.isArray(timestep?.bounds)) {
      return undefined;
    }

    const [west, south, east, north] = timestep.bounds;

    return L.latLngBounds([south, west], [north, east]);
  }, [timestep]);

  if (!url) {
    return null;
  }

  return (
    <TileLayer
      /*
       * Keyed on the resolved URL so a date change swaps the layer
       * rather than mutating one in place — Leaflet keeps the old
       * tiles painted until the new ones arrive, which is what makes
       * stepping look continuous.
       */
      key={url}
      url={url}
      bounds={bounds}
      opacity={opacity}
      /* Mock tiles are one flat SVG; without this Leaflet tries to
       * fetch a retina variant that does not exist. */
      detectRetina={false}
      noWrap
      zIndex={200}
    />
  );
}

export default RasterTileLayer;
