// SPDX-License-Identifier: MIT OR Apache-2.0
//! Declaration-level table lifecycle inspection helpers.
//!
//! This module is intentionally separate from PostgreSQL deployment. Inspection
//! preserves unknown source content and reports incomplete interpretation.

use crate::{
    resources::CodegenEngine,
    value::{array_items, member, object_members, string_member},
};
use std::collections::BTreeSet;
use umf_core::{
    literal::{exact_coefficient, literal_errors, literal_identity},
    Capabilities, CapabilityError, Context, Diagnostic, EngineError, SemanticContext, Severity,
    Utf16, Value,
};

impl CodegenEngine<'_> {
    /// Admit, structurally validate, and inspect table lifecycle declarations.
    /// The returned value is the stable wire-shaped inspection result used by
    /// generators and review tools; it does not qualify native execution.
    pub fn inspect_table_lifecycle(
        &self,
        input: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let source = match crate::value::admit_json(input, ctx) {
            Ok(source) => source,
            Err(error)
                if !error.is_control_failure()
                    && matches!(error.code.as_str(), "DUPLICATE_KEY" | "NUMBER" | "LIMIT") =>
            {
                let path = if error.code == "LIMIT" {
                    crate::value::source_limit_path(input, ctx)?.unwrap_or(error.path)
                } else {
                    error.path
                };
                ctx.charge_work(
                    path.len()
                        .saturating_mul(2)
                        .saturating_add(error.message.len())
                        .saturating_add(error.code.len())
                        .saturating_add(128),
                    Utf16::default(),
                )?;
                let diagnostic = diagnostic_value(&Diagnostic {
                    code: error.code.clone().into(),
                    path,
                    python_source_path: false,
                    message: if error.code == "LIMIT" {
                        Utf16::from("JSON structural limit exceeded")
                    } else {
                        error.message
                    },
                    severity: Severity::Error,
                    python_text_origin: None,
                });
                return Ok(object(vec![
                    ("valid", Value::Bool(false)),
                    ("complete", Value::Bool(false)),
                    ("diagnostics", Value::Array(vec![diagnostic])),
                    ("modules", Value::Array(vec![])),
                    ("nativeQualified", Value::Bool(false)),
                ]));
            }
            Err(error) => return Err(error),
        };
        let registration = self
            .resources()
            .tables_registry()
            .get(
                string_member(self.resources().tables_package(), "id").expect("checked resources"),
                string_member(self.resources().tables_package(), "version")
                    .expect("checked resources"),
            )
            .expect("checked resources");
        let token = registration.token().ok_or_else(|| {
            EngineError::new(
                "CODEGEN_RESOURCE_INVALID",
                Utf16::default(),
                "Table lifecycle registration has no semantic token",
            )
        })?;
        let mut capabilities = TableCapabilities {
            token,
            resources: self.resources(),
        };
        // Package schemas use recursive $ref/oneOf scaffolding in addition to
        // data descent. Raw source was already admitted above at the caller's
        // unchanged JSON depth/value limits. Give only this fixed table-schema
        // evaluation enough bounded hops for the admitted depth; forward all
        // work and cooperative controls to the same original invocation.
        let schema_depth = ctx.limits().max_depth.saturating_mul(4).saturating_add(32);
        let base = ctx.with_schema_depth_allowance(schema_depth, |ctx| {
            self.resources().engine().validate_document(
                &source,
                self.resources().tables_registry(),
                &mut capabilities,
                ctx,
            )
        })?;
        ctx.charge_work(base.diagnostics.len().saturating_mul(16), Utf16::default())?;
        let mut diagnostics = Vec::with_capacity(base.diagnostics.len());
        for entry in &base.diagnostics {
            ctx.charge_work(
                entry
                    .code
                    .len()
                    .saturating_add(entry.path.len())
                    .saturating_add(entry.message.len())
                    .saturating_mul(4)
                    .saturating_add(128),
                Utf16::default(),
            )?;
            let mut entry = entry.clone();
            if entry.code == Utf16::from("EXTENSION_STRUCTURE") {
                if entry.message == Utf16::from("must be equal to constant") {
                    entry.message = Utf16::from("must pass \"const\" keyword validation");
                } else if entry.message == Utf16::from("must be equal to one of the allowed values")
                {
                    entry.message = Utf16::from("must pass \"enum\" keyword validation");
                } else if entry.message.to_utf8().is_ok_and(|message| {
                    message.ends_with(" length")
                        && (message.starts_with("must NOT have more than ")
                            || message.starts_with("must NOT have fewer than "))
                }) {
                    let message = entry
                        .message
                        .to_utf8()
                        .expect("checked ASCII schema message");
                    entry.message = Utf16::from(format!(
                        "{} characters",
                        message.strip_suffix(" length").expect("checked suffix")
                    ));
                } else if entry
                    .message
                    .units()
                    .starts_with(&Utf16::from("must NOT have duplicate items").into_units())
                {
                    entry.message = Utf16::from("must pass \"uniqueItems\" keyword validation");
                }
            }
            diagnostics.push(diagnostic_value(&entry));
        }
        if !base.valid {
            return Ok(object(vec![
                ("valid", Value::Bool(false)),
                ("complete", Value::Bool(false)),
                ("source", source),
                ("diagnostics", Value::Array(diagnostics)),
                ("modules", Value::Array(vec![])),
                ("nativeQualified", Value::Bool(false)),
            ]));
        }
        let mut modules = Vec::new();
        if let Some(doc_modules) = array_items(member(&source, "modules").unwrap_or(&Value::Null)) {
            for module in doc_modules {
                ctx.charge_work(1, Utf16::default())?;
                let payload = member(
                    member(module, "extensions").unwrap_or(&Value::Null),
                    "umf.tables",
                );
                if let Some(payload) = payload {
                    modules.push(object(vec![
                        (
                            "module",
                            member(module, "id").cloned().unwrap_or(Value::Null),
                        ),
                        ("payload", crate::value::admit_json(payload, ctx)?),
                    ]));
                }
            }
        }
        if modules.is_empty() {
            diagnostics.push(diagnostic(
                "TABLES_DECLARATION",
                "/modules",
                "No module declares table lifecycle metadata",
                false,
            ));
        }
        if member(&source, "umf") != Some(&Value::String(Utf16::from("0.10.0"))) {
            diagnostics.push(diagnostic(
                "TABLES_CORE",
                "/umf",
                "Table lifecycle metadata requires current core0.10.0",
                false,
            ));
        }
        let valid = !diagnostics
            .iter()
            .any(|d| member(d, "severity") == Some(&Value::String(Utf16::from("error"))));
        let complete = base.complete && diagnostics.is_empty();
        Ok(object(vec![
            ("valid", Value::Bool(valid)),
            ("complete", Value::Bool(complete)),
            ("source", source),
            ("modules", Value::Array(modules)),
            ("nativeQualified", Value::Bool(false)),
            ("diagnostics", Value::Array(diagnostics)),
        ]))
    }
}

struct TableCapabilities<'a> {
    token: u64,
    resources: &'a crate::CodegenResources,
}
impl Capabilities for TableCapabilities<'_> {
    fn validate_extension(
        &mut self,
        token: u64,
        _payload: &Value,
        context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token != self.token {
            return Ok(Vec::new());
        }
        // Core invokes the context-aware override below. This fallback retains
        // the trait's host callback contract without running unmetered semantics.
        let _ = context;
        Ok(Vec::new())
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != self.token {
            return Ok(Vec::new());
        }
        inspect_module_semantics(payload, context, self.resources, ctx)
            .map_err(CapabilityError::Engine)
    }
}

fn inspect_module_semantics(
    payload: &Value,
    context: &SemanticContext,
    resources: &crate::CodegenResources,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let path = &context.path;
    if context.scope != "module"
        || !path
            .to_utf8()
            .ok()
            .and_then(|text| {
                text.strip_prefix("/modules/")?
                    .strip_suffix("/extensions/umf.tables")?
                    .parse::<usize>()
                    .ok()
            })
            .is_some_and(|index| {
                array_items(member(&context.document, "modules").unwrap_or(&Value::Null))
                    .is_some_and(|modules| index < modules.len())
            })
    {
        return Ok(vec![core_diag(
            "TABLES_SCOPE",
            path,
            "Table declarations belong to an exact module",
            Severity::Error,
        )]);
    }
    let mut nodes = 0;
    let mut out = Vec::new();
    inspect_unknown(
        payload,
        &[resources.tables_schema()],
        resources.tables_schema(),
        path,
        &mut out,
        0,
        0,
        ctx,
    )?;
    out.extend_capped(inspect_declaration(
        payload,
        &context.document,
        path,
        resources.engine().policy(),
        &mut nodes,
        ctx,
    )?);
    inspect_policies(payload, &context.document, path, &mut out, &mut nodes, ctx)?;
    inspect_seed_sets(
        payload,
        &context.document,
        path,
        &mut out,
        resources.engine().policy(),
        ctx,
    )?;
    inspect_operations(
        payload,
        &context.document,
        path,
        &mut out,
        resources.operation_compiled(),
        resources.operation_schema(),
        resources.tables_schema(),
        &mut nodes,
        resources.engine().policy(),
        ctx,
    )?;
    if out.len() > 256 {
        out.truncate(256);
        out.push_capped(core_diag(
            "TABLES_DIAGNOSTIC_LIMIT",
            path,
            "Further diagnostics omitted after 256 entries; interpretation refused",
            Severity::Error,
        ));
    }
    Ok(out)
}

fn inspect_declaration(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    policy: &umf_core::literal_policy::PreparedPolicy,
    rule_nodes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut out = Vec::new();
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    // The predecessor performs three complete inventory passes before any
    // declaration semantics. Preserve that order and each item pointer.
    for (key, label) in [
        ("id", "table ID"),
        ("name", "native table name"),
        ("record", "Record binding"),
    ] {
        let mut seen = BTreeSet::new();
        for (index, table) in tables.iter().enumerate() {
            let location = append_path(&append_path(path, "tables"), &index.to_string());
            ctx.charge_work(128, location.clone())?;
            let value = member(table, key).unwrap_or(&Value::Null);
            let identity = if key == "record" {
                ref_key(value)
            } else {
                match value {
                    Value::String(text) => text.units().to_vec(),
                    _ => Vec::new(),
                }
            };
            if !seen.insert(identity) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &location,
                    &format!("Duplicate {label}"),
                    Severity::Error,
                ));
            }
        }
    }
    let mut columns = 0usize;
    for table in tables {
        ctx.charge_work(1, path.clone())?;
        columns = columns.saturating_add(
            array_items(member(table, "columns").unwrap_or(&Value::Null))
                .map_or(0, |items| items.len()),
        );
    }
    if columns > 4096 {
        out.push_capped(core_diag(
            "TABLES_COLUMN_LIMIT",
            &append_path(path, "tables"),
            "Module column inventory exceeds 4096",
            Severity::Error,
        ));
    }
    let mut rows = 0usize;
    for set in array_items(member(payload, "seedSets").unwrap_or(&Value::Null)).unwrap_or(&[]) {
        ctx.charge_work(1, path.clone())?;
        rows = rows.saturating_add(
            array_items(member(set, "rows").unwrap_or(&Value::Null)).map_or(0, |items| items.len()),
        );
    }
    if rows > 10000 {
        out.push_capped(core_diag(
            "TABLES_SEED_LIMIT",
            &append_path(path, "seedSets"),
            "Module seed inventory exceeds 10000 rows",
            Severity::Error,
        ));
    }
    let mut relation_names = BTreeSet::new();
    for table in tables {
        if let Some(name) = string_member(table, "name") {
            ctx.charge_work(name.len(), path.clone())?;
            relation_names.insert(name.clone());
        }
    }
    for (index, table) in tables.iter().enumerate() {
        inspect_table_refs(
            table, payload, document, path, index, &mut out, policy, rule_nodes, ctx,
        )?;
        for (item_index, item) in array_items(member(table, "indexes").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            ctx.charge_work(128, path.clone())?;
            if let Some(name) = string_member(item, "name") {
                ctx.charge_work(name.len(), path.clone())?;
                if !relation_names.insert(name.clone()) {
                    out.push_capped(core_diag(
                        "TABLES_RELATION_NAME",
                        &append_path(
                            &append_path(
                                &append_path(&append_path(path, "tables"), &index.to_string()),
                                "indexes",
                            ),
                            &format!("{item_index}/name"),
                        ),
                        "Native index name collides in the schema relation namespace",
                        Severity::Error,
                    ));
                }
            }
        }
    }
    Ok(out)
}

fn inspect_column_literals(
    column: &Value,
    field: &Value,
    document: &Value,
    path: &Utf16,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    for (vi, literal) in array_items(member(field, "allowedValues").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        validate_stored_literal(
            document,
            field,
            literal,
            member(column, "nativeType").unwrap_or(&Value::Null),
            &append_path(&append_path(path, "allowedValues"), &vi.to_string()),
            policy,
            ctx,
            out,
        )?;
    }
    if let Some(default) = member(column, "default") {
        if string_member(default, "kind") == Some(&Utf16::from("literal")) {
            validate_stored_literal(
                document,
                field,
                member(default, "value").unwrap_or(&Value::Null),
                member(column, "nativeType").unwrap_or(&Value::Null),
                &append_path(&append_path(path, "default"), "value"),
                policy,
                ctx,
                out,
            )?;
        }
    }
    if member(field, "default").is_some() {
        let logical = member(field, "default").unwrap_or(&Value::Null);
        let native_identity = if let Some(native) = member(column, "default")
            .filter(|native| string_member(native, "kind") == Some(&Utf16::from("literal")))
        {
            member(native, "value")
                .map(|v| literal_identity(field, v, policy, ctx))
                .transpose()?
                .flatten()
        } else {
            None
        };
        let logical_identity = member(logical, "value")
            .map(|v| literal_identity(field, v, policy, ctx))
            .transpose()?
            .flatten();
        let matches = member(logical, "on") == Some(&Value::String(Utf16::from("missing")))
            && native_identity.is_some()
            && native_identity == logical_identity;
        if !matches {
            out.push_capped(core_diag("TABLES_LOGICAL_DEFAULT", &append_path(path, "default"), "Logical and native defaults require an explicit matching missing-only literal; other default behavior is not qualified", Severity::Warning));
        }
    }
    Ok(())
}

