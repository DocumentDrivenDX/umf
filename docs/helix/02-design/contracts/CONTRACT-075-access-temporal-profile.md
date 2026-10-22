---
ddx:
  id: CONTRACT-075
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-028
      kind: informed_by
    - id: ADR-004
      kind: informed_by
    - id: CONTRACT-049
      kind: informed_by
    - id: CONTRACT-065
      kind: informed_by
    - id: CONTRACT-066
      kind: informed_by
    - id: CONTRACT-068
      kind: informed_by
    - id: CONTRACT-070
      kind: informed_by
---

# CONTRACT-075: Typed-access temporal validation profile

**Type:** library. **Version:** `umf-access-temporal/0.1.0`.
**Status:** draft; owner-selected scope, separately qualified implementation.

## Purpose

Define the explicitly selected temporal value oracle for CONTRACT-068 generated
Python validators and codecs. The owner's 2026-10-15 decision selects authored
`umf.access` instant/local meaning without assigning generic core temporal meaning.

## Scope and Boundaries

UMF owns this portable public semantic profile. CONTRACT-070 `temporal: instant`
or `temporal: local` selects the corresponding timestamp kind; a selected access
Field with core type `date` selects `date`. A bare core scalar label MUST NOT
select this profile. Ordinary CONTRACT-049 core Field/Record value validation
continues to refuse temporal values. Temporal Key components continue to refuse.
This contract defines standalone token validation and Python carrier agreement;
it does not replace schema admission, authored presence/constraints, binding
admission or selected assertion census. An unsupported selected refinement MUST
refuse generation rather than being bypassed by a successful token parse.
No SQL lowering, database codec, backend support or native equivalence is implied.

## Normative Surface

`ACCESS_TEMPORAL_PROFILE` is `umf-access-temporal/0.1.0`.
`parseAccessTemporal(kind, token)` is synchronous, deterministic and pure.
`kind` MUST be exactly `date`, `instant` or `local`; `token` MUST be a string.
Length MUST be checked before regex/calendar processing, with at most32 ASCII
characters. No host clock, Date parser, locale, timezone database or network
participates. Gregorian rules are those of CONTRACT-066.

| Kind | Accepted text | Meaning |
| --- | --- | --- |
| `date` | Exactly `YYYY-MM-DD`, year0001–9999 and valid Gregorian day | Civil date, no time/zone |
| `local` | `YYYY-MM-DDTHH:MM:SS` with optional `.` and1–6 ASCII fraction digits | Civil date-time, no offset |
| `instant` | Same date-time followed by `Z` or signed `HH:MM` | Absolute instant with explicitly known fixed offset |

Hours MUST be00–23; minutes/seconds00–59. Offset hours MUST be00–23 and
minutes00–59. `-00:00` MUST refuse because its unknown local offset cannot be
preserved by the selected Python aware datetime carrier. Leap seconds, year zero,
lowercase separators, spaces, trailing line terminators, non-ASCII digits,
alternate date forms, offset seconds and fractions longer than6 digits MUST
refuse. Even additional zero digits MUST refuse; callers MUST NOT truncate.
The instant grammar is a deliberately narrower subset of CONTRACT-065, whose
exact arithmetic and offset interpretation apply. UTC normalization MUST also
remain within years0001–9999; otherwise it refuses before publishing a result.

The immutable, JSON-safe discriminated result is `AccessTemporal`:

| Member | Applies to | Meaning |
| --- | --- | --- |
| `profile` | all | Exact profile string |
| `kind` | all | Selected kind |
| `originalText` | all | Complete unchanged token |
| `canonicalText` | all | Date unchanged; date-time with exactly6 fractional digits; instant normalized to UTC with `Z`; local has no suffix |
| `microsecond` | instant/local | Integer0–999999; right-pad admitted fraction to6 digits, no rounding |
| `utcSeconds` | instant | Canonical signed integer string of whole UTC seconds since1970-01-01T00:00:00Z, rounded toward negative infinity |
| `originalOffset` | instant | Unchanged admitted offset suffix |

