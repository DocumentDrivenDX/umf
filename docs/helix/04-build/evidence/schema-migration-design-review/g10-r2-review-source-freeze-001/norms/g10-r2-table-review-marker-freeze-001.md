# R2 table recovery review markers and disclosures 001

Finite SOURCE-DESIGN elaboration for the four NEW retained-table marker kinds.
Inputs: R2 amendment004 manifest17988fd05d8001426cda7d05fb812919b6feaa28484bc2fc17edca745a86098c;
its original contract.md/whole provider/lifecycle definitions and epoch addendum005;
G10 marker freeze001 and adoption addendum002. Not an adoption, implemented API,
native proof or completion of R2 discovery. Existing .1 markers/SeedReview and
standalone G04/G05 rules remain exact. A final new definition/cohort MUST bind
this text and005 explicitly; immutable004 descriptors do not already include it.

## Deliberate new-family value clarification

R2 contract.md currently calls its nine-key side value a Candidate. That is the
VALUE, not the wrapper. The public Candidate wrapper remains EXACT
`{id,kind,path,oldDigest,newDigest,oldValue,newValue}` plus original optional
oldPath/newPath; the four kinds below ALWAYS include both paths, null for absent.
Their side value P2 is EXACT
`{profile:'umf.table-inventory-review/0.2',side,source,configuration,table,record,
meaning,intent,effects}`. This is an explicit new-family contract/schema amendment.
The .1 kinds in .2 plans retain their original .1 values/preimages (and original
component values); do not relabel them .2 and silently change approved IDs.
Seed retirement retains its separate exact SeedReview. No raw side projection
array is plan.review. Options.reviewedChanges remains five-key markers only.

For these four kinds ONLY, meaning is this NEW closed data object:
`{profile:'umf.table-recovery-review-meaning/0.1',current,archive}`.
Current is COMPLETE original table/source/catalog/Record/Field/operation/client/
seed/default/dependency/policy/grant/unknown-extension meaning on that actual side,
or JSON null if that side lacks the binding. No native rows or inferred catalog.
Archive is null for retirement. For restoration Archive is EXACT
`{reference,source,configuration,meaning}`:
reference is the COMPLETE original TableArchiveRef from the selected intent;
source is `{format:'json',sha256}` over COMPLETE original retirement source bytes;
configuration is COMPLETE original archived configuration; meaning is COMPLETE
original archived source-meaning material, decoded under its original validator,
including every original source/native-domain/closure/unknown fact. Resolve and
cross-check ALL five complete TableArchiveSources materials plus original
history, retirement plan/Record/table/domains/ref/target/config and source digest.
Never trust a caller's independent reduced meaning, or make native existence
follow from the ref. Archive is IDENTICAL on both review sides and remains data.

This nested current=null is the absence indicator for NEW P2 values. P2.meaning
itself remains present, even on an absent side, to preserve archived provenance;
P2 side source/config remain the actual CURRENT before/after source bindings.
This deliberately clarifies the formerly unspecified .2 meaning structure;
.1's full absent P.meaning=null and inventory/prefix H(null) domains are unchanged.
Do not use either review domain for tableState.definitionDigest,
InventoryTable.meaningDigest, nativeDomainDigest or tableRecoveryBinding hashes.
Full source materials remain in original context/options; review does not embed
row values/private proof/clock sample/hold reason or any value-derived checksum.
All original conjunctive plan/options/history limits apply incrementally, even
when full review closure costs more bytes; overflow refuses, never truncates.

Intent is exact original cycle-free retire/restore TableIntent with ONLY its
reviewMarker omitted. Preserve table/Record, full retention or TableArchiveRef
and all original ordering/bounds. No future archiveId/token/OID is allocated for
retirement. Actual retained archive ref is mandatory for restoration; never treat
it as a fresh create or reconstruct a missing retirement history/identity.
Effects is the full ordered PROSPECTIVE list below on BOTH P2 sides. Retirement
binds a prior present/current next absent table; restoration current previous
absent/next present table. Every original source/history/mode constraint remains;
this adds no null-previous restoration or archive adoption exception.

## Exact pairs, paths and hash domains

Let i be the ORIGINAL unfiltered tableIntents index. Binding delta and effects
markers use the SAME complete old/new P2 pair, but distinct kind/path/IDs.
Paths are actual authored declaration pointers through their corresponding full
original JSON source. `/options` is the fixed prospective compiler-intent
namespace also used in independent public discovery. Both path members present.

| kind | path | oldPath | newPath |
| --- | --- | --- | --- |
| retire-table | actual previous table declaration | previous declaration | null |
| table-retention-effects | /options/tableIntents/i/retention | previous declaration | null |
| restore-table | actual next table declaration | null | next declaration |
| table-restoration-effects | /options/tableIntents/i/archive | null | next declaration |

Retirement effects EXACT ordered
`['ordinary-access-retired','whole-live-population-retained',
'physical-binding-removed','lineage-and-issued-identities-retained',
'separate-purge-required']`.
Restoration effects EXACT ordered
`['original-live-population-restored','new-physical-carrier-born',
'original-instance-lineage-preserved','current-after-policy-validated',
'no-seed-or-default-replay']`.
No token claims already-executed effects or guaranteed native eligibility.

