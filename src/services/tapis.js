const mockJobs = [
  {
    id: "J-2201",
    name: "Ohio Spring Collection",
    status: "running",
    meta: "2 fields · Apr–Jun 2026",
    time: "10:42 AM",
  },
  {
    id: "J-2198",
    name: "Madison County",
    status: "complete",
    meta: "4 fields · May 2026",
    time: "Yesterday",
  },
  {
    id: "J-2194",
    name: "Pickaway Farm",
    status: "failed",
    meta: "1 field · Jun 2026",
    time: "Aug 9",
  },
];


export async function submitJob(jobSpec) {
  console.log("Mock Tapis submit:", jobSpec);

  await new Promise((resolve) =>
    setTimeout(resolve, 1200)
  );

  const id =
    `J-MOCK-${String(mockJobs.length + 1).padStart(
      3,
      "0"
    )}`;

  const newJob = {
    id,

    name:
      jobSpec.outputName ||
      "Untitled Collection",

    status: "running",

    meta:
      `${jobSpec.aoi?.n_features ?? 0} field${
        jobSpec.aoi?.n_features === 1
          ? ""
          : "s"
      } · ${formatDateRange(
        jobSpec.startDate,
        jobSpec.endDate
      )}`,

    time: "Just now",

    jobSpec,
  };

  mockJobs.unshift(newJob);

  return {
    id,
    status: "submitted",
    message: "Job submitted successfully.",
  };
}


export async function getJobs() {
  await new Promise((resolve) =>
    setTimeout(resolve, 250)
  );

  return [...mockJobs];
}


function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return "No date range";
  }

  const start = new Date(
    `${startDate}T00:00:00`
  );

  const end = new Date(
    `${endDate}T00:00:00`
  );

  const startMonth =
    start.toLocaleString("en-US", {
      month: "short",
    });

  const endMonth =
    end.toLocaleString("en-US", {
      month: "short",
    });

  const year =
    end.getFullYear();

  if (
    start.getFullYear() ===
      end.getFullYear() &&
    start.getMonth() ===
      end.getMonth()
  ) {
    return `${startMonth} ${year}`;
  }

  if (
    start.getFullYear() ===
    end.getFullYear()
  ) {
    return `${startMonth}–${endMonth} ${year}`;
  }

  return `${startMonth} ${start.getFullYear()}–${endMonth} ${end.getFullYear()}`;
}