# Successor006 — one original ordinary-decision protocol

Proposed shared design, not adoption/implementation/authority. Successor004 supplied atomic denied native outcome and acyclic observation but gave only denial an exact private reservation. Its phrase SAME ordinary decision slot did not define the positive grammar. This document supplies the ONE closed protocol for initial fresh phase2 approved AND denied decisions. It supersedes004 denial-only intent/reservation/settlement admission, retaining004's exact negative native observation/outcome/return data and all72 acceptance obligations. No new external ApprovalReceipt, physical/logical signature scope, public JSON journal API or old-host widening is introduced.

## Scope, actual originals and one allocation

Apply ONLY to an originally prepared fresh inventory campaign after confirmed phase1: initial mode, expectedHead=null, original bootstrap/setup/prospective binding, disabled original wrappers/prepared epoch and actual closed gate. Original governing011 context0.3/setup/ownerLedger/logical-root bytes and actual originally enrolled immutable providers remain prerequisites. No new logical enrollment or physical store creation is authorized here. Both purpose production|native-acceptance and original target custody are exact everywhere. Old contexts0.1/0.2 and missing original primary/lease/lock/ledger/registry history refuse. Future governing changes are not silently adopted by this proposal.

Installed G10 already has its actual original ordinary approval before transition. Its phase2 reobserves that existing protected row under its existing non-null-head protocol, creates NO fresh ordinary-decision request/reservation, and has decisionBinding=null for this new fresh-only branch. Historical initial decision evidence is retained separately; it never authorizes a new installed approval or new-table fill domain.

The actual fixed host obtains a genuine authenticated original review decision for the complete prospective ApprovalBinding/qualification/evidence. Source/options/JSON/UID/TTY assertions, a fresh enrollment signature, matching hashes and caller UUID/time/decider do not supply that private decision. Missing real review adapter refuses.

Exclusive key is EXACT `[providerId,installationId,bootstrapId,planApprovalBindingDigest,"native-plan-decision"]`, subordinate to the SAME original exclusive installation campaign key and original writer lease. Original durable compare-and-reserve creates the key's request and allocates ONE decisionId before any native decision INSERT. A replay of that original authenticated decision resolves the SAME full request/decisionId; it never allocates another. Conflicting decision/evidence/target/source/policy/purpose or bootstrap under an occupied installation key refuses even before effects. No parallel positive/negative typed registries, replacement approval UUID/request, caller-chosen request ID, path search or reset-to-empty can evade this slot.

The private journal below is a NEW typed fixed-provider branch requiring exact adoption and actual original storage/capability qualification. Its definition is included in the signed metadata definition and complete selected provider artifact/configuration/policy envelope before preparation. Physical placement/custodian/lease comes ONLY from the original enrolled provider; no plan/options filesystem path, auto-created missing sidecar, generic insert/append method, old owner-ledger wire relabel or enlarged old-store payload is admitted. If the actual original store cannot admit this precise branch, refuse phase2 and keep the full enablement gate OPEN. Native progress cannot fabricate original journal custody. Fixed private operations are `prepare_fresh_plan_decision(originalPrepared,originalAuthenticatedDecision)`, `reserve_fresh_plan_decision(originalRequest)`, `dispatch_fresh_plan_decision(originalReservation,originalGrant)`, `observe_fresh_plan_decision(originalReservation)`, `settle_fresh_plan_decision(originalReservation,originalVerifiedNativeOutcome)` and `recover_fresh_plan_decision(originalDecisionId)`. Exported records are data; these operations require actual original typed registry objects/context/lease, never caller-reconstructed records, arbitrary connection/callback or mutable module properties. A settled handle is readonly and cannot dispatch. Native full original row/outcome validation precedes any private binding/finish; a native-confirmed/private-pending gap settles the SAME bound request without re-execution.

## Exact shared request and reservation

Original request EXACT:

```text
{profile:"umf.inventory-plan-decision-intent/0.1",decisionId,providerId,
 enrollmentId,bootstrapId,installationId,purpose,targetCustody,
 preparationRequestDigest,preparationReceiptDigest,setupReceiptDigest,
 planDigest,fileDigest,planApprovalBindingDigest,reviewEvidenceDigest,
 phaseId,phaseDigest,executionPolicyDigest,authenticatedDecisionDigest,decision}
```

