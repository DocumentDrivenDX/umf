// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in Rust implementation of the generic `umf.binding` index capability
//! projection. Native DDL/catalog validation remains target-specific and lives
//! outside this module.
use crate::{
    context::Context,
    engine::{Capabilities, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError},
    registry::Registry,
    schema::{CompiledSchema, SchemaResources},
    serialization::{Format, read_json_value, stringify_compact_metered},
    value::{Utf16, Value, copy_json},
};

/// Version of this opt-in generic projection profile. It does not activate a
/// Delta/Iceberg projection or establish native index enforcement.
pub const BINDING_INDEX_PROJECTION_PROFILE: &str = "umf-r5-binding-index-projection/0.1.0";

/// Immutable validator resources prepared once and reused across projection
/// calls. Every call still meters parsing, validation, copying and output on
/// its own live Context; no callback or mutable Context is retained here.
pub struct BindingIndexProjectionResources {
    engine: Engine,
    binding_schema_01: CompiledSchema,
    binding_schema_02: CompiledSchema,
}

impl BindingIndexProjectionResources {
    /// Load and compile the pinned core and binding schemas. Callers should
    /// retain this value for repeated operations and construct it without a
    /// lock held across projection calls.
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
        fn compile_binding_schema(
            package_source: &str,
            ctx: &mut Context<'_>,
        ) -> Result<CompiledSchema, EngineError> {
            let package = resource(package_source, ctx)?;
            let schema = get(&package, "schema").ok_or_else(|| {
                err(
                    "BINDING_VALIDATION_UNAVAILABLE",
                    "/extensions/umf.binding",
                    "Pinned binding schema resource is incomplete",
                )
            })?;
            CompiledSchema::compile(schema, &SchemaResources::default(), ctx)
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
        let binding_schema_01 = compile_binding_schema(
            include_str!("../../../spec/extensions/binding/package.json"),
            ctx,
        )?;
        let binding_schema_02 = compile_binding_schema(
            include_str!("../../../spec/extensions/binding-stable/package.json"),
            ctx,
        )?;
        Ok(Self {
            engine,
            binding_schema_01,
            binding_schema_02,
        })
    }

