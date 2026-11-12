# Check support and tested scope

Support means a test that CI runs. Governed specifications remain drafts, and release availability is different from tested behaviour.

## What is tested

- Portable declarations, inspection, editing, profile comparison and the bounded `rules/1` and `keys/1` interpretation: `tests/actions`, `tests/actions-manifest*.test.ts` and `tests/actions-plan*.test.ts` (Bun, every pull request), and the Rust crates' tests (`cargo nextest`).
- The native reference consumer (owned PostgreSQL, command processes, browser tutorial): `tests/actions-reference` and the browser suites, which need prepared prerequisites and run in the nightly job.
- Python access to admission: `python/tests`.
- Tests that currently fail are listed with a reason in `scripts/known-failures.txt`; behaviour covered only by those tests is not supported until they pass.

Earlier qualification packets, certificates and result counts were removed from the repository with the evidence archive and remain in git history. They are not current claims.

<!-- generated:evidence-links:start -->
- [Original prior-art decisions](../../../02-design/actions-prior-art-decisions.md)
<!-- generated:evidence-links:end -->

## Important boundaries

Declaration support is broader than native execution. Composite-Key declarations do not promise every store codec. The recorded native subset includes tested string tuples and alias behavior. Core/portable admitted decimal or binary values do not imply native rules/1 execution support; the first consumer's scalar subset is boolean/integer/string.

Owned lifecycle, undirected linked meaning and Association-Record native execution remain unsupported in this reference subset. Relevant unknown dependencies refuse eligibility. Arbitrary extra triggers, outside writers, remote policy enforcement, arbitrary code loading, workflows, cancellation, allocated identities, external side effects, cross-store commits, warehouse freshness and production/downstream adoption are not qualified here.

Public comparisons with Palantir, Smithy, Dafny, Koka, Axon, Cedar and Temporal informed design choices. No connected Palantir tenant or those action runtimes was exercised. They are not interchangeable implementations of this protocol.

## Predict the result

If a profile supplies an evidence URL for every obligation and declaredCompatible becomes true, has UMF verified execution?

Answer: no. Locators are inert strings. executionVerified remains false. Runtime qualification is separate.
