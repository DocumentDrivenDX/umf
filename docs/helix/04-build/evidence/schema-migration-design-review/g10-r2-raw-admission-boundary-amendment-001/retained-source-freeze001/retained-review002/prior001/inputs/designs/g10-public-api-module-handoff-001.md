# G10 portable public API and module handoff 001

Design-owner decision for governed product integration after frozen candidate
qualification. Governing contract-proposal.md explicitly names
verifyTableInventoryMigration(plan, originalHistory); technical-design.md assigns
src/table-migration inventory/graph/prefix/history with browser-only data APIs.
Compile/discovery/serializer names below are NEW explicit API decisions, not a
claim they were already implemented. Actual legacy table-migration index at75f
exports compileTableMigration, discoverTableMigrationChanges and verifyTableMigration;
keep their signatures/version dispatch/frozen bytes exact.

## Public entrypoints and result/error contract

Export from src/table-migration/inventory.ts, re-export explicitly through
src/table-migration/index.ts and existing src/index.ts table-migration surface:

```ts
compileTableInventoryMigration(
  request: TableInventoryMigrationRequest
): TableInventoryMigrationResult;

discoverTableInventoryMigrationChanges(
  previous: TableDeploymentBundle | null,
  next: TableDeploymentBundle,
  selector: TableInventoryDiscoverySelector,
  originalHistory: TableInventorySourceHistory
): TableInventoryReviewedChangeCandidate[];

verifyTableInventoryMigration(
  plan: unknown,
  originalHistory: TableInventorySourceHistory
): TableInventoryMigrationPlan;

serializeTableInventoryMigration(
  plan: unknown,
  originalHistory: TableInventorySourceHistory
): string;
```

History is REQUIRED even when empty; no optional callback/default lookup. Compile
request retains EXACT governed `{id,predecessor,previous,next,options,history}`.
Result follows existing compiler convention EXACT
`{status:'compiled',plan,diagnostics:[]}` or `{status:'blocked',diagnostics}` using
existing model Diagnostic type and located source/option/history paths. Native
qualification is never inferred; plan.nativeQualified=false. Runtime preflight
still validates untrusted actual values despite typed signature. Do not expose
Record<string,Json> as the final public plan type or return a scheduler frame as
compiled plan. Unknown/unsupported profile/selection returns visible blocked
result with existing diagnostic convention, no generic fallback/no-op success.

Discovery/verification throw the existing public UmfError/diagnostic-bearing
error convention for invalid data, consistent with old discovery/verification;
no raw private paths/values/cursors or arbitrary internal exception dumps.
Verification recompiles the COMPLETE request with supplied exact original history
and compares COMPLETE canonical plan bytes, including every step/phase/prefix/
review/seed/history/source/binding field. Checking supplied digest alone is not
verification. No trusted flag/type assertion/sourceTestOnly/dynamic loader or
caller function can skip history/source validation.

Serializer calls that full verifier with SAME explicit originalHistory, then
returns complete verified RFC8785 UTF8 JSON represented as a JavaScript string,
WITHOUT terminal LF, same plan/digest, no extra wrapper/history embedding/native
field. It writes no file and performs no hidden lookup. CLI/file consumers choose
their own explicit output newline separately. Serialization is data consistency,
never native existence/approval/COMMIT authority. No deserializer/native handle
constructor is introduced by this decision.

Public types: TableInventoryMigrationRequest, TableInventoryMigrationOptions,
TableInventoryMigrationPlan, TableInventoryMigrationResult,
TableInventoryDiscoverySelector, TableInventorySourceHistory,
TableInventoryReviewedChangeKind/Marker/Candidate, and explicitly useful closed
step/phase/prefix/intent/history record types from their governing definitions.
New reviewed kind union is separate from legacy ReviewedChangeKind: preserve
old kind union/refusal, do not append new table/seed kinds to old validators.
New Candidate retains existing marker/candidate wrapper keys
`{id,kind,path,oldDigest,newDigest,oldValue,newValue}` and original optional
oldPath/newPath where applicable, with exact new kind union and full original
G10 review projection values; it is not merely a bare projection array. Governed
full inventory review projection remains its own distinct type/profile.

## Real discovery and marker consumption, not prototype relabeling

Selector is REQUIRED EXACT governed discovery.1 object:
`{version,tableIntents,conversions,retiredSeedSets,retirements,restorations,
archiveSources}` with version umf.table-inventory-discovery/0.1. Cycle-free remove
and irreversible conversion forms OMIT ONLY their eventual marker references.
Original history is separately explicit, complete and source-verified. No
invented request id, fake previous bundle, placeholder review marker, synthesized
full compiler options or filtered source is used to get past a compile validator.
Initial previous=null/history empty is genuine; published empty has original
nonnull predecessor/previous and full history.

