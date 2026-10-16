---
ddx:
  id: STP-080
  type: story-test-plan
  activity: test
  status: draft
  authoring:
    home: repo
  links:
    - id: US-080
      kind: informed_by
    - id: TD-080
      kind: informed_by
---

# STP-080: Generate and drift-check the typed package

## Story Reference

**User Story:** [[US-080-generate-typed-package]].
**Technical Design:** [[TD-080-generate-typed-package]].
**Related Solution Design:** [[SD-028]]. **Project Test Plan:** [[test-plan]].

## Scope and Objective

Prove that stage-one generation is deterministic and portable, reports every
selected assertion, refuses unsafe or uninterpreted input, and that the host
writer and drift check protect the checked-in package. Every test, fixture and
command below is planned and **UNTESTED**; none exists yet.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-080-AC1 | `generation_is_deterministic` | Two runs in Bun and two in Chromium produce identical files, SHA-256 values, `inputDigest`, symbols, dispositions and diagnostics; separate one-byte changes to a source text, a profile metadata field and `codeSha256` each change `inputDigest`. | `@covers US-080-AC1` |
| US-080-AC2 | `access_views_validated` | A selected Record without a view, a view missing one reached Field, a view listing a Field twice, each refusing CONTRACT-070 conflict-table row (for example `orderId` with `row.null:true`, `placedAt` without `temporal`, `create.missing` on a required Field with no default) and an `amount` ColumnSet typed `numeric(14,2)` each refuse with `ACCESS`, the retained `ACCESS_*` code and a pointer, and empty `files` and `symbols`; input documents are unchanged. Each allowed row (for example `create.missing` with a `default on:"missing"`) generates. Also assert missing/foreign selectedKey refusal, explicit alternate/composite selection without inference, nullable/non-null array items and map values with missing=false, and incompatible owned/nested occurrence refusal. | `@covers US-080-AC2` |
| US-080-AC3 | `census_unknown_and_modes` | An unknown member on a selected Record refuses with `UNKNOWN_RELEVANT` in `strict` and in `report`. A valid request keeps an unselected Record's unknown extension byte-identical in `sources.json` with an `unselected` disposition, and the census lists every selected known assertion, including ones that emit no code. In `strict`, an `approximated` selected disposition refuses with `LOSS`; in `report`, a safe known approximation yields a candidate and an input-broadening approximation refuses. Every obligation has an owner and none claims discharge. | `@covers US-080-AC3` |
| US-080-AC4 | `unsafe_names_and_limits_refuse` | Invalid identifier without override, case-folded path collision, symbol collision, `c`, `objects`, `model_config` and a profile reserved name, a package shadowing an `importedNames` entry, and each resource bound plus one all refuse with `NAME` or `LIMIT` and no files. A hostile-literal corpus (quotes, backslashes, triple quotes, newlines, U+2028) produces Python that `ast.parse` accepts and whose literals equal the inputs. A source that names a profile or template path does not cause it to be read. | `@covers US-080-AC4` |
| US-080-AC5 | `writer_refuses_changed_output` | After generation, editing, adding or removing one file makes `umf-access generate` exit with `OUTPUT_CHANGED` and leave the tree unchanged. An injected rename failure before the swap leaves the old tree byte-identical; an injected failure after the swap is reported as written. A symlink in the output tree refuses. Inject failure between both directory renames: restore the complete old package or report unresolved state while retaining its recoverable backup. Serialize cooperating operations; do not claim hot-import or concurrent-writer atomicity. Existing queries.py, catalog.json, catalog-manifest.json and privileges.json remain byte-identical after stage-one replacement; changed inputDigest makes the retained catalog stale. | `@covers US-080-AC5` |
| US-080-AC6 | `ci_drift_check` | `umf-access check` exits 0 on unchanged inputs and non-zero with each differing path after a source change. A deliberate regeneration after a Field rename, a retype and an added optional Field gives every changed public symbol exactly one class; the rename is classified breaking and the added optional Create field source-compatible. The expected class for each retype case is fixed in the fixture before the test runs. | `@covers US-080-AC6` |

## Executable Proof

Planned commands (not implemented):

```sh
bun test tests/compilation/access-extension.test.ts tests/compilation/access-generator.test.ts tests/compilation/access-naming.test.ts tests/compilation/access-writer.test.ts
bun scripts/compilation-browser.ts --suite access-generator
```

Planned files: `tests/compilation/access-extension.test.ts`, `tests/compilation/access-generator.test.ts`,
`tests/compilation/access-naming.test.ts`, `tests/compilation/access-writer.test.ts`,
and a Chromium parity entry in `scripts/compilation-browser.ts`. The runner
invokes each command separately and keeps each exit status; a later success does
not hide an earlier failure.

Record results under `docs/helix/04-build/evidence/typed-persistence/` with exact
inputs, profile metadata, Bun and Chromium versions, commands, statuses and
observed digests. No acceptance evidence exists yet.

## Data and Setup

- `fixtures/access/commerce/`: core 0.8.0 document with `Customer`, `Order` and
  `OrderLine`, an ordered composite Key on `OrderLine`, the CONTRACT-070 `Order`
  view and a PostgreSQL 18 ColumnSet; a CONTRACT-042 binding document; the
  `commerce.shipOrder` action.
- Variants: missing view, coverage gaps, one per conflict-table row, incompatible native types, unknown selected member, unknown unselected extension,
  invalid identifiers, colliding names, hostile literals, an over-limit request.
- A test profile with fixed metadata and a known `codeSha256`; a second profile
  differing only in code digest.
- A temporary output directory per test; fault injection wraps the writer's
  rename calls. No network or database is used.

## Edge Cases and Failure Modes

Relationship-reached Records produce Key DTOs only; equal bare Field IDs in one
Record refuse; actions referencing unselected elements refuse; external
references refuse; admission errors throw typed diagnostics instead of returning
partial results.

## Build Handoff

Write fixtures and red tests first, then implement TD-080 in its sequence. Each
AC needs a real assertion carrying its `@covers` tag; a name in this plan is not
coverage. Resolve TD-080's open contract point on stage-two paths before testing
AC5 and AC6 against a package that contains a catalog. Done only when every test
above passes in Bun and the parity cases pass in Chromium, with evidence recorded.
