//! Rust-owned raw SQL parse/edit/deparse path over an explicit backend.
//! Kept separate from catalog capture: parsing does not imply catalog binding.

use crate::parser_backend_protocol::{
    PostgresqlParserBackend, PARSER_AST_VERSION, PARSER_BACKEND_IDENTITY,
};
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::native_pointer,
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

pub struct SqlEditRoundTrip {
    pub source_sql: Utf16,
    pub candidate_sql: Utf16,
    pub ast: Value,
}

const SQL_EXTENSION: &str = "umf.postgresql";

/// Port the public async SQL import shape. The source is retained as an
/// archive while the parser result is stored as a lossless native tagged tree.
pub fn import_postgresql_sql(
    source_sql: &Utf16,
    id: &Utf16,
    backend: &dyn PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    check_backend(backend)?;
    if source_sql.len() > ctx.limits().max_text_units || source_sql.units().contains(&0) {
        return Err(fail(
            "POSTGRESQL_SOURCE",
            "Expected bounded SQL without NUL",
        ));
    }
    ctx.charge_text(source_sql.len(), Utf16::default())?;
    ctx.charge_work(source_sql.len(), Utf16::default())?;
    ctx.charge_text(id.len(), Utf16::default())?;
    ctx.charge_work(id.len(), Utf16::default())?;
    let ast = copy_json(&backend.parse(source_sql, ctx)?, ctx)?;
    document_from_ast(source_sql, id, &ast, ctx)
}

