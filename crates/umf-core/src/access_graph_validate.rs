// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in captured-graph checks for the frozen Python access DTO.
//!
//! This profile owns parameter declaration membership, Key parameter
//! component/identity consistency, and captured RecordRef/FieldRef ownership. It is intentionally separate from Python
//! capture and does not claim full graph parity.

use crate::{PyText, PythonConsumerValue};

pub const PROFILE: &str = "umf-access-captured-graph-validation/0.1.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refusal {
    pub kind: &'static str,
    pub code: &'static str,
    pub rule: &'static str,
}

fn key(name: &str) -> PyText {
    PyText::from_utf8(name)
}

fn get<'a>(value: &'a PythonConsumerValue, name: &str) -> Option<&'a PythonConsumerValue> {
    let PythonConsumerValue::Object(fields) = value else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}

fn tag<'a>(value: &'a PythonConsumerValue, expected: &str) -> Option<&'a PythonConsumerValue> {
    let name = get(value, "$type")?;
    let PythonConsumerValue::String(name) = name else {
        return None;
    };
    if name
        .codepoints()
        .iter()
        .map(|x| char::from_u32(*x))
        .collect::<Option<String>>()
        .as_deref()
        != Some(expected)
    {
        return None;
    }
    get(value, "fields")
}

fn tuple(value: &PythonConsumerValue) -> Option<&[PythonConsumerValue]> {
    match get(value, "$tuple")? {
        PythonConsumerValue::Array(items) => Some(items),
        _ => None,
    }
}

fn text(value: &PythonConsumerValue) -> Option<String> {
    let PythonConsumerValue::String(value) = value else {
        return None;
    };
    value
        .codepoints()
        .iter()
        .map(|x| char::from_u32(*x))
        .collect()
}

fn refuse_dto() -> Refusal {
    Refusal {
        kind: "capture-error",
        code: "CAPTURE_DTO_INVALID",
        rule: "captured variant shape is outside graph validator profile",
    }
}

fn identity_pairs(value: &PythonConsumerValue) -> Result<Vec<(String, String)>, Refusal> {
    let Some(items) = tuple(value) else {
        return Err(refuse_dto());
    };
    let mut pairs = Vec::with_capacity(items.len());
    for item in items {
        let Some(pair) = tuple(item) else {
            return Err(refuse_dto());
        };
        if pair.len() != 2 {
            return Err(refuse_dto());
        }
        let (Some(name), Some(value)) = (text(&pair[0]), text(&pair[1])) else {
            return Err(refuse_dto());
        };
        if pairs.iter().any(|(existing, _)| existing == &name) {
            return Err(refuse_dto());
        }
        pairs.push((name, value));
    }
    Ok(pairs)
}

