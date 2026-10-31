// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust source operations for Iceberg table metadata JSON.
//! This is intentionally a separate profile from `iceberg_schema`.
use std::collections::BTreeSet;

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    iceberg_schema::{self, IcebergSchemaResources},
    native_json::{NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.iceberg.table";
const PROFILE: &str = "iceberg-table-json";
const TOKEN: u64 = 0x4943_4554_4142_4c01;

#[derive(Clone, Debug)]
pub struct IcebergTableResources {
    engine: Engine,
    registry: Registry,
    grammar: CompiledSchema,
    grammar_value: Value,
    schema: IcebergSchemaResources,
    manifest: Value,
}

impl IcebergTableResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = text.encode_utf16().count();
            ctx.charge_text(units, Utf16::default())?;
            let mut source = Vec::with_capacity(units);
            source.extend(text.encode_utf16());
            serialization::read_json_value(&source, Format::Json, ctx)
        }
        let core = ResourceSet::new(
            resource(include_str!("../../../spec/core/schema.json"), ctx)?,
            resource(
                include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/core/extension-package.schema.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/core-constraints.json"),
                ctx,
            )?,
            resource(
                include_str!("../../../spec/metamodel/generated/domain-policy.json"),
                ctx,
            )?,
        );
        let manifest = resource(
            include_str!("../../../spec/extensions/iceberg-table/package.json"),
            ctx,
        )?;
        let grammar_value = resource(
            include_str!("../../../spec/extensions/iceberg-table/datatype-schema.json"),
            ctx,
        )?;
        let engine = Engine::new(core, ctx)?;
        let schema_resources = engine.schema_resources_with_context(ctx)?;
        let grammar = CompiledSchema::compile(&grammar_value, &schema_resources, ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &manifest,
            Some(TOKEN),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        let schema = IcebergSchemaResources::new(ctx)?;
        Ok(Self {
            engine,
            registry,
            grammar,
            grammar_value,
            schema,
            manifest,
        })
    }
}

