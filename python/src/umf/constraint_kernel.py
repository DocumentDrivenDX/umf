"""Interpreter for the inert, model-generated UMF constraint program.

The kernel contains generic data operations only. Core decisions, diagnostic
texts and order are supplied by ``spec/metamodel/generated/core-constraints.json``.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .registry import Diagnostic, Registry


class _Missing:
    pass


MISSING = _Missing()


@dataclass
class _CanonicalMap:
    values: dict[str, Any]


def _canonical(value: Any) -> str:
    """Canonical, prototype-independent JSON key used for equality and maps."""

    def normalize(item: Any):
        if item is None or type(item) in (str, bool, int):
            return item
        if type(item) is float:
            if not math.isfinite(item):
                raise ValueError("Non-finite value in constraint program")
            # JavaScript JSON serialization renders integral Numbers without a
            # decimal suffix (for example, 1.0 as "1").
            if item.is_integer():
                return int(item)
            return item
        if type(item) is list:
            return [normalize(child) for child in item]
        if isinstance(item, Mapping):
            if any(type(key) is not str for key in item):
                raise ValueError("Non-text object key in constraint program")
            return {key: normalize(item[key]) for key in sorted(item)}
        raise ValueError("Non-JSON value in constraint program")

    return json.dumps(normalize(value), ensure_ascii=False, separators=(",", ":"))


def _equal(left: Any, right: Any) -> bool:
    if left is MISSING or right is MISSING:
        return left is right
    return _canonical(left) == _canonical(right)


def _js_string(value: Any) -> str:
    if value is MISSING:
        return "undefined"
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (dict, list)):
        return "[object Object]" if isinstance(value, dict) else ",".join(_js_string(item) if item is not None else "" for item in value)
    return str(value)


def _get(value: Any, path: Any) -> Any:
    if not isinstance(path, list):
        raise ValueError("get path must be an array")
    for part in path:
        if isinstance(value, Mapping) and type(part) is str:
            if part not in value:
                return MISSING
            value = value[part]
        elif isinstance(value, Diagnostic) and type(part) is str and part in {"code", "path", "message", "severity"}:
            value = getattr(value, part)
        elif isinstance(value, list) and type(part) is int and 0 <= part < len(value):
            value = value[part]
        else:
            return MISSING
    return value


def _truthy(value: Any) -> bool:
    if value is MISSING or value is None or value is False:
        return False
    if type(value) in (int, float) and value == 0:
        return False
    if isinstance(value, str) and not value:
        return False
    return True


def _eval(expr: Any, env: dict[str, Any], registry: Registry | None, charge=lambda: None):
    charge()
    if isinstance(expr, list):
        return [_eval(item, env, registry, charge) for item in expr]
    if isinstance(expr, Mapping):
        if set(expr) == {"var"}:
            name = expr["var"]
            if name not in env:
                raise ValueError(f"Unbound constraint variable: {name}")
            return env[name]
        if "op" in expr:
            if set(expr) - {"op", "args", "as", "index", "value"}:
                raise ValueError("Unknown constraint expression member")
            op = expr["op"]
            args = expr.get("args", [])
            if not isinstance(args, list):
                raise ValueError("Constraint op args must be an array")
            if op == "and":
                for arg in args:
                    if not _truthy(_eval(arg, env, registry, charge)):
                        return False
                return True
            if op == "or":
                for arg in args:
                    if _truthy(_eval(arg, env, registry, charge)):
                        return True
                return False
            if op in {"filter", "map", "find", "some", "every", "index"}:
                return _collection(expr, env, registry, charge)
            values = [_eval(arg, env, registry, charge) for arg in args]
            return _apply(op, values, registry)
        return {key: _eval(value, env, registry, charge) for key, value in expr.items()}
    return expr


def _collection(expr: Mapping[str, Any], env: dict[str, Any], registry: Registry | None, charge):
    op = expr["op"]
    args = expr.get("args", [])
    if len(args) != 1:
        raise ValueError(f"{op} expects one collection argument")
    source = _eval(args[0], env, registry, charge)
    if source is MISSING or source is None:
        source = []
    if not isinstance(source, (list, tuple)):
        raise ValueError(f"{op} input must be a sequence")
    name = expr.get("as")
    index_name = expr.get("index")
    if type(name) is not str or not name:
        raise ValueError(f"{op} requires a local binding")
    projected = []
    if op in {"find", "some", "every"}:
        for i, item in enumerate(source):
            local = dict(env)
            local[name] = item
            if index_name is not None:
                if type(index_name) is not str or not index_name:
                    raise ValueError(f"{op} index binding must be a name")
                local[index_name] = i
            matches = _truthy(_eval(expr.get("value", {"var": name}), local, registry, charge))
            if op == "find" and matches:
                return item
            if op == "some" and matches:
                return True
            if op == "every" and not matches:
                return False
        return op == "every" if op != "find" else MISSING
    for i, item in enumerate(source):
        local = dict(env)
        local[name] = item
        if index_name is not None:
            if type(index_name) is not str or not index_name:
                raise ValueError(f"{op} index binding must be a name")
            local[index_name] = i
        value = _eval(expr.get("value", {"var": name}), local, registry, charge)
        projected.append((item, value))
    if op == "filter":
        return [item for item, predicate in projected if _truthy(predicate)]
    if op == "map":
        return [value for _, value in projected]
    result: dict[str, Any] = {}
    for item, projected_key in projected:
        token = _canonical(projected_key)
        result[token] = item
    return _CanonicalMap(result)


def _apply(op: str, a: list[Any], registry: Registry | None):
    if op == "get":
        if len(a) != 2:
            raise ValueError("get expects [value,path]")
        return _get(a[0], a[1])
    if op == "has":
        if len(a) != 2 or not isinstance(a[1], list):
            raise ValueError("has expects [value,path]")
        return _get(a[0], a[1]) is not MISSING
    if op == "keys":
        if len(a) != 1 or not isinstance(a[0], Mapping):
            raise ValueError("keys expects an object")
        return list(a[0])
    if op == "values":
        if len(a) != 1 or not isinstance(a[0], Mapping):
            raise ValueError("values expects an object")
        return list(a[0].values())
    if op == "entries":
        if len(a) != 1 or not isinstance(a[0], Mapping):
            raise ValueError("entries expects an object")
        return [[key, value] for key, value in a[0].items()]
    if op == "length":
        if len(a) != 1:
            raise ValueError("length expects one value")
        if isinstance(a[0], _CanonicalMap):
            return len(a[0].values)
        if a[0] is MISSING or a[0] is None:
            return 0
        if isinstance(a[0], (str, list, tuple)):
            return len(a[0])
        return getattr(a[0], "length", 0)
    if op == "without":
        if len(a) != 2 or not isinstance(a[0], Mapping) or not isinstance(a[1], list):
            raise ValueError("without expects [object,keys]")
        return {key: value for key, value in a[0].items() if key not in a[1]}
    if op in ("eq", "ne"):
        if len(a) != 2:
            raise ValueError(f"{op} expects two values")
        equal = _equal(a[0], a[1])
        return equal if op == "eq" else not equal
    if op in ("lt", "lte", "gt", "gte"):
        if len(a) != 2 or type(a[0]) not in (int, float) or type(a[1]) not in (int, float):
            raise ValueError(f"{op} expects numeric operands")
        return {"lt": a[0] < a[1], "lte": a[0] <= a[1], "gt": a[0] > a[1], "gte": a[0] >= a[1]}[op]
    if op == "in":
        if len(a) != 2:
            raise ValueError("in expects [value,collection]")
        if isinstance(a[1], _CanonicalMap):
            return _canonical(a[0]) in a[1].values
        if isinstance(a[1], (list, tuple)):
            return any(_equal(a[0], value) for value in a[1])
        raise ValueError("in collection must be a sequence or canonical Map")
    if op == "not":
        if len(a) != 1:
            raise ValueError("not expects one value")
        return not _truthy(a[0])
    if op in ("and", "or"):
        return all(_truthy(value) for value in a) if op == "and" else any(_truthy(value) for value in a)
    if op == "concat":
        return "".join("" if value is None or value is MISSING else _js_string(value) for value in a)
    if op == "pointer":
        if len(a) != 1:
            raise ValueError("pointer expects one value")
        value = _js_string(a[0])
        return value.replace("~", "~0").replace("/", "~1")
    if op == "tuple":
        return a
    if op == "flatten":
        if len(a) != 1 or not isinstance(a[0], list) or any(not isinstance(item, list) for item in a[0]):
            raise ValueError("flatten expects an array of arrays")
        return [child for group in a[0] for child in group]
    if op == "canonical":
        if len(a) != 1:
            raise ValueError("canonical expects one value")
        return _canonical(a[0])
    if op == "lookup":
        if len(a) != 2 or not isinstance(a[0], _CanonicalMap):
            raise ValueError("lookup expects [index,key]")
        return a[0].values.get(_canonical(a[1]), MISSING)
    if op == "registered":
        if len(a) != 2:
            raise ValueError("registered expects [extensionId,version]")
        return bool(registry and registry.get(a[0], a[1]))
    if op == "sort":
        if len(a) != 1 or not isinstance(a[0], list):
            raise ValueError("sort expects a sequence")
        return sorted(a[0], key=_js_string)
    if op == "set":
        return _CanonicalMap({})
    if op == "literal-errors":
        from .literal_kernel import literal_errors

        return literal_errors(*a)
    if op == "literal-identity":
        from .literal_kernel import literal_identity

        value = literal_identity(*a)
        return MISSING if value is None else value
    if op == "numeric-interval":
        from .literal_kernel import numeric_interval

        return numeric_interval(*a)
    if op == "extension-errors":
        return _extension_errors(a, registry)
    raise ValueError(f"Unknown constraint operation: {op}")


def _extension_errors(args: list[Any], registry: Registry | None):
    if len(args) != 5:
        raise ValueError("extension-errors expects five arguments")
    _document, payloads, scope, base_path, policy = args
    if registry is None:
        registry = Registry()
    result = []
    if not isinstance(payloads, Mapping):
        return []
    # Policy is data supplied by the generated model; the registered callback is
    # the sole executable boundary and receives copied source context.
    def add(key: str, at: str, detail: str | None = None):
        rule = policy[key]
        result.append(Diagnostic(rule["code"], at, detail if detail is not None else rule["message"], rule["severity"]))

    for extension_id, content in payloads.items():
        declaration = _get(_document, ["vocabularies", extension_id])
        at = str(base_path) + "/extensions/" + str(extension_id).replace("~", "~0").replace("/", "~1")
        if declaration is MISSING:
            add("undeclared", at)
            continue
        entry = registry.get(extension_id, declaration.get("version"))
        if entry is None:
            continue
        definition, validator = entry
        if scope not in definition.scopes:
            add("scope", at)
            continue
        errors = list(validator.iter_errors(content))
        for error in errors:
            suffix = "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in error.path)
            add("structure", at + suffix, error.message)
        if not errors and definition.semantics is not None:
            from .json import copy_json

            document = copy_json(_document)
            try:
                returned = definition.semantics(copy_json(content), {"document": document, "scope": scope, "path": at})
                if not isinstance(returned, (list, tuple)) or any(not isinstance(d, Diagnostic) or d.severity not in ("error", "warning") for d in returned):
                    raise ValueError("Extension callback must return Diagnostic objects")
                result.extend(returned)
            except Exception as error:
                add("failure", at, str(error))
        elif not errors:
            add("unchecked", at)
    return result


def _run_steps(steps: list[Any], env: dict[str, Any], registry: Registry | None, out: list[Diagnostic], charge):
    for step in steps:
        charge()
        if not isinstance(step, Mapping):
            raise ValueError("Constraint step must be an object")
        op = step.get("op")
        if op == "let":
            name = step.get("name")
            if type(name) is not str or not name:
                raise ValueError("let requires a name")
            env[name] = _eval(step.get("value"), env, registry, charge)
        elif op == "for":
            values = _eval(step.get("each"), env, registry, charge)
            if values is MISSING or values is None:
                values = []
            if not isinstance(values, (list, tuple)):
                raise ValueError("for each must evaluate to a sequence")
            name = step.get("as")
            index_name = step.get("index")
            if type(name) is not str or not name:
                raise ValueError("for requires a local binding")
            for index, value in enumerate(values):
                local = dict(env)
                local[name] = value
                if index_name is not None:
                    if type(index_name) is not str or not index_name:
                        raise ValueError("for index must be a local name")
                    local[index_name] = index
                _run_steps(step.get("body", []), local, registry, out, charge)
        elif op == "if":
            condition = _eval(step.get("test"), env, registry, charge)
            _run_steps(step.get("then", []) if _truthy(condition) else step.get("else", []), dict(env), registry, out, charge)
        elif op == "emit":
            if "when" in step and not _truthy(_eval(step["when"], env, registry, charge)):
                continue
            diagnostic = _eval(step.get("diagnostic"), env, registry, charge)
            if isinstance(diagnostic, Diagnostic):
                if diagnostic.severity not in ("error", "warning"):
                    raise ValueError("Malformed diagnostic")
                out.append(diagnostic)
                continue
            if not isinstance(diagnostic, Mapping):
                raise ValueError("emit requires a diagnostic object")
            values = {key: diagnostic.get(key) for key in ("code", "path", "message", "severity")}
            if any(type(value) is not str for value in values.values()):
                raise ValueError("Diagnostic fields must evaluate to text")
            out.append(Diagnostic(**values))
        elif op == "remember":
            seen = _eval(step.get("set"), env, registry, charge)
            if not isinstance(seen, _CanonicalMap):
                raise ValueError("remember set must be a generated canonical Map")
            key = _canonical(_eval(step.get("key"), env, registry, charge))
            if key in seen.values:
                if "diagnostic" in step:
                    diagnostic = _eval(step["diagnostic"], env, registry, charge)
                    if isinstance(diagnostic, Diagnostic):
                        if diagnostic.severity not in ("error", "warning"):
                            raise ValueError("Malformed diagnostic")
                        out.append(diagnostic)
                        continue
                    if not isinstance(diagnostic, Mapping):
                        raise ValueError("remember diagnostic must be an object")
                    values = {field: diagnostic.get(field) for field in ("code", "path", "message", "severity")}
                    if any(type(value) is not str for value in values.values()):
                        raise ValueError("Diagnostic fields must evaluate to text")
                    out.append(Diagnostic(**values))
            else:
                seen.values[key] = _eval(step["value"], env, registry, charge) if "value" in step else True
        else:
            raise ValueError(f"Unknown constraint step: {op}")


def _check_program(program: Mapping[str, Any]) -> None:
    operations = {"get", "has", "keys", "values", "entries", "without", "length", "eq", "ne", "lt", "lte", "gt", "gte", "in", "not", "and", "or", "concat", "pointer", "tuple", "flatten", "canonical", "filter", "map", "find", "some", "every", "sort", "index", "lookup", "registered", "set", "literal-errors", "literal-identity", "numeric-interval", "extension-errors"}
    steps = {"let", "for", "if", "emit", "remember"}

    def check_expr(expr: Any):
        if isinstance(expr, list):
            for item in expr:
                check_expr(item)
        elif isinstance(expr, Mapping):
            if "op" in expr and expr["op"] not in operations:
                raise ValueError(f"Unknown constraint operation: {expr['op']}")
            for value in expr.values():
                check_expr(value)

    def check_steps(sequence: Any):
        if not isinstance(sequence, list):
            raise ValueError("Constraint step body must be an array")
        for step in sequence:
            if not isinstance(step, Mapping) or step.get("op") not in steps:
                raise ValueError(f"Unknown constraint step: {step.get('op') if isinstance(step, Mapping) else None}")
            for key, value in step.items():
                if key in {"body", "then", "else"}:
                    check_steps(value)
                elif key != "op":
                    check_expr(value)

    check_steps(program.get("steps"))


def run_core_constraints(document: dict, registry: Registry | None = None, *, program=None, domain_policy=None):
    """Execute model-authored current-core constraints in their declared order."""
    if program is None or domain_policy is None:
        from .generated_resources import generated_resource

        program = generated_resource("constraints") if program is None else program
        domain_policy = generated_resource("domain_policy") if domain_policy is None else domain_policy
    if not isinstance(program, Mapping) or program.get("profile") != "umf.constraints/1":
        raise ValueError("Unsupported UMF constraint program")
    _check_program(program)
    registry = registry or Registry()
    diagnostics: list[Diagnostic] = []
    visits = 0

    def charge():
        nonlocal visits
        visits += 1
        if visits > 5_000_000:
            raise ValueError("Constraint operation limit exceeded")

    _run_steps(program["steps"], {"doc": document, "policy": domain_policy}, registry, diagnostics, charge)
    return tuple(diagnostics)

