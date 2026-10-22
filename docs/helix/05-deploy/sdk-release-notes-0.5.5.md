---
ddx:
  id: umf.sdk-release-notes-0.5.5
  type: release-notes
  activity: deploy
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-081
      kind: informed_by
    - id: SD-007
      kind: informed_by
    - id: umf.plan.schema-migrations
      kind: informed_by
    - id: umf.plan.praxis-embedder-completion
      kind: informed_by
---

# UMF SDK 0.5.5 candidate

## Release Scope

This is an unpublished candidate inventory, not a release announcement.
Selected versions are SDK 0.5.5, `umf_access` 0.1.0.dev7 and
`umf_codegen` 0.1.0a4. The semantic core remains 0.10.0; its original release
assets are reused. Weft 0.4.49 is the selected unchanged SQL dependency.
Release date, final source/asset hashes and supported matrix cells remain open
until the completion plan's review and acceptance gates pass.

## Audience and Channels

Python embedding hosts consume administrative wheels and generated application
clients; TypeScript/browser consumers use portable declarations and compilation.
Final release assets, the complete offline mirror and these notes are the
distribution channels. Generated application code remains stdlib-only; the
administrative compiler uses embedded V8.

## Highlights

Candidate changes exercise canonical comments, nullable enums and decimal bounds;
introduce host-neutral migration orchestration with durable host approval custody;
and add an optional parsed SQL containment checker. A successor migration profile
selects bounded existing-Field fill followed by NOT NULL in one transaction.
These capabilities remain subject to the qualification limits below.

## Changes and Fixes

The selected host owns identity, connections, approval decisions, locks and durable
outcomes. UMF owns declarations, plans and DDL; Weft lowers admitted data actions.
SQL containment is inert, optional and fail-closed, with no execution authority.
It requires the separately pinned parser extra and its license inventory.

Canonical authoring reuses existing `description`, `allowedValues` and range
facets. Platform receipts distinguish actual OS/Python/wheel hashes; offline
installation uses a complete locked dependency cohort with network denial and
missing/tampered artifact controls. Final runner receipts are pending.

## Breaking Changes and Required Actions

Retain original sources, migration files, approvals and digests. Historical 0.1
and 0.2 plans retain their original semantics; use current public compilation for
new effects. Durable approval installations select the closed successor metadata
and installation-reference profile. Hosts must supply trusted stable installation
identity and record approval independently of author-supplied plan metadata.

## Migration or Rollback Guidance

Compile and review against the exact installed predecessor; verify the original
file, target, head, native correspondence and durable approval before mutation.
Resume uncertain outcomes by observation. Do not repeat a committed fill or clock
operation. Keep old/new generated clients fenced until publication completes.
Use a separately reviewed forward repair after committed changes; metadata
history does not restore deleted values or reverse a completed data mutation.

## Known Issues and Support

G01 has [independent installed design/native signoff](../04-build/evidence/schema-migration-design-review/g01-review.json).
Its selected
subset is one existing optional Field becoming required, unchanged identity,
type, facets and future default, a standalone locked pair, and a finite literal
or qualified transaction-clock assignment to NULL cells. Maintenance execution
does not imply online reconciliation or arbitrary transforms. Thirteen native
scenarios and nine supplemental checks qualify date/clock, actual native failure
causes, writer locking, rollback, future defaults and resume for the recorded
Py3.11.17/PostgreSQL 18.6/Weft 0.4.49/Psycopg 3.2.13 cohort. U5 historical replay
and command-only publication findings are fixed and
source-reviewed; installed tamper and lost-publication-response checks pass.
Hosted qualification and final publication remain open.

| Residual | Candidate limit and next action |
| --- | --- |
| MIG-G02 | Arbitrary per-row derived backfills remain unsupported; a trusted typed transform protocol is not selected. |
| MIG-G03 | General SET/DROP or expression changes to future defaults on existing columns remain unsupported. |
| MIG-G04 | General narrowing, cross-family casts and shadow rewrites remain unsupported; only the documented finite widening subset is admitted. |
| MIG-G05 | No retained-value retirement window or reversible physical deletion; reviewed immediate purge is irreversible without a separate data backup. |
| MIG-G06 | Online chunked backfill with concurrent application writes is unqualified; the selected runner uses fenced maintenance. |
| MIG-G07 | Cross-document and coordinated multi-store schema migration remain unsupported. |
| MIG-G08 | This shared migration design is not qualified for Truss, Ashlar or other stores. Hohfeld reader integration does not close this gap. |
| MIG-G09 | Actual managed Lakebase/Praxis acceptance remains open pending an authorized isolated target and frozen installed consumer workload. Local PostgreSQL is insufficient. |
| MIG-G10 | Mixed 0.2/0.3 table-inventory changes and initial deployment remain outside the existing-table profiles; use the separately qualified 0.1 bootstrap/add-table route. The successor does not close this gap. |
| MIG-G11 | Combined column drop/append in one existing-table migration remains explicitly refused, including equal-count replacement. |

Hohfeld 0.5.0, published 2026-10-21, has an exact facet-free same-document
integration receipt against core 0.10.0, Weft 0.4.49 and Truss 0.0.45. That
bounded current-core journey satisfies the selected U9 scope; it does not claim
general core, facet or graph-migration conformance. Additional reader refusal
corrections are reviewed upstream follow-up changes, remain unreleased and are
excluded from this distribution's claims. Provider-owned original-source
semantics require native evidence; omission from reader metadata alone does not
prove end-to-end loss. Actual private consumer replacement and managed
acceptance remain externally owned and unverified.

## References

- [Completion plan and acceptance gates](../04-build/praxis-embedder-completion-plan.md)
- [Migration residuals and G01 delivery sequence](../04-build/schema-migration-plan.md#remaining-gap-delivery-order)
- [Table lifecycle guide](../04-build/guides/legal-table-lifecycle.md)
- [Optional SQL containment API and refusals](../04-build/guides/sql-containment.md)
