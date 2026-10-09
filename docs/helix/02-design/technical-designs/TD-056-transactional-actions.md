---
ddx:
  id: TD-056
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-056
      kind: informed_by
    - id: SD-008
      kind: informed_by
    - id: CONTRACT-053
      kind: references
    - id: CONTRACT-052
      kind: references
    - id: ADR-002
      kind: references
---

# TD-056: Reference transactional action consumer

**User Story:** [[US-056-transactional-actions]]. **Feature:** FEAT-008.
**Solution Design:** [[SD-008-declarative-actions]].

## Scope

Implement the full bounded CONTRACT-053 reference profile in host-side tooling.
PostgreSQL 17.9 is the first candidate native qualification. Portable `src/` retains
pure declaration and interpretation functions; it receives no database/process APIs.
This implementation is a qualification consumer, not a production UMF service.

## Technical Approach

Pin PostgreSQL READ COMMITTED isolation; schema guards refuse unqualified isolation.
The global registry serializes new store identity insertion only; existing independent
store updates must not take it. Native tests observe identical-insert contention and
a different store completing while the first remains locked. Use an actual database
transaction with a store-control row locked before canonical
identity resolution, policy recheck, state freeze and business execution. All qualified
native writers and membership changes share that boundary. Whole-store serialization
trades throughput for a small inspectable invariant boundary; parallel stores remain
independent. Ordinary outside writers, triggers and cascades are unsupported until
separately instrumented and qualified. Native uniqueness/FKs remain backstops. Payloads and identities use admitted
lossless JSON text before UTF-8 storage: NUL/lone-surrogate strings never enter
PostgreSQL JSONB or raw identity text. Bounded SHA-256 lookup indexes route
collision buckets; exact retained identity comparisons establish equality. Physical
row IDs are storage surrogates, not allocated business Keys. Schema-owned native
lock/uniqueness guards have explicit tests, including forced digest collisions;
arbitrary additional triggers remain unsupported.

Resolve primary and alternate core Keys to one native entity under that lock. Never
infer alias equality across different Key IDs outside the store. Absent creates require
the qualified primary Key. Freeze selected identities, union alias permissions while
keeping reads/writes separate, and enforce deleted-instance use tracking canonically.

Install an independent executor-controlled action-family replay-discovery roles/1
binding. Check its current membership under the control lock before token SQL
access in lookup and keyed invocation. This grants principal-scoped presence
visibility only; original-revision authorization continues to protect results,
conflicts and expiry details. Revisions never implicitly mutate discovery grants.
Discovery configuration/disable and membership changes advance the same policy
version and serialize with accepted work. Native restricted-SQL-role witnesses
must prove unauthorized lookup never reads outcome/revision tables, including
retained, missing, tombstoned and unknown-revision cases across changing policies.

Keep immutable full-source revisions independently of deployments. Current membership
is checked before protected replay lookup and again under the committing boundary.
Fingerprint original-revision typed intent and frame-version assertions canonicalized
by combined declaration order (reads then writes); request array order is nonsemantic.
Reject duplicate/unknown frame IDs and test reordered retained retries explicitly.
correlation and calling service are not replay scope. Retired snapshots remain available
for retained interpretation; unavailable snapshots refuse. Expiry creates durable
recognition/tombstones, never a missing token eligible for accidental reexecution.
The PostgreSQL reference consumer publishes a token horizon equal to the lifetime
of the store/token namespace. There is no time-based token reuse or tombstone
purge. Visibility expiry retains immutable recognition and returns TOKEN_EXPIRED
for both the original and changed intent after current authorization, including
through a fresh consumer. A separately qualified new namespace requires explicit
operator selection; restore or epoch rotation alone does not establish one.

Run recipes through an instrumented candidate-state gateway; verify every primitive,
net changes, constraints and postconditions before persisting. Handlers use the same
gateway through an authenticated bounded stdin/stdout protocol in a separate container.
The container has no network, DB secrets/socket, writable host files or broad mount.
Malformed/unauthorized/outside-frame requests abort even if the handler later restores
the data. Enforce operation/time/memory bounds and output admission. Existing entity outputs use only exact admitted input/READ identities,
or READ-selected alternate Keys whose component Fields are all readable; created
candidates may return their verified Keys. Do not query arbitrary handler-returned
Keys to validate existence: this would expose hidden business state through
commit/failure. Validate complete typed Key components before CREATE encoding
and normalize known value/constraint failures without hiding unknown semantics.

