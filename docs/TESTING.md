# Testing and Verification

This document describes how a change to this repository is verified before it is
merged and before it is deployed.

It is written to be adopted unchanged across our repositories. The structure —
the four levels, the merge and deployment criteria, and the user test
documentation rules — is the same everywhere and should be copied verbatim. Only
three things are specific to this repository: the commands in **Level 0**, the
workflow descriptions in **Level 1**, and the container commands in **Level 3**.
Those sections describe `ICICLE-ai/geoharmonizer-ui` (Earth Data Hub), a React
single-page application built with Vite and served by nginx in a Tapis Pod.

## Current position on unit tests

**This repository has no unit tests, and that is deliberate.** Writing them for
the existing surface area — map and AOI handling, Tapis job specification, chat
and availability services, browser-side parsing of uploaded geospatial files — is
a large up-front cost that has not been funded yet. Unit tests will be added
later, and when they are, they become a blocking CI gate like any other.

What is deferred is *automated* testing, not verification. Until a test suite
exists, the evidence that a change works is manual verification, recorded in a
user test document committed alongside the change. That record is not optional
and is not a substitute for something better that already exists — it is the only
test record this project has.

Until the suite lands:

1. Keep logic in small pure functions in `src/utils/`, `src/state/`, and
   `src/services/`, separate from the components that render it. Code shaped that
   way is what a later test suite can actually cover; logic buried in a component
   effect is not.
2. Do not introduce a test framework as part of an unrelated pull request.
   Choosing the runner, the assertion style, and where tests live is a decision
   with maintenance consequences, and it should be made once, in the open.
3. Volunteered tests are welcome. Open an issue first and ask a maintainer where
   they should go, as [CONTRIBUTING.md](../CONTRIBUTING.md) already asks.
4. Record verification gaps in the pull request. If you could not exercise a path
   — no Tapis tenant access, no live availability service, no way to reproduce a
   reported failure — say so in the reviewer notes rather than leaving it
   unstated.

### Intended future tooling

None of this is in effect today. No tool below is installed, configured, or run
by any workflow. The table records the intended direction so that a contributor
proposing a test harness knows what to propose.

| Language or surface in this repo | Intended tooling | Status |
| --- | --- | --- |
| JavaScript and JSX (`src/`) | Vitest for units, React Testing Library for components | Not yet in effect |
| Browser end-to-end (the three workflows in the README) | Playwright against the built bundle | Not yet in effect |
| Shell (`.github/scripts/`) | `shellcheck` | Not yet in effect |
| Dockerfile and nginx template | `hadolint`, plus the existing container smoke test | Not yet in effect |
| GitHub Actions workflows | `actionlint` | Not yet in effect |

## The four levels of verification

| Level | What it is | Who runs it | When | Blocks merge |
| --- | --- | --- | --- | --- |
| **0** | Local pre-submit checks — the same install, lint, and build commands CI runs | The author, locally | Before pushing | Not directly; Level 1 re-runs the same checks and does block |
| **1** | Automated CI gates — the GitHub Actions workflows in `.github/workflows/` | GitHub Actions | Every pull request and every push to `main` | Yes |
| **2** | Manual functional verification, recorded as a user test document | The author; confirmed by the reviewer | Before requesting review | Yes, whenever it applies |
| **3** | Deployment verification — building and running the container the way the cluster does | Whoever performs the deployment | Before tagging a release and before updating the pod | Does not block merge; blocks deployment |

## Which levels apply to my change?

| Change | Level 0 | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- | --- |
| Docs only | Yes | Automatic | No | No |
| Refactor with no intended behaviour change | Yes | Automatic | Yes — a regression check showing behaviour did not change is enough | No |
| Behaviour change | Yes | Automatic | Yes — a full user test document | No |
| Dependency change | Yes | Automatic | Yes — exercise every screen the dependency touches | Rebuild the image; the bundle changes |
| Build, container, or deploy change | Yes | Automatic | Yes, if anything user-visible changes | Yes |
| Release | Yes | Automatic | Reference the documents already committed; do not repeat them | Yes |

