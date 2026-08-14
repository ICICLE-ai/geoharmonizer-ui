const USE_MOCK_SERVICES =
  import.meta.env.VITE_USE_MOCK_SERVICES !== "false";

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL;

// The assist service speaks the RELEASE_V1_MVP_DESIGN §4 contract:
//   POST {CHAT_API_URL}/assist  {message, form, session_id}
//     -> {reply, field_suggestions, warnings, missing, tier}
// It is stateless and uses snake_case FormState keys; the UI's jobSpec is
// camelCase, so translate on the way out and back in.

function toFormState(jobSpec) {
  return {
    // any truthy selection counts as "aoi set" for the assistant's
    // missing-fields logic; the real geometry never travels to chat
    aoi_id: jobSpec.aoi ? "ui-selection" : null,
    window_start: jobSpec.startDate || null,
    window_end: jobSpec.endDate || null,
    cloud_max: jobSpec.cloudMax ?? null,
    // site is server-derived in this UI (backend defaults it from the
    // AOI+window); satisfy the assistant's required-field check
    site: "adhoc",
  };
}

const SUGGESTION_KEYS = {
  window_start: "startDate",
  window_end: "endDate",
  cloud_max: "cloudMax",
  // site suggestions are dropped: this UI derives the site server-side
};

function toUiSuggestions(fieldSuggestions) {
  const out = {};
  for (const [key, value] of Object.entries(fieldSuggestions || {})) {
    const uiKey = SUGGESTION_KEYS[key];
    if (uiKey) out[uiKey] = value;
    // cadence / sources have no form control yet — surfaced in the reply only
  }
  return out;
}

export async function sendChatMessage({ sessionId, message, formState }) {
  if (USE_MOCK_SERVICES || !CHAT_API_URL) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return {
      reply:
        "I can update the collection settings to match your request. Review the suggested changes below.",
      field_suggestions: {
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        cloudMax: 20,
      },
      warnings: [],
      tier: "mock",
    };
  }

  const response = await fetch(`${CHAT_API_URL}/assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      message,
      form: toFormState(formState),
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }

  const data = await response.json();
  return {
    reply: data.reply,
    field_suggestions: toUiSuggestions(data.field_suggestions),
    warnings: data.warnings || [],
    missing: data.missing || [],
    tier: data.tier,
  };
}
