---
ddx:
  id: US-028
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-002
      kind: informed_by
---

# US-028: SHACL schema interchange and validation

As a metadata consumer, I need SHACL shapes retained as graphs, with programmatic
path and constraint interpretation, so validators and forms can use the same source.

## Acceptance Criteria

- AC1: Publish the versioned shapes-graph package and JSON schemas. Recover exact
  native source through JSON/YAML, preserve unknown graph content and lexical terms,
  and support copied edits with atomic rejection. Encoding unknowns block native export.
- AC2: Compile all seven SHACL 1.0 property-path forms and evaluate value-node sets.
  Cover nesting, inverses, cycles, duplicate triples, literals, malformed lists and
  source-local blank identities against an independent native implementation.
- AC3: Implement SHACL Core constraint components, target selection, qualified counts,
  shape references, severities, messages, deactivation and validation reports. Compare
  official expected reports and independent native execution before and after edits.
- AC4: Preserve and explicitly qualify SHACL-SPARQL and custom components; implement
  their execution or document unsupported execution without claiming conformance.
- AC5: Verify paths, edits and validation in Bun and Chromium; demonstrate metadata
  consumption and cross-system transforms with explicit losses.

## Boundaries

Initial work implements AC1 and AC2 only. AC3–5 remain required; a path result or
successful graph import is not a SHACL validation result. SHACL 1.2 is a distinct
version to inventory. OWL entailment and physical platform bindings are separate.
