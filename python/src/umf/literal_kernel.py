# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generic exact literal mechanics parameterized by generated domain policy."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from .registry import Diagnostic


class LiteralFault(Exception):
    def __init__(self, reason: str, path: str = "", detail: str = ""):
        super().__init__(reason)
        self.reason = reason
        self.path = path
        self.detail = detail


def _fail(reason: str, path: str = "", detail: str = ""):
    raise LiteralFault(reason, path, detail)


def _at(value: Any, path: list[str]):
    for key in path:
        if not isinstance(value, Mapping) or key not in value:
            return None
        value = value[key]
    return value


def _exact_coefficient(token: Any, scale: int, precision: int | None = None) -> int:
    if not isinstance(token, str):
        _fail("numeric-token")
    match = re.fullmatch(r"(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?", token)
    if not match:
        _fail("numeric-token")
    digits = (match.group(2) + (match.group(3) or "")).lstrip("0")
    if not digits:
        return 0
    exponent = match.group(4) or "0"
    if len(exponent.lstrip("+-")) > 32:
        _fail("numeric-exponent")
    shift = int(exponent) - len(match.group(3) or "") + scale
    if shift < 0:
        cut = -shift
        if cut > len(digits):
            _fail("numeric-rounding")
        split = len(digits) - cut
        if any(char != "0" for char in digits[split:]):
            _fail("numeric-rounding")
        digits = digits[:split]
    else:
        bound = min(precision if precision is not None else 4_000_000, 4_000_000)
        if len(digits) + shift > bound:
            _fail("numeric-resource")
        digits += "0" * shift
    if precision is not None and len(digits) > precision:
        _fail("numeric-precision")
    value = int(digits or "0")
    return -value if match.group(1) == "-" else value


def _unicode_count(value: Any) -> int:
    if not isinstance(value, str):
        _fail("text")
    if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        _fail("unicode")
    return len(value)


def _identity(field: Mapping[str, Any], value: Any, policy: Mapping[str, Any]) -> str:
    selectors = policy["fields"]
    if value is None:
        _fail("null-equality")
    scalar = field.get(selectors["family"])
    family = policy["families"].get(scalar)
    if not family or not family.get("equality") or not isinstance(value, Mapping) or len(value) != policy["wrapperKeys"] or family["carrier"] not in value:
        _fail("equality")
    carrier = family["carrier"]
    raw = value[carrier]
    mechanic = family["mechanic"]
    if mechanic == "bits128":
        if not isinstance(raw, str) or not re.fullmatch(r"[0-9a-fA-F]{32}", raw):
            _fail("bits128")
        result = raw.lower()
    elif mechanic == "uuid":
        if not isinstance(raw, str) or not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", raw):
            _fail("uuid")
        result = raw.replace("-", "").lower()
    elif mechanic == "integer":
        result = str(_exact_coefficient(raw, 0))
    elif mechanic == "decimal":
        facets = field.get(selectors["facets"]) or {}
        if type(facets.get(selectors["scale"])) is not int or type(facets.get(selectors["precision"])) is not int:
            _fail("decimal-domain")
        result = str(_exact_coefficient(raw, facets[selectors["scale"]], facets[selectors["precision"]]))
    elif mechanic == "unicode":
        _unicode_count(raw)
        import json

        result = json.dumps(raw, ensure_ascii=False, separators=(",", ":"))
    elif mechanic == "hex":
        if not isinstance(raw, str) or not re.fullmatch(r"(?:[0-9a-fA-F]{2})*", raw):
            _fail("hex")
        result = raw.lower()
    elif mechanic == "boolean":
        if type(raw) is not bool:
            _fail("boolean")
        result = "true" if raw else "false"
    else:
        _fail("mechanic")
    return str(scalar) + ":" + result


def _known(value: Any, keys: list[str], path: str):
    if not isinstance(value, Mapping):
        _fail("object", path)
    for key in value:
        if key not in keys:
            _fail("unknown", path + "/" + str(key).replace("~", "~0").replace("/", "~1"), str(key))


