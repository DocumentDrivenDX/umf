# Exact original durable registry and standalone lifecycle budget

This is a proposed NEW typed original provider branch, not an implemented or
qualified ledger, filesystem API, ROOT resource kind or native effect permit.
It closes placement/birth/attempt/accounting details that method names alone
cannot supply. Old owner-ledger/logical-registry/ROOT formats remain exact.

## Original creation intent and birth

Under the SAME original `native-store-creation` scope, add the NEW intent
literal `umf.owner-table-recovery-store-create-intent/0.1`, EXACT
`{profile,store,evidence,providerDefinitionDigest,registryBirth}`. Store is
EXACT `{profile:"umf.native-row-originals-inventory-store/0.2",storeId,schemaName}`;
storeId MUST equal actual original providerId from evidence; schemaName is
exactly `umf_inventory_originals_` + its32 lowercase hex digits. Evidence is
the actual original closed native-store authority observation in pinned
owner_approval_core, not a supplied callback or successful record. The native
facade independently verifies the actual evidence before private core binding.
ProviderDefinitionDigest binds the complete fixed SQL/records/renderers. No
future native object OID appears. Old owner-store-create-intent0.1 stays exact
and is NOT extended to accept this different record/profile.

RegistryBirth EXACT `{profile:"umf.table-recovery-registry-birth/0.1",registryId,
relativeName,definitionDigest}`. RegistryId genuine original UUID allocated
under the signed original effect key; relativeName EXACT
`table-recovery-<storeUUID32>.json`; lock name is that name plus `.lock`.
DefinitionDigest hashes THIS registry grammar and the complete associated
R2 request/state/budget semantics. Actual path is resolved solely inside the
original already-owned ROOT/setup directory, never options, supplied absolute
path, environment search, a second issuer or discovery of matching old bytes.
One actual ROOT component slot `(providerId,storeId,"table-recovery-registry")`
admits one original registryId/path/birth. This NEW kind/definition must be
explicitly adopted/implemented in the actual ROOT/native creation protocol;
an old unknown-kind fallback is forbidden.

The original creation operation holds the original creator-PID/setup/resource
lease through birth and native confirmation. Original external scope4 request
and reservation FIRST durably bind the exact registry path/id/definition and
ROOT birth intent BEFORE the first ledger-file effect. Only that pending
original creator may create the regular0600 primary/zero-length0600 lock and
immutable header at that exact original path. No symlinks/hardlinks/FIFO or
path replacement, no runtime open-create, no missing-marker rebirth.
Native store SQL birth, actual positive COMMIT, independent fresh native
verification, original external confirmation and original ROOT birth
confirmation then bind the actual same store/schema/catalog/header/lock and
registry. Only after all of them may the fixed constructor register a mutable
R2 store/registry capability. No claim of filesystem/database atomic COMMIT.

Unknown SQL/file/root-confirmation resolves the SAME original creation
request/reservation/native store/birth/files, never repeats CREATE or changes
registry path/id. A pending original first birth may resume only from its
durably bound original intent and original still-pending bytes. Confirmed
missing primary/marker/lock/history refuses even with a fresh issuer; no path
search or caller-provided old-history hash. A positively known pre-confirmation
native abort retains the original birth identity/path and explicitly pending
state; retry/authorized cleanup requires original positive no-effect proof,
not replacement authority. This composes with adopted governing015 original
lease/checkpoint/fence semantics but does not assert the actual processor
already admits this NEW component kind.

Immutable header EXACT `{profile:"umf.table-recovery-registry-header/0.1",
registryId,providerId,storeId,targetCustodyDigest,ownerBootstrapContextDigest,
creationRequestDigest,creationReservationDigest,definitionDigest,purpose}`.
Every member is available before first native store effect; no eventual native
receipt/current-file hash/own header digest is included. Purpose and all
original identity/policy/key/context/actual supervisor/custodian links resolve
the original ROOT/issuer, not matching header bytes alone.

## Closed primary/journal grammar

