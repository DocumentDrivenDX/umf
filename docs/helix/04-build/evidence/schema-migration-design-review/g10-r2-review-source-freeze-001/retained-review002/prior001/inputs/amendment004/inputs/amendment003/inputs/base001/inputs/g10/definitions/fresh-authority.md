# R3 — two exact fresh operations under separate logical authority

This is an unadopted ADDITION to governing009. Existing `postgresql18-existing-head-enrollment/0.1`, its two scopes/configuration/signing domain/native capabilities and the six physical owner scopes remain exact. Fresh installation is not existing-head enrollment with null fields. Physical target/store ownership cannot authorize logical first publication.

## Configuration, original trust and fixed prerequisites

Propose `umf.configured-generation-enrollment-authority/0.2` with EXACT keys `{profile,authorityId,policyRevision,purpose,supervisorId,custodianId,providerId,installationId,targetCustody,storeId,sourcePolicy,keys}`. Existing-head configuration0.1 is unchanged. Version0.2's sourcePolicy is EXACTLY the fresh branch below; it does not admit an existing-head branch or broaden old scope selection:

```text
{profile:"umf.fresh-installation-enrollment-policy/0.1",approvedCohorts,
 approvedSubjects,issuerProfile,maximumSubjects,bootstrapReceiptDigest,
 namespaceOwnershipReceiptDigest,metadataDefinitionDigest,maximumPhases}
```

ApprovedCohorts is1..256 unique complete tuples `{sourceDigest,bundleDigest,planDigest,fileDigest,planApprovalBindingDigest,reviewEvidenceDigest,executionPolicyDigest,historyContextDigest}`. Match ONE tuple, never allowed-list cross products. FileDigest is mandatory64hex in this first native subset. PlanApprovalBindingDigest identifies the prospective original ApprovalBinding; reviewEvidenceDigest identifies the complete actual host-authenticated review evidence. Neither claims an unissued native receipt. initial-approval-ordering.md fixes the actual native decision AFTER metadata setup, BEFORE business/publication. ApprovedSubjects is1..256 ordered unique `{subject,audience,ownershipReceiptDigest,membershipsDigest,flagsDigest}`. Subject exactly `{oid,name}` with actual existing OID1..4294967295, native name<=63UTF8 bytes; audience person|batch. Keys is1..32 exact `{keyId,publicKey,principalId,scopes}`; scopes is a unique ordered nonempty subset of `prepare-fresh-installation`, then `activate-fresh-installation`. Key/principal/policy bounds and strict Ed25519 encoding are exactly governing009; no wildcard targets or submitted keys. Configuration<=1MiB.

The trusted embedding must FIRST possess original separate authority for the existing application schema and every stable role in source configuration (owner/person/batch/group roles), with actual original native creation/ownership receipts. Neither a source role name nor fresh enrollment creates those roles/schema. The current physical principal preparer creates maintenance/controller/businessOwner only; it does NOT satisfy this prerequisite for missing application schema/person/batch/group roles. Missing qualified bootstrap authority/effects/receipt is an explicit enablement refusal, not a claimed implementation. The first subset does not invent another role/bootstrap signer here.

All subject roles are already NOLOGIN, non-superuser/non-createdb/non-createrole/non-replication/non-bypassrls; inherit preserves original source/native meaning. Their complete actual memberships/grants/ownership and stable subject OID/current_user behavior must match original configured observations. Maintenance/controller/business owner remain original separately governed roles, not ordinary subjects. Schema owner is the original configured owner role; no ordinary CREATE, alternate AUTH/SET/INHERIT/security-definer route or shared installation role is admitted. All new login names must be absent and pairwise distinct from all stable/native role names. The original custodian must exclusively own privileged-DDL and authentication admission; a role or schema not already under that authority refuses.

The original trust statement is EXACT `{profile:"umf.fresh-generation-authority-trust-enrollment/0.1",enrollmentId,ownerBootstrapContextDigest,configurationDigest,supervisorId,custodianId,providerId,installationId,targetCustodyDigest,storeCreationReceiptDigest,custodySequence,bootstrapReceiptDigest,namespaceOwnershipReceiptDigest}`. Context public projection is EXACT `{profile:"umf.fresh-generation-authority-context/0.1",contextId,trustEnrollmentDigest,configurationDigest,supervisorId,custodianId,providerId,installationId,targetCustodyDigest,storeCreationReceiptDigest,purpose,bootstrapReceiptDigest,namespaceOwnershipReceiptDigest}`. Digest hashes the full projection. Original bootstrap issuer must retain and resolve the actual registry/root, supervisor/custodian/store and separately authorized stable-role/schema/bootstrap objects, not merely these hashes. Use original durable enrollment before constructing the authority; readonly recovery never creates locks/roots/contexts. Existing context0.1 cannot be passed as fresh context. Production/acceptance purpose separation, original request registries and settled-only authenticated rotation apply unchanged.

