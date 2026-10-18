"""Search capture -> original Weft owner programs. No execution or embedder calls."""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from typing import Any, cast

from ..capture import CapturedDeclaration, ProjectionRef
from ..dsl import FieldRef, Node, SearchLeg, render_logical
from ..generated_core import CURRENT_CORE_VERSION
from ..native_program import NativeProgram
from ..reviewed import parameter_signature
from ..types import StrictModel
from .unity_search import compile_unity_search


class SearchBuildError(ValueError):
    pass


def emit_search(
    compiler: Any,
    declaration: CapturedDeclaration,
    record: Any,
    targets: list[dict[str, Any]],
    manifest: dict[str, Any],
    number: int,
    name: str,
    result_expr: str,
    projection_fields: tuple[FieldRef, ...],
    projection_names: tuple[str, ...],
    tuple_fields: tuple[str, ...],
    signature: list[str],
    argument_code: list[str],
    argument_names: list[str],
    return_type: str,
    key_models: dict[str, Any],
) -> tuple[list[str], list[dict[str, Any]]]:
    lines = []
    entries = []
    variants = []
    key_fields = tuple(record.objects.ref.key)
    candidates = [
        k
        for k in key_models.values()
        if hasattr(k, "KEY_IDENTITY")
        and (k.KEY_IDENTITY["module"], k.KEY_IDENTITY["element"])
        == (record.objects.ref.module, record.objects.ref.element)
        and tuple((m, f) for m, f, _ in k.UMF_FIELDS)
        == tuple((f.field_module, f.field) for f in key_fields)
    ]
    # Same-component aliases have distinct source Key IDs; use the authored
    # selectedKey from the original source view rather than a first-Key guess.
    for _vi, variant in enumerate(declaration.variants):
        leg = cast(SearchLeg[Any], variant.node.args[2])
        top = cast(int, variant.node.args[3])
        allow_partial = cast(bool, variant.node.args[4])
        legs = leg.legs if leg.kind == "hybrid" else (leg,)
        fusion = leg.fusion
        if fusion is not None and fusion.kind not in ("rrf", "target-defined"):
            raise SearchBuildError(
                "SEARCH_UNSUPPORTED: target-defined fusion requires a separately qualified native program"
            )
        depth = (
            (fusion.depth if fusion.depth is not None else min(1000, top * 2))
            if fusion and fusion.kind == "rrf"
            else top
        )
        params = {}
        paths: list[tuple[str, str, str | None]] = []
        from types import UnionType
        from typing import Union, get_args, get_origin

        from pydantic import MISSING

        for parameter in declaration.parameters:
            if parameter.optional and parameter.name not in variant.presence:
                continue
            members = (
                get_args(parameter.carrier)
                if get_origin(parameter.carrier) in (Union, UnionType)
                else (parameter.carrier,)
            )
            remaining = [m for m in members if m is not MISSING]
            annotation = remaining[0]
            for member in remaining[1:]:
                annotation = annotation | member
            if parameter.key_components:
                param_key = cast(
                    type[StrictModel],
                    next(
                        m
                        for m in remaining
                        if isinstance(m, type) and hasattr(m, "KEY_IDENTITY")
                    ),
                )
                for component in parameter.key_components:
                    flat = parameter.name + "__" + component
                    params[flat] = param_key.model_fields[component].annotation
                    paths.append((flat, parameter.name, component))
            else:
                params[parameter.name] = annotation
                paths.append((parameter.name, parameter.name, None))
        filters = tuple(
            s for s in cast(tuple[Node, ...], variant.node.args[1]) if s.op == "filter"
        )
        if any(
            s.op not in ("filter", "select", "into")
            for s in cast(tuple[Node, ...], variant.node.args[1])
        ):
            raise SearchBuildError(
                "SEARCH_UNSUPPORTED: search is bounded after pre-filters only"
            )
        used: set[str] = set()

        def visit(value: Any, used: set[str] = used) -> None:
            if isinstance(value, Node):
                if value.op == "param":
                    used.add(cast(str, value.args[0]))
                elif value.op == "key_param":
                    used.update(
                        cast(str, value.args[0]) + "__" + c
                        for c in cast(tuple[str, ...], value.args[1])
                    )
                for child in value.args:
                    visit(child)
            elif isinstance(value, tuple):
                for child in value:
                    visit(child)

        for f in filters:
            visit(f)
        projection = ProjectionRef(
            "", "", key_fields, tuple(f.logical_name for f in key_fields)
        )
        selected = replace(
            variant,
            node=Node(
                "all", (variant.node.args[0], filters + (Node("into", (projection,)),))
            ),
        )
        native_parameters: list[dict[str, Any]] = []
        for used_name in used:
            native_parameters.append({"name": used_name, **parameter_signature(params[used_name])})
        native_parameters.sort(key=lambda p: p["name"])
        if any(p.get("container") == "list" or p.get("nullable") is True for p in native_parameters):
            lines.extend([
                "from umf_access.search_catalog import SEARCH_FILTER_PARAMETER_ABI",
                "if SEARCH_FILTER_PARAMETER_ABI != 'umf.search-filter-parameters/0.1':",
                "    raise RuntimeError('SEARCH_FILTER_PARAMETER_ABI_MISMATCH')",
                "",
            ])
        for target in targets:
            if target["kind"] not in ("postgresql", "lakebase", "unity-catalog"):
                raise SearchBuildError(
                    "SEARCH_UNSUPPORTED: target has no qualified search row"
                )
            original = json.loads(target["binding"]["modelJson"])
            views = [
                v
                for module in original["modules"]
                for v in module.get("extensions", {})
                .get("umf.access", {})
                .get("views", [])
                if v["record"]
                == {
                    "module": record.objects.ref.module,
                    "element": record.objects.ref.element,
                }
            ]
            if len(views) != 1:
                raise SearchBuildError("explicit original selectedKey required")
            search_key = next(
                (
                    k
                    for k in candidates
                    if k.KEY_IDENTITY["key"] == views[0]["selectedKey"]["key"]
                ),
                None,
            )
            if search_key is None:
                raise SearchBuildError("selected search Key model absent")
            compiled = []
            if target["kind"] == "unity-catalog":
                program, query_argument, embed, aliases = compile_unity_search(
                    compiler, legs=legs, fusion=fusion, target=target,
                    selection_sql=render_logical(selected, binding=target["binding"], owner_bound=True),
                    native_parameters=native_parameters, fields=projection_fields,
                    names=projection_names, top=top, allow_partial=allow_partial,
                    bundle_digest=manifest["inputDigest"],
                )
                compiled.append(
                    f"SearchEntry(NativeProgram({program.original_json!r}, {program.statements_json!r}, {program.bundle_input_digest!r}), {result_expr}, {search_key.__name__}, {query_argument!r}, {embed!r}, {tuple_fields!r}, {aliases!r})"
                )
                entries.append({"name": name, "kind": "search", "targetId": target["id"], "presence": variant.presence, "leg": 0, "artifact": program.checked(), "fusion": None if fusion is None else {"kind": fusion.kind}})
            elif fusion is not None and fusion.kind != "rrf":
                raise SearchBuildError("SEARCH_UNSUPPORTED: PostgreSQL/Lakebase require explicit qualified runtime fusion")
            for li, item in enumerate(legs if target["kind"] != "unity-catalog" else ()):
                if (
                    item.index_json is None
                    or item.value is None
                    or item.value.op != "param"
                ):
                    raise SearchBuildError(
                        "source-bound search index and parameter required"
                    )
                descriptor = json.loads(item.index_json)
                index = descriptor["declaration"]
                source = descriptor["source"]
                if source["documentSha256"] != target["binding"]["modelSha256"]:
                    raise SearchBuildError("search source/binding differs")
                if (item.kind == "keyword") != (index["kind"] == "keyword"):
                    raise SearchBuildError("search leg/index meaning differs")
                if (
                    item.kind == "text-vector"
                    and index["vector"]["computedBy"] != "host"
                ):
                    raise SearchBuildError(
                        "SEARCH_UNSUPPORTED: target-computed text embedding mechanism unavailable"
                    )
                native = None
                projected = [
                    {"module": f.field_module, "element": f.field}
                    for f in projection_fields
                ]
                matches = [
                    v
                    for v in target.get("vectorBindings", [])
                    if v["field"] == index.get("vector", {}).get("field")
                    or v["field"] in projected
                ]
                if len(matches) > 1 or index["kind"] == "vector" and len(matches) != 1:
                    raise SearchBuildError(
                        "SEARCH_UNSUPPORTED: unique explicit native vector column/version binding required"
                    )
                if matches:
                    native = matches[0]
                request = {
                    "version": "weft.search/0.1",
                    "source": {
                        "documentId": source["documentId"],
                        "coreVersion": CURRENT_CORE_VERSION,
                        "documentSha256": source["documentSha256"],
                        "module": source["module"],
                        "pointer": source["pointer"],
                    },
                    "selection": {
                        "version": "weft.raw-read/0.1",
                        "target": {
                            "postgresql": "postgresql18",
                            "lakebase": "lakebase18",
                        }[target["kind"]],
                        "sql": render_logical(
                            selected, binding=target["binding"], owner_bound=True
                        ),
                        "binding": target["binding"],
                        "parameters": native_parameters,
                        "rowCap": 1000,
                    },
                    "queryParameter": "__umf_search_query",
                    "topK": depth,
                    "projection": [
                        {
                            "field": {"module": f.field_module, "element": f.field},
                            "name": alias,
                        }
                        for f, alias in zip(
                            projection_fields, projection_names, strict=True
                        )
                    ],
                    "vectorBinding": native,
                    "allowPartial": allow_partial,
                }
                program = NativeProgram.build(
                    compiler, request, bundle_input_digest=manifest["inputDigest"]
                )
                artifact = program.checked()
                if artifact["index"] != index:
                    raise SearchBuildError(
                        "captured index metadata differs from original source"
                    )
                compiled.append(
                    f"SearchEntry(NativeProgram({program.original_json!r}, {program.statements_json!r}, {program.bundle_input_digest!r}), {result_expr}, {search_key.__name__}, {item.value.args[0]!r}, {item.kind == 'text-vector'!r}, {tuple_fields!r})"
                )
                entries.append(
                    {
                        "name": name,
                        "kind": "search",
                        "targetId": target["id"],
                        "presence": variant.presence,
                        "leg": li,
                        "artifact": artifact,
                        "fusion": None
                        if fusion is None
                        else {
                            "kind": fusion.kind,
                            "k": fusion.constant,
                            "depth": depth,
                        },
                    }
                )
            digest = hashlib.sha256(
                json.dumps(
                    target["binding"],
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode()
            ).hexdigest()
            pin = (
                target["kind"],
                target["backendId"],
                target["backendVersion"],
                target["targetProfile"],
                digest,
                tuple(
                    (p["name"], tuple(str(v) for v in p["versions"]))
                    for p in target["platform"]
                ),
            )
            fusion_code = (
                "None"
                if fusion is None
                else f"Fusion({fusion.kind!r}, {fusion.constant!r}, {depth!r})"
            )
            variants.append(
                f"SearchVariant({variant.presence!r}, TargetPin{pin!r}, ({', '.join(compiled)},), {tuple(paths)!r}, {top!r}, {fusion_code})"
            )
    plan = f"_S{number}"
    lines.extend(
        [
            f"{plan} = SearchPlan({name!r}, ("
            + ", ".join(argument_code)
            + ("," if argument_code else "")
            + "), ("
            + ", ".join(variants)
            + ",))",
            "",
        ]
    )
    ordered = [s for s in signature if " = MISSING" not in s] + [
        s for s in signature if " = MISSING" in s
    ]
    tail = ", *, " + ", ".join(ordered + ["timeout: timedelta | None = None"])
    for target_type, returned in [
        ("SearchTarget", return_type),
        ("AsyncSearchTarget", "Awaitable[" + return_type + "]"),
    ]:
        lines.extend(
            ["@overload", f"def {name}(target: {target_type}{tail}) -> {returned}: ..."]
        )
    result = return_type + " | Awaitable[" + return_type + "]"
    values = "{" + ", ".join(repr(n) + ": " + n for n in argument_names) + "}"
    lines.extend(
        [
            f"def {name}(target: SearchTarget | AsyncSearchTarget{tail}) -> {result}:",
            f"    return cast({result}, {plan}.run(target, {values}, timeout=timeout))",
            "",
        ]
    )
    return lines, entries
