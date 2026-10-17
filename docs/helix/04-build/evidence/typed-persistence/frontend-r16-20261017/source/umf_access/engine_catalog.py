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


def _related_packet(request: Mapping[str, Any], source: object, relationship: object, method: str, page_size: int | None = None) -> dict[str, Any]:
    """Retain both complete original requests; composition remains compiler-owned."""
    methods = ("truss-runtime", "ashlar-spark4", "ashlar-dbsql-20261016") if page_size is None else ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages")
    if method not in methods:
        raise ReadBuildError("WEFT_BLOCKED: original engine navigation compiler profile required")
    if not isinstance(request, Mapping) or not isinstance(source, Mapping) or not isinstance(relationship, Mapping) or set(relationship)!={"module","id","direction"} or any(type(relationship[name]) is not str or not relationship[name] for name in relationship) or relationship["direction"] not in ("forward","inverse"):
        raise ReadBuildError("closed original directed relationship identity required")
    if type(request.get("sql")) is not str or type(source.get("sql")) is not str:
        raise ReadBuildError("both original logical source and target queries required")
    if canonical_json({k:v for k,v in source.items() if k!="sql"}) != canonical_json({k:v for k,v in request.items() if k!="sql"}):
        raise ReadBuildError("original engine navigation requests must share exact context and parameter inventory")
    return {"version":"weft.engine-related-page/0.1" if page_size is not None else "weft.engine-related-read/0.1","compiler":method,"source":dict(source),"target":dict(request),"relationship":dict(relationship), **({"pageSize": page_size} if page_size is not None else {})}


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
        related_source: Mapping[str, Any] | None = None,
        relationship: Mapping[str, str] | None = None,
    ) -> EngineRead[P, R]:
        original = cls.compile_original(compiler, request, method=method, page_size=page_size, related_source=related_source, relationship=relationship)
        return cls.from_original(original, parameters=parameters, result=result)

    @classmethod
    def compile_original(
        cls,
        compiler: Any,
        request: Mapping[str, Any],
        *,
        method: str,
        page_size: int | None = None,
        related_source: Mapping[str, Any] | None = None,
        relationship: Mapping[str, str] | None = None,
    ) -> str:
        """Obtain one untouched owner program before choosing typed transport."""
        if (related_source is None) != (relationship is None):
            raise ReadBuildError("both original navigation source and relationship are required")
        related = related_source is not None
        packet = _related_packet(request, related_source, relationship, method, page_size) if related_source is not None and relationship is not None else None
        if page_size is not None and (type(page_size) is not int or not 1 <= page_size <= 999 or method not in ("truss-runtime", "ashlar-spark4-pages", "ashlar-dbsql-20261016-pages")):
            raise ReadBuildError("original engine page size must be in 1..999")
        compile_method = getattr(compiler, ("compile_engine_related_page_json" if page_size is not None else "compile_engine_related_read_json") if related else "compile_engine_page_json" if page_size is not None else "compile_engine_read_json", None)
        if not callable(compile_method):
            raise ReadBuildError(
                "WEFT_BLOCKED: original engine catalog compiler required"
            )
        original = compile_method(
            canonical_json(
                packet if packet is not None else {
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
        if canonical_json(program.get("request")) != canonical_json(dict(request)) or program.get("compiler") != method or (page_size is not None and program.get("pageSize") != page_size):
            raise ReadBuildError("original engine request or page bound differs")
        if packet is not None and canonical_json(program.get("relatedRequest")) != canonical_json(packet):
            raise ReadBuildError("original engine navigation packet differs")
        return original

    @classmethod
    def from_original(
        cls, original: str, *, parameters: type[P], result: type[R]
    ) -> EngineRead[P, R]:
        """Wrap original bytes; artifact and native authority guards still apply."""
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
        if "relatedRequest" in program:
            packet = program["relatedRequest"]
            fields = {"version","compiler","source","target","relationship"} | ({"pageSize"} if page else set())
            if type(packet) is not dict or set(packet) != fields:
                raise ReadBuildError("closed original engine navigation packet required")
            expected = _related_packet(program["request"], packet.get("source"), packet.get("relationship"), program.get("compiler"), program.get("pageSize") if page else None)
            if canonical_json(packet) != canonical_json(expected):
                raise ReadBuildError("original engine navigation packet differs")
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
