# SPDX-License-Identifier: MIT OR Apache-2.0
"""Run the shared generated application against PostgreSQL through real Weft SQL.

Requires an explicit ephemeral PostgreSQL DSN, the isolated current Weft build,
an installed host package wheel, and the cached psycopg used only by this test host.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.metadata
import json
import os
import re
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

parser = argparse.ArgumentParser()
parser.add_argument("--generated", required=True)
parser.add_argument("--dsn", required=True)
parser.add_argument("--weft", required=True)
parser.add_argument("--psycopg", required=True)
args = parser.parse_args()
expected_weft_version = os.environ.get("UMF_UNIFIED_EXPECTED_WEFT_VERSION", "0.4.45")
expected_host_version = os.environ.get("UMF_UNIFIED_EXPECTED_HOST_VERSION", "0.1.0.dev3")

repo = Path(__file__).resolve().parents[2]
sys.path[:0] = [
    args.generated,
    args.weft,
    args.psycopg,
]

import psycopg
import weft
from application import application, assert_shared_edge_cases
from shop import Actions, Client, Customer, CustomerKey, OrderKey, WriteOutcomeUnknown
from umf_access.unified import WeftTableBinding


SOURCE = (repo / "tests/unified/commerce.json").read_text(encoding="utf-8")
DIGEST = __import__("hashlib").sha256(SOURCE.encode("utf-8")).hexdigest()


def columns(entries: list[tuple[str, str]]) -> list[dict[str, object]]:
    return [
        {"logical": name, "native": name, "carrier": carrier, "nullable": False}
        for name, carrier in entries
    ]


binding: dict[str, object] = {
    "version": "umf.raw-read-binding/0.1",
    "schema": None,
    "modelJson": SOURCE,
    "modelSha256": DIGEST,
    "tables": [
        {
            "logical": ["example.commerce", "Customer"],
            "native": "customers",
            "key": ["customerId"],
            "columns": columns(
                [
                    ("customerId", "string"),
                    ("customerUuid", "uuid"),
                    ("externalId", "bits128"),
                    ("customerName", "string"),
                ]
            ),
        },
        {
            "logical": ["example.commerce", "Order"],
            "native": "orders",
            "key": ["orderId"],
            "columns": columns(
                [
                    ("orderId", "string"),
                    ("orderCustomerId", "string"),
                    ("status", "string"),
                    ("amount", "decimal"),
                ]
            ),
        },
    ],
    "relationships": [
        {
            "id": "orderCustomer",
            "source": ["example.commerce", "Order"],
            "target": ["example.commerce", "Customer"],
            "pairs": [["orderCustomerId", "customerId"]],
            "toOne": True,
        }
    ],
}

compiled: list[dict[str, Any]] = []
edge_parameters: list[dict[str, object]] = []


def wire(value: object, scalar: str) -> object:
    if value is None:
        return None
    if scalar == "uuid":
        return {"uuid": str(value if isinstance(value, UUID) else UUID(str(value)))}
    if scalar == "bits128":
        return {"bits128Hex": bytes(value).hex()}
    if scalar == "decimal":
        return {"decimalToken": str(value if isinstance(value, Decimal) else Decimal(str(value)))}
    if scalar == "integer":
        return {"integerToken": str(value)}
    return value


async def execute(artifact: dict[str, Any], request: dict[str, Any]) -> dict[str, object]:
    if artifact.get("status") != "compiled" or artifact.get("target") != "postgresql18":
        raise AssertionError("host received an uncompiled or wrong-target Weft artifact")
    compiled.append(artifact)
    order = artifact.get("parameterOrder", [])
    values_by_name = {name: request["parameters"][name] for name in order}
    # psycopg's DB-API placeholder syntax is applied only to bind the compiler's
    # existing PostgreSQL $n parameters. The SQL text and its meaning stay intact.
    values: list[object] = []

    def placeholder(match: re.Match[str]) -> str:
        name = order[int(match.group(1)) - 1]
        values.append(values_by_name[name])
        return "%s"

    sql = re.sub(r"\$([1-9][0-9]*)", placeholder, artifact["sql"])
    if any(
        isinstance(item, dict)
        and item.get("field") == "status"
        and isinstance(item.get("value"), str)
        and item["value"] == "' OR 1=1 --"
        for item in request.get("query", {}).get("filters", [])
    ):
        edge_parameters.append(dict(request["parameters"]))
        if "' OR 1=1 --" in artifact["sql"]:
            raise AssertionError("user filter value appeared in compiled SQL text")
    with psycopg.connect(args.dsn) as connection, connection.cursor() as cursor:
        cursor.execute(sql, values)
        raw_rows = cursor.fetchall()
    output_specs = artifact.get("outputs", [])
    fields: dict[str, str] = {
        "customerId": "string",
        "customerUuid": "uuid",
        "externalId": "bits128",
        "customerName": "string",
        "orderId": "string",
        "orderCustomerId": "string",
        "status": "string",
        "amount": "decimal",
    }
    rows: list[dict[str, object]] = []
    for raw_row in raw_rows:
        row: dict[str, object] = {}
        for spec, value in zip(output_specs, raw_row, strict=True):
            field = str(spec["name"])
            row[field] = wire(value, fields[field])
        rows.append(row)
    return {"schema": request["schema"], "rows": rows, "cursor_position": None}


async def apply(action: str, inputs: dict[str, object], idempotency_key: str | None) -> dict[str, object]:
    if action != "commerce.shipOrder" or idempotency_key is not None:
        raise AssertionError("unexpected action invocation")
    key = inputs["entityOrder"]
    if not isinstance(key, dict) or set(key) != {"orderId"}:
        raise AssertionError(f"unexpected action key {key!r}")
    order_id = key["orderId"]
    with psycopg.connect(args.dsn) as connection, connection.cursor() as cursor:
        cursor.execute('UPDATE "orders" SET "status"=%s WHERE "orderId"=%s', ("shipped", order_id))
        changed = cursor.rowcount
    if changed != 1:
        raise AssertionError("action did not update exactly one order")
    return {
        "schema": DIGEST,
        "changed": [{"record": "commerce.Order", "key": {"orderId": order_id}}],
        "created": [],
        "counts": {"changed": changed},
        "consistency_token": "postgresql18-unified-commit-1",
    }


async def main() -> None:
    host_version = importlib.metadata.version("umf_access")
    if host_version != expected_host_version:
        raise AssertionError(f"expected installed umf_access{expected_host_version}, got {host_version}")
    if weft.__version__ != expected_weft_version:
        raise AssertionError(f"expected isolated Weft{expected_weft_version}, got {weft.__version__}")
    with psycopg.connect(args.dsn) as connection, connection.cursor() as cursor:
        cursor.execute('DROP TABLE IF EXISTS "orders"')
        cursor.execute('DROP TABLE IF EXISTS "customers"')
        cursor.execute(
            'CREATE TABLE "customers" ('
            '"customerId" text PRIMARY KEY, "customerUuid" uuid NOT NULL, '
            '"externalId" bytea NOT NULL, "customerName" text NOT NULL)'
        )
        cursor.execute(
            'CREATE TABLE "orders" ('
            '"orderId" text PRIMARY KEY, "orderCustomerId" text NOT NULL REFERENCES "customers"("customerId"), '
            '"status" text NOT NULL, "amount" numeric(8,2) NOT NULL)'
        )
        cursor.execute(
            'INSERT INTO "customers" VALUES (%s, %s, %s, %s)',
            ("c-1", UUID("6f9619ff-8b86-d011-b42d-00cf4fc964ff"), bytes.fromhex("00112233445566778899aabbccddeeff"), "Ada"),
        )
        cursor.executemany(
            'INSERT INTO "orders" VALUES (%s, %s, %s, %s)',
            [("o-100", "c-1", "pending", Decimal("24.50")), ("o-200", "c-1", "pending", Decimal("10.00"))],
        )
    host = WeftTableBinding(
        binding,
        weft,
        execute,
        action_executor=apply,
        target="postgresql18",
    )
    malformed = await host.execute(
        {
            "contract": "umf.access/1",
            "schema": DIGEST,
            "kind": "apply",
            "action": "commerce.shipOrder",
            "inputs": {"entityOrder": {"unexpected": "o-100"}},
            "idempotency_key": None,
        }
    )
    if malformed.get("error", {}).get("code") != "INVALID":
        raise AssertionError(f"Weft binding accepted malformed action input: {malformed!r}")

    async def lose_action_response(action: str, inputs: dict[str, object], key: str | None) -> dict[str, object]:
        raise RuntimeError("simulated response loss after dispatch")

    lost_host = WeftTableBinding(
        binding,
        weft,
        execute,
        action_executor=lose_action_response,
        target="postgresql18",
    )
    try:
        await Actions(Client(lost_host)).ship_order(
            order=OrderKey(order_id="o-100"), idempotency_key="retry-stable-1"
        )
    except WriteOutcomeUnknown as error:
        if error.code != "WRITE_OUTCOME_UNKNOWN":
            raise
    else:
        raise AssertionError("Weft binding did not report lost action outcome")

    client = Client(host)
    customer = await Customer.objects.using(client).by_key(CustomerKey(customer_id="c-1")).first()
    if customer is None or customer.customer_uuid != UUID("6f9619ff-8b86-d011-b42d-00cf4fc964ff"):
        raise AssertionError("PostgreSQL UUID value did not round trip exactly")
    if customer.external_id != bytes.fromhex("00112233445566778899aabbccddeeff"):
        raise AssertionError("PostgreSQL bits128 bytea value did not round trip exactly")
    result = await application(client)
    if result != ("Ada", "shipped", "postgresql18-unified-commit-1"):
        raise AssertionError(f"shared application returned {result!r}")
    edge_cases = await assert_shared_edge_cases(client, host)
    if len(compiled) != 8 or not any("__umf_related_source" in item["sql"] for item in compiled):
        raise AssertionError(f"expected 8 compiled key, related, page, and filter reads; got {len(compiled)}")
    if not all(item["status"] == "compiled" for item in compiled):
        raise AssertionError("Weft did not compile every table read")
    if len(edge_parameters) != 1 or "' OR 1=1 --" not in edge_parameters[0].values():
        raise AssertionError("injected filter was not passed as a bound parameter")
    print(
        json.dumps(
            {
                "status": "pass",
                "hostRuntime": host_version,
                "weft": weft.__version__,
                "postgresql": "18",
                "compiledReads": len(compiled),
                "edgeCases": edge_cases,
                "injectionParameterBound": True,
                "relatedSql": next(item["sql"] for item in compiled if "__umf_related_source" in item["sql"]),
                "result": result,
                "schemaDigest": DIGEST,
            }
        )
    )


asyncio.run(main())
