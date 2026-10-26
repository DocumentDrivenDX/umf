# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private FieldRef host-observation prototype; no default capture routing."""

from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

import pytest
from umf_access.capture import CaptureError, capture
from umf_access.dsl import FieldRef, Node, Query, RecordRef, RequiredJoin, query
from umf_access.rust_capture_observe import (
    FieldOwnerObservationUnavailable,
    observe_all_empty_capture_profile,
    observe_empty_search_leg,
    observe_field_join_tuple,
    observe_terminal_join_owners,
    validate_field_owner,
)


def test_private_all_empty_profile_uses_native_terminal_observer():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    observe_all_empty_capture_profile(Node("all", (root, ())))


def test_private_all_empty_observation_and_dto_encoding_share_work_session():
    from umf import _rust
    from umf_access.rust_catalog_render import _capture_exact_empty_all_candidate

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    _dto, session, encoding_work = _capture_exact_empty_all_candidate(node)
    assert session.charged_work > 0
    assert encoding_work > 0


def test_private_all_empty_callback_preserves_recursive_visit_read_trace():
    """Pin the observed host-read trace without claiming full validator parity."""
    from umf_access.capture import _validate_node

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    trace: list[tuple[str, str]] = []
    node_getattribute = Node.__getattribute__
    record_getattribute = RecordRef.__getattribute__

    def observed_node(instance, name):
        if instance is node and name in {"op", "args"}:
            trace.append(("Node", name))
        return node_getattribute(instance, name)

    def observed_record(instance, name):
        if instance is root and name in {"module", "element", "alias"}:
            trace.append(("RecordRef", name))
        return record_getattribute(instance, name)

    try:
        Node.__getattribute__ = observed_node
        RecordRef.__getattribute__ = observed_record
        _validate_node(node, ())
        predecessor = tuple(trace)
        trace.clear()
        observe_all_empty_capture_profile(node)
        candidate = tuple(trace)
    finally:
        Node.__getattribute__ = node_getattribute
        RecordRef.__getattribute__ = record_getattribute

    assert predecessor == (
        ("Node", "op"),
        ("Node", "args"),
        ("Node", "args"),
        ("Node", "args"),
        ("Node", "args"),
        ("RecordRef", "module"),
        ("RecordRef", "element"),
        ("RecordRef", "alias"),
        ("Node", "op"),
        ("Node", "op"),
        ("Node", "op"),
        ("Node", "op"),
        ("Node", "op"),
        ("Node", "op"),
        ("Node", "args"),
    )
    assert candidate == predecessor


def test_private_all_empty_visit_dispatch_preserves_child_first_fault():
    """The final live args read is recursively visited, with owner faults intact."""
    from umf_access.capture import _validate_node

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    sentinel = LookupError("late child alias sentinel")
    trace: list[tuple[str, str]] = []
    armed = False
    args_reads = 0
    original_node = Node.__getattribute__

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if armed and name in {"module", "element", "alias"}:
                trace.append(("FieldRef", name))
                if name == "alias":
                    raise sentinel
            return super().__getattribute__(name)

    late_field = ObservedField("demo", "Root", "late")
    node = Node("all", (root, ()))

    def observed_node(instance, name):
        nonlocal args_reads
        if instance is node and name in {"op", "args"}:
            trace.append(("Node", name))
        if instance is node and name == "args":
            args_reads += 1
            if args_reads == 5:
                return (root, (late_field,))
        return original_node(instance, name)

    try:
        Node.__getattribute__ = observed_node
        armed = True
        with pytest.raises(LookupError) as predecessor:
            _validate_node(node, ())
        predecessor_trace = tuple(trace)
        assert predecessor.value is sentinel
        assert args_reads == 5

        trace.clear()
        args_reads = 0
        with pytest.raises(LookupError) as candidate:
            observe_all_empty_capture_profile(node)
        assert candidate.value is sentinel
        assert args_reads == 5
        assert tuple(trace) == predecessor_trace
    finally:
        Node.__getattribute__ = original_node