fn numeric_capacity_message(
    error: &EngineError,
    policy: &umf_core::literal_policy::PreparedPolicy,
) -> String {
    member(
        member(policy.value(), "diagnostics").unwrap_or(&Value::Null),
        &error.code,
    )
    .and_then(|reason| string_member(reason, "message"))
    .and_then(|text| text.to_utf8().ok())
    .unwrap_or_else(|| match error.code.as_str() {
        "numeric-rounding" => "Numeric value would require rounding".into(),
        "numeric-precision" => "Numeric value exceeds precision".into(),
        "numeric-exponent" => "Numeric exponent exceeds bounded domain".into(),
        _ => "Numeric value exceeds precision/resource limit".into(),
    })
}
fn validate_stored_literal(
    document: &Value,
    field: &Value,
    literal: &Value,
    native: &Value,
    path: &Utf16,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    ctx.charge_work(128, path.clone())?;
    let scalar = string_member(field, "scalarType")
        .and_then(|text| text.to_utf8().ok())
        .unwrap_or_default();
    let temporal = scalar == "date" || scalar == "timestamp";
    let unqualified = temporal
        && (member(field, "facets")
            .and_then(object_members)
            .is_some_and(|values| !values.is_empty())
            || array_items(member(field, "allowedValues").unwrap_or(&Value::Null))
                .is_some_and(|values| !values.is_empty()));
    if unqualified {
        out.push_capped(core_diag(
            "TABLES_TEMPORAL_QUALIFIER",
            path,
            "Temporal refinements require a separately qualified native interpretation",
            Severity::Warning,
        ));
    } else {
        let diagnostics = literal_errors(document, field, literal, !temporal, policy, ctx)?;
        if let Some(first) = diagnostics.first() {
            out.push_capped(Diagnostic {
                code: Utf16::from("TABLES_LITERAL"),
                path: path.clone(),
                message: first.message.clone(),
                severity: Severity::Error,
                python_source_path: false,
                python_text_origin: None,
            });
        } else if temporal && literal != &Value::Null {
            let text = string_member(literal, &scalar)
                .and_then(|text| text.to_utf8().ok())
                .unwrap_or_default();
            let result = if scalar == "date" {
                crate::deployment::validate_native_date(&text)
            } else {
                crate::deployment::native_instant(&text).map(|_| ())
            };
            if let Err(message) = result {
                let message = if message == "Gregorian date outside finite native year profile" {
                    "Gregorian date outside native profile"
                } else {
                    message
                };
                out.push_capped(core_diag("TABLES_LITERAL", path, message, Severity::Error));
            }
        }
    }
    if literal == &Value::Null {
        return Ok(());
    }
    let kind = string_member(native, "kind")
        .and_then(|text| text.to_utf8().ok())
        .unwrap_or_default();
    if let Some(token) = string_member(literal, "integerToken") {
        if ["int2", "int4", "int8"].contains(&kind.as_str()) {
            match exact_coefficient(token, 0, None, ctx) {
                Ok(number) => {
                    ctx.charge_work(
                        usize::try_from(number.bits() / 3)
                            .unwrap_or(usize::MAX)
                            .saturating_add(2),
                        path.clone(),
                    )?;
                    let number = number.to_string().parse::<i128>().ok();
                    let bits = if kind == "int2" {
                        16
                    } else if kind == "int4" {
                        32
                    } else {
                        64
                    };
                    if number.is_none_or(|number| {
                        number < -(1_i128 << (bits - 1)) || number >= (1_i128 << (bits - 1))
                    }) {
                        out.push_capped(core_diag(
                            "TABLES_NATIVE_CAPACITY",
                            path,
                            "Integer exceeds native signed width",
                            Severity::Error,
                        ));
                    }
                }
                Err(error) => {
                    if error.is_control_failure() {
                        return Err(error);
                    }
                    out.push_capped(core_diag(
                        "TABLES_NATIVE_CAPACITY",
                        path,
                        &numeric_capacity_message(&error, policy),
                        Severity::Error,
                    ));
                    return Ok(());
                }
            }
        }
    }
    if let Some(token) = string_member(literal, "decimalToken") {
        if kind == "numeric" {
            let scale = number_member(native, "scale").unwrap_or(0.0) as i64;
            let precision = number_member(native, "precision").unwrap_or(0.0).max(0.0) as usize;
            if let Err(error) = exact_coefficient(token, scale, Some(precision), ctx) {
                if error.is_control_failure() {
                    return Err(error);
                }
                out.push_capped(core_diag(
                    "TABLES_NATIVE_CAPACITY",
                    path,
                    &numeric_capacity_message(&error, policy),
                    Severity::Error,
                ));
                return Ok(());
            }
        }
    }
    if let Some(text) = string_member(literal, "string") {
        ctx.charge_work(text.len(), path.clone())?;
        if text.units().contains(&0) {
            out.push_capped(core_diag(
                "TABLES_NATIVE_STRING",
                path,
                "PostgreSQL text cannot store NUL",
                Severity::Error,
            ));
        }
        if ["varchar", "char"].contains(&kind.as_str()) {
            let count = char::decode_utf16(text.units().iter().copied()).count();
            let limit = number_member(native, "length").unwrap_or(0.0) as usize;
            if count > limit {
                out.push_capped(core_diag(
                    "TABLES_NATIVE_CAPACITY",
                    path,
                    "String exceeds native character capacity",
                    Severity::Error,
                ));
            }
        }
    }
    Ok(())
}

#[derive(Default)]
struct ExprType {
    kind: String,
    field: Option<Value>,
    literal: Option<Value>,
}

#[allow(clippy::too_many_arguments)]
fn inspect_expression(
    expr: &Value,
    fields: &[&Value],
    document: &Value,
    policy: &umf_core::literal_policy::PreparedPolicy,
    path: &Utf16,
    depth: usize,
    nodes: &mut usize,
    ctx: &mut Context<'_>,
    out: &mut Vec<Diagnostic>,
) -> Result<ExprType, EngineError> {
    ctx.charge_work(1, path.clone())?;
    *nodes = nodes.saturating_add(1);
    if depth > 16 || *nodes > 4096 {
        out.push_capped(core_diag(
            "TABLES_COMPLEXITY",
            path,
            "Expression/rule depth or module node budget exceeded",
            Severity::Error,
        ));
        return Ok(ExprType {
            kind: "unknown".into(),
            ..Default::default()
        });
    }
    let op = string_member(expr, "op")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    if op == "field" {
        let reference = member(expr, "field").unwrap_or(&Value::Null);
        ctx.charge_work(fields.len(), path.clone())?;
        if !fields.iter().any(|f| refs_equal(f, reference)) {
            out.push_capped(core_diag(
                "TABLES_EXPRESSION_SCOPE",
                &append_path(path, "field"),
                "Check field is not a member of this table",
                Severity::Error,
            ));
        }
        let field = resolve_ref(document, reference)
            .filter(|f| string_member(f, "kind") == Some(&Utf16::from("field")))
            .map(|field| crate::value::admit_json(field, ctx))
            .transpose()?;
        if field.is_none() {
            out.push_capped(core_diag(
                "TABLES_FIELD",
                &append_path(path, "field"),
                "Expected an exact core Field reference",
                Severity::Error,
            ));
        }
        if let Some(field) = field.as_ref() {
            if string_member(field, "cardinality") != Some(&Utf16::from("one"))
                || !["required", "absent-allowed"]
                    .iter()
                    .any(|n| string_member(field, "nullability") == Some(&Utf16::from(*n)))
            {
                out.push_capped(core_diag(
                    "TABLES_FIELD_SHAPE",
                    &append_path(path, "field"),
                    "Native table fields require explicit singleton cardinality and nullability",
                    Severity::Error,
                ));
            }
        }
        return Ok(ExprType {
            kind: field
                .as_ref()
                .and_then(|f| string_member(f, "scalarType"))
                .and_then(|s| s.to_utf8().ok())
                .unwrap_or_else(|| "unknown".into()),
            field,
            ..Default::default()
        });
    }
    if op == "literal" {
        let literal = member(expr, "value").cloned().unwrap_or(Value::Null);
        return Ok(ExprType {
            kind: literal_kind(&literal),
            literal: Some(literal),
            ..Default::default()
        });
    }
    if op == "and" || op == "or" {
        for (i, arg) in array_items(member(expr, "args").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let p = append_path(&append_path(path, "args"), &i.to_string());
            if inspect_expression(
                arg,
                fields,
                document,
                policy,
                &p,
                depth + 1,
                nodes,
                ctx,
                out,
            )?
            .kind
                != "boolean"
            {
                out.push_capped(core_diag(
                    "TABLES_EXPRESSION_TYPE",
                    &p,
                    "Boolean operand required",
                    Severity::Error,
                ));
            }
        }
        return Ok(ExprType {
            kind: "boolean".into(),
            ..Default::default()
        });
    }
    if op == "not" || op == "isNull" {
        let p = append_path(path, "arg");
        let arg = inspect_expression(
            member(expr, "arg").unwrap_or(&Value::Null),
            fields,
            document,
            policy,
            &p,
            depth + 1,
            nodes,
            ctx,
            out,
        )?;
        if op == "not" && arg.kind != "boolean" {
            out.push_capped(core_diag(
                "TABLES_EXPRESSION_TYPE",
                &p,
                "Boolean operand required",
                Severity::Error,
            ));
        }
        return Ok(ExprType {
            kind: "boolean".into(),
            ..Default::default()
        });
    }
    if op == "in" {
        let arg = inspect_expression(
            member(expr, "arg").unwrap_or(&Value::Null),
            fields,
            document,
            policy,
            &append_path(path, "arg"),
            depth + 1,
            nodes,
            ctx,
            out,
        )?;
        for (i, literal) in array_items(member(expr, "values").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let rhs = ExprType {
                kind: literal_kind(literal),
                literal: Some(literal.clone()),
                ..Default::default()
            };
            compare_expr(
                &arg,
                &rhs,
                &append_path(&append_path(path, "values"), &i.to_string()),
                document,
                policy,
                ctx,
                out,
            )?;
        }
        return Ok(ExprType {
            kind: "boolean".into(),
            ..Default::default()
        });
    }
    let left = inspect_expression(
        member(expr, "left").unwrap_or(&Value::Null),
        fields,
        document,
        policy,
        &append_path(path, "left"),
        depth + 1,
        nodes,
        ctx,
        out,
    )?;
    let right = inspect_expression(
        member(expr, "right").unwrap_or(&Value::Null),
        fields,
        document,
        policy,
        &append_path(path, "right"),
        depth + 1,
        nodes,
        ctx,
        out,
    )?;
    compare_expr(&left, &right, path, document, policy, ctx, out)?;
    Ok(ExprType {
        kind: "boolean".into(),
        ..Default::default()
    })
}

fn literal_kind(value: &Value) -> String {
    if value == &Value::Null {
        return "null".into();
    }
    if matches!(value, Value::Bool(_)) {
        return "boolean".into();
    }
    for (key, kind) in [
        ("integerToken", "integer"),
        ("decimalToken", "decimal"),
        ("floatToken", "float"),
        ("binaryHex", "binary"),
        ("bits128Hex", "bits128"),
    ] {
        if member(value, key).is_some() {
            return kind.into();
        }
    }
    string_member(value, "string")
        .map(|_| "string".into())
        .or_else(|| string_member(value, "date").map(|_| "date".into()))
        .or_else(|| string_member(value, "timestamp").map(|_| "timestamp".into()))
        .or_else(|| string_member(value, "uuid").map(|_| "uuid".into()))
        .unwrap_or_else(|| "unknown".into())
}

fn compare_expr(
    left: &ExprType,
    right: &ExprType,
    path: &Utf16,
    document: &Value,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    if left.kind != "null"
        && right.kind != "null"
        && (left.kind != right.kind
            || left.field.is_some()
                && right.field.is_some()
                && canonical_field_domain(left.field.as_ref().unwrap(), ctx)?
                    != canonical_field_domain(right.field.as_ref().unwrap(), ctx)?)
    {
        out.push_capped(core_diag(
            "TABLES_EXPRESSION_TYPE",
            path,
            "Comparison domains must agree without coercion",
            Severity::Error,
        ));
    }
    if let (Some(field), Some(literal)) = (&left.field, &right.literal) {
        let ds = literal_errors(document, field, literal, true, policy, ctx)?;
        if let Some(d) = ds.first() {
            out.push_capped(core_diag(
                "TABLES_LITERAL",
                path,
                &d.message.to_utf8().unwrap_or_default(),
                Severity::Error,
            ));
        }
    }
    if let (Some(field), Some(literal)) = (&right.field, &left.literal) {
        let ds = literal_errors(document, field, literal, true, policy, ctx)?;
        if let Some(d) = ds.first() {
            out.push_capped(core_diag(
                "TABLES_LITERAL",
                path,
                &d.message.to_utf8().unwrap_or_default(),
                Severity::Error,
            ));
        }
    }
    Ok(())
}
fn canonical_field_domain(field: &Value, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    let domain = Value::Array(vec![
        member(field, "scalarType").cloned().unwrap_or(Value::Null),
        member(field, "cardinality").cloned().unwrap_or(Value::Null),
        member(field, "facets")
            .cloned()
            .unwrap_or(Value::Object(vec![])),
        member(field, "allowedValues")
            .cloned()
            .unwrap_or(Value::Null),
    ]);
    crate::canonical::canonical_json_admitted(&domain, ctx)
}

fn canonical_native_domain(native: &Value, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    let domain = Value::Array(vec![
        member(native, "kind").cloned().unwrap_or(Value::Null),
        member(native, "length").cloned().unwrap_or(Value::Null),
        member(native, "precision").cloned().unwrap_or(Value::Null),
        member(native, "scale").cloned().unwrap_or(Value::Null),
    ]);
    crate::canonical::canonical_json_admitted(&domain, ctx)
}

fn inspect_operations(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    compiled: &umf_core::schema::CompiledSchema,
    operation_schema: &Value,
    tables_schema: &Value,
    rule_nodes: &mut usize,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let commands = array_items(member(payload, "commands").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut admitted_ids = Vec::new();
    for (i, command) in commands.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let p = append_path(&append_path(path, "commands"), &i.to_string());
        let version = string_member(command, "version");
        if version != Some(&Utf16::from("umf.table-operation/0.1")) {
            out.push_capped(core_diag(
                "TABLES_COMMAND_PENDING",
                &p,
                "Unknown operation version is retained without interpretation",
                Severity::Warning,
            ));
            continue;
        }
        let shape_errors = compiled.validate(command, ctx)?;
        if !shape_errors.is_empty() {
            out.push_capped(core_diag(
                "TABLES_OPERATION_SHAPE",
                &p,
                "Invalid declared operation shape",
                Severity::Error,
            ));
            continue;
        }
        inspect_unknown(
            command,
            &[operation_schema, tables_schema],
            operation_schema,
            &p,
            out,
            0,
            0,
            ctx,
        )?;
        let Some(id) = string_member(command, "id") else {
            out.push_capped(core_diag(
                "TABLES_OPERATION_SHAPE",
                &p,
                "Invalid declared operation shape",
                Severity::Error,
            ));
            continue;
        };
        admitted_ids.push((i, id.clone()));
        inspect_operation(command, payload, document, &p, rule_nodes, policy, ctx, out)?;
    }
    // TypeScript accumulates every admitted command first, then applies its
    // identity uniqueness pass. Keep both the diagnostic order and per-item
    // pointer while avoiding a quadratic scan for large operation lists.
    let mut ids = BTreeSet::new();
    for (index, id) in admitted_ids {
        let item_path = append_path(&append_path(path, "commands"), &index.to_string());
        ctx.charge_work(1, item_path.clone())?;
        if !ids.insert(id) {
            out.push_capped(core_diag(
                "TABLES_DUPLICATE",
                &item_path,
                "Duplicate operation ID",
                Severity::Error,
            ));
        }
    }
    Ok(())
}

