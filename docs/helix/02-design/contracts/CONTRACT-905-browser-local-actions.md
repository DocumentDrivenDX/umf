---
ddx:
  id: CONTRACT-905
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-900
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-902
      kind: informed_by
    - id: CONTRACT-903
      kind: informed_by
    - id: CONTRACT-904
      kind: informed_by
---

# CONTRACT-905: Browser-local action execution profile

## Purpose

Keep the UMF website on static GitHub Pages while its visitor compiles SQL with
original Weft WASM and changes actual rootless Truss sample data in an origin-local
store. Bun builds the static assets; no compilation service is introduced.
This is a separately qualified executor, not native Truss authentication.

## Scope and Boundaries

One browser-local store incarnation, one original local action, immutable Keys,
constant required scalar set assignments, bounded frozen selection and serial
atomic batches. Actual Truss storage/schema/provider, original Weft compilation
and lowering, and original UMF Key/value/action/manifest semantics are required.
A webpage SQL parser, array mutation or fabricated backend result is not support.
The existing b7 products/person-required cohort and native tx/1 remain unchanged.
Local ownership is neither human authentication nor a bulk-editor membership.

## Normative Surface

All following identifiers have exact version `1`; unknown versions refuse.

| Meaning | Exact profile |
| --- | --- |
| Actor | `umf.actions.local-owner` |
| Authorization policy | `umf.actions.local-store-owner` |
| Invocation | `umf.actions.local-tx` |
| Bulk companion | `umf.actions.local-bulk` |

The action uses `{subject:"actor-profile",profile:{id:"umf.actions.local-owner",version:"1"}}`
and `{kind:"policy",profile:{id:"umf.actions.local-store-owner",version:"1"},resources:[...]}`.
Resources are exactly every original read frame followed by every write frame,
in declaration order. The local actor, policy and invocation are one complete
bundle. Mixing local invocation with person-required/roles/1 or local declarations
with native tx/1 refuses. Unrelated actor/policy IDs remain unchecked. No general
override or caller-supplied evidence flag marks unknown meaning checked.

The actor is an opaque executor-issued capability for this exact origin-local
store incarnation. Registration, selection, sealing, submit, execute, lookup,
recovery and cancellation require that issued capability out of band. It cannot
be supplied by a plan/document, serialized ID, copied receipt, worker label or
caller-created object. The policy authorizes only its own store and complete
named action frames; possession is not permission for another store or action.
The engine's current ownership/source/revision checks remain mandatory at admission.
Native human/service/delegation requirements are not reinterpreted by this profile.

Selection-read authority is a separate issued grant, never inferred from the
action's write permission or its (possibly empty) read frames. At local store
registration, the genuine store-owner issuer binds
`{profile:{id:"umf.actions.local-store-read",version:"1"},target:KeyRef,
fields:FieldRef[],view:"complete-canonical-target-population",disposition:"original"}`
to that same owner capability, store/incarnation and exact registered model/action
source. Fields are every original member of the registered target Record in
declaration order. This first local sample explicitly grants original reads of
the whole canonical target population, including Key, predicate, assignment and
guard/version dependencies. It does not assert an unseen global population or
grant another store's data. Hidden/transformed/protected or uninterpreted read
semantics are outside this sample and refuse rather than silently becoming public.

The engine checks the current issued owner/read-grant correspondence independently
at selection admission, verifies every original Weft dependency belongs to the
complete registered grant, and runs all original complete-population preflights
before enumerating rows. Issued guards and complete selection come from that same
coherent cut. A copied JSON read-grant declaration is not the capability or proof
of issuance/current authorization. Later effect admission still requires current
local ownership and original read/write action obligations; sealing reserves none.

Original `graph-write/1`, `keys/1`, CoreLiteral and core Key codec meanings are
reused. Plan-model/1, plan/1 and manifest/1 retain their original wire shape;
their exact invocation profile selects this separately interpreted branch.
Preparation verifies the entire local bundle against the original action.
Old consumers must refuse the new invocation rather than assume tx/1 meaning.
Portable validity and supported capability claims never issue execution authority.

The companion capability table retains plan, selection, manifest, guard and
snapshot claims. For local invocation, bulk profile MUST be
`umf.actions.local-bulk/1`, with precisely `bulk.atomicBatch`, `bulk.replay`,
`bulk.localOwner`, `bulk.recovery`, `bulk.cancel`, `bulk.retention`. For tx/1,
the original `umf.actions.bulk/1` table including `bulk.principal` is unchanged.
Profiles and principal claims cannot substitute across branches.

Manifest construction remains pure and unsealed. For local invocation, actual
seal custody binds the original issued local owner, store/incarnation, action
revision, selection cut, guards and complete original manifest bytes. For tx/1,
CONTRACT-903's authenticated initiating-human custody remains unchanged. Native
bulk/1 operations and delegation semantics in CONTRACT-904 are not local operations;
the local transport uses `protocol:"umf.actions.local-bulk/1"` and must qualify
its local-owner boundary independently. Corresponding frozen work, atomic batch,
replay, cancellation and uncertainty obligations are retained, not waived.

The Truss-owned provider opens persistent browser storage, verifies the actual
PGlite/PostgreSQL versions, installs actual Truss schema/runtime, registers original
model/action/preparation/binding sources, and consumes original Weft lowering.
One worker holds exclusive per-store ownership for its lifetime; a second tab
must share that admitted owner or refuse. There are no independent native C/D/E
sessions or SCRAM guarantees in this branch.

IndexedDB acknowledgement must wait for persistence flush (`relaxedDurability:false`).
Outcome recognition survives a supported reload under the same namespace.
Effects and complete original batch outcomes commit atomically. Lost acknowledgement
returns uncertainty until original custody/recovery establishes an outcome;
not-found alone never establishes rollback or permits a fresh-token bypass.
Quota/storage failure cannot report a durable success. Reset creates a new store
identity/incarnation explicitly and never silently relabels prior work. Restore
with uncertain graph/outcome correspondence fences execution. Storage clearing
or browser eviction is not promised recovery or unlimited retention.

## Precedence and Compatibility

CONTRACT-900 remains action authority. CONTRACT-901 and original native branches
of CONTRACT-902/903/904 retain their complete meaning. This additive profile is
selected only by its exact invocation and separately authored model/action pins;
it does not reinterpret historical preparation, compiler, binding or enrollment
bytes. A new Weft build must pin its actual original UMF preparation producer.
No version/pin rewriting, SQL mode stripping, alternate compiler or fabricated
person is permitted. Registry/profile parsing proves declaration meaning only.

## Error Semantics

Malformed/relevant unknown/mixed profile intent refuses before effects. Missing
capability, foreign store/seal, stale/rebound targets, changed source or unsupported
durability refuses without returning an executable prefix. Uncertain commit or
flush is not a known failure or successful replay. Existing source-qualified
portable error families apply to inspection/preparation.

## Examples and Qualification

A distinct `set-name-local` action can set the original required String name
Field of local Products with the original graph-write recipe. It cannot execute
the unchanged person-required `set-name` registration. Required browser witnesses:
original compiler/lowering provenance, real Truss data readback, three-item/two-item
batch partition, empty work/no-op, atomic multi-item rollback, stale/rebound Key,
foreign seal, duplicate submit/replay, interrupted acknowledgement/reload recovery,
second-tab ownership, quota failure and explicit reset/restore behavior. Runtime,
browser, subset, source and storage scope accompany every passing claim.
Until those witnesses pass, this is a design candidate, not an executable backend.
