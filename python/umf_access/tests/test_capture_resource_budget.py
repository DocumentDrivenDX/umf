# SPDX-License-Identifier: MIT OR Apache-2.0
from __future__ import annotations

import pytest

from umf import _rust
from umf_access.rust_catalog_render import (
    _DtoBudgetExceeded,
    _EncodingBudget,
    _MAX_CAPTURE_DEPTH,
    _MAX_CAPTURE_NODES,
    _MAX_CAPTURE_UTF8_BYTES,
)


def test_native_dto_node_work_and_depth_boundaries_preserve_fault_order():
    session = _rust._rust_core.CaptureResourceSession(_MAX_CAPTURE_NODES + 1)
    budget = _EncodingBudget(session)
    for _ in range(_MAX_CAPTURE_NODES):
        budget.charge(None, 0)
    assert session.dto_nodes == _MAX_CAPTURE_NODES
    assert session.charged_work == _MAX_CAPTURE_NODES
    with pytest.raises(ValueError, match="bridge resource limits"):
        budget.charge(None, 0)
    assert session.dto_nodes == _MAX_CAPTURE_NODES + 1

    exact_depth = _EncodingBudget(_rust._rust_core.CaptureResourceSession(1))
    exact_depth.charge(None, _MAX_CAPTURE_DEPTH)
    too_deep_session = _rust._rust_core.CaptureResourceSession(1)
    with pytest.raises(ValueError, match="bridge resource limits"):
        _EncodingBudget(too_deep_session).charge(None, _MAX_CAPTURE_DEPTH + 1)
    assert too_deep_session.charged_work == 1
    assert too_deep_session.dto_nodes == 1

    work_first = _rust._rust_core.CaptureResourceSession(0)
    with pytest.raises(ValueError, match="capture resource limit exceeded"):
        _EncodingBudget(work_first).charge(None, _MAX_CAPTURE_DEPTH + 1)
    assert work_first.dto_nodes == 0


def test_native_string_preflight_utf8_boundary_and_strict_encoding_order():
    session = _rust._rust_core.CaptureResourceSession(10)
    budget = _EncodingBudget(session)
    budget.charge("é" * (_MAX_CAPTURE_UTF8_BYTES // 2), 0)
    assert session.dto_utf8_bytes == _MAX_CAPTURE_UTF8_BYTES
    with pytest.raises(ValueError, match="bridge resource limits"):
        budget.charge("x", 0)
    assert session.dto_utf8_bytes == _MAX_CAPTURE_UTF8_BYTES

    preflight = _rust._rust_core.CaptureResourceSession(2)
    with pytest.raises(ValueError, match="bridge resource limits"):
        _EncodingBudget(preflight).charge("x" * (_MAX_CAPTURE_UTF8_BYTES + 1), 0)
    assert preflight.charged_work == 1
    assert preflight.dto_utf8_bytes == 0

    malformed = _rust._rust_core.CaptureResourceSession(2)
    with pytest.raises(UnicodeEncodeError):
        _EncodingBudget(malformed).charge("\ud800", 0)
    assert malformed.dto_utf8_bytes == 0


def test_native_output_exact_char_and_utf8_boundaries_commit_atomically():
    exact_chars = _rust._rust_core.CaptureResourceSession(1)
    char_budget = _EncodingBudget(exact_chars)
    char_budget.charge_output("x" * (_MAX_CAPTURE_UTF8_BYTES - 2))
    assert exact_chars.output_chars == _MAX_CAPTURE_UTF8_BYTES
    assert exact_chars.output_utf8_bytes == _MAX_CAPTURE_UTF8_BYTES
    with pytest.raises(_DtoBudgetExceeded):
        char_budget.charge_output(None)
    assert exact_chars.output_chars == _MAX_CAPTURE_UTF8_BYTES

    exact_bytes = _rust._rust_core.CaptureResourceSession(1)
    byte_budget = _EncodingBudget(exact_bytes)
    byte_budget.charge_output("é" * (_MAX_CAPTURE_UTF8_BYTES // 2 - 1))
    assert exact_bytes.output_utf8_bytes == _MAX_CAPTURE_UTF8_BYTES
    assert exact_bytes.output_chars < _MAX_CAPTURE_UTF8_BYTES
    with pytest.raises(_DtoBudgetExceeded):
        _EncodingBudget(exact_bytes).charge_output("é")
    assert exact_bytes.output_utf8_bytes == _MAX_CAPTURE_UTF8_BYTES


def test_native_output_counters_are_shared_and_failed_iteration_is_uncommitted():
    session = _rust._rust_core.CaptureResourceSession(1)
    first = _EncodingBudget(session)
    first.charge_output({"text": "accepted"})
    committed = session.output_utf8_bytes
    assert committed > 0

    # NaN fails inside JSONEncoder after no output chunk can be committed.
    with pytest.raises(ValueError):
        _EncodingBudget(session).charge_output(float("nan"))
    assert session.output_utf8_bytes == committed

    second = _EncodingBudget(session)
    second.charge_output(None)
    assert session.output_utf8_bytes > committed


def test_near_full_native_output_budget_is_shared_across_adapters():
    session = _rust._rust_core.CaptureResourceSession(1)
    first = _EncodingBudget(session)
    first.charge_output("x" * (_MAX_CAPTURE_UTF8_BYTES - 4))
    before_chars = session.output_chars
    before_bytes = session.output_utf8_bytes

    # A fresh Python adapter must not reset the native session's near-full totals.
    with pytest.raises(_DtoBudgetExceeded):
        _EncodingBudget(session).charge_output("x")
    assert session.output_chars == before_chars
    assert session.output_utf8_bytes == before_bytes