Decision EXACT approved|denied, selected from the actual authenticated decision object privately retained. DecisionId is the original host UUID for this common slot; it is NOT native receiptId. PhaseId/digest identify exact approval phase2. All original bindings/normal forms/limits are004's negative request rules, including request<=1MiB, original full policy/session/provider/source correspondence, and NO future native UUID/time/receipt/outcome/settlement/signature inside the request. requestDigest=H(complete RFC8785 request). The actual original private slot, not that digest, grants authority.

Original reservation EXACT:

```text
{profile:"umf.inventory-plan-decision-reservation/0.1",reservationId,
 decisionId,requestDigest,providerId,installationId,purpose,targetCustody,
 bootstrapId,setupReceiptDigest,planApprovalBindingDigest,decision,custodySequence}
```

Decision and every duplicate binding equal the request; reservationId is ONE original custodian UUID. Persist full request/reservation together under the common key BEFORE BEGIN/INSERT. Reattach same originals after crash; request/reservation hashes are never substituted capabilities. Both approved and denied use these profiles and the SAME original registry. The004 denial-intent/denial-reservation profiles become historical proposal bytes only and are refused by005; no migration of actually issued records is claimed because none is implemented/adopted.

## Exact attempt grant, accounting and journal states

Every actual dispatch reserves ONE nonrefundable original campaign-time grant and durably marks the same original decision attempt dispatched BEFORE native BEGIN, through campaign-grant-accounting.md's SINGLE authoritative original atomic allocation shared with the outer checkpoint. This is not a second common-journal budget allocator. Immutable grant EXACT:

```text
{profile:"umf.inventory-plan-decision-attempt-grant/0.1",decisionId,
 attemptNumber,requestDigest,reservationDigest,inventoryExecutionPolicyDigest,
 phasePolicyDigest,policyBinding,reservedMs,priorAccountingDigest}
```

AttemptNumber1..4096 strictly increases without gaps for this decision; grant has no own digest/outcome. PolicyBinding is the COMPLETE component-policies.md form, equal to the actual phase2 envelope/session/provider selections. ReservedMs is EXACT nativePhasePolicy.transactionTimeoutMs + campaign.statementTimeoutMs from the COMPLETE already signed envelope. The first term is the whole native transaction work/COMMIT allowance; the second is the explicit finite driver/settlement allowance for this new branch, not a hidden unsigned scalar. The sum must be a positive safe integer within the original remaining campaign budget; otherwise refuse before dispatch. It is not elapsed native COMMIT time predicted in advance. Actual IDLE session transaction_timeout/settings and host absolute deadline are installed/verified BEFORE BEGIN; every dispatch and COMMIT checks actual remaining phase/campaign budget. Admission never resets a clock or timer on unknown COMMIT.

Accounting EXACT:

```text
{profile:"umf.inventory-plan-decision-accounting/0.1",decisionId,requestDigest,
 purpose,inventoryExecutionPolicyDigest,campaignBudgetMs,priorCampaignCharge,
 grantDigests,chargedMs}
```

DecisionId/requestDigest/purpose exactly match the actual original common request. PriorCampaignCharge is the COMPLETE CUMULATIVE CampaignCharge from the actual original outer preparation checkpoint defined in campaign-grant-accounting.md, through ALL preparation dispatches (including aborted and resolved-unknown attempts), before the first phase2 grant. Its full original checkpoint/grants/native proofs/custody are privately retained; it is not caller zero or the phase1 success receipt's per-attempt charge. campaignBudgetMs equals complete signed campaign policy. grantDigests is ordered H of all immutable original grants, <=4096. chargedMs=priorCampaignCharge.elapsedBudgetMs+SUM(UNIQUE original common grants.reservedMs), checked safe exact integer<=campaignBudgetMs and all tighter original caps. At the same phase2 dispatch prefix this equals the original outer cumulative checkpoint, not a native per-attempt budgetReceipt. Each native phase2 budgetReceipt.campaignCharge.elapsedBudgetMs equals ONLY its one dispatched grant.reservedMs. Campaign-grant-accounting.md's exact same-store original allocation/CAS/bijection and cumulative preparation checkpoint are mandatory; outer and common records reference ONE grant/debit, never allocate independently. The initial accounting has empty grants. Each new grant.priorAccountingDigest hashes the preceding accounting object; its own appended digest is only in the NEXT accounting object. No self-hash/cycle. Keep ALL grants, including aborted/unknown attempts; no refund, truncation, rebase, new campaign or alternative bootstrap to avoid exhausted budget. Conservative full grants remain charged even when a positively aborted attempt used less. Original uncertain campaign clock/custody continuity refuses further effects.