fn inspect_operation(
    command: &Value,
    payload: &Value,
    document: &Value,
    path: &Utf16,
    rule_nodes: &mut usize,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    let body = member(command, "body").unwrap_or(&Value::Null);
    let kind = string_member(body, "kind")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    if kind == "query" {
        inspect_query_operation(command, body, document, path, out, ctx)?;
        return Ok(());
    }
    let table_id = string_member(body, "table");
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(tables.len(), path.clone())?;
    let table = tables.iter().find(|t| string_member(t, "id") == table_id);
    if table.is_none() {
        out.push_capped(core_diag(
            "TABLES_OPERATION_TABLE",
            &append_path(path, "body/table"),
            "Operation requires a table in its owning module",
            Severity::Error,
        ));
        return Ok(());
    }
    let table = table.unwrap();
    let source_table = if kind == "insertFrom" {
        let source_id = string_member(member(body, "source").unwrap_or(&Value::Null), "table");
        ctx.charge_work(tables.len(), append_path(path, "body/source/table"))?;
        let found = tables.iter().find(|t| string_member(t, "id") == source_id);
        if found.is_none() {
            out.push_capped(core_diag(
                "TABLES_OPERATION_TABLE",
                &append_path(&append_path(path, "body"), "source/table"),
                "Insert source requires an original table in this module",
                Severity::Error,
            ));
        }
        found
    } else {
        None
    };
    let parameters =
        array_items(member(command, "parameters").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut parameter_ids = BTreeSet::new();
    for (i, param) in parameters.iter().enumerate() {
        let p = append_path(&append_path(path, "parameters"), &i.to_string());
        ctx.charge_work(1, p.clone())?;
        if let Some(id) = string_member(param, "id") {
            if !parameter_ids.insert(id.clone()) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &p,
                    "Duplicate operation parameter",
                    Severity::Error,
                ));
            }
        }
    }
    for (i, param) in parameters.iter().enumerate() {
        let p = append_path(&append_path(path, "parameters"), &i.to_string());
        ctx.charge_work(1, p.clone())?;
        let field = member(param, "field").unwrap_or(&Value::Null);
        let mut bound = false;
        for candidate in tables {
            if table_has_field(candidate, field, ctx, &append_path(&p, "field"))? {
                bound = true;
                break;
            }
        }
        if !bound {
            out.push_capped(core_diag(
                "TABLES_OPERATION_PARAMETER",
                &append_path(&p, "field"),
                "Parameter domain must be a declared column of the owning module",
                Severity::Error,
            ));
        }
        if resolve_ref(document, field).is_some_and(|f| {
            array_items(member(f, "semanticTypes").unwrap_or(&Value::Null))
                .is_some_and(|v| !v.is_empty())
                || object_members(member(f, "extensions").unwrap_or(&Value::Null))
                    .is_some_and(|v| !v.is_empty())
        }) {
            out.push_capped(core_diag(
                "TABLES_OPERATION_MEANING",
                &append_path(&p, "field"),
                "Parameter meaning needs a separately qualified interpreter",
                Severity::Warning,
            ));
        }
    }
    let mut used = BTreeSet::<Utf16>::new();
    let body_path = append_path(path, "body");
    if kind == "read" {
        if string_member(command, "replay") != Some(&Utf16::from("none"))
            || member(command, "batch") == Some(&Value::Bool(true))
        {
            out.push_capped(core_diag(
                "TABLES_OPERATION_READ",
                path,
                "Read operations cannot declare write replay or atomic write batches",
                Severity::Error,
            ));
        }
        let fields = array_items(member(body, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut projected = BTreeSet::<Vec<u16>>::new();
        for (i, field) in fields.iter().enumerate() {
            ctx.charge_work(
                1,
                append_path(&append_path(&body_path, "fields"), &i.to_string()),
            )?;
            if !projected.insert(ref_key(field)) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &append_path(&append_path(&body_path, "fields"), &i.to_string()),
                    "Duplicate operation result Field",
                    Severity::Error,
                ));
            }
        }
        for (i, field) in fields.iter().enumerate() {
            operation_field(
                table,
                field,
                &append_path(&append_path(&body_path, "fields"), &i.to_string()),
                out,
                ctx,
            )?;
        }
        inspect_predicate(
            member(body, "where").unwrap_or(&Value::Null),
            table,
            payload,
            document,
            parameters,
            &append_path(&body_path, "where"),
            0,
            rule_nodes,
            policy,
            ctx,
            &mut used,
            out,
        )?;
        let result = string_member(body, "result")
            .and_then(|s| s.to_utf8().ok())
            .unwrap_or_default();
        let order = array_items(member(body, "orderBy").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut seen_order = BTreeSet::<Vec<u16>>::new();
        for (i, item) in order.iter().enumerate() {
            let item_path = append_path(&append_path(&body_path, "orderBy"), &i.to_string());
            ctx.charge_work(1, item_path.clone())?;
            let field = member(item, "field").unwrap_or(&Value::Null);
            if !seen_order.insert(ref_key(field)) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &item_path,
                    "Duplicate ordering Field",
                    Severity::Error,
                ));
            }
        }
        for (i, item) in order.iter().enumerate() {
            let item_path = append_path(&append_path(&body_path, "orderBy"), &i.to_string());
            ctx.charge_work(1, item_path.clone())?;
            let field = member(item, "field").unwrap_or(&Value::Null);
            operation_field(table, field, &append_path(&item_path, "field"), out, ctx)?;
        }
        if result == "count" && (!fields.is_empty() || !order.is_empty()) {
            out.push_capped(core_diag(
                "TABLES_OPERATION_COUNT",
                &body_path,
                "Count has no projected fields or ordering",
                Severity::Error,
            ));
        }
        if result != "count" && fields.is_empty() {
            out.push_capped(core_diag(
                "TABLES_OPERATION_RESULT",
                &append_path(&body_path, "fields"),
                "Row operations require explicit projected fields",
                Severity::Error,
            ));
        }
        if matches!(result.as_str(), "one" | "optional" | "count")
            && number_member(body, "maxRows") != Some(1.0)
        {
            out.push_capped(core_diag(
                "TABLES_OPERATION_RESULT",
                &append_path(&body_path, "maxRows"),
                "Singleton/count results have a declared result bound of one",
                Severity::Error,
            ));
        }
        if result == "page" {
            let cursor = string_member(body, "cursorKey");
            let record = resolve_ref(document, member(table, "record").unwrap_or(&Value::Null));
            let keys =
                array_items(member(record.unwrap_or(&Value::Null), "keys").unwrap_or(&Value::Null))
                    .unwrap_or(&[]);
            ctx.charge_work(keys.len(), append_path(&body_path, "cursorKey"))?;
            let key = keys.iter().find(|k| string_member(k, "id") == cursor);
            let key_fields =
                array_items(member(key.unwrap_or(&Value::Null), "fields").unwrap_or(&Value::Null))
                    .unwrap_or(&[]);
            ctx.charge_work(
                order.len().saturating_add(key_fields.len()),
                body_path.clone(),
            )?;
            if key.is_none()
                || order.len() < key_fields.len()
                || order
                    .iter()
                    .rev()
                    .take(key_fields.len())
                    .rev()
                    .zip(key_fields)
                    .any(|(o, f)| member(o, "field").is_none_or(|r| !refs_equal(r, f)))
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_PAGE",
                    &body_path,
                    "Page ordering must end with the complete ordered original Key",
                    Severity::Error,
                ));
            }
            for (i, item) in order.iter().enumerate() {
                ctx.charge_work(
                    1,
                    append_path(&append_path(&body_path, "orderBy"), &i.to_string()),
                )?;
                let field_ref = member(item, "field").unwrap_or(&Value::Null);
                let element = resolve_ref(document, field_ref).unwrap_or(&Value::Null);
                let scalar = string_member(element, "scalarType");
                if string_member(element, "nullability") != Some(&Utf16::from("required"))
                    || !scalar.is_some_and(|s| {
                        ["integer", "decimal", "string", "date", "timestamp", "uuid"]
                            .iter()
                            .any(|x| s == &Utf16::from(*x))
                    })
                {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_PAGE",
                        &append_path(&append_path(&body_path, "orderBy"), &format!("{i}/field")),
                        "Cursor ordering requires required ordered scalar Fields",
                        Severity::Error,
                    ));
                }
                if !projected.contains(&ref_key(field_ref)) {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_PAGE",
                        &append_path(&body_path, "fields"),
                        "Page must project every ordering Field",
                        Severity::Error,
                    ));
                }
            }
        } else if member(body, "cursorKey").is_some() {
            out.push_capped(core_diag(
                "TABLES_OPERATION_PAGE",
                &append_path(&body_path, "cursorKey"),
                "Cursor Key is only meaningful for page results",
                Severity::Error,
            ));
        }
    } else {
        if string_member(command, "consistency") != Some(&Utf16::from("transaction"))
            || string_member(command, "replay") == Some(&Utf16::from("none"))
        {
            out.push_capped(core_diag(
                "TABLES_OPERATION_WRITE",
                path,
                "Writes require transaction consistency and explicit caller-key replay",
                Severity::Error,
            ));
        }
        let returning =
            array_items(member(body, "returning").unwrap_or(&Value::Null)).unwrap_or(&[]);
        inspect_unique_refs(
            returning,
            &append_path(&body_path, "returning"),
            "operation result Field",
            out,
            ctx,
        )?;
        for (i, field) in returning.iter().enumerate() {
            ctx.charge_work(
                1,
                append_path(&append_path(&body_path, "returning"), &i.to_string()),
            )?;
            operation_field(
                table,
                field,
                &append_path(&append_path(&body_path, "returning"), &i.to_string()),
                out,
                ctx,
            )?;
        }
        if kind == "update" || kind == "delete" {
            inspect_predicate(
                member(body, "where").unwrap_or(&Value::Null),
                table,
                payload,
                document,
                parameters,
                &append_path(&body_path, "where"),
                0,
                rule_nodes,
                policy,
                ctx,
                &mut used,
                out,
            )?;
        }
        if kind == "insertFrom" {
            if let Some(source_table) = source_table {
                inspect_predicate(
                    member(member(body, "source").unwrap_or(&Value::Null), "where")
                        .unwrap_or(&Value::Null),
                    source_table,
                    payload,
                    document,
                    parameters,
                    &append_path(&append_path(&body_path, "source"), "where"),
                    0,
                    rule_nodes,
                    policy,
                    ctx,
                    &mut used,
                    out,
                )?;
            }
        }
        let values = array_items(member(body, "values").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut assigned = BTreeSet::<Vec<u16>>::new();
        for (i, assignment) in values.iter().enumerate() {
            let field = member(assignment, "field").unwrap_or(&Value::Null);
            let field_path = append_path(&append_path(&body_path, "values"), &i.to_string());
            ctx.charge_work(1, field_path.clone())?;
            if !assigned.insert(ref_key(field)) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &field_path,
                    "Duplicate assigned Field",
                    Severity::Error,
                ));
            }
        }
        for (i, assignment) in values.iter().enumerate() {
            let p = append_path(&append_path(&body_path, "values"), &i.to_string());
            ctx.charge_work(1, p.clone())?;
            let field = member(assignment, "field").unwrap_or(&Value::Null);
            let selected = operation_field(table, field, &append_path(&p, "field"), out, ctx)?;
            if selected
                .is_some_and(|column| member(column, "generated") == Some(&Value::Bool(true)))
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_GENERATED",
                    &p,
                    "Ordinary operations cannot assign generated identity columns",
                    Severity::Error,
                ));
            }
            if kind == "update"
                && selected.is_some_and(|column| !operation_mutable(table, field, column, document))
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_IMMUTABLE",
                    &p,
                    "Ordinary updates cannot change Keys, immutable or generated columns",
                    Severity::Error,
                ));
            }
            inspect_operation_value(
                member(assignment, "value").unwrap_or(&Value::Null),
                field,
                table,
                payload,
                document,
                parameters,
                source_table,
                true,
                &append_path(&p, "value"),
                policy,
                ctx,
                &mut used,
                out,
            )?;
        }
        if matches!(kind.as_str(), "insert" | "insertFrom" | "upsert") {
            for column in
                array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                ctx.charge_work(1, append_path(&body_path, "values"))?;
                let field = member(column, "field").unwrap_or(&Value::Null);
                let element = resolve_ref(document, field);
                if string_member(element.unwrap_or(&Value::Null), "nullability")
                    == Some(&Utf16::from("required"))
                    && member(column, "default").is_none()
                    && member(column, "generated").is_none()
                    && !assigned.contains(&ref_key(field))
                {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_REQUIRED",
                        &append_path(&body_path, "values"),
                        "Create input omits a required column without a declared default",
                        Severity::Error,
                    ));
                }
            }
        }
        if kind == "upsert" {
            let conflict = string_member(body, "conflictKey");
            let record = resolve_ref(document, member(table, "record").unwrap_or(&Value::Null))
                .unwrap_or(&Value::Null);
            let keys = array_items(member(record, "keys").unwrap_or(&Value::Null)).unwrap_or(&[]);
            ctx.charge_work(keys.len(), append_path(&body_path, "conflictKey"))?;
            let key = keys.iter().find(|key| string_member(key, "id") == conflict);
            let key_fields =
                array_items(member(key.unwrap_or(&Value::Null), "fields").unwrap_or(&Value::Null))
                    .unwrap_or(&[]);
            ctx.charge_work(key_fields.len(), append_path(&body_path, "conflictKey"))?;
            if key.is_none()
                || key_fields
                    .iter()
                    .any(|field| !assigned.contains(&ref_key(field)))
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_CONFLICT",
                    &append_path(&body_path, "conflictKey"),
                    "Upsert requires an original Key with all components in create input",
                    Severity::Error,
                ));
            }
            let update_fields =
                array_items(member(body, "updateFields").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let mut update_seen = BTreeSet::<Vec<u16>>::new();
            for (i, field) in update_fields.iter().enumerate() {
                let field_path =
                    append_path(&append_path(&body_path, "updateFields"), &i.to_string());
                ctx.charge_work(1, field_path.clone())?;
                if !update_seen.insert(ref_key(field)) {
                    out.push_capped(core_diag(
                        "TABLES_DUPLICATE",
                        &field_path,
                        "Duplicate Field",
                        Severity::Error,
                    ));
                }
            }
            for (i, field) in update_fields.iter().enumerate() {
                let field_path =
                    append_path(&append_path(&body_path, "updateFields"), &i.to_string());
                ctx.charge_work(1, field_path.clone())?;
                let column = operation_field(table, field, &field_path, out, ctx)?;
                if column.is_none_or(|column| !operation_mutable(table, field, column, document))
                    || !assigned.contains(&ref_key(field))
                {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_CONFLICT",
                        &field_path,
                        "Conflict update requires a mutable Field present in create input",
                        Severity::Error,
                    ));
                }
            }
            let ignore = string_member(body, "onConflict") == Some(&Utf16::from("ignore"));
            if ignore != update_fields.is_empty() {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_CONFLICT",
                    &append_path(&body_path, "updateFields"),
                    "Ignore has no updates; update requires a nonempty whitelist",
                    Severity::Error,
                ));
            }
        }
    }
    for p in parameters {
        ctx.charge_work(1, append_path(path, "parameters"))?;
        if let Some(id) = string_member(p, "id") {
            if !used.contains(id) {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_PARAMETER_UNUSED",
                    &append_path(path, "parameters"),
                    "Every declared input must be used by the operation",
                    Severity::Error,
                ));
            }
        }
    }
    Ok(())
}

fn operation_field<'a>(
    table: &'a Value,
    field: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(columns.len(), path.clone())?;
    let column = columns
        .iter()
        .find(|c| member(c, "field").is_some_and(|r| refs_equal(r, field)));
    if column.is_none() {
        out.push_capped(core_diag(
            "TABLES_OPERATION_FIELD",
            path,
            "Field must belong to the operation table",
            Severity::Error,
        ));
    }
    Ok(column)
}

fn inspect_unique_refs(
    fields: &[Value],
    path: &Utf16,
    label: &str,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut seen = BTreeSet::<Vec<u16>>::new();
    for (index, field) in fields.iter().enumerate() {
        let item_path = append_path(path, &index.to_string());
        ctx.charge_work(1, item_path.clone())?;
        if !seen.insert(ref_key(field)) {
            out.push_capped(core_diag(
                "TABLES_DUPLICATE",
                &item_path,
                &format!("Duplicate {label}"),
                Severity::Error,
            ));
        }
    }
    Ok(())
}

