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