The reference consumer offers an operator-owned durable deployment catalog,
scoped to the same native store control lock as admission. Publication validates
exact id/version/build/source and stores canonical member order. Native guards
preserve source and forbid deletion or reactivation of retired builds. Fresh
admission loads a catalog row after authorization and pins a singleton copy of
that exact program in a host-only capability associated with the prepared object;
it is absent from serialized metadata. Authoritative freezing also compares the
prepared deployment to the retained revision deployment. Invocation and preview
recheck the durable lifecycle; retained terminal replay does not need executable
handler availability. The operator API is not a caller installation endpoint.

Handler launch admission uses a private, durable cap-one ownership slot shared
by every consumer process for the same installation. The trusted operator sets
`UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY` to a stable local directory; the default
is the checkout's `.cache/actions-reference-launch-owner`. Ownership is synchronized
to disk before Docker mutation, with mode 0700 directories and 0600 records.
The owner pins one resolved local Unix Docker endpoint and the observed daemon ID.
Remote Docker endpoints and concurrent unresolved launch admission refuse.
A nonce-specific child directory binds the immutable record and acknowledged
container ID; stale acknowledgements and release cannot overwrite a subsequent
owner. Process death does not expire ownership or silently reopen admission.

The supervisor copies the exact reviewed program before any asynchronous work.
It creates an inert container, persists the acknowledged immutable container ID,
then starts only that ID within the deadline. Program source and private inputs
are transmitted only after authenticated bootstrap readiness. An unacknowledged
CREATE retains the fence and reports pending cleanup, never confirmed absence.
Recovery requires the original CREATE acknowledgement or its durable retained ID,
verifies the pinned daemon and owned container name, removes that ID and independently
confirms absence before releasing admission. Recovery is a trusted operator API.
A replacement name, changed daemon, malformed record or absence without an original
acknowledgement cannot establish recovery. Whole-host failure and arbitrary filesystem
failure remain outside this process-restart qualification. Bun 1.4.2 is pinned for
host/Linux tooling and the native Docker fault transport; Bun 1.3.14 did not pass
its Linux delayed-START attach witness.

Treat commit acknowledgement separately from durability. Retry only known serialization/
deadlock rollback, at most three total attempts. An unknown commit result becomes
indeterminate; keyed lookup/replay recovers its original result after restart.

Fresh invocation must qualify the entire selected declaration and all inventoried
model/rule dependencies before using narrow compilers or input admission. A true
rule with an unused unknown declared dependency, or an omitted optional parameter
whose Field has unknown meaning, must refuse before any handler or native write.

Store commit versions and selected-resource versions have distinct internal meaning.
A net business change advances one store commit sequence; only actually changed
resources receive its new opaque stamp. Link-only changes invalidate the qualified
association observations on both endpoints without inventing property changes in
the reported net change list. Canonical aliases share one resource stamp. Restored
net no-ops advance neither store nor resource versions, though immediate primitive
verification and terminal replay records persist. Native tests must observe each case.
Unknown commit status never auto-executes again, including requests without replay
keys; those return indeterminate and have no keyed at-most-once guarantee.

## Component Changes

| Component | Responsibility | Criteria |
| --- | --- | --- |
| `scripts/actions-reference/store.sql`, `store.ts` | Qualified native invariants, epochs, control locking, canonical aliases and persisted revisions | AC5/6/8/9 |
| `protocol.ts`, `authentication.ts` | Exact logical requests, trusted human/service context, typed intent and protected outcome lookup | AC3/4/5/6/10 |
| `gateway.ts`, `executor.ts` | Frozen frames, ordered recipes, rule state, output/postcondition verification, terminal atomicity | AC1/2/3/7/8/9/11 |
| `sandbox.ts`, `launch-owner.ts`, `handlers/` | Isolated allowlisted deployment, bounded authenticated gateway messages | AC7/9 |
| `projection.ts` | Deduplicated contiguous prefix, atomic content, store/epoch receipts | AC12 |
| `tests/actions-reference/` | Actual PostgreSQL histories, subprocess/security/rollback witnesses and independent negative controls | AC1–12 |

