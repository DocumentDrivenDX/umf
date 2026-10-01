---
ddx:
  id: EVIDENCE-BINDING-STABLE-IDS
  type: evidence
  activity: build
  status: complete
  authoring:
    home: repo
  links:
    - id: CONTRACT-042
      kind: informed_by
    - id: TD-046
      kind: informed_by
    - id: CONTRACT-041
      kind: informed_by
---

# Stable-ID physical relationship binding transition

The `umf.binding` 0.2.0 package uses exact `{module,id}` relationship
references against experimental core 0.7.0. The original 0.1.0 package remains
published and readable. This change supplies binding metadata validation and
explicit migration/rollback only; it generates no relationship storage and
claims no native enforcement or relationship ideal admission.

`migrateBindingRelationships` validates the exact paired model and requires a
unique authored name match. Unknown original content remains copied; a future
`id` member colliding with the new slot blocks the migration. Receipts retain
the original and migrated documents, full paired model and per-entry mappings.
Rollback recomputes the receipt and restores the exact original. Later ID-only
or edited choices have individual residuals, and the complete current document
retains all other later edits. Restored legacy names must be interpreted with
the original model retained in the receipt, never silently reassociated.

Verification on 2026-10-01:

- `bun test tests/binding`: 43 tests, 220 assertions, zero failures across
  ten files, including existing physical binding profiles.
- `bun run typecheck` and `bun run build`: pass.
- `bun run test:schemas`: all 56 packages and 326 schemas pass. The new
  operation schema covers complete migration results, receipts and rollback
  results; tests reject missing retained source and mapping content.
- `UMF_CHROMIUM_PATH=/home/erik/.local/bin/chromium bun scripts/binding/stable-ids-browser.ts`:
  Chromium 148.0.7778.0 matches Bun migration, validates lookup after rename,
  recovers through JSON/YAML, restores the original and retains ID-only choices.
  Duplicate/missing IDs, stale names and tampered receipts refuse. No external
  browser requests or Bun/Node globals occur. The portable implementation uses
  no host APIs.

The [browser record](../../../../fixtures/binding/stable-ids/browser.json) is
scoped evidence for this transition. Native database checks are inapplicable
to these metadata-only operations; target-specific generation remains separate.
