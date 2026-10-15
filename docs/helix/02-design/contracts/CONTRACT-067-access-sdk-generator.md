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
    - id: CONTRACT-070
      kind: informed_by
---

# CONTRACT-067: Typed access SDK generator

**Type:** library/file output. **Version:** proposed `umf-access-generate/0.1`.

## Purpose

Generate, at design/build time, the typed Python layer of the access SDK from
pinned UMF documents: record models, Key DTOs, projections, query field
expressions and typed action clients. This is stage one of a two-stage build;
CONTRACT-071 stage two compiles declared queries and commands into a catalog.
Generation MUST NOT connect to databases, start runtimes, install dependencies or
execute artifact-supplied code.

## Scope and Boundaries

UMF owns admission, semantic resolution, source generation and fidelity reports.
The caller supplies exact source texts and a trusted installed target profile.
The portable TypeScript library returns files as data; a host tool writes them.
CONTRACT-068 defines the generated Python semantics; CONTRACT-070 supplies the
authored view and column choices; CONTRACT-900 supplies action declarations.
No SQL is produced at this stage and no target platform is selected.

## Normative Surface

`generateAccessPackage(request, profile)` is synchronous, pure and deterministic.
Inputs are copied; caller-owned data MUST NOT be mutated. All records below are
closed except preserved UMF source content. Unknown contract fields refuse.

### Request

| Member | Shape | Rules |
| --- | --- | --- |
| `contract` | string | Exactly `umf-access-generate/0.1` |
| `sources` | `{id,format,text}[]` | Unique nonempty opaque ID; `json` or `yaml`; admitted by CONTRACT-001 |
| `logical` | source ID | Exactly one core 0.8.0 document carrying `umf.access` 0.1.0 |
| `bindings` | source ID[] | Ordered, unique CONTRACT-042 binding documents referenced by `umf.access` ColumnSets |
| `records` | `{module,element}[]` | Nonempty, unique local Record IDs to generate models for |
| `actions` | `{module,action}[]` | Unique CONTRACT-900 actions to generate clients for; may be empty |
| `projections` | `{name,record,fields}[]` | Named finite column selections of a selected Record; no computed fields, joins or renames |
| `package` | string | ASCII `[a-z][a-z0-9_]*`, not reserved or shadowing an imported module |
| `names` | `{sourceId,pointer,python}[]` | Explicit Python names for symbols whose authored ID is not a valid identifier |
| `mode` | `strict` or `report` | See dispositions |
| `profileId`, `profileVersion` | strings | Exact match to the installed profile |
| `coreVersion` | string | Exactly `0.8.0` |

All members are required; arrays other than `sources` and `records` may be empty.

### Closure

The generator follows explicit local membership, Field, item/value, Key and
Relationship references from the selected Records and actions. Records reached
only through relationships or entity parameters get Key DTOs, not row models,
unless they are also selected. Every `umf.access` search index on a selected
Record is generated into its `s` namespace; indexes on unselected Records are
reported as unselected. Every selected Record MUST have a `umf.access`
RecordView; a missing view refuses. Action value parameters use their Field's
carrier with presence from the parameter's `required` flag and null only when
the Field admits null (CONTRACT-900). Actions whose bindings, conditions or
authorization reference an unselected and unreached element refuse. The generator
never infers ownership, defaults, identity or layout from names. External
document references refuse.

### Trusted profile

`profile` is installed trusted code plus inert metadata `{id, version,
compilerVersion, coreVersions, vocabularies:{id,version}[], python:{version},
dependencies:{distribution,version}[], checkers:{name,version,configuration}[],
reservedNames:string[], importedNames:string[], assertionKinds:string[],
subset:string, codeSha256:string}`. `codeSha256` is the SHA-256 of the
profile's trusted code module bytes; two profiles with equal metadata and
different code are different inputs. Dependencies MUST pin exact versions,
including `umf_access` (recorded in the result as `runtimeAbi`), `pydantic` (2.14
or later for the stable `MISSING` sentinel) and the
type checkers whose static claims the profile makes, with their exact
configuration (for mypy at least `check_untyped_defs`; for pyright and ty the
strictness level and the environment they resolve dependencies from). The first
profile supports Python 3.11 and later, Pydantic 2.14 or later, and pyright, mypy
and ty; generated code must type-check cleanly under every checker the profile
names. Artifact content MUST NOT
locate or load a profile, template, plugin or dependency.

