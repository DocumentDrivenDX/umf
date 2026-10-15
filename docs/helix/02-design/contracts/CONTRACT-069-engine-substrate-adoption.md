---
ddx:
  id: CONTRACT-069
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-029
      kind: informed_by
    - id: FEAT-030
      kind: informed_by
    - id: CONTRACT-067
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
---

# CONTRACT-069: Truss and Ashlar generated substrate adoption

**Type:** conformance boundary. **Version:** proposed `umf-engine-substrate/0.1`.

## Purpose

Define the conditions under which a consumer may substitute generated storage
access for handwritten mappings/codecs without broadening its execution authority.
This UMF contract is an adoption proposal, not a revision of sibling contracts.

## Scope and Boundaries

UMF owns reusable interpretation and generation. Weft owns logical query lowering.
Truss owns mutable graph execution; Ashlar owns publication-bound execution.
Consumer repositories MUST adopt the proposal through their own governed designs
before replacing production paths. No cross-flow authority edge is created here.
Ordinary Markdown source references are contextual, not adopted dependencies.

## Normative Surface

### Two compilation inputs

| Input | Permitted output | Forbidden inference |
| --- | --- | --- |
| Engine's internal physical UMF model | Generated storage declarations and qualified codecs | Every internal table becomes a public write surface |
| User's UMF domain model | Domain values, ordered keys, command/result DTOs | Every domain Record becomes a new physical table |

Domain-to-generic-storage mapping MUST be explicit, supplied and version-qualified.
No domain table, partition or index may be created by Truss domain generation.
Unknown data and original source bytes remain with their existing retention owner.

### Adoption packet

Each proposed substitution MUST record `contract`, `consumer` (`truss` or
`ashlar`), `consumerVersion`, `bundleInputDigest`, `profileId`, `profileVersion`,
`scope` (nonempty named operation/table families), `nativePins` (exact ordered
`{name,version,configuration}` records), `sourceModels` (ordered source IDs and
SHA-256 hashes), `authorityRefs` (consumer-local contract paths),
`comparisonEvidence` (retained evidence references) and `outcome` (`proposed`,
`qualified`, `refused`). All fields are required; unknown fields refuse.
Evidence references are inert strings and MUST NOT trigger fetching/execution.
`qualified` is permitted only after independent native witnesses below pass at
the captured source/profile. Digests bind sources but do not authenticate an
issuer, prove native retention or establish current authorization.

### Truss obligations

1. Preserve accepted generic storage, document-qualified Field identities, exact
   key bytes/member order, missing versus JSON null and retained unknown values.
2. Host-supplied connections and current protected operation admission remain
   mandatory. Generated declarations MUST NOT grant registry writes, mint custody,
   weaken invoker/elevation guards or expose an alternate mutation path.
3. Existing catalog locking, parent/delete lock order, isolation, savepoints,
   transaction failure/rollback, operation ordinals and uncertain-commit semantics
   MUST remain under the current Truss protocol. No ORM flush/retry may intervene.
4. Native witnesses MUST compare original admission/refusal, actual property/edge
   mutation, journal, feed, durable receipt and ACK behavior—not row shape alone.
5. At least one concurrent-writer control and one injected precommit failure
   MUST establish unchanged enforcement/atomicity for the selected operation.
   Missing semantic routines or installed authority remain blockers; the generated
   bundle MUST NOT manufacture substitutes to obtain a green result.

### Ashlar obligations

1. Preserve immutable publication identity, complete native table UUID/version
   vector, source progress, field presence, exact values and parallel-edge identity.
2. All reads MUST enter the existing authorized publication resolver and preserve
   pin custody through execution. Missing/replaced/expired snapshots refuse; no
   latest-table fallback or scalar summary replaces the vector.
3. Writes MUST enter the existing staged/fenced publication protocol. Generated
   mappings cannot independently advance manifests, ACK progress or coordination
   state. Partial role/table commits MUST preserve the previous visible descriptor.
4. Native witnesses MUST include schema agreement, original immutable reads,
   replay, partial failure before publication, uncertain ACK reconciliation and
   a concurrent publication or fencing control. Failed reads MUST NOT become
   empty graphs. Source and destination proof remain separate.
5. Local Spark/Delta acceptance MUST NOT establish Unity Catalog policy, managed
   retention or production authorization. Managed adoption needs separately pinned
   native evidence on an explicitly selected environment.

### Incremental substitution and rollback

Adopt one named internal table/operation family at a time. Shadow comparison
MUST be read-only or use isolated native fixtures; never execute a live mutation
twice for comparison. Preserve an explicit original/generated selection at the
host composition point, with one writer per operation. A failed qualification
retains the original path. A switch changes implementation selection only; it
MUST NOT change database shape or reinterpret stored values. Schema evolution,
data conversion or dependency changes need their own reviewed migration protocol.

## Precedence and Compatibility

Consumer contracts retain execution authority. This proposal MUST NOT supersede
them by implication. Conflicting target semantics require refusal and upstream
reconciliation. Requalification is required when compiler/profile, generated ABI,
codec, consumer protocol, driver, native version, relevant configuration or source
model changes. A same-source regeneration alone does not renew runtime admission.

## Error Semantics

`ADOPTION_INCOMPLETE` denotes missing native/authority proof; `ADOPTION_MISMATCH`
denotes a difference in values, refusal, transaction or publication outcomes.
Both refuse substitution and preserve evidence. Runtime exceptions retain the
consumer's original classification and retry policy. Neither error licenses
repair, privilege escalation, inferred defaults or automatic migration.

## Examples

Truss can compare generated Core declarations for a bounded catalog read while
retaining its original connection/admission path. This does not qualify mutations.
Ashlar can decode a row selected at the resolver's original UUID/version; the
same decoder applied to an unpinned latest-table read does not qualify publication
adoption even when its values match.

## Governing Consumer Context

Read consumer AGENTS.md and current documentation entry points before adoption:

- Truss: `docs/helix/02-design/adr/ADR-002-storage-strategy.md`; resolve sibling references from the selected Truss checkout, not a worktree-relative directory assumption.
- Truss: `docs/helix/02-design/contracts/CONTRACT-012-weft-storage-handoff.md`, current protected-admission and installation plans.
- Ashlar: `docs/helix/02-design/contracts/CONTRACT-001-publication-boundary.md`, `CONTRACT-002-consumer-read-boundary.md`, `CONTRACT-003-delta-graph-tables.md`, `CONTRACT-004-publication-resolver.md`.

## Validation Checklist

- [ ] Consumer-local adoption designs reconcile current contracts and selected layouts.
- [ ] Independent original/generated native witnesses pass, including negative controls.
- [ ] Qualified scope and unresolved adjacent paths are recorded separately.
