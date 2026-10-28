// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Avro schema document preservation operations.
//!
//! This module preserves Avro 1.12 schema JSON as an exact tagged native tree.
//! It does not validate Avro semantics or implement datum, IDL, protocol, or
//! object-container operations.

use crate::{
    avro_fields::{derive_avro_fields, AvroDependency, AvroFieldMetadata},
    avro_semantics::{inspect_schema, Dependency as InspectionDependency},
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::NativeJsonTree,
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

pub const AVRO_EXTENSION: &str = "umf.avro";
pub const AVRO_CANDIDATE_PROFILE: &str = "umf-r5-avro-candidate/0.1.0";
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

/// Separate generic UMF admission from the bounded native Avro structure
/// report. Native inspection is absent when generic admission fails.
#[derive(Clone, Debug, PartialEq)]
pub struct AvroDocumentInspection {
    pub admission: Validation,
    /// Native diagnostic paths are relative to the Avro root/dependency tree.
    pub native_inspection: Option<Validation>,
    pub payload_path: Option<Utf16>,
}

struct Payload {
    root: NativeJsonTree,
    dependencies: Vec<(Utf16, NativeJsonTree)>,
    unknown_envelope: bool,
}

/// Internal result of generic UMF admission for an Avro document. The
/// validation report is retained verbatim so callers can preserve diagnostic
/// order and source paths; a payload path is present only when admission
/// succeeds and the registered Avro payload can be located.
#[derive(Clone, Debug)]
pub(crate) struct AvroDocumentAdmission {
    pub(crate) validation: Validation,
    pub(crate) payload_path: Option<Utf16>,
}

/// Run the registered generic UMF validator without collapsing its report to
/// the first error. This is an internal prerequisite for a future document
/// inspector; it does not interpret Avro schema semantics.
pub(crate) fn admit_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<AvroDocumentAdmission, EngineError> {
    let validation = validate_document_report(document, ctx)?;
    let payload_path = if validation.valid {
        locate_payload_path(document, ctx)?
    } else {
        None
    };
    Ok(AvroDocumentAdmission {
        validation,
        payload_path,
    })
}

/// Inspect an Avro-bearing UMF document in two explicit phases. Generic UMF
/// admission always runs first; Avro structure inspection runs only for an
/// admitted document. The source value is never modified.
pub fn inspect_avro_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<AvroDocumentInspection, EngineError> {
    let admission = admit_document(document, ctx)?;
    let Some(payload_path) = admission.payload_path.clone() else {
        return Ok(AvroDocumentInspection {
            admission: admission.validation,
            native_inspection: None,
            payload_path: None,
        });
    };
    let payload = payload_from_admitted_document(document, ctx)?;
    ctx.charge_work(payload.dependencies.len().saturating_add(1), Utf16::default())?;
    for (id, _) in &payload.dependencies {
        ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
    }
    let dependencies = payload
        .dependencies
        .iter()
        .map(|(id, tree)| InspectionDependency { id, tree })
        .collect::<Vec<_>>();
    let native_inspection = inspect_schema(&payload.root, &dependencies, ctx)?;
    Ok(AvroDocumentInspection {
        admission: admission.validation,
        native_inspection: Some(native_inspection),
        payload_path: Some(payload_path),
    })
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

/// Propose an explicit, lossless node edit to an admitted Avro document.
///
/// Successful UMF/payload admission is reported separately from bounded native
/// schema inspection. Inspector findings, including errors, do not turn an
/// admitted candidate into an operation failure.
pub fn propose_avro_node_edit(
    input: &Value,
    path: &Utf16,
    replacement_json: &[u16],
    dependency_id: Option<&Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let payload = payload_from_document(&source, ctx)?;
    check_field_metadata(&source, &payload, ctx)?;
    ensure_candidate_editable(&payload, ctx)?;

    // The TypeScript operation validates pointer syntax before parsing the
    // replacement JSON. replace_node repeats pointer parsing while resolving
    // and copying the selected native tree; both passes are charged.
    crate::native_json::native_pointer(path, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement_json, ctx)?;
    let mut candidate_payload = payload;
    let selected_dependency_index = match dependency_id {
        None => {
            candidate_payload.root =
                candidate_payload
                    .root
                    .replace_node(path, &replacement, ctx)?;
            None
        }
        Some(id) => {
            ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
            let mut found = None;
            for (index, (candidate, _)) in candidate_payload.dependencies.iter().enumerate() {
                ctx.charge_work(candidate.len().saturating_add(1), Utf16::default())?;
                if candidate == id {
                    found = Some(index);
                    break;
                }
            }
            let index = found.ok_or_else(|| err("AVRO_DEPENDENCY_ID", "Unknown dependency"))?;
            let next =
                candidate_payload.dependencies[index]
                    .1
                    .replace_node(path, &replacement, ctx)?;
            candidate_payload.dependencies[index].1 = next;
            Some(index)
        }
    };

    let mut document = copy_json(&source, ctx)?;
    replace_payload_roots(
        &mut document,
        &candidate_payload,
        selected_dependency_index,
        ctx,
    )?;
    synchronize_candidate_field_metadata(&mut document, &candidate_payload, ctx)?;

    let admitted_candidate = payload_from_document(&document, ctx)?;
    check_field_metadata(&document, &admitted_candidate, ctx)?;
    let source_admission = successful_admission();
    let candidate_admission = successful_admission();

    let admitted_source = payload_from_document(&source, ctx)?;
    let source_dependencies = inspection_dependencies(&admitted_source, ctx)?;
    let source_inspection = inspect_schema(&admitted_source.root, &source_dependencies, ctx)?;
    let candidate_dependencies = inspection_dependencies(&admitted_candidate, ctx)?;
    let candidate_inspection =
        inspect_schema(&admitted_candidate.root, &candidate_dependencies, ctx)?;

    let replacement_value = tagged_value(&replacement, ctx)?;
    ctx.charge_work(8, Utf16::default())?;
    let mut edit_fields = vec![(Utf16::from("path"), Value::String(path.clone()))];
    if let Some(id) = dependency_id {
        ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
        edit_fields.push((Utf16::from("dependencyId"), Value::String(id.clone())));
    }
    edit_fields.push((Utf16::from("replacement"), replacement_value));
    let report = Value::Object(vec![
        (
            Utf16::from("profile"),
            Value::string_utf8(AVRO_CANDIDATE_PROFILE),
        ),
        (Utf16::from("status"), Value::string_utf8("candidate")),
        (Utf16::from("source"), source),
        (Utf16::from("document"), document),
        (Utf16::from("edit"), Value::Object(edit_fields)),
        (
            Utf16::from("admission"),
            Value::Object(vec![
                (
                    Utf16::from("source"),
                    validation_value(source_admission, ctx)?,
                ),
                (
                    Utf16::from("candidate"),
                    validation_value(candidate_admission, ctx)?,
                ),
            ]),
        ),
        (
            Utf16::from("nativeInspection"),
            Value::Object(vec![
                (
                    Utf16::from("source"),
                    validation_value(source_inspection, ctx)?,
                ),
                (
                    Utf16::from("candidate"),
                    validation_value(candidate_inspection, ctx)?,
                ),
            ]),
        ),
    ]);
    copy_json(&report, ctx)
}

fn successful_admission() -> Validation {
    Validation {
        valid: true,
        complete: true,
        diagnostics: Vec::new(),
    }
}

fn validation_value(validation: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(
        validation.diagnostics.len().saturating_add(3),
        Utf16::default(),
    )?;
    let mut diagnostics = Vec::with_capacity(validation.diagnostics.len());
    for item in validation.diagnostics {
        ctx.charge_work(
            item.code
                .len()
                .saturating_add(item.path.len())
                .saturating_add(item.message.len())
                .saturating_add(4),
            item.path.clone(),
        )?;
        diagnostics.push(Value::Object(vec![
            (Utf16::from("code"), Value::String(item.code)),
            (Utf16::from("path"), Value::String(item.path)),
            (Utf16::from("message"), Value::String(item.message)),
            (
                Utf16::from("severity"),
                Value::string_utf8(if item.severity == Severity::Warning {
                    "warning"
                } else {
                    "error"
                }),
            ),
        ]));
    }
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ]))
}

