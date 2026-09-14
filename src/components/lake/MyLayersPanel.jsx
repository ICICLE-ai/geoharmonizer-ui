import { useCallback, useEffect, useState } from "react";

import {
  AlertTriangle,
  Check,
  Globe,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

import {
  addLayerGrant,
  getLayerGrants,
  getMyLayers,
  revokeLayerGrant,
  setLayerVisibility,
} from "../../services/lake";

/*
 * The owner's view of their own layers, and the only place layer
 * permissions can be changed.
 *
 * "Shared" is a label here, not a stored value. The backend stores
 * visibility as public or private; a private layer with one or more
 * grants is shared. Inventing a third stored value would have meant
 * two things to keep in sync where the grant rows are already the
 * single source of truth about who can see what.
 */

const STATUS_LABEL = {
  pending: "queued",
  ingesting: "ingesting",
  ready: "ready",
  failed: "failed",
};


function ShareControls({ layer, onChanged }) {
  const [grants, setGrants] = useState(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getLayerGrants(layer.layer_id)
      .then((data) => setGrants(data.grants ?? []))
      .catch((err) => setError(err?.detail || err?.message));
  }, [layer.layer_id]);

  useEffect(() => load(), [load]);

  const act = async (fn) => {
    setBusy(true);
    setError(null);

    try {
      await fn();

      /*
       * Back to the loading state before refetching. Every read here
       * is a multi-second Iceberg scan, and leaving the stale list up
       * meanwhile means several seconds where a just-added user still
       * reads as "Nobody yet" — indistinguishable from the add having
       * silently failed.
       */
      setGrants(null);
      load();
      onChanged?.();
    } catch (err) {
      setError(err?.detail || err?.message || "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lake-share-block">
      <div className="lake-share-head">
        <Users size={13} />
        <span>Shared with</span>
      </div>

      {grants === null ? (
        <p className="lake-muted lake-inline-status">
          <Loader2 size={12} className="spin" /> Loading…
        </p>
      ) : grants.length === 0 ? (
        <p className="lake-muted">Nobody yet.</p>
      ) : (
        <ul className="lake-grant-list">
          {grants.map((grant) => (
            <li key={grant.grant_id}>
              <span>{grant.grantee_id}</span>

              <button
                type="button"
                className="icon-button"
                onClick={() =>
                  act(() =>
                    revokeLayerGrant(layer.layer_id, grant.grantee_id)
                  )
                }
                disabled={busy}
                aria-label={`Revoke ${grant.grantee_id}`}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="lake-share-add">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && username.trim()) {
              event.preventDefault();
              act(() =>
                addLayerGrant(layer.layer_id, username.trim())
              ).then(() => setUsername(""));
            }
          }}
        />

        <button
          type="button"
          className="lake-filter-option"
          disabled={busy || !username.trim()}
          onClick={() =>
            act(() => addLayerGrant(layer.layer_id, username.trim()))
              .then(() => setUsername(""))
          }
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/*
        * Worth saying plainly: there is no user directory to check a
        * name against yet, so a typo grants access to a username that
        * simply never matches anyone rather than erroring.
        */}
      <p className="lake-muted lake-res-note">
        Usernames are matched against each caller&apos;s identity and are
        not verified against a directory — a typo silently grants
        nobody.
      </p>

      {error ? <p className="lake-error-text">{error}</p> : null}
    </div>
  );
}


function MyLayersPanel({ identityId, onClose, refreshKey }) {
  const [state, setState] = useState({ status: "loading" });
  const [expanded, setExpanded] = useState(null);
  const [busyLayer, setBusyLayer] = useState(null);

  const load = useCallback(() => {
    getMyLayers()
      .then((data) => setState({ status: "ready", layers: data.layers ?? [] }))
      .catch((error) => setState({ status: "error", error }));
  }, []);

  useEffect(() => load(), [load, refreshKey, identityId]);

  const changeVisibility = async (layer, visibility) => {
    setBusyLayer(layer.layer_id);

    try {
      await setLayerVisibility(layer.layer_id, visibility);
      load();
    } finally {
      setBusyLayer(null);
    }
  };

  return (
    <aside className="lake-cell-panel">
      <div className="lake-cell-head">
        <div className="lake-panel-heading">
          <span>My layers</span>
        </div>

        <div className="lake-control-row">
          <button
            type="button"
            className="icon-button"
            onClick={load}
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close my layers"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {state.status === "loading" ? (
        <p className="lake-muted lake-inline-status">
          <Loader2 size={14} className="spin" /> Loading…
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="lake-error-text">
          {state.error?.detail || state.error?.message}
        </p>
      ) : null}

      {state.status === "ready" && state.layers.length === 0 ? (
        <p className="lake-muted">
          You have not uploaded any layers yet.
        </p>
      ) : null}

      {state.status === "ready"
        ? state.layers.map((layer) => {
            const isShared =
              layer.visibility === "private" &&
              layer.shared_with_count > 0;

            const status = layer.ingest_status;

            return (
              <div key={layer.layer_id} className="lake-panel-block">
                <div className="lake-layer-line">
                  <strong>
                    {layer.display_name || layer.layer_name}
                  </strong>

                  {status && status !== "ready" ? (
                    <span
                      className={`lake-chip ${
                        status === "failed"
                          ? "lake-chip-error"
                          : "lake-chip-warn"
                      }`}
                    >
                      {status === "failed" ? (
                        <AlertTriangle size={10} />
                      ) : (
                        <Loader2 size={10} className="spin" />
                      )}
                      {STATUS_LABEL[status] ?? status}
                    </span>
                  ) : null}
                </div>

                <div className="lake-layer-meta">
                  <code>{layer.layer_id}</code>
                </div>

                {layer.ingest_error ? (
                  <p className="lake-error-text">{layer.ingest_error}</p>
                ) : null}

                <div className="lake-control-row lake-visibility-row">
                  <button
                    type="button"
                    className={`lake-filter-option ${
                      layer.visibility === "private"
                        ? "lake-filter-option-active"
                        : ""
                    }`}
                    onClick={() => changeVisibility(layer, "private")}
                    disabled={busyLayer === layer.layer_id}
                  >
                    <Lock size={12} /> Private
                  </button>

                  <button
                    type="button"
                    className={`lake-filter-option ${
                      layer.visibility === "public"
                        ? "lake-filter-option-active"
                        : ""
                    }`}
                    onClick={() => changeVisibility(layer, "public")}
                    disabled={busyLayer === layer.layer_id}
                  >
                    <Globe size={12} /> Public
                  </button>

                  <button
                    type="button"
                    className={`lake-filter-option ${
                      expanded === layer.layer_id
                        ? "lake-filter-option-active"
                        : ""
                    }`}
                    onClick={() =>
                      setExpanded(
                        expanded === layer.layer_id
                          ? null
                          : layer.layer_id
                      )
                    }
                  >
                    <Users size={12} />
                    {isShared
                      ? `Shared · ${layer.shared_with_count}`
                      : "Share"}
                  </button>
                </div>

                {layer.visibility === "public" ? (
                  <p className="lake-muted lake-res-note">
                    <Check size={11} /> Anyone, including signed-out
                    visitors, can see this layer.
                  </p>
                ) : null}

                {expanded === layer.layer_id ? (
                  <ShareControls layer={layer} onChanged={load} />
                ) : null}
              </div>
            );
          })
        : null}
    </aside>
  );
}

export default MyLayersPanel;
