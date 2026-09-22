# SQL Server facet discovery checkpoint

This is native discovery under CONTRACT-031, CONTRACT-040, US-043 and TD-043.
It qualifies neither a public facet binding nor core admission or native equivalence.
The pinned SQL Server 2022 engine is 16.0.4295.3, running the existing isolated
Developer-edition image. The test database uses compatibility level 160 and
SQL_Latin1_General_CP1_CI_AS; character fixtures declare their own collations.

The fixture and Bun oracle exercise 86 probes, including 27 expected rejections,
and capture 37 columns through the existing catalog-v3 query. Values are returned
as exact decimal strings or hexadecimal bytes; JavaScript numeric conversion is
not used to compare large native integers or decimals. Both JSON/YAML envelope
forms recover the native catalog tree. This is not original capture-text or row
serialization qualification. The source DDL and database context remain attached.

## Native findings

- Tinyint has the unsigned eight-bit domain; smallint, int and bigint have signed
  16/32/64-bit domains. Additional CHECKs narrow example carriers. Integer input
  conversion can truncate a fraction, independently of the stored domain.
- Decimal(5,2) rounds 1.235 to 1.24 even with a truncation-style CHECK on the stored
  value. Precision/scale 38 boundaries remain exact in the captured strings.
  Alias types retain declared identity instead of becoming plain core decimals.
- Eight combinations of ANSI_WARNINGS, NUMERIC_ROUNDABORT and ARITHABORT distinguish
  rounding, rejection and NULL. Runtime settings must not be inferred from a type
  declaration or an apparently finite stored domain.
- Nvarchar(1) rejects an astral character; nvarchar(2) accepts it. Their catalog
  lengths are byte capacities, and the Unicode declarations count UTF-16 units.
  LEN counts the tested surrogate pair differently under SC and non-SC collations.
  It excludes trailing spaces. A sentinel expression counts those spaces but still
  accepts an isolated surrogate, so it does not prove a Unicode-scalar domain.
- Nvarchar retains NUL and an isolated surrogate as bytes. A legacy varchar
  conversion replaces the tested astral character with two question marks.
  A narrow collation conversion can produce an empty value where a wider one
  produces C3BF. Fixed character/binary padding and explicit truncation also remain
  native refinements. None of these observations authorizes a core length alias.
- Real and float(1) use the narrow floating carrier; float(25) and float(53) use the
  wider one. The mandatory 1.0000000000000002 probe narrows to 1 through real and
  remains distinguishable through float(53). NaN and infinity string conversions
  are refused in the tested SQL statements.
- An enabled untrusted CHECK retains an older violating row but rejects a new
  violation. Disabled checks and a custom always-true function admit violations.
  NOT FOR REPLICATION is retained; the probe covers an ordinary write, not a
  replication session. Filtered and disabled unique indexes admit the tested
  duplicate values and must not be promoted into ideal identity.

## Internal implementation and evidence

`src/adapters/sqlserver/facet-type.ts` is an internal native type decoder. It checks
coherent canonical system identity, alias/assembly flags, sizes and precision/scale.
It retains the full NativeJson fragment, distinguishes unsigned widths, decimal
pairs, native floating carriers, byte capacities, UTF-16 units and padding, and
rejects unsupported or inexact metadata. It does not inspect CHECK enforcement,
assert Unicode validity, classify core facets or certify exact input conversion.
It is not exported from the public package; the public bundle is unchanged.

Bun verification passes seven tests and 397 assertions, including existing catalog
and exact-integer regressions. Chromium checks all 37 columns: 34 observations,
three explicit refusals (alias, temporal and boolean), two catalog recoveries,
an unsafe numeric-token refusal and a getter guard. No host globals or external
requests are used. Typechecking passes. See the
[discovery record](../../../../fixtures/validation/facets-sqlserver-discovery-evidence.json).

Next: qualify bounded CHECK interpretation and selected value scopes, author the
public operation/package schemas, implement classification and authored projection,
verify both retained recovery directions, then run complete binding acceptance.
Prior accepted bindings retain their recorded evidence snapshots. This discovery
checkpoint does not close the SQL Server facet bead or the five-system facet gate.

## Bounded CHECK syntax checkpoint