"Automatic" means the workflows run whether or not you think about them. It does
not mean you may ignore a red run.

## Level 0 — local pre-submit checks

Run these from the repository root, in this order. They are the same commands,
in the same order, that the `web` job of the Build workflow runs.

```bash
npm ci        # not `npm install` — fails on a package-lock.json that disagrees
              # with package.json, which is itself a deploy blocker
npm run lint  # eslint .
npm run build # vite build
```

Ordering constraints:

- `npm ci` must come first. It installs ESLint and Vite themselves, so neither of
  the next two commands exists before it has run. It also deletes and recreates
  `node_modules`, so run it after any change to `package.json`.
- `npm run lint` before `npm run build` only because it is the cheaper failure.
  The build does not depend on lint having passed.
- There is no typecheck step. This project is plain JavaScript and JSX with no
  TypeScript configuration and no `typecheck` script; `@types/react` is installed
  as a dependency of the tooling but nothing runs `tsc`.

To exercise the app while developing, as [CONTRIBUTING.md](../CONTRIBUTING.md)
describes:

```bash
cp .env.example .env   # VITE_USE_MOCK_SERVICES=true runs without live services
npm run dev
```

### Toolchain versions CI uses, and where they are pinned

| Tool | Version | Pinned in |
| --- | --- | --- |
| Node.js | 22 | [`.github/workflows/build.yml`](../.github/workflows/build.yml) (`node-version: "22"`) and [`Dockerfile`](../Dockerfile) (`node:22-alpine`) |
| npm | whatever ships with Node 22 on the runner | Not pinned. `package-lock.json` is `lockfileVersion: 3` |
| nginx | 1.27-alpine | [`Dockerfile`](../Dockerfile) |
| gitleaks | 8.30.1, verified against a recorded SHA-256 | [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml) |
| TruffleHog | action pinned to the commit tagged v3.97.0, `version: "3.97.0"` | [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml) |

There is no `engines` field in `package.json` and no `.nvmrc`, so nothing
enforces your local Node version. Use 22.

## Level 1 — automated CI gates

| Workflow | File | Triggers | What it proves |
| --- | --- | --- | --- |
| Build | [`.github/workflows/build.yml`](../.github/workflows/build.yml) | `pull_request` (any base branch), `push` to `main`, `workflow_dispatch` | The bundle lints and compiles, the linux/amd64 image builds, and the container answers HTTP 200 on the default port, on an overridden port, and on a deep link |
| Repository health | [`.github/workflows/repository-health.yml`](../.github/workflows/repository-health.yml) | `pull_request` (any base branch), `push` to `main` | A fixed list of project files exists, and every `VITE_*` variable read in `src/` is documented in `.env.example` |
| Secret Scan | [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml) | `pull_request`, `push` to `main`, weekly cron (Mondays 06:00 UTC), `workflow_dispatch` | No secrets are detected by gitleaks, and — on pushes and pull requests only — by TruffleHog |

All three declare `permissions: contents: read` and a concurrency group keyed on
workflow and ref, cancelling in-progress runs for pull requests only. None of
them runs on a tag push.

### Build

Two jobs, the second gated on the first.

**`web` — Lint and bundle**

1. `actions/checkout@v4`.
2. `actions/setup-node@v4` with `node-version: "22"` and `cache: npm`.
3. `npm ci`.
4. `npm run lint`.
5. `npm run build`. No `VITE_*` values are supplied, so this also proves the
   bundle builds on the defaults alone.

**`image` — Container image and smoke test** (`needs: web`)

