// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned common views for native Core Ideal receipts.

use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    tablespec_adapter::TableSpecRuntime,
    value::{copy_json, Utf16, Value},
};

fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = v else {
        return None;
    };
    fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v)
}
fn text<'a>(v: &'a Value, name: &str) -> Option<&'a Utf16> {
    match get(v, name) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_text(value.len(), Utf16::default())?;
    Ok(value.clone())
}
fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn parse_resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units = source.encode_utf16().collect::<Vec<_>>();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn validate_report(
    value: &Value,
    schema_source: &str,
    dependencies: &[&str],
    code: &'static str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let (engine, _) = embedded_engine(ctx)?;
    let mut resources: SchemaResources = engine.schema_resources_with_context(ctx)?;
    for source in dependencies {
        let schema = parse_resource(source, ctx)?;
        let id = text(&schema, "$id").ok_or_else(|| {
            err(
                "CLASSIFICATION_REPORT_SCHEMA",
                "Schema resource id is missing",
            )
        })?;
        if !resources.entries.iter().any(|(known, _)| known == id) {
            resources.entries.push((copy_text(id, ctx)?, schema));
        }
    }
    let schema = parse_resource(schema_source, ctx)?;
    let compiled = CompiledSchema::compile(&schema, &resources, ctx)?;
    if compiled.validate_codegen_errors(value, ctx)?.is_empty() {
        Ok(())
    } else {
        Err(err(
            code,
            "Common Core Ideal report schema validation failed",
        ))
    }
}

