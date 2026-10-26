# SPDX-License-Identifier: MIT OR Apache-2.0
"""The private graph-validator seam is opt-in and translates closed replies."""

import json
from copy import deepcopy
from datetime import datetime
from importlib import import_module
from types import SimpleNamespace
from typing import ClassVar
from unittest.mock import patch

import pytest
from pydantic import BaseModel
from umf import _rust
from umf_access import rust_capture_observe, rust_catalog_render
from umf_access.capture import (
    CapturedParameter,
    CapturedVariant,
    CaptureError,
    _capture_with_validator,
    _validate_node,
    capture,
)
from umf_access.dsl import (
    Column,
    FieldRef,
    KeywordIndex,
    ManyNavigation,
    Param,
    Query,
    RecordRef,
    RequiredJoin,
    SearchLeg,
    Terminal,
    VectorIndex,
    avg_,
    command,
    hybrid,
    if_present,
    query,
    rrf,
    sum_,
)
from umf_access.dsl._expressions import operand
from umf_access.dsl._nodes import GeneratedSource, Node
from umf_access.dsl.navigation import RequiredNavigation
from umf_access.rust_catalog_render import (
    _encode_capture,
    _EncodingBudget,
    _validate_graph_variant,
)
from umf_access.types import MISSING, ActionRef, ActionSource, StrictModel, Vector

_ID = FieldRef(module="demo", element="Thing", field="id")
_QUERY = Query(RecordRef(module="demo", element="Thing", key=(_ID,)))


_GRAPH_SOURCE = GeneratedSource(
    "graph-validator-test", "0.10.0", "a" * 64, "b" * 64, "umf-access-runtime/0.1"
)
_CAPTURE_MODULE = import_module("umf_access.capture")


class ThingKey(BaseModel):
    id: int
    KEY_IDENTITY: ClassVar[dict[str, str]] = {
        "documentId": "graph-validator-test",
        "coreVersion": "0.10.0",
        "module": "demo",
        "element": "Thing",
        "key": "thing_id",
    }
    UMF_SOURCE: ClassVar[GeneratedSource] = _GRAPH_SOURCE


class OtherThingKey(BaseModel):
    id: int
    KEY_IDENTITY: ClassVar[dict[str, str]] = {
        **ThingKey.KEY_IDENTITY,
        "key": "other_id",
    }
    UMF_SOURCE: ClassVar[GeneratedSource] = _GRAPH_SOURCE


def test_private_opt_in_capture_accepts_closed_rust_response():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "accepted",
    }
    with patch.object(
        _rust._rust_core,
        "access_validate_captured_graph_variant_with_session",
        return_value=response,
        create=True,
    ) as validate, patch.object(
            _rust._rust_core,
            "access_orchestrate_capture_pair",
            side_effect=(
                {"profile": "umf-access-capture-orchestration/0.1.0", "outcome": "scheduled", "presences": [[]]},
                {"profile": "umf-access-capture-orchestration/0.1.0", "outcome": "accepted", "presences": []},
            ),
            create=True,
    ) as orchestrate, patch.object(
        _rust._rust_core,
        "access_validate_capture_exact_empty_terminal_with_session",
        wraps=_rust._rust_core.access_validate_capture_exact_empty_terminal_with_session,
    ) as exact_validate:
        captured = rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert len(captured.variants) == 1
    assert validate.call_count == 4
    assert orchestrate.call_count == 2
    assert exact_validate.call_count == 4


def test_private_opt_in_capture_maps_rust_signature_refusal():
    @query
    def declaration():
        return _QUERY.limit(1).all()

    response = {
        "profile": "umf-access-captured-graph-validation/0.1.0",
        "outcome": "refused",
        "kind": "capture-error",
        "code": "CAPTURE_SIGNATURE",
        "rule": "expression references an undeclared parameter",
    }
    with patch.object(
        _rust._rust_core,
        "access_validate_captured_graph_variant_with_session",
        return_value=response,
        create=True,
    ), pytest.raises(CaptureError) as caught:
        rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert caught.value.code == "CAPTURE_SIGNATURE"
    assert (
        str(caught.value)
        == "CAPTURE_SIGNATURE: expression references an undeclared parameter"
    )


def test_dto_free_exact_empty_all_matches_python_predecessor(monkeypatch):
    session = _rust._rust_core.CaptureResourceSession(100_000)
    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), ()))
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )
    assert result == {
        "profile": "umf-access-capture-exact-empty-terminal/0.3.0",
        "outcome": "accepted",
    }
    assert session.charged_work > 0
    _validate_node(node, ())

    @query
    def declaration():
        return Terminal(node)

    def no_dto(*_args, **_kwargs):
        raise AssertionError("accepted exact profile must not encode a tagged DTO")

    monkeypatch.setattr(rust_catalog_render, "_encode_capture", no_dto)
    captured = rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert captured.variants[0].node == node


@pytest.mark.parametrize("op", ["first", "one", "count", "exists", "group_count"])
def test_dto_free_exact_empty_terminal_matches_python_predecessor(monkeypatch, op):
    node = Node(op, (RecordRef("demo", "Thing", (_ID,)), ()))
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )
    assert result == {
        "profile": "umf-access-capture-exact-empty-terminal/0.3.0",
        "outcome": "accepted",
    }
    assert session.charged_work > 0
    _validate_node(node, ())

    @query
    def declaration():
        return Terminal(node)

    def no_dto(*_args, **_kwargs):
        raise AssertionError("accepted exact profile must not encode a tagged DTO")

    monkeypatch.setattr(rust_catalog_render, "_encode_capture", no_dto)
    captured = rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert captured.variants[0].node.op == op


@pytest.mark.parametrize("op", ["all", "first", "one", "count", "exists", "group_count"])
def test_public_capture_selects_exact_empty_terminal_profile(monkeypatch, op):
    record = RecordRef("demo", "Thing", (_ID,))
    node = Node(op, (record, ()))

    @query
    def declaration():
        return Terminal(node)

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    original = rust_capture_observe.validate_exact_empty_terminal_profile
    class UnexpectedPythonValidation:
        def __call__(self, *_args, **_kwargs):
            raise AssertionError("accepted exact profile must select Rust")

    monkeypatch.setattr(
        _CAPTURE_MODULE, "_validate_node", UnexpectedPythonValidation()
    )
    with patch.object(
        rust_capture_observe,
        "validate_exact_empty_terminal_profile",
        wraps=original,
    ) as validate:
        actual = capture(declaration)
    assert actual == expected
    assert validate.call_count == 4


def test_public_capture_oversized_record_dictionary_falls_back_before_reads():
    record = RecordRef("demo", "Thing", (_ID,))
    vars(record)["extra_a"] = 1

    @query
    def declaration():
        return Terminal(Node("all", (record, ())))

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    original = rust_capture_observe.validate_exact_empty_terminal_profile
    with patch.object(
        rust_capture_observe,
        "validate_exact_empty_terminal_profile",
        wraps=original,
    ) as validate:
        actual = capture(declaration)
    assert actual == expected
    assert validate.call_count == 4


def test_public_capture_oversized_node_dictionary_falls_back():
    record = RecordRef("demo", "Thing", (_ID,))
    node = Node("all", (record, ()))
    vars(node)["extra"] = 1

    @query
    def declaration():
        return Terminal(node)

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    assert capture(declaration) == expected


def test_public_capture_long_raw_key_falls_back_before_copy():
    record = RecordRef("demo", "Thing", (_ID,))
    fields = vars(record)
    del fields["logical_name"]
    fields["x" * 4096] = None

    @query
    def declaration():
        return Terminal(Node("all", (record, ())))

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    assert capture(declaration) == expected


