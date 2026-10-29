# G11 native ROOT mutation checkpoints 001

Proposed supplement to [native interface001](g11-concrete-native-root-session-001.md),
for governing014 review. Governing010–013 ROOT and logical wires stay exact. This
is a design, not an implemented capability or native acceptance receipt. The
original target lease in interface001 stays held through013 context issue. The
individual ROOT, subordinate-context and native-journal locks never nest.

## Original durable state and replay

Fresh original supervisor-journal0.2 birth is selected during original physical
setup, before any target authority is exposed. Existing0.1 journals remain0.1;
there is no reinterpretation, automatic upgrade or auxiliary first-use journal.
The original confirmed owner-context0.3 pins the ROOT zero state. All production
ROOT reservations AND confirmations must pass this native protocol. Pure
transition helpers accept data and compute data; they cannot write, checkpoint,
prove origin/nonrewind or confer native authority.

The original supervisor journal retains the following closed events. All IDs,
digests, purposes and underlying records use the existing canonical validators;
integers require exact integer types, excluding booleans/floats. Digests hash
complete bounded canonical bytes. Unknown keys refuse.

`generation-authority-root-mutation-intent` payload is EXACT:

```text
{purpose,mutationId,operation,registryId,rootRequestId,rootIntentDigest,
 configurationDigest,ownerBootstrapContextDigest,nativeEvidenceDigest,
 validationObservationEventDigest,prior,next,delta,subordinateBirth}
```

Operation is `reserve` or `confirm`. Prior and next each have EXACT
`{sequence,digest}` and name complete canonical ROOT JSON bytes, without LF.
MutationId is allocated once by the original upper session and retained before
any dispatch; it is not an authorization token. NativeEvidenceDigest names the
original signed snapshot. ValidationObservationEventDigest identifies a genuine
fresh native-owned observation event, possibly later than that signed snapshot.
Its association and legitimate same-target continuity are checked, not inferred
from matching caller-provided hashes.

Reserve delta is EXACT `{request}` with the COMPLETE existing prepared ROOT
request012, its already allocated immutable IDs/payload, and next reservation
sequence. SubordinateBirth is null. Confirm delta is EXACT
`{requestId,approvalEnvelope,enrollment}` with the COMPLETE existing valid signed
envelope and derived confirmed enrollment012. SubordinateBirth is the complete
original birth receipt below. No existing ROOT record acquires new fields.
Recompute the exact next state by applying precisely one legal012 transition to
the complete prior state, including full original configured signature validation.
Reject nonmatching IDs, conflicting occupied keys, altered retained histories,
sequence gaps, unbounded work or extra mutations. Identical replay returns the
same bytes; it does not append a second sequence or allocate replacement IDs.

`generation-authority-root-mutation-confirmed` payload is EXACT:

```text
{purpose,mutationId,intentEventDigest,operation,registryId,rootRequestId,
 rootSequence,rootStateDigest,rootEnrollmentId,contextId,subordinateBirthDigest}
```

The last three values are null for reserve. Confirm has the actual original
confirmed enrollment/context IDs and digest of the complete subordinate receipt.
RootSequence/RootStateDigest equal the intent's next projection. Replaying every
intent/confirmation from the original zero state derives the authoritative
expected CURRENT ROOT bytes. An older legitimate signed ROOT prefix is not the
current state. A historical binding's old whole-file hash is not compared to the
current file after legitimate subsequent enrollments.

`generation-authority-bound` payload is EXACT:

```text
{purpose,registryId,rootEnrollmentId,contextId,rootEntryDigest,
 configurationDigest,confirmEventDigest,subordinateBirthDigest,
 targetCustodyDigest,storeCreationReceiptDigest,nativeEvidenceDigest,
 observationEventDigest}
```

This is appended once after actual ROOT mutation confirmation and fresh native
association, before a usable production context/session escapes. It grants no
new UUID. Its key is the original registry/enrollment/context tuple. Reissue
checks inclusion of the SAME historical confirmation/binding in the fully
validated original native history plus exact latest ROOT replay and current
native facts. It does not append another binding or observation on every status
read. A new confirmation attempt can record its fresh validation observation;
the signed evidence digest remains the original one.

The full native snapshot excludes mutable ROOT/context/approval-ledger contents,
the future mutation checkpoint and its own journal event digest. This avoids a
hash cycle. No future checkpoint digest appears inside ROOT bytes.

## Fixed dispatch and recovery

1. Hold the original target lease. Revalidate original issuer/config/physical
   association, complete native history and current ROOT replay; no pending
   mutation may be bypassed by another ROOT/control writer.
2. Under ROOT lock, compute/validate exact prior, next and full delta. For
   confirmation first finish013 original subordinate birth while ROOT lock is
   released, then reacquire/revalidate the same prior. Close subordinate locks.
3. Release ROOT lock. Append the native mutation intent before ROOT replacement.
   Preflight sufficient capacity for all required intent/confirmation/binding
   records, every8MiB/4096 bound, and whole export/snapshot limits. No truncation.
