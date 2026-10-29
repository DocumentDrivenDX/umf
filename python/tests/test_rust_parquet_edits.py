# SPDX-License-Identifier: MIT OR Apache-2.0
"""Actual native-wire footer edits against complete frozen TypeScript results."""

import json
from pathlib import Path

from umf import rust_parquet_capture as parquet


def assert_ordered_value(actual, expected):
    if isinstance(expected, dict):
        assert isinstance(actual, dict)
        assert list(actual) == list(expected)
        for key in expected:
            assert_ordered_value(actual[key], expected[key])
    elif isinstance(expected, list):
        assert isinstance(actual, list)
        assert len(actual) == len(expected)
        for left, right in zip(actual, expected):
            assert_ordered_value(left, right)
    else:
        if type(expected) in (int, float):
            assert type(actual) in (int, float)
        else:
            assert type(actual) is type(expected)
        assert actual == expected


def test_native_append_and_rename_match_complete_frozen_results():
    root = Path(__file__).resolve().parents[2]
    packet = json.loads((root / "tests/rust-core/fixtures/parquet-edits-ts-freeze.json").read_text())
    rows = {row["label"]: row["ts"] for row in packet["operations"]}
    appended = rows["append/int32"]
    assert appended["status"] == "transformed"
    assert_ordered_value(
        parquet.append_key_value_metadata(appended["source"], appended["added"]), appended
    )
    renamed = rows["rename/none-1/1"]
    assert renamed["status"] == "transformed"
    assert_ordered_value(
        parquet.rename_field(renamed["source"], 1, renamed["rename"]["to"][-1]), renamed
    )


def test_native_append_retains_entry_member_order_and_unchanged_prefix():
    root = Path(__file__).resolve().parents[2]
    data = (root / "fixtures/parquet/logical/string.parquet").read_bytes()
    source = parquet.capture(data, "entry-order-python")
    entries = [{"value": "retained value", "key": "value-first"}]
    result = parquet.append_key_value_metadata(source, entries)
    assert result["status"] == "transformed"
    assert_ordered_value(result["added"], entries)
    offset = result["unchangedPrefixBytes"]
    output = parquet.export(result["output"])
    assert output[:offset] == data[:offset]
    assert parquet.export(source) == data
