# Exact private clock placement: original registry .2

This proposes a NEW original table-recovery-registry format selected at FRESH original store/registry birth. It is not an in-place addition to the exact registry .1 in sealed001/003. Registry file path, ROOT component kind/slot, owned header/lock/birth, target/provider/context associations, atomic write/fsync/replace/directory-fsync, original outer RLock/flock, pending fences and missing-history refusal remain original-registry.md requirements. Actual allowed .3/.4/bootstrap/ROOT profile dispatch is NOT defined by this amendment (F3 stays externally OPEN).

Primary EXACT:

```text
{profile:"umf.table-recovery-original-registry/0.2",header,requests,events,
 clockAnchors,clockCheckpoints,custodySequence,digest}
```

Header retains exact existing header .1 keys; its definitionDigest now binds this COMPLETE NEW registry grammar/associated records before first file effect. RegistryBirth likewise keeps exact fields with this original new grammar digest. No old confirmed header/file is rewritten to use it; old registry .1 refuses .2. The same real original registryId, path, provider store and newly admitted definition are bound by genuine original creator/ROOT/native confirmations. These JSON records do not register such a resource.

Requests and request entries/attempts/accounting/settlements retain exact original closed records, with effectKey now the ONE exact derivation in effect-keys.md. The clock additions never debit a second independent copy of the same original plan/standalone grant. Full provider/native clock operation and record capacities must be reserved and finite before mutation, including room to finish an already accepted original request/anchor/checkpoint. Pure status/certificate reissue does not append a new checkpoint simply because it was read.

ClockAnchors ordered by original allocation, <=4096 TOTAL and <=one slot per archive/outcome tuple. Entry EXACT:

```text
{anchorId,effectKey,state,anchor,anchorDigest}
```

EffectKey EXACT `[providerId,archiveId,"retirement-publication-anchor",nativeOutcomeId,publicationOutcomeId]`; all UUIDs are real original settled outcome IDs. State prepared|confirmed. Prepared has actual once-allocated anchorId, anchor=null/anchorDigest=null. Confirmed has complete ClockAnchor and H(anchor), whose anchorId and all key members agree. A caller cannot select a fresh nonce or outcome lookalike. Conflicting facts under occupied slot refuse. Preparation requires genuine original settled retirement/publication and actual fixed original clock/publisher capability; it performs no SQL, issues no age/receipt or data effect permission. It durably reserves the ID before sampling/confirming; crash resumes SAME prepared slot/identity, no new key/anchor. A pre-confirm resample may only produce a later conservative start under that SAME still-prepared slot; a confirmed sample NEVER changes.

Anchor confirmation verifies original full confirmations again, captures the qualified source sample AFTER their positive resolution, sets actual pre-CAS parent, and atomically changes prepared→confirmed with its immutable event. No confirmed→prepared/replace/delete or missing-slot reconstruction. Original registry state after uncertain append must resolve before sampling another prospective entry. Actual native publication-anchor effect starts only after this external confirmation AND first checkpoint confirmation. No unsigned caller anchor or certificate can write native lifecycle.

ClockCheckpoints append-only <=4096 TOTAL across provider, not per archive. Entry EXACT:

```text
{anchorId,index,sourceSample,checkpoint,checkpointDigest}
```

Index1..4096 is gapless within the SAME original anchor; key `[anchorId,index]`. Complete SourceSample and checkpoint records are from clock-anchor.md, digest H(COMPLETE checkpoint); all duplicated archive/anchor/boot/tick/frequency/error fields correspond. First sample equals original anchor sample; subsequent samples are actual fresh qualified samples. Expected previous checkpoint digest/index and actual registry prefix are checked by original single-writer CAS. Same key/different entry refuses; exact original replay returns SAME stored bytes, zero credit/appends. A lost append response cannot advance to index+1 until resolved. Full original samples/confirmations/actual clock-source evidence stay privately retained under total registry/record/provider caps, not only hashes.

Events is a CLOSED union: original request event EXACT `{sequence,previousDigest,requestId,kind,entryDigest}` with ONLY original request-event kinds; OR clock event EXACT `{sequence,previousDigest,anchorId,kind,entryDigest}` where kind is clock-anchor-prepared|clock-anchor-confirmed|clock-checkpoint-confirmed. Sequence is one shared gapless event/custody prefix1..4096 TOTAL across BOTH branches; previousDigest null only first, otherwise H(complete immediately preceding event). EntryDigest hashes complete corresponding anchor ENTRY version or checkpoint ENTRY, never current primary/events list/new event/file hash. Checkpoint.custodySequence equals its actual append sequence; anchor.parent is the actual prefix BEFORE its confirm event. Prior original entry versions remain privately retained as required by old grammar, so event history is replayable. No source file contains its future descriptor digest.

Primary.digest hashes COMPLETE primary with ONLY digest omitted, <=8MiB/depth64/nodes100000 and original tighter native/provider/resource bounds. Requests<=4096, anchors<=4096, checkpoints<=4096 and events<=4096 are conjunctive, not multiplicative promised capacity. ClockAnchor canonical bytes<=65536; SourceSample/checkpoint entries<=16384. Full retained private source evidence is additionally charged to original provider metadata bytes; no unbounded opaque blob. Before prepared anchor, verify room for its confirm and first checkpoint plus existing pending journeys. Before later checkpoint, verify room for append and pending actions. Exhaustion refuses; no truncation, rebase, alternative path, process-local sequence or new issuer adoption.

The fixed actual custodian/clock implementation performs these mutations ONLY through original source-owned methods, original confirmed registry/header/lock/ROOT identity and creator-PID/process/thread/target/controller exclusion. Native database transactions are not held while waiting for an external signature. Clock sampling is bounded (<=30000ms and actual tighter enrolled operation deadline), qualified and data-free; no generic clock callback, file append API, supplied state registrar or filesystem search is introduced. An old process cannot mutate after replacement, original pending native effects fence other writers, and unknown clock/SQL/root outcomes settle their SAME original identities before new effects.

Provider native DDL stays the complete amendment00320-table footprint; no clock table, schema exception or driver SQL is added. Fresh provider/metadata definition descriptors bind these new record/registry semantics, while old descriptors remain inputs/history. F3 actual original authority/ROOT source matrix and native/clock durability qualification remain prerequisites before selecting this proposed branch.
