## Purpose

Describe the user or maintainer problem addressed by this pull request. Link the related issue.

## Change summary

- 

## Validation performed

See `docs/TESTING.md` for what each level means and which ones apply to this change.

Level 0 — local pre-submit checks, in the order CI runs them:

- [ ] `npm ci` completes against the committed `package-lock.json`.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run build` succeeds.

Level 2 — manual verification:

- [ ] I exercised the changed screen, service, or configuration in a browser.
- [ ] I checked the change against both `VITE_USE_MOCK_SERVICES=true` and live services, or explained why only one applies.
- [ ] User test document: `docs/user-tests/YYYY-MM-DD-<slug>.md` — link it here, or state why this change does not need one.
- [ ] I updated user and developer documentation where needed.

Level 3 — deployment verification, if this change touches the `Dockerfile`, the nginx template, or the `VITE_*` surface. Delete if it does not apply:

- [ ] `docker buildx build --platform linux/amd64 ... --load .` succeeds and the container answers on port 5000 and on an overridden `PORT`.

## Screenshots

Add screenshots or screen recordings for any user-visible change. Delete this section if it does not apply.

## Contribution readiness

- [ ] I identified new or changed dependencies.
- [ ] I identified data, provenance, privacy, security, and credential implications.
- [ ] Any new `VITE_*` variable is documented in `.env.example`, added to the `Dockerfile` build args, and holds configuration rather than a credential.
- [ ] I identified a maintenance owner or explained why this is not yet known.
- [ ] I did not include secrets, private keys, Tapis tokens, proprietary data, restricted data, or unauthorized third-party material.
- [ ] I have the right to submit this contribution under the repository license.

## Reviewer notes

Describe any limitations, follow-up work, compatibility concerns, or release notes needed.

State any known verification gaps: paths you could not exercise, environments you could not reach, and anything left unverified. This repository has no automated test suite, so an unstated gap is an invisible one.