    fn validate_document(
        &self,
        document: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<bool, EngineError> {
        let mut registry = Registry::new();
        let mut capabilities = NoExtensionCapabilities;
        Ok(self
            .engine
            .validate_document(document, &mut registry, &mut capabilities, ctx)?
            .valid)
    }

    fn validate_binding_schema(
        &self,
        payload: &Value,
        version: &str,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Value>, EngineError> {
        let schema = if version == "0.2.0" {
            &self.binding_schema_02
        } else {
            &self.binding_schema_01
        };
        let structural = schema.validate(payload, ctx)?;
        Ok(structural
            .into_iter()
            .map(|item| {
                diagnostic(
                    "BINDING_SCHEMA",
                    &item.instance_path.to_utf8().unwrap_or_default(),
                    &item.message.to_utf8().unwrap_or_default(),
                )
            })
            .collect())
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
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn text(value: &Value) -> Option<&Utf16> {
    if let Value::String(value) = value {
        Some(value)
    } else {
        None
    }
}
fn eq_text(value: Option<&Value>, expected: &str) -> bool {
    text_opt(value).as_deref() == Some(expected)
}
fn text_opt(value: Option<&Value>) -> Option<String> {
    text(value?).and_then(|s| s.to_utf8().ok())
}
fn err(code: &str, path: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn charge(ctx: &mut Context<'_>, path: &str, amount: usize) -> Result<(), EngineError> {
    ctx.charge_work(amount.max(1), Utf16::from(path))
}
fn ordered_object(items: Vec<(&str, Value)>) -> Value {
    Value::Object(items.into_iter().map(|(k, v)| (key(k), v)).collect())
}
fn s(value: impl Into<Utf16>) -> Value {
    Value::String(value.into())
}
fn diagnostic(code: &str, path: &str, message: &str) -> Value {
    ordered_object(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s("error")),
    ])
}
fn document_error(
    diagnostics: Vec<Value>,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let encoded = stringify_compact_metered(&Value::Array(diagnostics), ctx)?;
    let message = encoded.to_utf8().unwrap_or_else(|_| "[]".to_owned());
    Ok(EngineError::new(
        "BINDING_DOCUMENT",
        Utf16::default(),
        message,
    ))
}

fn object_unknown(
    value: &Value,
    allowed: &[&str],
    path: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let Some(fields) = (match value {
        Value::Object(fields) => Some(fields),
        _ => None,
    }) else {
        return Ok(false);
    };
    let mut found = false;
    for (name, _) in fields {
        charge(ctx, path, name.len())?;
        if !allowed.iter().any(|known| name == &key(known)) {
            found = true;
        }
    }
    Ok(found)
}

/// Scan binding extension objects with the same known-member boundaries as the
/// predecessor inspector. Unknown refinements are retained but refuse lowering.
fn has_unknown_binding(payload: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut unknown = object_unknown(
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
        "/extensions/umf.binding",
        ctx,
    )?;
    for (name, allowed) in [
        ("logical", &["documentId", "coreVersion"][..]),
        ("target", &["system", "version", "subset"][..]),
    ] {
        if let Some(value) = get(payload, name) {
            unknown |= object_unknown(
                value,
                allowed,
                &format!("/extensions/umf.binding/{name}"),
                ctx,
            )?;
        }
    }
    for (list, allowed) in [
        ("elements", &["module", "element", "partition", "table"][..]),
        (
            "fields",
            &[
                "module",
                "element",
                "field",
                "storage",
                "column",
                "documentColumn",
                "path",
            ][..],
        ),
        ("relationships", &["module", "name", "id", "storage"][..]),
    ] {
        if let Some(rows) = get(payload, list).and_then(array) {
            for (i, row) in rows.iter().enumerate() {
                charge(ctx, &format!("/extensions/umf.binding/{list}/{i}"), 1)?;
                unknown |= object_unknown(
                    row,
                    allowed,
                    &format!("/extensions/umf.binding/{list}/{i}"),
                    ctx,
                )?;
            }
        }
    }
    if let Some(rows) = get(payload, "indexes").and_then(array) {
        for (i, item) in rows.iter().enumerate() {
            let base = format!("/extensions/umf.binding/indexes/{i}");
            charge(ctx, &base, 1)?;
            unknown |= object_unknown(
                item,
                &["name", "kind", "on", "predicate", "unique", "include"],
                &base,
                ctx,
            )?;
            if let Some(predicate) = get(item, "predicate") {
                unknown |= object_unknown(
                    predicate,
                    &["language", "version", "expression"],
                    &format!("{base}/predicate"),
                    ctx,
                )?;
            }
            if let Some(targets) = get(item, "on").and_then(array) {
                for (j, target) in targets.iter().enumerate() {
                    let path = format!("{base}/on/{j}");
                    charge(ctx, &path, 1)?;
                    unknown |= object_unknown(target, &["field", "documentPath"], &path, ctx)?;
                    if let Some(doc_path) = get(target, "documentPath") {
                        unknown |= object_unknown(
                            doc_path,
                            &["field", "path"],
                            &format!("{path}/documentPath"),
                            ctx,
                        )?;
                        if let Some(reference) = get(doc_path, "field") {
                            unknown |= object_unknown(
                                reference,
                                &["module", "element", "field"],
                                &format!("{path}/documentPath/field"),
                                ctx,
                            )?;
                        }
                    }
                    if let Some(reference) = get(target, "field") {
                        unknown |= object_unknown(
                            reference,
                            &["module", "element", "field"],
                            &format!("{path}/field"),
                            ctx,
                        )?;
                    }
                }
            }
            if let Some(includes) = get(item, "include").and_then(array) {
                for (j, include) in includes.iter().enumerate() {
                    charge(ctx, &format!("{base}/include/{j}"), 1)?;
                    unknown |= object_unknown(
                        include,
                        &["module", "element", "field"],
                        &format!("{base}/include/{j}"),
                        ctx,
                    )?;
                }
            }
        }
    }
    Ok(unknown)
}

fn ref_identity(value: &Value) -> (Option<Utf16>, Option<Utf16>, Option<Utf16>) {
    (
        get(value, "module").and_then(text).cloned(),
        get(value, "element").and_then(text).cloned(),
        get(value, "field").and_then(text).cloned(),
    )
}
fn owner_identity(value: &Value) -> (Option<Utf16>, Option<Utf16>) {
    let (module, element, _) = ref_identity(value);
    (module, element)
}
fn same_path(left: Option<&Value>, right: Option<&Value>) -> bool {
    match (left.and_then(array), right.and_then(array)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}
fn ref_matches(field: &Value, reference: &Value) -> bool {
    ref_identity(field) == ref_identity(reference)
}
fn field_for<'a>(fields: &'a [Value], reference: &Value) -> Option<&'a Value> {
    fields.iter().find(|field| ref_matches(field, reference))
}
fn logical_element<'a>(
    logical: &'a Value,
    module_id: &Utf16,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    let Some(modules) = get(logical, "modules").and_then(array) else {
        return Ok(None);
    };
    for (module_index, module) in modules.iter().enumerate() {
        charge(ctx, &format!("/modules/{module_index}"), 1)?;
        if get(module, "id").and_then(text) != Some(module_id) {
            continue;
        }
        let Some(elements) = get(module, "elements").and_then(array) else {
            return Ok(None);
        };
        for (element_index, element) in elements.iter().enumerate() {
            charge(
                ctx,
                &format!("/modules/{module_index}/elements/{element_index}"),
                1,
            )?;
            if get(element, "id").and_then(text) == Some(element_id) {
                return Ok(Some(element));
            }
        }
    }
    Ok(None)
}
fn relationship_exists(
    logical: &Value,
    module_id: &Utf16,
    relationship_id: &Utf16,
    stable: bool,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    let Some(modules) = get(logical, "modules").and_then(array) else {
        return Ok(0);
    };
    for (module_index, module) in modules.iter().enumerate() {
        charge(ctx, &format!("/modules/{module_index}"), 1)?;
        if get(module, "id").and_then(text) != Some(module_id) {
            continue;
        }
        let Some(relationships) = get(module, "relationships").and_then(array) else {
            return Ok(0);
        };
        let mut count = 0;
        for (index, relationship) in relationships.iter().enumerate() {
            charge(
                ctx,
                &format!("/modules/{module_index}/relationships/{index}"),
                1,
            )?;
            let key = if stable { "id" } else { "name" };
            if get(relationship, key).and_then(text) == Some(relationship_id) {
                count += 1;
            }
        }
        return Ok(count);
    }
    Ok(0)
}
fn validate_binding(
    resources: &BindingIndexProjectionResources,
    payload: &Value,
    binding: &Value,
    logical: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let mut diagnostics = Vec::new();
    let version = get(
        get(binding, "vocabularies").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .and_then(|v| get(v, "version"));
    if !eq_text(version, "0.1.0") && !eq_text(version, "0.2.0") {
        diagnostics.push(diagnostic(
            "BINDING_PROFILE",
            "/extensions",
            "Expected a document-scoped umf.binding 0.1.0 or 0.2.0 payload",
        ));
        return Err(document_error(diagnostics, ctx)?);
    }
    let version_text = text_opt(version).unwrap_or_default();
    let schema_diagnostics = resources.validate_binding_schema(payload, &version_text, ctx)?;
    if !schema_diagnostics.is_empty() {
        return Err(document_error(schema_diagnostics, ctx)?);
    }
    let payload_profile = get(payload, "profile");
    if !eq_text(payload_profile, "umf-binding-1") && !eq_text(payload_profile, "umf-binding-2") {
        diagnostics.push(diagnostic(
            "BINDING_PROFILE",
            "/extensions/umf.binding/profile",
            "Unsupported binding profile",
        ));
    }
    if !resources.validate_document(logical, ctx)? {
        diagnostics.push(diagnostic(
            "BINDING_MODEL",
            "/extensions/umf.binding/logical",
            "Supplied logical document is invalid",
        ));
        return Err(document_error(diagnostics, ctx)?);
    }
    let payload_logical = get(payload, "logical").unwrap_or(&Value::Null);
    let logical_mismatch = get(payload_logical, "documentId") != get(logical, "id")
        || get(payload_logical, "coreVersion") != get(logical, "umf");
    if logical_mismatch {
        diagnostics.push(diagnostic(
            "BINDING_MODEL",
            "/extensions/umf.binding/logical",
            "Logical document id/version mismatch",
        ));
    }
    if get(binding, "modules")
        .and_then(array)
        .is_some_and(|rows| !rows.is_empty())
    {
        diagnostics.push(diagnostic(
            "BINDING_SCOPE",
            "/modules",
            "A binding document does not contain logical modules",
        ));
    }
    let elements = get(payload, "elements").and_then(array).unwrap_or(&[]);
    let fields = get(payload, "fields").and_then(array).unwrap_or(&[]);
    let relationships = get(payload, "relationships").and_then(array).unwrap_or(&[]);
    let indexes = get(payload, "indexes").and_then(array).unwrap_or(&[]);

    let mut seen_elements = Vec::new();
    for (index, item) in elements.iter().enumerate() {
        let identity = owner_identity(item);
        charge(ctx, &format!("/extensions/umf.binding/elements/{index}"), 1)?;
        if seen_elements.contains(&identity) {
            diagnostics.push(diagnostic(
                "BINDING_DUPLICATE",
                &format!("/extensions/umf.binding/elements/{index}"),
                "Duplicate elements assignment",
            ));
        }
        seen_elements.push(identity.clone());
        let exists = match (&identity.0, &identity.1) {
            (Some(module), Some(element)) => {
                logical_element(logical, module, element, ctx)?.is_some()
            }
            _ => false,
        };
        if !exists {
            diagnostics.push(diagnostic(
                "BINDING_REFERENCE",
                &format!("/extensions/umf.binding/elements/{index}"),
                "Missing logical element",
            ));
        }
    }

    let stable_profile = eq_text(payload_profile, "umf-binding-2");
    let mut seen_relationships = Vec::new();
    for (index, item) in relationships.iter().enumerate() {
        charge(
            ctx,
            &format!("/extensions/umf.binding/relationships/{index}"),
            1,
        )?;
        let module = get(item, "module").and_then(text).cloned();
        let relation = get(item, if stable_profile { "id" } else { "name" })
            .and_then(text)
            .cloned();
        let identity = (module.clone(), relation.clone());
        if seen_relationships.contains(&identity) {
            diagnostics.push(diagnostic(
                "BINDING_DUPLICATE",
                &format!("/extensions/umf.binding/relationships/{index}"),
                "Duplicate relationships assignment",
            ));
        }
        seen_relationships.push(identity);
        let matches = match (module, relation) {
            (Some(module), Some(relation)) => {
                relationship_exists(logical, &module, &relation, stable_profile, ctx)?
            }
            _ => 0,
        };
        if (stable_profile && !eq_text(get(logical, "umf"), "0.10.0")) || matches != 1 {
            diagnostics.push(diagnostic(
                "BINDING_REFERENCE",
                &format!("/extensions/umf.binding/relationships/{index}"),
                "Missing authored relationship",
            ));
        }
    }

    let mut seen_fields = Vec::new();
    for (index, item) in fields.iter().enumerate() {
        let identity = ref_identity(item);
        charge(ctx, &format!("/extensions/umf.binding/fields/{index}"), 1)?;
        if seen_fields.contains(&identity) {
            diagnostics.push(diagnostic(
                "BINDING_DUPLICATE",
                &format!("/extensions/umf.binding/fields/{index}"),
                "Duplicate fields assignment",
            ));
        }
        seen_fields.push(identity.clone());
        let found = match (&identity.0, &identity.1, &identity.2) {
            (Some(module), Some(element), None) => logical_element(logical, module, element, ctx)?
                .is_some_and(|row| eq_text(get(row, "kind"), "field")),
            (Some(module), Some(element), Some(field)) => {
                logical_element(logical, module, element, ctx)?.is_some_and(|row| {
                    match get(get(row, "extensions").unwrap_or(&Value::Null), "umf.ddd")
                        .and_then(|ddd| get(ddd, "fields"))
                    {
                        Some(Value::Object(fields)) => fields.iter().any(|(key, _)| key == field),
                        _ => false,
                    }
                })
            }
            _ => false,
        };
        if !found {
            diagnostics.push(diagnostic(
                "BINDING_REFERENCE",
                &format!("/extensions/umf.binding/fields/{index}"),
                "Missing exact logical Field or DDD owner/field",
            ));
        }
        if eq_text(get(item, "storage"), "column") {
            if text_opt(get(item, "column")).is_none_or(|value| value.is_empty()) {
                diagnostics.push(diagnostic(
                    "BINDING_COLUMN",
                    &format!("/extensions/umf.binding/fields/{index}/column"),
                    "Column storage needs an explicit column name",
                ));
            }
            if get(item, "documentColumn").is_some() || get(item, "path").is_some() {
                diagnostics.push(diagnostic(
                    "BINDING_PATH",
                    &format!("/extensions/umf.binding/fields/{index}"),
                    "Column storage cannot also declare an embedded path",
                ));
            }
        } else if eq_text(get(item, "storage"), "embedded") {
            if get(item, "documentColumn").is_none()
                || get(item, "path")
                    .and_then(array)
                    .is_none_or(|path| path.is_empty())
            {
                diagnostics.push(diagnostic(
                    "BINDING_PATH",
                    &format!("/extensions/umf.binding/fields/{index}"),
                    "Embedded storage needs a document column and nonempty path",
                ));
            }
            if get(item, "column").is_some() {
                diagnostics.push(diagnostic(
                    "BINDING_COLUMN",
                    &format!("/extensions/umf.binding/fields/{index}/column"),
                    "Embedded storage cannot also declare a standalone column",
                ));
            }
        }
    }

    let mut seen_index_names = Vec::new();
    for (i, item) in indexes.iter().enumerate() {
        let base = format!("/extensions/umf.binding/indexes/{i}");
        charge(ctx, &base, 1)?;
        let kind = text_opt(get(item, "kind"));
        let unique = get(item, "unique") == Some(&Value::Bool(true));
        if kind.as_deref() == Some("unique") && !unique {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/unique"),
                "Unique kind requires unique true",
            ));
        }
        if kind.as_deref() == Some("clustering") && unique {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/unique"),
                "Clustering cannot be unique",
            ));
        }
        if kind.as_deref() == Some("partial") && get(item, "predicate").is_none() {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/predicate"),
                "Partial kind requires a predicate",
            ));
        }
        if kind.as_deref() != Some("partial") && get(item, "predicate").is_some() {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/predicate"),
                "Predicate requires partial kind",
            ));
        }
        if kind.as_deref() == Some("expression")
            && !get(item, "on")
                .and_then(array)
                .unwrap_or(&[])
                .iter()
                .any(|target| get(target, "documentPath").is_some())
        {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/on"),
                "This expression profile needs a declared embedded document path",
            ));
        }
        let mut owners = Vec::new();
        let mut seen_targets = Vec::new();
        let targets = get(item, "on").and_then(array).unwrap_or(&[]);
        for (j, target) in targets.iter().enumerate() {
            let path = format!("{base}/on/{j}");
            charge(ctx, &path, 1)?;
            if seen_targets.contains(target) {
                diagnostics.push(diagnostic(
                    "BINDING_INDEX",
                    &path,
                    "Duplicate ordered index target",
                ));
            }
            seen_targets.push(target.clone());
            let reference = get(target, "field")
                .or_else(|| get(get(target, "documentPath").unwrap_or(&Value::Null), "field"));
            if let Some(reference) = reference {
                let owner = owner_identity(reference);
                if !owners.contains(&owner) {
                    owners.push(owner);
                }
                let bound = field_for(fields, reference);
                if bound.is_none() {
                    diagnostics.push(diagnostic(
                        "BINDING_INDEX",
                        &path,
                        "Index target has no declared field binding",
                    ));
                } else if let Some(doc_path) = get(target, "documentPath") {
                    let binding_path = get(bound.unwrap(), "path");
                    if !eq_text(get(bound.unwrap(), "storage"), "embedded")
                        || !same_path(binding_path, get(doc_path, "path"))
                    {
                        diagnostics.push(diagnostic(
                            "BINDING_INDEX",
                            &path,
                            "Document path differs from embedded field binding",
                        ));
                    }
                } else if !eq_text(get(bound.unwrap(), "storage"), "column") {
                    diagnostics.push(diagnostic(
                        "BINDING_INDEX",
                        &path,
                        "Field target requires column storage",
                    ));
                }
            }
        }
        if owners.len() != 1 {
            diagnostics.push(diagnostic(
                "BINDING_INDEX",
                &format!("{base}/on"),
                "One index cannot span logical owner elements",
            ));
        }
        let owner = owners.first().cloned().unwrap_or_default();
        let scoped_name = (owner.clone(), get(item, "name").and_then(text).cloned());
        if seen_index_names.contains(&scoped_name) {
            diagnostics.push(diagnostic(
                "BINDING_DUPLICATE",
                &format!("/extensions/umf.binding/indexes/{i}/name"),
                "Duplicate index name in table scope",
            ));
        }
        seen_index_names.push(scoped_name);
        if let Some(includes) = get(item, "include").and_then(array) {
            let mut seen = Vec::new();
            for (j, reference) in includes.iter().enumerate() {
                let path = format!("{base}/include/{j}");
                charge(ctx, &path, 1)?;
                let field = field_for(fields, reference);
                if field.is_none()
                    || !eq_text(get(field.unwrap_or(&Value::Null), "storage"), "column")
                {
                    diagnostics.push(diagnostic(
                        "BINDING_INDEX",
                        &path,
                        "Included field requires declared column storage",
                    ));
                }
                if owner_identity(reference) != owner {
                    diagnostics.push(diagnostic(
                        "BINDING_INDEX",
                        &path,
                        "Included field belongs to another table",
                    ));
                }
                if seen.iter().any(|value| value == reference)
                    || targets
                        .iter()
                        .any(|target| get(target, "field") == Some(reference))
                {
                    diagnostics.push(diagnostic(
                        "BINDING_INDEX",
                        &path,
                        "Duplicate or overlapping include field",
                    ));
                }
                seen.push(reference.clone());
            }
        }
    }
    if !diagnostics.is_empty() {
        return Err(document_error(diagnostics, ctx)?);
    }
    Ok(())
}

