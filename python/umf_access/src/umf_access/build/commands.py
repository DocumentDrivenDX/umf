# SPDX-License-Identifier: MIT OR Apache-2.0
"""Captured command -> original Weft native-bulk request, build only."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from types import UnionType
from typing import Any, Union, cast, get_args, get_origin

from ..capture import CapturedDeclaration, CapturedVariant, ProjectionRef
from ..dsl import FieldRef, Node, Ordering, render_logical
from ..manifest_commands import ManifestCompilationError, ManifestProgram
from ..native_program import NativeProgram
from ..reviewed import ReadBuildError, parameter_signature


class CommandBuildError(ValueError):
    pass


def _carrier(annotation: Any) -> tuple[str, bool]:
    args = (
        get_args(annotation)
        if get_origin(annotation) in (Union, UnionType)
        else (annotation,)
    )
    nullable = type(None) in args
    scalar = [v for v in args if v is not type(None)]
    if len(scalar) != 1 or scalar[0] not in (str, bool, int, Decimal):
        raise CommandBuildError("unsupported native bulk parameter carrier")
    return {str: "string", bool: "boolean", int: "integer", Decimal: "decimal"}[
        scalar[0]
    ], nullable


def _literal(node: Node) -> Any:
    if node.op == "null":
        return None
    key = {
        "str": "string",
        "bool": "boolean",
        "int": "integerToken",
        "decimal": "decimalToken",
    }.get(node.op)
    if key is None:
        raise CommandBuildError(
            "native command assignment needs an exact literal or parameter"
        )
    value = node.args[0]
    return {key: str(value) if node.op in ("int", "decimal") else value}


def compile_command(
    compiler: Any,
    declaration: CapturedDeclaration,
    variant: CapturedVariant,
    record: Any,
    target: dict[str, Any],
    action_request: dict[str, Any],
    input_digest: str,
    parameters: dict[str, Any],
) -> NativeProgram:
    filters = cast(tuple[Node, ...], variant.node.args[1])
    if variant.node.op != "update" or any(step.op != "filter" for step in filters):
        raise CommandBuildError("native bulk requires a filtered base-table UPDATE")
    import json

    original = json.loads(action_request["binding"]["modelJson"])
    action = original
    for component in action_request["source"]["actionPointer"].strip("/").split("/"):
        action = (
            action[int(component)] if isinstance(action, list) else action[component]
        )
    effects = action["binding"].get("effects", [])
    if len(effects) != 1 or effects[0]["kind"] != "set":
        raise CommandBuildError(
            "WEFT_BLOCKED: selected command requires one original SET effect"
        )
    assignments = cast(tuple[tuple[FieldRef, Node], ...], variant.node.args[2])
    captured = {
        (field.field_module or field.module, field.field): node
        for field, node in assignments
    }
    expected = {
        (v["field"]["module"], v["field"]["element"]): v["value"]
        for v in effects[0]["values"]
    }
    if set(captured) != set(expected):
        raise CommandBuildError(
            "command assignment inventory differs from original action"
        )
    action_inputs = {}
    for identity, node in captured.items():
        source = expected[identity]
        if "literal" in source:
            if _literal(node) != source["literal"]:
                raise CommandBuildError(
                    "command literal differs from original action recipe"
                )
        elif "parameter" in source:
            if node.op != "param":
                raise CommandBuildError(
                    "action input assignment requires a declared command parameter"
                )
            action_inputs[source["parameter"]] = node.args[0]
        else:
            raise CommandBuildError("unknown action assignment meaning")
    key_fields = tuple(record.objects.ref.key)
    assigned_fields = tuple(field for field, _ in assignments)
    fields = key_fields + tuple(f for f in assigned_fields if f not in key_fields)
    names = tuple(f.logical_name for f in fields)
    if any(name is None for name in names):
        raise CommandBuildError("bulk source Field logical names required")
    steps = filters + (
        Node("order", tuple(Ordering(f, "ASC") for f in key_fields)),
        Node("into", (ProjectionRef("", "", fields, names),)),
    )
    selected = replace(variant, node=Node("all", (variant.node.args[0], steps)))
    sql = render_logical(selected, binding=target["binding"], owner_bound=True)
    used = set()

    def visit(value: Any) -> None:
        if isinstance(value, Node):
            if value.op == "param":
                used.add(value.args[0])
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

    for step in filters:
        visit(step)
    params = []
    for name, (annotation, _) in parameters.items():
        # Selection membership may use the original bounded-list descriptor.
        # Assignment inputs retain the scalar action/Field contract.
        if name in action_inputs.values():
            _carrier(annotation)
        try:
            signature = parameter_signature(annotation)
        except ReadBuildError as error:
            raise CommandBuildError(str(error)) from error
        params.append({"name": name, **signature})
    bound = target.get("maxItems")
    if type(bound) is not int or not 1 <= bound <= 999:
        raise CommandBuildError("explicit native maxItems in 1..999 required")
    request = {
        "version": "weft.native-bulk/0.1",
        "action": action_request,
        "selection": {
            "version": "weft.raw-read/0.1",
            "target": action_request["target"],
            "sql": sql,
            "binding": target["binding"],
            "parameters": [p for p in params if p["name"] in used],
            "rowCap": bound + 1,
        },
        "maxItems": bound,
        "actionInputs": action_inputs,
        "parameters": params,
    }
    return NativeProgram.build(compiler, request, bundle_input_digest=input_digest)


def compile_manifest_command(compiler: Any, variant: CapturedVariant, target: dict[str, Any], reference: Any, configuration: Any, input_digest: str, parameters: dict[str, Any]) -> ManifestProgram:
    """Forward exact captured source to the original portable mutation compiler."""
    from ..manifest_commands import ManifestBuildError

    if type(configuration) is not dict or set(configuration) != {"configuration", "request"}:
        raise CommandBuildError("MANIFEST_ORIGINAL_CONFIGURATION_REQUIRED")
    registry, request = configuration["configuration"], configuration["request"]
    if type(registry) is not str or type(request) is not dict:
        raise CommandBuildError("MANIFEST_ORIGINAL_CONFIGURATION_REQUIRED")
    source = reference.source
    record = variant.node.args[0]
    action = {"identity": {"module": source.module, "action": source.action},
              "documentSha256": source.document_sha256,
              "invocation": {"id": source.invocation_id, "version": source.invocation_version}}
    model = request.get("model")
    if (request.get("action") != action
            or request.get("target") != {"module": record.module, "element": record.element, "key": record.key_id}
            or request.get("sql") != render_logical(variant, binding=target["binding"], owner_bound=True)
            or type(model) is not dict or model.get("utf8") != target["binding"].get("modelJson")
            or model.get("sha256") != source.document_sha256):
        raise CommandBuildError("MANIFEST_CAPTURED_SOURCE_DIFFERS")
    witnesses = request.get("parameters")
    if type(witnesses) is not dict or set(witnesses) != set(parameters):
        raise CommandBuildError("MANIFEST_PARAMETER_INVENTORY_DIFFERS")
    for name, (annotation, _) in parameters.items():
        carrier, nullable = _carrier(annotation)
        tag = {"string": "string", "boolean": "boolean", "integer": "integerToken"}.get(carrier)
        value = witnesses[name]
        if nullable or tag is None or type(value) is not dict or set(value) != {tag}:
            raise CommandBuildError("MANIFEST_PARAMETER_PROFILE_UNSUPPORTED")
    # Only original compiler input data enters this configuration. The original
    # registry closes every action registration and refuses executable backends.
    try:
        program = ManifestProgram.build(compiler, registry, request, bundle_input_digest=input_digest)
        program.bind(reference)
        return program
    except ManifestCompilationError:
        raise
    except (ManifestBuildError, ValueError) as error:
        raise CommandBuildError(str(error)) from error


def emit_command(
    compiler: Any,
    declaration: CapturedDeclaration,
    record: Any,
    targets: list[dict[str, Any]],
    action_requests: dict[Any, Any],
    action_refs: list[Any],
    manifest: dict[str, Any],
    number: int,
    name: str,
    package: str,
    type_name: Any,
) -> tuple[list[str], list[dict[str, Any]]]:
    from pydantic import MISSING

    from ..types import ActionSource, StrictModel
    references=[a for a in action_refs if isinstance(declaration.action,ActionSource) and a.source==declaration.action]
    if len(references)!=1:raise CommandBuildError('command action source was not uniquely selected at stage one')
    reference=references[0]
    symbol=next(s['symbol'] for s in manifest['symbols'] if s['role']=='action-ref' and s['pointer']==reference.source.action_pointer)
    manifest_target = any(t["kind"] == "truss" for t in targets)
    mixed_target = manifest_target and any(t["kind"] != "truss" for t in targets)
    signature=[];arguments=[];names=[];lines=[];entries=[];variants=[]
    if manifest_target:
        lines.append("from umf_access.manifest_commands import ManifestProgram, ManifestCommandVariant, ManifestCommandPlan, MixedManifestCommandPlan, ManifestBulkTarget, AsyncManifestBulkTarget")
        lines.append("from .actions import *")
    for parameter in declaration.parameters:
        names.append(parameter.name)
        signature.append(
            parameter.name
            + ": "
            + type_name(parameter.carrier, package)
            + (" = MISSING" if parameter.optional else "")
        )
        members = (
            get_args(parameter.carrier)
            if get_origin(parameter.carrier) in (Union, UnionType)
            else (parameter.carrier,)
        )
        remaining = [m for m in members if m is not MISSING]
        annotation = remaining[0]
        for member in remaining[1:]:
            annotation = annotation | member
        key = next(
            (m for m in members if isinstance(m, type) and issubclass(m, StrictModel)),
            None,
        )
        arguments.append(
            "Argument("
            + repr(parameter.name)
            + ", "
            + type_name(annotation, package)
            + ", "
            + repr(parameter.optional)
            + ", "
            + (key.__name__ if key else "None")
            + ")"
        )
    for _vi, variant in enumerate(declaration.variants):
        parameters = {}
        paths: list[tuple[str, str, str | None]] = []
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
                key = next(
                    m
                    for m in remaining
                    if isinstance(m, type) and issubclass(m, StrictModel)
                )
                for component in parameter.key_components:
                    flat = parameter.name + "__" + component
                    parameters[flat] = (key.model_fields[component].annotation, ...)
                    paths.append((flat, parameter.name, component))
            else:
                parameters[parameter.name] = (annotation, ...)
                paths.append((parameter.name, parameter.name, None))
        for target in targets:
            is_manifest = target["kind"] == "truss"
            if is_manifest:
                configurations = target.get("manifestCommands", {})
                if type(configurations) is not dict:
                    raise CommandBuildError("MANIFEST_ORIGINAL_CONFIGURATION_REQUIRED")
                program = compile_manifest_command(
                    compiler, variant, target, reference,
                    configurations.get(name + ":" + str(_vi)),
                    manifest["inputDigest"], parameters,
                )
            else:
                request = action_requests[(target["id"], reference.module, reference.action)]
                program = compile_command(
                    compiler, declaration, variant, record, target, request,
                    manifest["inputDigest"], parameters,
                )
            import hashlib
            import json

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
            if is_manifest:
                retained = f"ManifestProgram({program.configuration_json!r}, {program.request_json!r}, {program.response_json!r}, {program.bundle_input_digest!r})"
                variants.append(f"ManifestCommandVariant({variant.presence!r}, TargetPin{pin!r}, {retained}, {symbol}, {tuple(paths)!r})")
                artifact = json.loads(program.response_json)
            else:
                variants.append(
                    f"CommandVariant({variant.presence!r}, TargetPin{pin!r}, NativeProgram({program.original_json!r}, {program.statements_json!r}, {program.bundle_input_digest!r}), {symbol}, {tuple(paths)!r})"
                )
                artifact = json.loads(program.original_json)
            entries.append(
                {
                    "name": name,
                    "kind": "command",
                    "targetId": target["id"],
                    "presence": variant.presence,
                    "pin": pin,
                    "artifact": artifact,
                    "parameters": paths,
                }
            )
    plan = f"_C{number}"
    plan_class = "MixedManifestCommandPlan" if mixed_target else "ManifestCommandPlan" if manifest_target else "CommandPlan"
    sync_target = "ManifestBulkTarget" if manifest_target else "BulkTarget"
    async_target = "AsyncManifestBulkTarget" if manifest_target else "AsyncBulkTarget"
    sync_type = "BulkTarget[_PlanT] | ManifestBulkTarget[_PlanT]" if mixed_target else sync_target + "[_PlanT]"
    async_type = "AsyncBulkTarget[_PlanT] | AsyncManifestBulkTarget[_PlanT]" if mixed_target else async_target + "[_PlanT]"
    implementation_types = "BulkTarget[object] | ManifestBulkTarget[object] | AsyncBulkTarget[object] | AsyncManifestBulkTarget[object]" if mixed_target else sync_target + "[object] | " + async_target + "[object]"
    lines.extend(
        [
            f"{plan} = {plan_class}({name!r}, ("
            + ", ".join(arguments)
            + ("," if arguments else "")
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
    values = "{" + ", ".join(repr(n) + ": " + n for n in names) + "}"
    lines.extend(
        [
            "@overload",
            f"def {name}(target: {async_type}{tail}) -> Awaitable[_PlanT]: ...",
            "@overload",
            f"def {name}(target: {sync_type}{tail}) -> _PlanT: ...",
            f"def {name}(target: {implementation_types}{tail}) -> object:",
            f"    return {plan}.run(target, {values}, timeout=timeout)",
            "",
        ]
    )
    return lines, entries
