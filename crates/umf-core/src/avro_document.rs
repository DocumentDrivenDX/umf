// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro schema document preservation operations.
//!
//! This module preserves Avro 1.12 schema JSON as an exact tagged native tree.
//! It does not validate Avro semantics or implement datum, IDL, protocol, or
//! object-container operations.

use crate::{
    avro_fields::{AvroDependency, AvroFieldMetadata, derive_avro_fields},
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    native_json::NativeJsonTree,
    registry::Registry,
    serialization::{self, Format},
    value::{Utf16, Value, copy_json},
};

pub const AVRO_EXTENSION: &str = "umf.avro";
const CORE_VERSION: &str = "0.10.0";
const EXTENSION_VERSION: &str = "0.1.0";
const AVRO_VERSION: &str = "1.12.0";

#[derive(Clone, Debug)]
pub struct AvroDependencySource<'a> {
    pub id: &'a Utf16,
    pub schema_json: &'a [u16],
}

#[derive(Clone, Debug, PartialEq)]
pub struct AvroBundle {
    pub schema_json: Utf16,
    pub dependencies: Vec<(Utf16, Utf16)>,
    /// A detached copy retaining unrelated UMF content and extensions.
    pub source: Value,
}

struct Payload {
    root: NativeJsonTree,
    dependencies: Vec<(Utf16, NativeJsonTree)>,
    unknown_envelope: bool,
}

