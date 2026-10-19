# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent in-memory ontology host for the generated transport contract.

The graph is stored as nodes and labeled edges. It intentionally does not use
SQLite, SQL compilation, or table-oriented row matching.
"""
from __future__ import annotations

from decimal import Decimal
import hashlib
import json
from typing import Any


def _tail(value: str) -> str:
    return value.replace("/", ".").replace(":", ".").split(".")[-1]


def _value(value: Any) -> Any:
    if isinstance(value, dict) and len(value) == 1:
        if "integerToken" in value:
            return int(value["integerToken"])
        if "decimalToken" in value:
            return Decimal(value["decimalToken"])
        if "uuid" in value:
            return value["uuid"]
        if "bits128Hex" in value:
            return bytes.fromhex(value["bits128Hex"])
        if "binaryHex" in value:
            return bytes.fromhex(value["binaryHex"])
    return value


def _wire(value: Any, field: str = "") -> Any:
    if isinstance(value, Decimal):
        return {"decimalToken": str(value)}
    if type(value) is int:
        return {"integerToken": str(value)}
    if isinstance(value, str) and len(value) == 36 and value.count("-") == 4:
        return {"uuid": value}
    if isinstance(value, bytes):
        return {"bits128Hex" if field == "externalId" else "binaryHex": value.hex()}
    if isinstance(value, str) and len(value) == 32 and all(c in "0123456789abcdefABCDEF" for c in value):
        return {"bits128Hex" if field == "externalId" else "binaryHex": value.lower()}
    return value


class OntologyTransport:
    """Small host-owned graph with typed request interpretation."""

    def __init__(self) -> None:
        self.nodes: dict[str, dict[str, dict[str, Any]]] = {
            "Customer": {
                "c-1": {"customerId": "c-1", "customerUuid": "6f9619ff-8b86-d011-b42d-00cf4fc964ff",
                        "externalId": bytes.fromhex("00112233445566778899aabbccddeeff"), "customerName": "Ada"},
            },
            "Order": {
                "o-100": {"orderId": "o-100", "orderCustomerId": "c-1", "status": "pending", "amount": Decimal("24.50")},
                "o-200": {"orderId": "o-200", "orderCustomerId": "c-1", "status": "pending", "amount": Decimal("10.00")},
            },
        }
        # Edges are first-class graph identities, independent of the node maps.
        self.edges: set[tuple[str, str, str, str]] = {
            ("Order", "o-100", "orderCustomer", "Customer:c-1"),
            ("Order", "o-200", "orderCustomer", "Customer:c-1"),
        }
        self.calls: list[dict[str, Any]] = []
        self.cursors: dict[str, tuple[str, tuple[Any, ...]]] = {}

    @staticmethod
    def _query_scope(query: dict[str, Any]) -> str:
        return hashlib.sha256(json.dumps(query, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    def _matches(self, record: str, row: dict[str, Any], predicates: list[dict[str, Any]]) -> bool:
        for predicate in predicates:
            op = predicate.get("op")
            if op == "and":
                if not all(self._matches(record, row, [part]) for part in predicate["args"]):
                    return False
                continue
            if op == "or":
                if not any(self._matches(record, row, [part]) for part in predicate["args"]):
                    return False
                continue
            if op == "not":
                if self._matches(record, row, predicate["args"]):
                    return False
                continue
            field = _tail(str(predicate.get("field", "")))
            left = row.get(field)
            right = _value(predicate.get("value"))
            if op == "is_null":
                matched = left is None
            elif op == "eq":
                matched = type(left) is type(right) and left == right
            elif op == "ne":
                matched = type(left) is not type(right) or left != right
            elif op == "ge":
                matched = left is not None and left >= right
            elif op == "gt":
                matched = left is not None and left > right
            elif op == "le":
                matched = left is not None and left <= right
            elif op == "lt":
                matched = left is not None and left < right
            elif op == "starts_with":
                matched = isinstance(left, str) and left.startswith(right)
            else:
                raise AssertionError(f"unknown predicate operator {op!r}")
            if not matched:
                return False
        return True

    def _select(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        record = _tail(str(query["record"]))
        rows = list(self.nodes[record].values())
        key = query.get("key")
        if key is not None:
            key_values = {_tail(k): _value(v) for k, v in key.items()}
            rows = [row for row in rows if all(row.get(k) == v for k, v in key_values.items())]
        rows = [row for row in rows if self._matches(record, row, query.get("filters", []))]
        for ordering in reversed(query.get("order", [])):
            field = _tail(str(ordering["field"]))
            rows.sort(key=lambda row: (row[field] is None, row[field]), reverse=ordering["direction"] == "desc")
        relationship = query.get("relationship")
        source = query.get("source")
        if relationship is not None and source is not None:
            sources = self._select(source)
            source_record = _tail(str(source["record"]))
            relation_id = _tail(str(relationship["id"]))
            direction = relationship.get("direction", "forward")
            linked: set[str] = set()
            for source_row in sources:
                source_key = source_row["orderId" if source_record == "Order" else "customerId"]
                if direction == "forward":
                    for edge_source, edge_key, edge_name, target in self.edges:
                        if edge_source == source_record and edge_key == source_key and edge_name == relation_id:
                            linked.add(target.split(":", 1)[1])
                else:
                    target = f"{source_record}:{source_key}"
                    linked.update(edge_key for edge_source, edge_key, edge_name, edge_target in self.edges
                                  if edge_target == target and edge_name == relation_id)
            rows = [row for row in rows if row.get("customerId", row.get("orderId")) in linked]
        return rows

    async def execute(self, request: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(request)
        response: dict[str, Any] = {"schema": request["schema"]}
        if request["kind"] == "read":
            query = request["query"]
            scope = self._query_scope(query)
            after = request.get("after")
            rows = self._select(query)
            if after is not None:
                cursor = self.cursors.get(after)
                if cursor is None or cursor[0] != scope:
                    return {"schema": request["schema"], "error": {"code": "INVALID_CURSOR"}}
                order = query.get("order", [])
                position = cursor[1]

                def is_after(row: dict[str, Any]) -> bool:
                    values = tuple(row[_tail(str(item["field"]))] for item in order)
                    for value, boundary, item in zip(values, position, order):
                        if value == boundary:
                            continue
                        return value > boundary if item["direction"] == "asc" else value < boundary
                    return False

                rows = [row for row in rows if is_after(row)]
            size = request["size"]
            response["rows"] = [{field: _wire(value, field) for field, value in row.items()} for row in rows[:size]]
            if len(rows) > size:
                visible = rows[:size]
                ordered_fields = query.get("order", [])
                last = visible[-1]
                position = tuple(last[_tail(str(item["field"]))] for item in ordered_fields)
                token = f"cursor:{scope}:{len(self.cursors)}"
                self.cursors[token] = (scope, position)
                response["cursor"] = token
            else:
                response["cursor"] = None
            return response
        if request["kind"] == "apply":
            action = _tail(str(request["action"]))
            if action != "shipOrder":
                raise AssertionError(f"unknown action {action!r}")
            inputs = request["inputs"]
            key = next(iter(inputs.values()))
            order_id = _value(key.get("orderId", key.get("order_id")))
            row = self.nodes["Order"][order_id]
            row["status"] = "shipped"
            response.update({
                "changed": [{"record": "commerce.Order", "key": {"orderId": order_id}}],
                "created": [],
                "counts": {"changed": 1},
                "consistency_token": "ontology-revision-2",
            })
            return response
        raise AssertionError(f"unknown request kind {request['kind']!r}")
