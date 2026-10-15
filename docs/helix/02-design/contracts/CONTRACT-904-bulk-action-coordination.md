---
ddx:
  id: CONTRACT-904
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-902
      kind: informed_by
    - id: CONTRACT-903
      kind: informed_by
    - id: CONTRACT-900
      kind: informed_by
    - id: CONTRACT-901
      kind: informed_by
    - id: FEAT-900
      kind: informed_by
---

# CONTRACT-904: Bulk action coordination and replay

**Version:** proposed `umf.actions.bulk/1`; single-store companion to `umf.actions.tx/1`.

## Purpose

Define the execution protocol for one frozen manifest: serial atomic batches, durable original-outcome recovery and cancellation fencing. It adds coordination guarantees while retaining all underlying action obligations.

## Scope and Boundaries

The host owns job registry, scheduler and workers. The executor owns trusted namespace registration, action registry/current authority, native transaction and durable batch/action outcomes. First proof requires control and outcome state participating in the same qualified store transaction as graph effects. No external queue acknowledgement is a business commit. Whole-job atomicity, distributed transactions, compensation and parallel batches are excluded.

## Normative Surface

Profile, Artifact, ManifestRef and diagnostics are CONTRACT-902/903. Identity strings are 1..256 UTF-16 units; caller key is 1..1024. Fences use exact unsigned decimal text, incremented without wrap, never JSON numbers. All requests use `protocol:"umf.actions.bulk/1"`. Host-established trusted tenant/store/epoch/principal/job namespace is supplied out of band, never trusted from document input. First action attribution requires a human plus authenticated worker/service; workers cannot impersonate the initiating principal.

| Operation | Required request members besides protocol | Complete result union |
| --- | --- | --- |
| submit | `key:string,manifest:Artifact` | `{status:"submitted",state:JobStatus}` or Refusal or `{status:"conflict",code:"TOKEN_REUSE"}`; equal retained submission returns the same job and its full currently authorized state or ControlUnknown or ControlFailure |
| claim | `job:JobRef` | `{status:"claimed",job:JobRef,batch:integer,fence:string,leaseUntil:string}` or `{status:"idle",job:JobRef}` or Refusal or ControlUnknown or ControlFailure |
| execute | `job:JobRef,batch:integer,fence:string` | BatchOutcome or `{status:"indeterminate"}` or Refusal |
| lookup | `job:JobRef,batch:integer` | BatchOutcome or `{status:"not-found"}` or Refusal; never executes |
| reconcile | `job:JobRef` | JobStatus or Refusal; settles original custody only, never applies business work or ControlUnknown or ControlFailure |
| cancel | `job:JobRef` | `{status:"cancel-requested",job:JobRef}` or JobStatus or Refusal or ControlUnknown or ControlFailure |
| status | `job:JobRef` | JobStatus or Refusal |
| recoverControl | `recovery:ControlRecoveryRef` | Original retained ControlResult or ControlUnknown or Refusal; never repeats control/business mutation |
| review | `job:JobRef` | `{status:"review",state:JobStatus,manifest:Artifact}` or Refusal; separately authorized protected read |

ControlRecoveryRef is `{id:string,operation:"submit"|"claim"|"cancel"|"reconcile"|"materialize"}` with an issuer-assigned immutable ID in the trusted original control-attempt namespace. ControlUnknown is `{status:"indeterminate",recovery:ControlRecoveryRef}`. ControlFailure is `{status:"failed",code:string,recovery:ControlRecoveryRef}` and requires independently confirmed original control rollback/noncommit. It is not a business batch failure and never asserts native business termination. No failed result is synthesized from timeout or missing outcome. ControlResult is EVERY non-unknown result of the named operation above, including original submission conflict, Refusal, ControlFailure and materialize's sealed/refusal/known-failure result in the executor adoption contract; operation must match the original recorded request/result. This is safe custody correlation, not a principal, native transaction label or permission.

