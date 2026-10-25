// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in, generic predecessor-compatible validation for `umf.binding` 0.1.0
//! and 0.2.0. This does not validate binding 0.3 carrier semantics and does
//! not activate target projections or native behavior.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{Format, read_json_value},
    value::{Utf16, Value},
};
use std::collections::BTreeSet;

/// Opt-in API profile. Existing TypeScript consumers remain unchanged.
pub const BINDING_INSPECTION_PROFILE: &str = "umf-r5-binding-inspector/0.1.0";
const BINDING_01: u64 = 1;
const BINDING_02: u64 = 2;

/// Immutable Engine and binding registrations prepared once and reused by
/// independent inspection calls. The mutable Context and semantic callback
/// are invocation-local and never retained by this value.
pub struct BindingInspectionResources {
    engine: Engine,
    registry: Registry,
}

impl BindingInspectionResources {
    /// Prepare current core resources and the published 0.1/0.2 binding
    /// packages. Construct this once for repeated calls; it contains no mutable
    /// operation state and may be shared by callers.
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = source.encode_utf16().count();
            ctx.charge_text(units, Utf16::default())?;
            read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
        }
        fn register_binding_package(
            registry: &mut Registry,
            package_source: &str,
            token: u64,
            package_schema: &CompiledSchema,
            schema_resources: &SchemaResources,
            ctx: &mut Context<'_>,
        ) -> Result<(), EngineError> {
            let package = resource(package_source, ctx)?;
            let id = get(&package, "id").and_then(text).cloned().ok_or_else(|| {
                err(
                    "BINDING_VALIDATION_UNAVAILABLE",
                    "Binding package has no id",
                )
            })?;
            let version = get(&package, "version")
                .and_then(text)
                .cloned()
                .ok_or_else(|| {
                    err(
                        "BINDING_VALIDATION_UNAVAILABLE",
                        "Binding package has no version",
                    )
                })?;
            let scopes = get(&package, "scopes")
                .and_then(array)
                .ok_or_else(|| {
                    err(
                        "BINDING_VALIDATION_UNAVAILABLE",
                        "Binding package has no scopes",
                    )
                })?
                .iter()
                .map(|scope| {
                    text(scope).cloned().ok_or_else(|| {
                        err(
                            "BINDING_VALIDATION_UNAVAILABLE",
                            "Binding package scope is not text",
                        )
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            let schema = get(&package, "schema").cloned().ok_or_else(|| {
                err(
                    "BINDING_VALIDATION_UNAVAILABLE",
                    "Binding package has no schema",
                )
            })?;
            registry.register_extension_owned(
                id,
                version,
                scopes,
                schema,
                true,
                Some(token),
                package_schema,
                schema_resources,
                ctx,
            )
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
        let mut registry = Registry::new();
        register_binding_package(
            &mut registry,
            include_str!("../../../spec/extensions/binding/package.json"),
            BINDING_01,
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        register_binding_package(
            &mut registry,
            include_str!("../../../spec/extensions/binding-stable/package.json"),
            BINDING_02,
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        Ok(Self { engine, registry })
    }
}

/// Inspect one separate binding against the exact supplied logical document.
/// The operation accepts only published binding vocabulary versions 0.1.0 and
/// 0.2.0. Version 0.3.0 returns a profile diagnostic; callers requiring the
/// bit128 carrier profile must use its separately qualified API.
pub fn inspect_binding(
    resources: &BindingInspectionResources,
    binding: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    // Match the predecessor's copy/admission precedence: both documents are
    // copied before binding validation, so malformed logical numbers cannot
    // be hidden by a later binding-schema result.
    let binding = match copy_inspection_input(binding, ctx) {
        Ok(binding) => binding,
        Err(error) if error.code == "NUMBER" && !error.is_control_failure() => {
            return Ok(admission_validation(error));
        }
        Err(error) => return Err(error),
    };
    let logical = match copy_inspection_input(logical, ctx) {
        Ok(logical) => logical,
        Err(error) if error.code == "NUMBER" && !error.is_control_failure() => {
            return Ok(admission_validation(error));
        }
        Err(error) => return Err(error),
    };

    if eq_text(
        get(
            get(
                get(&binding, "vocabularies").unwrap_or(&Value::Null),
                "umf.binding",
            )
            .unwrap_or(&Value::Null),
            "version",
        ),
        "0.3.0",
    ) {
        let mut diagnostics = Vec::new();
        push_diag(
            &mut diagnostics,
            ctx,
            "BINDING_PROFILE",
            &Utf16::from("/vocabularies/umf.binding/version"),
            "Rust inspector supports umf.binding 0.1.0 and 0.2.0 only",
            Severity::Error,
        )?;
        return Ok(from_diagnostics(diagnostics));
    }

    let mut semantics = BindingSemantics;
    let base =
        resources
            .engine
            .validate_document(&binding, &resources.registry, &mut semantics, ctx)?;
    if !base.valid {
        return Ok(complete_predecessor_schema_diagnostics(
            base, &binding, ctx,
        )?);
    }

    let mut diagnostics = base.diagnostics;
    let version = get(
        get(&binding, "vocabularies").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .and_then(|entry| get(entry, "version"));
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    );
    if (!eq_value_text(version, "0.1.0") && !eq_value_text(version, "0.2.0")) || payload.is_none() {
        push_diag(
            &mut diagnostics,
            ctx,
            "BINDING_PROFILE",
            &Utf16::from("/extensions"),
            "Expected a document-scoped umf.binding 0.1.0 or 0.2.0 payload",
            Severity::Error,
        )?;
        return Ok(from_diagnostics(diagnostics));
    }
    let payload = payload.expect("checked above");
    let payload_profile = get(payload, "profile");
    if !eq_value_text(payload_profile, "umf-binding-1")
        && !eq_value_text(payload_profile, "umf-binding-2")
    {
        push_diag(
            &mut diagnostics,
            ctx,
            "BINDING_PROFILE",
            &Utf16::from("/extensions/umf.binding/profile"),
            "Unsupported binding profile",
            Severity::Error,
        )?;
    }

    let mut no_extensions = NoExtensionCapabilities;
    if !resources
        .engine
        .validate_document(&logical, &Registry::new(), &mut no_extensions, ctx)?
        .valid
    {
        push_diag(
            &mut diagnostics,
            ctx,
            "BINDING_MODEL",
            &Utf16::from("/extensions/umf.binding/logical"),
            "Supplied logical document is invalid",
            Severity::Error,
        )?;
        return Ok(from_diagnostics(diagnostics));
    }
    let payload_logical = get(payload, "logical").unwrap_or(&Value::Null);
    if get(payload_logical, "documentId") != get(&logical, "id")
        || get(payload_logical, "coreVersion") != get(&logical, "umf")
    {
        push_diag(
            &mut diagnostics,
            ctx,
            "BINDING_MODEL",
            &Utf16::from("/extensions/umf.binding/logical"),
            "Logical document id/version mismatch",
            Severity::Error,
        )?;
    }

    let elements = get(payload, "elements").and_then(array).unwrap_or(&[]);
    let fields = get(payload, "fields").and_then(array).unwrap_or(&[]);
    let relationships = get(payload, "relationships").and_then(array).unwrap_or(&[]);
    let stable_profile = eq_value_text(payload_profile, "umf-binding-2");

    for (index, row) in elements.iter().enumerate() {
        charge(
            ctx,
            &Utf16::from(format!("/extensions/umf.binding/elements/{index}")),
            1,
        )?;
        let (module, element) = ref_identity(row);
        if !logical_element_exists(&logical, &module, &element, ctx)? {
            push_diag(
                &mut diagnostics,
                ctx,
                "BINDING_REFERENCE",
                &Utf16::from(format!("/extensions/umf.binding/elements/{index}")),
                "Missing logical element",
                Severity::Error,
            )?;
        }
    }
    for (index, row) in fields.iter().enumerate() {
        charge(
            ctx,
            &Utf16::from(format!("/extensions/umf.binding/fields/{index}")),
            1,
        )?;
        let identity = field_identity(row);
        let (module_id, element_id, field_name) = (identity.0, identity.1, identity.2);
        let owner = logical_element(&logical, &module_id, &element_id, ctx)?;
        let found = if let Some(field_name) = field_name {
            owner
                .and_then(|element| {
                    get(
                        get(element, "extensions").unwrap_or(&Value::Null),
                        "umf.ddd",
                    )
                })
                .and_then(|ddd| get(ddd, "fields"))
                .is_some_and(|ddd_fields| object_has(ddd_fields, &field_name))
        } else {
            owner.is_some_and(|element| eq_text(get(element, "kind"), "field"))
        };
        if !found {
            push_diag(
                &mut diagnostics,
                ctx,
                "BINDING_REFERENCE",
                &Utf16::from(format!("/extensions/umf.binding/fields/{index}")),
                "Missing exact logical Field or DDD owner/field",
                Severity::Error,
            )?;
        }
    }
    for (index, row) in relationships.iter().enumerate() {
        charge(
            ctx,
            &Utf16::from(format!("/extensions/umf.binding/relationships/{index}")),
            1,
        )?;
        let module_id = get(row, "module").and_then(text);
        let relationship_id = if stable_profile {
            get(row, "id")
        } else {
            get(row, "name")
        };
        let matches =
            logical_relationship_count(&logical, module_id, relationship_id, stable_profile, ctx)?;
        let stable_core_version =
            !stable_profile || get(&logical, "umf") == Some(&Value::string_utf8("0.10.0"));
        if !stable_core_version || matches != 1 {
            push_diag(
                &mut diagnostics,
                ctx,
                "BINDING_REFERENCE",
                &Utf16::from(format!("/extensions/umf.binding/relationships/{index}")),
                "Missing authored relationship",
                Severity::Error,
            )?;
        }
    }
    Ok(from_diagnostics(diagnostics))
}

struct BindingSemantics;
impl Capabilities for BindingSemantics {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Err(Utf16::from("Binding semantics require a metered Context"))
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != BINDING_01 && token != BINDING_02 {
            return Ok(Vec::new());
        }
        binding_semantics(
            payload,
            &context.document,
            &context.path,
            &context.scope,
            ctx,
        )
        .map_err(CapabilityError::Engine)
    }
}

struct NoExtensionCapabilities;
impl Capabilities for NoExtensionCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ElementIdentity(Option<Utf16>, Option<Utf16>);
#[derive(Clone, Debug, Eq, PartialEq)]
struct FieldIdentity(Option<Utf16>, Option<Utf16>, Option<Utf16>);

fn binding_semantics(
    payload: &Value,
    document: &Value,
    base: &Utf16,
    scope: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut output = Vec::new();
    if scope != "document" {
        push_diag(
            &mut output,
            ctx,
            "BINDING_SCOPE",
            base,
            "Binding payload belongs to its own document",
            Severity::Error,
        )?;
    }
    if get(document, "modules")
        .and_then(array)
        .is_some_and(|rows| !rows.is_empty())
    {
        push_diag(
            &mut output,
            ctx,
            "BINDING_SCOPE",
            &child(base, "/modules"),
            "A binding document does not contain logical modules",
            Severity::Error,
        )?;
    }
    unknown_members(
        payload,
        &[
            "profile",
            "logical",
            "target",
            "elements",
            "fields",
            "relationships",
            "indexes",
        ],
        base,
        ctx,
        &mut output,
    )?;
    for (member, allowed) in [
        ("logical", &["documentId", "coreVersion"][..]),
        ("target", &["system", "version", "subset"][..]),
    ] {
        if let Some(value) = get(payload, member) {
            unknown_members(
                value,
                allowed,
                &child(base, &format!("/{member}")),
                ctx,
                &mut output,
            )?;
        }
    }

    let elements = get(payload, "elements").and_then(array).unwrap_or(&[]);
    unique_assignments(
        elements,
        "elements",
        |v| {
            let (m, e) = ref_identity(v);
            ElementIdentity(m, e)
        },
        base,
        ctx,
        &mut output,
    )?;
    for (i, row) in elements.iter().enumerate() {
        unknown_members(
            row,
            &["module", "element", "partition", "table"],
            &child(base, &format!("/elements/{i}")),
            ctx,
            &mut output,
        )?;
    }
    let fields = get(payload, "fields").and_then(array).unwrap_or(&[]);
    unique_assignments(fields, "fields", field_identity, base, ctx, &mut output)?;
    for (i, row) in fields.iter().enumerate() {
        unknown_members(
            row,
            &[
                "module",
                "element",
                "field",
                "storage",
                "column",
                "documentColumn",
                "path",
            ],
            &child(base, &format!("/fields/{i}")),
            ctx,
            &mut output,
        )?;
    }
    let relationships = get(payload, "relationships").and_then(array).unwrap_or(&[]);
    let stable = eq_text(get(payload, "profile"), "umf-binding-2");
    unique_assignments(
        relationships,
        "relationships",
        |row| {
            ElementIdentity(
                get(row, "module").and_then(text).cloned(),
                get(row, if stable { "id" } else { "name" })
                    .and_then(text)
                    .cloned(),
            )
        },
        base,
        ctx,
        &mut output,
    )?;
    for (i, row) in relationships.iter().enumerate() {
        unknown_members(
            row,
            &["module", if stable { "id" } else { "name" }, "storage"],
            &child(base, &format!("/relationships/{i}")),
            ctx,
            &mut output,
        )?;
    }

    for (i, field) in fields.iter().enumerate() {
        charge(ctx, &child(base, &format!("/fields/{i}")), 1)?;
        let storage = get(field, "storage");
        let column = get(field, "column");
        let document_column = get(field, "documentColumn");
        let path = get(field, "path");
        if eq_text(storage, "column") && !truthy(column) {
            push_diag(
                &mut output,
                ctx,
                "BINDING_COLUMN",
                &child(base, &format!("/fields/{i}/column")),
                "Column storage needs an explicit column name",
                Severity::Error,
            )?;
        }
        if eq_text(storage, "column") && (document_column.is_some() || path.is_some()) {
            push_diag(
                &mut output,
                ctx,
                "BINDING_PATH",
                &child(base, &format!("/fields/{i}")),
                "Column storage cannot also declare an embedded path",
                Severity::Error,
            )?;
        }
        if eq_text(storage, "embedded")
            && (document_column.is_none() || path.and_then(array).is_none_or(|p| p.is_empty()))
        {
            push_diag(
                &mut output,
                ctx,
                "BINDING_PATH",
                &child(base, &format!("/fields/{i}")),
                "Embedded storage needs a document column and nonempty path",
                Severity::Error,
            )?;
        }
        if eq_text(storage, "embedded") && column.is_some() {
            push_diag(
                &mut output,
                ctx,
                "BINDING_COLUMN",
                &child(base, &format!("/fields/{i}/column")),
                "Embedded storage cannot also declare a standalone column",
                Severity::Error,
            )?;
        }
    }

    let indexes = get(payload, "indexes").and_then(array).unwrap_or(&[]);
    let mut names: Vec<(ElementIdentity, Option<Utf16>)> = Vec::new();
    for (index, item) in indexes.iter().enumerate() {
        let item_path = child(base, &format!("/indexes/{index}"));
        charge(ctx, &item_path, 1)?;
        unknown_members(
            item,
            &["name", "kind", "on", "predicate", "unique", "include"],
            &item_path,
            ctx,
            &mut output,
        )?;
        let predicate = get(item, "predicate");
        if let Some(predicate) = predicate {
            unknown_members(
                predicate,
                &["language", "version", "expression"],
                &child(&item_path, "/predicate"),
                ctx,
                &mut output,
            )?;
        }
        let kind = get(item, "kind");
        let is_unique = get(item, "unique") == Some(&Value::Bool(true));
        if eq_text(kind, "unique") && !is_unique {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/unique"),
                "Unique kind requires unique true",
                Severity::Error,
            )?;
        }
        if eq_text(kind, "clustering") && is_unique {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/unique"),
                "Clustering cannot be unique",
                Severity::Error,
            )?;
        }
        if eq_text(kind, "partial") && predicate.is_none() {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/predicate"),
                "Partial kind requires a predicate",
                Severity::Error,
            )?;
        }
        if !eq_text(kind, "partial") && predicate.is_some() {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/predicate"),
                "Predicate requires partial kind",
                Severity::Error,
            )?;
        }
        let targets = get(item, "on").and_then(array).unwrap_or(&[]);
        if eq_text(kind, "expression")
            && !targets
                .iter()
                .any(|target| get(target, "documentPath").is_some())
        {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/on"),
                "This expression profile needs a declared embedded document path",
                Severity::Error,
            )?;
        }
        let mut owners = Vec::<ElementIdentity>::new();
        let mut seen_targets: Vec<&Value> = Vec::new();
        for (target_index, target) in targets.iter().enumerate() {
            let target_path = child(&item_path, &format!("/on/{target_index}"));
            charge(ctx, &target_path, 1)?;
            unknown_members(
                target,
                &["field", "documentPath"],
                &target_path,
                ctx,
                &mut output,
            )?;
            let (reference, is_document_path) = if let Some(reference) = get(target, "field") {
                (reference, false)
            } else {
                let document_path = get(target, "documentPath").unwrap_or(&Value::Null);
                unknown_members(
                    document_path,
                    &["field", "path"],
                    &child(&target_path, "/documentPath"),
                    ctx,
                    &mut output,
                )?;
                (get(document_path, "field").unwrap_or(&Value::Null), true)
            };
            if is_document_path {
                let document_path = get(target, "documentPath").unwrap_or(&Value::Null);
                unknown_members(
                    reference,
                    &["module", "element", "field"],
                    &child(&target_path, "/documentPath/field"),
                    ctx,
                    &mut output,
                )?;
                let _ = document_path;
            } else {
                unknown_members(
                    reference,
                    &["module", "element", "field"],
                    &child(&target_path, "/field"),
                    ctx,
                    &mut output,
                )?;
            }
            let reference_identity = field_identity(reference);
            let owner = ElementIdentity(reference_identity.0.clone(), reference_identity.1.clone());
            if !owners.contains(&owner) {
                owners.push(owner.clone());
            }
            if seen_targets.iter().any(|seen| *seen == target) {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &target_path,
                    "Duplicate ordered index target",
                    Severity::Error,
                )?;
            }
            seen_targets.push(target);
            // JS Map construction uses last-assignment-wins for duplicate
            // keys. Keep the earlier duplicate diagnostic, but resolve index
            // targets against the same final assignment.
            let field = fields
                .iter()
                .rev()
                .find(|field| field_identity(field) == reference_identity);
            if field.is_none() {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &target_path,
                    "Index target has no declared field binding",
                    Severity::Error,
                )?;
            } else if is_document_path {
                let field = field.unwrap();
                let doc_path = get(target, "documentPath").unwrap_or(&Value::Null);
                if !eq_text(get(field, "storage"), "embedded")
                    || get(field, "path") != get(doc_path, "path")
                {
                    push_diag(
                        &mut output,
                        ctx,
                        "BINDING_INDEX",
                        &target_path,
                        "Document path differs from embedded field binding",
                        Severity::Error,
                    )?;
                }
            } else if !eq_text(get(field.unwrap(), "storage"), "column") {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &target_path,
                    "Field target requires column storage",
                    Severity::Error,
                )?;
            }
        }
        if owners.len() != 1 {
            push_diag(
                &mut output,
                ctx,
                "BINDING_INDEX",
                &child(&item_path, "/on"),
                "One index cannot span logical owner elements",
                Severity::Error,
            )?;
        }
        let owner = owners
            .first()
            .cloned()
            .unwrap_or(ElementIdentity(None, None));
        let name = get(item, "name").and_then(text).cloned();
        if names.iter().any(|(previous_owner, previous_name)| {
            previous_owner == &owner && previous_name == &name
        }) {
            push_diag(
                &mut output,
                ctx,
                "BINDING_DUPLICATE",
                &child(&item_path, "/name"),
                "Duplicate index name in table scope",
                Severity::Error,
            )?;
        }
        names.push((owner.clone(), name));
        let includes = get(item, "include").and_then(array).unwrap_or(&[]);
        let mut included = Vec::<FieldIdentity>::new();
        for (include_index, reference) in includes.iter().enumerate() {
            let include_path = child(&item_path, &format!("/include/{include_index}"));
            charge(ctx, &include_path, 1)?;
            unknown_members(
                reference,
                &["module", "element", "field"],
                &include_path,
                ctx,
                &mut output,
            )?;
            let key = field_identity(reference);
            let field = fields
                .iter()
                .rev()
                .find(|field| field_identity(field) == key);
            if field.is_none() || !eq_text(get(field.unwrap(), "storage"), "column") {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &include_path,
                    "Included field requires declared column storage",
                    Severity::Error,
                )?;
            }
            let include_owner = ElementIdentity(key.0.clone(), key.1.clone());
            if include_owner != owner {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &include_path,
                    "Included field belongs to another table",
                    Severity::Error,
                )?;
            }
            let on_overlap = targets.iter().any(|target| {
                get(target, "field").is_some_and(|target_field| field_identity(target_field) == key)
            });
            if included.contains(&key) || on_overlap {
                push_diag(
                    &mut output,
                    ctx,
                    "BINDING_INDEX",
                    &include_path,
                    "Duplicate or overlapping include field",
                    Severity::Error,
                )?;
            }
            included.push(key);
        }
    }
    Ok(output)
}

