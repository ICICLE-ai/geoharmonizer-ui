# Release Notes

## v0.1.0 — Alpha (2026-08-20)

First tagged release of Earth Data Hub, the browser interface for selecting a
geospatial area of interest, checking satellite scene availability, and
submitting GeoHarmonizer collection jobs to Tapis-managed HPC systems.

This is an **alpha release** (`status: AlphaRelease` in
[`component.yaml`](../component.yaml)). Interfaces, job arguments, and
configuration may change without a deprecation period.

<!-- Fill these two in at tag time. -->
| Field | Value |
| --- | --- |
| Tag | `v0.1.0` |
| Source commit | `<sha>` |
| Image | `<registry>/geoharmonizer-ui:v0.1.0` (linux/amd64) |

### Capabilities

- **Boundary upload and AOI selection.** Reads GeoJSON (`.geojson`, `.json`),
  Shapefile (a `.zip` bundle or loose `.shp` + `.dbf` + `.prj`), and GeoPackage
  (`.gpkg`). Files are parsed entirely in the browser; layers are cached in
  IndexedDB so a reload keeps the uploaded boundary. A selected field or polygon
  becomes the AOI, as either a bounding box or its exact geometry.
- **Satellite availability.** Sends the selection to the GeoHarmonizer
  availability service (backed by Earth Search STAC) and reports usable scene
  count and acquisition dates before a job is submitted.
- **Geospatial assistant.** Chat interface against the GeoHarmonizer assist
  service, which can suggest values for job-setup fields. Hidden unless a chat
  service is configured.
- **Tapis job submission.** Builds a `geoharmonizer-collect` job from the AOI and
  collection settings, reads execution systems and batch queues from the Tapis
  tenant, and submits through the Tapis Jobs API. Configurable date window, cloud
  cover maximum, scene cap, output EPSG, Sentinel-2 band selection, solar-day
  grouping, dry run, and per-job resources (queue, minutes, memory, nodes, cores).
- **Job monitoring.** A Jobs page listing submitted collection jobs with their
  current status, filters, and manual refresh.
- **Container deployment.** nginx image serving the built SPA on port 5000, the
  port Tapis Pods route to, overridable at run time with `-e PORT=...`.

### Defaults

The form starts at values chosen for the ICICLE tenant: execution system
`pitzer-tapis`, queue `cpu`, EPSG 32617, bands red/green/blue/nir, cloud maximum
20%, 50 scenes, 120 minutes, 8000 MB, 1 node, 8 cores. Deployments on another
tenant should expect to change the system and queue.

### Requirements

| Dependency | Version or detail |
| --- | --- |
| Tapis tenant | `VITE_TAPIS_API_URL`, default `https://icicle.tapis.io` |
| Tapis app | `geoharmonizer-collect` version `1.0.0`, registered in the tenant |
| Availability service | GeoHarmonizer STAC availability service, `VITE_AVAILABILITY_API_URL` |
| Assist service | GeoHarmonizer assist service, `VITE_CHAT_API_URL` (optional) |
| Slurm allocation | `VITE_SLURM_ACCOUNT`, sent as `-A <account>` |
| Node.js (build only) | 22 |

An active Tapis session is required for job submission. The application reads the
Tapis JWT from a cookie (`VITE_TAPIS_TOKEN_COOKIE`, default `X-Tapis-Token`); it
does not sign users in itself and never persists the token.

### Breaking changes

None. This is the first tagged release.

### Known limitations

- **Mock services are on unless explicitly disabled.** The build reads
  `VITE_USE_MOCK_SERVICES` as false *only* when it is the exact string `"false"`.
  A production image built without `--build-arg VITE_USE_MOCK_SERVICES=false`
  serves canned availability results and a canned assistant.
- **`VITE_*` values are inlined into the public bundle** at build time and are
  readable by anyone who loads the site. None of them may hold a credential —
  see [SECURITY.md](../SECURITY.md). They cannot be changed on a running
  container; a change means a rebuild.
- The assistant is hidden unless `VITE_CHAT_API_URL` is set, or mocks were asked
  for explicitly.
- Job submission depends on `geoharmonizer-collect:1.0.0` being registered in the
  tenant; the interface does not verify this before submitting.
- Uploaded files are parsed in browser memory, so very large boundaries are
  limited by the browser rather than by any configured cap.
- Supported browsers are not yet formally established. Development and manual
  verification were done on current desktop Chrome and Firefox; mobile layouts
  are untested.
- The container exposes no dedicated health endpoint and declares no
  `HEALTHCHECK`. Serving `/` with HTTP 200 is the health signal.
- The interface covers the collection stage only. Harmonization behaviour belongs
  to `geoharmonizer-collect` and its own repository.

### Known test gaps

**There is no automated test suite.** No unit, integration, or end-to-end tests
exist in this repository, and none run in CI. This is a deliberate deferral
recorded in [docs/TESTING.md](TESTING.md); a suite will be added later and will
become a blocking CI gate then.

What CI verifies on every pull request and every push to `main`:

- `npm ci`, `npm run lint`, and `npm run build` succeed.
- The linux/amd64 container image builds, answers HTTP 200 on port 5000 and on an
  overridden `PORT`, and serves the single-page deep-link fallback. This is a
  smoke gate, not a test suite — it never loads the page in a browser.
- Required project files exist, and every `VITE_*` variable read in `src/` is
  documented in `.env.example`.
- gitleaks and TruffleHog secret scans.

Not verified by anything automated, and therefore verified only by hand for this
release: application rendering and behaviour in a browser, the chat, availability,
and Tapis paths against live services, job submission against a real tenant,
dependency vulnerabilities, and the published image itself. Nothing runs on a tag
push, so this release commit was covered by its `main`-branch run.

Manual verification records live in [docs/user-tests/](user-tests/).

### Rollback

This is the first release, so there is no previous image tag to roll back to.
Rolling back means removing the pod or stopping the deployment. From the next
release onward, roll back by redeploying the previous immutable image tag
recorded in these notes.

### Deployment

Build for the cluster's architecture and supply the real tenant values; see the
deployment section of the [README](../README.md) and
[docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

```bash
docker buildx build --platform linux/amd64 \
  --build-arg VITE_USE_MOCK_SERVICES=false \
  --build-arg VITE_TAPIS_API_URL=https://icicle.tapis.io \
  --build-arg VITE_SLURM_ACCOUNT=<account> \
  --build-arg VITE_AVAILABILITY_API_URL=https://<availability-host> \
  --build-arg VITE_CHAT_API_URL=https://<assist-host> \
  -t <registry>/geoharmonizer-ui:v0.1.0 --push .
```

A 502 from the ingress means nothing answered on the routed port: wrong port,
wrong image architecture, or a container that exited.

### Documentation

- [HOW_TO_USE.md](../HOW_TO_USE.md) — user walkthrough of the three workflows.
- [README.md](../README.md) — architecture, quick start, deployment.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development setup and pull requests.
- [docs/TESTING.md](TESTING.md) — how changes are verified.
- [SECURITY.md](../SECURITY.md) — vulnerability reporting and security properties.

### License and citation

MIT. Cite using [CITATION.cff](../CITATION.cff).

*National Science Foundation (NSF) funded AI institute for Intelligent
Cyberinfrastructure with Computational Learning in the Environment (ICICLE)
(OAC 2112606).*