Mutating control operations and materialize require an original host-issued control-attempt capability out of band. Before dispatch the qualified host durably retains exact original request bytes, operation, authenticated human/service, store/epoch and actual original native control-transaction custody in its recovery registry and assigns the recovery reference. Failure/uncertainty in establishing that original registration forbids dispatch. Retrying the SAME capability returns/reconciles the original control result and cannot issue another claim/fence/job or repeat seal/cancel mutation; a caller-created reference or changed intent refuses. Persist the complete original ControlResult atomically with its native control mutation: submit job/intent and sampled JobStatus, claim fence/lease, cancel/reconcile state, or materialized manifest/seal. A native control commit without its complete immutable result is not an admitted operation. Refusal/conflict observations with no mutation retain their complete original result through the qualified control-outcome boundary before a known acknowledged response. Never reconstruct an original result from a later job state. After confirmed rollback with no original result, persist/return ControlFailure with the same recovery reference and protected-safe code PAP_CONTROL_NONCOMMIT under its independently confirmed original termination; unknown result-persistence stays ControlUnknown. A transport no-response also retains that reference and exact original request. recoverControl checks current original-operation authorization before observing protected custody/results; original native commit/rollback evidence and exact retained result must settle it. Missing result/status/expired lease is insufficient. If result/custody cannot be recovered, it returns the same ControlUnknown and blocks unsafe reapplication. Original control-attempt replay/recovery takes precedence over fresh operation semantics: it returns the same original sampled result, not a later state. A NEW control-attempt capability with the same retained submit key/manifest queries the same original job's current authorized JobStatus; it creates no second job. Retained sampled states/claims are observations, not renewed authority/lease or execution permission. The first profile does not automatically retry a confirmed failed control attempt; a separately authorized new attempt may be requested only after original noncommit is positively established. The host's qualified original connection/issuer/recovery mechanism, not model metadata, owns this capability. US-049 owns original registration; US-048 owns acknowledgement-loss/control-result reconciliation witnesses. Pure validation only checks union shape.

Refusal is available on every operation. denied maps AUTHORIZATION, unsupported maps stale/absent fence PAP_FENCE, wrong batch PAP_ORDER, cancelled admission PAP_CANCELLED, retired revision REVISION, unavailable original custody/profile PAP_RECOVERY/PAP_PROFILE/PAP_NAMESPACE; expired maps TOKEN_EXPIRED. A refused outsider, stale claimant or wrong-order request MUST NOT alter valid job control state. Trusted original-subject/action admission loss after a valid claim durably stops future admission under the control boundary; if control settlement is unknown, return indeterminate and retain reconciling, not a false known refusal/stop.
JobRef is `{namespace:string,id:string}` where both are executor-assigned immutable opaque identities. namespace and id MUST each match `[A-Za-z0-9_-]{1,128}` so the reserved item-token encoding is injective. Scope includes trusted tenant/store/epoch/principal; service does not create another replay namespace. Submit first checks current human/read authorization and exact executor-retained seal custody from CONTRACT-903 (same issuer, initiating human, store/epoch and full bytes), then admits the original intent. ManifestRef plus complete original manifest bytes is submit intent. Equal original submission replays the same job; changed bytes under retained key conflict even if independently semantically equivalent. Digest is routing/integrity, not the sole equality or authority check. Job controls and original byte custody must be durable before queued is returned.

`BatchOutcome` is one of:

- `{status:"committed",job:JobRef,batch:integer,manifest:ManifestRef,items:{ordinal:integer,result:Committed}[],receipt:Receipt}`; Committed is the complete original tx/1 result including effect verification and no-op; all results and the batch receipt commit with effects. One result per original item, in order. A wholly no-op batch still has a durable terminal result, no fabricated business-change event.
- `{status:"conflict"|"rejected",job:JobRef,batch:integer,manifest:ManifestRef,code:string,item:integer}`; authorized protected-safe first failing item; durable terminal result without business effects.
- `{status:"failed",job:JobRef,batch:integer,code:string}`; confirmed rollback, no durable business terminal result; job stops for operator recovery in this first profile.

