# SPDX-License-Identifier: MIT OR Apache-2.0
from umf import rust_avro_inspect


def _tagged_object(**members):
    return {"kind": "object", "members": members}


def _tagged_string(value):
    return {"kind": "string", "value": value}


def test_inspector_resolves_ordered_dependency_and_remains_incomplete():
    dependency = _tagged_object(
        type=_tagged_string("record"), name=_tagged_string("Widget"),
        namespace=_tagged_string("sample"), fields={"kind": "array", "items": []},
    )
    result = rust_avro_inspect.inspect(
        _tagged_string("sample.Widget"), [("dependency-1", dependency)]
    )
    assert result == {
        "valid": True,
        "complete": False,
        "diagnostics": [{
            "code": "AVRO_PROFILE_LIMIT", "path": "",
            "message": "Inspection covers a bounded schema-structure subset; Avro 1.12 semantic validity is not certified",
            "severity": "warning",
        }],
    }


def test_unresolved_name_is_reported_without_claiming_completeness():
    result = rust_avro_inspect.inspect(_tagged_string("missing.Widget"))
    assert result["valid"] is False
    assert result["complete"] is False
    assert [item["code"] for item in result["diagnostics"]] == [
        "AVRO_UNRESOLVED_NAME", "AVRO_PROFILE_LIMIT"
    ]


def test_inspection_honors_host_work_control():
    calls = []
    result = rust_avro_inspect.inspect(_tagged_string("string"), meter=calls.append)
    assert result["complete"] is False
    assert calls and all(isinstance(amount, int) and amount >= 0 for amount in calls)


def test_zero_budget_and_cancellation_precede_dependency_iteration():
    class ExplodingIterable:
        def __iter__(self):
            raise AssertionError("dependencies must not be traversed")

    for controls in ({"max_work": 0}, {"is_cancelled": lambda: True}):
        try:
            rust_avro_inspect.inspect(_tagged_string("string"), ExplodingIterable(), **controls)
        except ValueError as error:
            assert getattr(error, "code", None) in {"RESOURCE_LIMIT", "CANCELLED"}
        else:
            raise AssertionError("preflight must stop before dependency iteration")


def test_budget_can_interrupt_dependency_collection():
    dependencies = [
        ("a", _tagged_string("string")), ("b", _tagged_string("long")),
    ]
    try:
        rust_avro_inspect.inspect(_tagged_string("string"), dependencies, max_work=7)
    except ValueError as error:
        assert getattr(error, "code", None) == "RESOURCE_LIMIT"
    else:
        raise AssertionError("work budget must stop bounded dependency admission")
