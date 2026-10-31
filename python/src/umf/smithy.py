# SPDX-License-Identifier: MIT OR Apache-2.0
"""Smithy compiler capability transport backed by a Rust-owned session.

Prepare operations return explicit assembly/selection requests. The caller supplies
that explicit external capability's DTO to the corresponding completion operation.
Python does not load a JavaScript runtime or interpret compiler semantics.
"""
from __future__ import annotations

import json
from typing import Any

from . import _rust
from .rust_iceberg_schema import _controls

PROFILE = "umf.smithy-native-wire/1"


class SmithySession:
    """Isolated prepare/complete/cancel protocol with cumulative host controls."""

    def __init__(self, *, max_work=None, meter=None, is_cancelled=None,
                 now=None, deadline_ms=None):
        self._session = _rust._rust_core.SmithySession()
        if self._session.profile_version() != PROFILE:
            raise RuntimeError("Smithy session profile mismatch")
        self._charge, self._host_work = _controls(
            max_work, meter, is_cancelled, now, deadline_ms)
        self._controls_enabled = any(value is not None for value in
            (max_work, meter, is_cancelled, now, deadline_ms))

    def execute(self, operation: str, /, **fields: Any) -> Any:
        """Execute a shared ``smithy.*`` operation without semantic rewriting."""
        if type(operation) is not str:
            raise TypeError("operation must be a string")
        if "profile" in fields or "op" in fields:
            raise TypeError("profile and op are selected by the session")
        self._host_work(1)
        request = {"profile": PROFILE, "op": operation, **fields}
        wire = json.dumps(_rust._wire(request, work=self._host_work),
                          ensure_ascii=True, separators=(",", ":"))
        response = (self._session.execute(wire, self._charge)
                    if self._controls_enabled else self._session.execute(wire))
        self._host_work(len(response))
        result = _rust._checked_envelope(response)
        self._host_work(len(result))
        return _rust._from_wire(json.loads(result), self._host_work)