fn inspection_dependencies<'a>(
    payload: &'a Payload,
    ctx: &mut Context<'_>,
) -> Result<Vec<InspectionDependency<'a>>, EngineError> {
    ctx.charge_work(
        payload.dependencies.len().saturating_add(1),
        Utf16::default(),
    )?;
    let mut dependencies = Vec::with_capacity(payload.dependencies.len());
    for (id, tree) in &payload.dependencies {
        ctx.charge_work(id.len().saturating_add(1), Utf16::default())?;
        dependencies.push(InspectionDependency { id, tree });
    }
    Ok(dependencies)
}

fn ensure_candidate_editable(payload: &Payload, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_work(
        payload.dependencies.len().saturating_add(1),
        Utf16::default(),
    )?;
    if payload.unknown_envelope
        || payload.root.has_representation_extras()
        || payload
            .dependencies
            .iter()
            .any(|(_, tree)| tree.has_representation_extras())
    {
        return Err(err(
            "AVRO_REPRESENTATION",
            "Unknown representation content prevents native node replacement",
        ));
    }
    Ok(())
}

fn replace_payload_roots(
    document: &mut Value,
    payload: &Payload,
    selected_dependency_index: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let modules = array_mut(
        required_member_mut(
            document,
            "modules",
            "AVRO_DOCUMENT",
            "modules are required",
            ctx,
        )?,
        "AVRO_DOCUMENT",
        "modules must be an array",
    )?;
    ctx.charge_work(modules.len().saturating_add(1), Utf16::default())?;
    let module = modules
        .iter_mut()
        .find(|module| {
            value_text(optional_field(object_fields_read(module), "id"))
                .is_some_and(|id| id == &Utf16::from("schema"))
        })
        .ok_or_else(|| err("AVRO_DOCUMENT", "Schema module is missing"))?;
    let elements = array_mut(
        required_member_mut(
            module,
            "elements",
            "AVRO_DOCUMENT",
            "Schema module elements are missing",
            ctx,
        )?,
        "AVRO_DOCUMENT",
        "Schema module elements must be an array",
    )?;
    ctx.charge_work(elements.len().saturating_add(1), Utf16::default())?;
    let element = elements
        .iter_mut()
        .find(|element| {
            value_text(optional_field(object_fields_read(element), "id"))
                .is_some_and(|id| id == &Utf16::from("schema"))
        })
        .ok_or_else(|| err("AVRO_DOCUMENT", "Schema element is missing"))?;
    let payload_value = required_member_mut(
        element,
        "extensions",
        "AVRO_DOCUMENT",
        "Schema element extensions are missing",
        ctx,
    )?;
    let payload_value = required_member_mut(
        payload_value,
        AVRO_EXTENSION,
        "AVRO_PAYLOAD",
        "Avro payload is missing",
        ctx,
    )?;
    let payload_fields =
        object_fields_mut(payload_value, "AVRO_PAYLOAD", "Payload must be an object")?;
    let tagged_root = tagged_value(&payload.root, ctx)?;
    set_member(payload_fields, "root", tagged_root, ctx)?;
    if let Some(index) = selected_dependency_index {
        ctx.charge_work(index.saturating_add(1), Utf16::default())?;
        let dependency = array_mut(
            required_member_mut(
                payload_value,
                "dependencies",
                "AVRO_DEPENDENCIES",
                "Dependency list is missing",
                ctx,
            )?,
            "AVRO_DEPENDENCIES",
            "Dependencies must be an array",
        )?
        .get_mut(index)
        .ok_or_else(|| err("AVRO_DEPENDENCY_ID", "Dependency index is unavailable"))?;
        let root = required_member_mut(
            dependency,
            "root",
            "AVRO_DEPENDENCY",
            "Dependency root is missing",
            ctx,
        )?;
        *root = tagged_value(
            &payload
                .dependencies
                .get(index)
                .ok_or_else(|| err("AVRO_DEPENDENCY_ID", "Dependency index is unavailable"))?
                .1,
            ctx,
        )?;
    }
    Ok(())
}

