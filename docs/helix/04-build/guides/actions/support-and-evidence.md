# Check support and evidence

The final action acceptance certificate is certified for its stated bounded profile, not for every possible UMF action or deployment. Governed specifications remain drafts. Release availability and artifact approval are different from executed qualification.

## Frozen integrated qualification

The current [merged acceptance certificate](../../evidence/actions-integrated-certification.md) qualifies core 0.8.0 and umf.actions 0.1.0 on frozen source `1fa21f6ea1d7a3e1009746da99f1a61d444cd489`. Its [machine-readable certificate](../../evidence/actions-integrated-certification.json) and [independent audit](../../evidence/actions-merged-integration/audit.json) bind the actual commands, inputs, runtime versions and retained results.

- Fresh behavior regression: 2,448 distinct tests across 450 files, zero failures or skips; eight separate semantic checks also pass.
- Actual PostgreSQL reference execution: 119 tests; 216 histories and 648 transitions with zero mismatches. All five implementation mutants are detected.
- Public browser interpretation: 44 cases with Bun parity. The tutorial observes commit, SQL rollback, durable refusal and replay, query visibility and revoked-replay denial.
- Integration checks: 371 schemas, 63 extension packages, type and browser builds, 43 Python tests, CSV controls and five affected browser integrations.
- Bounded design checks: 22 SMT outcomes and 13 TLC runs using the pinned public Java runtime. These check the stated model bounds, not arbitrary deployments.
- All 21 action acceptance criteria have executed passing witnesses. Seven audit controls reject omitted or forged inputs and invalid execution claims.

The [immutable strict baseline](../../evidence/actions-documentation/qualification-integrated-5be80ab9/README.md) separately records 174 native/browser commands and 2,458 tests, including 17 admission tests, at source `5be80ab9`. These are inherited baseline results. They do not manufacture current strict admission for the merged source. The integration certificate states that boundary explicitly.

Two sessions with beginner readers remain a usability follow-up. The executable demonstrations are verified independently of those sessions.

## Subsequent main integration

Later main changes add shared security metadata and extend core 0.8 inspection. They have a [separate integration record](../../evidence/actions-security-integration/README.md); they do not change the frozen certificate above.

Fresh checks passed for the native action consumer, public browser behavior, the beginner native tutorial and affected core/facet operations. The record identifies actual versions, supported subsets and refusals. Shared security backend acceptance remains open, and security declarations do not automatically become executable action authorization.

The retained qualification records identify the source revision and profile they verify. Consult the release delivery record for CI and deployed-site verification. An older strict gate refusing changed source is a qualification boundary, not a passing current certification.

## Historical qualification

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