Refusal is `{status:"denied"|"unsupported"|"expired",code:string}` with no protected payload. `JobStatus` is `{status:"queued"|"running"|"reconciling"|"completed"|"stopped"|"cancelled",job:JobRef,manifest:ManifestRef,nextBatch:integer,committedBatches:integer,unresolvedBatch:integer|null,stop:{batch:integer,code:string}|null}`. Counts are contiguous-prefix counts, never maximum observed IDs. stop is nonnull exactly for stopped state and names the original stopped batch/protected-safe reason, including PAP_ABORT_DISPOSITION_UNKNOWN. Other states use stop=null. stopped preserves earlier commits and includes conflict/rejection/known failure; cancelled has no unresolved batch. A request timeout yields indeterminate only when outcome is genuinely unknown, never when commit or rollback is known.

### Atomic execution and decision order

1. Authorize current job discovery and original action outcome access before protected control lookup. Admit exact namespace/store/epoch/profile, manifest bytes, current action registry and executor closure. Changed/unknown meaning refuses; retained outcomes retain original interpretation.
2. Serialize the job control row and verify original nextBatch, cancellation state and current fence/lease. The same lock/fence participation must be unavoidable for every worker and administrative transition. One batch may be active. Lease expiry alone grants no permission to reexecute.
3. Establish the qualified native transaction/invariant boundary; recheck current person/service/action authority and catalog revision. Resolve every target's Key and issued canonical identity. Deleted, rebound or different-version targets conflict. Guard comparison and effect write must share the same lock/serialization boundary; version comparison outside the transaction is insufficient.
4. Validate all original typed inputs, frames and guards before any effects. Then simulate/invoke items in manifest order using the qualified action gateway and group final-invariant procedure. Preserve tx/1 effect verification and complete attempted-access enforcement. Any item failure rolls back all batch business effects; never return a partial committed item vector.
5. On success commit graph changes, journal/selected outbox, complete item/action outcomes, batch terminal outcome and control progress in the same outer store transaction. Per-item keys are deterministic `pap1/<job-namespace>/<job-id>/<batch>/<item>` within the original trusted action namespace. Namespace/id have the restricted ASCII grammar above and batch/item use canonical unsigned decimal, so this encoding is injective over complete JobRef and ordinals and fits tx/1 token length. Namespace plus job ID is permanently nonreusable across the underlying tenant/store/principal/action replay scope. They are internal to this registered batch; outside invocation/replay under those reserved keys MUST refuse. Individual items cannot be precommitted or replayed independently to manufacture batch success.
6. Confirm native outer commit before returning committed. Acknowledgement loss retains original batch custody and stops later admission until original lookup/reconciliation resolves it. Complete original outcomes are replayed unchanged under current access authorization. If commit is uncertain, do not manufacture rollback, release active ownership or allocate a new token.

Materialized versions apply independently to each target. The batch guard pass is a coordination check BEFORE any tx/1 fresh invocation. Compare all original identities/versions in item order under the native boundary; absent/deleted/rebound/changed targets produce batch conflict/PAP_GUARD with NO fabricated tx/1 item terminal outcome. Only if all guards pass may tx/1 stages1–7 run in their unchanged order; unexpected subsequent ENTITY_MISSING retains tx/1 rejection meaning and indicates a failed guard/lock qualification. No guard conflict is translated into tx/1 EXPECTED_VERSION or ENTITY_MISSING. Known pre-effect conflict/rejection persists its batch terminal/control stop state and, when tx/1 admission reached a terminal decision, the failed item's complete original conflict/rejection outcome in that same transaction, without successful item outcomes. A guard failure before tx/1 admission has no invented item terminal outcome. Reserved item tokens remain inaccessible outside this registered bulk namespace. Runtime access/evaluation/invariant failure aborts every effect and item outcome; after confirmed rollback the host durably marks stopped separately. If that control write is uncertain, reconciling remains required. Truss's final-state group invariants remain authoritative; transaction composition cannot weaken them.

### Leases, cancellation, recovery and retention

