// SPDX-License-Identifier: MIT OR Apache-2.0
//! Current-source Delta action-shape inspection. This does not establish
//! transaction semantics or native Delta validity.

use crate::{
    context::Context,
    delta_log::{self, DeltaLogResources},
    error::{EngineError, Severity},
    native_json::{NativeJsonNode, NativeJsonTree},
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{Utf16, Value},
};

pub struct DeltaActionResources {
    grammar: CompiledSchema,
    schema: Value,
}
impl DeltaActionResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let schema = serialization::read_json_value(
            &include_str!("../../../spec/extensions/delta-log/action-schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            Format::Json,
            ctx,
        )?;
        let grammar = CompiledSchema::compile(&schema, &SchemaResources::default(), ctx)?;
        Ok(Self { grammar, schema })
    }
}

pub fn inspect_delta_actions(
    document: &Value,
    log_resources: &DeltaLogResources,
    resources: &DeltaActionResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let report = delta_log::inspect_delta_log(document, log_resources, ctx)?;
    let mut diagnostics = array_field(&report, "diagnostics")
        .cloned()
        .unwrap_or_default();
    let mut known_shapes_valid = bool_field(&report, "parsedAll").unwrap_or(false);
    if let Some(lines) = array_field(&report, "lines") {
        for line in lines {
            if string_field(line, "status").as_deref() != Some("parsed") {
                continue;
            }
            let Some(action) = string_field(line, "action") else {
                continue;
            };
            let base = format!(
                "/lines/{}",
                number_field(line, "line").unwrap_or(1.0) as usize - 1
            );
            let Some(tagged) = object_field(line, "node") else {
                continue;
            };
            let tree = NativeJsonTree::from_tagged_value(tagged, ctx)?;
            let view = shape_view(tree.root());
            for issue in resources.grammar.validate(&view, ctx)? {
                let path = base.clone() + &issue.instance_path.to_utf8().unwrap_or_default();
                let message = if issue.keyword == "const" {
                    "must pass \"const\" keyword validation".to_owned()
                } else {
                    issue.message.to_utf8().unwrap_or_default()
                };
                diagnostics.push(diagnostic(
                    "DELTA_ACTION_SHAPE",
                    &path,
                    &message,
                    Severity::Error,
                ));
                known_shapes_valid = false;
            }
            if let Some(schema) =
                schema_child(object_field(&resources.schema, "properties"), &action)
            {
                if let NativeJsonNode::Object(members) = tree.root() {
                    if let Some((_, value)) = members.first() {
                        exact(
                            value,
                            schema,
                            &format!("{base}/{action}"),
                            &mut diagnostics,
                            &mut known_shapes_valid,
                        );
                    }
                }
            }
        }
    }
    diagnostics.push(diagnostic("DELTA_ACTION_CONTEXT_UNVERIFIED","","Field shapes do not validate feature requirements, embedded schemas/statistics, paths, deletion vectors or transaction/snapshot state",Severity::Warning));
    let mut fields = match report {
        Value::Object(fields) => fields,
        _ => return Err(err("DELTA_ACTION_REPORT", "Expected log inspection report")),
    };
    fields.push((
        Utf16::from("knownShapesValid"),
        Value::Bool(known_shapes_valid),
    ));
    if let Some((_, value)) = fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from("diagnostics"))
    {
        *value = Value::Array(diagnostics);
    }
    Ok(Value::Object(fields))
}