Exported types are `AccessTemporalKind`, `AccessTemporal`, `AccessDate`,
`AccessLocal`, and `AccessInstant`. The function returns the union; the `kind`
discriminant narrows it. Canonical date-time strings are fixed width. This
contract does not introduce temporal ordering, equality or Key bytes into core.

### Python carrier agreement

The selected Python profile MUST use `datetime.date` excluding `datetime.datetime`
for date; naive `datetime.datetime` for local; and aware `datetime.datetime` with
an explicit fixed offset for instant. Carrier validation MUST preserve the input;
instant codec encoding MUST normalize UTC without changing microseconds, refusing
normalization beyond Python's year range. It MUST NOT attach a zone to naive
values, consult the host timezone, round precision or infer instant/local kind.
Dynamic timezone rules and timezone identity are outside this fixed-offset subset;
acceptance MUST NOT silently discard relevant zone/fold meaning.

The pinned Python carrier subset uses exact standard-library `date` and
`datetime` instances and `datetime.timezone` fixed-offset objects. Custom
`tzinfo` classes and date/datetime subclasses are outside this concrete carrier
profile and MUST refuse rather than being treated as qualified fixed-offset
implementations. This restriction does not narrow the admitted numeric fixed
offsets: every offset supported by `datetime.timezone` remains in scope.

Python fixed offsets MAY include seconds and microseconds (strictly less than24
hours in magnitude). Such a carrier MUST be normalized to UTC before producing
its canonical oracle token. This token grammar's minute-offset restriction MUST
NOT narrow that Python carrier subset. Python emits uppercase `T`/`Z`, six
fraction digits and four-digit padded years explicitly. Local fold information
MUST NOT be silently reinterpreted as an instant; codecs must refuse non-default
fold when its meaning cannot be retained by their carrier.

Shared golden acceptance compares a Python carrier's canonical token against
this profile, including exact canonical output. Invalid token fixtures test this
token grammar; they do not claim that Python's permissive string parser is an
admission boundary. Original source tokens remain recoverable in the oracle;
Python canonical encoding preserves value meaning, not arbitrary source spelling.
Non-temporal golden cases continue to use the ordinary core Field/Record APIs.

## Precedence and Compatibility

CONTRACT-049 remains unchanged. CONTRACT-065 retains arbitrary bounded fractional
precision and unknown-offset information; CONTRACT-066 retains its independent
civil-date operation semantics. This profile chooses a stricter Python-compatible
subset and MUST NOT weaken either helper. Admission uses exact version selection;
future grammar, precision, range or carrier changes require a new profile version.
Bindings and query targets require their own versioned qualification and may refuse
otherwise valid profile values. A helper pass does not discharge native obligations.

## Error Semantics

Non-string token input throws `TypeError`; unsupported kind, length, grammar,
calendar, clock, offset, precision or normalized range throws `RangeError`.
Messages identify the rule without source values. Failures publish no partial
result, do not permit fallback guessing, and authorize no retry. Python adapters
map failures to value-free `ValueError` diagnostics under CONTRACT-068.

## Examples

`parseAccessTemporal('instant', '2024-01-01T01:30:00.123456+01:30')` yields
`canonicalText: '2024-01-01T00:00:00.123456Z'`, `utcSeconds: '1704067200'`, and
`microsecond: 123456`, retaining the entire original token and `+01:30`.
`1969-12-31T23:59:59.5Z` canonicalizes to `.500000Z` with seconds`-1`.
`parseAccessTemporal('local', '2024-02-29T12:34:56.1')` yields
`2024-02-29T12:34:56.100000` with no timezone. `1900-02-29`, a seven-digit
fraction and `0001-01-01T00:00:00+00:01` refuse.

## Validation Checklist

- Bun and real Chromium execute the same selected-profile accept/refuse corpus.
- Calendar, precision, explicit offset/local distinctions, pre-epoch arithmetic,
  Python UTC range boundaries and original-text retention have counterexamples.
- Python fixed-offset and naive carriers require separately recorded agreement.
- Generic core temporal refusal and temporal Key refusal remain independently checked.
- Native/backend support remains UNTESTED until separately qualified.