1. `actions/checkout@v4`.
2. `docker/setup-buildx-action@v3`.
3. `docker/build-push-action@v6` builds the [`Dockerfile`](../Dockerfile) for
   `linux/amd64` explicitly, with `push: false` and `load: true` so the local
   daemon can run it, tagged `geoharmonizer-ui:ci`. Build args are placeholders:
   `VITE_USE_MOCK_SERVICES=true` and `VITE_TAPIS_API_URL=https://icicle.tapis.io`.
   Layers are cached through the GitHub Actions cache.
4. Runs the image as `edh-default` on host port 15000 mapped to container port
   5000, then polls it with
   [`.github/scripts/wait-for-http.sh`](../.github/scripts/wait-for-http.sh),
   which retries for 30 seconds and fails immediately with the container logs if
   the container is not running.
5. Runs a second container `edh-override` with `-e PORT=8080` on host port 15001,
   and polls it the same way. This is what proves the nginx envsubst hook still
   renders the listen port; a broken hook leaves a container that starts, looks
   healthy, and listens on the wrong port, which reaches users as a 502 from the
   Tapis ingress.
6. `curl`s `http://localhost:15000/jobs` and requires HTTP 200, proving the
   `try_files` single-page fallback in
   [`nginx/default.conf.template`](../nginx/default.conf.template) is in effect.
7. Always dumps the logs of both containers.

The `image` job is a **smoke gate, not a test suite**. It proves the container
builds and answers HTTP. It never loads the page in a browser, never executes the
bundled JavaScript, and never contacts a backend.

### Repository health

Two independent jobs, both on `ubuntu-latest` after `actions/checkout@v4`.

