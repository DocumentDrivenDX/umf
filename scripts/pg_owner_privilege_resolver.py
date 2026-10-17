"""Host-only native analysis of original owner-generated privilege probes.

No business SQL is executed or parsed/rewritten here. Every probe runs inside a
rolled-back savepoint; original compiler checking must authorize the packet.
Native grant sufficiency and SDK runtime closure remain separate obligations.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping
from typing import Any

from pg_runtime_privilege_resolver import analyze, node_tree, resolve


def native_relation_permissions(connection, analysis, probe):
    """Snapshot native analyzed permission operands before owned rollback.

    Raw PostgreSQL permission masks/bitmaps remain uninterpreted. Native system
    attributes are retained; no column grant is inferred from bitmap arithmetic.
    """
    support = (
        {probe["inputRelation"]["native"]}
        if probe["inputRelation"].get("native")
        else set()
    )
    if probe.get("analysisRelation"):
        support.add(probe["analysisRelation"]["native"])
    observations = []
    for operand in analysis["relationPermissions"]:
        oid = operand["relid"]
        if type(oid) is not int or oid <= 0:
            raise ValueError("native permission relation OID malformed")
        cursor = connection.execute(
            "SELECT c.oid,n.nspname,c.relname,c.relkind,c.relpersistence,c.relowner,c.relacl FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=%s::pg_catalog.oid",
            (oid,),
        )
        found = cursor.fetchall()
        if len(found) != 1 or found[0][0] != oid:
            raise ValueError("native analyzed permission relation absent or ambiguous")
        row = found[0]
        columns = connection.execute(
            "SELECT a.attnum,a.attname,a.atttypid,tn.nspname,t.typname,a.attnotnull,a.attacl FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace WHERE a.attrelid=%s::pg_catalog.oid AND NOT a.attisdropped ORDER BY a.attnum",
            (oid,),
        ).fetchall()
        observations.append(
            {
                "nativePermissionOperand": dict(operand),
                "relation": {
                    "oid": row[0],
                    "schema": row[1],
                    "native": row[2],
                    "kind": row[3],
                    "persistence": row[4],
                    "ownerOid": row[5],
                    "acl": row[6],
                },
                "attributes": [
                    {
                        "attnum": c[0],
                        "native": c[1],
                        "typeOid": c[2],
                        "typeSchema": c[3],
                        "typeNative": c[4],
                        "notNull": c[5],
                        "acl": c[6],
                    }
                    for c in columns
                ],
                "originalOwnerProbeOnly": row[4] == "t"
                and row[1].startswith("pg_temp_")
                and row[2] in support,
                "nativeAuthority": False,
            }
        )
    return observations


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def checked_packet(
    packet: Mapping[str, Any], owner_check: Callable[[str], object]
) -> dict[str, Any]:
    """The original native owner must recompile/check before native setup SQL."""
    copied = json.loads(json.dumps(packet))
    if (
        copied.get("version") != "weft.native-privilege-probes/0.1"
        or copied.get("nativeAuthority") is not False
        or copied.get("complete") is not False
    ):
        raise ValueError("original partial owner probe packet required")
    if copied.get("nativeProfile", {}).get("postgresqlVersionNum") != 180006:
        raise ValueError("exact PostgreSQL18.6 probe profile required")
    if copied.get("sourceProgramDigest") != copied.get("program", {}).get(
        "structuralDigest"
    ):
        raise ValueError("probe source program digest differs")
    returned = owner_check(json.dumps(copied, separators=(",", ":")))
    try:
        accepted = json.loads(returned) if isinstance(returned, str) else None
    except (ValueError, TypeError):
        accepted = None
    if (
        accepted != copied
        or not isinstance(accepted, dict)
        or accepted.get("status") != "compiled"
    ):
        raise ValueError("original owner refused or changed probe packet")
    for statement in copied["statements"]:
        if digest(statement["sql"]) != statement["sqlSha256"]:
            raise ValueError("original statement hash differs")
        for probe in statement["probes"]:
            if (
                probe.get("analysisOnly") is not True
                or probe.get("executeBusinessSql") is not False
                or digest(probe["sql"]) != probe["sqlSha256"]
            ):
                raise ValueError("original analysis-only probe required")
            relation = probe["inputRelation"]
            if (
                relation.get("schema") != "pg_temp"
                or relation.get("probeOnly") is not True
            ):
                raise ValueError("probe-only temporary input relation required")
    return copied


def setup_owner_input(connection: Any, probe: Mapping[str, Any]) -> None:
    """Parameterless owner probes deliberately have no temporary input table."""
    columns = probe["inputRelation"]["columns"]
    if type(columns) is not list:
        raise ValueError("original owner input columns must be a list")
    if probe["setupSql"] is not None:
        connection.execute(probe["setupSql"])
    elif columns:
        raise ValueError("owner probe parameters require original setup SQL")


def rule_profile(probe: Mapping[str, Any]) -> bool:
    kind = probe.get("analysisKind")
    if kind is None:
        return False
    if kind != "pg-rewrite-rule/0.1":
        raise ValueError("unknown original owner analysis profile")
    relation, rule = probe["analysisRelation"], probe["analysisRule"]
    if (
        relation.get("schema") != "pg_temp"
        or relation.get("probeOnly") is not True
        or not isinstance(relation.get("native"), str)
        or not relation["native"]
        or not isinstance(rule.get("name"), str)
        or not rule["name"]
        or rule.get("event") != "INSERT"
        or any(
            rule.get(flag) is not True
            for flag in ["instead", "unconditional", "neverFire"]
        )
        or type(rule.get("expectedBusinessCommandType")) is not int
        or rule["expectedBusinessCommandType"] not in (2, 3, 4)
        or type(probe.get("setupStatements")) is not list
        or not probe["setupStatements"]
        or any(type(item) is not str or not item for item in probe["setupStatements"])
    ):
        raise ValueError("exact never-fired original owner rule profile required")
    return True


def analyzed_command_types(text: str) -> list[int]:
    found = []

    def visit(value):
        if isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, dict):
            if value["tag"] == "QUERY":
                found.append(value["fields"]["commandType"])
            for child in value["fields"].values():
                visit(child)

    visit(node_tree(text))
    return found


def resolve_owner_packet(
    connection: Any,
    packet: Mapping[str, Any],
    owner_check: Callable[[str], object],
    observe_native_tree: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Resolve exact native expression dependencies, without asserting grant closure."""
    from psycopg import sql

    checked = checked_packet(packet, owner_check)
    if connection.execute("SHOW server_version_num").fetchone() != ("180006",):
        raise ValueError("native PostgreSQL18.6 required")
    observations = []
    for index, statement in enumerate(checked["statements"]):
        for variant, probe in enumerate(statement["probes"]):
            connection.execute("SAVEPOINT umf_owner_privilege_probe")
            try:
                is_rule = rule_profile(probe)
                if is_rule:
                    for setup in probe["setupStatements"]:
                        connection.execute(setup)
                    name = probe["analysisRelation"]["native"]
                    rule_name = probe["analysisRule"]["name"]
                else:
                    setup_owner_input(connection, probe)
                    name = f"__umf_privilege_view_{index}_{variant}"
                    rule_name = "_RETURN"
                    connection.execute(
                        sql.SQL("CREATE TEMPORARY VIEW {} ({}) AS ").format(
                            sql.Identifier(name),
                            sql.SQL(",").join(
                                sql.Identifier(column)
                                for column in probe["outputColumns"]
                            ),
                        )
                        + sql.SQL(probe["sql"])
                    )
                row = connection.execute(
                    "SELECT r.ev_action::pg_catalog.text FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class WHERE c.relnamespace=pg_catalog.pg_my_temp_schema() AND c.relname=%s AND r.rulename=%s",
                    (name, rule_name),
                ).fetchone()
                if row is None:
                    raise ValueError("original owner analysis relation/rule absent")
                text = row[0]
                if observe_native_tree is not None:
                    observe_native_tree(
                        {
                            "statementPath": statement["path"],
                            "probeOrdinal": variant,
                            "nativeNodeText": text,
                            "nativeNodeSha256": digest(text),
                        }
                    )
                if is_rule:
                    commands = analyzed_command_types(text)
                    expected = probe["analysisRule"]["expectedBusinessCommandType"]
                    if expected not in commands or any(
                        command not in (1, expected) for command in commands
                    ):
                        raise ValueError("native original write command tree differs")
                analysis = analyze(text)
                native = resolve(connection, analysis)
                relations = native_relation_permissions(connection, analysis, probe)
                inputs = []
                for column in probe["inputRelation"]["columns"]:
                    # Native regtype resolves the original owner's type, not a host label.
                    io = connection.execute(
                        "SELECT t.oid,n.nspname,t.typname,t.typinput::pg_catalog.oid,t.typoutput::pg_catalog.oid,t.typreceive::pg_catalog.oid,t.typsend::pg_catalog.oid FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE t.oid=%s::pg_catalog.regtype",
                        (column["nativeType"],),
                    ).fetchone()
                    if (
                        io is None
                        or column["protocolOid"] != 0
                        and io[0] != column["protocolOid"]
                    ):
                        raise ValueError(
                            "original input type differs from native protocol OID"
                        )
                    inputs.append(
                        {
                            "original": column,
                            "nativeTypeIo": list(io),
                            "protocolWitness": "UNQUALIFIED: actual extended-protocol OID/format/inference observation required",
                        }
                    )
                observations.append(
                    {
                        "statementPath": statement["path"],
                        "originalSqlSha256": statement["sqlSha256"],
                        "probeSqlSha256": probe["sqlSha256"],
                        "nativeNodeText": text,
                        "nativeNodeSha256": digest(text),
                        "analysis": analysis,
                        "resolved": native,
                        "nativeRelationPermissions": relations,
                        "inputTypes": inputs,
                        "analysisKind": probe.get(
                            "analysisKind", "pg-rewrite-view/0.1"
                        ),
                        "analysisRule": probe.get("analysisRule"),
                        "businessDmlExecuted": False,
                        "probeSupportRelation": probe["inputRelation"],
                        "probeSupportExcludedFromBusinessGrants": True,
                    }
                )
            finally:
                connection.execute("ROLLBACK TO SAVEPOINT umf_owner_privilege_probe")
                connection.execute("RELEASE SAVEPOINT umf_owner_privilege_probe")
    return {
        "version": "umf.pg-owner-privilege-resolution/0.1",
        "sourceProgramDigest": checked["sourceProgramDigest"],
        "ownerProbeStructuralDigest": checked["structuralDigest"],
        "nativeVersion": 180006,
        "observations": observations,
        "inventoryComplete": False,
        "unresolved": [
            "actual-extended-protocol-witnesses",
            "independent-native-grant-revoke-proof",
            "current-SDK-runtime-selected-operation-closure",
        ],
        "locks": checked["locks"],
        "originalGrantSemantics": checked["grantSemantics"],
    }


