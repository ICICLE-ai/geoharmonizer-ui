import {
  useState,
} from "react";

import "./App.css";

import TopBar from "./components/layout/TopBar";
import MapViewer, {
  MOCK_FIELDS,
} from "./components/map/MapViewer";
import JobSetupDrawer from "./components/job/JobSetupDrawer";
import ChatDrawer from "./components/chat/ChatDrawer";
import JobsPage from "./components/jobs/JobsPage";

import {
  initialJobSpec,
} from "./state/jobSpec";

function App() {
  const [
    view,
    setView,
  ] = useState("map");

  const [
    drawer,
    setDrawer,
  ] = useState(null);

  const [
    selectedIds,
    setSelectedIds,
  ] = useState([]);

  const [
    uploadRequested,
    setUploadRequested,
  ] = useState(false);

  const [
    jobSpec,
    setJobSpec,
  ] = useState(
    initialJobSpec
  );

  const updateJobSpec = (patch) => {
  setJobSpec((current) => {
    const next = {
      ...current,
      ...patch,
    };

    const aoiChanged =
      Object.prototype.hasOwnProperty.call(patch, "aoi") &&
      patch.aoi !== current.aoi;

    const startDateChanged =
      Object.prototype.hasOwnProperty.call(patch, "startDate") &&
      patch.startDate !== current.startDate;

    const endDateChanged =
      Object.prototype.hasOwnProperty.call(patch, "endDate") &&
      patch.endDate !== current.endDate;

    const cloudChanged =
      Object.prototype.hasOwnProperty.call(patch, "cloudMax") &&
      patch.cloudMax !== current.cloudMax;

    const availabilityInputsChanged =
      aoiChanged ||
      startDateChanged ||
      endDateChanged ||
      cloudChanged;

    if (availabilityInputsChanged) {
      next.availability = null;
      next.selectedDates = [];
    }

    return next;
  });
};

  const handleSelectionChange =
    (nextIds) => {
      setSelectedIds(
        nextIds
      );

      const fields =
        MOCK_FIELDS.filter(
          (field) =>
            nextIds.includes(
              field.id
            )
        );

      if (
        fields.length === 0
      ) {
        updateJobSpec({
          aoi: null,
        });

        return;
      }

      const totalArea =
        fields.reduce(
          (
            sum,
            field
          ) =>
            sum +
            field.area,
          0
        );

      updateJobSpec({
        aoi: {
          aoi_id:
            "mock-aoi-selection",

          geojson: null,

          selected_feature_ids:
            fields.map(
              (field) =>
                field.id
            ),

          n_features:
            fields.length,

          area_km2:
            Number(
              totalArea.toFixed(
                1
              )
            ),

          label:
            fields
              .map(
                (field) =>
                  field.name
              )
              .join(", "),
        },

        availability:
          null,

        selectedDates: [],
      });
    };

  const openDrawer = (
    name
  ) => {
    setView("map");

    setDrawer(
      (current) =>
        current === name
          ? null
          : name
    );
  };

  return (
    <div className="app-shell">
      <TopBar
        view={view}
        drawer={drawer}
        onUpload={() => {
          setView("map");
          setDrawer(null);
          setUploadRequested(
            true
          );
        }}
        onJobSetup={() =>
          openDrawer("job")
        }
        onJobs={() => {
          setView("jobs");
          setDrawer(null);
        }}
        onChat={() =>
          openDrawer("chat")
        }
      />

      <div className="main-workspace">
        {view === "map" ? (
          <MapViewer
            selectedIds={
              selectedIds
            }
            onSelectionChange={
              handleSelectionChange
            }
            uploadRequested={
              uploadRequested
            }
            onUploadHandled={() =>
              setUploadRequested(
                false
              )
            }
          />
        ) : (
          <JobsPage />
        )}

        <JobSetupDrawer
          open={
            drawer === "job"
          }
          onClose={() =>
            setDrawer(null)
          }
          jobSpec={jobSpec}
          onChange={
            updateJobSpec
          }
        />

        <ChatDrawer
          open={
            drawer === "chat"
          }
          onClose={() =>
            setDrawer(null)
          }
          jobSpec={jobSpec}
          onSuggestion={
            updateJobSpec
          }
        />
      </div>
    </div>
  );
}

export default App;