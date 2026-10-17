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

from pg_runtime_privilege_resolver import analyze, resolve


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


def resolve_owner_packet(
    connection: Any, packet: Mapping[str, Any], owner_check: Callable[[str], object]
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
                connection.execute(probe["setupSql"])
                name = f"__umf_privilege_view_{index}_{variant}"
                connection.execute(
                    sql.SQL("CREATE TEMPORARY VIEW {} ({}) AS ").format(
                        sql.Identifier(name),
                        sql.SQL(",").join(
                            sql.Identifier(column) for column in probe["outputColumns"]
                        ),
                    )
                    + sql.SQL(probe["sql"])
                )
                text = connection.execute(
                    "SELECT r.ev_action::pg_catalog.text FROM pg_catalog.pg_rewrite r JOIN pg_catalog.pg_class c ON c.oid=r.ev_class WHERE c.relnamespace=pg_catalog.pg_my_temp_schema() AND c.relname=%s AND r.rulename='_RETURN'",
                    (name,),
                ).fetchone()[0]
                analysis = analyze(text)
                native = resolve(connection, analysis)
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
                        "inputTypes": inputs,
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


if __name__ == "__main__":
    main()