fn synchronize_candidate_field_metadata(
    document: &mut Value,
    payload: &Payload,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let modules = array_mut(
        required_member_mut(
            document,
            "modules",
            "AVRO_DOCUMENT",
            "modules are required",
            ctx,
        )?,
        "AVRO_DOCUMENT",
        "modules must be an array",
    )?;
    ctx.charge_work(modules.len().saturating_add(1), Utf16::default())?;
    let Some(module_index) = modules.iter().position(|module| {
        value_text(optional_field(object_fields_read(module), "id"))
            == Some(&Utf16::from("avro.fields"))
    }) else {
        return Ok(());
    };
    let fields = payload
        .dependencies
        .iter()
        .map(|(id, root)| AvroDependency { id, root })
        .collect::<Vec<_>>();
    ctx.charge_work(fields.len().saturating_add(1), Utf16::default())?;
    let next_module = fields_module(derive_avro_fields(&payload.root, &fields, ctx)?);
    let expected = array(
        optional_field(object_fields_read(&next_module), "elements")
            .ok_or_else(|| err("AVRO_FIELD_METADATA", "Derived fields are unavailable"))?,
        "AVRO_FIELD_METADATA",
        "Derived fields are unavailable",
    )?;
    let module = &mut modules[module_index];
    let old = array_mut(
        required_member_mut(
            module,
            "elements",
            "AVRO_FIELD_METADATA",
            "Field metadata elements are missing",
            ctx,
        )?,
        "AVRO_FIELD_METADATA",
        "Field metadata elements must be an array",
    )?;
    ctx.charge_work(
        expected.len().saturating_add(old.len()).saturating_add(1),
        Utf16::default(),
    )?;
    let mut merged = Vec::with_capacity(expected.len());
    for fresh in expected {
        let fresh_id = optional_field(object_fields_read(fresh), "id")
            .ok_or_else(|| err("AVRO_FIELD_METADATA", "Derived field ID is missing"))?;
        let fresh_id_len = value_text(Some(fresh_id)).map_or(1, Utf16::len);
        ctx.charge_work(
            old.len().saturating_mul(fresh_id_len).saturating_add(1),
            Utf16::default(),
        )?;
        let previous = old
            .iter()
            .find(|item| optional_field(object_fields_read(item), "id") == Some(fresh_id));
        let Some(previous) = previous else {
            merged.push(copy_json(fresh, ctx)?);
            continue;
        };
        let old_name = optional_field(object_fields_read(previous), "name");
        let new_name = optional_field(object_fields_read(fresh), "name");
        ctx.charge_work(
            value_text(old_name)
                .map_or(0, Utf16::len)
                .saturating_add(value_text(new_name).map_or(0, Utf16::len)),
            Utf16::default(),
        )?;
        if old_name != new_name && element_has_attached_metadata(previous, ctx)? {
            return Err(err(
                "AVRO_FIELD_METADATA",
                "Field identity changed with attached metadata; explicit reassociation required",
            ));
        }
        let mut next = copy_json(fresh, ctx)?;
        let previous_fields = object_fields_read(previous);
        ctx.charge_work(previous_fields.len().saturating_add(1), Utf16::default())?;
        for (key, value) in previous_fields {
            let known = matches_ascii(
                key,
                &["id", "name", "description", "scalarType", "extensions"],
            );
            if !known || matches_ascii(key, &["extensions"]) {
                let value = copy_json(value, ctx)?;
                set_member_units(
                    object_fields_mut(
                        &mut next,
                        "AVRO_FIELD_METADATA",
                        "Derived field must be an object",
                    )?,
                    key.clone(),
                    value,
                    ctx,
                )?;
            }
        }
        merged.push(next);
    }
    for previous in old.iter() {
        let old_id = optional_field(object_fields_read(previous), "id");
        let old_id_len = value_text(old_id).map_or(1, Utf16::len);
        ctx.charge_work(
            expected.len().saturating_mul(old_id_len).saturating_add(1),
            Utf16::default(),
        )?;
        if !expected
            .iter()
            .any(|fresh| optional_field(object_fields_read(fresh), "id") == old_id)
            && element_has_attached_metadata(previous, ctx)?
        {
            return Err(err(
                "AVRO_FIELD_METADATA",
                "Removing a field would discard attached core metadata",
            ));
        }
    }
    set_member(
        object_fields_mut(
            module,
            "AVRO_FIELD_METADATA",
            "Field metadata module must be an object",
        )?,
        "elements",
        Value::Array(merged),
        ctx,
    )?;
    Ok(())
}