Signing domain is ASCII `umf.fresh-generation-enrollment-approval/0.1` then NUL then complete RFC8785 payload. Envelope exactly `{payload,keyId,signature}`. Payload exactly `{profile:"umf.fresh-generation-enrollment-approval/0.1",authorityId,principalId,keyId,requestId,purpose,scope,policyRevision,configurationDigest,contextDigest,targetCustody,intent}`. The configuration must be0.2 fresh, purpose/context/keys exact originally enrolled. Opaque signature/request/effect registries are distinct types/domain from existing-head and physical owner operations. No native receipt/projection is authority.

## Original empty-namespace witness

Before exporting preparation, the actual original issuer captures exactly:

```text
{profile:"umf.fresh-namespace-absence/0.1",bootstrapId,providerId,
 installationId,targetCustody,database,schema,bootstrapReceiptDigest,
 namespaceOwnershipReceiptDigest,subjectInventoryDigest,
 namespaceObjects,defaultPrivileges,gateReceiptDigest,custodySequence}
```

Database exactly `{oid,name,systemIdentifier}`, schema exactly `{oid,name,ownerOid}`; all identities already exist. NamespaceObjects is literal `[]`: full pg_class/pg_type/pg_proc/pg_constraint/pg_policy/pg_trigger namespace and incoming/outgoing dependency census must establish no application/metadata/user-created object, not just no pg_tables rows. Internally required catalog objects of the existing empty schema have no user payload; any ambiguity or exception refuses, rather than an extra-object whitelist. DefaultPrivileges is the complete actual schema/owner effective default-ACL census as ordered exact entries `{ownerOid,schemaOid,objectKind,grantorOid,granteeOid,privilege,grantable}`, objectKind r|S|f|T|n, schemaOid actual schema or0 for global defaults, real boolean grantable, sorted by the complete tuple and must equal the original no-extra-grants bootstrap observation. The full original observed census/role/path/gate objects remain in private custody, not only this compact witness. <=1MiB, original positive absence under enforced privileged-DDL exclusion, recaptured/rechecked immediately before effect. No LOCK SCHEMA, future object OID or name-only absence adoption.

The original issuer allocates bootstrapId, enrollmentId and initialEpoch UUIDs before signing. A durable exclusive logical reservation key `[providerId,installationId,"fresh-installation"]` permits only ONE unsettled initial campaign, regardless of attempted alternative bootstrapId. IDs/outcomes are nonrewinding. Missing original reservation refuses; a new ID cannot bypass an unknown attempt.

## Scope prepare-fresh-installation

Intent EXACTLY:

```text
{profile:"umf.fresh-installation-prepare/0.1",providerId,enrollmentId,
 bootstrapId,installationId,targetCustody,storeId,predecessor:{kind:"none"},
 source:{format:"json",sha256},bundleDigest,planDigest,fileDigest,
 planApprovalBindingDigest,reviewEvidenceDigest,planApprovalBinding,
 executionPolicyDigest,historyContextDigest,bootstrapReceiptDigest,namespaceOwnershipReceiptDigest,
 absenceWitnessDigest,metadataDefinitionDigest,issuerProfile,
 initialEpoch,subjects,maximumRoles,maximumPhases}
```

Source is complete original next source; bundle/plan/file/prospective approval binding/evidence/policy/history all exact original accepted cohort. The full planApprovalBinding has the exact original normal form in initial-approval-ordering.md and recomputes planApprovalBindingDigest; its evidenceDigest equals reviewEvidenceDigest. executionPolicyDigest hashes the complete component-policies.md envelope, not merely its campaign member. HistoryContext is the exact empty `{profile:"umf.table-inventory-source-history/0.1",plans:[],executions:[]}`. No previous/head/old epoch field exists. MetadataDefinitionDigest is SHA256 of the exact proposed fixed native DDL artifact plus pinned baseline DDL definitions and renderer settings as specified in native-metadata.md; no request chooses names/DDL. Subjects is ordered1..256 EXACT `{subject,audience,observedFlags,memberships,ownershipReceiptDigest,newLoginName}` with governing009 seven real booleans and ordered memberships `{roleOid,roleName,inherit,set,admin}`; NOLOGIN prerequisites above, complete configured list/order, <=1024 aggregate edges. MaximumRoles equals count; maximumPhases3..1024 equals plan.phases.length and is <= configured ceiling. No future login OID/credential or activation signature.