def test_public_capture_custom_record_dictionary_key_falls_back_without_hooks():
    class TrapKey:
        armed = False

        def __hash__(self):
            if self.armed:
                raise AssertionError("capture admission must not hash a custom key")
            return hash("module")

        def __eq__(self, _other):
            if self.armed:
                raise AssertionError("capture admission must not compare a custom key")
            return False

    record = RecordRef("demo", "Thing", (_ID,))
    fields = vars(record)
    del fields["logical_name"]
    trap = TrapKey()
    fields[trap] = None
    trap.armed = True

    @query
    def declaration():
        return Terminal(Node("all", (record, ())))

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    assert capture(declaration) == expected


def test_public_capture_long_raw_op_falls_back_to_python_refusal():
    record = RecordRef("demo", "Thing", (_ID,))
    node = Node("x" * 4096, (record, ()))

    @query
    def declaration():
        return Terminal(node)

    with pytest.raises(CaptureError, match="unsupported terminal form"):
        capture(declaration)


def test_public_capture_falls_back_when_installed_core_lacks_profile(monkeypatch):
    record = RecordRef("demo", "Thing", (_ID,))

    @query
    def declaration():
        return Terminal(Node("all", (record, ())))

    expected = _capture_with_validator(
        declaration,
        lambda candidate, parameters, _presence: _validate_node(candidate, parameters),
    )
    monkeypatch.setattr(_rust, "_rust_core", SimpleNamespace())
    assert capture(declaration) == expected


def test_public_capture_preserves_patched_accessor_first_fault(monkeypatch):
    record = RecordRef("demo", "Thing", (_ID,))
    node = Node("all", (record, ()))
    sentinel = LookupError("patched Node accessor")
    reads = []
    original = Node.__getattribute__

    def patched(instance, name):
        if instance is node and name in {"op", "args"}:
            reads.append(name)
            raise sentinel
        return original(instance, name)

    monkeypatch.setattr(Node, "__getattribute__", patched)

    @query
    def declaration():
        return Terminal(node)

    with pytest.raises(LookupError) as caught:
        capture(declaration)
    assert caught.value is sentinel
    assert reads == ["op"]


def test_public_capture_with_parameters_keeps_parameter_map_first_fault(monkeypatch):
    record = RecordRef("demo", "Thing", (_ID,))
    node = Node("all", (record, ()))
    sentinel = LookupError("parameter map first fault")
    events = []

    class ParameterProbe:
        armed = False
        optional = True

        @property
        def name(self):
            events.append("parameter-map-name" if self.armed else "optional-name")
            if self.armed:
                raise sentinel
            return "value"

    probe = ParameterProbe()
    graph_reads = []
    original_getattribute = Node.__getattribute__

    def tracked_getattribute(instance, name):
        if instance is node and name in {"op", "args"}:
            graph_reads.append(name)
        return original_getattribute(instance, name)

    monkeypatch.setattr(Node, "__getattribute__", tracked_getattribute)
    monkeypatch.setattr(_CAPTURE_MODULE, "_parameters", lambda _function: (probe,))

    def invoke(_function, _parameters, presence, validator):
        probe.armed = True
        validator(node, (probe,), presence)

    monkeypatch.setattr(_CAPTURE_MODULE, "_invoke", invoke)
    declaration = lambda: None
    declaration.__umf_kind__ = "query"
    with patch.object(
        _rust._rust_core,
        "access_validate_capture_exact_empty_terminal_with_session",
        side_effect=AssertionError("parameterized capture must remain Python-selected"),
    ) as validate:
        with pytest.raises(LookupError) as caught:
            capture(declaration)
    assert caught.value is sentinel
    assert events == ["optional-name", "parameter-map-name"]
    assert graph_reads == ["op", "args", "args", "args", "args"]
    validate.assert_not_called()


def test_dto_free_validator_returns_outside_profile_before_graph_reads(monkeypatch):
    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), (Node("limit", (1,)),)))
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )
    assert result == {
        "profile": "umf-access-capture-exact-empty-terminal/0.3.0",
        "outcome": "outside-profile",
    }


def test_dto_free_validator_refuses_nonempty_steps_before_step_accessors():
    """The empty-terminal profile must fall back before inspecting step graphs."""
    reads: list[str] = []

    class ObservedStep(Node):
        def __getattribute__(self, name):
            if name in {"op", "args"}:
                reads.append(name)
                raise LookupError("step accessor belongs to Python fallback")
            return super().__getattribute__(name)

    step = object.__new__(ObservedStep)
    # Populate the instance dictionary without invoking the overridden accessor.
    object.__setattr__(step, "op", "limit")
    object.__setattr__(step, "args", (1,))
    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), (step,)))
    session = _rust._rust_core.CaptureResourceSession(100_000)

    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )

    assert result == {
        "profile": "umf-access-capture-exact-empty-terminal/0.3.0",
        "outcome": "outside-profile",
    }
    assert reads == []


def test_dto_free_validator_rejects_mutated_class_accessors_before_reads(monkeypatch):
    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), ()))
    reads: list[str] = []
    original = Node.__getattribute__
    sentinel = LookupError("graph accessor must stay untouched during admission")

    def patched_getattribute(instance, name):
        if instance is node:
            reads.append(name)
            raise sentinel
        return original(instance, name)

    monkeypatch.setattr(Node, "__getattribute__", patched_getattribute)
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )
    assert result["outcome"] == "outside-profile"
    assert reads == []


def test_dto_free_admission_rejects_custom_instance_dict_descriptor_before_getter():
    calls: list[str] = []

    class TrapMeta(type):
        @property
        def __dict__(cls):
            calls.append("class-__dict__")
            raise AssertionError("custom class dictionary descriptor must not run")

    class TrapNode(metaclass=TrapMeta):
        pass

    node = object.__new__(TrapNode)
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, TrapNode, RecordRef, session
    )
    assert result["outcome"] == "outside-profile"
    assert calls == []


def test_dto_free_admission_rejects_metaclass_spoof_named_type_before_getter():
    calls: list[str] = []

    class SpoofMeta(type):
        def __getattribute__(cls, name):
            calls.append(name)
            raise AssertionError("spoof metaclass lookup must not run")

    SpoofMeta.__name__ = "type"
    spoof_node_type = SpoofMeta("SpoofNode", (), {})
    node = object.__new__(spoof_node_type)
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, spoof_node_type, RecordRef, session
    )
    assert result["outcome"] == "outside-profile"
    assert calls == []


def test_dto_free_raw_key_admission_never_hashes_custom_dict_keys():
    class TrapKey:
        armed = False

        def __hash__(self):
            if self.armed:
                raise AssertionError("raw admission must not hash custom keys")
            return 17

        def __eq__(self, other):
            if self.armed:
                raise AssertionError("raw admission must not compare custom keys")
            return self is other

    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), ()))
    key = TrapKey()
    vars(node)[key] = "ignored by Python validator"
    key.armed = True
    session = _rust._rust_core.CaptureResourceSession(100_000)
    result = _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
        node, Node, RecordRef, session
    )
    assert result["outcome"] == "outside-profile"