def test_recursive_visit_op_fault_precedes_final_args_fault_in_both_paths():
    from umf_access.capture import _validate_node

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original_node = Node.__getattribute__
    op_reads = 0
    args_reads = 0
    op_fault = LookupError("seventh op read")
    args_fault = RuntimeError("final args read must remain later")

    def observed_node(instance, name):
        nonlocal op_reads, args_reads
        if instance is node and name == "op":
            op_reads += 1
            if op_reads == 7:
                raise op_fault
        if instance is node and name == "args":
            args_reads += 1
            if args_reads == 5:
                raise args_fault
        return original_node(instance, name)

    try:
        Node.__getattribute__ = observed_node
        with pytest.raises(LookupError) as predecessor:
            _validate_node(node, ())
        assert predecessor.value is op_fault
        assert op_reads == 7
        assert args_reads == 4

        op_reads = args_reads = 0
        with pytest.raises(LookupError) as candidate:
            observe_all_empty_capture_profile(node)
        assert candidate.value is op_fault
        assert op_reads == 7
        assert args_reads == 4
    finally:
        Node.__getattribute__ = original_node


def test_fourth_args_fault_precedes_root_owner_fault_in_both_paths():
    from umf_access.capture import _validate_node

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original_node = Node.__getattribute__
    original_record = RecordRef.__getattribute__
    args_reads = 0
    owner_reads: list[str] = []
    args_fault = LookupError("fourth args read")
    owner_fault = RuntimeError("owner read must remain later")

    def observed_node(instance, name):
        nonlocal args_reads
        if instance is node and name == "args":
            args_reads += 1
            if args_reads == 4:
                raise args_fault
        return original_node(instance, name)

    def observed_record(instance, name):
        if instance is root and name == "module":
            owner_reads.append(name)
            raise owner_fault
        return original_record(instance, name)

    try:
        Node.__getattribute__ = observed_node
        RecordRef.__getattribute__ = observed_record
        with pytest.raises(LookupError) as predecessor:
            _validate_node(node, ())
        assert predecessor.value is args_fault
        assert owner_reads == []

        args_reads = 0
        with pytest.raises(LookupError) as candidate:
            observe_all_empty_capture_profile(node)
        assert candidate.value is args_fault
        assert args_reads == 4
        assert owner_reads == []
    finally:
        Node.__getattribute__ = original_node
        RecordRef.__getattribute__ = original_record


def test_capture_session_limit_stops_admission_before_graph_read():
    from umf import _rust

    reads: list[str] = []
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original = Node.__getattribute__

    def observed_getattribute(instance, name):
        if instance is node and name == "op":
            reads.append("op")
            raise AssertionError("budget must stop before graph reads")
        return original(instance, name)

    try:
        Node.__getattribute__ = observed_getattribute
        session = _rust._rust_core.CaptureResourceSession(100_000)
        session.charge_work(100_000)
        with pytest.raises(ValueError, match="capture resource limit exceeded"):
            observe_all_empty_capture_profile(node, session)
        assert reads == []
    finally:
        Node.__getattribute__ = original


def test_exact_profile_preserves_caller_exception_identity_at_first_read():
    from umf import _rust

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original = Node.__getattribute__
    sentinel = LookupError("exact op accessor sentinel")

    def failing_getattribute(instance, name):
        if instance is node and name == "op":
            raise sentinel
        return original(instance, name)

    try:
        Node.__getattribute__ = failing_getattribute
        session = _rust._rust_core.CaptureResourceSession(100_000)
        with pytest.raises(LookupError) as caught:
            observe_all_empty_capture_profile(node, session)
        assert caught.value is sentinel
        assert session.charged_work == 2
    finally:
        Node.__getattribute__ = original


def test_shared_work_boundary_precedes_args_read_after_one_op_read():
    from umf import _rust

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original = Node.__getattribute__
    reads: list[str] = []

    def observed_getattribute(instance, name):
        if instance is node and name == "op":
            reads.append("op")
            return "all"
        return original(instance, name)

    try:
        Node.__getattribute__ = observed_getattribute
        session = _rust._rust_core.CaptureResourceSession(2)
        with pytest.raises(ValueError, match="capture resource limit exceeded"):
            observe_all_empty_capture_profile(node, session)
        assert reads == ["op"]
        assert session.charged_work == 3
    finally:
        Node.__getattribute__ = original


