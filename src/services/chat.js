export async function sendChatMessage({
  sessionId,
  message,
  formState,
}) {
  console.log(
    "Mock chat request:",
    {
      sessionId,
      message,
      formState,
    }
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 650)
  );

  return {
    reply:
      "I can update the collection settings to match your request. Review the suggested changes below.",

    field_suggestions: {
      startDate:
        "2026-04-01",

      endDate:
        "2026-06-30",

      cloudMax: 20,
    },
  };
}