"""Build-time reviewed reads and immutable catalog artifacts.

The compiler is supplied explicitly at build time. Runtime never imports Weft.
"""
from __future__ import annotations
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
import hashlib
import json
import re
from typing import Generic, Protocol, TypeVar, cast
from pydantic import BaseModel

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)

class ReadBuildError(ValueError):
    pass

class ReadCompiler(Protocol):
    def compile_raw_read_json(self, request: str) -> str: ...


def _json(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    out: dict[str, object] = {}
    for key, value in pairs:
        if key in out:
            raise ReadBuildError("duplicate catalog member")
        out[key] = value
    return out


def _load(text: str) -> dict[str, object]:
    if len(text) > 2_000_000:
        raise ReadBuildError("catalog artifact exceeds byte budget")
    value: object = json.loads(text, object_pairs_hook=_object)
    if not isinstance(value, dict):
        raise ReadBuildError("catalog object required")
    return cast(dict[str, object], value)


def _dbapi(sql: str) -> str:
    # Build-time parameter-style conversion, preserving quoted identifiers.
    # Percent signs in identifiers are escaped for the DB-API driver.
    token = re.compile(r'"(?:[^\"]|\"\")*"|\$[1-9][0-9]*')
    pieces: list[str] = []
    end = 0
    for match in token.finditer(sql):
        pieces.append(sql[end:match.start()].replace("%", "%%"))
        pieces.append("%s" if match[0].startswith("$") else match[0].replace("%", "%%"))
        end = match.end()
    pieces.append(sql[end:].replace("%", "%%"))
    return "".join(pieces)


def _dbapi_order(sql: str, order: list[str]) -> list[str]:
    token = re.compile(r'"(?:[^\"]|\"\")*"|\$[1-9][0-9]*')
    return [order[int(m[0][1:]) - 1] for m in token.finditer(sql) if m[0].startswith("$")]


def _carrier(annotation: object) -> tuple[str, bool]:
    from types import UnionType
    from typing import Annotated, Union, get_args, get_origin
    while get_origin(annotation) is Annotated:
        annotation = get_args(annotation)[0]
    nullable = False
    if get_origin(annotation) in (Union, UnionType):
        members = get_args(annotation)
        nullable = type(None) in members
        rest = [t for t in members if t is not type(None)]
        if len(rest) != 1:
            raise ReadBuildError("one scalar result/parameter carrier required")
        annotation = rest[0]
        while get_origin(annotation) is Annotated:
            annotation = get_args(annotation)[0]
    for typ, name in ((str, "string"), (int, "integer"), (Decimal, "decimal"), (bool, "boolean")):
        if annotation is typ:
            return name, nullable
    raise ReadBuildError("unsupported reviewed-read carrier")


def _compatible_outputs(actual: object, expected: list[dict[str, object]]) -> bool:
    if not isinstance(actual, list) or len(actual) != len(expected):
        return False
    for a, e in zip(actual, expected, strict=True):
        if not isinstance(a, dict) or a.get("name") != e["name"] or a.get("carrier") != e["carrier"] or a.get("nullable") and not e["nullable"]:
            return False
    return True


def _fields(model: type[BaseModel]) -> list[dict[str, object]]:
    if model.model_config.get("extra") != "forbid" or model.model_config.get("strict") is not True:
        raise ReadBuildError("reviewed read models must be strict and forbid extra fields")
    result: list[dict[str, object]] = []
    for name, field in model.model_fields.items():
        if field.alias is not None:
            raise ReadBuildError("reviewed read aliases are unsupported")
        carrier, nullable = _carrier(field.annotation)
        result.append({"name": name, "carrier": carrier, "nullable": nullable})
    return result


@dataclass(frozen=True)
class ReviewedSQL(Generic[P, R]):
    """Fixed authored text, explicit generated parameter/result types, no execution."""
    sql: str
    parameters: type[P]
    result: type[R]
    row_cap: int = 1000
    keyset: bool = False

    def build(self, compiler: ReadCompiler, *, target: str, binding: Mapping[str, object]) -> CatalogRead[P, R]:
        if type(self.row_cap) is not int or not 1 <= self.row_cap <= 1000:
            raise ReadBuildError("row cap must be 1..1000")
        request = {"version": "weft.raw-read/0.1", "target": target, "sql": self.sql,
                   "binding": dict(binding), "parameters": _fields(self.parameters), "rowCap": self.row_cap, "keyset": self.keyset}
        raw = compiler.compile_raw_read_json(_json(request))
        artifact = _load(raw)
        if artifact.get("status") != "compiled":
            raise ReadBuildError("Weft refused reviewed read: " + _json(artifact.get("diagnostics")))
        if artifact.get("target") != target or artifact.get("binding") != dict(binding) or artifact.get("sourceSql") != self.sql:
            raise ReadBuildError("compiler response does not match request")
        if not _compatible_outputs(artifact.get("outputs"), _fields(self.result)) or artifact.get("parameters") != request["parameters"]:
            raise ReadBuildError("compiled parameter/result types differ from declaration")
        artifact["dbapiSql"] = _dbapi(cast(str, artifact["sql"]))
        artifact["dbapiParameterOrder"] = _dbapi_order(cast(str, artifact["sql"]), cast(list[str], artifact["parameterOrder"]))
        artifact["catalogDigest"] = hashlib.sha256(_json(artifact).encode()).hexdigest()
        return CatalogRead(_json(artifact), self.parameters, self.result)


@dataclass(frozen=True)
class CatalogRead(Generic[P, R]):
    """Serialized checked-in artifact plus exact model types. No SQL builder."""
    artifact_json: str
    parameters: type[P]
    result: type[R]

    def artifact(self) -> dict[str, object]:
        artifact = _load(self.artifact_json)
        digest = artifact.pop("catalogDigest", None)
        if digest != hashlib.sha256(_json(artifact).encode()).hexdigest():
            raise ReadBuildError("catalog digest mismatch")
        if artifact.get("version") != "weft.raw-read/0.1" or artifact.get("status") != "compiled" or artifact.get("target") not in ("postgresql18", "lakebase18"):
            raise ReadBuildError("unsupported catalog artifact")
        if not _compatible_outputs(artifact.get("outputs"), _fields(self.result)) or artifact.get("parameters") != _fields(self.parameters):
            raise ReadBuildError("catalog model signatures changed")
        structural = dict(artifact)
        structural.pop("dbapiSql", None)
        structural.pop("dbapiParameterOrder", None)
        compiler_digest = structural.pop("structuralDigest", None)
        if compiler_digest != hashlib.sha256(_json(structural).encode()).hexdigest():
            raise ReadBuildError("compiler artifact digest mismatch")
        if artifact.get("dbapiSql") != _dbapi(cast(str, artifact.get("sql"))):
            raise ReadBuildError("catalog parameter style mismatch")
        if artifact.get("dbapiParameterOrder") != _dbapi_order(cast(str, artifact["sql"]), cast(list[str], artifact["parameterOrder"])):
            raise ReadBuildError("catalog parameter order mismatch")
        return artifact


def build_query(declaration: object, compiler: ReadCompiler, *, parameters: type[P], result: type[R], target: str, binding: Mapping[str, object], row_cap: int = 1000) -> CatalogRead[P, R]:
    """Capture one closed DSL read and compile it through the same Weft entrypoint."""
    from .capture import CapturedDeclaration
    from .dsl import render_logical
    if not isinstance(declaration, CapturedDeclaration) or declaration.kind != "query" or len(declaration.variants) != 1:
        raise ReadBuildError("one captured query variant required")
    variant = declaration.variants[0]
    if variant.node.op == "update":
        raise ReadBuildError("read catalogs cannot contain mutations")
    keyset = variant.node.op == "page"
    cursor_name = None
    if keyset:
        from .dsl import Node, RecordRef
        record = cast(RecordRef, variant.node.args[0])
        cursor = cast(Node, variant.node.args[3])
        cursor_name = str(cursor.args[0])
        parameter = next(p for p in variant.parameters if p.name == cursor_name)
        identity = dict(parameter.key_identity)
        if identity.get("module") != record.module or identity.get("element") != record.element:
            raise ReadBuildError("page cursor Key differs from root Record")
    declared = [(p.name, _carrier(p.carrier)) for p in variant.parameters if p.name != cursor_name]
    expected = [(f["name"], (f["carrier"], f["nullable"])) for f in _fields(parameters)]
    if declared != expected:
        raise ReadBuildError("captured signature differs from parameter model")
    return ReviewedSQL(render_logical(variant, binding=binding), parameters, result, row_cap, keyset=keyset).build(compiler, target=target, binding=binding)