def test_wrong_session_type_refuses_before_exact_profile_graph_reads():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("all", (root, ()))
    original = Node.__getattribute__
    reads: list[str] = []

    def observed_getattribute(instance, name):
        if instance is node and name == "op":
            reads.append("op")
            return "all"
        return original(instance, name)

    try:
        Node.__getattribute__ = observed_getattribute
        with pytest.raises(TypeError, match="native resource session"):
            observe_all_empty_capture_profile(node, object())
        assert reads == []
    finally:
        Node.__getattribute__ = original


def test_public_capture_retains_four_body_invocations_for_no_parameter_query():
    calls: list[str] = []
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    objects = Query(root)

    @query
    def declaration():
        calls.append("body")
        return objects.all()

    captured = capture(declaration)
    assert calls == ["body"] * 4
    assert len(captured.variants) == 1


@pytest.mark.parametrize(
    "node",
    [
        Node("first", (RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),)), ())),
        Node("all", (RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),)), (Node("join", ()),))),
        Node("all", (RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),)),)),
    ],
)
def test_private_all_empty_profile_refuses_outside_shapes(node):
    with pytest.raises((TypeError, IndexError)):
        observe_all_empty_capture_profile(node)


def test_private_all_empty_profile_refuses_subclass_without_native_semantics():
    reads: list[str] = []

    class ObservedNode(Node):
        def __getattribute__(self, name: str):
            reads.append(name)
            return super().__getattribute__(name)

    node = ObservedNode(
        "all", (RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),)), ())
    )
    with pytest.raises(TypeError, match="exact Node"):
        observe_all_empty_capture_profile(node)
    assert reads == []


def test_private_all_empty_profile_capability_failure_precedes_graph_reads(monkeypatch):
    reads: list[str] = []

    class UntouchedNode:
        def __getattribute__(self, name: str):
            reads.append(name)
            raise AssertionError("profile preflight must precede graph reads")

    def missing_native():
        raise FieldOwnerObservationUnavailable("missing observer")

    monkeypatch.setattr(
        "umf_access.rust_capture_observe._native", missing_native
    )
    with pytest.raises(FieldOwnerObservationUnavailable, match="missing observer"):
        observe_all_empty_capture_profile(UntouchedNode())
    assert reads == []


def test_private_all_empty_profile_requires_exact_owner_text():
    class TextSubclass(str):
        pass

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    object.__setattr__(root, "module", TextSubclass("demo"))
    node = Node("all", (root, ()))
    with pytest.raises(TypeError, match="unsupported captured graph shape"):
        observe_all_empty_capture_profile(node)


def test_rust_observes_fieldref_owner_components_in_python_read_order():
    reads: list[str] = []

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if name in {"module", "element", "alias"}:
                reads.append(name)
            return super().__getattribute__(name)

    field = ObservedField("demo", "Thing", "value", alias="root")
    reads.clear()
    validate_field_owner(
        field,
        ("demo", "Thing", "root"),
    )
    assert reads == ["module", "element", "alias"]


def test_mismatch_reads_all_tuple_components_before_owner_comparison():
    reads: list[str] = []

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if name in {"module", "element", "alias"}:
                reads.append(name)
            return super().__getattribute__(name)

    field = ObservedField("foreign", "Elsewhere", "value", alias="late")
    reads.clear()
    with pytest.raises(TypeError) as caught:
        validate_field_owner(
            field,
            ("demo", "Thing", "root"),
        )
    assert type(caught.value) is TypeError
    assert str(caught.value) == "expression column belongs to another Record"
    assert reads == ["module", "element", "alias"]


@pytest.mark.parametrize(
    ("failing_field", "exception"),
    [
        ("module", AttributeError("module accessor sentinel")),
        ("element", LookupError("element accessor sentinel")),
        ("alias", RuntimeError("alias accessor sentinel")),
    ],
)
def test_accessor_exception_instance_and_class_escape_unchanged(failing_field, exception):
    reads: list[str] = []
    armed = False

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if name in {"module", "element", "alias"}:
                if armed:
                    reads.append(name)
            if armed and name == failing_field:
                raise exception
            return super().__getattribute__(name)

    field = ObservedField("demo", "Thing", "value")
    armed = True
    with pytest.raises(type(exception)) as caught:
        validate_field_owner(field, ("demo", "Thing", None))
    assert type(caught.value) is type(exception)
    assert caught.value is exception
    assert reads == ["module", "element", "alias"][: ["module", "element", "alias"].index(failing_field) + 1]