const FIELD_CLASSIFICATION_RESOURCES: &[&str] = &[
    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
    include_str!("../../../spec/core/tablespec-field-classification.schema.json"),
    include_str!("../../../spec/core/postgresql-field-classification.schema.json"),
    include_str!("../../../spec/core/sqlserver-field-classification.schema.json"),
    include_str!("../../../spec/core/avro-field-classification.schema.json"),
    include_str!("../../../spec/core/parquet-field-classification.schema.json"),
];
const FIELD_PROJECTION_RESOURCES: &[&str] = &[
    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
    include_str!("../../../spec/core/field-tablespec-projection.schema.json"),
    include_str!("../../../spec/core/field-postgresql-projection.schema.json"),
    include_str!("../../../spec/core/field-sqlserver-projection.schema.json"),
    include_str!("../../../spec/core/field-avro-projection.schema.json"),
    include_str!("../../../spec/core/field-parquet-projection.schema.json"),
];
const RECORD_PROJECTION_RESOURCES: &[&str] = &[
    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
    include_str!("../../../spec/core/record-tablespec-projection.schema.json"),
    include_str!("../../../spec/core/record-postgresql-projection.schema.json"),
    include_str!("../../../spec/core/record-sqlserver-projection.schema.json"),
    include_str!("../../../spec/core/record-avro-projection.schema.json"),
    include_str!("../../../spec/core/record-parquet-projection.schema.json"),
];
const STRUCTURED_CLASSIFICATION_RESOURCES: &[&str] = &[
    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
    include_str!("../../../spec/core/tablespec-record-classification.schema.json"),
    include_str!("../../../spec/core/postgresql-record-classification.schema.json"),
    include_str!("../../../spec/core/sqlserver-record-classification.schema.json"),
    include_str!("../../../spec/core/avro-record-classification.schema.json"),
    include_str!("../../../spec/core/parquet-record-classification.schema.json"),
    include_str!("../../../spec/core/avro-record-type-classification.schema.json"),
    include_str!("../../../spec/core/parquet-record-type-classification.schema.json"),
    include_str!("../../../spec/core/postgresql-composite-classification.schema.json"),
    include_str!("../../../spec/core/postgresql-ddl-kinds.schema.json"),
];
fn embedded_engine(ctx: &mut Context<'_>) -> Result<(Engine, Registry), EngineError> {
    let engine = Engine::new(
        ResourceSet::new(
            parse_resource(include_str!("../../../spec/core/schema.json"), ctx)?,
            parse_resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            parse_resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    for package in [
        include_str!("../../../spec/extensions/sqlserver/package.json"),
        include_str!("../../../spec/extensions/sqlserver-cardinality/package.json"),
        include_str!("../../../spec/extensions/sqlserver-nullability/package.json"),
        include_str!("../../../spec/extensions/sqlserver-keys/package.json"),
        include_str!("../../../spec/extensions/sqlserver-relationships/package.json"),
        include_str!("../../../spec/extensions/sqlserver-facets/package.json"),
        include_str!("../../../spec/extensions/avro/package.json"),
        include_str!("../../../spec/extensions/parquet/package.json"),
        include_str!("../../../spec/extensions/parquet-relationships/package.json"),
        include_str!("../../../spec/extensions/parquet-nullability/package.json"),
        include_str!("../../../spec/extensions/parquet-keys/package.json"),
        include_str!("../../../spec/extensions/parquet-cardinality/package.json"),
        include_str!("../../../spec/extensions/parquet-facets/package.json"),
    ] {
        registry.register(
            &parse_resource(package, ctx)?,
            None,
            engine.package_schema(),
            &resources,
            ctx,
        )?;
    }
    Ok((engine, registry))
}
struct NoCapabilities;
impl Capabilities for NoCapabilities {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

fn canonical_inner(v: &Value, ctx: &mut Context<'_>, depth: usize) -> Result<Value, EngineError> {
    if depth > ctx.limits().max_depth {
        return Err(err("LIMIT", "Receipt comparison depth exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    match v {
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                ctx.charge_work(1, Utf16::default())?;
                out.push(canonical_inner(item, ctx, depth + 1)?);
            }
            Ok(Value::Array(out))
        }
        Value::Object(fields) => {
            let mut out = Vec::with_capacity(fields.len());
            for (name, item) in fields {
                ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
                out.push((name.clone(), canonical_inner(item, ctx, depth + 1)?));
            }
            out.sort_by(|a, b| a.0.cmp(&b.0));
            Ok(Value::Object(out))
        }
        _ => copy_json(v, ctx),
    }
}
fn canonical(v: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    canonical_inner(v, ctx, 0)
}
fn exact(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    Ok(canonical(a, ctx)? == canonical(b, ctx)?)
}

fn result_diagnostics(receipt: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    match get(receipt, "diagnostics") {
        Some(v) => copy_json(v, ctx),
        None => Ok(Value::Array(Vec::new())),
    }
}
fn field_mapping(receipt: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Some(Value::Object(fields)) = get(receipt, "mapping") else {
        return Err(err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt mapping is missing",
        ));
    };
    let binding = get(receipt, "binding").ok_or_else(|| {
        err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt binding is missing",
        )
    })?;
    let mut result = Vec::with_capacity(fields.len() + 1);
    for (name, value) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        result.push((name.clone(), copy_json(value, ctx)?));
    }
    result.push((key("binding"), copy_json(binding, ctx)?));
    Ok(Value::Object(result))
}
fn residuals(
    receipt: &Value,
    binding: &Value,
    strategy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = match get(receipt, "residuals") {
        Some(Value::Array(rows)) => rows,
        _ => {
            return Err(err(
                "CLASSIFICATION_REPORT_RECEIPT",
                "Receipt residuals are missing",
            ))
        }
    };
    let mut result = Vec::with_capacity(source.len());
    for row in source {
        let path = get(row, "path")
            .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "Residual path is missing"))?;
        let value = get(row, "value")
            .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "Residual value is missing"))?;
        let reason = get(row, "reason").ok_or_else(|| {
            err(
                "CLASSIFICATION_REPORT_RECEIPT",
                "Residual reason is missing",
            )
        })?;
        let instruction = get(row, "recovery").ok_or_else(|| {
            err(
                "CLASSIFICATION_REPORT_RECEIPT",
                "Residual recovery is missing",
            )
        })?;
        result.push(Value::Object(vec![
            (key("sourcePath"), copy_json(path, ctx)?),
            (key("sourceValue"), copy_json(value, ctx)?),
            (key("targetPath"), Value::Null),
            (key("outcome"), Value::string_utf8("unknown")),
            (key("reason"), copy_json(reason, ctx)?),
            (key("binding"), copy_json(binding, ctx)?),
            (
                key("recovery"),
                Value::Object(vec![
                    (key("strategy"), Value::string_utf8(strategy)),
                    (key("receiptPath"), Value::string_utf8("/receipt/source")),
                    (key("instruction"), copy_json(instruction, ctx)?),
                ]),
            ),
        ]));
    }
    Ok(Value::Array(result))
}

