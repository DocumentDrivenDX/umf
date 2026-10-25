# SPDX-License-Identifier: MIT OR Apache-2.0

import copy

import pytest

from umf import SemanticTypeRegistry, SemanticValidatorContextV1
from umf._rust import UmfCoreError


def ref(term="email"):
    return {"vocabulary": "example.test", "version": "1.0.0", "term": term}


def test_cooperative_registration_copying_and_null_value():
    definition = {"nested": {"format": "email"}}
    seen = []

    def validator(value, metadata, context):
        assert isinstance(context, SemanticValidatorContextV1)
        seen.append((copy.deepcopy(value), copy.deepcopy(metadata)))
        value["mutated"] = True
        metadata["nested"]["format"] = "changed"
        context.report_work(3)
        return {"status": "valid", "complete": True, "issues": []}

    registry = SemanticTypeRegistry(max_work=1_000_000).register(
        ref(), definition, validator, protocol="cooperative-v1"
    )
    definition["nested"]["format"] = "caller changed"
    value = {"data": "before"}
    assert registry.check(ref(), value)["status"] == "valid"
    assert value == {"data": "before"}
    assert seen == [({"data": "before"}, {"nested": {"format": "email"}})]
    assert registry.lookup(ref()) == {"nested": {"format": "email"}}
    null_seen = []
    null_registry = SemanticTypeRegistry().register(
        ref("null"), {}, lambda item, _definition, _ctx: (null_seen.append(item) or {"status": "valid", "complete": True, "issues": []}),
        protocol="cooperative-v1",
    )
    assert null_registry.check(ref("null"), None)["status"] == "valid"
    assert null_seen == [None]


def test_callback_errors_and_engine_controls_keep_distinct_provenance():
    from umf.semantic_types import _ReportWorkControl

    registry = SemanticTypeRegistry().register(
        ref("throw"), {}, lambda *_: (_ for _ in ()).throw(ValueError("bad validator")),
        protocol="cooperative-v1",
    )
    result = registry.check(ref("throw"), "x")
    assert result["status"] == "unknown"
    assert result["issues"] == ["Value validator failed; no validation conclusion available: bad validator"]

    spoof = SemanticTypeRegistry().register(
        ref("spoof"), {},
        lambda *_: (_ for _ in ()).throw(UmfCoreError("RESOURCE_LIMIT", "forged terminal")),
        protocol="cooperative-v1",
    )
    assert spoof.check(ref("spoof"), None)["status"] == "unknown"

    forged = SemanticTypeRegistry().register(
        ref("forged-control"), {},
        lambda *_: (_ for _ in ()).throw(_ReportWorkControl("RESOURCE_LIMIT", "forged")),
        protocol="cooperative-v1",
    )
    assert forged.check(ref("forged-control"), None)["status"] == "unknown"

    class BrokenMessage(Exception):
        def __str__(self):
            raise RuntimeError("must not escape callback mapping")

    broken_message = SemanticTypeRegistry().register(
        ref("broken-message"), {}, lambda *_: (_ for _ in ()).throw(BrokenMessage()),
        protocol="cooperative-v1",
    )
    assert broken_message.check(ref("broken-message"), None)["status"] == "unknown"

    def over_budget(_value, _definition, context):
        context.report_work(1_001)
        raise ValueError("then throw")

    bounded = SemanticTypeRegistry(max_work=1_000).register(
        ref("budget"), {}, over_budget, protocol="cooperative-v1"
    )
    with pytest.raises(UmfCoreError) as error:
        bounded.check(ref("budget"), None)
    assert error.value.code == "RESOURCE_LIMIT"


