# Exact inventory.2 review schema/type source contract001

Design grammar for implementation owner to encode as Draft2020-12 JSON Schemas
and TypeScript discriminated unions. No schema evaluator or product code ran.
Actual emitted schemas, refs, imports, exports and browser assets require exact
source capture/review/qualification. This text is not a claim of valid JSON files.

## Closed Candidate union

Marker EXACT {id,kind,path,oldDigest,newDigest}; Candidate adds mandatory oldValue/
newValue and only optional oldPath/newPath. Every NEW R2 kind below requires BOTH
paths with stated nullability. No conversion qualifier/extra profile/unknown
wrapper key. ID review-24lowerhex; both digests64lowerhex. Hash rules exactly the
accepted norm files, full RFC8785 values and original tuple, not digest/name-only
preimages. Old .1 kinds, TableReview, SeedReview and original component values
retain their exact original discriminated definitions/preimages/optional paths.
Do not permit old candidate kinds to select a new R2 value by familiar key names.

| New kind | oldValue | newValue | oldPath | newPath |
| --- | --- | --- | --- | --- |
| retire-table / table-retention-effects | P2 previous, current present, archive null | P2 next, current null, archive null | string | null |
| restore-table / table-restoration-effects | P2 previous, current null, archive present | P2 next, current present, SAME archive | null | string |
| restored-table-source-change | TableSource archived | TableSource next | string or null for actual subject absence | string or null for actual subject absence |
| lineage-restore-field / lineage-field-restoration-effects | LineageField archived | LineageField next | string | string |
| restored-field-source-change | FieldSource archived | FieldSource next | string | string |

P2 EXACT {profile:'umf.table-inventory-review/0.2',side,source,configuration,table,
record,meaning,intent,effects}. Meaning EXACT {profile:'umf.table-recovery-review-
meaning/0.1',current,archive}. Current is complete original source/catalog table
meaning or null. Archive null for retire; for restore EXACT {reference,source,
configuration,meaning}, full TableArchiveRef/original archived source/config/full
source-meaning material. It is SAME on both sides. P2 meaning itself is never
null. Intent exact cycle-free retire/restore union; no reviewMarker. Effects
exact corresponding retirement/restoration tuple from table-marker norm001,
identical BOTH sides. Primary and effects share exact full values but distinct
kind/path/ID. Intent/index/path/source/ref correspondence requires recompile.

TableSource EXACT {profile:'umf.restored-table-source-review/0.1',side,source,
configuration,restoreIntentIndex,table,record,archive,subject,meaning}. Side
archived|next; archive full TableArchiveRef; index0..511 resolves actual restore.
Subject exact accepted companion001 union WITH per-command module,id context
correction003. Field subjects meaning full {physical,logical,mapping}; dependency
subjects full original declaration/catalog constructor value; policy/grant full
original constructor meaning. Operation meaning COMPLETE raw command JSON/null;
context meaning EXACT version/source/configuration/module/operation from003.
Meaning null only genuine allowed subject absence, never unknown content.
Context/Field requiredness/default comparisons cannot use absent subject meaning.

LineageField EXACT {profile:'umf.lineage-field-restoration-review/0.1',side,source,
configuration,selectionIndex,table,field,archive,lineage,newInstances,meaning,
effects}. Side archived|next, index0..255. Full original G05 FieldArchiveRef,
non-null exact new lineage selection, original refuse|null|fill union; meaning
full {physical,logical,mapping}; effects exact five-token tuple in companion001.
Full original FIELD archive source on old side, not whole archive source. Both
sides full same original archive/lineage/newInstances/index/table/Field.

FieldSource EXACT {profile:'umf.field-archive-source-review/0.1',side,source,
configuration,selectionIndex,table,field,archive,lineage,subject,meaning}.
Lineage null ONLY actual old same-carrier G05 option; otherwise full original
lineage selection. Subject EXACT {kind,field}, kind change-default|tighten-not-null|
relax-not-null. Both meaning full original Field constructor, both mapping paths
nonnull. Other common fields/side/source rules are Fieldaddendum002, unchanged.
No option, step, original archive or native receipt gets nullable lineage added.

## Shared original leaf types and schema checks

Source EXACT {format:'json',sha256}; configuration COMPLETE verified original
TableDeploymentConfiguration. Ref EXACT {module,element}, original ID bounds.
TableArchiveRef/FieldArchiveRef/TargetCustody/lineage/newInstances exactly their
pinned original R2/G05 definitions, not arbitrary Json records. Whole materials
are EXACT five kinds/bytes/digests/limits, Field sources exact original tighter
G05 source/aggregate limits. Full table/Field meaning uses actual original typed
constructors with every unknown extension preserved inside original declarations.
JSON schema cannot assert that a submitted meaning is the COMPLETE original:
source/history recompile and closure certificate remain mandatory, never replace
this check with unconstrained Json acceptance or a hash match.

Use closed additionalProperties:false objects and exact required lists at every
new control/value wrapper; kind/subject/side conditional branches must enforce
all expressible role/null/path/effect/intent constraints. Validate complete local
$ref and external URI closure against the actual frozen schema cohort. Literal
full JSON types may preserve unknown source payload values but do not broaden
control wrapper/subject/ref unions. UUID/D64/byte/integer/ID original rules apply;
UTF8 byte limits/crossrecord equality/full source identity are explicit semantic
validation in addition to structural schema. No blanket coercion/defaulting.
New schema IDs must name new inventory.2/source-review families; no redefinition
of issued old schema URI. Exact artifact symbols/paths go in source cohort.

## Stage and publication boundary

Discovery2 selector EXACT original eight keys including tableArchiveSources and
NO defaultChanges/reviewedChanges. Derive all actual selected-restoration default
deltas independently. Compile2 options EXACT original .2 keys, rederive same C,
require exact ordered stripped markers plus every/only A/B/C default selector and
once-only ownership. Plan.review EXACT full C. Verify/serialize reconstruct full
plan with explicit original history and compare exact canonical bytes; no LF.
Final complete plan INCLUDING digest/review<=24MiB; earlier subprojection size
is not sufficient. Max2048 candidates, all original array/source/option/history/
native limits are conjunctive. New public disclosure shape stays presentation
only, never success Diagnostic or serialized extra plan member.
