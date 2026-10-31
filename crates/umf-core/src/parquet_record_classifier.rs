// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in UMF Document classifier for the pinned Parquet LIST-struct Record
//! subset. This is deliberately narrower than the TypeScript classifier: only
//! schema elements resolved by the existing LIST interpreter are admitted.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_document_capture::capture_parquet_document,
    parquet_record_type_candidate::{CandidateResolution, ParquetCapture, SchemaElement},
    registry::Registry,
    value::{copy_json, Utf16, Value},
};

pub const CLASSIFICATION_SCHEMA: &str =
    include_str!("../../../spec/core/parquet-record-classification.schema.json");
const RECOVERY: &str = "Source and native fragments retained; resolve conflict then recompute whole record classification";
const BINDING: &str = "Unannotated root/struct definitions after LIST/MAP interpretation; direct members only, no cardinality or value-domain equivalence";

#[derive(Clone, Debug, PartialEq)]
pub struct ParquetRecordRequest {
    pub record_module: Utf16,
    pub record_id: Utf16,
    pub index: usize,
    pub mode: Utf16,
    /// Core kind declaration receipts. They are recomputed against `source`
    /// before their provenance is accepted.
    pub authors: Vec<Value>,
}

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn t(s: &str) -> Value {
    Value::string_utf8(s)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(a, b)| (k(a), b)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(x, _)| x == &k(n)).map(|(_, v)| v),
        _ => None,
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
fn number(n: usize) -> Value {
    Value::Number(n as f64)
}
fn replace(v: &mut Value, name: &str, value: Value) -> bool {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &k(name)) {
            *old = value;
            return true;
        }
    }
    false
}

