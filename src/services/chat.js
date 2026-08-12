import {
  tapisFetch,
} from "./auth";

const USE_MOCK_SERVICES =
  import.meta.env.VITE_USE_MOCK_SERVICES !== "false";

const CHAT_API_URL =
  import.meta.env.VITE_CHAT_API_URL;

export async function sendChatMessage({
  sessionId,
  message,
  formState,
}) {
  if (
    USE_MOCK_SERVICES ||
    !CHAT_API_URL
  ) {
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

  const response = await tapisFetch(
    `${CHAT_API_URL}/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        session_id:
          sessionId,

        message,

        form_state:
          formState,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Chat request failed with status ${response.status}`
    );
  }

  return response.json();
}