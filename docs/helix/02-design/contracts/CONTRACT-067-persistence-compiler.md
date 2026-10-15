---
ddx:
  id: CONTRACT-067
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-004
      kind: informed_by
---

# CONTRACT-067: Design-time persistence compiler

**Type:** library/file bundle. **Version:** proposed `umf-persistence-compile/0.1`.

## Purpose

Define offline compilation of UMF meaning into reviewable source. Compilation
MUST NOT connect to databases, start runtimes, install dependencies or execute
artifact-supplied code. Source generation is separate from native qualification
and consumer execution admission.

## Scope and Boundaries

UMF owns admission, semantic resolution, source generation and fidelity reports.
The caller supplies exact source texts and a trusted installed target profile.
The portable TypeScript library returns files as data; a separate host tool owns
filesystem writes. CONTRACT-068 defines generated Python/backend semantics;
CONTRACT-069 defines engine adoption. No new core scalar or extension vocabulary
is introduced by this compiler contract.

## Normative Surface

`compilePersistence(request, profile)` is synchronous, pure and deterministic.
Inputs are copied; caller-owned data MUST NOT be mutated. All records below are
closed except preserved UMF source content. Unknown contract fields refuse.

### Request

| Member | Shape | Rules |
| --- | --- | --- |
| `contract` | string | Exactly `umf-persistence-compile/0.1` |
| `sources` | array of `{id,format,text}` | Unique nonempty opaque ID; format `json` or `yaml`; text admitted by CONTRACT-001 |
| `logical` | source ID | Exactly one supplied logical document |
| `bindings` | source ID array | Ordered, unique; explicit CONTRACT-042 or native definition profile; each declares matching logical identity where applicable |
| `selection` | array of `{module,element}` | Nonempty, unique local Record IDs; exact identifiers, never display names |
| `target` | string | `python-models`, `postgresql-sqlalchemy` or `spark-delta` |
| `profileId` | string | Exact match to installed profile |
| `mode` | string | `strict` or `report` |
| `package` | string | One ASCII Python identifier matching `[a-z][a-z0-9_]*`; reserved words refuse |
| `names` | array of `{sourceId,pointer,python}` | Explicit overrides for generated public symbols/attributes; source pointer must exist; valid nonreserved ASCII identifier |
| `projections` | array of `{name,record,fields}` | `name` is a valid nonreserved Python identifier; `record` is `{module,element}` within selection; `fields` is a nonempty ordered unique array of local `{module,element}` Field references owned by that Record; no computed fields, joins or renames in 0.1 |
| `valueBindings` | array defined below | Explicit instance-view presence/carrier choices; complete for selected/reached Record membership |

All request members are required; `bindings`, `names` and `projections` may be
empty arrays when the target permits. Projections are finite column selections;
their names and generated model names participate in the same collision checks.

Each value binding is `{record,fields}` with a local `{module,element}` Record
reference and a complete ordered `fields` array covering owned member Fields and reachable
item/value Fields. Only owned member Fields become record attributes; item/value
entries define nested carriers and MUST set omission false, mutable false and
generated false. Conflicting reuse of a Field across native contexts refuses.
Each member is
`{field,row,create,mutable,generated,origin}`: `field` is the full local Field
reference; `row` and `create` are `{omission:boolean,null:boolean}`; `mutable`
and `generated` are booleans; `origin` is `{sourceId,pointer}` pointing to the
supplied authored/native binding choice. Duplicate/missing members or unsupported
origins refuse. A trusted profile MUST check these choices against core and
native assertions; they cannot override a conflict. `generated:true` requires
explicit native generation in supplied metadata and excludes Create/Patch.
`mutable:false` excludes Patch; key members are immutable in the initial profile.
Patch omission is always permitted as an operation-level no-change instruction;
it is not a stored absence carrier. A pure Python target still requires an
explicit instance-view binding. Core absent-allowed never selects omission/null.