Attempt entry EXACT:

```text
{grant,grantDigest,state,noncommitProofDigest,nativeOutcomeDigest}
```

State EXACT dispatched|unknown|positively-aborted|positively-committed. Before dispatch state=dispatched and both nullable digests=null. Unknown keeps both null and refuses another dispatch. Positively-aborted has complete actual original noncommit proof digest and nativeOutcomeDigest=null. Positively-committed has noncommitProofDigest=null and exact actual branch outcome digest. A native row's absence alone is NEVER noncommit proof; full original native transaction/connection/target/row census and original reservation/driver outcome must prove no committed effect. The actual proof is retained privately, cannot be caller-selected. A later attempt can only follow positively-aborted and consumes a NEW numbered time grant under SAME request/decisionId/reservation, not a replacement decision.

Journal EXACT:

```text
{profile:"umf.inventory-plan-decision-journal/0.1",effectKey,request,
 requestDigest,reservation,reservationDigest,state,attempts,accounting,
 settlement,custodySequence}
```

State EXACT prepared|reserved|attempting|native-unknown|retry-eligible|settled-approved|settled-denied. Prepared has original request/key, reservation/reservationDigest=null, attempts empty, settlement=null and initial accounting. Reserved has original reservation, attempts empty, settlement=null. Attempting has last attempt dispatched; native-unknown has last attempt unknown; retry-eligible has last attempt positively-aborted; all have settlement=null and complete nonrefundable accounting. Settled-approved/settled-denied exactly match immutable request.decision, have last attempt positively-committed and complete corresponding settlement below. All preceding attempts are positively-aborted. No other state/nullable combination is admitted. An actual original append confirming branch outcome updates last attempt+settlement+terminal journal state atomically in the original journal; lost response rereads SAME terminal bytes, never appends twice. A crash before that append leaves attempting/native-unknown pending, even if native COMMIT actually succeeded. Once reserved, reservation never null/replaced. EffectKey exactly equals the tuple derived from request above in every state; unknown keys/missing nullable members/duplicate JSON keys/wrong scalar types refuse. Canonical UUID/digest/name/purpose/safe-integer-excluding-bool normal forms remain exact. All original sequences/IDs/attempts never rewind; zero or multiple CAS matches refuse.

Bounds are conjunctive: <=4096 original decision slots in the original provider cohort, <=4096 attempts per decision, each journal/request/accounting aggregate<=8MiB canonical and all original tighter byte/depth/node/campaign limits. Full native observation/outcome bytes are retained under their existing8MiB native record/custody cap; the journal stores their digests, not an unbounded duplicate. Predictable capacity failure refuses before grant/BEGIN; unknown/full original journals remain occupied/fenced, never recreated or compacted to grant effects. Concrete provider durable CAS, original storage/primary continuity and conservative actual accounting remain unimplemented/qualification gates.

## Native binding and approved/denied outcome mapping

New closed native DecisionBinding EXACT:

```text
{decisionId,requestDigest,reservationDigest,attemptNumber,attemptGrantDigest,decision}
```

All members resolve the SAME actual original request/reservation/dispatched immutable grant before effects. This is DATA in the atomic native progress/witness/publication, not authority. Add member decisionBinding to exact native prefix witness and progress. Initial prospective phase1 has null. Initial approved phaseIndex>=2 has this exact non-null binding; initial approval-denied phaseIndex1 has it too. Installed progress has null for this fresh-only branch. Both copies match exactly. Final initial publication retains the same non-null decisionBinding and successful phase2 receipt; installed publication has null. Final reference continues to bind the original publication record digest as before; the COMPLETE record remains in original native/private custody and is not newly embedded into the public reference. No own native outcome/observation/settlement digest inside DecisionBinding.

Native approval construction stays the original protected `_record_approval` semantics: actual host-generated receipt UUID, actual native session_user/time, original exact binding/qualification/evidence, no caller receipt fields, actual original relation birth/OID/ACL and same original connection/timer. Fresh phase2 performs ONE selected branch, never both. Existing original row of opposite decision refuses; same row requires original common native outcome/custody, not just name/hash.

