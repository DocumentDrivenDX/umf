# G11 concrete native ROOT session interface 001

Exact proposed host integration over the observed native-session seam002. This
implements013's missing exclusion/actual observation/binding, not a new physical
scope or a promise that missing store/subject origins exist. No source/native
qualification or resource GO is implied.

## One original target exclusion, no authority from a lock

Add fixed `LocalPostgresSupervisor.acquire_original_target_lease(custodian,
target_custody,*,timeout_ms=5000)` returning a context manager for an opaque
`_OriginalNativeTargetLease` registered by that SAME actual supervisor. Exact
LocalTargetCustodian and original target handle must match supervisor's retained
custodian/handle and original registered target. No Protocol, caller mutex,
connection, callback or path is accepted. Lease alone grants NO SQL/effect scope.

Use the ALREADY original existing owner-bootstrap-setup.lock as the underlying
control mutex, with qualified bounded acquisition, not its current helper alone.
Check original confirmed0.3 issuer/config/purpose/control path and actual private
regular single-link lock identity; open without O_CREAT/nofollow. Use the same
original per-path thread lock plus cross-process exclusive flock, LOCK_NB and
monotonic bounded wait1..30000ms. No new optional lock or first-use fallback.
Registry binds actual descriptor/inode, supervisor/target/custodian, process/
thread, purpose and active interval. Foreign, copied, expired, closed or nested
incompatible lease refuses. Descriptor/lock cleanup covers EVERY exception path.

All fixed supervisor physical mutators, custody mutations, store creation,
provision/transition and production ROOT/context-birth mutators for this owned
target must honor the SAME underlying control exclusion. Pre-registration
physical operations use the fixed private original-config exclusion internally;
they do not pretend an unregistered target handle exists. One-append journal
flocks do not implement this outer lease. Reentry is allowed only for the SAME
original operation/supervisor/thread through a retained internal handle, never a
new flock opened recursively. A different supervisor instance/process contends.

Create/reattach the original OwnerAuthoritySession BEFORE acquiring this lease.
Do not call the owner-session factory or setup settlement while holding it;
readonly validation of immutable original files is permitted. Acquire original
control exclusion BEFORE any journal/root/context/ledger lock; preserve013
release-before-other-lock ordering. Actual privileged-DDL/role actors must be
covered by the qualified controlled-host policy. This lock does not stop an
uncooperative superuser or establish an application ingress barrier. Unknown
external privileged writers make this profile unavailable, not silently safe.

## Fixed native observation and durable snapshot

Add fixed supervisor method:

```text
observe_generation_authority(lease,*,configuration,source_cohort)
    -> _OriginalGenerationAuthorityObservation
```

Configuration is proposed closed existing-head logical0.1 DATA. SourceCohort is
original host-owned reviewed source/bundle/install-reference, actual qualified
immutable artifact/module/session/approved execution-policy inputs. Data is not
authority: verify complete bytes, original artifact registry/qualification and
ONE complete approved tuple; never arbitrary import/connection/plugin lookup.
Reject fresh/null-head0.2 here until its separate G10 branch is adopted.

Inside the lease, use actual `_verify_live_process`, original launch/origin/
continuity, sockets/gate/HBA/path/settings and original custodian registration
resolution. `_observe_native` is supplemental actual physical observation; its
fresh connection is NOT the held scope. Attach one ORIGINAL private maintenance
connection, fixed controller SET ROLE and full qualified session settings to the
lease; expose neither cursor nor commit/SQL callback. Before BEGIN establish
transaction_timeout/statement_timeout/lock_timeout and finite host deadline,
then use actual READ COMMITTED and transaction_read_only=off as existing ingress
and head validators require. Do not claim READ ONLY/REPEATABLE READ equivalence.
This fixed observer executes only bounded metadata reads/locks and always
ROLLBACKs/closes its connection, including exceptions; it never commits DDL/data.

Native observer operation deadline is at most30000ms, tightened by original
configured limits. Clamp statement/lock/driver waits to positive remaining
bounds, checking before dispatch and result/capability issue. Keep actual private
connection/backend PID/start/database/XID identity. Use `read_table_head` and the
FULL catalog/role correspondence probe on this SAME transaction; retain its
actual lifecycle SHARE lock through ROOT confirmation/readonly context issue.
Do not use the short operation_steps as full catalog proof. No cached head,
sample, unverified source/reference or fabricated native witness suffices.

Verify actual original ingress-store schema/OIDs/full fixed shape/ACL/roles on
that SAME connection using its original authority/created-store identity; require
its REAL original positive creation receipt and actual current correspondence.
Pre-DDL `_OriginalStoreCreationAuthority`, `_schema_oid`, marker/name/current
shape or authority hash is NOT that receipt. The currently missing committed
creator/resolver is a prerequisite to implement, with no fallback manufacture.
Ingress marker/footprint stays its original branch, distinct from G04 COMMENT.

