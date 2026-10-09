# Check support and evidence

The final action acceptance certificate is certified for its stated bounded profile, not for every possible UMF action or deployment. Governed specifications remain drafts. Release availability and artifact approval are different from executed qualification.

## Recorded qualification

- Core document version: 0.8.0. Action extension: umf.actions 0.1.0.
- Portable declarations: public registration, authoring, inspection, editing and profile comparison; 54 portable tests in the recorded campaign.
- Explicit interpretation: bounded rules/1 and keys/1, with separately supplied state for evaluation.
- Native reference consumer: the fixed owned PostgreSQL 17.9/Bun 1.4.2 profile; 119 recorded native tests.
- Browser: Chromium 153.0.8010.12, 44 shared cases with Bun parity and no external requests.
- Final snapshot regression and admission: 2,314 distinct tests, zero failures; the certificate records the exact disjoint gates and inputs.

<!-- generated:evidence-links:start -->
- [Final scoped certificate](../../evidence/actions-certification.md)
- [Machine-readable certificate](../../evidence/actions-certification.json)
- [Documentation execution evidence](../../evidence/actions-documentation-execution.md)
- [Original prior-art decisions](../../../02-design/actions-prior-art-decisions.md)
<!-- generated:evidence-links:end -->

These results describe the frozen replay source and recorded inputs. This guide and subsequent integration have their own dated verification evidence; neither silently changes the historic certificate nor claims it binds newly changed bytes.

## Important boundaries

Declaration support is broader than native execution. Composite-Key declarations do not promise every store codec. The recorded native subset includes tested string tuples and alias behavior. Core/portable admitted decimal or binary values do not imply native rules/1 execution support; the first consumer's scalar subset is boolean/integer/string.

Owned lifecycle, undirected linked meaning and Association-Record native execution remain unsupported in this reference subset. Relevant unknown dependencies refuse eligibility. Arbitrary extra triggers, outside writers, remote policy enforcement, arbitrary code loading, workflows, cancellation, allocated identities, external side effects, cross-store commits, warehouse freshness and production/downstream adoption are not qualified here.

Public comparisons with Palantir, Smithy, Dafny, Koka, Axon, Cedar and Temporal informed design choices. No connected Palantir tenant or those action runtimes was exercised. They are not interchangeable implementations of this protocol.

## Predict the result

If a profile supplies an evidence URL for every obligation and declaredCompatible becomes true, has UMF verified execution?

Answer: no. Locators are inert strings. executionVerified remains false. Runtime qualification is separate.
