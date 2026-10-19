# SPDX-License-Identifier: MIT OR Apache-2.0
"""Source-derived PG18 catalog checks within a caller-owned install transaction.

The verifier checks relation/column shape, defaults, constraints, indexes and
policies. It cannot authorize data execution: ACL and transitive role closure
remain separate gates. Expected shape always comes from recompiled source.
"""
from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, cast
from uuid import uuid4


class CatalogError(RuntimeError):
    """Fixed administrative failure reason, without native diagnostics or data."""


def _q(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _cursor(connection: Any) -> Any:
    from psycopg.rows import tuple_row

    return connection.cursor(row_factory=tuple_row)


def _one(connection: Any, statement: str, parameters: tuple[Any, ...] = ()) -> Any:
    with _cursor(connection) as cursor:
        # No parameters means no DBAPI percent interpretation for compiler SQL.
        cursor.execute(statement, parameters) if parameters else cursor.execute(statement)
        return cursor.fetchone()


def _execute(connection: Any, statement: str, parameters: tuple[Any, ...] = ()) -> None:
    with _cursor(connection) as cursor:
        cursor.execute(statement, parameters) if parameters else cursor.execute(statement)


_COLUMNS = """SELECT a.attname,tn.nspname,t.typname,a.atttypmod,NOT a.attnotnull,
CASE WHEN a.attcollation=0 THEN NULL ELSE cn.nspname||'.'||co.collname END,
a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid)
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE n.nspname=%s AND c.relname=%s AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum"""

_POLICY = """SELECT p.polcmd,p.polpermissive,p.polroles,
pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),
ARRAY(SELECT d.refclassid::pg_catalog.text||':'||d.refobjid::pg_catalog.text||':'||
d.refobjsubid::pg_catalog.text||':'||d.deptype::pg_catalog.text FROM pg_catalog.pg_depend d
WHERE d.classid='pg_catalog.pg_policy'::pg_catalog.regclass AND d.objid=p.oid
ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype)
FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname=%s AND c.relname=%s AND p.polname=%s"""

_CONSTRAINTS = """SELECT co.conname,co.contype,pg_catalog.pg_get_constraintdef(co.oid,true),
ARRAY(SELECT a.attname FROM pg_catalog.unnest(co.conkey) WITH ORDINALITY k(num,ord)
JOIN pg_catalog.pg_attribute a ON a.attrelid=co.conrelid AND a.attnum=k.num ORDER BY k.ord),
co.condeferrable,co.condeferred,co.convalidated,co.conenforced,co.connoinherit,co.conperiod,
ix.relname,co.conpfeqop,co.conppeqop,co.conffeqop
FROM pg_catalog.pg_constraint co JOIN pg_catalog.pg_class c ON c.oid=co.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_catalog.pg_class ix ON ix.oid=co.conindid
WHERE n.nspname=%s AND c.relname=%s ORDER BY co.conname"""

_INDEXES = """SELECT ic.relname,i.indnatts,i.indnkeyatts,i.indisunique,i.indisprimary,
i.indisexclusion,i.indimmediate,i.indisvalid,i.indcheckxmin,i.indisready,i.indislive,
i.indisreplident,i.indnullsnotdistinct,
ARRAY(SELECT a.attname FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[]) WITH ORDINALITY k(num,ord)
LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num ORDER BY k.ord),
i.indclass::pg_catalog.oid[],i.indcollation::pg_catalog.oid[],i.indoption::pg_catalog.int2[],
pg_catalog.pg_get_expr(i.indexprs,i.indrelid),pg_catalog.pg_get_expr(i.indpred,i.indrelid),am.amname,am.amhandler
FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid JOIN pg_catalog.pg_am am ON am.oid=ic.relam
WHERE n.nspname=%s AND c.relname=%s ORDER BY ic.relname"""


def _all(connection: Any, statement: str, parameters: tuple[Any, ...]) -> list[tuple[Any, ...]]:
    with _cursor(connection) as cursor:
        cursor.execute(statement, parameters)
        return cast(list[tuple[Any, ...]], cursor.fetchall())


def _constraint_shapes(connection: Any, schema: str, table: str, aliases: dict[str, str]) -> dict[Any, Any]:
    result = {}
    for row in _all(connection, _CONSTRAINTS, (schema, table)):
        name, kind, definition, columns, *metadata = row
        name = aliases.get(name, name)
        identity = ("not-null", tuple(columns)) if kind == "n" else ("named", name)
        if identity in result:
            raise CatalogError("catalog-mismatch")
        metadata[6] = aliases.get(metadata[6], metadata[6])
        result[identity] = (kind, definition, columns, *metadata)
    return result


def _index_shapes(connection: Any, schema: str, table: str, aliases: dict[str, str]) -> dict[str, Any]:
    return {aliases.get(row[0], row[0]): row[1:] for row in _all(connection, _INDEXES, (schema, table))}


def _columns(connection: Any, schema: str, table: str) -> list[tuple[Any, ...]]:
    with _cursor(connection) as cursor:
        cursor.execute(_COLUMNS, (schema, table))
        return cast(list[tuple[Any, ...]], cursor.fetchall())


def _verify_table_shape(connection: Any, bundle: dict[str, Any], table: dict[str, Any]) -> None:
    schema = bundle["configuration"]["schema"]
    expected = [c for c in bundle["expectedCatalog"]["columns"] if c["table"] == table["id"]]
    rows = _columns(connection, schema, table["name"])
    if len(rows) != len(expected):
        raise CatalogError("catalog-mismatch")
    for column, row in zip(expected, rows, strict=True):
        shape = (column["name"], column["typeSchema"], column["typeName"], column["typeMod"],
                 column["nullable"], "pg_catalog.C" if column["collation"] == "C" else None,
                 column["identity"], "")
        if tuple(row[:8]) != shape:
            raise CatalogError("catalog-mismatch")
    # Reparse original column declarations on a fresh private-schema relation.
    # No permanent column or dropped-attribute tombstone is added to real tables.
    temporary = "umf_verify_" + uuid4().hex
    relation = _q(schema) + "." + _q(temporary)
    definitions = [c["definitionSql"] for c in expected]
    catalog = bundle["expectedCatalog"]
    aliases = {}
    for key in [key for key in catalog["keys"] if key["table"] == table["id"]]:
        prefix = "CONSTRAINT " + _q(key["name"]) + " "
        if not key["definitionSql"].startswith(prefix):
            raise CatalogError("source-mismatch")
        name = "umf_verify_" + uuid4().hex
        aliases[name] = key["name"]
        definitions.append("CONSTRAINT " + _q(name) + " " + key["definitionSql"][len(prefix):])
    definitions.extend(c["definitionSql"] for c in catalog["checks"] if c["table"] == table["id"])
    _execute(connection, "CREATE TABLE " + relation + " (" + ", ".join(definitions) + ")")
    reference = _columns(connection, schema, temporary)
    if rows != reference:
        raise CatalogError("catalog-mismatch")
    for fk in [fk for fk in catalog["foreignKeys"] if fk["table"] == table["id"]]:
        _execute(connection, "ALTER TABLE " + relation + " ADD " + fk["definitionSql"])
        actual = _one(connection, """SELECT ix.relname FROM pg_catalog.pg_constraint co
JOIN pg_catalog.pg_class c ON c.oid=co.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_class ix ON ix.oid=co.conindid WHERE n.nspname=%s AND c.relname=%s AND co.conname=%s""", (schema, table["name"], fk["name"]))
        if actual != (fk["targetKey"],):
            raise CatalogError("catalog-mismatch")
    for index in [index for index in catalog["indexes"] if index["table"] == table["id"]]:
        name = "umf_verify_" + uuid4().hex
        aliases[name] = index["name"]
        _execute(connection, "CREATE " + ("UNIQUE " if index["unique"] else "") + "INDEX " + _q(name) + " ON " + relation + " " + index["definitionSql"])
    if _constraint_shapes(connection, schema, table["name"], {}) != _constraint_shapes(connection, schema, temporary, aliases):
        raise CatalogError("catalog-mismatch")
    if _index_shapes(connection, schema, table["name"], {}) != _index_shapes(connection, schema, temporary, aliases):
        raise CatalogError("catalog-mismatch")
    _execute(connection, "DROP TABLE " + relation)


def _verify_policies(connection: Any, bundle: dict[str, Any]) -> None:
    schema = bundle["configuration"]["schema"]
    for step in bundle["steps"]:
        if step["kind"] != "policy":
            continue
        parts = step["sourcePath"].split("/")
        table = bundle["expectedCatalog"]["tables"][int(parts[6])]["name"]
        name = "umf_" + parts[-2] + "_" + parts[-1]
        prefix = "CREATE POLICY " + _q(name) + " "
        if not step["sql"].startswith(prefix):
            raise CatalogError("source-mismatch")
        temporary = "umf_verify_" + uuid4().hex
        _execute(connection, "CREATE POLICY " + _q(temporary) + " " + step["sql"][len(prefix):])
        actual = _one(connection, _POLICY, (schema, table, name))
        expected = _one(connection, _POLICY, (schema, table, temporary))
        if actual is None or actual != expected:
            raise CatalogError("catalog-mismatch")
        _execute(connection, "DROP POLICY " + _q(temporary) + " ON " + _q(schema) + "." + _q(table))
    for table in bundle["expectedCatalog"]["tables"]:
        count = _one(connection, "SELECT count(*) FROM pg_catalog.pg_policies WHERE schemaname=%s AND tablename=%s", (schema, table["name"]))
        if count != (8,):
            raise CatalogError("catalog-mismatch")


@contextmanager
def _installation(connection: Any, bundle: dict[str, object], *,
                  statement_timeout_ms: int, lock_timeout_ms: int) -> Iterator[dict[str, Any]]:
    """Shared source, install authority, lock, deadline and savepoint boundary."""
    for timeout in (statement_timeout_ms, lock_timeout_ms):
        if type(timeout) is not int or not 1 <= timeout <= 300_000:
            raise ValueError("administrative timeouts must be 1..300000 milliseconds")
    from psycopg import Error as NativeError
    from umf_codegen import verify_table_deployment

    try:
        source = cast(dict[str, Any], verify_table_deployment(bundle))
    except (ValueError, TypeError):
        raise CatalogError("source-mismatch") from None
    if int(connection.info.transaction_status) != 2:
        raise CatalogError("transaction-required")
    configuration = source["configuration"]
    schema, owner = configuration["schema"], configuration["ownerRole"]
    try:
        with connection.transaction():
            previous = _one(connection, "SELECT pg_catalog.current_setting('statement_timeout'),pg_catalog.current_setting('lock_timeout')")
            _one(connection, "SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)", (str(statement_timeout_ms), str(lock_timeout_ms)))
            state = _one(connection, """SELECT current_user, r.rolsuper,r.rolbypassrls,r.rolcreatedb,
r.rolcreaterole,r.rolcanlogin,n.nspowner=r.oid,pg_catalog.current_schemas(false),
pg_catalog.current_setting('transaction_read_only'),pg_catalog.current_setting('server_version_num')::pg_catalog.int4,
pg_catalog.current_setting('row_security'),pg_catalog.current_setting('session_replication_role'),pg_catalog.current_setting('server_encoding'),pg_catalog.current_setting('transaction_isolation')
FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_namespace n ON n.nspname=%s WHERE r.rolname=current_user""", (schema,))
            if state is None or tuple(state[:9]) != (owner, False, False, False, False, False, True, ["pg_catalog"], "off") or state[9] // 10000 != 18 or tuple(state[10:]) != ('on','origin','UTF8','read committed'):
                raise CatalogError("install-authority-required")
            lock = int.from_bytes(hashlib.sha256(("umf.table-lifecycle/0.1\0" + schema).encode()).digest()[:8], "big", signed=True)
            _one(connection, "SELECT pg_catalog.pg_advisory_xact_lock(%s)", (lock,))
            yield source
            _one(connection, "SELECT pg_catalog.set_config('statement_timeout',%s,true),pg_catalog.set_config('lock_timeout',%s,true)", tuple(previous))
    except CatalogError:
        raise
    except (NativeError, ValueError, TypeError, KeyError, IndexError):
        raise CatalogError("catalog-verification-failed") from None


def verify_native_catalog(connection: Any, bundle: dict[str, object], *,
                          statement_timeout_ms: int = 30_000, lock_timeout_ms: int = 5_000) -> dict[str, object]:
    """Check source shape/policies; never commit the caller or admit data methods.

    Requires a healthy active Psycopg3 transaction, configured NOLOGIN install
    owner and exactly pg_catalog resolution. Success leaves no scratch objects;
    failure rolls back this function's savepoint. Full lifecycle admission remains
    false until grants and transitive role closure also qualify.
    """
    with _installation(connection, bundle, statement_timeout_ms=statement_timeout_ms,
                       lock_timeout_ms=lock_timeout_ms) as source:
        schema, owner = source["configuration"]["schema"], source["configuration"]["ownerRole"]
        for table in source["expectedCatalog"]["tables"]:
            relation = _q(schema) + "." + _q(table["name"])
            _execute(connection, "LOCK TABLE " + relation + " IN ACCESS EXCLUSIVE MODE")
        for table in source["expectedCatalog"]["tables"]:
            native = _one(connection, """SELECT c.relkind,c.relrowsecurity,c.relforcerowsecurity,r.rolname,c.relpersistence,
c.relispartition,c.relhassubclass,EXISTS(SELECT FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
c.relhasrules,EXISTS(SELECT FROM pg_catalog.pg_inherits inh WHERE inh.inhrelid=c.oid),c.relreplident
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
WHERE n.nspname=%s AND c.relname=%s""", (schema, table["name"]))
            if native != ("r", True, True, owner, "p", False, False, False, False, False, "d"):
                raise CatalogError("catalog-mismatch")
            _verify_table_shape(connection, source, table)
        _verify_policies(connection, source)
    return {"bundleDigest": source["bundleDigest"], "catalogShapeVerified": True, "lifecycleAdmission": False}