def main() -> None:
    """Analyze an explicitly owned native connection; never initialize or grant."""
    import argparse
    import os
    from pathlib import Path

    import psycopg
    import weft

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    checker = getattr(weft, "check_native_privilege_probes_json", None)
    if checker is None:
        raise ValueError("exact original owner privilege probe API unavailable")
    packet = json.loads(args.packet.read_text())
    # Authenticate/recompile before opening a native connection.
    checked_packet(packet, checker)
    with psycopg.connect(os.environ["UMF_PG_PRIVILEGE_DSN"]) as connection:
        try:
            report = resolve_owner_packet(connection, packet, checker)
        finally:
            connection.rollback()
    args.output.write_text(json.dumps(report, indent=2, default=str) + "\n")


def observe_original_protocol(
    connection: Any, statement: Mapping[str, Any], values: list[object]
) -> dict[str, Any]:
    """Run explicitly selected original read SQL with its actual libpq parameters.

    This is a qualification-harness operation, separate from parse-only probes.
    The caller must supply its disposable read-only transaction and fixtures.
    """
    from psycopg import pq
    from psycopg.adapt import PyFormat, Transformer

    if connection.execute("SHOW transaction_read_only").fetchone() != ("on",):
        raise ValueError(
            "qualification business witness requires read-only transaction"
        )
    if statement.get("role") != "business-read" or digest(
        statement["sql"]
    ) != statement.get("sqlSha256"):
        raise ValueError("only original hashed business-read witness supported")
    if len(values) != len(statement["parameterOrder"]):
        raise ValueError("exact original parameter order required")
    transform = Transformer.from_context(connection)
    buffers = transform.dump_sequence(values, [PyFormat.AUTO] * len(values))
    result = connection.pgconn.exec_params(
        statement["sql"].encode(), buffers, transform.types, transform.formats, 0
    )
    witness = {
        "statementPath": statement["path"],
        "sqlSha256": statement["sqlSha256"],
        "nativeParameterOids": list(transform.types),
        "nativeParameterFormats": list(transform.formats),
        "status": int(result.status),
        "rows": [
            [
                None
                if result.get_value(row, col) is None
                else result.get_value(row, col).decode()
                for col in range(result.nfields)
            ]
            for row in range(result.ntuples)
        ],
        "nativeErrorSqlstate": None
        if result.error_field(pq.DiagnosticField.SQLSTATE) is None
        else result.error_field(pq.DiagnosticField.SQLSTATE).decode(),
        "inferredTypesWitness": "UNQUALIFIED: owner inferred target identity must be independently checked",
    }
    if result.status != pq.ExecStatus.TUPLES_OK:
        error = ValueError("original read native protocol execution refused")
        error.witness = witness
        raise error
    return witness


if __name__ == "__main__":
    main()
