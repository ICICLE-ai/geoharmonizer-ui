# Security Policy

## Supported release

Security fixes are evaluated for the most recent tagged release and the default branch. The supported-release policy will be updated as the project establishes a release cadence.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or exposure of credentials, restricted data, or sensitive configuration. Report it privately to:

- Security contact: **Brijesh Nanda <brundayogananda.1@osu.edu>**
- Security contact: **Hari Subramoni <subramoni.1@osu.edu>**
- Backup contact: **[GitHub private security advisory](https://github.com/ICICLE-ai/geoharmonizer-ui/security/advisories/new)**

Include a concise description, affected version or commit, reproduction steps when safe to provide, potential impact, and any suggested mitigation.

## Maintainer response

Maintainers will acknowledge receipt, assess severity and scope, coordinate remediation, and determine whether a security advisory, patch release, configuration change, or documentation update is needed. The project does not promise a specific response time until maintainers adopt and resource one.

## Contributor security expectations

Contributors must not commit secrets, credentials, private certificates, proprietary data, restricted datasets, or malicious code. Contributions that add dependencies, services, data interfaces, workflow execution paths, or deployment configuration must identify the new dependency or trust boundary and any required credentials or permissions.

## Project-specific considerations

This is a browser-side single-page application. Two properties follow from that and apply to every contribution:

- **`VITE_*` values are public.** Vite inlines them into the JavaScript bundle at build time (see the `ARG` list in the [Dockerfile](Dockerfile)), so anyone who loads the site can read them. Never introduce a `VITE_*` variable that carries an API key, client secret, or other credential. Values in [.env.example](.env.example) — tenant URLs, the Slurm account, the token cookie name — are configuration, not secrets, and should stay that way.
- **The Tapis JWT is read from a cookie and is never persisted by this application.** [src/services/auth.js](src/services/auth.js) is the only module that reads it, and every outbound Tapis call goes through `tapisFetch` so the token travels only as the request header. Do not add code that copies the token into `localStorage`, `sessionStorage`, IndexedDB, a URL query string, a log line, or a request to any host other than the configured Tapis tenant. `describeTokenSource()` deliberately reports cookie *names* only — keep it that way.

Uploaded geospatial files are parsed entirely in the browser and cached in IndexedDB. A change to file parsing, layer caching, or map rendering should state how it behaves on malformed or hostile input, and should not widen what is persisted on the user's machine beyond the layer geometry already cached there.