fn exact(
    node: &NativeJsonNode,
    schema: &Value,
    path: &str,
    out: &mut Vec<Value>,
    valid: &mut bool,
) {
    if let Some(any) = array_field(schema, "anyOf") {
        if matches!(node, NativeJsonNode::Null) {
            return;
        }
        if let Some(first) = any.first() {
            exact(node, first, path, out, valid);
        }
        return;
    }
    if string_field(schema, "type").as_deref() == Some("integer") {
        if let NativeJsonNode::Number(token) = node {
            let digits = token.strip_prefix('-').unwrap_or(token);
            if !is_integer_token(token) || digits.len() > 19 {
                out.push(diagnostic(
                    "DELTA_ACTION_INTEGER",
                    path,
                    "Expected an exact signed integer token in the declared range",
                    Severity::Error,
                ));
                *valid = false;
                return;
            }
            if let Ok(value) = token.parse::<i128>() {
                let (min, max) = if string_field(schema, "format").as_deref() == Some("int64") {
                    (i64::MIN as i128, i64::MAX as i128)
                } else {
                    (
                        schema_i128(schema, "minimum").unwrap_or(i32::MIN as i128),
                        schema_i128(schema, "maximum").unwrap_or(i32::MAX as i128),
                    )
                };
                if value < min || value > max {
                    out.push(diagnostic(
                        "DELTA_ACTION_INTEGER",
                        path,
                        "Integer exceeds its declared signed range",
                        Severity::Error,
                    ));
                    *valid = false;
                }
            }
        }
    }
    if let (NativeJsonNode::Object(members), Some(properties)) =
        (node, object_field(schema, "properties"))
    {
        for (key, value) in members {
            let name = key.to_utf8().unwrap_or_default();
            let at = format!("{path}/{}", pointer_escape(&name));
            if let Some(child) = schema_child(Some(properties), &name) {
                exact(value, child, &at, out, valid)
            } else {
                out.push(diagnostic(
                    "DELTA_ACTION_UNKNOWN_FIELD",
                    &at,
                    "Unknown field is preserved without interpretation",
                    Severity::Warning,
                ));
            }
        }
    }
}

fn shape_view(node: &NativeJsonNode) -> Value {
    match node {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(b) => Value::Bool(*b),
        NativeJsonNode::String(s) => Value::String(s.clone()),
        NativeJsonNode::Number(n) => {
            let value = n.parse::<f64>().unwrap_or(f64::INFINITY);
            Value::Number(if value.is_finite() { value } else { 0.5 })
        }
        NativeJsonNode::Array(items) => Value::Array(items.iter().map(shape_view).collect()),
        NativeJsonNode::Object(members) => Value::Object(
            members
                .iter()
                .map(|(k, v)| (k.clone(), shape_view(v)))
                .collect(),
        ),
    }
}
fn is_integer_token(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .enumerate()
            .all(|(i, b)| b.is_ascii_digit() || (i == 0 && b == b'-'))
        && s != "-"
}
fn schema_i128(v: &Value, key: &str) -> Option<i128> {
    number_field(v, key).map(|n| n as i128)
}
fn schema_child<'a>(v: Option<&'a Value>, key: &str) -> Option<&'a Value> {
    object_field(v?, key)
}
fn object_field<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    if let Value::Object(fields) = v {
        fields
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    } else {
        None
    }
}
fn array_field<'a>(v: &'a Value, key: &str) -> Option<&'a Vec<Value>> {
    if let Value::Array(a) = object_field(v, key)? {
        Some(a)
    } else {
        None
    }
}
fn string_field(v: &Value, key: &str) -> Option<String> {
    object_field(v, key).and_then(|v| {
        if let Value::String(s) = v {
            s.to_utf8().ok()
        } else {
            None
        }
    })
}
fn bool_field(v: &Value, key: &str) -> Option<bool> {
    object_field(v, key).and_then(|v| {
        if let Value::Bool(b) = v {
            Some(*b)
        } else {
            None
        }
    })
}
fn number_field(v: &Value, key: &str) -> Option<f64> {
    object_field(v, key).and_then(|v| {
        if let Value::Number(n) = v {
            Some(*n)
        } else {
            None
        }
    })
}
fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::string_utf8(code)),
        (Utf16::from("path"), Value::string_utf8(path)),
        (
            Utf16::from("severity"),
            Value::string_utf8(if severity == Severity::Error {
                "error"
            } else {
                "warning"
            }),
        ),
        (Utf16::from("message"), Value::string_utf8(message)),
    ])
}
fn pointer_escape(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
