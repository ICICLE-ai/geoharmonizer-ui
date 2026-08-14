import {
  useState,
} from "react";

import "./App.css";

import TopBar from "./components/layout/TopBar";
import MapViewer from "./components/map/MapViewer";
import JobSetupDrawer from "./components/job/JobSetupDrawer";
import ChatDrawer from "./components/chat/ChatDrawer";
import JobsPage from "./components/jobs/JobsPage";

import {
  initialJobSpec,
} from "./state/jobSpec";

import {
  featureCollectionBounds,
} from "./utils/geometry";

import {
  CHAT_ENABLED,
} from "./services/chat";

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

  /*
   * The map owns the uploaded boundaries, so it hands back the
   * selected GeoJSON features alongside their ids.
   */
  const handleSelectionChange = (
    nextIds,
    nextFeatures = []
  ) => {
    setSelectedIds(
      nextIds
    );

    if (
      nextFeatures.length === 0
    ) {
      updateJobSpec({
        aoi: null,
      });

      return;
    }

    const totalArea =
      nextFeatures.reduce(
        (
          sum,
          feature
        ) =>
          sum +
          (feature.__gh
            ?.areaKm2 ?? 0),
        0
      );

    const names =
      nextFeatures.map(
        (feature) =>
          feature.__gh?.name ??
          "Feature"
      );

    const label =
      names.length > 3
        ? `${names
            .slice(0, 3)
            .join(", ")} +${
            names.length - 3
          } more`
        : names.join(", ");

    updateJobSpec({
      aoi: {
        aoi_id:
          "upload-selection",

        /* W,S,E,N in EPSG:4326 — feeds --bbox. */
        bbox:
          featureCollectionBounds(
            nextFeatures
          ),

        geojson: {
          type: "FeatureCollection",

          features:
            nextFeatures,
        },

        selected_feature_ids:
          nextIds,

        n_features:
          nextFeatures.length,

        area_km2:
          Number(
            totalArea.toFixed(
              1
            )
          ),

        label,
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
        showChat={CHAT_ENABLED}
      />

      <div className="main-workspace">
        {/*
          * The map stays mounted while other views are open, so
          * uploaded layers — and the current pan/zoom — are still
          * there when the user comes back.
          */}
        <div
          className={`view-pane ${
            view === "map"
              ? ""
              : "view-pane-hidden"
          }`}
        >
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
        </div>

        {view === "jobs" ? (
          <JobsPage />
        ) : null}

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

        {CHAT_ENABLED ? (
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
        ) : null}
      </div>
    </div>
  );
}

export default App;