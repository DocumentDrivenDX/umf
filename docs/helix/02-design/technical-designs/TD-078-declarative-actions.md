---
ddx:
  id: TD-078
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-078
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-900
      kind: references
    - id: umf.architecture
      kind: references
    - id: ADR-002
      kind: references
---

# TD-078: Portable action declaration tooling

**User Story:** [[US-078-declarative-actions]].
**Feature:** FEAT-008. **Solution Design:** [[SD-008-declarative-actions]].

## Scope

Implement declaration validation, authoring, inspection and supplied-profile
comparison under CONTRACT-900. No executor, state evaluator or native adapter is
part of this story. The parent design owns the extension/runtime boundary.

## Technical Approach

Index exact module/element/Key/relationship/action identities once per operation.
Reuse current core validation, Record membership, Key and literal admission
rather than infer identity or duplicate equality rules (US-078-AC1/3/8).
Validate read/write frames and pre/postcondition profile identities without
interpreting rule text. Validate exactly one recipe or handler binding.
Check recipe effect dependencies in source order, recording creates and deletes. Derive
endpoint type/Key constraints from the authored relationship, not physical FKs.
Runtime aliases are executor obligations, not statically proven identities.

Build an obligation inventory independently of executor claims. Include every
condition/effect, referenced Field/Key/model dependency and required policy/result
obligation; deduplicate dependencies by exact pointer. Unknown action/model
members are explicit unchecked obligations. Opaque language/role/handler profiles
remain visibly unchecked by UMF even if an executor declares support (AC2/4/5).

Compare the exact copied source/identity with the supplied profile before claim
matching. Supported claims require inert evidence locators and still do not
verify them. Unsupported/unknown obligations keep declared compatibility false;
profile claims never override unknown members/unsupported value semantics.
No document string selects or executes code (AC2/5).

Use whole-document validation with the caller's explicit Registry; never replace
other extension registrations. Additive authoring may preserve opaque rules;
replacement edits require complete interpretation of the selected action and its
required model dependencies. Unrelated unknown content remains attached (AC6).
Resolve optional DDD bindings by exact service/operation without altering the
DDD validator or defining aggregate/event enforcement (AC7).

## Component Changes

The declaration schema/package, public API, semantic analysis, fixtures and browser
harness are implemented experimentally. `analysis.ts` holds dependency/obligation
analysis; `expression.ts`, `selector.ts` and `evaluation.ts` implement separate
bounded explicit interpretation. Report/profile schemas are implemented; the
[historical certificate](../../04-build/evidence/actions-certification.md) records
completed qualification at its captured sources. Changed integrated sources need
fresh qualification. The table below names actual implementation components.

| Component | Change | Criteria |
| --- | --- | --- |
| `spec/extensions/actions/schema.json`, `package.json` | Exact 0.1.0 module payload/package with unknown preservation | AC1/4/6/8 |
| `spec/extensions/actions/inspection.schema.json`, `assessment.schema.json`, `executor-profile.schema.json` | Contract report/profile structures | AC5/8 |
| `src/extensions/actions/index.ts` | Package registration and copied public entrypoints | AC1–8 |
| `src/extensions/actions/structure.ts`, `references.ts`, `known-model.ts` | Model references, ordered effects, diagnostics and limits | AC1/2/3/4/7/8 |
| `src/extensions/actions/analysis.ts` | Deterministic dependency inventory and profile comparison | AC2/4/5 |
| `src/index.ts` | Add exports without host imports | AC9 |
| `fixtures/actions/`, `tests/actions/` | Synthetic fixtures and meaningful contract/counterexample assertions | AC1–8 |
| `scripts/actions-browser.ts` | Actual Chromium checks of built public APIs | AC9 |

## API/Interface Design

CONTRACT-900 alone owns declarations, APIs, report/profile fields, diagnostics
and bounds. Use existing Registry and Document operations; do not create an
execution transport, generic plugin loader or persistence receipt verifier.

## Data Model and Integration Points

Core schemas and DDD payloads remain unchanged. The new module payload is
independently registered. Reports retain source and dependencies rather than
produce a pruned executable document. Optional DDD resolution fails explicitly
when the selected version or service definition is unavailable.

## Security and Performance

Reuse accessor-safe JSON admission; objects must never invoke getters or load
handlers. Treat profiles and evidence strings as untrusted data, not permission.
No credentials, identity service or network access is required. Synthetic fixtures
contain no real people or authorization secrets. Stable failure explanations
are declaration metadata; an executor must authorize before releasing runtime
condition details.

Use indexed lookup, ordered traversal and deduplicated obligations under core
and action bounds. Detect unsupported cycles/shapes without recursive unbounded
expansion. No latency/throughput or broad denial-of-service claim is selected.
All existing concerns and ADR-002 browser/tooling overrides apply.

## Testing

[STP-078](../../03-test/test-plans/STP-078-declarative-actions.md) owns the
per-criterion assertions and canonical citations. Require source copy isolation,
unknown retention, both serializers, malformed/profile drift counterexamples,
no handler/network execution and real browser parity. Executor witnesses remain
separate from library acceptance and must not be simulated into native claims.

## Migration & Rollback

Additive package registration changes no existing document. A colliding unknown
namespace cannot be adopted automatically. Future version migrations retain the
original payload and explicit mapping/rollback; none is added in this slice.
Rollback removes exports/registration; documents retain the unknown payload.
Consumers stop action use before removing its supported package/profile.

## Implementation Sequence

1. Create schemas and full synthetic model fixtures; add exercising red contract
   tests for AC1–8 with canonical citations before claiming implementation.
2. Implement validation/indexing, copied authoring/inspection and obligation
   extraction; retain core/DDD behavior and compare the existing regression.
3. Add profile comparison and safe replacement refusal; run focused tests,
   typechecking and schema/package audits.
4. Export/build and run the Chromium corpus for AC9, then traceability and scoped
   regression. Record source/runtime versions, failures/reruns and subset evidence.

Prerequisites: requirements/contract review and current core 0.8.0 acceptance
qualification. Existing release qualification failures are not waived. US-050
and consumer executors are not required to implement local declaration tooling.

## Risks

False completeness, callback replacement and hidden native effects are the main
risks. Distinct obligation statuses, caller registry reuse, source-qualified
limits and external execution witnesses contain them. No implementation should
infer a universal expression language or executor from this design.

## Iteration 2 implementation handoff

CONTRACT-901 is a separate consumer runtime design dependency. Add schema forms
for role/policy authorization and profile/version obligations to this library
slice. A separately registered rules/keys interpreter may statically parse and
check the bounded JSON AST without state evaluation; absent registration retains
text as unchecked. Never claim rule interpretation from string preservation.

1. Replace simplified probes with full core/action/profile fixtures for create-
   link, approve and reserve, and malformed AST/authorization/profile cases.
2. Implement CONTRACT-900 schemas, copied APIs, semantic model references and
   complete obligations; use the nine AC gates already allocated.
3. Implement an optional portable static checker for rules/keys version 1 with
   phase/type/dependency/limit checks; require its own fixtures and browser proof.
4. Frame a separate consumer executor story/design/test plan before production
   runtime code: trusted handler isolation, native adapter/invariant scope,
   policy coupling, revision registry, durable lookup/tombstones and audit.
5. Implement/qualify EX-01–EX-05 through real failures and native conflicts, then
   attach exact profile evidence. Do not substitute library green tests for it.

No runtime method, endpoint or datastore is added to the public UMF library by
this handoff. Runtime admission/observation schema publication may be reusable,
but its trusted-session and adapter behavior belongs to the consumer.
