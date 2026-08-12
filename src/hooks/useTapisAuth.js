import {
  useEffect,
  useState,
} from "react";

import {
  getSessionState,
  getSessionUser,
  subscribeToAuthChanges,
  verifyTapisSession,
} from "../services/auth";


/*
 * Tracks the Tapis session.
 *
 * A readable X-Tapis-Token cookie answers the question immediately.
 * When there is none the session is verified against Tapis, because
 * the token may be an HttpOnly or cross-domain cookie that this page
 * cannot see but the browser still sends.
 *
 * `blocked` is the only state that should disable publishing: it
 * means Tapis positively said there is no session.
 */
export function useTapisAuth() {
  const [session, setSession] = useState(() => ({
    state: getSessionState(),
    user: getSessionUser(),
    checking: true,
  }));

  useEffect(() => {
    let cancelled = false;

    const check = () =>
      verifyTapisSession().then((result) => {
        if (cancelled) {
          return;
        }

        setSession({
          state: result.state,
          user: result.user,
          checking: false,
        });
      });

    check();

    const unsubscribe = subscribeToAuthChanges(
      () => {
        check();
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    state: session.state,

    user: session.user,

    checking: session.checking,

    /* Signed in for certain. */
    authenticated:
      session.state === "authenticated",

    /* Known to have no session — the only reason to block. */
    blocked: session.state === "anonymous",
  };
}

export default useTapisAuth;
