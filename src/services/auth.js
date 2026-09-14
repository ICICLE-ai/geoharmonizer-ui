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
 * THE COOKIE MUST BE READABLE. There is no fallback that recovers
 * either case, in development or production:
 *
 *   · Tapis is called cross-origin (nginx serves this SPA as static
 *     files and proxies nothing), so a cookie scoped to this app's own
 *     domain is never sent to icicle.tapis.io no matter what.
 *   · `credentials: "include"` cannot help either — Tapis answers with
 *     `Access-Control-Allow-Origin: *` AND
 *     `Access-Control-Allow-Credentials: true`, a pair the CORS spec
 *     forbids, so the browser rejects every credentialed response
 *     before this code sees it. See tapisFetch().
 *
 * So the token travels as the `X-Tapis-Token` HEADER, read from a
 * JS-readable cookie (any spelling — see normaliseCookieName) or, for
 * local development only, from VITE_TAPIS_TOKEN.
 *
 * `describeTokenSource()` reports which cookies the page can actually
 * see — names only, never values — so a 401 can be told apart from
 * "the cookie is there but HttpOnly".
 */

/*
 * Which COOKIE to read the token out of. Configurable because portals
 * name it differently — and matched loosely besides (see
 * normaliseCookieName), so this rarely needs setting at all.
 */
export const TAPIS_TOKEN_COOKIE =
  import.meta.env.VITE_TAPIS_TOKEN_COOKIE ||
  "X-Tapis-Token";

/*
 * Which HEADER to send it in. NOT configurable, and deliberately
 * separate from the cookie name above.
 *
 * Tapis accepts exactly this header — its CORS preflight allows
 * `x-tapis-token` and nothing else token-shaped. Deriving the header
 * from the cookie setting (as this module used to) meant that pointing
 * VITE_TAPIS_TOKEN_COOKIE at a portal cookie called, say,
 * `tapis-token` would ALSO rename the outgoing header to `tapis-token`
 * — which Tapis ignores and which the browser then blocks for not
 * being in Access-Control-Allow-Headers. Two different names for two
 * different things.
 */
export const TAPIS_TOKEN_HEADER = "X-Tapis-Token";

export const TAPIS_API_URL =
  import.meta.env.VITE_TAPIS_API_URL ||
  "https://icicle.tapis.io";


/*
 * Cookie names are compared with separators and case removed, so one
 * entry covers every spelling a portal might use:
 *
 *   "tapistoken"  matches  X-Tapis-Token, x-tapis-token, tapis-token,
 *                          tapis_token, tapisToken, TAPIS_TOKEN
 *
 * An earlier literal list missed `tapis-token` — the hyphenated form
 * without the X- prefix — which is why this normalises instead of
 * enumerating. The same matching runs in development and production;
 * there is no environment-specific path to get out of step.
 */
function normaliseCookieName(name) {
  return String(name).toLowerCase().replace(/[-_\s]/g, "");
}

/*
 * Normalised names that mean "the Tapis JWT". `accesstoken` is last
 * and deliberately broad — it is a generic name another service could
 * also be using, so it is only consulted after the specific ones.
 */
const FALLBACK_COOKIE_NAMES = [
  "xtapistoken",
  "tapistoken",
  "accesstoken",
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
 * Pulls an access token out of a decoded JSON cookie.
 *
 * Not every portal stores the bare JWT. A `tapis-token` cookie
 * commonly holds the whole token RESPONSE instead, and Tapis nests it
 * a level deeper than most:
 *
 *   {"access_token": "eyJ..."}
 *   {"access_token": {"access_token": "eyJ...", "expires_at": "..."}}
 *
 * Sending that object as the header fails in a thoroughly confusing
 * way — Tapis just answers 401, exactly as it would for no token at
 * all — so the token is dug out here rather than at each call site.
 */
function extractAccessToken(value, depth = 0) {
  if (typeof value === "string") {
    return value;
  }

  /* Bounded so a self-referential or pathological object cannot spin. */
  if (!value || typeof value !== "object" || depth > 4) {
    return null;
  }

  for (const key of ["access_token", "accessToken", "token", "jwt"]) {
    if (key in value) {
      const found = extractAccessToken(value[key], depth + 1);

      if (found) {
        return found;
      }
    }
  }

  return null;
}


/*
 * Tokens arrive in several shapes: bare, quoted, still carrying a
 * `Bearer ` scheme, or wrapped in a JSON token response.
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

  value = value.trim();

  /* A JSON cookie: take the token out before any string tidying, so
   * the braces are never mistaken for part of the value. */
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const extracted = extractAccessToken(JSON.parse(value));

      if (extracted) {
        value = extracted.trim();
      }
    } catch {
      /* Not JSON after all — fall through and treat it as a string. */
    }
  }

  value = value.replace(/^"|"$/g, "");

  value = value.replace(/^Bearer\s+/i, "");

  return value || null;
}


