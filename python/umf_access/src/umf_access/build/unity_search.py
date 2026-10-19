# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed Unity Catalog search build bridge; original Weft programs own SQL."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

from ..dsl import FieldRef, Fusion, SearchLeg
from ..native_program import NativeProgram


def compile_unity_search(
    compiler: Any,
    *,
    legs: Sequence[SearchLeg[Any]],
    fusion: Fusion | None,
    target: dict[str, Any],
    selection_sql: str,
    native_parameters: list[dict[str, Any]],
    fields: tuple[FieldRef, ...],
    names: tuple[str, ...],
    top: int,
    allow_partial: bool,
    bundle_digest: str,
) -> tuple[NativeProgram, str, bool, tuple[tuple[str, str], ...]]:
    vectors = [leg for leg in legs if leg.kind in ("vector", "text-vector")]
    keywords = [leg for leg in legs if leg.kind == "keyword"]
    if (
        len(vectors) != 1
        or len(vectors) + len(keywords) != len(legs)
        or len(keywords) > 1
        or bool(keywords) != (fusion is not None)
        or fusion is not None and fusion.kind != "target-defined"
    ):
        raise ValueError("SEARCH_UNSUPPORTED: Unity Catalog requires ANN or native target-defined HYBRID")
    if allow_partial is not True or not isinstance(target.get("unitySearch"), dict):
        raise ValueError("SEARCH_FILTER: explicit asynchronous partial search and managed binding required")

    def descriptor(leg: SearchLeg[Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        if leg.index_json is None or leg.value is None or leg.value.op != "param":
            raise ValueError("source-bound search index and original parameter required")
        value = json.loads(leg.index_json)
        source, index = value["source"], value["declaration"]
        if source["documentSha256"] != target["binding"]["modelSha256"]:
            raise ValueError("search source/binding differs")
        return source, index

    vector = vectors[0]
    source, index = descriptor(vector)
    if index["kind"] != "vector" or (
        vector.kind == "text-vector" and index["vector"]["computedBy"] != "host"
    ):
        raise ValueError("SEARCH_UNSUPPORTED: explicit host vector mechanism required")

    def original_source(value: dict[str, Any]) -> dict[str, Any]:
        return {name: value[name] for name in (
            "documentId", "coreVersion", "documentSha256", "module", "pointer"
        )} if "coreVersion" in value else {
            **{name: value[name] for name in ("documentId", "documentSha256", "module", "pointer")},
            "coreVersion": json.loads(target["binding"]["modelJson"])["umf"],
        }

    occupied = {parameter["name"] for parameter in native_parameters}
    occupied.update(str(leg.value.args[0]) for leg in legs if leg.value is not None)

    def internal(name: str) -> str:
        while name in occupied:
            name += "_"
        occupied.add(name)
        return name

    request: dict[str, Any] = {
        "version": "weft.unity-search/0.1",
        "source": original_source(source),
        "selection": {
            "version": "weft.raw-read/0.1", "target": "unity-catalog-current",
            "sql": selection_sql, "binding": target["binding"],
            "parameters": native_parameters, "rowCap": 1000,
        },
        "queryParameter": internal("__umf_search_query"), "topK": top,
        "projection": [
            {"field": {"module": field.field_module, "element": field.field}, "name": name}
            for field, name in zip(fields, names, strict=True)
        ],
        "allowPartial": True, "managed": target["unitySearch"],
    }
    aliases: tuple[tuple[str, str], ...] = ()
    if keywords:
        keyword_source, keyword_index = descriptor(keywords[0])
        if keyword_index["kind"] != "keyword":
            raise ValueError("search leg/index meaning differs")
        request["keywordSource"] = original_source(keyword_source)
        text_parameter = internal("__umf_search_text")
        request["textQueryParameter"] = text_parameter
        aliases = ((text_parameter, str(keywords[0].value.args[0])),)
        request["fusion"] = {"kind": "target-defined"}
    program = NativeProgram.build(compiler, request, bundle_input_digest=bundle_digest)
    if program.checked()["index"] != index:
        raise ValueError("captured index metadata differs from original source")
    if keywords and program.checked()["keywordIndex"] != keyword_index:
        raise ValueError("captured keyword index metadata differs from original source")
    return program, str(vector.value.args[0]), vector.kind == "text-vector", aliases