Effect key `["prepare-fresh-installation",providerId,installationId,bootstrapId]` is additionally bound to the exclusive installation reservation above. Consume/bind the original verified preparation before effects. Close the original actual gate; observe the full starting/pending-auth/backend population through the SAME adopted native barrier with a distinct fresh context. Keep stable subjects NOLOGIN. Create only new disabled wrapper logins with qualified fixed flags and the original SET-only/non-inherit/non-admin subject edge. In ONE native transaction: actual role effects, one original prepared epoch, exact fresh metadata birth and zero-row history/head view/outcome/approval metadata + phase1-complete progress initialization. No business-table phase runs before this transaction is confirmed and original fence completes.

Prepared epoch keeps exact `umf.native-ingress-epoch/0.1` keys/state=prepared/headDigest=null/origin=provision and exact `umf.native-ingress-provision-receipt/0.1` keys from governing009. Here original request/reservation bind THIS fresh domain; only new private fresh capability dispatch admits it. The existing store tables gain NO columns, extra objects or raw JSON insertion API. Fresh actor does not call an existing-head capability or generic insert_epoch. Ordinary .1 store creation authority/custody remains a prerequisite; actual new fresh entrypoint support is an enablement gate.

The completed preparation receipt EXACTLY:

```text
{profile:"umf.fresh-installation-preparation/0.1",providerId,enrollmentId,
 bootstrapId,installationId,targetCustody,storeId,requestDigest,
 approvalDigest,reservationDigest,sourceDigest,bundleDigest,planDigest,
 fileDigest,planApprovalBindingDigest,reviewEvidenceDigest,
 executionPolicyDigest,historyContextDigest,
 initialEpoch,principalsDigest,absenceWitnessDigest,bootstrapReceiptDigest,
 namespaceOwnershipReceiptDigest,metadataSetupReceiptDigest,
 preparedEpochReceiptDigest,nativeOwnershipDigest,targetObservationDigest,
 fenceReceiptDigest}
```

ApprovalDigest here hashes the fresh signed envelope. PlanApprovalBindingDigest/reviewEvidenceDigest retain the original prospective binding/evidence; NO native planApprovalDigest exists in this preparation receipt. Phase2 uses the ONE common ordinary-decision request/reservation/attempt/journal/settlement from ordinary-decision-custody.md, then creates the actual original native receipt on the protected approvals relation before any business/publication. No future final head, final publication or activation digest occurs. Setup receipt and epoch receipt are same-transaction observations positively settled after COMMIT. Fresh fence EXACTLY `{profile:"umf.fresh-installation-fence/0.1",providerId,enrollmentId,bootstrapId,targetCustody,prepareRequestDigest,reservationDigest,subjectInventoryDigest,gateReceiptDigest,preparedEpochReceiptDigest,metadataSetupReceiptDigest,candidates,retiredSessions,resolutionDigest,absenceObservationDigest}`. Candidates/retiredSessions/resolutions and private fixed evidence resolver follow governing009 full native barrier rules, <=4096 each/<=1MiB conjunction. Preserve full original candidates including NULL/starting across restarts; no empty-scan/sleep/PID-only proof. New logins remain disabled, no credentials/gate release through ANY prefix.

## Scope activate-fresh-installation

After all business phases and complete final protected source/native validation, intent EXACTLY:

```text
{profile:"umf.fresh-installation-activate/0.1",providerId,enrollmentId,
 bootstrapId,installationId,targetCustody,storeId,prepareRequestDigest,
 prepareApprovalDigest,preparationReceiptDigest,metadataSetupReceiptDigest,
 source:{format:"json",sha256},bundleDigest,planDigest,fileDigest,
 planApprovalBindingDigest,reviewEvidenceDigest,planApprovalDigest,
 executionPolicyDigest,historyContextDigest,initialEpoch,principals,principalsDigest,fenceReceiptDigest,
 finalPrefixDigest,finalNativeWitnessDigest,publicationEntryDigest,
 publicationRecordDigest,externalReservationDigest}
```

All common bindings equal original preparation. PlanApprovalDigest NOW hashes the actual confirmed native receipt projection from phase2; resolve the actual ApprovedInventoryPlan/private native row/outcome and original binding/evidence, never matching JSON alone. Principals is the actual governing009 ingress inventory with REAL login and subject OIDs/names, audience, issuerProfile/issuerReceiptDigest/ownershipReceiptDigest/memberships, <=256/1024 edges; digest recomputes. Every wrapper remains NOLOGIN at signing. PublicationEntryDigest is the deterministic first actual history entry digest computed from the fully observed final native witness, original plan/file and position1/predecessor=null; this is a proposed final entry, not an invented previous head. PublicationRecordDigest hashes the acyclic final publication record in native-metadata.md. Its phaseReceipts contain only already-confirmed prepare/approval/business phases and its ingress binds the PREPARATION request/reservation, never this eventual activation signature; no final transaction ID, external confirmation or self-reference is predicted. There are no oldEpoch/expectedHead/null-source aliases. Effect key `["activate-fresh-installation",providerId,installationId,bootstrapId]` retains the original installation reservation.

