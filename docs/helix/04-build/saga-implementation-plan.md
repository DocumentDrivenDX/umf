---
ddx:
  id: umf.saga-implementation-plan
  type: implementation-plan
  activity: build
  status: active
  authoring:
    home: repo
  links:
    - {id: FEAT-901, kind: informed_by}
    - {id: US-905, kind: informed_by}
    - {id: US-906, kind: informed_by}
    - {id: CONTRACT-908, kind: references}
    - {id: TD-905, kind: informed_by}
    - {id: TD-906, kind: informed_by}
    - {id: STP-905, kind: informed_by}
    - {id: STP-906, kind: informed_by}
---

# Implement, qualify and release sagas

## Scope

Implement FEAT-901 against CONTRACT-908, SD-901, US/TD/STP-905 and
US/TD/STP-906. ADR-005 retains current-core model authority; ADR-006 requires
shared Rust semantics. Base revision is main `8fc91a8ae` (merged PR73).
The owner explicitly authorizes planning, implementation, tests and release,
with Sol planning/review and Luna implementation (2026-10-29).

## Shared Constraints

Keep declarations/actions/core coupled in UMF SDK 0.10.0. Independently named
wire vocabularies keep their exact versions. UMF owns portable declarations and
assessment; the durable coordinator is a test-only consumer, not a production
hosting service. Unknown content survives; unchecked dependencies block unsafe
editing and compatibility. Assessment always reports executionVerified:false.
A closed original invocation ticket, rather than one native rollback, establishes
noncommit. Retain immutable inputs, original outcomes, controls and stop causes.
No change to formal transition semantics or evidence without impact review.

## Module Boundaries

| Module | Responsibility / Owned Types | Public API | Allowed Dependencies | Forbidden Dependencies |
| --- | --- | --- | --- | --- |
| `crates/umf-codegen/src/actions/saga` | Immutable declaration/reference/assessment semantics | Four CONTRACT-908 operations | Parent action analysis, core Value/Context/schema | Native drivers, clock, process, filesystem, network |
| `crates/umf-core-wire`, `bindings/core`, `src/extensions/actions/saga.ts`, `python/src/umf/saga.py` | Transport and typed presentation | Same Rust operations | Explicit resources, shared engine | Independent saga evaluator or native consumer imports |
| `scripts/saga-reference`, `tests/saga` | Test-only custody, gateway and independent native observations | Qualified consumer protocol | Existing reference action executor, isolated PostgreSQL | Production implicit endpoints, shared infrastructure changes |
| `scripts/build-saga-package.py` | Extension package generation | Generate/check exact contract inputs | Reviewed extension schemas | Modification of core metamodel authority |

**Integration owners:** PostgreSQL and injected native faults belong to reference
consumer/tests. **Construction policy:** explicit immutable resources at engine
construction, explicit test database endpoints at native harness construction.
**Boundary check:** `bun run check:rust-boundaries`, already wired locally,
`.githooks/pre-commit` and `.github/workflows/rust-core.yml`. Saga additions to its
real scanner reject host capabilities, native consumer imports and known semantic
fork shapes; negative controls cover permitted core imports and forbidden edges.
Rust compiler visibility enforces private access. Regex controls do not establish
semantic equivalence or absence of every possible fork: Sol reviews type ownership,
minimal exports, exact parameter identity, invariant encapsulation and wrapper
behavior explicitly. No new debt exemption is authorized.

## Implementation Slices