struct TableCapabilities<'a> {
    grammar: &'a CompiledSchema,
    grammar_value: &'a Value,
    schema: &'a IcebergSchemaResources,
}
impl Capabilities for TableCapabilities<'_> {
    fn validate_extension(
        &mut self,
        _: u64,
        _: &Value,
        _: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        let fail = |code: &str, msg: &str| {
            CapabilityError::Engine(EngineError::new(code, Utf16::default(), msg))
        };
        let fields = object(payload)
            .ok_or_else(|| fail("ICEBERG_TABLE_PAYLOAD", "Table payload must be an object"))?;
        if get(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
            return Ok(vec![diag(
                "ICEBERG_TABLE_PAYLOAD",
                "",
                "Expected pinned Iceberg table payload",
                Severity::Error,
            )]);
        }
        let root = get(fields, "root")
            .ok_or_else(|| fail("ICEBERG_TABLE_PAYLOAD", "Table payload root is missing"))?;
        let tree = NativeJsonTree::from_tagged_value(root, ctx).map_err(CapabilityError::Engine)?;
        let mut ds = Vec::new();
        if object(payload)
            .unwrap()
            .iter()
            .any(|(k, _)| !["profile", "root"].iter().any(|x| k == &Utf16::from(*x)))
        {
            ds.push(diag(
                "ICEBERG_TABLE_REPRESENTATION",
                "",
                "Unknown representation fields must remain in UMF",
                Severity::Warning,
            ));
        }
        if tree.has_representation_extras() {
            for path in tree
                .representation_extra_paths(&Utf16::from("/root"), ctx)
                .map_err(CapabilityError::Engine)?
            {
                ds.push(Diagnostic {
                    code: Utf16::from("ICEBERG_TABLE_REPRESENTATION"),
                    path,
                    python_source_path: false,
                    message: Utf16::from("Unknown tagged-tree fields must remain in UMF"),
                    severity: Severity::Warning,
                    python_text_origin: None,
                });
            }
        }
        let mut ordinal = 0usize;
        let shape = shape_value(tree.root(), ctx, &mut ordinal).map_err(CapabilityError::Engine)?;
        let issues = self
            .grammar
            .validate(&shape, ctx)
            .map_err(CapabilityError::Engine)?;
        for issue in issues {
            ds.push(Diagnostic {
                code: Utf16::from("ICEBERG_TABLE_STRUCTURE"),
                path: issue.instance_path,
                python_source_path: false,
                message: issue.message,
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
        if ds.iter().any(|d| d.severity == Severity::Error) {
            return Ok(ds);
        }
        inspect_table_native(tree.root(), &mut ds, ctx).map_err(CapabilityError::Engine)?;
        inspect_exact_numbers(tree.root(), &self.grammar_value, &mut ds, ctx)
            .map_err(CapabilityError::Engine)?;
        // The table's embedded schema is validated by the same pinned schema engine.
        let mut embedded = Vec::new();
        collect_embedded_schema(tree.root(), &Utf16::default(), &mut embedded, ctx)
            .map_err(CapabilityError::Engine)?;
        for (path, native) in embedded {
            let text = native
                .render_compact(ctx)
                .map_err(CapabilityError::Engine)?;
            match iceberg_schema::import_iceberg_schema(
                text.units(),
                &Utf16::from("embedded"),
                self.schema,
                ctx,
            ) {
                Ok(embedded_document) => {
                    let validation =
                        iceberg_schema::inspect_iceberg(&embedded_document, self.schema, ctx)
                            .map_err(CapabilityError::Engine)?;
                    for issue in validation.diagnostics {
                        let full_path = if issue.path.is_empty() {
                            path.clone()
                        } else {
                            let separator =
                                usize::from(issue.path.units().first() != Some(&(b'/' as u16)));
                            let units = path
                                .len()
                                .saturating_add(issue.path.len())
                                .saturating_add(separator);
                            ctx.charge_text(units, path.clone())
                                .map_err(CapabilityError::Engine)?;
                            let mut joined = Vec::new();
                            joined.try_reserve(units).map_err(|_| {
                                CapabilityError::Engine(err(
                                    "RESOURCE_LIMIT",
                                    "Embedded schema path allocation failed",
                                ))
                            })?;
                            joined.extend_from_slice(path.units());
                            if separator != 0 {
                                joined.push(b'/' as u16);
                            }
                            joined.extend_from_slice(issue.path.units());
                            Utf16::new(joined)
                        };
                        ds.push(Diagnostic {
                            code: issue.code,
                            path: full_path,
                            python_source_path: false,
                            message: issue.message,
                            severity: issue.severity,
                            python_text_origin: None,
                        });
                    }
                }
                Err(e) if e.is_control_failure() || e.code == "LIMIT" => {
                    return Err(CapabilityError::Engine(e))
                }
                Err(e) => ds.push(Diagnostic {
                    code: Utf16::from("ICEBERG_TABLE_SCHEMA"),
                    path,
                    python_source_path: false,
                    message: e.message,
                    severity: Severity::Error,
                    python_text_origin: None,
                }),
            }
        }
        Ok(ds)
    }
}

pub fn inspect_iceberg_table(
    document: &Value,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut cap = TableCapabilities {
        grammar: &r.grammar,
        grammar_value: &r.grammar_value,
        schema: &r.schema,
    };
    r.engine
        .validate_document(document, &r.registry, &mut cap, ctx)
}
pub fn iceberg_table_registry(r: &IcebergTableResources) -> &Registry {
    &r.registry
}
pub fn inspect_iceberg_table_payload(
    payload: &Value,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut capabilities = TableCapabilities {
        grammar: &r.grammar,
        grammar_value: &r.grammar_value,
        schema: &r.schema,
    };
    let semantic = SemanticContext {
        document: Value::Null,
        source_document: None,
        source_payload: None,
        path: Utf16::default(),
        scope: "element".to_string(),
    };
    capabilities
        .validate_extension_with_context(TOKEN, payload, &semantic, ctx)
        .map_err(|error| match error {
            CapabilityError::Engine(error) => error,
            CapabilityError::Host(message) => {
                EngineError::new("HOST_CALLBACK", Utf16::default(), message)
            }
            CapabilityError::HostPython { message, .. } => {
                EngineError::new("HOST_CALLBACK", Utf16::default(), message)
            }
        })
}
pub fn import_iceberg_table(
    source: &[u16],
    id: &Utf16,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_text(id.len(), Utf16::default())?;
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let tagged = tree.tagged_value_preserving_extras(ctx)?;
    let d = document(id, tagged, ctx)?;
    let v = inspect_iceberg_table(&d, r, ctx)?;
    if !v.valid {
        return Err(validation_error("ICEBERG_TABLE_DOCUMENT", &v, ctx)?);
    }
    Ok(d)
}
pub fn export_iceberg_table(
    document: &Value,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let v = inspect_iceberg_table(document, r, ctx)?;
    if !v.valid {
        return Err(validation_error("ICEBERG_TABLE_DOCUMENT", &v, ctx)?);
    }
    if v.diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("ICEBERG_TABLE_REPRESENTATION"))
    {
        return Err(err(
            "ICEBERG_TABLE_EXPORT",
            "Unknown representation content cannot be discarded",
        ));
    }
    payload_tree(document, ctx)?.render_compact(ctx)
}
pub fn get_iceberg_table_node(
    document: &Value,
    path: &Utf16,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let v = inspect_iceberg_table(document, r, ctx)?;
    if !v.valid {
        return Err(validation_error("ICEBERG_TABLE_DOCUMENT", &v, ctx)?);
    }
    let tree = payload_tree(document, ctx)?;
    tree.subtree_clone(path, ctx)
}
pub fn propose_iceberg_table_node_edit(
    document: &Value,
    path: &Utf16,
    replacement: &[u16],
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let v = inspect_iceberg_table(document, r, ctx)?;
    if !v.valid {
        return Err(validation_error("ICEBERG_TABLE_DOCUMENT", &v, ctx)?);
    }
    crate::native_json::native_pointer(path, ctx)?;
    let tree = payload_tree(document, ctx)?.replace_node(
        path,
        &NativeJsonTree::parse_json(replacement, ctx)?,
        ctx,
    )?;
    let tagged = tree.tagged_value_preserving_extras(ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_root(&mut candidate, tagged)?;
    let validation = inspect_iceberg_table(&candidate, r, ctx)?;
    if !validation.valid {
        return Err(validation_error("ICEBERG_TABLE_EDIT", &validation, ctx)?);
    }
    Ok((candidate, validation))
}

fn inspect_table_native(
    root: &NativeJsonNode,
    ds: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let NativeJsonNode::Object(m) = root else {
        return Ok(());
    };
    let version = member(m, "format-version").and_then(exact_i64);
    const TABLE_KEYS: &[&str] = &[
        "format-version",
        "table-uuid",
        "location",
        "last-sequence-number",
        "last-updated-ms",
        "last-column-id",
        "schema",
        "schemas",
        "current-schema-id",
        "partition-spec",
        "partition-specs",
        "default-spec-id",
        "last-partition-id",
        "properties",
        "current-snapshot-id",
        "snapshots",
        "snapshot-log",
        "metadata-log",
        "sort-orders",
        "default-sort-order-id",
        "refs",
        "statistics",
        "partition-statistics",
        "next-row-id",
        "encryption-keys",
    ];
    for (key, _) in m {
        ctx.charge_text(key.len(), Utf16::default())?;
        let known = key
            .to_utf8()
            .ok()
            .is_some_and(|name| TABLE_KEYS.contains(&name.as_str()));
        if !known {
            let path = join_pointer_segment(&Utf16::default(), key, ctx)?;
            ds.push(Diagnostic {
                code: Utf16::from("ICEBERG_TABLE_UNKNOWN"),
                path,
                python_source_path: false,
                message: Utf16::from(
                    "Unknown native table property is preserved without interpretation",
                ),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
    }
    if !matches!(version, Some(1..=3)) {
        ds.push(diag(
            "ICEBERG_TABLE_VERSION",
            "/format-version",
            "Unknown format version preserved without native interpretation",
            Severity::Warning,
        ));
    }
    // Field-level embedded semantics are delegated to iceberg_schema below.
    for key in [
        "current-schema-id",
        "default-spec-id",
        "default-sort-order-id",
        "current-snapshot-id",
    ] {
        if let Some(value) = member(m, key) {
            if matches!(value, NativeJsonNode::Number(_)) && exact_i64(value).is_none() {
                ds.push(diag(
                    "ICEBERG_TABLE_INTEGER",
                    &format!("/{key}"),
                    "Expected exact bounded integer token",
                    Severity::Error,
                ));
            }
        }
    }
    ds.push(diag("ICEBERG_TABLE_CONTEXT","","Metadata shapes do not validate physical files, schema evolution, transforms, reference histories, defaults, encryption or safe commits",Severity::Warning));
    Ok(())
}
fn inspect_exact_numbers(
    root: &NativeJsonNode,
    grammar: &Value,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(grammar_fields) = object(grammar) else {
        return Err(err("ICEBERG_TABLE_SCHEMA", "Missing table schema object"));
    };
    if let Some(properties) = get(grammar_fields, "properties") {
        inspect_schema_properties(
            root,
            properties,
            grammar,
            &Utf16::default(),
            false,
            diagnostics,
            ctx,
        )?;
    }
    let version = member_as_i64(root, "format-version");
    if matches!(version, Some(1..=3)) {
        if let Some(Value::Array(all_of)) = get(grammar_fields, "allOf") {
            for conditional in all_of {
                let Some(then_schema) = object(conditional).and_then(|fields| get(fields, "then"))
                else {
                    continue;
                };
                if let Some(properties) =
                    object(then_schema).and_then(|fields| get(fields, "properties"))
                {
                    inspect_schema_properties(
                        root,
                        properties,
                        grammar,
                        &Utf16::default(),
                        true,
                        diagnostics,
                        ctx,
                    )?;
                }
            }
        }
    }
    Ok(())
}
fn inspect_schema_properties(
    node: &NativeJsonNode,
    properties: &Value,
    root_schema: &Value,
    path: &Utf16,
    skip_format_version: bool,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(members) = (if let NativeJsonNode::Object(members) = node {
        Some(members)
    } else {
        None
    }) else {
        return Ok(());
    };
    let Some(properties) = object(properties) else {
        return Ok(());
    };
    for (key, value) in members {
        if skip_format_version && key == &Utf16::from("format-version") {
            continue;
        }
        let Some((_, property_schema)) = properties.iter().find(|(name, _)| name == key) else {
            continue;
        };
        let child_path = join_pointer_segment(path, key, ctx)?;
        inspect_number_at_schema(
            value,
            property_schema,
            root_schema,
            &child_path,
            diagnostics,
            ctx,
        )?;
    }
    Ok(())
}
fn inspect_number_at_schema(
    node: &NativeJsonNode,
    schema: &Value,
    root_schema: &Value,
    path: &Utf16,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, path.clone())?;
    let fields = object(schema);
    if let Some(reference) = fields
        .and_then(|fields| get(fields, "$ref"))
        .and_then(as_utf16)
        .and_then(|v| v.to_utf8().ok())
    {
        let name = reference.rsplit('/').next().unwrap_or("");
        let defs = object(
            get(
                object(root_schema)
                    .ok_or_else(|| err("ICEBERG_TABLE_SCHEMA", "Missing table schema object"))?,
                "$defs",
            )
            .ok_or_else(|| err("ICEBERG_TABLE_SCHEMA", "Missing table schema definitions"))?,
        )
        .ok_or_else(|| {
            err(
                "ICEBERG_TABLE_SCHEMA",
                "Table schema definitions must be object",
            )
        })?;
        if let Some(definition) = get(defs, name) {
            return inspect_number_at_schema(node, definition, root_schema, path, diagnostics, ctx);
        }
        return Ok(());
    }
    if let Some(any_of) = fields
        .and_then(|fields| get(fields, "anyOf"))
        .and_then(array)
    {
        if let Some(branch) = choose_schema_branch(node, any_of) {
            return inspect_number_at_schema(node, branch, root_schema, path, diagnostics, ctx);
        }
        return Ok(());
    }
    if let NativeJsonNode::Number(token) = node {
        if fields
            .and_then(|fields| get(fields, "type"))
            .and_then(as_utf16)
            .is_some_and(|v| v == &Utf16::from("integer"))
        {
            let exact = token
                .parse::<i64>()
                .ok()
                .filter(|_| !token.contains('.') && !token.contains('e') && !token.contains('E'));
            let int64 = fields
                .and_then(|fields| get(fields, "format"))
                .and_then(as_utf16)
                .is_some_and(|v| v == &Utf16::from("int64"));
            let bounds = if int64 {
                exact.is_some()
            } else {
                exact.is_some_and(|n| {
                    let min = fields
                        .and_then(|fields| get(fields, "minimum"))
                        .and_then(as_number)
                        .unwrap_or(i32::MIN as f64) as i64;
                    let max = fields
                        .and_then(|fields| get(fields, "maximum"))
                        .and_then(as_number)
                        .unwrap_or(i32::MAX as f64) as i64;
                    n >= min && n <= max
                })
            };
            if !bounds {
                diagnostics.push(Diagnostic {
                    code: Utf16::from("ICEBERG_TABLE_INTEGER"),
                    path: path.clone(),
                    python_source_path: false,
                    message: Utf16::from(if int64 {
                        "Expected exact signed int64 token"
                    } else {
                        "Expected exact bounded integer token"
                    }),
                    severity: Severity::Error,
                    python_text_origin: None,
                });
            }
        }
        return Ok(());
    }
    match node {
        NativeJsonNode::Array(items) => {
            if let Some(item_schema) = fields.and_then(|fields| get(fields, "items")) {
                for (index, item) in items.iter().enumerate() {
                    let child = join_path(path, &index.to_string(), ctx)?;
                    inspect_number_at_schema(
                        item,
                        item_schema,
                        root_schema,
                        &child,
                        diagnostics,
                        ctx,
                    )?;
                }
            }
        }
        NativeJsonNode::Object(members) => {
            let properties = fields
                .and_then(|fields| get(fields, "properties"))
                .and_then(object);
            let additional = fields.and_then(|fields| get(fields, "additionalProperties"));
            for (key, value) in members {
                let known = properties
                    .and_then(|properties| properties.iter().find(|(name, _)| name == key))
                    .map(|(_, schema)| schema);
                let child_path = join_pointer_segment(path, key, ctx)?;
                if known.is_none()
                    && properties.is_some()
                    && additional.and_then(object).is_none()
                    && !path.is_empty()
                {
                    diagnostics.push(Diagnostic {
                        code: Utf16::from("ICEBERG_TABLE_UNKNOWN"),
                        path: child_path.clone(),
                        python_source_path: false,
                        message: Utf16::from(
                            "Unknown native property is preserved without interpretation",
                        ),
                        severity: Severity::Warning,
                        python_text_origin: None,
                    });
                }
                if let Some(child_schema) = known.or(additional) {
                    // `additionalProperties: true` carries no numeric schema;
                    // recursive traversal safely becomes a no-op.
                    inspect_number_at_schema(
                        value,
                        child_schema,
                        root_schema,
                        &child_path,
                        diagnostics,
                        ctx,
                    )?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn choose_schema_branch<'a>(node: &NativeJsonNode, branches: &'a [Value]) -> Option<&'a Value> {
    if let NativeJsonNode::Object(members) = node {
        if let Some(NativeJsonNode::String(tag)) = member(members, "type") {
            for branch in branches {
                let Some(branch_fields) = object(branch) else {
                    continue;
                };
                let Some(properties) = get(branch_fields, "properties").and_then(object) else {
                    continue;
                };
                let Some(expected) = get(properties, "type").and_then(object) else {
                    continue;
                };
                let Some(constant) = get(expected, "const") else {
                    continue;
                };
                if as_utf16(constant) == Some(tag) {
                    return Some(branch);
                }
            }
        }
    }
    let wanted = match node {
        NativeJsonNode::Null => "null",
        NativeJsonNode::Boolean(_) => "boolean",
        NativeJsonNode::String(_) => "string",
        NativeJsonNode::Number(token) => {
            if token.contains('.') || token.contains('e') || token.contains('E') {
                "number"
            } else {
                "integer"
            }
        }
        NativeJsonNode::Array(_) => "array",
        NativeJsonNode::Object(_) => "object",
    };
    branches.iter().find(|branch| {
        object(branch)
            .and_then(|fields| get(fields, "type"))
            .and_then(as_utf16)
            .is_some_and(|ty| ty == &Utf16::from(wanted))
    })
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    if let Value::String(value) = value {
        Some(value)
    } else {
        None
    }
}
fn as_number(value: &Value) -> Option<f64> {
    if let Value::Number(value) = value {
        Some(*value)
    } else {
        None
    }
}
fn join_pointer_segment(
    base: &Utf16,
    segment: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let escaped = segment
        .units()
        .iter()
        .map(|unit| if matches!(*unit, 0x7e | 0x2f) { 2 } else { 1 })
        .sum::<usize>();
    ctx.charge_text(
        base.len().saturating_add(escaped).saturating_add(1),
        base.clone(),
    )?;
    let mut units = base.units().to_vec();
    units.push(b'/' as u16);
    for unit in segment.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            other => units.push(other),
        }
    }
    Ok(Utf16::new(units))
}
fn collect_embedded_schema(
    root: &NativeJsonNode,
    path: &Utf16,
    out: &mut Vec<(Utf16, NativeJsonTree)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let NativeJsonNode::Object(members) = root else {
        return Ok(());
    };
    for name in ["schema", "schemas"] {
        let Some(value) = member(members, name) else {
            continue;
        };
        match value {
            NativeJsonNode::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    ctx.charge_work(1, path.clone())?;
                    let child_path = join_path(path, &format!("{name}/{index}"), ctx)?;
                    let tagged = native_tagged_value(item, ctx)?;
                    out.push((child_path, NativeJsonTree::from_tagged_value(&tagged, ctx)?));
                }
            }
            item => {
                let child_path = join_path(path, name, ctx)?;
                let tagged = native_tagged_value(item, ctx)?;
                out.push((child_path, NativeJsonTree::from_tagged_value(&tagged, ctx)?));
            }
        }
    }
    Ok(())
}
fn native_tagged_value(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let kind = match node {
        NativeJsonNode::Null => "null",
        NativeJsonNode::Boolean(_) => "boolean",
        NativeJsonNode::String(_) => "string",
        NativeJsonNode::Number(_) => "number",
        NativeJsonNode::Array(_) => "array",
        NativeJsonNode::Object(_) => "object",
    };
    let mut fields = vec![(u("kind"), Value::string_utf8(kind))];
    match node {
        NativeJsonNode::Null => {}
        NativeJsonNode::Boolean(value) => fields.push((u("value"), Value::Bool(*value))),
        NativeJsonNode::String(value) => fields.push((u("value"), Value::String(value.clone()))),
        NativeJsonNode::Number(value) => fields.push((u("value"), Value::string_utf8(value))),
        NativeJsonNode::Array(items) => fields.push((
            u("items"),
            Value::Array(
                items
                    .iter()
                    .map(|x| native_tagged_value(x, ctx))
                    .collect::<Result<_, _>>()?,
            ),
        )),
        NativeJsonNode::Object(members) => fields.push((
            u("members"),
            Value::Object(
                members
                    .iter()
                    .map(|(k, v)| Ok((k.clone(), native_tagged_value(v, ctx)?)))
                    .collect::<Result<_, EngineError>>()?,
            ),
        )),
    }
    Ok(Value::Object(fields))
}
fn join_path(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let suffix = Utf16::from(suffix);
    ctx.charge_text(
        base.len().saturating_add(suffix.len()).saturating_add(1),
        base.clone(),
    )?;
    let mut units = base.units().to_vec();
    units.push(b'/' as u16);
    units.extend_from_slice(suffix.units());
    Ok(Utf16::new(units))
}
fn shape_value(
    n: &NativeJsonNode,
    ctx: &mut Context<'_>,
    ord: &mut usize,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match n {
        NativeJsonNode::Null => Value::Null,
        NativeJsonNode::Boolean(x) => Value::Bool(*x),
        NativeJsonNode::String(x) => Value::String(x.clone()),
        NativeJsonNode::Number(_) => {
            let x = *ord;
            *ord = ord.saturating_add(1);
            Value::Number(x as f64)
        }
        NativeJsonNode::Array(a) => Value::Array(
            a.iter()
                .map(|x| shape_value(x, ctx, ord))
                .collect::<Result<_, _>>()?,
        ),
        NativeJsonNode::Object(o) => Value::Object(
            o.iter()
                .map(|(k, v)| Ok((k.clone(), shape_value(v, ctx, ord)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}
fn payload_tree(doc: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let p = find_payload(doc).ok_or_else(|| {
        err(
            "ICEBERG_TABLE_PAYLOAD",
            "Expected pinned Iceberg table payload",
        )
    })?;
    let fields =
        object(p).ok_or_else(|| err("ICEBERG_TABLE_PAYLOAD", "Payload must be an object"))?;
    if get(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(err(
            "ICEBERG_TABLE_PAYLOAD",
            "Expected pinned Iceberg table payload",
        ));
    }
    NativeJsonTree::from_tagged_value(
        get(fields, "root")
            .ok_or_else(|| err("ICEBERG_TABLE_PAYLOAD", "Payload root is missing"))?,
        ctx,
    )
}
fn find_payload(doc: &Value) -> Option<&Value> {
    let ms = array(get(object(doc)?, "modules")?)?;
    for m in ms {
        let mf = object(m)?;
        if get(mf, "id") == Some(&Value::string_utf8("table")) {
            for e in array(get(mf, "elements")?)? {
                let ef = object(e)?;
                if get(ef, "id") == Some(&Value::string_utf8("table")) {
                    if let Some(p) = get(object(get(ef, "extensions")?)?, EXT) {
                        return Some(p);
                    }
                }
            }
        }
    }
    None
}
fn document(id: &Utf16, tagged: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let payload = Value::Object(vec![
        (u("profile"), Value::string_utf8(PROFILE)),
        (u("root"), tagged),
    ]);
    let element = Value::Object(vec![
        (u("id"), Value::string_utf8("table")),
        (u("extensions"), Value::Object(vec![(u(EXT), payload)])),
    ]);
    let module = Value::Object(vec![
        (u("id"), Value::string_utf8("table")),
        (u("namespace"), Value::string_utf8("")),
        (u("elements"), Value::Array(vec![element])),
    ]);
    let value = Value::Object(vec![
        (u("umf"), Value::string_utf8("0.10.0")),
        (u("id"), Value::String(id.clone())),
        (
            u("vocabularies"),
            Value::Object(vec![(
                u(EXT),
                Value::Object(vec![(u("version"), Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (u("modules"), Value::Array(vec![module])),
    ]);
    copy_json(&value, ctx)
}
fn set_root(doc: &mut Value, tagged: Value) -> Result<(), EngineError> {
    let Value::Object(dm) = doc else {
        return Err(err("ICEBERG_TABLE_PAYLOAD", "Document is not object"));
    };
    let modules = field_mut(dm, "modules")
        .and_then(|v| {
            if let Value::Array(x) = v {
                Some(x)
            } else {
                None
            }
        })
        .ok_or_else(|| err("ICEBERG_TABLE_PAYLOAD", "Missing modules"))?;
    for m in modules {
        let Some(mf) = object_mut(m) else { continue };
        if get(mf, "id") == Some(&Value::string_utf8("table")) {
            if let Some(Value::Array(es)) = field_mut(mf, "elements") {
                for e in es {
                    if let Some(ef) = object_mut(e) {
                        if get(ef, "id") == Some(&Value::string_utf8("table")) {
                            if let Some(ext) = field_mut(ef, "extensions").and_then(object_mut) {
                                if let Some(p) = field_mut(ext, EXT).and_then(object_mut) {
                                    if let Some(root) = field_mut(p, "root") {
                                        *root = tagged;
                                        return Ok(());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Err(err("ICEBERG_TABLE_PAYLOAD", "Table payload is missing"))
}
fn exact_i64(n: &NativeJsonNode) -> Option<i64> {
    if let NativeJsonNode::Number(s) = n {
        s.parse::<i64>()
            .ok()
            .filter(|_| !s.contains('.') && !s.contains('e') && !s.contains('E'))
    } else {
        None
    }
}
fn member<'a>(m: &'a [(Utf16, NativeJsonNode)], name: &str) -> Option<&'a NativeJsonNode> {
    m.iter().find(|(k, _)| k == &u(name)).map(|(_, v)| v)
}
fn object(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(x) = v {
        Some(x)
    } else {
        None
    }
}
fn object_mut(v: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    if let Value::Object(x) = v {
        Some(x)
    } else {
        None
    }
}
fn array(v: &Value) -> Option<&[Value]> {
    if let Value::Array(x) = v {
        Some(x)
    } else {
        None
    }
}
fn get<'a>(f: &'a [(Utf16, Value)], name: &str) -> Option<&'a Value> {
    f.iter().find(|(k, _)| k == &u(name)).map(|(_, v)| v)
}
fn field_mut<'a>(f: &'a mut [(Utf16, Value)], name: &str) -> Option<&'a mut Value> {
    f.iter_mut().find(|(k, _)| k == &u(name)).map(|(_, v)| v)
}
fn u(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn diag(code: &str, path: &str, msg: &str, severity: Severity) -> Diagnostic {
    diag_utf16(code, u(path), msg, severity)
}
fn diag_utf16(code: &str, path: Utf16, msg: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: u(code),
        path,
        python_source_path: false,
        message: u(msg),
        severity,
        python_text_origin: None,
    }
}
fn err(code: &str, msg: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), msg)
}
fn validation_error(
    code: &str,
    v: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut units = 2usize;
    for d in &v.diagnostics {
        units = units.saturating_add(d.code.len() + d.path.len() + d.message.len() + 64);
    }
    ctx.charge_text(units, Utf16::default())?;
    let value = Value::Array(
        v.diagnostics
            .iter()
            .map(|d| {
                Value::Object(vec![
                    (u("code"), Value::String(d.code.clone())),
                    (u("path"), Value::String(d.path.clone())),
                    (
                        u("severity"),
                        Value::string_utf8(if d.severity == Severity::Error {
                            "error"
                        } else {
                            "warning"
                        }),
                    ),
                    (u("message"), Value::String(d.message.clone())),
                ])
            })
            .collect(),
    );
    let json = serialization::write_json_value(&value, Format::Json, ctx)?;
    Ok(EngineError::new(code, Utf16::default(), json))
}

#[derive(Clone, Debug)]
pub struct IcebergTableRenameReport {
    pub complete: bool,
    pub previous_schema_id: i64,
    pub next_schema_id: i64,
    pub field_id: i64,
    pub old_name: Utf16,
    pub new_name: Utf16,
    pub appended_schema_path: Utf16,
    pub bindings: IcebergTableTransforms,
    pub limitations: Vec<Utf16>,
}

/// Appends a reviewable current-schema version; it never edits history in place.
pub fn propose_iceberg_table_rename(
    document: &Value,
    field_id: i64,
    new_name: &Utf16,
    next_schema_id: i64,
    resources: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, IcebergTableRenameReport), EngineError> {
    let fail = |message: &str| EngineError::new("ICEBERG_TABLE_RENAME", Utf16::default(), message);
    if !(0..=i32::MAX as i64).contains(&field_id)
        || !(0..=i32::MAX as i64).contains(&next_schema_id)
    {
        return Err(fail(
            "Field and new schema IDs must be nonnegative signed int32 values",
        ));
    }
    if new_name.is_empty() || new_name.len() > 4096 {
        return Err(fail("Name must contain 1–4096 UTF-16 code units"));
    }
    ctx.charge_text(new_name.len(), Utf16::default())?;
    export_iceberg_table(document, resources, ctx)?;
    let context = inspect_iceberg_table_context(document, resources, ctx)?;
    if context.status != Utf16::from("checked") {
        return Err(fail(
            "Current references must resolve before proposing schema evolution",
        ));
    }
    let tree = payload_tree(document, ctx)?;
    let root = tree.root();
    let version = member_as_i64(root, "format-version");
    if !matches!(version, Some(2 | 3)) {
        return Err(fail("Schema-version append currently requires v2 or v3"));
    }
    let schemas = match member_named(root, "schemas") {
        Some(NativeJsonNode::Array(items)) => items,
        _ => return Err(fail("Expected modern schema history")),
    };
    let previous_schema_id = member_as_i64(root, "current-schema-id")
        .ok_or_else(|| fail("Expected current schema ID"))?;
    for (index, schema) in schemas.iter().enumerate() {
        ctx.charge_work(1, Utf16::from("/schemas"))?;
        if member_as_i64(schema, "schema-id") == Some(next_schema_id) {
            return Err(fail("New schema ID already exists"));
        }
        let _ = index;
    }
    let selected_path = context
        .resolved
        .iter()
        .find(|(key, _)| key == &Utf16::from("/current-schema-id"))
        .map(|(_, value)| value.clone())
        .ok_or_else(|| fail("Current schema reference is unresolved"))?;
    let selected_index = selected_path
        .to_utf8()
        .ok()
        .and_then(|path| path.rsplit('/').next()?.parse::<usize>().ok())
        .ok_or_else(|| fail("Resolved current schema path is invalid"))?;
    let original = schemas
        .get(selected_index)
        .ok_or_else(|| fail("Resolved current schema is unavailable"))?;
    let (name_path, old_name) =
        find_rename_target(original, &selected_path, field_id, new_name, ctx)?.ok_or_else(
            || fail("Field ID does not identify a named field in the current schema"),
        )?;
    let mut candidate_schema = tree.subtree_clone(&selected_path, ctx)?;
    let name_json =
        serialization::write_json_value(&Value::String(new_name.clone()), Format::Json, ctx)?;
    let name_tree = NativeJsonTree::parse_json(name_json.units(), ctx)?;
    let relative_name_path = name_path
        .to_utf8()
        .ok()
        .and_then(|path| {
            path.strip_prefix(selected_path.to_utf8().ok()?.as_str())
                .map(str::to_owned)
        })
        .ok_or_else(|| fail("Field name path is outside the selected schema"))?;
    candidate_schema =
        candidate_schema.replace_node(&Utf16::from(relative_name_path), &name_tree, ctx)?;
    let id_tree = NativeJsonTree::parse_json(
        next_schema_id
            .to_string()
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        ctx,
    )?;
    candidate_schema = candidate_schema.replace_node(&Utf16::from("/schema-id"), &id_tree, ctx)?;
    let mut next_root = tree.append_array_item(&Utf16::from("/schemas"), &candidate_schema, ctx)?;
    let current_id_tree = NativeJsonTree::parse_json(
        next_schema_id
            .to_string()
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        ctx,
    )?;
    next_root =
        next_root.replace_node(&Utf16::from("/current-schema-id"), &current_id_tree, ctx)?;
    let candidate = table_document_with_root(document, &next_root, ctx)?;
    let validation = inspect_iceberg_table(&candidate, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("ICEBERG_TABLE_RENAME", &validation, ctx)?);
    }
    let bindings = inspect_iceberg_table_transforms(&candidate, resources, ctx)?;
    let appended_index = schemas.len();
    let limitations = vec![
        Utf16::from("Candidate metadata only: no commit, timestamp advancement, concurrency check or file rewrite"),
        Utf16::from("Unknown/native name-dependent metadata is retained without rewriting; review dependencies before applying"),
        Utf16::from("Historical schemas and field IDs remain unchanged; full evolution and version-feature validity are not established"),
    ];
    Ok((
        candidate,
        IcebergTableRenameReport {
            complete: false,
            previous_schema_id,
            next_schema_id,
            field_id,
            old_name,
            new_name: new_name.clone(),
            appended_schema_path: Utf16::from(format!("/schemas/{appended_index}")),
            bindings,
            limitations,
        },
    ))
}

fn table_document_with_root(
    document: &Value,
    tree: &NativeJsonTree,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut candidate = copy_json(document, ctx)?;
    set_root(&mut candidate, tree.tagged_value_preserving_extras(ctx)?)?;
    Ok(candidate)
}

fn find_rename_target(
    schema: &NativeJsonNode,
    schema_path: &Utf16,
    wanted_id: i64,
    new_name: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<(Utf16, Utf16)>, EngineError> {
    fn walk(
        node: &NativeJsonNode,
        path: &Utf16,
        wanted_id: i64,
        new_name: &Utf16,
        ctx: &mut Context<'_>,
    ) -> Result<Option<(Utf16, Utf16)>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        let Some(tag) = member_named(node, "type").and_then(|tag| {
            if let NativeJsonNode::String(value) = tag {
                Some(value.clone())
            } else {
                None
            }
        }) else {
            return Ok(None);
        };
        match tag.to_utf8().ok().as_deref() {
            Some("struct") => {
                let Some(NativeJsonNode::Array(fields)) = member_named(node, "fields") else {
                    return Ok(None);
                };
                for (index, field) in fields.iter().enumerate() {
                    let field_path = join_path(path, &format!("fields/{index}"), ctx)?;
                    if member_as_i64(field, "id") == Some(wanted_id) {
                        let Some(NativeJsonNode::String(name)) = member_named(field, "name") else {
                            return Ok(None);
                        };
                        if name == new_name {
                            return Err(EngineError::new(
                                "ICEBERG_TABLE_RENAME",
                                field_path,
                                "Rename must change the field name",
                            ));
                        }
                        for (other_index, other) in fields.iter().enumerate() {
                            ctx.charge_work(1, field_path.clone())?;
                            if other_index != index
                                && matches!(member_named(other, "name"), Some(NativeJsonNode::String(s)) if s == new_name)
                            {
                                return Err(EngineError::new(
                                    "ICEBERG_TABLE_RENAME",
                                    field_path,
                                    "A sibling already has that name",
                                ));
                            }
                        }
                        ctx.charge_text(name.len(), field_path.clone())?;
                        return Ok(Some((join_path(&field_path, "name", ctx)?, name.clone())));
                    }
                    if let Some(ty) = member_named(field, "type") {
                        if let Some(found) = walk(
                            ty,
                            &join_path(&field_path, "type", ctx)?,
                            wanted_id,
                            new_name,
                            ctx,
                        )? {
                            return Ok(Some(found));
                        }
                    }
                }
            }
            Some("list") => {
                if let Some(element) = member_named(node, "element") {
                    if let Some(found) = walk(
                        element,
                        &join_path(path, "element", ctx)?,
                        wanted_id,
                        new_name,
                        ctx,
                    )? {
                        return Ok(Some(found));
                    }
                }
            }
            Some("map") => {
                for key in ["key", "value"] {
                    if let Some(ty) = member_named(node, key) {
                        if let Some(found) =
                            walk(ty, &join_path(path, key, ctx)?, wanted_id, new_name, ctx)?
                        {
                            return Ok(Some(found));
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(None)
    }
    walk(schema, schema_path, wanted_id, new_name, ctx)
}

#[derive(Clone, Debug)]
pub struct IcebergTablePromotionReport {
    pub complete: bool,
    pub previous_schema_id: i64,
    pub next_schema_id: i64,
    pub field_id: i64,
    pub source_type: Utf16,
    pub target_type: Utf16,
    pub appended_schema_path: Utf16,
    pub checked_partition_fields: Vec<Utf16>,
    pub bindings: IcebergTableTransforms,
    pub limitations: Vec<Utf16>,
}

/// Builds a versioned schema candidate for the explicitly supported primitive widening rules.
pub fn propose_iceberg_table_promotion(
    document: &Value,
    field_id: i64,
    target_type: &Utf16,
    next_schema_id: i64,
    resources: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, IcebergTablePromotionReport), EngineError> {
    let fail =
        |message: &str| EngineError::new("ICEBERG_TABLE_PROMOTION", Utf16::default(), message);
    if !(0..=i32::MAX as i64).contains(&field_id)
        || !(0..=i32::MAX as i64).contains(&next_schema_id)
    {
        return Err(fail(
            "Field and new schema IDs must be nonnegative signed int32 values",
        ));
    }
    if target_type.len() > 4096 {
        return Err(fail(
            "Target type must be bounded to 4096 UTF-16 code units",
        ));
    }
    ctx.charge_text(target_type.len(), Utf16::default())?;
    export_iceberg_table(document, resources, ctx)?;
    let context = inspect_iceberg_table_context(document, resources, ctx)?;
    if context.status != Utf16::from("checked") {
        return Err(fail(
            "Current references must resolve before proposing schema evolution",
        ));
    }
    let tree = payload_tree(document, ctx)?;
    let root = tree.root();
    if !matches!(member_as_i64(root, "format-version"), Some(2 | 3)) {
        return Err(fail(
            "Versioned promotion candidate currently requires v2 or v3",
        ));
    }
    let schemas = match member_named(root, "schemas") {
        Some(NativeJsonNode::Array(items)) => items,
        _ => return Err(fail("Expected modern schema history")),
    };
    let previous_schema_id = member_as_i64(root, "current-schema-id")
        .ok_or_else(|| fail("Expected current schema ID"))?;
    for schema in schemas {
        ctx.charge_work(1, Utf16::from("/schemas"))?;
        if member_as_i64(schema, "schema-id") == Some(next_schema_id) {
            return Err(fail("New schema ID already exists"));
        }
    }
    let selected_path = context
        .resolved
        .iter()
        .find(|(key, _)| key == &Utf16::from("/current-schema-id"))
        .map(|(_, value)| value.clone())
        .ok_or_else(|| fail("Current schema reference is unresolved"))?;
    let selected_index = selected_path
        .to_utf8()
        .ok()
        .and_then(|path| path.rsplit('/').next()?.parse::<usize>().ok())
        .ok_or_else(|| fail("Resolved current schema path is invalid"))?;
    let selected_schema = schemas
        .get(selected_index)
        .ok_or_else(|| fail("Resolved current schema is unavailable"))?;
    let target = find_promotion_target(selected_schema, &selected_path, field_id, false, ctx)?
        .ok_or_else(|| {
            fail("Target must identify a named primitive field in the current schema")
        })?;
    let source_type = match target.source_type {
        NativeJsonNode::String(value) => value,
        _ => return Err(fail("Only named primitive type fields can be promoted")),
    };
    if !allowed_promotion(&source_type, target_type) {
        return Err(fail("Only int-to-long, float-to-double and same-scale decimal precision widening are implemented"));
    }
    let mut checked_partition_fields = Vec::new();
    check_partition_dependencies(
        root,
        field_id,
        &source_type,
        target_type,
        &mut checked_partition_fields,
        ctx,
    )?;
    let mut candidate_schema = tree.subtree_clone(&selected_path, ctx)?;
    let replacement =
        serialization::write_json_value(&Value::String(target_type.clone()), Format::Json, ctx)?;
    let replacement_tree = NativeJsonTree::parse_json(replacement.units(), ctx)?;
    let selected_path_utf8 = selected_path
        .to_utf8()
        .map_err(|_| fail("Resolved current schema path is not UTF-8"))?;
    let target_path_utf8 = target
        .type_path
        .to_utf8()
        .map_err(|_| fail("Target type path is not UTF-8"))?;
    let relative_type_path = target_path_utf8
        .strip_prefix(selected_path_utf8.as_str())
        .ok_or_else(|| fail("Target type path is outside the selected schema"))?;
    candidate_schema =
        candidate_schema.replace_node(&Utf16::from(relative_type_path), &replacement_tree, ctx)?;
    let id_tree = NativeJsonTree::parse_json(
        next_schema_id
            .to_string()
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        ctx,
    )?;
    candidate_schema = candidate_schema.replace_node(&Utf16::from("/schema-id"), &id_tree, ctx)?;
    let mut next_root = tree.append_array_item(&Utf16::from("/schemas"), &candidate_schema, ctx)?;
    next_root = next_root.replace_node(&Utf16::from("/current-schema-id"), &id_tree, ctx)?;
    let candidate = table_document_with_root(document, &next_root, ctx)?;
    let validation = inspect_iceberg_table(&candidate, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error(
            "ICEBERG_TABLE_PROMOTION",
            &validation,
            ctx,
        )?);
    }
    let bindings = inspect_iceberg_table_transforms(&candidate, resources, ctx)?;
    let appended_index = schemas.len();
    Ok((candidate, IcebergTablePromotionReport {
        complete: false,
        previous_schema_id,
        next_schema_id,
        field_id,
        source_type,
        target_type: target_type.clone(),
        appended_schema_path: Utf16::from(format!("/schemas/{appended_index}")),
        checked_partition_fields,
        bindings,
        limitations: vec![
            Utf16::from("Metadata candidate only; no commit, concurrency check, timestamp update or file rewrite"),
            Utf16::from("Historical bounds retain their original lexical form; reader decoding and value execution are not verified"),
            Utf16::from("Unknown type-dependent metadata is preserved and requires review; broader v3 type promotions are not implemented"),
        ],
    }))
}

struct PromotionTarget {
    type_path: Utf16,
    source_type: NativeJsonNode,
}
fn find_promotion_target(
    schema: &NativeJsonNode,
    schema_path: &Utf16,
    wanted_id: i64,
    in_map_key: bool,
    ctx: &mut Context<'_>,
) -> Result<Option<PromotionTarget>, EngineError> {
    fn walk(
        node: &NativeJsonNode,
        path: &Utf16,
        wanted_id: i64,
        in_map_key: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Option<PromotionTarget>, EngineError> {
        ctx.charge_work(1, path.clone())?;
        let tag = member_named(node, "type").and_then(|value| {
            if let NativeJsonNode::String(value) = value {
                value.to_utf8().ok()
            } else {
                None
            }
        });
        match tag.as_deref() {
            Some("struct") => {
                let Some(NativeJsonNode::Array(fields)) = member_named(node, "fields") else {
                    return Ok(None);
                };
                for (index, field) in fields.iter().enumerate() {
                    let field_path = join_path(path, &format!("fields/{index}"), ctx)?;
                    if member_as_i64(field, "id") == Some(wanted_id) {
                        if in_map_key {
                            return Err(EngineError::new(
                                "ICEBERG_TABLE_PROMOTION",
                                field_path,
                                "Map key evolution is outside the candidate profile",
                            ));
                        }
                        let Some(type_node) = member_named(field, "type") else {
                            return Ok(None);
                        };
                        let type_path = join_path(&field_path, "type", ctx)?;
                        if !matches!(type_node, NativeJsonNode::String(_)) {
                            return Err(EngineError::new(
                                "ICEBERG_TABLE_PROMOTION",
                                type_path,
                                "Only named primitive fields can be promoted",
                            ));
                        }
                        if let NativeJsonNode::String(value) = type_node {
                            ctx.charge_text(value.len(), type_path.clone())?;
                        }
                        return Ok(Some(PromotionTarget {
                            type_path,
                            source_type: type_node.clone(),
                        }));
                    }
                    if let Some(type_node) = member_named(field, "type") {
                        if let Some(found) = walk(
                            type_node,
                            &join_path(&field_path, "type", ctx)?,
                            wanted_id,
                            in_map_key,
                            ctx,
                        )? {
                            return Ok(Some(found));
                        }
                    }
                }
            }
            Some("list") => {
                if let Some(element) = member_named(node, "element") {
                    if let Some(found) = walk(
                        element,
                        &join_path(path, "element", ctx)?,
                        wanted_id,
                        in_map_key,
                        ctx,
                    )? {
                        return Ok(Some(found));
                    }
                }
            }
            Some("map") => {
                for (key, child_key) in [("key", true), ("value", in_map_key)] {
                    if let Some(child) = member_named(node, key) {
                        if let Some(found) = walk(
                            child,
                            &join_path(path, key, ctx)?,
                            wanted_id,
                            child_key,
                            ctx,
                        )? {
                            return Ok(Some(found));
                        }
                    }
                }
            }
            _ => {}
        }
        Ok(None)
    }
    walk(schema, schema_path, wanted_id, in_map_key, ctx)
}
fn allowed_promotion(source: &Utf16, target: &Utf16) -> bool {
    let (Ok(source), Ok(target)) = (source.to_utf8(), target.to_utf8()) else {
        return false;
    };
    if matches!(
        (source.as_str(), target.as_str()),
        ("int", "long") | ("float", "double")
    ) {
        return true;
    }
    fn decimal(value: &str) -> Option<(u32, u32)> {
        let value = value.strip_prefix("decimal(")?.strip_suffix(')')?;
        let (precision, scale) = value.split_once(',')?;
        Some((precision.trim().parse().ok()?, scale.trim().parse().ok()?))
    }
    matches!((decimal(&source), decimal(&target)), (Some((old_p, old_s)), Some((new_p, new_s))) if new_p > old_p && new_p <= 38 && old_s == new_s)
}
fn check_partition_dependencies(
    root: &NativeJsonNode,
    field_id: i64,
    source_type: &Utf16,
    target_type: &Utf16,
    checked: &mut Vec<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    fn inspect_fields(
        fields: &NativeJsonNode,
        base: &Utf16,
        field_id: i64,
        source_type: &Utf16,
        target_type: &Utf16,
        checked: &mut Vec<Utf16>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        let NativeJsonNode::Array(fields) = fields else {
            return Ok(());
        };
        for (index, partition_field) in fields.iter().enumerate() {
            let path = join_path(base, &index.to_string(), ctx)?;
            if member_named(partition_field, "source-ids").is_some() {
                if let Some(NativeJsonNode::Array(ids)) =
                    member_named(partition_field, "source-ids")
                {
                    if ids.iter().any(|id| exact_i64(id) == Some(field_id)) {
                        return Err(EngineError::new(
                            "ICEBERG_TABLE_PROMOTION",
                            path,
                            "Dependent multi-source partition transform semantics are not verified",
                        ));
                    }
                }
            }
            if member_as_i64(partition_field, "source-id") != Some(field_id) {
                continue;
            }
            let Some(NativeJsonNode::String(transform)) =
                member_named(partition_field, "transform")
            else {
                return Err(EngineError::new(
                    "ICEBERG_TABLE_PROMOTION",
                    path,
                    "Unknown dependent transform",
                ));
            };
            let before = inspect_iceberg_transform_type(source_type, transform, ctx)?;
            let after = inspect_iceberg_transform_type(target_type, transform, ctx)?;
            if before.status != Utf16::from("compatible")
                || after.status != Utf16::from("compatible")
            {
                return Err(EngineError::new(
                    "ICEBERG_TABLE_PROMOTION",
                    path,
                    "Dependent partition transform is incompatible or uninterpreted",
                ));
            }
            ctx.charge_work(1, path.clone())?;
            checked.push(path);
        }
        Ok(())
    }
    if let Some(fields) = member_named(root, "partition-spec") {
        inspect_fields(
            fields,
            &Utf16::from("/partition-spec"),
            field_id,
            source_type,
            target_type,
            checked,
            ctx,
        )?;
    }
    if let Some(NativeJsonNode::Array(specs)) = member_named(root, "partition-specs") {
        for (index, spec) in specs.iter().enumerate() {
            if let Some(fields) = member_named(spec, "fields") {
                inspect_fields(
                    fields,
                    &Utf16::from(format!("/partition-specs/{index}/fields")),
                    field_id,
                    source_type,
                    target_type,
                    checked,
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}

/// Current references only. Historical references and commit safety remain outside this view.
#[derive(Clone, Debug)]
pub struct IcebergTableContext {
    pub status: Utf16,
    pub complete: bool,
    pub scope: Utf16,
    pub resolved: Vec<(Utf16, Utf16)>,
    pub diagnostics: Vec<Diagnostic>,
}
pub fn inspect_iceberg_table_context(
    document: &Value,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<IcebergTableContext, EngineError> {
    let validation = inspect_iceberg_table(document, r, ctx)?;
    if !validation.valid {
        return Err(validation_error(
            "ICEBERG_TABLE_DOCUMENT",
            &validation,
            ctx,
        )?);
    }
    let tree = payload_tree(document, ctx)?;
    let root = tree.root();
    let mut diagnostics = Vec::new();
    let mut resolved = Vec::new();
    let Some(version) = member_as_i64(root, "format-version") else {
        diagnostics.push(diag(
            "ICEBERG_TABLE_REFERENCE",
            "/format-version",
            "Unknown format: current-reference interpretation unavailable",
            Severity::Error,
        ));
        return Ok(context_result(diagnostics, resolved));
    };
    if !(1..=3).contains(&version) {
        diagnostics.push(diag(
            "ICEBERG_TABLE_REFERENCE",
            "/format-version",
            "Unknown format: current-reference interpretation unavailable",
            Severity::Error,
        ));
        return Ok(context_result(diagnostics, resolved));
    }
    let schemas = index_entries(root, "schemas", "schema-id", ctx, &mut diagnostics)?;
    let specs = index_entries(root, "partition-specs", "spec-id", ctx, &mut diagnostics)?;
    let orders = index_entries(root, "sort-orders", "order-id", ctx, &mut diagnostics)?;
    let snapshots = index_entries(root, "snapshots", "snapshot-id", ctx, &mut diagnostics)?;
    for (key, collection, map, legacy) in [
        ("current-schema-id", "schemas", &schemas, Some("schema")),
        (
            "default-spec-id",
            "partition-specs",
            &specs,
            Some("partition-spec"),
        ),
        ("default-sort-order-id", "sort-orders", &orders, None),
    ] {
        let selection = member_named(root, key);
        if let Some(value) = selection {
            resolve_reference(
                value,
                &Utf16::from(format!("/{key}")),
                map,
                &mut resolved,
                &mut diagnostics,
            );
        } else if version == 1
            && legacy.is_some_and(|legacy| member_named(root, legacy).is_some())
            && member_named(root, collection).is_none()
        {
            resolved.push((
                Utf16::from(format!("/{key}")),
                Utf16::from(format!("/{}", legacy.unwrap())),
            ));
        } else if version == 1
            && key == "default-sort-order-id"
            && member_named(root, collection).is_none()
        {
            diagnostics.push(diag(
                "ICEBERG_TABLE_IMPLICIT",
                "/default-sort-order-id",
                "Legacy unsorted default is implicit; source remains absent",
                Severity::Warning,
            ));
        } else {
            diagnostics.push(diag(
                "ICEBERG_TABLE_REFERENCE",
                &format!("/{key}"),
                "Selection missing or ambiguous; no default inserted",
                Severity::Error,
            ));
        }
    }
    let current = member_named(root, "current-snapshot-id");
    let current_id = current.and_then(native_integer_string);
    let has_current = current_id.as_deref().is_some_and(|id| id != "-1");
    if has_current {
        if let Some(value) = current {
            resolve_reference(
                value,
                &Utf16::from("/current-snapshot-id"),
                &snapshots,
                &mut resolved,
                &mut diagnostics,
            );
        }
    }
    if let Some(NativeJsonNode::Object(refs)) = member_named(root, "refs") {
        for (name, ref_node) in refs {
            ctx.charge_work(1, Utf16::default())?;
            let at = join_pointer_segment(&Utf16::from("/refs"), name, ctx)?;
            let target = member_named(ref_node, "snapshot-id");
            let snapshot_path = join_pointer_segment(&at, &Utf16::from("snapshot-id"), ctx)?;
            if let Some(target) = target {
                resolve_reference(
                    target,
                    &snapshot_path,
                    &snapshots,
                    &mut resolved,
                    &mut diagnostics,
                );
            } else {
                diagnostics.push(Diagnostic {
                    code: Utf16::from("ICEBERG_TABLE_REFERENCE"),
                    path: snapshot_path.clone(),
                    python_source_path: false,
                    message: Utf16::from("No unique retained target for missing ID"),
                    severity: Severity::Error,
                    python_text_origin: None,
                });
            }
            if name == &Utf16::from("main") {
                if !has_current || target.and_then(native_integer_string) != current_id {
                    diagnostics.push(Diagnostic {
                        code: Utf16::from("ICEBERG_TABLE_REFERENCE"),
                        path: snapshot_path,
                        python_source_path: false,
                        message: Utf16::from("Main reference must equal the current snapshot ID"),
                        severity: Severity::Error,
                        python_text_origin: None,
                    });
                }
                if member_named(ref_node, "type")
                    != Some(&NativeJsonNode::String(Utf16::from("branch")))
                {
                    let type_path = join_pointer_segment(&at, &Utf16::from("type"), ctx)?;
                    diagnostics.push(Diagnostic {
                        code: Utf16::from("ICEBERG_TABLE_REFERENCE"),
                        path: type_path,
                        python_source_path: false,
                        message: Utf16::from("Main reference must be a branch"),
                        severity: Severity::Error,
                        python_text_origin: None,
                    });
                }
            }
        }
    }
    diagnostics.push(diag("ICEBERG_TABLE_CONTEXT_INCOMPLETE","","Only retained IDs and current selections checked. Expired parents, historical schemas, transforms, files and commits are not validated; absent main is not inserted.",Severity::Warning));
    Ok(context_result(diagnostics, resolved))
}
fn context_result(
    diagnostics: Vec<Diagnostic>,
    resolved: Vec<(Utf16, Utf16)>,
) -> IcebergTableContext {
    let status = if diagnostics.iter().any(|d| d.severity == Severity::Error) {
        "blocked"
    } else {
        "checked"
    };
    IcebergTableContext {
        status: Utf16::from(status),
        complete: false,
        scope: Utf16::from("iceberg-v1-v3-current-references"),
        resolved,
        diagnostics,
    }
}
fn member_as_i64(root: &NativeJsonNode, name: &str) -> Option<i64> {
    member_named(root, name).and_then(exact_i64)
}
fn member_named<'a>(node: &'a NativeJsonNode, name: &str) -> Option<&'a NativeJsonNode> {
    if let NativeJsonNode::Object(m) = node {
        member(m, name)
    } else {
        None
    }
}
fn native_integer_string(node: &NativeJsonNode) -> Option<String> {
    exact_i64(node).map(|x| x.to_string())
}
fn index_entries(
    root: &NativeJsonNode,
    array_name: &str,
    id_name: &str,
    ctx: &mut Context<'_>,
    ds: &mut Vec<Diagnostic>,
) -> Result<std::collections::BTreeMap<String, Option<Utf16>>, EngineError> {
    let mut result = std::collections::BTreeMap::new();
    if let Some(NativeJsonNode::Array(items)) = member_named(root, array_name) {
        ctx.charge_work(items.len(), Utf16::default())?;
        for (i, item) in items.iter().enumerate() {
            let path = format!("/{array_name}/{i}");
            let id = member_named(item, id_name).and_then(native_integer_string);
            match id {
                None => ds.push(diag(
                    "ICEBERG_TABLE_REFERENCE",
                    &format!("{path}/{id_name}"),
                    "Retained entry has no explicit identity",
                    Severity::Error,
                )),
                Some(id) => {
                    ctx.charge_work(1, Utf16::default())?;
                    if result.contains_key(&id) {
                        ds.push(diag(
                            "ICEBERG_TABLE_REFERENCE",
                            &format!("{path}/{id_name}"),
                            &format!("Duplicate retained identity {id}"),
                            Severity::Error,
                        ));
                        result.insert(id, None);
                    } else {
                        result.insert(id, Some(Utf16::from(path)));
                    }
                }
            }
        }
    }
    Ok(result)
}
fn resolve_reference(
    node: &NativeJsonNode,
    path: &Utf16,
    index: &std::collections::BTreeMap<String, Option<Utf16>>,
    resolved: &mut Vec<(Utf16, Utf16)>,
    ds: &mut Vec<Diagnostic>,
) {
    let id = native_integer_string(node);
    let target = id
        .as_ref()
        .and_then(|id| index.get(id))
        .and_then(|path| path.as_ref());
    if let Some(target) = target {
        resolved.push((path.clone(), target.clone()));
    } else {
        let message = format!(
            "No unique retained target for {}",
            id.as_deref().unwrap_or("missing ID")
        );
        ds.push(Diagnostic {
            code: Utf16::from("ICEBERG_TABLE_REFERENCE"),
            path: path.clone(),
            python_source_path: false,
            message: Utf16::from(message.as_str()),
            severity: Severity::Error,
            python_text_origin: None,
        });
    }
}

#[derive(Clone, Debug)]
pub struct IcebergTransformType {
    pub source_type: Utf16,
    pub transform: Utf16,
    pub status: Utf16,
    pub result_type: Option<Utf16>,
    pub complete: bool,
    pub reason: Utf16,
}
#[derive(Clone, Debug)]
pub struct IcebergTableTransformBinding {
    pub field_path: Utf16,
    pub source_path: Utf16,
    pub assessment: IcebergTransformType,
}
#[derive(Clone, Debug)]
pub struct IcebergTableTransforms {
    pub status: Utf16,
    pub complete: bool,
    pub bindings: Vec<IcebergTableTransformBinding>,
    pub diagnostics: Vec<Diagnostic>,
}
fn bounded_ascii(value: &Utf16) -> Option<String> {
    value.to_utf8().ok().filter(|s| s.is_ascii())
}
pub fn inspect_iceberg_transform_type(
    source_type: &Utf16,
    transform: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<IcebergTransformType, EngineError> {
    ctx.charge_text(
        source_type.len().saturating_add(transform.len()),
        Utf16::default(),
    )?;
    let source = bounded_ascii(source_type);
    let transform_text = bounded_ascii(transform);
    let result = |status: &str, reason: &str, result_type: Option<Utf16>| IcebergTransformType {
        source_type: source_type.clone(),
        transform: transform.clone(),
        status: Utf16::from(status),
        result_type,
        complete: false,
        reason: Utf16::from(reason),
    };
    if source_type.len() > 4096 || transform.len() > 4096 {
        return Ok(result(
            "uninterpreted",
            "Type or transform exceeds the 4096-character inspection bound",
            None,
        ));
    }
    let (Some(source), Some(transform_text)) = (source, transform_text) else {
        return Ok(result(
            "uninterpreted",
            "Non-ASCII type or transform spelling is outside the interpreted profile",
            None,
        ));
    };
    let decimal = parse_decimal_type(&source);
    let fixed = parse_fixed_type(&source);
    let mut base = source.as_str();
    if let Some((p, s)) = decimal {
        if p == 0 || p > 38 || s > p {
            return Ok(result(
                "incompatible",
                "Invalid decimal precision/scale",
                None,
            ));
        }
        base = "decimal";
    } else if let Some(size) = fixed {
        if size == 0 || size > i32::MAX as u64 {
            return Ok(result("incompatible", "Invalid fixed length", None));
        }
        base = "fixed";
    } else if ![
        "boolean",
        "int",
        "long",
        "float",
        "double",
        "date",
        "time",
        "timestamp",
        "timestamptz",
        "timestamp_ns",
        "timestamptz_ns",
        "string",
        "uuid",
        "binary",
        "variant",
        "unknown",
    ]
    .contains(&base)
    {
        return Ok(result(
            "uninterpreted",
            "Source type is outside the interpreted primitive profile",
            None,
        ));
    }
    if base == "unknown" {
        return Ok(result(
            "uninterpreted",
            "Unknown source type has no established transform semantics",
            None,
        ));
    }
    let mut name = transform_text.as_str();
    if let Some(n) =
        parameter(&transform_text, "bucket").or_else(|| parameter(&transform_text, "truncate"))
    {
        if n == 0 || n > i32::MAX as u64 {
            return Ok(result(
                "incompatible",
                "Transform parameter must be a positive signed int32",
                None,
            ));
        }
        name = if transform_text.starts_with("bucket[") {
            "bucket"
        } else {
            "truncate"
        };
    } else if !["identity", "void", "year", "month", "day", "hour"].contains(&name) {
        return Ok(result(
            "uninterpreted",
            "Unknown transform preserved; no write compatibility claim",
            None,
        ));
    }
    let timestamps = ["timestamp", "timestamptz", "timestamp_ns", "timestamptz_ns"];
    let allowed = name == "void"
        || (name == "identity" && base != "variant")
        || (name == "bucket"
            && [
                "int", "long", "decimal", "date", "time", "string", "uuid", "fixed", "binary",
            ]
            .contains(&base)
            || name == "bucket" && timestamps.contains(&base))
        || (name == "truncate" && ["int", "long", "decimal", "string", "binary"].contains(&base))
        || (["year", "month", "day"].contains(&name)
            && (["date"].contains(&base) || timestamps.contains(&base)))
        || (name == "hour" && timestamps.contains(&base));
    if !allowed {
        return Ok(result(
            "incompatible",
            "Transform does not accept this source type in the pinned specification",
            None,
        ));
    }
    let result_type = if ["identity", "truncate", "void"].contains(&name) {
        Some(source_type.clone())
    } else {
        Some(Utf16::from("int"))
    };
    Ok(result("compatible","Single primitive source type rule only; values, table version and field context remain unchecked",result_type))
}
fn parameter(value: &str, name: &str) -> Option<u64> {
    let inner = value
        .strip_prefix(name)?
        .strip_prefix('[')?
        .strip_suffix(']')?;
    if inner.is_empty() || !inner.bytes().all(|x| x.is_ascii_digit()) {
        return None;
    }
    inner.parse().ok()
}
fn parse_decimal_type(value: &str) -> Option<(u64, u64)> {
    let rest = value.strip_prefix("decimal(")?.strip_suffix(')')?;
    let (a, b) = rest.split_once(',')?;
    let p = a.trim().parse().ok()?;
    let s = b.trim().parse().ok()?;
    Some((p, s))
}
fn parse_fixed_type(value: &str) -> Option<u64> {
    value
        .strip_prefix("fixed[")?
        .strip_suffix(']')?
        .parse()
        .ok()
}

pub fn inspect_iceberg_table_transforms(
    document: &Value,
    r: &IcebergTableResources,
    ctx: &mut Context<'_>,
) -> Result<IcebergTableTransforms, EngineError> {
    let context = inspect_iceberg_table_context(document, r, ctx)?;
    let tree = payload_tree(document, ctx)?;
    let blocked = context.status == Utf16::from("blocked");
    let resolved = context.resolved;
    let mut diagnostics = context.diagnostics;
    let mut bindings = Vec::new();
    let make = |diagnostics: Vec<Diagnostic>, bindings: Vec<IcebergTableTransformBinding>| {
        IcebergTableTransforms {
            status: Utf16::from(
                if diagnostics.iter().any(|d| d.severity == Severity::Error) {
                    "blocked"
                } else {
                    "checked"
                },
            ),
            complete: false,
            bindings,
            diagnostics,
        }
    };
    if blocked {
        return Ok(make(diagnostics, bindings));
    }
    let Some(schema_path) = resolved_value(&resolved, "/current-schema-id") else {
        diagnostics.push(diag(
            "ICEBERG_TABLE_TRANSFORM",
            "/current-schema-id",
            "No current schema available",
            Severity::Error,
        ));
        return Ok(make(diagnostics, bindings));
    };
    let Some(schema) = node_at(tree.root(), &schema_path, ctx)? else {
        diagnostics.push(diag(
            "ICEBERG_TABLE_TRANSFORM",
            "/current-schema-id",
            "Resolved schema path is unavailable",
            Severity::Error,
        ));
        return Ok(make(diagnostics, bindings));
    };
    let mut fields = std::collections::BTreeMap::<String, (Utf16, Utf16, bool)>::new();
    collect_schema_fields(schema, &schema_path, false, &mut fields, ctx)?;
    for (selection, kind) in [
        ("/default-spec-id", "partition"),
        ("/default-sort-order-id", "sort"),
    ] {
        let Some(selected) = resolved_value(&resolved, selection) else {
            continue;
        };
        let Some(spec) = node_at(tree.root(), &selected, ctx)? else {
            diagnostics.push(diag_utf16(
                "ICEBERG_TABLE_TRANSFORM",
                selected.clone(),
                "Resolved selection path is unavailable",
                Severity::Error,
            ));
            continue;
        };
        let field_nodes = if let NativeJsonNode::Array(a) = spec {
            Some(a.as_slice())
        } else {
            match member_named(spec, "fields") {
                Some(NativeJsonNode::Array(a)) => Some(a.as_slice()),
                _ => None,
            }
        };
        let Some(field_nodes) = field_nodes else {
            continue;
        };
        if kind == "sort"
            && member_named(spec, "order-id")
                .and_then(native_integer_string)
                .as_deref()
                == Some("0")
            && !field_nodes.is_empty()
        {
            diagnostics.push(diag_utf16(
                "ICEBERG_TABLE_TRANSFORM",
                selected.clone(),
                "Order zero must be unsorted",
                Severity::Error,
            ));
        }
        let field_base = if matches!(spec, NativeJsonNode::Array(_)) {
            selected.clone()
        } else {
            join_path(&selected, "fields", ctx)?
        };
        let mut ids = BTreeSet::new();
        let mut names = BTreeSet::new();
        for (index, field) in field_nodes.iter().enumerate() {
            ctx.charge_work(1, field_base.clone())?;
            let path = join_path(&field_base, &index.to_string(), ctx)?;
            if kind == "sort" {
                if !matches!(member_named(field,"direction"),Some(NativeJsonNode::String(v)) if v==&Utf16::from("asc")||v==&Utf16::from("desc"))
                {
                    diagnostics.push(diag_utf16(
                        "ICEBERG_TABLE_TRANSFORM",
                        path.clone(),
                        "Unknown sort direction",
                        Severity::Error,
                    ));
                }
                if !matches!(member_named(field,"null-order"),Some(NativeJsonNode::String(v)) if v==&Utf16::from("nulls-first")||v==&Utf16::from("nulls-last"))
                {
                    diagnostics.push(diag_utf16(
                        "ICEBERG_TABLE_TRANSFORM",
                        path.clone(),
                        "Unknown null ordering",
                        Severity::Error,
                    ));
                }
            } else {
                if let Some(id) = member_named(field, "field-id").and_then(native_integer_string) {
                    if !ids.insert(id) {
                        diagnostics.push(diag_utf16(
                            "ICEBERG_TABLE_TRANSFORM",
                            path.clone(),
                            "Duplicate partition field ID",
                            Severity::Error,
                        ));
                    }
                }
                if let Some(NativeJsonNode::String(name)) = member_named(field, "name") {
                    ctx.charge_work(name.len(), path.clone())?;
                    if !names.insert(name.clone()) {
                        diagnostics.push(diag_utf16(
                            "ICEBERG_TABLE_TRANSFORM",
                            path.clone(),
                            "Duplicate partition field name",
                            Severity::Error,
                        ));
                    }
                }
            }
            if member_named(field, "source-ids").is_some() {
                diagnostics.push(diag_utf16(
                    "ICEBERG_TABLE_TRANSFORM",
                    path.clone(),
                    "Multi-source transform preserved; binding semantics unavailable",
                    Severity::Error,
                ));
                continue;
            }
            let source_id = member_named(field, "source-id").and_then(native_integer_string);
            let Some((source_path, source_type, collection)) =
                source_id.as_ref().and_then(|id| fields.get(id)).cloned()
            else {
                diagnostics.push(diag_utf16(
                    "ICEBERG_TABLE_TRANSFORM",
                    path.clone(),
                    "Source field is not in the current schema",
                    Severity::Error,
                ));
                continue;
            };
            let Some(NativeJsonNode::String(transform)) = member_named(field, "transform") else {
                diagnostics.push(diag_utf16(
                    "ICEBERG_TABLE_TRANSFORM",
                    path.clone(),
                    "Unknown transform spelling",
                    Severity::Error,
                ));
                continue;
            };
            let assessment = inspect_iceberg_transform_type(&source_type, transform, ctx)?;
            if collection || assessment.status != Utf16::from("compatible") {
                diagnostics.push(diag_utf16(
                    "ICEBERG_TABLE_TRANSFORM",
                    path.clone(),
                    if collection {
                        "Source must be an interpreted scalar field outside collections"
                    } else {
                        "Transform is incompatible or uninterpreted"
                    },
                    Severity::Error,
                ));
            }
            bindings.push(IcebergTableTransformBinding {
                field_path: path,
                source_path,
                assessment,
            });
        }
    }
    diagnostics.push(diag("ICEBERG_TABLE_TRANSFORM_INCOMPLETE","","Current field/type binding only; version feature availability, history, value execution and safe evolution remain unchecked",Severity::Warning));
    Ok(make(diagnostics, bindings))
}
fn resolved_value(resolved: &[(Utf16, Utf16)], key: &str) -> Option<Utf16> {
    resolved
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v.clone())
}
fn node_at<'a>(
    root: &'a NativeJsonNode,
    path: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a NativeJsonNode>, EngineError> {
    let parts = crate::native_json::native_pointer(path, ctx)?;
    let mut node = root;
    for part in parts {
        match node {
            NativeJsonNode::Object(m) => {
                ctx.charge_work(m.len(), path.clone())?;
                let Some((_, next)) = m.iter().find(|(k, _)| k == &part) else {
                    return Ok(None);
                };
                node = next;
            }
            NativeJsonNode::Array(a) => {
                let Some(i) = part.to_utf8().ok().and_then(|x| x.parse::<usize>().ok()) else {
                    return Ok(None);
                };
                let Some(next) = a.get(i) else {
                    return Ok(None);
                };
                node = next;
            }
            _ => return Ok(None),
        }
    }
    Ok(Some(node))
}
fn collect_schema_fields(
    node: &NativeJsonNode,
    path: &Utf16,
    collection: bool,
    fields: &mut std::collections::BTreeMap<String, (Utf16, Utf16, bool)>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(NativeJsonNode::String(tag)) = member_named(node, "type") else {
        return Ok(());
    };
    match tag.to_utf8().ok().as_deref() {
        Some("struct") => {
            if let Some(NativeJsonNode::Array(items)) = member_named(node, "fields") {
                for (index, field) in items.iter().enumerate() {
                    ctx.charge_work(1, path.clone())?;
                    let field_path = join_path(path, &format!("fields/{index}"), ctx)?;
                    if let (Some(id), Some(ty)) = (
                        member_named(field, "id").and_then(native_integer_string),
                        member_named(field, "type"),
                    ) {
                        if fields.contains_key(&id) {
                            return Err(err(
                                "ICEBERG_TABLE_TRANSFORM",
                                "Duplicate field ID in current schema",
                            ));
                        }
                        if let NativeJsonNode::String(t) = ty {
                            fields.insert(id, (field_path.clone(), t.clone(), collection));
                        }
                        collect_schema_fields(
                            ty,
                            &join_path(&field_path, "type", ctx)?,
                            collection,
                            fields,
                            ctx,
                        )?;
                    }
                }
            }
        }
        Some("list") => {
            if let Some(element) = member_named(node, "element") {
                collect_schema_fields(
                    element,
                    &join_path(path, "element", ctx)?,
                    true,
                    fields,
                    ctx,
                )?;
            }
        }
        Some("map") => {
            for key in ["key", "value"] {
                if let Some(child) = member_named(node, key) {
                    collect_schema_fields(child, &join_path(path, key, ctx)?, true, fields, ctx)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}