Consume/bind original activation signature before dispatch. Reobserve actual original target/store/gate/role OIDs, all prefix receipts/outcomes, complete final source/default/seed/catalog/ACL/commands, configuration/policy/history and exact original metadata shapes. ONE native transaction inserts first immutable history entry, updates the exact prepared epoch to active with the real head, enables ONLY approved wrappers, inserts permanent inventory publication, revalidates the SAME already protected native approval, and drops ONLY the selected exact progress relation. Fixed final head view exposes that real entry. The final reference is derived after original COMMIT observation; it is not included in its own hashed publication record. Gate/credentials remain closed until original external confirmation binds actual active epoch/head/publication-record and then final reference. An active native row alone cannot issue an admission.

Fresh activation uses the NEW proposed umf.native-inventory-ingress-enrollment/0.1 receipt with EXACT existing native-ingress-enrollment/0.1 member names, with ownershipObservationDigest binding complete actual fresh request/signature/fence/setup/final native observations in the original private registry. No old=new transition row is invented. The actual private `activate_fresh_inventory_epoch(original_capability)` resolves fresh native objects and same-connection transaction hook; a matching dictionary, shared seal or public raw epoch method refuses. Existing G11 operations remain closed.

An actual denied phase2 decision cannot activate or publish this prepared installation. The exact denied-approval-recovery.md original negative branch retains the prepared epoch/disabled wrappers/gate, singleton denied approval row and phase1 business catalog with approval-denied progress; unknown denied COMMIT returns the SAME actual receipt UUID/time/decision after original settlement, never prospective-zero-row matching or new INSERT. Unknown preparation/phase/publication COMMIT observes ORIGINAL native rows/roles/OIDs/receipts and external reservations under restored original custody. Never reissue roles/metadata/tables/epochs on timeout. Known abort requires positive original no-effect proof and SAME request/IDs/accounting; confirmed stages are readonly recoverable. Missing original roots/gate/issuer/setup/candidate history refuses without recreating authority. A deliberately published empty inventory has position1, non-null source/head and active epoch; its next transition is installed, never fresh again.

## Provider operations and open enablement

New opaque types are FreshInstallationPreparationRequest, FreshInstallationReservation, PreparedFreshInstallation, VerifiedFreshInstallationFenceEvidence and FreshInstallationActivationReservation, each privately original-registry issued. Fixed operations include the new protected record_fresh_plan_approval operation specified in initial-approval-ordering.md and its exact common original decision slot/journal/settlement in ordinary-decision-custody.md. No successful decision capability precedes common confirmation. Other fixed operations are `prepare_fresh_request(context,verified_plan,original_absence)`, `export_fresh_request(request)`, `reserve_fresh_preparation(request,verified_approval)`, `prepare_fresh_installation(reservation)`, `observe_fresh_preparation(reservation)`, `prepare_fresh_activation(prepared,final_prefix)`, `activate_fresh_installation(prepared,verified_activation)`, `recover_fresh_installation(original_bootstrap_id)`. Their context/plan/absence/native inputs are opaque verified originals, not caller records. Actual configured trust/schema-role bootstrap/native barrier/driver hook/credentials and positive recovery remain mandatory unimplemented/qualification gates. External reviewer must adopt these exact additional scopes/configuration/domain/native contracts before code.

Governing011 at3339a9732e96d2afd5e1b84ee51e50a79c827bb4 is an additional exact pin for original primary context0.3 setup/owner-ledger/logical-root composition. Preserve both enrollment0.1/0.2 bytes and the late actual-config root signature. No missing primary/setup lock/ledger/registry is recreated by runtime; old contexts0.1/0.2 are not widened. G10 fresh logical scope/native setup still needs separate adoption and qualification; physical context0.3 alone does not authorize logical publication or stable-role/schema creation.

## Successor006 exact one-grant/cumulative mapping

campaign-grant-accounting.md is normative proposed closure. Native budgetReceipt.campaignCharge.elapsedBudgetMs equals ONE dispatched original grant.reservedMs. Common priorCampaignCharge is the original cumulative outer preparation checkpoint including every aborted/resolved-unknown preparation grant, never the successful phase1 receipt alone. Current original outer cumulative time sums UNIQUE grants across every attempt/phase; native receipt/settlement replay addsZERO. Common+outer refer to ONE same-provider durable allocation under original atomic CAS, not independent budgets. Existing decisionBinding resolves phase2 to that SAME original grant. Unknown stays charged/fenced; positively proved abort permits exactly one new fully charged numbered grant if original remaining cap fits. Full native/provider/CAS/custody/Weft/old-store/carrier/table/mixed/installation gates remain OPEN; no signature scope/receipt/old-context widening.
