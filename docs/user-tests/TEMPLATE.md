<!--
  Copy this file to docs/user-tests/YYYY-MM-DD-<slug>.md, where the date is the
  date you performed the testing and the slug describes what you tested.
  For example: docs/user-tests/2026-08-19-aoi-upload-validation.md

  Fill in every section. Delete the HTML comments as you go, but do not delete
  the section headings — an empty section is information, an absent one is not.

  Read the rules in ../TESTING.md before you start. The two that get forgotten:
  write the expected result BEFORE you run the step, and never edit this file
  once the pull request is merged.
-->

# User test: <what you tested>

<!--
  Commit SHA: the exact commit you tested, not the branch name. `git rev-parse --short HEAD`.
  Result: Pass, Pass with issues, or Fail. Say Fail if anything in scope failed.
-->

| Field | Value |
| --- | --- |
| Date | YYYY-MM-DD |
| Tester | Name |
| Pull request / issue | #NNN |
| Commit SHA | `abc1234` |
| Result | Pass / Pass with issues / Fail |

## Environment

<!--
  Enough for someone else to reproduce this. If you tested against a live Tapis
  tenant, name it. If you tested more than one environment, add rows.
-->

| Field | Value |
| --- | --- |
| Browser | e.g. Firefox 141 |
| Operating system | e.g. macOS 15.5 |
| How the app was run | `npm run dev` / built image `geoharmonizer-ui:local` on port 15000 / deployed pod |
| `VITE_USE_MOCK_SERVICES` | true / false |
| Tapis tenant | e.g. https://icicle.tapis.io, or n/a |
| Other `VITE_*` values that mattered | e.g. `VITE_SLURM_ACCOUNT=PAS2699` |

## Scope

<!-- One or two sentences: what this session covers. Name the screens or services. -->

## Preconditions

<!--
  What had to be true before step 1 was possible: signed in, a boundary file to
  hand, a running service, a job already submitted. Include the test data you
  used and where it came from — public or synthetic only.
-->

-

## Test cases — happy path

<!--
  One row per case. Steps are numbered actions with the actual input you used.
  Expected is what you wrote down before running it. Actual is what happened,
  not "as expected" — say what you saw.
-->

| # | Steps | Expected | Actual | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 | 1. …<br>2. … | | | |
| 2 | | | | |

## Edge cases

<!--
  The boundaries this change is most likely to get wrong: empty input, very
  large input, nothing to display, an optional variable left unset, a date range
  that returns no results.
-->

| # | Steps | Expected | Actual | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## Failure cases

<!--
  Deliberately break it. Service unreachable, missing or rejected token,
  malformed upload. Record the error the user actually saw, word for word — not
  "an error appeared".
-->

| # | Steps | Expected | Actual | Pass/Fail |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## Regression check

<!--
  Adjacent behaviour you did not intend to change, exercised to show it still
  works. For a refactor this is the main evidence.
-->

| # | Adjacent behaviour | Steps | Still works? |
| --- | --- | --- | --- |
| 1 | | | |

## Evidence

<!--
  Screenshots (required for any visual change, before and after where the
  difference matters), recordings, log excerpts, Tapis job IDs. Commit images
  alongside this file or under docs/images/. Redact tokens and tenant
  identifiers.
-->

-

## Issues found

<!--
  Anything that failed or looked wrong, with a filed issue link where one
  exists. Write "None." if there were none — and then make sure "Not tested"
  below is honest.
-->

-

## Not tested

<!--
  What was in scope but left unverified, and why. This is the most useful
  section for the next person. "No access to a live availability service", "did
  not test on Safari", "did not try files over 100 MB".
-->

-