fn unknown_members(
    value: &Value,
    allowed: &[&str],
    path: &Utf16,
    ctx: &mut Context<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    let Some(fields) = (match value {
        Value::Object(fields) => Some(fields),
        _ => None,
    }) else {
        return Ok(());
    };
    // ECMAScript own-key order enumerates canonical array-index keys first
    // (ascending), then other string keys in insertion order. Rust Values
    // retain source order, so build a metered index before emitting warnings.
    if !fields.is_empty() {
        let levels = (usize::BITS - fields.len().leading_zeros()) as usize;
        ctx.charge_work(fields.len().saturating_mul(levels.max(1)), path.clone())?;
    }
    let mut order = (0..fields.len()).collect::<Vec<_>>();
    order.sort_by(|left, right| {
        let left_key = ecmascript_array_index(&fields[*left].0);
        let right_key = ecmascript_array_index(&fields[*right].0);
        match (left_key, right_key) {
            (Some(left), Some(right)) => left.cmp(&right),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => left.cmp(right),
        }
    });
    for index in order {
        let (name, _) = &fields[index];
        charge(ctx, path, name.len().saturating_add(1))?;
        if !allowed.iter().any(|known| name == &key(known)) {
            let slash_and_name = child_utf16(&Utf16::from("/"), &pointer_escape(name));
            let unknown_path = child_utf16(path, &slash_and_name);
            push_diag(
                diagnostics,
                ctx,
                "BINDING_UNKNOWN",
                &unknown_path,
                "Unknown binding content retained",
                Severity::Warning,
            )?;
        }
    }
    Ok(())
}