def test_dto_free_validator_resource_limit_precedes_graph_accessor_reads(monkeypatch):
    node = Node("all", (RecordRef("demo", "Thing", (_ID,)), ()))
    reads: list[str] = []
    original = Node.__getattribute__

    def trapped_getattribute(instance, name):
        if instance is node:
            reads.append(name)
            raise AssertionError("resource cap must stop before graph reads")
        return original(instance, name)

    monkeypatch.setattr(Node, "__getattribute__", trapped_getattribute)
    session = _rust._rust_core.CaptureResourceSession(0)
    with pytest.raises(ValueError, match="capture resource limit exceeded"):
        _rust._rust_core.access_validate_capture_exact_empty_terminal_with_session(
            node, Node, RecordRef, session
        )
    assert reads == []
    assert session.charged_work == 0


def test_private_opt_in_nonempty_parameters_fall_back_before_parameter_reads(monkeypatch):
    @query
    def declaration(parameter: Param[int]):
        return _QUERY.all()

    def forbidden(*_args, **_kwargs):
        raise AssertionError("nonempty parameters must use the original DTO path")

    monkeypatch.setattr(
        _rust._rust_core,
        "access_validate_capture_exact_empty_terminal_with_session",
        forbidden,
        raising=False,
    )
    encode = rust_catalog_render._encode_capture
    calls = []

    def tracked_encode(*args, **kwargs):
        calls.append(args[0])
        return encode(*args, **kwargs)

    monkeypatch.setattr(rust_catalog_render, "_encode_capture", tracked_encode)
    rust_catalog_render.capture_with_rust_graph_validator(declaration)
    assert calls


def test_live_rust_validator_matches_get_page_selected_key_preflight_order():
    identifier = FieldRef("demo", "Thing", "id", source=_GRAPH_SOURCE)
    foreign_field = FieldRef("foreign", "Elsewhere", "value")
    owner = RecordRef(
        "demo", "Thing", (identifier,), source=_GRAPH_SOURCE, key_id="thing_id"
    )

    @query
    def get_valid(key: Param[ThingKey]):
        return Query(owner).get(key)

    @query
    def page_valid(key: Param[ThingKey | None]):
        return Query(owner).page(size=10, after=key)

    for declaration in (get_valid, page_valid):
        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)

    wrong_selected_identity = tuple(
        sorted({**ThingKey.KEY_IDENTITY, "key": "other_id"}.items())
    )
    foreign_identity = tuple(
        sorted({**ThingKey.KEY_IDENTITY, "element": "Elsewhere"}.items())
    )

    def crossed(variant, op: str, key_node: Node):
        args = variant.node.args
        steps = args[1] + (
            Node(
                "filter",
                (
                    Node(
                        "=",
                        (Node("column", (foreign_field,)), Node("literal", ("x",))),
                    ),
                ),
            ),
        )
        if op == "get":
            node_args = (args[0], steps, key_node)
        else:
            node_args = (
                args[0],
                steps,
                args[2],
                key_node,
            )
        return Node(op, node_args)

    for declaration, op in ((get_valid, "get"), (page_valid, "page")):
        variant = capture(declaration).variants[0]
        params = variant.parameters
        for key_node, code, message in (
            (
                Node("key_param", ("key", ("id",), wrong_selected_identity)),
                "CAPTURE_SIGNATURE",
                "Key differs from selected Record Key",
            ),
            (
                Node("key_param", ("key", ("id",), foreign_identity)),
                "CAPTURE_SIGNATURE",
                "Key belongs to another Record",
            ),
            (
                operand(OtherThingKey(id=7)),
                "CAPTURE_SIGNATURE",
                "Key differs from selected Record Key",
            ),
        ):
            node = crossed(variant, op, key_node)
            dto = _encode_capture(
                type(variant)(variant.presence, node, params), _EncodingBudget()
            )
            with pytest.raises(CaptureError) as predecessor:
                _validate_node(node, params)
            with pytest.raises(CaptureError) as rust:
                _validate_graph_variant(dto)
            expected = (code, f"{code}: {message}")
            assert (predecessor.value.code, str(predecessor.value)) == expected
            assert (rust.value.code, str(rust.value)) == expected


@pytest.mark.parametrize("faulting_name", ["op", "args"])
@pytest.mark.parametrize("terminal_op", ["get", "page"])
def test_selected_key_observer_preserves_key_fault_before_root_owner(faulting_name, terminal_op):
    sentinel = LookupError(f"key {faulting_name} sentinel")
    root_sentinel = LookupError("repeated root module sentinel")
    key = Node("key_param", ("key", (), (("module", "demo"), ("element", "Thing"))))
    record = RecordRef("demo", "Thing", (_ID,), source=_GRAPH_SOURCE, key_id="thing_id")
    original_node_getattribute = Node.__getattribute__
    original_record_getattribute = RecordRef.__getattribute__
    module_reads = 0

    def node_getattribute(instance, name):
        if instance is key and name == faulting_name:
            raise sentinel
        return original_node_getattribute(instance, name)

    def record_getattribute(instance, name):
        nonlocal module_reads
        if instance is record and name == "module":
            module_reads += 1
            if module_reads == 2:
                raise root_sentinel
        return original_record_getattribute(instance, name)

    with patch.object(Node, "__getattribute__", node_getattribute), patch.object(
        RecordRef, "__getattribute__", record_getattribute
    ):
        terminal_args = (record, (), key) if terminal_op == "get" else (record, (), 10, key)
        predecessor_node = Node(terminal_op, terminal_args)
        with pytest.raises(LookupError) as predecessor:
            _validate_node(predecessor_node, ())
        assert predecessor.value is sentinel
        module_reads = 0
        session = _rust._rust_core.CaptureResourceSession(100)
        # The observer's explicit precondition: the earlier terminal/root pass
        # has already read the root owner once.
        session.charge_work(2)
        _ = record.module
        _ = record.element
        with pytest.raises(LookupError) as error:
            rust_capture_observe.observe_selected_key_preflight(
                key, record, terminal_op, session
            )
    assert error.value is sentinel
    expected_work = 3 if faulting_name == "op" else 4
    assert session.charged_work == expected_work


def test_selected_key_observer_preserves_key_id_before_source_fault_identity():
    trace = []
    source_sentinel = LookupError("source sentinel")
    key = Node("key_param", ("key", (), (("module", "demo"), ("element", "Thing"))))
    record = RecordRef("demo", "Thing", (_ID,), source=_GRAPH_SOURCE, key_id="thing_id")
    original_record_getattribute = RecordRef.__getattribute__

    def record_getattribute(instance, name):
        if instance is record and name in {"module", "element", "key_id", "source"}:
            trace.append(name)
        if instance is record and name == "source":
            raise source_sentinel
        return original_record_getattribute(instance, name)

    with patch.object(RecordRef, "__getattribute__", record_getattribute):
        predecessor_node = Node("get", (record, (), key))
        with pytest.raises(LookupError) as predecessor:
            _validate_node(predecessor_node, ())
        predecessor_trace = list(trace)
        assert predecessor.value is source_sentinel
        trace.clear()
        session = _rust._rust_core.CaptureResourceSession(100)
        session.charge_work(2)
        _ = record.module
        _ = record.element
        with pytest.raises(LookupError) as error:
            rust_capture_observe.observe_selected_key_preflight(
                key, record, "page", session
            )
    assert error.value is source_sentinel
    assert trace == ["module", "element", "module", "element", "key_id", "source"]
    assert trace == predecessor_trace
    assert session.charged_work == 10


def test_selected_key_observer_preserves_dict_missing_identity_keyerror():
    key = Node("key_param", ("key", (), (("element", "Thing"),)))
    record = RecordRef("demo", "Thing", (_ID,))
    session = _rust._rust_core.CaptureResourceSession(100)
    with pytest.raises(KeyError, match="module") as error:
        rust_capture_observe.observe_selected_key_preflight(key, record, "get", session)
    assert error.value.args == ("module",)


