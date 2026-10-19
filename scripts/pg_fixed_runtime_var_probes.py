# SPDX-License-Identifier: MIT OR Apache-2.0
"""Parse-only native typed-Var probes for exact observed fixed SDK source SQL.

This host tool never executes the observed SQL, supplies parameter values, or
qualifies a target. Actual workflow grants/type-I/O remain independent tests.
"""

from __future__ import annotations

import ast
import hashlib
import zipfile
from pathlib import Path

from pg_owner_privilege_resolver import native_relation_permissions
from pg_runtime_privilege_resolver import analyze, resolve, substitute
from psycopg import pq, sql


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def validate_observation(source, observation, source_archive=None):
    source = Path(source)
    text = source.read_text()
    sha = digest(text)
    origins = observation.get("origin", [])
    same_file = any(
        origin.get("path") == str(source) and origin.get("sourceSha256") == sha
        for origin in origins
    )
    definition_binding = {"kind": "same-file-actual-callsite"}
    if source_archive is not None:
        archive = Path(source_archive["path"])
        if hashlib.sha256(archive.read_bytes()).hexdigest() != source_archive["sha256"]:
            raise ValueError("qualification source archive hash differs")
        with zipfile.ZipFile(archive) as wheel:
            payload = "umf_access/" + source.name
            if (
                source.parent.name != "umf_access"
                or wheel.read(payload) != source.read_bytes()
            ):
                raise ValueError(
                    "fixed definition source differs from exact wheel payload"
                )
            actual_caller = False
            for origin in origins:
                caller = Path(origin.get("path", ""))
                candidate = "umf_access/" + caller.name
                if (
                    caller.parent.name != "umf_access"
                    or candidate not in wheel.namelist()
                ):
                    continue
                data = wheel.read(candidate)
                if (
                    caller.is_file()
                    and caller.read_bytes() == data
                    and origin.get("sourceSha256") == hashlib.sha256(data).hexdigest()
                ):
                    actual_caller = True
            if not actual_caller:
                raise ValueError("actual runtime callsite differs from pinned wheel")
        definition_binding = {
            "kind": "exact-wheel-payload-literal",
            "wheelSha256": source_archive["sha256"],
            "payload": payload,
        }
    elif not same_file:
        raise ValueError("actual runtime source/hash provenance absent")
    query = observation.get("sql")
    literals = {
        n.value
        for n in ast.walk(ast.parse(text))
        if isinstance(n, ast.Constant) and isinstance(n.value, str)
    }
    if (
        not isinstance(query, str)
        or query not in literals
        or digest(query) != observation.get("sqlSha256")
    ):
        raise ValueError("exact fixed runtime source literal required")
    if not query.startswith(("SELECT ", "WITH ")):
        raise ValueError(
            "fixed runtime control/dynamic statement requires separate profile"
        )
    protocol = observation.get("protocol", {})
    if protocol.get("observed") is not True:
        raise ValueError("actual native protocol observation absent")
    oids = protocol.get("parameterOids")
    formats = protocol.get("parameterFormats")
    nulls = protocol.get("parameterNulls")
    if not isinstance(oids, list) or any(
        type(oid) is not int or oid < 0 or oid > 2**32 - 1 for oid in oids
    ):
        raise ValueError("native protocol OID inventory malformed")
    if (
        not isinstance(formats, list)
        or len(formats) != len(oids)
        or any(type(value) is not int or value not in (0, 1) for value in formats)
    ):
        raise ValueError("native protocol formats malformed")
    if (
        not isinstance(nulls, list)
        or len(nulls) != len(oids)
        or any(type(value) is not bool for value in nulls)
    ):
        raise ValueError("native null inventory malformed")
    encoded = substitute(query, ["$" + str(i + 1) for i in range(len(oids))])
    if protocol.get("nativeSql") != encoded or protocol.get(
        "nativeSqlSha256"
    ) != digest(encoded):
        raise ValueError("source and actual encoded native SQL differ")
    outputs = observation.get("resultColumns")
    if (
        observation.get("outcome") != "returned"
        or not isinstance(outputs, list)
        or not 1 <= len(outputs) <= 256
        or any(
            not isinstance(c, dict)
            or set(c) != {"native", "typeOid"}
            or not isinstance(c["native"], str)
            or type(c["typeOid"]) is not int
            or c["typeOid"] <= 0
            for c in outputs
        )
    ):
        raise ValueError("successful exact native output inventory required")
    return {
        "sourceDefinitionBinding": definition_binding,
        "actualCallsites": origins,
        "source": str(source),
        "sourceSha256": sha,
        "sql": query,
        "sqlSha256": digest(query),
        "nativeSql": encoded,
        "nativeSqlSha256": digest(encoded),
        "protocolOids": oids,
        "protocolFormats": formats,
        "protocolNulls": nulls,
        "outputs": outputs,
    }