**`required-project-files`** iterates a hard-coded list of paths and exits
non-zero after naming every one that is missing. The list is
`LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
`CITATION.cff`, `.env.example`, `docs/RELEASE_CHECKLIST.md`,
`docs/MAINTAINER_ROLES.md`, `docs/TESTING.md`, and
`docs/user-tests/TEMPLATE.md`. It checks existence only, never content.

**`env-example-documented`** greps `src/` for literal
`import.meta.env.VITE_<NAME>` accesses and requires each name to appear in
[`.env.example`](../.env.example) as `NAME=`, optionally commented out. It cannot
see a variable name assembled at runtime, it looks only inside `src/`, and it
does not check that the [`Dockerfile`](../Dockerfile) declares a matching `ARG`
even though the release checklist and the pull request template both require
that.

Trigger gap: this workflow has no `workflow_dispatch` and no schedule, so it
cannot be re-run on demand against an unchanged tree.

### Secret Scan

**`gitleaks`** checks out with `fetch-depth: 0`, downloads gitleaks 8.30.1 from
the pinned release URL and verifies it against a recorded SHA-256 before
extracting it. On a pull request it scans only the commits the pull request adds
(`--log-opts "$BASE_SHA..$HEAD_SHA"`); on any other event it scans the full
history. Output is redacted.

**`trufflehog`** is conditioned on `github.event_name` being `push` or
`pull_request`. On the weekly cron and on manual dispatch it does not run at all,
by design — the action only derives a commit range for those two events, and the
periodic full-history rescan is left to gitleaks. It uses the TruffleHog OSS
action pinned to the commit tagged v3.97.0 with
`extra_args: --results=verified,unknown`, which keeps findings whose verification
was inconclusive rather than discarding them.

Trigger gap: on a pull request, gitleaks sees only that pull request's commits, so
a secret already present in the base branch is caught by the `main` push run or
the weekly rescan, not by the pull request.

### What CI does not check today

- **No tests of any kind run.** There are no unit, integration, or end-to-end
  tests in the repository, so no job runs any.
- **Nothing renders the application.** The smoke gate asserts HTTP status codes.
  A bundle that compiles and then throws on mount passes CI.
- **No type checking and no formatting check.** No TypeScript configuration
  exists, and no Prettier or equivalent is configured. `npm run lint` is ESLint's
  recommended rules plus the React Hooks and React Refresh plugins.
- **No live-service coverage.** The chat, availability, and Tapis paths are never
  exercised against a real host; the CI image is built with
  `VITE_USE_MOCK_SERVICES=true`.
- **No dependency vulnerability scanning.** There is no `npm audit` step and no
  Dependabot configuration. `npm ci` proves only that the lockfile is consistent.
- **No image scanning, and CI never publishes an image.** What is verified is a
  locally loaded `geoharmonizer-ui:ci`, not the tag that gets deployed.
- **No linting of the workflows, the Dockerfile, or the shell scripts.**
- **nginx behaviour beyond routing is unasserted.** The `Cache-Control` headers
  and gzip settings in the template are never checked, and the deep-link
  fallback is checked only on the default-port container, not on the overridden
  one.
- **No accessibility, performance, or bundle-size budget.**
- **Nothing runs on a tag push.** A release tag gets no workflow run of its own;
  the release commit is covered only by whatever ran when it landed on `main`.

## Level 2 — manual functional verification

Until unit tests exist, this is the test record. Anything more than a docs-only
change needs it.

The minimum bar for a change:

1. **Happy path.** Exercise the change the way a user would, end to end, in a
   browser. For this repository that means `npm run dev`, or the container from
   Level 3, with `VITE_USE_MOCK_SERVICES=true`. Where the change touches Tapis,
   also exercise it against a real tenant, as
   [CONTRIBUTING.md](../CONTRIBUTING.md) requires.
2. **One edge case.** The boundary the change is most likely to get wrong — an
   empty area of interest, a date range with no scenes, a very large uploaded
   file, a job list with no jobs, an unset optional `VITE_*` variable.
3. **One failure case.** What the user sees when the thing goes wrong — a service
   that is unreachable, a rejected or absent Tapis token, a malformed upload.
   "It shows an error" is not a result; record the error the user actually saw.
4. **A regression check on adjacent behaviour.** One nearby workflow you did not
   intend to change, exercised to show that it still works. For a refactor, this
   is the whole point of the document.
5. **Screenshots for any visual change**, before and after where the difference
   matters. This is the same requirement the pull request template already makes.

Write it up using [`user-tests/TEMPLATE.md`](user-tests/TEMPLATE.md), commit it in
the same pull request as the change, and link it from the pull request
description. A verification that exists only in the pull request conversation is
not a record; it has to be a file in the repository.

## Level 3 — deployment verification

Run this before tagging a release, and before any deploy that follows a change to
the [`Dockerfile`](../Dockerfile),
[`nginx/default.conf.template`](../nginx/default.conf.template), or the `VITE_*`
surface. It reproduces locally what the `image` job does in CI, and then goes
further by loading the page in a browser, which CI never does.

```bash
# Build for the cluster's architecture. A plain `docker build` on Apple Silicon
# produces an arm64 image the x86_64 pod hosts cannot run.
docker buildx build --platform linux/amd64 \
  --build-arg VITE_USE_MOCK_SERVICES=true \
  --build-arg VITE_TAPIS_API_URL=https://icicle.tapis.io \
  -t geoharmonizer-ui:local --load .

# Default port 5000 — the port Tapis Pods route to.
docker run -d --name edh-default -p 15000:5000 geoharmonizer-ui:local
./.github/scripts/wait-for-http.sh http://localhost:15000/ edh-default

# Overridden port, which exercises the envsubst hook that renders the config.
docker run -d --name edh-override -e PORT=8080 -p 15001:8080 geoharmonizer-ui:local
./.github/scripts/wait-for-http.sh http://localhost:15001/ edh-override

# Single-page deep-link fallback: expect 200, not 404.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:15000/jobs

# What CI cannot do: open http://localhost:15000/ in a browser and use the app.

