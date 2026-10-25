# R2-IR-F2 — complete original clock anchor and checkpoint lineage

This replaces the incomplete anchor sentence and elaborates the checkpoint/certificate section in inherited lifecycle.md. It preserves the exact existing elapsed-certificate payload/envelope/domain and checkpoint profile/key set. It defines a NEW private original-registry .2 branch in clock-registry.md; no existing file/profile is upgraded or recognized by shape. All records below are closed, with mandatory nullable members and existing strict UUID/digest/purpose/native identity normal forms.

## Actual later-than-both-confirmations anchor

ClockAnchor EXACT:

```text
{profile:"umf.table-retention-clock-anchor/0.1",anchorId,authorityId,purpose,
 providerId,storeId,installationId,archiveId,lineageId,targetCustody,
 clockAuthorityContextDigest,registryId,registryHeaderDigest,
 retirementConfirmation,publicationConfirmation,sourceSample,parent}
```

All identities resolve the SAME genuine original clock context/source qualification, provider/registry/header, actual archive/lifecycle and target incarnation. ClockAuthorityContextDigest hashes the complete originally enrolled clock-context0.1 configuration, not a caller-selected key/source. Actual fixed issuer registry/private context establishes origin; a matching signed hash is not a clock capability. AnchorId is allocated ONCE under the original stable clock key before sampling, as clock-registry.md specifies. The anchor is immutable after its original confirm CAS. `anchorDigest = SHA256(RFC8785(COMPLETE ClockAnchor))`; it has NO own digest, future checkpoint, certificate, publication-anchor request/outcome, future ROOT head or current registry file hash.

RetirementConfirmation is the EXACT data-free projection:

```text
{requestId,requestDigest,reservationDigest,nativeOutcomeId,publicReceiptDigest,
 confirmedCustodySequence}
```

It resolves the COMPLETE actual originally committed retirement outcome/event, public receipt, private native proof and original external positive settlement/Core finish in the actual original registry. The projection contains only their original IDs/data-free receipt digest and actual terminal custody sequence; it does NOT include privateProofRecordDigest or the private nativeOutcomeDigest/checksum. Complete private originals remain retained and checked, not reconstructed from the projection. NativeOutcomeId equals lifecycle.retirementOutcomeId and original archive retirement native UUID, public receipt kind=retire. All request/receipt/archive/plan/source/provider/custody links match. Confirmation is genuine terminal confirmed state, not a candidate, native row alone or an exception interpreted as COMMIT.

PublicationConfirmation EXACT:

```text
{publicationOutcomeId,providerId,installationId,targetCustody,requestDigest,
 reservationDigest,headDigest,epoch,publicationRecordDigest,referenceDigest,
 confirmedCustodySequence}
```

It resolves the COMPLETE original positive final inventory native publication/outcome, original external publication confirmation and genuine finished original operation. IDs, complete final .2 publication/reference/source/head/epoch/retirement public receipt and current original custody agree; publicationOutcomeId is that actual original publication UUID. The reference/confirmation precede clock anchoring. This projection contains NO clockAnchorDigest, later lifecycle anchor mutation/outcome, private row proof/hash, predicted transaction time or future confirmation. Its custody sequence is the actual final publication confirmation sequence. Full original records and their exact validators are retained privately under the actual admitted inventory authority branch; the projection cannot invent .2 authority admission (F3 stays external/open).

The fixed original clock issuer FIRST resolves BOTH complete original positive confirmations and their private terminal associations through SAME original publisher/custodian/clock objects under original target/control exclusion. Only AFTER both confirmations are positively durable and resolved does it call the qualified kernel observer. No sample taken before a confirmation may be reused as anchor; no timestamps/COMMIT estimates supplied by caller, database row or wall clock establish this order. If either outcome/confirmation/response is unresolved, no confirmed anchor or elapsed certificate issues. The anchor's start is the actual sample AFTER both; it conservatively delays age. Pre-sample validation and sample/confirm must fit the actual finite original operation deadline, at most30000ms and all tighter limits. External signing waits remain outside native transaction/lease.

SourceSample EXACT:

```text
{profile:"umf.table-retention-kernel-sample/0.1",sourceId,qualificationDigest,
 kernel,rawTicks,timebaseNumerator,timebaseDenominator,sampleTicks,
 ticksPerSecond,uncertaintyTicks}
```

Kernel EXACT `{platform,machineIdentityDigest,bootIdentityDigest,observerExecutableDigest,observerProcess}`; platform literal darwin in this first proposed source, observerProcess EXACT `{pid,startSec,startUsec}` actual original kernel process identity, pid positive native integer, startSec unsigned native64 decimal text, startUsec exact integer0..999999. The qualified native source observes original machine/boot/kernel identity, actual observer executable and actual process, with complete source evidence retained privately. Caller strings or a monotonic-function name are not qualification. Different host/platform requires its own explicitly reviewed source, never coercion to this literal.

RawTicks, timebaseNumerator, timebaseDenominator, sampleTicks, ticksPerSecond and uncertaintyTicks are canonical unsigned decimal text<=2^128-1; numerator/denominator positive. They retain exact native timebase conversion to NORMALIZED NANOSECOND ticks: `sampleTicks = floor(rawTicks * timebaseNumerator / timebaseDenominator)`; ticksPerSecond is EXACT string `"1000000000"`. Native source qualification proves its actual timebase really denotes nanoseconds and includes any read/precision/conversion/quantization/error allowance in uncertaintyTicks (same normalized unit, no native raw-tick/unit mixing). Products use bounded exact integer arithmetic (at most256-bit intermediate), no float or wall-time interpolation. Unsupported/native timebase, incomplete identity, overflow, nonpositive frequency or unavailable bounded error refuses. A platform which cannot establish these semantics does not qualify this first source.

