# Handoff: `umf.dashboard` profile (branch `feat/dashboard-profile`)

> Working note for the next session. **Not part of the change — delete before committing.**
> Written 2026-10-09 from a session started in `genie-dashboard-design`.

## Goal

Store dashboard metadata (pages, widgets, widget types, datasets, filters, theme) in UMF
so dashboards can be ported between Databricks AI/BI (Lakeview `.lvdash.json`) and
Tableau (`.twb` / `.twbx`). UMF ships no dashboard support, so this branch adds the
first piece: a **platform-neutral dashboard semantic profile**, modeled on `umf.ddd`.

Target architecture (only the middle box exists so far):

```
.twb/.twbx  --import-->  umf.tableau  (native, exact)  --+
                                                         +-->  umf.dashboard (neutral)  <-- THIS BRANCH
.lvdash.json --import--> umf.lakeview (native, exact) --+          | dataset refs
              <--export-- umf.lakeview / umf.tableau <------------+    umf.delta / umf.spark (exist)
```

Every arrow is meant to produce a loss report (what didn't translate), which maps to
HELIX `[NEEDS CLARIFICATION]` markers in the genie-dashboard-design workflow.

## What was built (all uncommitted on `feat/dashboard-profile`)

| File | Purpose |
|---|---|
| `spec/extensions/dashboard/schema.json` | Payload schema (JSON Schema 2020-12) |
| `spec/extensions/dashboard/package.json` | Extension manifest `umf.dashboard` 0.1.0; schema embedded, generated from `schema.json` (audit requires them identical) |
| `src/extensions/dashboard/index.ts` | Semantic validator + API: `dashboardRegistry`, `inspectDashboard`, `readDashboardDocument`, `writeDashboardDocument`, `getDashboardDefinition`, `editDashboardDefinition`, exported types |
| `src/index.ts` | One line: `export * from './extensions/dashboard';` |
| `fixtures/dashboard/marketing-campaign.json` | Authored fixture from a real deployed Lakeview dashboard (see References) |
| `tests/dashboard/profile.test.ts` | 4 tests, `@covers US-077-AC1..AC4`, 28 semantic corruptions |
| `docs/helix/01-frame/features/FEAT-026-dashboard-profile.md` | Feature spec (FR-4/27/31/41) |
| `docs/helix/01-frame/user-stories/US-077-dashboard-profile.md` | Story + AC1–AC4 |
| `docs/helix/02-design/contracts/CONTRACT-055-dashboard-profile.md` | Authoritative rule set |
| `docs/helix/02-design/technical-designs/TD-077-dashboard-profile.md` | Approach, limits, next step |
| `docs/helix/03-test/acceptance-criteria-ledger.json` | Regenerated (+4 rows, all SATISFIED) |
| `fixtures/extension-package-audit.json`, `fixtures/json-schema-audit.json` | Regenerated (62 packages / 350 schemas) |

## Vocabulary (0.1.0)

| Scope | Kind | Key content |
|---|---|---|
| document | `dashboard` | title, ordered `pages` (module ids), `layout.columns` grid, optional `theme` (font, palette, light/dark role colors) |
| module | `page` | title, role `canvas` \| `global-filters` |
| module | `data` | holds datasets shared across pages |
| element | `dataset` | `source` table or query (expression), `grain`, `fields` each `column` or `measure` (measures require an aggregate expression) |
| element | `visual` | `chart` (counter, bar, line, area, scatter, pie, heatmap, table), `dataset` ref, `encodings` (channel, field, aggregation, scale, sort, format), `rows` aggregated/detail, `position`, optional `trace` (e.g. HELIX `W-101`) |
| element | `text` | markdown/plain content, position, trace |
| element | `filter` | control (single/multi-select, date-range, range, text-search), explicit `{dataset, field}` targets, default, position, trace |

Diagnostics: `DASHBOARD_SCOPE`, `_PLACEMENT`, `_ROOT`, `_GLOBAL_FILTERS`, `_PAGES`,
`_REFERENCE`, `_FIELD`, `_AGGREGATION`, `_MEASURE`, `_ENCODING`, `_SORT`, `_FILTER`,
`_LAYOUT`, `_TRACE` (errors); `_LAYOUT_OVERLAP`, `_UNKNOWN`, `_EXPRESSION_OPAQUE` (warnings).

## Design decisions worth knowing

- **Field roles are `column` / `measure`, not dimension/measure.** A raw numeric column
  (e.g. `revenue`) isn't a dimension. Tableau's default-aggregated "measures" become
  columns with an explicit encoding `aggregation: "sum"`; Lakeview custom calculations
  become `measure` fields with their SQL expression.
- **Every usable field must be declared on the dataset.** Lakeview only declares custom
  measures in `columns`; plain query output columns are implicit. The Lakeview importer
  must collect them from widget usage (or DESCRIBE).
- **Expressions are opaque** (language + text, never parsed) — same tradeoff as DDD
  invariants. Consequence: any query-sourced dataset makes the doc `complete:false`, which
  blocks `editDashboardDefinition`. Tests prove edits on a derived fully-interpreted variant.
- **Overlap is a warning**, not an error (Tableau floating zones are legal).
- **Native platform detail is out of this profile on purpose.** It belongs in separate
  `umf.lakeview` / `umf.tableau` extensions on the same elements.
- **Not modeled in 0.1.0** (retained as unknown content if present): Tableau
  parameters/actions, per-visual filter exemptions, cross-filter wiring, permissions.

## Verification status

- `bun test tests/dashboard` — **4 pass, 0 fail** (104 expects)
- `bun scripts/acceptance-traceability.ts` — US-077-AC1..4 **SATISFIED**
- `bun run test:schemas` — **62/62 packages, 350/350 schemas** pass
- `bun run typecheck` — **clean**
- `bun test tests` (full suite, ~2,000 tests) — **was still running at handoff; rerun it.**
- Browser evidence (`scripts/browser.ts`, like DDD's AC5) — **not done**.

## Known issue: Windows path separators

UMF's generator scripts (`acceptance-traceability.ts`, `audit-extension-packages.ts`,
`audit-json-schemas.ts`) use Node `relative()` and write **backslash paths on Windows**,
rewriting every row of the generated JSON. The committed files were normalized back to
forward slashes (diff now only shows the real additions). Consequences:

- After re-running any of those scripts on Windows, normalize again — a small walker
  that rewrites `^(docs|tests|scripts|spec|fixtures|src|native|python)\\` strings to `/`.
- `tests/traceability/acceptance-ledger.test.ts` regenerates and compares, so it will
  likely **fail locally on Windows** regardless (pre-existing; passes on Linux CI).
- Possible small upstream fix: `.split(sep).join('/')` in those scripts. Separate change.

## References (outside this repo)

- Source dashboard for the fixture:
  `C:\Users\garyf\synaptiqrepos\helix-dashboard-genie-tableau\docs\helix\05-deploy\dashboard.lvdash.json`
- Its original Tableau workbook (a matched pair — ideal round-trip corpus):
  `C:\Users\garyf\synaptiqrepos\helix-dashboard-genie-tableau\Marketing Campaign Performance.twbx`
- Existing readers to build importers from (Python):
  `C:\Users\garyf\synaptiqrepos\genie-dashboard-design\skills\genie-dashboard-design\assets\list_dashboard_structure.py`
  and `list_workbook_structure.py` (+ `read_hyper_schema.py`); docs in `lakeview-intake.md`, `tableau-intake.md`.
- More real Lakeview dashboards: `C:\Users\garyf\synaptiqrepos\Synaptiq-dbx-dashboard-monitoring\dashboards\`

## Suggested next steps

1. Rerun the full suite; commit the branch (repo is HELIX-governed — see `AGENTS.md`).
2. Add browser evidence (US-077-AC5) in `scripts/browser.ts`, mirroring `dddRoundTrip`.
3. `umf.lakeview` native extension (exact widget JSON retained, like `umf.delta`) +
   Lakeview → `umf.dashboard` import with a loss report; round-trip the fixture's source file.
4. `umf.dashboard` → Lakeview export; diff against the original.
5. Tableau import (`.twb` XML — note UMF has no XML-native extension precedent yet).
6. Decide upstream vs. fork: UMF is DocumentDrivenDX's repo (same org as HELIX); a PR or
   issue proposing the profile is a decision for the user.
