---
ddx:
  id: CONTRACT-909
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: CONTRACT-065
      kind: informed_by
    - id: umf.cross-cutting-requirements
      kind: informed_by
---

# CONTRACT-909 Exact elapsed duration

## Purpose

Provide exact elapsed values and deadline arithmetic for portable declarations.

## Scope and boundaries

The explicit profile applies to fixed elapsed durations. Workflow wait and
re-entry slots add nonnegative constraints. General core field typing,
defaults, facets and keys require their own admission decision and evidence.

## Normative surface

`umf.exact-duration/1` represents a signed elapsed span as a signed 128-bit
integer in nanoseconds. The JSON-safe value identity is its canonical base-ten
integer string. Original input remains available independently from value identity.

The text carrier is ASCII with optional leading minus, then `PT`, then one
or more of hours, minutes and seconds in that order, each at most once.
Each component begins with one or more decimal digits. Seconds alone can
carry a dot and one through nine fraction digits. A standalone `PnD` or
`PnW` form with an optional leading minus is also admitted. These are fixed
24-hour days and seven-day weeks. The suffixes are `H`,
`M` and `S`. Leading zeros are allowed. Component magnitude is bounded by
the total signed span. A negative zero has value identity `0`.

The count carrier supplies a signed ASCII integer string and an explicit
unit. Units are nanosecond, microsecond, millisecond, second, minute, hour
fixed day and fixed week. A fixed day is exactly 86,400 seconds and a fixed
week is 604,800 seconds. Each input text is
limited to 128 bytes. Arithmetic is exact and refuses out-of-range results.

Deadline arithmetic adds an elapsed span to a CONTRACT-065 instant. It
returns signed 64-bit whole UTC seconds rounded toward negative infinity
and the fraction of the following second with trailing zeros removed. It
retains the anchor's sub-nanosecond precision. Ordering uses numeric whole
seconds followed by lexicographic ordering of canonical fraction digits.

## Precedence and compatibility

A consumer selects this profile explicitly. Arrow's elapsed duration also
carries a native physical width and unit. Conversion requires an explicit
mapping and retains the native representation.

## Error semantics

Malformed or out-of-bounds tokens fail. The exact deadline operation refuses
overflow. Calendar units require an explicit calendar and anchor profile.

## Examples

`PT2160H`, `P90D` and 90 fixed days express the same elapsed span. `P1M` and
`P1Y` are refused with a calendar-profile diagnostic. A native interval can
attach civil-day meaning to the same spelling.
