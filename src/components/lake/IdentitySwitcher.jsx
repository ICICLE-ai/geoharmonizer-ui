import { AlertTriangle, UserCheck, UserCog } from "lucide-react";

import { DEV_IDENTITIES } from "../../services/lakeIdentity";

/*
 * Who the lake thinks you are.
 *
 * With a Tapis session this is a read-only display of the real
 * username from the token — there is deliberately nothing to pick,
 * because the owner recorded on an upload must be the person actually
 * signed in, not a selection.
 *
 * The persona dropdown appears only when there is no session at all.
 * It is labelled as a stand-in so it can never be mistaken for the
 * real thing, since it decides who owns anything uploaded while it is
 * in force.
 */

function IdentitySwitcher({ identity, onChange }) {
  if (identity.source === "tapis") {
    return (
      <div className="lake-identity">
        <div className="lake-identity-label">
          <UserCheck size={14} />

          <span>Signed in</span>

          <span className="lake-chip lake-chip-ok">tapis</span>
        </div>

        <div className="lake-identity-user">{identity.label}</div>

        <p className="lake-muted lake-identity-hint">
          Layers you upload are owned by this account.
        </p>
      </div>
    );
  }

  if (identity.source === "tapis-unnamed") {
    return (
      <div className="lake-identity">
        <div className="lake-identity-label">
          <AlertTriangle size={14} />

          <span>Session without a username</span>
        </div>

        <p className="lake-muted lake-identity-hint">
          {identity.description}
        </p>
      </div>
    );
  }

  return (
    <div className="lake-identity">
      <label className="lake-identity-label" htmlFor="lake-identity">
        <UserCog size={14} />

        <span>Identity</span>

        <span className="lake-chip lake-chip-dev">
          no tapis session
        </span>
      </label>

      <select
        id="lake-identity"
        value={identity.id ?? ""}
        onChange={(event) => {
          const next = DEV_IDENTITIES.find(
            (entry) => (entry.id ?? "") === event.target.value
          );

          onChange(next);
        }}
      >
        {DEV_IDENTITIES.map((entry) => (
          <option key={entry.label} value={entry.id ?? ""}>
            {entry.label}
          </option>
        ))}
      </select>

      <p className="lake-muted lake-identity-hint">
        {identity.description}
      </p>
    </div>
  );
}

export default IdentitySwitcher;