def test_stateful_accessor_repeats_full_read_order_across_calls():
    reads = 0
    order: list[str] = []
    armed = False

    class StatefulField(FieldRef):
        def __getattribute__(self, name: str):
            nonlocal reads
            if armed and name in {"module", "element", "alias"}:
                order.append(name)
            if armed and name == "module":
                reads += 1
                if reads == 2:
                    return "foreign"
            return super().__getattribute__(name)

    field = StatefulField("demo", "Thing", "value")
    armed = True
    validate_field_owner(field, ("demo", "Thing", None))
    with pytest.raises(TypeError, match="expression column belongs to another Record"):
        validate_field_owner(field, ("demo", "Thing", None))
    assert reads == 2
    assert order == ["module", "element", "alias", "module", "element", "alias"]


def test_unsupported_python_string_subclass_is_refused():
    class StringSubclass(str):
        pass

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if name == "module" and armed:
                return StringSubclass("demo")
            return super().__getattribute__(name)

    armed = False
    field = ObservedField("demo", "Thing", "value")
    armed = True
    with pytest.raises(TypeError, match="exact str or None"):
        validate_field_owner(field, ("demo", "Thing", None))


def test_lone_surrogate_owner_text_is_compared_as_utf16_without_losing_meaning():
    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if name == "module" and armed:
                return "\ud800"
            return super().__getattribute__(name)

    armed = False
    field = ObservedField("demo", "Thing", "value")
    armed = True
    validate_field_owner(field, ("\ud800", "Thing", None))


def test_missing_native_profile_fails_before_touching_field(monkeypatch):
    touched: list[str] = []

    class UntouchedField:
        def __getattribute__(self, name: str):
            touched.append(name)
            raise AssertionError("native capability check touched the FieldRef")

    fake_umf = ModuleType("umf")
    fake_umf._rust = SimpleNamespace(_rust_core=SimpleNamespace())
    monkeypatch.setitem(sys.modules, "umf", fake_umf)

    with pytest.raises(RuntimeError, match="lacks the capture graph observation profile"):
        validate_field_owner(UntouchedField(), ("demo", "Thing", None))
    with pytest.raises(RuntimeError, match="lacks the capture graph observation profile"):
        observe_field_join_tuple(UntouchedField(), ())
    assert touched == []


def test_prior_graph_profile_is_rejected_before_field_access(monkeypatch):
    touched: list[str] = []

    class UntouchedField:
        def __getattribute__(self, name: str):
            touched.append(name)
            raise AssertionError("profile version check touched the graph")

    old_core = SimpleNamespace(
        access_field_owner_observation_profile_version=lambda: "umf-access-capture-graph-observation/0.1.0",
        access_validate_field_owner_observed=lambda *_args: True,
        access_observe_capture_terminal_join_owners=lambda *_args: {},
        access_observe_capture_field_join_tuple=lambda *_args: None,
    )
    fake_umf = ModuleType("umf")
    fake_umf._rust = SimpleNamespace(_rust_core=old_core)
    monkeypatch.setitem(sys.modules, "umf", fake_umf)

    with pytest.raises(RuntimeError, match="lacks the capture graph observation profile"):
        observe_field_join_tuple(UntouchedField(), ())
    assert touched == []


def test_field_join_tuple_visit_preserves_dfs_and_owner_component_order():
    reads: list[str] = []
    armed = False

    class ObservedField(FieldRef):
        def __getattribute__(self, name: str):
            if armed and name in {"module", "element", "alias"}:
                reads.append(f"field.{name}")
            return super().__getattribute__(name)

    class ObservedJoin(RequiredJoin):
        def __getattribute__(self, name: str):
            if armed and name == "ref":
                reads.append("join.ref")
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    target = RecordRef("demo", "Target", (FieldRef("demo", "Target", "id"),))
    direct = ObservedField("demo", "Root", "direct")
    relation_ref = ObservedField("demo", "Root", "target_id")
    join = ObservedJoin(relation_ref, target)
    armed = True

    observe_field_join_tuple((direct, (join,)), (("demo", "Root", None),))
    assert reads == [
        "field.module",
        "field.element",
        "field.alias",
        "join.ref",
        "field.module",
        "field.element",
        "field.alias",
    ]


