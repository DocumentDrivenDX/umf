# SPDX-License-Identifier: MIT OR Apache-2.0
"""RFC 6902 through the installed Python-to-Rust boundary."""
import copy

import pytest

from umf_codegen import GenerationError, apply_json_patch


def test_all_operations_use_private_copy_and_numeric_json_equality():
    document = {"items": [1, 3], "source": {"x": 1}}
    original = copy.deepcopy(document)
    result = apply_json_patch(document, [
        {"op": "add", "path": "/items/1", "value": 2},
        {"op": "copy", "from": "/source", "path": "/copied"},
        {"op": "replace", "path": "/source/x", "value": 2},
        {"op": "move", "from": "/items/0", "path": "/items/2"},
        {"op": "remove", "path": "/source"},
        {"op": "test", "path": "/copied", "value": {"x": 1.0}},
    ])
    assert result == {"present": True, "value": {"items": [2, 3, 1], "copied": {"x": 1}}}
    assert document == original


def test_failed_test_does_not_publish_prior_operations():
    document = {"a": 1}
    with pytest.raises(GenerationError) as failure:
        apply_json_patch(document, [
            {"op": "add", "path": "/new", "value": True},
            {"op": "test", "path": "/a", "value": True},
        ])
    assert failure.value.code == "JSON_PATCH"
    assert document == {"a": 1}


def test_json_pointer_and_absent_root_remain_distinct_from_json_null():
    assert apply_json_patch({"a/b": {"~": None}}, [
        {"op": "test", "path": "/a~1b/~0", "value": None},
    ]) == {"present": True, "value": {"a/b": {"~": None}}}
    assert apply_json_patch(None, []) == {"present": True, "value": None}
    assert apply_json_patch(None, [{"op": "remove", "path": ""}]) == {"present": False}
