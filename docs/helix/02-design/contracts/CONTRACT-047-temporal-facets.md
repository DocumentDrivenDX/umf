---
ddx:
  id: CONTRACT-047
  type: contract
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: FEAT-005
      kind: informed_by
    - id: US-052
      kind: informed_by
    - id: CONTRACT-001
      kind: informed_by
    - id: CONTRACT-040
      kind: informed_by
    - id: umf.architecture
      kind: informed_by
---

# CONTRACT-047: Temporal facet proposal

**Type:** schema/library. **Status:** design proposal, unplaced by owner; no
core schema, implementation, or admission claim. **Version:** to be assigned
only after the existing ordered gate and the admission decision.

## Purpose and decision boundary

The `time` and `timestamp` scalar families in CONTRACT-001 identify broad
families, not UTC handling, fractional resolution or original-offset retention.
This contract proposes author-stated temporal facets as a **candidate core
ideal** because PostgreSQL and SQL Server each have independently typed civil
and offset/instant carriers, while Avro and Parquet also expose checked
instant/civil distinctions. It is not admitted until FR-3's written meaning,
counterexamples, useful down-projections to at least two priority systems and
up-classification retaining native detail are demonstrated. If that gate fails,
the shape MUST be published as a versioned `umf.*` extension with the same
fidelity reports. All-five delivery and FR-28 native equivalence are separate.

UMF describes values and projections. It does not choose timezone databases,
execute conversions, compare rows, validate stored data or infer business
rules. Temporal Key equality and canonical encoding remain blocked under
CONTRACT-040 until decided independently.

## Proposed normative meaning

The proposed authoring location is `Field.facets.temporal`, conditional on a
future versioned core revision. The names and exact serialized shape remain
open until the admission gate; the following semantics govern the proposal and
its fixtures. Its absence makes **no** temporal claim beyond `scalarType`.

| Obligation | Candidate values | Meaning |
| --- | --- | --- |
| `basis` for `timestamp` | `instant`, `civil` | `instant` denotes a point on a global timeline, independent of display zone. `civil` denotes calendar date and wall-clock fields with no intrinsic instant. Neither names a timezone. |
| `basis` for `time` | `civil`, `utc-adjusted`, `offset-bearing` | `civil` is a clock reading with no zone. `utc-adjusted` is a clock reading normalized by an offset modulo one day, without a date; it is **not** an instant. `offset-bearing` retains a clock reading and its numeric offset without identifying a unique instant. |
| `fractionalSecondDigits` | integer 0–9 | Values are on a 10^-p second grid and retain p fractional digits of precision. A target that rounds, truncates, or accepts finer values without an enforcing profile is not exact. This is value precision, not text formatting, physical width, or a guarantee of native range. |
| `originalOffset` | `not-required`, `part-of-value` | `part-of-value` requires the original numeric UTC offset to remain recoverable with each value. It is allowed only for `timestamp/instant` or `time/offset-bearing`; it does not require an IANA zone ID. `not-required` makes no claim that an offset was or was not supplied. |

`timestamp/civil` and `time/civil` MUST NOT require an original offset in this
initial shape; a need to retain a zone annotation on civil values is an open
vocabulary question. `time/utc-adjusted` MUST NOT be called an instant because
it has no date; `time/offset-bearing` MUST retain both local clock and offset.
The proposal does **not** define equality, ordering, leap-second handling,
calendar limits, timezone conversion, display text or treatment of ambiguous
local times. A projection may claim exact facet representation only when its
selected native profile carries every declared obligation without silent
rounding or inferred timezone/session assumptions. Extra native detail remains
in the extension archive.

The facet is authored only when explicitly present in an authored model.
Native import may classify a `basis`, precision or offset behavior, but MUST
label it observed with source/version and preserve original type spelling,
parameters, defaults, collation/session qualifiers, text or bytes, and unknown
fields. Classification MUST NOT invent author intent. A classified assertion
that disagrees with an authored facet is diagnosed and retained separately.

## Qualified priority-system bindings

These are **design obligations**, not certified implementation results. Every
future implementation MUST pin adapter and native-oracle versions and use
strict/report outcomes per declared obligation. Links below are primary source
specifications; pinned UMF oracle evidence remains to be produced.

