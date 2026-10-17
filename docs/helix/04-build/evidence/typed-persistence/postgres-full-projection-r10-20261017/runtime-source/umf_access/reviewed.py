"""Build-time reviewed reads and immutable catalog artifacts.

The compiler is supplied explicitly at build time. Runtime never imports Weft.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass, fields, is_dataclass
from decimal import Decimal
from typing import Generic, Protocol, TypeVar, cast

from pydantic import BaseModel

from .dsl import FieldRef, GeneratedSource, KeyLiteral, Node, RecordRef
from .types import RUNTIME_ABI, RUNTIME_IDENTITY

P = TypeVar("P", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)


class ReadBuildError(ValueError):
    pass


class ReadCompiler(Protocol):
    def compile_raw_read_json(self, request: str) -> str: ...


def _json(value: object) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    )


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


def _parameter_positions(sql: str) -> list[tuple[int, int, int]]:
    """Lossless parameter-style lexing of compiler-owned SQL, never lowering."""
    positions: list[tuple[int, int, int]] = []
    i = 0
    while i < len(sql):
        if sql.startswith("--", i):
            end = sql.find("\n", i + 2)
            i = len(sql) if end < 0 else end + 1
        elif sql.startswith("/*", i):
            depth = 1
            i += 2
            while depth and i < len(sql):
                if sql.startswith("/*", i):
                    depth += 1
                    i += 2
                elif sql.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    i += 1
            if depth:
                raise ReadBuildError("unterminated compiler SQL comment")
        elif sql[i] in ("'", '"'):
            quote = sql[i]
            escaped = (
                quote == "'"
                and i > 0
                and sql[i - 1] in ("E", "e")
                and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] == "_"))
            )
            i += 1
            while i < len(sql):
                if escaped and sql[i] == "\\":
                    i += 2
                elif sql[i] == quote:
                    if i + 1 < len(sql) and sql[i + 1] == quote:
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    i += 1
            else:
                raise ReadBuildError("unterminated compiler SQL quote")
        elif sql[i] == "$":
            tag = re.match(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$", sql[i:])
            if tag:
                delimiter = tag[0]
                end = sql.find(delimiter, i + len(delimiter))
                if end < 0:
                    raise ReadBuildError("unterminated compiler SQL dollar quote")
                i = end + len(delimiter)
            else:
                parameter = re.match(r"\$([1-9][0-9]*)", sql[i:])
                if parameter:
                    end = i + len(parameter[0])
                    positions.append((i, end, int(parameter[1]) - 1))
                    i = end
                else:
                    i += 1
        else:
            i += 1
    return positions


def _dbapi(sql: str) -> str:
    pieces: list[str] = []
    end = 0
    for start, stop, _ in _parameter_positions(sql):
        pieces.extend((sql[end:start].replace("%", "%%"), "%s"))
        end = stop
    pieces.append(sql[end:].replace("%", "%%"))
    return "".join(pieces)


def _dbapi_order(sql: str, order: list[str]) -> list[str]:
    positions = _parameter_positions(sql)
    if any(index >= len(order) for _, _, index in positions):
        raise ReadBuildError("compiler parameter ordinal outside inventory")
    return [order[index] for _, _, index in positions]


def parameter_style(sql: str, count: int) -> tuple[str, tuple[int, ...]]:
    """Build-time DB-API conversion with explicit compiler slot ordinals."""
    positions = _parameter_positions(sql)
    if any(index >= count for _, _, index in positions):
        raise ReadBuildError("compiler parameter ordinal outside inventory")
    return _dbapi(sql), tuple(index for _, _, index in positions)


def _carrier(annotation: object, *, projection: bool = False) -> tuple[str, bool]:
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
    for typ, name in (
        (str, "string"),
        (int, "integer"),
        (Decimal, "decimal"),
        (bool, "boolean"),
    ):
        if annotation is typ:
            return name, nullable
    if projection:
        if annotation is bytes:
            return "binary", nullable
        if get_origin(annotation) is tuple and get_args(annotation) == (float, Ellipsis):
            return "vector", nullable
    raise ReadBuildError("unsupported reviewed-read carrier")


def _compatible_outputs(actual: object, expected: list[dict[str, object]]) -> bool:
    if not isinstance(actual, list) or len(actual) != len(expected):
        return False
    for a, e in zip(actual, expected, strict=True):
        if (
            not isinstance(a, dict)
            or a.get("name") != e["name"]
            or a.get("carrier") != e["carrier"]
            or a.get("nullable")
            and not e["nullable"]
        ):
            return False
    return True


def _fields(model: type[BaseModel], *, projection: bool = False) -> list[dict[str, object]]:
    if (
        model.model_config.get("extra") != "forbid"
        or model.model_config.get("strict") is not True
    ):
        raise ReadBuildError(
            "reviewed read models must be strict and forbid extra fields"
        )
    result: list[dict[str, object]] = []
    for name, field in model.model_fields.items():
        if field.alias is not None:
            raise ReadBuildError("reviewed read aliases are unsupported")
        carrier, nullable = _carrier(field.annotation, projection=projection)
        result.append({"name": name, "carrier": carrier, "nullable": nullable})
    return result


def _check_source(source: GeneratedSource, binding: Mapping[str, object]) -> None:
    model = binding.get("modelJson")
    if (type(model) is not str or hashlib.sha256(model.encode()).hexdigest() != source.document_sha256
            or binding.get("modelSha256") != source.document_sha256
            or source.runtime_abi != RUNTIME_ABI):
        raise ReadBuildError("CATALOG_STALE: generated source differs from bound model/runtime")
    document = _load(model)
    if document.get("id") != source.document_id or document.get("umf") != source.core_version:
        raise ReadBuildError("CATALOG_STALE: generated document identity differs")


def _model_sources(*models: type[BaseModel]) -> list[GeneratedSource]:
    sources: list[GeneratedSource] = []
    for model in models:
        source = getattr(model, "UMF_SOURCE", None)
        if source is not None:
            if not isinstance(source, GeneratedSource):
                raise ReadBuildError("CATALOG_STALE: malformed generated model source")
            sources.append(source)
    return sources
def _generation(*models: type[BaseModel]) -> dict[str, object] | None:
    generations: list[dict[str, object]] = []
    for model in models:
        digest = getattr(model, "UMF_BUNDLE_INPUT_DIGEST", None)
        abi = getattr(model, "UMF_RUNTIME_ABI", None)
        if digest is None and abi is None:
            continue  # Explicit standalone reviewed models have no stage one.
        if (
            type(digest) is not str
            or not re.fullmatch("[0-9a-f]{64}", digest)
            or type(abi) is not tuple
            or len(abi) != 3
            or any(type(x) is not str or not x for x in abi)
        ):
            raise ReadBuildError("CATALOG_STALE: invalid generated metadata")
        if abi != RUNTIME_IDENTITY:
            raise ReadBuildError("CATALOG_STALE: installed runtime differs")
        generations.append({"inputDigest": digest, "runtimeAbi": list(abi)})
    if generations and any(pin != generations[0] for pin in generations):
        raise ReadBuildError("CATALOG_STALE: mixed generated model revisions")
    return generations[0] if generations else None


@dataclass(frozen=True)
class ReviewedSQL(Generic[P, R]):
    """Fixed authored text, explicit generated parameter/result types, no execution."""

    sql: str
    parameters: type[P]
    result: type[R]
    row_cap: int = 1000
    keyset: bool = False

    def build(
        self,
        compiler: ReadCompiler,
        *,
        target: str,
        binding: Mapping[str, object],
        snapshots: Mapping[str, int] | None = None,
        snapshot: bool = False,
        stream_page_size: bool = False,
    ) -> CatalogRead[P, R]:
        if type(self.row_cap) is not int or not 1 <= self.row_cap <= 1000:
            raise ReadBuildError("row cap must be 1..1000")
        request = {
            "version": "weft.raw-read/0.1",
            "target": target,
            "sql": self.sql,
            "binding": dict(binding),
            "parameters": _fields(self.parameters),
            "rowCap": self.row_cap,
            "keyset": self.keyset,
        }
        if type(stream_page_size) is not bool or stream_page_size and not self.keyset:
            raise ReadBuildError("stream page size requires a bounded keyset declaration")
        if stream_page_size:
            request["streamPageSize"] = True
        if type(snapshot) is not bool:
            raise ReadBuildError("snapshot must be boolean")
        if snapshot:
            if not self.keyset or target != "spark-delta4":
                raise ReadBuildError("SNAPSHOT_UNSUPPORTED: snapshot pages require an admitted Delta target")
            request["snapshot"] = True
        if snapshots is not None:
            request["snapshots"] = dict(snapshots)
        raw = compiler.compile_raw_read_json(_json(request))
        artifact = _load(raw)
        if artifact.get("status") != "compiled":
            raise ReadBuildError(
                "Weft refused reviewed read: " + _json(artifact.get("diagnostics"))
            )
        if (
            artifact.get("target") != target
            or artifact.get("binding") != dict(binding)
            or artifact.get("sourceSql") != self.sql
        ):
            raise ReadBuildError("compiler response does not match request")
        if (
            not _compatible_outputs(artifact.get("outputs"), _fields(self.result, projection=True))
            or artifact.get("parameters") != request["parameters"]
        ):
            raise ReadBuildError(
                "compiled parameter/result types differ from declaration"
            )
        artifact["dbapiSql"] = _dbapi(cast(str, artifact["sql"]))
        artifact["dbapiParameterOrder"] = _dbapi_order(cast(str, artifact["sql"]), cast(list[str], artifact["parameterOrder"]))
        sources = _model_sources(self.parameters, self.result)
        source = sources[0] if sources else None
        if source is not None:
            if any(item != source for item in sources):
                raise ReadBuildError("CATALOG_STALE: mixed generated models")
            _check_source(source, binding)
            artifact["generatedSource"] = asdict(source)
        artifact["stageOne"] = _generation(self.parameters, self.result)
        artifact["catalogDigest"] = hashlib.sha256(_json(artifact).encode()).hexdigest()
        return CatalogRead(_json(artifact), self.parameters, self.result, source)


@dataclass(frozen=True)
class CatalogRead(Generic[P, R]):
    """Serialized checked-in artifact plus exact model types. No SQL builder."""

    artifact_json: str
    parameters: type[P]
    result: type[R]
    expected_source: GeneratedSource | None = None
    context_json: str = "{}"

    def artifact(self) -> dict[str, object]:
        _load(self.context_json)
        artifact = _load(self.artifact_json)
        digest = artifact.pop("catalogDigest", None)
        if digest != hashlib.sha256(_json(artifact).encode()).hexdigest():
            raise ReadBuildError("catalog digest mismatch")
        if artifact.get("stageOne") != _generation(self.parameters, self.result):
            raise ReadBuildError("CATALOG_STALE: loaded generation differs")
        if (
            artifact.get("version") != "weft.raw-read/0.1"
            or artifact.get("status") != "compiled"
            or artifact.get("target")
            not in ("postgresql18", "lakebase18", "spark-delta4")
        ):
            raise ReadBuildError("unsupported catalog artifact")
        if not _compatible_outputs(
            artifact.get("outputs"), _fields(self.result, projection=True)
        ) or artifact.get("parameters") != _fields(self.parameters):
            raise ReadBuildError("catalog model signatures changed")
        raw_source = artifact.get("generatedSource")
        model_sources = _model_sources(self.parameters, self.result)
        if raw_source is not None:
            if not isinstance(raw_source, dict):
                raise ReadBuildError("CATALOG_STALE: malformed generated source")
            try:
                source = GeneratedSource(**raw_source)
            except (TypeError, ValueError):
                raise ReadBuildError("CATALOG_STALE: malformed generated source") from None
            expected = self.expected_source or (model_sources[0] if model_sources else None)
            if expected != source or any(item != source for item in model_sources):
                raise ReadBuildError("CATALOG_STALE: catalog and loaded generation differ")
            _check_source(source, cast(Mapping[str, object], artifact["binding"]))
        elif self.expected_source is not None or model_sources:
            raise ReadBuildError("CATALOG_STALE: catalog lacks generated model provenance")
        structural = dict(artifact)
        structural.pop("generatedSource", None)
        structural.pop("stageOne", None)
        structural.pop("dbapiSql", None)
        structural.pop("dbapiParameterOrder", None)
        compiler_digest = structural.pop("structuralDigest", None)
        if compiler_digest != hashlib.sha256(_json(structural).encode()).hexdigest():
            raise ReadBuildError("compiler artifact digest mismatch")
        if artifact.get("dbapiSql") != _dbapi(cast(str, artifact.get("sql"))):
            raise ReadBuildError("catalog parameter style mismatch")
        if artifact.get("dbapiParameterOrder") != _dbapi_order(
            cast(str, artifact["sql"]), cast(list[str], artifact["parameterOrder"])
        ):
            raise ReadBuildError("catalog parameter order mismatch")
        return artifact


def captured_source(variant: object, *, binding: Mapping[str, object]) -> GeneratedSource:
    """Validate every captured reference against its exact target model bytes."""
    from .capture import CapturedVariant
    if not isinstance(variant, CapturedVariant):
        raise ReadBuildError("captured query variant required")
    root = cast(RecordRef, variant.node.args[0])
    source = root.source
    if source is None:
        raise ReadBuildError("CATALOG_STALE: query lacks generated source")
    _check_source(source, binding)
    def check_references(value: object) -> None:
        if isinstance(value, RecordRef) and value.key_id is None:
            raise ReadBuildError("CATALOG_STALE: query lacks selected Key identity")
        if isinstance(value, (RecordRef, FieldRef, KeyLiteral)) and value.source != source:
            raise ReadBuildError("CATALOG_STALE: mixed query generations")
        if is_dataclass(value) and not isinstance(value, type):
            for field in fields(value):
                check_references(getattr(value, field.name))
        elif isinstance(value, tuple):
            for item in value:
                check_references(item)
    check_references(variant.node)
    if any(parameter.key_components and parameter.key_source != source for parameter in variant.parameters):
        raise ReadBuildError("CATALOG_STALE: query and Key parameter generations differ")
    keyset = variant.node.op == "page"
    cursor_name = None
    if keyset:
        record = cast(RecordRef, variant.node.args[0])
        cursor = cast(Node, variant.node.args[3])
        cursor_name = str(cursor.args[0])
        parameter = next(p for p in variant.parameters if p.name == cursor_name)
        identity = dict(parameter.key_identity)
        if identity != {"documentId": source.document_id, "coreVersion": source.core_version, "module": record.module, "element": record.element, "key": record.key_id}:
            raise ReadBuildError("page cursor Key differs from root Record")
    return source


def build_query(declaration: object, compiler: ReadCompiler, *, parameters: type[P], result: type[R], target: str, binding: Mapping[str, object], row_cap: int = 1000) -> CatalogRead[P, R]:
    """Capture one closed DSL read and compile it through the same Weft entrypoint."""
    from .capture import CapturedDeclaration
    from .dsl import render_logical

    if (
        not isinstance(declaration, CapturedDeclaration)
        or declaration.kind != "query"
        or len(declaration.variants) != 1
    ):
        raise ReadBuildError("one captured query variant required")
    variant = declaration.variants[0]
    if variant.node.op == "update":
        raise ReadBuildError("read catalogs cannot contain mutations")
    source = captured_source(variant, binding=binding)
    if any(item != source for item in _model_sources(parameters, result)):
        raise ReadBuildError("CATALOG_STALE: query and generated models differ")
    keyset = variant.node.op == "page"
    cursor_name = str(cast(Node, variant.node.args[3]).args[0]) if keyset else None
    declared = [(p.name, _carrier(p.carrier)) for p in variant.parameters if p.name != cursor_name]
    expected = [(f["name"], (f["carrier"], f["nullable"])) for f in _fields(parameters)]
    if declared != expected:
        raise ReadBuildError("captured signature differs from parameter model")
    snapshot = any(step.op == "snapshot" for step in cast(tuple[Node, ...], variant.node.args[1]))
    compiled = ReviewedSQL(render_logical(variant, binding=binding), parameters, result, row_cap, keyset=keyset).build(compiler, target=target, binding=binding, snapshot=snapshot)
    artifact = compiled.artifact()
    artifact.pop("catalogDigest", None)  # artifact() already excludes this local digest.
    artifact["generatedSource"] = asdict(source)
    artifact["catalogDigest"] = hashlib.sha256(_json(artifact).encode()).hexdigest()
    return CatalogRead(_json(artifact), parameters, result, source)