Parent EXACT `{sequence,headDigest}` is the actual original registry prefix immediately BEFORE immutable anchor confirm CAS (clock-registry.md). It names only prior registry event history, never its own event/head/current file. The full anchor+digest is retained at that CAS before publication-anchor native mutation can reference it. A lost response resolves the SAME original key/anchor, never allocates another anchor or samples a later start to change an already confirmed record.

## Exact checkpoint association and conservative arithmetic

ClockCheckpoint remains EXACT:

```text
{profile:"umf.table-retention-clock-checkpoint/0.1",archiveId,anchorDigest,
 previousCheckpointDigest,bootIdentityDigest,sampleTicks,ticksPerSecond,
 uncertaintyTicks,elapsedLowerBoundMs,custodySequence}
```

Every checkpoint resolves COMPLETE SAME immutable anchor and original registry/clock context, not only anchorDigest. First checkpoint has previousCheckpointDigest=null, boot/sample/frequency/error EXACTLY anchor.sourceSample, elapsedLowerBoundMs=0, custodySequence actual checkpoint append sequence. It is a separate original append after positive anchor confirmation; anchor contains no future checkpoint reference. Later checkpoint binds H(COMPLETE previous checkpoint) and actual append custody sequence. Full qualified SourceSample for EVERY later checkpoint is retained in its exact registry entry; its projected sample/boot/frequency/error must equal checkpoint members. SourceId, qualification, machine and clock-context association remain the same originals.

Same-boot advance with `newTicks >= oldTicks` credits ONLY:

```text
creditMs = floor(max(0, newTicks - oldTicks
                           - newUncertaintyTicks - oldUncertaintyTicks)
                 * 1000 / ticksPerSecond)
newElapsedLowerBoundMs = previous.elapsedLowerBoundMs + creditMs
```

Tick/error quantities use normalized nanoseconds, exact integer arithmetic. Intervals are consecutive from the prior original confirmed checkpoint; no overlapping sample interval can be credited twice. The bound is a conservative SUM of proved disjoint lower bounds, not latest-sample minus original start with a resettable error. ElapsedLowerBoundMs is exact nonnegative safe integer<=9007199254740991; overflow refuses rather than wraps/clamps/invents age. Full native/resource/record/custody caps also apply. First anchor cannot credit time before both confirmations.

Same-boot rewind refuses with previous bound unchanged. A qualified genuine reboot/unknown gap credits ZERO across the gap and retains the prior proved bound. An originally authorized clock/custodian operation may establish a new current boot BASELINE checkpoint with same ORIGINAL anchorDigest, previous checkpoint digest and unchanged elapsedLowerBoundMs, using actual newly observed boot/source facts. This is not a new original anchor or age reset. Subsequent proved same-new-boot intervals may add credit. Missing actual target/machine/source/registry continuity, unexplained restored/rewound clock custody or an unqualified replacement source refuses; no bare changed boot string authorizes rebaselining. Sample/append response uncertainty resolves the SAME original checkpoint append key before another sample interval can be credited. Replay addsZERO.

## Certificate, lifecycle publication and original authority

The existing elapsed certificate remains EXACT payload `{profile:"umf.table-retention-elapsed-certificate/0.1",authorityId,purpose,providerId,storeId,archiveId,lineageId,targetCustody,nativeOutcomeId,publicationOutcomeId,anchorDigest,policyRevision,custodySequence,elapsedLowerBoundMs}` and envelope `{payload,keyId,signature}`, original domain profile||NUL||RFC8785 and <=65536 bytes. Issue ONLY from actual originally enrolled clock-key/source capability after verifying the full confirmed anchor and checkpoint chain; custodySequence is the actual selected original confirmed checkpoint sequence and elapsedLowerBoundMs its exact derived bound. Actual record bytes/proofs remain in original registry. All target/purpose/provider/archive/lineage/outcome IDs match anchor and native lifecycle. PolicyRevision equals the actual authenticated current selected policy/intent, and stricter current minimum/holds/dependencies are rechecked by purge; certificate is not purge authority. Changed/missing original policy refuses rather than rewriting the certificate/request.

The internal publication-anchor RecoveryRequest is prepared ONLY after actual confirmed ClockAnchor and first checkpoint. Its clockAnchorDigest is H(anchor) above. Native effect atomically stores that SAME anchor reference with actual retirement/publication IDs and lifecycle revision; it cannot replace original anchor or invent a second age. Unknown native anchor effect observes SAME original request/outcome/publication, never creates another clock slot. Lifecycle.publication.clockAnchorDigest, every checkpoint and certificate all resolve that one actual anchor. No later lifecycle/publication-anchor outcome is inside its own anchor preimage, and no private value checksum escapes through anchorDigest.

Actual original .3/.4 ROOT/application/installed .2 authority routing remains R2-IR-F3, owned externally; these closed DATA records do not supply missing authority, trusted host source qualification or durable native/clock implementation. No caller-provided clock/confirmation/key/certificate or matching digest can issue a capability. No wall-clock duration, prediction, low-entropy business value hash or time credited during an unknown interval is admitted.
