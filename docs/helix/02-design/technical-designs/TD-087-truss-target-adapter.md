---
ddx:
  id: TD-087
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-087
      kind: informed_by
    - id: SD-031
      kind: informed_by
---

# TD-087: Use the SDK against a Truss ontology

**User Story:** [[US-087-truss-target-adapter]]. **Feature:** [[FEAT-031]].
**Solution Design:** [[SD-031]].

## Scope

What UMF requires of a Truss adapter and what UMF itself builds for it. The
adapter code, its witnesses and its adoption design belong to the Truss
repository; this design does not specify Truss internals and does not amend
Truss contracts. UMF delivers the protocols (CONTRACT-072), the conformance
suite, catalog support for Truss targets and the adoption packet format
(CONTRACT-069).

## Technical Approach

**Division of work.**

| Work | Owner | Where |
| --- | --- | --- |
| `ReadTarget`, `ActionExecutor`, `ReplayingActionExecutor`, `BulkTarget`, `ManifestBulkPlan` protocols; outcome types | UMF | `python/umf_access/protocols.py` |
| Shared conformance cases and their self-test | UMF | `python/umf_access/conformance/` |
| Catalog build for `truss` targets (Weft Truss runtime and mutation backends) | UMF | `python/umf_access/build/` |
| Adoption packet schema and checker | UMF | `python/umf_access/adoption.py` |
| `TrussTarget` adapter, value conversion, native fixtures, engine witnesses | Truss | Truss repository, per its adoption design |

**Reads.** The catalog build compiles each query through Weft backend
`truss.postgresql.runtime` with `truss-runtime-binding/0.4` (currently backend
0.4.3, target `truss-runtime-pg18.6/0.4`) against Truss's accepted catalog
revision. The target identity carries the backend and binding versions and the
revision; a mismatch raises `NotCompiledForTarget`. `TrussTarget.execute_read`
hands the catalog statement and bound parameters to Truss's read execution path,
which applies its admission, session settings and decoders and every Weft host
obligation. The adapter itself issues no SQL.

**Actions.** `TrussTarget` is a `ReplayingActionExecutor`. `invoke` submits the
action identity and encoded input, and `invoke_keyed` also the idempotency key,
to Truss's protected action admission. Truss authenticates the subject from the
captured native connection, authorizes against its enrolled role bindings,
evaluates, commits, journals and emits feed entries. The adapter maps Truss's
result through the CONTRACT-072 tx/1 table:

| Truss result | Outcome or raised failure |
| --- | --- |
| tx/1 `committed` | `Committed(output, receipt)` with Truss's receipt unchanged |
| tx/1 `rejected` with a declared code | `Rejected(code)` |
| Equal keyed request returning a retained outcome | `Replayed(original)` when Truss's result identifies the replay; otherwise the original outcome as returned |
| CONTRACT-004 `retry` (serialization failure or deadlock) | `Conflict(retained=False)` |
| tx/1 `conflict` (including `request_conflict` and `version_conflict` codes) | `Conflict(retained=True)` under an idempotency key, otherwise `Conflict(retained=False)`; Truss's code kept; never `Committed` |
| `commit_unknown` or tx/1 `indeterminate` | `Indeterminate` |
| tx/1 `denied` | `Denied` |
| tx/1 `unsupported`, `expired` | `ActionRefused` with Truss's code |
| tx/1 `failed`, other Truss errors with a known rollback | `ActionFailed` with Truss's code and error |

`TrussTarget.validate()` sends the action identity and encoded input to Truss's
action preview operation, never to admission, and maps Truss's findings to
`ValidationResult` failures with Truss's codes. `complete` is copied from what
Truss reports: true only when Truss says it evaluated every check, false when its
preview stops at the first failure (US-087-AC8).

Only concurrency conflicts become `Conflict`. A failure injected before COMMIT
keeps Truss's classification: a confirmed rollback with no effects, raised as
`ActionFailed`, never relabeled `Conflict` (CONTRACT-069). The adapter never
retries.

**Bulk.** Commands compile through Weft's Truss mutation backend
(`CurrentTrussMutationBackend`, Weft CONTRACT-009). `TrussTarget.plan` returns a
`ManifestBulkPlan` whose `preview()` uses Truss's read path, `seal()` asks Truss
to materialize and seal a CONTRACT-903 manifest and returns it, and
`submit(manifest)` hands the sealed manifest to Truss's CONTRACT-904 `submit` with
a caller key and returns a `BulkJob` with the job reference and its reported
status. The plan has no `execute()`. Batches are then claimed and executed by host
workers through Truss; the SDK runs no worker loop and holds no fence or lease.

**Values.** The adapter converts between CONTRACT-068 carriers and Truss's public
carriers (`MISSING` and Truss's absent marker, exact text tokens, `Decimal` and
`datetime`). Where Truss's value definition requires authored spelling to
round-trip (CONTRACT-010 exact decimal tokens and offset-bearing timestamps), the
adapter refuses any write of that Field before admission with
`LEXICAL_SPELLING_REQUIRED`, because a decoded `Decimal` or UTC-normalized
`datetime` cannot carry the original spelling. If Truss returns `ABSENT` for a
Field bound by a relational ColumnSet, the read refuses with `ADOPTION_MISMATCH`.
Truss's runtime currently refuses entity projections with timestamp or binary
fields and returns exact tokens as text values, so such Records stay unqualified
on Truss until T-1.

**Adoption packet.** `{contract, engine, engineVersion, adapterVersion,
runtimeAbi, catalogTargets, nativePins, authorityRefs, conformanceEvidence,
outcome}` per CONTRACT-069. UMF's checker refuses `qualified` unless every
conformance case and every Truss witness in STP-087 has a passing receipt for
the exact pins.