Nested primitive item/value Fields require an exact qualified native/profile
carrier rule with retained origin, even when they are not Record members;
missing/ambiguous rules refuse. Arrays cannot omit positions, contain UNSET or
collapse null into a missing entry. Map-value null follows its explicit rule;
absence of a map key is not a present null value. Patch null acceptance deliberately
equals the corresponding `create.null` input carrier in 0.1. A native update/input
profile with different null semantics requires a separately defined binding and
refuses in this profile; it cannot silently reuse Create semantics.

Default policy in 0.1 is exclusively preserve-only: retain literal default and
its `on` trigger, never insert or resolve it. Constructors/codecs validate the
declared pre-default input view; default execution remains an engine obligation.
Do not infer Create omission or null acceptance from a default. A profile needing
default resolution to validate stored values must prove that in its consumer
protocol or refuse adoption; no generated default-execution support is claimed.

The compiler follows explicit local membership, Field, item/value, Key and
Relationship references to compute a finite dependency closure. It MUST NOT infer
ownership, defaults, identity, DDD equivalence or physical layout from names.
External-document reference resolution is outside 0.1; such dependencies refuse.
Multiple supplied documents do not enable cross-document references implicitly.

### Trusted profile

`profile` is installed trusted code plus inert metadata. Metadata contains `id`,
`version`, `compilerVersion`, `target`, `coreVersions`, exact `{id,version}`
vocabularies, `dependencies` as exact `{distribution,version}` pairs, `platform`
as an ordered array of `{name,version}`, `configuration` as a portable JSON
object, `reservedNames` and `importedNames` as unique sorted string arrays,
and `subset` as a nonempty string. Every metadata field is required.
Unknown versions or mismatched target/profile refuse. Artifact contents MUST NOT
locate or load a profile, template, callable, plugin or dependency. Profiles MUST
include trusted semantic coverage rules for every supported assertion kind.

Candidate starting points are Python 3.11, Pydantic 2, SQLAlchemy 2,
PostgreSQL 17.11 and Spark 4.0.1. These are design candidates, not complete exact
locks or evidence. Until all exact pins/configuration and the target corpus pass,
the profile MUST remain unqualified; generation tests may use an explicitly named
development profile without claiming consumer adoption. Dependency resolution or
substitution at runtime is forbidden.

### Result

| Member | Shape | Rules |
| --- | --- | --- |
| `contract` | exact contract string | Same version as request |
| `abi` | string | Exactly `umf-python-access/0.1`; independent of compiler/core versions |
| `outcome` | `candidate` or `refused` | A candidate is never execution authorization |
| `sourceArchive` | original `sources` array | Complete exact text, including unselected/unknown content |
| `profile` | profile metadata | Complete copied inert metadata |
| `inputDigest` | lowercase SHA-256 hex | Defined below; records exact inputs |
| `files` | array of `{path,text,sha256}` | UTF-8 source/text only; deterministic sorted relative POSIX paths |
| `symbols` | array of `{sourceId,pointer,path,symbol,role}` | Source map; role `row`, `create`, `patch`, `key`, `projection`, `storage` or `codec` |
| `dispositions` | array described below | Complete selected assertion census plus unselected unknown locations |
| `diagnostics` | array of `{code,sourceId,pointer,message}` | Deterministic source-order errors/limitations; message contains no source values |
| `obligations` | array of `{id,owner,description,dispositionIds}` | Owner `host`, `database`, `engine` or `qualifier`; no assertion of discharge |

All members are required. Refusal MUST return empty `files` and `symbols` while
retaining source/profile/report whenever input admission permits. Admission
failure before a valid request exists throws a typed diagnostic, not a fabricated
source archive. An output file MUST NOT include a digest of itself.

Dispositions contain unique `id`, `sourceId`, JSON Pointer `pointer`, `assertion`
(trusted profile's assertion-kind identifier), `relevance` (`selected`,
`dependency`, `unselected`), `fidelity` (`exact`, `approximated`,
`not-expressible`, `unknown`), `checks` (unique array of `client`, `database`,
`engine`, `informational`), `reason` and `obligationIds`. Empty `checks` means
unchecked. A database/engine entry means a generated requirement, never observed
installation or enforcement. All selected known assertions MUST be enumerated,
including ones that emit no code. Unknown fields/extensions MUST have locations;
their contents remain in the source archive, not diagnostic messages.

