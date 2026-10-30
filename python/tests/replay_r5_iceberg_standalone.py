# SPDX-License-Identifier: MIT OR Apache-2.0
"""Run the installed R5 Iceberg binding corpus without pytest or Pydantic."""

from __future__ import annotations

import argparse
import json
import math
import sys
import types
from importlib.metadata import distribution
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def install_namespace_shim() -> None:
    package_path = Path(distribution("umf-core").locate_file("umf"))
    package = types.ModuleType("umf")
    package.__path__ = [str(package_path)]
    sys.modules["umf"] = package


def pointer(value, path):
    for segment in path.split("/")[1:]:
        segment = segment.replace("~1", "/").replace("~0", "~")
        value = value[int(segment)] if isinstance(value, list) else value[segment]
    return value


def caught(call):
    try:
        return call(), None
    except Exception as error:  # noqa: BLE001 -- predecessor replay asserts exact outcomes for arbitrary adapter failures
        return None, error


def equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: got {actual!r}; expected {expected!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--namespace-shim", action="store_true")
    args = parser.parse_args()
    if args.namespace_shim:
        install_namespace_shim()

    from umf import rust_iceberg_schema as api

    packet_path = ROOT / "tests/rust-core/fixtures/r5-iceberg-schema/baseline.json"
    baseline = json.loads(packet_path.read_text())
    authored_imported = authored_rejected = 0
    for case in baseline["authoredCases"]:
        operations = case["operations"]
        source = (ROOT / case["path"]).read_text()
        document, error = caught(lambda source=source, operations=operations, case=case: api.import_schema(source, operations["import"].get("id", case["id"])))
        if operations["import"]["status"] == "error":
            authored_rejected += 1
            equal(getattr(error, "code", None), operations["import"]["error"]["code"], case["id"] + " import code")
            equal(str(error), operations["import"]["error"]["message"], case["id"] + " import message")
            continue
        authored_imported += 1
        equal(document["id"], operations["import"]["id"], case["id"] + " id")
        equal(api.inspect(document), operations["inspect"], case["id"] + " inspect")
        equal(api.export_schema(document), operations["export"]["nativeJson"], case["id"] + " export")
        equal(api.get_node(document, operations["get"]["path"]), operations["get"]["value"], case["id"] + " getNode")
        missing = operations["getMissing"]
        _, error = caught(lambda document=document, missing=missing: api.get_node(document, missing["path"]))
        equal((getattr(error, "code", None), str(error)),
              (missing["error"]["code"], missing["error"]["message"]), case["id"] + " missing getNode")
        edit = operations["proposeEdit"]
        proposal = api.propose_node_edit(document, edit["path"], edit["replacement"])
        equal(proposal["validation"], edit["validation"], case["id"] + " edit validation")
        equal(api.export_schema(proposal["document"]), edit["export"], case["id"] + " edited export")
        equal(api.export_schema(document), edit["sourceAfter"], case["id"] + " unchanged source")
    assert (authored_imported, authored_rejected) == (26, 9)

    upstream_imported = upstream_rejected = 0
    for case in baseline["upstreamCases"]:
        source_info = case["source"]
        upstream_doc = json.loads((ROOT / "fixtures/iceberg/upstream" / source_info["path"]).read_text())
        native = json.dumps(pointer(upstream_doc, source_info["pointer"]), ensure_ascii=True, separators=(",", ":"))
        if "operations" not in case:
            _, error = caught(lambda native=native, source_info=source_info: api.import_schema(native, source_info["id"]))
            equal((getattr(error, "code", None), str(error)),
                  (case["error"]["code"], case["error"]["message"]), source_info["id"] + " import refusal")
            upstream_rejected += 1
            continue
        operations = case["operations"]
        document = api.import_schema(native, source_info["id"])
        upstream_imported += 1
        equal(document["id"], operations["import"]["id"], source_info["id"] + " id")
        equal(api.inspect(document), operations["inspect"], source_info["id"] + " inspect")
        equal(api.export_schema(document), operations["export"], source_info["id"] + " export")
        equal(api.get_node(document, operations["get"]["path"]), operations["get"]["value"], source_info["id"] + " getNode")
        edit = operations["proposeEdit"]
        replacement = json.dumps(edit["to"], ensure_ascii=True, separators=(",", ":"))
        proposal = api.propose_node_edit(document, "/fields/0/name", replacement)
        equal(api.export_schema(proposal["document"]), edit["export"], source_info["id"] + " edited export")
        equal(api.export_schema(document), edit["sourceAfter"], source_info["id"] + " unchanged source")
    assert (upstream_imported, upstream_rejected) == (20, 1)

    source = (
        '{"type":"struct","fields":[{"id":1,"name":"x","type":"long","required":true}],'
        '"schema-id":0,"identifier-field-ids":[],"future":"\\ud800"}'
    )
    document = api.import_schema(source, "utf16-control")
    equal(api.get_node(document, "/future")["value"], "\ud800", "lone surrogate getNode")
    assert "\\ud800" in api.export_schema(document)
    edited = api.propose_node_edit(document, "/fields/0/name", '"copied"')
    equal(api.get_node(edited["document"], "/fields/0/name")["value"], "copied", "copied proposal")
    equal(api.get_node(document, "/fields/0/name")["value"], "x", "source isolation")

    meter_calls = []
    assert api.inspect(document, meter=meter_calls.append)["valid"] and meter_calls and sum(meter_calls) > 0
    assert api.inspect(document)["valid"]  # a new operation has a new budget/control context

    def refusal(controls, code, label, *, order=None):
        _, error = caught(lambda: api.inspect(document, **controls))
        equal(getattr(error, "code", None), code, label)
        return error

    called = []
    refusal({"max_work": 0, "meter": lambda _: called.append("meter")}, "RESOURCE_LIMIT", "budget precedence")
    equal(called, [], "resource before meter")
    order = []
    refusal({"meter": lambda _: (_ for _ in ()).throw(RuntimeError("meter fault")),
             "is_cancelled": lambda: order.append("cancel")}, "METER_FAILURE", "meter callback failure")
    equal(order, [], "meter before cancellation")
    order = []
    refusal({"is_cancelled": lambda: (_ for _ in ()).throw(RuntimeError("cancel fault")),
             "now": lambda: order.append("clock"), "deadline_ms": 2},
            "CANCELLATION_CHECK_FAILURE", "cancellation callback failure")
    equal(order, [], "cancellation before clock")
    for value in (math.nan, math.inf, -math.inf):
        refusal({"now": lambda value=value: value, "deadline_ms": 2},
                "CLOCK_CAPABILITY_REQUIRED", f"non-finite clock {value}")
    refusal({"now": lambda: (_ for _ in ()).throw(RuntimeError("clock fault")), "deadline_ms": 2},
            "CLOCK_CAPABILITY_REQUIRED", "clock callback failure")
    refusal({"is_cancelled": lambda: True}, "CANCELLED", "host cancellation")
    refusal({"now": lambda: 3, "deadline_ms": 2}, "DEADLINE", "expired deadline")
    assert api.inspect(document, now=lambda: 1.5, deadline_ms=2)["valid"]
    assert api.inspect(document)["valid"]

    print(json.dumps({
        "profile": api.profile_version(),
        "authoredImported": authored_imported,
        "authoredRejected": authored_rejected,
        "upstreamImported": upstream_imported,
        "upstreamRejected": upstream_rejected,
        "controls": "pass",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