fn selected_key_identity(value: &PythonConsumerValue) -> Result<Vec<(String, String)>, Refusal> {
    let Some(fields) = tag(value, "umf_access.dsl._nodes.Node") else {
        return Err(refuse_dto());
    };
    let Some(op) = get(fields, "op").and_then(text) else {
        return Err(refuse_dto());
    };
    let Some(args) = get(fields, "args").and_then(tuple) else {
        return Err(refuse_dto());
    };
    match op.as_str() {
        "key_param" => {
            if args.len() != 3 {
                return Err(refuse_dto());
            }
            identity_pairs(&args[2])
        }
        "key" => {
            if args.len() != 1 {
                return Err(refuse_dto());
            }
            let literal = &args[0];
            let key_fields =
                tag(literal, "umf_access.dsl._nodes.KeyLiteral").ok_or_else(refuse_dto)?;
            identity_pairs(get(key_fields, "identity").ok_or_else(refuse_dto)?)
        }
        // Python's selected-Key preflight uses an empty identity for other
        // well-formed Node operands; the subsequent graph walk owns their rule.
        _ => Ok(Vec::new()),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Owner {
    module: String,
    element: String,
    alias: Option<String>,
}

fn owner(value: &PythonConsumerValue, expected: &str) -> Option<Owner> {
    let fields = tag(value, expected)?;
    let module = get(fields, "module").and_then(text)?;
    let element = get(fields, "element").and_then(text)?;
    let alias = match get(fields, "alias")? {
        PythonConsumerValue::Null => None,
        value => Some(text(value)?),
    };
    Some(Owner {
        module,
        element,
        alias,
    })
}

/// Validate the demonstrable v3 subset: every `param` or `key_param` node
/// encountered in tagged DTO traversal must name a declared captured parameter;
/// Key parameter component and identity tuples must match that declaration.
pub fn validate_captured_variant(input: &PythonConsumerValue) -> Result<(), Refusal> {
    let Some(fields) = tag(input, "umf_access.capture.CapturedVariant") else {
        return Err(refuse_dto());
    };
    let Some(params) = get(fields, "parameters").and_then(tuple) else {
        return Err(refuse_dto());
    };
    struct Parameter<'a> {
        name: String,
        key_components: &'a PythonConsumerValue,
        key_identity: &'a PythonConsumerValue,
    }
    let mut declared = Vec::new();
    for param in params {
        let Some(pfields) = tag(param, "umf_access.capture.CapturedParameter") else {
            return Err(refuse_dto());
        };
        let Some(name) = get(pfields, "name").and_then(text) else {
            return Err(refuse_dto());
        };
        let Some(components) =
            get(pfields, "key_components").filter(|value| tuple(value).is_some())
        else {
            return Err(refuse_dto());
        };
        let Some(identity) = get(pfields, "key_identity").filter(|value| tuple(value).is_some())
        else {
            return Err(refuse_dto());
        };
        declared.push(Parameter {
            name,
            key_components: components,
            key_identity: identity,
        });
    }
    let Some(node) = get(fields, "node") else {
        return Err(refuse_dto());
    };
    // Python computes the complete join-owner set before visiting expression
    // nodes. Keep that checkpoint so an absent join source wins over a later
    // expression refusal.
    let mut owners = Vec::new();
    let Some(node_fields) = tag(node, "umf_access.dsl._nodes.Node") else {
        return Err(refuse_dto());
    };
    let Some(args) = get(node_fields, "args").and_then(tuple) else {
        return Err(refuse_dto());
    };
    let Some(terminal_op) = get(node_fields, "op").and_then(text) else {
        return Err(refuse_dto());
    };
    // Keep this profile bounded to terminals whose capture shape and selected
    // Key preflight are represented here. Python's public capture remains the
    // authority for all other terminal checks.
    if !matches!(terminal_op.as_str(), "all" | "get" | "page")
        || args.len() < 2
        || tag(&args[0], "umf_access.dsl._nodes.RecordRef").is_none()
    {
        return Err(refuse_dto());
    }
    if (terminal_op == "all" && args.len() != 2)
        || (terminal_op == "get" && args.len() != 3)
        || (terminal_op == "page" && args.len() != 4)
    {
        return Err(refuse_dto());
    }
    let Some(root) = owner(&args[0], "umf_access.dsl._nodes.RecordRef") else {
        return Err(refuse_dto());
    };
    let Some(steps) = tuple(&args[1]) else {
        return Err(refuse_dto());
    };
    let mut selections = Vec::new();
    let mut has_group = false;
    let mut has_into = false;
    for step in steps {
        let Some(step_fields) = tag(step, "umf_access.dsl._nodes.Node") else {
            return Err(refuse_dto());
        };
        let Some(step_op) = get(step_fields, "op").and_then(text) else {
            return Err(refuse_dto());
        };
        let Some(step_args) = get(step_fields, "args").and_then(tuple) else {
            return Err(refuse_dto());
        };
        if step_op == "group" {
            has_group = true;
        }
        if step_op == "into" {
            has_into = true;
        }
        if step_op == "select" {
            selections.extend(step_args.iter());
        }
    }
    if has_group && selections.is_empty() && !has_into && terminal_op != "group_count" {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "grouped query requires explicit selection or count",
        });
    }
    let scalar_selection = selections
        .iter()
        .any(|value| tag(value, "umf_access.dsl._nodes.Node").is_some());
    if scalar_selection && !matches!(terminal_op.as_str(), "all" | "first" | "one") {
        return Err(Refusal {
            kind: "capture-error",
            code: "CAPTURE_UNSUPPORTED",
            rule: "scalar aggregate/bucket projection does not admit this terminal",
        });
    }
    owners.push(root);
    for step in steps {
        let Some(step_fields) = tag(step, "umf_access.dsl._nodes.Node") else {
            return Err(refuse_dto());
        };
        let Some(op) = get(step_fields, "op").and_then(text) else {
            return Err(refuse_dto());
        };
        let Some(step_args) = get(step_fields, "args").and_then(tuple) else {
            return Err(refuse_dto());
        };
        if op == "join" {
            let Some(join_value) = step_args.first() else {
                return Err(refuse_dto());
            };
            let Some(join_fields) = tag(join_value, "umf_access.dsl._expressions.Join") else {
                return Err(refuse_dto());
            };
            let Some(ref_value) = get(join_fields, "ref") else {
                return Err(refuse_dto());
            };
            let Some(source) = owner(ref_value, "umf_access.dsl._nodes.FieldRef") else {
                return Err(refuse_dto());
            };
            if !owners.contains(&source) {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_UNSUPPORTED",
                    rule: "join source is absent",
                });
            }
            let Some(target_value) = get(join_fields, "target") else {
                return Err(refuse_dto());
            };
            let Some(target) = owner(target_value, "umf_access.dsl._nodes.RecordRef") else {
                return Err(refuse_dto());
            };
            owners.push(target);
        }
    }
    // Python validates selected Key ownership after the complete join-owner
    // preflight and before walking expressions. Keep that exact precedence.
    if terminal_op == "get" || terminal_op == "page" {
        let key_value = if terminal_op == "get" {
            &args[2]
        } else {
            &args[3]
        };
        let identity = selected_key_identity(key_value)?;
        let root_fields =
            tag(&args[0], "umf_access.dsl._nodes.RecordRef").ok_or_else(refuse_dto)?;
        let root_module =
            text(get(root_fields, "module").ok_or_else(refuse_dto)?).ok_or_else(refuse_dto)?;
        let root_element =
            text(get(root_fields, "element").ok_or_else(refuse_dto)?).ok_or_else(refuse_dto)?;
        if !identity.is_empty() {
            let module = identity
                .iter()
                .find(|(name, _)| name == "module")
                .map(|(_, value)| value.as_str())
                .ok_or_else(refuse_dto)?;
            let element = identity
                .iter()
                .find(|(name, _)| name == "element")
                .map(|(_, value)| value.as_str())
                .ok_or_else(refuse_dto)?;
            if (module, element) != (root_module.as_str(), root_element.as_str()) {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key belongs to another Record",
                });
            }
        }
        let key_id_value = get(root_fields, "key_id").ok_or_else(refuse_dto)?;
        let key_id = match key_id_value {
            PythonConsumerValue::Null => None,
            value => Some(text(value).ok_or_else(refuse_dto)?),
        };
        let source_value = get(root_fields, "source").ok_or_else(refuse_dto)?;
        let source = if matches!(source_value, PythonConsumerValue::Null) {
            None
        } else {
            Some(source_value)
        };
        if let (Some(key_id), Some(source)) = (key_id, source) {
            let source_fields =
                tag(source, "umf_access.dsl._nodes.GeneratedSource").ok_or_else(refuse_dto)?;
            let document_id = get(source_fields, "document_id")
                .and_then(text)
                .ok_or_else(refuse_dto)?;
            let core_version = get(source_fields, "core_version")
                .and_then(text)
                .ok_or_else(refuse_dto)?;
            let expected = [
                ("documentId", document_id),
                ("coreVersion", core_version),
                ("module", root_module),
                ("element", root_element),
                ("key", key_id),
            ];
            if identity.len() != expected.len()
                || expected.iter().any(|(name, value)| {
                    identity
                        .iter()
                        .find(|(actual, _)| actual.as_str() == *name)
                        .map(|(_, actual)| actual.as_str())
                        != Some(value.as_str())
                })
            {
                return Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key",
                });
            }
        }
    }
    fn visit(
        value: &PythonConsumerValue,
        declared: &[Parameter<'_>],
        owners: &[Owner],
    ) -> Result<(), Refusal> {
        if let Some(fields) = tag(value, "umf_access.dsl._nodes.Node") {
            let Some(op) = get(fields, "op").and_then(text) else {
                return Err(refuse_dto());
            };
            let Some(args) = get(fields, "args").and_then(tuple) else {
                return Err(refuse_dto());
            };
            if op == "param" || op == "key_param" {
                let Some(name) = args.first().and_then(text) else {
                    return Err(refuse_dto());
                };
                let Some(parameter) = declared.iter().find(|parameter| parameter.name == name)
                else {
                    return Err(Refusal {
                        kind: "capture-error",
                        code: "CAPTURE_SIGNATURE",
                        rule: "expression references an undeclared parameter",
                    });
                };
                if op == "key_param" {
                    let Some(components) = args.get(1) else {
                        return Err(refuse_dto());
                    };
                    let Some(identity) = args.get(2) else {
                        return Err(refuse_dto());
                    };
                    if components != parameter.key_components || identity != parameter.key_identity
                    {
                        return Err(Refusal {
                            kind: "capture-error",
                            code: "CAPTURE_SIGNATURE",
                            rule: "Key component parameters differ from declared carrier",
                        });
                    }
                }
            }
            for child in args {
                visit(child, declared, owners)?;
            }
        } else if tag(value, "umf_access.dsl._nodes.FieldRef").is_some() {
            let Some(found) = owner(value, "umf_access.dsl._nodes.FieldRef") else {
                return Err(refuse_dto());
            };
            if !owners.is_empty() && !owners.contains(&found) {
                return Err(Refusal {
                    kind: "type-error",
                    code: "",
                    rule: "expression column belongs to another Record",
                });
            }
        } else if let Some(fields) = tag(value, "umf_access.dsl._expressions.Join") {
            let Some(reference) = get(fields, "ref") else {
                return Err(refuse_dto());
            };
            visit(reference, declared, owners)?;
        } else if let Some(fields) = match value {
            PythonConsumerValue::Object(fields)
                if fields.iter().any(|(name, _)| name == &key("$type")) =>
            {
                let tag_name = get(value, "$type").and_then(text).ok_or_else(refuse_dto)?;
                if get(value, "fields").is_none() {
                    return Err(refuse_dto());
                }
                if !matches!(
                    tag_name.as_str(),
                    "umf_access.capture.CapturedVariant"
                        | "umf_access.capture.CapturedParameter"
                        | "umf_access.dsl._nodes.FieldRef"
                        | "umf_access.dsl._nodes.GeneratedSource"
                        | "umf_access.dsl._nodes.KeyLiteral"
                        | "umf_access.dsl._nodes.RecordRef"
                ) {
                    return Err(refuse_dto());
                }
                if tag_name == "umf_access.dsl._nodes.RecordRef"
                    && owner(value, "umf_access.dsl._nodes.RecordRef").is_none()
                {
                    return Err(refuse_dto());
                }
                if tag_name == "umf_access.dsl._nodes.FieldRef"
                    && owner(value, "umf_access.dsl._nodes.FieldRef").is_none()
                {
                    return Err(refuse_dto());
                }
                Some(tag_name)
            }
            _ => None,
        } {
            // These DTO values are leaves in Python's graph walker. In
            // particular, RecordRef.key contains FieldRefs but is not walked.
            let _ = fields;
        } else if let Some(items) = tuple(value) {
            for child in items {
                visit(child, declared, owners)?;
            }
        } else if let PythonConsumerValue::Array(items) = value {
            for child in items {
                visit(child, declared, owners)?;
            }
        }
        Ok(())
    }
    visit(node, &declared, &owners)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn obj(fields: &[(&str, PythonConsumerValue)]) -> PythonConsumerValue {
        PythonConsumerValue::Object(fields.iter().map(|(k, v)| (key(k), v.clone())).collect())
    }
    fn text_value(value: &str) -> PythonConsumerValue {
        PythonConsumerValue::String(PyText::from_utf8(value))
    }
    fn tagged(name: &str, fields: PythonConsumerValue) -> PythonConsumerValue {
        obj(&[("$type", text_value(name)), ("fields", fields)])
    }
    fn tuple_value(values: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        obj(&[("$tuple", PythonConsumerValue::Array(values))])
    }
    fn graph(parameter_name: &str, declared: &str) -> PythonConsumerValue {
        let node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("param")),
                ("args", tuple_value(vec![text_value(parameter_name)])),
            ]),
        );
        owner_graph(vec![owner_filter(node)], vec![parameter(declared)])
    }
    fn key_param_graph(
        parameter_name: &str,
        declared: &str,
        parameter_components: PythonConsumerValue,
        parameter_identity: PythonConsumerValue,
        node_components: PythonConsumerValue,
        node_identity: PythonConsumerValue,
    ) -> PythonConsumerValue {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value(declared)),
                ("key_components", parameter_components),
                ("key_identity", parameter_identity),
            ]),
        );
        let node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("key_param")),
                (
                    "args",
                    tuple_value(vec![
                        text_value(parameter_name),
                        node_components,
                        node_identity,
                    ]),
                ),
            ]),
        );
        owner_graph(vec![owner_filter(node)], vec![parameter])
    }
    fn key_tuple(values: &[&str]) -> PythonConsumerValue {
        tuple_value(values.iter().map(|value| text_value(value)).collect())
    }
    fn key_identity(values: &[(&str, &str)]) -> PythonConsumerValue {
        tuple_value(
            values
                .iter()
                .map(|(key, value)| key_tuple(&[key, value]))
                .collect(),
        )
    }

    fn record(module: &str, element: &str, alias: Option<&str>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                (
                    "alias",
                    alias.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("key_id", PythonConsumerValue::Null),
                ("source", PythonConsumerValue::Null),
            ]),
        )
    }
    fn record_with_key(
        module: &str,
        element: &str,
        key_id: Option<&str>,
        source: Option<(&str, &str)>,
    ) -> PythonConsumerValue {
        let source = source
            .map(|(document_id, core_version)| {
                tagged(
                    "umf_access.dsl._nodes.GeneratedSource",
                    obj(&[
                        ("document_id", text_value(document_id)),
                        ("core_version", text_value(core_version)),
                        ("document_sha256", text_value(&"0".repeat(64))),
                        ("input_digest", text_value(&"1".repeat(64))),
                        ("runtime_abi", text_value("umf-access-runtime/0.1")),
                    ]),
                )
            })
            .unwrap_or(PythonConsumerValue::Null);
        tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                ("alias", PythonConsumerValue::Null),
                ("key", tuple_value(vec![field(module, element, None)])),
                (
                    "key_id",
                    key_id.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("source", source),
            ]),
        )
    }
    fn field(module: &str, element: &str, alias: Option<&str>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.FieldRef",
            obj(&[
                ("module", text_value(module)),
                ("element", text_value(element)),
                (
                    "alias",
                    alias.map(text_value).unwrap_or(PythonConsumerValue::Null),
                ),
                ("field_module", text_value("ignored.field.module")),
            ]),
        )
    }
    fn node(op: &str, args: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[("op", text_value(op)), ("args", tuple_value(args))]),
        )
    }
    fn owner_graph(
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let root = record("commerce", "Order", None);
        let terminal = node("all", vec![root, tuple_value(steps)]);
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }
    fn parameter(name: &str) -> PythonConsumerValue {
        tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value(name)),
                ("key_components", tuple_value(vec![])),
                ("key_identity", tuple_value(vec![])),
            ]),
        )
    }
    fn owner_filter(expression: PythonConsumerValue) -> PythonConsumerValue {
        node("filter", vec![expression])
    }
    fn join(source: PythonConsumerValue, target: PythonConsumerValue) -> PythonConsumerValue {
        let relation = tagged(
            "umf_access.dsl._expressions.Join",
            obj(&[("ref", source), ("target", target)]),
        );
        node("join", vec![relation])
    }

    #[test]
    fn accepts_declared_parameter_reference() {
        assert_eq!(validate_captured_variant(&graph("value", "value")), Ok(()));
    }

    #[test]
    fn refuses_undeclared_parameter_with_predecessor_rule() {
        assert_eq!(
            validate_captured_variant(&graph("missing", "value")),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn refuses_unrecognized_concrete_tag_instead_of_erasing_its_kind() {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("value")),
                ("key_components", tuple_value(vec![])),
                ("key_identity", tuple_value(vec![])),
            ]),
        );
        let derived = tagged("example.DerivedNode", obj(&[]));
        let variant = owner_graph(vec![owner_filter(derived)], vec![parameter]);
        assert_eq!(validate_captured_variant(&variant), Err(refuse_dto()));
    }

    #[test]
    fn accepts_matching_key_param_component_and_identity_tuples() {
        let components = key_tuple(&["id"]);
        let identity = key_identity(&[
            ("coreVersion", "0.10.0"),
            ("documentId", "validator-test"),
            ("element", "Order"),
            ("key", "Order_key"),
            ("module", "commerce"),
        ]);
        let graph = key_param_graph(
            "key",
            "key",
            components.clone(),
            identity.clone(),
            components,
            identity,
        );
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn refuses_key_param_component_tuple_mismatch() {
        let identity = key_identity(&[("module", "commerce"), ("element", "Order")]);
        let graph = key_param_graph(
            "key",
            "key",
            key_tuple(&["id"]),
            identity.clone(),
            key_tuple(&["wrong"]),
            identity,
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key component parameters differ from declared carrier"
            })
        );
    }

    #[test]
    fn refuses_key_param_identity_tuple_mismatch() {
        let graph = key_param_graph(
            "key",
            "key",
            key_tuple(&["id"]),
            key_identity(&[
                ("module", "commerce"),
                ("element", "Order"),
                ("key", "Order_key"),
            ]),
            key_tuple(&["id"]),
            key_identity(&[
                ("module", "commerce"),
                ("element", "Order"),
                ("key", "Other_key"),
            ]),
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key component parameters differ from declared carrier"
            })
        );
    }

    #[test]
    fn undeclared_key_param_refusal_precedes_metadata_mismatch() {
        let graph = key_param_graph(
            "missing",
            "key",
            key_tuple(&["id"]),
            key_identity(&[("module", "commerce")]),
            key_tuple(&["wrong"]),
            key_identity(&[("module", "elsewhere")]),
        );
        assert_eq!(
            validate_captured_variant(&graph),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn ordinary_param_does_not_inherit_key_carrier_checks() {
        let parameter = tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("value")),
                ("carrier", obj(&[("$typeRef", text_value("builtins.str"))])),
                ("key_components", key_tuple(&["id"])),
                ("key_identity", key_identity(&[("module", "commerce")])),
            ]),
        );
        let param_node = tagged(
            "umf_access.dsl._nodes.Node",
            obj(&[
                ("op", text_value("param")),
                ("args", tuple_value(vec![text_value("value")])),
            ]),
        );
        let graph = owner_graph(vec![owner_filter(param_node)], vec![parameter]);
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn accepts_root_owned_field_and_ignores_field_module() {
        assert_eq!(
            validate_captured_variant(&owner_graph(
                vec![owner_filter(field("commerce", "Order", None))],
                vec![]
            )),
            Ok(())
        );
    }

    #[test]
    fn accepts_field_owned_by_join_target() {
        let target = record("crm", "Customer", None);
        let steps = vec![
            join(field("commerce", "Order", None), target),
            owner_filter(field("crm", "Customer", None)),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Ok(())
        );
    }

    #[test]
    fn foreign_field_refuses_with_native_type_error_envelope() {
        assert_eq!(
            validate_captured_variant(&owner_graph(
                vec![owner_filter(field("crm", "Customer", None))],
                vec![]
            )),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
    }

    #[test]
    fn owner_type_error_and_undeclared_parameter_follow_expression_order() {
        let undeclared = node("param", vec![text_value("missing")]);
        let foreign = field("crm", "Customer", None);
        let owner_first = owner_graph(
            vec![owner_filter(tuple_value(vec![
                foreign.clone(),
                undeclared.clone(),
            ]))],
            vec![],
        );
        let parameter_first = owner_graph(
            vec![owner_filter(tuple_value(vec![undeclared, foreign]))],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&owner_first),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
        assert_eq!(
            validate_captured_variant(&parameter_first),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }

    #[test]
    fn join_source_error_precedes_expression_visit_and_alias_is_part_of_owner() {
        let steps = vec![
            join(
                field("commerce", "Order", Some("wrong")),
                record("crm", "Customer", None),
            ),
            owner_filter(field("crm", "Customer", None)),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent"
            })
        );
        let alias_mismatch = owner_graph(
            vec![owner_filter(field("commerce", "Order", Some("orders")))],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&alias_mismatch),
            Err(Refusal {
                kind: "type-error",
                code: "",
                rule: "expression column belongs to another Record"
            })
        );
    }

    #[test]
    fn joined_owner_alias_is_matched_exactly() {
        let target = record("crm", "Customer", Some("buyer"));
        let steps = vec![
            join(field("commerce", "Order", None), target),
            owner_filter(field("crm", "Customer", Some("buyer"))),
        ];
        assert_eq!(
            validate_captured_variant(&owner_graph(steps, vec![])),
            Ok(())
        );
    }

    #[test]
    fn malformed_known_owner_tags_are_refused_as_dto_invalid() {
        let malformed_field = tagged(
            "umf_access.dsl._nodes.FieldRef",
            obj(&[("module", text_value("commerce"))]),
        );
        assert_eq!(
            validate_captured_variant(&owner_graph(vec![owner_filter(malformed_field)], vec![])),
            Err(refuse_dto())
        );

        let malformed_root = tagged(
            "umf_access.dsl._nodes.RecordRef",
            obj(&[
                ("module", text_value("commerce")),
                ("element", text_value("Order")),
            ]),
        );
        let terminal = node("all", vec![malformed_root, tuple_value(vec![])]);
        let variant = tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(vec![]))]),
        );
        assert_eq!(validate_captured_variant(&variant), Err(refuse_dto()));
    }

    fn selected_identity(values: &[(&str, &str)]) -> PythonConsumerValue {
        key_identity(values)
    }

    fn selected_param(identity: PythonConsumerValue) -> PythonConsumerValue {
        node(
            "key_param",
            vec![text_value("key"), key_tuple(&["id"]), identity],
        )
    }

    fn selected_parameter(identity: PythonConsumerValue) -> PythonConsumerValue {
        tagged(
            "umf_access.capture.CapturedParameter",
            obj(&[
                ("name", text_value("key")),
                ("key_components", key_tuple(&["id"])),
                ("key_identity", identity),
            ]),
        )
    }

    fn selected_literal(identity: PythonConsumerValue) -> PythonConsumerValue {
        let literal = tagged(
            "umf_access.dsl._nodes.KeyLiteral",
            obj(&[
                ("identity", identity),
                ("values", tuple_value(vec![])),
                ("source", PythonConsumerValue::Null),
            ]),
        );
        node("key", vec![literal])
    }

    fn selected_graph(
        op: &str,
        root: PythonConsumerValue,
        key_value: PythonConsumerValue,
        steps: Vec<PythonConsumerValue>,
        parameters: Vec<PythonConsumerValue>,
    ) -> PythonConsumerValue {
        let mut args = vec![root, tuple_value(steps)];
        if op == "get" {
            args.push(key_value);
        } else {
            args.push(PythonConsumerValue::Integer(num_bigint::BigInt::from(10)));
            args.push(key_value);
        }
        let terminal = node(op, args);
        tagged(
            "umf_access.capture.CapturedVariant",
            obj(&[("node", terminal), ("parameters", tuple_value(parameters))]),
        )
    }

    fn complete_identity(module: &str, element: &str, key: &str) -> PythonConsumerValue {
        selected_identity(&[
            ("documentId", "doc"),
            ("coreVersion", "0.10.0"),
            ("module", module),
            ("element", element),
            ("key", key),
        ])
    }

    #[test]
    fn get_and_page_accept_selected_key_parameter_and_literal_identities() {
        for op in ["get", "page"] {
            let identity = complete_identity("commerce", "Order", "Order_key");
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            for key_value in [
                selected_param(identity.clone()),
                selected_literal(identity.clone()),
            ] {
                let params = if matches!(
                    tag(&key_value, "umf_access.dsl._nodes.Node")
                        .and_then(|fields| get(fields, "op"))
                        .and_then(text)
                        .as_deref(),
                    Some("key_param")
                ) {
                    vec![selected_parameter(identity.clone())]
                } else {
                    vec![]
                };
                let graph = selected_graph(op, root.clone(), key_value, vec![], params);
                assert_eq!(validate_captured_variant(&graph), Ok(()), "{op}");
            }
        }
    }

    #[test]
    fn selected_key_refusals_match_python_messages_for_get_and_page() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let foreign = selected_graph(
                op,
                root.clone(),
                selected_literal(complete_identity("other", "Order", "Order_key")),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&foreign),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key belongs to another Record"
                })
            );
            let wrong_key = selected_graph(
                op,
                root.clone(),
                selected_literal(complete_identity("commerce", "Order", "Other_key")),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&wrong_key),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
            let incomplete = selected_graph(
                op,
                root,
                selected_literal(key_identity(&[("module", "commerce")])),
                vec![],
                vec![],
            );
            assert_eq!(validate_captured_variant(&incomplete), Err(refuse_dto()));
        }
    }

    #[test]
    fn source_bound_selected_key_requires_exact_identity_even_when_operand_identity_is_empty() {
        for op in ["get", "page"] {
            let root = record_with_key(
                "commerce",
                "Order",
                Some("Order_key"),
                Some(("doc", "0.10.0")),
            );
            let empty_literal = selected_graph(
                op,
                root.clone(),
                selected_literal(key_identity(&[])),
                vec![],
                vec![],
            );
            assert_eq!(
                validate_captured_variant(&empty_literal),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
            let other_node = selected_graph(
                op,
                root,
                node("param", vec![text_value("key")]),
                vec![],
                vec![parameter("key")],
            );
            assert_eq!(
                validate_captured_variant(&other_node),
                Err(Refusal {
                    kind: "capture-error",
                    code: "CAPTURE_SIGNATURE",
                    rule: "Key differs from selected Record Key"
                })
            );
        }
    }

    #[test]
    fn unbound_root_preserves_empty_identity_preflight_behavior() {
        let graph = selected_graph(
            "get",
            record_with_key("commerce", "Order", None, None),
            node("param", vec![text_value("key")]),
            vec![],
            vec![parameter("key")],
        );
        assert_eq!(validate_captured_variant(&graph), Ok(()));
    }

    #[test]
    fn selected_key_preflight_follows_join_closure_and_precedes_expression_visit() {
        let root = record("commerce", "Order", None);
        let foreign_key = selected_literal(complete_identity("elsewhere", "Other", "Other_key"));
        let bad_join = selected_graph(
            "get",
            root.clone(),
            foreign_key.clone(),
            vec![join(
                field("commerce", "Order", Some("wrong")),
                record("crm", "Customer", None),
            )],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&bad_join),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_UNSUPPORTED",
                rule: "join source is absent"
            })
        );
        let undeclared = node("param", vec![text_value("missing")]);
        let bad_key_before_expression = selected_graph(
            "get",
            root.clone(),
            foreign_key,
            vec![owner_filter(undeclared.clone())],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&bad_key_before_expression),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "Key belongs to another Record"
            })
        );
        let valid_key_then_expression = selected_graph(
            "get",
            root,
            selected_literal(key_identity(&[])),
            vec![owner_filter(undeclared)],
            vec![],
        );
        assert_eq!(
            validate_captured_variant(&valid_key_then_expression),
            Err(Refusal {
                kind: "capture-error",
                code: "CAPTURE_SIGNATURE",
                rule: "expression references an undeclared parameter"
            })
        );
    }
}
