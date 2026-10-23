# Optional SQL containment

`umf_access.lifecycle.sql_containment.check_sql_containment` checks original
untrusted SQL without executing it. This implements the bounded U6 syntax gate
in CONTRACT-081. The host still owns source verification, native catalog and
privilege checks, review, trusted approval, connections and execution. The result
always has `executionAuthorized: false`; a successful result also explicitly
has `nativeCatalogVerified: false`.

Install the optional administrative extra from the selected immutable release
cohort, `umf_access[sql-containment]`. It selects `pglast==7.20`, whose parser
reports PostgreSQL AST version 170007. The default runtime and generated
application packages do not need this parser. Importing the checker or parser
adapter does not load pglast; an explicit check loads it. A missing or different
parser version refuses. The external pglast distribution declares GPL-3.0-or-later;
retain its own source/license notices when distributing that optional dependency.
It is not vendored or relicensed as UMF. See the
[pglast source](https://github.com/lelit/pglast/tree/v7.20) and its
[parser documentation](https://pglast.readthedocs.io/en/v7/parser.html).

The host supplies a closed policy, independently of the SQL author:

```json
{
  "profile": "umf.sql-containment/0.1",
  "schema": "tenant",
  "tables": ["person", "team"],
  "indexes": ["person_name"],
  "roles": ["reader"]
}
```

Names identify an exact, case-sensitive inventory, including tables intentionally
being created. Ordinary relations must be explicitly schema-qualified. An
unqualified name is admitted only for an already checked local read-only CTE.
The host must establish the native meaning of the inventory and verify its
catalog, owner, privileges, triggers, dependent objects and type/operator
resolution before execution. The checker cannot discover effects of an existing
trigger, a custom cast, an overloaded native operator, role membership or a
foreign dependency from SQL syntax. It records references for that host check.
Changing the inventory is a host decision, never an author approval marker.

```python
from umf_access.lifecycle.sql_containment import check_sql_containment
from umf_access.lifecycle.sql_containment_parser import PglastParser

result = check_sql_containment(
    "UPDATE tenant.person SET name = 'reviewed' WHERE name IS NULL;",
    policy,
    PglastParser(),
)
assert result["status"] == "checked"
assert result["executionAuthorized"] is False
```

`umf-sql-check --sql migration.sql --policy policy.json` exposes the same offline
operation. Exit zero means the selected syntax profile passed; exit one means it
refused. Its JSON retains exact input SQL, SHA-256, the pinned parser identity,
statement count and referenced tables, or a located diagnostic. Retained SQL
belongs in the host's chosen source/audit custody. The command has no DSN and
does not connect, apply, record approval or advance migration history.

The first profile admits ordinary CREATE TABLE columns, a closed ALTER TABLE
subset, btree indexes over named columns, table/column comments, explicit
table grants/revocations to inventoried roles, and ordinary SELECT/INSERT/UPDATE/
DELETE. It checks every statement, read-only CTE and supported derived SELECT;
data-modifying/recursive CTEs, set operations and unsupported subquery forms
refuse. CHECK/default expressions use the same closed expression vocabulary.
Named types must be canonical `pg_catalog` builtins; the parser normalizes
SQL aliases such as `integer` to that form. For example use `pg_catalog.text`
and `pg_catalog.uuid` explicitly. Comparisons require explicit
`OPERATOR(pg_catalog.>=)` or another admitted catalog comparison; search-path
operator lookup refuses. All function calls currently refuse, including catalog
calls, because syntax alone does not establish argument types or overloads.

Foreign schemas, schema/role/session changes, stored code, functions, procedures,
triggers, COPY, custom types/collations/access methods, external grants, grant
options, ambiguous names and unknown AST fields/nodes refuse. Strings, quoted
identifiers, dollar strings and comments are parsed by PostgreSQL; embedded text
does not become a second statement. Source is capped at 256 KiB, statements at
128, AST nodes at 20,000 and traversed node depth at 64. No unknown content is
removed to make a statement pass.

This optional handwritten-SQL gate does not admit raw SQL as a typed migration
backfill. Compiler-produced plans retain their source-regeneration, profile,
approval, prefix/native-witness and uncertain-outcome checks. Trusted runtime
setup statements have a separate host boundary and need not fit this author
syntax subset. Extending this profile requires new positive closure rules and
real-parser adversarial evidence; adding a token or regex match cannot authorize
a new PostgreSQL construct.