An internal expression inspector now recognizes numeric bounds, LEN/DATALENGTH
bounds, the scoped trailing-space sentinel pattern, and ROUND truncation equality.
It retains the complete expression and exact decimal tokens. Recognition returns
only syntax candidates with an explicit requirement for catalog type, column
association, enforcement and collation evidence. It does not assert core facets.

The captured native corpus contains ten recognized expressions and one refused
custom function. Three recognized expressions belong to disabled, untrusted or
replication-specific checks. Their syntax provides no unconditional guarantee.
Unsupported conjuncts refuse the entire expression; OR, casts, collation overrides,
qualified/custom functions, case-mismatched columns, malformed syntax and resource
limit violations retain their native text without partial interpretation.

Seven targeted Bun tests pass with 545 assertions, including the prior discovery
tests. Typechecking passes. Chromium 148 verifies 75 expressions: 20 candidates,
55 refusals, retained text, invalid-identifier refusal and a getter guard, with no
host globals or external requests. Browser parity is not independent proof of
T-SQL acceptance. See the
[predicate checkpoint](../../../../fixtures/validation/facets-sqlserver-predicate-evidence.json).

Next: qualify candidates against catalog association, type, enforcement state and
collation; independently probe any additional accepted native expression shapes.
Then implement public schemas and both facet operations. The public package and
binding acceptance remain unchanged by this internal syntax checkpoint.

## Catalog CHECK interpretation checkpoint

The internal catalog interpreter validates the source document and exact catalog
integers, resolves the selected column within its captured table, and requires a
captured v3 profile at SQL Server 16.0.4295.3. Modified or other-version captures
retain their source but produce no interpreted type or CHECK facts. Column-level
CHECK association must match the selected native column ID; table-level association
remains an explicit residual pending its native qualification.

For supported direct noncomputed scalars, the interpreter recognizes integer
bounds, binary DATALENGTH byte bounds and a decimal ROUND equality at the native
scale. These are native facts, not authored facets. Decimal facts explicitly deny
input-exactness proof. String predicates remain residuals, including the captured
nvarchar DATALENGTH-zero check. No collation or Unicode meaning is inferred.

Disabled checks yield no enforced fact. Untrusted and NOT FOR REPLICATION checks
are limited to ordinary checked writes on non-null values; existing rows and
replication bypass do not inherit their bounds. Trusted enabled checks additionally
cover the observed stored non-null domain. These scope rules follow the
[Microsoft catalog definitions](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-check-constraints-transact-sql?view=sql-server-ver17)
and the pinned native probes. The interpreter does not authenticate a capture,
assert complete inventory, guarantee arbitrary bulk/replication writes, or infer
nullability. Complete native CHECK and column payloads remain attached.

Twelve targeted Bun tests pass with 711 assertions; typechecking passes. Chromium
148 checks all 37 columns, yielding six interpreted CHECKs and five residuals,
including two interpretations limited to ordinary checked writes. Source content
is unchanged; other-version captures and getters are rejected without host globals
or external requests. The prior independent native probes remain the behavioral
evidence; no new SQL Server run is claimed at this checkpoint. See the
[catalog interpretation record](../../../../fixtures/validation/facets-sqlserver-constraints-evidence.json).

Next: public classification/projection schemas and API implementation, broader
native qualification for emitted targets and table-level CHECKs, retained recovery,
and full binding acceptance. SQL Server facet delivery remains in progress.

## Experimental public classification checkpoint

The public `classifySqlServerFacets` API, operation schema and
`umf.sqlserver.facets` package now expose profile-qualified facet observations on
an explicitly selected logical scalar Field in core 0.5.0. Physical columns remain
unchanged. Integer carrier/CHECK intersections must form canonical width domains;
SQL Server decimal coefficients supply precision/scale, and binary capacities and
supported predicates supply byte bounds. Padding, character semantics, unsupported
constraints/types and unknown native content remain explicit residuals. Exact-input
requests retain the float-narrowing and pre-CHECK decimal-rounding counterexamples.

Strict mode blocks on residuals. Report mode preserves them beside inferred facets
and complete native content. Author conflicts, bare facets without provenance,
logical-shape conflicts and existing bindings block both modes. Verified receipts
recover original native catalog text, including whitespace and exact number tokens,
through JSON and YAML serialization. Changed targets or forged receipts refuse
recovery. Capture authenticity and complete native inventory remain unverified.