docker logs edh-default
docker rm -f edh-default edh-override
```

For a release build, pass the real tenant values and `VITE_USE_MOCK_SERVICES=false`
as the README's deployment section describes, and verify against that image
rather than the mock one.

Verification checklist:

- [ ] The image builds clean for `linux/amd64` with no new warnings.
- [ ] Both containers pass the `wait-for-http.sh` poll. This is the only health
      signal the deployment has: there is no `HEALTHCHECK` in the Dockerfile and
      no dedicated health endpoint, so serving `/` with a 200 *is* the check.
- [ ] `/jobs` returns 200 on the default-port container, and on the overridden
      one if the change touched routing.
- [ ] The application loads and works in a browser against the built image, not
      just the dev server.
- [ ] Every new environment variable is documented in
      [`.env.example`](../.env.example), declared as an `ARG` in the
      [`Dockerfile`](../Dockerfile), and passed as a `--build-arg` in the README
      deployment command and in any pod definition that needs it.
- [ ] Every new environment variable has sane unset behaviour: the app builds and
      runs with it absent, and degrades in a way the user can understand rather
      than failing silently.
- [ ] No secrets are in the image. `VITE_*` values are inlined into the public
      bundle and readable by anyone who loads the site — see
      [SECURITY.md](../SECURITY.md). Confirm with
      `docker history --no-trunc geoharmonizer-ui:local` and by grepping the
      served bundle for anything that should not be public:
      `docker run --rm geoharmonizer-ui:local grep -ro 'https\?://[^"]*' /usr/share/nginx/html/assets | sort -u`.

## Merge criteria

A reviewer should confirm all of the following before approving.

- [ ] All CI checks are green, or a red check is explained and is unrelated to
      the change.
- [ ] Level 0 commands were run locally and the pull request says so.
- [ ] The change is one coherent thing, as [CONTRIBUTING.md](../CONTRIBUTING.md)
      requires.
- [ ] A user test document is committed in this pull request when Level 2
      applies, and it actually covers the change rather than restating it.
- [ ] Screenshots are attached for any user-visible change.
- [ ] Documentation is updated where behaviour, configuration, interfaces, or
      limitations changed.
- [ ] Any new `VITE_*` variable is documented, declared as a `Dockerfile` `ARG`,
      and holds configuration rather than a credential.
- [ ] Known verification gaps are stated in the reviewer notes.

**A pull request is not blocked for missing unit tests.** Do not ask for them as
a condition of merge while the suite is deferred.

**A pull request is blocked for a missing user test document when Level 2
applies.** That is the trade: the tests are deferred, the verification is not.

## Deployment criteria

Everything under merge criteria, plus:

- [ ] Level 3 deployment verification was performed and recorded — a user test
      document against the deployed instance, or the corresponding section of the
      release record.
- [ ] The release is traceable: an immutable image tag, recorded in the release
      notes, identifying the source commit it was built from.
- [ ] [`docs/RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) is complete.
- [ ] Release notes state known test gaps explicitly, including the absence of
      an automated test suite and which paths were verified only by hand.
- [ ] A rollback path is known and written down: the previous image tag, and the
      command or pod change that restores it.

## User test documentation

User test documents live in [`docs/user-tests/`](user-tests/). One file per
verification session, named:

```
docs/user-tests/YYYY-MM-DD-<slug>.md
```

The date is the date the testing was performed, and the slug is a short
description of what was tested — for example
`docs/user-tests/2026-08-19-aoi-upload-validation.md`. Start from
[`user-tests/TEMPLATE.md`](user-tests/TEMPLATE.md).

Required sections:

| Section | What goes in it |
| --- | --- |
| Header table | Date, tester, pull request or issue, commit SHA tested, overall result |
| Environment | Browser and version, operating system, how the app was run, mock or live services, Tapis tenant if applicable |
| Scope | What this session covers, in one or two sentences |
| Preconditions | What had to be true or set up before the steps could be followed |
| Test cases | Happy-path cases: steps, expected, actual, pass or fail |
| Edge cases | Boundary cases, same four columns |
| Failure cases | Deliberately broken input or unavailable services, same four columns |
| Regression check | Adjacent behaviour exercised, and whether it still works |
| Evidence | Screenshots, recordings, log excerpts, job IDs |
| Issues found | Anything that failed, with an issue link where one was filed |
| Not tested | What was in scope but left unverified, and why |

