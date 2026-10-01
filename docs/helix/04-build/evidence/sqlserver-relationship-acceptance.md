# SQL Server relationship binding acceptance

This delivers `umf-7e6ecaec` under [TD-045](../../02-design/technical-designs/TD-045-relationship.md),
[CONTRACT-041](../../02-design/contracts/CONTRACT-041-relationship.md) and
[CONTRACT-042](../../02-design/contracts/CONTRACT-042-physical-binding.md).
Qualification is SQL Server 2022 **16.0.4295.3**, tested in the pinned isolated
Docker image recorded in the native evidence. Relationship ideal admission,
all-five delivery and native equivalence remain separate gates.

The authored operation consumes a verified core 0.7.0 relationship declaration,
a separate `umf.binding` 0.2.0 document and explicit ordered Key/type/name policy.
Stable relationship and Key IDs resolve exactly. Only direct required boolean or
integral Key components are qualified (`bit`, `tinyint`, `smallint`, `int`,
`bigint`). Explicit source and target table names must agree with the supplied
binding. Primary Keys emit PRIMARY KEY; selected alternate Keys emit UNIQUE.
Native finite domains, input coercions, facets and unknown logical refinements
remain reported rather than claimed equal to an unbounded ideal.

The `new-key-tables` profile creates endpoint tables containing the selected Key
columns, then an FK tuple or separate junction. It expects the declared SQL
schema to exist; it does not alter existing tables or emit all Record attributes.
A required single-target FK uses NOT NULL; an optional composite tuple has an
all-null/all-present CHECK, closing native SQL Server's partial-null FK bypass.
Reverse max-one uses UNIQUE, filtered to present tuples for an optional FK.
A junction has source and target FKs plus endpoint-pair uniqueness and optional
max-one uniqueness. Separately keyed association Records refuse because dropping
their identity or attributes into a bare junction would lose meaning.

Native NO ACTION, CASCADE and optional-FK SET NULL are explicit physical choices.
They never establish logical lifecycle ownership. Self cascades and junction
cascade policies refuse. Heterogeneous endpoints, multi-target FK layouts,
unqualified scalar domains, incomplete tuples and physical name collisions
block atomically. Selected and unrelated binding choices remain in copied
source-qualified residuals; every unconsumed index has a separate residual.
Strict mode emits no target. Report mode produces complete qualified SQL and
retains all unmet obligations, including opposite-end minima and higher finite
bounds. Retained receipt verification recomputes the result before recovering
logical authoring, physical binding or emitted SQL.

Native classification keeps captured FK flags, ordered components, actions,
trust, disabled state and replication exceptions, along with complete catalog
text and unknown numeric lexemes. It correlates copied Fields and captured Key
tuples without authoring relationships. Catalog v3 does not expose `key_index_id`;
matching named Keys are tuple candidates, not a chosen stable Key identity.
Unequal captured type/collation refinements produce unknown enforcement and
unresolved classification. Captures are permission-limited, unauthenticated
snapshots. Empty, missing and unresolved inventories remain distinct.

The 50 strict/report cases emit twenty layouts and block thirty. The native
oracle executes 156 probes across all five advertised carriers, FK, composite,
self, alternate-Key and junction cases. It observes dangling-reference and
maximum-one rejection, duplicate pair rejection, required/optional behavior,
action behavior, partial-null bypass in an ordinary native FK, disabled-constraint
bypass and rejection of new violations by an enabled untrusted FK. Additional
junction rows demonstrate that minimum participation and a bound greater than
one are not enforced. Every emitted FK is recaptured with its actual tuple,
actions and enabled/trusted flags checked.

Chromium reproduces all fifty cases, forty recoveries each for ideal, binding
and generated SQL, two exact catalog recoveries and forty-one forged/stale
refusals. Host globals and external requests are excluded. Both native and
browser records include source fingerprints. The focused suite also checks
unknown content, stale metadata, input accessors, identifier edge cases and
synthetic type/collation contradictions.

Evidence: [native](../../../../fixtures/validation/relationship-sqlserver-native.json),
[browser](../../../../fixtures/validation/relationship-sqlserver-browser.json),
[focused tests](../../../../fixtures/validation/relationship-sqlserver-focused.log),
[SQL Server regression](../../../../fixtures/validation/relationship-sqlserver-regression.log).
Final validation passes 54 focused tests / 360 assertions, 156 SQL Server tests
across 20 files / 7,341 assertions, and 46 binding tests across 11 files / 253
assertions. Typechecking, browser build and local audits of 332 schemas and 58
packages pass. Broader physical-table/index/association generation remains on its
own work item.