fn recompute_field_classification(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = get(receipt, "source")
        .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "Receipt source is missing"))?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt request is missing",
        )
    })?;
    match text(receipt, "operation") {
        Some(operation) if operation == &key("classify-tablespec-field") => {
            let adapter = TableSpecRuntime::new(ctx)?;
            adapter.classify_field(source, request, ctx)
        }
        Some(operation) if operation == &key("classify-postgresql-field") => {
            crate::postgresql_classification::classify_field(source, request, ctx)
        }
        Some(operation) if operation == &key("classify-avro-field") => {
            crate::avro_field_classifier::classify_field(source, request, ctx)
        }
        Some(operation)
            if operation == &key("classify-sqlserver-field")
                || operation == &key("classify-parquet-field") =>
        {
            let (engine, registry) = embedded_engine(ctx)?;
            let mut capabilities = NoCapabilities;
            match operation {
                operation if operation == &key("classify-sqlserver-field") => {
                    crate::sqlserver_field_classification::classify(
                        source,
                        request,
                        &engine,
                        &registry,
                        &mut capabilities,
                        ctx,
                    )
                }
                _ => crate::parquet_field_classification::classify_parquet_field(
                    source,
                    request,
                    &engine,
                    &registry,
                    &mut capabilities,
                    ctx,
                ),
            }
        }
        _ => Err(err(
            "CLASSIFICATION_REPORT_OPERATION",
            "Unsupported native Field classification",
        )),
    }
}

pub fn inspect_field_classification(
    receipt: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let expected = recompute_field_classification(receipt, ctx)?;
    let mut expected_cmp = copy_json(&expected, ctx)?;
    if text(receipt, "operation") == Some(&key("classify-tablespec-field"))
        && get(receipt, "diagnostics").is_none()
    {
        if let Value::Object(fields) = &mut expected_cmp {
            fields.retain(|(name, _)| name != &key("diagnostics"));
        }
    }
    if !exact(receipt, &expected_cmp, ctx)? {
        return Err(err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt differs from checked native classification",
        ));
    }
    let binding = get(receipt, "binding").ok_or_else(|| {
        err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt binding is missing",
        )
    })?;
    let status = get(receipt, "status")
        .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "Receipt status is missing"))?;
    let output = Value::Object(vec![
        (
            key("operation"),
            Value::string_utf8("inspect-field-classification"),
        ),
        (key("version"), Value::string_utf8("1.0.0")),
        (key("status"), copy_json(status, ctx)?),
        (key("receipt"), copy_json(receipt, ctx)?),
        (key("mapping"), field_mapping(receipt, ctx)?),
        (
            key("residuals"),
            residuals(receipt, binding, "retained-source-and-receipt", ctx)?,
        ),
        (key("diagnostics"), result_diagnostics(&expected, ctx)?),
    ]);
    validate_report(
        &output,
        include_str!("../../../spec/core/field-classification-inspection.schema.json"),
        FIELD_CLASSIFICATION_RESOURCES,
        "CLASSIFICATION_REPORT_RESULT",
        ctx,
    )?;
    Ok(output)
}

pub fn verify_field_classification_inspection(
    report: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_report(
        report,
        include_str!("../../../spec/core/field-classification-inspection.schema.json"),
        FIELD_CLASSIFICATION_RESOURCES,
        "CLASSIFICATION_REPORT_STRUCTURE",
        ctx,
    )?;
    let receipt = get(report, "receipt")
        .ok_or_else(|| err("CLASSIFICATION_REPORT_STRUCTURE", "Receipt is missing"))?;
    let expected = inspect_field_classification(receipt, ctx)?;
    if !exact(report, &expected, ctx)? {
        return Err(err(
            "CLASSIFICATION_REPORT_STALE",
            "Common report differs from checked native receipt",
        ));
    }
    copy_json(report, ctx)
}

fn recompute_field_projection(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author = get(receipt, "author")
        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt author is missing"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt request is missing"))?;
    match text(receipt, "operation") {
        Some(op) if op == &key("project-field-tablespec") => {
            TableSpecRuntime::new(ctx)?.project_field_to_tablespec(author, request, ctx)
        }
        Some(op) if op == &key("project-field-postgresql") => {
            let fresh = fresh.ok_or_else(|| {
                err(
                    "FIELD_REPORT_BACKEND",
                    "Fresh PostgreSQL receipt is required",
                )
            })?;
            let prepared = crate::postgresql_authored_projection::prepare_field_projection(
                author, request, ctx,
            )?;
            let expected = crate::postgresql_authored_projection::complete_field_projection(
                &prepared,
                get(fresh, "target").unwrap_or(&Value::Null),
                ctx,
            )?;
            if !exact(&expected, fresh, ctx)? || !exact(receipt, &expected, ctx)? {
                return Err(err(
                    "FIELD_REPORT_RECEIPT",
                    "PostgreSQL receipt differs from freshly parsed native target",
                ));
            }
            Ok(expected)
        }
        Some(op) if op == &key("project-field-sqlserver") => {
            crate::sqlserver_field_record_projection::project_field_to_sqlserver(
                author, request, ctx,
            )
        }
        Some(op) if op == &key("project-field-avro") => {
            crate::avro_field_record_projection::project_field(author, request, ctx)
        }
        Some(op) if op == &key("project-field-parquet") => {
            crate::parquet_field_record_projection::project_field(author, request, ctx)
        }
        _ => Err(err(
            "FIELD_REPORT_OPERATION",
            "Unsupported authored Field projection operation",
        )),
    }
}