def test_selected_key_observer_uses_python_dict_duplicate_key_semantics():
    key = Node(
        "key_param",
        (
            "key",
            (),
            (("module", "foreign"), ("module", "demo"), ("element", "Thing")),
        ),
    )
    record = RecordRef("demo", "Thing", (_ID,))
    session = _rust._rust_core.CaptureResourceSession(100)
    assert (
        rust_capture_observe.observe_selected_key_preflight(key, record, "get", session)
        == "accepted"
    )


def test_selected_key_observer_preserves_tuple_comparison_order_for_dynamic_owner_values():
    comparisons = []

    class OwnerModule:
        def __hash__(self):
            return 1

        def __eq__(self, other):
            comparisons.append(("module", other))
            return other == "demo"

    value = OwnerModule()
    key = Node("key_param", ("key", (), (("module", "demo"), ("element", "Thing"))))
    record = RecordRef("demo", "Thing", (_ID,))
    original_record_getattribute = RecordRef.__getattribute__

    def record_getattribute(instance, name):
        if instance is record and name == "module":
            return value
        return original_record_getattribute(instance, name)

    with patch.object(RecordRef, "__getattribute__", record_getattribute):
        predecessor_node = Node("get", (record, (), key))
        with pytest.raises(CaptureError):
            _validate_node(predecessor_node, ())
        predecessor_comparisons = list(comparisons)
        comparisons.clear()
        session = _rust._rust_core.CaptureResourceSession(100)
        _ = record.module
        _ = record.element
        outcome = rust_capture_observe.observe_selected_key_preflight(
            key, record, "get", session
        )
    assert outcome == "accepted"
    assert comparisons == predecessor_comparisons == [("module", "demo")]


def test_selected_key_observer_falls_back_for_subclasses_before_graph_reads():
    reads = []

    class DerivedNode(Node):
        def __getattribute__(self, name):
            if name in {"op", "args"}:
                reads.append(name)
                raise AssertionError("subclass graph access must remain untouched")
            return super().__getattribute__(name)

    node = object.__new__(DerivedNode)
    record = RecordRef("demo", "Thing", (_ID,))
    session = _rust._rust_core.CaptureResourceSession(100)
    assert (
        rust_capture_observe.observe_selected_key_preflight(
            node, record, "get", session
        )
        == "outside-profile"
    )
    assert reads == []
    assert session.charged_work == 0


def test_selected_key_observer_never_falls_back_after_a_live_shape_change():
    key = Node("key_param", ("key", (), (("module", "demo"), ("element", "Thing"))))
    record = RecordRef("demo", "Thing", (_ID,))
    original = Node.__getattribute__
    reads = []

    def stateful(instance, name):
        if instance is key and name == "op":
            reads.append(name)
            if len(reads) == 1:
                return "key"
            raise AssertionError("a retry would duplicate the consumed getter")
        return original(instance, name)

    with patch.object(Node, "__getattribute__", stateful):
        session = _rust._rust_core.CaptureResourceSession(100)
        outcome = rust_capture_observe.observe_selected_key_preflight(
            key, record, "get", session
        )
    assert outcome == "unsupported-after-read"
    assert reads == ["op"]


def test_private_rust_route_fails_closed_on_subclass_accessor_semantics():
    owner = RecordRef("demo", "Thing", (FieldRef("demo", "Thing", "id"),))

    class OverrideModuleField(FieldRef):
        def __getattribute__(self, name):
            if name == "module":
                return "demo"
            if name == "element":
                return "Thing"
            return super().__getattribute__(name)

    hidden_foreign = OverrideModuleField("foreign", "Elsewhere", "value")
    predicate = Node(
        "=", (Node("column", (hidden_foreign,)), Node("literal", ("x",)))
    )

    @query
    def hidden_owner():
        return Terminal(
            Node("all", (owner, (Node("filter", (predicate,)), Node("limit", (1,)))))
        )

    # The Python predecessor observes the overridden accessor and accepts the
    # field as root-owned. The closed DTO cannot preserve that behavior.
    captured = capture(hidden_owner)
    assert captured.variants[0].node.op == "all"
    assert hidden_foreign.module == "demo"
    calls = []
    native = _rust._rust_core.access_validate_captured_graph_variant

    def record_native(value):
        calls.append(value)
        return native(value)

    with patch.object(
        _rust._rust_core,
        "access_validate_captured_graph_variant",
        side_effect=record_native,
    ), pytest.raises(
        TypeError, match="captured graph subclass overrides trusted field access"
    ):
        rust_catalog_render.capture_with_rust_graph_validator(hidden_owner)
    assert calls == []


def test_subclass_accessor_refusal_precedes_later_parameter_in_both_capture_paths():
    owner = RecordRef("demo", "Thing", (FieldRef("demo", "Thing", "id"),))

    class ForeignModuleField(FieldRef):
        def __getattribute__(self, name):
            if name == "module":
                return "foreign"
            return super().__getattribute__(name)

    column = Node("column", (ForeignModuleField("demo", "Thing", "value"),))
    missing = Node("param", ("missing",))

    def declaration_for(children):
        @query
        def declaration():
            return Terminal(
                Node("all", (owner, (Node("filter", (Node("and", children),)),)))
            )

        return declaration

    for declaration, exception, message in (
        (
            declaration_for((column, missing)),
            TypeError,
            "expression column belongs to another Record",
        ),
        (
            declaration_for((missing, column)),
            CaptureError,
            "CAPTURE_SIGNATURE: expression references an undeclared parameter",
        ),
    ):
        outcomes = []
        for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
            with pytest.raises(exception) as caught:
                capture_fn(declaration)
            outcomes.append(str(caught.value))
        assert outcomes == [message, message], (declaration.__name__, outcomes)


def test_python_graph_refusal_precedes_private_bridge_depth_and_value_budgets():
    owner = RecordRef("demo", "Thing", (FieldRef("demo", "Thing", "id"),))
    foreign = FieldRef("foreign", "Elsewhere", "value")

    def graph(depth: int, padding: int = 0):
        expression = Node("column", (foreign,))
        for _ in range(depth):
            expression = Node("not", (expression,))
        children = [expression, Node("param", ("missing",))]
        children.extend(Node("literal", ("x",)) for _ in range(padding))
        node = Node("all", (owner, (Node("filter", (Node("and", tuple(children)),)),)))

        @query
        def declaration():
            return Terminal(node)

        return declaration, node

    # A valid DTO within both native Context limits reaches Rust and returns
    # the same first semantic refusal as Python.
    _, shallow_node = graph(8)
    shallow_dto = _encode_capture(
        CapturedVariant((), shallow_node, ()), _EncodingBudget()
    )
    with pytest.raises(TypeError, match="expression column belongs to another Record"):
        _validate_node(shallow_node, ())
    with pytest.raises(TypeError, match="expression column belongs to another Record"):
        _validate_graph_variant(shallow_dto)

    # The private route has stricter 64-level/50,000-value limits. When
    # encoding reaches those limits, predecessor validation still decides
    # whether an earlier semantic refusal wins.
    for declaration, node in (graph(140), graph(0, 18_000)):
        with pytest.raises(TypeError, match="expression column belongs to another Record"):
            capture(declaration)
        with pytest.raises(TypeError, match="expression column belongs to another Record"):
            rust_catalog_render.capture_with_rust_graph_validator(declaration)
        with pytest.raises(ValueError, match="captured declaration exceeds Rust bridge resource limits"):
            _encode_capture(CapturedVariant((), node, ()), _EncodingBudget())

    accepted_node = Node(
        "all",
        (
            owner,
            tuple(
                Node(
                    "filter",
                    (
                        Node(
                            "=",
                            (
                                Node("column", (owner.key[0],)),
                                Node("literal", (index,)),
                            ),
                        ),
                    ),
                )
                for index in range(18_000)
            )
            + (Node("limit", (1,)),),
        ),
    )

    @query
    def accepted_oversized_graph():
        return Terminal(accepted_node)

    _validate_node(accepted_node, ())
    capture(accepted_oversized_graph)
    with pytest.raises(
        ValueError, match="captured declaration exceeds Rust bridge resource limits"
    ):
        rust_catalog_render.capture_with_rust_graph_validator(accepted_oversized_graph)


