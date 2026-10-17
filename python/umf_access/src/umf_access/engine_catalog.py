"""Inert engine catalogs; native admission and compilation equality stay owned.

A valid wrapper conveys source/type custody only. It never grants read or action
permission, selects an engine connection, or interprets engine storage SQL.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, TypeVar

from pydantic import BaseModel

from .native_program import ProgramBuildError, canonical_json, program_json
from .reviewed import (
    CatalogRead,
    ReadBuildError,
    _compatible_outputs,
    _fields,
    _generation,
)

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)


@dataclass(frozen=True)
class EngineRead(CatalogRead[P, R]):
    @classmethod
    def build(
        cls,
        compiler: Any,
        request: Mapping[str, Any],
        *,
        parameters: type[P],
        result: type[R],
        method: str,
        page_size: int | None = None,
    ) -> EngineRead[P, R]:
        if page_size is not None and (type(page_size) is not int or not 1 <= page_size <= 999 or method not in ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages")):
            raise ReadBuildError("original engine page size must be in 1..999")
        compile_method = getattr(compiler, "compile_engine_page_json" if page_size is not None else "compile_engine_read_json", None)
        if not callable(compile_method):
            raise ReadBuildError(
                "WEFT_BLOCKED: original engine catalog compiler required"
            )
        original = compile_method(
            canonical_json(
                {
                    "version": "weft.engine-page/0.1" if page_size is not None else "weft.engine-read/0.1",
                    **({"pageSize": page_size} if page_size is not None else {}),
                    "compiler": method,
                    "request": dict(request),
                }
            )
        )
        program = program_json(original)
        if program.get("status") != "compiled":
            raise ProgramBuildError(original)
        if program.get("request") != dict(request) or program.get("compiler") != method or (page_size is not None and program.get("pageSize") != page_size):
            raise ReadBuildError("original engine request or page bound differs")
        wrapper = {
            "version": "umf.engine-catalog/0.1",
            "programJson": original,
            "parameters": _fields(parameters),
            "outputs": _fields(result, parameter=False, allow_related=True),
            "stageOne": _generation(parameters, result),
        }
        wrapper["catalogDigest"] = hashlib.sha256(
            canonical_json(wrapper).encode()
        ).hexdigest()
        entry = cls(canonical_json(wrapper), parameters, result)
        entry.artifact()
        return entry

    def originals(self) -> str:
        self.artifact()
        return program_json(self.artifact_json)["programJson"]

    def artifact(self) -> dict[str, Any]:
        wrapper = program_json(self.artifact_json)
        if (
            set(wrapper)
            != {
                "version",
                "programJson",
                "parameters",
                "outputs",
                "stageOne",
                "catalogDigest",
            }
            or wrapper["version"] != "umf.engine-catalog/0.1"
        ):
            raise ReadBuildError("closed engine catalog required")
        digest = wrapper.pop("catalogDigest")
        if digest != hashlib.sha256(canonical_json(wrapper).encode()).hexdigest():
            raise ReadBuildError("engine catalog digest differs")
        if wrapper["stageOne"] != _generation(self.parameters, self.result):
            raise ReadBuildError("CATALOG_STALE: engine loaded generation differs")
        if wrapper["parameters"] != _fields(self.parameters) or wrapper[
            "outputs"
        ] != _fields(self.result, parameter=False, allow_related=True):
            raise ReadBuildError("engine model signature differs")
        original = wrapper["programJson"]
        if type(original) is not str or len(original.encode()) > 4_194_304:
            raise ReadBuildError("bounded original engine program required")
        program = program_json(original)
        if (
            program.get("version") not in ("weft.engine-read/0.1", "weft.engine-page/0.1")
            or program.get("status") != "compiled"
        ):
            raise ReadBuildError("original compiled engine program required")
        page = program["version"] == "weft.engine-page/0.1"
        if page and (program.get("after") is not None or type(program.get("pageSize")) is not int or not 1 <= program["pageSize"] <= 999 or program.get("compiler") not in ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages")):
            raise ReadBuildError("original first-page engine catalog required")
        structural = dict(program)
        pin = structural.pop("structuralDigest", None)
        if pin != {
            "owner": "weft-runtime-engine-page" if page else "weft-runtime-engine-read",
            "version": "0.1",
            "sha256": hashlib.sha256(canonical_json(structural).encode()).hexdigest(),
        }:
            raise ReadBuildError("original engine compiler digest differs")
        if not _compatible_outputs(program.get("outputs"), wrapper["outputs"]):
            raise ReadBuildError("engine output types differ from generated view")
        declared = {p["name"]: p for p in wrapper["parameters"]}
        native = program["request"]["parameters"]
        if set(declared) != set(native) or any(
            native[n]["family"] != p["carrier"] or p["nullable"]
            for n, p in declared.items()
        ):
            raise ReadBuildError("engine parameter signatures differ")
        return program
