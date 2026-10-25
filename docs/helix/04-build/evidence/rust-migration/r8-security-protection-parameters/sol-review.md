---
ddx:
  id: umf.evidence.rust-migration.r8-security-protection-parameters-sol-review
  type: evidence
  activity: build
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.evidence.rust-migration.r8-security-protection-parameters
      kind: informed_by
    - id: umf.plan.rust-migration
      kind: informed_by
    - id: CONTRACT-062
      kind: informed_by
---

# Independent Sol review: protection parameter candidate

Sol reviewed the Rust parameter admission and tagged wire against the current
TypeScript source, including the shared `ProtectionLiteralBudget`. The first
candidate lost isolated UTF-16 diagnostic units and checked numeric expansion
per token; those defects were corrected. A later catalog-bound preflight
misordered domain diagnostics, so the bound moved to source inspection. Sol
independently reran the 11-case predecessor, cumulative-budget and crossed-order
Bun packet checks; the focused security core and wire suites passed 12/12 each.
The parameter core and wire SHA-256 values reviewed are
`cd590b013a7c2debf3910c42500a9ab9698d217c27bcee3b19e59714e3a4be5e`
and `adf9f843d6d65423ecf2ee013e5850b25ba8fb31897787b53d00377175685272`.

The wire matches eight representable frozen outcomes. The malformed integer
token differs in nested `oneOf` diagnostic expansion and is excluded from
diagnostic-array parity. The internal pre-spent JavaScript budget and raw
accessor are outside tagged JSON; repeated/container and non-integer/non-decimal
Fields are explicitly refused by this candidate. These limits prevent default
route selection or claims of complete protection semantics. `complete:false`
and `authority:false` remain mandatory; no authorization or policy decision is
made by this slice.
