"""Structural validation plus qualified Python semantic checks."""

from .models import Document
from .registry import Diagnostic, Registry, Validation
from .schemas import core_schema

SCALARS = {
    "boolean",
    "integer",
    "decimal",
    "float",
    "string",
    "binary",
    "date",
    "time",
    "timestamp",
}


def pointer(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def validate_document(value, registry: Registry | None = None) -> Validation:
    diagnostics = []

    def add(code, path, message, severity="error"):
        diagnostics.append(Diagnostic(code, path, message, severity))

    try:
        document = (
            value.checked_copy()
            if isinstance(value, Document)
            else Document.model_validate(value)
        )
    except (ValueError, TypeError) as error:
        return Validation(False, False, (Diagnostic("STRUCTURE", "", str(error)),))
    data = document.to_dict()
    schema = core_schema(data["umf"])
    known_document = schema["properties"]
    known_module = schema["$defs"]["module"]["properties"]
    known_element = schema["$defs"]["element"]["properties"]
    registry = registry or Registry()

    def unknown(node, known, path):
        for key in node.keys() - set(known):
            add(
                "UNKNOWN_CORE_FIELD",
                path + "/" + pointer(key),
                "Content retained without interpretation",
                "warning",
            )

    def extensions(node, scope, path):
        for id, payload in node.get("extensions", {}).items():
            at = path + "/extensions/" + pointer(id)
            declaration = data["vocabularies"].get(id)
            if declaration is None:
                add(
                    "UNDECLARED_EXTENSION", at, "Extension version declaration required"
                )
                continue
            entry = registry.get(id, declaration["version"])
            if entry is None:
                continue
            definition, validator = entry
            if scope not in definition.scopes:
                add("EXTENSION_SCOPE", at, "Extension not permitted at this scope")
                continue
            errors = list(validator.iter_errors(payload))
            if errors:
                for error in errors:
                    add(
                        "EXTENSION_STRUCTURE",
                        at + "".join("/" + pointer(p) for p in error.path),
                        error.message,
                    )
            elif definition.semantics is None:
                add(
                    "SEMANTICS_UNCHECKED",
                    at,
                    "Only extension structure checked",
                    "warning",
                )
            else:
                from .json import copy_json

                try:
                    returned = definition.semantics(
                        copy_json(payload),
                        {
                            "document": copy_json(data),
                            "scope": scope,
                            "path": at,
                        },
                    )
                    if not isinstance(returned, (list, tuple)) or any(
                        not isinstance(d, Diagnostic)
                        or d.severity not in ("error", "warning")
                        for d in returned
                    ):
                        raise ValueError(
                            "Semantic callback must return Diagnostic objects"
                        )
                    diagnostics.extend(returned)
                except Exception as error:  # noqa: BLE001 -- consumer callback failures are diagnostics
                    add("VALIDATOR_FAILURE", at, str(error))

    unknown(data, known_document, "")
    for id, declaration in data["vocabularies"].items():
        at = "/vocabularies/" + pointer(id)
        unknown(declaration, ["version"], at)
        if registry.get(id, declaration["version"]) is None:
            add(
                "UNKNOWN_EXTENSION",
                at,
                "Exact extension version unavailable; content retained",
                "warning",
            )
    extensions(data, "document", "")
    modules = {}
    targets = {}
    for mi, module in enumerate(data["modules"]):
        at = f"/modules/{mi}"
        unknown(module, known_module, at)
        if module["id"] in modules:
            add("DUPLICATE_MODULE", at + "/id", "Module id is not unique")
        modules[module["id"]] = module
        extensions(module, "module", at)
        if "relationships" in module and "relationships" in known_module:
            add(
                "SEMANTICS_UNCHECKED",
                at + "/relationships",
                "Python relationship semantic qualification unavailable",
                "warning",
            )
        ids = set()
        for ei, element in enumerate(module["elements"]):
            path = at + f"/elements/{ei}"
            unknown(element, known_element, path)
            if element["id"] in ids:
                add(
                    "DUPLICATE_ELEMENT",
                    path + "/id",
                    "Element id is not unique within module",
                )
            ids.add(element["id"])
            targets[(module["id"], element["id"])] = element
            for key, known in [
                ("scalarType", SCALARS),
                ("kind", {"field", "record", "group"}),
                ("nullability", {"required", "absent-allowed", "unspecified"}),
                ("cardinality", {"one", "array", "map", "unspecified"}),
            ]:
                if (
                    key in known_element
                    and key in element
                    and element[key] not in known
                ):
                    add(
                        "UNKNOWN_" + key.upper(),
                        path + "/" + key,
                        "Meaning retained without interpretation",
                        "warning",
                    )
            for key in (
                "facets",
                "keys",
                "members",
                "examples",
                "allowedValues",
                "default",
            ):
                if key in known_element and key in element:
                    add(
                        "SEMANTICS_UNCHECKED",
                        path + "/" + key,
                        "Python qualification covers structure, identity and references; this semantic surface remains unchecked",
                        "warning",
                    )
            extensions(element, "element", path)
    for mi, module in enumerate(data["modules"]):
        for ei, element in enumerate(module["elements"]):
            path = f"/modules/{mi}/elements/{ei}"
            references = list(enumerate(element.get("references", [])))
            for ri, reference in references:
                at = path + f"/references/{ri}"
                unknown(reference, ["role", "module", "element"], at)
                target = targets.get((reference["module"], reference["element"]))
                if target is None:
                    add(
                        "UNRESOLVED_REFERENCE",
                        at,
                        "Target does not exist in supplied document",
                    )
                if reference["role"] == "record-type" and "kind" in known_element:
                    if target is not None and target.get("kind") != "record":
                        add("RECORD_TYPE", at, "Record-type target must be a Record")
                    if element.get("kind") != "field" or "scalarType" in element:
                        add(
                            "RECORD_TYPE",
                            path,
                            "Record-typed reference requires a non-scalar Field",
                        )
            if "itemType" in known_element and "itemType" in element:
                reference = element["itemType"]
                unknown(reference, ["module", "element"], path + "/itemType")
                target = targets.get((reference["module"], reference["element"]))
                if target is None:
                    add(
                        "UNRESOLVED_REFERENCE",
                        path + "/itemType",
                        "Item type target does not exist",
                    )
    valid = not any(d.severity == "error" for d in diagnostics)
    return Validation(valid, valid and not diagnostics, tuple(diagnostics))
