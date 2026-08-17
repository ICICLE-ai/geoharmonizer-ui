# Release Checklist

Complete this checklist before creating a public release.

## Product and documentation

- [ ] `version` in `package.json` and the release tag agree.
- [ ] Release notes state current capabilities, known limitations, and breaking changes.
- [ ] README setup, configuration, and deployment instructions were reviewed against the release.
- [ ] `CITATION.cff` matches the tagged version and release date.
- [ ] `.env.example` documents every `VITE_*` variable the release reads, and the `Dockerfile` declares each one as an `ARG`.
- [ ] Documentation identifies supported browsers and any known unsupported settings.

## Quality and security

- [ ] `npm run lint` and `npm run build` pass on the release commit.
- [ ] `npm ci` resolves against a committed `package-lock.json` with no unexpected changes.
- [ ] Known test gaps are documented. (This project has no automated test suite; record what was verified manually.)
- [ ] Dependency and configuration changes since the last release were reviewed.
- [ ] The secret-scan workflow passed on the release commit.
- [ ] No secrets, credentials, private certificates, proprietary data, restricted data, or unauthorized artifacts are included — including in any `VITE_*` value baked into the published image, which is readable by anyone who loads the site.
- [ ] Security contact and vulnerability-reporting information are current.

## Deployment

- [ ] The image was built for the cluster architecture: `docker buildx build --platform linux/amd64`.
- [ ] Build args supplied the intended `VITE_*` values for the target environment, with `VITE_USE_MOCK_SERVICES=false`.
- [ ] The image tag is immutable and recorded in the release notes.
- [ ] The deployed pod answers on the routed port (5000 by default; override with `-e PORT=...`).
- [ ] Sign-in, boundary upload and map render, job submission, and the jobs list were each exercised against the deployed instance.

## Governance and provenance

- [ ] The release was approved by an authorized maintainer.
- [ ] The release tag identifies the source commit.
- [ ] Public examples use public, permitted, synthetic, or de-identified data.
- [ ] Release artifacts can be traced to their source, configuration, dependencies, and verification record.