def test_field_join_tuple_visit_preserves_join_accessor_exception_identity():
    sentinel = LookupError("join ref sentinel")
    armed = False
    target = RecordRef("demo", "Target", (FieldRef("demo", "Target", "id"),))

    class FaultingJoin(RequiredJoin):
        def __getattribute__(self, name: str):
            if armed and name == "ref":
                raise sentinel
            return super().__getattribute__(name)

    join = FaultingJoin(FieldRef("demo", "Root", "target_id"), target)
    armed = True
    with pytest.raises(LookupError) as caught:
        observe_field_join_tuple(join, (("demo", "Root", None),))
    assert caught.value is sentinel


def test_field_join_tuple_foreign_field_refuses_before_later_tuple_child():
    later_reads: list[str] = []

    class LaterField(FieldRef):
        def __getattribute__(self, name: str):
            if name in {"module", "element", "alias"}:
                later_reads.append(name)
            return super().__getattribute__(name)

    foreign = FieldRef("foreign", "Other", "column")
    later = LaterField("demo", "Root", "column")
    later_reads.clear()
    with pytest.raises(TypeError) as caught:
        observe_field_join_tuple((foreign, later), (("demo", "Root", None),))
    assert type(caught.value) is TypeError
    assert str(caught.value) == "expression column belongs to another Record"
    assert later_reads == []


@pytest.mark.parametrize("value", [Node("column", ()), object()])
def test_field_join_tuple_visit_refuses_unsupported_graph_shapes(value):
    if type(value) is object:
        # Passive values are ignored by the predecessor's visit dispatch.
        observe_field_join_tuple(value, ())
    else:
        with pytest.raises(TypeError, match="unsupported captured graph shape"):
            observe_field_join_tuple(value, ())


def test_field_join_tuple_visit_refuses_search_leg_before_nested_reads():
    from umf_access.dsl.search import SearchLeg

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = SearchLeg(root, "keyword", "{}", None)
    with pytest.raises(TypeError, match="unsupported captured graph shape"):
        observe_field_join_tuple((leg,), (("demo", "Root", None),))