fn projection_residuals(
    receipt: &Value,
    binding: &Value,
    strategy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let rows = match get(receipt, "residuals") {
        Some(Value::Array(rows)) => rows,
        _ => return Err(err("FIELD_REPORT_RECEIPT", "Receipt residuals are missing")),
    };
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        ctx.charge_work(1, Utf16::default())?;
        let mut out = vec![
            (
                key("sourcePath"),
                copy_json(
                    get(row, "path")
                        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Residual path is missing"))?,
                    ctx,
                )?,
            ),
            (
                key("sourceValue"),
                copy_json(
                    get(row, "value")
                        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Residual value is missing"))?,
                    ctx,
                )?,
            ),
            (key("targetPath"), Value::Null),
            (
                key("outcome"),
                copy_json(
                    get(row, "outcome").ok_or_else(|| {
                        err("FIELD_REPORT_RECEIPT", "Residual outcome is missing")
                    })?,
                    ctx,
                )?,
            ),
            (
                key("reason"),
                copy_json(
                    get(row, "reason")
                        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Residual reason is missing"))?,
                    ctx,
                )?,
            ),
            (key("binding"), copy_json(binding, ctx)?),
        ];
        out.push((
            key("recovery"),
            Value::Object(vec![
                (key("strategy"), Value::string_utf8(strategy)),
                (key("receiptPath"), Value::string_utf8("/receipt/source")),
                (
                    key("instruction"),
                    copy_json(
                        get(row, "recovery").ok_or_else(|| {
                            err("FIELD_REPORT_RECEIPT", "Residual recovery is missing")
                        })?,
                        ctx,
                    )?,
                ),
            ]),
        ));
        result.push(Value::Object(out));
    }
    Ok(Value::Array(result))
}

pub fn inspect_field_projection(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let expected = recompute_field_projection(receipt, fresh, ctx)?;
    if !exact(receipt, &expected, ctx)? {
        return Err(err(
            "FIELD_REPORT_RECEIPT",
            "Adapter receipt differs from recomputed projection",
        ));
    }
    let binding = get(receipt, "binding")
        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt binding is missing"))?;
    let mapping = get(receipt, "mapping")
        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt mapping is missing"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt request is missing"))?;
    let mut mapping_fields = match mapping {
        Value::Object(fields) => fields
            .iter()
            .map(|(name, value)| Ok((name.clone(), copy_json(value, ctx)?)))
            .collect::<Result<Vec<_>, EngineError>>()?,
        _ => return Err(err("FIELD_REPORT_RECEIPT", "Receipt mapping is invalid")),
    };
    mapping_fields.push((key("binding"), copy_json(binding, ctx)?));
    mapping_fields.push((
        key("basis"),
        Value::Object(vec![
            (key("kind"), Value::string_utf8("explicit-native-carrier")),
            (
                key("nativeType"),
                copy_json(
                    get(request, "nativeType").ok_or_else(|| {
                        err("FIELD_REPORT_RECEIPT", "Request nativeType is missing")
                    })?,
                    ctx,
                )?,
            ),
        ]),
    ));
    let output = Value::Object(vec![
        (
            key("operation"),
            Value::string_utf8("inspect-field-projection"),
        ),
        (key("version"), Value::string_utf8("1.0.0")),
        (
            key("status"),
            copy_json(
                get(receipt, "status")
                    .ok_or_else(|| err("FIELD_REPORT_RECEIPT", "Receipt status is missing"))?,
                ctx,
            )?,
        ),
        (key("receipt"), copy_json(receipt, ctx)?),
        (key("mapping"), Value::Object(mapping_fields)),
        (
            key("residuals"),
            projection_residuals(receipt, binding, "retained-receipt", ctx)?,
        ),
        (key("diagnostics"), result_diagnostics(&expected, ctx)?),
    ]);
    validate_report(
        &output,
        include_str!("../../../spec/core/field-projection-inspection.schema.json"),
        FIELD_PROJECTION_RESOURCES,
        "FIELD_REPORT_RESULT",
        ctx,
    )?;
    Ok(output)
}

