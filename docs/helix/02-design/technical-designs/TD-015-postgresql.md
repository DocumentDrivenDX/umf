---
ddx:
  id: TD-015
  type: technical-design
  activity: design
  status: draft
  authoring:
    home: repo
  links:
    - id: umf.architecture
      kind: informed_by
    - id: CONTRACT-015
      kind: informed_by
    - id: US-015
      kind: informed_by
---

# TD-015: PostgreSQL native parser boundary

Reuse core NativeJson and a supplied WASM backend. The original SQL archive stays separate
from the editable raw tree. Native parser results must survive the bounded JSON guard;
unsafe native numeric wrapper values cannot be silently accepted. SQL numeric literals
are native string tokens, preserving values beyond JavaScript number precision.

The chosen package @libpg-query/parser 17.6.10 supplies parsing and Protobuf-based native
deparsing; its actual parser reports 170004. The inspected libpg-query 18.1.5 package
reported 180004 but did not expose a deparser, so it was removed from dependencies. This
is a PostgreSQL 17.4 profile, not a claim to cover the latest PostgreSQL release.

Protobuf fromObject conversion ignores unknown fields. Export therefore compares the
complete incoming tree with codec output before invoking deparse. It then reparses emitted
SQL and compares ASTs while excluding native source-coordinate keys only. Conservative
rejection is preferable to an unreported deparser normalization. Unknown fields remain in
UMF and cannot be forced through native export. Caller source is never used as an implicit
fallback for edited trees.

The optional runtime is built separately with Bun and the pinned precompiled WASM. Browser
hosting supplies runtime.js plus libpg-query.wasm at the path resolved by the upstream loader
(currently relative to the page). No database connection or SQL execution is involved.
The browser test exercises actual WASM parsing/deparsing, exact numeric defaults and edits.

The pglast oracle checks original and regenerated SQL with its separate native C wrapper,
records PostgreSQL 17.7 explicitly, and verifies the targeted rename. It cannot establish
DDL execution or catalog semantics. Next work must inventory upstream corpora and native
AST types, then add database-backed catalog round trips and cross-system transforms; this
source/tree boundary is the beginning of that cycle, not its acceptance completion.

Typed AST evidence now pins upstream libpg_query 17-6.1.0's Protobuf descriptor.
The generator checks 1,665 field names, 71 enum inventories, and 4,560 individual
wire probes against the packaged codec before writing the schema. Probes use direct
message creation to check wire encoding independently of fromObject coercions. Empty
nested-message probes do not establish nested semantic equivalence. The descriptor
and codec hashes are recorded in native/postgresql/protobuf/schema-evidence.json.

The full plain-JSON schema is separately exported and lazily compiled in core; unknown
fields remain allowed for preservation. SQL export additionally requires this schema.
The native Boolean fromObject function shadows the JavaScript Boolean constructor and
loses its value. The optional runtime recursively constructs typed messages from the
verified schema, using Boolean.create for that message. Enclosing converters recognize
native message instances and preserve them. The codec itself is not mutated. The
complete input/output fidelity check remains mandatory, including for corrected messages.

Upstream deparse_tests.c is pinned with its license, commit and hashes. Extraction compiles
a small C reader so C string literals retain their exact meaning; no SQL splitting or
manual selection occurs. All 416 tests are included. Native and separate-wrapper AST
comparisons ignore only source coordinates, with every other difference blocking export.

The catalog oracle runs a digest-pinned postgres:17.4 container with network=none and
tmpfs storage. Readiness waits for the final postgres PID 1, avoiding the entrypoint's
temporary initialization server. Three databases isolate authored DDL, regenerated DDL
and a schema-only dump regenerated through UMF. The source snapshot is the comparison
baseline; the query identifies objects by qualified names rather than unstable OIDs.

Twenty-four behavior checks compare exact decimal/default/generated values, Unicode
SQL-function output, row filtering under a non-superuser role, and SQLSTATEs for invalid
domain values, missing references, invalid quantities, duplicate unique values and denied
inserts. The reader role is a local test prerequisite, not a claimed pg_dump role export.
Checks run after catalog comparisons and use transactions; sequence data state is outside
this schema evidence. The generated numeric result is checked at PostgreSQL's observed
9-place result scale, also calculated with Python Decimal for the fixture.