Approved native outcome projection EXACT:

```text
{profile:"umf.inventory-plan-approved-outcome/0.1",decisionBinding,
 receipt,phaseReceipt}
```

Receipt is COMPLETE actual `umf.inventory-native-plan-approval/0.1` with decision approved. phaseReceipt is the EXISTING COMPLETE `umf.inventory-phase-receipt/0.1` for successful phase2 (index2, exact approval step/phase, actual native XID, full policyBinding/budgetReceipt, zero business/seed/component fills). In ONE native transaction persist the protected approved row + confirmed planApproval + decisionBinding + successful phase2 progress/prefix/receipt. At initial approved phase2 require the COMPLETE actual protected approval census to be exactly the ordered singleton `[{binding,receipt}]` for this common request, zero history/head/publication rows, original prepared/head-null epoch, disabled original wrappers/unchanged gate, original phase1 business catalog and exact metadata birth/OID/ACL/source/policy/custody. Retain full original native observation privately and compare it through the genuine fixed observer; a matching receipt alone cannot admit extra rows or stand in for census. These checks run before original native binding/finish and again during pending-COMMIT recovery. No new native relation or second positive receipt family is created: this closed outcome projection is deterministically reconstructed from those actual atomically retained native members and retained in original private custody. No outcome's own digest, settlement, current progress digest or future activation/publication enters it. ApprovalOutcome remains null for this positive branch, preserving004's negative-only member. `receipt.verify(binding)` remains the original approved-only check; actual row/outcome/custody is additionally mandatory.

Denied uses the EXACT004 native negative observation/outcome from denied-approval-recovery.md, with denialId EXACTLY equal to the common original decisionId (alias, no second UUID/allocation), requestDigest/reservationDigest equal COMMON forms, and native progress/witness decisionBinding equal this same grant/decision. Keep complete independent observation inside negative outcome, its acyclic digest, actual denied row, negative approvalOutcome and phaseIndex1/phase1 receipts. No successful phase2 receipt or ApprovedInventoryPlan is created. The native outcome shape itself is unchanged.

Concrete source correction: pinned approval.py ApprovalReceipt.verify explicitly rejects decision denied (approved-only at lines180–192). For denied, DO NOT invoke or weaken that method. Resolve the genuine original protected `_approval_row` denied branch (lines348–365) with actual binding JSON equality/denied decision/binding/evidence/qualification, then additionally verify actual host/native UUID, nonempty actual session_user, timezone-aware retained native clock and complete004 negative census/outcome/metadata/original custody. The genuine protected reader and independent native observation, not a copied dataclass, supply provenance. The projected wire remains existing native-plan-approval0.1. Native denied verification remains a real new qualified fixed-host entrypoint gate, not permission for data receipts to pass approved verification.

Constructor UUID/time rule is explicit: common decisionId/reservation and all confirmed native receipt UUID/time never change. Unknown or confirmed outcomes never call constructor again. A positively PROVED aborted transaction may execute original constructor on the SAME decision request with the next charged attempt; an uncommitted rolled-back constructor-local receipt UUID/time was never an issued committed receipt and is not returned/reconstructed as one. This preserves pinned constructor semantics without pretending to predict or accept future UUID/time. Actual positive abort proof and attempt accounting are mandatory; absence alone never enables this exception.

## One settlement, data returns and no business before confirmation

Settlement EXACT for BOTH decisions:

```text
{profile:"umf.inventory-plan-decision-settlement/0.1",decisionId,
 requestDigest,reservationDigest,purpose,decision,attemptNumber,
 attemptGrantDigest,nativeReceiptDigest,nativeOutcomeDigest,
 accountingDigest,custodySequence}
```

Every duplicate matches original common slot/grant/accounting/actual native branch outcome. Approved nativeOutcomeDigest hashes approved projection above; denied hashes unchanged004 negative outcome, whose denialObservationDigest is verified against its complete contained observation. NativeReceiptDigest hashes the complete SAME actual protected native receipt. Positive original native COMMIT proof and original target/lease/journal continuity precede this original external settlement. Settlement not inside native outcome/observation/progress; no cycle or inference from JSON status/row/hash. It is the SAME typed original journal confirmation operation for both branches; no denial-only path bypasses its common key. Confirmed settlement is readonly recovered, never appended again.

