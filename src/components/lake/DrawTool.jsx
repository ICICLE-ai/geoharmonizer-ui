import { useEffect, useRef } from "react";

import { useMap } from "react-leaflet";
import L from "leaflet";

import { DRAW_STYLE } from "../../utils/lakeMapConfig";

/*
 * Polygon drawing, built directly on Leaflet.
 *
 * Deliberately not a plugin: the app already drives Leaflet by hand in
 * MapViewer, and a drawing toolbar would be a new dependency plus its
 * own UI to restyle. What this gives up is post-hoc editing — there is
 * no dragging a vertex once it is placed; you cancel and redraw.
 *
 *   click     place a vertex
 *   dblclick  close the ring and submit
 *   Escape    cancel
 *   Backspace remove the last vertex
 *
 * Everything is drawn into a layer group owned by this component, so
 * nothing it creates outlives it or touches the other layers.
 */

function DrawTool({ active, onComplete, onCancel }) {
  const map = useMap();

  /* Kept in refs: the Leaflet handlers close over them and must see
   * current values without re-binding on every vertex. */
  const points = useRef([]);
  const group = useRef(null);
  const callbacks = useRef({ onComplete, onCancel });

  /* Kept current in an effect: writing a ref during render is not
   * safe under concurrent rendering. */
  useEffect(() => {
    callbacks.current = { onComplete, onCancel };
  }, [onComplete, onCancel]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const layerGroup = L.layerGroup().addTo(map);

    group.current = layerGroup;
    points.current = [];

    const redraw = () => {
      layerGroup.clearLayers();

      const ring = points.current;

      /*
       * The preview must not be clickable.
       *
       * Leaflet paths are interactive by default, so once a few
       * vertices are down the polyline sits under the cursor and
       * becomes the event target. The two halves of a double-click
       * then land on different elements and the browser fires no
       * dblclick at all — the gesture that finishes the shape is
       * swallowed by the shape being drawn.
       */
      if (ring.length > 1) {
        L.polyline(ring, {
          ...DRAW_STYLE,
          interactive: false,
        }).addTo(layerGroup);
      }

      for (const point of ring) {
        L.circleMarker(point, {
          radius: 4,
          color: DRAW_STYLE.color,
          fillColor: DRAW_STYLE.color,
          fillOpacity: 1,
          weight: 1,
          interactive: false,
        }).addTo(layerGroup);
      }
    };

    const finish = () => {
      const ring = points.current;

      /* Three distinct vertices is the minimum for an area. */
      if (ring.length < 3) {
        return;
      }

      const coordinates = [
        ...ring.map((point) => [point.lng, point.lat]),
        [ring[0].lng, ring[0].lat],
      ];

      callbacks.current.onComplete({
        type: "Polygon",
        coordinates: [coordinates],
      });
    };

    const onClick = (event) => {
      points.current = [...points.current, event.latlng];
      redraw();
    };

    const onDoubleClick = (event) => {
      /* Leaflet passes its own event wrapper; the DOM event is the
       * one that has to be stopped. */
      if (event.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }

      finish();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        callbacks.current.onCancel();
      }

      if (event.key === "Backspace" && points.current.length > 0) {
        event.preventDefault();
        points.current = points.current.slice(0, -1);
        redraw();
      }

      if (event.key === "Enter") {
        finish();
      }
    };

    map.doubleClickZoom.disable();

    const container = map.getContainer();
    container.style.cursor = "crosshair";

    map.on("click", onClick);
    map.on("dblclick", onDoubleClick);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDoubleClick);
      window.removeEventListener("keydown", onKeyDown);

      map.doubleClickZoom.enable();
      container.style.cursor = "";

      layerGroup.remove();
      group.current = null;
      points.current = [];
    };
  }, [active, map]);

  return null;
}

export default DrawTool;
