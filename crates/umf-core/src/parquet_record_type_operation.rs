// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in UMF Document Record Type classification for the decoded Parquet LIST
//! struct-element subset. The generic Record classifier supplies capture,
//! LIST interpretation, field identity checks and resource accounting.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_record_classifier::{self, ParquetRecordRequest},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

pub const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-type-classification.schema.json");
const SUBSET: &str = "Non-root interpreted struct-valued members; native repetition retained, LIST/MAP wrappers excluded";
const RECOVERY: &str = "Source and native fragments retained; resolve conflict then recompute whole record classification";

#[derive(Clone, Debug, PartialEq)]
pub struct ParquetRecordTypeRequest {
    pub record_module: Utf16,
    pub record_id: Utf16,
    pub index: usize,
    pub mode: Utf16,
    /// Generic core-kind receipts for direct LIST element fields. `None` means
    /// the request omitted the member; `Some([])` retains explicit emptiness.
    pub authors: Option<Vec<Value>>,
    pub field_author: Option<Value>,
}
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn copy_text(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    Ok(value.clone())
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    if let Value::Object(m) = v {
        m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn string(v: &Value) -> Option<String> {
    if let Value::String(s) = v {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, k(path), message)
}
fn replace(v: &mut Value, name: &str, new: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &k(name)) {
            *old = new;
        }
    }
}
fn push(v: &mut Value, name: &str, new: Value) {
    if let Value::Object(m) = v {
        if let Some((_, Value::Array(a))) = m.iter_mut().find(|(x, _)| x == &k(name)) {
            a.push(new);
        }
    }
}

