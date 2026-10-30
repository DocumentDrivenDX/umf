// SPDX-License-Identifier: MIT OR Apache-2.0
//! Declarative action inspection used by portable generators.

pub mod evaluation;
pub mod single_set;

use std::collections::{BTreeMap, BTreeSet};

use umf_core::{Context, Diagnostic, EngineError, Severity, Utf16, Validation, Value};

use crate::value::{admit_json, read_source_value, string_member};
use crate::{generation::value, resources::CodegenResources};

/// One selected, schema-admitted declaration. Source member and array order
/// are retained because they determine generated parameter order and identity.
#[derive(Clone, Debug)]
pub(crate) struct ActionDeclaration {
    pub module: Utf16,
    pub id: Utf16,
    pub pointer: Utf16,
    pub value: Value,
    pub obligations: Vec<ActionObligation>,
}

#[derive(Clone, Debug)]
pub(crate) struct ActionObligation {
    pub path: Utf16,
    pub kind: Utf16,
    pub status: Utf16,
}

#[derive(Clone, Debug)]
pub(crate) struct ActionInspection {
    pub actions: Vec<ActionDeclaration>,
    pub validation: Validation,
}

impl Default for ActionInspection {
    fn default() -> Self {
        Self {
            actions: Vec::new(),
            validation: Validation {
                valid: true,
                complete: true,
                diagnostics: Vec::new(),
            },
        }
    }
}

fn fail(code: &str, path: impl Into<Utf16>, message: &str) -> EngineError {
    EngineError::new(code, path.into(), message)
}

fn diagnostic(error: EngineError) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(error.code),
        path: error.path,
        python_source_path: false,
        message: error.message,
        severity: Severity::Error,
        python_text_origin: None,
    }
}

fn add_diagnostic(validation: &mut Validation, item: Diagnostic) {
    if let Some(old) = validation
        .diagnostics
        .iter_mut()
        .find(|old| old.code == item.code && old.path == item.path && old.severity == item.severity)
    {
        if old.message != item.message {
            let units = old.message.units();
            let next = item.message.units();
            let mut start = 0;
            let mut duplicate = false;
            for i in 0..=units.len() {
                if i == units.len() || units[i..].starts_with(&[59, 32]) {
                    if &units[start..i] == next {
                        duplicate = true;
                        break;
                    }
                    start = i + 2;
                }
            }
            if !duplicate {
                let mut joined = units.to_vec();
                joined.extend_from_slice(&[59, 32]);
                joined.extend_from_slice(next);
                old.message = Utf16::new(joined);
            }
        }
    } else {
        validation.diagnostics.push(item);
    }
    validation.valid = !validation
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error);
    validation.complete = validation.valid
        && !validation
            .diagnostics
            .iter()
            .any(|d| d.severity == Severity::Warning);
}

fn pointer_escape(value: &str) -> String {
    value.replace('~', "~0").replace('/', "~1")
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ExprFamily {
    Boolean,
    Integer,
    String,
    Null,
}

#[derive(Clone, Copy, Debug)]
struct ExprType {
    family: ExprFamily,
    nullable: bool,
}

fn action_rule_error(code: &str, message: &str, path: &str) -> EngineError {
    fail(code, path, message)
}

#[cfg(test)]
fn literal_is_valid(
    document: &Value,
    field: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(action_literal_errors(
        &action_closure_tests::resources(),
        document,
        field,
        literal,
        ctx,
    )?
    .is_empty())
}

fn exact_members(value: &Value, expected: &[&str]) -> bool {
    let Some(fields) = value::object(value) else {
        return false;
    };
    fields.len() == expected.len()
        && fields.iter().all(|(key, _)| {
            key.to_utf8()
                .ok()
                .is_some_and(|name| expected.contains(&name.as_str()))
        })
}

fn find_element<'a>(
    document: &'a Value,
    module_id: &Utf16,
    element_id: &Utf16,
) -> Option<(&'a Value, usize, usize)> {
    for (mi, module) in value::array(value::get(document, "modules")?)
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        if string_member(module, "id") != Some(module_id) {
            continue;
        }
        for (ei, element) in value::array(value::get(module, "elements")?)
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            if string_member(element, "id") == Some(element_id) {
                return Some((element, mi, ei));
            }
        }
    }
    None
}

fn field_expression_type(
    document: &Value,
    reference: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<ExprType, EngineError> {
    charge_action_lookup(document, ctx, &Utf16::from(path))?;
    if !exact_members(reference, &["module", "element"]) {
        return Err(action_rule_error(
            "ACTION_RULE_SYNTAX",
            "Unknown or missing expression member",
            path,
        ));
    }
    let (Some(module), Some(element)) = (
        string_member(reference, "module"),
        string_member(reference, "element"),
    ) else {
        return Err(action_rule_error(
            "ACTION_REFERENCE",
            "Exact model dependency does not resolve",
            path,
        ));
    };
    let Some((field, _, _)) =
        find_element(document, module, element).filter(|(f, _, _)| ast(f, "kind", "field"))
    else {
        return Err(action_rule_error(
            "ACTION_REFERENCE",
            "Exact model dependency does not resolve",
            path,
        ));
    };
    let scalar = string_member(field, "scalarType")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let cardinality = string_member(field, "cardinality")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let nullability = string_member(field, "nullability")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    if cardinality != "one"
        || !["required", "absent-allowed"].contains(&nullability.as_str())
        || value::array(value::get(field, "references").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .any(|reference| {
                string_member(reference, "role")
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    == Some("record-type")
            })
    {
        return Err(action_rule_error(
            "ACTION_RULE_TYPE",
            "Field is outside rules/1 scalar subset",
            path,
        ));
    }
    let family = match scalar.as_str() {
        "boolean" => ExprFamily::Boolean,
        "integer" => ExprFamily::Integer,
        "string" => ExprFamily::String,
        _ => {
            return Err(action_rule_error(
                "ACTION_RULE_TYPE",
                "Field is outside rules/1 scalar subset",
                path,
            ))
        }
    };
    Ok(ExprType {
        family,
        nullable: nullability == "absent-allowed",
    })
}

#[cfg(test)]
fn expression_type(
    node: &Value,
    document: &Value,
    action: &Value,
    phase: &str,
    path: &str,
    depth: usize,
    count: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<ExprType, EngineError> {
    expression_type_checked(
        &action_closure_tests::resources(),
        node,
        document,
        action,
        phase,
        path,
        depth,
        count,
        None,
        ctx,
    )
}

fn expression_type_checked(
    resources: &CodegenResources,
    node: &Value,
    document: &Value,
    action: &Value,
    phase: &str,
    path: &str,
    depth: usize,
    count: &mut usize,
    rule: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<ExprType, EngineError> {
    if depth > 32 || *count >= 512 {
        return Err(action_rule_error(
            "LIMIT",
            "Expression depth/node bound exceeded",
            path,
        ));
    }
    *count += 1;
    ctx.charge_work(1, Utf16::from(path))?;
    if !matches!(node, Value::Object(_)) {
        return Err(action_rule_error(
            "ACTION_RULE_SYNTAX",
            "Expression must be an object",
            path,
        ));
    }
    if let Some(literal) = value::get(node, "literal") {
        if !exact_members(node, &["literal"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        if matches!(literal, Value::Null) {
            return Ok(ExprType {
                family: ExprFamily::Null,
                nullable: true,
            });
        }
        if !action_literal_wrapper(resources, literal, ctx)? {
            return Err(action_rule_error(
                "ACTION_RULE_TYPE",
                "Expected exact typed literal",
                path,
            ));
        }
        if value::object(literal).is_some_and(|f| {
            f.iter().any(|(k, _)| {
                !["boolean", "integerToken", "string"]
                    .iter()
                    .any(|s| k == &Utf16::from(*s))
            })
        }) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        if !matches!(literal, Value::Object(_))
            || value::object(literal).map_or(0, |v| v.len()) != 1
        {
            return Err(action_rule_error(
                "ACTION_RULE_TYPE",
                "Expected one supported scalar literal wrapper",
                path,
            ));
        }
        let fields = value::object(literal).unwrap();
        let (key, value) = &fields[0];
        let family = match key.to_utf8().ok().as_deref() {
            Some("boolean") if matches!(value, Value::Bool(_)) => ExprFamily::Boolean,
            Some("integerToken") if matches!(value, Value::String(_)) => ExprFamily::Integer,
            Some("string") if matches!(value, Value::String(_)) => ExprFamily::String,
            _ => {
                return Err(action_rule_error(
                    "ACTION_RULE_TYPE",
                    "Expected one supported scalar literal wrapper",
                    path,
                ))
            }
        };
        let family_name = match family {
            ExprFamily::Boolean => "boolean",
            ExprFamily::Integer => "integer",
            ExprFamily::String => "string",
            ExprFamily::Null => unreachable!(),
        };
        let synthetic = Value::Object(vec![
            (Utf16::from("kind"), Value::String(Utf16::from("field"))),
            (
                Utf16::from("scalarType"),
                Value::String(Utf16::from(family_name)),
            ),
            (
                Utf16::from("cardinality"),
                Value::String(Utf16::from("one")),
            ),
            (
                Utf16::from("nullability"),
                Value::String(Utf16::from("required")),
            ),
            (Utf16::from("extensions"), Value::Object(vec![])),
        ]);
        if let Some(error) = action_literal_errors(resources, document, &synthetic, literal, ctx)?
            .into_iter()
            .next()
        {
            return Err(EngineError::new(
                error.code.to_utf8().unwrap_or_default(),
                Utf16::from(path),
                error.message,
            ));
        }
        return Ok(ExprType {
            family,
            nullable: false,
        });
    }
    if value::get(node, "input").is_some() || value::get(node, "output").is_some() {
        let output = value::get(node, "output").is_some();
        let key = if output { "output" } else { "input" };
        if !exact_members(node, &[key]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let id = string_member(node, key)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_SYNTAX",
                    "Expected exact nonempty identity",
                    path,
                )
            })?;
        if output && phase != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "Outputs are forbidden in preconditions",
                path,
            ));
        }
        if let Some(rule) = rule {
            require_rule_dependency(
                rule,
                if output { "output" } else { "parameter" },
                av(node, key),
                path,
                ctx,
            )?;
        }
        let group = if output { "outputs" } else { "parameters" };
        let parameter = value::array(value::get(action, group).unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find(|parameter| string_member(parameter, "id") == Some(id));
        let Some(parameter) = parameter else {
            return Err(action_rule_error(
                "ACTION_RULE_TYPE",
                "Scalar expression must reference a declared value parameter",
                path,
            ));
        };
        if string_member(parameter, "kind")
            .and_then(|v| v.to_utf8().ok())
            .as_deref()
            != Some("value")
        {
            return Err(action_rule_error(
                "ACTION_RULE_TYPE",
                "Scalar expression must reference a declared value parameter",
                path,
            ));
        }
        let field = value::get(parameter, "field").ok_or_else(|| {
            action_rule_error(
                "ACTION_RULE_TYPE",
                "Field is outside rules/1 scalar subset",
                path,
            )
        })?;
        return field_expression_type(document, field, path, ctx);
    }
    if value::get(node, "state").is_some() {
        if !exact_members(node, &["state", "frame", "field"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let state = string_member(node, "state");
        if !["pre", "post"]
            .iter()
            .any(|s| state == Some(&Utf16::from(*s)))
        {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "State must be pre/post",
                path,
            ));
        }
        if state == Some(&Utf16::from("post")) && phase != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "Post-state is forbidden in preconditions",
                path,
            ));
        }
        let id = string_member(node, "frame")
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_SYNTAX",
                    "Expected exact nonempty identity",
                    path,
                )
            })?;
        let frame = aa(action, "reads")
            .iter()
            .rev()
            .find(|f| string_member(f, "id") == Some(id))
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                    path,
                )
            })?;
        validate_rule_frame(document, frame, rule, path, ctx)?;
        let field = av(node, "field");
        if !exact_members(field, &["module", "element"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        if ["module", "element"]
            .iter()
            .any(|k| string_member(field, k).is_none_or(|s| s.is_empty()))
        {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Expected exact nonempty identity",
                path,
            ));
        }
        if !aa(frame, "fields").iter().any(|r| same_ref(r, field)) {
            return Err(action_rule_error(
                "ACTION_RULE_FRAME",
                "Field is outside declared read access",
                path,
            ));
        }
        return field_expression_type(document, field, path, ctx);
    }
    if value::get(node, "exists").is_some() {
        if !exact_members(node, &["exists"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let exists = value::get(node, "exists").unwrap();
        if !exact_members(exists, &["state", "frame"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let state = string_member(exists, "state")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if state != "pre" && state != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "State must be pre/post",
                path,
            ));
        }
        if state == "post" && phase != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "Post-state is forbidden in preconditions",
                path,
            ));
        }
        let frame_id = string_member(exists, "frame").ok_or_else(|| {
            action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Expected exact nonempty identity",
                path,
            )
        })?;
        let frame = value::array(value::get(action, "reads").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find(|f| string_member(f, "id") == Some(frame_id))
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                    path,
                )
            })?;
        validate_rule_frame(document, frame, rule, path, ctx)?;
        return Ok(ExprType {
            family: ExprFamily::Boolean,
            nullable: false,
        });
    }
    if value::get(node, "linked").is_some() {
        if !exact_members(node, &["linked"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let linked = value::get(node, "linked").unwrap();
        if !exact_members(
            linked,
            &["state", "relationship", "sourceFrame", "targetFrame"],
        ) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let state = string_member(linked, "state")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if state != "pre" && state != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "State must be pre/post",
                path,
            ));
        }
        if state == "post" && phase != "post" {
            return Err(action_rule_error(
                "ACTION_RULE_PHASE",
                "Post-state is forbidden in preconditions",
                path,
            ));
        }
        let reads = aa(action, "reads");
        let source_frame = string_member(linked, "sourceFrame")
            .filter(|s| !s.is_empty())
            .and_then(|id| {
                reads
                    .iter()
                    .rev()
                    .find(|f| string_member(f, "id") == Some(id))
            })
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                    path,
                )
            })?;
        validate_rule_frame(document, source_frame, rule, path, ctx)?;
        let target_frame = string_member(linked, "targetFrame")
            .filter(|s| !s.is_empty())
            .and_then(|id| {
                reads
                    .iter()
                    .rev()
                    .find(|f| string_member(f, "id") == Some(id))
            })
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_FRAME",
                    "Business reads require a declared read frame",
                    path,
                )
            })?;
        validate_rule_frame(document, target_frame, rule, path, ctx)?;
        let rel = value::get(linked, "relationship").unwrap();
        if !exact_members(rel, &["module", "relationship"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        if let Some(rule) = rule {
            require_rule_dependency(rule, "relationship", rel, path, ctx)?;
        }
        let Some(mid) = string_member(rel, "module") else {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        };
        let Some(rid) = string_member(rel, "relationship") else {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        };
        let found = value::array(value::get(document, "modules").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find(|m| string_member(m, "id") == Some(mid))
            .and_then(|m| value::array(value::get(m, "relationships").unwrap_or(&Value::Null)))
            .and_then(|rs| rs.iter().find(|r| string_member(r, "id") == Some(rid)));
        let Some(relationship) = found else {
            return Err(action_rule_error(
                "ACTION_RULE_RELATIONSHIP",
                "linked requires a supported independent directed set relationship",
                path,
            ));
        };
        let directed = value::get(relationship, "directed") == Some(&Value::Bool(true));
        let lifecycle =
            string_member(relationship, "targetLifecycle").and_then(|v| v.to_utf8().ok());
        if !directed
            || !matches!(lifecycle.as_deref(), Some("independent" | "unspecified"))
            || value::get(relationship, "associationRecord").is_some()
        {
            return Err(action_rule_error(
                "ACTION_RULE_RELATIONSHIP",
                "linked requires a supported independent directed set relationship",
                path,
            ));
        }
        let source_record = value::get(source_frame, "record").unwrap_or(&Value::Null);
        let target_record = value::get(target_frame, "record").unwrap_or(&Value::Null);
        let source_ref = (
            string_member(source_record, "module"),
            string_member(source_record, "element"),
        );
        let target_ref = (
            string_member(target_record, "module"),
            string_member(target_record, "element"),
        );
        let endpoint = |items: &[Value], reference: &(Option<&Utf16>, Option<&Utf16>)| {
            items.iter().any(|entry| {
                string_member(entry, "module") == reference.0
                    && string_member(entry, "element") == reference.1
            })
        };
        let grants_relationship =
            value::array(value::get(source_frame, "relationships").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .any(|entry| {
                    string_member(entry, "module") == Some(mid)
                        && string_member(entry, "relationship") == Some(rid)
                });
        if value::get(source_frame, "maxEntities") != Some(&Value::Number(1.0))
            || value::get(target_frame, "maxEntities") != Some(&Value::Number(1.0))
            || value::get(source_frame, "create") == Some(&Value::Bool(true))
            || value::get(source_frame, "delete") == Some(&Value::Bool(true))
            || value::get(target_frame, "create") == Some(&Value::Bool(true))
            || value::get(target_frame, "delete") == Some(&Value::Bool(true))
            || find_element(
                document,
                source_ref.0.unwrap_or(&Utf16::default()),
                source_ref.1.unwrap_or(&Utf16::default()),
            )
            .is_none_or(|(record, _, _)| {
                string_member(record, "kind")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some("record")
            })
            || find_element(
                document,
                target_ref.0.unwrap_or(&Utf16::default()),
                target_ref.1.unwrap_or(&Utf16::default()),
            )
            .is_none_or(|(record, _, _)| {
                string_member(record, "kind")
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    != Some("record")
            })
            || !endpoint(
                value::array(value::get(relationship, "source").unwrap_or(&Value::Null))
                    .unwrap_or(&[]),
                &source_ref,
            )
            || !endpoint(
                value::array(value::get(relationship, "target").unwrap_or(&Value::Null))
                    .unwrap_or(&[]),
                &target_ref,
            )
            || !grants_relationship
        {
            return Err(action_rule_error(
                "ACTION_RULE_FRAME",
                "linked endpoints/orientation/read relationship access disagree",
                path,
            ));
        }
        return Ok(ExprType {
            family: ExprFamily::Boolean,
            nullable: false,
        });
    }
    if value::get(node, "op").is_some() {
        if !exact_members(node, &["op", "args"]) {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown or missing expression member",
                path,
            ));
        }
        let op = string_member(node, "op")
            .filter(|s| !s.is_empty())
            .and_then(|s| s.to_utf8().ok())
            .ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_SYNTAX",
                    "Expected exact nonempty identity",
                    path,
                )
            })?;
        let args =
            value::array(value::get(node, "args").unwrap_or(&Value::Null)).ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_SYNTAX",
                    "Unknown operator or wrong arity",
                    path,
                )
            })?;
        let expected = if ["present", "not"].contains(&op.as_str()) {
            1
        } else {
            2
        };
        if ![
            "present", "eq", "lt", "le", "gt", "ge", "add", "sub", "and", "or", "not",
        ]
        .contains(&op.as_str())
            || args.len() != expected
        {
            return Err(action_rule_error(
                "ACTION_RULE_SYNTAX",
                "Unknown operator or wrong arity",
                path,
            ));
        }
        let mut types = Vec::with_capacity(args.len());
        for (index, child) in args.iter().enumerate() {
            types.push(expression_type_checked(
                resources,
                child,
                document,
                action,
                phase,
                &format!("{path}/args/{index}"),
                depth + 1,
                count,
                rule,
                ctx,
            )?);
        }
        let bool_type = ExprType {
            family: ExprFamily::Boolean,
            nullable: false,
        };
        match op.as_str() {
            "eq" => {
                let a = types[0];
                let b = types[1];
                if a.family != b.family
                    && !(a.family == ExprFamily::Null && b.nullable
                        || b.family == ExprFamily::Null && a.nullable)
                {
                    return Err(action_rule_error("ACTION_RULE_TYPE", "Equality needs the same scalar family or compatible explicit nullable null", path));
                }
            }
            "lt" | "le" | "gt" | "ge" | "add" | "sub" => {
                if types.iter().any(|t| t.family != ExprFamily::Integer) {
                    return Err(action_rule_error(
                        "ACTION_RULE_TYPE",
                        "Integer operator requires integer operands",
                        path,
                    ));
                }
            }
            "and" | "or" | "not" => {
                if types.iter().any(|t| t.family != ExprFamily::Boolean) {
                    return Err(action_rule_error(
                        "ACTION_RULE_TYPE",
                        "Boolean operator requires boolean operands",
                        path,
                    ));
                }
            }
            "present" => {}
            _ => unreachable!(),
        }
        return Ok(if op == "add" || op == "sub" {
            ExprType {
                family: ExprFamily::Integer,
                nullable: false,
            }
        } else {
            bool_type
        });
    }
    Err(action_rule_error(
        "ACTION_RULE_SYNTAX",
        "Unknown or missing expression member",
        path,
    ))
}