fn operation_mutable(table: &Value, field: &Value, column: &Value, document: &Value) -> bool {
    if member(column, "immutable") == Some(&Value::Bool(true))
        || member(column, "generated") == Some(&Value::Bool(true))
    {
        return false;
    }
    let record = resolve_ref(document, member(table, "record").unwrap_or(&Value::Null))
        .unwrap_or(&Value::Null);
    !array_items(member(record, "keys").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .any(|key| {
            array_items(member(key, "fields").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .any(|reference| refs_equal(reference, field))
        })
}

fn inspect_query_operation(
    command: &Value,
    body: &Value,
    document: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let module_id = module_id_for_path(document, path);
    if string_member(command, "replay") != Some(&Utf16::from("none"))
        || member(command, "batch") == Some(&Value::Bool(true))
    {
        out.push_capped(core_diag(
            "TABLES_OPERATION_READ",
            path,
            "Queries cannot declare write replay or write batches",
            Severity::Error,
        ));
    }
    let empty = Utf16::default();
    let sql = string_member(body, "sql").unwrap_or(&empty);
    if query_sql_exceeds_limit(sql, ctx)? {
        out.push_capped(core_diag(
            "TABLES_QUERY_SQL",
            &append_path(&append_path(path, "body"), "sql"),
            "Bounded fixed UTF-8 query source required",
            Severity::Error,
        ));
    }
    let mut parameter_ids = BTreeSet::<Utf16>::new();
    let parameters =
        array_items(member(command, "parameters").unwrap_or(&Value::Null)).unwrap_or(&[]);
    for (i, param) in parameters.iter().enumerate() {
        let param_path = append_path(&append_path(path, "parameters"), &i.to_string());
        ctx.charge_work(1, param_path.clone())?;
        if let Some(id) = string_member(param, "id") {
            if !parameter_ids.insert(id.clone()) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &param_path,
                    "Duplicate operation parameter",
                    Severity::Error,
                ));
            }
        }
    }
    for (i, param) in parameters.iter().enumerate() {
        let param_path = append_path(&append_path(path, "parameters"), &i.to_string());
        ctx.charge_work(1, param_path.clone())?;
        let field = member(param, "field").unwrap_or(&Value::Null);
        let resolved = inspect_query_field(
            document,
            field,
            &append_path(&param_path, "field"),
            out,
            ctx,
        )?;
        if string_member(field, "module") != module_id.as_ref() {
            out.push_capped(core_diag(
                "TABLES_QUERY_MODULE",
                &append_path(&append_path(path, "parameters"), &format!("{i}/field")),
                "Query domains must belong to the owning module",
                Severity::Error,
            ));
        }
        if resolved.is_some_and(query_field_has_meaning) {
            out.push_capped(core_diag(
                "TABLES_OPERATION_MEANING",
                &append_path(&append_path(path, "parameters"), &format!("{i}/field")),
                "Selected query Field meaning needs a separately qualified interpreter",
                Severity::Warning,
            ));
        }
    }
    let outputs = array_items(member(body, "outputs").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut names = BTreeSet::<Utf16>::new();
    for (i, item) in outputs.iter().enumerate() {
        let p = append_path(
            &append_path(&append_path(path, "body"), "outputs"),
            &i.to_string(),
        );
        ctx.charge_work(1, p.clone())?;
        if let Some(name) = string_member(item, "name") {
            if !names.insert(name.clone()) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &p,
                    "Duplicate query output alias",
                    Severity::Error,
                ));
            }
        }
    }
    let mut fields = BTreeSet::<Vec<u16>>::new();
    for (i, item) in outputs.iter().enumerate() {
        let p = append_path(
            &append_path(&append_path(path, "body"), "outputs"),
            &i.to_string(),
        );
        ctx.charge_work(1, p.clone())?;
        if !fields.insert(ref_key(member(item, "field").unwrap_or(&Value::Null))) {
            out.push_capped(core_diag(
                "TABLES_DUPLICATE",
                &p,
                "Duplicate query output Field",
                Severity::Error,
            ));
        }
    }
    for (i, item) in outputs.iter().enumerate() {
        ctx.charge_work(
            1,
            append_path(
                &append_path(&append_path(path, "body"), "outputs"),
                &i.to_string(),
            ),
        )?;
        let p = append_path(
            &append_path(&append_path(path, "body"), "outputs"),
            &i.to_string(),
        );
        if let Some(name) = string_member(item, "name") {
            check_identifier(name, &append_path(&p, "name"), out);
        }
        let field = member(item, "field").unwrap_or(&Value::Null);
        let resolved = inspect_query_field(document, field, &append_path(&p, "field"), out, ctx)?;
        if string_member(field, "module") != module_id.as_ref() {
            out.push_capped(core_diag(
                "TABLES_QUERY_MODULE",
                &append_path(&p, "field"),
                "Query domains must belong to the owning module",
                Severity::Error,
            ));
        }
        if resolved.is_some_and(query_field_has_meaning) {
            out.push_capped(core_diag(
                "TABLES_OPERATION_MEANING",
                &append_path(&p, "field"),
                "Selected query Field meaning needs a separately qualified interpreter",
                Severity::Warning,
            ));
        }
    }
    Ok(())
}

fn module_id_for_path(document: &Value, path: &Utf16) -> Option<Utf16> {
    let path = path.to_utf8().ok()?;
    let index = path
        .strip_prefix("/modules/")?
        .split('/')
        .next()?
        .parse::<usize>()
        .ok()?;
    array_items(member(document, "modules")?)?
        .get(index)
        .and_then(|module| string_member(module, "id"))
        .cloned()
}

fn inspect_query_field<'a>(
    document: &'a Value,
    reference: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    ctx.charge_work(1, path.clone())?;
    let field = resolve_ref(document, reference);
    if member(field.unwrap_or(&Value::Null), "kind") != Some(&Value::String(Utf16::from("field"))) {
        out.push_capped(core_diag(
            "TABLES_FIELD",
            path,
            "Expected an exact core Field reference",
            Severity::Error,
        ));
        return Ok(None);
    }
    let field = field.expect("kind check established field");
    if string_member(field, "cardinality") != Some(&Utf16::from("one"))
        || !["required", "absent-allowed"]
            .iter()
            .any(|value| string_member(field, "nullability") == Some(&Utf16::from(*value)))
    {
        out.push_capped(core_diag(
            "TABLES_FIELD_SHAPE",
            path,
            "Native table fields require explicit singleton cardinality and nullability",
            Severity::Error,
        ));
    }
    Ok(Some(field))
}

fn query_field_has_meaning(field: &Value) -> bool {
    object_members(member(field, "extensions").unwrap_or(&Value::Null))
        .is_some_and(|items| !items.is_empty())
        || !array_items(member(field, "semanticTypes").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .is_empty()
}

fn query_sql_exceeds_limit(sql: &Utf16, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let units = sql.units();
    let mut index = 0usize;
    let mut bytes = 0usize;
    let mut next_poll = 0usize;
    while index < units.len() {
        if index >= next_poll {
            ctx.charge_work(1, Utf16::default())?;
            next_poll = index.saturating_add(1024);
        }
        match units[index] {
            0 => return Ok(true),
            0x0001..=0x007f => {
                bytes += 1;
                index += 1;
            }
            0x0080..=0x07ff => {
                bytes += 2;
                index += 1;
            }
            0xd800..=0xdbff => {
                if units
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low))
                {
                    bytes += 4;
                    index += 2;
                } else {
                    // WHATWG TextEncoder replaces an unpaired surrogate with
                    // U+FFFD before measuring/encoding the query source.
                    bytes += 3;
                    index += 1;
                }
            }
            0xdc00..=0xdfff => {
                bytes += 3;
                index += 1;
            }
            _ => {
                bytes += 3;
                index += 1;
            }
        }
        if bytes > 1_048_576 {
            return Ok(true);
        }
    }
    Ok(false)
}

fn inspect_predicate(
    node: &Value,
    table: &Value,
    payload: &Value,
    document: &Value,
    parameters: &[Value],
    path: &Utf16,
    depth: usize,
    nodes: &mut usize,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    used: &mut BTreeSet<Utf16>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    *nodes = nodes.saturating_add(1);
    if *nodes > 4096 {
        out.push_capped(core_diag(
            "TABLES_COMPLEXITY",
            path,
            "Expression/rule depth or module node budget exceeded",
            Severity::Error,
        ));
        return Ok(());
    }
    if depth > 16 {
        out.push_capped(core_diag(
            "TABLES_COMPLEXITY",
            path,
            "Expression/rule depth or module node budget exceeded",
            Severity::Error,
        ));
        return Ok(());
    }
    let op = string_member(node, "op")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    if op == "all" {
        return Ok(());
    }
    if op == "related" {
        let table_id = string_member(node, "table");
        let target_table = array_items(member(payload, "tables").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find(|candidate| string_member(candidate, "id") == table_id);
        let Some(target_table) = target_table else {
            out.push_capped(core_diag(
                "TABLES_OPERATION_TABLE",
                &append_path(path, "table"),
                "Related predicates require an original table in the owning module",
                Severity::Error,
            ));
            return Ok(());
        };
        let matches = array_items(member(node, "matches").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut pair_ids = BTreeSet::new();
        for (index, pair) in matches.iter().enumerate() {
            let pair_path = append_path(&append_path(path, "matches"), &index.to_string());
            ctx.charge_work(1, pair_path.clone())?;
            let identity = (
                ref_key(member(pair, "source").unwrap_or(&Value::Null)),
                ref_key(member(pair, "target").unwrap_or(&Value::Null)),
            );
            if !pair_ids.insert(identity) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &pair_path,
                    "Duplicate related match",
                    Severity::Error,
                ));
            }
        }
        for (index, pair) in matches.iter().enumerate() {
            let pair_path = append_path(&append_path(path, "matches"), &index.to_string());
            let source = member(pair, "source").unwrap_or(&Value::Null);
            let target = member(pair, "target").unwrap_or(&Value::Null);
            let source_column =
                operation_field(table, source, &append_path(&pair_path, "source"), out, ctx)?;
            let target_column = operation_field(
                target_table,
                target,
                &append_path(&pair_path, "target"),
                out,
                ctx,
            )?;
            if let (Some(source_column), Some(target_column)) = (source_column, target_column) {
                let source_field = resolve_ref(document, source).unwrap_or(&Value::Null);
                let target_field = resolve_ref(document, target).unwrap_or(&Value::Null);
                let source_native = canonical_native_domain(
                    member(source_column, "nativeType").unwrap_or(&Value::Null),
                    ctx,
                )?;
                let target_native = canonical_native_domain(
                    member(target_column, "nativeType").unwrap_or(&Value::Null),
                    ctx,
                )?;
                let domains_match = string_member(source_field, "scalarType")
                    == string_member(target_field, "scalarType")
                    && source_native == target_native;
                if !domains_match {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_DOMAIN",
                        &pair_path,
                        "Related equality requires the same native scalar capacity",
                        Severity::Error,
                    ));
                }
            }
        }
        inspect_predicate(
            member(node, "where").unwrap_or(&Value::Null),
            target_table,
            payload,
            document,
            parameters,
            &append_path(path, "where"),
            depth + 1,
            nodes,
            policy,
            ctx,
            used,
            out,
        )?;
        return Ok(());
    }
    if op == "and" || op == "or" {
        for (i, child) in array_items(member(node, "args").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            inspect_predicate(
                child,
                table,
                payload,
                document,
                parameters,
                &append_path(&append_path(path, "args"), &i.to_string()),
                depth + 1,
                nodes,
                policy,
                ctx,
                used,
                out,
            )?;
        }
        return Ok(());
    }
    if op == "not" {
        inspect_predicate(
            member(node, "arg").unwrap_or(&Value::Null),
            table,
            payload,
            document,
            parameters,
            &append_path(path, "arg"),
            depth + 1,
            nodes,
            policy,
            ctx,
            used,
            out,
        )?;
        return Ok(());
    }
    let field = member(node, "field").unwrap_or(&Value::Null);
    let column = operation_field(table, field, &append_path(path, "field"), out, ctx)?;
    // The TypeScript operation inspector stops at the first failed Field
    // resolution; continuing would manufacture value/domain diagnostics from
    // a predicate that has no selected column.
    if column.is_none() {
        return Ok(());
    }
    if op == "isNull" {
        return Ok(());
    }
    let vals = if op == "in" {
        array_items(member(node, "values").unwrap_or(&Value::Null)).unwrap_or(&[])
    } else {
        &[]
    };
    if op == "in" {
        for (i, v) in vals.iter().enumerate() {
            inspect_operation_value(
                v,
                field,
                table,
                payload,
                document,
                parameters,
                None,
                false,
                &append_path(&append_path(path, "values"), &i.to_string()),
                policy,
                ctx,
                used,
                out,
            )?;
        }
    } else {
        inspect_operation_value(
            member(node, "value").unwrap_or(&Value::Null),
            field,
            table,
            payload,
            document,
            parameters,
            None,
            false,
            &append_path(path, "value"),
            policy,
            ctx,
            used,
            out,
        )?;
    }
    let scalar = string_member(
        resolve_ref(document, field).unwrap_or(&Value::Null),
        "scalarType",
    );
    if op == "startsWith" && scalar != Some(&Utf16::from("string")) {
        out.push_capped(core_diag(
            "TABLES_OPERATION_DOMAIN",
            path,
            "Prefix predicate requires a string Field",
            Severity::Error,
        ));
    }
    if ["lt", "le", "gt", "ge"].contains(&op.as_str())
        && !scalar.is_some_and(|s| {
            ["integer", "decimal", "string", "date", "timestamp"]
                .iter()
                .any(|candidate| s == &Utf16::from(*candidate))
        })
    {
        out.push_capped(core_diag(
            "TABLES_OPERATION_DOMAIN",
            path,
            "Ordered predicate requires a supported ordered scalar",
            Severity::Error,
        ));
    }
    Ok(())
}