Primary EXACT `{profile:"umf.table-recovery-original-registry/0.1",header,
requests,events,custodySequence,digest}`. Digest hashes complete RFC8785 object
with ONLY digest omitted; <=8MiB/depth64/nodes100000 and the actual tighter
original resource caps. Header is above. CustodySequence actual positive
original nonrewinding sequence. Requests<=4096 TOTAL, ordered by original
allocation; events<=4096 TOTAL, original append order. Exhaustion refuses,
never truncates original confirmed/aborted/unknown history. Atomic original
write/fsync/replace/directory-fsync/expected-prefix CAS under SAME original
RLock/flock is required. Same-store common/outer campaign allocation remains
the sole G10 time-grant allocator; this registry does not independently debit
the same phase again.

Each request entry EXACT `{effectKey,request,requestDigest,reservation,
reservationDigest,state,attempts,accounting,nativeOutcomeDigest,settlement,
custodySequence}`. Request is complete RecoveryRequest from lifecycle.md,
effectKey its exact derived tuple, requestDigest=H(request). Reservation is
null only prepared, otherwise original complete Reservation; digest equals
H(original reservation). State EXACT
`prepared|reserved|attempting|native-unknown|retry-eligible|native-confirmed|
settled-confirmed|settled-aborted`. Prepared has null reservation/digest,
empty attempts, no nativeOutcomeDigest/settlement. Reserved has original
reservation, empty attempts, no outcome/settlement. Attempting last attempt
dispatched; native-unknown last unknown; retry-eligible last positively-aborted;
these all have no nativeOutcomeDigest/settlement. Native-confirmed has last
positively-committed and actual original nativeOutcomeDigest but settlement
null. Settled-confirmed has actual native-confirmed outcome and settlement;
settled-aborted has positive original no-effect settlement and no successful
native effect. No inverse/null combination is accepted. Earlier attempts are
positively-aborted; once reserved, original reservation is never replaced.

Attempt EXACT `{attemptNumber,attemptGrantDigest,state,noncommitProofDigest,
nativeOutcomeDigest}`; state dispatched|unknown|positively-aborted|
positively-committed; positive sequential numbers1..4096, immutable original
grant reference. First two states nullable digests both null; aborted only
noncommitProofDigest non-null; committed only original nativeOutcomeDigest
non-null. Actual full native/driver/custody proof is retained; missing row,
timeout/exception or a submitted digest is not noncommit proof. Another
dispatch is possible only after original positive noncommit and enough
remaining SAME original signed budget. Unknown already occupies the grant.
Native-confirmed/private-pending settles this SAME entry/handle/request,
without effects or new grant. Settled handles are read-only.

Settlement EXACT `{profile:"umf.table-recovery-settlement/0.1",requestId,
requestDigest,reservationDigest,kind,status,nativeOutcomeId,nativeOutcomeDigest,
publicReceiptDigest,accountingDigest,custodySequence}`; status confirmed|aborted.
Confirmed resolves real original native outcome/COMMIT and actual metadata/
archive/carrier/value proof privately BEFORE fixed private binding/finish.
Aborted resolves actual positive original no-effect/native abort settlement.
PublicReceiptDigest is null for terminal aborted, otherwise hashes ONLY the
data-free public receipt. NativeOutcomeDigest is private; never export it
through a public phase/reference checksum. No settlement hashes itself or is
embedded in the native outcome it confirms. All original state/IDs/intent/
purpose/target/source/policy/phase/context correspond exactly.

Registry event EXACT `{sequence,previousDigest,requestId,kind,entryDigest}`;
kind prepared|reserved|dispatched|unknown|positive-noncommit|native-confirmed|
settled-confirmed|settled-aborted. EntryDigest hashes that complete entry
version, without hashing the primary/events/current file. First previousDigest
null; later points to complete previous event. Each event unique exact
sequence1..4096; append-only original custody, same original expected-prefix
CAS. Original event/history versions remain privately retained. Readonly
terminal lookup revalidates originals and returns same native UUID/time/
receipt with zero appends, allocation, value exposure or dispatch.

