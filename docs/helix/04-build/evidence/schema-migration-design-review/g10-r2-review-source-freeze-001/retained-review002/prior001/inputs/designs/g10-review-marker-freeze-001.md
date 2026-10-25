# G10 review marker wrapper and consumption freeze 001

New explicit design elaboration for the four public APIs/module handoff001 and
its independent review ec4bb96a12ae075b55a78407ed2de85857acde246f19eaadb7263b1625a5abb1.
Governing G10 contract/seed-lineage/full review projections and actual75f reviewed.ts
hashing remain the inputs. This is source-design, not implemented/public/native
support. No runtime executed. Old standalone discovery/marker types/bytes stay
exact; the new inventory family does not widen their kind enums or admission.

## One exact wrapper and original hash domains

New inventory Marker is EXACT `{id,kind,path,oldDigest,newDigest}`. The optional
old standalone conversion:string field is NOT a new G10 escape hatch: checked
conversion recipes are the exact selected G04 conversions option/discovery branch.
Old standalone optional conversion behavior remains unchanged outside G10.

Candidate is EXACT those five keys PLUS mandatory `oldValue,newValue`, and ONLY
optional `oldPath,newPath` where the original component supplies them. Four new
kinds below always include BOTH path members, with explicit null for absent side.
No raw InventoryProjection[] is a Candidate[] or serialized plan.review.

```text
oldDigest = H(COMPLETE oldValue)
newDigest = H(COMPLETE newValue)
id = "review-" + first24lowerHex(H([kind,path,oldDigest,newDigest]))
```

H is SHA256 original RFC8785 UTF8. Undefined is normalized to JSON null ONLY at
the existing original absent-value boundary, never omission/unknown meaning.
No hash of projection.meaning alone, table definitionDigest, bundle digest,
ID/name tuple, effect string list alone or shortened source is substituted for
these COMPLETE values. Candidate wrapper/path metadata is outside old/new value
preimages, exactly as existing reviewed.ts; id never hashes itself. Detect an ID
collision with different full preimages; never silently take the first.

Marker keys are the stripped exact Candidate keys above. Additional actual
oldPath/newPath metadata is excluded from Marker, retained in plan.review.
Strictly validate types/unknown keys before comparison. Caller-provided kind,
path, digests or reviewed string never authorizes an unsupported operation.

## Complete table side projections and absence

P(side,table,intent,effects) is EXACT governed
`{profile:'umf.table-inventory-review/0.1',side,source,configuration,table,record,
 meaning,intent,effects}`. Source is actual complete side's original JSON source
SHA256. Configuration complete actual verified side config. Table/Record exact
stable selected identity. Present meaning is COMPLETE existing source/catalog/
Record/Field/operation/default/seed/dependency/unknown-extension closure, as the
original G10 projection defines, never current catalog or renderer tags alone.
Absent meaning is JSON null; the rest of its actual side source/config/identity
remains present. Such an absent projection is NOT JSON null.

The side intent is the COMPLETE cycle-free discovery intent: create original
`{kind,table,record}`; remove original `{kind,table,record,disposition:{mode:
'irreversible-purge'}}`. It contains NO eventual reviewMarker. Effects is the
exact ordered prospective action list from G10 contract, on BOTH side projections:
create `['new-physical-binding']`; remove
`['ordinary-access-retired','stored-rows-irreversibly-purged',
'physical-binding-removed']`. These are REVIEWED PROSPECTIVE effects, not a claim
that old state already executed them or that a native outcome exists.

If previous=null, there is genuinely no before source; create oldValue is JSON
null and oldPath=null. Never fabricate a before deployment or projection/source
SHA. If previous exists but lacks the selected table, oldValue is the FULL absent
previous P with actual previous source/config. For removal next always exists;
newValue is FULL absent next P with actual next source/config. Do not conflate
this review domain with inventory change absent before/afterMeaningDigest=H(null)
or phase tableState absent definitionDigest=H(null).

## Exact new kinds, values and paths

Table/seed pointer indices are ACTUAL full original authored-source indices from
verified side bytes, not filtered table/source positions. JSON Pointer escaping
is the existing source-pointer rule. Display-name/ordinal similarity never pairs
identities. i below is ORIGINAL tableIntents index; j original retiredSeedSets
index in public selector/compiler options, unchanged by normalization.