| Slice | Area / governing artifacts | Depends on | Validation gate | Owner |
| --- | --- | --- | --- | --- |
| S0 | Boundary adoption; TD906/ADR006 | None | Actual checker and allowed/forbidden controls | Root |
| S1 | Generated opt-in extension package; CONTRACT908 | S0 | Exact regeneration, schema admission and negative shape controls | Root |
| S2 | Four shared Rust operations; US/TD/STP906 | S0/S1 | Independent expectations for all16 ACs, focused Rust tests | Luna engine |
| S3 | Wire, Bun/Python/CLI/WASM; TD906 | S2 | Installed bindings, immutable admission, same fixtures in actual Chromium | Root |
| S4 | Three-store reference consumer and invocation finality; TD905 | S0 | Durable ticket/attempt/outcome and independent provider queries | Luna native |
| S5 | Recovery/fault qualification; US/STP905 | S4/S2 | All29 ACs, independent history oracle and oracle negative controls | Luna native; Sol review |
| S6 | Integration, docs and release; STP905/906 | S1–S5 | Generated checks, regression, browser, package/install, exact-source receipts, green CI and published-byte verification | Root; Sol review |

Order establishes enforceable ownership before semantics, portable semantics before
binding qualification, and native finality before any execution-support claim.
S4 can progress in parallel with S2. Sol reviews planning and changed boundaries,
then portable and native milestones and final release claims.

## Execution Contract

Execute the complete authorized plan; a slice boundary is not a stopping point.
Fix ordinary failures. Stop dependent publication only for unresolved material
semantic failures, unavailable mandatory execution environments or authority
conflicts; continue unaffected work. No tracker was selected. No comparable token
usage evidence is available: total estimate and spending ceiling are unknown,
not fabricated. This chat exposes no reliable aggregate agent token enforcement.
Initial bounded inventory probes completed before implementation assignment;
record further uncertainty and scope changes here rather than silently reducing
acceptance. No owner-imposed token limit was supplied.

## Continuation Evidence

Plan revision 1. Branch `codex/implement-sagas` from merged PR73. Sol reviewed
slice order, exact public shapes and native AC allocation. S0 scanner controls
implemented; 16 boundary unit tests pass; full checker in progress. S1 deterministic
package generator and four exact outputs created; regeneration check passes.
Luna engine owns saga Rust family and narrow parent/resource changes. Luna native
owns reference consumer and tests. Root owns package/wire/bindings/release.
S0 actual checker passed 633 modules, both native/WASM Cargo closures and its negative controls. Generic registry sibling-schema admission now passes order-independence, unresolved-reference and conflicting-ID controls. Strict application and tooling types pass. The first native draft failed Sol review: component-level test labels were not canonical acceptance evidence, and drivers could select invocation order/phases. Its original all29-AC claim is withdrawn; S4 requires a definition-driven protocol coordinator rewrite and S5 remains open. All S2–S6 acceptance remains open. No production/runtime qualification or release
is claimed. Next: finish full boundary gate, integrate explicit saga resources,
review engine/native code and execute allocated tests.

## Validation Plan

- Map all16 portable and29 native ACs to actual independent assertions/results.
- Compare Bun/native/Chromium outcomes to independently specified expectations;
  cross-wrapper agreement alone is insufficient.
- Exercise native commit/reply/crash windows, unknown barriers, cancellation and
  authority races, stale workers, original control recovery, namespace nonreuse,
  bounds over restart, irreversible effects and accepted-residual closure.
- AC25 requires adverse delayed delivery after definitive failure with zero new
  effect and separate uncertain closure that blocks unwind.
- Preserve historical formal43 evidence; review model impact of any contract fix.
- Run affected action regression, schema/generated/boundary checks, strict types,
  SDK build/install and exact packaged browser/native/Python probes before release.
- Sol reviews final source and evidence; bind exact source, schemas, binaries,
  driver/runtime/profile identities and public release bytes.

## Risks and Rollbacks

| Risk | Response | Rollback |
| --- | --- | --- |
| False noncommit from tx1 rollback | Whole-ticket gateway custody and delayed-delivery tests | Refuse execution claim; retain pending ticket |
| Independent semantic forks | Shared Rust four-op family, wrapper controls and Sol review | Remove new exports; preserve unknown declaration bytes |
| Generated authority drift | Exact contract-input extension generator; core metamodel unchanged | Revert new opt-in package, never alter old release |
| Tool/runtime unavailable | Establish isolated pinned tools and real native/browser probes | Keep unpublished candidate with explicit unmet gates |
| Stale certification | Freeze source and verify exact artifact hashes | Withhold release; rerun affected qualification |