## Standalone lifecycle action policy and accounting

For plan-bound retirement/restoration accounting EXACT
`{kind:"inventory-phase",originalCampaignDigest,phaseId,phaseDigest,
attemptGrantDigest}`. It resolves the SAME original outer grant and actual
phase request. Several R2 effects in one required phase all reference that
ONE grant; they do not multiply/debit it. Native public budget receipt contains
ONE grant, outer current checkpoint counts ALL unique original grants across
preparation/business/aborts/unknown. Status/replay addsZERO.

Standalone purge/hold/policy/internal-anchor/dependency action selects NEW
LifecyclePolicy EXACT `{profile:"umf.table-retention-lifecycle-policy/0.1",
componentPolicy,statementTimeoutMs,lockTimeoutMs,lifecycleBudgetMs,maxAttempts}`.
ComponentPolicy is complete recovery Policy from lifecycle.md. Statement
integer1..min(300000,component.transactionTimeoutMs); lock1..min(statement,10000);
lifecycleBudget integer1..900000; maxAttempts1..4096. All explicit trusted
original values, no default or caller clock. Entire original component,
authority/clock/store identity/native/source/lifecycle caps remain conjunctive.
Request.executionPolicyDigest=H(complete LifecyclePolicy), while
componentPolicyDigest=H(componentPolicy). Signed payload binds the former.
These are DISTINCT exact policies; a component hash cannot stand in for the
complete standalone lifecycle execution policy.

Standalone original grant EXACT
`{profile:"umf.table-retention-attempt-grant/0.1",requestDigest,
reservationDigest,attemptNumber,executionPolicyDigest,reservedMs,
priorAccountingDigest}`. ReservedMs EXACT component.transactionTimeoutMs+
statementTimeoutMs, finite native-work+driver/settlement allowance. The WHOLE
grant must fit original remaining lifecycleBudget BEFORE BEGIN. Actual native
timer/one absolute host deadline and bounded driver/cancel/COMMIT waits apply;
no future measured COMMIT time is invented. Attempt receipt uses only this
one original grant. Standalone accounting EXACT
`{kind:"lifecycle",requestDigest,executionPolicyDigest,lifecycleBudgetMs,
grantDigests,chargedMs}`; chargedMs=SUM unique original full grants, including
aborted/unknown; full grant/proof bytes retained. Key `(requestDigest,
attemptNumber)` maps one immutable grant digest and vice versa. Missing/
duplicate/conflicting prefix/grant/CAS refuses. Replaying original native or
settlement chargesZERO; positively proved abort may allocate EXACTLY one new
numbered grant if current original policy/lifecycle still admits SAME intent.
No refund/new request/clock reset after unknown or to evade exhausted budget.

An acknowledged provider reservation may require its own metadata transaction
before the complete business-effect transaction. Its preflight, SQL, COMMIT,
observation and settlement time consumes the SAME dispatched original phase
or standalone grant and ONE absolute host deadline established before the
first SQL; it never allocates another grant or resets that deadline. Install
and verify the signed native session/timers before EVERY internal BEGIN;
statement, lock, driver, cancellation and COMMIT waits are clamped to the
remaining original deadline. All auxiliary work must fit the original grant.
The complete capture/drop or restore effects, proof, native outcome and
phase progress still commit in ONE business transaction. Reservation COMMIT
alone proves neither business success nor business noncommit. Preserve the
same active reservation after it; unknown business outcome blocks retry.
Only original positive no-business-effect proof permits the next numbered,
fully charged grant for the SAME request, never a new archive or recapture.
Repeated reservation acknowledgment creates no business receipt/completion.

The original actual custodian installs this typed registry/budget operation,
same-store atomic allocation and complete original clock/lease/pending/native
guard before use. Files/JSON/CAS prose here are not proof that this capability
exists. Full actual native+external+core recovery/clock/resource tests remain
unwaived. No product implementation or resource GO is implied.