def test_empty_search_leg_observes_predecessor_field_order():
    reads: list[str] = []
    armed = False

    class ObservedRecord(RecordRef):
        def __getattribute__(self, name: str):
            if armed and name in {"module", "element"}:
                reads.append(f"record.{name}")
            return super().__getattribute__(name)

    from umf_access.dsl.search import SearchLeg

    class ObservedLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if armed and name in {"record", "kind", "value", "legs"}:
                reads.append(f"leg.{name}")
            return super().__getattribute__(name)

    root = ObservedRecord("demo", "Root", (FieldRef("demo", "Root", "id"),))
    search_record = ObservedRecord("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = ObservedLeg(search_record, "keyword", None, None)
    armed = True
    observe_empty_search_leg(leg, root)
    assert reads == [
        "leg.record",
        "record.module",
        "leg.record",
        "record.element",
        "record.module",
        "record.element",
        "leg.value",
        "leg.legs",
    ]


def test_empty_search_leg_does_not_read_kind():
    from umf_access.dsl.search import SearchLeg

    class FaultingKind(SearchLeg):
        def __getattribute__(self, name: str):
            if name == "kind":
                raise AssertionError("kind must not be read when value is None")
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    observe_empty_search_leg(FaultingKind(root, "keyword", None, None), root)


def test_empty_search_leg_foreign_record_refuses_before_kind():
    reads: list[str] = []
    armed = False
    from umf_access.dsl.search import SearchLeg

    class ObservedLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if armed and name in {"record", "kind", "value", "legs"}:
                reads.append(name)
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = ObservedLeg(
        RecordRef("elsewhere", "Root", (FieldRef("elsewhere", "Root", "id"),)),
        "keyword",
        None,
        None,
    )
    armed = True
    with pytest.raises(CaptureError) as caught:
        observe_empty_search_leg(leg, root)
    assert caught.value.code == "SEARCH_DECLARATION"
    assert reads == ["record", "record"]


def test_empty_search_leg_accessor_exception_identity():
    sentinel = LookupError("search record sentinel")
    armed = False
    from umf_access.dsl.search import SearchLeg

    class FaultingLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if armed and name == "record":
                raise sentinel
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = FaultingLeg(root, "keyword", None, None)
    armed = True
    with pytest.raises(LookupError) as caught:
        observe_empty_search_leg(leg, root)
    assert caught.value is sentinel


def test_empty_search_leg_value_accessor_exception_identity():
    sentinel = RuntimeError("search value sentinel")
    armed = False
    from umf_access.dsl.search import SearchLeg

    class FaultingLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if armed and name == "value":
                raise sentinel
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = FaultingLeg(root, "keyword", None, None)
    armed = True
    with pytest.raises(RuntimeError) as caught:
        observe_empty_search_leg(leg, root)
    assert caught.value is sentinel


def test_search_leg_record_getter_is_read_twice_in_tuple_evaluation_order():
    reads: list[str] = []
    armed = False
    from umf_access.dsl.search import SearchLeg

    class TaggedRecord(RecordRef):
        def __getattribute__(self, name: str):
            if armed and name in {"module", "element"}:
                reads.append(f"record.{name}")
            return super().__getattribute__(name)

    first = TaggedRecord("demo", "Root", (FieldRef("demo", "Root", "id"),))
    second = TaggedRecord("demo", "Root", (FieldRef("demo", "Root", "id"),))
    root = TaggedRecord("demo", "Root", (FieldRef("demo", "Root", "id"),))

    class StatefulRecordLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if name == "record" and armed:
                reads.append("leg.record")
                return first if reads.count("leg.record") == 1 else second
            return super().__getattribute__(name)

    armed = True
    observe_empty_search_leg(StatefulRecordLeg(first, "keyword", None, None), root)
    assert reads == [
        "leg.record",
        "record.module",
        "leg.record",
        "record.element",
        "record.module",
        "record.element",
    ]


def test_search_leg_second_record_getter_exception_identity():
    sentinel = LookupError("second search record sentinel")
    armed = False
    reads: list[str] = []
    from umf_access.dsl.search import SearchLeg

    class FaultingLeg(SearchLeg):
        def __getattribute__(self, name: str):
            if name == "record" and armed:
                reads.append(name)
                if len(reads) == 2:
                    raise sentinel
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = FaultingLeg(root, "keyword", None, None)
    armed = True
    with pytest.raises(LookupError) as caught:
        observe_empty_search_leg(leg, root)
    assert caught.value is sentinel
    assert reads == ["record", "record"]


def test_empty_search_leg_refuses_bound_value_before_legs():
    from umf_access.dsl.search import SearchLeg

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    leg = SearchLeg(root, "keyword", "{}", Node("param", ("term",)))
    with pytest.raises(TypeError, match="unsupported captured graph shape"):
        observe_empty_search_leg(leg, root)


def test_terminal_join_walker_observes_root_and_sequential_join_owners():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    middle = RecordRef("demo", "Middle", (FieldRef("demo", "Middle", "id"),))
    leaf = RecordRef("demo", "Leaf", (FieldRef("demo", "Leaf", "id"),))
    first = RequiredJoin(FieldRef("demo", "Root", "middle_id"), middle)
    second = RequiredJoin(FieldRef("demo", "Middle", "leaf_id"), leaf)
    node = Node(
        "all",
        (root, (Node("join", (first,)), Node("join", (second,)))),
    )

    observed = observe_terminal_join_owners(node)
    assert observed["terminalOp"] == "all"
    assert observed["owners"] == [
        {"module": "demo", "element": "Leaf", "alias": None},
        {"module": "demo", "element": "Middle", "alias": None},
        {"module": "demo", "element": "Root", "alias": None},
    ]


def test_terminal_join_walker_preserves_repeated_relation_owner_getters():
    reads: list[str] = []
    armed = False
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    target = RecordRef("demo", "Target", (FieldRef("demo", "Target", "id"),))

    class ObservedJoin(RequiredJoin):
        def __getattribute__(self, name: str):
            if armed and name in {"ref", "target"}:
                reads.append(name)
            return super().__getattribute__(name)

    relation = ObservedJoin(FieldRef("demo", "Root", "target_id"), target)
    node = Node("all", (root, (Node("join", (relation,)),)))
    armed = True

    observe_terminal_join_owners(node)
    assert reads == ["ref", "ref", "ref", "target", "target", "target"]


def test_terminal_walker_preserves_crossed_node_op_fault_order_and_identity():
    sentinel = AttributeError("second terminal op read")
    reads = 0

    class StatefulNode(Node):
        def __getattribute__(self, name: str):
            nonlocal reads
            if armed and name == "op":
                reads += 1
                if reads == 2:
                    raise sentinel
            return super().__getattribute__(name)

    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    grouped = Node("group", ())
    node = StatefulNode("all", (root, (grouped,)))
    armed = True

    with pytest.raises(AttributeError) as caught:
        observe_terminal_join_owners(node)
    assert caught.value is sentinel
    assert reads == 2


def test_terminal_walker_runs_into_pass_for_group_count():
    reads: list[str] = []
    node_reads = 0
    armed = False
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))

    class StatefulNode(Node):
        def __getattribute__(self, name: str):
            nonlocal node_reads
            if armed and name == "op":
                node_reads += 1
                reads.append("node.op")
            return super().__getattribute__(name)

    class ObservedStep(Node):
        def __getattribute__(self, name: str):
            if armed and name == "op":
                reads.append("step.op")
            return super().__getattribute__(name)

    group = ObservedStep("group", ())
    into = ObservedStep("into", ())
    node = StatefulNode("group_count", (root, (group, into)))
    armed = True

    observe_terminal_join_owners(node)
    assert reads == [
        "node.op",
        "step.op",
        "step.op",
        "step.op",
        "step.op",
        "step.op",
        "step.op",
        "step.op",
    ]