Executor issues monotone fences and a 60-second lease at claim using its clock; no lease renewal/parallel takeover in this first proof. A valid execute consumes the claim under the serialized control lock. Once the transaction holds that lock, expiry cannot interrupt or transfer it; native time/work limits remain separate. After expiry or worker loss, reconcile the original native transaction and batch first. Only an unconsumed claim with independently confirmed no native effect admission permits a higher fence for the SAME original batch/intent. Once a durable effect-admission marker exists, confirmed noncommit with no terminal disposition stops the job as PAP_ABORT_DISPOSITION_UNKNOWN; it never permits automatic reclaim/reexecution. Known failures also stop. No resume operation exists in this first profile: a stopped job is terminal; any operator-selected new job is separately materialized/sealed/current-authorized after original custody is settled, never an automatic retry. Old fences refuse. If native termination cannot be proved, job stays reconciling and no later batch is admitted. Discovery not-found is not itself proof of rollback. A retired revision refuses fresh execution; authorized retained lookup remains available.

Cancel acquires the same job lock. If an admitted transaction commits before cancel wins that lock, its batch is retained and no subsequent batch is admitted; if cancel wins first, execute refuses. Cancellation acknowledgement MUST NOT assert an in-flight rollback. Job status remains reconciling for an uncertain original outcome; after settlement cancelled can include its committed prefix. No compensation is implied.

Complete manifests and terminal outcomes remain retained for the lifetime of the namespace in the first proof; expire disables future admission/disclosure under current policy but leaves nonreuse tombstones. No automatic purge or reuse. Restore with uncertain graph/outcome consistency fences the namespace; epoch change cannot authorize original-token reuse. Any shorter retention/new namespace procedure needs separate qualification.

### Human attribution and durable attempt state

Actions retain person-required and tx/1 authorization semantics. A queued job requires an independently qualified host authentication binding `umf.actions.bulk-initiator/1`: the issuer authenticates the initiating human at materialization/submit and retains an executor-owned delegation bounded to exact human, job namespace, store/epoch, manifest bytes and resolved action revision. At execute, the trusted session contains that same authenticated human subject and the separately authenticated worker service, acting on behalf under this issued binding. Retained text, worker credentials or role membership alone cannot issue/renew delegation. Current human membership, worker service permission, delegation validity and action authorization are checked within the native commit consistency boundary. No actor-profile or tx/1 broadening is inferred. Missing/expired delegation or lost original human authority stops only a correctly admitted original job; unauthorized arbitrary requests cannot stop another job. Truss US-049 owns this qualified gateway/authentication composition before US-047.

After opening/capturing the original effect transaction but BEFORE it acquires job/business locks or starts business dispatch, durably persist an attempt record in executor control state, including immutable job/batch/fence, native execution-custody reference and phase `claimed|effect-admitted|settled`. Set effect-admitted and confirm its control commit BEFORE permitting business execution. The host recovery registry binds the ORIGINAL physical connection/session incarnation/transaction and its native termination observation; it is not a caller transaction label or an xid captured only in the business transaction. If the admission-marker commit is uncertain, no business effects are started. Settled success/conflict/rejection and original outcome/control prefix commit atomically with the original batch boundary as above. A known rollback can settle stopped in a separate control transaction; crash before that settlement leaves an admitted attempt, not a fresh claim.

reconcile, under current authorized discovery and serialized control custody, first observes an original retained outcome in a fresh admitted read context. A confirmed committed original outcome restores its prefix; an unresolved native transaction remains reconciling. Original independent host/native termination evidence of noncommit settles an effect-admitted attempt with no terminal outcome to stopped/PAP_ABORT_DISPOSITION_UNKNOWN (including a crash after a permanent failure before stop persistence). No receipt/not-found, pg_xact_status NULL, expired lease, changed session or missing in-transaction xid proves termination/noncommit. Unavailable evidence leaves reconciling; useful successful reconciliation witnesses and uncertain refusal witnesses are required for qualification. A never effect-admitted claim may be re-fenced only after independent confirmation no effect route was started. Profile1 performs no automatic business retries, including tx/1 internal serialization retry inside an outer batch.