pub fn verify_field_projection_inspection(
    report: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_report(
        report,
        include_str!("../../../spec/core/field-projection-inspection.schema.json"),
        FIELD_PROJECTION_RESOURCES,
        "FIELD_REPORT_STRUCTURE",
        ctx,
    )?;
    let receipt = get(report, "receipt")
        .ok_or_else(|| err("FIELD_REPORT_STRUCTURE", "Receipt is missing"))?;
    let expected = inspect_field_projection(receipt, fresh, ctx)?;
    if !exact(report, &expected, ctx)? {
        return Err(err(
            "FIELD_REPORT_STALE",
            "Common report differs from checked adapter receipt",
        ));
    }
    copy_json(report, ctx)
}

fn recompute_record_projection(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let author = get(receipt, "author")
        .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Receipt author is missing"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Receipt request is missing"))?;
    match text(receipt, "operation") {
        Some(op) if op == &key("project-record-tablespec") => {
            TableSpecRuntime::new(ctx)?.project_record_to_tablespec(author, request, ctx)
        }
        Some(op) if op == &key("project-record-postgresql") => {
            let fresh = fresh.ok_or_else(|| {
                err(
                    "RECORD_REPORT_BACKEND",
                    "Fresh PostgreSQL receipt is required",
                )
            })?;
            let prepared = crate::postgresql_authored_projection::prepare_record_projection(
                author, request, ctx,
            )?;
            let expected = crate::postgresql_authored_projection::complete_record_projection(
                &prepared,
                get(fresh, "target").unwrap_or(&Value::Null),
                ctx,
            )?;
            if !exact(&expected, fresh, ctx)? || !exact(receipt, &expected, ctx)? {
                return Err(err(
                    "RECORD_REPORT_RECEIPT",
                    "PostgreSQL receipt differs from freshly parsed native target",
                ));
            }
            Ok(expected)
        }
        Some(op) if op == &key("project-record-sqlserver") => {
            crate::sqlserver_field_record_projection::project_record_to_sqlserver(
                author, request, ctx,
            )
        }
        Some(op) if op == &key("project-record-avro") => {
            crate::avro_field_record_projection::project_record(author, request, ctx)
        }
        Some(op) if op == &key("project-record-parquet") => {
            crate::parquet_field_record_projection::project_record(author, request, ctx)
        }
        _ => Err(err(
            "RECORD_REPORT_OPERATION",
            "Unsupported authored Record projection operation",
        )),
    }
}

pub fn inspect_record_projection(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let expected = recompute_record_projection(receipt, fresh, ctx)?;
    if !exact(receipt, &expected, ctx)? {
        return Err(err(
            "RECORD_REPORT_RECEIPT",
            "Adapter receipt differs from recomputed projection",
        ));
    }
    let binding = get(receipt, "binding")
        .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Receipt binding is missing"))?;
    let request = get(receipt, "request")
        .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Receipt request is missing"))?;
    let requested = match get(request, "fields") {
        Some(Value::Array(fields)) => fields.as_slice(),
        _ => &[],
    };
    let mappings = match get(receipt, "mappings") {
        Some(Value::Array(mappings)) => mappings,
        _ => return Err(err("RECORD_REPORT_RECEIPT", "Receipt mappings are missing")),
    };
    let mut output_mappings = Vec::with_capacity(mappings.len());
    for mapping in mappings {
        ctx.charge_work(1, Utf16::default())?;
        let kind = text(mapping, "kind")
            .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Mapping kind is missing"))?;
        let ideal_path = get(mapping, "idealPath")
            .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Mapping idealPath is missing"))?;
        let basis = if kind == &key("record") {
            Value::Object(vec![(
                key("kind"),
                Value::string_utf8("explicit-record-membership"),
            )])
        } else {
            let mut native_type = None;
            for field in requested {
                ctx.charge_work(1, Utf16::default())?;
                let Some(author) = get(field, "author") else {
                    continue;
                };
                let Some(provenance) = get(author, "provenance") else {
                    continue;
                };
                let Some(path) = get(provenance, "idealPath") else {
                    continue;
                };
                if path == ideal_path {
                    native_type = get(field, "nativeType");
                    break;
                }
            }
            Value::Object(vec![
                (key("kind"), Value::string_utf8("explicit-native-carrier")),
                (
                    key("nativeType"),
                    copy_json(
                        native_type.ok_or_else(|| {
                            err(
                                "RECORD_REPORT_MEMBER",
                                "Mapped member has no explicit native binding",
                            )
                        })?,
                        ctx,
                    )?,
                ),
            ])
        };
        let mut fields = match mapping {
            Value::Object(fields) => fields
                .iter()
                .map(|(name, value)| Ok((name.clone(), copy_json(value, ctx)?)))
                .collect::<Result<Vec<_>, EngineError>>()?,
            _ => return Err(err("RECORD_REPORT_RECEIPT", "Mapping is invalid")),
        };
        fields.push((key("binding"), copy_json(binding, ctx)?));
        fields.push((key("basis"), basis));
        output_mappings.push(Value::Object(fields));
    }
    let output = Value::Object(vec![
        (
            key("operation"),
            Value::string_utf8("inspect-record-projection"),
        ),
        (key("version"), Value::string_utf8("1.0.0")),
        (
            key("status"),
            copy_json(
                get(receipt, "status")
                    .ok_or_else(|| err("RECORD_REPORT_RECEIPT", "Receipt status is missing"))?,
                ctx,
            )?,
        ),
        (key("receipt"), copy_json(receipt, ctx)?),
        (key("mappings"), Value::Array(output_mappings)),
        (
            key("residuals"),
            projection_residuals(receipt, binding, "retained-receipt", ctx)?,
        ),
        (key("diagnostics"), result_diagnostics(&expected, ctx)?),
    ]);
    validate_report(
        &output,
        include_str!("../../../spec/core/record-projection-inspection.schema.json"),
        RECORD_PROJECTION_RESOURCES,
        "RECORD_REPORT_RESULT",
        ctx,
    )?;
    Ok(output)
}