fn outcome(
    item: &Value,
    target: &Value,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let path = format!("/extensions/umf.binding/indexes/{index}");
    charge(ctx, &path, 1)?;
    let name = get(item, "name").cloned().unwrap_or(Value::Null);
    let kind = text_opt(get(item, "kind"));
    let system = text_opt(get(target, "system"));
    let version = text_opt(get(target, "version"));
    let (state, reason) = if system.as_deref() == Some("postgresql")
        && version.as_ref().is_some_and(|v| v.starts_with("17"))
    {
        if kind.as_deref() == Some("clustering") {
            (
                "not-expressible",
                Some("PostgreSQL clustering is not a declared index kind"),
            )
        } else if get(item, "predicate").is_some_and(|p| {
            !eq_text(get(p, "language"), "postgresql")
                || !text_opt(get(p, "version")).is_some_and(|v| v.starts_with("17"))
        }) {
            (
                "unknown",
                Some("Predicate language/version is not the selected PostgreSQL profile"),
            )
        } else {
            ("exact", None)
        }
    } else if system.as_deref() == Some("sqlserver") {
        if kind.as_deref() == Some("btree")
            || kind.as_deref() == Some("unique")
            || kind.as_deref() == Some("partial")
                && get(item, "predicate").is_some_and(|p| eq_text(get(p, "language"), "tsql"))
        {
            ("exact", None)
        } else {
            (
                "not-expressible",
                Some("No supported SQL Server index carrier for this kind"),
            )
        }
    } else if system.as_deref() == Some("delta") {
        if kind.as_deref() != Some("clustering") {
            (
                "not-expressible",
                Some("Delta profile only represents liquid clustering"),
            )
        } else if !delta_version(version.as_deref()) {
            (
                "unknown",
                Some("Liquid-clustering profile requires pinned Delta 3.2 or later 3.x"),
            )
        } else {
            let targets = get(item, "on").and_then(array).unwrap_or(&[]);
            let invalid = targets.len() > 4
                || get(item, "include")
                    .and_then(array)
                    .is_some_and(|v| !v.is_empty())
                || targets.iter().any(|t| get(t, "documentPath").is_some());
            if invalid {
                (
                    "not-expressible",
                    Some(
                        "Liquid clustering requires at most four direct columns and no included or document-path targets",
                    ),
                )
            } else {
                ("exact", None)
            }
        }
    } else if system.as_deref() == Some("iceberg") {
        if kind.as_deref() != Some("clustering") {
            (
                "not-expressible",
                Some("No Iceberg index carrier for this kind"),
            )
        } else if !iceberg_version(version.as_deref()) {
            (
                "unknown",
                Some("Sort-order analogue requires a pinned Iceberg v2 or v3 metadata profile"),
            )
        } else if get(item, "include")
            .and_then(array)
            .is_some_and(|v| !v.is_empty())
            || get(item, "on")
                .and_then(array)
                .unwrap_or(&[])
                .iter()
                .any(|t| get(t, "documentPath").is_some())
        {
            (
                "not-expressible",
                Some(
                    "This Iceberg profile maps direct columns only; includes and document paths are unsupported",
                ),
            )
        } else {
            (
                "approximated",
                Some(
                    "Default sort order is a writer hint, not an enforced index or clustering guarantee",
                ),
            )
        }
    } else if system.as_deref() == Some("parquet") {
        (
            "not-expressible",
            Some("Parquet file schema does not enforce indexes"),
        )
    } else {
        (
            "unknown",
            Some("Target profile has no qualified index mapping"),
        )
    };
    let mut fields = vec![("name", name), ("path", s(path)), ("outcome", s(state))];
    if let Some(reason) = reason {
        fields.push(("reason", s(reason)));
    }
    Ok(ordered_object(fields))
}
fn delta_version(value: Option<&str>) -> bool {
    let Some(remainder) = value.and_then(|v| v.strip_prefix("3.")) else {
        return false;
    };
    let Some(minor) = remainder.as_bytes().first().copied() else {
        return false;
    };
    matches!(minor, b'2'..=b'9') && (remainder.len() == 1 || remainder.as_bytes()[1] == b'.')
}
fn iceberg_version(value: Option<&str>) -> bool {
    let Some(value) = value else { return false };
    matches!(value.as_bytes().first(), Some(b'2' | b'3'))
        && value.as_bytes().get(1).is_none_or(|b| *b == b'.')
}

