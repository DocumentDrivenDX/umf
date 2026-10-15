---
ddx:
  id: TD-080
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-080
      kind: informed_by
    - id: SD-028
      kind: informed_by
---

# TD-080: Generate and drift-check the typed package

**User Story:** [[US-080-generate-typed-package]]. **Feature:** [[FEAT-028]].
**Solution Design:** [[SD-028]].

## Scope

The stage-one generator (`generateAccessPackage`), its result report, and the
host tool commands `umf-access generate` and `umf-access check`. The semantics of
the emitted Python belong to TD-081; catalog compilation belongs to TD-083.
CONTRACT-067 is authoritative for every shape named here.

## Technical Approach

The generator runs in four pure steps:

1. **Admit.** Parse the request, check the profile identity (`profileId`,
   `profileVersion`, `codeSha256`), admit each source through CONTRACT-001 and
   validate the `umf.access` extension against CONTRACT-070. Malformed input
   throws a typed diagnostic before any result exists.
2. **Close and resolve.** Follow explicit membership, Field, item/value, Key and
   Relationship references from the selected Records and actions. Build a private
   immutable intermediate representation (IR) that carries resolved references,
   view presence, carriers, native column facts, provenance and obligations. The
   IR never discards source content and is never exported.
3. **Census.** Enumerate every selected and dependency assertion through the
   public UMF inspectors and assign a disposition. Apply the mode rule: `strict`
   refuses any non-exact relevant disposition; `report` admits only known
   approximations that do not broaden inputs or claimed enforcement; unknown
   relevant meaning refuses in both modes.
4. **Emit.** Render Python source from the IR with a literal-only renderer:
   every authored string reaches output through one escaping function, and no
   template is evaluated. Sort files by path, compute SHA-256 per file and the
   JCS-based `inputDigest`, and build `_umf/manifest.json` and `_umf/sources.json`.

The host tool is a separate module. `generate` verifies the checked-in package
against its previous manifest inventory, writes the candidate into a sibling
staging directory and uses CONTRACT-067's serialized, recoverable directory
replacement. The build runner serializes generate/catalog/check; hot imports and
concurrent writers are unsupported. Keep the complete old package as backup
until replacement succeeds, restore it on second-rename failure and report
unresolved filesystem state. `check` regenerates in memory and compares bytes.

Trade-off: generation refuses rather than guesses. A missing view, an
ambiguous name or an uninterpreted assertion stops generation, even when a
plausible Python type exists.

**Stage-two paths.** CONTRACT-067 reserves `queries.py`, `_umf/catalog.json`,
`_umf/catalog-manifest.json` and `_umf/privileges.json` for stage two. Stage one
copies existing reserved files byte-for-byte through its staging replacement
without claiming ownership or validating their contents. Stage two preserves all
stage-one files. Its retained old inputDigest makes it stale after regeneration;
CATALOG_STALE blocks execution/check until rebuilt. AC5/AC6 retain byte hashes of
all four files across replacement and inject failures at both rename boundaries.

Selected identity and occurrence resolution follow CONTRACT-070: selectedKey
is explicit and exact; relationship/action Keys never substitute it. Item/value
positions use their nested allow-table context, with missing=false independently
of container nullability. Reused Fields with incompatible contexts refuse.
AC2 includes nullable/non-null array/map cases and multiple/foreign/missing Keys.

## Component Changes

Planned new paths (none exist yet):

- `src/access/generate/admission.ts` — request and profile admission.
- `src/access/extension/` — `umf.access` 0.1.0 schema, coverage, conflict-table and native-type checks (CONTRACT-070).
- `src/access/generate/closure.ts` and `src/access/generate/ir.ts` — reference closure and private IR.
- `src/access/generate/census.ts` — disposition and obligation assembly.
- `src/access/generate/emit-python.ts` — literal-only renderer; TD-081 owns its per-module content.
- `src/access/generate/naming.ts` — identifier validation, overrides, reserved names and collision checks.
- `src/access/generate/index.ts` — the public `generateAccessPackage` facade.
- `scripts/umf-access.ts` — host tool with `generate` and `check` subcommands; the only module that touches the filesystem.