fn check_scalar_dependencies(
    expression: &Value,
    action: &Value,
    document: &Value,
    rule: &Value,
    phase: &str,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let references = value::array(value::get(rule, "references").unwrap_or(&Value::Null))
        .ok_or_else(|| {
            action_rule_error(
                "ACTION_RULE_DEPENDENCY",
                "Rule references must be an array",
                path,
            )
        })?;
    for (index, reference) in references.iter().enumerate() {
        charge_action_lookup(document, ctx, &Utf16::from(path))?;
        ctx.charge_work(1, Utf16::from(format!("{path}/references/{index}")))?;
        if exact_members(reference, &["parameter"]) {
            let id = string_member(reference, "parameter").ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Unknown dependency annotation",
                    path,
                )
            })?;
            if !value::array(value::get(action, "parameters").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .any(|p| string_member(p, "id") == Some(id))
            {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Parameter dependency does not resolve",
                    path,
                ));
            }
        } else if exact_members(reference, &["output"]) {
            let id = string_member(reference, "output").ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Unknown dependency annotation",
                    path,
                )
            })?;
            if phase != "post"
                || !value::array(value::get(action, "outputs").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .any(|p| string_member(p, "id") == Some(id))
            {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Output dependency is forbidden or missing",
                    path,
                ));
            }
        } else if exact_members(reference, &["record"]) {
            let record = value::get(reference, "record").unwrap_or(&Value::Null);
            let module = string_member(record, "module").ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Record dependency does not resolve",
                    path,
                )
            })?;
            let element = string_member(record, "element").ok_or_else(|| {
                action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Record dependency does not resolve",
                    path,
                )
            })?;
            if !exact_members(record, &["module", "element"])
                || find_element(document, module, element).is_none_or(|(e, _, _)| {
                    string_member(e, "kind")
                        .and_then(|v| v.to_utf8().ok())
                        .as_deref()
                        != Some("record")
                })
            {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Record dependency does not resolve",
                    path,
                ));
            }
        } else if exact_members(reference, &["relationship"]) {
            let relationship = value::get(reference, "relationship").unwrap_or(&Value::Null);
            let module = string_member(relationship, "module");
            let id = string_member(relationship, "relationship");
            let exists = module.zip(id).is_some_and(|(module, id)| {
                value::array(value::get(document, "modules").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .find(|m| string_member(m, "id") == Some(module))
                    .and_then(|m| {
                        value::array(value::get(m, "relationships").unwrap_or(&Value::Null))
                    })
                    .is_some_and(|items| {
                        items
                            .iter()
                            .any(|item| string_member(item, "id") == Some(id))
                    })
            });
            if !exact_members(relationship, &["module", "relationship"]) || !exists {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Relationship dependency does not resolve",
                    path,
                ));
            }
        } else {
            return Err(action_rule_error(
                "ACTION_RULE_DEPENDENCY",
                "Unknown dependency annotation",
                path,
            ));
        }
    }
    fn walk(
        node: &Value,
        action: &Value,
        document: &Value,
        refs: &[Value],
        path: &str,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::from(path))?;
        if let Some(id) = string_member(node, "input") {
            if !refs.iter().any(|r| {
                exact_members(r, &["parameter"]) && string_member(r, "parameter") == Some(id)
            }) {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Expression dependency must be explicitly declared",
                    path,
                ));
            }
        }
        if let Some(id) = string_member(node, "output") {
            if !refs
                .iter()
                .any(|r| exact_members(r, &["output"]) && string_member(r, "output") == Some(id))
            {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Expression dependency must be explicitly declared",
                    path,
                ));
            }
        }
        let declared = |candidate: &Value| {
            refs.iter().any(|reference| {
                if exact_members(reference, &["record"]) {
                    let a = value::get(reference, "record").unwrap_or(&Value::Null);
                    let b = value::get(candidate, "record").unwrap_or(&Value::Null);
                    exact_members(candidate, &["record"])
                        && string_member(a, "module") == string_member(b, "module")
                        && string_member(a, "element") == string_member(b, "element")
                } else if exact_members(reference, &["relationship"]) {
                    let a = value::get(reference, "relationship").unwrap_or(&Value::Null);
                    let b = value::get(candidate, "relationship").unwrap_or(&Value::Null);
                    exact_members(candidate, &["relationship"])
                        && string_member(a, "module") == string_member(b, "module")
                        && string_member(a, "relationship") == string_member(b, "relationship")
                } else {
                    false
                }
            })
        };
        if let Some(frame_id) = string_member(node, "frame")
            .or_else(|| value::get(node, "exists").and_then(|x| string_member(x, "frame")))
        {
            if let Some(frame) = value::array(value::get(action, "reads").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .find(|frame| string_member(frame, "id") == Some(frame_id))
            {
                let record = value::get(frame, "record").unwrap_or(&Value::Null);
                let candidate = Value::Object(vec![(Utf16::from("record"), record.clone())]);
                if !declared(&candidate) {
                    return Err(action_rule_error(
                        "ACTION_RULE_DEPENDENCY",
                        "Expression dependency must be explicitly declared",
                        path,
                    ));
                }
            }
        }
        if let Some(linked) = value::get(node, "linked") {
            let candidate = Value::Object(vec![(
                Utf16::from("relationship"),
                value::get(linked, "relationship")
                    .cloned()
                    .unwrap_or(Value::Null),
            )]);
            if !declared(&candidate) {
                return Err(action_rule_error(
                    "ACTION_RULE_DEPENDENCY",
                    "Expression dependency must be explicitly declared",
                    path,
                ));
            }
            for member in ["sourceFrame", "targetFrame"] {
                let id = string_member(linked, member);
                if let Some(frame) = id.and_then(|id| {
                    value::array(value::get(action, "reads").unwrap_or(&Value::Null))
                        .unwrap_or(&[])
                        .iter()
                        .find(|frame| string_member(frame, "id") == Some(id))
                }) {
                    let candidate = Value::Object(vec![(
                        Utf16::from("record"),
                        value::get(frame, "record").cloned().unwrap_or(Value::Null),
                    )]);
                    if !declared(&candidate) {
                        return Err(action_rule_error(
                            "ACTION_RULE_DEPENDENCY",
                            "Expression dependency must be explicitly declared",
                            path,
                        ));
                    }
                }
            }
        }
        if let Some(args) = value::array(value::get(node, "args").unwrap_or(&Value::Null)) {
            for (index, child) in args.iter().enumerate() {
                walk(
                    child,
                    action,
                    document,
                    refs,
                    &format!("{path}/args/{index}"),
                    ctx,
                )?;
            }
        }
        Ok(())
    }
    walk(expression, action, document, references, path, ctx)
}

/// Validate the exact rules/1 scalar subset used by `analyzeAction`. Errors
/// from the rule compiler are represented as ordinary ACTION_STRUCTURE
/// diagnostics, while Context control failures remain terminal.
#[cfg(test)]
fn inspect_rules(
    action: &Value,
    document: &Value,
    base_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diagnostics = Vec::new();
    for (group, phase) in [("preconditions", "pre"), ("postconditions", "post")] {
        let Some(conditions) = value::array(value::get(action, group).unwrap_or(&Value::Null))
        else {
            continue;
        };
        for (index, condition) in conditions.iter().enumerate() {
            let rule_path = format!(
                "{}/{group}/{index}/rule",
                base_path.to_utf8().unwrap_or_default()
            );
            let Some(rule) = value::get(condition, "rule") else {
                continue;
            };
            let language = string_member(rule, "language").and_then(|s| s.to_utf8().ok());
            let version = string_member(rule, "version").and_then(|s| s.to_utf8().ok());
            if language.as_deref() != Some("umf.actions.rules") || version.as_deref() != Some("1") {
                continue;
            }
            let Some(text) = string_member(rule, "expression") else {
                continue;
            };
            if text.is_empty() || text.len() > 65_536 {
                diagnostics.push(diagnostic(fail(
                    "LIMIT",
                    rule_path,
                    "Expression text exceeds bounded profile",
                )));
                continue;
            }
            let parsed = match read_action_expression(text, ctx) {
                Ok(value) => value,
                Err(error) if error.is_control_failure() => return Err(error),
                Err(error) => {
                    let message = if error.code == "JSON_PARSE" {
                        "UmfError: Invalid JSON syntax"
                    } else {
                        "UmfError: Expression must be an object"
                    };
                    diagnostics.push(diagnostic(fail("ACTION_STRUCTURE", rule_path, message)));
                    continue;
                }
            };
            if let Err(error) =
                check_scalar_dependencies(&parsed, action, document, rule, phase, &rule_path, ctx)
            {
                if error.is_control_failure() {
                    return Err(error);
                }
                let code = if error.code == "LIMIT" {
                    "LIMIT"
                } else {
                    "ACTION_STRUCTURE"
                };
                let message = format!("UmfError: {}", error.message.to_utf8().unwrap_or_default());
                diagnostics.push(diagnostic(fail(code, rule_path, &message)));
                continue;
            }
            let mut count = 0;
            match expression_type(
                &parsed, document, action, phase, &rule_path, 1, &mut count, ctx,
            ) {
                Ok(ty) if ty.family == ExprFamily::Boolean => {}
                Ok(_) => diagnostics.push(diagnostic(fail(
                    "ACTION_STRUCTURE",
                    rule_path,
                    "UmfError: Conditions require a boolean result",
                ))),
                Err(error) if error.is_control_failure() => return Err(error),
                Err(error) => {
                    let code = if error.code == "LIMIT" {
                        "LIMIT"
                    } else {
                        "ACTION_STRUCTURE"
                    };
                    let message =
                        format!("UmfError: {}", error.message.to_utf8().unwrap_or_default());
                    diagnostics.push(diagnostic(fail(code, rule_path, &message)));
                }
            }
        }
    }
    Ok(diagnostics)
}

fn inspect_selectors_bound(
    resources: &CodegenResources,
    action: &Value,
    document: &Value,
    base_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut diagnostics = Vec::new();
    for group in ["reads", "writes"] {
        let Some(frames) = value::array(value::get(action, group).unwrap_or(&Value::Null)) else {
            continue;
        };
        for (index, frame) in frames.iter().enumerate() {
            ctx.charge_work(1, base_path.clone())?;
            let path = format!(
                "{}/{group}/{index}/selector",
                base_path.to_utf8().unwrap_or_default()
            );
            charge_action_lookup(document, ctx, base_path)?;
            let selector = value::get(frame, "selector").unwrap_or(&Value::Null);
            if string_member(selector, "language")
                .and_then(|s| s.to_utf8().ok())
                .as_deref()
                != Some("umf.actions.keys")
                || string_member(selector, "version")
                    .and_then(|s| s.to_utf8().ok())
                    .as_deref()
                    != Some("1")
            {
                continue;
            }
            let Some(text) = string_member(selector, "expression") else {
                continue;
            };
            if text.is_empty() || text.len() > 65_536 {
                diagnostics.push(diagnostic(fail(
                    "LIMIT",
                    path,
                    "UmfError: Expression text exceeds bounded profile",
                )));
                continue;
            }
            let parsed = match read_action_expression(text, ctx) {
                Ok(value) => value,
                Err(error) if error.is_control_failure() => return Err(error),
                Err(e) => {
                    let (code, message) = action_parse_failure(&e);
                    diagnostics.push(diagnostic(EngineError::new(code, path.into(), message)));
                    continue;
                }
            };
            if value::object(&parsed).is_none() {
                diagnostics.push(diagnostic(fail(
                    "ACTION_STRUCTURE",
                    path,
                    "UmfError: Expected object",
                )));
                continue;
            }
            let params = value::array(value::get(action, "parameters").unwrap_or(&Value::Null))
                .unwrap_or(&[]);
            let refs = value::array(value::get(selector, "references").unwrap_or(&Value::Null))
                .unwrap_or(&[]);
            let dependency = |id: &Utf16| {
                refs.iter().any(|reference| {
                    exact_members(reference, &["parameter"])
                        && string_member(reference, "parameter") == Some(id)
                })
            };
            let record = value::get(frame, "record").unwrap_or(&Value::Null);
            let mut problem: Option<(&'static str, &'static str)> = None;
            for reference in refs {
                if !exact_members(reference, &["parameter"]) {
                    problem = Some((
                        "ACTION_SELECTOR_DEPENDENCY",
                        "UmfError: keys/1 cannot consult outputs or business state",
                    ));
                    break;
                }
                let Some(id) = string_member(reference, "parameter") else {
                    problem = Some((
                        "ACTION_SELECTOR_SYNTAX",
                        "UmfError: Expected exact nonempty identity",
                    ));
                    break;
                };
                if !params.iter().any(|p| string_member(p, "id") == Some(id)) {
                    problem = Some((
                        "ACTION_REFERENCE",
                        "UmfError: Selector dependency must resolve a parameter",
                    ));
                    break;
                }
            }
            if problem.is_some() {
            } else if !matches!(value::get(frame, "maxEntities"), Some(Value::Number(n)) if n.to_string() == "1")
            {
                problem = Some((
                    "ACTION_SELECTOR_BOUND",
                    "UmfError: keys/1 selects exactly one identity",
                ));
            } else if value::get(&parsed, "entity").is_some() {
                let entity_id = string_member(&parsed, "entity");
                if !exact_members(&parsed, &["entity"]) {
                    problem = Some((
                        "ACTION_SELECTOR_SYNTAX",
                        "UmfError: Unknown or missing expression member",
                    ));
                } else {
                    let parameter = params.iter().find(|p| string_member(p, "id") == entity_id);
                    let target = parameter.and_then(|p| value::get(p, "target"));
                    let kind = parameter
                        .and_then(|p| string_member(p, "kind"))
                        .and_then(|s| s.to_utf8().ok());
                    let same_record = target.and_then(|t| string_member(t, "module"))
                        == string_member(record, "module")
                        && target.and_then(|t| string_member(t, "element"))
                            == string_member(record, "element");
                    if kind.as_deref() != Some("entity") || !same_record {
                        problem = Some((
                            "ACTION_SELECTOR_TYPE",
                            "UmfError: Entity selector must reference the frame Record",
                        ));
                    } else if !dependency(entity_id.unwrap()) {
                        problem = Some((
                            "ACTION_SELECTOR_DEPENDENCY",
                            "UmfError: Selector parameter dependency is undeclared",
                        ));
                    } else if target.is_none_or(|target| {
                        string_member(target, "module")
                            .zip(string_member(target, "element"))
                            .and_then(|(m, e)| find_element(document, m, e))
                            .is_none_or(|(record, _, _)| {
                                !ast(record, "kind", "record")
                                    || !aa(record, "keys").iter().any(|k| {
                                        string_member(k, "id") == string_member(target, "key")
                                    })
                            })
                    }) {
                        problem = Some((
                            "ACTION_REFERENCE",
                            "UmfError: Exact Record and stable Key must resolve",
                        ));
                    }
                }
            } else if let Some(key_id) = string_member(&parsed, "key") {
                let components =
                    value::array(value::get(&parsed, "components").unwrap_or(&Value::Null));
                if !exact_members(&parsed, &["key", "components"]) || components.is_none() {
                    problem = Some((
                        "ACTION_SELECTOR_SYNTAX",
                        "UmfError: Expected exact Key and ordered components",
                    ));
                } else {
                    let resolved_record = string_member(record, "module")
                        .zip(string_member(record, "element"))
                        .and_then(|(m, e)| find_element(document, m, e))
                        .map(|(e, _, _)| e)
                        .filter(|e| ast(e, "kind", "record"));
                    let key = resolved_record
                        .and_then(|record| {
                            value::array(value::get(record, "keys").unwrap_or(&Value::Null))
                        })
                        .unwrap_or(&[])
                        .iter()
                        .find(|k| string_member(k, "id") == Some(key_id));
                    if key.is_none() {
                        problem = Some((
                            "ACTION_REFERENCE",
                            "UmfError: Exact Record and stable Key must resolve",
                        ));
                    }
                    let fields = key.and_then(|k| {
                        value::array(value::get(k, "fields").unwrap_or(&Value::Null))
                    });
                    let fields = fields.unwrap_or(&[]);
                    if problem.is_some() {
                    } else if fields.len() != components.unwrap().len() {
                        problem = Some((
                            "ACTION_SELECTOR_ARITY",
                            "UmfError: Components must match declared Key order/count",
                        ));
                    } else {
                        for (i, component) in components.unwrap().iter().enumerate() {
                            let field = &fields[i];
                            if let Some(input) = string_member(component, "input") {
                                let parameter = params
                                    .iter()
                                    .find(|p| string_member(p, "id") == Some(input));
                                let param_field = parameter.and_then(|p| value::get(p, "field"));
                                let required = matches!(
                                    parameter.and_then(|p| value::get(p, "required")),
                                    Some(Value::Bool(true))
                                );
                                let is_value = parameter
                                    .and_then(|p| string_member(p, "kind"))
                                    .and_then(|s| s.to_utf8().ok())
                                    .as_deref()
                                    == Some("value");
                                let same = param_field.and_then(|p| string_member(p, "module"))
                                    == string_member(field, "module")
                                    && param_field.and_then(|p| string_member(p, "element"))
                                        == string_member(field, "element");
                                if !exact_members(component, &["input"])
                                    || !is_value
                                    || !required
                                    || !same
                                {
                                    problem = Some(("ACTION_SELECTOR_TYPE", "UmfError: Key component needs a required input of the exact Field"));
                                    break;
                                }
                                if !dependency(input) {
                                    problem = Some((
                                        "ACTION_SELECTOR_DEPENDENCY",
                                        "UmfError: Selector parameter dependency is undeclared",
                                    ));
                                    break;
                                }
                            } else if !exact_members(component, &["literal"]) {
                                problem = Some((
                                    "ACTION_SELECTOR_SYNTAX",
                                    "UmfError: Expected exactly one component binding",
                                ));
                                break;
                            } else if let Some(literal) = value::get(component, "literal") {
                                let field_module = string_member(field, "module");
                                let field_id = string_member(field, "element");
                                let field_def = value::array(
                                    value::get(document, "modules").unwrap_or(&Value::Null),
                                )
                                .and_then(|modules| {
                                    modules
                                        .iter()
                                        .find(|module| string_member(module, "id") == field_module)
                                })
                                .and_then(|module| {
                                    value::array(
                                        value::get(module, "elements").unwrap_or(&Value::Null),
                                    )
                                })
                                .and_then(|elements| {
                                    elements
                                        .iter()
                                        .find(|element| string_member(element, "id") == field_id)
                                });
                                if !action_literal_wrapper(resources, literal, ctx)? {
                                    problem=Some(("ACTION_SELECTOR_TYPE","UmfError: Key component needs an exact typed literal wrapper"));
                                    break;
                                }
                                if let Some(field) = field_def {
                                    if let Some(error) = action_literal_errors(
                                        resources, document, field, literal, ctx,
                                    )?
                                    .into_iter()
                                    .next()
                                    {
                                        diagnostics.push(diagnostic(fail(
                                            "ACTION_STRUCTURE",
                                            path.clone(),
                                            &format!(
                                                "UmfError: {}",
                                                error.message.to_utf8().unwrap_or_default()
                                            ),
                                        )));
                                        problem = None;
                                        break;
                                    }
                                } else {
                                    problem = Some((
                                        "ACTION_REFERENCE",
                                        "UmfError: Exact model dependency does not resolve",
                                    ));
                                    break;
                                }
                                if literal == &Value::Null {
                                    problem = Some((
                                        "ACTION_SELECTOR_TYPE",
                                        "UmfError: Key components cannot be null",
                                    ));
                                    break;
                                }
                            }
                        }
                    }
                }
            } else {
                problem = Some((
                    "ACTION_SELECTOR_SYNTAX",
                    "UmfError: Expected exact Key and ordered components",
                ));
            }
            if let Some((code, message)) = problem {
                diagnostics.push(diagnostic(fail(code, path, message)));
            }
        }
    }
    Ok(diagnostics)
}