The PostgreSQL documentation separates single-database schema dumps from cluster globals
and identifies schema-only output as object definitions; those limits govern this test.
See [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) and
[system catalogs](https://www.postgresql.org/docs/17/catalogs.html). No general catalog
metamodel or cross-version dump support is inferred from this result.

The observed-catalog extension owns a separate NativeJson capture and schema. The generic
SQL adapter does not silently attach or synchronize catalog metadata. Its registry reports
unknown native fields, validates known fields, and keeps validation-only host conversion
out of native serialization. Exact unknown number tokens therefore survive both formats.

Catalog state appears in the representation and native capture and must agree. Candidate
edits set both to modified, including a replacement of the whole capture; native export
therefore cannot reset stale state on reimport. This is edit tracking, not an integrity
signature: externally authored captures may assert captured state and require independent
verification. The SQL accessor exposes only the original archive and never claims an
executable plan or metadata-to-DDL synthesis. Duplicate qualified observations are retained
but cannot yield a misleading single lookup result.

Snapshot v2 queries pg_trigger (excluding internal constraint triggers), standalone
composite pg_type/pg_attribute entries, pg_range and pg_collation. Native OID references
are rendered as qualified names or function signatures; range constructor functions
created by PostgreSQL remain visible in the existing function observations. V2 requires
the four additional sections, distinguishing missing coverage from an observed empty
result. The original v1 fixture tests compatibility rather than being regenerated as v2.

The server-authoritative semantics for the new fields are documented in PostgreSQL's
[pg_trigger](https://www.postgresql.org/docs/17/catalog-pg-trigger.html),
[pg_range](https://www.postgresql.org/docs/17/catalog-pg-range.html), and
[pg_collation](https://www.postgresql.org/docs/17/catalog-pg-collation.html). Collation
provider versions and trigger enabled modes remain native strings. Range subtype order
and canonical functions are not equated with JSON scalar ranges or core constraints.

The added fixture checks a PL/pgSQL trigger, composite-field access, range and multirange
containment, reversed-bound rejection, exact bigint sequence output and materialized-view
refresh. These checks run only in the disposable server; public inspection stays incomplete.

Snapshot v3 selects pg_depend rows by an explicit dependent-object inventory and resolves
both endpoints with pg_identify_object. Sorting the full JSON edge provides a stable
multiset comparison across fresh databases; duplicates remain present. The captured
fixture has 105 edges, including distinct pg_type and pg_class objects sharing the
identity sales.address. The public query therefore matches catalog, type and identity.

PostgreSQL documents dependency kinds as distinct drop semantics, and notes that pinned
built-ins omit dependency rows. See [pg_depend](https://www.postgresql.org/docs/17/catalog-pg-depend.html)
and [object identification functions](https://www.postgresql.org/docs/17/functions-info.html).
The profile preserves those observations without claiming a complete graph. Native
RESTRICT/CASCADE probes for a referenced composite type test server behavior in all
three databases; all changes are rolled back within the disposable oracle.

Read-row projection keeps a copied source capture and emits mappings/issues before any
target. Per-column bindings gate native type assumptions; bigint requires explicit text
encoding. Host conversion of captured metadata is used only to read known fields, while
the report preserves the exact NativeJson source. Values are produced by to_json on native
columns or their explicit text casts, then json_object_agg over a correlated VALUES list.
This avoids json_build_object's function-argument limit for wide tables. No identifier or
key is inserted as executable SQL syntax without quoting.

The target describes row representation, not accepted INSERT input. All selected keys
exist even when their values are null; omitted/defaulted/generated database fields are
not fabricated. Native JSON has a deliberately broad target shape and an explicit warning
about SQL-null/JSON-null ambiguity, duplicate keys and client number parsing. Session-
dependent native text is likewise reported rather than labeled as a portable format.
