# User tests

This directory is the test record for this repository.

There is no automated test suite — see
[Current position on unit tests](../TESTING.md#current-position-on-unit-tests) for
why, and for what will replace this eventually. Until that suite exists, the only
evidence that a change works is that someone exercised it by hand and wrote down
what they did and what happened. That write-up lives here, committed in the same
pull request as the change it verifies.

## Adding one

1. Copy [`TEMPLATE.md`](TEMPLATE.md) to `YYYY-MM-DD-<slug>.md` — the date you did
   the testing, and a short description of what you tested. For example
   `2026-08-19-aoi-upload-validation.md`.
2. Fill in every section, following the instructions in the HTML comments.
3. Commit it in the same pull request as the change, and link it from the pull
   request description.

## Rules

1. Steps a stranger can follow, with the specific input you used.
2. Write the expected result before running the step, not after.
3. Record failures. If nothing failed, say what you did not try.
4. Public or synthetic data only. No restricted data, no sensitive locations, no
   tokens or credentials in screenshots or log excerpts.
5. About a page. If it needs more, it was two sessions — split it.
6. Never edit a past document. Write a new one instead.
7. Always fill in "Not tested".

The full model, including which changes need a document at all, is in
[docs/TESTING.md](../TESTING.md).
