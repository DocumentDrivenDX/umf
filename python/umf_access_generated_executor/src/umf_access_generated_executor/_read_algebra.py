"""Verifier and fixed SQL assembler for Rust-issued one-root read algebra."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Mapping
from typing import Literal, cast

from umf_access_generated_executor._canonical import canonical_json, parse_json
from umf_access_generated_executor._codec import _validate_codec, _validate_output_codec, run_issued_codec
from umf_access_generated_executor._errors import GeneratedExecutionError
from umf_access_generated_executor._values import (
    BoundForwardConnectionProgram,
    BoundReadProgram,
    BoundReadProgramV2,
    BoundReadProgramV3,
    ExecutionScope,
    GeneratedFiles,
    GeneratedForwardConnectionCall,
    GeneratedManifest,
    GeneratedReadCall,
    GeneratedReadCallV2,
    TargetBinding,
)

_PATH = "algebra/read.json"
_PROFILE = "weft.generated-read-algebra/1"
_READINESS = "weft.generated-read-executable/1"
_PROFILE_V2 = "weft.generated-read-algebra/2"
_READINESS_V2 = "weft.generated-read-executable/2"
_PROFILE_V3 = "weft.generated-read-algebra/3"
_READINESS_V3 = "weft.generated-read-executable/3"
_PROFILE_V4 = "weft.generated-read-algebra/4"
_READINESS_V4 = "weft.generated-read-executable/4"
_PROFILE_V5 = "weft.generated-read-algebra/5"
_READINESS_V5 = "weft.generated-read-executable/5"
_PROFILE_V6 = "weft.generated-read-algebra/6"
_READINESS_V6 = "weft.generated-read-executable/6"
_PROFILE_V7 = "weft.generated-read-algebra/7"
_READINESS_V7 = "weft.generated-read-executable/7"
_PROFILE_V8 = "weft.generated-read-algebra/8"
_READINESS_V8 = "weft.generated-read-executable/8"
_MAX_SQL_BYTES = 8 * 1024 * 1024
_SAFE_OUTSIDE_QUOTES = re.compile(r"^[A-Za-z0-9_.$(),:+*/<>=! -]$")
_FIELD_ID = re.compile(r"^[^/]+/[^/]+$")
_FRAME_TEMPLATE = (
    'WITH "__weft_source" AS MATERIALIZED ({{SOURCE_SQL}}), '
    '"__weft_guard" AS MATERIALIZED (SELECT CASE WHEN '
    "COALESCE(pg_catalog.sum(pg_catalog.octet_length("
    "pg_catalog.convert_to(pg_catalog.row_to_json(f)::pg_catalog.text, 'UTF8'))),0) <= 8388608 "
    "THEN 1::pg_catalog.int8 ELSE 1::pg_catalog.int8 / "
    "(pg_catalog.count(*) - pg_catalog.count(*)) END AS ok "
    'FROM "__weft_source" AS f) SELECT {{RETURN_COLUMNS}} '
    'FROM "__weft_source" AS f ORDER BY f."__weft_ordinal" '
    'LIMIT ALL OFFSET (SELECT 1 - ok FROM "__weft_guard")'
)
_CONNECTION_PROFILE = "weft.generated-forward-connection/1"
_CONNECTION_COLLATION = 'pg_catalog."C"'
_CONNECTION_OIDS = {
    "boolean": 16,
    "text": 25,
    "varchar": 1043,
    "int2": 21,
    "int4": 23,
    "int8": 20,
    "float4": 700,
    "float8": 701,
    "numeric": 1700,
    "date": 1082,
    "timestamp": 1114,
    "timestamptz": 1184,
    "uuid": 2950,
    "bytea": 17,
}


def _dbapi_identifier(value: object, label: str) -> str:
    text = _text(value, label)
    if any(
        character == "\x00" or 0xD800 <= ord(character) <= 0xDFFF for character in text
    ):
        raise ValueError(label + " is not a PostgreSQL identifier")
    return '"' + text.replace('"', '""').replace("%", "%%") + '"'


def _object(value: object, keys: set[str], label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or set(value) != keys:
        raise ValueError(label + " shape differs")
    return value


def _text(value: object, label: str) -> str:
    if type(value) is not str or not value or "\x00" in value:
        raise ValueError(label + " must be nonempty text")
    value.encode("utf-8", errors="strict")
    return value


def _fragment(value: object, label: str, placeholders: int) -> str:
    text = _text(value, label)
    quoted = False
    index = 0
    found_placeholders = 0
    while index < len(text):
        character = text[index]
        if character == '"':
            if quoted and index + 1 < len(text) and text[index + 1] == '"':
                index += 2
                continue
            quoted = not quoted
        elif quoted and character == "%":
            if index + 1 >= len(text) or text[index + 1] != "%":
                raise ValueError(label + " has a DB-API unescaped percent identifier")
            index += 2
            continue
        elif not quoted:
            if text[index : index + 2] in {"--", "/*", "*/"} or character == ";":
                raise ValueError(label + " contains a SQL boundary token")
            if character == "%":
                if text[index : index + 2] != "%s":
                    raise ValueError(label + " contains a non-profile placeholder")
                found_placeholders += 1
                index += 2
                continue
            if _SAFE_OUTSIDE_QUOTES.fullmatch(character) is None:
                raise ValueError(
                    label + " has a token outside the SQL fragment grammar"
                )
        elif character == "\x00" or 0xD800 <= ord(character) <= 0xDFFF:
            raise ValueError(label + " contains an invalid quoted identifier")
        index += 1
    if (
        len(text.encode("utf-8")) > 64 * 1024
        or quoted
        or found_placeholders != placeholders
    ):
        raise ValueError(label + " is outside the closed SQL-fragment grammar")
    return text


def _identifier(value: object, label: str) -> str:
    text = _text(value, label)
    if len(text) > 4096:
        raise ValueError(label + " is not a simple identity")
    return text


def _escape_component(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _field_key(value: Mapping[str, object]) -> str:
    return (
        _escape_component(cast(str, value["module"]))
        + "/"
        + _escape_component(cast(str, value["element"]))
    )


def _decode_field_key(identity: str) -> dict[str, str]:
    parts = identity.split("/", 1)
    if len(parts) != 2 or re.search(r"~(?![01])", identity):
        raise ValueError("field identity escape is malformed")
    decoded = [part.replace("~1", "/").replace("~0", "~") for part in parts]
    if any(not value for value in decoded):
        raise ValueError("field identity component is empty")
    result = {"module": decoded[0], "element": decoded[1]}
    if _field_key(result) != identity:
        raise ValueError("field identity escape is not canonical")
    return result


def _referenced_column(value: object, label: str) -> str:
    text = _text(value, label)
    match = re.match(r'^"r"\."((?:[^"]|"")+)"', text)
    if match is None:
        raise ValueError(label + " does not begin with a qualified native column")
    return match.group(1).replace('""', '"').replace("%%", "%")


def _native_carrier(native_type: Mapping[str, object]) -> str | None:
    kind = native_type.get("kind")
    if kind in {"varchar", "char", "text"}:
        return "string"
    return {
        "boolean": "boolean",
        "int2": "integer",
        "int4": "integer",
        "int8": "integer",
        "float4": "float",
        "float8": "float",
        "numeric": "decimal",
        "date": "date",
        "timestamp": "timestamp",
        "timestamptz": "timestamp",
        "uuid": "uuid",
        "bytea": "bits128",
    }.get(cast(str, kind))


_QUOTED = r'"(?:[^\"]|"\")+"'


def _column_expression(carrier: str) -> str:
    return (
        r'"r"\.'
        + _QUOTED
        + (r' COLLATE pg_catalog\."C"' if carrier == "string" else "")
    )


def _projection(value: object, carrier: str) -> tuple[str, str]:
    text = _fragment(value, "read field projection", 0)
    alias = re.fullmatch(_column_expression(carrier) + r' AS "((?:[^"]|"")+)"', text)
    if alias is None:
        raise ValueError("read projection is not one direct qualified column")
    return text, alias.group(1).replace('""', '"').replace("%%", "%")


def _from_clause(value: object) -> str:
    text = _fragment(value, "read root FROM", 0)
    if re.fullmatch(r"FROM " + _QUOTED + r"\." + _QUOTED + r' AS "r"', text) is None:
        raise ValueError("read root is not one qualified table alias")
    return text


def _predicate_fragment(value: object, operator: str, arity: int, carrier: str) -> str:
    text = _fragment(value, "read predicate SQL", arity)
    column = _column_expression(carrier)
    if arity == 0:
        suffix = " IS NULL" if operator == "is-null" else " IS NOT NULL"
        pattern = column + suffix
    else:
        token = {"eq": "=", "ne": "<>", "lt": "<", "le": "<=", "gt": ">", "ge": ">="}[
            operator
        ]
        cast = {
            "boolean": "bool",
            "integer": "numeric",
            "decimal": "numeric",
            "string": "text",
        }.get(carrier)
        if cast is None:
            raise ValueError("read predicate carrier is unsupported")
        pattern = column + " " + re.escape(token) + r" %s::pg_catalog\." + cast
    if re.fullmatch(pattern, text) is None:
        raise ValueError("read predicate is not one direct comparison")
    return text


def _order_fragment(value: object, direction: str, nulls: str, carrier: str) -> str:
    text = _fragment(value, "read order SQL", 0)
    if (
        re.fullmatch(
            _column_expression(carrier)
            + " "
            + direction.upper()
            + " NULLS "
            + nulls.upper(),
            text,
        )
        is None
    ):
        raise ValueError("read order is not one direct qualified column")
    return text


def _validate_read_obligations(
    value: object,
    *,
    root: Mapping[str, object],
    native_table: Mapping[str, object],
    module: str,
    record: str,
    source_digest: str,
    configuration_digest: str,
    schema: str,
    bundle_digest: str,
) -> None:
    obligations = _object(
        value,
        {
            "baseTablesOnly",
            "noBypassRls",
            "principal",
            "rls",
            "rowCap",
            "schema",
            "searchPath",
            "tableLifecycle",
            "timeout",
            "transaction",
        },
        "generated read obligations",
    )
    search_path = obligations["searchPath"]
    if not isinstance(search_path, (list, tuple)):
        raise TypeError("generated read search path is malformed")
    if (
        obligations["baseTablesOnly"] is not True
        or obligations["noBypassRls"] is not True
        or obligations["principal"] != "caller-connection-role"
        or obligations["rls"] != "native-caller-role"
        or obligations["schema"] != schema
        or tuple(cast(list[object] | tuple[object, ...], search_path))
        != ("pg_catalog",)
        or type(obligations["rowCap"]) is not int
        or obligations["timeout"] != "per-call"
        or obligations["transaction"] != "read-only"
        or obligations["rowCap"] != root["maxRows"]
    ):
        raise ValueError(
            "generated read obligations are outside the closed native profile"
        )
    lifecycle = _object(
        obligations["tableLifecycle"],
        {
            "version",
            "module",
            "sourceDigest",
            "configurationDigest",
            "deploymentDigest",
            "cursorScope",
            "generationLock",
            "installedAuthority",
            "nativeExecutionQualified",
            "policy",
            "principal",
            "privileges",
            "roleScope",
            "sourceInterpretation",
            "tables",
        },
        "generated read lifecycle obligations",
    )
    cursor_scope = lifecycle["cursorScope"]
    if not isinstance(cursor_scope, (list, tuple)):
        raise TypeError("generated read cursor scope is malformed")
    if (
        lifecycle["version"] != "umf.table-lifecycle/0.1"
        or lifecycle["module"] != module
        or lifecycle["sourceDigest"] != source_digest
        or lifecycle["configurationDigest"] != configuration_digest
        or lifecycle["deploymentDigest"] != bundle_digest
        or lifecycle["nativeExecutionQualified"] is not False
        or lifecycle["policy"] != "source-command-policy-and-native-forced-rls"
        or lifecycle["principal"] != "verified-person-or-batch"
        or lifecycle["privileges"] != "source-grants-and-native-effective-closure"
        or lifecycle["roleScope"] != "native-transitive-current"
        or lifecycle["sourceInterpretation"] != "original-umf-deployment-compiler"
        or lifecycle["generationLock"] != "shared-before-admission-through-transaction"
        or lifecycle["installedAuthority"]
        != "approved-forward-ledger-and-source-derived-native-witness"
        or tuple(cast(list[object] | tuple[object, ...], cursor_scope))
        != (
            "module",
            "sourceDigest",
            "configurationDigest",
            "deploymentDigest",
            "ledgerHeadDigest",
            "principal",
            "roleScopeDigest",
        )
    ):
        raise ValueError("generated read lifecycle obligations differ from the profile")
    tables = lifecycle["tables"]
    if not isinstance(tables, (list, tuple)) or len(tables) != 1:
        raise ValueError("generated read lifecycle is not a one-table read")
    table = next(
        (
            item
            for item in tables
            if isinstance(item, Mapping)
            and item.get("record") == {"module": module, "element": record}
        ),
        None,
    )
    catalog = native_table["expectedCatalog"]
    catalog_tables = cast(Mapping[str, object], catalog)["tables"]
    if not isinstance(catalog_tables, (list, tuple)):
        raise TypeError("native catalog table list is malformed")
    exact_table = next(
        (
            item
            for item in cast(list[object] | tuple[object, ...], catalog_tables)
            if isinstance(item, Mapping)
            and item.get("record") == {"module": module, "element": record}
        ),
        None,
    )
    if (
        table is None
        or exact_table is None
        or set(table) != {"command", "id", "native", "policySourcePath", "record"}
        or table["command"] != "select"
        or table["id"] != exact_table["id"]
        or table["native"] != exact_table["name"]
        or type(table["policySourcePath"]) is not str
        or not table["policySourcePath"].startswith("/modules/")
        or not table["policySourcePath"].endswith("/policy")
    ):
        raise ValueError(
            "generated read table lifecycle does not join to the native source"
        )


def _validate_algebra(
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> Mapping[str, object] | None:
    algebra_descriptor = manifest.value["algebra"]
    if not isinstance(algebra_descriptor, Mapping) or not algebra_descriptor:
        return None
    if native_table is None:
        raise ValueError("read algebra has no admitted native source projection")
    profile = algebra_descriptor.get("profile")
    readiness = {
        _PROFILE: _READINESS,
        _PROFILE_V2: _READINESS_V2,
        _PROFILE_V3: _READINESS_V3,
        _PROFILE_V4: _READINESS_V4,
        _PROFILE_V5: _READINESS_V5,
        _PROFILE_V6: _READINESS_V6,
        _PROFILE_V7: _READINESS_V7,
        _PROFILE_V8: _READINESS_V8,
    }.get(cast(str, profile))
    if readiness is None or dict(algebra_descriptor) != {
        "profile": profile,
        "algebraPath": _PATH,
    }:
        raise ValueError("read algebra descriptor differs")
    content = files.mapping.get(_PATH)
    if content is None:
        raise ValueError("read algebra file is absent")
    data = parse_json(content)
    if type(data) is not dict or canonical_json(data) != content:
        raise ValueError("read algebra is not canonical JSON")
    algebra_keys = {"version", "readiness", "source", "target", "roots"}
    if profile in {_PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
        algebra_keys.add("executorAbi")
    algebra = _object(data, algebra_keys, "read algebra")
    if algebra["version"] != profile or algebra["readiness"] != readiness:
        raise ValueError("read algebra readiness differs")
    expected_abi_minor = {_PROFILE_V5: 5, _PROFILE_V6: 6, _PROFILE_V7: 7, _PROFILE_V8: 8}.get(cast(str, profile))
    if expected_abi_minor is not None and algebra["executorAbi"] != {"major": 1, "minor": expected_abi_minor}:
        raise ValueError("read algebra executor ABI differs")
    source = _object(
        algebra["source"], {"modelSha256", "module"}, "read algebra source"
    )
    target_data = _object(
        algebra["target"], {"id", "modelSha256", "bindingDigest"}, "read algebra target"
    )
    manifest_source = manifest.value["source"]
    manifest_target = manifest.value["target"]
    if not isinstance(manifest_source, Mapping) or not isinstance(
        manifest_target, Mapping
    ):
        raise TypeError("manifest source or target malformed")
    modules = manifest_source["moduleIds"]
    if (
        source["modelSha256"] != manifest_source["sha256"]
        or type(source["module"]) is not str
        or source["module"] not in modules
        or target_data["id"] != manifest_target["id"]
        or target_data["modelSha256"] != manifest_source["sha256"]
        or target_data["id"] != target.id
        or target_data["bindingDigest"] != manifest_target["bindingDigest"]
        or target_data["bindingDigest"] != target.binding_digest
    ):
        raise ValueError("read algebra source/target pins differ")
    native_source = getattr(native_table, "native_source", None)
    if not isinstance(native_source, Mapping):
        raise TypeError("read algebra has no verified native projection")
    native_configuration = native_source.get("configuration")
    if (
        not isinstance(native_configuration, Mapping)
        or native_configuration.get("module") != source["module"]
    ):
        raise ValueError("read algebra module differs from native projection")
    catalog = native_source.get("expectedCatalog")
    if not isinstance(catalog, Mapping) or not isinstance(
        catalog.get("tables"), (tuple, list)
    ):
        raise TypeError("native catalog table inventory is malformed")
    catalog_tables: dict[tuple[str, str], Mapping[str, object]] = {}
    catalog_names: set[str] = set()
    for item in catalog["tables"]:
        if not isinstance(item, Mapping) or set(item) != {
            "id",
            "name",
            "record",
            "columns",
        }:
            raise ValueError("native catalog table is not the v2 profile")
        record = item["record"]
        if not isinstance(record, Mapping) or set(record) != {"module", "element"}:
            raise ValueError("native catalog record mapping is malformed")
        pair = (
            _text(record["module"], "native Record module"),
            _text(record["element"], "native Record element"),
        )
        if pair in catalog_tables:
            raise ValueError("native catalog Record mapping is ambiguous")
        table_name = _text(item["name"], "native catalog table name")
        catalog_names.add(table_name)
        catalog_tables[pair] = item
    if len(catalog_names) != len(catalog["tables"]):
        raise ValueError("native catalog table inventory is incomplete")
    roots = algebra["roots"]
    if not isinstance(roots, Mapping) or not roots or len(roots) > 4096:
        raise ValueError("read algebra roots are absent or over limit")
    root_keys = {
        "module",
        "record",
        "fromSql",
        "defaultSelection",
        "fields",
        "predicates",
        "orders",
        "keyTieOrder",
        "maxRows",
        "obligations",
        "nativeReadGuard",
    }
    if profile in {_PROFILE_V2, _PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
        root_keys.update({"primaryKey", "primaryKeyId", "terminals"})
    if profile in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
        root_keys.update({"frameOrdinalSql", "frameScalarOrdinalSql"})
    if profile in {_PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
        root_keys.add("getMany")
    if profile in {_PROFILE_V5, _PROFILE_V8}:
        root_keys.add("forwardConnectionSupport")
    if profile == _PROFILE_V6:
        root_keys.add("ordinaryPage")
    if profile in {_PROFILE_V7, _PROFILE_V8}:
        root_keys.update({"forwardConnectionSupport", "ordinaryPage"})
    if profile == _PROFILE_V8:
        root_keys.add("requiredInnerJoins")
    for key, raw_root in roots.items():
        if type(key) is not str or _FIELD_ID.fullmatch(key) is None:
            raise ValueError("read algebra root key is malformed")
        expected_root_keys = set(root_keys)
        if profile in {_PROFILE_V5, _PROFILE_V7, _PROFILE_V8}:
            support = (
                raw_root.get("forwardConnectionSupport")
                if isinstance(raw_root, Mapping)
                else None
            )
            if isinstance(support, Mapping) and support.get("status") == "eligible":
                expected_root_keys.add("forwardConnection")
        root = _object(raw_root, expected_root_keys, "read algebra root")
        module = _identifier(root["module"], "read root module")
        record = _identifier(root["record"], "read root record")
        if (
            key != _escape_component(module) + "/" + _escape_component(record)
            or module != source["module"]
        ):
            raise ValueError("read root identity differs from issuer pins")
        from_sql = _from_clause(root["fromSql"])
        parts = re.fullmatch(
            r"FROM \"((?:[^\"]|\"\")+)\"\.\"((?:[^\"]|\"\")+)\" AS \"r\"", from_sql
        )
        assert parts is not None
        schema_name = parts.group(1).replace('""', '"').replace("%%", "%")
        table_name = parts.group(2).replace('""', '"').replace("%%", "%")
        native_table_record = catalog_tables.get((module, record))
        if (
            schema_name != native_configuration.get("schema")
            or table_name not in catalog_names
            or native_table_record is None
            or native_table_record["name"] != table_name
        ):
            raise ValueError("read root physical table is outside the native catalog")
        native_columns: dict[str, Mapping[str, object]] = {}
        for native_column in cast(
            tuple[Mapping[str, object], ...] | list[Mapping[str, object]],
            native_table_record["columns"],
        ):
            field_ref = cast(Mapping[str, object], native_column["field"])
            source_id = _field_key(field_ref)
            if source_id in native_columns:
                raise ValueError("native table Field mapping is ambiguous")
            native_columns[source_id] = cast(Mapping[str, object], native_column)
        fields = root["fields"]
        if not isinstance(fields, Mapping) or not fields or len(fields) > 4096:
            raise ValueError("read root fields are absent or over limit")
        if set(fields) != set(native_columns):
            raise ValueError(
                "read fields do not exactly cover the verified table mapping"
            )
        for field_id, raw_field in fields.items():
            if type(field_id) is not str or _FIELD_ID.fullmatch(field_id) is None:
                raise ValueError("read field identity is malformed")
            field_keys = {"selectSql", "output", "sourceField"}
            if profile in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
                field_keys.add("frameSelectSql")
            field = _object(raw_field, field_keys, "read field")
            output = field["output"]
            if not isinstance(output, Mapping) or not {
                "carrier",
                "name",
                "nullable",
            } <= set(output):
                raise ValueError("read output descriptor is incomplete")
            source_field = _object(
                raw_field.get("sourceField"), {"module", "element"}, "read source field"
            )
            _identifier(source_field["module"], "read source field module")
            _identifier(source_field["element"], "read source field element")
            if (
                field_id != _field_key(source_field)
                or source_field["module"] not in modules
            ):
                raise ValueError("read source field reference differs")
            native_column = native_columns.get(field_id)
            if (
                native_column is None
                or _referenced_column(field["selectSql"], "read field projection")
                != native_column["name"]
            ):
                raise ValueError("read field does not join to its physical column")
            _text(output["carrier"], "read output carrier")
            _text(output["name"], "read output name")
            if (
                _projection(field["selectSql"], cast(str, output["carrier"]))[1]
                != output["name"]
            ):
                raise ValueError("read projection alias differs from output metadata")
            if type(output["nullable"]) is not bool:
                raise ValueError("read output nullability differs")
            if profile in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8} and field[
                "frameSelectSql"
            ] != ('f."' + cast(str, output["name"]).replace('"', '""') + '"'):
                raise ValueError("read frame output does not preserve its issued type")
            if (
                _native_carrier(cast(Mapping[str, object], native_column["nativeType"]))
                != output["carrier"]
            ):
                raise ValueError("read output carrier differs from native field type")
        defaults = root["defaultSelection"]
        if (
            not isinstance(defaults, (list, tuple))
            or not defaults
            or len(defaults) > 4096
            or len(set(defaults)) != len(defaults)
            or any(identity not in fields for identity in defaults)
        ):
            raise ValueError("read root default selection differs")
        predicates = root["predicates"]
        if not isinstance(predicates, Mapping) or len(predicates) > 4096:
            raise ValueError("read predicates are malformed")
        operators = {"eq", "ne", "lt", "le", "gt", "ge", "is-null", "is-not-null"}
        for predicate_id, raw_predicate in predicates.items():
            _identifier(predicate_id, "read predicate ID")
            if not isinstance(raw_predicate, Mapping):
                raise TypeError("read predicate is malformed")
            arity = raw_predicate.get("arity")
            if type(arity) is not int:
                raise ValueError("read predicate arity is not an integer")
            keys = (
                {"fieldId", "operator", "sql", "arity", "codec"}
                if arity == 1
                else {"fieldId", "operator", "sql", "arity"}
            )
            predicate = _object(raw_predicate, keys, "read predicate")
            if (
                predicate["fieldId"] not in fields
                or predicate["operator"] not in operators
            ):
                raise ValueError("read predicate field or operator differs")
            predicate_column = native_columns.get(cast(str, predicate["fieldId"]))
            if (
                predicate_column is None
                or _referenced_column(predicate["sql"], "read predicate")
                != predicate_column["name"]
            ):
                raise ValueError("read predicate does not join to its physical column")
            if arity not in {0, 1}:
                raise ValueError("read predicate arity is unsupported")
            if arity == 0 and predicate["operator"] not in {"is-null", "is-not-null"}:
                raise ValueError("zero-arity predicate operator differs")
            if arity == 1 and predicate["operator"] in {"is-null", "is-not-null"}:
                raise ValueError("one-arity predicate operator differs")
            field_output = cast(Mapping[str, object], fields[predicate["fieldId"]])[
                "output"
            ]
            field_output = cast(Mapping[str, object], field_output)
            _predicate_fragment(
                predicate["sql"],
                cast(str, predicate["operator"]),
                arity,
                cast(str, field_output["carrier"]),
            )
            if arity == 1:
                codec = predicate["codec"]
                from umf_access_generated_executor._codec import _validate_codec

                _validate_codec(
                    codec,
                    carrier=cast(str, field_output["carrier"]),
                    nullable=cast(bool, field_output["nullable"]),
                )
        orders = root["orders"]
        if not isinstance(orders, Mapping) or len(orders) > 4096:
            raise ValueError("read orders are malformed")
        for order_id, raw_order in orders.items():
            _identifier(order_id, "read order ID")
            order = _object(
                raw_order, {"fieldId", "direction", "nulls", "sql"}, "read order"
            )
            if (
                order["fieldId"] not in fields
                or order["direction"] not in {"asc", "desc"}
                or order["nulls"] not in {"first", "last"}
            ):
                raise ValueError("read order field or terms differ")
            order_column = native_columns.get(cast(str, order["fieldId"]))
            if (
                order_column is None
                or _referenced_column(order["sql"], "read order")
                != order_column["name"]
            ):
                raise ValueError("read order does not join to its physical column")
            order_output = cast(Mapping[str, object], fields[order["fieldId"]])[
                "output"
            ]
            order_output = cast(Mapping[str, object], order_output)
            _order_fragment(
                order["sql"],
                cast(str, order["direction"]),
                cast(str, order["nulls"]),
                cast(str, order_output["carrier"]),
            )
        ties = root["keyTieOrder"]
        if (
            not isinstance(ties, (list, tuple))
            or not ties
            or len(ties) != len(set(ties))
            or any(identity not in orders for identity in ties)
        ):
            raise ValueError("read key tie order differs")
        if type(root["maxRows"]) is not int or not 1 <= root["maxRows"] <= 1000:
            raise ValueError("read root row limit differs")
        if not isinstance(root["obligations"], Mapping) or not isinstance(
            root["nativeReadGuard"], Mapping
        ):
            raise TypeError("read native guard metadata is malformed")
        _validate_read_obligations(
            root["obligations"],
            root=root,
            native_table=cast(Mapping[str, object], native_source),
            module=module,
            record=record,
            source_digest=cast(str, manifest_source["sha256"]),
            configuration_digest=cast(str, native_source["configurationDigest"]),
            schema=cast(str, native_configuration["schema"]),
            bundle_digest=cast(str, native_source["bundleDigest"]),
        )
        if profile not in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8} and dict(
            root["nativeReadGuard"]
        ) != {
            "profile": "pg18-read-frame/0.1",
            "maxNativeBytes": 8_388_608,
            "sqlstate": "22012",
            "includesLookahead": True,
            "partialFrames": False,
        }:
            raise ValueError("read native guard profile differs")
        if profile in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
            guard = _object(
                root["nativeReadGuard"],
                {
                    "profile",
                    "byteMetric",
                    "maxNativeBytes",
                    "sqlstate",
                    "partialFrames",
                    "template",
                },
                "composed native frame guard",
            )
            template = _object(
                guard["template"], {"version", "sql", "sha256"}, "frame template"
            )
            template_sql = _text(template["sql"], "frame template SQL")
            if (
                guard["profile"] != "pg18-composed-native-frame/1"
                or guard["byteMetric"] != "pg18-row-json-utf8/1"
                or guard["maxNativeBytes"] != 8_388_608
                or guard["sqlstate"] != "22012"
                or guard["partialFrames"] is not False
                or template["version"] != "weft.pg18-composed-frame-template/1"
                or template_sql != _FRAME_TEMPLATE
                or type(template["sha256"]) is not str
                or hashlib.sha256(template_sql.encode("utf-8")).hexdigest()
                != template["sha256"]
                or template_sql.count("{{SOURCE_SQL}}") != 1
                or template_sql.count("{{RETURN_COLUMNS}}") != 1
            ):
                raise ValueError("composed frame guard template differs")
            if root["frameOrdinalSql"] != (
                'ROW_NUMBER() OVER (ORDER BY {{ORDER_SQL}}) AS "__weft_ordinal"'
            ) or root["frameScalarOrdinalSql"] != (
                '1::pg_catalog.int8 AS "__weft_ordinal"'
            ):
                raise ValueError("composed frame ordinal fragments differ")
        if profile in {_PROFILE_V2, _PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
            _validate_v2_root(
                root,
                fields,
                predicates,
                v3=profile in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8},
            )
        if profile in {_PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
            _validate_get_many(root, fields, native_columns)
        if profile in {_PROFILE_V5, _PROFILE_V7, _PROFILE_V8}:
            _validate_forward_connection(root, fields, predicates, native_columns)
        if profile in {_PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
            from umf_access_generated_executor._ordinary_page import _validate_ordinary_page_root

            _validate_ordinary_page_root(
                root,
                native_columns,
                source=source,
                target=target_data,
            )
    if profile == _PROFILE_V8:
        _validate_required_inner_joins(roots, native_source)
    return cast(Mapping[str, object], algebra)


def _validate_required_inner_joins(
    roots: object, native_source: Mapping[str, object]
) -> None:
    """Cross-check per-root join cuts against the complete verified native3 facts."""
    if not isinstance(roots, Mapping):
        raise ValueError("joined roots are malformed")
    native_rows = native_source.get("relationships")
    if not isinstance(native_rows, (tuple, list)):
        raise ValueError("native3 Relationship inventory is malformed")
    inventory: dict[str, Mapping[str, object]] = {}
    for row in native_rows:
        if not isinstance(row, Mapping):
            raise ValueError("native3 Relationship row is malformed")
        identity = _object(row.get("logicalIdentity"), {"module", "id"}, "native3 logical identity")
        key = _escape_component(_text(identity["module"], "Relationship module")) + "/" + _escape_component(_text(identity["id"], "Relationship ID"))
        if key in inventory:
            raise ValueError("native3 Relationship identity is ambiguous")
        inventory[key] = row
    for root_id, root_value in roots.items():
        if not isinstance(root_value, Mapping):
            raise ValueError("joined root is malformed")
        module = _text(root_value.get("module"), "joined root module")
        record = _text(root_value.get("record"), "joined root Record")
        catalog = _object(root_value.get("requiredInnerJoins"), {"profile", "relationships"}, "required inner join catalog")
        relations = catalog["relationships"]
        if catalog["profile"] != "weft.generated-required-inner-join-catalog/1" or not isinstance(relations, Mapping) or set(relations) != set(inventory):
            raise ValueError("required inner join catalog differs from native3 inventory")
        if root_id != _escape_component(module) + "/" + _escape_component(record):
            raise ValueError("joined root identity differs")
        for key, value in relations.items():
            native = inventory[key]
            if not isinstance(value, Mapping):
                raise ValueError("required inner join entry is malformed")
            status = value.get("status")
            if status == "unsupported":
                refused = _object(value, {"status", "reason"}, "unsupported join entry")
                if type(refused["reason"]) is not str or not refused["reason"]:
                    raise ValueError("unsupported join reason is malformed")
                continue
            if status is not None or native.get("status") != "admitted":
                raise ValueError("join admission differs from native3 status")
            relationship = value.get("relationship")
            if any(
                canonical_json(actual) != canonical_json(expected)
                for actual, expected in (
                    (relationship, native.get("logical")),
                    (value.get("binding"), native.get("binding")),
                    (value.get("native"), native.get("native")),
                )
            ):
                raise ValueError("join descriptor differs from exact native3 facts")
            if not isinstance(relationship, Mapping):
                raise ValueError("admitted Relationship is malformed")
            source = relationship.get("source")
            if not isinstance(source, Mapping) or (source.get("module"), source.get("element")) != (module, record):
                raise ValueError("admitted Relationship source differs from its root")
            _validate_join_descriptor(value, root_value, roots, native_source)


def _validate_join_descriptor(
    value: Mapping[str, object], root_value: Mapping[str, object], roots: Mapping[str, object], native_source: Mapping[str, object]
) -> None:
    descriptor = _object(value, {"profile", "relationship", "binding", "native", "aliases", "joinSql", "fields", "selection", "defaultSelection", "predicates", "orders", "statement"}, "admitted join descriptor")
    if descriptor["profile"] != "weft.generated-required-inner-join/1":
        raise ValueError("required inner join profile differs")
    relationship = cast(Mapping[str, object], descriptor["relationship"])
    target_ref = cast(Mapping[str, object], relationship["target"])
    target_root_id = _escape_component(cast(str, target_ref["module"])) + "/" + _escape_component(cast(str, target_ref["element"]))
    target_root = roots.get(target_root_id)
    if not isinstance(target_root, Mapping):
        raise ValueError("joined target root is absent from the issued algebra")
    for owner, owner_root in (("root", root_value), ("target", target_root)):
        for kind in ("predicates", "orders"):
            inherited = owner_root.get(kind)
            qualified = descriptor.get(kind)
            if not isinstance(inherited, Mapping) or not isinstance(qualified, Mapping) or set(qualified) != {"root", "target"}:
                raise ValueError("joined owner expression catalog is malformed")
            entries = qualified[owner]
            if not isinstance(entries, Mapping) or set(entries) != set(inherited):
                raise ValueError("joined owner expression IDs differ from inherited root")
            for identity, entry_value in inherited.items():
                entry = entry_value
                joined = entries[identity]
                if not isinstance(entry, Mapping) or not isinstance(joined, Mapping):
                    raise ValueError("joined owner expression entry is malformed")
                expected = dict(entry)
                if owner == "target":
                    expected["sql"] = cast(str, expected["sql"]).replace('"r".', '"t".')
                else:
                    expected["sql"] = cast(str, expected["sql"])
                if kind == "predicates":
                    expected["field"] = {"fieldId": expected["fieldId"], "owner": owner}
                elif kind == "orders":
                    expected["field"] = {"fieldId": expected["fieldId"], "owner": owner}
                if dict(joined) != expected:
                    raise ValueError("joined owner expression differs from inherited semantics")
    aliases = _object(descriptor["aliases"], {"root", "target"}, "join aliases")
    if dict(aliases) != {"root": "r", "target": "t"}:
        raise ValueError("join aliases differ")
    fields = descriptor["fields"]
    if not isinstance(fields, (tuple, list)) or not fields or len(fields) > 256:
        raise ValueError("joined Field inventory is malformed")
    identities: set[tuple[str, str]] = set()
    owner_roots = {"root": root_value, "target": target_root}
    expected_catalog = native_source.get("expectedCatalog")
    tables = expected_catalog.get("tables") if isinstance(expected_catalog, Mapping) else None
    if not isinstance(tables, (tuple, list)):
        raise ValueError("native3 catalog tables are malformed")
    for ordinal, item in enumerate(fields):
        field = _object(item, {"owner", "ownerRecord", "fieldId", "sourceField", "nativeColumn", "output", "ordinal", "selectSql", "frameSelectSql"}, "joined Field")
        source = _object(field["sourceField"], {"module", "element"}, "joined source Field")
        field_id = _field_key(source)
        if type(field["owner"]) is not str or field["owner"] not in {"root", "target"} or (field["owner"], field_id) in identities or field["fieldId"] != field_id or type(field["ordinal"]) is not int or field["ordinal"] != ordinal:
            raise ValueError("joined Field identity or ordinal differs")
        identities.add((cast(str, field["owner"]), field_id))
        owner_root = cast(Mapping[str, object], owner_roots[cast(str, field["owner"])])
        owner_fields = owner_root.get("fields")
        if not isinstance(owner_fields, Mapping):
            raise ValueError("joined field owner catalog is malformed")
        inherited = owner_fields.get(field_id)
        if not isinstance(inherited, Mapping):
            raise ValueError("joined field is absent from inherited owner catalog")
        output = _object(field["output"], {"name", "carrier", "nullable", "nativeType", "oid", "valueCodec"}, "joined output")
        if type(output["nullable"]) is not bool or type(output["oid"]) is not int or output["oid"] <= 0:
            raise ValueError("joined output metadata is malformed")
        inherited_output = _object(inherited["output"], {"carrier", "name", "nullable"}, "inherited field output")
        owner_name = cast(str, field["owner"])
        owner_module = cast(str, root_value["module"] if owner_name == "root" else target_root["module"])
        owner_record = cast(str, root_value["record"] if owner_name == "root" else target_root["record"])
        if (
            field["ownerRecord"] != {"module": owner_module, "element": owner_record}
            or field["sourceField"] != inherited["sourceField"]
            or output["carrier"] != inherited_output["carrier"]
            or output["nullable"] != inherited_output["nullable"]
            or output["name"] != "__weft_field_" + str(ordinal)
        ):
            raise ValueError("joined field owner or native output differs from inherited catalog")
        owner_ref = {"module": owner_module, "element": owner_record}
        table_row = next((row for row in tables if isinstance(row, Mapping) and row.get("record") == owner_ref), None)
        columns = table_row.get("columns") if isinstance(table_row, Mapping) else None
        column = next((item for item in columns if isinstance(item, Mapping) and item.get("field") == field["sourceField"]), None) if isinstance(columns, (tuple, list)) else None
        if not isinstance(column, Mapping) or column.get("name") != field["nativeColumn"] or column.get("nativeType") != output["nativeType"]:
            raise ValueError("joined Field native column differs from native3 catalog")
        native_type = _object(output["nativeType"], set(output["nativeType"]) if isinstance(output["nativeType"], Mapping) else set(), "joined native type")
        expected_oid = {
            "boolean": 16, "text": 25, "varchar": 1043, "char": 1042,
            "int2": 21, "int4": 23, "int8": 20, "float4": 700,
            "float8": 701, "numeric": 1700, "date": 1082,
            "timestamp": 1114, "timestamptz": 1184, "uuid": 2950,
            "bytea": 17,
        }.get(cast(str, native_type.get("kind")))
        if _native_carrier(native_type) != output["carrier"] or expected_oid != output["oid"]:
            raise ValueError("joined native type, carrier or OID differs")
        _validate_output_codec(output["valueCodec"], carrier=cast(str, output["carrier"]), nullable=cast(bool, output["nullable"]), native_type=native_type, oid=cast(int, output["oid"]))
        inherited_sql = _text(inherited["selectSql"], "inherited Field SQL")
        expected_sql = inherited_sql.replace(' AS "' + cast(str, inherited_output["name"]) + '"', ' AS "' + cast(str, output["name"]) + '"')
        if owner_name == "target":
            expected_sql = expected_sql.replace('"r".', '"t".')
        carrier = _text(output["carrier"], "joined carrier")
        sql_value = _fragment(field["selectSql"], "joined Field projection", 0)
        expression = r'"[rt]"\.' + _QUOTED
        if carrier == "string":
            expression += r' COLLATE pg_catalog\."C"'
        # This accepts one issuer alias and one direct column, including the
        # profile's explicit C collation for strings.
        if re.fullmatch(expression + r' AS "((?:[^"]|"")+)"', sql_value) is None:
            raise ValueError("joined projection is not a qualified native column")
        if sql_value != expected_sql:
            raise ValueError("joined Field SQL differs from inherited source")
        expected_frame = 'f."' + _text(output["name"], "joined output name").replace('"', '""') + '"'
        if field["frameSelectSql"] != expected_frame:
            raise ValueError("joined frame output differs")
    selection = _object(descriptor["selection"], {"allowed", "ordered", "ownerRequired", "nullMeansDefault", "emptyAllowed", "emptyPublicTuple"}, "joined selection")
    if selection["ordered"] is not True or selection["ownerRequired"] is not True or selection["nullMeansDefault"] is not True or selection["emptyAllowed"] is not True or selection["emptyPublicTuple"] != []:
        raise ValueError("joined selection semantics differ")
    allowed = selection["allowed"]
    if not isinstance(allowed, (tuple, list)) or any(not isinstance(slot, Mapping) or set(slot) != {"owner", "fieldId"} or (slot["owner"], slot["fieldId"]) not in identities for slot in allowed):
        raise ValueError("joined selection references an unknown Field")
    expected_allowed = [{"owner": cast(str, field["owner"]), "fieldId": cast(str, field["fieldId"])} for field in cast(list[Mapping[str, object]], fields)]
    if list(allowed) != expected_allowed:
        raise ValueError("joined selection inventory differs from ordered Fields")
    defaults = descriptor["defaultSelection"]
    expected_defaults = [{"owner": "root", "fieldId": cast(str, identity)} for identity in cast(list[object], root_value["defaultSelection"])]
    if defaults != expected_defaults:
        raise ValueError("joined default selection differs from inherited root")
    statement = _object(descriptor["statement"], {"profile", "terminal", "sourceSqlTemplate", "sqlTemplate", "templateSha256", "parameterSlots", "projectionSlot", "ordinalOutput", "parameterOrder", "predicateValueOrder", "maxRows", "limit", "serverByteGuard", "byteGuard", "rootKeyTieOrder", "visibleTargetSemantics"}, "joined statement")
    sql = _text(statement["sqlTemplate"], "joined SQL template")
    if statement["profile"] != "weft.generated-required-inner-join-statement/1" or statement["terminal"] != "all" or statement["serverByteGuard"] is not True or hashlib.sha256(sql.encode("utf-8")).hexdigest() != statement["templateSha256"]:
        raise ValueError("joined statement profile or digest differs")
    source_sql = _text(statement["sourceSqlTemplate"], "joined source SQL template")
    root_from = _text(root_value["fromSql"], "joined root FROM clause")
    target_from = _text(target_root["fromSql"], "joined target FROM clause")
    target_table_fragment = target_from.removeprefix("FROM ").replace(' AS "r"', ' AS "t"')
    join_sql = _text(descriptor["joinSql"], "joined INNER JOIN fragment")
    binding = cast(Mapping[str, object], descriptor["binding"])
    pairs = binding.get("pairs")
    if not isinstance(pairs, (tuple, list)) or not pairs:
        raise ValueError("joined native binding pairs are malformed")

    def quote_identifier(identifier: object) -> str:
        if type(identifier) is not str or not identifier or "\x00" in identifier:
            raise ValueError("joined native identifier is malformed")
        return '"' + identifier.replace('"', '""') + '"'

    join_terms: list[str] = []
    for pair_value in pairs:
        pair = _object(pair_value, {"sourceField", "targetField", "sourceColumn", "targetColumn"}, "joined binding pair")
        source_column = _object(pair["sourceColumn"], {"tableId", "tableName", "columnName", "field"}, "joined source column")
        target_column = _object(pair["targetColumn"], {"tableId", "tableName", "columnName", "field"}, "joined target column")
        source_field_id = _field_key(cast(Mapping[str, object], pair["sourceField"]))
        target_field_id = _field_key(cast(Mapping[str, object], pair["targetField"]))
        source_output = cast(Mapping[str, object], cast(Mapping[str, object], root_value["fields"])[source_field_id])["output"]
        target_output = cast(Mapping[str, object], cast(Mapping[str, object], target_root["fields"])[target_field_id])["output"]
        source_carrier = cast(str, cast(Mapping[str, object], source_output)["carrier"])
        target_carrier = cast(str, cast(Mapping[str, object], target_output)["carrier"])
        if source_carrier != target_carrier:
            raise ValueError("joined binding carrier pair differs")
        source_expr = '"r".' + quote_identifier(source_column["columnName"])
        target_expr = '"t".' + quote_identifier(target_column["columnName"])
        if source_carrier == "string":
            source_expr += ' COLLATE pg_catalog."C"'
            target_expr += ' COLLATE pg_catalog."C"'
        join_terms.append(source_expr + " = " + target_expr)
    expected_join = "INNER JOIN " + target_table_fragment + " ON " + " AND ".join(join_terms)
    expected_source = (
        'SELECT ROW_NUMBER() OVER (ORDER BY {{ORDER_BY}}) AS "__weft_ordinal"{{PROJECTION}} '
        + root_from
        + " "
        + expected_join
        + " WHERE ({{FILTER}}) ORDER BY {{ORDER_BY}} LIMIT %s"
    )
    if join_sql != expected_join or source_sql != expected_source:
        raise ValueError("joined SQL does not match the fixed native join skeleton")
    if statement["rootKeyTieOrder"] != root_value["keyTieOrder"]:
        raise ValueError("joined default key tie order differs from the inherited root")
    if statement["parameterOrder"] != ["predicateValues", "limit"] or statement["parameterSlots"] != {"filter": "FILTER", "limit": "%s", "order": "ORDER_BY", "projection": "PROJECTION"}:
        raise ValueError("joined SQL parameter slots differ")
    expected_sql = _FRAME_TEMPLATE.replace("{{SOURCE_SQL}}", source_sql).replace("{{RETURN_COLUMNS}}", "f.*")
    if sql != expected_sql or statement["byteGuard"] != {
        "profile": "pg18-composed-native-frame/1",
        "byteMetric": "pg18-row-json-utf8/1",
        "maxNativeBytes": 8_388_608,
        "partialFrames": False,
        "sqlstate": "22012",
        "templateSha256": "8e77d3b07a72ced53b0a9155201072669b88971129569c0a5c7228f8319bab9a",
    }:
        raise ValueError("joined SQL server byte guard differs from the fixed frame contract")
    limit = _object(statement["limit"], {"minimum", "maximum", "nullMeans"}, "joined limit")
    if limit != {"minimum": 1, "maximum": 1000, "nullMeans": 1000} or statement["maxRows"] != 1000:
        raise ValueError("joined row limit differs")
    ordinal = _object(statement["ordinalOutput"], {"name", "carrier", "nullable", "nativeType", "oid"}, "joined ordinal output")
    if ordinal != {"name": "__weft_ordinal", "carrier": "integer", "nullable": False, "nativeType": {"kind": "int8"}, "oid": 20}:
        raise ValueError("joined ordinal output differs")
    if statement["visibleTargetSemantics"] != "only-visible-matching-target-rows":
        raise ValueError("joined target visibility semantics differ")


def _validate_forward_connection(
    root: Mapping[str, object],
    fields: Mapping[str, object],
    predicates: Mapping[str, object],
    native_columns: Mapping[str, Mapping[str, object]],
) -> None:
    """Verify the closed Rust-issued v5 profile without interpreting SQL."""
    support_value = root["forwardConnectionSupport"]
    if not isinstance(support_value, Mapping):
        raise TypeError("forward connection support is malformed")
    status = support_value.get("status")
    if status == "unsupported":
        _object(
            support_value,
            {"profile", "status", "reason"},
            "unsupported forward connection status",
        )
        if (
            support_value["profile"] != _CONNECTION_PROFILE
            or support_value["reason"] != "ROOT_OUTSIDE_PROFILE"
            or "forwardConnection" in root
        ):
            raise ValueError("unsupported forward connection status differs")
        return
    _object(support_value, {"profile", "status"}, "eligible forward connection status")
    if support_value["profile"] != _CONNECTION_PROFILE or status != "eligible":
        raise ValueError("forward connection status differs")

    connection = _object(
        root["forwardConnection"],
        {
            "profile",
            "maxFirst",
            "keyId",
            "key",
            "fieldOutputs",
            "forward",
            "previous",
            "lookaheadRows",
            "zeroFirstProbeRows",
            "nativeCollation",
            "nativeCollationPrecondition",
        },
        "forward connection descriptor",
    )
    if (
        connection["profile"] != _CONNECTION_PROFILE
        or connection["maxFirst"] != 100
        or type(connection["maxFirst"]) is not int
        or connection["lookaheadRows"] != 1
        or type(connection["lookaheadRows"]) is not int
        or connection["zeroFirstProbeRows"] != 1
        or type(connection["zeroFirstProbeRows"]) is not int
        or connection["nativeCollation"] != _CONNECTION_COLLATION
        or connection["nativeCollationPrecondition"]
        != "umf.generated-table-collation-c/1"
    ):
        raise ValueError("forward connection profile constants differ")

    primary_key = cast(
        tuple[Mapping[str, object], ...] | list[Mapping[str, object]],
        root["primaryKey"],
    )
    if len(primary_key) != 1 or connection["keyId"] != root["primaryKeyId"]:
        raise ValueError("forward connection Key is outside its one-text-Key profile")
    key_component = _object(
        primary_key[0], {"fieldId", "predicateId"}, "connection primary Key"
    )
    key_field_id = _identifier(key_component["fieldId"], "connection key Field")
    key_field = fields.get(key_field_id)
    key_predicate = predicates.get(key_component["predicateId"])
    if not isinstance(key_field, Mapping) or not isinstance(key_predicate, Mapping):
        raise TypeError("forward connection Key does not join to the issued root")
    key_native = native_columns.get(key_field_id)
    if not isinstance(key_native, Mapping):
        raise TypeError("forward connection Key has no native column")
    native_type = cast(Mapping[str, object], key_native["nativeType"])
    kind = native_type.get("kind")
    if kind not in {"text", "varchar"}:
        raise ValueError("forward connection Key is not supported text")
    _object(
        connection["key"]["output"],
        {"name", "carrier", "nullable", "nativeType", "oid"},
        "forward connection key output",
    )
    expected_key_output = {
        "name": "__weft_connection_key",
        "carrier": "string",
        "nullable": False,
        "nativeType": dict(native_type),
        "oid": _CONNECTION_OIDS[cast(str, kind)],
    }
    key = _object(
        connection["key"],
        {"fieldId", "codec", "output", "direction", "nulls", "collation"},
        "forward connection key",
    )
    if (
        key["fieldId"] != key_field_id
        or key["output"] != expected_key_output
        or key["direction"] != "asc"
        or key["nulls"] != "last"
        or key["collation"] != _CONNECTION_COLLATION
        or key_predicate.get("operator") != "eq"
        or key_predicate.get("fieldId") != key_field_id
        or key.get("codec") != key_predicate.get("codec")
    ):
        raise ValueError("forward connection key metadata differs")
    _validate_codec(key["codec"], carrier="string", nullable=False)

    outputs_value = connection["fieldOutputs"]
    if not isinstance(outputs_value, (list, tuple)) or len(outputs_value) != len(
        fields
    ):
        raise ValueError("forward connection output inventory differs")
    output_ids: list[str] = []
    for item_value in outputs_value:
        item = _object(
            item_value, {"fieldId", "output"}, "forward connection field output"
        )
        field_id = _identifier(item["fieldId"], "forward connection output Field")
        field = fields.get(field_id)
        column = native_columns.get(field_id)
        if not isinstance(field, Mapping) or not isinstance(column, Mapping):
            raise TypeError("forward connection output does not join to a source Field")
        field_output = cast(Mapping[str, object], field["output"])
        field_native = cast(Mapping[str, object], column["nativeType"])
        field_kind = field_native.get("kind")
        expected_oid = _CONNECTION_OIDS.get(cast(str, field_kind))
        if expected_oid is None:
            raise ValueError("forward connection output native type is unsupported")
        output = _object(
            item["output"],
            {"name", "carrier", "nullable", "nativeType", "oid"},
            "forward connection field output metadata",
        )
        if output != {
            "name": field_output["name"],
            "carrier": field_output["carrier"],
            "nullable": field_output["nullable"],
            "nativeType": dict(field_native),
            "oid": expected_oid,
        }:
            raise ValueError("forward connection output type/OID join differs")
        output_ids.append(field_id)
    if output_ids != list(fields):
        raise ValueError("forward connection output order differs from root fields")

    escaped_from_sql = _from_clause(root["fromSql"])
    from_match = re.fullmatch(
        r'FROM "((?:[^"]|"")+)"\."((?:[^"]|"")+)" AS "r"',
        escaped_from_sql,
    )
    if from_match is None:
        raise ValueError("forward connection relation differs")
    schema_name = from_match.group(1).replace('""', '"').replace("%%", "%")
    table_name = from_match.group(2).replace('""', '"').replace("%%", "%")
    raw_from_sql = (
        'FROM "'
        + schema_name.replace('"', '""')
        + '"."'
        + table_name.replace('"', '""')
        + '" AS "r"'
    )
    dbapi_from_sql = (
        "FROM "
        + _dbapi_identifier(schema_name, "forward connection schema")
        + "."
        + _dbapi_identifier(table_name, "forward connection table")
        + ' AS "r"'
    )
    if dbapi_from_sql != escaped_from_sql:
        raise ValueError("forward connection DB-API relation differs")
    key_column = _referenced_column(
        cast(Mapping[str, object], key_field)["selectSql"],
        "forward connection key projection",
    )
    raw_physical_key = '"r"."' + key_column.replace('"', '""') + '"'
    dbapi_physical_key = '"r".' + _dbapi_identifier(
        key_column, "forward connection key column"
    )
    raw_forward_source = (
        "SELECT ROW_NUMBER() OVER (ORDER BY "
        + raw_physical_key
        + ' COLLATE pg_catalog."C" ASC) AS "__weft_ordinal", '
        + raw_physical_key
        + ' COLLATE pg_catalog."C" AS "__weft_connection_key"'
        + "{{SELECT_COLUMNS}} "
        + raw_from_sql
        + " WHERE ({{FILTER}}) AND ($1::pg_catalog.text IS NULL OR "
        + raw_physical_key
        + ' COLLATE pg_catalog."C" > $2::pg_catalog.text COLLATE pg_catalog."C") '
        + "ORDER BY "
        + raw_physical_key
        + ' COLLATE pg_catalog."C" ASC LIMIT $3::pg_catalog.int8'
    )
    dbapi_forward_source = (
        "SELECT ROW_NUMBER() OVER (ORDER BY "
        + dbapi_physical_key
        + ' COLLATE pg_catalog."C" ASC) AS "__weft_ordinal", '
        + dbapi_physical_key
        + ' COLLATE pg_catalog."C" AS "__weft_connection_key"'
        + "{{SELECT_COLUMNS}} "
        + dbapi_from_sql
        + " WHERE ({{FILTER}}) AND (%s::pg_catalog.text IS NULL OR "
        + dbapi_physical_key
        + ' COLLATE pg_catalog."C" > %s::pg_catalog.text COLLATE pg_catalog."C") '
        + "ORDER BY "
        + dbapi_physical_key
        + ' COLLATE pg_catalog."C" ASC LIMIT %s::pg_catalog.int8'
    )
    raw_previous_source = (
        'SELECT 1::pg_catalog.int8 AS "__weft_ordinal", EXISTS (SELECT 1 '
        + raw_from_sql
        + " WHERE ({{FILTER}}) AND ($1::pg_catalog.text IS NOT NULL AND "
        + raw_physical_key
        + ' COLLATE pg_catalog."C" <= $2::pg_catalog.text COLLATE pg_catalog."C") '
        + 'LIMIT 1) AS "__weft_previous"'
    )
    dbapi_previous_source = (
        'SELECT 1::pg_catalog.int8 AS "__weft_ordinal", EXISTS (SELECT 1 '
        + dbapi_from_sql
        + " WHERE ({{FILTER}}) AND (%s::pg_catalog.text IS NOT NULL AND "
        + dbapi_physical_key
        + ' COLLATE pg_catalog."C" <= %s::pg_catalog.text COLLATE pg_catalog."C") '
        + 'LIMIT 1) AS "__weft_previous"'
    )
    guard = cast(Mapping[str, object], root["nativeReadGuard"])
    template = cast(Mapping[str, object], guard["template"])["sql"]
    expected_forward_source = (
        cast(str, template)
        .replace("{{SOURCE_SQL}}", raw_forward_source)
        .replace("{{RETURN_COLUMNS}}", "f.*")
    )
    expected_forward_dbapi = (
        cast(str, template)
        .replace("{{SOURCE_SQL}}", dbapi_forward_source)
        .replace("{{RETURN_COLUMNS}}", "f.*")
    )
    expected_previous_source = (
        cast(str, template)
        .replace("{{SOURCE_SQL}}", raw_previous_source)
        .replace("{{RETURN_COLUMNS}}", 'f."__weft_previous"')
    )
    expected_previous_dbapi = (
        cast(str, template)
        .replace("{{SOURCE_SQL}}", dbapi_previous_source)
        .replace("{{RETURN_COLUMNS}}", 'f."__weft_previous"')
    )
    for name, source, dbapi_sql, parameter_order, transport_order in (
        (
            "forward",
            expected_forward_source,
            expected_forward_dbapi,
            ["filterValues", "after", "after", "limit"],
            ["after", "after", "limit"],
        ),
        (
            "previous",
            expected_previous_source,
            expected_previous_dbapi,
            ["filterValues", "after", "after"],
            ["after", "after"],
        ),
    ):
        query = _object(
            connection[name],
            {
                "sourceSqlTemplate",
                "sourceTemplateSha256",
                "sqlTemplate",
                "templateSha256",
                "filterParameterGroup",
                "parameterOrder",
                "dbapiParameterOrder",
                "keyOutput" if name == "forward" else "output",
            },
            "forward connection " + name + " query",
        )
        output_descriptor = query["keyOutput"] if name == "forward" else query["output"]
        if name == "forward":
            if output_descriptor != expected_key_output:
                raise ValueError("forward connection query Key output differs")
        elif output_descriptor != {
            "name": "__weft_previous",
            "carrier": "boolean",
            "nullable": False,
            "nativeType": {"kind": "boolean"},
            "oid": 16,
        }:
            raise ValueError("forward connection previous output differs")
        source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
        if (
            query["sourceSqlTemplate"] != source
            or query["sourceTemplateSha256"] != source_hash
            or query["sqlTemplate"] != dbapi_sql
            or query["templateSha256"]
            != hashlib.sha256(dbapi_sql.encode("utf-8")).hexdigest()
            or query["filterParameterGroup"] != "filterValues"
            or query["parameterOrder"] != parameter_order
            or query["dbapiParameterOrder"] != transport_order
            or dbapi_sql.count("{{FILTER}}") != 1
            or dbapi_sql.count("{{SELECT_COLUMNS}}") != (1 if name == "forward" else 0)
        ):
            raise ValueError("forward connection " + name + " SQL template differs")


def _validate_v2_root(
    root: Mapping[str, object],
    fields: Mapping[str, object],
    predicates: Mapping[str, object],
    *,
    v3: bool = False,
) -> None:
    """Validate source Key proof and terminal descriptor closure for G3."""
    primary_key = root["primaryKey"]
    _text(root["primaryKeyId"], "generated source Key ID")
    if not isinstance(primary_key, (list, tuple)) or not 1 <= len(primary_key) <= 16:
        raise ValueError("generated primary Key descriptor is malformed")
    seen_fields: set[str] = set()
    seen_predicates: set[str] = set()
    for item in primary_key:
        component = _object(item, {"fieldId", "predicateId"}, "primary Key component")
        field_id = _identifier(component["fieldId"], "primary Key Field ID")
        predicate_id = _identifier(component["predicateId"], "primary Key predicate ID")
        field = fields.get(field_id)
        predicate = predicates.get(predicate_id)
        if (
            field_id in seen_fields
            or predicate_id in seen_predicates
            or not isinstance(field, Mapping)
            or not isinstance(predicate, Mapping)
            or predicate.get("fieldId") != field_id
            or predicate.get("operator") != "eq"
            or predicate.get("arity") != 1
            or cast(Mapping[str, object], field.get("output")).get("nullable")
            is not False
        ):
            raise ValueError(
                "generated primary Key proof differs from the issued fields"
            )
        seen_fields.add(field_id)
        seen_predicates.add(predicate_id)

    terminals = _object(
        root["terminals"], {"first", "one", "count", "exists", "get"}, "read terminals"
    )
    for name, cardinality, limit in (
        ("first", "zero-or-one", 1),
        ("one", "exactly-one", 2),
        ("get", "exactly-one", 2),
    ):
        terminal = _object(
            terminals[name], {"limit", "cardinality"}, name + " terminal"
        )
        if terminal != {"limit": limit, "cardinality": cardinality}:
            raise ValueError("generated row terminal cardinality differs")
    terminal_keys = {"selectSql", "output", "cardinality"}
    exists_keys = {"selectSql", "output", "limit", "cardinality"}
    if v3:
        terminal_keys.add("frameSelectSql")
        exists_keys.add("frameSelectSql")
    count = _object(terminals["count"], terminal_keys, "count terminal")
    exists = _object(
        terminals["exists"],
        exists_keys,
        "exists terminal",
    )
    for terminal, carrier, cardinality, native_type, oid in (
        (count, "integer", "one-integer", {"kind": "int8"}, 20),
        (exists, "boolean", "row-presence", {"kind": "boolean"}, 16),
    ):
        output = terminal["output"]
        if not isinstance(output, Mapping):
            raise TypeError("generated scalar output descriptor is malformed")
        if (
            _scalar_projection(terminal["selectSql"], output, carrier)
            != terminal["selectSql"]
            or output.get("carrier") != carrier
            or output.get("nullable") is not False
            or type(output.get("name")) is not str
            or not output.get("name")
            or output.get("nativeType") != native_type
            or type(output.get("oid")) is not int
            or output.get("oid") != oid
            or terminal.get("cardinality") != cardinality
        ):
            raise ValueError("generated scalar terminal descriptor differs")
        if v3 and terminal["frameSelectSql"] != (
            'f."' + cast(str, output["name"]).replace('"', '""') + '"'
        ):
            raise ValueError("generated scalar frame descriptor differs")
    if exists["limit"] != 1:
        raise ValueError("generated exists row cap differs")


def _validate_get_many(
    root: Mapping[str, object],
    fields: Mapping[str, object],
    native_columns: Mapping[str, Mapping[str, object]],
) -> None:
    """Validate the closed Rust-issued Key codec and batch SQL template pins."""
    descriptor = _object(
        root["getMany"],
        {
            "profile",
            "maxKeys",
            "keyId",
            "keyFields",
            "keyTupleSql",
            "sourceSqlTemplate",
            "sourceTemplateSha256",
            "ordinalOutput",
            "presentOutput",
        },
        "generated Key batch descriptor",
    )
    primary_key = root["primaryKey"]
    if not isinstance(primary_key, (list, tuple)):
        raise TypeError("generated source primary Key is malformed")
    if (
        descriptor["profile"] != "weft.generated-key-batch/1"
        or type(descriptor["maxKeys"]) is not int
        or descriptor["maxKeys"] != 100
        or descriptor["keyId"] != root["primaryKeyId"]
    ):
        raise ValueError("generated Key batch identity or bound differs")
    key_fields = descriptor["keyFields"]
    if not isinstance(key_fields, (list, tuple)) or len(key_fields) != len(primary_key):
        raise ValueError("generated Key batch component count differs")
    expected_carriers: list[str] = []
    for batch_field, key_component in zip(key_fields, primary_key, strict=True):
        component = _object(
            key_component, {"fieldId", "predicateId"}, "primary Key component"
        )
        value = _object(
            batch_field, {"fieldId", "codec"}, "generated Key batch component"
        )
        field_id = _text(component["fieldId"], "primary Key Field ID")
        predicate_id = _text(component["predicateId"], "primary Key predicate ID")
        predicate = root["predicates"].get(predicate_id)  # type: ignore[union-attr]
        field = fields.get(field_id)
        if (
            not isinstance(predicate, Mapping)
            or not isinstance(field, Mapping)
            or value["fieldId"] != field_id
        ):
            raise ValueError("generated Key batch Field join differs")
        output = field.get("output")
        if not isinstance(output, Mapping) or output.get("nullable") is not False:
            raise ValueError("generated Key batch Field must be required")
        carrier = _text(output.get("carrier"), "generated Key carrier")
        _validate_codec(value["codec"], carrier=carrier, nullable=False)
        if predicate.get("codec") != value["codec"]:
            raise ValueError("generated Key batch codec differs from primary predicate")
        expected_carriers.append(carrier)
    tuple_sql = _text(descriptor["keyTupleSql"], "generated Key tuple SQL")
    casts = {
        "boolean": "bool",
        "integer": "numeric",
        "decimal": "numeric",
        "string": "text",
    }
    cast_terms = [casts.get(carrier) for carrier in expected_carriers]
    if any(term is None for term in cast_terms):
        raise ValueError("generated Key carrier has no closed transport cast")
    expected_tuple = (
        "(%s::pg_catalog.int8, "
        + ", ".join("%s::pg_catalog." + str(term) for term in cast_terms)
        + ")"
    )
    if tuple_sql != expected_tuple:
        raise ValueError("generated Key tuple cast profile differs")
    template = _text(descriptor["sourceSqlTemplate"], "generated Key source template")
    digest = _text(
        descriptor["sourceTemplateSha256"], "generated Key source template digest"
    )
    if (
        len(template.encode("utf-8")) > _MAX_SQL_BYTES
        or template.count("{{KEY_ROWS}}") != 1
        or template.count("{{SELECT_COLUMNS}}") != 1
        or hashlib.sha256(template.encode("utf-8")).hexdigest() != digest
    ):
        raise ValueError("generated Key source template digest or slots differ")
    join_terms: list[str] = []
    key_columns: list[str] = []
    for index, (batch_field, carrier) in enumerate(
        zip(key_fields, expected_carriers, strict=True)
    ):
        field_id = cast(str, cast(Mapping[str, object], batch_field)["fieldId"])
        native_column = native_columns[field_id]
        column_name = _dbapi_identifier(native_column["name"], "Key native column")
        left = '"r".' + column_name
        right = "k." + _dbapi_identifier("__weft_key_" + str(index), "Key input column")
        if carrier == "string":
            left += ' COLLATE pg_catalog."C"'
            right += ' COLLATE pg_catalog."C"'
        join_terms.append(left + " = " + right)
        key_columns.append(
            _dbapi_identifier("__weft_key_" + str(index), "Key input column")
        )
    first_key_field = cast(str, cast(Mapping[str, object], key_fields[0])["fieldId"])
    witness_column = _dbapi_identifier(
        native_columns[first_key_field]["name"], "Key witness column"
    )
    from_sql = cast(str, root["fromSql"])
    expected_template = (
        'WITH "__weft_key_rows" ("__weft_ordinal", '
        + ", ".join(key_columns)
        + ') AS (VALUES {{KEY_ROWS}}) SELECT k."__weft_ordinal" AS "__weft_ordinal", '
        + '("r".'
        + witness_column
        + ' IS NOT NULL) AS "__weft_present"'
        + "{{SELECT_COLUMNS}} FROM "
        + '"__weft_key_rows" AS k LEFT JOIN '
        + from_sql[5:]
        + " ON "
        + " AND ".join(join_terms)
        + ' ORDER BY k."__weft_ordinal"'
    )
    if template != expected_template:
        raise ValueError(
            "generated Key batch source template is outside its closed join grammar"
        )
    _fragment(
        template.replace("{{KEY_ROWS}}", "(0,1)").replace("{{SELECT_COLUMNS}}", ""),
        "generated Key source template",
        0,
    )
    ordinal = _object(
        descriptor["ordinalOutput"],
        {"name", "carrier", "nullable", "nativeType", "oid"},
        "generated Key ordinal output",
    )
    present = _object(
        descriptor["presentOutput"],
        {"name", "carrier", "nullable", "nativeType", "oid"},
        "generated Key presence output",
    )
    if ordinal != {
        "name": "__weft_ordinal",
        "carrier": "integer",
        "nullable": False,
        "nativeType": {"kind": "int8"},
        "oid": 20,
    } or present != {
        "name": "__weft_present",
        "carrier": "boolean",
        "nullable": False,
        "nativeType": {"kind": "boolean"},
        "oid": 16,
    }:
        raise ValueError("generated Key ordinal or presence output differs")


def bind_read(
    call: GeneratedReadCall,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> BoundReadProgram:
    if type(call) is not GeneratedReadCall or type(scope) is not ExecutionScope:
        raise GeneratedExecutionError("INVALID")
    try:
        algebra = _validate_algebra(manifest, files, target, native_table)
        if algebra is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        roots = cast(Mapping[str, object], algebra["roots"])
        root_key = _escape_component(call.module) + "/" + _escape_component(call.record)
        root = roots.get(root_key)
        if root is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        root = cast(Mapping[str, object], root)
        native_source = getattr(native_table, "native_source", None)
        catalog = (
            native_source.get("expectedCatalog")
            if isinstance(native_source, Mapping)
            else None
        )
        catalog_tables = catalog.get("tables") if isinstance(catalog, Mapping) else None
        native_record = (
            next(
                (
                    value
                    for value in cast(tuple[object, ...] | list[object], catalog_tables)
                    if isinstance(value, Mapping)
                    and value.get("record")
                    == {"module": call.module, "element": call.record}
                ),
                None,
            )
            if isinstance(catalog_tables, (tuple, list))
            else None
        )
        native_columns: dict[str, Mapping[str, object]] = {}
        if isinstance(native_record, Mapping) and isinstance(
            native_record.get("columns"), (tuple, list)
        ):
            for native_column in cast(
                tuple[object, ...] | list[object], native_record["columns"]
            ):
                if isinstance(native_column, Mapping) and isinstance(
                    native_column.get("field"), Mapping
                ):
                    native_columns[
                        _field_key(cast(Mapping[str, object], native_column["field"]))
                    ] = native_column
        fields = cast(Mapping[str, object], root["fields"])
        default_selection = root["defaultSelection"]
        if not isinstance(default_selection, (list, tuple)):
            raise TypeError("read default selection is malformed")
        selected = (
            tuple(cast(list[str] | tuple[str, ...], default_selection))
            if call.selection is None
            else call.selection
        )
        if (
            not selected
            or (call.selection is not None and len(selected) > 8)
            or len(selected) > 4096
            or len(set(selected)) != len(selected)
            or any(identity not in fields for identity in selected)
        ):
            raise GeneratedExecutionError("UNSUPPORTED")
        if len(call.filters) > 64 or len(call.orders) > 16:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        predicates = cast(Mapping[str, object], root["predicates"])
        clauses: list[str] = []
        parameters: list[object] = []
        for item in call.filters:
            predicate = predicates.get(item.predicate_id)
            if not isinstance(predicate, Mapping):
                raise GeneratedExecutionError("UNSUPPORTED")
            arity = predicate["arity"]
            if len(item.values) != arity:
                raise GeneratedExecutionError("INVALID")
            clauses.append(cast(str, predicate["sql"]))
            if arity == 1:
                field_id = cast(str, predicate["fieldId"])
                output = cast(
                    Mapping[str, object],
                    cast(Mapping[str, object], fields[field_id])["output"],
                )
                carrier = _text(output.get("carrier"), "read input carrier")
                parameters.append(
                    run_issued_codec(
                        predicate["codec"],
                        item.values[0],
                        carrier=carrier,
                        nullable=bool(output.get("nullable", False)),
                    )
                )
        orders = cast(Mapping[str, object], root["orders"])
        requested: list[str] = []
        for identity in call.orders:
            if identity not in orders or identity in requested:
                raise GeneratedExecutionError("UNSUPPORTED")
            requested.append(identity)
        requested_fields = {
            cast(str, cast(Mapping[str, object], orders[identity])["fieldId"])
            for identity in requested
        }
        tie_order = root["keyTieOrder"]
        if not isinstance(tie_order, (list, tuple)):
            raise TypeError("read key tie order is malformed")
        for identity in cast(list[str] | tuple[str, ...], tie_order):
            tie_field = cast(
                str, cast(Mapping[str, object], orders[identity])["fieldId"]
            )
            if tie_field not in requested_fields:
                requested.append(identity)
                requested_fields.add(tie_field)
        if not 1 <= call.limit <= min(1000, cast(int, root["maxRows"])):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        projections = [
            cast(str, cast(Mapping[str, object], fields[field_id])["selectSql"])
            for field_id in selected
        ]
        from_sql = cast(str, root["fromSql"])
        description_sql = (
            "SELECT " + ", ".join(projections) + " " + from_sql + " WHERE FALSE"
        )
        sql = "SELECT " + ", ".join(projections) + " " + from_sql
        if clauses:
            sql += " WHERE " + " AND ".join("(" + clause + ")" for clause in clauses)
        if requested:
            sql += " ORDER BY " + ", ".join(
                cast(str, cast(Mapping[str, object], orders[identity])["sql"])
                for identity in requested
            )  # type: ignore[index]
        sql += " LIMIT %s"
        parameters.append(call.limit)
        if (
            max(len(sql.encode("utf-8")), len(description_sql.encode("utf-8")))
            > _MAX_SQL_BYTES
        ):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        outputs_list: list[Mapping[str, object]] = []
        selected_refs: list[dict[str, str]] = []
        for field_id in selected:
            descriptor = cast(Mapping[str, object], fields[field_id])
            output = cast(Mapping[str, object], descriptor["output"])
            if output.get("carrier") not in {
                "boolean",
                "string",
                "integer",
                "decimal",
                "date",
                "timestamp",
                "uuid",
                "bits128",
            }:
                raise GeneratedExecutionError("UNSUPPORTED")
            native_column = native_columns.get(field_id)
            native_type = (
                cast(Mapping[str, object], native_column["nativeType"])
                if native_column is not None
                else {}
            )
            if (
                output.get("carrier") == "timestamp"
                and native_type.get("kind") != "timestamptz"
            ):
                # The first result codec represents instants only; local SQL
                # timestamps need a distinct issued wrapper profile.
                raise GeneratedExecutionError("UNSUPPORTED")
            reference = _decode_field_key(field_id)
            outputs_list.append(output)
            selected_refs.append(reference)
        outputs = tuple(outputs_list)
        program_value = {
            "version": "umf.generated-read-bound/1",
            "source": dict(cast(Mapping[str, object], algebra["source"])),
            "target": dict(cast(Mapping[str, object], algebra["target"])),
            "root": root_key,
            "selection": list(selected),
            "filters": [item.predicate_id for item in call.filters],
            "orders": requested,
            "limit": call.limit,
            "sql": sql,
            "parameters": parameters,
            "descriptionSql": description_sql,
            "outputs": list(outputs),
            "fields": selected_refs,
            "obligations": dict(cast(Mapping[str, object], root["obligations"])),
            "nativeReadGuard": dict(
                cast(Mapping[str, object], root["nativeReadGuard"])
            ),
        }
        return BoundReadProgram(
            sql=sql,
            parameters=tuple(parameters),
            description_sql=description_sql,
            description_parameters=(),
            fields=tuple(selected_refs),
            outputs=outputs,
            native_read_guard=cast(Mapping[str, object], root["nativeReadGuard"]),
            obligations=cast(Mapping[str, object], root["obligations"]),
            source_digest=cast(
                str, cast(Mapping[str, object], algebra["source"])["modelSha256"]
            ),
            target_digest=target.binding_digest,
            program_json=canonical_json(program_value),
        )
    except GeneratedExecutionError:
        raise
    except (KeyError, TypeError, ValueError, UnicodeError, OverflowError):
        raise GeneratedExecutionError("INVALID") from None


def _where_wire(term: object) -> object:
    from umf_access_generated_executor._values import (
        GeneratedReadAnd,
        GeneratedReadAtom,
        GeneratedReadNot,
        GeneratedReadOr,
    )

    if type(term) is GeneratedReadAtom:
        return {
            "op": "atom",
            "predicateId": term.predicate_id,
            "values": list(term.values),
        }
    if type(term) in {GeneratedReadAnd, GeneratedReadOr}:
        branch = cast(GeneratedReadAnd | GeneratedReadOr, term)
        return {
            "op": "and" if type(term) is GeneratedReadAnd else "or",
            "args": [_where_wire(child) for child in branch.args],
        }
    if type(term) is GeneratedReadNot:
        return {"op": "not", "arg": _where_wire(term.arg)}
    raise ValueError("generated Boolean term is unsupported")


def _bind_where_v2(
    term: object,
    *,
    root: Mapping[str, object],
    parameters: list[object],
    counts: list[int],
    depth: int = 1,
) -> str:
    from umf_access_generated_executor._values import (
        GeneratedReadAnd,
        GeneratedReadAtom,
        GeneratedReadNot,
        GeneratedReadOr,
    )

    if depth > 8:
        raise GeneratedExecutionError("LIMIT_EXCEEDED")
    counts[0] += 1
    if counts[0] > 64:
        raise GeneratedExecutionError("LIMIT_EXCEEDED")
    predicates = cast(Mapping[str, object], root["predicates"])
    fields = cast(Mapping[str, object], root["fields"])
    if type(term) is GeneratedReadAtom:
        predicate = predicates.get(term.predicate_id)
        if not isinstance(predicate, Mapping):
            raise GeneratedExecutionError("UNSUPPORTED")
        arity = predicate.get("arity")
        if type(arity) is not int or len(term.values) != arity:
            raise GeneratedExecutionError("INVALID")
        counts[1] += 1
        if counts[1] > 64:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        if arity == 1:
            field_id = cast(str, predicate["fieldId"])
            descriptor = cast(Mapping[str, object], fields[field_id])
            output = cast(Mapping[str, object], descriptor["output"])
            parameters.append(
                run_issued_codec(
                    predicate["codec"],
                    term.values[0],
                    carrier=cast(str, output["carrier"]),
                    nullable=cast(bool, output["nullable"]),
                )
            )
        return "(" + cast(str, predicate["sql"]) + ")"
    if type(term) is GeneratedReadNot:
        return (
            "(NOT "
            + _bind_where_v2(
                term.arg,
                root=root,
                parameters=parameters,
                counts=counts,
                depth=depth + 1,
            )
            + ")"
        )
    if type(term) in {GeneratedReadAnd, GeneratedReadOr}:
        branch = cast(GeneratedReadAnd | GeneratedReadOr, term)
        operator = " AND " if type(term) is GeneratedReadAnd else " OR "
        children = [
            _bind_where_v2(
                child,
                root=root,
                parameters=parameters,
                counts=counts,
                depth=depth + 1,
            )
            for child in branch.args
        ]
        return "(" + operator.join(children) + ")"
    raise GeneratedExecutionError("INVALID")


def _scalar_projection(
    value: object, output: Mapping[str, object], carrier: str
) -> str:
    text = _fragment(value, "generated scalar projection", 0)
    name = _text(output.get("name"), "generated scalar output name")
    alias = '"' + name.replace('"', '""') + '"'
    expressions = (
        {"pg_catalog.count(*) AS " + alias}
        if carrier == "integer"
        else {"true AS " + alias}
    )
    if text not in expressions:
        raise ValueError("generated scalar projection is outside its closed grammar")
    return text


def _bind_read_profile(
    call: object,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
    *,
    profile: str,
):
    """Bind one issued Boolean/terminal profile without interpreting UMF or SQL."""
    from umf_access_generated_executor._values import (
        BoundReadProgramV2,
        BoundReadProgramV3,
        GeneratedReadAtom,
    )

    if type(call) is not GeneratedReadCallV2 or type(scope) is not ExecutionScope:
        raise GeneratedExecutionError("INVALID")
    try:
        descriptor = cast(Mapping[str, object], manifest.value["algebra"])
        descriptor_profile = descriptor.get("profile")
        if profile == _PROFILE_V3:
            if descriptor_profile not in {_PROFILE_V3, _PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
                raise GeneratedExecutionError("UNSUPPORTED")
            profile = _PROFILE_V3
        elif descriptor_profile != profile:
            raise GeneratedExecutionError("UNSUPPORTED")
        algebra = _validate_algebra(manifest, files, target, native_table)
        if algebra is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        roots = cast(Mapping[str, object], algebra["roots"])
        root_id = _escape_component(call.module) + "/" + _escape_component(call.record)
        root_value = roots.get(root_id)
        if not isinstance(root_value, Mapping):
            raise GeneratedExecutionError("UNSUPPORTED")
        root = cast(Mapping[str, object], root_value)
        fields = cast(Mapping[str, object], root["fields"])
        selected = (
            tuple(cast(list[str] | tuple[str, ...], root["defaultSelection"]))
            if call.selection is None
            else call.selection
        )
        if not selected or any(identity not in fields for identity in selected):
            raise GeneratedExecutionError("UNSUPPORTED")
        if call.terminal in {"count", "exists"} and (
            call.selection is not None or call.orders
        ):
            raise GeneratedExecutionError("UNSUPPORTED")
        if call.terminal == "get" and (
            call.where is not None
            or call.orders
            or call.selection is not None
            or call.limit is not None
        ):
            raise GeneratedExecutionError("UNSUPPORTED")
        if call.terminal != "get" and call.key is not None:
            raise GeneratedExecutionError("INVALID")
        parameters: list[object] = []
        clauses: list[str] = []
        if call.where is not None:
            clauses.append(
                _bind_where_v2(
                    call.where,
                    root=root,
                    parameters=parameters,
                    counts=[0, 0],
                )
            )
        if call.terminal == "get":
            primary_key = cast(list[object] | tuple[object, ...], root["primaryKey"])
            if call.key is None or len(call.key) != len(primary_key):
                raise GeneratedExecutionError("INVALID")
            key_clauses: list[str] = []
            for raw_component, value in zip(primary_key, call.key, strict=True):
                component = cast(Mapping[str, object], raw_component)
                atom = GeneratedReadAtom(cast(str, component["predicateId"]), (value,))
                key_clauses.append(
                    _bind_where_v2(
                        atom, root=root, parameters=parameters, counts=[0, 0]
                    )
                )
            clauses.append("(" + " AND ".join(key_clauses) + ")")

        order_inventory = cast(Mapping[str, object], root["orders"])
        requested: list[str] = []
        for order_id in call.orders:
            if order_id not in order_inventory:
                raise GeneratedExecutionError("UNSUPPORTED")
            requested.append(order_id)
        if call.terminal not in {"count", "exists"}:
            requested_fields = {
                cast(
                    str,
                    cast(Mapping[str, object], order_inventory[identity])["fieldId"],
                )
                for identity in requested
            }
            for identity in cast(list[str] | tuple[str, ...], root["keyTieOrder"]):
                tie_field = cast(
                    str,
                    cast(Mapping[str, object], order_inventory[identity])["fieldId"],
                )
                if tie_field not in requested_fields:
                    requested.append(identity)
                    requested_fields.add(tie_field)

        terminal = call.terminal
        terminal_inventory = cast(Mapping[str, object], root["terminals"])
        if terminal == "all":
            max_rows = cast(int, root["maxRows"])
            if call.limit is not None and call.limit > max_rows:
                raise GeneratedExecutionError("LIMIT_EXCEEDED")
            effective_row_limit: int | None = call.limit or max_rows
            fetch_limit = (
                max_rows + 1
                if profile == _PROFILE_V3 and call.limit is None
                else cast(int, effective_row_limit)
            )
            overflow_check = profile == _PROFILE_V3 and call.limit is None
        else:
            effective_row_limit = {
                "first": 1,
                "one": 2,
                "get": 2,
                "count": None,
                "exists": 1,
            }[terminal]
            fetch_limit = 1 if terminal == "count" else cast(int, effective_row_limit)
            overflow_check = False
        scalar_output: Mapping[str, object] | None = None
        result_kind: Literal["rows", "scalar"]
        if terminal in {"count", "exists"}:
            scalar_descriptor = cast(Mapping[str, object], terminal_inventory[terminal])
            scalar_output = cast(Mapping[str, object], scalar_descriptor["output"])
            scalar_sql = _scalar_projection(
                scalar_descriptor["selectSql"],
                scalar_output,
                "integer" if terminal == "count" else "boolean",
            )
            projections = [scalar_sql]
            row_fields: list[dict[str, str]] = []
            outputs: list[Mapping[str, object]] = []
            result_kind = "scalar"
            cardinality = cast(str, scalar_descriptor["cardinality"])
        else:
            projections = [
                cast(str, cast(Mapping[str, object], fields[identity])["selectSql"])
                for identity in selected
            ]
            row_fields = [_decode_field_key(identity) for identity in selected]
            outputs = [
                cast(
                    Mapping[str, object],
                    cast(Mapping[str, object], fields[identity])["output"],
                )
                for identity in selected
            ]
            result_kind = "rows"
            cardinality = {
                "all": "bounded-many",
                "first": "zero-or-one",
                "one": "exactly-one",
                "get": "exactly-one",
            }[terminal]
        from_sql = cast(str, root["fromSql"])
        if profile == _PROFILE_V3:
            ordinal = cast(str, root["frameScalarOrdinalSql"])
            if terminal not in {"count", "exists"}:
                order_sql = ", ".join(
                    cast(
                        str,
                        cast(Mapping[str, object], order_inventory[identity])["sql"],
                    )
                    for identity in requested
                )
                if not order_sql:
                    raise GeneratedExecutionError("UNSUPPORTED")
                ordinal = cast(str, root["frameOrdinalSql"]).replace(
                    "{{ORDER_SQL}}", order_sql, 1
                )
            source_select = (
                "SELECT " + ", ".join([ordinal, *projections]) + " " + from_sql
            )
            if clauses:
                source_select += " WHERE " + " AND ".join(clauses)
            if requested and terminal not in {"count", "exists"}:
                source_select += " ORDER BY " + ", ".join(
                    cast(
                        str,
                        cast(Mapping[str, object], order_inventory[identity])["sql"],
                    )
                    for identity in requested
                )
            if terminal in {"all", "first", "one", "get", "exists"}:
                source_select += " LIMIT %s"
                parameters.append(fetch_limit)
            description_source = (
                "SELECT "
                + ", ".join([ordinal, *projections])
                + " "
                + from_sql
                + " WHERE FALSE"
            )
            guard = cast(Mapping[str, object], root["nativeReadGuard"])
            template = cast(Mapping[str, object], guard["template"])
            template_sql = cast(str, template["sql"])
            return_columns = ", ".join(
                ['f."__weft_ordinal"']
                + [
                    cast(
                        str,
                        cast(Mapping[str, object], fields[identity])["frameSelectSql"],
                    )
                    for identity in selected
                ]
                if result_kind == "rows"
                else [
                    'f."__weft_ordinal"',
                    cast(
                        str,
                        cast(Mapping[str, object], terminal_inventory[terminal])[
                            "frameSelectSql"
                        ],
                    ),
                ]
            )
            sql = template_sql.replace("{{SOURCE_SQL}}", source_select, 1).replace(
                "{{RETURN_COLUMNS}}", return_columns, 1
            )
            description_sql = template_sql.replace(
                "{{SOURCE_SQL}}", description_source, 1
            ).replace("{{RETURN_COLUMNS}}", return_columns, 1)
        else:
            select_from = "SELECT " + ", ".join(projections) + " " + from_sql
            description_sql = select_from + " WHERE FALSE"
            sql = select_from
            if clauses:
                sql += " WHERE " + " AND ".join(clauses)
            if terminal not in {"count", "exists"} and requested:
                sql += " ORDER BY " + ", ".join(
                    cast(
                        str,
                        cast(Mapping[str, object], order_inventory[identity])["sql"],
                    )
                    for identity in requested
                )
            if terminal in {"all", "first", "one", "get", "exists"}:
                sql += " LIMIT %s"
                parameters.append(effective_row_limit)
        if (
            max(len(sql.encode("utf-8")), len(description_sql.encode("utf-8")))
            > _MAX_SQL_BYTES
        ):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        program_value = {
            "version": "umf.generated-read-bound/3"
            if profile == _PROFILE_V3
            else "umf.generated-read-bound/2",
            "source": dict(cast(Mapping[str, object], algebra["source"])),
            "target": dict(cast(Mapping[str, object], algebra["target"])),
            "root": root_id,
            "selection": list(selected) if result_kind == "rows" else None,
            "where": _where_wire(call.where) if call.where is not None else None,
            "orders": requested,
            "limit": call.limit,
            "terminal": terminal,
            "resultKind": result_kind,
            "cardinality": cardinality,
            "effectiveRowLimit": effective_row_limit,
            **(
                {"fetchLimit": fetch_limit, "overflowCheck": overflow_check}
                if profile == _PROFILE_V3
                else {}
            ),
            "sql": sql,
            "parameters": parameters,
            "descriptionSql": description_sql,
            "fields": row_fields,
            "outputs": outputs,
            "scalarOutput": dict(scalar_output) if scalar_output is not None else None,
            "obligations": dict(cast(Mapping[str, object], root["obligations"])),
            "nativeReadGuard": dict(
                cast(Mapping[str, object], root["nativeReadGuard"])
            ),
        }
        bound_values = {
            "sql": sql,
            "parameters": tuple(parameters),
            "description_sql": description_sql,
            "description_parameters": (),
            "fields": tuple(row_fields),
            "outputs": tuple(outputs),
            "native_read_guard": cast(Mapping[str, object], root["nativeReadGuard"]),
            "obligations": cast(Mapping[str, object], root["obligations"]),
            "source_digest": cast(
                str, cast(Mapping[str, object], algebra["source"])["modelSha256"]
            ),
            "target_digest": target.binding_digest,
            "terminal": terminal,
            "result_kind": result_kind,
            "cardinality": cardinality,
            "row_limit": effective_row_limit,
            "scalar_output": scalar_output,
            "program_json": canonical_json(program_value),
        }
        if profile == _PROFILE_V3:
            return BoundReadProgramV3(
                **bound_values,
                fetch_limit=fetch_limit,
                overflow_check=overflow_check,
            )
        return BoundReadProgramV2(**bound_values)
    except GeneratedExecutionError:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeError,
        OverflowError,
        RecursionError,
    ):
        raise GeneratedExecutionError("INVALID") from None


def bind_read_v2(
    call: object,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> BoundReadProgramV2:
    if (
        cast(Mapping[str, object], manifest.value["algebra"]).get("profile")
        != _PROFILE_V2
    ):
        raise GeneratedExecutionError("UNSUPPORTED")
    return cast(
        BoundReadProgramV2,
        _bind_read_profile(
            call, scope, manifest, files, target, native_table, profile=_PROFILE_V2
        ),
    )


def bind_read_v3(
    call: object,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> BoundReadProgramV3:
    if cast(Mapping[str, object], manifest.value["algebra"]).get("profile") not in {
        _PROFILE_V3,
        _PROFILE_V4,
        _PROFILE_V5,
        _PROFILE_V6,
        _PROFILE_V7,
        _PROFILE_V8,
    }:
        raise GeneratedExecutionError("UNSUPPORTED")
    return cast(
        BoundReadProgramV3,
        _bind_read_profile(
            call, scope, manifest, files, target, native_table, profile=_PROFILE_V3
        ),
    )


def bind_forward_connection(
    call: object,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> BoundForwardConnectionProgram:
    """Bind an authenticated decoded key position to issuer-owned v5 slots."""
    if type(call) is not GeneratedForwardConnectionCall:
        raise GeneratedExecutionError("INVALID")
    try:
        call.estimated_wire_bytes()
    except OverflowError:
        raise GeneratedExecutionError("LIMIT_EXCEEDED") from None
    except (UnicodeError, TypeError, ValueError):
        raise GeneratedExecutionError("INVALID") from None
    if (
        cast(Mapping[str, object], manifest.value["algebra"]).get("profile")
        not in {_PROFILE_V5, _PROFILE_V7, _PROFILE_V8}
    ):
        raise GeneratedExecutionError("UNSUPPORTED")
    try:
        algebra = _validate_algebra(manifest, files, target, native_table)
        if algebra is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        roots = cast(Mapping[str, object], algebra["roots"])
        root_id = _escape_component(call.module) + "/" + _escape_component(call.record)
        root_value = roots.get(root_id)
        if root_value is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        root = cast(Mapping[str, object], root_value)
        support = cast(Mapping[str, object], root["forwardConnectionSupport"])
        if support["status"] != "eligible":
            raise GeneratedExecutionError("UNSUPPORTED")
        connection = cast(Mapping[str, object], root["forwardConnection"])
        fields = cast(Mapping[str, object], root["fields"])
        default_fields = root["defaultSelection"]
        if not isinstance(default_fields, (list, tuple)):
            raise TypeError("forward connection default selection is malformed")
        selected = tuple(default_fields) if call.fields is None else call.fields
        if (
            not 1 <= len(selected) <= 8
            or len(set(selected)) != len(selected)
            or any(identity not in fields for identity in selected)
        ):
            raise GeneratedExecutionError("UNSUPPORTED")

        if call.where is None:
            filter_sql = "TRUE"
            filter_parameters: list[object] = []
        else:
            filter_parameters = []
            filter_sql = _bind_where_v2(
                call.where,
                root=root,
                parameters=filter_parameters,
                counts=[0, 0],
            )
        key = cast(Mapping[str, object], connection["key"])
        if call.after is None:
            after: object = None
        else:
            after = run_issued_codec(
                key["codec"],
                {"string": call.after},
                carrier="string",
                nullable=False,
            )
        fetch_limit = 1 if call.first == 0 else call.first + 1
        select_columns = ", " + ", ".join(
            cast(str, cast(Mapping[str, object], fields[identity])["selectSql"])
            for identity in selected
        )
        forward_descriptor = cast(Mapping[str, object], connection["forward"])
        previous_descriptor = cast(Mapping[str, object], connection["previous"])
        forward_template = cast(str, forward_descriptor["sqlTemplate"])
        previous_template = cast(str, previous_descriptor["sqlTemplate"])
        if (
            forward_template.count("{{SELECT_COLUMNS}}") != 1
            or forward_template.count("{{FILTER}}") != 1
            or previous_template.count("{{FILTER}}") != 1
            or "{{SELECT_COLUMNS}}" in previous_template
        ):
            raise ValueError("forward connection SQL slots differ")
        sql = forward_template.replace("{{SELECT_COLUMNS}}", select_columns, 1).replace(
            "{{FILTER}}", filter_sql, 1
        )
        previous_sql = previous_template.replace("{{FILTER}}", filter_sql, 1)
        if "{{" in sql or "{{" in previous_sql:
            raise ValueError("forward connection has an unfilled SQL slot")
        if (
            max(len(sql.encode("utf-8")), len(previous_sql.encode("utf-8")))
            > _MAX_SQL_BYTES
        ):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        parameters = tuple(filter_parameters) + (after, after, fetch_limit)
        previous_parameters = tuple(filter_parameters) + (after, after)
        output_inventory = {
            cast(str, item["fieldId"]): cast(Mapping[str, object], item["output"])
            for item in cast(
                tuple[Mapping[str, object], ...] | list[Mapping[str, object]],
                connection["fieldOutputs"],
            )
        }
        selected_outputs = tuple(output_inventory[identity] for identity in selected)
        selected_refs = tuple(
            cast(
                Mapping[str, str],
                cast(Mapping[str, object], fields[identity])["sourceField"],
            )
            for identity in selected
        )
        previous_output = cast(Mapping[str, object], previous_descriptor["output"])
        program_value = {
            "version": "umf.generated-forward-connection-bound/1",
            "source": dict(cast(Mapping[str, object], algebra["source"])),
            "target": dict(cast(Mapping[str, object], algebra["target"])),
            "root": root_id,
            "fields": list(selected),
            "where": _where_wire(call.where) if call.where is not None else None,
            "first": call.first,
            "fetchLimit": fetch_limit,
            "after": after,
            "sql": sql,
            "parameters": list(parameters),
            "previousSql": previous_sql,
            "previousParameters": list(previous_parameters),
        }
        return BoundForwardConnectionProgram(
            sql=sql,
            parameters=parameters,
            previous_sql=previous_sql,
            previous_parameters=previous_parameters,
            root={"module": call.module, "record": call.record},
            fields=selected_refs,
            outputs=selected_outputs,
            key_output=cast(Mapping[str, object], forward_descriptor["keyOutput"]),
            previous_output=previous_output,
            first=call.first,
            fetch_limit=fetch_limit,
            source_digest=cast(
                str, cast(Mapping[str, object], algebra["source"])["modelSha256"]
            ),
            target_digest=target.binding_digest,
            native_read_guard=cast(Mapping[str, object], root["nativeReadGuard"]),
            obligations=cast(Mapping[str, object], root["obligations"]),
            program_json=canonical_json(program_value),
        )
    except GeneratedExecutionError:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeError,
        OverflowError,
        RecursionError,
    ):
        raise GeneratedExecutionError("INVALID") from None


def _batch_description_sql(
    ordinal: Mapping[str, object],
    present: Mapping[str, object],
    outputs: tuple[Mapping[str, object], ...],
    native_types: tuple[Mapping[str, object], ...],
) -> str:
    types = {
        "boolean": "bool",
        "text": "text",
        "varchar": "varchar",
        "char": "bpchar",
        "int2": "int2",
        "int4": "int4",
        "int8": "int8",
        "numeric": "numeric",
        "date": "date",
        "timestamptz": "timestamptz",
        "uuid": "uuid",
        "bytea": "bytea",
    }
    columns = [
        'NULL::pg_catalog.int8 AS "' + cast(str, ordinal["name"]) + '"',
        'NULL::pg_catalog.bool AS "' + cast(str, present["name"]) + '"',
    ]
    for output, native_type in zip(outputs, native_types, strict=True):
        native_name = types.get(cast(str, native_type.get("kind")))
        if native_name is None:
            raise ValueError("generated Key batch output native type is unsupported")
        columns.append(
            "NULL::pg_catalog."
            + native_name
            + ' AS "'
            + cast(str, output["name"]).replace('"', '""')
            + '"'
        )
    return "SELECT " + ", ".join(columns) + " WHERE FALSE"


def bind_get_many(
    call: object,
    scope: ExecutionScope,
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
):
    """Bind a bounded ordered primary-Key batch using only issued fragments."""
    from umf_access_generated_executor._values import (
        BoundKeyBatchProgram,
        GeneratedGetManyCall,
    )

    if type(call) is not GeneratedGetManyCall or type(scope) is not ExecutionScope:
        raise GeneratedExecutionError("INVALID")
    if scope.consistency != "request-snapshot/1":
        raise GeneratedExecutionError("UNSUPPORTED")
    if (
        not math.isfinite(scope.deadline_monotonic)
        or type(scope.request_id) is not str
        or not scope.request_id
        or type(scope.lease_id) is not str
        or not scope.lease_id
    ):
        raise GeneratedExecutionError("INVALID")
    if cast(Mapping[str, object], manifest.value["algebra"]).get("profile") not in {
        _PROFILE_V4,
        _PROFILE_V5,
        _PROFILE_V6,
        _PROFILE_V7,
        _PROFILE_V8,
    }:
        raise GeneratedExecutionError("UNSUPPORTED")
    try:
        if (
            len(
                canonical_json(
                    {
                        "module": call.module,
                        "record": call.record,
                        "keyId": call.key_id,
                        "keys": call.keys,
                        "fields": call.fields,
                    }
                )
            )
            > 4 * 1024 * 1024
        ):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        algebra = _validate_algebra(manifest, files, target, native_table)
        if algebra is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        root_id = _escape_component(call.module) + "/" + _escape_component(call.record)
        roots = cast(Mapping[str, object], algebra["roots"])
        root_value = roots.get(root_id)
        if root_value is None:
            raise GeneratedExecutionError("UNSUPPORTED")
        root = cast(Mapping[str, object], root_value)
        descriptor = cast(Mapping[str, object], root["getMany"])
        key_fields = cast(
            tuple[Mapping[str, object], ...] | list[Mapping[str, object], ...],
            descriptor["keyFields"],
        )
        if (
            call.key_id != root["primaryKeyId"]
            or call.key_id != descriptor["keyId"]
            or not 1 <= len(call.keys) <= descriptor["maxKeys"]
            or any(len(key) != len(key_fields) for key in call.keys)
        ):
            raise GeneratedExecutionError("INVALID")
        field_inventory = cast(Mapping[str, object], root["fields"])
        if any(field_id not in field_inventory for field_id in call.fields):
            raise GeneratedExecutionError("UNSUPPORTED")

        normalized_keys: list[tuple[Mapping[str, object], ...]] = []
        parameters: list[object] = []
        key_rows: list[str] = []
        for index, key in enumerate(call.keys):
            normalized_components = _validate_get_many_key_components(
                root, call.key_id, key
            )
            row = [cast(Mapping[str, object], value) for value in key]
            values: list[object] = [index]
            values.extend(normalized_components)
            normalized_keys.append(tuple(row))
            key_rows.append(cast(str, descriptor["keyTupleSql"]))
            parameters.extend(values)

        source_template = cast(str, descriptor["sourceSqlTemplate"])
        key_sql = ",".join(key_rows)
        selected = [
            cast(Mapping[str, object], field_inventory[field_id])
            for field_id in call.fields
        ]
        selection_sql = "".join(
            ", " + cast(str, field["selectSql"]) for field in selected
        )
        source_sql = source_template.replace("{{KEY_ROWS}}", key_sql, 1).replace(
            "{{SELECT_COLUMNS}}", selection_sql, 1
        )
        guard = cast(Mapping[str, object], root["nativeReadGuard"])
        template = cast(str, cast(Mapping[str, object], guard["template"])["sql"])
        return_columns = ", ".join(
            ['f."__weft_ordinal"', 'f."__weft_present"']
            + [cast(str, field["frameSelectSql"]) for field in selected]
        )
        sql = template.replace("{{SOURCE_SQL}}", source_sql, 1).replace(
            "{{RETURN_COLUMNS}}", return_columns, 1
        )
        native_source = getattr(native_table, "native_source", None)
        catalog = (
            native_source.get("expectedCatalog")
            if isinstance(native_source, Mapping)
            else None
        )
        tables = catalog.get("tables") if isinstance(catalog, Mapping) else None
        native_record = (
            next(
                (
                    item
                    for item in cast(tuple[object, ...] | list[object, ...], tables)
                    if isinstance(item, Mapping)
                    and item.get("record")
                    == {"module": call.module, "element": call.record}
                ),
                None,
            )
            if isinstance(tables, (tuple, list))
            else None
        )
        native_by_field: dict[str, Mapping[str, object]] = {}
        if isinstance(native_record, Mapping):
            for column in cast(
                tuple[Mapping[str, object], ...] | list[Mapping[str, object], ...],
                native_record["columns"],
            ):
                native_by_field[
                    _field_key(cast(Mapping[str, object], column["field"]))
                ] = cast(Mapping[str, object], column["nativeType"])
        key_outputs = tuple(
            cast(Mapping[str, object], field_inventory[component["fieldId"]]["output"])
            for component in key_fields
        )
        outputs = tuple(
            cast(Mapping[str, object], field["output"]) for field in selected
        )
        native_types = tuple(native_by_field[field_id] for field_id in call.fields)
        description_sql = _batch_description_sql(
            cast(Mapping[str, object], descriptor["ordinalOutput"]),
            cast(Mapping[str, object], descriptor["presentOutput"]),
            outputs,
            native_types,
        )
        if (
            max(len(sql.encode("utf-8")), len(description_sql.encode("utf-8")))
            > _MAX_SQL_BYTES
        ):
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        program_value = {
            "version": "umf.generated-key-batch-bound/1",
            "source": dict(cast(Mapping[str, object], algebra["source"])),
            "target": dict(cast(Mapping[str, object], algebra["target"])),
            "root": root_id,
            "keyId": call.key_id,
            "inputCount": len(call.keys),
            "keys": [[dict(literal) for literal in key] for key in normalized_keys],
            "fields": list(call.fields),
            "sql": sql,
            "parameters": parameters,
            "descriptionSql": description_sql,
            "outputs": [dict(output) for output in outputs],
            "keyOutputs": [dict(output) for output in key_outputs],
            "ordinalOutput": dict(
                cast(Mapping[str, object], descriptor["ordinalOutput"])
            ),
            "presentOutput": dict(
                cast(Mapping[str, object], descriptor["presentOutput"])
            ),
            "nativeReadGuard": dict(guard),
            "obligations": dict(cast(Mapping[str, object], root["obligations"])),
        }
        return BoundKeyBatchProgram(
            sql=sql,
            parameters=tuple(parameters),
            description_sql=description_sql,
            description_parameters=(),
            keys=tuple(normalized_keys),
            fields=tuple(
                cast(Mapping[str, object], field["sourceField"]) for field in selected
            ),
            outputs=outputs,
            key_outputs=key_outputs,
            ordinal_output=cast(Mapping[str, object], descriptor["ordinalOutput"]),
            present_output=cast(Mapping[str, object], descriptor["presentOutput"]),
            native_read_guard=guard,
            obligations=cast(Mapping[str, object], root["obligations"]),
            source_digest=cast(
                str, cast(Mapping[str, object], algebra["source"])["modelSha256"]
            ),
            target_digest=target.binding_digest,
            root={"module": call.module, "record": call.record},
            key_id=call.key_id,
            input_count=len(call.keys),
            program_json=canonical_json(program_value),
        )
    except GeneratedExecutionError:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeError,
        OverflowError,
        RecursionError,
    ):
        raise GeneratedExecutionError("INVALID") from None


def _validate_get_many_key_components(
    root: Mapping[str, object], key_id: str, components: object
) -> tuple[object, ...]:
    """Run the admitted original-Key codecs without SQL, scope, or a lease."""
    descriptor = cast(Mapping[str, object], root["getMany"])
    key_fields = cast(
        tuple[Mapping[str, object], ...] | list[Mapping[str, object], ...],
        descriptor["keyFields"],
    )
    if (
        key_id != root["primaryKeyId"]
        or key_id != descriptor["keyId"]
        or type(components) is not tuple
        or len(components) != len(key_fields)
    ):
        raise GeneratedExecutionError("INVALID")
    field_inventory = cast(Mapping[str, object], root["fields"])
    normalized: list[object] = []
    for component_value, literal in zip(key_fields, components, strict=True):
        component = cast(Mapping[str, object], component_value)
        field = cast(Mapping[str, object], field_inventory[component["fieldId"]])
        output = cast(Mapping[str, object], field["output"])
        native_value = run_issued_codec(
            component["codec"],
            literal,
            carrier=cast(str, output["carrier"]),
            nullable=False,
        )
        if type(native_value) not in {bool, str, int, float}:
            raise GeneratedExecutionError("INVALID")
        normalized.append(native_value)
    return tuple(normalized)


def validate_get_many_key(
    module: str,
    record: str,
    key_id: str,
    components: tuple[object, ...],
    manifest: GeneratedManifest,
    files: GeneratedFiles,
    target: TargetBinding,
    native_table: object = None,
) -> tuple[object, ...]:
    """Validate exact issued Key codecs for a host Node-key parser.

    This pure helper returns normalized native components and never opens a
    provider lease or creates a SQL program.
    """
    if any(type(value) is not str or not value for value in (module, record, key_id)):
        raise GeneratedExecutionError("INVALID")
    if type(components) is not tuple:
        raise GeneratedExecutionError("INVALID")
    try:
        if len(canonical_json(components)) > 4 * 1024 * 1024:
            raise GeneratedExecutionError("LIMIT_EXCEEDED")
        profile = cast(Mapping[str, object], manifest.value["algebra"]).get("profile")
        algebra = _validate_algebra(manifest, files, target, native_table)
        if algebra is None or profile not in {_PROFILE_V4, _PROFILE_V5, _PROFILE_V6, _PROFILE_V7, _PROFILE_V8}:
            raise GeneratedExecutionError("UNSUPPORTED")
        roots = cast(Mapping[str, object], algebra["roots"])
        root_id = _escape_component(module) + "/" + _escape_component(record)
        root_value = roots.get(root_id)
        if not isinstance(root_value, Mapping):
            raise GeneratedExecutionError("UNSUPPORTED")
        root = cast(Mapping[str, object], root_value)
        if root.get("module") != module or root.get("record") != record:
            raise GeneratedExecutionError("INVALID")
        return _validate_get_many_key_components(root, key_id, components)
    except GeneratedExecutionError:
        raise
    except (
        KeyError,
        TypeError,
        ValueError,
        UnicodeError,
        OverflowError,
        RecursionError,
    ):
        raise GeneratedExecutionError("INVALID") from None
