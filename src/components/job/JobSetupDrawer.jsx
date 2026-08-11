import { useState } from "react";

import {
  CheckCircle2,
  Loader2,
  Satellite,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";

import Drawer from "../layout/Drawer";

import {
  checkAvailability,
} from "../../services/availability";

import {
  submitJob,
} from "../../services/tapis";


function JobSetupDrawer({
  open,
  onClose,
  jobSpec,
  onChange,
}) {
  const [
    checkingAvailability,
    setCheckingAvailability,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    submitSuccess,
    setSubmitSuccess,
  ] = useState(null);


  const validateForm = () => {
    if (!jobSpec.aoi) {
      return "Select at least one field first.";
    }

    if (!jobSpec.startDate) {
      return "Start date is required.";
    }

    if (!jobSpec.endDate) {
      return "End date is required.";
    }

    if (jobSpec.startDate > jobSpec.endDate) {
      return "Start date must be before end date.";
    }

    if (
      jobSpec.cloudMax < 0 ||
      jobSpec.cloudMax > 100
    ) {
      return "Cloud cover must be between 0 and 100.";
    }

    return "";
  };


  const runAvailability = async () => {
    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSubmitSuccess(null);
    setCheckingAvailability(true);

    try {
      const result =
        await checkAvailability(jobSpec);

      onChange({
        availability: result,
        selectedDates: [],
      });
    } catch {
      setError(
        "Availability service could not be reached."
      );
    } finally {
      setCheckingAvailability(false);
    }
  };


  const toggleScene = (date) => {
    const alreadySelected =
      jobSpec.selectedDates.includes(date);

    const nextDates = alreadySelected
      ? jobSpec.selectedDates.filter(
          (item) => item !== date
        )
      : [
          ...jobSpec.selectedDates,
          date,
        ];

    onChange({
      selectedDates: nextDates,
    });
  };


  const handleSubmit = async () => {
    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!jobSpec.availability) {
      setError(
        "Check satellite availability before submitting."
      );
      return;
    }

    if (
      !jobSpec.selectedDates ||
      jobSpec.selectedDates.length === 0
    ) {
      setError(
        "Select at least one available satellite scene."
      );
      return;
    }

    if (!jobSpec.outputName.trim()) {
      setError(
        "Output name is required."
      );
      return;
    }

    setError("");
    setSubmitSuccess(null);
    setSubmitting(true);

    try {
      const result =
        await submitJob(jobSpec);

      setSubmitSuccess(result);
    } catch {
      setError(
        "The job could not be submitted. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Job Setup"
      icon={SlidersHorizontal}
    >
      <section className="drawer-section">
        <div className="section-label">
          Selected Area
        </div>

        {!jobSpec.aoi ? (
          <div className="empty-state">
            No fields selected on the map yet.
          </div>
        ) : (
          <div className="selected-aoi">
            <strong>
              {jobSpec.aoi.label}
            </strong>

            <span>
              {jobSpec.aoi.n_features} field
              {jobSpec.aoi.n_features !== 1
                ? "s"
                : ""}{" "}
              · {jobSpec.aoi.area_km2} km²
            </span>
          </div>
        )}
      </section>


      <div className="date-grid">
        <label className="form-field">
          <span>
            Start Date
          </span>

          <input
            type="date"
            value={jobSpec.startDate}
            onChange={(event) =>
              onChange({
                startDate:
                  event.target.value,

                availability: null,
                selectedDates: [],
              })
            }
          />
        </label>


        <label className="form-field">
          <span>
            End Date
          </span>

          <input
            type="date"
            value={jobSpec.endDate}
            onChange={(event) =>
              onChange({
                endDate:
                  event.target.value,

                availability: null,
                selectedDates: [],
              })
            }
          />
        </label>
      </div>


      <label className="form-field">
        <span>
          Maximum Cloud Cover ·{" "}
          {jobSpec.cloudMax}%
        </span>

        <input
          type="range"
          min="0"
          max="100"
          value={jobSpec.cloudMax}
          onChange={(event) =>
            onChange({
              cloudMax:
                Number(
                  event.target.value
                ),

              availability: null,
              selectedDates: [],
            })
          }
        />
      </label>


      <button
        type="button"
        className="secondary-button full-width"
        disabled={checkingAvailability}
        onClick={runAvailability}
      >
        {checkingAvailability ? (
          <>
            <Loader2
              size={15}
              className="spinner"
            />

            Checking...
          </>
        ) : (
          <>
            <Satellite size={15} />

            Check Availability
          </>
        )}
      </button>


      {error && (
        <div className="form-error">
          {error}
        </div>
      )}


      {jobSpec.availability && (
        <section
          className="drawer-section availability-section"
        >
          <div className="section-label">
            Satellite Availability
          </div>

          <div className="availability-summary">
            <CheckCircle2 size={16} />

            {
              jobSpec.availability.count
            }{" "}
            usable scenes found
          </div>


          <div className="availability-grid">
            {jobSpec.availability.dates.map(
              (date) => {
                const selected =
                  jobSpec.selectedDates.includes(
                    date
                  );

                return (
                  <button
                    key={date}
                    type="button"
                    className={
                      selected
                        ? "availability-date availability-date-selected"
                        : "availability-date"
                    }
                    onClick={() =>
                      toggleScene(date)
                    }
                  >
                    {date}
                  </button>
                );
              }
            )}
          </div>


          <div className="availability-selection-summary">
            {
              jobSpec.selectedDates.length
            }{" "}
            scene
            {jobSpec.selectedDates.length !== 1
              ? "s"
              : ""}{" "}
            selected
          </div>
        </section>
      )}


      <label className="form-field">
        <span>
          Output Name
        </span>

        <input
          type="text"
          value={jobSpec.outputName}
          placeholder="ohio-spring-2026"
          onChange={(event) =>
            onChange({
              outputName:
                event.target.value,
            })
          }
        />
      </label>


      <div className="submit-section">
        <button
          type="button"
          className="primary-button full-width"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2
                size={16}
                className="spinner"
              />

              Submitting...
            </>
          ) : (
            <>
              Submit Collection Job

              <ChevronRight size={16} />
            </>
          )}
        </button>


        {submitSuccess && (
          <div className="submit-success">
            <CheckCircle2 size={16} />

            <div>
              <strong>
                Job submitted
              </strong>

              <span>
                Job ID: {submitSuccess.id}
              </span>
            </div>
          </div>
        )}


        <p>
          Review all settings. Nothing is
          submitted to Tapis until you click
          Submit.
        </p>
      </div>
    </Drawer>
  );
}

export default JobSetupDrawer;