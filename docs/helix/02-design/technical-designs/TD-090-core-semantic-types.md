---
ddx:
  id: TD-090
  type: technical-design
  activity: design
  status: draft
  x-recovery-previous-id: TD-051
  authoring:
    home: repo
  links:
    - id: US-090
      kind: informed_by
    - id: SD-005
      kind: informed_by
    - id: CONTRACT-078
      kind: informed_by
---

# TD-090: Core0.10 semantic-reference composition

## Technical Approach

[[US-090-core-semantic-types]] inherits [[SD-005-128-bit-uuid]]. CONTRACT-078
owns exact APIs. Clone the unchanged core0.9 document schema into a new0.10
resource and add semanticTypes only on elements. Restore exact registry and
reference logic from88be379f3, issuing new semantic2.0 receipts. Reference shape
remains1.0. This explicitly replaces the historical competing core0.9 profile.

Inherited validation uses a private core0.9 view with element semanticTypes
removed; extension callbacks receive isolated complete0.10 source. Published
core0.9 schemas and runtime behavior remain unchanged. Metadata selection
recognizes0.10 membership/key traversal, preserving references and unknown data.

## Component Changes

New semantic schemas, registry/core/transition/receipt modules and validator;
add0.10 dispatch and Document type; export new public operations and selection
schema. Register the new profile and prototype extension in the generated
reference inventory without claiming native delivery.

## Testing

US-090-AC1–AC6 map in STP-090. Restore the semantic corpus as red tests, then
add UUID/bits128 composition, unchanged schema fingerprints, old receipt refusal,
complete callback source and two-stage migration checks. Run real Chromium and
independent Draft2020-12 structural comparisons. Existing native proofs are
historical; no new native claim is derived.

## Security and Boundaries

No network/catalog or artifact-directed code loading. Validators are explicitly
installed trusted callbacks with copied inputs/results. Existing JSON bounds
apply; private schema snapshots prevent public schema mutation from changing
compiled behavior. Diagnostic collection has no new OTel/external receiver claim.
Formal model checking is excluded: this slice is a bounded structural/receipt
composition exercised by original-source recomputation and mutation controls.

## Migration and Rollback

Only core0.9 upgrades directly to0.10; older models first use their existing
explicit migration chain. Archive every opaque semanticTypes collision; optional
prototype conversion retains its original extension. Rollback restores the
exact source and keeps edited current content separately. Version1.0 semantic
receipts are refused; no ambiguous core0.9 document is silently relabeled.
