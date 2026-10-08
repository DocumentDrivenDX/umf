---
ddx:
  id: TD-054
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: US-054
      kind: informed_by
    - id: FEAT-005
      kind: informed_by
    - id: umf.architecture
      kind: references
    - id: CONTRACT-049
      kind: references
    - id: ADR-002
      kind: references
---

# TD-054: Shared JavaScript numeric adapter

## Scope

Realize [[US-054-javascript-numeric]] under FEAT-005 IDEAL-08 and CONTRACT-049.
The [architecture](../architecture.md#shared-javascript-numeric-boundary) is the
direct parent for this bounded library slice; no separate solution design is
needed. Exact shared surface and errors remain in CONTRACT-049.

## Technical Approach

Normalize numeric tokens into sign, significant decimal digits and a bigint
base-ten exponent for value comparison. Retain original token text in the
returned carrier. Remove insignificant zeros only in the comparison identity;
never rewrite caller text. This realizes US-054-AC3/5.

Decode the supplied number's 64-bit representation using DataView. Normal
values include the implicit significand bit; subnormals use their explicit
significand and exponent. Convert the binary rational into an exact decimal
coefficient by binary shifts or powers of five, then compare normalized
identities. Do not treat a shortest number-string round trip as proof of exact
decimal equality. This realizes US-054-AC4/5, including subnormal boundaries.

Use safe-integer admission for number-to-integer and integer-to-number paths,
and exact bigint coefficients for large integer recovery (US-054-AC1/2).
The strict policy trades convenience for visible refusal: common decimal input
such as number `0.1` must use explicit decimal text instead. An exact decimal
expansion of that binary value can still convert losslessly to number.

Delegate optional Document/Field constraints to current core literal validation
rather than implement a second range/precision policy (US-054-AC6). Copy context
and carrier objects with the core accessor-safe copier. Refuse extra carrier
members instead of silently discarding them (US-054-AC8). Preserve source data
and use existing Document serialization for US-054-AC7.

## Component Changes

| Component | Change and criterion realization |
| --- | --- |
| `src/adapters/javascript-numeric.ts` | New portable admission/conversion module; US-054-AC1–8. |
| `src/index.ts` | Public export; same browser-facing library boundary. |
| Existing core literal validation/copying | Reused without changing envelope schemas, scalar families or native policies. |
| `tests/core/javascript-numeric.test.ts` | Exact values, refusals, constraints, serialization and hostile input; STP-054 maps criteria. |
| `scripts/javascript-numeric-browser.ts` | Actual Chromium public API, constraints, recovery and absent host globals; US-054-AC9. |

## API/Interface Design

The shared JavaScript numeric section of CONTRACT-049 is the sole normative
surface. Runtime-only conversion can omit context; schema-qualified conversion
supplies the current Document and explicit Field identity. Nothing infers native
database types or mutates rows. Core float illustration carriers remain separate.

## Data Model and Integration Points

Existing integer/decimal literals remain the JSON-safe interchange boundary.
Raw bigint never enters the envelope. No schema/vocabulary version, native
adapter or persisted model migration is introduced. Truss, Ashlar and TableSpec
may consume the public API; their integration and Truss/Weft codecs require
their own evidence. No downstream fallback silently rounds values.

## Security and Performance

Local pure conversion requires no authentication, credentials or network service.
Treat token/context objects as untrusted data: validate grammar, cap text and
exponent lengths, bound expanded integer coefficients, and reject accessors
without execution. Binary64 decomposition is bounded by its fixed representation;
decimal identity work scales with supplied text. No throughput/latency target
or broader denial-of-service certification is claimed.

ADR-002 and the project concerns keep strict portable/tooling TypeScript checks,
Bun tests and separate Chromium execution. Bun/Node APIs stay in scripts;
the module adds no runtime dependencies. Project overrides retain a single
package and do not introduce Biome or workspace restructuring.

## Testing

[STP-054](../../03-test/test-plans/STP-054-javascript-numeric.md) owns the
per-criterion matrix. TP-001 allocates contract/integration/browser layers.
Require every US-054-AC1–9 to be exercised with a canonical citation; declarations
alone are not evidence. Existing core schema-property/key regression must pass.
Independent native database equivalence and downstream adoption are separate
claims; Bun and Chromium establish only the tested runtime subsets.

## Migration & Rollback

This is an additive library API over unchanged carriers. Existing artifacts and
JSON number rules retain their behavior. Rollback removes the numeric module
and public export; already-authored token carriers remain readable through
existing serialization. Consumers must remove calls before rolling back.

## Implementation Sequence

1. Establish US-054 and CONTRACT-049 boundaries and STP-054 numeric counterexamples.
2. Add the numeric module, reuse core validation and export through the public API.
3. Run focused regressions, typechecking, browser build and real Chromium checks.
4. Record versions, fingerprints and limits in the implementation plan; qualify
   subsequent test-citation changes without rewriting earlier execution evidence.

## Risks

Confusing decimal lexical round trips with binary equality can admit rounding;
exact identities and the `0.1` counterexample prevent that claim. Omitting context
can be mistaken for declared-domain validation; CONTRACT-049 requires the
distinction. Runtime drift requires version-qualified evidence. Broader browsers,
float semantics and downstream adoption remain unqualified until separately tested.