Use SAME original hashing:
`oldDigest=H(full oldValue);newDigest=H(full newValue);`
`id='review-'+first24(H([kind,path,oldDigest,newDigest]))`.
H is complete RFC8785 SHA256; no self ID/path/own wrapper in value hash.
Intent.reviewMarker MUST identify its exact EFFECTS candidate, not primary
retire/restore-table, immediate-purge marker, other index/table or G05 Field
marker. Both primary and effects five-key markers must appear in ordered complete
options.reviewedChanges. Lifecycle RecoveryRequest.intent.reviewMarkerDigest
is H(the COMPLETE corresponding five-key EFFECTS marker), explicitly not H(ID
text), H(Candidate), tableMeaningDigest or future native receipt. Native facade
must recompute that marker from full original inputs before effects; digest
shape alone does not authenticate a plan or issuer.

## Order, consumption and required presentation

In marker-free .2 discovery, remove ONLY eventual reviewMarker members from the
exact governed remove/retire/restore location; validate all other source/intent/
archive/policy members and explicit original history. Do not invent placeholders,
fake source/before bundle or compile to discover. Keep freeze001 general original
and selected component prefix ordering, then process tableIntents in authored
order: create emits its original .1 single marker, remove its original .1 pair,
retire this pair, restore this pair. Each effects marker immediately follows its
primary. Retired seed markers follow in authored order. Original exact dedup,
optional path merge/conflict/ID collision/count caps apply. Full plan.review is
EXACT complete ordered Candidates. Primary/effects both belong to ONE joint
actual selected table-recovery group; no duplicate capture/drop/restore charges.
Every other original source/component marker still requires its real owner.

The public disclosure location is the effects Candidate in independent discovery
and plan.review, using the fixed presentation mapping convention of addendum002.
For table-retention-effects derive EXACT
`{code:'TABLE_RETENTION_REVIEW',path:c.path,markerId:c.id,message:M}`.
With t=c.oldValue.table and r=c.oldValue.intent.retention, M is exactly:
`'Retire table ' + t + ' and retain its whole live population under policy ' +
r.policyId + ' revision ' + decimal(r.policyRevision) + ' for at least ' +
decimal(r.minimumRetentionMs) + ' ms of qualified elapsed time after confirmed retirement and publication. Ordinary access and the physical binding are removed. Later purge requires separate signed authorization, verified eligibility or an explicitly authorized minimum-window override, and no committed hold or protected recovery dependency; it irreversibly deletes retained values. This does not promise backup or WAL erasure.'`
Decimal means exact canonical unsigned integer text, no locale/rounding.

For table-restoration-effects derive EXACT
`{code:'TABLE_RESTORATION_REVIEW',path:c.path,markerId:c.id,message:M}`.
With t=c.newValue.table and a=c.newValue.intent.archive, M is exactly:
`'Restore the original captured live population for table ' + t +
' from archive ' + a.archiveId + ' into a new physical carrier while preserving original instance lineage. Current after-source constraints and policies must validate; seeds and defaults do not replay stored values. Purged or unavailable values cannot be restored.'`
Render one per effects Candidate in candidate order BEFORE approval; preserve
code/path/marker/message if additionally displaying full source/retention/archive.
No added Candidate/result Diagnostic/plan member. Successful diagnostics stays[].
No public record reports current hold eligibility/elapsed age/native availability
merely because this planned disclosure exists. Native original provider rechecks
full state/policy/clock/holds/dependencies and same-TX data proof.

## Remaining design/source and UNRUN acceptance gates

This freezes these FOUR table markers, not full .2 compiler support. Restoration
still needs exact original source/component marker ownership for every admitted
archived-to-after requiredness/default/CHECK/policy/grant/dependency/operation
change. General current-before discovery cannot silently replace archived-before
meaning; a shared local constructor must retain full actual original sources and
explicit restored-domain ownership, never fabricate a before deployment. That
companion review-source/certificate elaboration, plus the new G05 cross-carrier
Field marker domain, remains OPEN for finite source freeze before .2 lowering.
Matching table markers alone cannot authorize unsupported transformations/fills.

Required controls (all UNRUN): exact kind-discriminated P1/SeedReview/P2 schemas;
current absent versus full archive preserved; wrong original material/ref/source/
policy/binding refused; same full pair/distinct ID/order for each action; missing/
stale/wrong-index/wrong-kind inline ID; changed retention minimum/revision or
archive changes full hashes; no marker self-cycle; Hfivekey native review binding;
complete unknown meaning or located refusal; no private value/hold/clock leakage;
no seed/default replay/new-instance fill via whole restore; exact disclosures;
strict limits/full canonical verify/browser parity; immutable .1/G04/G05 bytes;
actual native whole-population/lineage/clock/holds/failure recovery/installed/old-
store/managed/release/public-artifact evidence. Full R2 F3 and backlog remain open.