Positive return DATA EXACT:

```text
{profile:"umf.inventory-plan-approval-approved/0.1",bootstrapId,purpose,
 planDigest,fileDigest,bindingDigest,receipt,decisionId,
 approvedOutcomeDigest,settlementDigest}
```

Denied return keeps EXACT004 denial data form; its settlementDigest now hashes COMMON settlement. DenialOutcomeDigest/denialObservationDigest retain their actual004 native values. Both data returns preserve SAME actual native UUID/time/decision; neither serialized result is authority. Before common settlement positively confirms, return only pending/unknown private attempt status; do not issue a successful decision return or business capability.

Only settled-approved plus actual original native row/phase2 outcome/current original prepared campaign correspondence may resolve ApprovedInventoryPlan. This private capability still requires original fresh/ingress/session/provider/per-phase objects before effects. Settled-denied never issues it and remains terminal/fenced. The approved gate/credentials also remain closed through business until actual original final publication/activation confirmation; ordinary approval does not open access.

## Exact original recovery and transition obligations

| Original journal and actual native state | Exact next operation/result |
| --- | --- |
| prepared/reserved with no dispatched grant, original prospective phase1 and no decision row | Reattach SAME decisionId/request/reservation; first original charged dispatch only under original gate/custody. No duplicate allocation |
| attempting/native-unknown; SAME approved row + phaseIndex2 complete confirmed progress/phase2 receipt/decisionBinding; actual original COMMIT proof | Reverify complete source/native/metadata/session/policy/grant; settle SAME common reservation once with approved projection; return SAME native UUID/time/decision and only then resolve original approved plan |
| attempting/native-unknown; SAME denied row + approval-denied index1/negative observation/outcome/decisionBinding; actual original COMMIT proof | Same common settlement, with denied outcome; return SAME denied receipt, keep disabled/gate-fenced, no business capability |
| matching settled-approved or settled-denied and same original native outcome | Readonly reobserve SAME terminal bytes/receipt/settlement/result; no INSERT, append, new IDs/grants or constructor |
| dispatched/unknown with no native row, exact original prospective phase1, positive original transaction noncommit proof | Persist original aborted status/proof under SAME request/reservation/accounting; next attempt only if full nonrefundable budget fits; absence alone stays occupied/unknown |
| native row without corresponding branch progress/outcome, changed decision/receipt/purpose/source/file/policy/grant/custody/metadata, opposite decision or second slot/request | Refuse inconsistency/conflict, keep original slot/fence, no overwrite or synthetic settlement |
| external common reservation pending but native prefix advanced beyond phase2 or publication exists | Refuse business-before-original-confirmation invariant violation; never retroactively invent settlement/capability |
| original primary/setup/lease/lock/journal/history unavailable, copied/restored target, uncertain original clock/COMMIT | Keep original occupied slot/fence; no re-enrollment/new bootstrap/caller old-history hash/path search or authority reconstruction |

After settled approved advances business, current original pending progress retains its same decisionBinding and exact successful phase2 receipt. Readonly replay checks the current positively verified source prefix and original phase2 outcome; it does not require the phase2 business catalog to remain unchanged after later valid phases. It cannot replay effects or bypass the currently selected phase capability.

After publication, selected progress is dropped as003. The exact original initial permanent publication retains decisionBinding, plan/file/binding/actual approval digest and complete phase2 receipt; original protected approval row and common journal/settlement remain. Recover historical approved data through that original bootstrap/setup/position1 publication/history under actual current installation custody, even after later installed migrations. Do not require whole approval table to contain only that old approved row once later valid plans exist; compare its exact original binding row and complete original publication/history, never adopt a current-head replacement. Historical completed bootstrap returns DATA only, no fresh mutable campaign/role setup/business capability. Denied never publishes, so its004 exact singleton denied census remains unchanged. Missing any original history/receipt/journal refuses, not legacy fallback or a new initial campaign.

All new forms/transitions are proposed agreement only. Fixed durable provider grammar/admission, original typed registry/attempt accounting, actual protected native decision/session/time/COMMIT and restarted positive/negative recovery, native/Weft/component composition and full old-store/carrier/whole-table/mixed/installation/browser/release obligations remain OPEN. No signature-scope widening or implementation qualification is inferred.