fn element_has_attached_metadata(
    value: &Value,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let fields = object_fields_read(value);
    ctx.charge_work(fields.len().saturating_add(1), Utf16::default())?;
    for (key, value) in fields {
        if matches_ascii(key, &["extensions"]) {
            match value {
                Value::Object(items) if items.is_empty() => continue,
                _ => return Ok(true),
            }
        }
        if !matches_ascii(
            key,
            &["id", "name", "description", "scalarType", "extensions"],
        ) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn object_fields_read(value: &Value) -> &[(Utf16, Value)] {
    match value {
        Value::Object(fields) => fields,
        _ => &[],
    }
}

fn object_fields_mut<'a>(
    value: &'a mut Value,
    code: &'static str,
    message: &'static str,
) -> Result<&'a mut Vec<(Utf16, Value)>, EngineError> {
    match value {
        Value::Object(fields) => Ok(fields),
        _ => Err(err(code, message)),
    }
}

fn array_mut<'a>(
    value: &'a mut Value,
    code: &'static str,
    message: &'static str,
) -> Result<&'a mut Vec<Value>, EngineError> {
    match value {
        Value::Array(items) => Ok(items),
        _ => Err(err(code, message)),
    }
}

fn optional_field_mut<'a>(fields: &'a mut [(Utf16, Value)], key: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(name, _)| name.units().iter().copied().eq(key.encode_utf16()))
        .map(|(_, value)| value)
}

