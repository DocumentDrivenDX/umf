# Exact proposed inventory ingress and enrollment record branches

Unadopted003 supplemental closed forms. Old requests/records/private resolvers and their bounds stay exact. New native same-connection/profile dispatch must be explicitly adopted and qualified; matching hashes, a new family label or existing-head enrollment does not authorize the new plan. No new physical owner scope, raw JSON insertion or public cursor/callback is introduced.

## Installed request and native transition

New installed request EXACTLY:

```text
{profile:"umf.table-inventory-generation-ingress/0.1",providerId,enrollmentId,
 installationId,targetIdentityDigest,planDigest,fileDigest,expectedHead,
 previousSourceDigest,nextSourceDigest,previousBundleDigest,nextBundleDigest,
 oldEpoch,newEpoch,oldPrincipalsDigest,newPrincipalsDigest,approvalDigest,
 targetCustody,executionPolicyDigest}
```

The field normal forms are exactly the original installed request: distinct real original old/new epoch UUIDs, actual provider/enrollment, installed non-null original expectedHead/source/bundles, actual original target identity/custody and ordinary plan approval. Here approvalDigest is the confirmed actual planApprovalDigest projection defined in initial-approval-ordering.md; the original native receipt/row/object still must verify. executionPolicyDigest hashes the COMPLETE inventory envelope. This is a new explicit branch; old table-generation-ingress0.1 request resolver refuses it. Existing logical policy/context must explicitly admit this inventory profile with its prospective complete signed policy/ordinary approval/source cohort; an old existing-head enrollment scope/signature alone cannot grant inventory execution. Current source support is not claimed.

Native transition EXACTLY:

```text
{profile:"umf.native-inventory-ingress-transition/0.1",transitionId,request,
 requestDigest,ingressApprovalDigest,reservation,reservationDigest,state,
 phaseIndex,executionPolicy,fenceReceipt,phaseReceipt,phaseBudgetReceipt,
 publicationReceipt}
```

TransitionId original UUID. Request is the exact new installed request above. Reservation remains EXACT `{profile:"umf.native-target-reservation/0.1",id,custodianId,registrationId,incarnation,sequence,requestDigest,ingressApprovalDigest,parentStateDigest}` with all original actual custody/principal/signature relations. Complete policy is component-policies.md's envelope and its digest equals request.executionPolicyDigest. All original request/reservation hashes and custodian/registration/incarnation must correspond; no self-hashed reservation can substitute original private authority.

State prepared|fencing|fenced|cutover|published. PhaseIndex0 for prepared/fencing/fenced,1 for cutover/published; all business prefix progress remains in the actual selected application progress row, not multiplied native transition indices. FenceReceipt is the exact original closed native-ingress-fence0.1 shape and real native barrier/candidates evidence, not a fresh fence variant. Prepared/fencing receipts all null; fenced has only fenceReceipt non-null. Cutover has fenceReceipt, phaseReceipt and phaseBudgetReceipt non-null, publicationReceipt null. Published has all four non-null. These are exact state/receipt combinations; unknown outcome is external original reservation state, never a new successful state label.

At cutover PhaseReceipt is EXACT:

```text
{profile:"umf.inventory-native-cutover/0.1",migrationId,planDigest,fileDigest,
 expectedHead,finalPhaseId,finalPhaseDigest,finalPrefixDigest,headDigest,
 publicationRecordDigest,setupReceiptDigest,completedSteps,nativeTransaction}
```

All original source/phase/steps/target/native history/publication/epoch/role facts must verify on the same original cutover connection. NativeTransaction is actual `{databaseOid,transactionId}`. This post-dispatch observation is NOT inside the activation-signed publication record: its actual transaction ID is not predicted. PhaseBudgetReceipt is the exact final publication phase budget receipt from component-policies.md with actual timer, zero business data effects and complete selected policy/session/provider bindings. It is also outside the pre-signed permanent publication record. No final receipt contains its own digest. Pending progress is dropped only in the actual atomic cutover after its original setup/OID/row are revalidated.

PublicationReceipt is the exact actual final inventory-installation0.1 reference in native-metadata.md, issued after positive original cutover observation. Original external reservation confirmation and record-state advancement follow the actual custodian protocol; lost response observes the same native cutover/history/epoch/publication/reference, never repeats cutover to recreate a published row. Gate/credentials remain fenced until the original confirmation binds the actual reference.

Fixed ingress-store native tables/columns/constraints remain unchanged and continue duplicating all original scalar fields. New record canonical maximum is the original1MiB, with original native textual/census/depth/safe-integer bounds; the complete embedded envelope/reference/receipts must fit this tighter cap as well as each inventory record's own cap. Overflow refuses before dispatch where predictable; no truncation or receipt omission. The16MiB standalone reference maximum is not a promise that every reference fits this first native store. A larger finite original store successor would require separate adoption, not an implicit bound increase.

## Fresh activation native receipt

No installed transition row is synthesized for fresh. The NEW exact receipt is:

```text
{profile:"umf.native-inventory-ingress-enrollment/0.1",providerId,enrollmentId,
 installationId,targetCustody,epoch,sourceDigest,bundleDigest,headDigest,
 principalsDigest,ownershipObservationDigest,externalReservationDigest}
```

Every field preserves the original enrollment normal form, but original private ownershipObservationDigest resolves THIS original fresh prepare/signature/setup/fence/actual phase2 approval/complete policy/final source+native cutover history. It does not borrow an existing-head signature/context. Exact actual active epoch/head/principals/reference and external reservation correspond. Fixed epoch0.1 keeps its exact original member names and origin=provision (receipt binds original fresh preparation); no old=new transition. First publication/disabled roles/native approval ordering and unknown recovery remain the exact fresh-authority.md/initial-approval-ordering.md contracts.

## Inventory row-table enrollment request

NEW exact request:

```text
{profile:"umf.inventory-row-table-enrollment-request/0.1",requestId,providerId,
 installationId,targetCustody,store,planDigest,planApprovalDigest,
 ingressRequestDigest,ingressApprovalDigest,executionPolicyDigest,
 previousSourceDigest,previousBundleDigest,nextSourceDigest,nextBundleDigest,
 table,record,businessRelation,tableToken,metadataNames,maxIssuedInstances,
 inventoryExecutionPolicyDigest,componentId,componentPolicyDigest}
```

All original normal forms/effect allocation/native absence/source scope remain exact from governing235: store `{profile,storeId,schemaName}`, record `{module,element}`, businessRelation `{schemaOid,schemaName,tableOid,tableName}`, metadataNames `{idColumn,revisionColumn,uniqueConstraint,revisionConstraint,trigger,function}`. The selected original carrier is before-existing retained; no new-table historical domain. maxIssuedInstances explicit1..1000000 matches COMPLETE selected g04 .2 policy. executionPolicyDigest=componentPolicyDigest=H(that policy); inventoryExecutionPolicyDigest=H(full signed envelope). Complete original row identity creation/capacity/issued-instance/active guard witness and external request/reservation persist in original custody. Exact original row-table-enrollment-reservation0.1 shape/bounds and native receipt/atomic enrollment apply, but ONLY the NEW fixed resolver admits this request and proves original ingress approval of the envelope/component. Old request/resolver remains exact and refuses this profile. A new private store variant uses carrier-retirement.md's explicit wrapped row record; old stores use their exact original row record.

New enums/record profiles/native API branches above are proposed agreement, not implemented native support. Every native recovery/installation/real crypto/custody/schema/refusal/resource acceptance obligation remains required.