/// Returns the exact `parquet-record-classification` envelope shape. A
/// classified receipt is emitted only after source capture, LIST interpretation,
/// direct-member identity checks, author-receipt verification and target
/// envelope validation all succeed.
pub fn classify_parquet_record(
    input: &Value,
    request: &ParquetRecordRequest,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if request.record_module.is_empty()
        || request.record_id.is_empty()
        || request.index as u128 > 9_007_199_254_740_991u128
        || !matches!(
            request.mode.to_utf8().ok().as_deref(),
            Some("strict" | "report")
        )
    {
        return Err(err(
            "PARQUET_RECORD_REQUEST",
            "Invalid record module, record id, or mode",
            "/request",
        ));
    }
    ctx.charge_work(
        request
            .record_module
            .len()
            .saturating_add(request.record_id.len()),
        Utf16::from("/request"),
    )?;
    let source = copy_json(input, ctx)?;
    // Capture validates the current envelope and the exact pinned source profile.
    let captured =
        capture_parquet_document(&source, request.index, engine, registry, capabilities, ctx)?;
    let selected = captured.schema.get(request.index).ok_or_else(|| {
        err(
            "PARQUET_RECORD_IDENTITY",
            "Selected schema index is missing",
            "/schema",
        )
    })?;
    let schema_cost = captured
        .schema
        .iter()
        .map(|e| {
            e.name.len()
                + e.repetition.as_ref().map_or(0, Utf16::len)
                + e.physical_type.as_ref().map_or(0, Utf16::len)
                + e.annotation.as_ref().map_or(0, Utf16::len)
                + if e.converted_type.is_some() { 20 } else { 0 }
                + 1
        })
        .sum::<usize>();
    ctx.charge_work(
        captured.bytes.len().saturating_add(schema_cost),
        Utf16::default(),
    )?;
    let candidate_capture =
        ParquetCapture::new(captured.bytes.clone(), captured.schema.clone(), ctx)?;
    let resolution = candidate_capture.resolve_record_type(request.index, ctx)?;
    let mut result = base_receipt(&source, request, ctx)?;
    let mut blockers: Vec<(String, String, Value, String)> = Vec::new();
    let candidate = match resolution {
        CandidateResolution::StructMember(c) => Some(c),
        CandidateResolution::Unsupported { reason } => {
            blockers.push((
                "RECORD_ROLE_UNKNOWN".into(),
                format!("/schema/{}", request.index),
                schema_fragment(selected),
                reason.into(),
            ));
            None
        }
    };
    let Some(candidate) = candidate else {
        return validate_receipt(blocked(result, blockers, ctx)?, ctx);
    };

    // Reconstruct direct child indexes from the validated preorder schema.
    let children = schema_children(&captured.schema, ctx)?;
    let child_indices = children.get(request.index).cloned().unwrap_or_default();
    let mut parent = vec![None; captured.schema.len()];
    for (pi, cs) in children.iter().enumerate() {
        for &child in cs {
            parent[child] = Some(pi);
        }
    }
    let mut ancestor = parent[request.index];
    while let Some(ai) = ancestor {
        if let Some(annotation) = &captured.schema[ai].annotation {
            let known = matches!(annotation.to_utf8().ok().as_deref(), Some("LIST"));
            if !known {
                blockers.push((
                    "RECORD_ANCESTOR_UNKNOWN".into(),
                    format!("/schema/{ai}"),
                    schema_fragment(&captured.schema[ai]),
                    "Uninterpreted ancestor annotation may change the selected group meaning"
                        .into(),
                ));
            }
        }
        ancestor = parent[ai];
    }
    if child_indices.is_empty() {
        blockers.push((
            "RECORD_ROLE_UNKNOWN".into(),
            format!("/schema/{}", request.index),
            schema_fragment(selected),
            "Selected LIST struct has no direct members".into(),
        ));
    }
    let modules = get(&source, "modules").and_then(as_array).ok_or_else(|| {
        err(
            "PARQUET_RECORD_METADATA",
            "Current document has no module array",
            "/modules",
        )
    })?;
    let mut field_module = None;
    for (mi, m) in modules.iter().enumerate() {
        if get(m, "id").and_then(string).as_deref() == Some("parquet.fields") {
            if field_module.is_some() {
                return Err(err(
                    "PARQUET_RECORD_METADATA",
                    "Duplicate parquet.fields modules",
                    "/modules",
                ));
            }
            field_module = Some(mi);
        }
    }
    let mi = field_module.ok_or_else(|| {
        err(
            "PARQUET_RECORD_METADATA",
            "Derived parquet.fields module is required",
            "/modules",
        )
    })?;
    let elements = as_array(get(&modules[mi], "elements").ok_or_else(|| {
        err(
            "PARQUET_RECORD_METADATA",
            "parquet.fields elements are missing",
            "/modules",
        )
    })?)
    .ok_or_else(|| {
        err(
            "PARQUET_RECORD_METADATA",
            "parquet.fields elements must be an array",
            "/modules",
        )
    })?;
    let mut selected_members = Vec::new();
    for &index in &child_indices {
        let id = format!("schema:{index}");
        let found: Vec<_> = elements
            .iter()
            .enumerate()
            .filter(|(_, e)| get(e, "id").and_then(string).as_deref() == Some(id.as_str()))
            .collect();
        if found.len() != 1 {
            blockers.push((
                "RECORD_FIELD_IDENTITY".into(),
                format!("/modules/{mi}/elements"),
                Value::String(k(&id)),
                "Direct member must resolve to exactly one imported field identity".into(),
            ));
            continue;
        }
        selected_members.push((index, found[0].0));
    }
    let names: Vec<_> = selected_members
        .iter()
        .filter_map(|(_, ei)| get(&elements[*ei], "name").and_then(string))
        .collect();
    if names.len() != selected_members.len()
        || names
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            .len()
            != names.len()
    {
        blockers.push((
            "RECORD_DUPLICATE_NAMES".into(),
            format!("/schema/{}", request.index),
            schema_fragment(selected),
            "Duplicate or missing direct sibling names require an explicit member naming policy"
                .into(),
        ));
    }
    if modules.iter().any(|m| {
        get(m, "id").and_then(string).as_deref() == request.record_module.to_utf8().ok().as_deref()
    }) {
        blockers.push((
            "RECORD_IDENTITY_COLLISION".into(),
            "/modules".into(),
            Value::String(request.record_module.clone()),
            "Requested record module already exists; no merge is implied".into(),
        ));
    }
    if !request.authors.is_empty() {
        let mut author_ids = std::collections::BTreeSet::new();
        for author in &request.authors {
            match crate::core_kind::verify_core_kind_declaration(
                author,
                &source,
                engine,
                registry,
                capabilities,
                ctx,
            ) {
                Ok(_) => {
                    let ident = get(author, "identity");
                    let module = get(ident.unwrap_or(&Value::Null), "module").and_then(string);
                    let element = get(ident.unwrap_or(&Value::Null), "element").and_then(string);
                    let valid = module.as_deref() == Some("parquet.fields")
                        && selected_members
                            .iter()
                            .any(|(_, ei)| get(&elements[*ei], "id").and_then(string) == element);
                    if !valid {
                        blockers.push((
                            "AUTHOR_IDENTITY".into(),
                            "/request/authors".into(),
                            copy_json(author, ctx)?,
                            "Author receipt is unrelated to a direct member".into(),
                        ));
                    }
                    if let Some(id) = element {
                        if !author_ids.insert(id.clone()) {
                            blockers.push((
                                "AUTHOR_IDENTITY".into(),
                                "/request/authors".into(),
                                copy_json(author, ctx)?,
                                "Duplicate direct-member author receipt".into(),
                            ));
                        }
                    }
                    if get(get(author, "provenance").unwrap_or(&Value::Null), "kind")
                        .and_then(string)
                        .as_deref()
                        != Some("field")
                    {
                        blockers.push((
                            "FIELD_KIND_CONFLICT".into(),
                            "/request/authors".into(),
                            copy_json(author, ctx)?,
                            "Authored kind conflicts with direct record member role".into(),
                        ));
                    }
                }
                Err(e) => blockers.push((
                    "STALE_AUTHOR".into(),
                    e.path.to_utf8().unwrap_or_default(),
                    copy_json(author, ctx)?,
                    "Author receipt differs from source".into(),
                )),
            }
        }
    }
    // A kind already present without a matching verified Field assertion is
    // ambiguous. A matching verified assertion is allowed to remain in target.
    for (index, ei) in &selected_members {
        let e = &elements[*ei];
        let id = get(e, "id").and_then(string).unwrap_or_default();
        let authored = request.authors.iter().any(|a| {
            get(get(a, "identity").unwrap_or(&Value::Null), "element")
                .and_then(string)
                .as_deref()
                == Some(id.as_str())
                && get(get(a, "provenance").unwrap_or(&Value::Null), "kind")
                    .and_then(string)
                    .as_deref()
                    == Some("field")
        });
        if get(e, "kind").is_some() && !authored {
            blockers.push((
                "FIELD_KIND_CONFLICT".into(),
                format!("/modules/{mi}/elements/{ei}/kind"),
                copy_json(get(e, "kind").unwrap(), ctx)?,
                "Existing kind requires verified author provenance".into(),
            ));
        }
        let path = format!("/modules/{mi}/elements/{ei}/kind");
        push_mapping(
            &mut result,
            "field",
            &path,
            &format!("/schema/{index}"),
            schema_fragment(&captured.schema[*index]),
            "checked-record-field-membership",
            if get(e, "kind").is_some() && !authored {
                "unknown"
            } else {
                "exact"
            },
        );
    }
    let record_path = format!("/modules/{}/elements/0", modules.len());
    push_mapping(
        &mut result,
        "record",
        &format!("{record_path}/kind"),
        &format!("/schema/{}", request.index),
        schema_fragment(selected),
        "checked-record-declaration",
        if blockers.is_empty() {
            "exact"
        } else {
            "unknown"
        },
    );
    if !blockers.is_empty() {
        return validate_receipt(blocked(result, blockers, ctx)?, ctx);
    }

    let mut target = copy_json(&source, ctx)?;
    let target_modules = get_mut_array(&mut target, "modules").ok_or_else(|| {
        err(
            "PARQUET_RECORD_TARGET",
            "Cannot edit module inventory",
            "/modules",
        )
    })?;
    let field_elements = get_mut_array(&mut target_modules[mi], "elements").ok_or_else(|| {
        err(
            "PARQUET_RECORD_TARGET",
            "Cannot edit field inventory",
            "/modules",
        )
    })?;
    for (_, ei) in &selected_members {
        if !request.authors.iter().any(|a| {
            get(get(a, "identity").unwrap_or(&Value::Null), "element")
                .and_then(string)
                .as_deref()
                == get(&field_elements[*ei], "id").and_then(string).as_deref()
        }) {
            set_member(&mut field_elements[*ei], "kind", t("field"));
        }
    }
    let refs = selected_members
        .iter()
        .map(|(_, ei)| {
            obj(vec![
                ("role", t("member")),
                ("module", t("parquet.fields")),
                (
                    "element",
                    get(&elements[*ei], "id").cloned().unwrap_or(Value::Null),
                ),
            ])
        })
        .collect();
    let name = captured.schema[request.index].name.clone();
    let record = obj(vec![
        ("id", Value::String(request.record_id.clone())),
        ("name", Value::String(name)),
        ("kind", t("record")),
        ("extensions", obj(vec![])),
        ("references", Value::Array(refs)),
    ]);
    target_modules.push(obj(vec![
        ("id", Value::String(request.record_module.clone())),
        ("namespace", t("")),
        ("elements", Value::Array(vec![record])),
    ]));
    let validation = engine.validate_document(&target, registry, capabilities, ctx)?;
    if !validation.valid {
        return Err(err(
            "PARQUET_RECORD_TARGET",
            "Classified target failed current core validation",
            "/target",
        ));
    }
    replace(&mut result, "status", t("classified"));
    if let Value::Object(ref mut o) = result {
        o.push((k("target"), target));
    }
    let _ = candidate;
    validate_receipt(result, ctx)
}