Trade-off: the adapter only translates; every guarantee stays with Truss. This
costs parity tests against twin stores but keeps one implementation of each
protected behavior.

## Component Changes

UMF planned files (none exist yet): `python/umf_access/protocols.py`,
`python/umf_access/conformance/{reads,actions,bulk,values}.py`,
`python/umf_access/conformance/selftest/` (deliberately faulty fake targets that
the suite must fail), `python/umf_access/build/truss.py`,
`python/umf_access/adoption.py`. No Truss file is created or edited from UMF.

| AC | Component realization |
| --- | --- |
| US-087-AC1 | Truss catalog targets in `build/truss.py`; `conformance/reads.py`; Truss witness for read-path-only SQL |
| US-087-AC2 | `conformance/actions.py` admission cases; Truss witness comparing with the native client |
| US-087-AC3 | Truss twin-store parity witness; receipt check in `conformance/actions.py` |
| US-087-AC4 | `conformance/actions.py` conflict, pre-commit fault and commit-loss cases with Truss classification table |
| US-087-AC5 | `conformance/actions.py` replay cases (enabled for executors that support keys) |
| US-087-AC6 | `conformance/bulk.py` Truss-plan cases; Truss twin-store bulk witness |
| US-087-AC7 | `conformance/values.py` lexical-spelling refusal case; Truss value-definition fixture |
| US-087-AC8 | `conformance/actions.py` validation cases honoring `complete`; Truss witness comparing with its native preview |

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| Target protocols, outcomes, conformance suite | CONTRACT-072 | What `TrussTarget` implements and must pass |
| Truss adapter conformance, witnesses, packet | CONTRACT-069 | Adoption decision |
| tx/1 results, replay | CONTRACT-900, CONTRACT-901 | Meaning of Truss action results |
| Manifest and bulk coordination | CONTRACT-903, CONTRACT-904 | `seal()` and `submit()` |
| Truss read, admission, journal, feed, values | Truss CONTRACT-002/004/006/007/009/010, action-subject-authority proposal | Engine authority |

Remaining contract gap: tx/1 results carry no replay marker, so CONTRACT-072
`Replayed` is only observable if Truss's admission API reports it. The tx/1
mapping, `LEXICAL_SPELLING_REQUIRED` and the `ManifestBulkPlan` surface are
defined by CONTRACT-072 and CONTRACT-069.

## Data Model Changes

None in UMF core or Truss storage. Catalog entries gain `truss` targets; the
adoption packet is a new UMF evidence artifact.

## Integration Points

Truss T-1 (public read, action admission and bulk APIs; adoption design), Truss
subject and role enrollment, Weft Truss runtime and mutation backends. Weft's
current Truss mutation domain is required singular string and boolean fields, so
integer bulk predicates refuse on Truss until Weft extends it.

## Security

The adapter submits only catalog statements and protected API calls; generated
code receives no table handles, write-privileged connections or ORM mappings.
Subject identity comes from Truss's captured native connection, never from
request fields or actor strings. Conformance fixtures use owned isolated stores
and never production credentials. Errors keep Truss's protected-safe codes and
do not reveal hidden existence.

## Testing

| AC | Test | Assertion | Owner |
| --- | --- | --- | --- |
| US-087-AC1 | `truss_reads_use_truss_read_path` | Rows equal Truss read path; statement log has only read-path statements; pin mismatch refuses | UMF conformance; Truss witness |
| US-087-AC2 | `truss_action_admission_matches_native` | Per-subject outcome equals native client; codes unchanged | UMF conformance; Truss witness |
| US-087-AC3 | `truss_commit_parity_with_native_client` | State, journal, feed and ACK equal on twin stores; receipt equals Truss's | Truss witness |
| US-087-AC4 | `truss_conflict_and_failure_classification` | `ActionConflict`; pre-commit fault raises `ActionFailed` with Truss's classification and leaves no effects; `ActionIndeterminate`; no retry | UMF conformance; Truss witness |
| US-087-AC5 | `truss_idempotent_replay` | Original outcome byte-equal; request-conflict refusal; no new journal or feed entry | UMF conformance; Truss witness |
| US-087-AC6 | `truss_bulk_manifest_parity` | Sealed manifest, submitted `BulkJob`, batch outcomes and job status equal Truss's bulk path | Truss witness |
| US-087-AC7 | `truss_lexical_spelling_refusal` | `LEXICAL_SPELLING_REQUIRED` before admission; no write; read decodes | UMF conformance; Truss witness |
| US-087-AC8 | `truss_validate_maps_preview` | Findings equal Truss's preview; `complete` as Truss reports; no admission, state, journal or feed change | UMF conformance; Truss witness |

STP-087 owns the authoritative allocation between UMF and Truss.

## Migration & Rollback

The adapter is opt-in. If adoption is refused or later requalification fails,
applications keep or return to Truss's native client; nothing in Truss storage
changes. Reverting the SDK does not undo committed Truss effects.

## Implementation Sequence

1. UMF: protocols, conformance cases and the self-test that fails faulty fakes.
2. UMF: Truss catalog targets and the adoption packet checker.
3. Truss: adoption design, adapter and witnesses in the Truss repository.
4. Truss: run the suite and witnesses; record the packet with exact pins.

Prerequisites: US-083, US-085, US-086, Truss T-1.

## Risks

Truss's public action admission and delegation are not yet complete; until they
are, actions and bulk stay `ADOPTION_INCOMPLETE` while reads may qualify alone.
Twin-store parity needs deterministic identity allocation in fixtures. The
lexical-spelling refusal may block many writes until the owner selects a
lexical-preserving carrier.