| Kind | oldValue | newValue | path | oldPath | newPath |
| --- | --- | --- | --- | --- | --- |
| create-table | full previous absent P, or null ONLY initial | full next present P | actual next table declaration pointer | null | that next pointer |
| remove-table | full previous present P | full next absent P | actual previous table declaration pointer | that previous pointer | null |
| table-removal-effects | SAME full previous present P | SAME full next absent P | /options/tableIntents/i/disposition | previous declaration pointer | null |
| retire-seed-history | exact previous SeedReview below | exact next SeedReview below | /options/retiredSeedSets/j | actual previous seed definition pointer | null |

Removal emits BOTH remove-table and table-removal-effects. Their old/new value
hashes are intentionally equal, while kind/path/id differ. The first reviews the
binding delta; the second explicitly reviews irreversible full stored-row/column
loss. Removal intent.disposition.reviewMarker MUST reference the latter exact
candidate ID, never remove-table or another table/effects marker. Preserve the
located IRREVERSIBLE_TABLE_PURGE disclosure; retained recovery is not immediate
purge and uses its separately allocated R2 family, not this marker alias.

/options paths are FIXED prospective compiler-intent locations even in the
cycle-free public discovery call's selector argument. They are not authored JSON
schema pointers or authority. oldPath/newPath separately retain source locations.
No private native object/receipt/UUID is invented by these paths.

SeedReview is NEW closed DATA value profile
`umf.table-inventory-seed-retirement-review/0.1`, EXACT:
`{profile,side,source,configuration,id,definition,definitionDigest,
 originalSourceDigest,execution,retired,effects}`.
Side previous|next; source/config complete actual side as above. Definition is
COMPLETE immutable ORIGINAL authored seed set from first definition occurrence in
source history, including row/set/value order, defaults/omissions/extensions.
DefinitionDigest hashes that complete governing original definition, not live
rows or only IDs; originalSourceDigest is its first original complete source.
Complete original definition/source bytes stay in supplied verified history.
Current previous must still contain that same unretired definition, next must
omit it and selector must explicitly retire it. Unknown/unproved history or
redefinition/retired reuse refuses before marker construction.

Execution is actual PURE source-history state not-run|confirmed; same on both
sides, never inferred from source existence, data counts, selection or an unknown
native effect. Previous.retired=false, effects=[]; next.retired=true, effects
EXACT `['original-definition-and-execution-retained-in-history','no-data-replay']`.
Both sides retain SAME complete definition/original origin/execution; next source
has no live definition but original remains in the review/history. No split of
a mixed-table set, row deletion/refill or fabricated native success. Actual host
still proves its original applied outcomes before effects. This value is not the
five-key plan/prefix seedLineage entry, whose profile/keys remain unchanged.

## Original component candidates and deterministic order

Verify full original bundles and chronological history independently first. Build
legacy/retained-source component candidates using shared original discovery/value
constructors on FULL source bytes, never a filtered source or invented empty
bundle. G10's general retained-source review uses complete original discovery.3
semantics, including operation-context meaning. Original selected G04/G05 discovery
adds its EXACT original recipe/retention/restoration candidates under that fixed
component profile; original G03 default value constructor remains authoritative.
Do not append invented same-name aliases or parse generated SQL. If a component
profile/helper is not integrated/qualified, report that exact gate; do not claim
its marker from a weaker legacy path. Markers can describe valid known source
meaning while the compiler still blocks its unimplemented/native effect.

Candidate order is deterministic, not caller-sorted by marker ID:

1. General retained-source discovery.3 candidates in the existing constructor's
   original order; skip this before/after branch ONLY for genuine previous=null.
2. Component-specific G04/G05 additional candidates in original selector array
   order and each original constructor's order, preserving exact original value
   domains. Shared G03 results already in the general branch are not repeated.
3. For EACH original tableIntents entry in authored order: create-table, OR
   remove-table immediately followed by table-removal-effects. Every and only
   exact inventory delta has its matching unique intent before candidates issue.
4. retire-seed-history in original retiredSeedSets authored order.

Deduplicate exact semantic candidate identity after strict validation, preserving
first occurrence: SAME id/kind/path/digests/FULL oldValue/newValue required.
Optional oldPath/newPath metadata is merged only when absent on one contributor;
where both supply it they MUST match exactly, including null. Conflicting full
values, paths, profiles or ID collision refuses as ambiguous original meaning,
never choose a convenient projection or silently drop a source path. Every path
supplied by a component must actually resolve through its own original source
binding. Bound count<=2048 and all source/history/plan/resource caps incrementally;
no truncation or partial success at overflow.