/*
 * A token supplied directly for local development.
 *
 * The portal sets the real cookie on ITS domain, so a dev server on
 * localhost never receives one and every Tapis call fails with a bare
 * 401 that looks like a code fault rather than "you are not signed in
 * here". Setting VITE_TAPIS_TOKEN in .env gives local development the
 * same session the deployed app gets from the cookie.
 *
 * Build-time only, and never a production mechanism: VITE_* values are
 * inlined into the bundle, so a token set here ships to every visitor.
 * Leave it unset anywhere real.
 */
const DEV_TAPIS_TOKEN = cleanToken(
  import.meta.env.VITE_TAPIS_TOKEN
);


/*
 * The token, or null when there is no usable one. Cookie names are
 * matched with case and separators ignored, so a portal naming it
 * `tapis-token`, `TAPIS_TOKEN` or `tapisToken` all resolve.
 */
export function readTapisToken() {
  const entries = cookieEntries();

  /* The configured name first, then the known spellings — all compared
   * with separators and case stripped. */
  const wanted = [
    normaliseCookieName(TAPIS_TOKEN_COOKIE),
    ...FALLBACK_COOKIE_NAMES,
  ];

  for (const candidate of wanted) {
    const match = entries.find(
      (entry) => normaliseCookieName(entry.name) === candidate
    );

    const token = cleanToken(match?.value);

    if (token) {
      return token;
    }
  }

  /* Cookie first — a real session always wins over the dev override. */
  return DEV_TAPIS_TOKEN || null;
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
 * The token travels as the X-Tapis-Token header, which is the only
 * form Tapis accepts cross-origin. With no readable token the request
 * still goes out — and comes back 401, which callers report — rather
 * than being blocked by the browser with no explanation. See the
 * credentials note below.
 */
export function tapisFetch(url, options = {}) {
  const token = readTapisToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers[TAPIS_TOKEN_HEADER] = token;
  }

  /*
   * Never "include", even with no token.
   *
   * Tapis answers with BOTH `Access-Control-Allow-Origin: *` and
   * `Access-Control-Allow-Credentials: true`. That pair is invalid per
   * the CORS spec: a credentialed request requires a specific origin,
   * never the wildcard. So a credentials:"include" request to Tapis is
   * rejected by the browser before the response is ever exposed —
   * every call fails with an opaque "Failed to fetch" regardless of
   * whether the user is signed in.
   *
   * Sending the token as a header instead works cross-origin (Tapis
   * lists x-tapis-token in Access-Control-Allow-Headers), and dropping
   * credentials means a request without one at least REACHES Tapis and
   * comes back as an honest 401 that can be reported.
   *
   * The cost: an HttpOnly cookie the page cannot read can no longer be
   * attached by the browser either. That path never worked here
   * anyway — it was blocked by the same CORS conflict.
   */
  return fetch(url, {
    ...options,

    headers,

    credentials: options.credentials ?? "same-origin",
  });
}


/*
 * Kept for the older call sites that only need the header.
 */
export function tapisAuthHeaders() {
  const token = readTapisToken();

  return token
    ? {
        [TAPIS_TOKEN_HEADER]: token,
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


/*
 * The username carried inside a Tapis JWT.
 *
 * The payload is read WITHOUT verifying the signature, and that is
 * deliberate: this value is used only to label the session and to
 * attribute an upload's owner. Nothing is authorised on the strength
 * of it — the API re-derives identity server-side, and once auth.py
 * validates real JWTs it will reject a forged one regardless of what
 * this function displayed.
 *
 * Tapis v3 puts it in the `tapis/username` claim; `sub` is the
 * fallback for a token shaped differently.
 */
export function usernameFromToken(token = readTapisToken()) {
  if (!token) {
    return null;
  }

  const payload = token.split(".")[1];

  if (!payload) {
    return null;
  }

  try {
    /* base64url -> base64, then pad to a multiple of 4. */
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );

    const claims = JSON.parse(atob(padded));

    return (
      claims["tapis/username"] ??
      claims.username ??
      claims.sub ??
      null
    );
  } catch {
    /* A token we cannot parse is still a token — the session stands,
     * we just cannot name the user from it. */
    return null;
  }
}


export function getSessionUser() {
  /*
   * Prefer the token when it is readable. verifyTapisSession() only
   * reaches the userinfo call when the cookie is NOT readable, so
   * without this the common case (a readable cookie) would report an
   * authenticated session with no username at all.
   */
  return usernameFromToken() ?? sessionUser;
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
  const token = readTapisToken();

  if (token !== null) {
    sessionState = "authenticated";
    sessionUser = usernameFromToken(token) ?? sessionUser;

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