/// Import schema JSON and ordered, caller-supplied named-schema dependencies.
/// Import performs JSON/tree preservation and field metadata derivation only;
/// it does not resolve external files or certify Avro validity.
pub fn import_schema(
    id: &Utf16,
    schema_json: &[u16],
    dependencies: &[AvroDependencySource<'_>],
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let root = NativeJsonTree::parse_json(schema_json, ctx)?;
    if !matches!(
        root.root(),
        crate::native_json::NativeJsonNode::String(_)
            | crate::native_json::NativeJsonNode::Object(_)
            | crate::native_json::NativeJsonNode::Array(_)
    ) {
        return Err(err(
            "AVRO_ROOT",
            "Avro schemas must be strings, objects or union arrays",
        ));
    }
    let mut parsed = Vec::with_capacity(dependencies.len());
    for dependency in dependencies {
        ctx.charge_work(dependency.id.len().saturating_add(1), Utf16::default())?;
        if has_duplicate_dependency_id(
            parsed.iter().map(|(id, _): &(Utf16, NativeJsonTree)| id),
            dependency.id,
            ctx,
        )? {
            return Err(err("AVRO_DEPENDENCY_ID", "Dependency IDs must be unique"));
        }
        parsed.push((
            dependency.id.clone(),
            NativeJsonTree::parse_json(dependency.schema_json, ctx)?,
        ));
    }
    let dep_refs = parsed
        .iter()
        .map(|(id, root)| AvroDependency { id, root })
        .collect::<Vec<_>>();
    let fields = derive_avro_fields(&root, &dep_refs, ctx)?;
    let tagged_root = tagged_value(&root, ctx)?;
    let mut dep_values = Vec::with_capacity(parsed.len());
    for (dep_id, tree) in &parsed {
        dep_values.push(object(vec![
            ("id", Value::String(dep_id.clone())),
            ("root", tagged_value(tree, ctx)?),
        ]));
    }
    let mut payload_fields = vec![
        ("version", Value::string_utf8(AVRO_VERSION)),
        ("root", tagged_root),
    ];
    if !dep_values.is_empty() {
        payload_fields.push(("dependencies", Value::Array(dep_values)));
    }
    let payload = object(payload_fields);
    let schema_element = object(vec![
        ("id", Value::string_utf8("schema")),
        ("extensions", object(vec![(AVRO_EXTENSION, payload)])),
    ]);
    let schema_module = object(vec![
        ("id", Value::string_utf8("schema")),
        ("namespace", Value::string_utf8("")),
        ("elements", Value::Array(vec![schema_element])),
    ]);
    let fields_module = fields_module(fields);
    let document = object(vec![
        ("umf", Value::string_utf8(CORE_VERSION)),
        ("id", Value::String(id.clone())),
        (
            "vocabularies",
            object(vec![(
                AVRO_EXTENSION,
                object(vec![("version", Value::string_utf8(EXTENSION_VERSION))]),
            )]),
        ),
        ("modules", Value::Array(vec![schema_module, fields_module])),
    ]);
    validate_document(&document, ctx)?;
    Ok(document)
}

/// Export the primary schema as compact JSON plus a newline. Dependencies and
/// unknown tagged-representation fields block this lossy root-only operation.
pub fn export_schema(document: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let payload = payload_from_document(document, ctx)?;
    if !payload.dependencies.is_empty() {
        return Err(err(
            "AVRO_DEPENDENCIES_REQUIRED",
            "Export the Avro bundle to retain named-schema dependencies",
        ));
    }
    check_field_metadata(document, &payload, ctx)?;
    ensure_native_exportable(&payload)?;
    render_line(&payload.root, ctx)
}

/// Export root and ordered dependency artifacts alongside a detached source
/// document. Unrelated UMF extensions remain available in `source`.
pub fn export_bundle(document: &Value, ctx: &mut Context<'_>) -> Result<AvroBundle, EngineError> {
    let payload = payload_from_document(document, ctx)?;
    check_field_metadata(document, &payload, ctx)?;
    ensure_native_exportable(&payload)?;
    let schema_json = render_line(&payload.root, ctx)?;
    let mut dependencies = Vec::with_capacity(payload.dependencies.len());
    for (id, root) in &payload.dependencies {
        ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
        dependencies.push((id.clone(), render_line(root, ctx)?));
    }
    Ok(AvroBundle {
        schema_json,
        dependencies,
        source: copy_json(document, ctx)?,
    })
}

/// Return an isolated native tree selected by an RFC 6901 pointer. Dependency
/// IDs are artifact IDs and never trigger implicit file or URL resolution.
pub fn get_node(
    document: &Value,
    pointer: &Utf16,
    dependency_id: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let payload = payload_from_document(document, ctx)?;
    let tree = match dependency_id {
        None => &payload.root,
        Some(id) => payload
            .dependencies
            .iter()
            .find(|(candidate, _)| candidate == id)
            .map(|(_, root)| root)
            .ok_or_else(|| err("AVRO_DEPENDENCY_ID", "Unknown dependency"))?,
    };
    tree.subtree_clone(pointer, ctx)
}

fn payload_from_document(document: &Value, ctx: &mut Context<'_>) -> Result<Payload, EngineError> {
    validate_document(document, ctx)?;
    let doc = object_fields(document, "AVRO_DOCUMENT", "Document must be an object")?;
    if string(field(doc, "umf")?)? != Utf16::from(CORE_VERSION) {
        return Err(err("AVRO_DOCUMENT", "Unsupported core document version"));
    }
    let vocabularies = object_fields(
        field(doc, "vocabularies")?,
        "AVRO_DOCUMENT",
        "vocabularies must be an object",
    )?;
    let declaration = object_fields(
        field(vocabularies, AVRO_EXTENSION)?,
        "AVRO_VERSION",
        "Avro vocabulary declaration must be an object",
    )?;
    if string(field(declaration, "version")?)? != Utf16::from(EXTENSION_VERSION) {
        return Err(err("AVRO_VERSION", "Unsupported Avro vocabulary version"));
    }
    let modules = array(
        field(doc, "modules")?,
        "AVRO_DOCUMENT",
        "modules must be an array",
    )?;
    let mut found = None;
    for module in modules {
        let module = object_fields(module, "AVRO_DOCUMENT", "module must be an object")?;
        if string(field(module, "id")?)? != Utf16::from("schema") {
            continue;
        }
        let elements = array(
            field(module, "elements")?,
            "AVRO_DOCUMENT",
            "elements must be an array",
        )?;
        for element in elements {
            let element = object_fields(element, "AVRO_DOCUMENT", "element must be an object")?;
            if string(field(element, "id")?)? != Utf16::from("schema") {
                continue;
            }
            let extensions = object_fields(
                field(element, "extensions")?,
                "AVRO_DOCUMENT",
                "extensions must be an object",
            )?;
            if let Some(value) = optional_field(extensions, AVRO_EXTENSION) {
                if found.is_some() {
                    return Err(err("AVRO_DOCUMENT", "Avro schema identity is ambiguous"));
                }
                found = Some(value);
            }
        }
    }
    let fields = object_fields(
        found.ok_or_else(|| err("AVRO_PAYLOAD", "Schema identity has no umf.avro payload"))?,
        "AVRO_PAYLOAD",
        "Payload must be an object",
    )?;
    let version = string(field(fields, "version")?)?;
    if version != Utf16::from(AVRO_VERSION) {
        return Err(err("AVRO_VERSION", "Unsupported Avro schema version"));
    }
    let mut unknown_envelope = false;
    for (key, _) in fields {
        if !matches_ascii(key, &["version", "root", "dependencies"]) {
            unknown_envelope = true;
        }
    }
    let root = NativeJsonTree::from_tagged_value(field(fields, "root")?, ctx)?;
    if !matches!(
        root.root(),
        crate::native_json::NativeJsonNode::String(_)
            | crate::native_json::NativeJsonNode::Object(_)
            | crate::native_json::NativeJsonNode::Array(_)
    ) {
        return Err(err(
            "AVRO_ROOT",
            "Avro schemas must be strings, objects or union arrays",
        ));
    }
    let mut dependencies = Vec::new();
    if let Some(value) = optional_field(fields, "dependencies") {
        for dependency in array(value, "AVRO_DEPENDENCIES", "dependencies must be an array")? {
            let dependency = object_fields(
                dependency,
                "AVRO_DEPENDENCY",
                "dependency must be an object",
            )?;
            let id_value = field(dependency, "id")?;
            let id_ref = string_ref(id_value)?;
            ctx.charge_work(id_ref.len().saturating_add(1), Utf16::default())?;
            if has_duplicate_dependency_id(
                dependencies
                    .iter()
                    .map(|(other, _): &(Utf16, NativeJsonTree)| other),
                id_ref,
                ctx,
            )? {
                return Err(err("AVRO_DEPENDENCY_ID", "Dependency IDs must be unique"));
            }
            let id = id_ref.clone();
            if dependency
                .iter()
                .any(|(key, _)| !matches_ascii(key, &["id", "root"]))
            {
                unknown_envelope = true;
            }
            dependencies.push((
                id,
                NativeJsonTree::from_tagged_value(field(dependency, "root")?, ctx)?,
            ));
        }
    }
    Ok(Payload {
        root,
        dependencies,
        unknown_envelope,
    })
}

fn check_field_metadata(
    document: &Value,
    payload: &Payload,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let doc = object_fields(document, "AVRO_DOCUMENT", "Document must be an object")?;
    let modules = array(
        field(doc, "modules")?,
        "AVRO_DOCUMENT",
        "modules must be an array",
    )?;
    let Some(module) = modules.iter().find(|module| {
        object_fields(module, "AVRO_DOCUMENT", "module must be an object")
            .and_then(|members| field(members, "id"))
            .and_then(string)
            .is_ok_and(|id| id == Utf16::from("avro.fields"))
    }) else {
        return Ok(());
    };
    let module = object_fields(
        module,
        "AVRO_FIELD_METADATA",
        "Avro field metadata module must be an object",
    )?;
    if field(module, "namespace")? != &Value::string_utf8("") {
        return Err(err(
            "AVRO_FIELD_METADATA",
            "Native fields and core metadata disagree",
        ));
    }
    let actual = array(
        field(module, "elements")?,
        "AVRO_FIELD_METADATA",
        "Avro field metadata elements must be an array",
    )?;
    let dependencies = payload
        .dependencies
        .iter()
        .map(|(id, root)| AvroDependency { id, root })
        .collect::<Vec<_>>();
    let expected = fields_module(derive_avro_fields(&payload.root, &dependencies, ctx)?);
    let expected = object_fields(
        &expected,
        "AVRO_FIELD_METADATA",
        "Derived metadata is unavailable",
    )?;
    let expected = array(
        field(expected, "elements")?,
        "AVRO_FIELD_METADATA",
        "Derived metadata elements are unavailable",
    )?;
    if actual.len() != expected.len() {
        return Err(err(
            "AVRO_FIELD_METADATA",
            "Native fields and core metadata disagree",
        ));
    }
    for (actual, expected) in actual.iter().zip(expected) {
        let actual = object_fields(
            actual,
            "AVRO_FIELD_METADATA",
            "Avro field metadata element must be an object",
        )?;
        let expected = object_fields(
            expected,
            "AVRO_FIELD_METADATA",
            "Derived field metadata element must be an object",
        )?;
        for key in ["id", "name", "description", "scalarType"] {
            if optional_field(actual, key) != optional_field(expected, key) {
                return Err(err(
                    "AVRO_FIELD_METADATA",
                    "Native fields and core metadata disagree",
                ));
            }
        }
    }
    Ok(())
}

struct NoAvroExtensionCallbacks;
impl Capabilities for NoAvroExtensionCallbacks {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

/// Validate the complete current-core document envelope and its registered
/// Avro payload shape. Avro semantic interpretation is intentionally deferred.
fn validate_document(document: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    fn resource(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
        let source = text.encode_utf16().collect::<Vec<_>>();
        ctx.charge_text(source.len(), Utf16::default())?;
        serialization::read_json_value(&source, Format::Json, ctx)
    }
    let engine = Engine::new(
        ResourceSet::new(
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
        ),
        ctx,
    )?;
    let schema_resources = engine.schema_resources_with_context(ctx)?;
    let manifest = resource(
        include_str!("../../../spec/extensions/avro/package.json"),
        ctx,
    )?;
    let mut registry = Registry::new();
    registry.register(
        &manifest,
        None,
        engine.package_schema(),
        &schema_resources,
        ctx,
    )?;
    let result =
        engine.validate_document(document, &registry, &mut NoAvroExtensionCallbacks, ctx)?;
    if result.valid {
        return Ok(());
    }
    let first = result.diagnostics.first();
    Err(EngineError::new(
        "AVRO_DOCUMENT",
        first
            .map(|diagnostic| diagnostic.path.clone())
            .unwrap_or_default(),
        first
            .map(|diagnostic| diagnostic.message.clone())
            .unwrap_or_else(|| Utf16::from("Invalid UMF Avro document")),
    ))
}

fn ensure_native_exportable(payload: &Payload) -> Result<(), EngineError> {
    if payload.unknown_envelope
        || payload.root.has_representation_extras()
        || payload
            .dependencies
            .iter()
            .any(|(_, tree)| tree.has_representation_extras())
    {
        return Err(err(
            "AVRO_REPRESENTATION",
            "Unknown representation content cannot be discarded",
        ));
    }
    Ok(())
}

fn render_line(tree: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let compact = tree.render_compact(ctx)?;
    let final_length = compact
        .len()
        .checked_add(1)
        .ok_or_else(|| err("LIMIT", "Serialized length overflow"))?;
    if final_length > ctx.limits().max_text_units {
        return Err(err("LIMIT", "Serialized text limit exceeded"));
    }
    // The compact rendering has already charged its own length. Charge the
    // appended newline before extending the final output allocation.
    ctx.charge_work(1, Utf16::default())?;
    let mut rendered = compact.into_units();
    rendered.push(b'\n' as u16);
    Ok(Utf16::new(rendered))
}

fn has_duplicate_dependency_id<'a>(
    existing: impl IntoIterator<Item = &'a Utf16>,
    candidate: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    for id in existing {
        ctx.charge_work(
            id.len().saturating_add(candidate.len()).saturating_add(1),
            Utf16::default(),
        )?;
        if id == candidate {
            return Ok(true);
        }
    }
    Ok(false)
}

fn tagged_value(tree: &NativeJsonTree, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let tagged = tree.render_tagged(ctx)?;
    serialization::read_json_value(tagged.units(), Format::Json, ctx)
}

fn fields_module(fields: Vec<AvroFieldMetadata>) -> Value {
    let elements = fields
        .into_iter()
        .map(|field| {
            let mut members = vec![
                ("id", Value::String(field.element_id)),
                ("name", Value::String(field.name)),
            ];
            if let Some(description) = field.description {
                members.push(("description", Value::String(description)));
            }
            if let Some(scalar) = field.scalar_type {
                members.push(("scalarType", Value::string_utf8(scalar.as_str())));
            }
            members.push(("extensions", object(Vec::new())));
            object(members)
        })
        .collect();
    object(vec![
        ("id", Value::string_utf8("avro.fields")),
        ("namespace", Value::string_utf8("")),
        ("elements", Value::Array(elements)),
    ])
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}
fn object_fields<'a>(
    value: &'a Value,
    code: &'static str,
    message: &'static str,
) -> Result<&'a [(Utf16, Value)], EngineError> {
    match value {
        Value::Object(fields) => Ok(fields),
        _ => Err(err(code, message)),
    }
}
fn array<'a>(
    value: &'a Value,
    code: &'static str,
    message: &'static str,
) -> Result<&'a [Value], EngineError> {
    match value {
        Value::Array(items) => Ok(items),
        _ => Err(err(code, message)),
    }
}
fn field<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Result<&'a Value, EngineError> {
    optional_field(fields, key)
        .ok_or_else(|| err("AVRO_PAYLOAD", "Required Avro document member is missing"))
}
fn optional_field<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields
        .iter()
        .find(|(name, _)| name.units().iter().copied().eq(key.encode_utf16()))
        .map(|(_, value)| value)
}
fn string(value: &Value) -> Result<Utf16, EngineError> {
    match value {
        Value::String(value) => Ok(value.clone()),
        _ => Err(err("AVRO_DOCUMENT", "Expected string")),
    }
}
fn string_ref(value: &Value) -> Result<&Utf16, EngineError> {
    match value {
        Value::String(value) => Ok(value),
        _ => Err(err("AVRO_DOCUMENT", "Expected string")),
    }
}
fn matches_ascii(value: &Utf16, options: &[&str]) -> bool {
    options
        .iter()
        .any(|candidate| value.units().iter().copied().eq(candidate.encode_utf16()))
}
fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod resource_tests {
    use super::{NativeJsonTree, render_line};
    use crate::{
        Context,
        context::{Limits, ResourceProfile},
    };

    #[test]
    fn root_and_dependency_lines_respect_the_newline_text_ceiling() {
        for source in [r#"{"type":"string"}"#, r#"{"type":"long"}"#] {
            let source = source.encode_utf16().collect::<Vec<_>>();
            let tree = NativeJsonTree::parse_json(&source, &mut Context::ordinary()).unwrap();
            let compact_len = tree.render_compact(&mut Context::ordinary()).unwrap().len();

            let mut exact = Limits::ordinary();
            exact.max_text_units = compact_len;
            let mut context = Context::with_limits(ResourceProfile::Cooperative, exact).unwrap();
            assert_eq!(render_line(&tree, &mut context).unwrap_err().code, "LIMIT");

            let mut fits = Limits::ordinary();
            fits.max_text_units = compact_len + 1;
            let mut context = Context::with_limits(ResourceProfile::Cooperative, fits).unwrap();
            assert_eq!(
                render_line(&tree, &mut context).unwrap().to_utf8().unwrap(),
                format!("{}\n", String::from_utf16(&source).unwrap())
            );
        }
    }
}
