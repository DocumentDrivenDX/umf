# SPDX-License-Identifier: MIT OR Apache-2.0
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
from typing import Generic, NoReturn, Protocol, TypeVar, cast

from pydantic import BaseModel

from .dsl import FieldRef, GeneratedSource, KeyLiteral, Node, RecordRef
from .related_keys import transport_spec
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


def _compiler_transport(artifact: Mapping[str, object], *, catalog: bool = False) -> bool:
    """Retain transport sealed by the compiler; legacy catalogs keep their ABI.

    This digest is an integrity check within trusted build/catalog custody, not
    authentication of an arbitrary program supplied by a caller.
    """
    structural = dict(artifact)
    structural.pop("generatedSource", None)
    structural.pop("stageOne", None)
    digest = structural.pop("structuralDigest", None)
    present = ("dbapiSql" in structural, "dbapiParameterOrder" in structural)
    if present[0] != present[1]:
        raise ReadBuildError("compiler transport inventory incomplete")
    if digest == hashlib.sha256(_json(structural).encode()).hexdigest():
        if not present[0]:
            return False
        sql, order, native_order = structural["dbapiSql"], structural["dbapiParameterOrder"], structural.get("parameterOrder")
        if (not isinstance(sql, str) or not sql or not isinstance(order, list)
            or not isinstance(native_order, list) or any(not isinstance(name, str) for name in native_order)
            or any(not isinstance(name, str) or name not in native_order for name in order)):
            raise ReadBuildError("compiler transport inventory invalid")
        return True
    # Older SDK catalogs appended their own transport after compiler sealing.
    # Only catalog loading permits that form; a build must not accept supplied
    # but unsealed compiler transport and silently reinterpret it.
    if catalog and present[0]:
        structural.pop("dbapiSql")
        structural.pop("dbapiParameterOrder")
        if digest == hashlib.sha256(_json(structural).encode()).hexdigest():
            return False
    raise ReadBuildError("compiler artifact digest mismatch")


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


def parameter_signature(annotation: object) -> dict[str, object]:
    """Original list facets are local read-parameter metadata, not scalar widening."""
    from types import UnionType
    from typing import Annotated, Union, get_args, get_origin

    while get_origin(annotation) is Annotated:
        annotation = get_args(annotation)[0]
    if get_origin(annotation) in (Union, UnionType):
        members = get_args(annotation)
        if any(get_origin(member) is list for member in members):
            raise ReadBuildError("WEFT_BLOCKED: WR-A4 list containers must be non-null")
    if get_origin(annotation) is list:
        members = get_args(annotation)
        if len(members) != 1:
            raise ReadBuildError("WEFT_BLOCKED: WR-A4 one exact list element carrier required")
        carrier, nullable = _carrier(members[0])
        return {"carrier": carrier, "nullable": False, "container": "list", "elementNullable": nullable, "maxItems": 1000}
    carrier, nullable = _carrier(annotation)
    return {"carrier": carrier, "nullable": nullable}


def validate_list_parameters(parameters: object, values: Mapping[str, object]) -> None:
    """Validate every original list facet before dispatch, preserving all values."""
    if type(parameters) is not list:
        raise ReadBuildError("original parameter inventory required")
    for descriptor in parameters:
        if type(descriptor) is not dict or "container" not in descriptor:
            continue
        if set(descriptor) != {"name", "carrier", "nullable", "container", "elementNullable", "maxItems"} or descriptor["container"] != "list" or descriptor["nullable"] is not False or type(descriptor["elementNullable"]) is not bool or type(descriptor["maxItems"]) is not int or not 1 <= descriptor["maxItems"] <= 1000:
            raise ReadBuildError("closed original list parameter facets required")
        if type(descriptor["carrier"]) is not str or type(descriptor["name"]) is not str:
            raise ReadBuildError("original list parameter identity/carrier differs")
        annotation = {"string": str, "integer": int, "decimal": Decimal, "boolean": bool}.get(descriptor["carrier"])
        value = values.get(descriptor["name"])
        if annotation is None or type(value) is not list or len(value) > descriptor["maxItems"]:
            raise ReadBuildError("original list parameter cardinality/carrier differs")
        for item in value:
            if item is None and descriptor["elementNullable"]:
                continue
            if type(item) is not annotation or isinstance(item, Decimal) and not item.is_finite() or isinstance(item, str) and ("\x00" in item or any(0xD800 <= ord(character) <= 0xDFFF for character in item)):
                raise ReadBuildError("original list element carrier differs")


