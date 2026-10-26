# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private FieldRef host-observation prototype; no default capture routing."""

from __future__ import annotations

import pytest
import sys
from types import ModuleType, SimpleNamespace
from umf_access.capture import CaptureError
from umf_access.dsl import FieldRef, Node, RecordRef, RequiredJoin, Terminal
from umf_access.rust_capture_observe import (
    observe_field_join_tuple,
    observe_terminal_join_owners,
    validate_field_owner,
)


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
