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
command below defines the acceptance intent. The source-pinned execution below records the implemented subset; temporal qualification remains **HELD**.

## Acceptance Criteria Test Mapping

| AC ID | Failing test to create | Asserted behavior | Required source citation |
| --- | --- | --- | --- |
| US-080-AC1 | `generation_is_deterministic` | Two runs in Bun and two in Chromium produce identical files, SHA-256 values, `inputDigest`, symbols, dispositions and diagnostics; separate one-byte changes to a source text, a profile metadata field and `codeSha256` each change `inputDigest`. | `@covers US-080-AC1` |
| US-080-AC2 | `access_views_validated` | A selected Record without a view, a view missing one reached Field, a view listing a Field twice, each refusing CONTRACT-070 conflict-table row (for example `orderId` with `row.null:true`, `placedAt` without `temporal`, `create.missing` on a required Field with no default) and an `amount` ColumnSet typed `numeric(14,2)` each refuse with `ACCESS`, the retained `ACCESS_*` code and a pointer, and empty `files` and `symbols`; input documents are unchanged. Each allowed row (for example `create.missing` with a `default on:"missing"`) generates. Also assert missing/foreign selectedKey refusal, explicit alternate/composite selection without inference, nullable/non-null array items and map values with missing=false, and incompatible owned/nested occurrence refusal. | `@covers US-080-AC2` |
| US-080-AC3 | `census_unknown_and_modes` | An unknown member on a selected Record refuses with `UNKNOWN_RELEVANT` in `strict` and in `report`. A valid request keeps an unselected Record's unknown extension byte-identical in `sources.json` with an `unselected` disposition, and the census lists every selected known assertion, including ones that emit no code. The initial exact-only profile refuses non-exact selected/dependency meaning with `LOSS` in both modes. Neither retained context nor an external engine obligation is labeled an approximation. A future approximation profile has separate acceptance gates. Every obligation has an owner and none claims discharge. | `@covers US-080-AC3` |
| US-080-AC4 | `unsafe_names_and_limits_refuse` | Invalid identifier without override, case-folded path collision, symbol collision, `c`, `objects`, `model_config` and a profile reserved name, a package shadowing an `importedNames` entry, and each resource bound plus one all refuse with `NAME` or `LIMIT` and no files. A hostile-literal corpus (quotes, backslashes, triple quotes, newlines, U+2028) produces Python that `ast.parse` accepts and whose literals equal the inputs. A source that names a profile or template path does not cause it to be read. | `@covers US-080-AC4` |
| US-080-AC5 | `writer_refuses_changed_output` | After generation, editing, adding or removing one file makes `umf-access generate` exit with `OUTPUT_CHANGED` and leave the tree unchanged. An injected rename failure before the swap leaves the old tree byte-identical; an injected failure after the swap is reported as written. A symlink in the output tree refuses. Inject failure between both directory renames: restore the complete old package or report unresolved state while retaining its recoverable backup. Serialize cooperating operations; do not claim hot-import or concurrent-writer atomicity. Existing queries.py, catalog.json, catalog-manifest.json and privileges.json remain byte-identical after stage-one replacement; changed inputDigest makes the retained catalog stale. | `@covers US-080-AC5` |
| US-080-AC6 | `ci_drift_check` | `umf-access check` exits 0 on unchanged inputs and non-zero with each differing path after a source change. A deliberate regeneration after a Field rename, a retype and an added optional Field gives every changed public symbol exactly one class; the rename is classified breaking and the added optional Create field source-compatible. The expected class for each retype case is fixed in the fixture before the test runs. | `@covers US-080-AC6` |

## Executable Proof

Implemented source-pinned replay:

```sh
bun test tests/compilation/access-*.test.ts
bun scripts/check-access-reporting-browser.ts "$(mktemp -d /tmp/umf-access-browser.XXXXXX)"
```

The retained run selected the17 files listed in its Bun log; it did not run
unrelated test suites. [R24 frontend execution](../../04-build/evidence/typed-persistence/frontend-r24-20261017/README.md)
retains the exact Git input cuts, per-file before/after hashes, all results,
generated packages, checker output, browser bundle and browser receipt. Bun1.4.2
passes864 tests/4906 assertions. Chromium153.0.8010.12 passes14 package cases,
two runs per host and three independent digest perturbations, with complete
byte-equivalent packages. The installed generated package additionally passes
all three pinned type checkers and319 unit tests on each supported interpreter.
These totals include adjacent generation controls and are not individual AC counts.

| Acceptance intent | Implemented cited coverage in that cut |
| --- | --- |
| US-080-AC1 | `access-generator.test.ts`, `access-digest.test.ts`; the real browser harness compares complete emitted packages and independent source/profile/code identity changes. |
| US-080-AC2 | `access-extension.test.ts`, `access-context.test.ts`, `access-generator.test.ts` and the matrix tests retain real reachable documents, exact selected Keys and complete native column facts; the unrepresentable no-null row remains explicitly hypothetical below. |
| US-080-AC3 | `access-generator.test.ts` and `access-census-completeness.test.ts` exercise selected unknown refusal, unselected preservation, complete census and both owner-approved initial exact-only modes. |
| US-080-AC4 | `access-naming.test.ts`, `access-package-limits.test.ts`, `access-generator.test.ts` and `access-digest.test.ts` exercise hostile literals, names, closed profile metadata and bounded refusal. |
| US-080-AC5 | `access-writer.test.ts` exercises original-output refusal, symlinks, both rename faults, backup recovery, serialized operations and byte-preserved stage-two files. |
| US-080-AC6 | `access-diff.test.ts`, `access-generator.test.ts` and `access-writer.test.ts` exercise unchanged/changed check, exact symbol classification and stage-two stale identity. |

The named tests retain `@covers US-080-AC1` through `@covers US-080-AC6`
citations. This execution qualifies the pinned candidate generation profile;
it closes the bounded [B-TP-003 implementation gate](../../04-build/evidence/typed-persistence/b-tp-003/README.md). The conformance profile remains explicitly unqualified test data; it does not qualify a production profile, catalog/backend adoption, native search
configuration concurrency or release/deployment gates. Temporal candidate
examples do not establish temporal qualification. Draft status is retained.

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

The core 0.8 absent-allowed/Null=no premise is tested as an explicitly hypothetical fact-policy input. Reachable rows require real documents; public core-null counterexamples prove the hypothetical premise is not authorable. This qualification follows CONTRACT-070 and does not establish an authored or native no-null witness.