def resolve_observed_fixed_sql(
    connection, source, observation, ordinal, source_archive=None
):
    record = validate_observation(source, observation, source_archive)
    if type(ordinal) is not int or not 0 <= ordinal < 100000:
        raise ValueError("owned ordinal malformed")
    name = "__umf_runtime_var_" + str(ordinal)
    input_name = name + "_input"
    view_name = name + "_view"
    prepared = False
    connection.execute("SAVEPOINT umf_fixed_runtime_var_probe")
    try:
        result = connection.pgconn.prepare(
            name.encode(), record["nativeSql"].encode(), record["protocolOids"]
        )
        if result.status != pq.ExecStatus.COMMAND_OK:
            raise ValueError(
                "native PREPARE refused exact observed fixed SQL: "
                + result.error_message.decode()
            )
        prepared = True
        described = connection.pgconn.describe_prepared(name.encode())
        if described.status != pq.ExecStatus.COMMAND_OK or described.nparams != len(
            record["protocolOids"]
        ):
            raise ValueError("native DESCRIBE parameter inventory differs")
        inferred = [described.param_type(i) for i in range(described.nparams)]
        if any(type(oid) is not int or oid <= 0 for oid in inferred) or any(
            declared != 0 and declared != native
            for declared, native in zip(record["protocolOids"], inferred, strict=True)
        ):
            raise ValueError(
                "native inferred parameter type differs from actual protocol"
            )
        if described.nfields != len(record["outputs"]) or [
            described.ftype(i) for i in range(described.nfields)
        ] != [column["typeOid"] for column in record["outputs"]]:
            raise ValueError(
                "native parse-only output type/arity differs from actual workflow"
            )
        if [described.fname(i).decode() for i in range(described.nfields)] != [
            column["native"] for column in record["outputs"]
        ]:
            raise ValueError(
                "native parse-only output names differ from actual workflow"
            )
        # Close our native-only statement before any Psycopg SQL. Its cache
        # manager may deallocate all statements when rolling back a savepoint.
        closed = connection.pgconn.close_prepared(name.encode())
        if closed.status != pq.ExecStatus.COMMAND_OK:
            raise ValueError(
                "native CLOSE refused owned prepared statement: "
                + closed.error_message.decode()
            )
        prepared = False
        types = []
        for oid in inferred:
            row = connection.execute(
                "SELECT t.oid,n.nspname,t.typname,t.typinput::pg_catalog.oid,t.typoutput::pg_catalog.oid,t.typreceive::pg_catalog.oid,t.typsend::pg_catalog.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE t.oid=%s::pg_catalog.oid",
                (oid,),
            ).fetchone()
            if row is None or row[0] != oid:
                raise ValueError("native inferred type/I-O identity absent")
            types.append(row)
        if types:
            columns = sql.SQL(",").join(
                sql.SQL("{} {}.{}").format(
                    sql.Identifier("p" + str(i)),
                    sql.Identifier(row[1]),
                    sql.Identifier(row[2]),
                )
                for i, row in enumerate(types)
            )
            connection.execute(
                sql.SQL("CREATE TEMP TABLE {} ({})").format(
                    sql.Identifier(input_name), columns
                )
            )
        # These substitutions are probe-only Vars from exact observed fixed
        # source literals. The original encoded SQL was independently PREPAREd.
        variables = [
            sql.SQL("(SELECT {} FROM pg_temp.{})")
            .format(sql.Identifier("p" + str(i)), sql.Identifier(input_name))
            .as_string(connection)
            for i in range(len(types))
        ]
        probe = substitute(record["sql"], variables)
        outputs = sql.SQL(",").join(
            sql.Identifier("c" + str(i)) for i in range(len(record["outputs"]))
        )
        connection.execute(
            sql.SQL("CREATE TEMP VIEW {} ({}) AS ").format(
                sql.Identifier(view_name), outputs
            )
            + sql.SQL(probe)
        )
        row = connection.execute(
            "SELECT r.ev_action::pg_catalog.text FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class WHERE c.relnamespace=pg_catalog.pg_my_temp_schema() AND c.relname=%s AND r.rulename='_RETURN'",
            (view_name,),
        ).fetchone()
        if row is None:
            raise ValueError("owned analyzed runtime view absent")
        text = row[0]
        analysis = analyze(text)
        native = resolve(connection, analysis)
        relations = native_relation_permissions(
            connection, analysis, {"inputRelation": {"native": input_name}}
        )
        return {
            "version": "umf.fixed-runtime-native-var-analysis/0.1",
            "nativeAuthority": False,
            "inventoryComplete": False,
            "businessSqlExecuted": False,
            "preparedLifecycle": {
                "prepare": "COMMAND_OK",
                "describe": "COMMAND_OK",
                "close": "COMMAND_OK",
                "closedBeforePsycopgSql": True,
            },
            "actualObservation": record,
            "inferredNativeParameterOids": inferred,
            "nativeTypeIo": [list(row) for row in types],
            "probeSql": probe,
            "probeSqlSha256": digest(probe),
            "nativeNodeText": text,
            "nativeNodeSha256": digest(text),
            "analysis": analysis,
            "resolved": native,
            "nativeRelationPermissions": relations,
            "unresolved": [
                "actual native workflow type-I/O and direct EXECUTE grant necessity",
                "unselected protocol variants and source templates",
            ],
        }
    finally:
        try:
            if prepared:
                closed = connection.pgconn.close_prepared(name.encode())
                if closed.status != pq.ExecStatus.COMMAND_OK:
                    raise ValueError(
                        "native CLOSE cleanup failed for owned prepared statement: "
                        + closed.error_message.decode()
                    )
        finally:
            connection.execute("ROLLBACK TO SAVEPOINT umf_fixed_runtime_var_probe")
            connection.execute("RELEASE SAVEPOINT umf_fixed_runtime_var_probe")
