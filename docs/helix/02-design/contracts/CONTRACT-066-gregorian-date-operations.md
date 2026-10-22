---
ddx:
  id: CONTRACT-066
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-047
      kind: informed_by
    - id: FEAT-008
      kind: informed_by
---

# CONTRACT-066: Gregorian civil-date operation profile

**Type:** library. **Version:** `umf-gregorian-date/1.0.0`.
**Status:** draft; reference implementation under validation, with no core or native admission.

## Purpose

Supply the explicitly selected date-value semantics required by the security
`truncate-date` reference function and reusable by other storage consumers.

## Scope and Boundaries

This profile owns bounded Gregorian civil-date parsing and truncation. It does
not give core `scalarType: date` an implicit calendar, activate defaults or
Key equality, interpret a timestamp/time, select a timezone or establish native
database equivalence. CONTRACT-049's ordinary temporal-value refusal remains
unchanged. Consumers MUST select this exact operation profile; scalar labels,
native casts, display names and implementation defaults cannot select it.

## Normative Surface

`GREGORIAN_DATE_PROFILE` is `umf-gregorian-date/1.0.0`.
`parseGregorianDate(token)` accepts exactly ten ASCII characters `YYYY-MM-DD`,
with year0001–9999, month01–12 and a valid day for that month. Gregorian leap
years are divisible by4, except centuries not divisible by400. This is a
restricted civil-date recipe using the full-date grammar and Gregorian rules
in [RFC3339 §5.6 and Appendix C](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6),
inspected2026-10-15; it is not an RFC3339 instant or support for every ISO8601
representation. Year zero, expanded/negative years, week/ordinal dates,
whitespace, final line terminators and non-ASCII digits refuse.

The immutable `GregorianDate` result is `{profile,originalText,year,month,day}`.
`profile` is the exact profile string; `originalText` preserves the complete
token; the three numeric components are exact bounded integers.

`truncateGregorianDate(token,unit)` first validates the complete token, then
accepts exactly `year`, `quarter`, `month` or `day` and returns a ten-character
full-date string. Year sets month/day to01; quarter sets month to
`1+3*floor((month-1)/3)` and day to01; month sets day to01; day retains the date.
The result MUST satisfy the same profile. No host date, clock, timezone database
or locale conversion participates. Repeated truncation by the same unit is
idempotent; truncation never advances a date; all original source remains
recoverable in the caller's retained input.

A consumer applying this profile to a qualified core Field MUST separately
establish exact source/revision, explicit `kind: field`, `cardinality: one`,
`scalarType: date`, and known nullability (`required` or `absent-allowed`). It
MUST refuse nonempty references, itemType, defaults, allowedValues, nonempty facets or
unknown relevant meaning rather than bypassing a failed general core check.
A null wrapper is admissible only with `absent-allowed`; it is not a date token.
These Field obligations do not apply to the standalone text parser, which makes
no schema-domain claim. A binding cannot discard native calendar/range detail
merely because the text parses under this recipe.

## Precedence and Compatibility

The recipe is explicit and versioned independently of core. Ordinary
`validateCoreFieldValue`/`checkSchemaLiteral` temporal refusal does not change.
CONTRACT-065 remains the distinct exact-instant recipe; neither converts to the
other implicitly. Future grammar, calendar, units or Field-refinement support
requires a new profile version. Native bindings retain their own evidence gates.

## Error Semantics

Non-string token input throws `TypeError`. Length, syntax, calendar or unit
violations throw `RangeError` without publishing a partial result. The text
length MUST be checked before regex/calendar work. Refusal is not a claim that
the source is invalid under every other temporal profile, and authorizes no
retry or fallback. Security callers convert these failures to source-retaining
refusals; they cannot substitute a host parser.

## Examples

`parseGregorianDate('2000-02-29')` retains that token and components2000/2/29.
`1900-02-29` refuses. `truncateGregorianDate('2026-10-15','quarter')` yields
`2026-10-01`; month yields the same value; year yields`2026-01-01`; day retains
`2026-10-15`. `0001-01-01` and`9999-12-31` are in range. A timestamp ending in
`Z` refuses instead of being silently converted to a civil date.