def _compatible_outputs(actual: object, expected: list[dict[str, object]]) -> bool:
    if not isinstance(actual, list) or len(actual) != len(expected):
        return False
    for a, e in zip(actual, expected, strict=True):
        if e.get("carrier") == "related-keys":
            if type(a) is not dict or a.get("nullable") is not False or a != e:
                return False
            continue
        if (
            not isinstance(a, dict)
            or a.get("name") != e["name"]
            or a.get("carrier") != e["carrier"]
            or a.get("nullable")
            and not e["nullable"]
        ):
            return False
    return True


def _fields(model: type[BaseModel], *, projection: bool = False, parameter: bool = True, allow_related: bool = False) -> list[dict[str, object]]:
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
        related = transport_spec(model) if projection or allow_related else None
        if related is not None and name == related[0]:
            result.append({"name": name, "carrier": "related-keys", "nullable": False, "decoder": related[2]})
        else:
            if projection:
                carrier, nullable = _carrier(field.annotation, projection=True)
                result.append({"name": name, "carrier": carrier, "nullable": nullable})
            elif parameter:
                result.append({"name": name, **parameter_signature(field.annotation)})
            else:
                carrier, nullable = _carrier(field.annotation)
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
        related_source: str | None = None,
        related_relationship: Mapping[str, str] | None = None,
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
        if target in ("postgresql18", "lakebase18"):
            request["verificationProfile"] = "source-exact/0.1"
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
        related_request = None
        if related_source is not None:
            if related_relationship is None or set(related_relationship) != {"module", "id", "direction"}:
                raise ReadBuildError("WR-A6 original relationship metadata required")
            source_request = dict(request)
            source_request.update(sql=related_source, keyset=False)
            for target_only in ("streamPageSize", "snapshot"):
                source_request.pop(target_only, None)
            related_request = {
                "version": "weft.related-read/0.1",
                "source": source_request,
                "target": request,
                "relationship": dict(related_relationship),
            }
            method = getattr(compiler, "compile_related_read_json", None)
            if not callable(method):
                raise ReadBuildError("WEFT_BLOCKED: WR-A6 original related-read compiler required")
            raw = method(_json(related_request))
        else:
            if related_relationship is not None:
                raise ReadBuildError("WR-A6 original source query required")
            raw = compiler.compile_raw_read_json(_json(request))
        artifact = _load(raw)
        if artifact.get("status") != "compiled":
            raise ReadBuildError(
                "Weft refused reviewed read: " + _json(artifact.get("diagnostics"))
            )
        if related_request is not None and artifact.get("relatedRequest") != related_request:
            raise ReadBuildError("compiler related source/target custody differs from request")
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
        _require_source_exact(artifact)
        catalog_fence(artifact)
        if not _compiler_transport(artifact):
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


