# SQL Server physical binding DDL acceptance

This completes `umf-8606a941` under [CONTRACT-042](../../02-design/contracts/CONTRACT-042-physical-binding.md),
[CONTRACT-041](../../02-design/contracts/CONTRACT-041-relationship.md) and the
existing SQL Server table/index stages. It qualifies the
`ordinary-tables-json-text-relationships-indexes` subset against SQL Server
2022 **16.0.4295.3**. It does not claim complete database reconstruction, query
execution, relationship ideal admission or native equivalence.

`projectBindingToSqlServer` composes the existing ordinary DDD table/embedded
JSON and rowstore-index generators with an explicit SQL Server relationship
layout inventory. The supplied core 0.7.0 logical document and separate
`umf.binding` 0.2.0 document resolve stable relationship and Key IDs. Each bound
scalar column maps an exact core Field to its DDD field, owning Record, table,
column, SQL type, nullability and comparator. Named Keys must map their complete
ordered component tuples. No name-based endpoint inference or primary-key
fallback occurs. All members of a keyed association Record must remain present.

Generated DDL includes schema creation, complete declared table attributes,
`nvarchar(max)` JSON-object carriers, primary/alternate Key constraints,
existing-column FKs, keyed associations, anonymous pair-unique junctions and
bounded shared discriminator-edge tables. Bound association Records retain their
own Keys and all attributes; they do **not** gain endpoint-pair uniqueness merely
because they carry an association. Native probes preserve two different
association IDs and quantities for the same endpoints. Anonymous junctions and
edge discriminators instead have explicit pair identity. Shared edge layouts
must use the same endpoint Keys and physical tuple shapes; the discriminator
does not conditionally switch foreign-key targets.

FKs use enabled, checked NO ACTION constraints. They do not encode lifecycle
ownership. Maximum-one declarations may emit unique indexes, while participation
minima and higher finite bounds remain residual. Nullable composite native FKs
still allow partial-null bypass; the generated schema preserves the declared
column availability and reports the limitation. Inline relationship storage is
an explicit unsupported residual. Strict mode emits no candidate when these
losses remain; report mode emits only a complete qualified proposal.

Declared btree, unique and simple-comparison filtered rowstore indexes compose
with the generated table inventory, including INCLUDE columns. GIN, GiST and
document-path indexes remain individual residuals. Filtered expressions are
restricted, canonical, single-line SQL Server 2022 comparisons. Unsafe identifiers,
control characters, stale mappings, case-insensitive physical-name collisions,
unbounded Key components and oversized tuples refuse before a candidate is
returned. This conservative profile limits Keys and supported declared indexes
to sixteen columns and 900 declared key bytes. It reserves names more narrowly
than all native SQL Server configurations permit. Existing partitioned-Key
layouts require a separately qualified policy and remain blocked.

Finite SQL domains, string padding/collation, input coercions, DDD identity,
aggregate/invariant meaning, JSON-path obligations, unconsumed choices and
unknown logical content remain source-qualified residuals. Unknown physical
binding content blocks interpretation. Residual paths resolve within the named logical/binding/policy/native source;
`/` explicitly denotes the entire selected source. Mapping source paths resolve
within the complete receipt. The complete versioned receipt retains
logical document, physical binding, exact policy, generated SQL and optional
original native catalog text. Verification recomputes the receipt and compares
the current SQL before recovering authored sources or native text. Original
catalog recovery preserves unknown numeric lexemes and unrelated metadata; a
catalog snapshot is not authenticated live state and is not mutated by this API.

Seven shared-graph cases cover the keyed association/FK combination, alternate
UNIQUE target, nullable composite reference, anonymous junction, edge, shared
edge and inline residual. The isolated native oracle executes 78 probes and
recaptures columns, Keys, trusted/enabled FKs and all three supported indexes.
JSON arrays, dangling references, duplicate Keys/pairs and unknown edge labels
refuse where qualified. The browser harness checks the same generated receipts,
strict/report behavior, both serializations, authored/native recovery and stale
or forged receipt rejection without host globals or external requests.

Evidence is in [the native record](../../../../fixtures/binding/sqlserver/oracle.json),
[browser record](../../../../fixtures/binding/sqlserver/browser.json),
[focused tests](../../../../fixtures/binding/sqlserver/focused-tests.log) and
[binding regression](../../../../fixtures/binding/sqlserver/binding-regression.log).

Final acceptance passes 11 focused tests with 4,455 assertions and the complete
binding regression of 57 tests across 12 files with 4,708 assertions. Typecheck,
browser build, 58 extension-package audits and 337 schema audits pass. A parent
agent independently replayed the focused tests, typecheck, native oracle and
Chromium harness against the frozen implementation. The initial binding run
exceeded Bun's default five-second limit in the expanded adversarial test;
[that log](../../../../fixtures/binding/sqlserver/binding-regression-initial-timeout.log)
is retained. The completed run uses an explicit thirty-second test timeout.

[The acceptance manifest](../../../../fixtures/binding/sqlserver/acceptance-evidence.json)
records commands, counts and final evidence fingerprints.
