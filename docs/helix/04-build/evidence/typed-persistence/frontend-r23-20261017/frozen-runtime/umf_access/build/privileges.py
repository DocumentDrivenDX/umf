"""Review-only target privilege inventory, never SQL parsing or grant execution."""

from __future__ import annotations

from typing import Any

from .pg_privileges import postgres_runtime_advisory

_RUNTIME = {
    "postgresql": (
        "pg_catalog relation/type/typmod/null/generation/collation and complete-Key observations",
        "native current_user/session_user, role membership and row-security admission",
        "original compiler LOCK, search-path resolution and before/after metadata programs",
        "pg_catalog.pg_control_system(), current_database(), current_schemas() and original relation resolution for explicit schemaBinding",
        "read-only/serializable transaction, statement timeout and cancellation",
        "action dependency closure, DDL fence and original writer-incarnation custody",
        "transaction receipt and reconnect reconciliation observations",
        "declared pgvector extension/schema/version and keyword-index analyzer admission",
    ),
    "spark-delta": (
        "Spark runtime version and original Delta table UUID/schema/type/null/collation observations",
        "DESCRIBE DETAIL/HISTORY and original versionAsOf snapshot programs",
        "job-group cancellation, whole-call deadline and owned-session cleanup",
        "native transaction conflict, dependency closure and writer lifecycle custody",
        "exact ordered per-table commit receipt and reconnect reconciliation",
    ),
    "unity-catalog": (
        "warehouse/runtime version and authenticated SQL/REST principal observations",
        "Unity Catalog information_schema and DESCRIBE DETAIL/EXTENDED JSON table observations",
        "native vector endpoint/index metadata and query API when search is selected",
        "current SQL SELECT, row filters/masks and original table/index identity revalidation",
        "native group/role admission, dependency closure and unchanged-closure DDL fence",
        "catalog-commit transaction and exact ordered table-version receipt/reconciliation",
        "original complete snapshot vector and retention admission for snapshot reads",
    ),
    "truss": (
        "original Truss runtime/Scalar ABI and binding authority observations",
        "original current-graph, current-policy and authenticated principal custody",
        "original protected action/manifest/frame/dependency admission and writer incarnation",
        "original transaction receipt, reconciliation and engine control custody",
    ),
    "ashlar": (
        "original Ashlar publication/source/revision and runtime/binding observations",
        "held publication snapshot and authenticated current-read admission",
        "original publisher/writer authority and engine control custody for mutations",
        "original native transaction/frame/receipt/reconciliation admission for mutations",
    ),
}


def privilege_report(
    targets: list[dict[str, Any]], entries: list[dict[str, Any]]
) -> dict[str, Any]:
    reports = []
    for target in targets:
        kind = target["kind"]
        runtime = _RUNTIME.get("postgresql" if kind == "lakebase" else kind)
        unresolved = []
        operations = []
        for entry in entries:
            if entry["targetId"] != target["id"]:
                continue
            artifact = entry["artifact"]
            owner = artifact.get("privilegeInventory")
            complete = (
                type(owner) is dict
                and owner.get("version") == "weft.native-privileges/0.1"
                and owner.get("complete") is True
                and owner.get("unresolved") == []
            )
            if not complete:
                unresolved.append(
                    {
                        "entry": entry["name"],
                        "requirement": "original owner exact used columns, operations, functions/operators, indexes and grant proposal",
                    }
                )
            operations.append(
                {
                    "name": entry["name"],
                    "kind": entry["kind"],
                    "referencedTables": artifact.get("referencedTables"),
                    "referencedTablesScope": "conservative owner binding inventory; not exact least privilege",
                    "nativeObligations": artifact.get("obligations"),
                    "ownerInventory": owner,
                }
            )
        if runtime is None:
            unresolved.append(
                {"requirement": "qualified target runtime metadata inventory"}
            )
        else:
            unresolved.append(
                {
                    "requirement": "exact target runtime metadata/control privileges and native function/operator identities; checklist alone is not an inventory"
                }
            )
        advisory = (
            postgres_runtime_advisory(
                target,
                [entry for entry in entries if entry["targetId"] == target["id"]],
            )
            if kind in ("postgresql", "lakebase")
            else None
        )
        reports.append(
            {
                "id": target["id"],
                "kind": kind,
                "entries": operations,
                "knownRuntimeSurface": list(runtime or ()),
                "runtimeSurfaceScope": "profile review checklist; not a sufficient grant set",
                **({"runtimeAdvisory": advisory} if advisory is not None else {}),
                "hostOnlyObligations": [
                    "host applies and verifies native grants; SDK never executes grant proposals",
                    "independent native principal and least-privilege E2E",
                    "original native dependency/fence/restore/snapshot/control custody for each selected capability",
                ],
                "unresolved": unresolved,
                "inventoryComplete": not unresolved,
                "grantProposal": {
                    "status": "OWNER_INVENTORY_REQUIRED"
                    if unresolved
                    else "SEE_ORIGINAL_OWNER_INVENTORIES"
                },
                "qualification": {
                    "leastPrivilege": "UNQUALIFIED",
                    "sufficiencyClaim": False,
                    "reason": "native host proof is required; incomplete inventory refuses affected capability qualification",
                },
            }
        )
    return {"contract": "umf-access-privileges/0.1", "targets": reports}