fn inspect_operation_value(
    value: &Value,
    target: &Value,
    table: &Value,
    payload: &Value,
    document: &Value,
    parameters: &[Value],
    source_table: Option<&Value>,
    assignment: bool,
    path: &Utf16,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
    used: &mut BTreeSet<Utf16>,
    out: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let kind = string_member(value, "kind")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    let field = resolve_ref(document, target).unwrap_or(&Value::Null);
    if kind == "currentTimestamp" {
        let selected = operation_field(table, target, path, out, ctx)?;
        if string_member(
            member(selected.unwrap_or(&Value::Null), "nativeType").unwrap_or(&Value::Null),
            "kind",
        ) != Some(&Utf16::from("timestamptz"))
            || string_member(field, "scalarType") != Some(&Utf16::from("timestamp"))
        {
            out.push_capped(core_diag(
                "TABLES_OPERATION_DOMAIN",
                path,
                "Transaction timestamp requires explicit instant storage",
                Severity::Error,
            ));
        }
        return Ok(());
    }
    if kind == "currentPrincipal" {
        let selected = operation_field(table, target, path, out, ctx)?;
        let native = member(selected.unwrap_or(&Value::Null), "nativeType").unwrap_or(&Value::Null);
        if string_member(field, "scalarType") != Some(&Utf16::from("string"))
            || !matches!(
                string_member(native, "kind"),
                Some(kind) if kind == &Utf16::from("text") || kind == &Utf16::from("varchar")
            )
        {
            out.push_capped(core_diag(
                "TABLES_OPERATION_DOMAIN",
                path,
                "Current principal requires native text storage",
                Severity::Error,
            ));
        }
        return Ok(());
    }
    if kind == "sourceField" {
        let source_ref = member(value, "field").unwrap_or(&Value::Null);
        let source_column = if assignment {
            match source_table {
                Some(table) => operation_field(table, source_ref, path, out, ctx)?,
                None => None,
            }
        } else {
            None
        };
        let target_column = operation_field(table, target, path, out, ctx)?;
        if source_column.is_none() {
            out.push_capped(core_diag(
                "TABLES_OPERATION_SOURCE",
                path,
                "Source fields are available only in insert-from assignments",
                Severity::Error,
            ));
        }
        if let (Some(source_column), Some(target_column)) = (source_column, target_column) {
            let source_field = resolve_ref(document, source_ref).unwrap_or(&Value::Null);
            let target_field = resolve_ref(document, target).unwrap_or(&Value::Null);
            let source_type = canonical_native_domain(
                member(source_column, "nativeType").unwrap_or(&Value::Null),
                ctx,
            )?;
            let target_type = canonical_native_domain(
                member(target_column, "nativeType").unwrap_or(&Value::Null),
                ctx,
            )?;
            if string_member(source_field, "scalarType")
                != string_member(target_field, "scalarType")
                || string_member(source_field, "cardinality")
                    != string_member(target_field, "cardinality")
                || source_type != target_type
                || (string_member(source_field, "nullability") != Some(&Utf16::from("required"))
                    && string_member(target_field, "nullability") == Some(&Utf16::from("required")))
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_DOMAIN",
                    path,
                    "Source copy requires compatible availability and exact native capacity",
                    Severity::Error,
                ));
            }
            let source_element = source_field;
            let target_element = target_field;
            if let Some(allowed) =
                array_items(member(source_element, "allowedValues").unwrap_or(&Value::Null))
                    .filter(|values| !values.is_empty())
            {
                for literal in allowed {
                    if literal != &Value::Null
                        || member(source_element, "nullability")
                            != Some(&Value::String(Utf16::from("required")))
                    {
                        validate_stored_literal(
                            document,
                            target_element,
                            literal,
                            member(target_column, "nativeType").unwrap_or(&Value::Null),
                            &append_path(path, "field"),
                            policy,
                            ctx,
                            out,
                        )?;
                    }
                }
            } else {
                if member(target_element, "allowedValues").is_some() {
                    out.push_capped(core_diag(
                        "TABLES_OPERATION_DOMAIN",
                        path,
                        "Source domain does not prove target membership",
                        Severity::Error,
                    ));
                }
                let source_facets =
                    object_members(member(source_element, "facets").unwrap_or(&Value::Null))
                        .unwrap_or(&[]);
                let target_facets =
                    object_members(member(target_element, "facets").unwrap_or(&Value::Null))
                        .unwrap_or(&[]);
                for (key, facet) in target_facets {
                    let source = source_facets
                        .iter()
                        .find(|(source_key, _)| source_key == key)
                        .map(|(_, value)| value)
                        .unwrap_or(&Value::Null);
                    let target_bytes = crate::canonical::canonical_json_admitted(facet, ctx)?;
                    let source_bytes = crate::canonical::canonical_json_admitted(source, ctx)?;
                    if target_bytes != source_bytes {
                        out.push_capped(core_diag(
                            "TABLES_OPERATION_DOMAIN",
                            path,
                            "Source domain does not prove the target refinement",
                            Severity::Error,
                        ));
                    }
                }
            }
        }
        return Ok(());
    }
    if kind == "literal" {
        if let (Some(column), Some(field)) = (
            operation_field(table, target, path, out, ctx)?,
            resolve_ref(document, target),
        ) {
            validate_stored_literal(
                document,
                field,
                member(value, "value").unwrap_or(&Value::Null),
                member(column, "nativeType").unwrap_or(&Value::Null),
                &append_path(path, "value"),
                policy,
                ctx,
                out,
            )?;
        }
        return Ok(());
    }
    if let Some(id) = string_member(value, "parameter") {
        used.insert(id.clone());
        let Some(parameter) = parameters
            .iter()
            .find(|p| string_member(p, "id") == Some(id))
        else {
            out.push_capped(core_diag(
                "TABLES_OPERATION_PARAMETER",
                &append_path(path, "parameter"),
                "Unknown operation parameter",
                Severity::Error,
            ));
            return Ok(());
        };
        let source_ref = member(parameter, "field").unwrap_or(&Value::Null);
        let source_element = resolve_ref(document, source_ref);
        let source_column = array_items(member(payload, "tables").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .find_map(|table| {
                array_items(member(table, "columns").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .find(|column| {
                        member(column, "field").is_some_and(|field| refs_equal(field, source_ref))
                    })
            });
        let target_column = operation_field(table, target, path, out, ctx)?;
        if let (Some(source_element), Some(source_column), Some(target_column)) =
            (source_element, source_column, target_column)
        {
            let source_domain = canonical_field_domain(source_element, ctx)?;
            let target_domain = canonical_field_domain(field, ctx)?;
            let source_native = canonical_native_domain(
                member(source_column, "nativeType").unwrap_or(&Value::Null),
                ctx,
            )?;
            let target_native = canonical_native_domain(
                member(target_column, "nativeType").unwrap_or(&Value::Null),
                ctx,
            )?;
            if source_domain != target_domain
                || member(source_element, "nullability") != member(field, "nullability")
                || source_native != target_native
            {
                out.push_capped(core_diag(
                    "TABLES_OPERATION_DOMAIN",
                    path,
                    "Parameter and selected Field domains must match exactly",
                    Severity::Error,
                ));
            }
        }
    }
    Ok(())
}

fn inspect_policies(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    nodes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut terminal = None;
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut edges: Vec<(Vec<u16>, Vec<Vec<u16>>)> = Vec::new();
    for (i, table) in tables.iter().enumerate() {
        ctx.charge_work(1, append_path(&append_path(path, "tables"), &i.to_string()))?;
        let record = member(table, "record").unwrap_or(&Value::Null);
        let source_key = ref_key(record);
        let mut destinations = Vec::new();
        let table_path = append_path(&append_path(path, "tables"), &i.to_string());
        for audience in ["person", "batch"] {
            let policy = member(member(table, "policy").unwrap_or(&Value::Null), audience)
                .unwrap_or(&Value::Null);
            for command in ["select", "insert", "update", "delete"] {
                let rule_path = append_path(
                    &append_path(&append_path(&table_path, "policy"), audience),
                    command,
                );
                inspect_policy_rule(
                    member(policy, command).unwrap_or(&Value::Null),
                    record,
                    table,
                    payload,
                    document,
                    &rule_path,
                    0,
                    &mut destinations,
                    out,
                    nodes,
                    ctx,
                    &mut terminal,
                );
                if terminal.is_some() {
                    return Err(terminal.take().expect("checked terminal"));
                }
            }
            let update = member(policy, "update").and_then(|v| string_member(v, "kind"));
            let delete = member(policy, "delete").and_then(|v| string_member(v, "kind"));
            let select = member(policy, "select").and_then(|v| string_member(v, "kind"));
            if (update != Some(&Utf16::from("deny")) || delete != Some(&Utf16::from("deny")))
                && select == Some(&Utf16::from("deny"))
            {
                out.push_capped(core_diag("TABLES_POLICY_SELECT", &append_path(&append_path(&table_path, "policy"), audience), "UPDATE/DELETE require explicit native SELECT policy/grants; the compiler cannot broaden them", Severity::Error));
            }
        }
        edges.push((source_key, destinations));
    }
    let mut active: Vec<Vec<u16>> = Vec::new();
    let mut done: Vec<Vec<u16>> = Vec::new();
    for (source, _) in &edges {
        visit_policy_graph(source, &edges, &mut active, &mut done, path, out, ctx)?;
    }
    Ok(())
}

fn inspect_policy_rule(
    rule: &Value,
    current_record: &Value,
    current_table: &Value,
    payload: &Value,
    document: &Value,
    path: &Utf16,
    depth: usize,
    edges: &mut Vec<Vec<u16>>,
    out: &mut Vec<Diagnostic>,
    nodes: &mut usize,
    ctx: &mut Context<'_>,
    terminal: &mut Option<EngineError>,
) {
    if terminal.is_some() {
        return;
    }
    if let Err(error) = ctx.charge_work(1, path.clone()) {
        *terminal = Some(error);
        return;
    }
    *nodes = nodes.saturating_add(1);
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    if depth > 16 || *nodes > 4096 {
        out.push_capped(core_diag(
            "TABLES_COMPLEXITY",
            path,
            "Expression/rule depth or module node budget exceeded",
            Severity::Error,
        ));
        return;
    }
    let kind = string_member(rule, "kind")
        .and_then(|s| s.to_utf8().ok())
        .unwrap_or_default();
    if kind == "owner" || kind == "memberOf" {
        let field_ref = member(rule, "field").unwrap_or(&Value::Null);
        let element = match inspect_field_reference(
            document,
            field_ref,
            &append_path(path, "field"),
            out,
            ctx,
        ) {
            Ok(value) => value,
            Err(error) => {
                *terminal = Some(error);
                return;
            }
        };
        let record = resolve_ref(document, current_record);
        if let Err(error) = ctx.charge_work(
            array_items(member(record.unwrap_or(&Value::Null), "members").unwrap_or(&Value::Null))
                .map_or(0, |members| members.len()),
            path.clone(),
        ) {
            *terminal = Some(error);
            return;
        }
        let is_member =
            array_items(member(record.unwrap_or(&Value::Null), "members").unwrap_or(&Value::Null))
                .unwrap_or(&[])
                .iter()
                .any(|r| refs_equal(r, field_ref));
        if !is_member
            || string_member(element.unwrap_or(&Value::Null), "scalarType")
                != Some(&Utf16::from("string"))
        {
            out.push_capped(core_diag(
                "TABLES_POLICY_FIELD",
                &append_path(path, "field"),
                "Owner/group rule requires a text Field of the current policy Record",
                Severity::Error,
            ));
        }
    } else if kind == "any" || kind == "all" {
        for (i, child) in array_items(member(rule, "rules").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            inspect_policy_rule(
                child,
                current_record,
                current_table,
                payload,
                document,
                &append_path(&append_path(path, "rules"), &i.to_string()),
                depth + 1,
                edges,
                out,
                nodes,
                ctx,
                terminal,
            );
        }
    } else if kind == "related" {
        let target_record = member(rule, "record").unwrap_or(&Value::Null);
        let table_items =
            array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
        if let Err(error) = ctx.charge_work(table_items.len(), path.clone()) {
            *terminal = Some(error);
            return;
        }
        let target_table = table_items
            .iter()
            .find(|table| member(table, "record").is_some_and(|r| refs_equal(r, target_record)));
        let origin_record = member(current_table, "record").unwrap_or(&Value::Null);
        if target_table.is_none()
            || string_member(target_record, "module") != string_member(origin_record, "module")
        {
            out.push_capped(core_diag(
                "TABLES_POLICY_TABLE",
                &append_path(path, "record"),
                "Related rule requires original tables in this plugin module",
                Severity::Error,
            ));
            return;
        }
        let target_table = target_table.unwrap();
        let matches = array_items(member(rule, "matches").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let mut pairs = BTreeSet::<(Vec<u16>, Vec<u16>)>::new();
        for (i, pair) in matches.iter().enumerate() {
            let source = member(pair, "source").unwrap_or(&Value::Null);
            let target = member(pair, "target").unwrap_or(&Value::Null);
            if let Err(error) = ctx.charge_work(
                1,
                append_path(&append_path(path, "matches"), &i.to_string()),
            ) {
                *terminal = Some(error);
                return;
            }
            if !pairs.insert((ref_key(source), ref_key(target))) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &append_path(&append_path(path, "matches"), &i.to_string()),
                    "Duplicate association field pair",
                    Severity::Error,
                ));
            }
        }
        for (i, pair) in matches.iter().enumerate() {
            let source = member(pair, "source").unwrap_or(&Value::Null);
            let target = member(pair, "target").unwrap_or(&Value::Null);
            let location = append_path(&append_path(path, "matches"), &i.to_string());
            let source_field = match inspect_field_reference(
                document,
                source,
                &append_path(&location, "source"),
                out,
                ctx,
            ) {
                Ok(value) => value,
                Err(error) => {
                    *terminal = Some(error);
                    return;
                }
            };
            let target_field = match inspect_field_reference(
                document,
                target,
                &append_path(&location, "target"),
                out,
                ctx,
            ) {
                Ok(value) => value,
                Err(error) => {
                    *terminal = Some(error);
                    return;
                }
            };
            let source_mapped = match table_has_field(current_table, source, ctx, &location) {
                Ok(value) => value,
                Err(error) => {
                    *terminal = Some(error);
                    return;
                }
            };
            let target_mapped = match table_has_field(target_table, target, ctx, &location) {
                Ok(value) => value,
                Err(error) => {
                    *terminal = Some(error);
                    return;
                }
            };
            if !source_mapped || !target_mapped {
                out.push_capped(core_diag("TABLES_POLICY_FIELD", &location, "Association fields must be mapped by their respective source and target tables", Severity::Error));
            }
            if source_field.zip(target_field).is_some_and(|(a, b)| {
                string_member(a, "cardinality") != Some(&Utf16::from("one"))
                    || string_member(b, "cardinality") != Some(&Utf16::from("one"))
                    || string_member(a, "scalarType") != string_member(b, "scalarType")
            }) {
                out.push_capped(core_diag("TABLES_POLICY_DOMAIN", &location, "Association equality requires the same singleton scalar carrier without coercion", Severity::Error));
            }
        }
        let key = ref_key(target_record);
        if !edges.contains(&key) {
            edges.push(key);
        }
        inspect_policy_rule(
            member(rule, "rule").unwrap_or(&Value::Null),
            target_record,
            target_table,
            payload,
            document,
            &append_path(path, "rule"),
            depth + 1,
            edges,
            out,
            nodes,
            ctx,
            terminal,
        );
    } else if kind == "via" {
        let mut current = current_record.clone();
        let mut valid = true;
        let policy_path = array_items(member(rule, "path").unwrap_or(&Value::Null)).unwrap_or(&[]);
        if let Err(error) = ctx.charge_work(policy_path.len(), path.clone()) {
            *terminal = Some(error);
            return;
        }
        for (i, step) in policy_path.iter().enumerate() {
            let location = append_path(&append_path(path, "path"), &i.to_string());
            let module = string_member(step, "module");
            let module_id = string_member(current_record, "module");
            if module != module_id {
                out.push_capped(core_diag(
                    "TABLES_POLICY_MODULE",
                    &location,
                    "Via paths cannot access another plugin module",
                    Severity::Error,
                ));
                valid = false;
                break;
            }
            let relation = find_relationship(
                document,
                module.unwrap_or(&Utf16::default()),
                string_member(step, "id"),
            );
            let source = array_items(
                member(relation.unwrap_or(&Value::Null), "source").unwrap_or(&Value::Null),
            )
            .unwrap_or(&[]);
            let target = array_items(
                member(relation.unwrap_or(&Value::Null), "target").unwrap_or(&Value::Null),
            )
            .unwrap_or(&[]);
            if source.len() != 1 || target.len() != 1 {
                out.push_capped(core_diag(
                    "TABLES_POLICY_RELATIONSHIP",
                    &location,
                    "Via requires a single bound core relationship",
                    Severity::Error,
                ));
                valid = false;
                break;
            }
            let forward = string_member(step, "direction") == Some(&Utf16::from("forward"));
            let from = if forward { &source[0] } else { &target[0] };
            let to = if forward { &target[0] } else { &source[0] };
            if !refs_equal(&current, from) {
                out.push_capped(core_diag(
                    "TABLES_POLICY_PATH",
                    &location,
                    "Via path does not continue from the current Record",
                    Severity::Error,
                ));
                valid = false;
                break;
            }
            if let Err(error) = ctx.charge_work(tables.len(), location.clone()) {
                *terminal = Some(error);
                return;
            }
            let binding_count = tables
                .iter()
                .flat_map(|t| {
                    array_items(member(t, "foreignKeys").unwrap_or(&Value::Null))
                        .unwrap_or(&[])
                        .iter()
                })
                .filter(|fk| {
                    member(fk, "relationship").is_some_and(|r| {
                        string_member(r, "module") == module
                            && string_member(r, "id") == string_member(step, "id")
                    })
                })
                .count();
            if binding_count != 1 {
                out.push_capped(core_diag(
                    "TABLES_POLICY_MAPPING",
                    &location,
                    "Via requires one explicit native foreign-key binding",
                    Severity::Error,
                ));
                valid = false;
                break;
            }
            if let Err(error) = ctx.charge_work(tables.len(), location.clone()) {
                *terminal = Some(error);
                return;
            }
            let destination = tables
                .iter()
                .find(|t| member(t, "record").is_some_and(|r| refs_equal(r, to)));
            let Some(destination) = destination else {
                out.push_capped(core_diag(
                    "TABLES_POLICY_TABLE",
                    &location,
                    "Via target has no table in this module",
                    Severity::Error,
                ));
                valid = false;
                break;
            };
            let key = ref_key(member(destination, "record").unwrap_or(&Value::Null));
            if !edges.contains(&key) {
                edges.push(key);
            }
            current = to.clone();
        }
        if valid {
            let destination = table_for_record(payload, &current).unwrap_or(current_table);
            inspect_policy_rule(
                member(rule, "rule").unwrap_or(&Value::Null),
                &current,
                destination,
                payload,
                document,
                &append_path(path, "rule"),
                depth + 1,
                edges,
                out,
                nodes,
                ctx,
                terminal,
            );
        }
    }
}