## Exit Criteria

- All four portable operations shipped through shared Rust and supported bindings.
- All16 portable and29 native criteria have actual passing evidence, with explicit
  qualified native profile and no implicit production hosting claim.
- Actual browser and installed artifact tests pass; required current regression,
  generated, schema, boundary and version checks pass.
- Sol review has no unresolved release-blocking findings; canonical docs match.
- Reviewed source is integrated, CI passes, version-coupled release is published
  and downloaded public bytes independently verified. Historical releases remain
  immutable. No required slice or material blocker remains.

## Continuation — 2026-10-30

The four shared Rust operations are connected to Bun/N-API, CLI, Python and
production WASM. The independent 18-vector corpus passes in all four hosts,
including actual Chromium and an installed Python 0.10.4 candidate. The installed
SDK passes its existing 139 consumer cases and the same 18 saga vectors. These
are candidate observations; publication and final source custody remain open.
Existing portable action regression passes 63 tests; native action regression
passes 125 tests against PostgreSQL. These results precede the final provider
fencing changes and do not substitute for their targeted regression.

The initial native component-only acceptance claim remains withdrawn. A public
closed-protocol adapter, definition-driven ordering and independent history oracle
now exist. Sol is reviewing atomic control responses, claim ticket admission,
original-provider finality, residual review and persistent bounds. The canonical
29-row inventory deliberately distinguishes observed cases from missing proof.
Native acceptance and merge remain gated on completing these items.

Fresh primary and supplemental TLC runs pass all 43 bounded cases; the compressed
original logs and source-exact report are republished and verification passes.
Core metamodel output changes only its compiler provenance. A narrowly scoped
normalizer compares the four historically accounted generated outputs to the
unchanged historical pins after replacing only the exact compiler hash slot;
negative controls reject schema/code/model changes and disagreeing slots. Sol
reviewed this accounting change. Historical companion bytes remain unchanged.

Release identity: SDK 0.10.0 and Python 0.10.4 share the eventual reviewed source
revision; core 0.10.0 and action/saga vocabularies 0.1.0 retain their semantic
identities. Already published SDK 0.5.8 and Python 0.10.3 must remain immutable.
A dedicated PR qualification workflow covers PostgreSQL, native Rust, actual
Chromium and installed SDK/Python artifacts. No released artifact is claimed yet.

## Source review and frozen qualification — 2026-10-30

[The implementation packet](evidence/sagas/README.md) records independent Sol
review of all 29 native criteria, including explicitly composed proofs and the
qualified reference profile. The combined native protocol/oracle/provider/capacity/component run passes
43 tests with 711 assertions; native component tests pass 173 assertions; strict
types pass. No blanket acceptance-status rewrite was performed. Earlier
inventory/component records retain their unverified/partial status and scope.

The reviewed source now persists namespace-derived original action keys before
worker release, protects control custody atomically, stops automatic work on
capacity/lookup/clock exhaustion and preserves original issuer facts/operator
review. Missing legacy custody refuses instead of inventing replacement keys.
All four final portable hosts pass the 19-vector corpus; installed SDK and Python
candidates and the JavaScript-free source-archive rebuild pass their scoped checks.
Rust codegen/wire regression passes 121 tests; native action regression passes
125 tests/1,993 assertions. The full boundary gate passes with its negative controls.

The first draft PR CI caught a one-byte source-inventory mismatch, before native
qualification or publication. Final source inventory is being regenerated after
all edits. PR #74 remains gated on frozen hosted qualification, Sol's final
source/evidence verdict, merge and exact retained-byte publication verification.
