// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact Spark DataType schema JSON source operations for CONTRACT-017.
//!
//! This module preserves native JSON, metadata, unknown properties, and exact number tokens.
//! It does not claim Spark runtime validity or execute UDTs.

use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{native_pointer, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.spark";
const PROFILE: &str = "spark-datatype-json";
const TOKEN: u64 = 0x5350_4152_4b53_4301;
const CORE_VERSION: &str = "0.10.0";
const EXT_VERSION: &str = "0.1.0";

pub struct SparkSchemaResources {
    engine: Engine,
    registry: Registry,
    grammar: CompiledSchema,
    manifest: Value,
}

impl SparkSchemaResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &source.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
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
        let manifest = resource(
            include_str!("../../../spec/extensions/spark/package.json"),
            ctx,
        )?;
        let grammar_value = resource(
            include_str!("../../../spec/extensions/spark/datatype-schema.json"),
            ctx,
        )?;

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
        Ok(Self {
            engine,
            registry,
            grammar,
            manifest,
        })
    }

    pub fn package(&self) -> &Value {
        &self.manifest
    }
}

struct SparkCapabilities<'a> {
    grammar: &'a CompiledSchema,
}

impl Capabilities for SparkCapabilities<'_> {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }

    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        _semantic: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        let mut diagnostics = vec![diagnostic(
            "SPARK_CONTEXT_UNVERIFIED", "",
            "Schema preservation does not establish Spark engine validity, runtime configuration, metadata interpretation, collation providers or coercion behavior",
            Severity::Warning,
        )];
        let Value::Object(fields) = payload else {
            return Ok(vec![diagnostic(
                "SPARK_PAYLOAD",
                "",
                "Payload must be an object",
                Severity::Error,
            )]);
        };
        if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
            diagnostics.push(diagnostic(
                "SPARK_PAYLOAD",
                "",
                "Expected pinned Spark schema payload",
                Severity::Error,
            ));
            return Ok(diagnostics);
        }
        let Some(root) = field(fields, "root") else {
            diagnostics.push(diagnostic(
                "SPARK_PAYLOAD",
                "",
                "Spark payload root is missing",
                Severity::Error,
            ));
            return Ok(diagnostics);
        };
        if fields.iter().any(|(key, _)| {
            !["profile", "root"]
                .iter()
                .any(|known| key == &Utf16::from(*known))
        }) {
            diagnostics.push(diagnostic(
                "SPARK_REPRESENTATION",
                "",
                "Unknown representation fields must remain in UMF",
                Severity::Warning,
            ));
        }
        if let Some(root) = field(fields, "root") {
            tagged_representation_warnings(root, &Utf16::from("/root"), &mut diagnostics);
        }
        let native =
            NativeJsonTree::from_tagged_value(root, ctx).map_err(CapabilityError::Engine)?;
        // The schema grammar only constrains the source shape; arbitrary
        // numeric metadata is opaque. Build a temporary validation view that
        // does not round exact source number tokens through f64. The original
        // NativeJsonTree remains the sole export/edit authority.
        let view = shape_view(native.root(), ctx).map_err(CapabilityError::Engine)?;
        for issue in self
            .grammar
            .validate(&view, ctx)
            .map_err(CapabilityError::Engine)?
        {
            diagnostics.push(Diagnostic {
                code: Utf16::from("SPARK_STRUCTURE"),
                path: issue.instance_path,
                python_source_path: false,
                message: issue.message,
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
        // Keep source-schema semantic warnings in the same traversal/order as
        // the TypeScript predecessor. These are warnings only: this profile
        // does not prove protocol support or native reader/writer validity.
        schema_semantic_warnings(&view, &mut diagnostics);
        spark_metadata_collation_warnings(native.root(), ctx, &mut diagnostics)
            .map_err(CapabilityError::Engine)?;
        Ok(diagnostics)
    }
}

fn tagged_representation_warnings(value: &Value, path: &Utf16, diagnostics: &mut Vec<Diagnostic>) {
    let Value::Object(fields) = value else { return };
    let kind = field(fields, "kind").and_then(|v| {
        if let Value::String(s) = v {
            s.to_utf8().ok()
        } else {
            None
        }
    });
    let allowed: &[&str] = match kind.as_deref() {
        Some("null") => &["kind"],
        Some("array") => &["kind", "items"],
        Some("object") => &["kind", "members"],
        _ => &["kind", "value"],
    };
    for (key, _) in fields {
        if !allowed.iter().any(|name| key == &Utf16::from(*name)) {
            diagnostics.push(Diagnostic {
                code: Utf16::from("SPARK_REPRESENTATION"),
                path: path.clone(),
                python_source_path: false,
                message: Utf16::from("Unknown tagged-tree fields must remain in UMF"),
                severity: Severity::Warning,
                python_text_origin: None,
            });
        }
    }
    if kind.as_deref() == Some("object") {
        if let Some(Value::Object(members)) = field(fields, "members") {
            for (key, child) in members {
                tagged_representation_warnings(child, &native_child_path(path, key), diagnostics);
            }
        }
    } else if kind.as_deref() == Some("array") {
        if let Some(Value::Array(items)) = field(fields, "items") {
            for (index, child) in items.iter().enumerate() {
                tagged_representation_warnings(
                    child,
                    &native_child_path(path, &Utf16::from(index.to_string())),
                    diagnostics,
                );
            }
        }
    }
}

fn native_child_path(path: &Utf16, key: &Utf16) -> Utf16 {
    let mut units = path.units().to_vec();
    units.push(b'/' as u16);
    for unit in key.units() {
        match *unit {
            0x7e => units.extend([b'~' as u16, b'0' as u16]),
            0x2f => units.extend([b'~' as u16, b'1' as u16]),
            u => units.push(u),
        }
    }
    Utf16::new(units)
}

fn known_spark_parameter(value: &str) -> bool {
    let compact = value
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>();
    for prefix in ["char(", "varchar("] {
        if let Some(digits) = compact
            .strip_prefix(prefix)
            .and_then(|s| s.strip_suffix(')'))
        {
            if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) {
                return true;
            }
        }
    }
    if value.starts_with("string collate ") && !value["string collate ".len()..].trim().is_empty() {
        return true;
    }
    let words = value.split_whitespace().collect::<Vec<_>>();
    let units = ["year", "month", "day", "hour", "minute", "second"];
    (words.len() == 2 && words[0] == "interval" && units.contains(&words[1]))
        || (words.len() == 4
            && words[0] == "interval"
            && units.contains(&words[1])
            && words[2] == "to"
            && units.contains(&words[3]))
}