fn required_member_mut<'a>(
    value: &'a mut Value,
    key: &str,
    code: &'static str,
    message: &'static str,
    ctx: &mut Context<'_>,
) -> Result<&'a mut Value, EngineError> {
    let fields = object_fields_mut(value, code, message)?;
    let key_length = key.encode_utf16().count();
    ctx.charge_work(
        fields.len().saturating_mul(key_length.saturating_add(1)),
        Utf16::default(),
    )?;
    optional_field_mut(fields, key).ok_or_else(|| err(code, message))
}

fn value_text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(text)) => Some(text),
        _ => None,
    }
}

fn set_member(
    fields: &mut Vec<(Utf16, Value)>,
    key: &str,
    value: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    set_member_units(fields, Utf16::from(key), value, ctx)
}

fn set_member_units(
    fields: &mut Vec<(Utf16, Value)>,
    key: Utf16,
    value: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        fields
            .len()
            .saturating_mul(key.len().saturating_add(1))
            .saturating_add(1),
        Utf16::default(),
    )?;
    if let Some((_, old)) = fields.iter_mut().find(|(candidate, _)| candidate == &key) {
        *old = value;
    } else {
        fields.push((key, value));
    }
    Ok(())
}

fn remove_member(
    fields: &mut Vec<(Utf16, Value)>,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(
        fields
            .len()
            .saturating_mul(key.encode_utf16().count().saturating_add(1))
            .saturating_add(1),
        Utf16::default(),
    )?;
    fields.retain(|(candidate, _)| !candidate.units().iter().copied().eq(key.encode_utf16()));
    Ok(())
}

fn payload_from_document(document: &Value, ctx: &mut Context<'_>) -> Result<Payload, EngineError> {
    validate_document(document, ctx)?;
    payload_from_admitted_document(document, ctx)
}

