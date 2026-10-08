---
ddx:
  id: US-054
  type: user-stories
  activity: frame
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: derived_from
    - id: umf.prd
      kind: derived_from
---

# US-054: Share exact JavaScript numeric handling

**Feature:** FEAT-005. **Feature Requirements:** IDEAL-08.
**PRD Requirements:** FR-8, FR-39, FR-41. **Priority:** P0.

## Story

**As a** Schema Integration Maintainer, **I want** to admit and recover numeric
values through one shared policy, **So that** my schema consumers do not silently
round integers or decimals or disagree about their declared domains.

## Context

Truss, Ashlar and TableSpec need the same runtime conversion policy. Existing
integer and decimal token carriers preserve values outside JavaScript's safe
integer range and retain decimal spelling. CONTRACT-049 owns the exact adapter
surface and its deliberately strict decimal policy; this story does not require
a new schema family, database codec or downstream port.

## Walkthrough

1. The maintainer selects an integer or decimal family and, when needed, the
   exact current Document and Field whose constraints apply.
2. The maintainer supplies a safe number, a bigint or an exact decimal spelling.
   UMF returns an existing literal carrier or refuses a value-changing admission.
3. The maintainer retains the carrier in a schema artifact and serializes it.
4. The maintainer reads it back and explicitly requests bigint or lossless
   number conversion; UMF checks the selected domain and refuses rounding.

## Acceptance Criteria

- **US-054-AC1:** Given integer-family number input, when admitted under
  CONTRACT-049, then safe integers retain their value and unsafe/nonintegral
  values refuse.
- **US-054-AC2:** Given a large bigint and a declared integer Field, when
  converted in either direction, then the exact integer is retained within the
  declared domain and out-of-domain values refuse.
- **US-054-AC3:** Given valid exact decimal text, when constructed as a carrier,
  then its spelling is retained, including trailing zeros, exponent and signed zero.
- **US-054-AC4:** Given decimal-family number input, when admitted, then a
  shortest spelling that changes the exact binary value refuses under CONTRACT-049.
- **US-054-AC5:** Given a numeric carrier, when explicitly converted to number,
  then exact admitted values succeed and rounding, overflow, underflow and
  disallowed signed zero refuse.
- **US-054-AC6:** Given a supplied current Field context, when converted, then
  declared numeric constraints apply and invalid/unknown relevant meaning refuses.
- **US-054-AC7:** Given an admitted carrier in a Document, when serialized and
  read through both supported formats, then value/spelling and unrelated content
  survive without mutating the supplied source.
- **US-054-AC8:** Given malformed, over-limit or accessor-bearing input, when
  converted, then the operation refuses without invoking accessors or dropping
  extra carrier content.
- **US-054-AC9:** Given the built public API in a real browser, when the scoped
  numeric checks run, then the same admission/refusal policy works without host globals.

## Edge Cases

Signed zero is retained as decimal text but refuses admitted number conversion;
bigint cannot recover its sign. Already-rounded number input cannot recover an
earlier intended value. Float-family and exceptional-value conversion remain
outside this story. Omitting Field context makes no declared-domain claim.

## Test Scenarios

| Scenario | AC ID | Input and outcome |
| --- | --- | --- |
| Safe integer boundary | US-054-AC1 | Maximum safe integer succeeds; the next integer refuses. |
| Signed 64-bit bound | US-054-AC2 | 9223372036854775807 survives bigint/token recovery; the next value refuses in the selected domain. |
| Decimal spelling | US-054-AC3 | `1.2500E+0` remains unchanged in its carrier. |
| Decimal rounding | US-054-AC4 | `0.5` admits; number `0.1` refuses decimal admission. |
| Exact binary value | US-054-AC5 | The exact decimal expansion of binary64 `0.1` converts successfully; decimal text `0.1` refuses. |

## Dependencies

FEAT-005 IDEAL-08; CONTRACT-001 envelope/carriers; CONTRACT-049 current literal
validation; ADR-002 browser/runtime boundary. TD-054 and STP-054 carry design
and per-criterion verification. Existing Field/native admission gates are independent.

## Out of Scope

Database codecs, storage/query execution, new core types, float instance
semantics, lossy conversion modes, automatic schema migrations and consumer adoption.