Strict refuses any non-exact selected/dependency disposition. Report MAY emit a
candidate for a known, safe approximation with every loss retained; it MUST
refuse unknown relevant semantics and any approximation that broadens accepted
writes or asserted enforcement. Metadata-only informational declarations may be
exact representations with undischarged enforcement obligations. This distinction
MUST remain visible. No mode turns preservation into interpreted support.

### Fingerprints, naming and ordering

For digest purposes use JSON Canonicalization Scheme (JCS), RFC 8785: recursively
sort object keys by UTF-16 code units, retain array order, use ECMAScript primitive
serialization including NumberToString, emit UTF-8 with no whitespace/trailing
newline and perform no Unicode normalization. Reject lone surrogates. Numeric
admission still follows CONTRACT-001; canonicalization cannot recover rounded
inputs. Independent golden canonical-text and SHA-256 vectors MUST qualify this
boundary in Bun and Chromium, including exponent formatting and Unicode ordering.
`inputDigest` is SHA-256 of canonical JSON `{request,profile:metadata}`. Source
texts inside the request remain exact strings. Files sort by path; source maps
and dispositions sort by sources array position, pointer, role/assertion, then
ID. This ordering does not reorder semantic Key/member arrays.

Generated files use LF and one final newline. Default Python names are allowed
only when an authored ID is already a valid nonreserved ASCII identifier.
Otherwise an explicit override is required. Collisions across generated symbols,
attributes, reserved helper names and case-folded output paths refuse. Aliases
retain original field IDs only when those IDs are injective across the complete
qualified Record membership. Distinct module-qualified Fields with equal bare
IDs refuse in 0.1, even when Python-name overrides differ; a future qualified wire
key profile must define a reversible encoding before supporting that case.
Public field names MUST start with an ASCII letter, not underscore; reserve
Pydantic inherited attributes and `model_` names, SQLAlchemy inherited/mapping
attributes such as `metadata` and `registry`, and generated infrastructure names.
Package names MUST NOT shadow
any imported standard-library/target module, including `datetime`, `decimal`,
`typing`, `enum`, `pydantic`, `sqlalchemy` and `pyspark`. The exact profile MUST
publish its complete imported-name/reserved-name set and check it before emission.
All paths MUST be package-relative, contain no `..`,
empty segment, backslash, absolute prefix or symbolic-link instruction. Metadata
strings MUST be emitted through literal escaping, never source interpolation.

### Bundle and host write boundary

The candidate contains `<package>/` modules, `<package>/py.typed`, generated
validators/codecs, and bundle-root `manifest.json`, `sources.json` and
`dependencies.json`. All file paths are relative to the bundle root. A source
package is emitted; no wheel/sdist publication or build metadata is implied. The manifest
contains ABI, input digest, profile, source maps, dispositions and obligations,
plus an inventory of `{path,sha256}` for every other file. The manifest itself
is an implicitly owned reserved file and has no self-hash entry. Its expected
hash is in the host selection record defined below. Writer ownership checks MUST
verify the pinned selection record and every owned file, including the manifest;
trusting an edited manifest is unsafe.
The report is useful without importing generated Python. Python source MUST
import only standard library, its own generated modules and locked target
libraries. It MUST NOT import `umf`, the compiler, Truss or Ashlar.

Host-only `writePersistenceBundle(bundle, root, expectedSelectionSha256)` accepts
a candidate result, an absolute caller-owned output directory, and either the
SHA-256 of the caller's exact prior selection bytes or null for initial creation.
It returns `{bundleDigest,manifestSha256,selectionSha256,directory}` on success;
`directory` is the absolute immutable package-bundle directory. Compiler results
MUST be revalidated, including hashes and path/size limits, before any write.

