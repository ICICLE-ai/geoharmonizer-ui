const USE_MOCK_SERVICES =
  import.meta.env.VITE_USE_MOCK_SERVICES !== "false";

const AVAILABILITY_API_URL =
  import.meta.env.VITE_AVAILABILITY_API_URL;

const MOCK_AVAILABILITY = {
  count: 8,
  dates: [
    "2026-04-04",
    "2026-04-11",
    "2026-04-26",
    "2026-05-03",
    "2026-05-19",
    "2026-06-02",
    "2026-06-14",
    "2026-06-27",
  ],
};

export async function checkAvailability(jobSpec) {
  if (
    USE_MOCK_SERVICES ||
    !AVAILABILITY_API_URL
  ) {
    await new Promise((resolve) =>
      setTimeout(resolve, 900)
    );

    return MOCK_AVAILABILITY;
  }

  // The availability service takes the selection's bbox directly —
  // a registered-AOI (aoi_id) lookup store is v1.1.
  const params = new URLSearchParams({
    bbox: (jobSpec.aoi?.bbox ?? [])
      .map((v) => Number(v.toFixed(6)))
      .join(","),

    start:
      jobSpec.startDate,

    end:
      jobSpec.endDate,

    cloud_max:
      String(jobSpec.cloudMax),
  });

  const response = await fetch(
    `${AVAILABILITY_API_URL}/availability?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      `Availability request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  return data;
}