`assertionKinds` is drawn from a UMF-owned enumeration keyed to the existing
public inspectors (kind, nullability, Key, facets, defaults, relationships,
actions, `umf.access`). Profiles may support a subset; they MUST NOT invent kinds.

### Result

| Member | Shape | Rules |
| --- | --- | --- |
| `contract` | string | Same as request |
| `abi` | string | `umf-python-types/0.1` (CONTRACT-068) |
| `runtimeAbi` | `{distribution,version,abi}` | The pinned `umf_access` runtime the generated code is written against: the profile's exact `umf_access` dependency pin and its protocol ABI, `umf-access-runtime/0.1` (CONTRACT-072) |
| `outcome` | `candidate` or `refused` | A candidate is never execution authorization |
| `inputDigest` | lowercase SHA-256 hex | JCS of `{request, profile}` including `codeSha256` |
| `files` | `{path,text,sha256}[]` | UTF-8 text; sorted relative POSIX paths |
| `symbols` | `{sourceId,pointer,path,symbol,role}[]` | Source map; role `row`, `create`, `patch`, `update`, `key`, `projection`, `fields`, `search`, `action-ref`, `action-input`, `action-output`, `action-failure`, `action-client`, `codec` |
| `dispositions` | Disposition[] | Complete selected assertion census plus unselected unknown locations |
| `diagnostics` | `{code,sourceId,pointer,message}[]` | Deterministic, source-ordered, no source values in messages |
| `obligations` | `{id,owner,description,dispositionIds}[]` | Owner `host`, `database`, `engine`, `catalog` or `qualifier`; never claims discharge |

Refusal returns empty `files` and `symbols` and keeps the report. Admission
failure before a valid request exists throws a typed diagnostic.

A Disposition is `{id, sourceId, pointer, assertion, relevance, fidelity, checks,
reason, obligationIds}` with `relevance` `selected`, `dependency` or
`unselected`; `fidelity` `exact`, `approximated`, `not-expressible` or
`unknown`; `checks` a unique subset of `client`, `database`, `engine`,
`informational`. Every selected known assertion is enumerated, including ones
that emit no code. `strict` refuses any non-exact selected or dependency
disposition. `report` may emit a candidate for a known approximation that does
not broaden accepted inputs or claimed enforcement; it refuses unknown relevant
semantics in every mode.

### Package layout

The candidate contains `<package>/__init__.py`, `models.py`, `keys.py`,
`fields.py` (the `c` and `s` namespaces and query roots with typed `update()`
signatures), `codecs.py`, `actions.py` (when actions are selected), `py.typed`,
and `<package>/_umf/manifest.json` and `_umf/sources.json`. The paths
`<package>/queries.py`, `<package>/_umf/catalog.json`,
`<package>/_umf/catalog-manifest.json` and `<package>/_umf/privileges.json` are
reserved for CONTRACT-071 stage two;
this stage never writes them and its writer and drift check ignore them. Shared
runtime types (`Param`, `Column`, `Vector`, `Page`, `Scored`, outcomes) are
imported from `umf_access`, not generated. The manifest holds
the ABI, `runtimeAbi`, input digest, profile metadata, source map, dispositions, obligations
and an inventory `{path,sha256}` of every other file. `sources.json` holds the
exact source texts, including unselected and unknown content. Generated Python
imports only the standard library, its own modules, the profile's pinned
dependencies and the `umf_access` runtime package (CONTRACT-072). It MUST NOT
import the compiler, the `umf` document package, Weft, Truss or Ashlar.

### Writing and drift checking

The host tool `umf-access generate` writes the package into one fixed,
caller-chosen directory that the consumer checks into version control. Before
replacing it, the tool verifies every existing file against the previous
manifest inventory; an added, removed or edited file refuses with
`OUTPUT_CHANGED` and nothing is written. It writes the new package to a sibling
staging directory on the same filesystem and swaps it in with directory renames.
A failure before the swap leaves the previous package intact; a failure after
the swap reports the new package as written. No lock files, digest directories
or selection pointers are used; version control supplies review and history.