Rules:

1. **Write steps a stranger can follow.** A step is a thing to do, in order, with
   the specific input used. "Uploaded a shapefile" is not a step; "uploaded
   `sample-aoi.zip` (3 features, EPSG:4326) via *Upload boundary*" is.
2. **Record the expected result before you run the step**, not after. Writing the
   expectation afterwards turns the document into a description of what happened,
   which proves nothing.
3. **Record failures.** A document with no failures in it is a document that
   either tested nothing interesting or hid something. If everything passed, say
   so in "Not tested" — name what you did not try.
4. **Use public or synthetic data only.** No restricted datasets, no sensitive
   locations, no personally identifiable information, no real credentials or
   tokens in screenshots or log excerpts. Redact tenant identifiers if in doubt.
   See [SECURITY.md](../SECURITY.md).
5. **Keep it to about a page.** If a session needs more, it was really two
   sessions; split it into two documents.
6. **Never edit a past document.** They are a dated record of what was true then.
   If something changed, write a new document.
7. **Always say what you did not test.** The "Not tested" section is the most
   useful part of the document for the next person, and it is the one that makes
   the record honest.

## Adopting this model in another repository

**Copy verbatim:**

- The four levels and what each one means.
- The "Which levels apply to my change?" matrix.
- The Level 2 minimum bar: happy path, edge case, failure case, regression check,
  screenshots.
- Merge criteria and deployment criteria.
- The whole "User test documentation" section, including the naming convention
  and the numbered rules.
- `docs/user-tests/TEMPLATE.md` and `docs/user-tests/README.md`.

**Adapt per repository:**

- Level 0: the real install, lint, typecheck, and build commands from that
  repository's manifests, in the order its CI runs them, and the toolchain
  versions with the file each is pinned in.
- Level 1: one row per workflow that actually exists there, and one subsection
  each. Do not carry over a workflow description from another repository.
- Level 3: the real build and run commands for that deployment surface — compose,
  Helm, a serverless deploy, or nothing at all if the repository is a library.
- The intended-future-tooling table: one row per language actually present.
- The "What CI does not check today" list, rewritten from that repository's
  workflows.

**Invariants, whatever the stack:**

- Deferring unit tests never defers verification. Something has to produce the
  evidence, and while there is no suite, that something is a committed user test
  document.
- Every command in Level 0 and Level 3 is copied from a file in the repository,
  never invented. A command that does not exist is worse than no command.
- Level 1 describes what CI *proves*, and states what it does not. A workflow
  that installs and starts a thing is a smoke gate, not a test suite, and should
  be labelled that way.
- A reviewer never blocks on the missing suite, and always blocks on the missing
  record.
- User test documents are append-only.

## Related documents

- [README.md](../README.md) — what the application is, how to run it, and how to
  deploy it to Tapis Pods.
- [HOW_TO_USE.md](../HOW_TO_USE.md) — the user-facing walkthrough of the three
  workflows, useful as a source of realistic Level 2 test steps.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — development setup and pull request
  expectations.
- [SECURITY.md](../SECURITY.md) — why no `VITE_*` value may hold a credential,
  and how the Tapis token is handled.
- [docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) — the full release gate.
- [docs/MAINTAINER_ROLES.md](MAINTAINER_ROLES.md) — who approves, releases, and
  deploys.
- [docs/user-tests/README.md](user-tests/README.md) — how to add a user test
  document.
- [docs/user-tests/TEMPLATE.md](user-tests/TEMPLATE.md) — the template to start
  from.