The selected component's exact local semantic validation remains mandatory.
General G10 review.3 does NOT change old standalone .4/.5/.7 marker bytes or their
whole-source rules. G10 adapters consume the globally verified marker ownership
map then invoke genuine shared local constructors with FULL original bundles and
the exact component selections, not a widened legacy compiler or a filtered source.
If an original component marker's full domain conflicts with a general candidate,
refuse/review the exact composition rather than silently substituting its hash.

## Exact compiler and plan.review consumption

For a supported G10 request, construct its public discovery selector by copying
ONLY the governed selector fields from original options. Change ONLY selector
version to discovery.1 and remove ONLY eventual irreversible marker references:
remove disposition.reviewMarker and irreversible G04 recovery.reviewMarker.
Preserve every other intent/recipe/policy/archive/source member and array order.
G05 retirement/restoration forms keep their exact original marker-free selector
forms. No backfill/default/seed-selection/concurrent/validation option is invented
in discovery to satisfy compile validation; actual source changes derive their
full markers from the original sources. originalHistory remains explicit.

Let C be COMPLETE ordered public discovery Candidate[] above. Require
options.reviewedChanges to equal EXACTLY C.map(stripCandidateToFiveKeyMarker),
in SAME order, with no omitted/extra/duplicate/stale/changed/unsupported property.
Do not normalize a reordering after approval. New create requires its create-table
marker; remove requires both exact markers plus its inline effects ID; seed
retirement requires its exact selected marker. All original field/dependency/
operation/context and selected component effects candidates are included. Initial
empty inventory with no source changes has C=[]; fixed metadata alone creates
no source-review marker. Unimplemented/ambiguous meaning remains blocked even
with a matching marker. Old standalone subset/order rules remain unchanged.

Plan.review is EXACT C, including COMPLETE old/new values and optional source
paths. options.reviewedChanges retains ONLY exact five-key markers. inventory
change meaning digests, prefix definition digests and raw side-projection arrays
are distinct; they cannot be cast to plan.review. Serialized plan schema/type and
full recompiler MUST validate this exact candidate array, and plan digest binds
it as normal. Original request history stays separate, never recursively embedded
as a marker to evade history capacity.

Every marker gets ONE source-derived ownership claim from a real selected
inventory/component/source-edit certificate. Shared/companion markers have one
joint owning group, not duplicate physical effects. A created-only command/source
change is reviewed metadata/source meaning owned by its actual CREATE closure;
it does not execute that command as migration SQL. A temporary unchanged default
teardown/reinstall around conversion creates no authored default delta/marker;
actual changed companion consumes its existing exact default marker ONCE under
conversion-default-lowering001. Any discovered marker without an admitted source/
effect owner blocks compilation. Markers do not erase unknown dependencies or
confer native existence/custody/approval/COMMIT authority. No fabricated public
metadata step or unchecked targetCatalog assignment is introduced to claim them.

The public discovery function is independent of compile and future markers. It
must NOT call compile with fake id/predecessor/options/marker strings or silently
invoke a hidden native lookup/caller verifier callback. Reuse independent source/
history/value constructors. Full verify/serialize recompiles using SAME explicit
history and reconstructs C/claims, then compares complete plan bytes. A caller
who rehashes a forged wrapper/projection/options/step cannot pass verification.

## Implementation and required UNRUN controls

Implement in inventory-review/source/history owned modules from API handoff001,
with a shared inert marker constructor extracted from actual reviewed.ts hashing
if appropriate. Preserve old public APIs/exports/types/schema behavior. New
inventory review schema admits these exact wrapper/value kinds, not raw Json[]
or projection[]; seed review gets its separate closed schema/type. General old
component wrapper formats retain exact original optional path behavior.

Finite controls: fresh null versus installed absent projection oldDigest; complete
unknown source/Record/Field/operation/seed closure preserved; table declaration
indices moved by CREATE yet side paths exact; remove/effects identical value
hashes but distinct kind/path/id; effects ID on wrong table/kind/option index;
seed not-run versus confirmed retirement with same immutable definition/full
history and no data replay; reused retired seed; strict candidate count/order/
dedup/path conflicts/truncated-ID collision controls; no marker self-cycle;
compiler omitted/extra/duplicate/reordered/forged markers and inline wrong ID;
raw projection[] rejected as plan.review; independent discovery before compile;
unsupported effect still blocked despite marker; exact old legacy bytes and
G02 frozen digest; full compile/discover/verify/serialize/browser schema parity.
Actual native source/custody/Weft/installed/R2/old-store/managed/release/public
artifact evidence remains required. R2's added table-retire/restore markers and
new archive-source family need their OWN exact .2 elaboration; this .1 freeze
does not alias them to irreversible purge or declare full backlog completion.