#[cfg(test)]
fn inspect_action_identities(action: &Value, base: &Utf16) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let base_text = base.to_utf8().unwrap_or_default();
    for groups in [["reads", "writes"], ["preconditions", "postconditions"]] {
        let mut seen = BTreeSet::new();
        for group in groups {
            let items =
                value::array(value::get(action, group).unwrap_or(&Value::Null)).unwrap_or(&[]);
            for (index, item) in items.iter().enumerate() {
                if let Some(id) = string_member(item, "id") {
                    if !seen.insert(id.clone()) {
                        diagnostics.push(diagnostic(fail(
                            "ACTION_IDENTITY",
                            format!("{base_text}/{group}/{index}/id"),
                            "Duplicate combined identity",
                        )));
                    }
                }
            }
        }
    }
    let pre =
        value::array(value::get(action, "preconditions").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let post =
        value::array(value::get(action, "postconditions").unwrap_or(&Value::Null)).unwrap_or(&[]);
    if pre.len().saturating_add(post.len()) > 128 {
        diagnostics.push(diagnostic(fail(
            "LIMIT",
            format!("{base_text}/postconditions"),
            "At most 128 combined conditions",
        )));
    }
    let failures =
        value::array(value::get(action, "failures").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut failure_codes = BTreeSet::new();
    for group in ["preconditions", "postconditions"] {
        let conditions =
            value::array(value::get(action, group).unwrap_or(&Value::Null)).unwrap_or(&[]);
        for (index, condition) in conditions.iter().enumerate() {
            let at = format!("{base_text}/{group}/{index}");
            let failure = value::get(condition, "failure").unwrap_or(&Value::Null);
            let code = string_member(failure, "code");
            if let Some(code) = code {
                if !failure_codes.insert(code.clone()) {
                    diagnostics.push(diagnostic(fail(
                        "ACTION_IDENTITY",
                        format!("{at}/failure/code"),
                        "Condition failure codes must be distinct",
                    )));
                }
                let message = string_member(failure, "message");
                if !failures.iter().any(|declared| {
                    string_member(declared, "code") == Some(code)
                        && string_member(declared, "message") == message
                }) {
                    diagnostics.push(diagnostic(fail(
                        "ACTION_REFERENCE",
                        format!("{at}/failure"),
                        "Condition failure must match a declared code and message",
                    )));
                }
            }
            if group == "preconditions"
                && value::array(
                    value::get(
                        value::get(condition, "rule").unwrap_or(&Value::Null),
                        "references",
                    )
                    .unwrap_or(&Value::Null),
                )
                .unwrap_or(&[])
                .iter()
                .any(|reference| value::get(reference, "output").is_some())
            {
                diagnostics.push(diagnostic(fail(
                    "ACTION_REFERENCE",
                    format!("{at}/rule/references"),
                    "Preconditions cannot reference outputs",
                )));
            }
        }
    }
    diagnostics
}

struct NoCapabilities;
impl umf_core::Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &umf_core::SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn as_text(
    value: &Value,
    path: &Utf16,
    member: &str,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let text = string_member(value, member)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            fail(
                "ACTION_INVALID",
                path.clone(),
                "Action inventory entries require a nonempty identity",
            )
        })?;
    ctx.charge_work(text.len() + 1, path.clone())?;
    Ok(text.clone())
}

