---
ddx:
  id: CONTRACT-050
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-030
      kind: informed_by
    - id: CONTRACT-047
      kind: informed_by
    - id: CONTRACT-048
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
---

# CONTRACT-050: Separate format documentation, recipes and constraints

**Type:** semantic boundary proposal. **Version:** design-only v0.
**Status:** draft; package names and schemas for new extension surfaces remain
open. This contract supplies no runtime or core-admission claim.

## Purpose

TableSpec's column `format` MUST remain native source content. Consumers MUST
distinguish documentation, parsing, rendering and value constraints before using
that content. The presence of a string MUST NOT establish a portable assertion.

## Scope and Boundaries

This contract governs decomposition of legacy TableSpec metadata and explicit
author interpretation. CONTRACT-030 owns native import/edit/export recovery;
CONTRACT-048 owns allowed-value meaning triage and pattern constraints, and
CONTRACT-049 owns the core 0.8.0 shared schema property surface
(including allowed values, owner-placed 2026-10-04);
CONTRACT-047 owns proposed temporal value meaning. Parsing and rendering recipes
belong in independently versioned extensions, outside core scalar/facet meaning.
TableSpec pipeline execution and general pattern translation are outside scope.

| Meaning | Placement | Boundary |
| --- | --- | --- |
| Source documentation or example | Native `umf.tablespec` column; optional future informational extension view | Exact source text survives. A textual example is not a typed value, default or validation rule. |
| Input parsing | Versioned recipe extension, or retained TableSpec-native behavior | Text-to-value direction with explicit pattern language, target meaning and execution policy. No new core `format`. |
| Output rendering | Separate versioned recipe extension, or retained TableSpec-native behavior | Value-to-text direction; display/export representation supplies no parser or constraint. |
| Enumeration | Explicit author declaration under CONTRACT-048 | Finite typed allowed-value set with defined equality; comma-separated prose supplies no set automatically. CONTRACT-049 gives allowed values a core 0.8.0 surface; ideal admission and all-five delivery remain open. Values MUST still be authored explicitly, never split from format text. |
| Structural pattern | Proposed `umf.constraints` under CONTRACT-048, or native opaque content | A named layout requires an explicit grammar. Regex requires its own dialect, version and match semantics. Neither implies the other. |

## Normative Surface

The following are requirements for future interpretation records and recipes,
not member names added to an existing envelope or published package.

| Element | Required information | Rules |
| --- | --- | --- |
| Source reference | Retained native document, column identity, source pointer and source fingerprint | Interpretation MUST be tied to the captured source; source edits MUST invalidate stale interpretations. |
| Provenance | `authored` or `native-observation`, with the author action or qualified native behavior profile | Import MUST NOT manufacture authored intent. A heuristic suggestion MUST remain a suggestion until explicitly authored. |
| Interpretation kind | Documentation, input parsing, output rendering, allowed values or structural pattern | One source MAY support several independently qualified interpretations. These MUST NOT be exclusive labels that erase other uses. |
| Interpretation state | `uninterpreted`, `candidate`, `confirmed` or `stale` | `confirmed` means explicit author interpretation or scoped native evidence; provenance distinguishes them. It does not certify execution, admission or equivalence. |
| Informational text | Original string; optional separately authored explanation/example | Text MUST survive byte-equivalent at the native-string level. Quoting, whitespace and punctuation MUST NOT be normalized into values. |
| Input recipe | Ordered patterns, declared language/version, input scope, target value meaning, fallback policy and failure policy | First-success precedence MUST be explicit. Implicit registry/common fallbacks MUST be named and versioned or reported as unknown. Failure handling MUST distinguish reject, null, retain text and other native behavior. |
| Output recipe | Declared language/version, pattern, input value meaning, output scope and failure policy | Input parsing MUST NOT be inferred from rendering. Offset/precision loss MUST be reported even if parsing the rendered text succeeds. |
| Recipe environment | Relevant locale, calendar, timezone, precision, ambiguity and engine settings | Each dependency MUST be specified, bound to a named versioned execution profile, or marked unknown; unknown execution semantics prohibit an exact behavior claim. |
| Allowed values | Explicit typed values and scalar domain per CONTRACT-048/CONTRACT-049 | No splitting on commas, pipes or whitespace; the core 0.8.0 surface does not relax this and ideal admission/all-five delivery remain open; order, nullability, defaults and symbol identity remain independent. |
| Structural constraint | Field, source, language/version, match mode/flags where applicable, interpretation status | `State_LOB` MUST remain documentation until an author supplies a grammar or constraint. Unknown language MUST remain preserved without evaluation. |

`fallback_formats` MUST remain separately retained, including order, duplicates,
empty strings, absence and null where present in the native tree. An observed
execution profile MAY document that its engine skips or deduplicates entries;
it MUST NOT rewrite the native source to match that behavior. Input fallback
lists MUST NOT become output alternatives or an allowed-value set.

## Precedence and Compatibility

Native source and authored interpretation coexist. A confirmed declaration MUST
NOT overwrite native text or silently claim that a native pipeline implements it.
Conflicting interpretations MUST remain visible and block any operation needing
a single consistent meaning. Unrelated native recovery remains available.

