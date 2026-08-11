import {
  MapPin,
  UploadCloud,
} from "lucide-react";

const MOCK_FIELDS = [
  {
    id: 1,
    name: "North Ridge",
    area: 0.6,
    points:
      "80,90 250,65 275,180 100,205",
  },
  {
    id: 2,
    name: "South Bottom",
    area: 0.8,
    points:
      "315,220 520,205 540,350 330,360",
  },
  {
    id: 3,
    name: "Millrace East",
    area: 0.4,
    points:
      "110,270 245,250 255,385 120,400",
  },
];

function MapViewer({
  selectedIds,
  onSelectionChange,
  uploadRequested,
  onUploadHandled,
}) {
  const toggleField = (id) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(
          (selectedId) =>
            selectedId !== id
        )
      : [...selectedIds, id];

    onSelectionChange(next);
  };

  const selectedFields =
    MOCK_FIELDS.filter((field) =>
      selectedIds.includes(field.id)
    );

  const totalArea =
    selectedFields.reduce(
      (sum, field) =>
        sum + field.area,
      0
    );

  // Temporary upload behavior.
  // Brijesh will replace this with real
  // shapefile / GeoJSON upload.
  if (uploadRequested) {
    setTimeout(() => {
      onUploadHandled();
    }, 0);
  }

  return (
    <main className="map-workspace">
      <div className="map-background">
        <svg
          className="map-contours"
          viewBox="0 0 800 500"
          preserveAspectRatio="none"
        >
          <path d="M-20 80 C140 20 260 120 430 75 S650 25 840 100" />
          <path d="M-20 165 C120 110 285 210 440 155 S680 105 840 185" />
          <path d="M-20 255 C145 315 300 210 470 265 S660 325 840 260" />
          <path d="M-20 355 C160 300 320 395 490 345 S690 310 840 390" />
          <path d="M-20 450 C120 400 285 495 470 440 S700 395 840 470" />
        </svg>

        <svg
          className="field-layer"
          viewBox="0 0 800 500"
        >
          {MOCK_FIELDS.map(
            (field) => {
              const selected =
                selectedIds.includes(
                  field.id
                );

              return (
                <polygon
                  key={field.id}
                  points={field.points}
                  className={
                    selected
                      ? "field-polygon selected"
                      : "field-polygon"
                  }
                  onClick={() =>
                    toggleField(
                      field.id
                    )
                  }
                />
              );
            }
          )}
        </svg>

        {MOCK_FIELDS.map(
          (field, index) => {
            const positions = [
              {
                left: "22%",
                top: "28%",
              },
              {
                left: "53%",
                top: "58%",
              },
              {
                left: "22%",
                top: "69%",
              },
            ];

            const selected =
              selectedIds.includes(
                field.id
              );

            return (
              <button
                key={field.id}
                type="button"
                className={`field-label ${
                  selected
                    ? "selected"
                    : ""
                }`}
                style={
                  positions[index]
                }
                onClick={() =>
                  toggleField(
                    field.id
                  )
                }
              >
                {field.name}
              </button>
            );
          }
        )}

        <div className="map-upload-hint">
          <UploadCloud size={17} />

          <div>
            <strong>
              Upload field boundaries
            </strong>

            <span>
              Shapefile / GeoJSON
            </span>
          </div>
        </div>

        <div className="map-status">
          <MapPin size={14} />

          {selectedIds.length === 0
            ? "No fields selected"
            : `${
                selectedIds.length
              } field${
                selectedIds.length >
                1
                  ? "s"
                  : ""
              } selected · ${totalArea.toFixed(
                1
              )} km²`}
        </div>

        <div className="map-crs">
          EPSG:4326 · mock map
        </div>
      </div>
    </main>
  );
}

export {
  MOCK_FIELDS,
};

export default MapViewer;