/// Admit the `umf.actions` package shape, enforce local identity uniqueness,
/// and resolve every typed parameter/output/frame reference to a current core
/// element. The declaration itself remains an ordered copied `Value`.
pub(crate) fn inspect_document(
    document: &Value,
    _resources: &CodegenResources,
    selected: Option<&BTreeSet<(Utf16, Utf16)>>,
    ctx: &mut Context<'_>,
) -> Result<ActionInspection, EngineError> {
    if string_member(document, "umf")
        .and_then(|v| v.to_utf8().ok())
        .as_deref()
        != Some("0.10.0")
    {
        return Err(fail(
            "ACTION_STRUCTURE",
            "",
            "Actions require exact core 0.10.0",
        ));
    }
    let modules = value::array(
        value::get(document, "modules")
            .ok_or_else(|| fail("INVALID_DOCUMENT", "", "Document has no module inventory"))?,
    )
    .ok_or_else(|| {
        fail(
            "INVALID_DOCUMENT",
            "/modules",
            "Module inventory is not an array",
        )
    })?;
    let vocab = value::get(document, "vocabularies");
    let version = vocab
        .and_then(|v| value::get(v, "umf.actions"))
        .and_then(|v| string_member(v, "version"));
    if version.is_some_and(|v| v != &Utf16::from("0.1.0")) {
        return Err(fail(
            "ACTION_STRUCTURE",
            "",
            "Unsupported action namespace version",
        ));
    }
    let mut out = ActionInspection::default();
    let mut capabilities = NoCapabilities;
    out.validation = _resources.engine().validate_document(
        document,
        _resources.actions_registry(),
        &mut capabilities,
        ctx,
    )?;
    ctx.charge_work(out.validation.diagnostics.len(), Utf16::default())?;
    for diagnostic in &out.validation.diagnostics {
        ctx.charge_work(
            diagnostic.code.len() + diagnostic.path.len() + diagnostic.message.len() + 1,
            Utf16::default(),
        )?;
    }
    let core_diagnostics = out.validation.diagnostics.clone();
    if value::get(document, "extensions")
        .and_then(|root| value::get(root, "umf.actions"))
        .is_some()
    {
        return Err(fail(
            "ACTION_STRUCTURE",
            "/extensions/umf.actions",
            "Action attachment must be module-scoped",
        ));
    }
    let mut module_ids = BTreeSet::new();
    for (mi, module) in modules.iter().enumerate() {
        ctx.charge_work(1, Utf16::from(format!("/modules/{mi}")))?;
        ctx.charge_work(
            string_member(module, "id").map_or(0, Utf16::len) + 1,
            Utf16::default(),
        )?;
        let module_id = string_member(module, "id").cloned().ok_or_else(|| {
            fail(
                "INVALID_DOCUMENT",
                format!("/modules/{mi}/id"),
                "Module ID is required",
            )
        })?;
        ctx.charge_work(
            module_id.len().saturating_mul(module_ids.len() + 2),
            Utf16::default(),
        )?;
        if !module_ids.insert(module_id.clone()) {
            add_diagnostic_metered(
                &mut out.validation,
                diagnostic(fail(
                    "INVALID_DOCUMENT",
                    format!("/modules/{mi}/id"),
                    "Duplicate module identity",
                )),
                ctx,
            )?;
        }
        if let Some(elements) = value::array(value::get(module, "elements").unwrap_or(&Value::Null))
        {
            for (ei, element) in elements.iter().enumerate() {
                if value::get(element, "extensions")
                    .and_then(|extensions| value::get(extensions, "umf.actions"))
                    .is_some()
                {
                    return Err(fail(
                        "ACTION_STRUCTURE",
                        format!("/modules/{mi}/elements/{ei}/extensions/umf.actions"),
                        "Action attachment must be module-scoped",
                    ));
                }
            }
        }
        let ext = value::get(module, "extensions");
        let payload = match ext.and_then(|e| value::get(e, "umf.actions")) {
            None => continue,
            Some(payload) => payload,
        };
        if version.is_none() {
            return Err(fail(
                "ACTION_STRUCTURE",
                "",
                "Action vocabulary must be explicitly declared",
            ));
        }
        if version != Some(&Utf16::from("0.1.0")) {
            return Err(fail(
                "ACTION_STRUCTURE",
                "",
                "Unsupported action namespace version",
            ));
        }
        let actions = value::array(value::get(payload, "actions").ok_or_else(|| {
            fail(
                "ACTION_INVALID",
                format!("/modules/{mi}/extensions/umf.actions/actions"),
                "Expected an actions array",
            )
        })?)
        .ok_or_else(|| {
            fail(
                "ACTION_INVALID",
                format!("/modules/{mi}/extensions/umf.actions/actions"),
                "Expected an actions array",
            )
        })?;
        // Predecessor admit() rejects the entire package before any semantic
        // analysis or selected declaration obligation can be observed.
        let schema_errors = _resources.actions_compiled().validate(payload, ctx)?;
        if !schema_errors.is_empty() {
            let code = if schema_errors
                .iter()
                .any(|e| ["maxItems", "maxLength", "maximum"].contains(&e.keyword.as_str()))
            {
                "LIMIT"
            } else {
                "ACTION_STRUCTURE"
            };
            return Err(fail(
                code,
                format!("/modules/{mi}/extensions/umf.actions"),
                "Action declaration does not match the registered actions schema",
            ));
        }
        for action in actions {
            ctx.charge_work(1, Utf16::default())?;
            if aa(action, "preconditions").len() + aa(action, "postconditions").len() > 128 {
                return Err(fail("LIMIT", "", "At most 128 combined pre/postconditions"));
            }
            for group in ["preconditions", "postconditions", "reads", "writes"] {
                for entry in aa(action, group) {
                    ctx.charge_work(1, Utf16::default())?;
                    let rule = av(
                        entry,
                        if group == "reads" || group == "writes" {
                            "selector"
                        } else {
                            "rule"
                        },
                    );
                    if string_member(rule, "expression").is_some_and(|s| s.len() > 65536) {
                        return Err(fail(
                            "LIMIT",
                            "",
                            "Rule and selector text is bounded to 65536 UTF-16 units",
                        ));
                    }
                }
            }
        }
        let mut seen = BTreeSet::new();
        let mut seen_names = BTreeSet::new();
        if let Value::Object(_) = payload {
            for (key, _) in crate::value::js_object_members(payload, ctx)? {
                ctx.charge_work(key.len(), Utf16::default())?;
                if key != &Utf16::from("actions") {
                    add_diagnostic_metered(
                        &mut out.validation,
                        Diagnostic {
                            code: Utf16::from("ACTION_UNCHECKED"),
                            path: action_child(
                                &Utf16::from(format!("/modules/{mi}/extensions/umf.actions")),
                                key,
                            ),
                            python_source_path: false,
                            message: Utf16::from("Unknown action attachment meaning"),
                            severity: Severity::Warning,
                            python_text_origin: None,
                        },
                        ctx,
                    )?;
                }
            }
        }
        for (ai, action) in actions.iter().enumerate() {
            let path = Utf16::from(format!("/modules/{mi}/extensions/umf.actions/actions/{ai}"));
            let id = match as_text(action, &path, "id", ctx) {
                Ok(id) => id,
                Err(error) => {
                    add_diagnostic_metered(&mut out.validation, diagnostic(error), ctx)?;
                    continue;
                }
            };
            let name = match as_text(action, &path, "name", ctx) {
                Ok(name) => name,
                Err(error) => {
                    add_diagnostic_metered(&mut out.validation, diagnostic(error), ctx)?;
                    continue;
                }
            };
            if !seen.insert(id.clone()) {
                add_diagnostic_metered(
                    &mut out.validation,
                    diagnostic(fail(
                        "ACTION_IDENTITY",
                        format!("{}/id", path.to_utf8().unwrap_or_default()),
                        "Duplicate local action id",
                    )),
                    ctx,
                )?;
            }
            ctx.charge_work(
                name.len().saturating_mul(seen_names.len() + 2),
                path.clone(),
            )?;
            if !seen_names.insert(name) {
                add_diagnostic_metered(
                    &mut out.validation,
                    diagnostic(fail(
                        "ACTION_IDENTITY",
                        format!("{}/name", path.to_utf8().unwrap_or_default()),
                        "Duplicate local action name",
                    )),
                    ctx,
                )?;
            }
            let (mut obligations, diagnostics) = ordered_action_analysis(
                _resources,
                action,
                &path,
                document,
                &core_diagnostics,
                ctx,
            )?;
            for item in diagnostics {
                add_diagnostic_metered(&mut out.validation, item, ctx)?;
            }
            for obligation in &obligations {
                ctx.charge_work(obligation.path.len() + 32, path.clone())?;
            }
            let model_paths: Vec<Utf16> = obligations
                .iter()
                .filter(|item| item.kind == Utf16::from("model"))
                .map(|item| item.path.clone())
                .collect();
            let mut late_index = BTreeMap::new();
            let log =
                usize::BITS as usize - obligations.len().saturating_add(1).leading_zeros() as usize;
            for (index, item) in obligations.iter().enumerate() {
                ctx.charge_work(item.path.len().saturating_mul(log + 2) + 1, path.clone())?;
                late_index.insert(item.path.clone(), index);
            }
            let mut model_set = BTreeSet::<&[u16]>::new();
            let mut model_max = 0;
            for model in &model_paths {
                ctx.charge_work(model.len().saturating_mul(log + 2) + 1, path.clone())?;
                model_max = model_max.max(model.len());
                model_set.insert(model.units());
            }
            for warning in &out.validation.diagnostics {
                ctx.charge_work(warning.code.len() + warning.path.len() + 1, path.clone())?;
                if warning.severity != Severity::Warning
                    || warning
                        .code
                        .units()
                        .starts_with(Utf16::from("ACTION_").units())
                {
                    continue;
                }
                let mut reached = false;
                for end in 0..=warning.path.len() {
                    if end % 1024 == 0 {
                        ctx.charge_work(1024, path.clone())?;
                    }
                    if end == warning.path.len() || warning.path.units()[end] == 47 {
                        ctx.charge_work(model_max.saturating_mul(log + 2) + 1, path.clone())?;
                        if model_set.contains(&warning.path.units()[..end]) {
                            reached = true;
                            break;
                        }
                    }
                }
                if reached {
                    ctx.charge_work(
                        warning.path.len().saturating_mul(log + 3) + 32,
                        path.clone(),
                    )?;
                    if let Some(index) = late_index.get(&warning.path).copied() {
                        obligations[index].kind = Utf16::from("unknown");
                        obligations[index].status = Utf16::from("unchecked");
                    } else {
                        late_index.insert(warning.path.clone(), obligations.len());
                        obligations.push(ActionObligation {
                            path: warning.path.clone(),
                            kind: Utf16::from("unknown"),
                            status: Utf16::from("unchecked"),
                        });
                    }
                }
            }
            let mut vocabularies = vec![Utf16::from("umf.actions")];
            for model_path in &model_paths {
                ctx.charge_work(model_path.len() + 1, path.clone())?;
                let parts: Vec<String> = model_path
                    .to_utf8()
                    .unwrap_or_default()
                    .split('/')
                    .map(str::to_owned)
                    .collect();
                if parts.len() != 5 || parts[3] != "elements" {
                    continue;
                }
                let (Ok(module_index), Ok(element_index)) =
                    (parts[2].parse::<usize>(), parts[4].parse::<usize>())
                else {
                    continue;
                };
                let element = value::array(
                    value::get(
                        modules.get(module_index).unwrap_or(&Value::Null),
                        "elements",
                    )
                    .unwrap_or(&Value::Null),
                )
                .unwrap_or(&[])
                .get(element_index);
                if let Some(extensions) =
                    element.and_then(|element| value::get(element, "extensions"))
                {
                    for (vocabulary, _) in crate::value::js_object_members(extensions, ctx)? {
                        ctx.charge_work(
                            vocabulary.len().saturating_mul(vocabularies.len() + 2),
                            path.clone(),
                        )?;
                        if !vocabularies.contains(vocabulary) {
                            vocabularies.push(vocabulary.clone());
                        }
                    }
                }
            }
            if let Some(vocabularies_value) =
                value::get(document, "vocabularies").and_then(value::object)
            {
                for vocabulary in vocabularies {
                    if let Some(declaration) = vocabularies_value
                        .iter()
                        .find(|(name, _)| name == &vocabulary)
                        .map(|(_, value)| value)
                    {
                        if value::object(declaration).is_some() {
                            for (member, _) in crate::value::js_object_members(declaration, ctx)? {
                                if member != &Utf16::from("version") {
                                    ctx.charge_work(
                                        vocabulary.len() + member.len(),
                                        Utf16::default(),
                                    )?;
                                    let at = action_child(
                                        &action_child(&Utf16::from("/vocabularies"), &vocabulary),
                                        member,
                                    );
                                    ctx.charge_work(
                                        at.len().saturating_mul(obligations.len() + 1),
                                        path.clone(),
                                    )?;
                                    if !late_index.contains_key(&at) {
                                        ctx.charge_work(
                                            at.len().saturating_mul(log + 3) + 1,
                                            path.clone(),
                                        )?;
                                        late_index.insert(at.clone(), obligations.len());
                                        obligations.push(ActionObligation {
                                            path: at,
                                            kind: Utf16::from("unknown"),
                                            status: Utf16::from("unchecked"),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if value::object(payload).is_some() {
                for (member, _) in crate::value::js_object_members(payload, ctx)? {
                    if member != &Utf16::from("actions") {
                        ctx.charge_work(member.len(), Utf16::default())?;
                        let at = action_child(
                            &Utf16::from(format!("/modules/{mi}/extensions/umf.actions")),
                            member,
                        );
                        ctx.charge_work(at.len().saturating_mul(log + 3) + 1, path.clone())?;
                        if !late_index.contains_key(&at) {
                            late_index.insert(at.clone(), obligations.len());
                            obligations.push(ActionObligation {
                                path: at,
                                kind: Utf16::from("unknown"),
                                status: Utf16::from("unchecked"),
                            });
                        }
                    }
                }
            }
            ctx.charge_work(
                module_id.len() + id.len() + selected.map_or(0, |s| s.len()),
                path.clone(),
            )?;
            let wanted =
                selected.map_or(true, |set| set.contains(&(module_id.clone(), id.clone())));
            if !wanted {
                continue;
            }
            ctx.charge_work(module_id.len() + 1, path.clone())?;
            out.actions.push(ActionDeclaration {
                module: module_id.clone(),
                id,
                pointer: path,
                value: admit_json(action, ctx)?,
                obligations,
            });
        }
    }
    if let Some(selected) = selected {
        for (module, action) in selected {
            ctx.charge_work(
                (module.len() + action.len() + 1).saturating_mul(out.actions.len() + 1),
                Utf16::from("/actions"),
            )?;
            if !out
                .actions
                .iter()
                .any(|item| &item.module == module && &item.id == action)
            {
                return Err(fail(
                    "REFERENCE",
                    "/actions",
                    "Selected action does not identify one local declaration",
                ));
            }
        }
    }
    out.validation.valid = !out
        .validation
        .diagnostics
        .iter()
        .any(|d| d.severity == Severity::Error);
    out.validation.complete = out.validation.valid
        && !out
            .validation
            .diagnostics
            .iter()
            .any(|d| d.severity == Severity::Warning);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{
        check_scalar_dependencies, expression_type, inspect_action_identities, inspect_rules,
        inspect_selectors, literal_is_valid, ExprFamily,
    };
    use umf_core::{Context, Utf16, Value};

    fn parse(source: &str) -> Value {
        umf_core::serialization::read_json_value(
            &Utf16::from(source).units(),
            umf_core::serialization::Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    #[test]
    fn rules_expression_type_checks_operator_families_and_boolean_result() {
        let document = parse(r#"{"modules":[]}"#);
        let action = parse(r#"{}"#);
        let mut ctx = Context::ordinary();
        let mut nodes = 0;
        let expression = parse(
            r#"{"op":"eq","args":[{"literal":{"integerToken":"2"}},{"op":"add","args":[{"literal":{"integerToken":"1"}},{"literal":{"integerToken":"1"}}]}]}"#,
        );
        let result = expression_type(
            &expression,
            &document,
            &action,
            "pre",
            "/rule",
            1,
            &mut nodes,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(result.family, ExprFamily::Boolean);
        assert!(nodes > 1);
    }

    #[test]
    fn rules_expression_type_rejects_wrong_boolean_operands() {
        let document = parse(r#"{"modules":[]}"#);
        let action = parse(r#"{}"#);
        let expression = parse(
            r#"{"op":"and","args":[{"literal":{"integerToken":"1"}},{"literal":{"boolean":true}}]}"#,
        );
        let error = expression_type(
            &expression,
            &document,
            &action,
            "pre",
            "/rule",
            1,
            &mut 0,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "ACTION_RULE_TYPE");
    }

    #[test]
    fn rules_inspector_reports_nonboolean_condition_in_order() {
        let action = parse(
            r#"{"preconditions":[{"rule":{"language":"umf.actions.rules","version":"1","expression":"{\"literal\":{\"integerToken\":\"1\"}}","references":[]}}]}"#,
        );
        let diagnostics = inspect_rules(
            &action,
            &parse(r#"{"modules":[]}"#),
            &Utf16::from("/action"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, Utf16::from("ACTION_STRUCTURE"));
        assert_eq!(
            diagnostics[0].path,
            Utf16::from("/action/preconditions/0/rule")
        );
    }

    #[test]
    fn selector_inspector_accepts_exact_entity_binding_and_rejects_missing_dependency() {
        let action = parse(
            r#"{"parameters":[{"id":"entity","kind":"entity","target":{"module":"m","element":"R","key":"primary"},"required":true}],"writes":[{"id":"w","record":{"module":"m","element":"R"},"selector":{"language":"umf.actions.keys","version":"1","expression":"{\"entity\":\"entity\"}","references":[{"parameter":"entity"}]},"maxEntities":1}]}"#,
        );
        let document = parse(
            r#"{"modules":[{"id":"m","elements":[{"id":"R","kind":"record","keys":[{"id":"primary","fields":[]}]}]}]}"#,
        );
        assert!(inspect_selectors(
            &action,
            &document,
            &Utf16::from("/action"),
            &mut Context::ordinary()
        )
        .unwrap()
        .is_empty());
        let bad = parse(
            r#"{"parameters":[{"id":"entity","kind":"entity","target":{"module":"m","element":"R","key":"primary"},"required":true}],"writes":[{"id":"w","record":{"module":"m","element":"R"},"selector":{"language":"umf.actions.keys","version":"1","expression":"{\"entity\":\"entity\"}","references":[]},"maxEntities":1}]}"#,
        );
        let diagnostics = inspect_selectors(
            &bad,
            &parse(r#"{"modules":[]}"#),
            &Utf16::from("/action"),
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            diagnostics[0].code,
            Utf16::from("ACTION_SELECTOR_DEPENDENCY")
        );
    }

    #[test]
    fn action_inspector_checks_combined_frame_identity_order() {
        let action = parse(r#"{"reads":[{"id":"same"}],"writes":[{"id":"same"}]}"#);
        let diagnostics = inspect_action_identities(&action, &Utf16::from("/action"));
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].path, Utf16::from("/action/writes/0/id"));
    }

    #[test]
    fn same_action_diagnostic_key_aggregates_distinct_messages_in_order() {
        let mut validation = umf_core::Validation {
            valid: true,
            complete: true,
            diagnostics: Vec::new(),
        };
        let item = |message: &str| umf_core::Diagnostic {
            code: Utf16::from("ACTION_UNCHECKED"),
            path: Utf16::from("/a"),
            python_source_path: false,
            message: Utf16::from(message),
            severity: umf_core::Severity::Warning,
            python_text_origin: None,
        };
        super::add_diagnostic(&mut validation, item("first"));
        super::add_diagnostic(&mut validation, item("second"));
        super::add_diagnostic(&mut validation, item("first"));
        assert_eq!(
            validation.diagnostics[0].message,
            Utf16::from("first; second")
        );
        assert!(!validation.complete);
    }

    #[test]
    fn rules_state_requires_declared_record_dependency() {
        let action = parse(
            r#"{"reads":[{"id":"r","record":{"module":"m","element":"R"},"fields":[{"module":"m","element":"F"}],"maxEntities":1}]}"#,
        );
        let document = parse(
            r#"{"modules":[{"id":"m","elements":[{"id":"R","kind":"record"},{"id":"F","kind":"field"}]}]}"#,
        );
        let expression =
            parse(r#"{"state":"pre","frame":"r","field":{"module":"m","element":"F"}}"#);
        let rule = parse(r#"{"references":[]}"#);
        let error = check_scalar_dependencies(
            &expression,
            &action,
            &document,
            &rule,
            "pre",
            "/rule",
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "ACTION_RULE_DEPENDENCY");
        let rule = parse(r#"{"references":[{"record":{"module":"m","element":"R"}}]}"#);
        assert!(check_scalar_dependencies(
            &expression,
            &action,
            &document,
            &rule,
            "pre",
            "/rule",
            &mut Context::ordinary()
        )
        .is_ok());
    }

    #[test]
    fn rules_scalar_literals_use_the_generated_domain_policy() {
        let document = parse(r#"{"modules":[]}"#);
        let field = parse(
            r#"{"kind":"field","scalarType":"boolean","cardinality":"one","nullability":"required","extensions":{}}"#,
        );
        assert!(literal_is_valid(
            &document,
            &field,
            &parse(r#"{"boolean":true}"#),
            &mut Context::ordinary()
        )
        .unwrap());
        assert!(!literal_is_valid(
            &document,
            &field,
            &parse(r#"{"string":"true"}"#),
            &mut Context::ordinary()
        )
        .unwrap());
    }
}

// The traversal follows analyzeAction in source order. All identities and paths
// remain UTF-16; conversion to UTF-8 is only used for fixed-language expressions.
fn action_child(base: &Utf16, child: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(base.len() + child.len() + 1);
    units.extend_from_slice(base.units());
    units.push(47);
    for unit in child.units() {
        match *unit {
            126 => units.extend_from_slice(&[126, 48]),
            47 => units.extend_from_slice(&[126, 49]),
            unit => units.push(unit),
        }
    }
    Utf16::new(units)
}
fn ap(base: &Utf16, child: &str) -> Utf16 {
    action_child(base, &Utf16::from(child))
}
fn av<'a>(v: &'a Value, name: &str) -> &'a Value {
    value::get(v, name).unwrap_or(&Value::Null)
}
fn aa<'a>(v: &'a Value, name: &str) -> &'a [Value] {
    value::array(av(v, name)).unwrap_or(&[])
}
fn ast(v: &Value, name: &str, expected: &str) -> bool {
    string_member(v, name) == Some(&Utf16::from(expected))
}
fn same_ref(a: &Value, b: &Value) -> bool {
    string_member(a, "module") == string_member(b, "module")
        && string_member(a, "element") == string_member(b, "element")
}
fn within(path: &Utf16, parent: &Utf16) -> bool {
    path == parent
        || path
            .units()
            .strip_prefix(parent.units())
            .is_some_and(|tail| tail.first() == Some(&47))
}
struct OrderedActionAnalysis<'a, 'b, 'c> {
    document: &'a Value,
    resources: &'a CodegenResources,
    action: &'a Value,
    path: Utf16,
    ctx: &'b mut Context<'c>,
    warnings: &'a [Diagnostic],
    visited: BTreeSet<Utf16>,
    obligations: Vec<ActionObligation>,
    obligation_index: BTreeMap<Utf16, usize>,
    diagnostic_index: BTreeMap<(Utf16, Utf16, bool), (usize, BTreeSet<Utf16>)>,
    validation: Validation,
    created: Vec<(Utf16, Value)>,
    deleted: Vec<Value>,
}
impl<'a, 'b, 'c> OrderedActionAnalysis<'a, 'b, 'c> {
    fn charge(&mut self, path: &Utf16) -> Result<(), EngineError> {
        self.ctx.charge_work(1, path.clone())
    }
    fn obligation(&mut self, path: Utf16, kind: &str, unchecked: bool) -> Result<(), EngineError> {
        let comparisons = usize::BITS as usize
            - self
                .obligation_index
                .len()
                .saturating_add(1)
                .leading_zeros() as usize;
        self.ctx.charge_work(
            path.len()
                .saturating_mul(comparisons + 3)
                .saturating_add(kind.len() + 16),
            path.clone(),
        )?;
        if let Some(index) = self.obligation_index.get(&path).copied() {
            if unchecked {
                self.obligations[index].status = Utf16::from("unchecked");
            }
        } else {
            self.obligation_index
                .insert(path.clone(), self.obligations.len());
            self.obligations.push(ActionObligation {
                path,
                kind: Utf16::from(kind),
                status: Utf16::from(if unchecked { "unchecked" } else { "checked" }),
            });
        }
        Ok(())
    }
    fn add(
        &mut self,
        code: &str,
        path: Utf16,
        message: &str,
        warning: bool,
    ) -> Result<(), EngineError> {
        self.ctx
            .charge_work(code.len() + path.len() + message.len() + 1, path.clone())?;
        self.add_text(code, path, &Utf16::from(message), warning)
    }
    fn add_text(
        &mut self,
        code: &str,
        path: Utf16,
        message: &Utf16,
        warning: bool,
    ) -> Result<(), EngineError> {
        let log = usize::BITS as usize
            - self
                .diagnostic_index
                .len()
                .saturating_add(1)
                .leading_zeros() as usize;
        self.ctx.charge_work(
            (code.len() + path.len() + message.len() + 1).saturating_mul(log + 4),
            path.clone(),
        )?;
        let key = (Utf16::from(code), path.clone(), warning);
        if let Some((index, messages)) = self.diagnostic_index.get_mut(&key) {
            self.ctx.charge_work(
                message.len().saturating_mul(messages.len() + 2),
                path.clone(),
            )?;
            if !messages.insert(message.clone()) {
                return Ok(());
            }
            let old = &mut self.validation.diagnostics[*index];
            self.ctx
                .charge_work(old.message.len() + message.len() + 2, path)?;
            let mut joined = old.message.units().to_vec();
            joined.extend([59, 32]);
            joined.extend_from_slice(message.units());
            old.message = Utf16::new(joined);
        } else {
            let mut messages = BTreeSet::new();
            messages.insert(message.clone());
            self.diagnostic_index
                .insert(key, (self.validation.diagnostics.len(), messages));
            self.validation.diagnostics.push(Diagnostic {
                code: Utf16::from(code),
                path,
                message: message.clone(),
                severity: if warning {
                    Severity::Warning
                } else {
                    Severity::Error
                },
                python_source_path: false,
                python_text_origin: None,
            });
            self.validation.valid &= warning;
            self.validation.complete &= !warning;
            self.validation.complete &= self.validation.valid;
        }
        Ok(())
    }
    fn unknown(&mut self, v: &Value, allowed: &[&str], path: &Utf16) -> Result<(), EngineError> {
        if value::object(v).is_some() {
            for (key, _) in crate::value::js_object_members(v, self.ctx)? {
                self.ctx.charge_work(
                    key.len()
                        .saturating_mul(2)
                        .saturating_add(path.len())
                        .saturating_add(1),
                    path.clone(),
                )?;
                if !allowed.iter().any(|s| key == &Utf16::from(*s)) {
                    let at = action_child(path, key);
                    self.obligation(at.clone(), "unknown", true)?;
                    self.add("ACTION_UNCHECKED", at, "Unknown relevant member", true)?;
                }
            }
        }
        Ok(())
    }
    fn model(
        &mut self,
        r: &Value,
        path: &Utf16,
        kind: Option<&'static str>,
    ) -> Result<Option<&'a Value>, EngineError> {
        // Model-reference depth is independent of JSON depth. A heap task stack
        // preserves source DFS order without recursive native/WASM calls or a
        // recursive owned tree. Tasks borrow admitted, flat model declarations.
        enum Task<'t> {
            Enter(&'t Value, Utf16, Option<&'static str>, bool),
            Key(&'t Value, Utf16),
            Reference(&'t Value, Utf16),
            Facets(&'t Value, Utf16),
        }
        self.ctx
            .charge_work(path.len().saturating_add(1), path.clone())?;
        let mut stack = vec![Task::Enter(r, path.clone(), kind, false)];
        let mut root = None;
        let mut first = true;
        while let Some(task) = stack.pop() {
            match task {
                Task::Enter(reference, at, expected, projected) => {
                    self.charge(&at)?;
                    if !projected {
                        self.unknown(reference, &["module", "element"], &at)?;
                    }
                    let mut found = None;
                    for (mi, module) in aa(self.document, "modules").iter().enumerate() {
                        self.ctx.charge_work(at.len() + 1, at.clone())?;
                        if string_member(module, "id") != string_member(reference, "module") {
                            continue;
                        }
                        for (ei, e) in aa(module, "elements").iter().enumerate() {
                            self.ctx.charge_work(at.len() + 1, at.clone())?;
                            if string_member(e, "id") == string_member(reference, "element") {
                                found = Some((e, mi, ei));
                                break;
                            }
                        }
                        break;
                    }
                    let found =
                        found.filter(|(e, _, _)| expected.is_none_or(|k| ast(e, "kind", k)));
                    if first {
                        root = found.map(|(e, _, _)| e);
                        first = false;
                    }
                    let Some((element, mi, ei)) = found else {
                        self.add(
                            "ACTION_REFERENCE",
                            at,
                            &format!(
                                "Reference must resolve an exact {}",
                                expected.unwrap_or("element")
                            ),
                            false,
                        )?;
                        continue;
                    };
                    let at = Utf16::from(format!("/modules/{mi}/elements/{ei}"));
                    self.ctx
                        .charge_work(at.len() + self.visited.len() + 1, at.clone())?;
                    if !self.visited.insert(at.clone()) {
                        continue;
                    }
                    self.obligation(at.clone(), "model", false)?;
                    self.core_warnings(&at)?;
                    self.unknown(
                        element,
                        &[
                            "id",
                            "name",
                            "description",
                            "kind",
                            "scalarType",
                            "nullability",
                            "cardinality",
                            "facets",
                            "itemType",
                            "members",
                            "keys",
                            "references",
                            "extensions",
                            "title",
                            "aliases",
                            "examples",
                            "allowedValues",
                            "default",
                        ],
                        &at,
                    )?;
                    for (key, _) in
                        crate::value::js_object_members(av(element, "extensions"), self.ctx)?
                    {
                        self.ctx
                            .charge_work(at.len() + key.len().saturating_mul(2) + 32, at.clone())?;
                        let ep = action_child(&ap(&at, "extensions"), key);
                        self.obligation(ep.clone(), "unknown", true)?;
                        self.add("ACTION_UNCHECKED",ep,"Referenced native meaning requires a separately interpreted action profile",true)?;
                    }
                    // Reverse scheduling yields members, keys, references,
                    // itemType, then facets (which are post-child in the source).
                    self.ctx.charge_work(
                        at.len()
                            + aa(element, "members").len()
                            + aa(element, "keys").len()
                            + aa(element, "references").len()
                            + 4,
                        at.clone(),
                    )?;
                    if let Some(f) = value::get(element, "facets") {
                        stack.push(Task::Facets(f, ap(&at, "facets")));
                    }
                    if let Some(item) = value::get(element, "itemType") {
                        stack.push(Task::Enter(item, ap(&at, "itemType"), Some("field"), false));
                    }
                    for (i, reference) in aa(element, "references").iter().enumerate().rev() {
                        self.ctx.charge_work(at.len() + 32, at.clone())?;
                        stack.push(Task::Reference(
                            reference,
                            ap(&ap(&at, "references"), &i.to_string()),
                        ));
                    }
                    for (i, key) in aa(element, "keys").iter().enumerate().rev() {
                        self.ctx.charge_work(at.len() + 32, at.clone())?;
                        stack.push(Task::Key(key, ap(&ap(&at, "keys"), &i.to_string())));
                    }
                    for (i, member) in aa(element, "members").iter().enumerate().rev() {
                        self.ctx.charge_work(at.len() + 32, at.clone())?;
                        stack.push(Task::Enter(
                            member,
                            ap(&ap(&at, "members"), &i.to_string()),
                            Some("field"),
                            false,
                        ));
                    }
                }
                Task::Key(key, at) => {
                    self.obligation(at.clone(), "key", false)?;
                    self.unknown(key, &["id", "name", "fields", "primary"], &at)?;
                    for (i, field) in aa(key, "fields").iter().enumerate().rev() {
                        self.ctx.charge_work(at.len() + 32, at.clone())?;
                        stack.push(Task::Enter(
                            field,
                            ap(&ap(&at, "fields"), &i.to_string()),
                            Some("field"),
                            false,
                        ));
                    }
                }
                Task::Reference(reference, at) => {
                    self.unknown(reference, &["role", "module", "element"], &at)?;
                    self.ctx.charge_work(at.len() + 1, at.clone())?;
                    stack.push(Task::Enter(reference, at, None, true));
                }
                Task::Facets(facets, at) => {
                    self.unknown(
                        facets,
                        &[
                            "length",
                            "precision",
                            "scale",
                            "integerWidth",
                            "range",
                            "collectionSize",
                        ],
                        &at,
                    )?;
                    for (k, allowed) in [
                        ("length", &["min", "max", "unit"][..]),
                        ("integerWidth", &["bits", "signed"][..]),
                        ("range", &["min", "max", "minInclusive", "maxInclusive"][..]),
                        ("collectionSize", &["min", "max"][..]),
                    ] {
                        self.charge(&at)?;
                        if let Some(v) = value::get(facets, k) {
                            self.unknown(v, allowed, &ap(&at, k))?;
                        }
                    }
                }
            }
        }
        Ok(root)
    }
    fn project_ref(r: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let mut fields = Vec::with_capacity(2);
        for key in ["module", "element"] {
            if let Some(v) = value::get(r, key) {
                fields.push((Utf16::from(key), admit_json(v, ctx)?));
            }
        }
        Ok(Value::Object(fields))
    }
    fn core_warnings(&mut self, path: &Utf16) -> Result<(), EngineError> {
        for w in self.warnings {
            self.ctx
                .charge_work(w.path.len() + path.len() + w.code.len() + 1, path.clone())?;
            if w.severity == Severity::Warning
                && w.code != Utf16::from("UNKNOWN_EXTENSION")
                && within(&w.path, path)
            {
                self.obligation(w.path.clone(), "unknown", true)?;
                self.add_text("ACTION_UNCHECKED", w.path.clone(), &w.message, true)?;
            }
        }
        Ok(())
    }
    fn field(&mut self, r: &Value, path: &Utf16) -> Result<Option<&'a Value>, EngineError> {
        let e = self.model(r, path, Some("field"))?;
        if let Some(e) = e {
            let scalar = string_member(e, "scalarType");
            let decimal = ast(e, "scalarType", "decimal");
            let facets = av(e, "facets");
            let scale = match av(facets, "scale") {
                Value::Number(n) => n.to_string().parse::<f64>().ok().is_some_and(|n| {
                    n.is_finite() && n.fract() == 0.0 && n.abs() <= 9007199254740991.0
                }),
                _ => false,
            };
            let precision = match av(facets, "precision") {
                Value::Number(n) => n.to_string().parse::<f64>().ok().is_some_and(|n| n != 0.0),
                _ => false,
            };
            if !["boolean", "integer", "decimal", "string", "binary"]
                .iter()
                .any(|s| scalar == Some(&Utf16::from(*s)))
                || !ast(e, "cardinality", "one")
                || aa(e, "references")
                    .iter()
                    .any(|r| ast(r, "role", "record-type"))
                || decimal && (!precision || !scale)
            {
                self.obligation(path.clone(), "value", true)?;
                self.add(
                    "ACTION_UNCHECKED",
                    path.clone(),
                    "Field domain is outside the initial evaluated action subset",
                    true,
                )?;
            }
        }
        Ok(e)
    }
    fn key(&mut self, r: &Value, path: &Utf16) -> Result<Option<&'a Value>, EngineError> {
        self.unknown(r, &["module", "element", "key"], path)?;
        self.charge(path)?;
        let projected = Self::project_ref(r, self.ctx)?;
        let e = self.model(&projected, path, Some("record"))?;
        if let Some(e) = e {
            let key = aa(e, "keys")
                .iter()
                .find(|k| string_member(k, "id") == string_member(r, "key"));
            if key.is_none() {
                self.add(
                    "ACTION_REFERENCE",
                    ap(path, "key"),
                    "Key does not resolve on the selected Record",
                    false,
                )?;
            }
            for f in key.map(|k| aa(k, "fields")).unwrap_or(&[]) {
                let fp = action_child(
                    &action_child(
                        &ap(path, "components"),
                        string_member(f, "module").unwrap_or(&Utf16::default()),
                    ),
                    string_member(f, "element").unwrap_or(&Utf16::default()),
                );
                self.field(f, &fp)?;
            }
        }
        Ok(e)
    }
    fn relationship(&mut self, r: &Value, path: &Utf16) -> Result<Option<&'a Value>, EngineError> {
        self.unknown(r, &["module", "relationship"], path)?;
        let mut found = None;
        for (mi, module) in aa(self.document, "modules").iter().enumerate() {
            self.charge(path)?;
            if string_member(module, "id") != string_member(r, "module") {
                continue;
            }
            for (ri, relationship) in aa(module, "relationships").iter().enumerate() {
                self.charge(path)?;
                if string_member(relationship, "id") == string_member(r, "relationship") {
                    found = Some((mi, ri, relationship));
                    break;
                }
            }
            break;
        }
        let Some((mi, ri, rel)) = found else {
            self.add(
                "ACTION_REFERENCE",
                path.clone(),
                "Relationship does not resolve",
                false,
            )?;
            return Ok(None);
        };
        let at = Utf16::from(format!("/modules/{mi}/relationships/{ri}"));
        self.charge(&at)?;
        if self.visited.insert(at.clone()) {
            self.obligation(at.clone(), "model", false)?;
            self.core_warnings(&at)?;
            self.unknown(
                rel,
                &[
                    "id",
                    "name",
                    "source",
                    "target",
                    "sourceMultiplicity",
                    "targetMultiplicity",
                    "targetLifecycle",
                    "directed",
                    "inverse",
                    "associationRecord",
                ],
                &at,
            )?;
            for group in ["source", "target"] {
                for (i, end) in aa(rel, group).iter().enumerate() {
                    let ep = ap(&ap(&at, group), &i.to_string());
                    if group == "target" {
                        self.key(end, &ep)?;
                    } else {
                        self.model(end, &ep, Some("record"))?;
                    }
                }
            }
            for group in ["sourceMultiplicity", "targetMultiplicity"] {
                self.unknown(av(rel, group), &["min", "max"], &ap(&at, group))?;
            }
            if let Some(r) = value::get(rel, "associationRecord") {
                self.model(r, &ap(&at, "associationRecord"), Some("record"))?;
            }
            if av(rel, "directed") != &Value::Bool(true)
                || !["independent", "unspecified"]
                    .iter()
                    .any(|s| ast(rel, "targetLifecycle", s))
            {
                self.obligation(at.clone(), "model", true)?;
                self.add(
                    "ACTION_UNCHECKED",
                    at,
                    "Undirected or owned-lifecycle execution is outside graph-write/1",
                    true,
                )?;
            }
        }
        Ok(Some(rel))
    }
    fn distinct(&mut self, items: &[Value], member: &str, path: &Utf16) -> Result<(), EngineError> {
        let mut seen = BTreeSet::new();
        for (i, item) in items.iter().enumerate() {
            self.charge(path)?;
            let id = string_member(item, member);
            if !seen.insert(id) {
                self.add(
                    "ACTION_IDENTITY",
                    ap(&ap(path, &i.to_string()), member),
                    "Duplicate identity",
                    false,
                )?;
            }
        }
        Ok(())
    }
    fn parameter(&self, id: Option<&Utf16>) -> Option<&'a Value> {
        aa(self.action, "parameters")
            .iter()
            .rev()
            .find(|p| string_member(p, "id") == id)
    }
    fn frame_permission(
        &mut self,
        record: &Value,
        field: Option<&Value>,
        flag: Option<&str>,
    ) -> Result<bool, EngineError> {
        for f in aa(self.action, "writes") {
            self.charge(&self.path.clone())?;
            if same_ref(av(f, "record"), record)
                && field.is_none_or(|r| aa(f, "fields").iter().any(|f| same_ref(f, r)))
                && flag.is_none_or(|k| av(f, k) == &Value::Bool(true))
            {
                return Ok(true);
            }
        }
        Ok(false)
    }
}
impl<'a, 'b, 'c> OrderedActionAnalysis<'a, 'b, 'c> {
    fn rule(
        &mut self,
        r: &Value,
        path: &Utf16,
        selector: bool,
        phase: &str,
        frame: Option<&Value>,
    ) -> Result<(), EngineError> {
        self.obligation(
            path.clone(),
            if selector { "selector" } else { "condition" },
            true,
        )?;
        self.unknown(
            r,
            &["language", "version", "expression", "references"],
            path,
        )?;
        let known = ast(r, "version", "1")
            && ast(
                r,
                "language",
                if selector {
                    "umf.actions.keys"
                } else {
                    "umf.actions.rules"
                },
            );
        let ref_unknown = aa(r, "references").iter().any(|r| {
            value::object(r).is_none_or(|v| v.len() != 1)
                || value::get(r, "record")
                    .is_some_and(|c| !exact_members(c, &["module", "element"]))
                || value::get(r, "relationship")
                    .is_some_and(|c| !exact_members(c, &["module", "relationship"]))
        });
        let envelope_unknown = value::object(r).is_some_and(|v| {
            v.iter().any(|(k, _)| {
                !["language", "version", "expression", "references"]
                    .iter()
                    .any(|s| k == &Utf16::from(*s))
            })
        }) || ref_unknown;
        self.ctx.charge_work(
            self.obligations
                .len()
                .saturating_mul(self.path.len() + path.len() + 32),
            path.clone(),
        )?;
        let dependency_unknown = self.obligations.iter().any(|o| {
            o.status == Utf16::from("unchecked")
                && (["value", "key", "model", "unknown"]
                    .iter()
                    .any(|s| o.kind == Utf16::from(*s))
                    || !within(&o.path, &self.path))
        });
        if known && !envelope_unknown && !dependency_unknown {
            let error = self.compile_rule(r, path, selector, phase, frame)?;
            if let Some((code, message)) = error {
                self.add_text(code, path.clone(), &message, false)?;
            } else if let Some(o) = self.obligations.iter_mut().find(|o| o.path == *path) {
                o.status = Utf16::from("checked");
            }
        } else {
            self.add(
                "ACTION_UNCHECKED",
                path.clone(),
                &format!(
                    "Exact {} semantics require a separately qualified profile",
                    if selector { "selector" } else { "rule" }
                ),
                true,
            )?;
        }
        for (i, r) in aa(r, "references").iter().enumerate() {
            let at = ap(&ap(path, "references"), &i.to_string());
            if value::get(r, "parameter").is_some() {
                self.unknown(r, &["parameter"], &at)?;
                if self.parameter(string_member(r, "parameter")).is_none() {
                    self.add("ACTION_REFERENCE", at, "Parameter does not resolve", false)?;
                }
            } else if value::get(r, "output").is_some() {
                self.unknown(r, &["output"], &at)?;
                if selector
                    || !aa(self.action, "outputs")
                        .iter()
                        .any(|o| string_member(o, "id") == string_member(r, "output"))
                {
                    self.add(
                        "ACTION_REFERENCE",
                        at,
                        "Output is forbidden here or does not resolve",
                        false,
                    )?;
                }
            } else if let Some(record) = value::get(r, "record") {
                self.unknown(r, &["record"], &at)?;
                self.model(record, &ap(&at, "record"), Some("record"))?;
            } else {
                self.unknown(r, &["relationship"], &at)?;
                self.relationship(av(r, "relationship"), &ap(&at, "relationship"))?;
            }
        }
        Ok(())
    }
    fn compile_rule(
        &mut self,
        r: &Value,
        path: &Utf16,
        selector: bool,
        phase: &str,
        frame: Option<&Value>,
    ) -> Result<Option<(&'static str, Utf16)>, EngineError> {
        // Consumers compile every declared reference exactly, including later
        // slots. Unknown qualifiers must never be silently discarded here.
        let mut unknowns = Vec::new();
        self.reference_positions(
            &mut |_, r, allowed| {
                if !exact_members(r, allowed) {
                    unknowns.push(());
                }
            },
            false,
        )?;
        if !unknowns.is_empty() {
            return Ok(Some((
                "ACTION_STRUCTURE",
                "UmfError: Unknown or missing expression member".into(),
            )));
        }
        if self.warnings.iter().any(|d| d.severity == Severity::Error) {
            return Ok(Some((
                "ACTION_STRUCTURE",
                if selector {
                    "UmfError: Expected valid exact core 0.10.0 document"
                } else {
                    "UmfError: Expected valid exact core 0.10.0 document"
                }
                .into(),
            )));
        }
        let duplicates = |items: Vec<&Value>| {
            let mut seen = BTreeSet::new();
            items
                .into_iter()
                .any(|v| !seen.insert(string_member(v, "id")))
        };
        if duplicates(aa(self.action, "parameters").iter().collect())
            || (!selector && duplicates(aa(self.action, "outputs").iter().collect()))
            || duplicates(
                aa(self.action, "reads")
                    .iter()
                    .chain(aa(self.action, "writes"))
                    .collect(),
            )
        {
            return Ok(Some((
                "ACTION_STRUCTURE",
                if selector {
                    "UmfError: Duplicate input/frame identity is ambiguous"
                } else {
                    "UmfError: Duplicate declaration identity is ambiguous"
                }
                .into(),
            )));
        }
        if selector {
            let f = frame.unwrap_or(&Value::Null);
            if av(f, "maxEntities") != &Value::Number(1.0) {
                return Ok(Some((
                    "ACTION_STRUCTURE",
                    "UmfError: keys/1 selects exactly one identity".into(),
                )));
            }
            if aa(r, "references").iter().any(|r| {
                value::get(r, "output").is_some()
                    || value::get(r, "record").is_some()
                    || value::get(r, "relationship").is_some()
            }) {
                return Ok(Some((
                    "ACTION_STRUCTURE",
                    "UmfError: keys/1 cannot consult outputs or business state".into(),
                )));
            }
            for reference in aa(r, "references") {
                self.charge(path)?;
                if !aa(self.action, "parameters")
                    .iter()
                    .any(|p| string_member(p, "id") == string_member(reference, "parameter"))
                {
                    return Ok(Some((
                        "ACTION_STRUCTURE",
                        "UmfError: Selector dependency must resolve a parameter".into(),
                    )));
                }
            }

            let wrapper = Value::Object(vec![
                (
                    Utf16::from("parameters"),
                    admit_json(av(self.action, "parameters"), self.ctx)?,
                ),
                (
                    Utf16::from("writes"),
                    Value::Array(vec![admit_json(f, self.ctx)?]),
                ),
            ]);
            let mut ds = inspect_selectors_bound(
                self.resources,
                &wrapper,
                self.document,
                &Utf16::default(),
                self.ctx,
            )?;
            return Ok(ds.drain(..).next().map(|d| {
                (
                    if d.code == Utf16::from("LIMIT") {
                        "LIMIT"
                    } else {
                        "ACTION_STRUCTURE"
                    },
                    d.message,
                )
            }));
        }
        let Some(text) = string_member(r, "expression") else {
            return Ok(None);
        };
        if text.is_empty() || text.len() > 65536 {
            return Ok(Some((
                "LIMIT",
                "UmfError: Expression text exceeds bounded profile".into(),
            )));
        }
        if let Err(e) = check_scalar_dependencies(
            &Value::Null,
            self.action,
            self.document,
            r,
            phase,
            &path.to_utf8().unwrap_or_default(),
            self.ctx,
        ) {
            if e.is_control_failure() {
                return Err(e);
            }
            return Ok(Some((
                if e.code == "LIMIT" {
                    "LIMIT"
                } else {
                    "ACTION_STRUCTURE"
                },
                Utf16::from(format!(
                    "UmfError: {}",
                    e.message.to_utf8().unwrap_or_default()
                )),
            )));
        }
        let parsed = match read_action_expression(text, self.ctx) {
            Ok(v) => v,
            Err(e) if e.is_control_failure() => return Err(e),
            Err(e) => {
                let (code, message) = action_parse_failure(&e);
                return Ok(Some((code, message)));
            }
        };
        let result = expression_type_checked(
            self.resources,
            &parsed,
            self.document,
            self.action,
            phase,
            &path.to_utf8().unwrap_or_default(),
            1,
            &mut 0,
            Some(r),
            self.ctx,
        );
        match result {
            Ok(t) if t.family == ExprFamily::Boolean => Ok(None),
            Ok(_) => Ok(Some((
                "ACTION_STRUCTURE",
                "UmfError: Conditions require a boolean result".into(),
            ))),
            Err(e) if e.is_control_failure() => Err(e),
            Err(e) => Ok(Some((
                if e.code == "LIMIT" {
                    "LIMIT"
                } else {
                    "ACTION_STRUCTURE"
                },
                Utf16::from(format!(
                    "UmfError: {}",
                    e.message.to_utf8().unwrap_or_default()
                )),
            ))),
        }
    }
    fn reference_positions(
        &mut self,
        visit: &mut impl FnMut(Utf16, &'a Value, &[&str]),
        include_ddd: bool,
    ) -> Result<(), EngineError> {
        for group in ["parameters", "outputs"] {
            for (i, p) in aa(self.action, group).iter().enumerate() {
                self.charge(&self.path.clone())?;
                let at = ap(&ap(&self.path, group), &i.to_string());
                if ast(p, "kind", "value") {
                    visit(ap(&at, "field"), av(p, "field"), &["module", "element"])
                } else {
                    visit(
                        ap(&at, "target"),
                        av(p, "target"),
                        &["module", "element", "key"],
                    )
                }
            }
        }
        let rule = |r: &'a Value, at: &Utf16, visit: &mut dyn FnMut(Utf16, &'a Value, &[&str])| {
            for (i, r) in aa(r, "references").iter().enumerate() {
                let at = ap(&ap(at, "references"), &i.to_string());
                if let Some(e) = value::get(r, "record") {
                    visit(ap(&at, "record"), e, &["module", "element"])
                } else if let Some(e) = value::get(r, "relationship") {
                    visit(ap(&at, "relationship"), e, &["module", "relationship"])
                }
            }
        };
        for group in ["reads", "writes"] {
            for (i, f) in aa(self.action, group).iter().enumerate() {
                self.charge(&self.path.clone())?;
                let at = ap(&ap(&self.path, group), &i.to_string());
                visit(ap(&at, "record"), av(f, "record"), &["module", "element"]);
                for (j, r) in aa(f, "fields").iter().enumerate() {
                    visit(
                        ap(&ap(&at, "fields"), &j.to_string()),
                        r,
                        &["module", "element"],
                    )
                }
                for (j, r) in aa(f, "relationships").iter().enumerate() {
                    visit(
                        ap(&ap(&at, "relationships"), &j.to_string()),
                        r,
                        &["module", "relationship"],
                    )
                }
                rule(av(f, "selector"), &ap(&at, "selector"), visit);
            }
        }
        for group in ["preconditions", "postconditions"] {
            for (i, c) in aa(self.action, group).iter().enumerate() {
                rule(
                    av(c, "rule"),
                    &ap(&ap(&ap(&self.path, group), &i.to_string()), "rule"),
                    visit,
                );
            }
        }
        for (i, e) in aa(av(self.action, "binding"), "effects").iter().enumerate() {
            self.charge(&self.path.clone())?;
            let at = ap(&ap(&ap(&self.path, "binding"), "effects"), &i.to_string());
            if ast(e, "kind", "create") {
                visit(ap(&at, "record"), av(e, "record"), &["module", "element"])
            }
            if ast(e, "kind", "create") || ast(e, "kind", "set") {
                for (j, a) in aa(e, "values").iter().enumerate() {
                    visit(
                        ap(&ap(&ap(&at, "values"), &j.to_string()), "field"),
                        av(a, "field"),
                        &["module", "element"],
                    )
                }
            }
            if ast(e, "kind", "link") || ast(e, "kind", "unlink") {
                visit(
                    ap(&at, "relationship"),
                    av(e, "relationship"),
                    &["module", "relationship"],
                )
            }
        }
        if include_ddd {
            if let Some(ddd) = value::get(self.action, "dddOperation") {
                visit(
                    ap(&self.path, "dddOperation"),
                    ddd,
                    &["module", "element", "operation"],
                )
            }
        }
        Ok(())
    }
    fn entity(&mut self, binding: &Value, path: &Utf16) -> Result<Option<Value>, EngineError> {
        self.unknown(
            binding,
            if value::get(binding, "parameter").is_some() {
                &["parameter"][..]
            } else {
                &["created"][..]
            },
            path,
        )?;
        // Object member order is significant for the original JSON.stringify
        // deleted-binding identity; Value retains that order.
        if self.deleted.iter().any(|b| b == binding) {
            self.add(
                "ACTION_EFFECT",
                path.clone(),
                "Deleted entity binding cannot be reused",
                false,
            )?;
        }
        if value::get(binding, "parameter").is_some() {
            if let Some(p) = self
                .parameter(string_member(binding, "parameter"))
                .filter(|p| ast(p, "kind", "entity"))
            {
                return Ok(Some(admit_json(av(p, "target"), self.ctx)?));
            }
            self.add(
                "ACTION_REFERENCE",
                path.clone(),
                "Entity parameter does not resolve",
                false,
            )?;
            return Ok(None);
        }
        let target = self
            .created
            .iter()
            .rev()
            .find(|(id, _)| Some(id) == string_member(binding, "created"))
            .map(|(_, t)| t);
        if let Some(t) = target {
            Ok(Some(admit_json(t, self.ctx)?))
        } else {
            self.add(
                "ACTION_EFFECT",
                path.clone(),
                "Created binding must identify an earlier create",
                false,
            )?;
            Ok(None)
        }
    }
    fn assignments(
        &mut self,
        list: &[Value],
        record: &Value,
        path: &Utf16,
        set: bool,
    ) -> Result<Vec<Value>, EngineError> {
        let e = self.model(record, path, Some("record"))?;
        let mut seen = Vec::<Value>::new();
        for (i, a) in list.iter().enumerate() {
            let at = ap(&ap(path, "values"), &i.to_string());
            self.unknown(a, &["field", "value"], &at)?;
            let reference = av(a, "field");
            let f = self.field(reference, &ap(&at, "field"))?;
            if seen.iter().any(|r| same_ref(r, reference)) {
                self.add(
                    "ACTION_IDENTITY",
                    ap(&at, "field"),
                    "Duplicate assignment",
                    false,
                )?;
            }
            seen.push(admit_json(reference, self.ctx)?);
            if e.is_some_and(|e| !aa(e, "members").iter().any(|r| same_ref(r, reference))) {
                self.add(
                    "ACTION_EFFECT",
                    ap(&at, "field"),
                    "Assignment Field is not a Record member",
                    false,
                )?;
            }
            if !self.frame_permission(record, Some(reference), None)? {
                self.add(
                    "ACTION_EFFECT",
                    ap(&at, "field"),
                    "Assignment has no declared Record/Field write permission",
                    false,
                )?;
            }
            if set
                && e.is_some_and(|e| {
                    aa(e, "keys")
                        .iter()
                        .any(|k| aa(k, "fields").iter().any(|r| same_ref(r, reference)))
                })
            {
                self.add(
                    "ACTION_EFFECT",
                    ap(&at, "field"),
                    "All Key components are immutable",
                    false,
                )?;
            }
            let v = av(a, "value");
            self.unknown(
                v,
                if value::get(v, "parameter").is_some() {
                    &["parameter"][..]
                } else {
                    &["literal"][..]
                },
                &ap(&at, "value"),
            )?;
            if value::get(v, "parameter").is_some() {
                let p = self.parameter(string_member(v, "parameter"));
                let profile = av(av(self.action, "binding"), "profile");
                if !p.is_some_and(|p| {
                    ast(p, "kind", "value")
                        && same_ref(av(p, "field"), reference)
                        && (av(p, "required") == &Value::Bool(true)
                            || (ast(profile, "id", "graph-write")
                                && ast(profile, "version", "2")
                                && f.is_some_and(|f| ast(f, "nullability", "absent-allowed"))))
                }) {
                    self.add("ACTION_EFFECT",ap(&at,"value"),"Assignment needs an exact destination Field parameter; optional assignment requires graph-write/2 and an absent-allowed Field",false)?;
                }
            } else if let Some(f) = f {
                let definition = string_member(reference, "module")
                    .zip(string_member(reference, "element"))
                    .and_then(|(m, e)| find_element(self.document, m, e))
                    .map(|(_, mi, ei)| Utf16::from(format!("/modules/{mi}/elements/{ei}")))
                    .unwrap_or_default();
                if self
                    .obligations
                    .iter()
                    .any(|o| o.status == Utf16::from("unchecked") && within(&o.path, &definition))
                {
                    self.obligation(ap(&at, "value"), "value", true)?;
                    self.add(
                        "ACTION_UNCHECKED",
                        ap(&at, "value"),
                        "Literal refinements depend on uninterpreted Field meaning",
                        true,
                    )?;
                } else {
                    let errors = action_literal_errors(
                        self.resources,
                        self.document,
                        f,
                        av(v, "literal"),
                        self.ctx,
                    )?;
                    if !errors.is_empty()
                        && ["boolean", "integer", "decimal", "string", "binary"]
                            .iter()
                            .any(|s| ast(f, "scalarType", s))
                        && ast(f, "cardinality", "one")
                    {
                        self.add(
                            "ACTION_EFFECT",
                            ap(&at, "value"),
                            &format!(
                                "UmfError: {}",
                                errors[0].message.to_utf8().unwrap_or_default()
                            ),
                            false,
                        )?;
                    }
                }
            }
        }
        Ok(seen)
    }
}
impl<'a, 'b, 'c> OrderedActionAnalysis<'a, 'b, 'c> {
    fn effects(&mut self, binding: &Value, path: &Utf16) -> Result<(), EngineError> {
        if !aa(self.action, "outputs").is_empty() {
            self.add(
                "ACTION_EFFECT",
                ap(&self.path, "outputs"),
                "graph-write/1 has no business outputs",
                false,
            )?;
        }
        self.distinct(aa(binding, "effects"), "id", &ap(path, "effects"))?;
        for (i, effect) in aa(binding, "effects").iter().enumerate() {
            let at = ap(&ap(path, "effects"), &i.to_string());
            self.obligation(at.clone(), "effect", false)?;
            if ast(effect, "kind", "create") {
                let r = av(effect, "record");
                self.charge(&at)?;
                let mut key_ref = Self::project_ref(r, self.ctx)?;
                if let Value::Object(fields) = &mut key_ref {
                    fields.push((Utf16::from("key"), admit_json(av(effect, "key"), self.ctx)?));
                }
                let keys = self.key(&key_ref, &ap(&at, "record"))?;
                let assigned = self.assignments(aa(effect, "values"), r, &at, false)?;
                self.unknown(effect, &["id", "kind", "record", "key", "values"], &at)?;
                if let Some(record) = keys {
                    for member in aa(record, "members") {
                        let f = self.model(member, &ap(&at, "record"), Some("field"))?;
                        if f.is_some_and(|f| ast(f, "nullability", "required"))
                            && !assigned.iter().any(|a| same_ref(a, member))
                        {
                            self.add(
                                "ACTION_EFFECT",
                                ap(&at, "values"),
                                "Create must explicitly assign required Record members",
                                false,
                            )?;
                        }
                    }
                    for k in aa(record, "keys")
                        .iter()
                        .filter(|k| string_member(k, "id") == string_member(effect, "key"))
                    {
                        for f in aa(k, "fields") {
                            if !assigned.iter().any(|a| same_ref(a, f)) {
                                self.add(
                                    "ACTION_EFFECT",
                                    ap(&at, "values"),
                                    "Create must explicitly assign every Key component",
                                    false,
                                )?;
                            }
                        }
                    }
                }
                if !self.frame_permission(r, None, Some("create"))? {
                    self.add(
                        "ACTION_EFFECT",
                        at.clone(),
                        "Creation has no declared Record create permission",
                        false,
                    )?;
                }
                if let Some(id) = string_member(effect, "id") {
                    self.ctx.charge_work(id.len(), at.clone())?;
                    self.created.push((id.clone(), key_ref));
                }
            } else if ast(effect, "kind", "set") || ast(effect, "kind", "delete") {
                let set = ast(effect, "kind", "set");
                self.unknown(
                    effect,
                    if set {
                        &["id", "kind", "entity", "values"][..]
                    } else {
                        &["id", "kind", "entity"][..]
                    },
                    &at,
                )?;
                let entity = av(effect, "entity");
                let target = self.entity(entity, &ap(&at, "entity"))?;
                if set {
                    if let Some(t) = target {
                        self.charge(&at)?;
                        let record = Self::project_ref(&t, self.ctx)?;
                        self.assignments(aa(effect, "values"), &record, &at, true)?;
                    }
                } else {
                    if let Some(t) = target {
                        if !self.frame_permission(&t, None, Some("delete"))? {
                            self.add(
                                "ACTION_EFFECT",
                                at.clone(),
                                "Deletion has no declared Record delete permission",
                                false,
                            )?;
                        }
                    }
                    if value::get(entity, "created").is_some() {
                        self.add(
                            "ACTION_EFFECT",
                            at.clone(),
                            "Created entities cannot be deleted in the same action",
                            false,
                        )?;
                    }
                    self.deleted.push(admit_json(entity, self.ctx)?);
                }
            } else if ast(effect, "kind", "link") || ast(effect, "kind", "unlink") {
                self.unknown(
                    effect,
                    &[
                        "id",
                        "kind",
                        "relationship",
                        "source",
                        "target",
                        "association",
                    ],
                    &at,
                )?;
                let relationship = av(effect, "relationship");
                let rel = self.relationship(relationship, &ap(&at, "relationship"))?;
                let source = self.entity(av(effect, "source"), &ap(&at, "source"))?;
                let target = self.entity(av(effect, "target"), &ap(&at, "target"))?;
                if let Some(s) = &source {
                    let mut permitted = false;
                    for f in aa(self.action, "writes") {
                        self.charge(&at)?;
                        if same_ref(av(f, "record"), s)
                            && aa(f, "relationships").iter().any(|r| {
                                string_member(r, "module") == string_member(relationship, "module")
                                    && string_member(r, "relationship")
                                        == string_member(relationship, "relationship")
                            })
                        {
                            permitted = true;
                            break;
                        }
                    }
                    if !permitted {
                        self.add(
                            "ACTION_EFFECT",
                            at.clone(),
                            "Association effect has no source relationship write permission",
                            false,
                        )?;
                    }
                }
                if let Some(t) = &target {
                    if !aa(self.action, "reads")
                        .iter()
                        .chain(aa(self.action, "writes"))
                        .any(|f| same_ref(av(f, "record"), t))
                    {
                        self.add(
                            "ACTION_EFFECT",
                            ap(&at, "target"),
                            "Association target requires a frozen declared frame",
                            false,
                        )?;
                    }
                }
                if let Some(rel) = rel {
                    if source
                        .as_ref()
                        .is_some_and(|s| !aa(rel, "source").iter().any(|r| same_ref(r, s)))
                    {
                        self.add(
                            "ACTION_EFFECT",
                            ap(&at, "source"),
                            "Source binding must match authored orientation",
                            false,
                        )?;
                    }
                    if target.as_ref().is_some_and(|t| {
                        !aa(rel, "target").iter().any(|r| {
                            same_ref(r, t) && string_member(r, "key") == string_member(t, "key")
                        })
                    }) {
                        self.add(
                            "ACTION_EFFECT",
                            ap(&at, "target"),
                            "Target binding must match authored orientation and Key",
                            false,
                        )?;
                    }
                    if let Some(record) = value::get(rel, "associationRecord") {
                        if let Some(binding) = value::get(effect, "association") {
                            let a = self.entity(binding, &ap(&at, "association"))?;
                            if a.is_some_and(|a| !same_ref(&a, record)) {
                                self.add(
                                    "ACTION_EFFECT",
                                    ap(&at, "association"),
                                    "Association binding must match association Record",
                                    false,
                                )?;
                            }
                        } else {
                            self.add(
                                "ACTION_EFFECT",
                                at.clone(),
                                "Association Record requires an explicit association binding",
                                false,
                            )?;
                        }
                    } else if value::get(effect, "association").is_some() {
                        self.add(
                            "ACTION_EFFECT",
                            ap(&at, "association"),
                            "Independent set relationship has no association Record",
                            false,
                        )?;
                    }
                } else if value::get(effect, "association").is_some() {
                    self.add(
                        "ACTION_EFFECT",
                        ap(&at, "association"),
                        "Independent set relationship has no association Record",
                        false,
                    )?;
                }
            } else {
                self.obligation(at.clone(), "effect", true)?;
                self.add("ACTION_UNCHECKED", at, "Unknown future effect kind", true)?;
            }
        }
        Ok(())
    }
    fn run(&mut self) -> Result<(), EngineError> {
        let path = self.path.clone();
        let action = self.action;
        let mut positions = Vec::new();
        self.reference_positions(
            &mut |p, r, allowed| {
                positions.push((
                    p,
                    r,
                    allowed.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
                ))
            },
            true,
        )?;
        for (p, r, allowed) in positions {
            self.unknown(
                &r,
                &allowed.iter().map(String::as_str).collect::<Vec<_>>(),
                &p,
            )?;
        }
        self.unknown(
            action,
            &[
                "id",
                "name",
                "description",
                "parameters",
                "outputs",
                "preconditions",
                "postconditions",
                "reads",
                "writes",
                "binding",
                "failures",
                "authorization",
                "attribution",
                "atomicity",
                "idempotency",
                "result",
                "dddOperation",
            ],
            &path,
        )?;
        for group in ["parameters", "outputs"] {
            let gp = ap(&path, group);
            self.distinct(aa(action, group), "id", &gp)?;
            for (i, p) in aa(action, group).iter().enumerate() {
                let at = ap(&gp, &i.to_string());
                let val = ast(p, "kind", "value");
                self.obligation(
                    at.clone(),
                    if group == "outputs" {
                        "output"
                    } else if val {
                        "value"
                    } else {
                        "key"
                    },
                    false,
                )?;
                self.unknown(
                    p,
                    if val {
                        &["id", "kind", "field", "required"][..]
                    } else {
                        &["id", "kind", "target", "required"][..]
                    },
                    &at,
                )?;
                if val {
                    self.field(av(p, "field"), &ap(&at, "field"))?;
                } else {
                    self.key(av(p, "target"), &ap(&at, "target"))?;
                }
            }
        }
        for groups in [["reads", "writes"], ["preconditions", "postconditions"]] {
            let mut seen = BTreeSet::new();
            for group in groups {
                for (i, e) in aa(action, group).iter().enumerate() {
                    self.charge(&path)?;
                    if !seen.insert(string_member(e, "id")) {
                        self.add(
                            "ACTION_IDENTITY",
                            ap(&ap(&ap(&path, group), &i.to_string()), "id"),
                            "Duplicate combined identity",
                            false,
                        )?;
                    }
                }
            }
        }
        if aa(action, "preconditions").len() + aa(action, "postconditions").len() > 128 {
            self.add(
                "LIMIT",
                ap(&path, "postconditions"),
                "At most 128 combined conditions",
                false,
            )?;
        }
        self.distinct(aa(action, "failures"), "code", &ap(&path, "failures"))?;
        for group in ["reads", "writes"] {
            for (i, f) in aa(action, group).iter().enumerate() {
                let at = ap(&ap(&path, group), &i.to_string());
                self.obligation(at.clone(), "frame", false)?;
                self.unknown(
                    f,
                    &[
                        "id",
                        "record",
                        "selector",
                        "maxEntities",
                        "fields",
                        "relationships",
                        "create",
                        "delete",
                    ],
                    &at,
                )?;
                let e = self.model(av(f, "record"), &ap(&at, "record"), Some("record"))?;
                self.rule(
                    av(f, "selector"),
                    &ap(&at, "selector"),
                    true,
                    "pre",
                    Some(f),
                )?;
                if group == "reads"
                    && (av(f, "create") == &Value::Bool(true)
                        || av(f, "delete") == &Value::Bool(true))
                {
                    self.add(
                        "ACTION_EFFECT",
                        at.clone(),
                        "Read frames cannot permit creation/deletion",
                        false,
                    )?;
                }
                let mut seen = Vec::<&Value>::new();
                for (j, r) in aa(f, "fields").iter().enumerate() {
                    let rp = ap(&ap(&at, "fields"), &j.to_string());
                    self.field(r, &rp)?;
                    if seen.iter().any(|s| same_ref(s, r)) {
                        self.add(
                            "ACTION_IDENTITY",
                            rp.clone(),
                            "Duplicate frame field",
                            false,
                        )?;
                    }
                    seen.push(r);
                    if e.is_some_and(|e| !aa(e, "members").iter().any(|m| same_ref(m, r))) {
                        self.add(
                            "ACTION_REFERENCE",
                            rp,
                            "Field is not a member of frame Record",
                            false,
                        )?;
                    }
                }
                let mut seen = BTreeSet::new();
                for (j, r) in aa(f, "relationships").iter().enumerate() {
                    let rp = ap(&ap(&at, "relationships"), &j.to_string());
                    let rel = self.relationship(r, &rp)?;
                    if rel.is_some_and(|rel| {
                        !aa(rel, "source")
                            .iter()
                            .chain(aa(rel, "target"))
                            .any(|r| same_ref(r, av(f, "record")))
                    }) {
                        self.add(
                            "ACTION_REFERENCE",
                            rp.clone(),
                            "Frame Record must be a relationship endpoint",
                            false,
                        )?;
                    }
                    if !seen.insert((string_member(r, "module"), string_member(r, "relationship")))
                    {
                        self.add("ACTION_IDENTITY", rp, "Duplicate frame relationship", false)?;
                    }
                }
            }
        }
        let mut codes = BTreeSet::new();
        for group in ["preconditions", "postconditions"] {
            for (i, c) in aa(action, group).iter().enumerate() {
                let at = ap(&ap(&path, group), &i.to_string());
                self.obligation(at.clone(), "condition", false)?;
                self.unknown(c, &["id", "rule", "failure"], &at)?;
                let failure = av(c, "failure");
                self.unknown(failure, &["code", "message"], &ap(&at, "failure"))?;
                if !codes.insert(string_member(failure, "code")) {
                    self.add(
                        "ACTION_IDENTITY",
                        ap(&ap(&at, "failure"), "code"),
                        "Condition failure codes must be distinct",
                        false,
                    )?;
                }
                if !aa(action, "failures").iter().any(|f| {
                    string_member(f, "code") == string_member(failure, "code")
                        && string_member(f, "message") == string_member(failure, "message")
                }) {
                    self.add(
                        "ACTION_REFERENCE",
                        ap(&at, "failure"),
                        "Condition failure must match a declared code and message",
                        false,
                    )?;
                }
                self.rule(
                    av(c, "rule"),
                    &ap(&at, "rule"),
                    false,
                    if group == "preconditions" {
                        "pre"
                    } else {
                        "post"
                    },
                    None,
                )?;
                if group == "preconditions"
                    && aa(av(c, "rule"), "references")
                        .iter()
                        .any(|r| value::get(r, "output").is_some())
                {
                    self.add(
                        "ACTION_REFERENCE",
                        ap(&ap(&at, "rule"), "references"),
                        "Preconditions cannot reference outputs",
                        false,
                    )?;
                }
            }
        }
        for (i, f) in aa(action, "failures").iter().enumerate() {
            let at = ap(&ap(&path, "failures"), &i.to_string());
            self.obligation(at.clone(), "failure", false)?;
            self.unknown(f, &["code", "message", "retryable"], &at)?;
        }
        for member in [
            "authorization",
            "attribution",
            "atomicity",
            "idempotency",
            "result",
        ] {
            self.obligation(ap(&path, member), member, false)?;
        }
        self.unknown(
            av(action, "result"),
            &["identities", "version", "receipt"],
            &ap(&path, "result"),
        )?;
        let attribution = av(action, "attribution");
        let local_actor = ast(attribution, "subject", "actor-profile")
            && ast(av(attribution, "profile"), "id", "umf.actions.local-owner")
            && ast(av(attribution, "profile"), "version", "1");
        self.unknown(
            attribution,
            if ast(attribution, "subject", "person-required") {
                &["subject"][..]
            } else {
                &["subject", "profile"][..]
            },
            &ap(&path, "attribution"),
        )?;
        if ast(attribution, "subject", "actor-profile") {
            self.unknown(
                av(attribution, "profile"),
                &["id", "version"],
                &ap(&ap(&path, "attribution"), "profile"),
            )?;
            if !local_actor {
                self.obligation(ap(&path, "attribution"), "attribution", true)?;
                self.add(
                    "ACTION_UNCHECKED",
                    ap(&path, "attribution"),
                    "Actor semantics require exact qualification",
                    true,
                )?;
            }
        }
        let auth = av(action, "authorization");
        let local_policy = ast(auth, "kind", "policy")
            && ast(av(auth, "profile"), "id", "umf.actions.local-store-owner")
            && ast(av(auth, "profile"), "version", "1");
        self.unknown(
            auth,
            if ast(auth, "kind", "roles") {
                &["kind", "profile", "roles"][..]
            } else {
                &["kind", "profile", "resources"][..]
            },
            &ap(&path, "authorization"),
        )?;
        self.unknown(
            av(auth, "profile"),
            &["id", "version"],
            &ap(&ap(&path, "authorization"), "profile"),
        )?;
        if ast(auth, "kind", "roles")
            && ast(av(auth, "profile"), "id", "umf.actions.roles")
            && ast(av(auth, "profile"), "version", "1")
        {
            if aa(auth, "roles")
                .iter()
                .any(|r| matches!(r,Value::String(s)if s.len()>256))
            {
                self.add(
                    "LIMIT",
                    ap(&ap(&path, "authorization"), "roles"),
                    "roles/1 identity bound exceeded",
                    false,
                )?;
            }
        } else if !local_policy {
            self.obligation(ap(&path, "authorization"), "authorization", true)?;
            self.add(
                "ACTION_UNCHECKED",
                ap(&path, "authorization"),
                "Authorization profile is an inert declaration requiring exact interpretation",
                true,
            )?;
        }
        self.ctx.charge_work(
            aa(action, "reads").len() + aa(action, "writes").len(),
            path.clone(),
        )?;
        let frames: Vec<&Value> = aa(action, "reads")
            .iter()
            .chain(aa(action, "writes"))
            .collect();
        let resources = aa(auth, "resources");
        if (local_actor || local_policy)
            && !(local_actor
                && local_policy
                && frames.len() == resources.len()
                && frames
                    .iter()
                    .zip(resources)
                    .all(|(f, id)| value::get(f, "id") == Some(id)))
        {
            self.add(
                "ACTION_PROFILE",
                ap(&path, "authorization"),
                "Local owner actor/policy require the complete ordered original frame bundle",
                false,
            )?;
        }
        if ast(auth, "kind", "policy") {
            for (i, id) in resources.iter().enumerate() {
                self.charge(&path)?;
                if !frames.iter().any(|f| value::get(f, "id") == Some(id)) {
                    self.add(
                        "ACTION_REFERENCE",
                        ap(
                            &ap(&ap(&path, "authorization"), "resources"),
                            &i.to_string(),
                        ),
                        "Policy resource must resolve a frame",
                        false,
                    )?;
                }
            }
        }
        let binding = av(action, "binding");
        let bp = ap(&path, "binding");
        self.obligation(bp.clone(), "binding", false)?;
        self.unknown(
            binding,
            if ast(binding, "kind", "recipe") {
                &["kind", "profile", "effects"][..]
            } else {
                &["kind", "profile", "handler"][..]
            },
            &bp,
        )?;
        self.unknown(
            av(binding, "profile"),
            &["id", "version"],
            &ap(&bp, "profile"),
        )?;
        if ast(binding, "kind", "handler") {
            self.obligation(ap(&bp, "handler"), "handler", true)?;
            self.unknown(
                av(binding, "handler"),
                &["id", "version"],
                &ap(&bp, "handler"),
            )?;
            self.add(
                "ACTION_UNCHECKED",
                ap(&bp, "handler"),
                "Handler identity is inert and requires exact qualification",
                true,
            )?;
        } else {
            self.effects(binding, &bp)?;
        }
        if let Some(ddd) = value::get(action, "dddOperation") {
            let at = ap(&path, "dddOperation");
            self.unknown(ddd, &["module", "element", "operation"], &at)?;
            self.charge(&at)?;
            let reference = Self::project_ref(ddd, self.ctx)?;
            let e = self.model(&reference, &at, None)?;
            let ext = e.map(|e| av(av(e, "extensions"), "umf.ddd"));
            if !ext.is_some_and(|d| {
                ast(d, "kind", "domain-service")
                    && aa(d, "operations")
                        .iter()
                        .any(|o| string_member(o, "name") == string_member(ddd, "operation"))
            }) {
                self.add(
                    "ACTION_REFERENCE",
                    at,
                    "Explicit DDD service operation must resolve",
                    false,
                )?;
            }
        }
        Ok(())
    }
}
fn action_literal_errors(
    resources: &CodegenResources,
    document: &Value,
    field: &Value,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    umf_core::literal::literal_errors(
        document,
        field,
        literal,
        true,
        resources.engine().policy(),
        ctx,
    )
}
/// Standalone declaration admission used by the unified client. The package
/// payload is deliberately not inspected here: inventory/profile/native gates
/// belong to the caller, in predecessor order, before semantic analysis.
pub(crate) fn admit_unified_action(
    resources: &CodegenResources,
    raw: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut action = admit_json(raw, ctx)?;
    order_unified_action_keys(&mut action, ctx)?;
    // The declaration passed the caller's original JSON admission above.
    // Fixed-schema $ref/oneOf scaffolding must not consume its data-depth budget.
    let schema_depth = ctx.limits().max_depth.saturating_mul(4).saturating_add(32);
    let errors = ctx.with_schema_depth_allowance(schema_depth, |ctx| {
        resources
            .actions_action_compiled()
            .validate_codegen_errors(&action, ctx)
    })?;
    if !errors.is_empty() {
        let code = if errors
            .iter()
            .any(|error| matches!(error.keyword.as_str(), "maxItems" | "maxLength" | "maximum"))
        {
            "LIMIT"
        } else {
            "ACTION_STRUCTURE"
        };
        let message = unified_action_schema_errors(resources, errors, ctx)?;
        return Err(EngineError::new(code, Utf16::default(), message));
    }
    if aa(&action, "preconditions").len() + aa(&action, "postconditions").len() > 128 {
        return Err(fail("LIMIT", "", "At most 128 combined pre/postconditions"));
    }
    for group in ["preconditions", "postconditions", "reads", "writes"] {
        for entry in aa(&action, group) {
            ctx.charge_work(1, Utf16::default())?;
            let rule = av(
                entry,
                if group == "reads" || group == "writes" {
                    "selector"
                } else {
                    "rule"
                },
            );
            if string_member(rule, "expression").is_some_and(|text| text.len() > 65536) {
                return Err(fail(
                    "LIMIT",
                    "",
                    "Rule and selector text is bounded to 65536 UTF-16 units",
                ));
            }
        }
    }
    Ok(action)
}

/// Semantic analysis runs only after the caller's selected-profile and native
/// dependency checks. The live context owns every validation and graph counter.
pub(crate) fn analyze_unified_action(
    resources: &CodegenResources,
    document: &Value,
    action: &Value,
    analysis_path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(Vec<ActionObligation>, Vec<Diagnostic>), EngineError> {
    ctx.charge_work(analysis_path.len(), Utf16::default())?;
    let validation = resources.engine().validate_document(
        document,
        &umf_core::Registry::new(),
        &mut NoCapabilities,
        ctx,
    )?;
    ordered_action_analysis(
        resources,
        action,
        analysis_path,
        document,
        &validation.diagnostics,
        ctx,
    )
}

// copyJson observes JavaScript enumerable own-key order. Apply that local
// interpretation only to the admitted declaration, never the shared wire.
fn order_unified_action_keys(value: &mut Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    match value {
        Value::Array(items) => {
            for item in items {
                ctx.charge_work(1, Utf16::default())?;
                order_unified_action_keys(item, ctx)?;
            }
        }
        Value::Object(fields) => {
            ctx.charge_work(fields.len().saturating_mul(64), Utf16::default())?;
            let mut numeric = std::collections::BTreeMap::new();
            let mut other = Vec::with_capacity(fields.len());
            for field in std::mem::take(fields) {
                ctx.charge_work(1, Utf16::default())?;
                let units = field.0.units();
                let mut number = 0u64;
                let mut index =
                    !units.is_empty() && units.len() <= 10 && (units.len() == 1 || units[0] != 48);
                if index {
                    for unit in units {
                        if !(48..=57).contains(unit) {
                            index = false;
                            break;
                        }
                        number = number * 10 + u64::from(unit - 48);
                    }
                }
                if index && number < u64::from(u32::MAX) {
                    numeric.insert(number, field);
                } else {
                    other.push(field);
                }
            }
            fields.reserve(numeric.len() + other.len());
            fields.extend(numeric.into_values());
            fields.extend(other);
            for (_, child) in fields {
                ctx.charge_work(1, Utf16::default())?;
                order_unified_action_keys(child, ctx)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn unified_action_schema_errors(
    resources: &CodegenResources,
    errors: Vec<umf_core::schema::StructuralError>,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    // Ajv emits referenced schemas with further references as separately
    // compiled functions rooted at '#'. Reference-free definitions are inlined
    // and retain their local $defs path. Preserve that presentation without
    // changing the portable validator's own schema-path contract.
    let mut roots = Vec::new();
    for (name, definition) in
        crate::value::js_object_members(av(resources.actions_schema(), "$defs"), ctx)?
    {
        let mut pending = vec![definition];
        let mut reference = false;
        while let Some(value) = pending.pop() {
            ctx.charge_work(1, Utf16::default())?;
            match value {
                Value::Object(fields) => {
                    ctx.charge_work(fields.len(), Utf16::default())?;
                    for (key, child) in fields {
                        if key == &Utf16::from("$ref") {
                            reference = true;
                        }
                        pending.push(child);
                    }
                }
                Value::Array(items) => {
                    ctx.charge_work(items.len(), Utf16::default())?;
                    pending.extend(items);
                }
                _ => {}
            }
        }
        if reference {
            ctx.charge_work(name.len().saturating_mul(2) + 10, Utf16::default())?;
            roots.push(action_child(&Utf16::from("#/$defs"), name));
        }
    }
    ctx.charge_work(errors.len().saturating_mul(6), Utf16::default())?;
    let mut formatted = Vec::with_capacity(errors.len());
    for error in errors {
        ctx.charge_work(
            error.instance_path.len()
                + error.schema_path.len()
                + error.message.len()
                + error.keyword.len()
                + error.compiler_property_name.as_ref().map_or(0, Utf16::len)
                + 80,
            Utf16::default(),
        )?;
        let mut schema_path = error.schema_path;
        for root in &roots {
            ctx.charge_work(root.len(), Utf16::default())?;
            if schema_path.units().starts_with(root.units())
                && (schema_path.len() == root.len()
                    || schema_path.units().get(root.len()) == Some(&47))
            {
                let mut projected = vec![35];
                projected.extend_from_slice(&schema_path.units()[root.len()..]);
                schema_path = Utf16::new(projected);
                break;
            }
        }
        let custom = matches!(error.keyword.as_str(), "const" | "enum" | "uniqueItems");
        let mut params = if custom {
            Value::Object(vec![])
        } else {
            error.params
        };
        let mut message = error.message;
        if custom {
            message = Utf16::from(format!(
                "must pass \"{}\" keyword validation",
                error.keyword
            ));
        } else if matches!(error.keyword.as_str(), "minLength" | "maxLength") {
            if let Some(text) = message.units().strip_suffix(Utf16::from(" length").units()) {
                let mut units = text.to_vec();
                units.extend(" characters".encode_utf16());
                message = Utf16::new(units);
            }
        } else if error.keyword == "pattern" {
            if let Some(pattern) = message
                .units()
                .strip_prefix(Utf16::from("must match pattern '").units())
                .and_then(|p| p.strip_suffix(&[39]))
            {
                let mut units = Utf16::from("must match pattern \"").into_units();
                units.extend_from_slice(pattern);
                units.push(34);
                message = Utf16::new(units);
            }
        }
        if matches!(
            error.keyword.as_str(),
            "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum"
        ) {
            if let Value::Object(fields) = &mut params {
                for (key, value) in fields {
                    if key == &Utf16::from("comparison") {
                        if let Value::String(text) = value {
                            if let Some(rest) =
                                text.units().strip_prefix(Utf16::from("must be ").units())
                            {
                                *text = Utf16::new(rest.to_vec());
                            }
                        }
                    }
                }
            }
            if let Some(rest) = message
                .units()
                .strip_prefix(Utf16::from("must be must be ").units())
            {
                let mut units = Utf16::from("must be ").into_units();
                units.extend_from_slice(rest);
                message = Utf16::new(units);
            }
        }
        let mut fields = vec![
            (
                Utf16::from("instancePath"),
                Value::String(error.instance_path),
            ),
            (Utf16::from("schemaPath"), Value::String(schema_path)),
            (Utf16::from("keyword"), Value::string_utf8(error.keyword)),
            (Utf16::from("params"), params),
            (Utf16::from("message"), Value::String(message)),
        ];
        if let Some(name) = error.compiler_property_name {
            fields.push((Utf16::from("propertyName"), Value::String(name)));
        }
        formatted.push(Value::Object(fields));
    }
    umf_core::serialization::stringify_compact_metered(&Value::Array(formatted), ctx)
}

fn ordered_action_analysis(
    resources: &CodegenResources,
    action: &Value,
    path: &Utf16,
    document: &Value,
    warnings: &[Diagnostic],
    ctx: &mut Context<'_>,
) -> Result<(Vec<ActionObligation>, Vec<Diagnostic>), EngineError> {
    let mut analysis = OrderedActionAnalysis {
        resources,
        document,
        action,
        path: path.clone(),
        ctx,
        warnings,
        visited: BTreeSet::new(),
        obligations: Vec::new(),
        obligation_index: BTreeMap::new(),
        diagnostic_index: BTreeMap::new(),
        validation: Validation {
            valid: true,
            complete: true,
            diagnostics: Vec::new(),
        },
        created: Vec::new(),
        deleted: Vec::new(),
    };
    analysis.run()?;
    Ok((analysis.obligations, analysis.validation.diagnostics))
}

#[cfg(test)]
mod action_closure_tests {
    use super::*;
    fn parse(s: &str) -> Value {
        read_source_value(
            &Utf16::from(s),
            umf_core::serialization::Format::Json,
            &mut Context::catalog(),
        )
        .unwrap()
    }
    fn obj(m: Vec<(&str, Value)>) -> Value {
        Value::Object(m.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
    }
    pub(super) fn resources() -> CodegenResources {
        resources_with(|_, _| {})
    }
    fn resources_with(change: impl FnOnce(&mut Value, &mut Value)) -> CodegenResources {
        let tables = parse(include_str!(
            "../../../../spec/extensions/tables/package.json"
        ));
        let mut actions = parse(include_str!(
            "../../../../spec/extensions/actions/package.json"
        ));
        let mut policy = parse(include_str!(
            "../../../../spec/metamodel/generated/domain-policy.json"
        ));
        change(&mut actions, &mut policy);
        let ts = av(&tables, "schema").clone();
        let ac = av(&actions, "schema").clone();
        CodegenResources::new(
            umf_core::ResourceSet::new(
                parse(include_str!("../../../../spec/core/schema.json")),
                parse(include_str!(
                    "../../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse(include_str!(
                    "../../../../spec/core/extension-package.schema.json"
                )),
                parse(include_str!(
                    "../../../../spec/metamodel/generated/core-constraints.json"
                )),
                policy,
            ),
            tables,
            ts,
            actions,
            ac,
            parse(include_str!(
                "../../../../spec/extensions/binding/package.json"
            )),
            parse(include_str!(
                "../../../../spec/extensions/binding-stable/package.json"
            )),
            &mut Context::catalog(),
        )
        .unwrap()
    }
    fn result(obligations: Vec<ActionObligation>, diagnostics: Vec<Diagnostic>) -> Value {
        obj(vec![
            (
                "obligations",
                Value::Array(
                    obligations
                        .into_iter()
                        .map(|o| {
                            obj(vec![
                                ("id", Value::String(o.path.clone())),
                                ("path", Value::String(o.path)),
                                ("kind", Value::String(o.kind)),
                                ("status", Value::String(o.status)),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "diagnostics",
                Value::Array(
                    diagnostics
                        .into_iter()
                        .map(|d| {
                            obj(vec![
                                ("code", Value::String(d.code)),
                                ("path", Value::String(d.path)),
                                ("message", Value::String(d.message)),
                                (
                                    "severity",
                                    Value::string_utf8(if d.severity == Severity::Warning {
                                        "warning"
                                    } else {
                                        "error"
                                    }),
                                ),
                            ])
                        })
                        .collect(),
                ),
            ),
        ])
    }
    #[test]
    fn unified_action_admission_uses_the_explicit_action_definition() {
        let packet=parse(include_str!("../../../../tests/rust-core/fixtures/r3/sol-unified-action-admission/analysis.json"));
        let action = av(aa(&packet, "cases").last().unwrap(), "raw");
        assert!(admit_unified_action(&resources(), action, &mut Context::ordinary()).is_ok());
        let altered = resources_with(|actions, _| {
            let Value::Object(package) = actions else {
                panic!("package")
            };
            let schema = &mut package
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("schema"))
                .unwrap()
                .1;
            let Value::Object(schema) = schema else {
                panic!("schema")
            };
            let defs = &mut schema
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("$defs"))
                .unwrap()
                .1;
            let Value::Object(defs) = defs else {
                panic!("defs")
            };
            defs.iter_mut()
                .find(|(k, _)| k == &Utf16::from("action"))
                .unwrap()
                .1 = Value::Bool(false);
        });
        let error = admit_unified_action(&altered, action, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "ACTION_STRUCTURE");
        assert_eq!(
            error.message,
            Utf16::from(
                r##"[{"instancePath":"","schemaPath":"#/$defs/action/false schema","keyword":"false schema","params":{},"message":"boolean schema is false"}]"##
            )
        );
        let named = resources_with(|actions, _| {
            let Value::Object(package) = actions else {
                panic!("package")
            };
            let Value::Object(schema) = &mut package
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("schema"))
                .unwrap()
                .1
            else {
                panic!("schema")
            };
            let Value::Object(defs) = &mut schema
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("$defs"))
                .unwrap()
                .1
            else {
                panic!("defs")
            };
            defs.iter_mut()
                .find(|(k, _)| k == &Utf16::from("action"))
                .unwrap()
                .1 = parse(r##"{"type":"object","propertyNames":{"pattern":"^[a-z]+$"}}"##);
        });
        let error = admit_unified_action(
            &named,
            &obj(vec![("badKey", Value::Bool(true))]),
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(
            error.message,
            Utf16::from(
                r##"[{"instancePath":"","schemaPath":"#/$defs/action/propertyNames/pattern","keyword":"pattern","params":{"pattern":"^[a-z]+$"},"message":"must match pattern \"^[a-z]+$\"","propertyName":"badKey"},{"instancePath":"","schemaPath":"#/$defs/action/propertyNames","keyword":"propertyNames","params":{"propertyName":"badKey"},"message":"property name must be valid"}]"##
            )
        );
    }

    #[test]
    fn unified_action_helpers_retain_late_control_origin_and_depth_scope() {
        let resources = resources();
        let corpus=parse(include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/qualified-analysis.json"));
        let case = &aa(&corpus, "cases")[0];
        let action = av(case, "action");
        let document = av(case, "document");
        for analyze in [false, true] {
            let invoke = |ctx: &mut Context<'_>| -> Result<(), EngineError> {
                if analyze {
                    analyze_unified_action(
                        &resources,
                        document,
                        action,
                        &Utf16::from("/action"),
                        ctx,
                    )?;
                } else {
                    admit_unified_action(&resources, action, ctx)?;
                }
                Ok(())
            };
            let mut observed = Context::ordinary();
            invoke(&mut observed).unwrap();
            for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
                let mut charged = 0u64;
                let mut meter = |amount: usize| {
                    charged += amount as u64;
                    if charged > observed.charged_work() * 3 / 4 {
                        Err(EngineError::new(
                            code,
                            Utf16::from("/host"),
                            "late unified helper",
                        ))
                    } else {
                        Ok(())
                    }
                };
                let mut context = Context::ordinary().with_meter(&mut meter);
                let error = invoke(&mut context).unwrap_err();
                assert!(error.is_control_failure());
                assert_eq!(error.code, code);
                assert_eq!(error.path, Utf16::from("/host"));
                assert_eq!(context.limits().max_depth, 128);
            }
        }
    }

    #[test]
    fn unified_action_admission_matches_standalone_predecessor_schema_errors() {
        let resources = resources();
        let mut mismatches = Vec::new();
        for source in [include_str!("../../../../tests/rust-core/fixtures/r3/sol-unified-action-admission/analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-unified-action-admission/bounds/analysis.json")] {
        let packet=parse(source);
        for case in aa(&packet, "cases") {
            let actual =
                admit_unified_action(&resources, av(case, "raw"), &mut Context::ordinary());
            let expected = av(case, "expected");
            match (actual, expected) {
                (Ok(value), Value::Null) => assert_eq!(&value, av(case, "raw")),
                (Err(error), Value::Object(_)) => {
                    if error.code != string_member(expected, "code").unwrap().to_utf8().unwrap()
                        || &error.message != string_member(expected, "message").unwrap()
                    {
                        mismatches.push(format!(
                            "{}\nactual: {}\nexpected: {}",
                            string_member(case, "id").unwrap().to_utf8().unwrap(),
                            error.message.to_utf8().unwrap(),
                            string_member(expected, "message")
                                .unwrap()
                                .to_utf8()
                                .unwrap()
                        ));
                    }
                }
                (actual, _) => mismatches.push(format!("unexpected result: {actual:?}")),
            }
        }
        }
        assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
    }

    #[test]
    fn action_literals_follow_explicit_schema_and_policy_resources() {
        fn at<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
            let Value::Object(fields) = value else {
                panic!("object")
            };
            &mut fields
                .iter_mut()
                .find(|(name, _)| name == &Utf16::from(key))
                .unwrap()
                .1
        }
        let resources = resources_with(|actions, policy| {
            *at(at(at(actions, "schema"), "$defs"), "literal") = Value::Bool(false);
            *at(at(at(at(policy, "literal"), "errors"), "family"), "message") =
                Value::string_utf8("explicit host policy diagnostic");
        });
        let literal = parse(r#"{"boolean":true}"#);
        assert!(!action_literal_wrapper(&resources, &literal, &mut Context::ordinary()).unwrap());
        let field = parse(
            r#"{"kind":"field","scalarType":"boolean","cardinality":"one","nullability":"required","extensions":{}}"#,
        );
        let bad = parse(r#"{"string":"wrong"}"#);
        let errors = action_literal_errors(
            &resources,
            &parse(r#"{"modules":[]}"#),
            &field,
            &bad,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            errors[0].message,
            Utf16::from("explicit host policy diagnostic")
        );
    }
    #[test]
    fn action_model_graph_uses_iterative_preorder_with_post_child_facets() {
        // Input JSON remains shallow while reference depth grows. No recursive
        // model() call is involved: the task vector owns only borrowed nodes and
        // short paths, so its Drop is also iterative. The graph's ordinary input
        // value budget, not the native call stack, bounds outstanding tasks.
        let count = 2048usize;
        let mut elements = Vec::new();
        for i in 0..count {
            let mut fields = vec![
                ("id", Value::string_utf8(format!("f{i}"))),
                ("kind", Value::string_utf8("field")),
                ("scalarType", Value::string_utf8("string")),
                ("nullability", Value::string_utf8("required")),
                ("cardinality", Value::string_utf8("one")),
                ("extensions", obj(vec![])),
            ];
            if i + 1 < count {
                fields.push((
                    "references",
                    Value::Array(vec![obj(vec![
                        ("role", Value::string_utf8("related")),
                        ("module", Value::string_utf8("m")),
                        ("element", Value::string_utf8(format!("f{}", i + 1))),
                    ])]),
                ));
            }
            if i == 0 {
                fields.push(("facets", obj(vec![("vendor", Value::Bool(true))])));
            }
            elements.push(obj(fields));
        }
        let document = obj(vec![(
            "modules",
            Value::Array(vec![obj(vec![
                ("id", Value::string_utf8("m")),
                ("elements", Value::Array(elements)),
            ])]),
        )]);
        let action = obj(vec![]);
        let mut ctx = Context::ordinary();
        let resources = resources();
        let mut analyzer = OrderedActionAnalysis {
            document: &document,
            resources: &resources,
            action: &action,
            path: Utf16::from("/action"),
            ctx: &mut ctx,
            warnings: &[],
            visited: BTreeSet::new(),
            obligations: Vec::new(),
            obligation_index: BTreeMap::new(),
            diagnostic_index: BTreeMap::new(),
            validation: Validation {
                valid: true,
                complete: true,
                diagnostics: Vec::new(),
            },
            created: Vec::new(),
            deleted: Vec::new(),
        };
        let reference = obj(vec![
            ("module", Value::string_utf8("m")),
            ("element", Value::string_utf8("f0")),
        ]);
        analyzer
            .model(&reference, &Utf16::from("/root"), Some("field"))
            .unwrap();
        assert_eq!(analyzer.visited.len(), count);
        for i in 0..count {
            assert_eq!(
                analyzer.obligations[i].path,
                Utf16::from(format!("/modules/0/elements/{i}"))
            );
        }
        assert_eq!(
            analyzer.obligations.last().unwrap().path,
            Utf16::from("/modules/0/elements/0/facets/vendor")
        );
    }
    #[test]
    fn action_late_control_failures_keep_host_provenance() {
        let corpus=parse(include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/qualified-analysis.json"));
        let case = &aa(&corpus, "cases")[0];
        let document = av(case, "document");
        let mut action = admit_json(av(case, "action"), &mut Context::ordinary()).unwrap();
        if let Value::Object(binding) = &mut action {
            let binding = &mut binding
                .iter_mut()
                .find(|(k, _)| k == &Utf16::from("binding"))
                .unwrap()
                .1;
            if let Value::Object(binding) = binding {
                let effects = &mut binding
                    .iter_mut()
                    .find(|(k, _)| k == &Utf16::from("effects"))
                    .unwrap()
                    .1;
                if let Value::Array(effects) = effects {
                    let sample = effects[0].clone();
                    *effects = (0..128).map(|_| sample.clone()).collect();
                }
            }
        }
        let mut observed = Context::ordinary();
        ordered_action_analysis(
            &resources(),
            &action,
            &Utf16::from("/action"),
            document,
            &[],
            &mut observed,
        )
        .unwrap();
        let target = observed.charged_work() * 3 / 4;
        for code in ["LIMIT", "NUMBER", "VALUE_INVALID"] {
            let mut work = 0u64;
            let mut meter = |n: usize| {
                work += n as u64;
                if work >= target {
                    Err(fail(code, "/host", "mid-analysis host failure"))
                } else {
                    Ok(())
                }
            };
            let error = ordered_action_analysis(
                &resources(),
                &action,
                &Utf16::from("/action"),
                document,
                &[],
                &mut Context::ordinary().with_meter(&mut meter),
            )
            .unwrap_err();
            assert!(error.is_control_failure());
            assert_eq!(error.code, code);
            assert_eq!(error.path, Utf16::from("/host"));
            assert!(work < observed.charged_work());
        }
    }
    #[test]
    fn action_ordered_analysis_matches_fifty_eight_admitted_predecessor_vectors() {
        let resources = resources();
        let mut failures = Vec::new();
        for corpus_text in [include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/qualified-analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/expression-analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/selector-analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-independent-action-review/analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-action-closure/parser-analysis.json"),include_str!("../../../../tests/rust-core/fixtures/r3/sol-independent-action-review/parser-order.json")] {let corpus=parse(corpus_text);
        for case in aa(&corpus,"cases") {let doc=av(case,"document");
            let raw_action=string_member(case,"rawActionText").map(|text|parse(&text.to_utf8().unwrap()));
            let action=raw_action.as_ref().unwrap_or(av(case,"action"));
            let (obligations,diagnostics)=analyze_unified_action(&resources,doc,action,&Utf16::from("/action"),&mut Context::ordinary()).unwrap();
            let actual=result(obligations,diagnostics);if &actual!=av(case,"expected"){failures.push(format!("{}\nactual={}\nexpected={}",string_member(case,"id").unwrap().to_utf8().unwrap(),umf_core::serialization::stringify_compact(&actual).unwrap().to_utf8().unwrap(),umf_core::serialization::stringify_compact(av(case,"expected")).unwrap().to_utf8().unwrap()));}
        }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
fn action_literal_wrapper(
    resources: &CodegenResources,
    literal: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(resources
        .actions_literal_compiled()
        .validate(literal, ctx)?
        .is_empty())
}
fn require_rule_dependency(
    rule: &Value,
    kind: &str,
    candidate: &Value,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    for r in aa(rule, "references") {
        ctx.charge_work(1, Utf16::from(path))?;
        if exact_members(r, &[kind])
            && value::get(r, kind).is_some_and(|r| {
                if kind == "record" {
                    same_ref(r, candidate)
                } else if kind == "relationship" {
                    string_member(r, "module") == string_member(candidate, "module")
                        && string_member(r, "relationship")
                            == string_member(candidate, "relationship")
                } else {
                    r == candidate
                }
            })
        {
            return Ok(());
        }
    }
    Err(action_rule_error(
        "ACTION_RULE_DEPENDENCY",
        "Expression dependency must be explicitly declared",
        path,
    ))
}
fn validate_rule_frame(
    document: &Value,
    frame: &Value,
    rule: Option<&Value>,
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let r = av(frame, "record");
    let record = string_member(r, "module")
        .zip(string_member(r, "element"))
        .and_then(|(m, e)| find_element(document, m, e))
        .map(|(e, _, _)| e)
        .filter(|e| ast(e, "kind", "record"))
        .ok_or_else(|| {
            action_rule_error(
                "ACTION_REFERENCE",
                "Exact model dependency does not resolve",
                path,
            )
        })?;
    for f in aa(frame, "fields") {
        ctx.charge_work(1, Utf16::from(path))?;
        if !aa(record, "members").iter().any(|m| same_ref(m, f)) {
            return Err(action_rule_error(
                "ACTION_RULE_FRAME",
                "Read frame must have exact Record membership and no write permissions",
                path,
            ));
        }
    }
    if av(frame, "create") == &Value::Bool(true) || av(frame, "delete") == &Value::Bool(true) {
        return Err(action_rule_error(
            "ACTION_RULE_FRAME",
            "Read frame must have exact Record membership and no write permissions",
            path,
        ));
    }
    if av(frame, "maxEntities") != &Value::Number(1.0) {
        return Err(action_rule_error(
            "ACTION_RULE_FRAME",
            "rules/1 requires exactly one frozen identity per read frame",
            path,
        ));
    }
    if let Some(rule) = rule {
        require_rule_dependency(rule, "record", r, path, ctx)?;
    }
    Ok(())
}
fn action_parse_failure(error: &EngineError) -> (&'static str, Utf16) {
    let message = if error.code == "LIMIT" {
        Utf16::from("Source structural limit exceeded")
    } else if error.code == "SYNTAX" || error.code == "JSON_PARSE" {
        Utf16::from("Invalid JSON syntax")
    } else {
        error.message.clone()
    };
    let mut units = Utf16::from("UmfError: ").into_units();
    units.extend_from_slice(message.units());
    (
        if error.code == "LIMIT" {
            "LIMIT"
        } else {
            "ACTION_STRUCTURE"
        },
        Utf16::new(units),
    )
}

fn add_diagnostic_metered(
    validation: &mut Validation,
    item: Diagnostic,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        item.code.len()
            + item.path.len()
            + item.message.len()
            + validation.diagnostics.len().saturating_mul(2)
            + 1,
        item.path.clone(),
    )?;
    for old in &validation.diagnostics {
        ctx.charge_work(
            old.code.len() + old.path.len() + item.code.len() + item.path.len() + 1,
            item.path.clone(),
        )?;
        if old.code == item.code && old.path == item.path && old.severity == item.severity {
            ctx.charge_work(
                old.message.len().saturating_mul(3) + item.message.len().saturating_mul(2) + 2,
                item.path.clone(),
            )?;
            break;
        }
    }
    add_diagnostic(validation, item);
    Ok(())
}
#[cfg(test)]
fn inspect_selectors(
    action: &Value,
    document: &Value,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    inspect_selectors_bound(
        &action_closure_tests::resources(),
        action,
        document,
        path,
        ctx,
    )
}

/// The predecessor first checks JSON grammar, then YAML duplicate keys, then
/// converts values in preorder with numeric/depth limits. This lexical state
/// stack performs only the syntax/diagnostic phases; the shared parser still
/// constructs the sole executable AST, under the original caller limits.
fn read_action_expression(text: &Utf16, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    struct Frame {
        object: bool,
        state: u8,
        keys: BTreeSet<Utf16>,
    }
    // object states:0 key-or-end,1 colon,2 value,3 comma-or-end,7 key-required
    // array states:4 value-or-end,5 comma-or-end,6 value-required
    fn syntax() -> EngineError {
        fail("SYNTAX", "", "Invalid JSON syntax")
    }
    fn value_start(frames: &mut [Frame], root: &mut bool) -> Result<(), EngineError> {
        if let Some(frame) = frames.last_mut() {
            if frame.object && frame.state == 2 {
                frame.state = 3;
            } else if !frame.object && matches!(frame.state, 4 | 6) {
                frame.state = 5;
            } else {
                return Err(syntax());
            }
        } else if *root {
            return Err(syntax());
        } else {
            *root = true;
        }
        Ok(())
    }
    let units = text.units();
    ctx.charge_work(units.len().saturating_mul(2), Utf16::default())?;
    let mut frames: Vec<Frame> = Vec::new();
    let mut root = false;
    let mut duplicates = Vec::new();
    let mut numeric: Option<(usize, EngineError)> = None;
    let mut structural = None;
    let mut values = 0usize;
    let mut i = 0;
    while i < units.len() {
        ctx.charge_work(1, Utf16::default())?;
        let unit = units[i];
        if matches!(unit, 9 | 10 | 13 | 32) {
            i += 1;
            continue;
        }
        if matches!(unit, 125 | 93) {
            let Some(frame) = frames.last() else {
                return Err(syntax());
            };
            if unit == 125 && (!frame.object || !matches!(frame.state, 0 | 3))
                || unit == 93 && (frame.object || !matches!(frame.state, 4 | 5))
            {
                return Err(syntax());
            }
            frames.pop();
            i += 1;
            continue;
        }
        if unit == 58 {
            let Some(frame) = frames.last_mut() else {
                return Err(syntax());
            };
            if !frame.object || frame.state != 1 {
                return Err(syntax());
            }
            frame.state = 2;
            i += 1;
            continue;
        }
        if unit == 44 {
            let Some(frame) = frames.last_mut() else {
                return Err(syntax());
            };
            if frame.object && frame.state == 3 {
                frame.state = 7;
            } else if !frame.object && frame.state == 5 {
                frame.state = 6;
            } else {
                return Err(syntax());
            }
            i += 1;
            continue;
        }
        let key = frames
            .last()
            .is_some_and(|f| f.object && matches!(f.state, 0 | 7));
        if key && unit != 34 {
            return Err(syntax());
        }
        let offset = i;
        if !key {
            value_start(&mut frames, &mut root)?;
            values = values.saturating_add(1);
            if structural.is_none()
                && (frames.len() > ctx.limits().max_depth || values > ctx.limits().max_values)
            {
                structural = Some(offset);
            }
        }
        if matches!(unit, 123 | 91) {
            ctx.charge_work(1, Utf16::default())?;
            frames.push(Frame {
                object: unit == 123,
                state: if unit == 123 { 0 } else { 4 },
                keys: BTreeSet::new(),
            });
            i += 1;
            continue;
        }
        if unit == 34 {
            i += 1;
            let mut closed = false;
            while i < units.len() {
                ctx.charge_work(1, Utf16::default())?;
                if units[i] == 92 {
                    i = i.saturating_add(2);
                    continue;
                }
                if units[i] == 34 {
                    i += 1;
                    closed = true;
                    break;
                }
                i += 1;
            }
            if !closed {
                return Err(syntax());
            }
            ctx.charge_work(i - offset, Utf16::default())?;
            let value = read_source_value(
                &Utf16::new(units[offset..i].to_vec()),
                umf_core::serialization::Format::Json,
                ctx,
            )?;
            if key {
                let Value::String(key) = value else {
                    return Err(syntax());
                };
                let frame = frames.last_mut().unwrap();
                let log = usize::BITS as usize
                    - frame.keys.len().saturating_add(1).leading_zeros() as usize;
                ctx.charge_work(key.len().saturating_mul(log + 2), Utf16::default())?;
                if !frame.keys.insert(key) {
                    duplicates.push(offset);
                }
                frame.state = 1;
            }
            continue;
        }
        if unit == 45 || (48..=57).contains(&unit) {
            while i < units.len() && matches!(units[i], 45 | 43 | 46 | 69 | 101 | 48..=57) {
                i += 1;
            }
            ctx.charge_work(i - offset, Utf16::default())?;
            let token = Utf16::new(units[offset..i].to_vec());
            match read_source_value(&token, umf_core::serialization::Format::Json, ctx) {
                Ok(_) => {}
                Err(e) if e.is_control_failure() => return Err(e),
                Err(e) if e.code == "NUMBER" => {
                    if numeric.is_none() {
                        let spelling = token.to_utf8().unwrap();
                        let value = spelling.parse::<f64>().ok();
                        let message = if value.is_some_and(|n| n == 0.0 && n.is_sign_negative()) {
                            "Negative zero is outside the numeric profile"
                        } else if !spelling.contains(['.', 'e', 'E']) {
                            "Integer exceeds exact JavaScript range"
                        } else if e.message == Utf16::from("Parsing would change the decimal value")
                        {
                            "Parsing would change the decimal value"
                        } else {
                            "Number outside the core interoperable numeric profile"
                        };
                        numeric = Some((offset, fail("NUMBER", "", message)));
                    }
                }
                Err(e) => return Err(e),
            }
            continue;
        }
        let keyword = match unit {
            116 => "true",
            102 => "false",
            110 => "null",
            _ => return Err(syntax()),
        };
        let expected: Vec<u16> = keyword.encode_utf16().collect();
        if !units[i..].starts_with(&expected) {
            return Err(syntax());
        }
        i += expected.len();
    }
    if !root || !frames.is_empty() {
        return Err(syntax());
    }
    if !duplicates.is_empty() {
        let mut message = Vec::new();
        for (index, offset) in duplicates.into_iter().enumerate() {
            if index > 0 {
                message.extend([59, 32]);
            }
            let part = duplicate_action_source_message(units, offset, ctx)?;
            ctx.charge_work(part.len(), Utf16::default())?;
            message.extend(part.into_units());
        }
        return Err(EngineError::new(
            "ACTION_SOURCE_DIAGNOSTIC",
            Utf16::default(),
            Utf16::new(message),
        ));
    }
    if let Some((offset, error)) = numeric {
        if structural.is_none_or(|at| offset < at) {
            return Err(error);
        }
    }
    if structural.is_some() {
        return Err(fail("LIMIT", "", "Source structural limit exceeded"));
    }
    read_source_value(text, umf_core::serialization::Format::Json, ctx)
}

pub(crate) fn selector_uses_entity_parameter(
    expression: &Utf16,
    expected_parameter: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let parsed = read_action_expression(expression, ctx)?;
    Ok(exact_members(&parsed, &["entity"])
        && string_member(&parsed, "entity") == Some(&Utf16::from(expected_parameter)))
}

fn duplicate_action_source_message(
    source: &[u16],
    offset: usize,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    ctx.charge_work(source.len().saturating_mul(2), Utf16::default())?;
    let starts: Vec<usize> = std::iter::once(0)
        .chain(
            source
                .iter()
                .enumerate()
                .filter(|(_, u)| **u == 10)
                .map(|(i, _)| i + 1),
        )
        .collect();
    let line = starts.partition_point(|start| *start <= offset);
    let start = starts[line - 1];
    let col = offset - start + 1;
    let end = starts.get(line).copied().unwrap_or(source.len());
    let mut content = source[start..end].to_vec();
    while matches!(content.last(), Some(10 | 13)) {
        content.pop();
    }
    let mut caret = col - 1;
    if caret >= 60 && content.len() > 80 {
        let trim = (caret - 39).min(content.len() - 79);
        let mut shortened = vec![0x2026];
        shortened.extend_from_slice(&content[trim..]);
        content = shortened;
        caret -= trim - 1;
    }
    if content.len() > 80 {
        content.truncate(79);
        content.push(0x2026);
    }
    if line > 1 && content[..caret.min(content.len())].iter().all(|u| *u == 32) {
        let mut previous = source[starts[line - 2]..start].to_vec();
        if previous.len() > 80 {
            previous.truncate(79);
            previous.extend([0x2026, 10]);
        }
        previous.extend(content);
        content = previous;
    }
    let mut result = Utf16::from(format!(
        "Map keys must be unique at line {line}, column {col}"
    ))
    .into_units();
    if content.iter().any(|u| *u != 32) {
        result.extend([58, 10, 10]);
        result.extend(content);
        result.push(10);
        result.extend(std::iter::repeat_n(32, caret));
        result.extend([94, 10]);
    }
    Ok(Utf16::new(result))
}

fn charge_action_lookup(
    document: &Value,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<(), EngineError> {
    for module in aa(document, "modules") {
        ctx.charge_work(
            string_member(module, "id").map_or(1, |s| s.len() + 1),
            path.clone(),
        )?;
        for element in aa(module, "elements") {
            ctx.charge_work(
                string_member(element, "id").map_or(1, |s| s.len() + 1),
                path.clone(),
            )?;
        }
    }
    Ok(())
}