`umf-access check` regenerates in memory and exits non-zero when any byte differs
from the checked-in package. CI MUST run it. Generated files are not hand-edit
surfaces.

### Naming and ordering

Default Python names are a fixed, documented case transform of authored IDs:
attributes and functions in snake case (`orderId` becomes `order_id`), classes in
Pascal case (`shipOrder` becomes `ShipOrder`). The transform applies only to
ASCII IDs made of letters and digits; any other ID needs a `names` override, and
two IDs that transform to the same name refuse. The transform is a naming rule,
not semantic inference, and the manifest maps every Python name back to its
authored ID. Pydantic
field aliases are not generated: CONTRACT-068 codecs map between Python names and
authored Field IDs. Collisions across generated symbols, attributes, reserved
names and case-folded paths refuse. Distinct module-qualified Fields with equal
bare IDs in one Record refuse in 0.1. Reserved names include Pydantic `model_`
attributes, the generated class attributes `c` and `objects`, and the profile's
complete `reservedNames`; the package name MUST NOT shadow any `importedNames`.
Metadata strings are emitted only through literal escaping.

Digests use JSON Canonicalization Scheme (RFC 8785) over UTF-8 with lone
surrogates rejected. Files sort by path; source maps and dispositions sort by
source position, pointer, role or assertion, then ID. Ordering never reorders
semantic Key or member arrays. Generated files use LF and one final newline.

### Resource bounds

At most 32 sources, CONTRACT-001 per-document limits, 10,000 selected or reached
elements, 1,000 actions, 100,000 dispositions, 1,000 files and 32 MiB aggregate
output. Over-limit requests refuse; output is never truncated.

## Precedence and Compatibility

Core contracts, CONTRACT-042, CONTRACT-070 and CONTRACT-900 own meaning; this
contract adds none. Generator, ABI, runtime ABI, core, profile and dependency
versions are separate identities. The B-TP-001 compatibility spike MUST test
generated output against the pinned runtime named by `runtimeAbi`, not against an
unpinned or development copy. On regeneration the tool reports a manifest diff classified
as source-compatible, value-compatible or breaking for each public symbol;
source compatibility does not imply data or behavior compatibility.

## Error Semantics

| Code | Condition | Recovery |
| --- | --- | --- |
| `INPUT` | Malformed request or document, unsupported version | Correct the input |
| `REFERENCE` | Missing, ambiguous or external dependency | Supply an explicit local model |
| `ACCESS` | Missing or invalid `umf.access` view (CONTRACT-070 codes retained) | Author the view |
| `PROFILE` | Missing or mismatched profile, version or code digest | Install the matching trusted profile |
| `UNKNOWN_RELEVANT` | Relevant semantics uninterpreted | Implement and qualify support |
| `LOSS` | Unsafe or strict-mode non-exact projection | Change the authored model |
| `NAME` | Missing override, unsafe name or collision | Supply a reviewed override |
| `LIMIT` | Bound exceeded | Reduce scope explicitly |
| `OUTPUT_CHANGED` | Checked-in package differs from its manifest | Restore or regenerate deliberately |
| `WRITE_FAILED` | Staging or swap failed | Inspect; previous package remains unless reported written |

## Examples

Generating `commerce.Order` with the CONTRACT-070 example view and the action
`commerce.shipOrder` yields `Order`, `OrderCreate`, `OrderPatch`, `OrderKey`,
`Order.c` field expressions and `ShipOrderInput`, `ShipOrderOutput`,
`ShipOrderRejected`. Removing the `memo` FieldView refuses with `ACCESS` and no
files. An unknown extension on an unselected Record remains in `sources.json`
with an `unselected` disposition.

## Validation Checklist

- [ ] Request/result schemas and semantic tests implement this draft.
- [ ] Bun and Chromium produce identical bytes, including digests.
- [ ] Hostile names, collisions, hand edits and drift checks refuse as specified.
- [ ] B-TP-001 imports and type-checks generated output against the exact `umf_access` runtime named by `runtimeAbi`; a runtime with a different protocol ABI fails.