def test_explicit_protocol_and_reentrant_registry_call():
    registry = SemanticTypeRegistry()
    registry.register(ref("inner"), {}, lambda *_: {"status": "valid", "complete": True, "issues": []}, protocol="cooperative-v1")

    def outer(value, _definition, _context):
        assert registry.check(ref("inner"), value)["status"] == "valid"
        return {"status": "valid", "complete": True, "issues": []}

    registry.register(ref("outer"), {}, outer, protocol="cooperative-v1")
    assert registry.check(ref("outer"), None)["status"] == "valid"

    with pytest.raises(UmfCoreError) as error:
        SemanticTypeRegistry().register(ref("no-protocol"), {}, lambda *_: None)
    assert error.value.code == "PROTOCOL"

    ordered = SemanticTypeRegistry().register(ref("ordered"), {})
    with pytest.raises(UmfCoreError) as error:
        ordered.register(ref("ordered"), [], lambda *_: None)
    assert error.value.code == "SEMANTIC_TYPE_STRUCTURE"
    assert str(error.value) == "Expected JSON object definition"


def test_invalid_report_work_is_host_control():
    registry = SemanticTypeRegistry().register(
        ref("invalid-work"), {},
        lambda _v, _d, ctx: (ctx.report_work(1.5), {"status": "valid", "complete": True, "issues": []})[1],
        protocol="cooperative-v1",
    )
    with pytest.raises(UmfCoreError) as error:
        registry.check(ref("invalid-work"), None)
    assert error.value.code == "HOST_CONTROL"

    caught = SemanticTypeRegistry().register(
        ref("caught-invalid-work"), {},
        lambda _v, _d, ctx: _caught_invalid_work(ctx),
        protocol="cooperative-v1",
    )
    with pytest.raises(UmfCoreError) as error:
        caught.check(ref("caught-invalid-work"), None)
    assert error.value.code == "HOST_CONTROL"


def _caught_invalid_work(context):
    try:
        context.report_work(-1)
    except Exception:
        pass
    return {"status": "valid", "complete": True, "issues": []}


def test_frame_limit_cancellation_utf16_and_aggregate_order():
    oversized = SemanticTypeRegistry().register(
        ref("large"), {},
        lambda *_: {"status": "valid", "complete": True, "issues": ["x" * 1_100_000]},
        protocol="cooperative-v1",
    )
    with pytest.raises(UmfCoreError) as error:
        oversized.check(ref("large"), None)
    assert error.value.code == "RESOURCE_LIMIT"

    stopped = {"value": False}

    def cancel_after(_value, _definition, context):
        stopped["value"] = True
        context.report_work(1)
        return {"status": "valid", "complete": True, "issues": []}

    cancelled = SemanticTypeRegistry(is_cancelled=lambda: stopped["value"]).register(
        ref("cancel"), {}, cancel_after, protocol="cooperative-v1"
    )
    with pytest.raises(UmfCoreError) as error:
        cancelled.check(ref("cancel"), None)
    assert error.value.code in {"CANCELLED", "RESOURCE_LIMIT"}

    lone = "lone-\ud800"
    utf16 = SemanticTypeRegistry().register(
        {"vocabulary": "example.test", "version": "1.0.0", "term": lone}, {},
        lambda *_: {"status": "valid", "complete": True, "issues": []},
        protocol="cooperative-v1",
    )
    assert utf16.lookup({"vocabulary": "example.test", "version": "1.0.0", "term": lone}) == {}

    import json
    from pathlib import Path

    packet = json.loads(Path("docs/helix/04-build/evidence/rust-migration/r5-core-semantic-types/frozen-typescript.json").read_text())
    source = packet["cases"]["inspect"]["value"]["source"]
    source["modules"][0]["elements"][0]["semanticTypes"][0].pop("qualifier")
    identity = packet["cases"]["inspect"]["value"]["identity"]
    calls = []
    reference = source["modules"][0]["elements"][0]["semanticTypes"][0]
    aggregate = SemanticTypeRegistry().register(
        reference, {}, lambda value, _definition, _context: (calls.append(value) or {"status": "valid", "complete": True, "issues": []}),
        protocol="cooperative-v1",
    )
    from umf import validate_core_semantic_type_value

    result = validate_core_semantic_type_value(source, identity, None, aggregate)
    assert result["status"] == "valid"
    assert calls == [None]