fn schema_semantic_warnings(root: &Value, diagnostics: &mut Vec<Diagnostic>) {
    fn add(ds: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str) {
        ds.push(Diagnostic {
            code: Utf16::from(code),
            path: path.clone(),
            python_source_path: false,
            message: Utf16::from(message),
            severity: Severity::Warning,
            python_text_origin: None,
        });
    }
    fn child(path: &Utf16, key: &Utf16) -> Utf16 {
        let mut units = path.units().to_vec();
        units.push(b'/' as u16);
        for unit in key.units() {
            match *unit {
                0x7e => units.extend([b'~' as u16, b'0' as u16]),
                0x2f => units.extend([b'~' as u16, b'1' as u16]),
                unit => units.push(unit),
            }
        }
        Utf16::new(units)
    }
    fn unknown(value: &[(Utf16, Value)], known: &[&str], path: &Utf16, ds: &mut Vec<Diagnostic>) {
        for (key, _) in value {
            if !known.iter().any(|name| key == &Utf16::from(*name)) {
                add(
                    ds,
                    "SPARK_UNKNOWN",
                    &child(path, key),
                    "Unknown native property preserved; native normalization may discard it",
                );
            }
        }
    }
    fn walk(value: &Value, path: &Utf16, ds: &mut Vec<Diagnostic>) {
        const ATOMIC: &[&str] = &[
            "string",
            "long",
            "integer",
            "short",
            "byte",
            "float",
            "double",
            "boolean",
            "binary",
            "date",
            "timestamp",
            "timestamp_ltz",
            "timestamp_ntz",
            "void",
            "variant",
        ];
        match value {
            Value::String(spelling) => {
                let text = spelling.to_utf8().unwrap_or_default();
                let compact = text
                    .chars()
                    .filter(|c| !c.is_whitespace())
                    .collect::<String>();
                if let Some((precision_text, scale_text)) = compact
                    .strip_prefix("decimal(")
                    .and_then(|s| s.strip_suffix(')'))
                    .and_then(|s| s.split_once(','))
                    .filter(|(p, s)| {
                        !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) && {
                            let scale = s.trim_start_matches(char::is_whitespace);
                            let digits = scale.strip_prefix('-').unwrap_or(scale);
                            !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
                        }
                    })
                {
                    let precision = precision_text.parse::<f64>().unwrap_or(f64::INFINITY);
                    let scale = scale_text
                        .trim_start_matches(char::is_whitespace)
                        .parse::<f64>()
                        .unwrap_or(f64::NAN);
                    if precision < 1.0 || precision > 38.0 || scale < 0.0 || scale > precision {
                        add(
                            ds,
                            "SPARK_DECIMAL_RANGE",
                            path,
                            "Decimal parameters require native and protocol validation",
                        );
                    }
                } else if !ATOMIC.contains(&text.as_str()) && !known_spark_parameter(&text) {
                    add(ds, "SPARK_UNKNOWN_TYPE", path, "Type spelling is outside the declared protocol vocabulary; native parser acceptance is insufficient");
                }
                if matches!(text.as_str(), "timestamp_ntz" | "variant") {
                    add(ds, "SPARK_FEATURE_REQUIRED", path, "Type requires matching table protocol/features; schema-only import cannot verify them");
                }
                if text == "void" {
                    add(ds, "SPARK_VOID_WRITE_CONTEXT", path, "Void storage omission and write restrictions require the surrounding table schema");
                }
            }
            Value::Object(fields) => {
                let kind = field(fields, "type").and_then(|v| {
                    if let Value::String(s) = v {
                        s.to_utf8().ok()
                    } else {
                        None
                    }
                });
                match kind.as_deref() {
                    Some("struct") => {
                        unknown(fields, &["type", "fields"], path, ds);
                        let mut names: Vec<String> = Vec::new();
                        if let Some(Value::Array(items)) = field(fields, "fields") {
                            for (index, item) in items.iter().enumerate() {
                                let at = child(
                                    &child(path, &Utf16::from("fields")),
                                    &Utf16::from(index.to_string()),
                                );
                                if let Value::Object(field_fields) = item {
                                    unknown(
                                        field_fields,
                                        &["name", "type", "nullable", "metadata"],
                                        &at,
                                        ds,
                                    );
                                    if let Some(Value::String(name)) = field(field_fields, "name") {
                                        let folded =
                                            name.to_utf8().unwrap_or_default().to_lowercase();
                                        if names.contains(&folded) {
                                            add(ds, "SPARK_DUPLICATE_NAME", &child(&at, &Utf16::from("name")), "Case-insensitive duplicate name; preserved source is not a valid Spark table schema");
                                        }
                                        names.push(folded);
                                    }
                                    if let Some(nested) = field(field_fields, "type") {
                                        walk(nested, &child(&at, &Utf16::from("type")), ds);
                                    }
                                    if let Some(Value::Object(metadata)) =
                                        field(field_fields, "metadata")
                                    {
                                        for (key, _) in metadata {
                                            add(ds, "SPARK_METADATA_UNVERIFIED", &child(&child(&at, &Utf16::from("metadata")), key), "Column metadata retained exactly; constraints, identity, mapping and defaults are not executed or validated against table context");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some("array") => {
                        unknown(fields, &["type", "elementType", "containsNull"], path, ds);
                        if let Some(nested) = field(fields, "elementType") {
                            walk(nested, &child(path, &Utf16::from("elementType")), ds);
                        }
                    }
                    Some("map") => {
                        unknown(
                            fields,
                            &["type", "keyType", "valueType", "valueContainsNull"],
                            path,
                            ds,
                        );
                        if let Some(nested) = field(fields, "keyType") {
                            walk(nested, &child(path, &Utf16::from("keyType")), ds);
                        }
                        if let Some(nested) = field(fields, "valueType") {
                            walk(nested, &child(path, &Utf16::from("valueType")), ds);
                        }
                        if field(fields, "valueContainsNull").is_none() {
                            add(ds, "SPARK_DEFAULT_NULLABILITY", path, "Native parser may insert valueContainsNull=true; source absence is retained");
                        }
                    }
                    _ => add(
                        ds,
                        "SPARK_UNKNOWN_TYPE",
                        path,
                        "Unknown object-form type retained without interpreting or executing it",
                    ),
                }
            }
            _ => {}
        }
    }
    walk(root, &Utf16::default(), diagnostics);
}

fn spark_metadata_collation_warnings(
    root: &crate::native_json::NativeJsonNode,
    ctx: &mut Context<'_>,
    diagnostics: &mut Vec<Diagnostic>,
) -> Result<(), EngineError> {
    use crate::native_json::NativeJsonNode as N;
    fn member<'a>(node: &'a N, key: &str) -> Option<&'a N> {
        let N::Object(fields) = node else { return None };
        fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value)
    }
    fn add(ds: &mut Vec<Diagnostic>, code: &str, path: &Utf16, message: &str) {
        ds.push(Diagnostic {
            code: Utf16::from(code),
            path: path.clone(),
            python_source_path: false,
            message: Utf16::from(message),
            severity: Severity::Warning,
            python_text_origin: None,
        });
    }
    fn child(path: &Utf16, key: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        let escaped = key
            .units()
            .iter()
            .map(|u| if *u == 0x7e || *u == 0x2f { 2 } else { 1 })
            .sum::<usize>();
        let len = path.len().saturating_add(1).saturating_add(escaped);
        ctx.charge_text(len, path.clone())?;
        let mut units = Vec::new();
        units
            .try_reserve(len)
            .map_err(|_| err("LIMIT", "Unable to allocate Spark diagnostic path"))?;
        units.extend_from_slice(path.units());
        units.push(b'/' as u16);
        for unit in key.units() {
            match *unit {
                0x7e => units.extend([b'~' as u16, b'0' as u16]),
                0x2f => units.extend([b'~' as u16, b'1' as u16]),
                x => units.push(x),
            }
        }
        Ok(Utf16::new(units))
    }
    fn category(node: &N) -> &'static str {
        match node {
            N::Null => "null",
            N::Boolean(_) => "boolean",
            N::String(_) => "string",
            N::Number(n) if n.bytes().any(|b| matches!(b, b'.' | b'e' | b'E')) => "double",
            N::Number(_) => "long",
            N::Array(_) => "array",
            N::Object(_) => "object",
        }
    }
    fn metadata_value(
        node: &N,
        path: &Utf16,
        ctx: &mut Context<'_>,
        ds: &mut Vec<Diagnostic>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        match node {
            N::Number(raw) => {
                if raw.bytes().any(|b| matches!(b, b'.' | b'e' | b'E')) {
                    if raw.parse::<f64>().map(|n| !n.is_finite()).unwrap_or(true) {
                        add(ds, "SPARK_METADATA_NONFINITE", path, "Spark JVM metadata converts this number to a nonfinite double and may emit a string; UMF retains the exact token");
                    } else {
                        add(ds, "SPARK_METADATA_DOUBLE", path, "Spark JVM metadata uses binary64 for fractional/exponent tokens; precision and source spelling may change");
                    }
                } else if raw.parse::<i64>().is_err() {
                    add(ds, "SPARK_METADATA_INT64_OVERFLOW", path, "Spark JVM metadata converts integer tokens to int64 and can wrap this value; UMF retains the exact token");
                }
            }
            N::Object(fields) => {
                for (key, value) in fields {
                    metadata_value(value, &child(path, key, ctx)?, ctx, ds)?;
                }
            }
            N::Array(items) => {
                if items.is_empty() {
                    add(ds, "SPARK_METADATA_EMPTY_ARRAY", path, "Spark JVM infers an empty int64 array; source JSON does not specify the array element type");
                } else {
                    let first = category(&items[0]);
                    if matches!(first, "null" | "array") {
                        add(
                            ds,
                            "SPARK_METADATA_ARRAY_UNSUPPORTED",
                            path,
                            "Spark JVM metadata does not support arrays of nulls or nested arrays",
                        );
                    }
                    if items.iter().any(|item| category(item) != first) {
                        add(ds, "SPARK_METADATA_ARRAY_MIXED", path, "Spark JVM metadata requires homogeneous array categories, including separate integer and double categories");
                    }
                }
                for (index, item) in items.iter().enumerate() {
                    metadata_value(
                        item,
                        &child(path, &Utf16::from(index.to_string()), ctx)?,
                        ctx,
                        ds,
                    )?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    fn type_locations(
        node: &N,
        suffix: &str,
        out: &mut Vec<(String, bool)>,
        ctx: &mut Context<'_>,
        path: &Utf16,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        if let N::String(name) = node {
            out.push((suffix.to_string(), name == &Utf16::from("string")));
            return Ok(());
        }
        if let N::Object(_) = node {
            match member(node, "type")
                .and_then(|n| {
                    if let N::String(s) = n {
                        s.to_utf8().ok()
                    } else {
                        None
                    }
                })
                .as_deref()
            {
                Some("array") => {
                    if let Some(child) = member(node, "elementType") {
                        type_locations(child, &format!("{suffix}.element"), out, ctx, path)?;
                    }
                }
                Some("map") => {
                    if let Some(child) = member(node, "keyType") {
                        type_locations(child, &format!("{suffix}.key"), out, ctx, path)?;
                    }
                    if let Some(child) = member(node, "valueType") {
                        type_locations(child, &format!("{suffix}.value"), out, ctx, path)?;
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
    fn walk(
        node: &N,
        path: &Utf16,
        ctx: &mut Context<'_>,
        ds: &mut Vec<Diagnostic>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, path.clone())?;
        if member(node, "type")
            .and_then(|n| {
                if let N::String(s) = n {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .as_deref()
            == Some("struct")
        {
            if let Some(N::Array(fields)) = member(node, "fields") {
                for (i, field) in fields.iter().enumerate() {
                    let at = child(
                        &child(path, &Utf16::from("fields"), ctx)?,
                        &Utf16::from(i.to_string()),
                        ctx,
                    )?;
                    if member(field, "type").is_none() {
                        continue;
                    }
                    if let Some(meta) = member(field, "metadata") {
                        if member(field, "nullable").is_none() {
                            add(ds, "SPARK_FIELD_METADATA_WITHOUT_NULLABLE", &at, "Spark JVM 4.0.1 does not accept a field with metadata but no nullable property; Python may insert the default");
                        }
                        let meta_path = child(&at, &Utf16::from("metadata"), ctx)?;
                        if let Some(collations) = member(meta, "__COLLATIONS") {
                            let map_path = child(&meta_path, &Utf16::from("__COLLATIONS"), ctx)?;
                            match collations {
                                N::Object(entries)=>{
                                    let name=member(field,"name").and_then(|n|if let N::String(s)=n{s.to_utf8().ok()}else{None}).unwrap_or_default();
                                    let mut locations=Vec::new();
                                    type_locations(member(field,"type").unwrap(),&name,&mut locations,ctx,&at)?;
                                    for (key,value) in entries {
                                        let key_text=key.to_utf8().unwrap_or_default();
                                        let where_path=child(&map_path,key,ctx)?;
                                        if !matches!(value,N::String(_)){add(ds,"SPARK_COLLATION_VALUE",&where_path,"Native collation annotation is not a string; JVM may ignore it while Python rejects it");}
                                        if let N::String(provider)=value { let p=provider.to_utf8().unwrap_or_default(); if !(p.starts_with("spark.")||p.starts_with("icu."))||p.len()<=6 {add(ds,"SPARK_COLLATION_PROVIDER",&where_path,"Expected a Spark 4.0.1 provider-qualified collation name; provider/name validity requires native verification");} }
                                        match locations.iter().find(|(candidate,_)|candidate==&key_text) { None=>add(ds,"SPARK_COLLATION_UNRESOLVED",&where_path,"Path does not resolve within this field through known array/map types; native parsing may discard the annotation"), Some((_,false))=>add(ds,"SPARK_COLLATION_TARGET",&where_path,"Collation path targets a non-string schema node; native parsers may reject it"), _=>{} }
                                    }
                                }
                                _=>add(ds,"SPARK_COLLATION_MAP",&map_path,"Native collation metadata must be a path-to-string map; JVM may ignore this value while Python rejects it"),
                            }
                        }
                        metadata_value(meta, &meta_path, ctx, ds)?;
                    }
                    walk(
                        member(field, "type").unwrap(),
                        &child(&at, &Utf16::from("type"), ctx)?,
                        ctx,
                        ds,
                    )?;
                }
            }
        }
        match member(node, "type")
            .and_then(|n| {
                if let N::String(s) = n {
                    s.to_utf8().ok()
                } else {
                    None
                }
            })
            .as_deref()
        {
            Some("array") => {
                if let Some(n) = member(node, "elementType") {
                    walk(n, &child(path, &Utf16::from("elementType"), ctx)?, ctx, ds)?;
                }
            }
            Some("map") => {
                for key in ["keyType", "valueType"] {
                    if let Some(n) = member(node, key) {
                        walk(n, &child(path, &Utf16::from(key), ctx)?, ctx, ds)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }
    walk(root, &Utf16::default(), ctx, diagnostics)
}

// The pinned datatype grammar currently expresses object/array/string/boolean
// shape only. This projection maps number tokens to 0.0, so `new()` rejects
// any numeric type assertion or numeric-valued assertion/bound before this
// function can be used for validation. NativeJsonTree remains authoritative.
fn shape_view(
    node: &crate::native_json::NativeJsonNode,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    use crate::native_json::NativeJsonNode as N;
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        N::Null => Value::Null,
        N::Boolean(value) => Value::Bool(*value),
        N::String(value) => Value::String(value.clone()),
        N::Number(_) => Value::Number(0.0),
        N::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| shape_view(item, ctx))
                .collect::<Result<_, _>>()?,
        ),
        N::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, value)| Ok((key.clone(), shape_view(value, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn validate_document(
    document: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut capabilities = SparkCapabilities {
        grammar: &resources.grammar,
    };
    resources
        .engine
        .validate_document(document, &resources.registry, &mut capabilities, ctx)
}

pub fn import_spark_schema(
    source: &[u16],
    id: &Utf16,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let document = document(id, tree.tagged_value_preserving_extras(ctx)?, ctx)?;
    let validation = validate_document(&document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("SPARK_DOCUMENT", &validation, ctx)?);
    }
    Ok(document)
}

/// Inspect a validated Spark schema document and return its ordered
/// structural and semantic diagnostics without changing the native source.
pub fn inspect_spark_schema(
    document: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate_document(document, resources, ctx)
}

pub fn inspect_spark_schema_payload(
    payload: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut capabilities = SparkCapabilities {
        grammar: &resources.grammar,
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
            CapabilityError::Host(message) | CapabilityError::HostPython { message, .. } => {
                EngineError::new("HOST_CALLBACK", Utf16::default(), message)
            }
        })
}

pub fn export_spark_schema(
    document: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let validation = validate_document(document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("SPARK_DOCUMENT", &validation, ctx)?);
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("SPARK_REPRESENTATION"))
    {
        return Err(err(
            "SPARK_EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    payload_tree(document, ctx)?.render_compact(ctx)
}

pub fn get_spark_node(
    document: &Value,
    pointer: &Utf16,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let tree = payload_tree_validated(document, resources, ctx)?;
    tree.subtree_clone(pointer, ctx)
}

pub fn propose_spark_node_edit(
    document: &Value,
    pointer: &Utf16,
    replacement: &[u16],
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let mut tree = payload_tree_validated(document, resources, ctx)?;
    // Preserve predecessor error order: validate the pointer before parsing
    // replacement text, then validate the copied candidate.
    native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement, ctx)?;
    tree = tree.replace_node(pointer, &replacement, ctx)?;
    let tagged = tree.tagged_value_preserving_extras(ctx)?;
    let mut candidate = copy_json(document, ctx)?;
    set_payload_root(&mut candidate, tagged)?;
    let validation = validate_document(&candidate, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("SPARK_DOCUMENT", &validation, ctx)?);
    }
    Ok((candidate, validation))
}

pub fn rename_spark_field(
    document: &Value,
    options: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let fields = object(options).ok_or_else(|| {
        err(
            "SPARK_RENAME_POLICY",
            "Expected field pointer, string name, and explicit preserve-and-report metadata policy",
        )
    })?;
    let pointer = field(fields, "fieldPointer").and_then(as_utf16).ok_or_else(|| err("SPARK_RENAME_POLICY", "Expected field pointer, string name, and explicit preserve-and-report metadata policy"))?;
    let name = field(fields, "name")
        .and_then(as_utf16)
        .cloned()
        .ok_or_else(|| {
            err(
            "SPARK_RENAME_POLICY",
            "Expected field pointer, string name, and explicit preserve-and-report metadata policy",
        )
        })?;
    if field(fields, "uninterpretedMetadata") != Some(&Value::string_utf8("preserve-and-report"))
        || fields.len() != 3
        || fields.iter().any(|(key, _)| {
            !["fieldPointer", "name", "uninterpretedMetadata"]
                .iter()
                .any(|known| key == &Utf16::from(*known))
        })
    {
        return Err(err(
            "SPARK_RENAME_POLICY",
            "Expected field pointer, string name, and explicit preserve-and-report metadata policy",
        ));
    }
    let _ = export_spark_schema(document, resources, ctx)?;
    let segments = native_pointer(pointer, ctx)?;
    let root = get_spark_node(document, &Utf16::default(), resources, ctx)?;
    let mut target = Utf16::default();
    for segment in &segments {
        target = native_child_path(&target, segment);
    }
    let mut tagged = root.tagged_value_preserving_extras(ctx)?;
    fn tagged_members_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
        let fields = object_mut(value)?;
        if field(fields, "kind") != Some(&Value::string_utf8("object")) {
            return None;
        }
        object_mut(field_mut(fields, "members")?)
    }
    fn native_at_mut<'a>(node: &'a mut Value, segments: &[Utf16]) -> Option<&'a mut Value> {
        let Some((first, rest)) = segments.split_first() else {
            return Some(node);
        };
        let fields = object_mut(node)?;
        let kind = field(fields, "kind").and_then(as_text)?;
        match kind.as_str() {
            "object" => {
                let native_members = field_mut(fields, "members")?;
                let native_members = object_mut(native_members)?;
                let child = native_members
                    .iter_mut()
                    .find(|(key, _)| key == first)
                    .map(|(_, value)| value)?;
                native_at_mut(child, rest)
            }
            "array" => {
                let index = first.to_utf8().ok()?.parse::<usize>().ok()?;
                let items = field_mut(fields, "items")?;
                let items = match items {
                    Value::Array(items) => items,
                    _ => return None,
                };
                native_at_mut(items.get_mut(index)?, rest)
            }
            _ => None,
        }
    }
    let field_node = native_at_mut(&mut tagged, &segments).ok_or_else(|| {
        err(
            "SPARK_RENAME_PATH",
            "Pointer must select a StructField in the known struct/array/map tree",
        )
    })?;
    let selected = tagged_members_mut(field_node).ok_or_else(|| {
        err(
            "SPARK_RENAME_PATH",
            "Pointer must select a StructField in the known struct/array/map tree",
        )
    })?;
    let old_name = field(selected, "name")
        .and_then(tagged_string_units)
        .ok_or_else(|| {
            err(
                "SPARK_RENAME_PATH",
                "Pointer must select a StructField with a string name",
            )
        })?;
    if field(selected, "type").is_none() {
        return Err(err(
            "SPARK_RENAME_PATH",
            "Pointer must select a StructField with a type",
        ));
    }
    let mut eligible = Vec::<(Utf16, Utf16)>::new();
    fn join(base: &Utf16, suffix: &str, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
        let extra = suffix.encode_utf16().count();
        let len = base.len().saturating_add(extra);
        ctx.charge_text(len, base.clone())?;
        let mut units = Vec::new();
        units
            .try_reserve(len)
            .map_err(|_| err("LIMIT", "Unable to allocate Spark collation path"))?;
        units.extend_from_slice(base.units());
        units.extend(suffix.encode_utf16());
        Ok(Utf16::new(units))
    }
    fn collect_type_paths(
        node: &Value,
        suffix: &str,
        old: &Utf16,
        new: &Utf16,
        out: &mut Vec<(Utf16, Utf16)>,
        ctx: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        ctx.charge_work(1, Utf16::default())?;
        let fields = match object(node) {
            Some(f) => f,
            None => return Ok(()),
        };
        let Some(kind) = field(fields, "kind").and_then(as_text) else {
            return Ok(());
        };
        match kind.as_str() {
            "string" => {
                if tagged_string(node).as_deref() == Some("string") {
                    out.push((join(old, suffix, ctx)?, join(new, suffix, ctx)?));
                }
            }
            "object" => {
                let members = object(
                    field(fields, "members")
                        .ok_or_else(|| err("SPARK_RENAME_PATH", "Malformed tagged type"))?,
                )
                .ok_or_else(|| err("SPARK_RENAME_PATH", "Malformed tagged type"))?;
                match field(members, "type").and_then(tagged_string).as_deref() {
                    Some("array") => {
                        if let Some(child) = field(members, "elementType") {
                            collect_type_paths(
                                child,
                                &format!("{suffix}.element"),
                                old,
                                new,
                                out,
                                ctx,
                            )?;
                        }
                    }
                    Some("map") => {
                        if let Some(child) = field(members, "keyType") {
                            collect_type_paths(
                                child,
                                &format!("{suffix}.key"),
                                old,
                                new,
                                out,
                                ctx,
                            )?;
                        }
                        if let Some(child) = field(members, "valueType") {
                            collect_type_paths(
                                child,
                                &format!("{suffix}.value"),
                                old,
                                new,
                                out,
                                ctx,
                            )?;
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
        Ok(())
    }
    collect_type_paths(
        field(selected, "type").unwrap(),
        "",
        &old_name,
        &name,
        &mut eligible,
        ctx,
    )?;
    let mut renamed = Vec::new();
    if let Some(metadata) = field_mut(selected, "metadata") {
        if tagged_members_mut(metadata).is_some() {
            if let Some(metadata_fields) = tagged_members_mut(metadata) {
                if let Some(collations) = field_mut(metadata_fields, "__COLLATIONS") {
                    if tagged_members_mut(collations).is_none() {
                        return Err(err("SPARK_COLLATION_PATH", "Expected a collation path map"));
                    }
                    let map = tagged_members_mut(collations).ok_or_else(|| {
                        err("SPARK_COLLATION_PATH", "Expected a collation path map")
                    })?;
                    if name.is_empty() && !map.is_empty() {
                        return Err(err("SPARK_COLLATION_EMPTY_NAME", "Empty collated field names are blocked because Spark may drop nested collation paths"));
                    }
                    let mut replacement = Vec::new();
                    for (key, value) in map.iter() {
                        ctx.charge_work(1, Utf16::default())?;
                        let next = eligible
                            .iter()
                            .find(|(from, _)| from == key)
                            .map(|(_, to)| to.clone())
                            .ok_or_else(|| err("SPARK_COLLATION_PATH", "Collation annotation does not resolve to a string in the selected field"))?;
                        let old_key = key.clone();
                        let key = next.clone();
                        if replacement
                            .iter()
                            .any(|(prior, _): &(Utf16, Value)| prior == &key)
                        {
                            return Err(err(
                                "SPARK_COLLATION_PATH",
                                "Renamed collation path collision",
                            ));
                        }
                        if tagged_string(value).is_none() {
                            return Err(err(
                                "SPARK_COLLATION_PATH",
                                "Collation annotation must be a string",
                            ));
                        }
                        replacement.push((key, value.clone()));
                        renamed.push(Value::Object(vec![
                            (Utf16::from("from"), Value::String(old_key)),
                            (Utf16::from("to"), Value::String(next.clone())),
                        ]));
                    }
                    *map = replacement;
                }
            }
        }
    }
    let name_value = Value::Object(vec![
        (Utf16::from("kind"), Value::string_utf8("string")),
        (Utf16::from("value"), Value::String(name.clone())),
    ]);
    if let Some(existing) = field_mut(selected, "name") {
        *existing = name_value;
    } else {
        return Err(err("SPARK_RENAME_PATH", "Selected StructField has no name"));
    }
    let replacement = NativeJsonTree::from_tagged_value(field_node, ctx)?.render_compact(ctx)?;
    let (candidate, validation) =
        propose_spark_node_edit(document, &target, replacement.units(), resources, ctx)?;
    Ok(Value::Object(vec![
        (Utf16::from("source"), copy_json(document, ctx)?),
        (Utf16::from("document"), candidate),
        (Utf16::from("validation"), validation_as_value(validation)),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("renamedCollationPaths"), Value::Array(renamed)),
        (Utf16::from("diagnostics"), Value::Array(vec![Value::Object(vec![
            (Utf16::from("code"), Value::string_utf8("SPARK_NAME_REFERENCES_UNVERIFIED")),
            (Utf16::from("path"), Value::String(target.clone())),
            (Utf16::from("message"), Value::string_utf8("Known field-local collation paths were updated; other metadata and external references remain uninterpreted and may retain the old name")),
            (Utf16::from("severity"), Value::string_utf8("warning")),
        ])])),
    ]))
}

fn validation_as_value(validation: Validation) -> Value {
    let diagnostics = validation
        .diagnostics
        .into_iter()
        .map(|d| {
            Value::Object(vec![
                (Utf16::from("code"), Value::String(d.code)),
                (Utf16::from("path"), Value::String(d.path)),
                (Utf16::from("message"), Value::String(d.message)),
                (
                    Utf16::from("severity"),
                    Value::string_utf8(match d.severity {
                        Severity::Error => "error",
                        Severity::Warning => "warning",
                    }),
                ),
            ])
        })
        .collect();
    Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ])
}

fn tagged_string(value: &Value) -> Option<String> {
    let fields = object(value)?;
    if field(fields, "kind") != Some(&Value::string_utf8("string")) {
        return None;
    }
    field(fields, "value").and_then(as_text)
}
fn tagged_string_units(value: &Value) -> Option<Utf16> {
    let fields = object(value)?;
    if field(fields, "kind") != Some(&Value::string_utf8("string")) {
        return None;
    }
    field(fields, "value").and_then(as_utf16).cloned()
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    if let Value::String(s) = value {
        Some(s)
    } else {
        None
    }
}

fn as_text(value: &Value) -> Option<String> {
    if let Value::String(s) = value {
        s.to_utf8().ok()
    } else {
        None
    }
}

fn payload_tree_validated(
    document: &Value,
    resources: &SparkSchemaResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let validation = validate_document(document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("SPARK_DOCUMENT", &validation, ctx)?);
    }
    payload_tree(document, ctx)
}

fn payload_tree(document: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let payload = find_payload(document)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Expected pinned Spark schema payload"))?;
    let fields = object(payload)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Expected pinned Spark schema payload"))?;
    if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
        return Err(err("SPARK_PAYLOAD", "Expected pinned Spark schema payload"));
    }
    NativeJsonTree::from_tagged_value(
        field(fields, "root")
            .ok_or_else(|| err("SPARK_PAYLOAD", "Expected pinned Spark schema payload"))?,
        ctx,
    )
}

fn find_payload(document: &Value) -> Option<&Value> {
    let modules = array(field(object(document)?, "modules")?)?;
    for module in modules {
        let mf = object(module)?;
        if field(mf, "id") == Some(&Value::string_utf8("schema")) {
            for element in array(field(mf, "elements")?)? {
                let ef = object(element)?;
                if field(ef, "id") == Some(&Value::string_utf8("schema")) {
                    if let Some(payload) = field(object(field(ef, "extensions")?)?, EXT) {
                        return Some(payload);
                    }
                }
            }
        }
    }
    None
}

fn document(id: &Utf16, tagged: Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let payload = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (Utf16::from("root"), tagged),
    ]);
    let ext = Value::Object(vec![(Utf16::from(EXT), payload)]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("extensions"), ext),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("schema")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    let doc = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8(CORE_VERSION)),
        (Utf16::from("id"), Value::String(id.clone())),
        (
            Utf16::from("vocabularies"),
            Value::Object(vec![(
                Utf16::from(EXT),
                Value::Object(vec![(
                    Utf16::from("version"),
                    Value::string_utf8(EXT_VERSION),
                )]),
            )]),
        ),
        (Utf16::from("modules"), Value::Array(vec![module])),
    ]);
    copy_json(&doc, ctx)
}

fn set_payload_root(document: &mut Value, tagged: Value) -> Result<(), EngineError> {
    let Value::Object(doc) = document else {
        return Err(err("SPARK_PAYLOAD", "Document root must be an object"));
    };
    let modules = field_mut(doc, "modules")
        .and_then(as_array_mut)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema module is missing"))?;
    let module = modules
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema module is missing"))?;
    let elements = field_mut(object_mut(module).unwrap(), "elements")
        .and_then(as_array_mut)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema element is missing"))?;
    let element = elements
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("schema")))
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema element is missing"))?;
    let ext = field_mut(object_mut(element).unwrap(), "extensions")
        .and_then(as_object_mut)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document extensions are missing"))?;
    let payload = field_mut(ext, EXT)
        .and_then(as_object_mut)
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema payload is missing"))?;
    let root = field_mut(payload, "root")
        .ok_or_else(|| err("SPARK_PAYLOAD", "Document schema payload root is missing"))?;
    *root = tagged;
    Ok(())
}

fn diagnostic(code: &str, path: &str, message: &str, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: Utf16::from(code),
        path: Utf16::from(path),
        python_source_path: false,
        message: Utf16::from(message),
        severity,
        python_text_origin: None,
    }
}
fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn validation_error(
    code: &str,
    validation: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let mut message = String::from("[");
    for (index, diagnostic) in validation.diagnostics.iter().enumerate() {
        if index > 0 {
            message.push(',');
        }
        message.push_str("{\"code\":");
        json_quote(&mut message, &diagnostic.code);
        message.push_str(",\"path\":");
        json_quote(&mut message, &diagnostic.path);
        if diagnostic.code == Utf16::from("SPARK_CONTEXT_UNVERIFIED") {
            message.push_str(",\"severity\":\"warning\",\"message\":");
            json_quote(&mut message, &diagnostic.message);
        } else {
            message.push_str(",\"message\":");
            json_quote(&mut message, &diagnostic.message);
            message.push_str(if diagnostic.severity == Severity::Warning {
                ",\"severity\":\"warning\""
            } else {
                ",\"severity\":\"error\""
            });
        }
        message.push('}');
    }
    message.push(']');
    let units = message.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    Ok(EngineError::new(code, Utf16::default(), message))
}
fn json_quote(output: &mut String, value: &Utf16) {
    output.push('"');
    for unit in value.units() {
        match *unit {
            0x22 => output.push_str("\\\""),
            0x5c => output.push_str("\\\\"),
            0x08 => output.push_str("\\b"),
            0x0c => output.push_str("\\f"),
            0x0a => output.push_str("\\n"),
            0x0d => output.push_str("\\r"),
            0x09 => output.push_str("\\t"),
            0x00..=0x1f => output.push_str(&format!("\\u{unit:04x}")),
            0xd800..=0xdfff => output.push_str(&format!("\\u{unit:04x}")),
            _ => output.push(char::from_u32(*unit as u32).unwrap()),
        }
    }
    output.push('"');
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(fields) = value {
        Some(fields)
    } else {
        None
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn field<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    if let Value::Object(fields) = value {
        Some(fields)
    } else {
        None
    }
}
fn as_object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    object_mut(value)
}
fn as_array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(items) = value {
        Some(items)
    } else {
        None
    }
}
fn field_mut<'a>(fields: &'a mut [(Utf16, Value)], key: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
