/*
 * Lake identity — the ONLY module that knows the query API's auth
 * headers exist.
 *
 * Identity now comes from the Tapis session the rest of this app
 * already uses: the X-Tapis-Token cookie, whose JWT carries the
 * username (see auth.js). That username is what the lake records as a
 * layer's owner, so an upload is attributed to the real signed-in
 * person rather than a stand-in persona.
 *
 * WHAT IS STILL TEMPORARY
 *
 *   The transport is not. The username travels to the query API as an
 *   unverified `X-User-Id` header, because that is what the API
 *   currently trusts (see its auth.py). Anyone can still forge that
 *   header with curl — the token is read here for the NAME, not as
 *   proof of anything.
 *
 *   When the API validates real JWTs, `authHeaders()` changes to send
 *   `Authorization: Bearer <token>` and nothing else in the UI moves.
 *   That is the whole reason header construction lives in one file.
 *
 * DEV FALLBACK
 *
 *   With no Tapis session there is no username, and without one the
 *   lake cannot attribute an upload to anybody. Rather than making
 *   uploads untestable locally, a small set of dev personas stands in —
 *   but only when no real session exists, and the UI labels it as
 *   such.
 */

import {
  getSessionUser,
  readTapisToken,
  subscribeToAuthChanges,
} from "./auth";

const STORAGE_KEY = "geoharmonizer-lake-identity";

/*
 * Stand-ins used ONLY when there is no Tapis session. These are not
 * credentials and grant nothing on their own — the API simply believes
 * the header today.
 */
export const DEV_IDENTITIES = [
  {
    id: null,
    label: "Anonymous",
    groups: [],
    description: "No headers sent. Public layers only.",
  },
  {
    id: "researcher",
    label: "Researcher",
    groups: ["researchers"],
    description: "Stand-in identity — no Tapis session.",
  },
  {
    id: "admin",
    label: "Admin",
    groups: ["researchers", "admin"],
    description: "Stand-in identity — no Tapis session.",
  },
];

export const ANONYMOUS = DEV_IDENTITIES[0];


function readStoredDevIdentity() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return ANONYMOUS;
    }

    const saved = JSON.parse(raw);

    return (
      DEV_IDENTITIES.find((entry) => entry.id === saved.id) ?? ANONYMOUS
    );
  } catch {
    return ANONYMOUS;
  }
}

let devIdentity = readStoredDevIdentity();


/*
 * The identity in force: the Tapis user when there is a session,
 * otherwise whichever dev persona is selected.
 *
 * `source` is what the UI uses to say which of the two it is showing —
 * presenting a stand-in persona as though it were a real signed-in
 * user would be a lie about who owns what gets uploaded.
 */
export function getIdentity() {
  const username = getSessionUser();

  if (username) {
    return {
      id: username,
      label: username,
      /*
       * Tapis groups are not in the token's standard claims, so no
       * group membership is claimed here rather than inventing one.
       * Grants are per-user today, which this covers.
       */
      groups: [],
      description: "Signed in with Tapis.",
      source: "tapis",
    };
  }

  /* A session may exist whose username we could not read. */
  if (readTapisToken()) {
    return {
      id: null,
      label: "Tapis session",
      groups: [],
      description:
        "Signed in, but the token carries no readable username — " +
        "uploads need one.",
      source: "tapis-unnamed",
    };
  }

  return { ...devIdentity, source: "dev" };
}


const listeners = new Set();

export function subscribeIdentity(listener) {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

function notify() {
  const current = getIdentity();

  for (const listener of listeners) {
    listener(current);
  }
}

/* A Tapis sign-in or sign-out changes who we are without this module
 * being told directly. */
subscribeToAuthChanges(notify);


/*
 * Select a dev persona. Ignored while a Tapis session is present —
 * a real session is not something a picker should be able to override.
 */
export function setIdentity(identity) {
  devIdentity = identity ?? ANONYMOUS;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ id: devIdentity.id })
    );
  } catch {
    /* Private-mode storage failures must not break identity switching. */
  }

  notify();
}


/*
 * The headers for the current identity.
 *
 * This is the seam. A real implementation returns
 * `{ Authorization: "Bearer <jwt>" }` here and every call site keeps
 * working unchanged.
 */
export function authHeaders() {
  const identity = getIdentity();

  if (!identity.id) {
    return {};
  }

  const headers = { "X-User-Id": identity.id };

  if (identity.groups.length > 0) {
    headers["X-User-Groups"] = identity.groups.join(",");
  }

  return headers;
}