| Target | Candidate carrier and exactness boundary | Required residual/native detail |
| --- | --- | --- |
| [PostgreSQL 17](https://www.postgresql.org/docs/17/datatype-datetime.html) | `timestamp(p)` carries civil timestamp; `timestamptz(p)` carries an instant; `time(p)` carries civil time. `p` is 0–6 fractional digits. | `timestamptz` converts to UTC and loses the original offset, so `part-of-value` is residual. `time with time zone` stores a clock and offset, but has no date and its zone-name/DST interpretation needs qualification. Session `TimeZone`, implicit parsing and conversion MUST NOT be used to claim exactness. Infinity and ranges remain native. |
| [SQL Server datetime2](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetime2-transact-sql?view=sql-server-ver16), [datetimeoffset](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetimeoffset-transact-sql?view=sql-server-ver16), [datetime](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetime-transact-sql?view=sql-server-ver16) | `datetime2(p)` carries civil timestamp; `datetimeoffset(p)` carries instant plus retained numeric offset; both allow p=0–7. `time(p)` needs a separately checked civil-time profile. | `datetimeoffset` native comparison/indexing uses UTC despite offset retention; do not infer UMF equality. Legacy `datetime` rounds to stepped .000/.003/.007-second increments and is not millisecond-exact. Type range, precision, offset bounds and conversion behavior remain native. |
| [Avro 1.12.0](https://avro.apache.org/docs/1.12.0/specification/#logical-types) | `timestamp-millis/micros` carry instants at p=3/6; `local-timestamp-millis/micros` carry civil timestamps at p=3/6; `time-millis/micros` carry civil time at p=3/6. The 1.12.0 spec also lists nanos; any implementation claim needs a matching pinned runtime oracle. | Instant types do not recover original offset. No standard offset-bearing time or UTC-adjusted time carrier is assumed. Unknown logical types and custom attributes remain native. Precision finer/coarser than selected unit is residual without a checked conversion or enforcement profile. |
| [Parquet logical types](https://github.com/apache/parquet-format/blob/master/LogicalTypes.md) | `TIMESTAMP(isAdjustedToUTC=true/false, unit=MILLIS/MICROS/NANOS)` distinguishes instant/civil at p=3/6/9. `TIME(..., unit=...)` distinguishes UTC-adjusted/civil clock-time under a qualified profile; legacy annotations require separate handling. | An adjusted timestamp loses original offset. `TIME` still has no date and cannot become an instant. Preserve physical carrier, converted/logical annotation conflicts, field IDs, unit, unknown units, page/file bytes and native ranges. A legacy `INT96` or unlabeled timestamp is not silently classified. |
| TableSpec [pinned source snapshot](../../../../native/tablespec/sources.json) | `DATETIME` and `TIMESTAMP` both map to Spark `TimestampType` in the captured mapping. Both labels classify only the broad timestamp family. | The captured labels and mapping do not establish distinct civil/instant semantics, precision or original-offset retention. Require an independently checked runtime profile for any exact facet claim; otherwise report/refuse these obligations while retaining original TableSpec content. |

For PostgreSQL, SQL Server, Avro and Parquet, the candidate correspondence is
between specified native **types** and authored facet dimensions; it is not a
claim that the database or file enforces all UMF value requirements. For
example, a wider target unit accepts values outside an authored grid unless a
checked restriction exists. TableSpec is an explicit negative control: the
name `DATETIME` alone cannot prove civil meaning.

## Projection, recovery and precedence

Each operation MUST retain copied authored source, source path, chosen native
profile, native archive, diagnostics, per-obligation outcomes (`exact`,
`approximated`, `not-expressible`, `unknown`) and residuals. `strict` MUST block
any non-exact requested obligation with no partial candidate. `report` MAY
emit a complete valid candidate only with each loss attached to retained
source; if safety or target validity is unknown it blocks. Exact declarations
MUST be supported by matching native evidence, not by a shared label.

Ideal → native → ideal MUST recover the authored facet from its retained
receipt or explicitly enumerate the unrecovered obligations. Native → ideal →
native MUST recover every original native byte or token outside the ideal's
claim, including unknown extension content. Native-only reimport is observed
classification and cannot recreate an authored declaration. A direct value
conversion is outside scope; all native type parameters and coercion rules
remain separately recorded.

Legacy documents without a temporal facet remain valid and assert none.
Migration into any later reserved core member MUST distinguish preexisting
unknown content at the same path; collision blocks interpretation or moves it
through an explicit lossless versioned transition. Rollback MUST restore that
content and the prior envelope exactly. No extension payload is removed by
promotion; FR-28 requires a separate equivalence decision.

## Permanent counterexamples and open decisions

- `2024-01-01 12:00` as a civil timestamp is not the same assertion as an
  instant rendered at 12:00 in one zone. No session timezone can fill the gap.
- PostgreSQL `timestamptz` and Avro/Parquet adjusted timestamps do not retain
  the original supplied offset; SQL Server `datetimeoffset` does.
- `time with time zone` and Parquet UTC-adjusted `TIME` lack a date and cannot
  identify a single instant across daylight-saving transitions.
- SQL Server legacy `datetime` stepped rounding and PostgreSQL p≤6 make a
  seven-digit authored resolution non-exact; Parquet's unit alone does not
  prove arbitrary p values.
- TableSpec `DATETIME` and `TIMESTAMP` mapping to the same Spark type cannot
  settle their semantic distinction.

Open decisions for the owner and later TD: (1) place this slice relative to
the existing key/relationship gate; (2) finalize serialized names and whether
`originalOffset: part-of-value` needs a dedicated composite value profile;
(3) qualify UTC-adjusted `TIME` against native oracles without implying a date;
(4) define or deliberately decline temporal equality/canonical encoding for
Key in a separate contract; (5) set calendar/range/leap-second scope before
any exact cross-system conversion claim. None is silently defaulted here.