def test_live_rust_validator_matches_python_capture_for_join_and_many_navigation():
    source = GeneratedSource(
        "graph-validator-test", "0.10.0", "a" * 64, "b" * 64, "umf-access-runtime/0.1"
    )

    def record(name: str, key_name: str) -> RecordRef:
        field = FieldRef("demo", name, key_name, source=source)
        return RecordRef("demo", name, (field,), source=source, key_id=key_name)

    owner = record("Owner", "owner_id")
    target = record("Target", "target_id")
    ref = FieldRef("demo", "Owner", "target_id", source=source)
    inverse_key = record("Owner", "inverse_owner_id")

    join = RequiredNavigation(
        ref,
        target,
        source_query=owner,
        target_query=target,
        inverse_key_target=inverse_key,
    )
    many = ManyNavigation(
        ref,
        key_target=target,
        source_query=owner,
        target_query=target,
        inverse_key_target=inverse_key,
    )

    def declaration_for(selected, relationship, inverse):
        @query
        def declaration():
            navigation = relationship.inverse() if inverse else relationship
            return Query(selected).related(navigation).limit(1).all()

        return declaration

    for selected, relationship in (
        (owner, join),
        (target, join),
        (owner, many),
        (target, many),
    ):
        inverse = selected == target

        declaration = declaration_for(selected, relationship, inverse)

        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)


def test_live_rust_validator_matches_two_hop_aliased_join_owner_order():
    root = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    middle_alias = "demo:test:middle"
    middle = RecordRef(
        "demo",
        "Middle",
        (FieldRef("demo", "Middle", "id", alias=middle_alias),),
        alias=middle_alias,
    )
    leaf = RecordRef("demo", "Leaf", (FieldRef("demo", "Leaf", "id"),))
    first = RequiredJoin(
        FieldRef("demo", "Owner", "middle_id"), middle, key_target=middle
    )
    second = RequiredJoin(
        FieldRef("demo", "Middle", "leaf_id", alias=middle_alias), leaf
    )
    leaf_field = FieldRef("demo", "Leaf", "name")

    @query
    def two_hop(status: Param[str]):
        return Terminal(
            Node(
                "all",
                (
                    root,
                    (
                        Node("join", (first,)),
                        Node("join", (second,)),
                        Node(
                            "filter",
                            (
                                Node(
                                    "=",
                                    (Node("column", (leaf_field,)), Node("param", ("status",))),
                                ),
                            ),
                        ),
                        Node("limit", (1,)),
                    ),
                ),
            )
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(two_hop) == capture(
        two_hop
    )

    absent_source = RequiredJoin(
        FieldRef("demo", "Middle", "leaf_id"), leaf
    )

    @query
    def crossed_fault(status: Param[str]):
        return Terminal(
            Node(
                "all",
                (
                    root,
                    (
                        Node("join", (first,)),
                        Node("join", (absent_source,)),
                        Node(
                            "filter",
                            (
                                Node(
                                    "=",
                                    (
                                        Node("column", (FieldRef("other", "Foreign", "x"),)),
                                        Node("param", ("status",)),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            )
        )

    errors = []
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(crossed_fault)
        errors.append((caught.value.code, str(caught.value)))
    assert errors[0] == errors[1] == (
        "CAPTURE_UNSUPPORTED",
        "CAPTURE_UNSUPPORTED: join source is absent",
    )


def test_live_rust_validator_matches_python_search_leg_capture_and_refusals():
    source = GeneratedSource(
        "search-graph-test", "0.10.0", "c" * 64, "d" * 64, "umf-access-runtime/0.1"
    )

    def record(name: str) -> RecordRef:
        field = FieldRef("demo", name, "id", source=source)
        return RecordRef("demo", name, (field,), source=source, key_id="id")

    owner = record("Owner")
    foreign = record("Other")
    keyword_index = KeywordIndex(owner, '{"kind":"keyword"}')
    vector_index = VectorIndex(owner, '{"kind":"vector"}')

    @query
    def accepted(text: Param[str]):
        return Query(owner).search(keyword_index.matches(text)).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )
    accepted_variant = capture(accepted).variants[0]
    accepted_dto = _encode_capture(accepted_variant, _EncodingBudget())

    @query
    def accepted_vector(vector: Param[Vector]):
        return Query(owner).search(vector_index.near_vector(vector)).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_vector
    ) == capture(accepted_vector)
    vector_dto = _encode_capture(
        capture(accepted_vector).variants[0], _EncodingBudget()
    )
    vector_carrier = vector_dto["fields"]["parameters"]["$tuple"][0]["fields"][
        "carrier"
    ]
    assert vector_carrier == {
        "$typing": "builtins.tuple",
        "args": [{"$typeRef": "builtins.float"}, {"$ellipsis": True}],
    }

    @query
    def accepted_nested(text: Param[str]):
        leg = hybrid(
            keyword_index.matches(text),
            vector_index.near(text),
            fusion=rrf(),
        )
        return Query(owner).search(leg).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_nested
    ) == capture(accepted_nested)

    @query
    def foreign_precedes_unbound():
        leg = SearchLeg(foreign, "keyword", None, Node("literal", ("x",)))
        return Terminal(Node("search_top", (owner, (), leg, 5, False)))

    @query
    def unbound():
        leg = SearchLeg(owner, "keyword", None, Node("literal", ("x",)))
        return Terminal(Node("search_top", (owner, (), leg, 5, False)))

    @query
    def carrier_mismatch(text: Param[str]):
        return Query(owner).search(vector_index.near_vector(text)).top(5)

    python_errors = []
    for declaration, code, message in (
        (foreign_precedes_unbound, "SEARCH_DECLARATION", "foreign search Record"),
        (unbound, "SEARCH_DECLARATION", "search requires bound parameters"),
        (
            carrier_mismatch,
            "CAPTURE_SIGNATURE",
            "search parameter carrier differs from selected leg",
        ),
    ):
        with pytest.raises(CaptureError) as python_error:
            capture(declaration)
        python_errors.append(python_error.value)

    # Exercise the Rust seam directly with minimally mutated captured DTOs;
    # the orchestration helper correctly runs Python capture first.
    mutations = []
    for change in ("foreign", "unbound", "vector-carrier"):
        dto = deepcopy(accepted_dto)
        node_args = dto["fields"]["node"]["fields"]["args"]["$tuple"]
        leg_fields = node_args[2]["fields"]
        if change == "foreign":

            @query
            def foreign_owner_valid(text: Param[str]):
                return (
                    Query(foreign)
                    .search(KeywordIndex(foreign, '{"kind":"keyword"}').matches(text))
                    .top(5)
                )

            foreign_dto = _encode_capture(
                capture(foreign_owner_valid).variants[0], _EncodingBudget()
            )
            leg_fields["record"] = foreign_dto["fields"]["node"]["fields"]["args"][
                "$tuple"
            ][2]["fields"]["record"]
        elif change == "unbound":
            leg_fields["value"]["fields"]["op"] = "literal"
        else:
            leg_fields["kind"] = "vector"
        mutations.append(dto)

    for dto, python_error, code, message in zip(
        mutations,
        python_errors,
        ("SEARCH_DECLARATION", "SEARCH_DECLARATION", "CAPTURE_SIGNATURE"),
        (
            "foreign search Record",
            "search requires bound parameters",
            "search parameter carrier differs from selected leg",
        ),
    ):
        with pytest.raises(CaptureError) as rust_error:
            _validate_graph_variant(dto)
        assert (rust_error.value.code, str(rust_error.value)) == (
            python_error.code,
            str(python_error),
        )
        assert rust_error.value.code == code
        assert str(rust_error.value).endswith(message)


def test_live_rust_validator_matches_optional_filter_placement_refusal():
    source = GeneratedSource(
        "optional-filter-test", "0.10.0", "e" * 64, "f" * 64, "umf-access-runtime/0.1"
    )
    identifier = FieldRef("demo", "Owner", "id", source=source)
    status = Column(FieldRef("demo", "Owner", "status", source=source))
    owner = RecordRef("demo", "Owner", (identifier,), source=source, key_id="id")

    @query
    def accepted_optional(value: Param[str | MISSING]):
        return (
            Query(owner)
            .filter(if_present(value, lambda item: status == item))
            .limit(1)
            .all()
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_optional
    ) == capture(accepted_optional)

    @query
    def nested_optional(value: Param[str | MISSING]):
        optional = if_present(value, lambda item: status == item)
        return Query(owner).filter(optional & (status == "fixed")).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(nested_optional)
        assert caught.value.code == "CAPTURE_UNSUPPORTED"
        assert str(caught.value) == (
            "CAPTURE_UNSUPPORTED: optional filters must be top-level filter arguments"
        )


def test_live_rust_validator_matches_temporal_parameter_profile_refusal():
    instant = Column(FieldRef("demo", "Owner", "instant", temporal="instant"))
    local = Column(FieldRef("demo", "Owner", "local", temporal="local"))
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),), key_id="id")

    @query
    def accepted(value: Param[datetime]):
        return Query(owner).filter(instant == value, instant == value).limit(1).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )

    @query
    def incompatible(value: Param[datetime]):
        return Query(owner).filter(instant == value, local == value).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(incompatible)
        assert caught.value.code == "CAPTURE_UNSUPPORTED"
        assert str(caught.value) == (
            "CAPTURE_UNSUPPORTED: parameter spans incompatible temporal profiles"
        )