fn table_has_field(
    table: &Value,
    field: &Value,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<bool, EngineError> {
    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(columns.len(), path.clone())?;
    Ok(columns
        .iter()
        .any(|c| member(c, "field").is_some_and(|r| refs_equal(r, field))))
}
fn table_for_record<'a>(payload: &'a Value, record: &Value) -> Option<&'a Value> {
    array_items(member(payload, "tables")?)?
        .iter()
        .find(|t| member(t, "record").is_some_and(|r| refs_equal(r, record)))
}
fn find_relationship<'a>(
    document: &'a Value,
    module: &Utf16,
    id: Option<&Utf16>,
) -> Option<&'a Value> {
    array_items(member(document, "modules")?)?
        .iter()
        .find(|m| string_member(m, "id") == Some(module))
        .and_then(|m| {
            array_items(member(m, "relationships")?)?
                .iter()
                .find(|r| string_member(r, "id") == id)
        })
}
fn ref_key(value: &Value) -> Vec<u16> {
    let module = string_member(value, "module")
        .map(|text| text.units())
        .unwrap_or(&[]);
    let element = string_member(value, "element")
        .map(|text| text.units())
        .unwrap_or(&[]);
    let mut key = module.len().to_string().encode_utf16().collect::<Vec<_>>();
    key.push(58);
    key.extend_from_slice(module);
    key.extend_from_slice(element);
    key
}
fn inspect_field_reference<'a>(
    document: &'a Value,
    reference: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    ctx.charge_work(128, path.clone())?;
    let field = resolve_ref(document, reference)
        .filter(|field| string_member(field, "kind") == Some(&Utf16::from("field")));
    let Some(field) = field else {
        out.push_capped(core_diag(
            "TABLES_FIELD",
            path,
            "Expected an exact core Field reference",
            Severity::Error,
        ));
        return Ok(None);
    };
    if string_member(field, "cardinality") != Some(&Utf16::from("one"))
        || !["required", "absent-allowed"]
            .iter()
            .any(|value| string_member(field, "nullability") == Some(&Utf16::from(*value)))
    {
        out.push_capped(core_diag(
            "TABLES_FIELD_SHAPE",
            path,
            "Native table fields require explicit singleton cardinality and nullability",
            Severity::Error,
        ));
    }
    Ok(Some(field))
}

fn visit_policy_graph(
    id: &[u16],
    edges: &[(Vec<u16>, Vec<Vec<u16>>)],
    active: &mut Vec<Vec<u16>>,
    done: &mut Vec<Vec<u16>>,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1 + active.len() + done.len() + edges.len(), path.clone())?;
    if active.iter().any(|x| x == id) {
        out.push_capped(core_diag(
            "TABLES_POLICY_CYCLE",
            &append_path(path, "tables"),
            "Cyclic native policy dependencies are unsupported",
            Severity::Error,
        ));
        return Ok(());
    }
    if done.iter().any(|x| x == id) {
        return Ok(());
    }
    active.push(id.to_vec());
    if let Some((_, targets)) = edges.iter().find(|(source, _)| source == id) {
        for target in targets {
            visit_policy_graph(target, edges, active, done, path, out, ctx)?;
        }
    }
    active.pop();
    done.push(id.to_vec());
    Ok(())
}

fn inspect_seed_sets(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let seeds = array_items(member(payload, "seedSets").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let tables = array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut ids = BTreeSet::<Utf16>::new();
    for (i, set) in seeds.iter().enumerate() {
        let set_path = append_path(&append_path(path, "seedSets"), &i.to_string());
        ctx.charge_work(1, set_path.clone())?;
        if let Some(id) = string_member(set, "id") {
            if !ids.insert(id.clone()) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &set_path,
                    "Duplicate seed-set ID",
                    Severity::Error,
                ));
            }
        }
    }
    for (i, set) in seeds.iter().enumerate() {
        let set_path = append_path(&append_path(path, "seedSets"), &i.to_string());
        ctx.charge_work(1, set_path.clone())?;
        for (j, row) in array_items(member(set, "rows").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            let row_path = append_path(&append_path(&set_path, "rows"), &j.to_string());
            ctx.charge_work(1, row_path.clone())?;
            ctx.charge_work(tables.len(), append_path(&row_path, "table"))?;
            let table = tables
                .iter()
                .find(|t| string_member(t, "id") == string_member(row, "table"));
            let Some(table) = table else {
                out.push_capped(core_diag(
                    "TABLES_SEED_TABLE",
                    &append_path(&row_path, "table"),
                    "Seed table is not declared by this module",
                    Severity::Error,
                ));
                continue;
            };
            let values = array_items(member(row, "values").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let mut seen = BTreeSet::<Vec<u16>>::new();
            for (k, entry) in values.iter().enumerate() {
                let entry_path = append_path(&append_path(&row_path, "values"), &k.to_string());
                ctx.charge_work(1, entry_path.clone())?;
                if !seen.insert(ref_key(member(entry, "field").unwrap_or(&Value::Null))) {
                    out.push_capped(core_diag(
                        "TABLES_DUPLICATE",
                        &entry_path,
                        "Duplicate seed Field",
                        Severity::Error,
                    ));
                }
            }
            for (k, entry) in values.iter().enumerate() {
                let entry_path = append_path(&append_path(&row_path, "values"), &k.to_string());
                ctx.charge_work(1, entry_path.clone())?;
                let field = member(entry, "field").unwrap_or(&Value::Null);
                let columns =
                    array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
                ctx.charge_work(columns.len(), append_path(&entry_path, "field"))?;
                let column = columns.iter().find(|column| {
                    member(column, "field").is_some_and(|reference| refs_equal(reference, field))
                });
                if column.is_none() {
                    out.push_capped(core_diag(
                        "TABLES_SEED_FIELD",
                        &append_path(&entry_path, "field"),
                        "Seed Field is not mapped by this table",
                        Severity::Error,
                    ));
                } else if let Some(column) = column {
                    if let Some(element) = resolve_ref(document, field) {
                        validate_stored_literal(
                            document,
                            element,
                            member(entry, "value").unwrap_or(&Value::Null),
                            member(column, "nativeType").unwrap_or(&Value::Null),
                            &append_path(&entry_path, "value"),
                            policy,
                            ctx,
                            out,
                        )?;
                    }
                    if string_member(
                        member(column, "generated").unwrap_or(&Value::Null),
                        "generation",
                    ) == Some(&Utf16::from("always"))
                    {
                        out.push_capped(core_diag(
                            "TABLES_SEED_GENERATED",
                            &entry_path,
                            "Seed cannot override a generated-always column",
                            Severity::Error,
                        ));
                    }
                }
            }
            for column in
                array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[])
            {
                ctx.charge_work(1, row_path.clone())?;
                let field = member(column, "field").unwrap_or(&Value::Null);
                let required = resolve_ref(document, field)
                    .and_then(|element| string_member(element, "nullability"))
                    == Some(&Utf16::from("required"));
                let supplied = seen.contains(&ref_key(field));
                if required
                    && member(column, "default").is_none()
                    && member(column, "generated").is_none()
                    && !supplied
                {
                    out.push_capped(core_diag(
                        "TABLES_SEED_REQUIRED",
                        &append_path(&row_path, "values"),
                        "Seed omits a required create Field",
                        Severity::Error,
                    ));
                }
            }
        }
    }
    Ok(())
}

