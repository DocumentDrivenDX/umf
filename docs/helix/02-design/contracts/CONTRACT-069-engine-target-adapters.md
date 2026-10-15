---
ddx:
  id: CONTRACT-069
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-031
      kind: informed_by
    - id: CONTRACT-071
      kind: informed_by
    - id: CONTRACT-072
      kind: informed_by
---

# CONTRACT-069: Truss and Ashlar target adapters

**Type:** conformance boundary. **Version:** proposed `umf-access-engines/0.1`.

## Purpose

Define how Truss and Ashlar adopt the access SDK: by implementing CONTRACT-072
target protocols over their own protected execution paths, so generated clients
and catalog entries work against a Truss ontology or an Ashlar publication
exactly as they do against raw tables, without any generated code reaching engine
storage directly.

## Scope and Boundaries

Truss stores domain values in fixed generic storage keyed by catalog property IDs
and owns protected mutation, journal, feed, receipt and ACK behavior. Ashlar
stores published graph state in generic Delta tables and owns publication,
resolver, pin custody, retention and fencing. Neither engine's storage is a
binding target for generated models. Each adapter lives in its engine's
repository and is adopted through that repository's own governed design; this
contract states the conformance the SDK requires and does not amend sibling
contracts. Weft compiles catalog entries for both engines through their existing
backends.

## Normative Surface

### Truss adapter

Implements `ReadTarget`, `ReplayingActionExecutor` and
`BulkTarget[ManifestBulkPlan]`.

- **Reads.** Catalog entries compile through Weft's Truss runtime backend
  (currently `truss.postgresql.runtime` with `truss-runtime-binding/0.4`) against
  the accepted catalog revision. The adapter executes them through Truss's own
  read execution path with its admission, session settings and decoders, and
  applies every Weft host obligation.
