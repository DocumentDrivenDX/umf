---
ddx:
  id: TD-023
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-023
      kind: informed_by
    - id: CONTRACT-023
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
    - id: ADR-002
      kind: informed_by
---

# TD-023: ODCS browser interchange

## Technical Approach

Use shared exact NativeJson parsing for authoritative JSON/YAML values plus original-source
archival. Vendor complete upstream schemas unchanged; Ajv 2019 inspects a disposable numeric
view. Validation never reconstructs or normalizes the native contract. CONTRACT-023 defines
all public interfaces and error/compatibility rules.

## Components and Integration

src/adapters/odcs implements the extension; odcs-schema.ts materializes its package. The source
collector pins a release checkout and copies all YAML examples plus selected versioned schemas
with license and hashes. Public code remains browser TypeScript; Python is a development oracle.
The corpus distinguishes archival preservation, native grammar outcomes and metadata candidate
edits. Browser export uses exact source when possible and JSON-compatible YAML after changes.

## Validation and Remaining Work

Compare independent Python schema validation and whole-document values through both formats;
check unknown native values, future versions, encoding additions, malformed roots and failed-edit
immutability. Reference resolution, contract enforcement, physical interpretation and cross-system
projections remain separate work. No concept is promoted into core without semantic evidence.


AC4 adds references.ts and a complete reference-result schema. It traverses only explicit
schema/properties arrays and compares the chosen identity field at each level. Traversal emits
native JSON Pointers containing actual array positions while interpreting the reference's IDs
or names independently of those positions. Ambiguous/missing targets stop traversal; unknown
source content remains copied. No URL fetching, target coercion, parent guessing or physical-name
fallback occurs. Tests use pinned prose/example-derived expected locations and browser repetition,
with independent rename/reorder and ambiguity regressions. External bundles and relationship
arity/type/data enforcement remain separate work.


AC5 adds relationships.ts and a complete relationship-report schema. It traverses only explicit
schema/properties arrays, validates local relationship context and gathers ordered endpoints
through AC4 lookup. Repeated reference strings cache only target paths and errors, not copied
source documents. A row publishes pairs only if all of its checks resolve; unresolved rows retain
source pointers and no misleading partial composite. Limits bound relation count and composite
width, with full original source retained. Native JSON Schema outcomes are checked independently
from specification-derived pairing requirements and unsupported profile boundaries.


AC6 adds rename.ts and the complete rename-result schema. It resolves an ID-selected target,
checks sibling names and requires AC5 to pair every known relationship. It plans pointer-based
name/shorthand edits from the original tree, preserving reference spelling prefixes and stable
IDs. Edits apply to a private copy; native shapes and ordered endpoint paths are rechecked before
publishing a candidate. A block exposes no candidate or partial edit list. Unknown expressions
remain exact source with a mandatory incomplete-semantics warning. The authored corpus includes
nested paths, ID references and retained expression-like metadata to test these boundaries.