Discover full original before/after source meanings and actual stable bindings
using shared semantic projection/review constructors. Emit original field/
dependency/operation/context markers plus exact governed table/effects/seed
retirement kinds for the cycle-free selector. Exact marker hashing remains the
original RFC8785 review rule with complete values/actual source or selected-intent
locations. It does not grant compiler/native support for an unsupported effect.
Every stale/duplicate/unused/unknown selector refuses with location. Compiler
recomputes and consumes EVERY selected exact marker once, including irreversible
removal/conversion effects; a nonempty marker string or shape check is insufficient.
Do not weaken .4/.5/.7 standalone whole-source guards or permit SQL parsing.

Current scratch deriveInventoryReviewCandidates returns raw InventoryProjection
objects and takes a full compile request; it is NOT this public discovery API.
A correct adapter must pair original sides/full values and derive/validate the
actual marker wrappers under the complete cycle-free input. If precise new-kind
marker preimages/locations remain unimplemented or need a finite elaboration,
freeze that exact source decision for review before exposing positive API output.
Do not silently assert scratch projection arrays meet the governed plan.review
marker/candidate type. Full new schema/marker/public result checks must pass.

## Module ownership and integration

| Repository module | Owns |
| --- | --- |
| src/table-migration/inventory.ts | Four public adapters/types, complete compile/recompile orchestration, fixed profile dispatch; no scheduler/effect injection |
| src/table-migration/inventory-options.ts | Closed request/options/discovery selectors and limits; no permissive any-based public schema or post-signature defaults |
| src/table-migration/inventory-source.ts | Independently verified original bundles, source projections/stable identities/full source edit certificates; complete command/seed/unknown meaning |
| src/table-migration/inventory-history.ts | Bounded chronological source/seed lineage and exact original history recompilation; one internal verified-cache context per root call |
| src/table-migration/inventory-review.ts | Cycle-free discovery, original full review value/marker derivation and exact consumption |
| src/table-migration/inventory-graph.ts | Typed actual source-effect dependencies, whole atomic groups and ordering; no SQL parse/ordinal renderer |
| src/table-migration/inventory-prefix.ts | Exact before predicates, applied closed catalog/source transitions, provenance-only batch and local definition digest/prefix states |
| existing deployment/migration emission leaves | Shared genuine typed Field/default/grant/dependency constructors; exact old emitted bytes/old admission preserved |

Small cohesive extra private files for operation references/rendered effects/types
are allowed in this directory when they preserve these invariant owners. Avoid
recreating one huge dispatcher or parallel engine. The exact unadopted scratch
file names need not become the public architecture. No absolute /private/tmp or
worktree import, Bun/Node/fs/process/database/Weft runtime dependency in portable
library; normal relative source imports only. Preserve shared core/hash/model/
source validation helpers and real typed constructors. No copying methodology
catalog or teaching native/host modules into browser code. ADR-006 eventual Rust
boundary remains governing; this handoff creates no second semantic engine.

Historical recompiler is fixed INTERNAL source, not a parameter in public compile,
discover, verify or serialize. Cache exact canonical full plan plus original prior
history, never ID/digest-only trust. Bound work and history incrementally; never
omit/rewrite original inputs to fit. Private graph/effect/mutation builders cannot
be public compiler inputs, native authority, or public exports. Internal export
between owned modules is not an alternative trusted public plan interface.

Keep new JSON schemas in the existing spec/table-migration family (or the exact
existing schema directory selected by repository convention), with explicit .1
inventory refs/closed unions and separate legacy schemas. Shared artifact/embedded/
Python/Rust/codegen package assets must include the SAME final source/schema
closure; source module placement alone qualifies none of those artifacts.

Before product adoption: freeze exact path/diff/source closure and public exports;
check real boundary commands from technical design plus meaningful export/diagnostic/
strict TS/schema/legacy parity/source-corpus/history/seed/graph/prefix tests, real
Chromium portable APIs, exact serializer/recompiler bytes and native host/original
receipt/installed/publication evidence as applicable. All runtime remains subject
to the separate specific resource ticket. Native new-family, R2, opaque query D2,
D03 FK/NOT VALID/VALIDATE, old-store, managed/installed/release/public-byte gates
remain explicit. This handoff grants source implementation ownership to the
existing implementation session; it does not claim the backlog complete.