## API/Interface Design

Use logical invoke/lookup/preview/readAtLeast and exact outcome distinctions from
CONTRACT-053. Authentication is a separate trusted issuer input, not request metadata.
No new public portable export or network endpoint is required for this story.

## Data Model Changes

The migration creates store control, policy membership, immutable revision snapshots,
entities, unique native Key aliases, relationship instances, replay outcomes/tombstones,
protected audit, committed outbox and projection state. SQL is in `store.sql`; the host codec is `codec.ts`;
all mutations use the qualified boundary. Net no-op persists its terminal outcome
without advancing business version or publishing a business-change fact.

## Integration Points

Pure UMF admission/evaluation -> controlled host gateway -> PostgreSQL transaction.
Trusted deployment registry -> isolated handler process -> authenticated gateway only.
Atomic outbox -> deduplicated projection consumer -> matching store/epoch receipt read.
Opaque versions have immutable exact native epoch/version-to-sequence records,
including baseline sequence zero and net no-ops. Store creation and command receipt
allocation are transactional; a failed candidate cannot publish a receipt mapping.
Outbox facts use `umf.actions.native-facts/1`; committed facts and queued event
bodies cannot be mutated or deleted through the qualified boundary.

The host-only `umf.actions.native-graph/1` projection covers all native entity fields,
resource versions and directed links. Registration takes a locked authoritative
head snapshot at prefix B, preserving untouched seeds that emit no outbox events.
A trusted worker fetches authoritative outbox positions rather than accepting caller
fact bodies. Per-projection/epoch/sequence deduplication retains exact facts and
applies only prefix+1, publishing content and prefix atomically. Unknown selected
fact meaning is retained and refuses interpretation without prefix advancement.
A separate full-projection reader role, using a three-component operational policy namespace distinct from every two-component business audit family, authorizes before receipt/prefix/content
access. Pending reads never fetch live business state to disguise lag. Physical
restore must be qualified while the target is unavailable to executors; persist a
fresh epoch and permanent uncertain-restore invocation fence before exposing the restored database. `fenceRestoredDatabase` covers every retained business and administration namespace while the database remains offline; the registry and all control rows share one transaction. Replay discovery bindings are preserved but disabled, because backup-era membership can revive a revoked principal. Current authority must be explicitly reconciled before trusted discovery re-enablement. Operational attempt reads deny while their administration namespace is fenced. An older
backup can erase a previously stored fence. Missing post-backup history remains
unresolved; neither epoch rotation nor a missing token permits fresh execution.
The explicit new-namespace procedure mints a label/UUID store identity and fresh epoch rather than reusing a caller-selected historical namespace. Under the original control lock it validates the supplied document, the native boolean/integer/string scalar subset, complete primary/alternate alias inventory and every entity’s incident graph, including isolated required degrees and both-endpoint Record orientation. It refuses Record references outside this bounded genesis subset and never silently repairs aliases. It atomically reseeds all fields and directed links with remapped native IDs and fresh resource versions at sequence zero. No original outcomes, authority, deployments, revisions or projection rows migrate; these require explicit fresh provisioning. The original namespace remains permanently fenced. Local immutable epoch history only certifies the trusted rotation API; a backup cannot reconstruct missing external history. Offline exposure control, trusted operator identity and probabilistic UUID freshness remain explicit boundary assumptions.
Unavailable database/runtime/retained interpretation yields explicit refusal or known
failure; no in-memory fallback claims durable execution.

## Security