fn payload_from_admitted_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Payload, EngineError> {
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
    let result = validate_document_report(document, ctx)?;
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

fn validate_document_report(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
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
    Ok(result)
}

fn locate_payload_path(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    let Value::Object(doc) = document else {
        return Ok(None);
    };
    let Some(Value::Array(modules)) = optional_field(doc, "modules") else {
        return Ok(None);
    };
    let mut found = None;
    for (mi, module) in modules.iter().enumerate() {
        ctx.charge_work(1, Utf16::default())?;
        let Value::Object(module) = module else {
            continue;
        };
        if optional_field(module, "id") != Some(&Value::string_utf8("schema")) {
            continue;
        }
        let Some(Value::Array(elements)) = optional_field(module, "elements") else {
            continue;
        };
        for (ei, element) in elements.iter().enumerate() {
            ctx.charge_work(1, Utf16::default())?;
            let Value::Object(element) = element else {
                continue;
            };
            if optional_field(element, "id") != Some(&Value::string_utf8("schema")) {
                continue;
            }
            let Some(Value::Object(extensions)) = optional_field(element, "extensions") else {
                continue;
            };
            if optional_field(extensions, AVRO_EXTENSION).is_some() {
                if found.is_some() {
                    return Ok(None);
                }
                found = Some(Utf16::from(format!(
                    "/modules/{mi}/elements/{ei}/extensions/{AVRO_EXTENSION}"
                )));
            }
        }
    }
    Ok(found)
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
    use super::{admit_document, import_schema, render_line, NativeJsonTree};
    use crate::{
        context::{Limits, ResourceProfile},
        value::{Utf16, Value},
        Context,
    };

    fn member_mut<'a>(value: &'a mut Value, key: &str) -> &'a mut Value {
        let Value::Object(fields) = value else {
            panic!("object expected")
        };
        &mut fields
            .iter_mut()
            .find(|(name, _)| name == &Utf16::from(key))
            .unwrap()
            .1
    }

    #[test]
    fn admission_retains_generic_structure_diagnostics_in_order() {
        let mut ctx = Context::ordinary();
        let malformed = Value::Object(vec![]);
        let report = admit_document(&malformed, &mut ctx).unwrap();
        assert!(!report.validation.valid);
        assert!(report.payload_path.is_none());
        let paths = report
            .validation
            .diagnostics
            .iter()
            .map(|d| d.path.to_utf8().unwrap())
            .collect::<Vec<_>>();
        let codes = report
            .validation
            .diagnostics
            .iter()
            .map(|d| d.code.to_utf8().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(paths, vec!["", "", "", ""]);
        assert_eq!(
            codes,
            vec![
                "SEMANTIC_TYPE_STRUCTURE",
                "SEMANTIC_TYPE_STRUCTURE",
                "SEMANTIC_TYPE_STRUCTURE",
                "SEMANTIC_TYPE_STRUCTURE"
            ]
        );
    }

    #[test]
    fn admission_retains_unknown_extension_warning_and_native_payload_path() {
        let schema = r#"{"type":"record","name":"R","fields":[]}"#
            .encode_utf16()
            .collect::<Vec<_>>();
        let mut document = import_schema(
            &Utf16::from("admission"),
            &schema,
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        let vocabularies = member_mut(&mut document, "vocabularies");
        let Value::Object(vocabularies) = vocabularies else {
            panic!("object expected")
        };
        vocabularies.push((
            Utf16::from("example.future"),
            Value::Object(vec![(Utf16::from("version"), Value::string_utf8("9.9.9"))]),
        ));
        let report = admit_document(&document, &mut Context::ordinary()).unwrap();
        assert!(
            report.validation.valid,
            "{:?}",
            report.validation.diagnostics
        );
        assert_eq!(
            report.payload_path.as_ref().unwrap().to_utf8().unwrap(),
            "/modules/0/elements/0/extensions/umf.avro"
        );
        assert_eq!(
            report
                .validation
                .diagnostics
                .iter()
                .map(|d| d.code.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            vec!["UNKNOWN_EXTENSION", "SEMANTICS_UNCHECKED"]
        );
        assert_eq!(
            report.validation.diagnostics[0].path.to_utf8().unwrap(),
            "/vocabularies/example.future"
        );
        assert_eq!(
            report.validation.diagnostics[1].code.to_utf8().unwrap(),
            "SEMANTICS_UNCHECKED"
        );
    }

    #[test]
    fn admission_does_not_select_a_path_for_ambiguous_schema_identities() {
        let schema = r#"{"type":"string"}"#.encode_utf16().collect::<Vec<_>>();
        let mut document = import_schema(
            &Utf16::from("ambiguous"),
            &schema,
            &[],
            &mut Context::ordinary(),
        )
        .unwrap();
        let modules = member_mut(&mut document, "modules");
        let Value::Array(modules) = modules else {
            panic!("array expected")
        };
        let duplicate = modules[0].clone();
        modules.push(duplicate);
        let report = admit_document(&document, &mut Context::ordinary()).unwrap();
        assert!(
            !report.validation.valid,
            "duplicate module identity must be rejected"
        );
        assert!(report.payload_path.is_none());
    }

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
