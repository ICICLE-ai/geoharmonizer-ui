export async function checkAvailability(
  jobSpec
) {
  console.log(
    "Mock availability request:",
    jobSpec
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 900)
  );

  return {
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
}