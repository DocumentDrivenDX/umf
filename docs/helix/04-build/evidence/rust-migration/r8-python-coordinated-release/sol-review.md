---
ddx:
  id: umf.evidence.rust-migration.r8-python-coordinated-release.sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: umf.evidence.rust-migration.r8-python-coordinated-release
      kind: references
    - id: ADR-006
      kind: informed_by
    - id: TP-001
      kind: informed_by
---

# Independent review of the coordinated Python release candidate

The candidate workflow is non-publishing. It names six Ubuntu x86_64 and macOS
arm64 cohorts across CPython 3.11.17, 3.12.15 and 3.13.16, builds the pinned
`umf-core` 0.11.0 and `umf-codegen` 0.2.0 pair, verifies the core payload and
offline extracted sdist, then tests an installed pair and an offline codegen
sdist rebuild. The current local arm64 receipt is **provisional**; no hosted
matrix job or publication has run from this source cohort.

Sol independently inspected the workflow and pair verifier, reran the three
helper/artifact test modules (48/48 passed under CPython 3.11.17), parsed the
workflow as six matrix cohorts, checked all 12 recorded source pins in
`local-checks.json` against the worktree, and matched the four provisional
artifact SHA-256 values and both verifier receipt hashes to the files. The
core receipt reports source-payload verification and non-native sdist payload,
metadata, tag and version parity. Its independently rebuilt native executable
and extension bytes differ; the receipt correctly does not claim reproducible
native binaries. The pair receipt reports installed import/generation/CLI and
byte-identical codegen sdist wheel rebuild. The agent's separate installed
source-test run reports 217 tests and 43 subtests; Sol has not replayed that
larger run independently.

Review corrections before this capture fixed the workflow's cohort-prefix
architecture guard, replaced a nonexistent trigger fixture with
`fixtures/actions-binding/source.json`, added the governed evidence frontmatter,
and supplied the previously missing local-checks receipt. I found no remaining
P1/P2 in the reviewed non-publishing workflow/helper and focused tests at the
recorded source pins. The Key tuple exhaustive wire replay, final source-settled
pair rebuild, six hosted jobs, coordinated publisher, index hash verification,
and clean published installs remain gates. This review does not approve a
release or promote the provisional local artifacts to the final cohort.

A later attempted final pair capture rejected its extracted core sdist with
`sdist-file-inventory-differs` after a parallel R5 core Keys wire-test source
file was added. That is the intended source-custody refusal, not a passing
release cohort. The pair will be rebuilt only after the active migration edits
reach a coordinated source freeze.

At the 2026-10-24 trigger audit, I reviewed the path-filter correction for
`.github/workflows/pypi.yml` and independently reran the four focused source,
distribution, pair and matrix test modules: 75/75 passed under the available
CPython 3.11.17 tooling environment. The workflow trigger regression test and
audit JSON parse pass. I corrected the audit's release-blocker wording to
reflect the owner's existing publication authorization: independent delivery
review, registry verification, clean installs and rollback pins remain gates;
consumer adoption and Windows/macOS x86_64 pairs are separate follow-ons beyond
the declared six-cohort matrix. No current-source distribution build or hosted
matrix result is inferred from these local checks.