| State/event | Permitted resulting state | Required durable basis |
| --- | --- | --- |
| Fresh nonempty sealed submit | queued | Original seal, actor/delegation, full intent and finite control-capacity admission |
| Empty sealed submit | completed | Empty original manifest; no fabricated business receipt |
| queued + claim | running | Next contiguous batch and issued claim fence |
| running + confirmed commit | queued or completed | Complete original batch/item outcome and prefix in outer commit |
| running + original conflict/rejection/admitted authorization loss/known failure | stopped | Original terminal or independent known rollback/control settlement |
| running + lost native/outcome custody | reconciling | Durable effect admission and original recovery reference |
| reconciling + original outcome | queued/completed/stopped or cancelled | Original commit/rollback disposition; pending cancel fences all later work |
| claim expired, never effect-admitted, independently confirmed no execution | queued | New fence, same original batch/intent |
| cancel before effect admission | cancelled | Same control lock; no admitted uncertain attempt |
| cancel during original admitted/uncertain work | reconciling or cancel-requested response | Keep custody; cancelled only after original settlement |
| stopped/completed/cancelled | same terminal state | No resume or job/manifest mutation in profile1 |

`validateBulkOutcome(artifact:Artifact):{valid:boolean,source:Artifact,diagnostics:PlanDiagnostic[]}` is a pure structural validator for the complete unions above with original bytes retained; state-transition/runtime proof remains separate. US-903 owns the reusable schema/positive/refusal corpus, including submit retry in stopped/cancelled/reconciling and Refusal for each operation.

### Resource and diagnostic limits

Plan/manifest bounds apply, with 100-item maximum batch, 10000 items, 16 MiB manifest, and a 60-second per-materialization/per-batch native execution deadline (unknown timeout cleanup still quarantines custody). Pure result JSON framing admits at most1,000,000 nodes/depth64 and96MiB of actual UTF-8 source bytes (enough for the16MiB manifest Artifact with JSON transport escaping); business literal/model semantics remain core-owned. Output identities admit the original128 output slots; recipe verification admits the original256 effects. Control results retain complete original outcomes; before effect writes the executor reserves its configured finite result/storage capacity and refuses PAP_LIMIT if it cannot retain them. Admit finite manifest/control storage at seal/submit and reserve complete configured result storage before each batch. Capacity exhaustion on a later batch is a known stopped job with its earlier committed prefix retained; whole-job success/capacity is not guaranteed. No truncation or omitted result may turn exhaustion into committed success. Resource accounting covers decoding, materialization and attempted writes, not only committed rows. No throughput/service availability objective is claimed.

Attempt diagnostics retain trusted actor/service, original job/batch/fence, policy/profile and outcome references; raw SQL/inputs/guards are not logged by default. Product receipts are not diagnostic telemetry. Optional diagnostic exporter failure cannot alter outcomes or unlock uncertain resources; access/retention is host-controlled. No new OTel wire surface is introduced here.

## Precedence and Compatibility

CONTRACT-900/901 own action results and replay; CONTRACT-902/903 own original intent. A batch adapter must separately qualify tx/1 under outer commit and complete group outcomes. Existing tx/1 implementation evidence alone proves none of this bulk profile. Different namespace, manifest bytes, partition, action/model revisions or guard semantics require new intent and explicit submission; do not migrate queued work in place.

## Error Semantics

PAP_* validation codes follow CONTRACT-902/903; PAP_FENCE denotes stale/absent claim, PAP_CANCELLED fenced admission, PAP_ORDER wrong batch, PAP_NAMESPACE unavailable original namespace/epoch, PAP_GUARD target guard conflict, PAP_SEAL absent/mismatched original seal custody, PAP_ABORT_DISPOSITION_UNKNOWN confirmed admitted noncommit with unavailable terminal failure disposition, PAP_RECOVERY uncertain original custody, PAP_CONTROL_NONCOMMIT confirmed original control noncommit. AUTHORIZATION, REVISION, EXPECTED_VERSION and original action failure codes retain tx/1 meaning. Known failed rollback is not indeterminate; unknown termination is not failed. Fresh intent is never inferred from a conflict/not-found/expired outcome. Errors with protected identities are redacted unless separately authorized.

## Examples

Two one-item batches: batch 0 commits; batch 1 observes a changed version, records conflict and stops. Batch 0 stays committed. A crash after batch 0 commit before acknowledgement returns the original complete receipt on lookup after restart; only then may batch 1 be admitted. A cancel racing batch 0 serializes before or after that transaction, never splitting it.