def _refinements(field: Mapping[str, Any], value: Any, enabled: bool,
                 policy: Mapping[str, Any], kind: str, family: Mapping[str, Any] | None,
                 count: int | None = None):
    selectors = policy["fields"]
    facets = field.get(selectors["facets"]) or {}
    for rule in policy["refinements"]:
        if (rule.get("enabled") is False
                or rule["applies"] not in ("all", kind)
                or rule["mode"] == "refinements" and not enabled):
            continue
        constraint = _at(field, rule["selector"])
        if constraint is None:
            continue
        mechanic = rule["mechanic"]
        if mechanic == "count-bounds":
            if rule.get("unit") is not None and constraint.get(rule["unit"]) != (family or {}).get("lengthUnit"):
                _fail(rule.get("unitError", "length-unit"))
            if count is None:
                _fail(rule["domainError"])
            if (constraint.get(rule["min"]) is not None and count < constraint[rule["min"]]
                    or constraint.get(rule["max"]) is not None and count > constraint[rule["max"]]):
                _fail(rule["error"])
        elif mechanic == "integer-width":
            assert family is not None
            number = _exact_coefficient(value[family["carrier"]], 0)
            width = constraint[rule["bits"]]
            signed = constraint[rule["signed"]]
            magnitude = abs(number)
            bits = magnitude.bit_length()
            fits = ((bits < width or bits == width and magnitude & (magnitude - 1) == 0)
                    if signed and number < 0 else (bits < width if signed else number >= 0 and bits <= width))
            if not fits:
                _fail(rule["error"])
        elif mechanic == "coefficient-range":
            assert family is not None
            scale = facets.get(selectors["scale"], 0) if family["mechanic"] == "decimal" else 0
            number = _exact_coefficient(value[family["carrier"]], scale, facets.get(selectors["precision"]))
            for bound, inclusive, lower in ((rule["min"], rule["minInclusive"], True),
                                            (rule["max"], rule["maxInclusive"], False)):
                if bound not in constraint:
                    continue
                if constraint[bound] is None:
                    _fail(rule["nullError"], "/" + "/".join(rule["selector"] + [bound]))
                endpoint = _exact_coefficient(constraint[bound][family["carrier"]], scale,
                                              facets.get(selectors["precision"]))
                if (number < endpoint or number == endpoint and constraint.get(inclusive) is False) if lower else (number > endpoint or number == endpoint and constraint.get(inclusive) is False):
                    _fail(rule["error"])
        elif mechanic == "allowed-membership":
            if not any(_identity(field, candidate, policy) == _identity(field, value, policy)
                       for candidate in constraint):
                _fail(rule["error"])
        else:
            raise ValueError("Unknown refinement mechanic: " + str(mechanic))


def _evaluate(document: Mapping[str, Any], field: Mapping[str, Any], value: Any, refinements: bool, policy: Mapping[str, Any], depth: int = 0):
    selectors = policy["fields"]
    if depth > 128:
        _fail("depth")
    if field.get(selectors["role"]) != policy["fieldKind"]:
        _fail("field-role")
    if any(ref.get(selectors["referenceRole"]) == policy["recordReferenceRole"] for ref in field.get(selectors["references"], [])):
        _fail("record-value")
    item_type = field.get(selectors["item"])
    if item_type is not None:
        _known(item_type, policy["itemReferenceKeys"], "/" + selectors["item"])
    facets = field.get(selectors["facets"]) or {}
    _known(facets, policy["facetKeys"], "/" + selectors["facets"])
    for group, keys in policy["facetGroups"].items():
        if facets.get(group):
            _known(facets[group], keys, "/" + selectors["facets"] + "/" + group)
    if value is None:
        if field.get(selectors["availability"]) != policy["nullability"]:
            _fail("null")
        return
    if not isinstance(value, Mapping) or len(value) != 1:
        _fail("wrapper")
    container = policy["containers"].get(field.get(selectors["cardinality"]))
    if container:
        items = value.get(container["carrier"])
        if container["mechanic"] == "sequence":
            if not isinstance(items, list):
                _fail("container")
        elif not isinstance(items, Mapping):
            _fail("container")
        ref = field.get(selectors["item"])
        if not isinstance(ref, Mapping):
            _fail("item-required")
        lookup = policy["itemLookup"]
        item = next((entry for module in document.get(lookup["modules"], []) if module.get(lookup["moduleId"]) == ref.get(lookup["moduleRef"]) for entry in module.get(lookup["elements"], []) if entry.get(lookup["elementId"]) == ref.get(lookup["elementRef"])), None)
        if item is None:
            _fail("item-missing")
        values = items if container["mechanic"] == "sequence" else list(items.values())
        _refinements(field, value, refinements, policy, "container", None, len(values))
        for child in values:
            _evaluate(document, item, child, refinements, policy, depth + 1)
        return

    cardinality = field.get(selectors["cardinality"])
    if cardinality is not None and cardinality not in policy["singular"]:
        _fail("cardinality")
    family = policy["families"].get(field.get(selectors["family"]))
    if not family or family["carrier"] not in value:
        _fail("family")
    raw = value[family["carrier"]]
    if not family.get("refinements"):
        if refinements:
            _fail("refinements")
        if not isinstance(raw, str):
            _fail("text")
        return
    _identity(field, value, policy)
    count = None
    if family["mechanic"] == "unicode":
        count = _unicode_count(raw)
    elif family["mechanic"] == "hex":
        count = len(raw) / 2
    _refinements(field, value, refinements, policy, "scalar", family, count)