def catalog_fence(artifact: Mapping[str, object]) -> dict[str, object] | None:
    """Retain the original deployment and every selected configuration origin."""
    def refuse() -> NoReturn:
        raise ReadBuildError("NATIVE_TEXT_SEARCH_FENCE_REQUIRED")
    fenced_version = artifact.get("version") in ("weft.raw-read/0.2", "weft.native-action/0.2", "weft.native-bulk/0.2", "weft.search/0.2")
    if artifact.get("target") not in ("postgresql18", "lakebase18"):
        if fenced_version:
            refuse()
        if any(isinstance(value, dict) and "nativeCatalogFence" in value for value in (artifact.get("binding"), artifact.get("obligations"))):
            refuse()
        return None
    def name(value: object) -> bool:
        if type(value) is not str or "\x00" in value:
            return False
        try:
            return 1 <= len(value.encode("utf-8")) <= 63
        except UnicodeEncodeError:
            return False
    obligations = artifact.get("obligations")
    if not isinstance(obligations, dict):
        refuse()
    expected = set()
    for member, entries_name in (("termFilter", "indexes"), ("keywordConfiguration", "configurations"), ("textSearchEffects", "indexes")):
        selected = obligations.get(member)
        if selected is None:
            continue
        if member == "textSearchEffects" and (not isinstance(selected, dict) or selected.get("version") != "umf.pg-ts-effects/0.1" or selected.get("nativeCatalogBeforeAfter") is not True):
            refuse()
        entries = selected.get(entries_name) if isinstance(selected, dict) else None
        if not isinstance(entries, list) or not entries:
            refuse()
        for entry in entries:
            if member == "textSearchEffects" and (not isinstance(entry, dict)
                or set(entry) != {"source", "index", "nativeBinding", "logicalTable", "nativeTable", "nativeColumns", "configuration", "nativeAdmission"}
                or not isinstance(entry.get("nativeColumns"), list) or not entry["nativeColumns"]
                or any(type(column) is not str or not column for column in entry["nativeColumns"])):
                refuse()
            if not isinstance(entry, dict) or entry.get("configuration") not in ("pg_catalog.english", "pg_catalog.simple") or not isinstance(entry.get("source"), dict) or not isinstance(entry.get("index"), dict):
                refuse()
            expected.add(json.dumps({key: entry[key] for key in ("source", "index", "configuration")}, sort_keys=True, separators=(",", ":"), ensure_ascii=False))
    packet = obligations.get("nativeCatalogFence")
    if not expected and packet is None and (not fenced_version or artifact.get("version") in ("weft.native-action/0.2", "weft.native-bulk/0.2")):
        return None
    if not fenced_version:
        refuse()
    if not isinstance(packet, dict) or set(packet) != {"version", "deployment", "origins", "lockSql", "lockPosition", "nativeCatalogBeforeAfter", "nativeAdmission", "deploymentProgram"}:
        refuse()
    binding = artifact.get("binding")
    deployment = packet.get("deployment")
    if (not isinstance(binding, dict) or not isinstance(deployment, dict)
        or set(deployment) != {"version", "schema", "view", "owner", "ownerProfile"}
        or deployment.get("version") != "umf.pg-ts-fence/0.1"
        or deployment.get("ownerProfile") != "non-login-maintainer/0.1"
        or any(not name(deployment.get(key)) for key in ("schema", "view", "owner"))
        or binding.get("nativeCatalogFence") != deployment
        or packet.get("version") != "umf.pg-ts-fence/0.1"
        or packet.get("lockPosition") != "before-first-snapshot"
        or packet.get("nativeCatalogBeforeAfter") is not True
        or type(packet.get("lockSql")) is not str or not packet["lockSql"]
        or not isinstance(packet.get("origins"), list)):
        refuse()
    actual = set()
    for origin in packet["origins"]:
        if not isinstance(origin, dict) or set(origin) != {"source", "index", "configuration"}:
            refuse()
        key = json.dumps(origin, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if key in actual:
            refuse()
        actual.add(key)
    if not expected or actual != expected:
        refuse()
    admission = packet.get("nativeAdmission")
    if not isinstance(admission, dict) or set(admission) != {"sql", "dbapiSql", "parameters", "dbapiParameterOrder"} or not isinstance(admission.get("parameters"), list):
        refuse()
    for parameter in admission["parameters"]:
        source = parameter.get("source") if isinstance(parameter, dict) else None
        if not isinstance(source, dict) or set(source) != {"literal"}:
            refuse()
    # Retain this original owner deployment program as inert source metadata.
    # Runtime never executes CREATE VIEW/ALTER OWNER or grants privileges.
    program = packet.get("deploymentProgram")
    if (not isinstance(program, dict)
        or set(program) != {"version", "createViewSql", "alterOwnerSql", "ownerPrerequisites", "readerPrerequisites"}
        or program.get("version") != "weft.pg-ts-fence-deployment/0.1"
        or any(type(program.get(key)) is not str or not program[key] for key in ("createViewSql", "alterOwnerSql"))
        or not isinstance(program.get("ownerPrerequisites"), dict)
        or not isinstance(program.get("readerPrerequisites"), dict)):
        refuse()
    owner_prerequisites = program["ownerPrerequisites"]
    reader_prerequisites = program["readerPrerequisites"]
    if (any(owner_prerequisites.get(key) is not False for key in ("superuser", "bypassRls", "login", "createRole", "createDb", "replication"))
        or owner_prerequisites.get("schemaOwner") is not True
        or reader_prerequisites.get("schemaUsage") is not True
        or reader_prerequisites.get("viewMaintain") is not True
        or reader_prerequisites.get("ownerMembership") is not False):
        refuse()
    if owner_prerequisites != {
        "role": deployment["owner"], "superuser": False, "bypassRls": False,
        "login": False, "createRole": False, "createDb": False, "replication": False,
        "schemaOwner": True, "catalogMaintain": ["pg_catalog.pg_namespace", "pg_catalog.pg_proc", "pg_catalog.pg_ts_config", "pg_catalog.pg_ts_config_map", "pg_catalog.pg_ts_dict", "pg_catalog.pg_ts_parser", "pg_catalog.pg_ts_template"],
    } or reader_prerequisites != {"schemaUsage": True, "viewMaintain": True, "ownerMembership": False}:
        refuse()
    return packet


def _require_source_exact(artifact: Mapping[str, object]) -> None:
    """Require original-owner native schema proof before promoting PG reads."""
    if artifact.get("target") not in ("postgresql18", "lakebase18"):
        return
    obligations = artifact.get("obligations")
    projection = obligations.get("nativeProjection") if isinstance(obligations, dict) else None
    if (
        not isinstance(projection, dict)
        or projection.get("version") != "umf.native-columns/0.1"
        or projection.get("verificationProfile") != "source-exact/0.1"
        or projection.get("nativeCatalogBeforeAfter") is not True
        or not isinstance(projection.get("columns"), list)
        or not 1 <= len(projection["columns"]) <= 2000
    ):
        raise ReadBuildError("NATIVE_SCHEMA_SOURCE_EXACT_REQUIRED")


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
            artifact.get("version") not in ("weft.raw-read/0.1", "weft.raw-read/0.2")
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
        if not _compiler_transport(artifact, catalog=True):
            if artifact.get("dbapiSql") != _dbapi(cast(str, artifact.get("sql"))):
                raise ReadBuildError("catalog parameter style mismatch")
            if artifact.get("dbapiParameterOrder") != _dbapi_order(
                cast(str, artifact["sql"]), cast(list[str], artifact["parameterOrder"])
            ):
                raise ReadBuildError("catalog parameter order mismatch")
        _require_source_exact(artifact)
        catalog_fence(artifact)
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
    from .dsl import render_logical, render_related_logical

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
    declared = [{"name": p.name, **parameter_signature(p.carrier)} for p in variant.parameters if p.name != cursor_name]
    expected = _fields(parameters)
    if declared != expected:
        raise ReadBuildError("captured signature differs from parameter model")
    snapshot = any(step.op == "snapshot" for step in cast(tuple[Node, ...], variant.node.args[1]))
    related = render_related_logical(variant, binding=binding)
    logical = related.target_sql if related is not None else render_logical(variant, binding=binding)
    compiled = ReviewedSQL(logical, parameters, result, row_cap, keyset=keyset).build(
        compiler, target=target, binding=binding, snapshot=snapshot,
        related_source=related.source_sql if related is not None else None,
        related_relationship=related.relationship if related is not None else None,
    )
    artifact = compiled.artifact()
    artifact.pop("catalogDigest", None)  # artifact() already excludes this local digest.
    artifact["generatedSource"] = asdict(source)
    artifact["catalogDigest"] = hashlib.sha256(_json(artifact).encode()).hexdigest()
    return CatalogRead(_json(artifact), parameters, result, source)