Validation passes 67 tests / 5,213 assertions across 20 files, covering catalog,
Field, record, Nullability, Cardinality, core facet and new classification behavior.
Typechecking passes; 270 JSON Schemas and 45 extension packages pass their audits.
Chromium 148 checks the exported 10,921,873-byte browser bundle in 48 cases:
41 classified, seven blocked and 82 original-native-text recoveries, with forged
receipt/getter guards and no host globals or external requests. See the
[classification record](../../../../fixtures/validation/facets-sqlserver-classification-evidence.json).
The independent native discovery corpus is reused; no additional engine run is
claimed here. Single-table case captures retain complete selected tables; a
separate test retains unknown root data and exact large numeric tokens.

Authored projection/schema, additional emitted-target and table-level CHECK native
qualification, ideal recovery and full binding acceptance remain required. Prior
accepted binding gates retain their historical snapshots; the changed public
bundle has not undergone the final full compatibility refresh. This checkpoint
does not admit the facet ideal or graduate native equivalence.

## Authored projection checkpoint

The public authored projector and closed operation schema now emit nullable
single-column DDL from verified facet/Field declarations, with explicit native
carrier, encoding, strict/report mode and value-domain/exact-input obligation.
Matching integer domains and checked narrower ranges, decimal precision/scale,
and binary byte limits are represented. Character units, Unicode validity, code
pages, padding, scalar-family changes and conversion losses remain residuals.
Unknown ideal metadata remains in the receipt. A native-only import cannot
reconstruct authored provenance; verified receipt recovery restores the full ideal.

Independent SQL Server 2022 16.0.4295.3 execution accepts all 145 emitted targets
from 238 authored cases; 93 are blocked before DDL emission. All 27 value probes
pass, including ten expected rejections. Boundary probes cover checked integers,
127-bit signed values carried in decimal, precision-38 decimals, byte limits,
zero-length strings, supplementary characters and trailing spaces. Native evidence
preserves rounding before CHECK, binary64-to-binary32 narrowing, malformed Unicode
acceptance and modifier truncation errors. A bracket-containing table identifier
and quoted/multiline Unicode description round-trip through catalog capture.
Both catalog serialization recoveries and 145 ideal receipt recoveries pass.

Chromium 148 verifies the exported 10,946,624-byte bundle across all 238 cases,
with 290 ideal recoveries, changed-SQL refusal and getter protection. No host
globals or external requests are used. Combined Bun validation passes 45 tests /
2,723 assertions across 14 files, typechecking, 271 schemas and 45 packages. See
the [projection record](../../../../fixtures/validation/facets-sqlserver-projection-evidence.json).

Next: compose emitted native catalog capture with classification and account for
native inference versus retained author intent, including explicit residuals.
Table-level association and full compatibility/binding acceptance remain required.
This checkpoint does not complete SQL Server facet delivery or the facet ideal
gate, and does not claim native equivalence. Earlier binding gates retain their
historical evidence snapshots until the full refresh.

## Primary reference material

The native fixture is the qualification evidence. These Microsoft references
explain the distinctions and guided the probes; they do not substitute for them.

- [Integer domains and conversion](https://learn.microsoft.com/en-us/sql/t-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql?view=sql-server-ver16)
- [Decimal precision, scale and conversion](https://learn.microsoft.com/en-us/sql/t-sql/data-types/decimal-and-numeric-transact-sql?view=sql-server-ver16)
- [NUMERIC_ROUNDABORT](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-numeric-roundabort-transact-sql?view=sql-server-ver17)
- [ARITHABORT and ANSI_WARNINGS](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-arithabort-transact-sql?view=sql-server-ver17)
- [LEN and supplementary characters](https://learn.microsoft.com/en-us/sql/t-sql/functions/len-transact-sql?view=sql-server-ver16)
- [Native floating types](https://learn.microsoft.com/en-us/sql/t-sql/data-types/float-and-real-transact-sql?view=sql-server-ver16)
- [CHECK state and collation dependency](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-check-constraints-transact-sql?view=sql-server-ver16)