def test_terminal_walker_refuses_join_with_absent_source():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    source = RecordRef("demo", "Absent", (FieldRef("demo", "Absent", "id"),))
    target = RecordRef("demo", "Target", (FieldRef("demo", "Target", "id"),))
    relation = RequiredJoin(FieldRef("demo", "Absent", "target_id"), target)
    node = Node("all", (root, (Node("join", (relation,)),)))

    with pytest.raises(CaptureError) as caught:
        observe_terminal_join_owners(node)
    assert caught.value.code == "CAPTURE_UNSUPPORTED"
    assert str(caught.value) == "CAPTURE_UNSUPPORTED: join source is absent"


def test_terminal_walker_refuses_non_text_terminal_op():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node(None, (root, ()))

    with pytest.raises(CaptureError) as caught:
        observe_terminal_join_owners(node)
    assert caught.value.code == "CAPTURE_UNSUPPORTED"


def test_terminal_op_refusal_precedes_malformed_record_owner_read():
    sentinel = AttributeError("malformed root owner should be later")
    reads: list[str] = []
    armed = False

    class ObservedRecordRef(RecordRef):
        def __getattribute__(self, name: str):
            if armed and name == "module":
                reads.append(name)
                raise sentinel
            return super().__getattribute__(name)

    root = ObservedRecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    node = Node("unsupported", (root, ()))
    armed = True
    with pytest.raises(CaptureError) as caught:
        observe_terminal_join_owners(node)
    assert caught.value.code == "CAPTURE_UNSUPPORTED"
    assert str(caught.value) == "CAPTURE_UNSUPPORTED: unsupported terminal form"
    assert reads == []


def test_terminal_walker_uses_each_python_iterator_once_per_pass():
    root = RecordRef("demo", "Root", (FieldRef("demo", "Root", "id"),))
    events: list[str] = []

    class EmptySteps:
        def __iter__(self):
            events.append("iter")

            class StepIterator:
                def __iter__(self):
                    events.append("iterator.iter")
                    return self

                def __next__(self):
                    events.append("next")
                    raise StopIteration

            return StepIterator()

    class DynamicArgsNode(Node):
        def __getattribute__(self, name: str):
            if armed and name == "args":
                return (root, steps)
            return super().__getattribute__(name)

    steps = EmptySteps()
    node = DynamicArgsNode("all", (root, ()))
    armed = True
    observe_terminal_join_owners(node)
    assert events == ["iter", "next", "iter", "next", "iter", "next"]
