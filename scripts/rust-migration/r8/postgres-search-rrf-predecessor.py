"""Freeze the current Python PostgreSQL search _finish predecessor behavior."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "python/umf_access/src"))

from umf_access.dsl.search import Score, rrf
from umf_access.postgres_search import SearchError, _finish, _Hit

OUT = ROOT / "docs/helix/04-build/evidence/rust-migration/r8-postgres-search-rrf-20261027/predecessor.json"


class Item:
    def __init__(self, label: str, events: list[str]):
        self.label = label
        self.events = events

    def __eq__(self, other: object) -> bool:
        self.events.append(f"eq:{self.label}:{getattr(other, 'label', type(other).__name__)}")
        return isinstance(other, Item) and self.label == other.label


class Entry:
    def __init__(self, label: str, approximate: bool, partial: bool, events: list[str]):
        self.label, self.approximate, self.partial, self.events = label, approximate, partial, events

    def artifact(self):
        self.events.append(f"artifact:{self.label}")
        return {"approximate": self.approximate, "partial": self.partial}


def hit(key: tuple, label: str, score: float, events: list[str]) -> _Hit:
    return _Hit(key, Item(label, events), Score(score, "bm25"))


def shape(result):
    return {
        "items": [
            {
                "item": item.item.label,
                "rank": item.rank,
                "score": None if item.score is None else {
                    "value": item.score.value,
                    "hex": item.score.value.hex(),
                    "kind": item.score.kind,
                },
            }
            for item in result.items
        ],
        "stale": result.stale,
        "approximate": result.approximate,
        "partial": result.partial,
    }


def run_case(name, *, fusion, top_k, legs, entry_flags=((False, False),), constant=60):
    events: list[str] = []
    entries = tuple(Entry(str(i), *flags, events) for i, flags in enumerate(entry_flags))
    variant = SimpleNamespace(
        fusion=None if fusion is None else SimpleNamespace(kind=fusion, constant=constant),
        top_k=top_k,
        entries=entries,
    )
    prepared = [[hit(key, label, score, events) for key, label, score in leg] for leg in legs]
    constant_admitted = fusion != "rrf" or rrf(k=constant).constant == constant
    input_descriptor = {
        "fusion": fusion,
        "constant": constant,
        "constantAdmittedByDsl": constant_admitted,
        "topK": top_k,
        "entries": [
            {"label": str(i), "approximate": flags[0], "partial": flags[1]}
            for i, flags in enumerate(entry_flags)
        ],
        "legs": [
            [
                {
                    "keyComponents": list(key),
                    "itemLabel": label,
                    "nativeScore": {"value": score, "hex": score.hex(), "kind": "bm25"},
                }
                for key, label, score in leg
            ]
            for leg in legs
        ],
    }
    try:
        result = _finish(variant, prepared)
        outcome = {"result": shape(result)}
        kind = "result"
    except (SearchError, OverflowError) as error:
        outcome = {"error": {"type": type(error).__name__, "message": str(error)}}
        kind = "error"
    return {"name": name, "input": input_descriptor, "outcomeKind": kind, **outcome, "events": events}


def main():
    cases = [
        run_case("single-leg-truncation-preserves-native-score", fusion=None, top_k=2,
                 legs=[[(("a",), "A", 0.25), (("b",), "B", 0.5), (("c",), "C", 0.75)]],
                 entry_flags=((True, False),)),
        run_case("single-leg-required-for-no-fusion", fusion=None, top_k=2,
                 legs=[[], []]),
        run_case("rrf-overlap-rank-accumulation-and-topk", fusion="rrf", constant=2, top_k=3,
                 legs=[[(("b",), "B", 9.0), (("a",), "A", 8.0), (("c",), "C", 7.0)],
                       [(("a",), "A", 0.1), (("b",), "B", 0.2), (("d",), "D", 0.3)]],
                 entry_flags=((True, False), (False, True))),
        run_case("rrf-complete-key-tie-order", fusion="rrf", constant=1, top_k=3,
                 legs=[[(("z",), "Z", 1.0), (("a",), "A", 1.0)],
                       [(("a",), "A", 1.0), (("z",), "Z", 1.0)]]),
        run_case("rrf-equal-key-items-use-python-equality", fusion="rrf", constant=60, top_k=5,
                 legs=[[(("a",), "A", 1.0)], [(("a",), "A", 2.0)]]),
        run_case("rrf-divergent-key-items-refuse", fusion="rrf", constant=60, top_k=5,
                 legs=[[(("a",), "A", 1.0)], [(("a",), "different", 2.0)]]),
        run_case("rrf-empty-legs", fusion="rrf", constant=60, top_k=4, legs=[[], []]),
        run_case("target-defined-fusion-refuses", fusion="target-defined", top_k=2,
                 legs=[[(("a",), "A", 1.0)], [(("b",), "B", 2.0)]]),
        run_case("rrf-oversized-positive-constant-dsl-admits-python-overflows",
                 fusion="rrf", constant=10**400, top_k=1,
                 legs=[[(("a",), "A", 1.0)]]),
    ]
    packet = {
        "format": "umf.r8.postgres-search-rrf-python-predecessor/0.1",
        "source": "python/umf_access/src/umf_access/postgres_search.py::_finish",
        "contract": "CONTRACT-074",
        "cases": cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(packet, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    OUT.write_text(encoded)
    loaded = json.loads(OUT.read_text())
    assert len(loaded["cases"]) == 9
    assert loaded["cases"][2]["input"]["fusion"] == "rrf"
    assert loaded["cases"][2]["input"]["constant"] == 2
    assert loaded["cases"][2]["input"]["topK"] == 3
    assert loaded["cases"][2]["input"]["legs"][0][0]["nativeScore"] == {
        "value": 9.0, "hex": "0x1.2000000000000p+3", "kind": "bm25"
    }
    assert loaded["cases"][2]["input"]["legs"][0][0]["keyComponents"] == ["b"]
    assert loaded["cases"][0]["result"]["items"][-1]["item"] == "B"
    assert loaded["cases"][2]["result"]["items"][0]["item"] == "A"
    assert loaded["cases"][2]["result"]["approximate"] is True
    assert loaded["cases"][2]["result"]["partial"] is True
    assert loaded["cases"][3]["result"]["items"][0]["item"] == "A"
    assert loaded["cases"][4]["events"] == ["eq:A:A", "artifact:0", "artifact:0"]
    assert loaded["cases"][5]["error"] == {
        "type": "SearchError",
        "message": "same-snapshot search legs disagree on the original row",
    }
    assert loaded["cases"][5]["events"] == ["eq:A:different"]
    assert loaded["cases"][6]["result"]["items"] == []
    assert loaded["cases"][7]["error"]["message"] == "target-defined fusion requires its own native program"
    assert loaded["cases"][8]["input"]["constantAdmittedByDsl"] is True
    assert loaded["cases"][8]["error"] == {
        "type": "OverflowError", "message": "int too large to convert to float"
    }
    assert loaded["cases"][8]["events"] == []
    print(f"{OUT.relative_to(ROOT)} sha256={hashlib.sha256(OUT.read_bytes()).hexdigest()} cases={len(cases)}")


if __name__ == "__main__":
    main()
