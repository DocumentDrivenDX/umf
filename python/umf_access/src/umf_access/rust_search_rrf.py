# SPDX-License-Identifier: MIT OR Apache-2.0
"""Opt-in Rust scoring for the bounded PostgreSQL RRF result seam.

This adapter deliberately does not change ``postgres_search._finish``. It
admits only exact built-in string keys and rows, leaving arbitrary Python key
and row equality/comparison behavior on the default path. It admits at most
10,000 observations and identities, matching the native profile bound.
"""

from __future__ import annotations

import json
import math
from typing import Any

PROFILE = "umf-r8-access-rrf/0.1.0"
_MAX_ITEMS = 10_000


class RrfRustUnavailable(RuntimeError):
    """The installed Rust extension does not expose the expected RRF profile."""


class RrfRustUnsupported(TypeError):
    """The values use Python semantics outside this opt-in admission profile."""


def _core() -> Any:
    try:
        from umf import _rust
    except ImportError:
        raise RrfRustUnavailable("installed umf-core RRF engine required") from None
    core = getattr(_rust, "_rust_core", None)
    profile = getattr(core, "access_rrf_profile_version", None)
    execute = getattr(core, "execute_access_rrf_wire", None)
    if not callable(profile) or not callable(execute):
        raise RrfRustUnavailable("installed umf-core lacks the RRF scoring profile")
    if profile() != PROFILE:
        raise RrfRustUnavailable("installed umf-core RRF scoring profile mismatch")
    return core


def finish_rrf_rust(variant: Any, legs: list[list[Any]], *, control: Any = None) -> Any:
    """Finish a PostgreSQL search through the opt-in Rust RRF score seam.

    Non-RRF variants retain their predecessor behavior by calling ``_finish``.
    For RRF, Python performs complete-key dictionary equality, row equality,
    key sorting, result construction, and flag aggregation. Rust receives only
    dense identities and rank-ordered observations.

    ``control``, when supplied, is forwarded to the Rust binding's cooperative
    work callback. It may return ``None`` to continue or a native refusal tuple.
    """
    from .dsl import Score, Scored, SearchResult
    from .postgres_search import SearchError, _finish

    fusion = variant.fusion
    if fusion is None or fusion.kind != "rrf":
        return _finish(variant, legs)
    if control is not None and not callable(control):
        raise TypeError("control must be callable")

    identities: dict[tuple[Any, ...], int] = {}
    rows: dict[tuple[Any, ...], Any] = {}
    keys: list[tuple[Any, ...]] = []
    leg_ids: list[list[int]] = []
    observation_count = 0
    for leg in legs:
        current: list[int] = []
        for hit in leg:
            observation_count += 1
            if observation_count > _MAX_ITEMS:
                raise SearchError("RRF_LIMIT: observation bound exceeded")
            key = hit.key
            item = hit.item
            if (
                type(key) is not tuple
                or any(type(part) is not str for part in key)
                or type(item) is not str
            ):
                raise RrfRustUnsupported(
                    "RRF Rust profile admits exact string key components and string rows"
                )
            if key in rows and rows[key] != item:
                raise SearchError(
                    "same-snapshot search legs disagree on the original row"
                )
            rows[key] = item
            identity = identities.get(key)
            if identity is None:
                if len(keys) >= _MAX_ITEMS:
                    raise SearchError("RRF_LIMIT: identity bound exceeded")
                identity = len(keys)
                identities[key] = identity
                keys.append(key)
            current.append(identity)
        leg_ids.append(current)

    # Resolve Python complete-key ordering before entering Rust. This is part
    # of the host contract and intentionally uses the original tuple values.
    key_order = sorted(range(len(keys)), key=keys.__getitem__)
    core = _core()
    from umf import _rust

    request = {
        "profile": PROFILE,
        "op": "access.rrf.score",
        "constant": str(fusion.constant),
        "topK": variant.top_k,
        "keyCount": len(keys),
        "keyOrder": key_order,
        "legs": leg_ids,
    }
    wire = json.dumps(_rust._wire(request), ensure_ascii=True, separators=(",", ":"))
    response_text = (
        core.execute_access_rrf_wire(wire, control)
        if control is not None
        else core.execute_access_rrf_wire(wire)
    )
    if type(response_text) is str:
        try:
            envelope = json.loads(response_text)
        except json.JSONDecodeError as exc:
            raise RuntimeError("Rust RRF response is not valid JSON") from exc
    else:
        raise RuntimeError("Rust RRF response is not text")
    if type(envelope) is not dict or envelope.get("profile") != "umf.core-wire/1":
        raise RuntimeError("Rust RRF response has an invalid shape")
    if envelope.get("status") == "error":
        code = envelope.get("code")
        if code == "RRF_CONSTANT_OVERFLOW":
            raise OverflowError("int too large to convert to float")
        _rust._raise_native(ValueError(response_text))
    if envelope.get("status") != "ok" or type(envelope.get("wire")) is not str:
        raise RuntimeError("Rust RRF response has an invalid result envelope")
    try:
        response = _rust._from_wire(json.loads(envelope["wire"]))
    except json.JSONDecodeError as exc:
        raise RuntimeError("Rust RRF tagged result is not valid JSON") from exc
    if type(response) is not dict:
        raise RuntimeError("Rust RRF response has an invalid result shape")
    if type(response.get("ordered")) is not list:
        raise RuntimeError("Rust RRF response has an invalid shape")

    items = []
    for rank, row in enumerate(response["ordered"], 1):
        identity = row.get("identity") if type(row) is dict else None
        if (
            type(identity) is float
            and math.isfinite(identity)
            and identity.is_integer()
        ):
            identity = int(identity)
        if (
            type(row) is not dict
            or type(identity) is not int
            or type(row.get("score")) is not float
            or not 0 <= identity < len(keys)
        ):
            raise RuntimeError("Rust RRF response contains an invalid result")
        key = keys[identity]
        items.append(Scored(rows[key], rank, Score(row["score"], "rrf")))

    return SearchResult(
        tuple(items),
        0,
        any(entry.artifact()["approximate"] for entry in variant.entries),
        any(entry.artifact()["partial"] for entry in variant.entries),
    )