pub fn document_from_ast(
    source_sql: &Utf16,
    id: &Utf16,
    ast: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(source_sql.len().saturating_add(id.len()), Utf16::default())?;
    ctx.charge_work(source_sql.len().saturating_add(id.len()), Utf16::default())?;
    let ast_text = serialization::write_json_value(&ast, Format::Json, ctx)?;
    let root = crate::native_json::NativeJsonTree::parse_json(ast_text.units(), ctx)?;
    let tagged_root = root.tagged_value_preserving_extras(ctx)?;
    let payload = object(vec![
        ("profile", Value::string_utf8("postgresql-raw-parse-tree")),
        ("source", Value::String(source_sql.clone())),
        ("root", tagged_root),
    ]);
    Ok(object(vec![
        ("umf", Value::string_utf8("0.10.0")),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object(vec![(
                SQL_EXTENSION,
                object(vec![("version", Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (
            "modules",
            Value::Array(vec![object(vec![
                ("id", Value::string_utf8("schema")),
                ("namespace", Value::string_utf8("")),
                (
                    "elements",
                    Value::Array(vec![object(vec![
                        ("id", Value::string_utf8("schema")),
                        ("extensions", object(vec![(SQL_EXTENSION, payload)])),
                    ])]),
                ),
            ])]),
        ),
    ]))
}

pub fn prepare_export_tree(document: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let (payload, _, native) = sql_payload(document, ctx)?;
    if !object_has_only(&payload, &["profile", "source", "root"])
        || native.has_representation_extras()
    {
        return Err(fail(
            "POSTGRESQL_REPRESENTATION",
            "Unknown tagged-tree content blocks SQL export",
        ));
    }
    let compact = native.render_compact(ctx)?;
    let tree = serialization::read_json_value(compact.units(), Format::Json, ctx)?;
    let roundtrip = serialization::write_json_value(&tree, Format::Json, ctx)?;
    if crate::native_json::NativeJsonTree::parse_json(roundtrip.units(), ctx)? != native {
        return Err(fail(
            "POSTGRESQL_NUMERIC",
            "AST numbers cannot be represented exactly by the native wrapper",
        ));
    }
    validate_ast(&tree, ctx)?;
    Ok(tree)
}

/// Regenerate SQL only after exact-tree admission, native codec parity and a
/// pinned-schema check. The archived source is deliberately left untouched.
pub fn export_postgresql_sql(
    document: &Value,
    backend: &dyn PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    check_backend(backend)?;
    if field(document, "umf") != Some(&Value::string_utf8("0.10.0"))
        || !matches!(field(field(document, "vocabularies").unwrap_or(&Value::Null), SQL_EXTENSION), Some(v) if field(v, "version") == Some(&Value::string_utf8("0.1.0")))
    {
        return Err(fail(
            "POSTGRESQL_PAYLOAD",
            "Expected the PostgreSQL extension package",
        ));
    }
    let modules = match field(document, "modules") {
        Some(Value::Array(a)) => a,
        _ => return Err(fail("POSTGRESQL_DOCUMENT", "Expected schema module")),
    };
    let schema = modules
        .iter()
        .find(|module| field(module, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema module"))?;
    let elements = match field(schema, "elements") {
        Some(Value::Array(a)) => a,
        _ => return Err(fail("POSTGRESQL_DOCUMENT", "Expected schema element")),
    };
    let element = elements
        .iter()
        .find(|element| field(element, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema element"))?;
    let payload = field(
        field(element, "extensions").unwrap_or(&Value::Null),
        SQL_EXTENSION,
    )
    .ok_or_else(|| {
        fail(
            "POSTGRESQL_PAYLOAD",
            "Expected PostgreSQL extension payload",
        )
    })?;
    if !object_has_only(payload, &["profile", "source", "root"])
        || field(payload, "profile") != Some(&Value::string_utf8("postgresql-raw-parse-tree"))
        || !matches!(field(payload, "source"), Some(Value::String(_)))
    {
        return Err(fail(
            "POSTGRESQL_REPRESENTATION",
            "Unknown or invalid payload representation",
        ));
    }
    let tagged =
        field(payload, "root").ok_or_else(|| fail("POSTGRESQL_PAYLOAD", "AST root is missing"))?;
    let native = crate::native_json::NativeJsonTree::from_tagged_value(tagged, ctx)?;
    if native.has_representation_extras() {
        return Err(fail(
            "POSTGRESQL_REPRESENTATION",
            "Unknown tagged-tree content blocks SQL export",
        ));
    }
    if !matches!(native.root(), crate::native_json::NativeJsonNode::Object(_)) {
        return Err(fail(
            "POSTGRESQL_AST",
            "Expected PostgreSQL parse result object",
        ));
    }
    let compact = native.render_compact(ctx)?;
    let tree = serialization::read_json_value(compact.units(), Format::Json, ctx)?;
    // JSON↔Value conversion must preserve every exact number, including
    // unknown future AST properties, before the host's ordinary object API.
    let round_trip = serialization::write_json_value(&tree, Format::Json, ctx)?;
    let reencoded = crate::native_json::NativeJsonTree::parse_json(round_trip.units(), ctx)?;
    if &reencoded != &native {
        return Err(fail(
            "POSTGRESQL_NUMERIC",
            "AST numbers cannot be represented exactly by the native wrapper",
        ));
    }
    validate_ast(&tree, ctx)?;
    let encoded = copy_json(&backend.codec_round_trip(&tree, ctx)?, ctx)?;
    if canonical(&encoded, false, ctx)? != canonical(&tree, false, ctx)? {
        return Err(fail(
            "POSTGRESQL_CODEC_LOSS",
            "Native protobuf conversion changed AST content",
        ));
    }
    let sql = backend.deparse(&tree, ctx)?;
    if sql.len() > ctx.limits().max_text_units {
        return Err(fail("POSTGRESQL_DEPARSE", "SQL exceeds the text limit"));
    }
    ctx.charge_text(sql.len(), Utf16::default())?;
    ctx.charge_work(sql.len(), Utf16::default())?;
    let reparsed = copy_json(&backend.parse(&sql, ctx)?, ctx)?;
    validate_ast(&reparsed, ctx)?;
    if canonical(&reparsed, true, ctx)? != canonical(&tree, true, ctx)? {
        return Err(fail(
            "POSTGRESQL_ROUND_TRIP",
            "Deparse/reparse changed AST content beyond source offsets",
        ));
    }
    Ok(sql)
}

pub fn get_postgresql_source(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, source, _) = sql_payload(document, ctx)?;
    Ok(Value::String(source))
}

pub fn get_postgresql_node(
    document: &Value,
    pointer: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (_, _, root) = sql_payload(document, ctx)?;
    root.child(pointer, ctx)?;
    let mut tagged = root.tagged_value_preserving_extras(ctx)?;
    for segment in crate::native_json::native_pointer(pointer, ctx)? {
        let (kind, value) = match &tagged {
            Value::Object(fields) => {
                let kind = fields
                    .iter()
                    .find(|(k, _)| k == &Utf16::from("kind"))
                    .map(|(_, v)| v);
                let kind = match kind {
                    Some(Value::String(s)) => s
                        .to_utf8()
                        .map_err(|_| fail("POSTGRESQL_NODE", "Invalid tagged kind"))?,
                    _ => return Err(fail("POSTGRESQL_NODE", "Invalid tagged node")),
                };
                if kind == "object" {
                    let members = fields
                        .iter()
                        .find(|(k, _)| k == &Utf16::from("members"))
                        .map(|(_, v)| v);
                    (kind, members)
                } else if kind == "array" {
                    let items = fields
                        .iter()
                        .find(|(k, _)| k == &Utf16::from("items"))
                        .map(|(_, v)| v);
                    (kind, items)
                } else {
                    (kind, None)
                }
            }
            _ => return Err(fail("POSTGRESQL_NODE", "Invalid tagged node")),
        };
        tagged = match (kind.as_str(), value) {
            ("object", Some(Value::Object(members))) => members
                .iter()
                .find(|(k, _)| k == &segment)
                .map(|(_, v)| copy_json(v, ctx))
                .ok_or_else(|| fail("POSTGRESQL_NODE", "Pointer member missing"))??,
            ("array", Some(Value::Array(items))) => segment
                .to_utf8()
                .ok()
                .and_then(|s| s.parse::<usize>().ok())
                .and_then(|i| items.get(i))
                .map(|v| copy_json(v, ctx))
                .ok_or_else(|| fail("POSTGRESQL_NODE", "Pointer index missing"))??,
            _ => return Err(fail("POSTGRESQL_NODE", "Pointer traverses a scalar")),
        };
    }
    Ok(tagged)
}

pub fn edit_postgresql_node(
    document: &Value,
    pointer: &Utf16,
    replacement_json: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let (payload, source, root) = sql_payload(document, ctx)?;
    if !object_has_only(&payload, &["profile", "source", "root"])
        || root.has_representation_extras()
    {
        return Err(fail(
            "POSTGRESQL_REPRESENTATION",
            "Unknown representation content prevents AST editing",
        ));
    }
    let replacement =
        crate::native_json::NativeJsonTree::parse_json(replacement_json.units(), ctx)?;
    let edited = root.replace_node(pointer, &replacement, ctx)?;
    let mut next = copy_json(document, ctx)?;
    let next_payload = object(vec![
        ("profile", Value::string_utf8("postgresql-raw-parse-tree")),
        ("source", Value::String(source)),
        ("root", edited.tagged_value_preserving_extras(ctx)?),
    ]);
    replace_extension_payload(&mut next, next_payload)?;
    let validation = inspect_postgresql_sql(&next, ctx)?;
    Ok(object(vec![("document", next), ("validation", validation)]))
}

pub fn inspect_postgresql_sql(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let validation = validate_umf_document(document, ctx)?;
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for diagnostic in &validation.diagnostics {
        ctx.charge_text(
            diagnostic
                .code
                .len()
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len()),
            Utf16::default(),
        )?;
        diagnostics.push(object(vec![
            ("code", Value::String(diagnostic.code.clone())),
            ("path", Value::String(diagnostic.path.clone())),
            (
                "severity",
                Value::string_utf8(match diagnostic.severity {
                    Severity::Error => "error",
                    Severity::Warning => "warning",
                }),
            ),
            ("message", Value::String(diagnostic.message.clone())),
        ]));
    }
    if !validation.valid {
        return Ok(object(vec![
            ("valid", Value::Bool(false)),
            ("complete", Value::Bool(false)),
            ("diagnostics", Value::Array(diagnostics)),
        ]));
    }
    let (payload, _, _root) = sql_payload(document, ctx)?;
    diagnostics.extend(inspect_postgresql_sql_payload(&payload, ctx)?);
    diagnostics.insert(0, object(vec![
        ("code", Value::string_utf8("POSTGRESQL_CATALOG_UNRESOLVED")),
        ("path", Value::string_utf8("")),
        ("severity", Value::string_utf8("warning")),
        (
            "message",
            Value::string_utf8(
                "Raw syntax is not catalog resolution, SQL execution, permissions or server-state validation",
            ),
        ),
    ]));
    Ok(object(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ]))
}

struct PostgresqlCapabilities;

impl Capabilities for PostgresqlCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Validate the complete UMF document against the current core/package
/// contracts before reporting PostgreSQL payload observations. This mirrors
/// the public adapter's `validateDocument(document, postgresqlRegistry())`;
/// it prevents unrelated malformed modules from being called valid merely
/// because the PostgreSQL payload itself parses.
fn validate_umf_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    fn read(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let units = source.encode_utf16().collect::<Vec<_>>();
        ctx.charge_text(units.len(), Utf16::default())?;
        serialization::read_json_value(&units, Format::Json, ctx)
    }

    let engine = Engine::new(
        ResourceSet::new(
            read(include_str!("../../../spec/core/schema.json"), ctx)?,
            read(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            read(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        ),
        ctx,
    )?;
    let package = read(
        include_str!("../../../spec/extensions/postgresql/package.json"),
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    registry.register(&package, Some(47), engine.package_schema(), &resources, ctx)?;
    engine.validate_document(document, &registry, &mut PostgresqlCapabilities, ctx)
}

pub fn inspect_postgresql_sql_payload(
    payload: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Value>, EngineError> {
    let tagged =
        field(payload, "root").ok_or_else(|| fail("POSTGRESQL_PAYLOAD", "AST root is missing"))?;
    let root = crate::native_json::NativeJsonTree::from_tagged_value(tagged, ctx)?;
    let mut diagnostics = Vec::new();
    if !object_has_only(payload, &["profile", "source", "root"]) {
        diagnostics.push(object(vec![
            ("code", Value::string_utf8("POSTGRESQL_REPRESENTATION")),
            ("path", Value::string_utf8("")),
            ("severity", Value::string_utf8("warning")),
            (
                "message",
                Value::string_utf8(
                    "Unknown representation content must remain in UMF and blocks SQL export",
                ),
            ),
        ]));
    }
    if root.has_representation_extras() {
        diagnostics.push(object(vec![
            ("code", Value::string_utf8("POSTGRESQL_REPRESENTATION")),
            ("path", Value::string_utf8("/root")),
            ("severity", Value::string_utf8("warning")),
            (
                "message",
                Value::string_utf8("Unknown tagged-tree content blocks SQL export"),
            ),
        ]));
    }
    if !native_ast_version_is(&root, PARSER_AST_VERSION) {
        diagnostics.push(object(vec![
            ("code", Value::string_utf8("POSTGRESQL_VERSION")),
            ("path", Value::string_utf8("/root")),
            ("severity", Value::string_utf8("warning")),
            (
                "message",
                Value::string_utf8(
                    "Uninterpreted parser tree version retained; native SQL export is unavailable",
                ),
            ),
        ]));
    }
    Ok(diagnostics)
}

pub fn validate_postgresql_ast(ast: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let source = Utf16::from(include_str!(
        "../../../spec/extensions/postgresql/native-ast.schema.json"
    ));
    ctx.charge_text(source.len(), Utf16::default())?;
    let schema = serialization::read_json_value(source.units(), Format::Json, ctx)?;
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), false, ctx)?;
    let errors = compiled.validate(ast, ctx)?;
    Ok(object(vec![
        ("valid", Value::Bool(errors.is_empty())),
        ("complete", Value::Bool(false)),
        (
            "errors",
            Value::Array(
                errors
                    .into_iter()
                    .map(|d| {
                        Ok(object(vec![
                            ("instancePath", Value::String(d.instance_path)),
                            ("schemaPath", Value::String(d.schema_path)),
                            ("keyword", Value::string_utf8(&d.keyword)),
                            ("params", copy_json(&d.params, ctx)?),
                            ("message", Value::String(d.message)),
                        ]))
                    })
                    .collect::<Result<Vec<_>, EngineError>>()?,
            ),
        ),
    ]))
}

fn sql_payload(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<(Value, Utf16, crate::native_json::NativeJsonTree), EngineError> {
    if field(document, "umf") != Some(&Value::string_utf8("0.10.0"))
        || !matches!(field(field(document, "vocabularies").unwrap_or(&Value::Null), SQL_EXTENSION), Some(v) if field(v, "version") == Some(&Value::string_utf8("0.1.0")))
    {
        return Err(fail(
            "POSTGRESQL_PAYLOAD",
            "Expected the PostgreSQL extension package",
        ));
    }
    let modules = match field(document, "modules") {
        Some(Value::Array(a)) => a,
        _ => return Err(fail("POSTGRESQL_DOCUMENT", "Expected schema module")),
    };
    let schema = modules
        .iter()
        .find(|m| field(m, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema module"))?;
    let elements = match field(schema, "elements") {
        Some(Value::Array(a)) => a,
        _ => return Err(fail("POSTGRESQL_DOCUMENT", "Expected schema element")),
    };
    let element = elements
        .iter()
        .find(|e| field(e, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema element"))?;
    let payload = field(
        field(element, "extensions").unwrap_or(&Value::Null),
        SQL_EXTENSION,
    )
    .ok_or_else(|| fail("POSTGRESQL_PAYLOAD", "Expected PostgreSQL raw SQL payload"))?;
    if field(payload, "profile") != Some(&Value::string_utf8("postgresql-raw-parse-tree")) {
        return Err(fail(
            "POSTGRESQL_PAYLOAD",
            "Expected PostgreSQL raw parse-tree profile",
        ));
    }
    let source = match field(payload, "source") {
        Some(Value::String(s)) => {
            ctx.charge_text(s.len(), Utf16::default())?;
            ctx.charge_work(s.len(), Utf16::default())?;
            s.clone()
        }
        _ => return Err(fail("POSTGRESQL_PAYLOAD", "Archived SQL source is missing")),
    };
    let tagged =
        field(payload, "root").ok_or_else(|| fail("POSTGRESQL_PAYLOAD", "AST root is missing"))?;
    let root = crate::native_json::NativeJsonTree::from_tagged_value(tagged, ctx)?;
    Ok((copy_json(payload, ctx)?, source, root))
}

fn native_ast_version_is(root: &crate::native_json::NativeJsonTree, version: u32) -> bool {
    matches!(root.root(), crate::native_json::NativeJsonNode::Object(fields) if fields.iter().any(|(k,v)| k == &Utf16::from("version") && matches!(v, crate::native_json::NativeJsonNode::Number(n) if n == &version.to_string())))
}

fn replace_extension_payload(document: &mut Value, payload: Value) -> Result<(), EngineError> {
    let modules = field_mut(document, "modules")
        .and_then(|v| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected modules"))?;
    let module = modules
        .iter_mut()
        .find(|m| field(m, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema module"))?;
    let elements = field_mut(module, "elements")
        .and_then(|v| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema elements"))?;
    let element = elements
        .iter_mut()
        .find(|e| field(e, "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema element"))?;
    let extensions = field_mut(element, "extensions")
        .and_then(|v| match v {
            Value::Object(a) => Some(a),
            _ => None,
        })
        .ok_or_else(|| fail("POSTGRESQL_DOCUMENT", "Expected schema extensions"))?;
    if let Some((_, value)) = extensions
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(SQL_EXTENSION))
    {
        *value = payload;
    } else {
        extensions.push((Utf16::from(SQL_EXTENSION), payload));
    }
    Ok(())
}

fn field_mut<'a>(value: &'a mut Value, name: &str) -> Option<&'a mut Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(name))
        .map(|(_, v)| v)
}

fn check_backend(backend: &dyn PostgresqlParserBackend) -> Result<(), EngineError> {
    if backend.identity() != PARSER_BACKEND_IDENTITY {
        return Err(fail(
            "POSTGRESQL_BACKEND",
            "Expected the explicitly admitted pinned parser backend",
        ));
    }
    Ok(())
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}

fn object_has_only(value: &Value, allowed: &[&str]) -> bool {
    matches!(value, Value::Object(fields) if fields.iter().all(|(k, _)| allowed.iter().any(|name| k == &Utf16::from(*name))))
}

/// Parse SQL, replace one existing JSON Pointer in the pinned AST, validate
/// both ASTs against the current vocabulary schema, then deparse and reparse.
/// The backend is explicit, version-pinned and never discovered from ambient
/// state. The original SQL remains available separately from the candidate.
pub fn edit_sql_round_trip(
    sql: &Utf16,
    pointer: &Utf16,
    replacement_json: &Utf16,
    backend: &dyn PostgresqlParserBackend,
    ctx: &mut Context<'_>,
) -> Result<SqlEditRoundTrip, EngineError> {
    if backend.identity() != PARSER_BACKEND_IDENTITY {
        return Err(fail(
            "POSTGRESQL_BACKEND",
            "Expected the admitted PostgreSQL parser backend",
        ));
    }
    if sql.len() > ctx.limits().max_text_units
        || replacement_json.len() > ctx.limits().max_text_units
    {
        return Err(fail(
            "POSTGRESQL_SOURCE",
            "SQL or replacement exceeds the text limit",
        ));
    }
    ctx.charge_text(sql.len(), Utf16::default())?;
    ctx.charge_work(sql.len(), Utf16::default())?;
    let mut parsed = copy_json(&backend.parse(sql, ctx)?, ctx)?;
    validate_ast(&parsed, ctx)?;
    let path = native_pointer(pointer, ctx)?;
    let replacement = serialization::read_json_value(replacement_json.units(), Format::Json, ctx)?;
    replace_at(&mut parsed, &path, replacement)?;
    validate_ast(&parsed, ctx)?;

    let encoded = copy_json(&backend.codec_round_trip(&parsed, ctx)?, ctx)?;
    if canonical(&encoded, false, ctx)? != canonical(&parsed, false, ctx)? {
        return Err(fail(
            "POSTGRESQL_CODEC_LOSS",
            "Parser codec changed the edited AST",
        ));
    }
    let candidate_sql = backend.deparse(&parsed, ctx)?;
    if candidate_sql.len() > ctx.limits().max_text_units {
        return Err(fail(
            "POSTGRESQL_DEPARSE",
            "Deparsed SQL exceeds the text limit",
        ));
    }
    ctx.charge_text(candidate_sql.len(), Utf16::default())?;
    ctx.charge_work(candidate_sql.len(), Utf16::default())?;
    let reparsed = copy_json(&backend.parse(&candidate_sql, ctx)?, ctx)?;
    validate_ast(&reparsed, ctx)?;
    if canonical(&reparsed, true, ctx)? != canonical(&parsed, true, ctx)? {
        return Err(fail(
            "POSTGRESQL_ROUND_TRIP",
            "Deparse/reparse changed AST content beyond source offsets",
        ));
    }
    Ok(SqlEditRoundTrip {
        source_sql: sql.clone(),
        candidate_sql,
        ast: parsed,
    })
}

pub fn validate_ast(ast: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Some(Value::Number(version)) = field(ast, "version") else {
        return Err(fail("POSTGRESQL_AST_VERSION", "AST version is missing"));
    };
    if *version != PARSER_AST_VERSION as f64 {
        return Err(fail(
            "POSTGRESQL_AST_VERSION",
            "Expected PostgreSQL AST version 170004",
        ));
    }
    let source = Utf16::from(include_str!(
        "../../../spec/extensions/postgresql/native-ast.schema.json"
    ));
    ctx.charge_text(source.len(), Utf16::default())?;
    let schema = serialization::read_json_value(source.units(), Format::Json, ctx)?;
    let compiled =
        CompiledSchema::compile_consumer(&schema, &SchemaResources::default(), false, ctx)?;
    if !compiled.validate(ast, ctx)?.is_empty() {
        return Err(fail(
            "POSTGRESQL_AST",
            "AST does not match the pinned PostgreSQL schema",
        ));
    }
    Ok(())
}

pub fn replace_at(root: &mut Value, path: &[Utf16], replacement: Value) -> Result<(), EngineError> {
    fn walk(node: &mut Value, path: &[Utf16], replacement: Value) -> Result<(), EngineError> {
        if path.is_empty() {
            *node = replacement;
            return Ok(());
        }
        match node {
            Value::Object(fields) => {
                let child = fields
                    .iter_mut()
                    .find(|(key, _)| key == &path[0])
                    .map(|(_, value)| value)
                    .ok_or_else(|| fail("POSTGRESQL_EDIT", "JSON Pointer target does not exist"))?;
                walk(child, &path[1..], replacement)
            }
            Value::Array(items) => {
                let index = path[0]
                    .to_utf8()
                    .ok()
                    .filter(|text| {
                        text == "0"
                            || (!text.starts_with('0') && text.bytes().all(|b| b.is_ascii_digit()))
                    })
                    .and_then(|text| text.parse::<usize>().ok())
                    .ok_or_else(|| {
                        fail("POSTGRESQL_EDIT", "JSON Pointer array index is invalid")
                    })?;
                let child = items.get_mut(index).ok_or_else(|| {
                    fail(
                        "POSTGRESQL_EDIT",
                        "JSON Pointer array index is out of bounds",
                    )
                })?;
                walk(child, &path[1..], replacement)
            }
            _ => Err(fail("POSTGRESQL_EDIT", "JSON Pointer traverses a scalar")),
        }
    }
    walk(root, path, replacement)
}

pub fn canonical(
    value: &Value,
    omit_offsets: bool,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    fn normalize(
        value: &Value,
        omit_offsets: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        match value {
            Value::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    out.push(normalize(item, omit_offsets, ctx)?);
                }
                Ok(Value::Array(out))
            }
            Value::Object(fields) => {
                let mut ordered = fields
                    .iter()
                    .filter(|(key, _)| {
                        !omit_offsets
                            || !["location", "stmt_location", "stmt_len"]
                                .contains(&key.to_utf8().unwrap_or_default().as_str())
                    })
                    .collect::<Vec<_>>();
                ordered.sort_by(|(a, _), (b, _)| a.cmp(b));
                let mut out = Vec::with_capacity(ordered.len());
                for (key, value) in ordered {
                    ctx.charge_work(1, Utf16::default())?;
                    out.push((key.clone(), normalize(value, omit_offsets, ctx)?));
                }
                Ok(Value::Object(out))
            }
            _ => copy_json(value, ctx),
        }
    }
    let normalized = normalize(value, omit_offsets, ctx)?;
    serialization::write_json_value(&normalized, Format::Json, ctx)
}

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