def test_live_rust_validator_matches_aggregate_and_bucket_checks():
    source = GeneratedSource(
        "scalar-graph-test", "0.10.0", "9" * 64, "8" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    amount = Column(FieldRef("demo", "Owner", "amount", source=source))
    instant = Column(
        FieldRef("demo", "Owner", "instant", temporal="instant", source=source)
    )

    @query
    def accepted_scalars():
        return (
            Query(owner)
            .select(sum_(amount), avg_(amount, scale=2), amount.bucket_width(10))
            .limit(1)
            .all()
        )

    assert rust_catalog_render.capture_with_rust_graph_validator(
        accepted_scalars
    ) == capture(accepted_scalars)

    def manual_scalar(expression: Node):
        @query
        def declaration():
            return Terminal(
                Node(
                    "all",
                    (owner, (Node("select", (expression,)), Node("limit", (1,)))),
                )
            )

        return declaration

    cases = (
        (
            Node("aggregate", ("unknown", amount.ref)),
            "CAPTURE_UNSUPPORTED: unknown scalar expression",
        ),
        (
            Node("aggregate", ("unknown", instant.ref, None)),
            "CAPTURE_UNSUPPORTED: unknown aggregate operation",
        ),
        (
            Node("aggregate", ("avg", instant.ref, 1001)),
            "CAPTURE_UNSUPPORTED: temporal aggregate qualification is held",
        ),
        (
            Node("aggregate", ("avg", amount.ref, 1001)),
            "CAPTURE_UNSUPPORTED: average requires bounded literal scale",
        ),
        (
            Node("bucket_width", (None, 1)),
            "CAPTURE_UNSUPPORTED: unknown scalar expression",
        ),
    )
    for expression, expected_message in cases:
        declaration = manual_scalar(expression)
        errors = []
        for capture_fn in (
            capture,
            rust_catalog_render.capture_with_rust_graph_validator,
        ):
            with pytest.raises(CaptureError) as caught:
                capture_fn(declaration)
            errors.append((caught.value.code, str(caught.value)))
        assert errors[0] == errors[1]
        assert errors[0] == ("CAPTURE_UNSUPPORTED", expected_message)


def test_live_rust_validator_matches_read_terminal_shapes_and_precedence():
    source = GeneratedSource(
        "read-terminal-test", "0.10.0", "7" * 64, "6" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    category = Column(FieldRef("demo", "Owner", "category", source=source))

    @query
    def first():
        return Query(owner).first()

    @query
    def one():
        return Query(owner).one()

    @query
    def count():
        return Query(owner).count()

    @query
    def exists():
        return Query(owner).exists()

    @query
    def group_count():
        return Query(owner).group_by(category).limit(5).count()

    for declaration in (first, one, count, exists, group_count):
        assert rust_catalog_render.capture_with_rust_graph_validator(
            declaration
        ) == capture(declaration)

    @query
    def scalar_count_precedence():
        # The scalar-terminal restriction runs before aggregate validation.
        return Terminal(
            Node(
                "count",
                (
                    owner,
                    (
                        Node(
                            "select",
                            (Node("aggregate", ("unknown", category.ref, None)),),
                        ),
                    ),
                ),
            )
        )

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(scalar_count_precedence)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: scalar aggregate/bucket projection does not admit this terminal",
        )

    @query
    def unsupported_terminal():
        return Terminal(Node("mystery", (owner, ())))

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(unsupported_terminal)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: unsupported terminal form",
        )


def test_live_rust_validator_matches_update_assignment_walk():
    source = GeneratedSource(
        "update-graph-test", "0.10.0", "5" * 64, "4" * 64, "umf-access-runtime/0.1"
    )
    owner = RecordRef(
        "demo",
        "Owner",
        (FieldRef("demo", "Owner", "id", source=source),),
        source=source,
    )
    mutable_status = FieldRef("demo", "Owner", "status", source=source)

    class UpdateQuery(Query):
        UMF_UPDATE_FIELDS: ClassVar[dict[str, FieldRef]] = {"status": mutable_status}

        def update(self, **values):
            return self._update(values)

    class UpdateInput(StrictModel):
        status: str

    action = ActionRef(
        module="demo",
        action="set-status",
        input_type=UpdateInput,
        output_type=type(None),
        source=ActionSource(
            "update-graph-test",
            "0.10.0",
            "demo",
            "set-status",
            "5" * 64,
            "/modules/0/extensions/umf.actions/actions/0",
            "umf.actions.tx",
            "1",
        ),
    )

    @command(action=action)
    def accepted(status: Param[str]):
        return UpdateQuery(owner).update(status=status)

    assert rust_catalog_render.capture_with_rust_graph_validator(accepted) == capture(
        accepted
    )

    def manual_update(field: FieldRef, value: Node):
        @query
        def declaration():
            return Terminal(Node("update", (owner, (), ((field, value),))))

        return declaration

    undeclared = manual_update(mutable_status, Node("param", ("missing",)))
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(CaptureError) as caught:
            capture_fn(undeclared)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_SIGNATURE",
            "CAPTURE_SIGNATURE: expression references an undeclared parameter",
        )

    foreign_before_missing = manual_update(
        FieldRef("demo", "Other", "status", source=source),
        Node("param", ("missing",)),
    )
    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        with pytest.raises(TypeError) as caught:
            capture_fn(foreign_before_missing)
        assert str(caught.value) == "expression column belongs to another Record"