/// Classify one selected Field as a Record Type. The operation is deliberately
/// scoped to the retained-byte decoder's proven LIST struct-element subset.
pub fn classify_parquet_record_type(
    input: &Value,
    request: &ParquetRecordTypeRequest,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if request.record_module.is_empty()
        || request.record_id.is_empty()
        || request.index == 0
        || request.index as u128 > 9_007_199_254_740_991u128
        || !matches!(
            request.mode.to_utf8().ok().as_deref(),
            Some("strict" | "report")
        )
    {
        return Err(err(
            "PARQUET_RECORD_TYPE_REQUEST",
            "Invalid record module, record id, index, or mode",
            "/request",
        ));
    }
    let source = copy_json(input, ctx)?;
    let base_req = ParquetRecordRequest {
        record_module: copy_text(&request.record_module, ctx)?,
        record_id: copy_text(&request.record_id, ctx)?,
        index: request.index,
        mode: copy_text(&request.mode, ctx)?,
        authors: request
            .authors
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(|author| copy_json(author, ctx))
            .collect::<Result<Vec<_>, _>>()?,
    };
    let mut out = match parquet_record_classifier::classify_parquet_record(
        &source,
        &base_req,
        engine,
        registry,
        capabilities,
        ctx,
    ) {
        Ok(result) => result,
        Err(error) if error.code == "PARQUET_SCHEMA_INDEX" => {
            return Err(err(
                "PARQUET_RECORD_IDENTITY",
                "Selected schema index is missing",
                "/schema",
            ));
        }
        Err(error) => return Err(error),
    };
    let record_classified =
        string(get(&out, "status").unwrap_or(&Value::Null)).as_deref() == Some("classified");
    let generic_target = match get(&out, "target") {
        Some(value) => Some(copy_json(value, ctx)?),
        None => None,
    };
    let record_mapping = get(&out, "mappings")
        .and_then(as_array)
        .and_then(|items| {
            items.iter().find(|item| {
                string(get(item, "kind").unwrap_or(&Value::Null)).as_deref() == Some("record")
            })
        })
        .map(|item| copy_json(item, ctx))
        .transpose()?;
    replace(&mut out, "operation", t("classify-parquet-record-type"));
    replace(
        &mut out,
        "binding",
        obj(vec![
            ("id", t("umf.parquet.record-type")),
            ("version", t("1.0.0")),
            (
                "nativeVersion",
                t("parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017"),
            ),
            ("subset", t(SUBSET)),
        ]),
    );
    if let Value::Object(m) = &mut out {
        m.retain(|(key, _)| key != &k("target"));
    }
    let mut request_value = obj(vec![
        (
            "recordModule",
            Value::String(copy_text(&request.record_module, ctx)?),
        ),
        (
            "recordId",
            Value::String(copy_text(&request.record_id, ctx)?),
        ),
        ("index", Value::Number(request.index as f64)),
        ("mode", Value::String(copy_text(&request.mode, ctx)?)),
    ]);
    if let Some(authors) = &request.authors {
        set(
            &mut request_value,
            "authors",
            Value::Array(
                authors
                    .iter()
                    .map(|a| copy_json(a, ctx))
                    .collect::<Result<Vec<_>, _>>()?,
            ),
        );
    }
    if let Some(author) = &request.field_author {
        set(&mut request_value, "fieldAuthor", copy_json(author, ctx)?);
    }
    replace(&mut out, "request", request_value);
    // Preserve the Record classifier's blocked receipt and mappings. The
    // TypeScript operation appends its selected-member mappings even when the
    // underlying Record interpretation is blocked; their outcome is unknown.
    let modules = get(&source, "modules").and_then(as_array).ok_or_else(|| {
        err(
            "PARQUET_RECORD_TYPE_METADATA",
            "Missing modules",
            "/modules",
        )
    })?;
    let (mi, ei, element) = locate_field(modules, request.index).ok_or_else(|| {
        err(
            "PARQUET_RECORD_TYPE_IDENTITY",
            "Selected parquet.fields identity is missing or ambiguous",
            "/modules",
        )
    })?;
    let element = copy_json(element, ctx)?;
    let element_path = format!("/modules/{mi}/elements/{ei}");
    let mut conflict = None;
    if let Some(author) = &request.field_author {
        match crate::core_kind::verify_core_kind_declaration(
            author,
            &source,
            engine,
            registry,
            capabilities,
            ctx,
        ) {
            Ok(_) => {
                let identity = get(author, "identity").unwrap_or(&Value::Null);
                let provenance = get(author, "provenance").unwrap_or(&Value::Null);
                if string(get(identity, "module").unwrap_or(&Value::Null)).as_deref()
                    != Some("parquet.fields")
                    || string(get(identity, "element").unwrap_or(&Value::Null)).as_deref()
                        != string(get(&element, "id").unwrap_or(&Value::Null)).as_deref()
                    || string(get(provenance, "kind").unwrap_or(&Value::Null)).as_deref()
                        != Some("field")
                {
                    conflict = Some((
                        "PARQUET_RECORD_TYPE_CONFLICT",
                        "Author receipt does not assert this Field role",
                    ));
                }
            }
            Err(e) if e.code == "LIMIT" || e.is_control_failure() => return Err(e),
            Err(_) => {
                conflict = Some((
                    "PARQUET_RECORD_TYPE_CONFLICT",
                    "Field author receipt is stale or invalid",
                ))
            }
        }
    } else {
        let selected_id = get(&element, "id").and_then(string);
        let verified_field_author =
            request
                .authors
                .as_deref()
                .unwrap_or_default()
                .iter()
                .any(|author| {
                    let identity = get(author, "identity").unwrap_or(&Value::Null);
                    string(get(identity, "module").unwrap_or(&Value::Null)).as_deref()
                        == Some("parquet.fields")
                        && string(get(identity, "element").unwrap_or(&Value::Null)) == selected_id
                        && string(
                            get(get(author, "provenance").unwrap_or(&Value::Null), "kind")
                                .unwrap_or(&Value::Null),
                        )
                        .as_deref()
                            == Some("field")
                });
        if get(&element, "kind").is_some() && !verified_field_author {
            conflict = Some((
                "PARQUET_RECORD_TYPE_CONFLICT",
                "Existing kind requires verified author provenance",
            ));
        }
    }
    if get(&element, "scalarType").is_some()
        || get(&element, "references")
            .and_then(as_array)
            .is_some_and(|a| {
                a.iter().any(|r| {
                    string(get(r, "role").unwrap_or(&Value::Null)).as_deref() == Some("record-type")
                })
            })
    {
        conflict = Some((
            "PARQUET_RECORD_TYPE_CONFLICT",
            "Scalar metadata or an existing record-type assertion prevents implicit reconciliation",
        ));
    }
    if let Some((code, message)) = conflict {
        replace(&mut out, "status", t("blocked"));
        push(
            &mut out,
            "residuals",
            obj(vec![
                ("path", t(&element_path)),
                ("value", copy_json(&element, ctx)?),
                ("reason", t(message)),
                ("recovery", t(RECOVERY)),
            ]),
        );
        push(
            &mut out,
            "diagnostics",
            obj(vec![
                ("code", t(code)),
                ("path", t(&element_path)),
                ("message", t(message)),
                ("severity", t("error")),
            ]),
        );
    }
    let can_classify = record_classified && conflict.is_none();
    let mut target = if can_classify {
        Some(generic_target.ok_or_else(|| {
            err(
                "PARQUET_RECORD_TYPE_TARGET",
                "Classified Record target is missing",
                "/target",
            )
        })?)
    } else {
        None
    };
    if let Some(target) = target.as_mut() {
        let tm = as_array_mut(
            get_mut(target, "modules")
                .ok_or_else(|| err("PARQUET_RECORD_TYPE_TARGET", "Missing modules", "/modules"))?,
        )
        .unwrap();
        let fields = as_array_mut(
            get_mut(&mut tm[mi], "elements")
                .ok_or_else(|| err("PARQUET_RECORD_TYPE_TARGET", "Missing fields", "/modules"))?,
        )
        .unwrap();
        if get(&fields[ei], "kind").is_none() {
            set(&mut fields[ei], "kind", t("field"));
        }
        let ref_value = obj(vec![
            ("role", t("record-type")),
            (
                "module",
                Value::String(copy_text(&request.record_module, ctx)?),
            ),
            (
                "element",
                Value::String(copy_text(&request.record_id, ctx)?),
            ),
        ]);
        if let Some(Value::Array(refs)) = get_mut(&mut fields[ei], "references") {
            refs.push(ref_value);
        } else {
            set(&mut fields[ei], "references", Value::Array(vec![ref_value]));
        }
        let validation = engine.validate_document(target, registry, capabilities, ctx)?;
        if !validation.valid {
            return Err(err(
                "PARQUET_RECORD_TYPE_TARGET",
                "Classified target failed core validation",
                "/target",
            ));
        }
        replace(&mut out, "status", t("classified"));
    }
    let native_fragment = if let Some(fragment) = record_mapping
        .as_ref()
        .and_then(|m| get(m, "nativeFragment"))
    {
        typescript_native_fragment(copy_json(fragment, ctx)?, ctx)?
    } else if let Some(fragment) = get(&out, "residuals")
        .and_then(as_array)
        .and_then(|rs| {
            rs.iter().find(|r| {
                string(get(r, "path").unwrap_or(&Value::Null)).as_deref()
                    == Some(format!("/schema/{}", request.index).as_str())
            })
        })
        .and_then(|r| get(r, "value"))
    {
        typescript_native_fragment(copy_json(fragment, ctx)?, ctx)?
    } else {
        return Err(err(
            "PARQUET_RECORD_TYPE_MAPPING",
            "Record classifier did not retain the selected native schema fragment",
            "/mappings",
        ));
    };
    let reference_index = get(&element, "references")
        .and_then(as_array)
        .map_or(0, Vec::len);
    let mut mappings = get(&out, "mappings")
        .and_then(as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| copy_json(item, ctx))
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?
        .unwrap_or_default();
    // The Rust decoder's intermediate SchemaElement vocabulary is deliberately
    // narrower than Parquet's native JSON field names. Translate the known
    // fields in those retained fragments to the frozen adapter's field names.
    for item in &mut mappings {
        if let Some(fragment) = get_mut(item, "nativeFragment") {
            let owned = copy_json(fragment, ctx)?;
            *fragment = typescript_native_fragment(owned, ctx)?;
        }
    }
    // The generic Rust Record classifier can stop before emitting its
    // declaration mapping when the selected node is an unsupported wrapper.
    // Preserve the TypeScript operation's declaration observation in that
    // blocked receipt using the retained decoded fragment.
    if record_mapping.is_none() {
        if mappings.is_empty() {
            let captured = crate::parquet_document_capture::capture_parquet_document(
                &source,
                request.index,
                engine,
                registry,
                capabilities,
                ctx,
            )?;
            for child in schema_child_indexes(&captured.schema, request.index, ctx)? {
                let id = format!("schema:{child}");
                if let Some((field_index, _)) = as_array(
                    get(&modules[mi], "elements").unwrap_or(&Value::Null),
                )
                .and_then(|fields| {
                    fields.iter().enumerate().find(|(_, field)| {
                        string(get(field, "id").unwrap_or(&Value::Null)).as_deref()
                            == Some(id.as_str())
                    })
                }) {
                    mappings.push(mapping(
                        "field",
                        format!("/modules/{mi}/elements/{field_index}/kind"),
                        format!("/schema/{child}"),
                        schema_native_fragment(&captured.schema[child], ctx)?,
                        "checked-record-field-membership",
                        "exact",
                    ));
                }
            }
        }
        let declaration_path = format!("/modules/{}/elements/0/kind", modules.len());
        mappings.push(mapping(
            "record",
            declaration_path,
            format!("/schema/{}", request.index),
            copy_json(&native_fragment, ctx)?,
            "checked-record-declaration",
            "unknown",
        ));
    }
    // The original Record declaration mapping remains in-place exactly once.
    let outcome = if can_classify { "exact" } else { "unknown" };
    mappings.push(mapping(
        "field",
        format!("{element_path}/kind"),
        format!("/schema/{}", request.index),
        copy_json(&native_fragment, ctx)?,
        "checked-struct-valued-member",
        outcome,
    ));
    mappings.push(mapping(
        "record-type",
        format!("{element_path}/references/{reference_index}"),
        format!("/schema/{}", request.index),
        native_fragment,
        "checked-struct-valued-member",
        outcome,
    ));
    replace(&mut out, "mappings", Value::Array(mappings));
    if let Some(target) = target {
        set(&mut out, "target", target);
    }
    validate_result(out, ctx)
}
fn mapping(
    kind: &str,
    ideal: String,
    native: String,
    fragment: Value,
    basis: &str,
    outcome: &str,
) -> Value {
    obj(vec![
        ("origin", t("classified")),
        ("kind", t(kind)),
        ("idealPath", t(&ideal)),
        ("nativePath", t(&native)),
        ("nativeFragment", fragment),
        ("basis", t(basis)),
        ("outcome", t(outcome)),
    ])
}
fn typescript_native_fragment(
    fragment: Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Value::Object(fields) = fragment else {
        return Ok(fragment);
    };
    ctx.charge_work(32, Utf16::default())?;
    let mut out = Vec::with_capacity(fields.len());
    for (key, value) in fields {
        let name = key.to_utf8().unwrap_or_default();
        match name.as_str() {
            "physicalType" => {
                let code = match string(&value).as_deref() {
                    Some("BOOLEAN") => Some("0"),
                    Some("INT32") => Some("1"),
                    Some("INT64") => Some("2"),
                    Some("INT96") => Some("3"),
                    Some("FLOAT") => Some("4"),
                    Some("DOUBLE") => Some("5"),
                    Some("BYTE_ARRAY") => Some("6"),
                    Some("FIXED_LEN_BYTE_ARRAY") => Some("7"),
                    _ => None,
                };
                if let Some(code) = code {
                    out.push((k("type"), t(code)));
                } else {
                    out.push((key, value));
                }
            }
            "repetition" => {
                let code = match string(&value).as_deref() {
                    Some("REQUIRED") => Some("0"),
                    Some("OPTIONAL") => Some("1"),
                    Some("REPEATED") => Some("2"),
                    _ => None,
                };
                if let Some(code) = code {
                    out.push((k("repetition_type"), t(code)));
                } else {
                    out.push((key, value));
                }
            }
            "numChildren" => {
                let value = match value {
                    Value::Number(n) if n.is_finite() && n.fract() == 0.0 => t(&format!("{n:.0}")),
                    other => other,
                };
                out.push((k("num_children"), value));
            }
            "convertedType" => out.push((k("converted_type"), value)),
            // This is a decoded semantic label, not a native SchemaElement field.
            "annotation" => {}
            _ => out.push((key, value)),
        }
    }
    Ok(Value::Object(out))
}
fn schema_native_fragment(
    element: &crate::parquet_record_type_candidate::SchemaElement,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut fields = vec![("name", Value::String(copy_text(&element.name, ctx)?))];
    if let Some(repetition) = &element.repetition {
        fields.push(("repetition", Value::String(copy_text(repetition, ctx)?)));
    }
    if let Some(children) = element.num_children {
        fields.push(("numChildren", Value::Number(children as f64)));
    }
    if let Some(converted_type) = element.converted_type {
        // Reserve for the widest signed IDL value before allocating its decimal spelling.
        ctx.charge_work(20, Utf16::default())?;
        fields.push((
            "convertedType",
            Value::string_utf8(converted_type.to_string()),
        ));
    }
    if let Some(physical) = &element.physical_type {
        fields.push(("physicalType", Value::String(copy_text(physical, ctx)?)));
    }
    typescript_native_fragment(obj(fields), ctx)
}
fn schema_child_indexes(
    schema: &[crate::parquet_record_type_candidate::SchemaElement],
    parent: usize,
    ctx: &mut Context<'_>,
) -> Result<Vec<usize>, EngineError> {
    fn skip(
        schema: &[crate::parquet_record_type_candidate::SchemaElement],
        cursor: &mut usize,
        depth: usize,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        if depth > 64 || *cursor >= schema.len() {
            return Err(err(
                "PARQUET_SCHEMA",
                "Malformed decoded preorder schema",
                "/schema",
            ));
        }
        let index = *cursor;
        *cursor += 1;
        ctx.charge_work(1, Utf16::default())?;
        for _ in 0..schema[index].num_children.unwrap_or(0) {
            skip(schema, cursor, depth + 1, ctx)?;
        }
        Ok(())
    }
    let element = schema.get(parent).ok_or_else(|| {
        err(
            "PARQUET_SCHEMA",
            "Selected schema index is missing",
            "/schema",
        )
    })?;
    let mut cursor = parent + 1;
    let count = element.num_children.unwrap_or(0);
    ctx.charge_work(count, Utf16::default())?;
    let mut children = Vec::with_capacity(count);
    for _ in 0..count {
        children.push(cursor);
        skip(schema, &mut cursor, 0, ctx)?;
    }
    Ok(children)
}
fn locate_field<'a>(modules: &'a [Value], index: usize) -> Option<(usize, usize, &'a Value)> {
    let id = format!("schema:{index}");
    let mut found = None;
    for (mi, m) in modules.iter().enumerate() {
        if string(get(m, "id")?).as_deref() == Some("parquet.fields") {
            for (ei, e) in as_array(get(m, "elements")?)?.iter().enumerate() {
                if string(get(e, "id")?).as_deref() == Some(id.as_str()) {
                    if found.is_some() {
                        return None;
                    }
                    found = Some((mi, ei, e));
                }
            }
        }
    }
    found
}
fn validate_result(v: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let schema = crate::serialization::read_json_value(
        &CLASSIFICATION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let read = |s: &str, ctx: &mut Context<'_>| {
        crate::serialization::read_json_value(
            &s.encode_utf16().collect::<Vec<_>>(),
            crate::serialization::Format::Json,
            ctx,
        )
    };
    let resources = crate::schema::SchemaResources {
        entries: vec![
            (
                k("urn:umf:core:0.10.0"),
                read(include_str!("../../../spec/core/schema.json"), ctx)?,
            ),
            (
                k("urn:umf:core:semantic-type-reference:1.0.0"),
                read(
                    include_str!("../../../spec/core/semantic-type-reference.schema.json"),
                    ctx,
                )?,
            ),
            (
                k("urn:umf:core:kind-operation:6.0.0"),
                read(
                    include_str!("../../../spec/core/kind-operation-v6.schema.json"),
                    ctx,
                )?,
            ),
        ],
    };
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    if let Some(d) = compiled.validate(&v, ctx)?.first() {
        return Err(EngineError::new(
            "PARQUET_RECORD_TYPE_RESULT",
            d.instance_path.clone(),
            d.message.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(v)
}
fn as_array(v: &Value) -> Option<&Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn as_array_mut(v: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn get_mut<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Value> {
    if let Value::Object(m) = v {
        m.iter_mut().find(|(x, _)| x == &k(n)).map(|(_, v)| v)
    } else {
        None
    }
}
fn set(v: &mut Value, n: &str, x: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(name, _)| name == &k(n)) {
            *old = x
        } else {
            m.push((k(n), x))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        context::{Limits, ResourceProfile},
        core_kind::{self, Identity},
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        serialization::{read_json_value, Format},
    };
    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(vec![])
        }
    }
    fn parse(s: &str) -> Value {
        read_json_value(
            &s.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn same_value(left: &Value, right: &Value) -> bool {
        match (left, right) {
            (Value::Object(a), Value::Object(b)) => {
                a.len() == b.len()
                    && b.iter().all(|(key, value)| {
                        a.iter()
                            .find(|(candidate, _)| candidate == key)
                            .is_some_and(|(_, candidate)| same_value(candidate, value))
                    })
            }
            (Value::Array(a), Value::Array(b)) => {
                a.len() == b.len() && a.iter().zip(b).all(|(x, y)| same_value(x, y))
            }
            _ => left == right,
        }
    }
    fn engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse(include_str!("../../../spec/core/schema.json")),
                parse(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }
    fn source(bytes: &[u8]) -> Value {
        let schema = crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
            .unwrap()
            .schema;
        let hex = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let fields = schema
            .iter()
            .enumerate()
            .skip(1)
            .map(|(i, e)| {
                format!(
                    "{{\"id\":\"schema:{i}\",\"name\":\"{}\"{} ,\"extensions\":{{}}}}",
                    e.name.to_utf8().unwrap(),
                    if e.physical_type.is_some() {
                        ",\"scalarType\":\"integer\""
                    } else {
                        ""
                    }
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        parse(&format!(
            "{{\"umf\":\"0.10.0\",\"id\":\"fixture\",\"vocabularies\":{{\"umf.parquet\":{{\"version\":\"0.1.0\"}}}},\"modules\":[{{\"id\":\"parquet\",\"namespace\":\"\",\"elements\":[{{\"id\":\"source\",\"extensions\":{{\"umf.parquet\":{{\"profile\":\"parquet-file-source\",\"encoding\":\"hex\",\"bytes\":\"{hex}\"}}}}}}]}},{{\"id\":\"parquet.fields\",\"namespace\":\"\",\"elements\":[{fields}]}}]}}"
        ))
    }
    fn request() -> ParquetRecordTypeRequest {
        ParquetRecordTypeRequest {
            record_module: k("record.types"),
            record_id: k("item"),
            index: 2,
            mode: k("strict"),
            authors: Some(vec![]),
            field_author: None,
        }
    }
    fn to_serde(value: &Value) -> serde_json::Value {
        match value {
            Value::Null => serde_json::Value::Null,
            Value::Bool(value) => serde_json::Value::Bool(*value),
            Value::Number(value) => serde_json::Number::from_f64(*value)
                .map(serde_json::Value::Number)
                .unwrap(),
            Value::String(value) => serde_json::Value::String(value.to_utf8().unwrap()),
            Value::Array(items) => serde_json::Value::Array(items.iter().map(to_serde).collect()),
            Value::Object(fields) => serde_json::Value::Object(
                fields
                    .iter()
                    .map(|(key, value)| (key.to_utf8().unwrap(), to_serde(value)))
                    .collect(),
            ),
        }
    }
    #[test]
    fn classifies_list_member_and_validates_receipt_target() {
        let fixtures: [&[u8]; 3] = [
            include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-array.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-items_tuple.parquet"),
        ];
        for bytes in fixtures {
            for mode in ["strict", "report"] {
                let input = source(bytes);
                let mut req = request();
                req.mode = k(mode);
                let mut caps = NoCapabilities;
                let receipt = classify_parquet_record_type(
                    &input,
                    &req,
                    &engine(),
                    &Registry::new(),
                    &mut caps,
                    &mut Context::ordinary(),
                )
                .unwrap();
                assert_eq!(
                    string(get(&receipt, "status").unwrap()).as_deref(),
                    Some("classified")
                );
                let mappings = as_array(get(&receipt, "mappings").unwrap()).unwrap();
                assert_eq!(
                    mappings.len(),
                    if bytes
                        == include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet")
                    {
                        5
                    } else {
                        4
                    }
                );
                assert_eq!(
                    mappings
                        .iter()
                        .filter(|m| string(get(m, "kind").unwrap()).as_deref() == Some("record"))
                        .count(),
                    1
                );
                assert!(mappings.iter().any(|m| {
                    string(get(m, "kind").unwrap()).as_deref() == Some("record-type")
                        && string(get(m, "idealPath").unwrap())
                            .is_some_and(|p| p.ends_with("/references/0"))
                }));
                let record = mappings
                    .iter()
                    .find(|m| string(get(m, "kind").unwrap()).as_deref() == Some("record"))
                    .unwrap();
                assert_eq!(
                    string(get(record, "nativePath").unwrap()).as_deref(),
                    Some("/schema/2")
                );
                assert!(same_value(
                    get(record, "nativeFragment").unwrap(),
                    &parse(
                        if bytes
                            == include_bytes!(
                                "../../../fixtures/parquet/containers/list-tuple.parquet"
                            )
                        {
                            r#"{"repetition_type":"2","name":"tuple","num_children":"2"}"#
                        } else if bytes
                            == include_bytes!(
                                "../../../fixtures/parquet/containers/list-array.parquet"
                            )
                        {
                            r#"{"repetition_type":"2","name":"array","num_children":"1"}"#
                        } else {
                            r#"{"repetition_type":"2","name":"items_tuple","num_children":"1"}"#
                        }
                    )
                ));
                let expected_kinds = if bytes
                    == include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet")
                {
                    vec!["field", "field", "record", "field", "record-type"]
                } else {
                    vec!["field", "record", "field", "record-type"]
                };
                assert_eq!(
                    mappings
                        .iter()
                        .map(|m| string(get(m, "kind").unwrap()).unwrap())
                        .collect::<Vec<_>>(),
                    expected_kinds
                );
                let expected_mappings = parse(
                    if bytes
                        == include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet")
                    {
                        r#"[{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/2/kind","nativePath":"/schema/3","nativeFragment":{"type":"1","repetition_type":"0","name":"a"},"basis":"checked-record-field-membership","outcome":"exact"},{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/3/kind","nativePath":"/schema/4","nativeFragment":{"type":"1","repetition_type":"1","name":"b"},"basis":"checked-record-field-membership","outcome":"exact"},{"origin":"classified","kind":"record","idealPath":"/modules/2/elements/0/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"tuple","num_children":"2"},"basis":"checked-record-declaration","outcome":"exact"},{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/1/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"tuple","num_children":"2"},"basis":"checked-struct-valued-member","outcome":"exact"},{"origin":"classified","kind":"record-type","idealPath":"/modules/1/elements/1/references/0","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"tuple","num_children":"2"},"basis":"checked-struct-valued-member","outcome":"exact"}]"#
                    } else if bytes
                        == include_bytes!("../../../fixtures/parquet/containers/list-array.parquet")
                    {
                        r#"[{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/2/kind","nativePath":"/schema/3","nativeFragment":{"type":"1","repetition_type":"1","name":"a"},"basis":"checked-record-field-membership","outcome":"exact"},{"origin":"classified","kind":"record","idealPath":"/modules/2/elements/0/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"array","num_children":"1"},"basis":"checked-record-declaration","outcome":"exact"},{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/1/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"array","num_children":"1"},"basis":"checked-struct-valued-member","outcome":"exact"},{"origin":"classified","kind":"record-type","idealPath":"/modules/1/elements/1/references/0","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"array","num_children":"1"},"basis":"checked-struct-valued-member","outcome":"exact"}]"#
                    } else {
                        r#"[{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/2/kind","nativePath":"/schema/3","nativeFragment":{"type":"1","repetition_type":"1","name":"a"},"basis":"checked-record-field-membership","outcome":"exact"},{"origin":"classified","kind":"record","idealPath":"/modules/2/elements/0/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"items_tuple","num_children":"1"},"basis":"checked-record-declaration","outcome":"exact"},{"origin":"classified","kind":"field","idealPath":"/modules/1/elements/1/kind","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"items_tuple","num_children":"1"},"basis":"checked-struct-valued-member","outcome":"exact"},{"origin":"classified","kind":"record-type","idealPath":"/modules/1/elements/1/references/0","nativePath":"/schema/2","nativeFragment":{"repetition_type":"2","name":"items_tuple","num_children":"1"},"basis":"checked-struct-valued-member","outcome":"exact"}]"#
                    },
                );
                assert!(
                    same_value(get(&receipt, "mappings").unwrap(), &expected_mappings),
                    "actual={:?} expected={:?}",
                    get(&receipt, "mappings").unwrap(),
                    expected_mappings
                );
                let first_fragment = get(mappings.first().unwrap(), "nativeFragment").unwrap();
                assert_eq!(
                    string(get(first_fragment, "type").unwrap()).as_deref(),
                    Some("1")
                );
                assert_eq!(
                    string(get(first_fragment, "name").unwrap()).as_deref(),
                    Some(
                        if bytes
                            == include_bytes!(
                                "../../../fixtures/parquet/containers/list-tuple.parquet"
                            )
                        {
                            "a"
                        } else {
                            "a"
                        }
                    )
                );
                assert!(mappings
                    .iter()
                    .all(|m| string(get(m, "outcome").unwrap()).as_deref() == Some("exact")));
                assert!(mappings
                    .iter()
                    .any(
                        |m| string(get(m, "kind").unwrap()).as_deref() == Some("record-type")
                            && get(m, "nativeFragment") == get(record, "nativeFragment")
                    ));
                assert_eq!(get(&receipt, "source").unwrap(), &input);
                let target_modules =
                    as_array(get(get(&receipt, "target").unwrap(), "modules").unwrap()).unwrap();
                let target_fields = as_array(get(&target_modules[1], "elements").unwrap()).unwrap();
                assert_eq!(
                    string(get(&target_fields[1], "kind").unwrap()).as_deref(),
                    Some("field")
                );
                let selected_refs =
                    as_array(get(&target_fields[1], "references").unwrap()).unwrap();
                assert_eq!(
                    string(get(&selected_refs[0], "role").unwrap()).as_deref(),
                    Some("record-type")
                );
                let record_fields = as_array(get(&target_modules[2], "elements").unwrap()).unwrap();
                let record_members =
                    as_array(get(&record_fields[0], "references").unwrap()).unwrap();
                assert_eq!(
                    record_members.len(),
                    if bytes
                        == include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet")
                    {
                        2
                    } else {
                        1
                    }
                );
                assert!(
                    engine()
                        .validate_document(
                            get(&receipt, "target").unwrap(),
                            &Registry::new(),
                            &mut caps,
                            &mut Context::ordinary()
                        )
                        .unwrap()
                        .valid
                );
            }
        }
    }
    #[test]
    fn blocked_three_element_and_map_families_retain_unknown_mappings_and_diagnostics() {
        let frozen: serde_json::Value = serde_json::from_str(include_str!(
            "../../../docs/helix/04-build/evidence/rust-migration/r8-parquet-record-type/typescript-predecessor.json"
        ))
        .unwrap();
        let fixtures: [(&[u8], bool, &str); 2] = [
            (
                include_bytes!("../../../fixtures/parquet/containers/list-three-element.parquet"),
                false,
                "list-three-element",
            ),
            (
                include_bytes!("../../../fixtures/parquet/containers/map-canonical.parquet"),
                true,
                "map-canonical",
            ),
        ];
        for (bytes, is_map, fixture_id) in fixtures {
            for index in 1..=3 {
                for mode in ["strict", "report"] {
                    let input = source(bytes);
                    let mut req = request();
                    req.index = index;
                    req.mode = k(mode);
                    let mut caps = NoCapabilities;
                    let receipt = classify_parquet_record_type(
                        &input,
                        &req,
                        &engine(),
                        &Registry::new(),
                        &mut caps,
                        &mut Context::ordinary(),
                    )
                    .unwrap();
                    assert_eq!(
                        string(get(&receipt, "status").unwrap()).as_deref(),
                        Some("blocked")
                    );
                    assert!(get(&receipt, "target").is_none());
                    let diagnostics = as_array(get(&receipt, "diagnostics").unwrap()).unwrap();
                    assert!(diagnostics
                        .iter()
                        .any(|d| string(get(d, "code").unwrap()).as_deref()
                            == Some("RECORD_ROLE_UNKNOWN")));
                    let mappings = as_array(get(&receipt, "mappings").unwrap()).unwrap();
                    let frozen_case = format!("blocked/{fixture_id}/{index}/{mode}");
                    let expected_mappings = &frozen["outcomes"][&frozen_case]["mappings"];
                    assert_eq!(
                        to_serde(&Value::Array(mappings.clone())),
                        *expected_mappings,
                        "ordered blocked mappings differ for {frozen_case}"
                    );
                    let expected_kinds: &[&str] = match (is_map, index) {
                        (false, 1 | 2) | (true, 1) => &["field", "record", "field", "record-type"],
                        (true, 2) => &["field", "field", "record", "field", "record-type"],
                        _ => &["record", "field", "record-type"],
                    };
                    assert_eq!(
                        mappings
                            .iter()
                            .map(|m| string(get(m, "kind").unwrap()).unwrap())
                            .collect::<Vec<_>>(),
                        expected_kinds
                    );
                    let expected_paths: &[&str] = match (is_map, index) {
                        (false, 1) | (true, 1) => {
                            &["/schema/2", "/schema/1", "/schema/1", "/schema/1"]
                        }
                        (false, 2) => &["/schema/3", "/schema/2", "/schema/2", "/schema/2"],
                        (true, 2) => &[
                            "/schema/3",
                            "/schema/4",
                            "/schema/2",
                            "/schema/2",
                            "/schema/2",
                        ],
                        _ => &["/schema/3", "/schema/3", "/schema/3"],
                    };
                    assert_eq!(
                        mappings
                            .iter()
                            .map(|m| string(get(m, "nativePath").unwrap()).unwrap())
                            .collect::<Vec<_>>(),
                        expected_paths
                    );
                    let expected_outcomes: &[&str] = match (is_map, index) {
                        (false, 1 | 2) | (true, 1) => &["exact", "unknown", "unknown", "unknown"],
                        (true, 2) => &["exact", "exact", "unknown", "unknown", "unknown"],
                        _ => &["unknown", "unknown", "unknown"],
                    };
                    assert_eq!(
                        mappings
                            .iter()
                            .map(|m| string(get(m, "outcome").unwrap()).unwrap())
                            .collect::<Vec<_>>(),
                        expected_outcomes
                    );
                    let expected_diagnostics: &[&str] = if index == 3 {
                        &["RECORD_ROLE_UNKNOWN", "PARQUET_RECORD_TYPE_CONFLICT"]
                    } else {
                        &["RECORD_ROLE_UNKNOWN"]
                    };
                    assert_eq!(
                        diagnostics
                            .iter()
                            .map(|d| string(get(d, "code").unwrap()).unwrap())
                            .collect::<Vec<_>>(),
                        expected_diagnostics
                    );
                    assert!(mappings
                        .iter()
                        .filter(|m| matches!(
                            string(get(m, "kind").unwrap()).as_deref(),
                            Some("field" | "record-type")
                        ) && string(get(m, "basis").unwrap())
                            .is_some_and(|b| b == "checked-struct-valued-member"))
                        .all(|m| string(get(m, "outcome").unwrap()).as_deref() == Some("unknown")));
                    assert!(as_array(get(&receipt, "residuals").unwrap())
                        .unwrap()
                        .iter()
                        .any(|r| string(get(r, "path").unwrap()).as_deref()
                            == Some(if index == 1 {
                                "/schema/1"
                            } else if index == 2 {
                                "/schema/2"
                            } else {
                                "/schema/3"
                            })));
                }
            }
        }
    }
    #[test]
    fn blocks_conflicting_existing_kind() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let mut input = source(bytes);
        let Value::Object(root) = &mut input else {
            unreachable!()
        };
        let modules = as_array_mut(
            &mut root
                .iter_mut()
                .find(|(name, _)| name == &k("modules"))
                .unwrap()
                .1,
        )
        .unwrap();
        let fields = as_array_mut(get_mut(&mut modules[1], "elements").unwrap()).unwrap();
        if let Value::Object(element) = &mut fields[1] {
            element.push((k("kind"), t("group")));
        }
        let mut caps = NoCapabilities;
        let receipt = classify_parquet_record_type(
            &input,
            &request(),
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            string(get(&receipt, "status").unwrap()).as_deref(),
            Some("blocked")
        );
        assert!(get(&receipt, "target").is_none());
        assert!(!as_array(get(&receipt, "residuals").unwrap())
            .unwrap()
            .is_empty());
    }
    #[test]
    fn caller_resource_limit_refuses() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let input = source(bytes);
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let mut caps = NoCapabilities;
        assert_eq!(
            classify_parquet_record_type(
                &input,
                &request(),
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut ctx
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
        let mut too_large = source(bytes);
        if let Value::Object(fields) = &mut too_large {
            fields.push((
                k("packetBoundary"),
                Value::Array(vec![Value::Null; 100_001]),
            ));
        }
        let mut ctx = Context::ordinary();
        let mut caps = NoCapabilities;
        assert_eq!(
            classify_parquet_record_type(
                &too_large,
                &request(),
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut ctx,
            )
            .unwrap_err()
            .code,
            "LIMIT"
        );
    }
    #[test]
    fn request_identity_errors_keep_the_parquet_operation_codes() {
        let input = source(include_bytes!(
            "../../../fixtures/parquet/containers/list-tuple.parquet"
        ));
        let mut req = request();
        req.index = 0;
        let mut caps = NoCapabilities;
        assert_eq!(
            classify_parquet_record_type(
                &input,
                &req,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_TYPE_REQUEST"
        );
        req.index = 9999;
        assert_eq!(
            classify_parquet_record_type(
                &input,
                &req,
                &engine(),
                &Registry::new(),
                &mut caps,
                &mut Context::ordinary(),
            )
            .unwrap_err()
            .code,
            "PARQUET_RECORD_IDENTITY"
        );
    }
    #[test]
    fn verifies_and_retains_inherited_member_author_receipt() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let original = source(bytes);
        let engine = engine();
        let mut caps = NoCapabilities;
        let author = core_kind::declare_core_kind(
            &original,
            &Identity {
                module: k("parquet.fields"),
                element: k("schema:3"),
            },
            "field",
            &engine,
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        let input = get(&author, "target").unwrap().clone();
        let mut req = request();
        let expected_author = author.clone();
        req.authors.get_or_insert_with(Vec::new).push(author);
        let receipt = classify_parquet_record_type(
            &input,
            &req,
            &engine,
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            string(get(&receipt, "status").unwrap()).as_deref(),
            Some("classified"),
            "{receipt:?}"
        );
        assert!(
            matches!(get(get(&receipt,"request").unwrap(),"authors"),Some(Value::Array(a)) if a.len()==1)
        );
        assert!(same_value(
            get(get(&receipt, "request").unwrap(), "authors").unwrap(),
            &Value::Array(vec![expected_author])
        ));
    }
    #[test]
    fn verifies_and_retains_selected_field_author_receipt() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let original = source(bytes);
        let engine = engine();
        let mut caps = NoCapabilities;
        let author = core_kind::declare_core_kind(
            &original,
            &Identity {
                module: k("parquet.fields"),
                element: k("schema:2"),
            },
            "field",
            &engine,
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        let input = get(&author, "target").unwrap().clone();
        let mut req = request();
        let expected_author = author.clone();
        req.field_author = Some(author);
        let receipt = classify_parquet_record_type(
            &input,
            &req,
            &engine,
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(
            string(get(&receipt, "status").unwrap()).as_deref(),
            Some("classified"),
            "{receipt:?}"
        );
        assert!(get(get(&receipt, "request").unwrap(), "fieldAuthor").is_some());
        assert!(same_value(
            get(get(&receipt, "request").unwrap(), "fieldAuthor").unwrap(),
            &expected_author
        ));
    }
}