`data_type`, column purpose, `domain_type` and recognizable date tokens MAY inform
candidate suggestions; none alone establishes a confirmed interpretation. A
parsing recipe MUST NOT change a string Field into a temporal Field. Temporal
meaning requires its own declaration. The TableSpec rule that allows a string
type with a domain type when `format` is present MUST remain a native validation
observation; it supplies no portable type-compatibility or cast guarantee.

Projection to legacy TableSpec has one `format` slot. Independent input/output
recipes or documentation/constraint text MUST NOT compete through last-write-wins.
An explicit selection policy MAY choose a representable native value. Strict
mode MUST block each non-exact requested obligation atomically; report mode MAY
emit a safe candidate with source-qualified residuals for every omitted meaning,
including meanings retained only in the UMF receipt. Native text alone MUST NOT
be treated as enforcement of allowed values or a structural pattern.

Existing core envelopes and `umf.tablespec` payloads remain unchanged. A future
published interpretation/recipe package requires its own schema, version and
unknown-content rules. Any later core candidate follows FR-3 admission and an
explicit new-envelope migration/rollback. Migration MUST archive colliding
unknown content before interpreting it; rollback MUST recover the old document
and retain newly authored meanings separately. Removing native `format` is a
separate authorized migration, never a side effect of decomposition.

## Error Semantics

| Condition | Required outcome | Recovery |
| --- | --- | --- |
| Ambiguous legacy text | Retain as uninterpreted; suggestions have candidate status only | Exact native recovery remains available. |
| Unsupported dialect/version or unknown environment | Preserve recipe; report unknown interpretation/execution | Exact projection blocks until qualified; no host parser fallback. |
| Invalid typed set or recipe declaration | Reject interpretation atomically with source/declaration path | Native source and prior document survive unchanged. |
| Source fingerprint changed | Mark interpretation stale; block dependent projection | Explicit revalidation or reauthoring is required. |
| Several meanings require different legacy strings | Strict block or explicit selection with per-meaning report residuals | Recover authored intent from retained UMF receipt. |
| Unrecognized extension member | Retain unchanged and diagnose unsupported interpretation | No deletion or silent promotion. |

## Examples

| Native column metadata | Import outcome | Explicit follow-on action |
| --- | --- | --- |
| `VARCHAR`, format `M, F, U` | Original documentation; no inferred enum | Author string set `["M", "F", "U"]` under CONTRACT-048/CONTRACT-049. |
| `VARCHAR`, format `State_LOB` | Opaque layout description | Author a grammar with explicit component meanings, or a dialect-qualified constraint. Underscore alone defines neither. |
| `DECIMAL`, format `1.85` | Textual example | Author a typed example separately; do not infer scale, default or a singleton set. |
| `DATE`, format `YYYY-MM-DD`, fallback_formats `["MM/DD/YYYY"]` | Retained native metadata; candidate input/output uses | Qualify parsing and rendering independently against named TableSpec paths and engine settings. |
| `VARCHAR`, format `MM/DD/YYYY`, temporal domain_type | Retained string type and native compatibility observation | Author a directional parse recipe and its temporal target; keep storage type independent. |
| Input `MM/DD/YYYY`, output `YYYY-MM-DD` | Two separately authored recipes | Legacy projection requires explicit slot selection and a residual for the other direction. |

An input such as `03/04/2026` requires declared ambiguity and locale policy.
Successful parsing does not prove the text retains its original representation;
successful rendering does not establish an inverse. DATE/TIMESTAMP output recipes
also require precision/offset and engine-setting qualifications where relevant.

## Validation checklist

- [x] Every legacy meaning has a placement and an explicit interpretation boundary.
- [x] Native observations and author declarations have separate provenance.
- [x] Compatibility, collision handling, errors and recovery are defined.
- [ ] Re-verify allowed-value references against CONTRACT-049 once it merges
  (draft/design only; no implementation or admission claim here).
- [ ] Publish extension schemas and a technical design before runtime work.
- [ ] Exercise the examples, simultaneous meanings, stale source, opaque members,
  malformed declarations, native-slot collisions and rollback in Bun and Chromium.
- [ ] Qualify input, output and native model validation with independent native
  probes, versions, source fingerprints and negative cases; structural validation
  alone supplies no execution claim.
- [ ] Verify ideal/native/ideal with retained receipts and native/ideal/native
  with exact native archives, including monolithic and split source bundles.

## Non-Normative Notes

TableSpec's `Column.format` description supplies the documentation, date pattern,
enumeration, structural pattern and example cases. `build_flexible_formats` adds
registry/common fallbacks after explicit ones; the ingest SQL generator passes
`format` to a different cast path. `apply_output_formats` uses DATE/TIMESTAMP
patterns in value-to-text operations. `validate_domain_type_compatibility` uses
the presence of format to relax string/domain compatibility. These are distinct
source paths whose behavior requires separate qualification.

Open decisions: the owning package and exact schema for informational metadata
and directional recipes; which native execution paths/versions to support first;
how recipe environment dependencies bind to caller configuration. No regex is
inferred from a structural label, and no universal date-pattern dialect is
defined by this proposal.