Portable modules import only public UMF barrels and use no host globals, so the
same code runs in Bun and Chromium (ADR-002).

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| `generateAccessPackage(request, profile)` | CONTRACT-067 | Pure generation; returns candidate or refusal with full report |
| `umf.access` views and ColumnSets | CONTRACT-070 | Authored presence, mutability, temporal and native column facts |
| Generated module ABI | CONTRACT-068 | What the emitter must produce (TD-081) |
| `umf-access generate` / `umf-access check` | CONTRACT-067 | Host write with inventory verification; CI drift check |

## Data Model Changes

No core schema or database change. New JSON Schemas for the request, result and
manifest are added as compiler resources. They do not redefine UMF documents.

## Integration Points

Consumes public UMF admission and semantic inspectors (kind, nullability, Key,
facets, defaults, relationships, actions). If an inspector needed for an
assertion kind is missing, the profile does not list that kind and generation
refuses the assertion as unknown; the generator never reimplements core meaning.
The `umf-access` host tool is distributed with the `umf_access` Python package
(CONTRACT-072) through a pinned generator build.

## Security

- No network, connection, dependency install or code execution in portable
  modules; profile code is installed, trusted and identified by `codeSha256`.
- Artifact content cannot select a profile, template, plugin or file path.
- Every authored string is emitted through the escaping function; a fuzz corpus
  of quotes, backslashes, newlines, triple quotes and Unicode line separators
  must round-trip as inert literals.
- Diagnostics name pointers and rules, never source values.
- The writer refuses symlinks and paths that escape the output directory.

## Testing

| AC ID | Planned test | Design assertion | Location |
| --- | --- | --- | --- |
| US-080-AC1 | `generation_is_deterministic` | Byte, digest, source-map and diagnostic equality across two runs in Bun and in Chromium; one-byte changes to a source, a profile field and `codeSha256` each change `inputDigest` | `tests/compilation/access-generator.test.ts`, `scripts/compilation-browser.ts` |
| US-080-AC2 | `access_views_validated` | One fixture per CONTRACT-070 conflict-table row (refusing and allowed), plus reference, coverage and native-type cases; each refusal carries its retained code and pointer and returns empty `files` and `symbols` | `tests/compilation/access-extension.test.ts` |
| US-080-AC3 | `census_unknown_and_modes` | Unknown selected member refuses in both modes; unselected unknown content appears verbatim in `sources.json` with an `unselected` disposition; census includes no-code assertions; strict refuses `LOSS`; report admits a safe approximation and refuses a broadening one; obligations carry an owner and no discharge claim | `tests/compilation/access-generator.test.ts` |
| US-080-AC4 | `unsafe_names_and_limits_refuse` | Each `NAME` and `LIMIT` case refuses without partial output; hostile-literal corpus compiles to inert Python (checked by parsing the output with Python `ast`) | `tests/compilation/access-naming.test.ts` |
| US-080-AC5 | `writer_refuses_changed_output` | Edited, added and removed files refuse with nothing written; injected pre-swap failure leaves the old tree byte-identical; post-swap failure is reported as written | `tests/compilation/access-writer.test.ts` |
| US-080-AC6 | `ci_drift_check` | `check` exit codes and named paths; compatibility classification per public symbol for rename, retype and additive changes | `tests/compilation/access-writer.test.ts` |

STP-080 is the authoritative mapping. All tests are planned and UNTESTED.

## Migration & Rollback

The generated package lives in one caller-chosen directory under version control.
Rolling back means reverting that directory and the pinned inputs in the
consumer's repository. The writer's staging and swap keep a failed run from
leaving a half-written tree. No data or schema migration is involved.

## Implementation Sequence

1. Build the commerce fixture and red tests for AC1–AC6.
2. Implement admission, naming and closure; then census and modes.
3. Implement the emitter skeleton (TD-081 fills module content) and manifest.
4. Implement the host writer and `check`; add the Chromium parity harness.
5. Record evidence under `docs/helix/04-build/evidence/typed-persistence/`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Public inspectors do not cover every assertion kind | Profile omits the kind; generation refuses it as unknown until UMF adds the inspector |
| Stage-one writer touches stage-two files | Reserved-path fixtures in AC5/AC6 assert byte-for-byte preservation without stage-one ownership or regeneration |
| Bun/Chromium differences in Unicode or sorting | Use explicit code-point sorting and JCS; parity harness gates the build |