Observe EVERY configured stable subject's actual OID/name/seven flags, complete
memberships/effective privilege/SET/INHERIT/ADMIN reach, actual source/schema/grant
context and original ownership receipt. Never invent a role owner column or
ownership receipt from a current-name/flags hash. Initial enrollment requires
originally authorized legacy LOGIN/nonprivileged subjects. After a qualified
original preparation/activation, readonly recovery permits ONLY changes proven
by SAME original logical/native epoch/reservation/outcome history; do not force
original LOGIN flags after the approved operation disabled them. Preserve original
OID/groups/inherit. Subject/schema bootstrap remains a real separate prerequisite;
an acceptance fixture must create/capture genuine originally authorized births,
not pass source-test issuers or redefine an owner scope to authorize them.

Return only a native-supervisor-owned observation type/registry entry bound to
this active lease, exact original native objects/config/source/current facts and
owned full evidence bytes. Full native evidence includes actual kernel/target/
settings/custody/store/source/subject/privilege/connection observations, with no
credentials/private keys/business row values. Freeze its exact private encoding/
fixed SQL/census projection in the source packet and independently verify actual
coverage; a caller dictionary cannot supply a section or a successful observation.
NativeEvidenceDigest hashes those exact original owned bytes, not the expected
configuration projected back as observed facts.

Supervisor journal0.2 adds `generation-authority-observed` EXACT payload
`{purpose,observationId,configurationDigest,nativeEvidenceDigest,nativeEvidence}`.
NativeEvidence EXACT `{encoding:"base64",data}` preserves the complete owned
snapshot bytes in canonical padded RFC4648 base64. Decoded bytes<=4MiB, original
journal8MiB/4096 events and all source/whole-export limits conjunctive; unknown,
noncanonical/partial bytes refuse before ROOT request export. Actual native
observer alone appends/recovers this original event; digests/serialization cannot
mint an observation capability. No own event digest appears inside the snapshot.
On restart locate the SAME original event by its exact digest/ID and revalidate
current actual original continuity before reissuing an observation. Missing or
rewound original snapshot/history refuses; never synthesize it from current data.

## Confirmation, native association and resolver

External root signing wait occurs OUTSIDE the lease/transaction. Confirmation
reacquires a fresh original lease and reobserves actual facts against SAME
registered ROOT request/snapshot/signature. Retain the original signed evidence
digest; do not replace it with a later observation hash. Benign process/time
changes require positive original same-target restart/continuity; changed source/
subject/store/config facts refuse unless SAME original authorized lifecycle
history explicitly accounts for them. No comparison that permanently breaks
valid original prepared/active recovery or accepts arbitrary later changes.

Perform013 exact subordinate birth→ROOT confirmation→readonly context sequence.
Then fixed native method:

```text
bind_confirmed_generation_authority(lease,*,root_enrollment,context,
 logical_authority,observation) -> _OriginalGenerationAuthorityBinding
```

It verifies actual original confirmed ROOT registry/signature/config/0.3 owner
context, same signed contextId/trust identities and existing subordinate birth,
exact logical authority/context association, source tuple, target/custodian/store
and fresh original observation. It registers one immutable binding in the SAME
supervisor's private registry. It is never built from an entry ID, JSON, caller
constructor/seal or pure crypto/context object. Repeated binding reuses original
identities; context aliases/registries stay the SAME bootstrap-owned objects.

Implement the formerly missing fixed native methods, without dynamic callback:

```text
_resolve_generation_authority_enrollment(entry_id,supervisor,custodian,store,
 *,lease) -> SAME registered original ROOT trust entry
_verify_generation_authority_trust(entry,custodian,store,*,lease)
    -> _OriginalGenerationAuthorityObservation
```

Require actual class/object/registry equality, active original lease, original
ROOT entry/config/target/store and full current native checks. Resolve returns
only an already registered confirmed entry; it does not create it from the ID.
Bootstrap ROOT confirmation issues the original entry; native binding validates
and registers it. The upper session uses these actual methods, not getattr/name
or caller-bound functions. Its copied data projection may retain exact old
native-trust-observation0.1 keys, but only AFTER resolving the actual opaque native
observation. Compact custodySequence is original ROOT reservation sequence as010
requires, NOT the external physical journal sequence; retain that actual physical
sequence/head separately in full native evidence. No self-echoed projection is
proof of the native observation.

`generation_authority_session.py` owns the fixed public prepare/export/confirm/
recover/create-session orchestration. Returned session joins exact logical core/
context/root enrollment with this native binding; it exposes no user callback or
raw maintenance connection. Each production operation acquires fresh original
exclusion and revalidates native binding/current facts. Final native preparation/
activation separately requires original logical approval/reservation/native
outcome and actual ingress/barrier/transaction protocol; the ROOT observation
lease alone cannot authorize those effects or replace their phase policy.
Pure ConfiguredGenerationEnrollmentAuthority remains crypto/durable state only.

Native APIs may import bootstrap/logical leaves; those leaves never import the
native/session consumer back. Keep actual one-time original entry registration
and types concrete, no generic issuer/class registrar. Implement every positive
path above; a named fail-closed hook is not completion. Original committed ingress
store and subject/schema ownership birth, actual deployment origin and all native/
process/barrier/installed/platform/browser/CI/release gates remain mandatory.
