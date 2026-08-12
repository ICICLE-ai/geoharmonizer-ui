/*
 * Tapis execution systems and their batch queues, read from the
 * Tapis Systems API.
 *
 * Unlike the availability and chat services, this one has no mock
 * path: the system and queue names have to be real for a job to land
 * anywhere, so an unreachable Tapis surfaces as an error the user can
 * retry rather than a plausible-looking fake list.
 *
 * Queues live on the system record. The list endpoint is asked for
 * every attribute, and `getSystemQueues` re-reads a single system so
 * a selection always carries that system's current queues.
 */

import {
  describeTokenSource,
  tapisFetch,
  TAPIS_TOKEN_COOKIE,
} from "./auth";

const TAPIS_API_URL =
  import.meta.env.VITE_TAPIS_API_URL ||
  "https://icicle.tapis.io";


async function tapisGet(path) {
  const response = await tapisFetch(
    `${TAPIS_API_URL}${path}`
  );

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    const source = describeTokenSource();

    if (!source.readable) {
      /*
       * The request went out without the header because the cookie
       * is not visible to scripts. Name the cookies the page can
       * see — that is usually enough to spot a renamed, HttpOnly or
       * wrong-domain token.
       */
      console.warn(
        `Tapis returned ${response.status} and no ${TAPIS_TOKEN_COOKIE} could be read from document.cookie.`,
        {
          expectedCookie: source.expectedCookie,
          visibleCookieNames:
            source.visibleCookieNames,
          hint: "The cookie is HttpOnly, set on another domain, or named differently — set VITE_TAPIS_TOKEN_COOKIE if it is just a different name.",
        }
      );

      throw new Error(
        `No ${TAPIS_TOKEN_COOKIE} cookie is readable from this page, so Tapis rejected the request.`
      );
    }

    throw new Error(
      "Tapis rejected the session token — sign in again."
    );
  }

  if (!response.ok) {
    throw new Error(
      `Tapis request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  return data.result;
}


function normalizeQueues(system) {
  return (system?.batchLogicalQueues || []).map(
    (queue) => ({
      name: queue.name,

      maxMinutes: queue.maxMinutes ?? null,

      maxNodeCount: queue.maxNodeCount ?? null,

      maxCoresPerNode:
        queue.maxCoresPerNode ?? null,

      maxMemoryMB: queue.maxMemoryMB ?? null,
    })
  );
}


/*
 * Tapis returns far more than the UI needs; keep the fields the run
 * configuration actually uses.
 */
function normalizeSystem(system) {
  return {
    id: system.id,

    host: system.host,

    description: system.description || "",

    defaultQueue:
      system.batchDefaultLogicalQueue || null,

    queues: normalizeQueues(system),
  };
}


/*
 * Every execution system the signed-in user can reach, sorted by id.
 */
export async function getExecutionSystems() {
  const result = await tapisGet(
    "/v3/systems?listType=ALL&search=(canExec.eq.true)&select=allAttributes&limit=1000"
  );

  return (result || [])
    .filter((system) => system.canExec)
    .map(normalizeSystem)
    .sort((a, b) => a.id.localeCompare(b.id));
}


/*
 * The batch queues defined on one system. Returns an empty list for
 * FORK systems, which legitimately have none.
 */
export async function getSystemQueues(systemId) {
  const system = await tapisGet(
    `/v3/systems/${encodeURIComponent(
      systemId
    )}?select=allAttributes`
  );

  return {
    queues: normalizeQueues(system),

    defaultQueue:
      system?.batchDefaultLogicalQueue || null,
  };
}
