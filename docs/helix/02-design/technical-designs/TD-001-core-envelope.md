---
ddx:
  id: TD-001
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: US-001
      kind: informed_by
---

# TD-001: Core envelope implementation

Governing story: US-001. Architecture is the direct parent for this initial
infrastructure slice; no separate solution-design instance exists. CONTRACT-001
owns all normative surfaces. This bootstrap does not establish native fidelity.

## Technical Approach

Use TypeScript modules with no host global types. Compile Draft 2020-12 schemas
with Ajv and parse YAML through its syntax tree before converting data. Inspect
own property descriptors when copying values, preserving unfamiliar keys without
executing accessors. Validate exact version/scope before invoking trusted semantic
validators. Revalidate copies after edits; retain the original on failure.

## Component Changes

- `spec/core/`: core and package structural schemas.
- `src/model/`: types, checked copying, serialization and atomic extension edits.
- `src/registry/`: exact-version trusted schema/validator registration.
- `src/validation/`: independent structure, core reference and vocabulary checks.
- `scripts/`: Bun build and browser harness; host APIs stay outside portable source.

## API/Interface Design

All API fields, errors, numeric limits and compatibility behavior are defined in
CONTRACT-001. Cross-document native references remain the native adapter's future
responsibility; this slice resolves explicit intra-document element references.

## Testing

US-001-AC1–AC4 map to Bun cases in `tests/core/core.test.ts`; AC5 maps to the
packaged browser entrypoint exercised by `scripts/browser.ts`. Test both known
and unknown vocabulary instances, deliberately broken references/numbers, and
positive/negative edit outcomes. Synthetic vocabulary tests prove envelope behavior,
not third-party conformance. Type-check the portable source separately from tools.

## Security and Performance

Input bounds and serialization failures follow CONTRACT-001. Native schemas and
artifacts do not trigger remote retrieval. Semantic validators are trusted installed
code, not a sandbox. Ajv-generated functions have an unresolved strict-CSP browser
limitation; no strict-CSP compatibility claim. No throughput target is asserted.

## Migration and Rollback

Version 0.1.0 is a new experimental envelope. There is no inspected legacy baseline;
do not claim TableSpec compatibility. Preserve source artifacts across changes;
new semantics require explicit version/migration design rather than overwriting data.

## Implementation Sequence

Schemas/types → checked copying/serialization → registry/reference validation →
atomic edits → Bun regression suite → bundle/type output → actual-browser checks.
Record tool versions and current limitations in build evidence.

## Risks

The envelope is intentionally not a universal type lattice. Native adapter work
may reveal missing composition contracts; evolve the contract rather than storing
semantic assumptions in code alone. Numeric range beyond the bootstrap profile
must gain a lossless encoding before adapters claim support for it.