fn ecmascript_array_index(name: &Utf16) -> Option<u32> {
    let units = name.units();
    if units.is_empty() || (units.len() > 1 && units[0] == u16::from(b'0')) {
        return None;
    }
    let mut value = 0u64;
    for unit in units {
        if !(u16::from(b'0')..=u16::from(b'9')).contains(unit) {
            return None;
        }
        value = value
            .checked_mul(10)?
            .checked_add(u64::from(*unit - u16::from(b'0')))?;
        if value >= u64::from(u32::MAX) {
            return None;
        }
    }
    Some(value as u32)
}

fn unique_assignments<T: PartialEq>(
    rows: &[Value],
    label: &str,
    identity: impl Fn(&Value) -> T,
    base: &Utf16,
    ctx: &mut Context<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    let mut seen = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        charge(ctx, &child(base, &format!("/{label}/{index}")), 1)?;
        let key = identity(row);
        if seen.contains(&key) {
            push_diag(
                diagnostics,
                ctx,
                "BINDING_DUPLICATE",
                &child(base, &format!("/{label}/{index}")),
                &format!("Duplicate {label} assignment"),
                Severity::Error,
            )?;
        }
        seen.push(key);
    }
    Ok(())
}

fn logical_element_exists(
    logical: &Value,
    module_id: &Option<Utf16>,
    element_id: &Option<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    Ok(logical_element(logical, module_id, element_id, ctx)?.is_some())
}
fn logical_element<'a>(
    logical: &'a Value,
    module_id: &Option<Utf16>,
    element_id: &Option<Utf16>,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let (Some(module_id), Some(element_id)) = (module_id, element_id) else {
        return Ok(None);
    };
    for module in get(logical, "modules").and_then(array).unwrap_or(&[]) {
        charge(
            ctx,
            &Utf16::from("/modules"),
            module_id.len().saturating_add(1),
        )?;
        if get(module, "id") != Some(&Value::String(module_id.clone())) {
            continue;
        }
        for element in get(module, "elements").and_then(array).unwrap_or(&[]) {
            charge(
                ctx,
                &Utf16::from("/elements"),
                element_id.len().saturating_add(1),
            )?;
            if get(element, "id") == Some(&Value::String(element_id.clone())) {
                return Ok(Some(element));
            }
        }
    }
    Ok(None)
}
fn logical_relationship_count(
    logical: &Value,
    module_id: Option<&Utf16>,
    relationship_id: Option<&Value>,
    stable: bool,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    let (Some(module_id), Some(relationship_id)) = (module_id, relationship_id) else {
        return Ok(0);
    };
    let mut count = 0;
    for module in get(logical, "modules").and_then(array).unwrap_or(&[]) {
        charge(
            ctx,
            &Utf16::from("/modules"),
            module_id.len().saturating_add(1),
        )?;
        if get(module, "id") != Some(&Value::String(module_id.clone())) {
            continue;
        }
        if let Some(rows) = get(module, "relationships").and_then(array) {
            for row in rows {
                charge(ctx, &Utf16::from("/relationships"), 1)?;
                let key = if stable { "id" } else { "name" };
                if get(row, key) == Some(relationship_id) {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

fn ref_identity(value: &Value) -> (Option<Utf16>, Option<Utf16>) {
    (
        get(value, "module").and_then(text).cloned(),
        get(value, "element").and_then(text).cloned(),
    )
}
fn field_identity(value: &Value) -> FieldIdentity {
    FieldIdentity(
        get(value, "module").and_then(text).cloned(),
        get(value, "element").and_then(text).cloned(),
        get(value, "field").and_then(text).cloned(),
    )
}
fn object_has(value: &Value, name: &Utf16) -> bool {
    matches!(value, Value::Object(fields) if fields.iter().any(|(key, _)| key == name))
}
fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Number(value)) => *value != 0.0,
        _ => true,
    }
}
fn key(name: &str) -> Utf16 {
    Utf16::from(name)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(rows) = value {
        Some(rows)
    } else {
        None
    }
}
fn text(value: &Value) -> Option<&Utf16> {
    if let Value::String(text) = value {
        Some(text)
    } else {
        None
    }
}
fn eq_text(value: Option<&Value>, expected: &str) -> bool {
    value.and_then(text).is_some_and(|v| v == &key(expected))
}
fn eq_value_text(value: Option<&Value>, expected: &str) -> bool {
    eq_text(value, expected)
}
fn child(path: &Utf16, suffix: &str) -> Utf16 {
    let mut units = path.units().to_vec();
    units.extend(suffix.encode_utf16());
    Utf16::new(units)
}
fn child_utf16(path: &Utf16, suffix: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.extend_from_slice(suffix.units());
    Utf16::new(units)
}
fn pointer_escape(source: &Utf16) -> Utf16 {
    let mut units = Vec::with_capacity(source.len());
    for unit in source.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}
fn charge(ctx: &mut Context<'_>, path: &Utf16, work: usize) -> Result<(), EngineError> {
    ctx.charge_work(work.max(1), path.clone())
}
fn push_diag(
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
    code: &str,
    path: &Utf16,
    message: &str,
    severity: Severity,
) -> Result<(), EngineError> {
    let code = Utf16::from(code);
    let message = Utf16::from(message);
    ctx.charge_work(
        code.len()
            .saturating_add(path.len())
            .saturating_add(message.len())
            .saturating_add(1),
        path.clone(),
    )?;
    diagnostics.push(Diagnostic {
        code,
        path: path.clone(),
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    });
    Ok(())
}
fn from_diagnostics(diagnostics: Vec<Diagnostic>) -> Validation {
    validation(diagnostics)
}
fn admission_validation(error: EngineError) -> Validation {
    from_diagnostics(vec![Diagnostic {
        code: Utf16::from(error.code),
        path: error.path,
        python_source_path: false,
        message: error.message,
        severity: Severity::Error,
        python_text_origin: None,
    }])
}
/// Copy one inspector input in the same own-property order as ECMAScript
/// `Object.entries`: array-index keys ascend before insertion-ordered strings.
/// The implementation is local so ordinary core admission and other callers
/// retain their established Rust Value ordering behavior.
fn copy_inspection_input(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    fn visit(
        value: &Value,
        ctx: &mut Context<'_>,
        path: &Utf16,
        depth: usize,
        tree_values: &mut usize,
    ) -> Result<Value, EngineError> {
        ctx.charge_work(1, path.clone())?;
        *tree_values = tree_values
            .checked_add(1)
            .ok_or_else(|| EngineError::new("LIMIT", path.clone(), "JSON value count overflow"))?;
        ctx.check_tree_value_count(*tree_values, path.clone())?;
        if depth > ctx.limits().max_depth {
            return Err(EngineError::new(
                "LIMIT",
                path.clone(),
                "JSON nesting depth exceeded",
            ));
        }
        match value {
            Value::Null => Ok(Value::Null),
            Value::Bool(value) => Ok(Value::Bool(*value)),
            Value::Number(value) => Value::number(*value, path.clone()),
            Value::String(value) => {
                ctx.charge_work(value.len(), path.clone())?;
                Ok(Value::String(value.clone()))
            }
            Value::Array(items) => {
                if items.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(items.len(), path.clone())?;
                let mut copy = Vec::with_capacity(items.len());
                for (index, item) in items.iter().enumerate() {
                    let child_path = admission_child(path, &Utf16::from(index.to_string()));
                    copy.push(visit(item, ctx, &child_path, depth + 1, tree_values)?);
                }
                Ok(Value::Array(copy))
            }
            Value::Object(members) => {
                if members.len() > ctx.limits().max_values.saturating_sub(*tree_values) {
                    return Err(EngineError::new(
                        "LIMIT",
                        path.clone(),
                        "JSON structural value limit exceeded",
                    ));
                }
                ctx.charge_work(members.len(), path.clone())?;
                let mut seen = BTreeSet::new();
                let mut copy = Vec::with_capacity(members.len());
                if members.len() > 1 {
                    let levels = (usize::BITS - members.len().leading_zeros()) as usize;
                    let key_units = members
                        .iter()
                        .fold(0usize, |total, (key, _)| total.saturating_add(key.len()));
                    let ordering_work = members
                        .len()
                        .saturating_add(key_units)
                        .saturating_mul(levels.max(1));
                    ctx.charge_work(ordering_work, path.clone())?;
                }
                let mut order = (0..members.len()).collect::<Vec<_>>();
                order.sort_by(|left, right| {
                    let left_index = ecmascript_array_index(&members[*left].0);
                    let right_index = ecmascript_array_index(&members[*right].0);
                    match (left_index, right_index) {
                        (Some(left), Some(right)) => left.cmp(&right),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        (None, None) => left.cmp(right),
                    }
                });
                for index in order {
                    let (key, item) = &members[index];
                    ctx.charge_work(key.len(), path.clone())?;
                    if !seen.insert(key.units().to_vec()) {
                        return Err(EngineError::new(
                            "DUPLICATE_KEY",
                            path.clone(),
                            "Duplicate object key",
                        ));
                    }
                    let child_path = admission_child(path, key);
                    copy.push((
                        key.clone(),
                        visit(item, ctx, &child_path, depth + 1, tree_values)?,
                    ));
                }
                Ok(Value::Object(copy))
            }
        }
    }

    let mut tree_values = 0;
    visit(value, ctx, &Utf16::default(), 0, &mut tree_values)
}

fn admission_child(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match unit {
            0x7e => units.extend([0x7e, 0x30]),
            0x2f => units.extend([0x7e, 0x31]),
            other => units.push(*other),
        }
    }
    Utf16::new(units)
}
fn complete_predecessor_schema_diagnostics(
    base: Validation,
    binding: &Value,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let payload = get(
        get(binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    );
    let fields = payload
        .and_then(|payload| get(payload, "fields"))
        .and_then(array)
        .unwrap_or(&[]);
    let mut diagnostics = Vec::with_capacity(base.diagnostics.len().saturating_add(1));
    for diagnostic in base.diagnostics {
        let missing_else_branch = diagnostic.code == Utf16::from("EXTENSION_STRUCTURE")
            && diagnostic.message == Utf16::from("must NOT be valid");
        let field_index = diagnostic.path.to_utf8().ok().and_then(|path| {
            path.strip_prefix("/extensions/umf.binding/fields/")
                .and_then(|suffix| suffix.parse::<usize>().ok())
        });
        let needs_else_branch =
            field_index
                .and_then(|index| fields.get(index))
                .is_some_and(|field| {
                    eq_text(get(field, "storage"), "column")
                        && (get(field, "path").is_some() || get(field, "documentColumn").is_some())
                });
        let path = diagnostic.path.clone();
        diagnostics.push(diagnostic);
        if missing_else_branch && needs_else_branch {
            push_diag(
                &mut diagnostics,
                ctx,
                "EXTENSION_STRUCTURE",
                &path,
                "must match \"else\" schema",
                Severity::Error,
            )?;
        }
    }
    Ok(from_diagnostics(diagnostics))
}
fn validation(diagnostics: Vec<Diagnostic>) -> Validation {
    let valid = !diagnostics
        .iter()
        .any(|item| item.severity == Severity::Error);
    let complete = diagnostics.is_empty();
    Validation {
        valid,
        complete,
        diagnostics,
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
