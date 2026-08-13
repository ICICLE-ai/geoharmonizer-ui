/*
 * Tapis authentication.
 *
 * The session is carried by an `X-Tapis-Token` cookie set by the
 * portal that hosts this UI. This module is the only place that reads
 * it, so everything else can ask "are we signed in?" without knowing
 * where the token lives, and every outbound call goes through
 * `tapisFetch` so the header is never forgotten.
 *
 * Two situations make the cookie unreadable from JavaScript, and both
 * look identical from here — `document.cookie` simply does not
 * contain it:
 *
 *   - the cookie is marked HttpOnly
 *   - the cookie belongs to a different domain than this page
 *
 * In that case `tapisFetch` falls back to `credentials: "include"`,
 * which lets the browser attach the cookie itself on same-site or
 * properly CORS-configured cross-site calls. `describeTokenSource()`
 * reports which path is in play so a 401 can be diagnosed.
 */

export const TAPIS_TOKEN_COOKIE =
  import.meta.env.VITE_TAPIS_TOKEN_COOKIE ||
  "X-Tapis-Token";

export const TAPIS_API_URL =
  import.meta.env.VITE_TAPIS_API_URL ||
  "https://icicle.tapis.io";


/* Names that portals commonly use for the same token. */
const FALLBACK_COOKIE_NAMES = [
  "x-tapis-token",
  "tapis_token",
  "tapisToken",
  "access_token",
];


function cookieEntries() {
  if (typeof document === "undefined") {
    return [];
  }

  return (document.cookie || "")
    .split(";")
    .map((entry) => {
      const separator = entry.indexOf("=");

      if (separator === -1) {
        return null;
      }

      return {
        name: entry.slice(0, separator).trim(),

        value: entry.slice(separator + 1).trim(),
      };
    })
    .filter(Boolean);
}


/*
 * Tokens sometimes arrive quoted, or with the scheme still attached
 * when a portal reuses an Authorization value.
 */
function cleanToken(raw) {
  if (!raw) {
    return null;
  }

  let value = raw;

  try {
    value = decodeURIComponent(raw);
  } catch {
    /* A token that will not decode is still a token. */
  }

  value = value.trim().replace(/^"|"$/g, "");

  value = value.replace(/^Bearer\s+/i, "");

  return value || null;
}


/*
 * Returns the token, or null when there is no usable one.
 * Cookie names are matched case-insensitively, since proxies are not
 * always consistent about the header-style casing.
 */
export function readTapisToken() {
  const entries = cookieEntries();

  const wanted = [
    TAPIS_TOKEN_COOKIE.toLowerCase(),
    ...FALLBACK_COOKIE_NAMES.map((name) =>
      name.toLowerCase()
    ),
  ];

  for (const candidate of wanted) {
    const match = entries.find(
      (entry) =>
        entry.name.toLowerCase() === candidate
    );

    const token = cleanToken(match?.value);

    if (token) {
      return token;
    }
  }

  return null;
}


/*
 * Debugging aid for exactly the case that brought you here: a 401
 * with no token on the request. Reports the cookie names the page can
 * see — names only, never values.
 */
export function describeTokenSource() {
  const names = cookieEntries().map(
    (entry) => entry.name
  );

  return {
    expectedCookie: TAPIS_TOKEN_COOKIE,

    readable: readTapisToken() !== null,

    visibleCookieNames: names,

    /*
     * No cookies at all on a page that should have a session is the
     * signature of an HttpOnly or cross-domain cookie.
     */
    likelyHttpOnlyOrCrossDomain:
      readTapisToken() === null,
  };
}


/*
 * Every Tapis request goes through here.
 *
 * When the token is readable it travels as the X-Tapis-Token header.
 * When it is not, the request is sent with credentials so the browser
 * can attach the cookie itself — that is the only way an HttpOnly
 * token ever reaches Tapis from a browser.
 */
export function tapisFetch(url, options = {}) {
  const token = readTapisToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers[TAPIS_TOKEN_COOKIE] = token;
  }

  return fetch(url, {
    ...options,

    headers,

    credentials: token
      ? options.credentials ?? "same-origin"
      : "include",
  });
}


/*
 * Kept for the older call sites that only need the header.
 */
export function tapisAuthHeaders() {
  const token = readTapisToken();

  return token
    ? {
        [TAPIS_TOKEN_COOKIE]: token,
      }
    : {};
}


/*
 * Session state.
 *
 * A readable cookie proves a session exists, but an unreadable one
 * proves nothing — the token may still be travelling as an HttpOnly
 * cookie. So the source of truth is Tapis itself:
 *
 *   "authenticated" — a readable token, or userinfo answered
 *   "anonymous"     — userinfo answered 401/403: there is no session
 *   "unknown"       — userinfo could not be reached at all
 *
 * "unknown" must not block publishing. Refusing to submit because a
 * side-channel check failed strands users who are in fact signed in;
 * the submit call itself is the authority, and it will fail loudly.
 */
let sessionState = "unknown";
let sessionUser = null;


export function getSessionState() {
  if (readTapisToken() !== null) {
    return "authenticated";
  }

  return sessionState;
}


export function getSessionUser() {
  return sessionUser;
}


/*
 * True unless we positively know there is no session.
 */
export function isAuthenticated() {
  return getSessionState() !== "anonymous";
}


export function hasVerifiedSession() {
  return getSessionState() === "authenticated";
}


/*
 * Asks Tapis who the caller is. Works for both credential paths: the
 * header when the token is readable, the cookie when it is not.
 */
export async function verifyTapisSession() {
  if (readTapisToken() !== null) {
    sessionState = "authenticated";

    return {
      state: sessionState,
      user: sessionUser,
    };
  }

  try {
    const response = await tapisFetch(
      `${TAPIS_API_URL}/v3/oauth2/userinfo`
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      sessionState = "anonymous";
      sessionUser = null;
    } else if (response.ok) {
      const data = await response
        .json()
        .catch(() => null);

      sessionState = "authenticated";

      sessionUser =
        data?.result?.username ?? null;
    } else {
      sessionState = "unknown";
    }
  } catch {
    /* Network or CORS failure — we simply do not know. */
    sessionState = "unknown";
  }

  return {
    state: sessionState,
    user: sessionUser,
  };
}


/*
 * Calls `listener` whenever the token may have changed.
 *
 * Cookies do not fire events everywhere, so this uses the Cookie
 * Store API when the browser has it and otherwise re-checks when the
 * tab regains focus — which covers signing in on another tab.
 */
export function subscribeToAuthChanges(listener) {
  const cleanups = [];

  if (typeof window === "undefined") {
    return () => {};
  }

  if (window.cookieStore?.addEventListener) {
    const onChange = () => listener();

    window.cookieStore.addEventListener(
      "change",
      onChange
    );

    cleanups.push(() =>
      window.cookieStore.removeEventListener(
        "change",
        onChange
      )
    );
  }

  const onFocus = () => listener();

  const onVisibility = () => {
    if (!document.hidden) {
      listener();
    }
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener(
    "visibilitychange",
    onVisibility
  );

  cleanups.push(() => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener(
      "visibilitychange",
      onVisibility
    );
  });

  return () => cleanups.forEach((stop) => stop());
}