fn base_receipt(
    source: &Value,
    r: &ParquetRecordRequest,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut req = vec![
        ("recordModule", Value::String(r.record_module.clone())),
        ("recordId", Value::String(r.record_id.clone())),
        ("index", number(r.index)),
        ("mode", Value::String(r.mode.clone())),
    ];
    if !r.authors.is_empty() {
        req.push((
            "authors",
            Value::Array(
                r.authors
                    .iter()
                    .map(|a| copy_json(a, ctx))
                    .collect::<Result<Vec<_>, _>>()?,
            ),
        ))
    }
    Ok(obj(vec![
        ("operation", t("classify-parquet-record")),
        ("version", t("1.0.0")),
        ("status", t("blocked")),
        ("source", copy_json(source, ctx)?),
        ("request", obj(req)),
        (
            "binding",
            obj(vec![
                ("id", t("umf.parquet.record")),
                ("version", t("1.0.0")),
                (
                    "nativeVersion",
                    t("parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017"),
                ),
                ("subset", t(BINDING)),
            ]),
        ),
        ("mappings", Value::Array(vec![])),
        ("residuals", Value::Array(vec![])),
        ("diagnostics", Value::Array(vec![])),
    ]))
}
fn blocked(
    mut result: Value,
    blockers: Vec<(String, String, Value, String)>,
    _ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let mut residuals = Vec::new();
    let mut diagnostics = Vec::new();
    for (code, path, value, message) in blockers {
        residuals.push(obj(vec![
            ("path", t(&path)),
            ("value", value),
            ("reason", t(&message)),
            ("recovery", t(RECOVERY)),
        ]));
        diagnostics.push(obj(vec![
            ("code", t(&code)),
            ("path", t(&path)),
            ("message", t(&message)),
            ("severity", t("error")),
        ]));
    }
    replace(&mut result, "residuals", Value::Array(residuals));
    replace(&mut result, "diagnostics", Value::Array(diagnostics));
    Ok(result)
}
fn push_mapping(
    result: &mut Value,
    kind: &str,
    ideal: &str,
    native: &str,
    fragment: Value,
    basis: &str,
    outcome: &str,
) {
    if let Some(Value::Array(a)) = get_mut(result, "mappings") {
        a.push(obj(vec![
            ("origin", t("classified")),
            ("kind", t(kind)),
            ("idealPath", t(ideal)),
            ("nativePath", t(native)),
            ("nativeFragment", fragment),
            ("basis", t(basis)),
            ("outcome", t(outcome)),
        ]));
    }
}
fn schema_fragment(e: &SchemaElement) -> Value {
    let mut m = vec![("name", Value::String(e.name.clone()))];
    if let Some(x) = &e.repetition {
        m.push(("repetition", Value::String(x.clone())))
    }
    if let Some(x) = e.num_children {
        m.push(("numChildren", number(x)))
    }
    if let Some(x) = e.converted_type {
        // The admission charge above reserves for the widest signed IDL value.
        m.push(("convertedType", Value::string_utf8(x.to_string())))
    }
    if let Some(x) = &e.physical_type {
        m.push(("physicalType", Value::String(x.clone())))
    }
    if let Some(x) = &e.annotation {
        m.push(("annotation", Value::String(x.clone())))
    }
    obj(m)
}
fn schema_children(
    schema: &[SchemaElement],
    ctx: &mut Context<'_>,
) -> Result<Vec<Vec<usize>>, EngineError> {
    fn walk(
        s: &[SchemaElement],
        i: &mut usize,
        out: &mut Vec<Vec<usize>>,
        depth: usize,
        ctx: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        if depth > 64 || *i >= s.len() {
            return Err(err(
                "PARQUET_SCHEMA",
                "Malformed preorder schema",
                "/schema",
            ));
        }
        ctx.charge_work(1, Utf16::default())?;
        let n = *i;
        *i += 1;
        out[n] = Vec::new();
        if let Some(count) = s[n].num_children {
            for _ in 0..count {
                let c = walk(s, i, out, depth + 1, ctx)?;
                out[n].push(c);
            }
        }
        Ok(n)
    }
    let mut out = vec![Vec::new(); schema.len()];
    let mut i = 0;
    walk(schema, &mut i, &mut out, 0, ctx)?;
    if i != schema.len() {
        return Err(err(
            "PARQUET_SCHEMA",
            "Unattached preorder schema nodes",
            "/schema",
        ));
    }
    Ok(out)
}
fn validate_receipt(value: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let schema = crate::serialization::read_json_value(
        &CLASSIFICATION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let core = crate::serialization::read_json_value(
        include_str!("../../../spec/core/schema.json")
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let kind = crate::serialization::read_json_value(
        include_str!("../../../spec/core/kind-operation-v6.schema.json")
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let semantic = crate::serialization::read_json_value(
        include_str!("../../../spec/core/semantic-type-reference.schema.json")
            .encode_utf16()
            .collect::<Vec<_>>()
            .as_slice(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = crate::schema::SchemaResources {
        entries: vec![
            (k("urn:umf:core:0.10.0"), core),
            (k("urn:umf:core:kind-operation:6.0.0"), kind),
            (k("urn:umf:core:semantic-type-reference:1.0.0"), semantic),
        ],
    };
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    let diagnostics = compiled.validate(&value, ctx)?;
    if let Some(first) = diagnostics.first() {
        return Err(EngineError::new(
            "PARQUET_RECORD_RESULT",
            first.instance_path.clone(),
            first.message.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(value)
}
fn as_array(v: &Value) -> Option<&Vec<Value>> {
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
fn get_mut_array<'a>(v: &'a mut Value, n: &str) -> Option<&'a mut Vec<Value>> {
    match get_mut(v, n)? {
        Value::Array(a) => Some(a),
        _ => None,
    }
}
fn set_member(v: &mut Value, n: &str, value: Value) {
    if let Value::Object(m) = v {
        if let Some((_, old)) = m.iter_mut().find(|(x, _)| x == &k(n)) {
            *old = value
        } else {
            m.push((k(n), value));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        context::{Limits, ResourceProfile},
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
            Ok(Vec::new())
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
    fn document(bytes: &[u8], schema: &[SchemaElement]) -> Value {
        let hex = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let fields = schema
            .iter()
            .enumerate()
            .map(|(i, e)| {
                format!(
                    "{{\"id\":\"schema:{i}\",\"name\":\"{}\",\"extensions\":{{}}}}",
                    e.name.to_utf8().unwrap()
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        parse(&format!("{{\"umf\":\"0.10.0\",\"id\":\"fixture\",\"vocabularies\":{{\"umf.parquet\":{{\"version\":\"0.1.0\"}}}},\"modules\":[{{\"id\":\"parquet\",\"namespace\":\"\",\"elements\":[{{\"id\":\"source\",\"extensions\":{{\"umf.parquet\":{{\"profile\":\"parquet-file-source\",\"encoding\":\"hex\",\"bytes\":\"{hex}\"}}}}}}]}},{{\"id\":\"parquet.fields\",\"namespace\":\"\",\"elements\":[{fields}]}}]}}"))
    }
    fn request() -> ParquetRecordRequest {
        ParquetRecordRequest {
            record_module: k("records"),
            record_id: k("root"),
            index: 2,
            mode: k("strict"),
            authors: vec![],
        }
    }

    #[test]
    fn classifies_the_three_frozen_list_struct_cases_into_full_receipts() {
        let fixtures: [&[u8]; 3] = [
            include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-array.parquet"),
            include_bytes!("../../../fixtures/parquet/containers/list-items_tuple.parquet"),
        ];
        for bytes in fixtures {
            let decoded =
                crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary())
                    .unwrap();
            let source = document(bytes, &decoded.schema);
            for mode in ["strict", "report"] {
                let mut req = request();
                req.mode = k(mode);
                let mut caps = NoCapabilities;
                let receipt = classify_parquet_record(
                    &source,
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
                assert!(get(&receipt, "target").is_some());
                assert!(matches!(get(&receipt,"mappings"),Some(Value::Array(a)) if a.len()>=2));
                assert!(matches!(get(&receipt,"residuals"),Some(Value::Array(a)) if a.is_empty()));
                let validation = engine()
                    .validate_document(
                        get(&receipt, "target").unwrap(),
                        &Registry::new(),
                        &mut caps,
                        &mut Context::ordinary(),
                    )
                    .unwrap();
                assert!(validation.valid);
            }
        }
    }

    #[test]
    fn reports_complete_blocked_receipt_for_list_wrapper() {
        let bytes =
            include_bytes!("../../../fixtures/parquet/containers/list-three-element.parquet");
        let decoded =
            crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary()).unwrap();
        let source = document(bytes, &decoded.schema);
        let mut req = request();
        req.index = 1;
        let mut caps = NoCapabilities;
        let receipt = classify_parquet_record(
            &source,
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
        assert!(matches!(get(&receipt,"residuals"),Some(Value::Array(a)) if !a.is_empty()));
        assert!(matches!(get(&receipt,"diagnostics"),Some(Value::Array(a)) if !a.is_empty()));
    }

    #[test]
    fn resource_refusal_returns_no_receipt() {
        let bytes = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let decoded =
            crate::parquet_schema_decode::decode_schema(bytes, &mut Context::ordinary()).unwrap();
        let source = document(bytes, &decoded.schema);
        let mut limits = Limits::ordinary();
        limits.max_values = 1;
        let mut ctx = Context::with_limits(ResourceProfile::Cooperative, limits).unwrap();
        let mut caps = NoCapabilities;
        let error = classify_parquet_record(
            &source,
            &request(),
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "LIMIT");
    }
}
