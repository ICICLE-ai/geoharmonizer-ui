# Contributing

Thank you for helping improve Earth Data Hub. Contributions may include bug reports, documentation improvements, tests, examples, workflow or configuration artifacts, and code changes.

This repository is the browser interface: a React single-page application built with Vite that submits geospatial harmonization jobs to Tapis. Changes to the harmonization application itself, or to the Tapis app definition it submits against, belong in their own repositories.

## Before contributing

1. Read the README and relevant documentation.
2. Review open issues and pull requests to avoid duplicate work.
3. Do not submit credentials, private keys, proprietary data, restricted data, sensitive locations, personally identifiable information, or material that you are not authorized to share.
4. Use the issue templates to report a problem or propose a change before beginning a substantial contribution.

## Development setup

Node.js 22 is what the [Dockerfile](Dockerfile) builds with; use that version locally.

```bash
npm ci
cp .env.example .env      # VITE_USE_MOCK_SERVICES=true runs without live services
npm run dev
```

Before opening a pull request:

```bash
npm run lint              # must pass with no errors
npm run build             # must succeed; both run in CI
```

Configuration lives in `VITE_*` variables documented in [.env.example](.env.example). Vite inlines these into the public bundle at build time, so none of them may ever hold a credential — see [SECURITY.md](SECURITY.md).

## Testing

There is no automated test suite yet. It is deliberately deferred, and until it exists the evidence that a change works is manual verification recorded in the repository. [docs/TESTING.md](docs/TESTING.md) describes the full model; the flow for a normal change is:

1. Run the local pre-submit checks: `npm ci`, then `npm run lint`, then `npm run build`.
2. Push, and let CI run the same checks plus the container smoke test, the repository-health checks, and the secret scans.
3. Exercise the change by hand — happy path, one edge case, one failure case, and a regression check on adjacent behaviour — and write it up by copying [docs/user-tests/TEMPLATE.md](docs/user-tests/TEMPLATE.md) to `docs/user-tests/YYYY-MM-DD-<slug>.md`. Commit it in the same pull request.
4. For a change to the `Dockerfile`, the nginx template, or the `VITE_*` surface, also build and run the container locally as described in [docs/TESTING.md](docs/TESTING.md).

A pull request is not blocked for missing unit tests. It is blocked for a missing user test document when the change needed one. A pull request that adds the first test harness is welcome and should be proposed as an issue first.

## Contribution pathway

The project welcomes contributions in increasing order of technical and maintenance responsibility:

1. Run the interface and report a problem.
2. Improve documentation or examples.
3. Add or improve a test.
4. Propose a workflow, configuration, or other non-code artifact.
5. Prepare a bounded code contribution.

## Pull requests

A pull request should:

- Reference the related issue or explain the problem being addressed.
- Be limited to one coherent change.
- Pass `npm run lint` and `npm run build`, and include or update tests when a test harness exists.
- Include a screenshot or recording for any user-visible change.
- Update documentation when user-visible behavior, interfaces, configuration, installation, or limitations change.
- Identify dependencies, data assumptions, security implications, and maintenance implications.
- Not include secrets, large unreviewed binary assets, private datasets, or unlicensed materials.

Maintainers may request changes, defer a contribution, or decline it when the change lacks a clear maintenance owner, conflicts with project scope, introduces unacceptable security or data risks, or cannot be reviewed with available resources.

## License and contributor rights

By submitting a contribution, you represent that you have the right to submit it and that it may be distributed under this repository's license. If your employer, institution, funder, or data provider imposes restrictions, obtain authorization before contributing.

## Security issues

Do not report suspected vulnerabilities in a public issue. Follow `SECURITY.md`.