def test_rust_capture_orchestration_matches_python_precedence_and_call_counts():
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    status = Column(FieldRef("demo", "Owner", "status"))
    calls = {"nondeterministic": 0}

    @query
    def ordered(first: Param[str | MISSING], second: Param[str | MISSING]):
        return Query(owner).filter(
            if_present(second, lambda _item: status == "second"),
            if_present(first, lambda _item: status == "first"),
        ).limit(1).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(ordered) == capture(
        ordered
    )
    assert [variant.presence for variant in capture(ordered).variants] == [
        (),
        ("first",),
        ("second",),
        ("first", "second"),
    ]

    calls["limit"] = 0

    @query
    def over_limit(
        a: Param[str | MISSING],
        b: Param[str | MISSING],
        c: Param[str | MISSING],
        d: Param[str | MISSING],
        e: Param[str | MISSING],
    ):
        calls["limit"] += 1
        return Query(owner).filter(
            if_present(a, lambda _item: status == "a"),
            if_present(b, lambda _item: status == "b"),
            if_present(c, lambda _item: status == "c"),
            if_present(d, lambda _item: status == "d"),
            if_present(e, lambda _item: status == "e"),
        ).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["limit"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(over_limit)
        assert (caught.value.code, str(caught.value)) == (
            "VARIANT_LIMIT",
            "VARIANT_LIMIT: optional filters exceed 16 variants",
        )
        assert calls["limit"] == 2

    @query
    def nondeterministic():
        calls["nondeterministic"] += 1
        return Query(owner).limit(calls["nondeterministic"]).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["nondeterministic"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(nondeterministic)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_NONDETERMINISTIC",
            "CAPTURE_NONDETERMINISTIC: two captures differ",
        )
        assert calls["nondeterministic"] == 2

    @query
    def topology(value: Param[str | MISSING]):
        calls["topology"] += 1
        predicate = (
            if_present(value, lambda _item: status == "fixed")
            if calls["topology"] <= 2
            else status == "fixed"
        )
        return Query(owner).filter(predicate).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["topology"] = 0

        with pytest.raises(CaptureError) as caught:
            capture_fn(topology)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: optional-filter topology changes across variants",
        )
        assert calls["topology"] == 4

    action = ActionRef(
        module="demo", action="read-mismatch", input_type=StrictModel,
        output_type=type(None), source=ActionSource("doc", "0.10.0", "demo", "read-mismatch", "a" * 64, "/modules/0/extensions/umf.actions/actions/0", "umf.actions.tx", "1"),
    )
    calls["topology_precedence"] = 0

    @command(action=action)
    def topology_before_write_read_check(value: Param[str | MISSING]):
        calls["topology_precedence"] += 1
        predicate = (
            if_present(value, lambda _item: status == "fixed")
            if calls["topology_precedence"] <= 2
            else status == "fixed"
        )
        return Query(owner).filter(predicate).limit(1).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["topology_precedence"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(topology_before_write_read_check)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: optional-filter topology changes across variants",
        )
        assert calls["topology_precedence"] == 4

    calls["mismatch"] = 0

    @command(action=action)
    def mismatch():
        calls["mismatch"] += 1
        return Query(owner).all()

    for capture_fn in (capture, rust_catalog_render.capture_with_rust_graph_validator):
        calls["mismatch"] = 0
        with pytest.raises(CaptureError) as caught:
            capture_fn(mismatch)
        assert (caught.value.code, str(caught.value)) == (
            "CAPTURE_UNSUPPORTED",
            "CAPTURE_UNSUPPORTED: writes require command and reads require query",
        )
        assert calls["mismatch"] == 4


def test_rust_pair_comparison_precedes_terminal_dto_admission():
    owner = RecordRef("demo", "Owner", (FieldRef("demo", "Owner", "id"),))
    count = 0

    class UnsupportedNode(Node):
        pass

    @query
    def changing_shape():
        nonlocal count
        count += 1
        return Terminal(UnsupportedNode("all", (owner, (Node("limit", (count,)),))))

    # Isolate orchestration precedence from the preceding per-invocation graph
    # validator. Once a pair reaches Rust, differing canonical bytes win before
    # terminal shape inspection.
    with patch.object(
        rust_catalog_render, "_validate_graph_variant", return_value=None
    ), pytest.raises(CaptureError) as caught:
        rust_catalog_render.capture_with_rust_graph_validator(changing_shape)
    assert (caught.value.code, str(caught.value)) == (
        "CAPTURE_NONDETERMINISTIC",
        "CAPTURE_NONDETERMINISTIC: two captures differ",
    )
    assert count == 2


def test_graph_validator_admits_real_subclasses_with_canonical_trusted_tags():
    class FieldSubclass(FieldRef):
        pass

    class RecordSubclass(RecordRef):
        pass

    class NodeSubclass(Node):
        pass

    class JoinSubclass(RequiredJoin):
        pass

    class SearchLegSubclass(SearchLeg):
        pass

    owner_field = FieldSubclass("demo", "Owner", "id")
    owner = RecordSubclass("demo", "Owner", (owner_field,))
    target_field = FieldSubclass("demo", "Target", "id")
    target = RecordSubclass("demo", "Target", (target_field,))
    relation_ref = FieldSubclass("demo", "Owner", "target_id")
    relation = JoinSubclass(relation_ref, target)

    @query
    def joined():
        return Query(owner).join(relation).all()

    assert rust_catalog_render.capture_with_rust_graph_validator(joined) == capture(joined)
    dto = _encode_capture(capture(joined).variants[0], _EncodingBudget())
    joined_wire = json.dumps(dto)
    assert '"$type": "umf_access.dsl._nodes.Node"' in joined_wire
    assert '"$type": "umf_access.dsl._nodes.RecordRef"' in joined_wire
    assert '"$type": "umf_access.dsl._nodes.FieldRef"' in joined_wire
    assert '"$type": "umf_access.dsl._expressions.Join"' in joined_wire

    @query
    def search(text: Param[str]):
        ordinary = KeywordIndex(owner, '{"kind":"keyword"}').matches(text)
        leg = SearchLegSubclass(
            ordinary.record,
            ordinary.kind,
            ordinary.index_json,
            ordinary.value,
            ordinary.legs,
            ordinary.fusion,
        )
        return Query(owner).search(leg).top(5)

    assert rust_catalog_render.capture_with_rust_graph_validator(search) == capture(search)
    search_dto = _encode_capture(capture(search).variants[0], _EncodingBudget())
    assert "umf_access.dsl.search.SearchLeg" in json.dumps(search_dto)

    @query
    def node_subclass():
        return Terminal(NodeSubclass("all", (owner, ())))

    assert rust_catalog_render.capture_with_rust_graph_validator(node_subclass) == capture(node_subclass)

    Spoof = type(
        "Node",
        (),
        {"__module__": "umf_access.dsl._nodes", "__qualname__": "Node"},
    )
    from dataclasses import dataclass

    Spoof = dataclass(Spoof)
    spoof = Spoof()
    with pytest.raises(TypeError, match="not backed by a trusted base class"):
        _encode_capture(spoof, _EncodingBudget())

    class AmbiguousGraphValue(Node, FieldRef):
        pass

    ambiguous = AmbiguousGraphValue("all", ())
    with pytest.raises(TypeError, match="inherits unrelated trusted bases"):
        _encode_capture(ambiguous, _EncodingBudget())


