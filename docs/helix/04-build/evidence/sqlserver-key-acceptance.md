# SQL Server Key binding acceptance

The SQL Server task under [TD-044](../../02-design/technical-designs/TD-044-core-key.md)
and [CONTRACT-040](../../02-design/contracts/CONTRACT-040-core-ideals.md) passes
qualified binding acceptance for SQL Server 2022 **16.0.4295.3**. This covers the
SQL Server portions of [US-044](../../01-frame/user-stories/US-044-core-key.md)
AC2–7, AC11 and AC13. Avro, Parquet and the separate Key admission/all-five gate
remain open. No native equivalence is established.

## Native observations and recovery

`classifySqlServerKeys` correlates captured v3 catalog constraints with their
ordered index columns, flags and Field identities. It distinguishes unconditional
non-null uniqueness from filtered, nullable, disabled, non-unique and unknown
observations. Native indexes never create authored core keys. INCLUDE columns
are not tuple components; computed columns retain unknown authored meaning.

A fresh discovery run checks 37 native probes, including 18 refusals and 25
index/heap observations. Filtered and disabled unique indexes admit duplicate
rows. Nullable uniqueness, IGNORE_DUP_KEY skipping, string trailing-space padding,
binary trailing-zero padding and decimal rounding remain counterexamples. Direct
native string/binary comparison cannot claim the core comparator.

Report classification retains original catalog text and unknown extension content,
including numeric lexemes. Strict mode blocks unexpressed obligations. Recovery
checks the receipt and current target before returning the exact native archive.
Contradictory flags, missing constraint/column correlations, component order gaps,
unsupported versions, forged receipts and stale targets refuse. Capture consistency
does not authenticate origin or prove current deployed state.

## Authored constraints and recovery

`projectKeysToSqlServer` consumes core 0.6.0 explicit Record membership and verified
key declarations. Stable key IDs bind explicitly to native constraint names;
every owned Field has an explicit physical column mapping. Verified key renames
and key-list reorder preserve identity. Altered components or ownership do not.
Each key retains a separate outcome and residual.

Projection creates an ordinary table in an existing namespace, with at most one
PRIMARY KEY and separate alternate UNIQUE constraints, all NONCLUSTERED with
IGNORE_DUP_KEY disabled and required components. String/binary components use
explicit persisted binary-plus-length computed columns. This distinguishes
trailing spaces and trailing zero bytes without importing collation equality into
core. Generated helper columns do not become logical Record members.

The receipt records all seven required session options. The generated DDL sets
them; future writes must also satisfy them. Size bounds, Unicode validity, input
rounding/coercion, deployment names and unprojected metadata remain outside the
stored-value equality claim. Report mode retains complete authored source and
path-qualified residuals. Strict mode blocks loss without emitting partial SQL.
Unknown selected key/component/member/facet qualifiers make equality unknown.

`recoverKeysSqlServerIdeal` recomputes the receipt and checks the supplied SQL
representation before restoring the complete ideal. It establishes consistency,
not provenance authentication or a guarantee that the SQL is currently deployed.

## Evidence and limits

The generated-DDL oracle executes 26 cases: 19 native tables and seven explicit
blocks. **73 write probes** test requiredness, duplicate refusal, updates, width
and length constraints, padding distinctions, rounding and session preconditions.
The catalog independently verifies all **39 constraints**, their ordered physical
components, primary/alternate status and unconditional enforcement.

Boundary probes store and reject duplicates at 900 bytes for primary keys and
1,700 bytes for alternate keys. Above-budget projections block. Bun also exercises
the 32/33-component boundary, missing/cross-record membership, malformed bindings,
unknown component qualifiers and retained recovery. Earlier encoding discovery
checks 73 native probes, 19 exact byte vectors and eight computed-column properties;
its fingerprinted evidence retains its own execution scope.

Chromium verifies 25 native observations, two exact native-source recoveries,
strict blocks and eight refusals. The authored browser harness agrees on all
26 cases, with 38 JSON/YAML ideal recoveries and 38 altered-receipt refusals.
Both harnesses prohibit external requests and require no Bun/Node globals.

The [acceptance record](../../../../fixtures/validation/key-sqlserver-acceptance-evidence.json)
records scoped regression counts and fingerprints. Its
[command record](../../../../fixtures/validation/key-sqlserver-compatibility-command.json)
selects all SQL Server-named tests and core tests explicitly. Typechecking, the
public browser build and 300-schema / 51-package audits pass. This is not a full
repository regression or a refresh of earlier all-system admission gates.

Reproduce native checks with `bun scripts/core-ideals/key-sqlserver-discovery.ts`
and `bun scripts/core-ideals/key-sqlserver-oracle.ts`. Run the classification and
projection browser scripts with `UMF_CHROMIUM_PATH` set to an installed Chromium.
The acceptance record lists the commands and the unresolved global gates.