pub fn verify_record_projection_inspection(
    report: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_report(
        report,
        include_str!("../../../spec/core/record-projection-inspection.schema.json"),
        RECORD_PROJECTION_RESOURCES,
        "RECORD_REPORT_STRUCTURE",
        ctx,
    )?;
    let receipt = get(report, "receipt")
        .ok_or_else(|| err("RECORD_REPORT_STRUCTURE", "Receipt is missing"))?;
    let expected = inspect_record_projection(receipt, fresh, ctx)?;
    if !exact(report, &expected, ctx)? {
        return Err(err(
            "RECORD_REPORT_STALE",
            "Common report differs from checked adapter receipt",
        ));
    }
    copy_json(report, ctx)
}

fn recompute_structured_classification(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = get(receipt, "source")
        .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "Receipt source is missing"))?;
    let request = get(receipt, "request").ok_or_else(|| {
        err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt request is missing",
        )
    })?;
    match text(receipt, "operation") {
        Some(op) if op == &key("classify-tablespec-record") => {
            TableSpecRuntime::new(ctx)?.classify_record(source, request, ctx)
        }
        Some(op) if op == &key("classify-postgresql-record") => {
            crate::postgresql_classification::classify_record(source, request, ctx)
        }
        Some(op) if op == &key("classify-sqlserver-record") => {
            let (engine, registry) = embedded_engine(ctx)?;
            let mut capabilities = NoCapabilities;
            crate::sqlserver_field_classification::classify_record(
                source,
                request,
                &engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
        Some(op) if op == &key("classify-avro-record") => {
            crate::avro_record_classifier::classify_avro_record(source, request, ctx)
        }
        Some(op) if op == &key("classify-parquet-record") => {
            let module = text(request, "recordModule")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "recordModule is missing"))?;
            let record = text(request, "recordId")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "recordId is missing"))?;
            let mode = text(request, "mode")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "mode is missing"))?;
            let index = match get(request, "index") {
                Some(Value::Number(n)) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => {
                    *n as usize
                }
                _ => return Err(err("CLASSIFICATION_REPORT_RECEIPT", "index is invalid")),
            };
            let authors = match get(request, "authors") {
                Some(Value::Array(values)) => values
                    .iter()
                    .map(|value| copy_json(value, ctx))
                    .collect::<Result<Vec<_>, _>>()?,
                None => Vec::new(),
                _ => return Err(err("CLASSIFICATION_REPORT_RECEIPT", "authors is invalid")),
            };
            let request = crate::parquet_record_classifier::ParquetRecordRequest {
                record_module: copy_text(module, ctx)?,
                record_id: copy_text(record, ctx)?,
                index,
                mode: copy_text(mode, ctx)?,
                authors,
            };
            let (engine, registry) = embedded_engine(ctx)?;
            let mut capabilities = NoCapabilities;
            crate::parquet_record_classifier::classify_parquet_record(
                source,
                &request,
                &engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
        Some(op) if op == &key("classify-avro-record-type") => {
            crate::avro_record_type_classifier::classify_avro_record_type(source, request, ctx)
        }
        Some(op) if op == &key("classify-parquet-record-type") => {
            let module = text(request, "recordModule")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "recordModule is missing"))?;
            let record = text(request, "recordId")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "recordId is missing"))?;
            let mode = text(request, "mode")
                .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "mode is missing"))?;
            let index = match get(request, "index") {
                Some(Value::Number(n)) if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 => {
                    *n as usize
                }
                _ => return Err(err("CLASSIFICATION_REPORT_RECEIPT", "index is invalid")),
            };
            let authors = match get(request, "authors") {
                Some(Value::Array(values)) => Some(
                    values
                        .iter()
                        .map(|value| copy_json(value, ctx))
                        .collect::<Result<Vec<_>, _>>()?,
                ),
                None => None,
                _ => return Err(err("CLASSIFICATION_REPORT_RECEIPT", "authors is invalid")),
            };
            let field_author = get(request, "fieldAuthor")
                .map(|value| copy_json(value, ctx))
                .transpose()?;
            let request = crate::parquet_record_type_operation::ParquetRecordTypeRequest {
                record_module: copy_text(module, ctx)?,
                record_id: copy_text(record, ctx)?,
                index,
                mode: copy_text(mode, ctx)?,
                authors,
                field_author,
            };
            let (engine, registry) = embedded_engine(ctx)?;
            let mut capabilities = NoCapabilities;
            crate::parquet_record_type_operation::classify_parquet_record_type(
                source,
                &request,
                &engine,
                &registry,
                &mut capabilities,
                ctx,
            )
        }
        Some(op) if op == &key("classify-postgresql-composite") => {
            crate::postgresql_composite_classification::classify(source, request, ctx)
        }
        Some(op) if op == &key("classify-postgresql-ddl-record") => {
            let fresh = fresh.ok_or_else(|| {
                err(
                    "CLASSIFICATION_REPORT_BACKEND",
                    "Fresh PostgreSQL classification is required",
                )
            })?;
            let fresh_source = get(fresh, "source").ok_or_else(|| {
                err(
                    "CLASSIFICATION_REPORT_RECEIPT",
                    "Fresh PostgreSQL source is missing",
                )
            })?;
            let parser = crate::postgresql_ddl_classification::tagged_plain(fresh_source, ctx)?;
            let expected =
                crate::postgresql_ddl_classification::classify(source, request, &parser, ctx)?;
            if !exact(&expected, fresh, ctx)? || !exact(receipt, &expected, ctx)? {
                return Err(err(
                    "CLASSIFICATION_REPORT_RECEIPT",
                    "PostgreSQL classification differs from freshly parsed native source",
                ));
            }
            Ok(expected)
        }
        _ => Err(err(
            "CLASSIFICATION_REPORT_OPERATION",
            "Unsupported structured native classification",
        )),
    }
}