4. Reacquire ROOT lock, require EXACT prior and replace atomically with EXACT next;
   fsync/rename/parent durability follows original qualified file protocol. Close
   ROOT lock. No generic caller CAS, callback or raw path is exposed.
5. Recheck exact next and original subordinate/native association. Append the
   native mutation-confirmed event. For reserve only now export the original
   prepared request. For confirm append/resolve original bound event, then013
   readonly context issue. Outer target lease stays held until issue completes.

Every original physical/native/custody/store/ROOT/context writer checks unresolved
mutation intent before effects; recovery alone may settle that SAME intent. This
includes a second supervisor/process and boot/reattach, not just one session's
Python map. No additional mutation can rebase the saved prior/next pair.

| Durable cut | Required next action |
|---|---|
| No native intent, ROOT still prior | No ROOT mutation/export occurred; a new qualified attempt may plan it |
| Native intent, ROOT exactly prior | Resume only the same original mutation after full native validation; do not allocate replacement IDs |
| Native intent, ROOT exactly next | Verify same native/subordinate facts and append the missing confirmation; never rewrite ROOT |
| Intent but ROOT neither prior nor next, or native history missing/rewound | Refuse; no prefix adoption, reconstruction or best-effort repair |
| Native mutation-confirmed, binding missing | Verify original confirm/subordinate/current facts and finish only the missing bound event |
| Bound, response lost | Resolve the same original IDs/context/session association; no ROOT/context rebirth |

An unresolved confirm intent pins complete subordinate birth even if ROOT is
still the prepared prior. Missing a pinned subordinate file refuses; that prepared
label is not permission to recreate a confirmed birth. Corruption after ROOT
confirmation always refuses. Unknown native continuity leaves the intent fenced.

This detects ROOT-only rollback against retained original native checkpoints.
Restoring the ROOT AND entire native/custodian history together still requires
independently qualified original external continuity. Hash chains or file
permissions alone do not prove that such a backup is current. Full independent
anti-rollback acceptance remains an explicit native qualification gate.

## Complete subordinate birth receipt

The native-owned private DATA receipt has EXACT:

```text
{profile,rootRegistryId,contextJournalRegistryId,contextId,rootRequestId,
 trustEnrollmentId,configurationDigest,contextProjectionDigest,
 logicalEnrollmentId,initialEpoch,contextJournalPath,contextJournalEntryDigest,
 contextBirthMarkerPath,contextBirthMarkerDigest,approvalLedgerPath,
 approvalLedgerLockPath,approvalLedgerBirthDigest}
```

Profile is `umf.generation-authority-logical-birth/0.1`. ContextJournalRegistryId
is the actual existing supervisor-context journal identity, distinct from ROOT
registryId. Paths/IDs follow013's original fixed mapping and deterministic
identities. ApprovalLedgerBirthDigest hashes the complete original first
`identity-allocated` record including its canonical LF, not an invented owner
header or the whole later ledger. Validate that exact original birth prefix plus
full current history after legitimate appends. Context projection/entry/marker
and lock are actual013 original objects. A caller dictionary, copied receipt or
matching hash cannot register a birth capability. The bootstrap-owned issuer
produces the original receipt; native association verifies actual files and
registry identity under the same outer lease.

## Required interfaces before014 source adoption

The following gates are explicit and separate from pure ROOT transition review:

- Native-owned SourceCohort registry, complete closed private snapshot encoding,
  actual fixed SQL/census and driver deadline projection must have frozen exact
  source/test preimages and a complete source-map before code adoption. Interface001
  enumerates required observed sections; matching expected configuration is not
  an observation. No opaque caller-supplied evidence dictionary is admitted.
- The original committed INGRESS-store creator/resolver is currently missing.
  A fixed upper OwnerAuthoritySession coordinator must own the SAME active native
  transaction, genuine pending effect binding, native reservation, COMMIT outcome,
  fresh full born-object verification and durable custody confirmation. It must
  return a registered committed creation receipt before ROOT observation. Existing
  pre-DDL `_OriginalStoreCreationAuthority`, caller `create_original_store()` and
  schema OID/marker are insufficient. G04's COMMENT receipt is a different branch.
  Exact ingress receipt/journal/dispatch types and method/source map must be
  separately frozen and reviewed; this supplement does not invent them as existing.
- Original application-subject/schema ownership is also a separate interface
  gate. Existing physical scope2 provisions its three system roles, not arbitrary
  application subjects/schemas. The actual owner/provider must expose genuine
  originally authorized birth/continuity receipts. Until that exact interface and
  source map are reviewed, no positive production existing-head enrollment is
  qualified. A native fixture must capture real authorized births, not a source
  fixture issuer or a hash of current role flags.
- Actual original-journal0.2 birth selection and all control-mutator exclusion
  coverage must be demonstrated on frozen source. Original0.1 active deployment
  migration, unknown restore, managed-host continuity, full native effects,
  installed artifacts and release qualification remain tracked independently.

Thus014 may freeze the closed mutation protocol after design review, but its
implementation/native acceptance cannot close on names of missing methods or
passing pure transition tests. The two missing birth-provider interfaces above
require concrete reviewable designs before their respective code is adopted.
