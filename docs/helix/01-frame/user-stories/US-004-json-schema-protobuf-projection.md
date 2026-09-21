---
ddx:
  id: US-004
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-003
      kind: informed_by
---

# US-004: Project JSON Schema to Protobuf with explicit losses

As a schema-tool author, I want a compiled target and a precise account of source
meaning it cannot carry, so that I can choose bindings without assuming equivalence.

## Acceptance Criteria

- **US-004-AC1:** Explicit field-number and integer-domain choices produce a target
  and machine-readable issue/mapping report. The full original source remains
  recoverable; target-only reimport contains no silently restored JSON Schema.
- **US-004-AC2:** Strict policy, invalid/missing/conflicting bindings, unknown
  dialects and unsupported shapes/scopes return blocked results with reasons.
- **US-004-AC3:** Nested object definitions, repeated messages and supported local
  recursive references compile with stable mappings and native-scope diagnostics.
- **US-004-AC4:** Independent source/target oracles demonstrate expected differences
  in ranges, required members, nullability, constraints and alternatives. Removing
  a required disclosure is detected as a failed gate.
- **US-004-AC5:** Chromium projects through the public TypeScript API and WASM
  compiler, retaining the source and exposing target-only recovery limits.

## Evidence and Scope

`tests/projections/json-schema-protobuf.test.ts` covers AC1–AC4;
`scripts/projection-oracle.py` supplies independent instance expectations;
`scripts/browser.ts` covers AC5. CONTRACT-004 defines the bounded profile.
The authored Order schema exercises references and nested messages; the constraints
fixture exercises known mismatches. This is schema projection, not a universal
instance converter or equivalence proof. Broader profiles remain future work.