/// Project a validated `umf.binding` document into qualified generic index
/// outcomes. This is opt-in; callers choose when to invoke it. The host must
/// keep target DDL/catalog checks on their target-specific admission path.
pub fn project_binding_indexes(
    resources: &BindingIndexProjectionResources,
    binding: &Value,
    logical: &Value,
    loss_policy: &str,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let binding = copy_json(binding, ctx)?;
    let logical = copy_json(logical, ctx)?;
    let payload = get(
        get(&binding, "extensions").unwrap_or(&Value::Null),
        "umf.binding",
    )
    .ok_or_else(|| {
        err(
            "BINDING_DOCUMENT",
            "/extensions/umf.binding",
            "Binding extension payload is missing",
        )
    })?;
    if has_unknown_binding(payload, ctx)? {
        return Err(err(
            "BINDING_INCOMPLETE",
            "",
            "Unknown binding content may affect index projection",
        ));
    }
    if !resources.validate_document(&binding, ctx)? {
        return Err(err(
            "BINDING_VALIDATION_UNAVAILABLE",
            "/",
            "Binding document did not pass core document admission",
        ));
    }
    validate_binding(resources, payload, &binding, &logical, ctx)?;
    let target = get(payload, "target").cloned().ok_or_else(|| {
        err(
            "BINDING_DOCUMENT",
            "/extensions/umf.binding/target",
            "Binding target is missing",
        )
    })?;
    let indexes = get(payload, "indexes").and_then(array).unwrap_or(&[]);
    let mut outcomes = Vec::with_capacity(indexes.len());
    let mut candidate = Vec::new();
    let mut all_exact = true;
    for (index, item) in indexes.iter().enumerate() {
        let row = outcome(item, &target, index, ctx)?;
        if eq_text(get(&row, "outcome"), "exact") {
            candidate.push(item.clone());
        } else {
            all_exact = false;
        }
        outcomes.push(row);
    }
    let strict = loss_policy == "strict";
    let blocked = !all_exact && strict;
    let status = if blocked {
        "blocked"
    } else if all_exact {
        "projected"
    } else {
        "reported"
    };
    let mut result = vec![
        ("status", s(status)),
        ("source", binding),
        ("logical", logical),
        ("target", target),
        ("outcomes", Value::Array(outcomes)),
    ];
    if !blocked {
        result.push(("candidate", Value::Array(candidate)));
    }
    Ok(ordered_object(result))
}