The root contains immutable `bundles/<bundleDigest>/` directories and
`selected.json`. `bundleDigest` is SHA-256 of canonical JSON of the sorted
result `files` projected to `{path,sha256}`. The closed selection record is
`{contract:"umf-persistence-selection/0.1",bundleDigest,inputDigest,manifestSha256}`,
serialized with the canonical JSON rules and one LF. Initial creation requires
no selection file. A replacement requires exact expected selection hash and
verification of all selected files against that selection and manifest. Extra
files inside the selected bundle, changed files, symlinks or path escapes refuse.

Use an exclusively created root `.writer-lock` for cooperating writers; a held
or abandoned lock refuses, with no automatic takeover. Under the lock, stage
and verify a complete bundle on the same filesystem, rename it to its immutable
digest directory, then atomically replace `selected.json` as the final operation.
An existing digest directory must match all expected bytes and contain no extras.
Never modify/delete old bundles. Pre-selection failure leaves the previous
selection intact; post-selection cleanup failure reports committed selection
and cleanup error rather than claiming no effect. A process crash after atomic
selection requires read-only hash reconciliation before retry, not blind replay.
These guarantees cover cooperating writers and ordinary filesystem operations,
not hostile concurrent filesystem administrators or power-loss durability.
Consumer builds must resolve and pin one selected bundle before use, never mix
files across selection changes. Generated files are not hand-edit surfaces.
The writer never edits consumer source, installs dependencies or runs migrations.

### Resource bounds

Maximum 32 sources, 4,000,000 UTF-16 code units per source, depth 128 and 100,000
values per admitted document (CONTRACT-001); maximum 10,000 selected/reached
elements, 100,000 dispositions, 1,000 files and 32MiB aggregate UTF-8 output.
Over-limit results refuse with no candidate, never truncated successful output.
Native qualification and consumer materialization have separate host bounds.

## Precedence and Compatibility

Canonical core schemas and native extensions own meaning. CONTRACT-042 owns
physical binding; CONTRACT-051 owns Python document access. This contract does
not strengthen their semantic completeness. Compiler, generated ABI, core,
profile and dependency versions are separate identities. A generated public
name/type/default/codec change requires an explicit manifest diff and compatibility
classification; source-compatible does not imply data- or behavior-compatible.
No generated-to-UMF reverse importer is claimed; originals supply recovery.

## Error Semantics

| Code | Condition | Recovery |
| --- | --- | --- |
| `INPUT` | Malformed request/document or unsupported version | Correct supplied input; no retry |
| `REFERENCE` | Missing, ambiguous or external dependency | Supply explicit supported local model |
| `PROFILE` | Missing/mismatched exact profile or lock | Install trusted matching profile outside compilation |
| `UNKNOWN_RELEVANT` | Relevant semantics uninterpreted | Implement and qualify semantic support |
| `LOSS` | Unsafe or strict-mode non-exact projection | Change authored policy/model explicitly |
| `NAME` | Missing override, unsafe name or collision | Supply reviewed override |
| `LIMIT` | Bound exceeded | Explicitly reduce scope; no automatic enlargement |
| `OUTPUT_CHANGED` | Writer ownership/hash check failed | Preserve and reconcile user edits |
| `WRITE_BUSY` | Exclusive writer lock exists | Inspect owner; no automatic stale-lock takeover |
| `WRITE_FAILED` | Staging/atomic selection failed | Inspect stage; previous selection remains |
| `WRITE_COMMITTED_CLEANUP` | Selection committed, cleanup failed | Reconcile selected record before any retry |

## Examples

Compile a core 0.8.0 local `commerce.Order` selection using an explicitly
installed `python-models` development profile. A relevant unknown Field extension
returns `refused`, `UNKNOWN_RELEVANT` and no code. The same extension on a wholly
unselected record remains archived with an unselected unknown disposition.

Canonicalization follows [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).

## Validation Checklist

- [ ] Independent request/result schema and semantic tests implement this draft.
- [ ] Bun/Chromium byte parity, hostile names and atomic-write controls pass.
- [ ] Every exact profile has independent native and generated-code evidence.