Verify credentials with the trusted test issuer; bind tenant, human and service separately.
Do not log raw parameters or expose protected audit through ordinary results.
Audit headers and result details have independent reader-role requirements, configured
by the trusted operator per store/action family. Invoke and replay roles grant neither.
Audit reads hold the store control lock through current tenant/role checks and row
selection, with all denials before protected audit SQL. Header-only readers query a
separate immutable header and never select stored result details. Unknown header
meaning or incompatible representation refuses explicitly while retaining its source.
Audit visibility retention pins each row’s deadline at insertion using the native
clock and the trusted family policy (default 30 days). Later policy changes cannot
extend existing deadlines. After current authorization, the reader atomically observes
expiry using PostgreSQL statement time before selecting protected payload; observed
expiry is irreversible. A read admitted before its deadline may finish later. This
controls visibility and preserves the retained content; it does not erase content.
`umf.actions.attempt-observation/1` is the reference consumer’s independent,
best-effort observation policy. Each invoke attempt has immutable started and
observed records; an acknowledged append is durable, but outages can lose records
and a surviving start without an observation means unresolved knowledge. Caller
inputs are copied and credentials authenticated synchronously before the first
telemetry await. Retry attempts use distinct executor IDs; terminal audit and an
uncertain observation can share an ID without making the same durability claim.

Observation appends use their own connection and transaction, with native 500 ms
statement/lock limits and a 1,500 ms acknowledgement deadline under a running host
event loop, followed by immediate driver close. A telemetry or diagnostics failure
cannot change a business result, enter its retry classification, or create a business
commit. Arbitrary trusted replacement sinks and stalled hosts have no end-to-end
wall-clock bound. No raw credentials, token, inputs, policy objects or exception
messages are retained. Requested target is distinct from authorized original
revision attribution; unavailable metadata is explicit null. Only exact bounded
handler deployment identities enter telemetry; unknown content remains retained
in the revision. Preview performs no observation writes.

An operational reader is bound by the trusted host to an administration store;
its header/detail roles are independent of requested business store/family and
invoke/replay roles. Authorization precedes journal row lookup. A locked row
establishes existence before native expiry classification, preventing a concurrent
insert from appearing after an earlier expiry decision. Deadlines are pinned at
insertion (default 30 days); observed expiry is irreversible and retains content.
Unknown/inconsistent header profiles and malformed authorized details refuse
explicitly without altering source. This is visibility retention, not erasure.
Store role
and revision changes take the same lock. Deployment code/build is allowlisted independently
of document strings. Sandbox mounts only its reviewed code; process capabilities never
include a DB connection. Runtime qualification includes adversarial access attempts.

## Performance

No throughput target is accepted. Qualification uses bounded fixtures and records observed
latency. CONTRACT-053 expression/frame/operation limits remain mandatory. Whole-store
locking is an explicit first-adapter tradeoff; contention optimizations require equal
native invariant and revocation evidence before adoption.

## Testing

STP-056 allocates all twelve story criteria and EX-01–05 runtime witnesses. Independent
checks read native rows/audit/outbox after concurrent sessions and process failures;
return-value assertions alone are insufficient. Mutation controls deliberately remove
authorization fencing, alias canonicalization, terminal atomicity and prefix checks.
Their histories must fail. Formal model traces are separate bounded evidence.

## Migration & Rollback

Use an ephemeral isolated store for qualification. Revision changes create new snapshots;
never mutate a token's declaration. A store restore first persists an invocation fence whenever business/outcome
consistency is uncertain. A new epoch invalidates old visibility receipts but does
not clear that fence. Resume only after independently verified business/outcome
reconciliation, or under an explicitly qualified new store/token namespace; neither
is inferred from a missing token or epoch change. Retained replay recognition is
reconciled according to the qualified horizon. Rollback stops new
admissions and preserves snapshots/outcomes; deleting retained intent is not safe rollback.

## Implementation Sequence

1. Store migration and native transaction/alias checks; establish red runtime tests.
2. Authentication, revisions, replay and exact protocol admission.
3. Frozen state/gateway, recipes, rejection/postcondition/output verification and preview.
4. Isolated handlers, concurrent revocation/invariants, rollback/retry/ack failure injection.
5. Audit/outbox/projection/epoch checks, independent mutants and exact versioned evidence.

## Risks

Store-lock bypass, host capabilities leaking into handlers, approximate typed equality,
incorrect restore/replay retention and projection holes are certification blockers.
No earlier SQL prototype or metadata compatibility claim discharges these risks.
