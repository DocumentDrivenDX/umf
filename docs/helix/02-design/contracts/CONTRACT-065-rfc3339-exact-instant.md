---
ddx:
  id: CONTRACT-065
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-047
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
---

# RFC3339 exact instant operation profile

**Type:** library. **Version:** `umf-rfc3339-exact-instant/1.0.0`.

## Purpose

Provide a shared, lossless instant comparison recipe for explicitly selected
consumer operations. The owner requested consistent timestamp equality across
Truss, Ashlar and other consumers. This profile is independent of native database
timestamp precision and session timezone.

## Scope and Boundaries

UMF owns the portable recipe and browser-compatible helper. Consumers own storage,
query execution and explicit profile selection. This does not change core
`scalarType: timestamp`, civil-time semantics, CONTRACT-047 temporal facets or
temporal Key equality. Existing profiles remain unchanged. Ashlar or Truss support
requires separately released bindings; this helper alone does not establish it.

## Normative Surface

`parseRfc3339ExactInstant(token)` MUST accept ASCII RFC3339 date-time text with
four-digit Gregorian years 0001–9999, valid month/day, hours 00–23, minutes and
seconds 00–59, optional dot followed by one or more decimal fraction digits,
and `Z`, `z`, or signed `HH:MM` offset (hours 00–23, minutes 00–59).
The date/time separator is `T` or `t`. No whitespace, alternate separators,
unqualified local time, year zero or leap-second token is admitted. This is a
declared subset of [RFC3339 §§4.2–4.3, 5.6–5.7](https://www.rfc-editor.org/rfc/rfc3339.html).

`RFC3339_EXACT_INSTANT_PROFILE` is the exact version above.
`RFC3339_EXACT_INSTANT_MAXIMUM_BYTES` is 1,048,576. Tokens MUST be bounded before
parsing; accepted ASCII text has one byte per character. Fractional precision is
limited only by that token bound.

The immutable result `Rfc3339ExactInstant` contains:

| Member | Shape | Meaning |
| --- | --- | --- |
| `profile` | exact profile string | Explicit operation semantics |
| `originalText` | string | Entire unchanged token |
| `utcSeconds` | canonical signed integer string | Whole UTC seconds since 1970-01-01T00:00:00Z, rounding toward negative infinity |
| `fractionalDigits` | ASCII digit string or empty | Nonnegative fraction of the following second, with only trailing zeros removed; empty means zero |
| `originalOffset` | string | Exact offset suffix, including case and unknown-offset spelling |
| `localOffsetKnown` | boolean | False exactly for `-00:00` |

Days use the proleptic Gregorian calendar, 86,400 seconds per day and no leap
second accumulation. Subtract the numeric offset from the local whole second.
UTC normalization MAY cross into internal year 0 or 10000 without rejecting an
otherwise admitted input year. Fraction digits MUST NOT pass through floating
point, a finite-precision native timestamp, or a host datetime conversion.
The bounded calendar integer arithmetic MUST be exact.

`sameRfc3339ExactInstant(left, right)` MUST parse both tokens and return true
exactly when both `utcSeconds` and `fractionalDigits` match by ASCII equality.
Original spelling and local-offset knowledge are retained but do not participate
in instant equality. `-00:00` denotes a known UTC instant with unknown local
offset per RFC3339 §4.3; it MUST NOT be relabeled as a known local offset.
The result is JSON-safe. Concatenated textual keys MUST NOT be presumed sortable.

## Precedence and Compatibility

Consumers MUST select this exact operation profile explicitly and apply the same
recipe to stored values and query literals/parameters. Normalizing only query
parameters is insufficient. Literal and parameter validity MUST be checked even
when the queried source is empty. Original tokens MUST remain recoverable in
storage, projections and parameter slots. A generic timestamp family, projection
profile, native cast or similarly named field MUST NOT implicitly select it.
Future grammar, epoch or equality changes require a new profile version.

## Error Semantics

Non-string input throws `TypeError`. Token limit, syntax, calendar or offset
violations throw `RangeError`, publishing no partial result. These errors do not
authorize retry loops or assert that a token is invalid under another temporal
profile. No filesystem, network, timezone database or host clock is consulted.

## Examples

`2024-01-01T00:00:00.123456789Z` and
`2023-12-31T19:00:00.1234567890-05:00` compare equal. Values differing at the
seventh fractional digit compare unequal. `1969-12-31T23:59:59.5000Z` produces
`utcSeconds: "-1"`, `fractionalDigits: "5"`. A `-00:00` token shares its instant
key with `Z` while retaining `localOffsetKnown: false`.

## Validation

Basic Bun and real-browser checks cover offset equivalence, precision, pre-epoch
fractions, unknown offsets, calendar bounds and refusal. Downstream native
query execution is a separate deliverable, not proved by these helper checks.
