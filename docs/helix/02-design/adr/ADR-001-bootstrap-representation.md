---
ddx:
  id: ADR-001
  type: adr
  activity: design
  status: accepted
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
---

# ADR-001: Use YAML-first, JSON-compatible bootstrap documents

| Date | Status | Deciders | Related | Confidence |
| --- | --- | --- | --- | --- |
| 2026-09-20 | Accepted | Project owner, explicit bootstrap brief | FR-23, FR-29, FR-30; NFR-13, NFR-30 | Direction confirmed; detailed serialization profile untested |

## Context

UMF needs human-readable interchange and mechanically checkable structure while
retaining native semantic differences. The owner explicitly directs continued
YAML-first authoring, JSON compatibility, and JSON Schema bootstrap validation.
The existing TableSpec schema has not been inspected, so this decision records
the representation direction without claiming backward compatibility evidence.

## Decision

Use YAML-first, JSON-compatible artifacts with JSON Schema as the starting
structural validation mechanism. Keep semantic validation separate and operate
translators against a shared programmatic model. JSON Schema may remain the
mechanically authoritative bootstrap definition when self-description is added.

This decision selects a bootstrap representation boundary, not a host language,
JSON Schema dialect, model class hierarchy, or exact serialization contract.

## Alternatives

| Option | Benefit | Cost | Disposition |
| --- | --- | --- | --- |
| YAML/JSON plus structural and semantic validation | Human interchange, tooling compatibility, separate semantic responsibility | Requires an explicit safe YAML profile and validation boundaries | Selected by owner |
| New universal domain-specific language | Custom syntax and semantics | New tooling/adoption burden; risks premature universal abstractions | Rejected for bootstrap |
| TypeSpec as normative metamodel | Existing modeling and tooling capabilities | Fidelity of all required native concepts has not been demonstrated | Defer; retain as interchange |
| One relational or ontology worldview | Mature native tooling | Forces other native semantics through one system's abstractions | Rejected as universal foundation |

## Consequences

Human-readable interchange remains available and structure can use established
validators. Semantic validators must still handle reference integrity, native
rules, and cross-element invariants. YAML/JSON conversion creates obligations
around duplicate keys, numeric precision, non-JSON values, and unknown content.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Parser defaults alter meaning | Unassessed | Fidelity failure | Define and test a serialization profile before build |
| Structural validity is presented as full validity | Unassessed | False conformance | Separate validation results and native oracles |
| Existing artifacts exceed the new profile | Unassessed | Compatibility break | Inspect TableSpec baseline; define deterministic migrations when needed |

## Validation

SPIKE-001 must show both native round trips, unknown-content preservation, and
explicit cross-system limitations. Revisit this decision if the representation
cannot preserve required native constructs without semantic distortion or an
unacceptable inspectability loss. Exact profile choices remain open and reversible.

## Supersession

Supersedes: none. Superseded by: none.

## Concern Impact

Activates serialization-focused fidelity, reviewability, and validation-boundary
checks in the project concerns. No implementation-language slot is selected.

## References

- [Product requirements](../../01-frame/prd.md)
- [Architecture](../architecture.md)
- [Initial spike](../spikes/SPIKE-001-jsonschema-protobuf.md)
- Authority: the project owner's 2026-09-20 bootstrap brief, sections 7–9.

## Review Checklist

- [x] One representation decision records explicit owner direction.
- [x] Alternatives, consequences, and reconsideration conditions are stated.
- [ ] Establish the concrete serialization profile and compatibility evidence.