def test_private_keyword_search_observer_preserves_live_read_order(monkeypatch):
    from umf_access.dsl.search import SearchLeg as SearchLegBase

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "keyword", "{}", Node("param", ("term",)), ())
    events = []
    original_record = owner
    original_node = leg.value
    original_legs = ()
    terminal_node = Node("search_top", (owner, (), leg, 5, False))

    def prop(cls, field, getter):
        monkeypatch.setattr(cls, field, property(getter), raising=False)

    prop(SearchLegBase, "record", lambda self: events.append("leg.record") or original_record)
    prop(SearchLegBase, "value", lambda self: events.append("leg.value") or original_node)
    prop(SearchLegBase, "kind", lambda self: events.append("leg.kind") or "keyword")
    prop(SearchLegBase, "legs", lambda self: events.append("leg.legs") or original_legs)
    prop(RecordRef, "module", lambda self: events.append("record.module") or "demo")
    prop(RecordRef, "element", lambda self: events.append("record.element") or "Thing")
    prop(
        Node,
        "op",
        lambda self: events.append("node.op")
        or ("search_top" if self is terminal_node else "param"),
    )
    prop(
        Node,
        "args",
        lambda self: events.append("node.args")
        or (terminal_node.__dict__["args"] if self is terminal_node else ("term",)),
    )

    parameter = CapturedParameter("term", str, False)
    _validate_node(terminal_node, (parameter,))
    predecessor_trace = events[events.index("leg.record") :]
    events.clear()
    rust_capture_observe.observe_keyword_search_leg(leg, owner, parameter)
    assert events == predecessor_trace


def test_private_vector_search_observer_preserves_resolved_carrier_and_read_order(monkeypatch):
    from umf_access.dsl.search import SearchLeg as SearchLegBase
    from umf_access.types import Vector

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "vector", "{}", Node("param", ("embedding",)), ())
    events = []
    original_record = owner
    original_node = leg.value
    original_legs = ()
    terminal_node = Node("search_top", (owner, (), leg, 5, False))

    def prop(cls, field, getter):
        monkeypatch.setattr(cls, field, property(getter), raising=False)

    prop(SearchLegBase, "record", lambda self: events.append("leg.record") or original_record)
    prop(SearchLegBase, "value", lambda self: events.append("leg.value") or original_node)
    prop(SearchLegBase, "kind", lambda self: events.append("leg.kind") or "vector")
    prop(SearchLegBase, "legs", lambda self: events.append("leg.legs") or original_legs)
    prop(RecordRef, "module", lambda self: events.append("record.module") or "demo")
    prop(RecordRef, "element", lambda self: events.append("record.element") or "Thing")
    prop(
        Node,
        "op",
        lambda self: events.append("node.op")
        or ("search_top" if self is terminal_node else "param"),
    )
    prop(
        Node,
        "args",
        lambda self: events.append("node.args")
        or (terminal_node.__dict__["args"] if self is terminal_node else ("embedding",)),
    )

    parameter = CapturedParameter("embedding", Vector, False)
    _validate_node(terminal_node, (parameter,))
    predecessor_trace = events[events.index("leg.record") :]
    events.clear()
    rust_capture_observe.observe_keyword_search_leg(leg, owner, parameter)
    assert events == predecessor_trace


def test_private_vector_search_observer_refuses_wrong_resolved_carrier_before_legs():
    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "vector", "{}", Node("param", ("embedding",)), ())
    with pytest.raises(CaptureError) as caught:
        rust_capture_observe.observe_keyword_search_leg(
            leg, owner, CapturedParameter("embedding", str, False)
        )
    assert (caught.value.code, str(caught.value)) == (
        "CAPTURE_SIGNATURE",
        "CAPTURE_SIGNATURE: search parameter carrier differs from selected leg",
    )


def test_private_vector_search_observer_preserves_kind_exception_identity(monkeypatch):
    from umf_access.dsl.search import SearchLeg as SearchLegBase
    from umf_access.types import Vector

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "vector", "{}", Node("param", ("embedding",)), ())
    failure = LookupError("vector kind sentinel")
    monkeypatch.setattr(
        SearchLegBase,
        "kind",
        property(lambda self: (_ for _ in ()).throw(failure)),
        raising=False,
    )
    with pytest.raises(LookupError) as caught:
        rust_capture_observe.observe_keyword_search_leg(
            leg, owner, CapturedParameter("embedding", Vector, False)
        )
    assert caught.value is failure


def test_private_keyword_search_observer_preserves_exception_identity(monkeypatch):
    from umf_access.dsl.search import SearchLeg as SearchLegBase

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "keyword", "{}", Node("param", ("term",)), ())
    failure = RuntimeError("record access sentinel")
    monkeypatch.setattr(
        SearchLegBase,
        "record",
        property(lambda self: (_ for _ in ()).throw(failure)),
        raising=False,
    )
    with pytest.raises(RuntimeError) as caught:
        rust_capture_observe.observe_keyword_search_leg(
            leg, owner, CapturedParameter("term", str, False)
        )
    assert caught.value is failure


def test_private_keyword_search_observer_refuses_before_later_reads(monkeypatch):
    from umf_access.dsl.search import SearchLeg as SearchLegBase

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "keyword", "{}", Node("all", ()), ())
    invalid_node = Node("all", ())
    events = []
    monkeypatch.setattr(
        SearchLegBase,
        "value",
        property(lambda self: events.append("leg.value") or invalid_node),
        raising=False,
    )
    monkeypatch.setattr(
        SearchLegBase,
        "kind",
        property(lambda self: events.append("leg.kind") or "keyword"),
        raising=False,
    )
    monkeypatch.setattr(
        Node,
        "op",
        property(lambda self: events.append("node.op") or "all"),
        raising=False,
    )
    monkeypatch.setattr(
        Node,
        "args",
        property(lambda self: (_ for _ in ()).throw(AssertionError("args read"))),
        raising=False,
    )
    with pytest.raises(CaptureError) as caught:
        rust_capture_observe.observe_keyword_search_leg(
            leg, owner, CapturedParameter("term", str, False)
        )
    assert (caught.value.code, str(caught.value)) == (
        "SEARCH_DECLARATION",
        "SEARCH_DECLARATION: search requires bound parameters",
    )
    assert events == ["leg.value", "leg.value", "node.op"]


def test_private_keyword_search_observer_keeps_empty_legs_iteration_bounded(
    monkeypatch,
):
    from umf_access.dsl.search import SearchLeg as SearchLegBase

    owner = RecordRef(module="demo", element="Thing", key=(_ID,))
    leg = SearchLeg(owner, "keyword", "{}", Node("param", ("term",)), ())
    events = []

    class OneThenInfinite:
        def __iter__(self):
            events.append("iter")
            yield object()
            while True:
                events.append("next")
                yield object()

    monkeypatch.setattr(
        SearchLegBase,
        "legs",
        property(lambda self: events.append("legs") or OneThenInfinite()),
        raising=False,
    )
    with pytest.raises(TypeError, match="unsupported captured graph shape"):
        rust_capture_observe.observe_keyword_search_leg(
            leg, owner, CapturedParameter("term", str, False)
        )
    assert events == ["legs", "iter"]