fn inspect_table_refs(
    table: &Value,
    payload: &Value,
    document: &Value,
    module_path: &Utf16,
    table_index: usize,
    out: &mut Vec<Diagnostic>,
    policy: &umf_core::literal_policy::PreparedPolicy,
    rule_nodes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let tables_path = append_path(
        &append_path(module_path, "tables"),
        &table_index.to_string(),
    );
    if let Some(name) = string_member(table, "name") {
        check_identifier(name, &append_path(&tables_path, "name"), out);
    }
    let record_ref = member(table, "record").unwrap_or(&Value::Null);
    let Some(record_module) = string_member(record_ref, "module") else {
        return Ok(());
    };
    let modules = array_items(member(document, "modules").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let owner_index = module_path.to_utf8().ok().and_then(|p| {
        p.strip_prefix("/modules/")
            .and_then(|tail| tail.split('/').next()?.parse::<usize>().ok())
    });
    let owner_id = owner_index
        .and_then(|i| modules.get(i))
        .and_then(|m| string_member(m, "id"));
    let record = resolve_ref(document, record_ref);
    if owner_id != Some(record_module)
        || member(record.unwrap_or(&Value::Null), "kind")
            != Some(&Value::String(Utf16::from("record")))
    {
        out.push_capped(core_diag(
            "TABLES_RECORD",
            &append_path(&tables_path, "record"),
            "A table must bind an exact Record in its owning module",
            Severity::Error,
        ));
        return Ok(());
    }
    let members =
        array_items(member(record.unwrap(), "members").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let mut member_fields = BTreeSet::new();
    for (index, member) in members.iter().enumerate() {
        ctx.charge_work(
            1,
            append_path(
                &append_path(&tables_path, "record/members"),
                &index.to_string(),
            ),
        )?;
        member_fields.insert(ref_key(member));
    }
    for (key, label) in [("field", "mapped Field"), ("name", "native column name")] {
        let mut seen = BTreeSet::new();
        for (index, column) in columns.iter().enumerate() {
            ctx.charge_work(128, tables_path.clone())?;
            let value = member(column, key).unwrap_or(&Value::Null);
            let identity = if key == "field" {
                ref_key(value)
            } else {
                match value {
                    Value::String(text) => text.units().to_vec(),
                    _ => Vec::new(),
                }
            };
            if !seen.insert(identity) {
                out.push_capped(core_diag(
                    "TABLES_DUPLICATE",
                    &append_path(&append_path(&tables_path, "columns"), &index.to_string()),
                    &format!("Duplicate {label}"),
                    Severity::Error,
                ));
            }
        }
    }
    let mut mapped = BTreeSet::new();
    for (index, column) in columns.iter().enumerate() {
        let column_path = append_path(&append_path(&tables_path, "columns"), &index.to_string());
        ctx.charge_work(1, column_path.clone())?;
        let field_ref = member(column, "field").unwrap_or(&Value::Null);
        mapped.insert(ref_key(field_ref));
        if !member_fields.contains(&ref_key(field_ref)) {
            out.push_capped(core_diag(
                "TABLES_COLUMN_SCOPE",
                &append_path(&column_path, "field"),
                "Column is not a member of the bound Record",
                Severity::Error,
            ));
        }
        let field = resolve_ref(document, field_ref);
        if member(field.unwrap_or(&Value::Null), "kind")
            != Some(&Value::String(Utf16::from("field")))
        {
            out.push_capped(core_diag(
                "TABLES_FIELD",
                &append_path(&column_path, "field"),
                "Expected an exact core Field reference",
                Severity::Error,
            ));
        } else if let Some(field) = field {
            let card = string_member(field, "cardinality");
            let nullability = string_member(field, "nullability");
            let valid_nullability = nullability.is_some_and(|n| {
                n == &Utf16::from("required") || n == &Utf16::from("absent-allowed")
            });
            if card != Some(&Utf16::from("one")) || !valid_nullability {
                out.push_capped(core_diag(
                    "TABLES_FIELD_SHAPE",
                    &append_path(&column_path, "field"),
                    "Native table fields require explicit singleton cardinality and nullability",
                    Severity::Error,
                ));
            }
            inspect_native_column(column, field, document, &column_path, out, policy, ctx)?;
        }
        if field.is_none_or(|field| string_member(field, "kind") != Some(&Utf16::from("field"))) {
            if let Some(name) = string_member(column, "name") {
                check_identifier(name, &append_path(&column_path, "name"), out);
            }
        }
    }
    for (index, record_member) in members.iter().enumerate() {
        ctx.charge_work(
            1,
            append_path(
                &append_path(&tables_path, "record/members"),
                &index.to_string(),
            ),
        )?;
        if !mapped.contains(&ref_key(record_member)) {
            out.push_capped(core_diag(
                "TABLES_COLUMN_MISSING",
                &append_path(&tables_path, "columns"),
                "Record member has no native column mapping",
                Severity::Error,
            ));
        }
    }
    let keys = array_items(member(record.unwrap(), "keys").unwrap_or(&Value::Null)).unwrap_or(&[]);
    for column in columns {
        ctx.charge_work(keys.len(), tables_path.clone())?;
        if member(column, "immutable") == Some(&Value::Bool(false))
            && keys.iter().any(|key| {
                array_items(member(key, "fields").unwrap_or(&Value::Null))
                    .unwrap_or(&[])
                    .iter()
                    .any(|field| {
                        member(column, "field").is_some_and(|mapped| refs_equal(field, mapped))
                    })
            })
        {
            out.push_capped(core_diag(
                "TABLES_KEY_MUTABILITY",
                &append_path(&tables_path, "columns"),
                "An authored core Key cannot be made mutable by its native mapping",
                Severity::Error,
            ));
        }
    }
    ctx.charge_work(keys.len(), append_path(&tables_path, "record"))?;
    let primary_count = keys
        .iter()
        .filter(|key| member(key, "primary") == Some(&Value::Bool(true)))
        .count();
    if primary_count != 1 {
        out.push_capped(core_diag(
            "TABLES_PRIMARY_KEY",
            &append_path(&tables_path, "record"),
            "A native lifecycle table requires one explicit primary Key",
            Severity::Error,
        ));
    }
    for key in keys {
        for field_ref in array_items(member(key, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]) {
            let field = inspect_field_reference(
                document,
                field_ref,
                &append_path(&tables_path, "record"),
                out,
                ctx,
            )?;
            let required = field.and_then(|f| string_member(f, "nullability"))
                == Some(&Utf16::from("required"));
            ctx.charge_work(1, append_path(&tables_path, "record"))?;
            if !required || !mapped.contains(&ref_key(field_ref)) {
                out.push_capped(core_diag(
                    "TABLES_KEY",
                    &append_path(&tables_path, "record"),
                    "Native Keys require mapped required singleton fields",
                    Severity::Error,
                ));
            }
        }
    }
    inspect_indexes_checks_and_foreign_keys(
        table,
        payload,
        record.unwrap(),
        document,
        module_path,
        &tables_path,
        out,
        policy,
        rule_nodes,
        ctx,
    )?;
    Ok(())
}

fn inspect_native_column(
    column: &Value,
    field: &Value,
    document: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    if let Some(name) = string_member(column, "name") {
        check_identifier(name, &append_path(path, "name"), out);
    }
    let native = member(column, "nativeType").unwrap_or(&Value::Null);
    let kind = string_member(native, "kind")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let scalar = string_member(field, "scalarType")
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    let family_ok = match kind.as_str() {
        "boolean" => scalar == "boolean",
        "text" | "varchar" | "char" => scalar == "string",
        "int2" | "int4" | "int8" => scalar == "integer",
        "float4" | "float8" => scalar == "float",
        "numeric" => scalar == "decimal",
        "date" => scalar == "date",
        "timestamp" | "timestamptz" => scalar == "timestamp",
        "uuid" => scalar == "uuid",
        "bytea" => matches!(scalar.as_str(), "binary" | "bits128"),
        _ => false,
    };
    if !family_ok {
        out.push_capped(core_diag(
            "TABLES_NATIVE_TYPE",
            &append_path(path, "nativeType"),
            "Native type and logical scalar family differ",
            Severity::Error,
        ));
    }
    if kind == "numeric" {
        let precision = number_member(native, "precision").unwrap_or(0.0);
        let scale = number_member(native, "scale").unwrap_or(0.0);
        if scale > precision {
            out.push_capped(core_diag(
                "TABLES_NUMERIC",
                &append_path(&append_path(path, "nativeType"), "scale"),
                "Numeric scale exceeds precision",
                Severity::Error,
            ));
        }
    }
    if member(column, "generated").is_some() {
        let is_int = matches!(kind.as_str(), "int2" | "int4" | "int8");
        let no_default = member(column, "default").is_none();
        let required = string_member(field, "nullability") == Some(&Utf16::from("required"));
        if !is_int || !no_default || !required {
            out.push_capped(core_diag(
                "TABLES_IDENTITY",
                &append_path(path, "generated"),
                "Identity requires a required integer column without another default",
                Severity::Error,
            ));
        }
    }
    inspect_column_literals(column, field, document, path, policy, ctx, out)?;
    if let Some(default) = member(column, "default") {
        let default_kind = string_member(default, "kind")
            .and_then(|v| v.to_utf8().ok())
            .unwrap_or_default();
        if default_kind == "randomUuid" && kind != "uuid" {
            out.push_capped(core_diag(
                "TABLES_DEFAULT",
                &append_path(path, "default"),
                "Random UUID requires UUID storage",
                Severity::Error,
            ));
        }
        if default_kind == "currentTimestamp" && kind != "timestamptz" {
            out.push_capped(core_diag(
                "TABLES_DEFAULT",
                &append_path(path, "default"),
                "Current timestamp requires timestamptz; no guessed timezone conversion",
                Severity::Error,
            ));
        }
    }
    Ok(())
}

fn inspect_indexes_checks_and_foreign_keys(
    table: &Value,
    payload: &Value,
    record: &Value,
    document: &Value,
    module_path: &Utf16,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    policy: &umf_core::literal_policy::PreparedPolicy,
    nodes: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(columns.len(), path.clone())?;
    let fields = columns
        .iter()
        .filter_map(|column| member(column, "field"))
        .collect::<Vec<_>>();
    for (kind, label) in [
        ("indexes", "index ID"),
        ("checks", "check ID"),
        ("foreignKeys", "foreign-key ID"),
    ] {
        let mut seen = BTreeSet::new();
        for (index, item) in array_items(member(table, kind).unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .enumerate()
        {
            ctx.charge_work(128, path.clone())?;
            if let Some(id) = string_member(item, "id") {
                ctx.charge_work(id.len(), path.clone())?;
                if !seen.insert(id.clone()) {
                    out.push_capped(core_diag(
                        "TABLES_DUPLICATE",
                        &append_path(&append_path(path, kind), &index.to_string()),
                        &format!("Duplicate {label}"),
                        Severity::Error,
                    ));
                }
            }
        }
    }
    let mut names = BTreeSet::new();
    let mut constraint_index = 0usize;
    for kind in ["checks", "foreignKeys"] {
        for item in array_items(member(table, kind).unwrap_or(&Value::Null)).unwrap_or(&[]) {
            ctx.charge_work(128, path.clone())?;
            if let Some(name) = string_member(item, "name") {
                ctx.charge_work(name.len(), path.clone())?;
                if !names.insert(name.clone()) {
                    out.push_capped(core_diag(
                        "TABLES_DUPLICATE",
                        &append_path(path, &constraint_index.to_string()),
                        "Duplicate native constraint name",
                        Severity::Error,
                    ));
                }
            }
            constraint_index += 1;
        }
    }
    for (index, item) in array_items(member(table, "indexes").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let location = append_path(&append_path(path, "indexes"), &index.to_string());
        ctx.charge_work(128, location.clone())?;
        if let Some(name) = string_member(item, "name") {
            check_identifier(name, &append_path(&location, "name"), out);
        }
        let selected = array_items(member(item, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
        let included = array_items(member(item, "include").unwrap_or(&Value::Null)).unwrap_or(&[]);
        inspect_selected_refs(
            selected,
            &fields,
            &append_path(&location, "fields"),
            out,
            ctx,
        )?;
        inspect_selected_refs(
            included,
            &fields,
            &append_path(&location, "include"),
            out,
            ctx,
        )?;
        if selected.len() + included.len() > 32 {
            out.push_capped(core_diag(
                "TABLES_INDEX_WIDTH",
                &location,
                "PostgreSQL index key/include inventory exceeds 32 columns",
                Severity::Error,
            ));
        }
        ctx.charge_work(
            selected.len().saturating_mul(included.len()),
            location.clone(),
        )?;
        if included
            .iter()
            .any(|reference| selected.iter().any(|key| refs_equal(reference, key)))
        {
            out.push_capped(core_diag(
                "TABLES_INDEX_OVERLAP",
                &append_path(&location, "include"),
                "Included field overlaps an index key",
                Severity::Error,
            ));
        }
    }
    for (index, item) in array_items(member(table, "checks").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let location = append_path(&append_path(path, "checks"), &index.to_string());
        ctx.charge_work(128, location.clone())?;
        if let Some(name) = string_member(item, "name") {
            check_identifier(name, &append_path(&location, "name"), out);
        }
        let expression_path = append_path(&location, "expression");
        if inspect_expression(
            member(item, "expression").unwrap_or(&Value::Null),
            &fields,
            document,
            policy,
            &expression_path,
            0,
            nodes,
            ctx,
            out,
        )?
        .kind
            != "boolean"
        {
            out.push_capped(core_diag(
                "TABLES_CHECK_TYPE",
                &expression_path,
                "Check expression must have Boolean type",
                Severity::Error,
            ));
        }
    }
    for (index, item) in array_items(member(table, "foreignKeys").unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .enumerate()
    {
        let location = append_path(&append_path(path, "foreignKeys"), &index.to_string());
        ctx.charge_work(128, location.clone())?;
        if let Some(name) = string_member(item, "name") {
            check_identifier(name, &append_path(&location, "name"), out);
        }
        inspect_foreign_key(
            item,
            table,
            payload,
            record,
            document,
            module_path,
            &location,
            out,
            ctx,
        )?;
    }
    Ok(())
}
fn inspect_selected_refs(
    refs: &[Value],
    fields: &[&Value],
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut seen = BTreeSet::new();
    for (index, reference) in refs.iter().enumerate() {
        ctx.charge_work(128, path.clone())?;
        if !seen.insert(ref_key(reference)) {
            out.push_capped(core_diag(
                "TABLES_DUPLICATE",
                &append_path(path, &index.to_string()),
                "Duplicate Field",
                Severity::Error,
            ));
        }
    }
    for (index, reference) in refs.iter().enumerate() {
        ctx.charge_work(fields.len(), path.clone())?;
        if !fields.iter().any(|field| refs_equal(field, reference)) {
            out.push_capped(core_diag(
                "TABLES_COLUMN_SCOPE",
                &append_path(path, &index.to_string()),
                "Field is not mapped by this table",
                Severity::Error,
            ));
        }
    }
    Ok(())
}

fn inspect_foreign_key(
    fk: &Value,
    table: &Value,
    payload: &Value,
    _record: &Value,
    document: &Value,
    module_path: &Utf16,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let fields = array_items(member(fk, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
    let columns = array_items(member(table, "columns").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(columns.len(), path.clone())?;
    let mapped = columns
        .iter()
        .filter_map(|column| member(column, "field"))
        .collect::<Vec<_>>();
    inspect_selected_refs(fields, &mapped, &append_path(path, "fields"), out, ctx)?;
    let target = member(fk, "target").unwrap_or(&Value::Null);
    let target_record_ref = member(target, "record").unwrap_or(&Value::Null);
    let target_record = resolve_ref(document, target_record_ref);
    let key_id = string_member(target, "key");
    let target_key = target_record.and_then(|record| {
        let keys = array_items(member(record, "keys").unwrap_or(&Value::Null))?;
        keys.iter().find(|key| string_member(key, "id") == key_id)
    });
    if let Some(target_record) = target_record {
        ctx.charge_work(
            array_items(member(target_record, "keys").unwrap_or(&Value::Null))
                .map_or(0, |keys| keys.len()),
            append_path(path, "target"),
        )?;
    }
    let Some(target_key) = target_key else {
        out.push_capped(core_diag(
            "TABLES_FOREIGN_KEY",
            &append_path(path, "target"),
            "Target must be an exact authored Key with matching arity",
            Severity::Error,
        ));
        return Ok(());
    };
    let target_fields =
        array_items(member(target_key, "fields").unwrap_or(&Value::Null)).unwrap_or(&[]);
    if target_fields.len() != fields.len() {
        out.push_capped(core_diag(
            "TABLES_FOREIGN_KEY",
            &append_path(path, "target"),
            "Target must be an exact authored Key with matching arity",
            Severity::Error,
        ));
        return Ok(());
    }
    for (index, (source_ref, target_ref)) in fields.iter().zip(target_fields).enumerate() {
        let source = inspect_field_reference(
            document,
            source_ref,
            &append_path(&append_path(path, "fields"), &index.to_string()),
            out,
            ctx,
        )?;
        let target =
            inspect_field_reference(document, target_ref, &append_path(path, "target"), out, ctx)?;
        let differs = if let (Some(source), Some(target)) = (source, target) {
            canonical_field_domain(source, ctx)? != canonical_field_domain(target, ctx)?
        } else {
            false
        };
        if differs {
            out.push_capped(core_diag(
                "TABLES_FOREIGN_KEY_TYPE",
                &append_path(&append_path(path, "fields"), &index.to_string()),
                "Foreign-key domains differ",
                Severity::Error,
            ));
        }
        let nullable =
            source.and_then(|f| string_member(f, "nullability")) != Some(&Utf16::from("required"));
        if !nullable
            && (member(fk, "onDelete") == Some(&Value::String(Utf16::from("setNull")))
                || member(fk, "onUpdate") == Some(&Value::String(Utf16::from("setNull"))))
        {
            out.push_capped(core_diag(
                "TABLES_FOREIGN_KEY_NULL",
                path,
                "SET NULL requires nullable referencing columns",
                Severity::Error,
            ));
        }
    }
    let module_tables =
        array_items(member(payload, "tables").unwrap_or(&Value::Null)).unwrap_or(&[]);
    ctx.charge_work(module_tables.len(), append_path(path, "target"))?;
    let target_is_mapped = module_tables.iter().any(|candidate| {
        member(candidate, "record").is_some_and(|record| refs_equal(record, target_record_ref))
    });
    if !target_is_mapped {
        out.push_capped(core_diag(
            "TABLES_FOREIGN_KEY_DEPENDENCY",
            &append_path(path, "target"),
            "External table installation dependency requires a separately pinned deployment binding",
            Severity::Warning,
        ));
    }
    let local_module = module_path
        .to_utf8()
        .ok()
        .and_then(|path| {
            path.strip_prefix("/modules/")?
                .split('/')
                .next()?
                .parse::<usize>()
                .ok()
        })
        .and_then(|index| {
            array_items(member(document, "modules")?).and_then(|modules| modules.get(index))
        })
        .and_then(|module| string_member(module, "id"));
    if let Some(relationship_ref) = member(fk, "relationship") {
        let relationship_module = string_member(relationship_ref, "module");
        let relationship_id = string_member(relationship_ref, "id");
        let relationship = relationship_module
            .and_then(|id| module_by_id(document, id))
            .and_then(|module| array_items(member(module, "relationships").unwrap_or(&Value::Null)))
            .and_then(|relationships| {
                relationships
                    .iter()
                    .find(|r| string_member(r, "id") == relationship_id)
            });
        let local_record = member(table, "record").unwrap_or(&Value::Null);
        let endpoints_match = relationship.is_some_and(|relationship| {
            let source =
                array_items(member(relationship, "source").unwrap_or(&Value::Null)).unwrap_or(&[]);
            let targets =
                array_items(member(relationship, "target").unwrap_or(&Value::Null)).unwrap_or(&[]);
            relationship_module == local_module
                && source.len() == 1
                && targets.len() == 1
                && refs_equal(&source[0], local_record)
                && refs_equal(&targets[0], target_record_ref)
                && string_member(&targets[0], "key") == key_id
        });
        if !endpoints_match {
            out.push_capped(core_diag(
                "TABLES_FOREIGN_KEY_RELATIONSHIP",
                &append_path(path, "relationship"),
                "Original relationship endpoints/Key differ from the native foreign key",
                Severity::Error,
            ));
        }
    }
    Ok(())
}
fn check_identifier(name: &Utf16, path: &Utf16, out: &mut Vec<Diagnostic>) {
    if utf8_text_exceeds(name, 63) || name.units().contains(&0) {
        out.push_capped(core_diag(
            "TABLES_IDENTIFIER",
            path,
            "Native identifier exceeds 63 UTF-8 bytes or contains NUL",
            Severity::Error,
        ));
    }
}

fn utf8_text_exceeds(text: &Utf16, ceiling: usize) -> bool {
    let units = text.units();
    let mut index = 0usize;
    let mut bytes = 0usize;
    while index < units.len() {
        let unit = units[index];
        let (count, step) = match unit {
            0xd800..=0xdbff
                if units
                    .get(index + 1)
                    .is_some_and(|low| (0xdc00..=0xdfff).contains(low)) =>
            {
                (4, 2)
            }
            0xd800..=0xdfff => (3, 1),
            0x0000..=0x007f => (1, 1),
            0x0080..=0x07ff => (2, 1),
            _ => (3, 1),
        };
        bytes += count;
        if bytes > ceiling {
            return true;
        }
        index += step;
    }
    false
}
fn number_member(value: &Value, key: &str) -> Option<f64> {
    match member(value, key)? {
        Value::Number(number) => Some(*number),
        _ => None,
    }
}

fn refs_equal(a: &Value, b: &Value) -> bool {
    string_member(a, "module") == string_member(b, "module")
        && string_member(a, "element") == string_member(b, "element")
}

fn resolve_ref<'a>(document: &'a Value, reference: &Value) -> Option<&'a Value> {
    let module_id = string_member(reference, "module")?;
    let element_id = string_member(reference, "element")?;
    array_items(member(document, "modules")?)?
        .iter()
        .find(|m| string_member(m, "id") == Some(module_id))
        .and_then(|m| {
            array_items(member(m, "elements")?).and_then(|elements| {
                elements
                    .iter()
                    .find(|e| string_member(e, "id") == Some(element_id))
            })
        })
}

fn module_by_id<'a>(document: &'a Value, id: &Utf16) -> Option<&'a Value> {
    array_items(member(document, "modules")?)?
        .iter()
        .find(|module| string_member(module, "id") == Some(id))
}

fn inspect_unknown(
    value: &Value,
    root_schemas: &[&Value],
    schema: &Value,
    path: &Utf16,
    out: &mut Vec<Diagnostic>,
    depth: usize,
    ref_hops: usize,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    // Recursive schemas can follow `$ref` without moving into a child value.
    // Bound that schema-only chain; core value admission bounds actual data
    // depth and each node below is charged cooperatively.
    if ref_hops > 32 {
        out.push_capped(core_diag(
            "TABLES_COMPLEXITY",
            path,
            "Expression/rule depth or module node budget exceeded",
            Severity::Error,
        ));
        return Ok(());
    }
    if let Some(reference) = string_member(schema, "$ref").and_then(|text| text.to_utf8().ok()) {
        if let Some(name) = reference.rsplit('/').next() {
            if let Some(def) = root_schemas
                .iter()
                .find_map(|root| member(member(root, "$defs").unwrap_or(&Value::Null), name))
            {
                // Local root schema references resolve against the package root.
                inspect_unknown(
                    value,
                    root_schemas,
                    def,
                    path,
                    out,
                    depth + 1,
                    ref_hops + 1,
                    ctx,
                )?;
                return Ok(());
            }
        }
    }
    if let Some(one_of) = array_items(member(schema, "oneOf").unwrap_or(&Value::Null)) {
        let selected = one_of.iter().find(|branch| matches_branch(value, branch));
        if let Some(branch) = selected {
            inspect_unknown(
                value,
                root_schemas,
                branch,
                path,
                out,
                depth + 1,
                ref_hops,
                ctx,
            )?;
        }
        return Ok(());
    }
    match value {
        Value::Array(items) => {
            if let Some(item_schema) = member(schema, "items") {
                for (index, item) in items.iter().enumerate() {
                    inspect_unknown(
                        item,
                        root_schemas,
                        item_schema,
                        &append_path(path, &index.to_string()),
                        out,
                        depth + 1,
                        0,
                        ctx,
                    )?;
                }
            }
        }
        Value::Object(_) => {
            for (key, item) in crate::value::js_object_members(value, ctx)? {
                ctx.charge_work(
                    path.len()
                        .saturating_add(key.len().saturating_mul(2))
                        .saturating_add(2),
                    path.clone(),
                )?;
                // Commands are inspected by the operation-specific semantic
                // pass below.  The package schema deliberately leaves this
                // member open so command versions can be preserved; treating
                // it as an extension here creates a spurious warning for every
                // field before the operation pass has a chance to interpret it.
                if depth == 0 && key == &Utf16::from("commands") {
                    continue;
                }
                let child = member(schema, "properties")
                    .and_then(object_members)
                    .and_then(|members| {
                        members
                            .iter()
                            .find(|(name, _)| name == key)
                            .map(|(_, value)| value)
                    });
                if let Some(child) = child {
                    inspect_unknown(
                        item,
                        root_schemas,
                        child,
                        &append_path_units(path, &pointer_escape(key)),
                        out,
                        depth + 1,
                        0,
                        ctx,
                    )?;
                } else if let Some(additional) = member(schema, "additionalProperties") {
                    if matches!(additional, Value::Object(_)) {
                        inspect_unknown(
                            item,
                            root_schemas,
                            additional,
                            &append_path_units(path, &pointer_escape(key)),
                            out,
                            depth + 1,
                            0,
                            ctx,
                        )?;
                    } else if *additional == Value::Bool(true) {
                        // Explicitly extensible members are retained without warning.
                    } else {
                        push_unknown_diagnostic(
                            out,
                            &append_path_units(path, &pointer_escape(key)),
                        );
                    }
                } else {
                    push_unknown_diagnostic(out, &append_path_units(path, &pointer_escape(key)));
                }
            }
        }
        _ => {}
    }
    Ok(())
}

fn push_unknown_diagnostic(out: &mut Vec<Diagnostic>, path: &Utf16) {
    if out.len() < 256 {
        out.push_capped(core_diag(
            "TABLES_UNKNOWN",
            path,
            "Unknown table content is retained and not interpreted",
            Severity::Warning,
        ));
    } else if out.len() == 256 {
        // The outer operation rewrites this path to the extension root after
        // merging core and per-pass diagnostics, matching TableContext.add.
        out.push_capped(core_diag(
            "TABLES_DIAGNOSTIC_LIMIT",
            path,
            "Further diagnostics omitted after 256 entries; interpretation refused",
            Severity::Error,
        ));
    }
}

fn matches_branch(value: &Value, branch: &Value) -> bool {
    if member(branch, "type") == Some(&Value::String(Utf16::from("null"))) {
        return value == &Value::Null;
    }
    let Value::Object(members) = value else {
        return false;
    };
    let required = array_items(member(branch, "required").unwrap_or(&Value::Null)).unwrap_or(&[]);
    if !required.iter().all(|name| match name {
        Value::String(name) => members.iter().any(|(key, _)| key == name),
        _ => false,
    }) {
        return false;
    }
    if let Some(properties) = member(branch, "properties") {
        if let Value::Object(props) = properties {
            for (key, property) in props {
                let Some(actual) = members
                    .iter()
                    .find(|(candidate, _)| candidate == key)
                    .map(|(_, value)| value)
                else {
                    continue;
                };
                if let Some(constant) = member(property, "const") {
                    if actual != constant {
                        return false;
                    }
                }
                if let Some(values) = array_items(member(property, "enum").unwrap_or(&Value::Null))
                {
                    if !values.contains(actual) {
                        return false;
                    }
                }
            }
        }
    }
    true
}

fn pointer_escape(text: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(text.len().saturating_mul(2));
    for unit in text.units() {
        match unit {
            126 => units.extend_from_slice(&[126, 48]),
            47 => units.extend_from_slice(&[126, 49]),
            unit => units.push(*unit),
        }
    }
    Utf16::new(units)
}
fn append_path_units(path: &Utf16, component: &Utf16) -> Utf16 {
    let mut units =
        Vec::with_capacity(path.len().saturating_add(component.len()).saturating_add(1));
    units.extend_from_slice(path.units());
    units.push(47);
    units.extend_from_slice(component.units());
    Utf16::new(units)
}
fn append_path(path: &Utf16, component: &str) -> Utf16 {
    append_path_units(path, &Utf16::from(component))
}

/// TableContext.add retains the first 256 diagnostics and one refusal marker.
/// Apply the same bound to intermediate passes as well as the shared buffer;
/// semantic traversal and Context controls continue after publication fills.
trait DiagnosticBuffer {
    fn push_capped(&mut self, diagnostic: Diagnostic);
    fn extend_capped(&mut self, diagnostics: impl IntoIterator<Item = Diagnostic>);
}
impl DiagnosticBuffer for Vec<Diagnostic> {
    fn push_capped(&mut self, diagnostic: Diagnostic) {
        if self.len() < 256 {
            self.push(diagnostic);
        } else if self.len() == 256 {
            self.push(core_diag(
                "TABLES_DIAGNOSTIC_LIMIT",
                &diagnostic.path,
                "Further diagnostics omitted after 256 entries; interpretation refused",
                Severity::Error,
            ));
        }
    }
    fn extend_capped(&mut self, diagnostics: impl IntoIterator<Item = Diagnostic>) {
        for diagnostic in diagnostics {
            self.push_capped(diagnostic);
        }
    }
}

fn core_diag(code: &str, path: &Utf16, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: path.clone(),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn diagnostic(code: &str, path: &str, message: &str, warning: bool) -> Value {
    diagnostic_value(&core_diag(
        code,
        &Utf16::from(path),
        message,
        if warning {
            Severity::Warning
        } else {
            Severity::Error
        },
    ))
}
fn diagnostic_value(d: &Diagnostic) -> Value {
    object(vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
        ("message", Value::String(d.message.clone())),
        (
            "severity",
            Value::String(Utf16::from(if d.severity == Severity::Error {
                "error"
            } else {
                "warning"
            })),
        ),
    ])
}
fn object(values: Vec<(&str, Value)>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}

#[cfg(test)]
mod inspection_guard_tests {
    use super::{
        core_diag, inspect_expression, inspect_query_operation, inspect_unknown, object,
        DiagnosticBuffer,
    };
    use umf_core::{Context, Diagnostic, EngineError, Severity, Utf16, Value};

    fn string(value: &str) -> Value {
        Value::String(Utf16::from(value))
    }

    fn generated_policy(ctx: &mut Context<'_>) -> umf_core::literal_policy::PreparedPolicy {
        let source = include_str!("../../../../spec/metamodel/generated/domain-policy.json")
            .encode_utf16()
            .collect::<Vec<_>>();
        let value = umf_core::serialization::read_json_value(
            &source,
            umf_core::serialization::Format::Json,
            ctx,
        )
        .unwrap();
        let literal = match value {
            Value::Object(entries) => {
                entries
                    .into_iter()
                    .find(|(key, _)| key == &Utf16::from("literal"))
                    .unwrap()
                    .1
            }
            _ => panic!("generated policy must be an object"),
        };
        umf_core::literal_policy::prepare_policy(&literal, ctx).unwrap()
    }

    #[test]
    fn nested_commands_are_unknown_but_root_commands_are_operation_owned() {
        let schema = object(vec![
            ("type", string("object")),
            (
                "properties",
                object(vec![("nested", object(vec![("type", string("object"))]))]),
            ),
        ]);
        let value = object(vec![
            ("commands", object(vec![])),
            ("nested", object(vec![("commands", object(vec![]))])),
        ]);
        let mut diagnostics: Vec<Diagnostic> = Vec::new();
        inspect_unknown(
            &value,
            &[&schema],
            &schema,
            &Utf16::from("/payload"),
            &mut diagnostics,
            0,
            0,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, Utf16::from("TABLES_UNKNOWN"));
        assert_eq!(diagnostics[0].path, Utf16::from("/payload/nested/commands"));
        assert_eq!(diagnostics[0].severity, Severity::Warning);
    }

    #[test]
    fn structural_schema_descent_is_metered_without_expression_depth_limit() {
        fn descend(depth: usize) -> (Value, Value) {
            if depth == 0 {
                return (object(vec![("type", string("string"))]), string("leaf"));
            }
            let (child_schema, child_value) = descend(depth - 1);
            (
                object(vec![
                    ("type", string("object")),
                    ("properties", object(vec![("next", child_schema)])),
                ]),
                object(vec![("next", child_value)]),
            )
        }
        let (schema, value) = descend(24);
        let mut diagnostics = Vec::new();
        inspect_unknown(
            &value,
            &[&schema],
            &schema,
            &Utf16::from("/payload"),
            &mut diagnostics,
            0,
            0,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn unknown_tree_walk_propagates_meter_refusal_before_completing() {
        let schema = object(vec![("type", string("object"))]);
        let value = object(vec![("unfamiliar", object(vec![("child", string("x"))]))]);
        let mut visits = 0usize;
        let mut meter = |_: usize| {
            visits += 1;
            Err(EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "test work budget",
            ))
        };
        let mut context = Context::ordinary().with_meter(&mut meter);
        let mut diagnostics = Vec::new();
        let error = inspect_unknown(
            &value,
            &[&schema],
            &schema,
            &Utf16::from("/payload"),
            &mut diagnostics,
            0,
            0,
            &mut context,
        )
        .unwrap_err();
        assert!(error.is_control_failure());
        assert_eq!(error.code, "METER_STOP");
        assert_eq!(visits, 1);
    }

    #[test]
    fn semantic_diagnostic_buffers_cap_each_pass_and_keep_order_when_merged() {
        let mut shared = Vec::new();
        let mut visits = 0;
        for pass in 0..3 {
            let mut local = Vec::new();
            for index in 0..10_000 {
                visits += 1;
                local.push_capped(core_diag(
                    "TABLES_LITERAL",
                    &Utf16::from(format!("/{pass}/{index}")),
                    "invalid",
                    Severity::Error,
                ));
                assert!(local.len() <= 257);
            }
            shared.extend_capped(local);
            assert!(shared.len() <= 257);
        }
        assert_eq!(visits, 30_000);
        assert_eq!(shared[255].path, Utf16::from("/0/255"));
        assert_eq!(shared[256].code, Utf16::from("TABLES_DIAGNOSTIC_LIMIT"));
    }

    #[test]
    fn unknown_diagnostics_stop_at_module_cap_plus_one_marker() {
        let schema = object(vec![("type", string("object"))]);
        let value = Value::Object(
            (0..300)
                .map(|index| (Utf16::from(format!("unknown{index}")), Value::Null))
                .collect(),
        );
        let mut diagnostics = Vec::new();
        inspect_unknown(
            &value,
            &[&schema],
            &schema,
            &Utf16::from("/payload"),
            &mut diagnostics,
            0,
            0,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(diagnostics.len(), 257);
        assert_eq!(
            diagnostics[256].code,
            Utf16::from("TABLES_DIAGNOSTIC_LIMIT")
        );
    }

    #[test]
    fn expression_node_budget_is_shared_across_sibling_nodes() {
        let mut setup = Context::ordinary();
        let policy = generated_policy(&mut setup);
        let expression = object(vec![
            ("op", string("and")),
            (
                "args",
                Value::Array(
                    (0..4_100)
                        .map(|_| {
                            object(vec![
                                ("op", string("literal")),
                                ("value", Value::Bool(true)),
                            ])
                        })
                        .collect(),
                ),
            ),
        ]);
        let mut nodes = 0;
        let mut diagnostics = Vec::new();
        inspect_expression(
            &expression,
            &[],
            &Value::Null,
            &policy,
            &Utf16::from("/expression"),
            0,
            &mut nodes,
            &mut Context::ordinary(),
            &mut diagnostics,
        )
        .unwrap();
        assert!(nodes > 4096);
        assert!(diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == Utf16::from("TABLES_COMPLEXITY")));
    }

    #[test]
    fn standalone_query_outputs_need_local_field_meaning_not_table_binding() {
        let local_field = object(vec![
            ("id", string("result")),
            ("kind", string("field")),
            ("scalarType", string("string")),
            ("cardinality", string("one")),
            ("nullability", string("required")),
            ("extensions", object(vec![])),
            ("semanticTypes", Value::Array(vec![])),
        ]);
        let meaning_field = object(vec![
            ("id", string("meaning")),
            ("kind", string("field")),
            ("scalarType", string("string")),
            ("cardinality", string("one")),
            ("nullability", string("required")),
            ("extensions", object(vec![("future", object(vec![]))])),
            ("semanticTypes", Value::Array(vec![])),
        ]);
        let foreign_field = object(vec![
            ("id", string("external")),
            ("kind", string("field")),
            ("scalarType", string("string")),
            ("cardinality", string("one")),
            ("nullability", string("required")),
            ("extensions", object(vec![("future", object(vec![]))])),
            ("semanticTypes", Value::Array(vec![])),
        ]);
        let local_ref = object(vec![
            ("module", string("demo")),
            ("element", string("result")),
        ]);
        let foreign_ref = object(vec![
            ("module", string("other")),
            ("element", string("external")),
        ]);
        let document = object(vec![(
            "modules",
            Value::Array(vec![
                object(vec![
                    ("id", string("demo")),
                    ("elements", Value::Array(vec![local_field, meaning_field])),
                ]),
                object(vec![
                    ("id", string("other")),
                    ("elements", Value::Array(vec![foreign_field])),
                ]),
            ]),
        )]);
        let parameters = Value::Array(vec![object(vec![
            ("id", string("external_input")),
            ("field", foreign_ref),
        ])]);
        let outputs = Value::Array(vec![
            object(vec![("name", string("answer")), ("field", local_ref)]),
            object(vec![
                ("name", string("with_meaning")),
                (
                    "field",
                    object(vec![
                        ("module", string("demo")),
                        ("element", string("meaning")),
                    ]),
                ),
            ]),
        ]);
        let body = object(vec![
            ("kind", string("query")),
            ("sql", string("select 1")),
            ("outputs", outputs),
        ]);
        let command = object(vec![
            ("replay", string("none")),
            ("batch", Value::Bool(false)),
            ("parameters", parameters),
        ]);
        let mut diagnostics = Vec::new();
        inspect_query_operation(
            &command,
            &body,
            &document,
            &Utf16::from("/modules/0/extensions/umf.tables/commands/0"),
            &mut diagnostics,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].code, Utf16::from("TABLES_QUERY_MODULE"));
        assert_eq!(
            diagnostics[0].path,
            Utf16::from("/modules/0/extensions/umf.tables/commands/0/parameters/0/field")
        );
        assert_eq!(diagnostics[1].code, Utf16::from("TABLES_OPERATION_MEANING"));
        assert_eq!(
            diagnostics[1].path,
            Utf16::from("/modules/0/extensions/umf.tables/commands/0/parameters/0/field")
        );
        assert_eq!(diagnostics[2].code, Utf16::from("TABLES_OPERATION_MEANING"));
        assert_eq!(
            diagnostics[2].path,
            Utf16::from("/modules/0/extensions/umf.tables/commands/0/body/outputs/1/field")
        );
    }

    #[test]
    fn query_text_utf8_measurement_matches_text_encoder_replacement() {
        let unpaired = Utf16::new(vec![0xd800]);
        assert!(!super::query_sql_exceeds_limit(&unpaired, &mut Context::ordinary()).unwrap());
        assert!(!super::utf8_text_exceeds(&unpaired, 3));
        assert!(super::utf8_text_exceeds(&unpaired, 2));
    }
}