- **Actions.** `invoke` submits the action identity and encoded input to Truss's
  protected action admission (Truss's action subject and role authority design).
  Truss authenticates the subject, authorizes, evaluates, commits, journals and
  emits feed entries; the adapter only maps Truss's tx/1 result to a CONTRACT-072
  outcome using the CONTRACT-072 tx/1 table. `invoke_keyed` carries the
  idempotency key, and replay follows CONTRACT-901 as implemented by Truss. Only
  concurrency conflicts map to `Conflict`. A failure before COMMIT keeps Truss's
  classification: it is a confirmed rollback and raises `ActionFailed` with
  Truss's code, never `Conflict`.
- **Bulk.** Catalog commands compile through Weft's Truss mutation backend.
  `TrussTarget.plan` returns a `ManifestBulkPlan`: `preview()` reads the selection
  through Truss's read path, `seal()` asks Truss to materialize and seal a
  CONTRACT-903 manifest and returns it, and `submit(manifest)` hands that sealed
  manifest to CONTRACT-904 coordination and returns a `BulkJob`. Host workers claim
  and run the batches through Truss. The plan has no `execute()`.
- **Values.** The adapter converts between CONTRACT-068 carriers and Truss's
  public carriers (`ABSENT` and `MISSING`, exact text tokens and `Decimal` or
  `datetime`). Truss retains authored lexical spelling for exact values; a decoded
  `Decimal` keeps the value but not the spelling. For fields where Truss requires
  spelling to round-trip, the adapter MUST refuse with
  `LEXICAL_SPELLING_REQUIRED` rather than re-encode a value read through the SDK,
  until a lexical-preserving carrier is defined.
- **Absence.** A Field bound by any relational ColumnSet cannot have
  `row.missing:true` (CONTRACT-070). If Truss returns `ABSENT` for such a Field, the
  adapter refuses the read with `ADOPTION_MISMATCH` rather than decoding it as
  `None` or `MISSING`.
- **Current Truss limits.** Truss's runtime currently refuses entity projections
  that contain timestamp or binary fields, and returns exact tokens as text
  values. Records with such Fields, or whose exact Fields need typed decoding,
  stay unqualified on Truss until Truss dependency T-1 provides typed carriers.
- **Forbidden.** No adapter path issues SQL against Truss tables other than
  catalog statements executed through Truss's read path. Generated code never
  receives table handles, connections with write privileges, or SQLAlchemy
  mappings for Truss storage.

### Ashlar adapter

Implements `ReadTarget` only.

- Catalog entries compile through Weft's Ashlar/Databricks backends.
- Every read enters Ashlar's authorized publication resolver. The adapter executes
  the statement inside the resolver's pinned interval, against the exact table
  UUID and version vector of the resolved publication, and verifies identity
  before and after as the resolver requires. There is no latest-table fallback;
  a missing, replaced or expired snapshot refuses. A failed read never becomes an
  empty result.
- The target identity includes the publication ID and version vector. A page's
  `next_after` is a CONTRACT-072 `Continuation[K]` that records the identity
  digest, so continuing it after the target resolves another publication, or after
  the publication expires, raises `StaleContinuation`.
- Instants use Ashlar's epoch-microsecond text carrier. Values outside Python's
  `datetime` range refuse at decode. That carrier currently exists only for
  `published_at` in Ashlar's `read_singleton`, and Ashlar's Weft decoder admits
  only string scalars, so Records with non-string Fields refuse at catalog build
  until Ashlar dependency A-1 provides instant and numeric decoders.
- Writes, ACK progress and publication remain Ashlar's own protocol; the SDK
  provides no Ashlar `ActionExecutor` or `BulkTarget`.

### Adoption packet

Each adapter qualification records `{contract, engine, engineVersion,
adapterVersion, runtimeAbi, catalogTargets, nativePins, authorityRefs,
conformanceEvidence, outcome}` with `outcome` `proposed`, `qualified` or
`refused`. `authorityRefs` are engine-local contract paths. `qualified` requires
the CONTRACT-072 conformance suite plus the engine-specific witnesses below.

### Engine-specific witnesses

| Engine | Required witnesses |
| --- | --- |
| Truss | Authorized and unauthorized invocation reach the same admission outcome as Truss's native client; committed action produces identical state, journal, feed, receipt and ACK; concurrent conflicting invocation classifies as `Conflict` and rolls back; injected failure before COMMIT keeps Truss's classification (confirmed rollback, raised as `ActionFailed`) and leaves no effects; replay of an equal idempotent request returns the original outcome; bulk manifest sealing, submission and coordinated execution match Truss's own bulk path; `ABSENT` for a ColumnSet-bound Field refuses |
| Ashlar | Reads at a pinned publication return the same rows as Ashlar's resolver path; a replaced or expired snapshot refuses; a renamed alias refuses; table identity changing between resolve and read refuses; empty publications return empty pages only when the resolver reports them complete; a continuation from another publication raises `StaleContinuation` |

## Precedence and Compatibility

Engine contracts retain execution authority and override this contract on any
conflict, which then refuses until reconciled upstream. A new engine version,
Weft backend version, binding version or catalog revision requires
requalification of the affected adapter scope.

## Error Semantics

| Code | Condition |
| --- | --- |
| `ADOPTION_INCOMPLETE` | Required witnesses or engine authority are missing; refuses adoption and preserves evidence |
| `ADOPTION_MISMATCH` | An adapter outcome differs from the engine's native path, or the engine returns a value the authored view excludes (such as Truss `ABSENT` for a ColumnSet-bound Field); refuses adoption, or the read at run time, and preserves evidence |
| `LEXICAL_SPELLING_REQUIRED` | A write through the Truss adapter would re-encode a value whose authored lexical spelling Truss requires to round-trip; refused before Truss admission |

Runtime errors keep the engine's classification and retry policy, surfaced through
the CONTRACT-072 outcomes and raised failures.

## Examples

A service calls `actions.ship_order(ShipOrderInput(...))` with a `TrussTarget`;
Truss authenticates and authorizes the caller from the connection the host
supplied (per-user or service, as Truss's own admission allows), commits, journals
and returns a receipt that
the client exposes as `Committed`. `ReplayingActions(truss_target)` offers the same
method with a required `idempotency_key`. The `Actions` client with a
`LakebaseTarget` runs the CONTRACT-073 native program instead; with an
`AshlarTarget` there is no `ActionExecutor` and neither client can be constructed.

## Validation Checklist

- [ ] Truss and Ashlar adoption designs exist in their own repositories.
- [ ] Each adapter passes the CONTRACT-072 conformance suite and its engine witnesses.
- [ ] Refusals for unpinned publications, stale identities and continuations, `ABSENT` on ColumnSet-bound Fields and lexical-spelling cases have fixtures.