pub fn inspect_structured_classification(
    receipt: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let expected = recompute_structured_classification(receipt, fresh, ctx)?;
    if !exact(receipt, &expected, ctx)? {
        return Err(err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt differs from checked native classification",
        ));
    }
    let binding = get(receipt, "binding").ok_or_else(|| {
        err(
            "CLASSIFICATION_REPORT_RECEIPT",
            "Receipt binding is missing",
        )
    })?;
    let mappings = match get(receipt, "mappings") {
        Some(Value::Array(mappings)) => mappings,
        _ => {
            return Err(err(
                "CLASSIFICATION_REPORT_RECEIPT",
                "Receipt mappings are missing",
            ))
        }
    };
    let mut output_mappings = Vec::with_capacity(mappings.len());
    for mapping in mappings {
        ctx.charge_work(1, Utf16::default())?;
        let mut fields = match mapping {
            Value::Object(fields) => fields
                .iter()
                .map(|(name, value)| Ok((name.clone(), copy_json(value, ctx)?)))
                .collect::<Result<Vec<_>, EngineError>>()?,
            _ => return Err(err("CLASSIFICATION_REPORT_RECEIPT", "Mapping is invalid")),
        };
        fields.push((key("binding"), copy_json(binding, ctx)?));
        output_mappings.push(Value::Object(fields));
    }
    let residuals = match get(receipt, "residuals") {
        Some(Value::Array(rows)) => rows,
        _ => {
            return Err(err(
                "CLASSIFICATION_REPORT_RECEIPT",
                "Receipt residuals are missing",
            ))
        }
    };
    let mut output_residuals = Vec::with_capacity(residuals.len());
    for row in residuals {
        ctx.charge_work(1, Utf16::default())?;
        output_residuals.push(Value::Object(vec![
            (
                key("sourcePath"),
                copy_json(
                    get(row, "path").ok_or_else(|| {
                        err("CLASSIFICATION_REPORT_RECEIPT", "Residual path is missing")
                    })?,
                    ctx,
                )?,
            ),
            (
                key("sourceValue"),
                copy_json(
                    get(row, "value").ok_or_else(|| {
                        err("CLASSIFICATION_REPORT_RECEIPT", "Residual value is missing")
                    })?,
                    ctx,
                )?,
            ),
            (key("targetPath"), Value::Null),
            (key("outcome"), Value::string_utf8("unknown")),
            (
                key("reason"),
                copy_json(
                    get(row, "reason").ok_or_else(|| {
                        err(
                            "CLASSIFICATION_REPORT_RECEIPT",
                            "Residual reason is missing",
                        )
                    })?,
                    ctx,
                )?,
            ),
            (key("binding"), copy_json(binding, ctx)?),
            (
                key("recovery"),
                Value::Object(vec![
                    (
                        key("strategy"),
                        Value::string_utf8("retained-source-and-receipt"),
                    ),
                    (key("receiptPath"), Value::string_utf8("/receipt/source")),
                    (
                        key("instruction"),
                        copy_json(
                            get(row, "recovery").ok_or_else(|| {
                                err(
                                    "CLASSIFICATION_REPORT_RECEIPT",
                                    "Residual recovery is missing",
                                )
                            })?,
                            ctx,
                        )?,
                    ),
                ]),
            ),
        ]));
    }
    let native_context = if text(receipt, "operation")
        == Some(&key("classify-postgresql-ddl-record"))
    {
        Value::Object(vec![
            (
                key("scope"),
                copy_json(
                    get(receipt, "scope")
                        .ok_or_else(|| err("CLASSIFICATION_REPORT_RECEIPT", "scope is missing"))?,
                    ctx,
                )?,
            ),
            (
                key("namespaceResolution"),
                copy_json(
                    get(receipt, "namespaceResolution").ok_or_else(|| {
                        err(
                            "CLASSIFICATION_REPORT_RECEIPT",
                            "namespaceResolution is missing",
                        )
                    })?,
                    ctx,
                )?,
            ),
        ])
    } else {
        Value::Null
    };
    let output = Value::Object(vec![
        (
            key("operation"),
            Value::string_utf8("inspect-structured-classification"),
        ),
        (key("version"), Value::string_utf8("1.0.0")),
        (
            key("status"),
            copy_json(
                get(receipt, "status").ok_or_else(|| {
                    err("CLASSIFICATION_REPORT_RECEIPT", "Receipt status is missing")
                })?,
                ctx,
            )?,
        ),
        (key("receipt"), copy_json(receipt, ctx)?),
        (key("nativeContext"), native_context),
        (key("mappings"), Value::Array(output_mappings)),
        (key("residuals"), Value::Array(output_residuals)),
        (key("diagnostics"), result_diagnostics(&expected, ctx)?),
    ]);
    validate_report(
        &output,
        include_str!("../../../spec/core/structured-classification-inspection.schema.json"),
        STRUCTURED_CLASSIFICATION_RESOURCES,
        "CLASSIFICATION_REPORT_RESULT",
        ctx,
    )?;
    Ok(output)
}

pub fn verify_structured_classification_inspection(
    report: &Value,
    fresh: Option<&Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    validate_report(
        report,
        include_str!("../../../spec/core/structured-classification-inspection.schema.json"),
        STRUCTURED_CLASSIFICATION_RESOURCES,
        "CLASSIFICATION_REPORT_STRUCTURE",
        ctx,
    )?;
    let receipt = get(report, "receipt")
        .ok_or_else(|| err("CLASSIFICATION_REPORT_STRUCTURE", "Receipt is missing"))?;
    let expected = inspect_structured_classification(receipt, fresh, ctx)?;
    if !exact(report, &expected, ctx)? {
        return Err(err(
            "CLASSIFICATION_REPORT_STALE",
            "Common report differs from checked native receipt",
        ));
    }
    copy_json(report, ctx)
}
