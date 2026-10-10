---
ddx:
  id: TD-061
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-061
      kind: informed_by
    - id: SD-026
      kind: informed_by
    - id: CONTRACT-058
      kind: references
---

# TD-061: Historical appellate development fixtures

## Scope

The expanded US-061 appellate slice (AC9–AC12) inherits SD-026's separation of
UMF-owned schema/source descriptions and consumer-owned execution. Earlier legal
operations/generator acceptance remains governed by its recorded evidence.

## Technical Approach

Retain hash-pinned judicial PDFs and project local text layers with pypdf 6.10.0.
Separate observed court/docket/version/page metadata from authored interpretation
and fabricated temporal inputs. Use exact native TableSpec schemas and fixed CSV
bindings; no new shared extension or monitoring runtime is introduced.

The source selection is a bounded historical seed, not a complete court scrape.
Current official URLs can replace earlier opinions: content hashes and retained
version/status relationships identify what the pack actually contains. Court level,
statutory basis and opinion voice prevent name-based or outcome-only split inference.

## Component Changes

`spec/domain-packs/legal-appellate/` adds originals, selection/retrieval records,
curation, replay, prompt, schemas, CSVs and pack metadata. The offline projector in
`scripts/domain-packs/legal-appellate-project.py` refuses hash changes, missing
evidence, duplicate identities and dangling references. It does not infer labels.
The existing catalog discovers pack manifests and schemas through its current path.
The pack root also retains the exact five-file shared acquisition companion;
its canonical README remains unchanged, and the appellate guide is `GUIDE.md`.

`tests/domain-packs/legal-appellate.test.ts` is a bounded test consumer of the
independently authored replay outputs; it does not implement a production monitor.
`scripts/legal-appellate-browser.ts` qualifies native schema recovery and manifest
preservation in real Chromium without Bun/Node globals.

## API/Interface Design

| Surface | Contract | Use |
| --- | --- | --- |
| Manifest/source export | CONTRACT-052 | Pin originals and source rights; refuse tampering/unknown rights. |
| Fixed execution profile | CONTRACT-053 | Declare tabular targets and source inclusion, not temporal execution. |
| Appellate schemas/replay policy | CONTRACT-058 | Exact checked-in schemas, attributed annotations and expected transition results. |

## Data Model and Integration

Fifteen native tables cover court/case/document/page, issue associations,
version/status links, provisional annotations/evidence, counsel, expected windows,
events, expected results and fictional enrichment. Every table has an explicit row
source binding. Originals remain authoritative over lossy text extraction.
Local source export is the consumer handoff. No credentials or network connection
are required to regenerate or consume the fixed corpus.

## Performance and Security

The bounded 34-PDF/1,689-page corpus is a development fixture, without a latency
target. Retain unknown/no-text-layer states and historical counsel dates. Treat
PDF text as untrusted evidence in the screening template. No live email or PACER
request is made by pack tools.

## Testing and Deployment

STP-061 maps the expanded criteria to exact recovery, original integrity, independent
replay, uncertainty and export checks. Native TableSpec model admission qualifies
only the retained schema subset, not production workflow or legal accuracy.
Rollback removes this independent subpack and its scoped tools/docs; existing legal
operations and core adapter semantics remain separately qualified.

## Unknowns

Court-site list, designated order types, attorney prompt, recipient, polling
constraints and production alert policy remain user inputs for the later loader.
Supreme Court docket monitoring is separate and undefined. Attorney review of
the provisional annotations is needed before treating them as an accuracy benchmark.