def _diagnostic(error: LiteralFault, policy: Mapping[str, Any]) -> Diagnostic:
    try:
        rule = policy["errors"][error.reason]
    except KeyError as missing:
        raise ValueError(f"Missing literal diagnostic rule: {error.reason}") from missing
    message = rule["message"].replace("{detail}", error.detail)
    return Diagnostic(rule["code"], error.path, message, rule["severity"])


def literal_errors(document: Any, field: Any, value: Any, refinements: bool, policy: Mapping[str, Any]) -> list[Diagnostic]:
    try:
        _evaluate(document, field, value, refinements, policy)
        return []
    except LiteralFault as error:
        return [_diagnostic(error, policy)]


def literal_identity(field: Any, value: Any, policy: Mapping[str, Any]) -> str | None:
    try:
        return _identity(field, value, policy)
    except LiteralFault:
        return None


def numeric_interval(field: Any, numeric_range: Any, policy: Mapping[str, Any]) -> list[Diagnostic]:
    try:
        selectors = policy["fields"]
        interval = policy["interval"]
        family = policy["families"][field[selectors["family"]]]
        facets = field.get(selectors["facets"]) or {}
        scale = facets.get(selectors["scale"], 0) if family["mechanic"] == "decimal" else 0
        base = dict(field)
        base[selectors["facets"]] = {key: value for key, value in facets.items() if key in policy["numericFacetKeys"]}
        for key in interval["omit"]:
            base.pop(key, None)
        for group, keys in interval["qualifierKeys"].items():
            if base[selectors["facets"]].get(group):
                base[selectors["facets"]][group] = {
                    key: value for key, value in base[selectors["facets"]][group].items()
                    if key in keys
                }
        for end in (interval["min"], interval["max"]):
            if end in numeric_range:
                if numeric_range[end] is None:
                    _fail("numeric-null", "/" + end)
                _evaluate({policy["itemLookup"]["modules"]: []}, base, numeric_range[end], True, policy)
        minimum = _exact_coefficient(numeric_range[interval["min"]][family["carrier"]], scale, facets.get(selectors["precision"])) if interval["min"] in numeric_range else None
        maximum = _exact_coefficient(numeric_range[interval["max"]][family["carrier"]], scale, facets.get(selectors["precision"])) if interval["max"] in numeric_range else None

        def extreme(number: int, end: str) -> bool:
            if family["mechanic"] == "decimal":
                if end == "min" and number >= 0 or end == "max" and number <= 0:
                    return False
                digits = str(abs(number))
                return len(digits) == facets["precision"] and set(digits) == {"9"}
            width = _at(field, interval["width"])
            if not width:
                return False
            if end == "min":
                if not width.get("signed"):
                    return number == 0
                magnitude = -number
                return number < 0 and magnitude.bit_length() == width[interval["bits"]] and magnitude & (magnitude - 1) == 0
            if number < 0:
                return False
            bits = number.bit_length()
            target = width[interval["bits"]] - (1 if width.get(interval["signed"]) else 0)
            return bits == target and number & (number + 1) == 0

        if minimum is not None and maximum is not None and minimum + (1 if numeric_range.get(interval["minInclusive"]) is False else 0) > maximum - (1 if numeric_range.get(interval["maxInclusive"]) is False else 0) or minimum is not None and numeric_range.get(interval["minInclusive"]) is False and extreme(minimum, "max") or maximum is not None and numeric_range.get(interval["maxInclusive"]) is False and extreme(maximum, "min"):
            _fail("interval")
        return []
    except LiteralFault as error:
        return [_diagnostic(error, policy)]

