# SPDX-License-Identifier: MIT OR Apache-2.0
"""Isolated replay of the frozen PostgreSQL RRF Python predecessor packet."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from umf_access.dsl import Score, rrf, target_defined
from umf_access.postgres_search import SearchError, _Hit
from umf_access.rust_search_rrf import PROFILE, finish_rrf_rust

ROOT = Path(__file__).resolve().parents[3]
PACKET = (
    ROOT / "tests/rust-core/fixtures/"
    "r8-postgres-search-rrf-20261027/predecessor.json"
)

# This adapter intentionally excludes Python-only row/key hooks and all native
# single-leg score handling. The latter cases remain on their predecessor path.
RUST_ADMITTED_CASES = {
    "rrf-overlap-rank-accumulation-and-topk",
    "rrf-complete-key-tie-order",
    "rrf-equal-key-items-use-python-equality",
    "rrf-empty-legs",
    "rrf-oversized-positive-constant-dsl-admits-python-overflows",
}
PYTHON_ONLY_CASES = {
    "single-leg-truncation-preserves-native-score",
    "single-leg-required-for-no-fusion",
    "rrf-divergent-key-items-refuse",
    "target-defined-fusion-refuses",
}


@dataclass
class _Entry:
    approximate: bool
    partial: bool

    def artifact(self) -> dict[str, bool]:
        return {"approximate": self.approximate, "partial": self.partial}


@dataclass
class _Variant:
    top_k: int
    fusion: Any
    entries: tuple[_Entry, ...]


def _load_cases() -> list[dict[str, Any]]:
    return json.loads(PACKET.read_text())["cases"]


def _reconstruct(case: dict[str, Any]) -> tuple[_Variant, list[list[_Hit]]]:
    source = case["input"]
    if source["fusion"] == "rrf":
        fusion = rrf(k=int(source["constant"]))
    elif source["fusion"] == "target-defined":
        fusion = target_defined()
    else:
        fusion = None
    variant = _Variant(
        source["topK"],
        fusion,
        tuple(_Entry(e["approximate"], e["partial"]) for e in source["entries"]),
    )
    legs = []
    for leg in source["legs"]:
        hits = []
        for observation in leg:
            component_key = tuple(observation["keyComponents"])
            score = observation["nativeScore"]
            hits.append(
                _Hit(
                    component_key,
                    observation["itemLabel"],
                    Score(float(score["value"]), score["kind"]),
                )
            )
        legs.append(hits)
    return variant, legs


def _simplify(result: Any) -> dict[str, Any]:
    return {
        "items": [
            {
                "item": scored.item,
                "rank": scored.rank,
                "score": (
                    None
                    if scored.score is None
                    else {
                        "value": scored.score.value,
                        "hex": scored.score.value.hex(),
                        "kind": scored.score.kind,
                    }
                ),
            }
            for scored in result
        ],
        "stale": result.stale,
        "approximate": result.approximate,
        "partial": result.partial,
    }


def _native_profile_available() -> bool:
    try:
        from umf import _rust
    except ImportError:
        return False
    core = getattr(_rust, "_rust_core", None)
    profile = getattr(core, "access_rrf_profile_version", None)
    execute = getattr(core, "execute_access_rrf_wire", None)
    return callable(profile) and profile() == PROFILE and callable(execute)


def test_packet_accounts_for_all_nine_cases() -> None:
    names = {case["name"] for case in _load_cases()}
    assert names == RUST_ADMITTED_CASES | PYTHON_ONLY_CASES


def test_host_bound_refuses_before_native_dispatch() -> None:
    variant = _Variant(1, rrf(k=60), ())
    hit = _Hit(("a",), "A", Score(1.0, "bm25"))
    with pytest.raises(SearchError, match="RRF_LIMIT: observation bound exceeded"):
        finish_rrf_rust(variant, [[hit] * 10_001])


def test_control_is_forwarded_to_native_binding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    observed: dict[str, Any] = {}

    class Core:
        def access_rrf_profile_version(self) -> str:
            return PROFILE

        def execute_access_rrf_wire(self, wire: str, control: Any = None) -> str:
            observed["request"] = json.loads(wire)
            observed["control"] = control
            return json.dumps(
                {
                    "profile": "umf.core-wire/1",
                    "status": "ok",
                    "wire": json.dumps({"ordered": [{"identity": 0, "score": 0.25}]}),
                }
            )

    rust = SimpleNamespace(
        _rust_core=Core(),
        _wire=lambda value: value,
        _from_wire=lambda value: value,
    )
    umf_module = ModuleType("umf")
    umf_module._rust = rust  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "umf", umf_module)

    control = lambda _amount: None
    variant = _Variant(1, rrf(k=60), (_Entry(False, False),))
    result = finish_rrf_rust(
        variant, [[_Hit(("a",), "A", Score(1.0, "bm25"))]], control=control
    )

    assert observed["control"] is control
    assert observed["request"]["op"] == "access.rrf.score"
    assert observed["request"]["constant"] == "60"
    assert result[0].score.value.hex() == (0.25).hex()


@pytest.mark.parametrize("case", _load_cases(), ids=lambda case: case["name"])
def test_frozen_predecessor_outcomes(case: dict[str, Any]) -> None:
    variant, legs = _reconstruct(case)
    name = case["name"]

    if name in RUST_ADMITTED_CASES and not _native_profile_available():
        pytest.skip("installed umf-core lacks the opt-in access RRF profile")

    if case["outcomeKind"] == "error":
        expected = case["error"]
        error_type = {"SearchError": SearchError, "OverflowError": OverflowError}[
            expected["type"]
        ]
        with pytest.raises(error_type, match=expected["message"]):
            finish_rrf_rust(variant, legs)
        return

    result = finish_rrf_rust(variant, legs)
    # Scores are compared as float.hex as well as the frozen numeric values.
    expected = case["result"]
    actual = _simplify(result)
    assert actual == expected
    assert [
        None if item["score"] is None else item["score"]["hex"]
        for item in actual["items"]
    ] == [
        None if item["score"] is None else item["score"]["hex"]
        for item in expected["items"]
    ]
