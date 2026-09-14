/*
 * Map constants for the lake explorer.
 */

/* Molly Caren Agricultural Center — the AOI currently in the lake. */
export const AOI_CENTER = [39.945, -83.445];
export const AOI_ZOOM = 13;

/*
 * Field boundaries sit on top of imagery, so they are drawn as
 * outlines with almost no fill. A filled polygon would hide the crop
 * texture that is the reason for looking at the raster in the first
 * place.
 */
export const VECTOR_STYLE = {
  color: "#55d6c4",
  weight: 2,
  fillColor: "#55d6c4",
  fillOpacity: 0.06,
};

export const VECTOR_SELECTED_STYLE = {
  color: "#e7eee9",
  weight: 3,
  fillColor: "#55d6c4",
  fillOpacity: 0.16,
};

/* A zonal statistic that blends sensors of different resolution. */
export const MIXED_STROKE = "#e3b15b";

export const DRAW_STYLE = {
  color: "#e3b15b",
  weight: 2,
  dashArray: "5 4",
  fillColor: "#e3b15b",
  fillOpacity: 0.12,
};
