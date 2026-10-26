# SPDX-License-Identifier: MIT OR Apache-2.0
"""Private FieldRef host-observation prototype; no default capture routing."""

from __future__ import annotations

import pytest
import sys
from types import ModuleType, SimpleNamespace
from umf_access.dsl import FieldRef
from umf_access.rust_capture_observe import (
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


def test_missing_native_profile_fails_before_touching_field(monkeypatch):
    touched: list[str] = []

    class UntouchedField:
        def __getattribute__(self, name: str):
            touched.append(name)
            raise AssertionError("native capability check touched the FieldRef")

    fake_umf = ModuleType("umf")
    fake_umf._rust = SimpleNamespace(_rust_core=SimpleNamespace())
    monkeypatch.setitem(sys.modules, "umf", fake_umf)

    with pytest.raises(RuntimeError, match="lacks the FieldRef observation profile"):
        validate_field_owner(UntouchedField(), ("demo", "Thing", None))
    assert touched == []
