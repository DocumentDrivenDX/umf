// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact-source Delta table-context operations (bounded candidate).
//!
//! This profile preserves a supplied metadata/protocol pair. It does not
//! reconcile transaction-log actions or establish reader/writer capability.

use crate::delta_schema::{self, DeltaSchemaResources};
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    native_json::{native_pointer, NativeJsonNode, NativeJsonTree},
    registry::Registry,
    schema::CompiledSchema,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const EXT: &str = "umf.delta.table";
const PROFILE: &str = "delta-table-context";
const TOKEN: u64 = 0x4445_4c54_4154_4201;

pub struct DeltaTableResources {
    engine: Engine,
    registry: Registry,
    grammar: CompiledSchema,
    schema: DeltaSchemaResources,
}

impl DeltaTableResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn read(text: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            serialization::read_json_value(
                &text.encode_utf16().collect::<Vec<_>>(),
                Format::Json,
                ctx,
            )
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
        let manifest = read(
            include_str!("../../../spec/extensions/delta-table/package.json"),
            ctx,
        )?;
        let grammar_value = read(
            include_str!("../../../spec/extensions/delta-table/context-schema.json"),
            ctx,
        )?;
        ensure_table_numeric_grammar(&grammar_value)?;
        let schemas = engine.schema_resources_with_context(ctx)?;
        let grammar = CompiledSchema::compile(&grammar_value, &schemas, ctx)?;
        let mut registry = Registry::new();
        registry.register(
            &manifest,
            Some(TOKEN),
            engine.package_schema(),
            &schemas,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            grammar,
            schema: DeltaSchemaResources::new(ctx)?,
        })
    }
}

fn ensure_table_numeric_grammar(grammar: &Value) -> Result<(), EngineError> {
    const READER_TYPE: &str = "/properties/protocol/properties/minReaderVersion/type";
    const WRITER_TYPE: &str = "/properties/protocol/properties/minWriterVersion/type";
    const CREATED_TYPE: &str = "/properties/metaData/properties/createdTime/type";
    const READER_MIN: &str = "/properties/protocol/properties/minReaderVersion/minimum";
    const WRITER_MIN: &str = "/properties/protocol/properties/minWriterVersion/minimum";
    fn has_numeric(value: &Value) -> bool {
        match value {
            Value::Number(_) => true,
            Value::Array(items) => items.iter().any(has_numeric),
            Value::Object(fields) => fields.iter().any(|(_, v)| has_numeric(v)),
            _ => false,
        }
    }
    fn walk(value: &Value, path: &str, types: &mut Vec<(String, Value)>, rules: &mut Vec<String>) {
        match value {
            Value::Object(fields) => {
                for (key, child) in fields {
                    let key = key.to_utf8().unwrap_or_default();
                    let at = format!("{path}/{key}");
                    match key.as_str() {
                        "type" => {
                            let numeric = match child {
                            Value::String(s) => matches!(s.to_utf8().ok().as_deref(), Some("number" | "integer")),
                            Value::Array(items) => items.iter().any(|v| matches!(v, Value::String(s) if matches!(s.to_utf8().ok().as_deref(), Some("number" | "integer")))),
                            _ => false,
                        };
                            if numeric {
                                types.push((at.clone(), child.clone()));
                            }
                        }
                        "minimum" | "maximum" | "exclusiveMinimum" | "exclusiveMaximum"
                        | "multipleOf" => rules.push(at.clone()),
                        "const" if has_numeric(child) => rules.push(at.clone()),
                        "enum" if matches!(child, Value::Array(items) if items.iter().any(has_numeric)) => {
                            rules.push(at.clone())
                        }
                        _ => {}
                    }
                    walk(child, &at, types, rules);
                }
            }
            Value::Array(items) => {
                for (index, child) in items.iter().enumerate() {
                    walk(child, &format!("{path}/{index}"), types, rules);
                }
            }
            _ => {}
        }
    }
    let mut types = Vec::new();
    let mut rules = Vec::new();
    walk(grammar, "", &mut types, &mut rules);
    let expected_types = [
        (READER_TYPE, Value::string_utf8("integer")),
        (WRITER_TYPE, Value::string_utf8("integer")),
        (
            CREATED_TYPE,
            Value::Array(vec![
                Value::string_utf8("integer"),
                Value::string_utf8("null"),
            ]),
        ),
    ];
    let expected_rules = [READER_MIN, WRITER_MIN];
    let exact_types = types.len() == expected_types.len()
        && expected_types.iter().all(|(path, value)| {
            types
                .iter()
                .any(|(actual, got)| actual == path && got == value)
        });
    let exact_rules = rules.len() == expected_rules.len()
        && expected_rules
            .iter()
            .all(|path| rules.iter().any(|actual| actual == path));
    let exact_minima = [READER_MIN, WRITER_MIN].iter().all(|path| {
        let object_path = path.strip_suffix("/minimum").unwrap();
        let mut current = grammar;
        for segment in object_path.trim_start_matches('/').split('/') {
            let Value::Object(fields) = current else { return false; };
            let Some((_, next)) = fields.iter().find(|(key, _)| key == &Utf16::from(segment)) else { return false; };
            current = next;
        }
        matches!(current, Value::Object(fields) if field(fields, "minimum") == Some(&Value::Number(1.0)))
    });
    if !(exact_types && exact_rules && exact_minima) {
        return Err(EngineError::new("DELTA_TABLE_GRAMMAR_NUMERIC", Utf16::default(), "Delta table numeric projection requires exactly two integer protocol versions with minimum 1 and nullable integer createdTime"));
    }
    Ok(())
}

struct TableCapabilities<'a> {
    grammar: &'a CompiledSchema,
    schema: &'a DeltaSchemaResources,
}
impl Capabilities for TableCapabilities<'_> {
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
        let mut out = vec![warning("DELTA_TABLE_UNVERIFIED", "", "Supplied metadata/protocol context is not a reconciled snapshot; reader/writer support and safe evolution remain unverified")];
        let Value::Object(fields) = payload else {
            return Ok(vec![error(
                "DELTA_TABLE_PAYLOAD",
                "",
                "Payload must be an object",
            )]);
        };
        if field(fields, "profile") != Some(&Value::string_utf8(PROFILE)) {
            out.push(error(
                "DELTA_TABLE_PAYLOAD",
                "",
                "Expected pinned Delta table payload",
            ));
            return Ok(out);
        }
        let Some(root) = field(fields, "root") else {
            out.push(error(
                "DELTA_TABLE_PAYLOAD",
                "",
                "Delta table payload root is missing",
            ));
            return Ok(out);
        };
        if fields.iter().any(|(k, _)| {
            !["profile", "root"]
                .iter()
                .any(|known| k == &Utf16::from(*known))
        }) {
            out.push(warning(
                "DELTA_TABLE_REPRESENTATION",
                "",
                "Unknown profile fields must remain in UMF",
            ));
        }
        let native =
            NativeJsonTree::from_tagged_value(root, ctx).map_err(CapabilityError::Engine)?;
        if native.has_representation_extras() {
            out.push(warning(
                "DELTA_TABLE_REPRESENTATION",
                "/root",
                "Unknown tagged-tree fields must remain in UMF",
            ));
        }
        for (path, message) in table_numeric_diagnostics(native.root()) {
            out.push(error("DELTA_TABLE_STRUCTURE", &path, &message));
        }
        let view = table_shape_view(native.root(), ctx).map_err(CapabilityError::Engine)?;
        for issue in self
            .grammar
            .validate(&view, ctx)
            .map_err(CapabilityError::Engine)?
        {
            out.push(Diagnostic {
                code: Utf16::from("DELTA_TABLE_STRUCTURE"),
                path: issue.instance_path,
                python_source_path: false,
                message: issue.message,
                severity: Severity::Error,
                python_text_origin: None,
            });
        }
        if out.iter().any(|d| d.severity == Severity::Error) {
            return Ok(out);
        }
        table_semantic_warnings(native.root(), self.schema, &mut out, ctx)
            .map_err(CapabilityError::Engine)?;
        Ok(out)
    }
}

fn table_numeric_diagnostics(root: &NativeJsonNode) -> Vec<(String, String)> {
    use NativeJsonNode as N;
    let mut diagnostics = Vec::new();
    let N::Object(fields) = root else {
        return diagnostics;
    };
    let Some((_, N::Object(protocol))) = fields.iter().find(|(k, _)| k == &Utf16::from("protocol"))
    else {
        return diagnostics;
    };
    for name in ["minReaderVersion", "minWriterVersion"] {
        let Some((_, node)) = protocol.iter().find(|(k, _)| k == &Utf16::from(name)) else {
            continue;
        };
        let N::Number(token) = node else { continue };
        let number = token.parse::<f64>().unwrap_or(f64::NAN);
        if !number.is_finite() || number.fract() != 0.0 {
            diagnostics.push((format!("/protocol/{name}"), "must be integer".into()));
        }
        if number < 1.0 {
            diagnostics.push((format!("/protocol/{name}"), "must be >= 1".into()));
        }
    }
    if let Some((_, N::Object(metadata))) =
        fields.iter().find(|(k, _)| k == &Utf16::from("metaData"))
    {
        if let Some((_, N::Number(token))) = metadata
            .iter()
            .find(|(k, _)| k == &Utf16::from("createdTime"))
        {
            let number = token.parse::<f64>().unwrap_or(f64::NAN);
            if !number.is_finite() || number.fract() != 0.0 {
                diagnostics.push((
                    "/metaData/createdTime".into(),
                    "must be integer,null".into(),
                ));
            }
        }
    }
    diagnostics
}

fn table_semantic_warnings(
    root: &NativeJsonNode,
    schema_resources: &DeltaSchemaResources,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    use NativeJsonNode as N;
    fn pointer(key: &Utf16) -> String {
        String::from_utf16(key.units()).ok().unwrap_or_default()
    }
    fn child(base: &str, key: &str) -> String {
        if base.is_empty() {
            format!("/{}", key.replace('~', "~0").replace('/', "~1"))
        } else {
            format!("{base}/{}", key.replace('~', "~0").replace('/', "~1"))
        }
    }
    fn add(ds: &mut Vec<Diagnostic>, code: &str, path: &str, message: &str) {
        ds.push(warning(code, path, message));
    }
    fn object(node: &N) -> Option<&[(Utf16, N)]> {
        if let N::Object(fields) = node {
            Some(fields)
        } else {
            None
        }
    }
    fn get<'a>(node: &'a N, key: &str) -> Option<&'a N> {
        object(node)?
            .iter()
            .find(|(k, _)| k == &Utf16::from(key))
            .map(|(_, v)| v)
    }
    fn text(node: &N) -> Option<String> {
        if let N::String(s) = node {
            s.to_utf8().ok()
        } else {
            None
        }
    }
    fn string_array(node: Option<&N>) -> Vec<String> {
        match node {
            Some(N::Array(items)) => items.iter().filter_map(text).collect(),
            _ => Vec::new(),
        }
    }
    fn unknown(node: &N, known: &[&str], path: &str, ds: &mut Vec<Diagnostic>) {
        if let Some(fields) = object(node) {
            for (key, _) in fields {
                if !known.iter().any(|allowed| key == &Utf16::from(*allowed)) {
                    add(
                        ds,
                        "DELTA_TABLE_UNKNOWN",
                        &child(path, &pointer(key)),
                        "Unknown native property retained",
                    );
                }
            }
        }
    }
    let protocol = get(root, "protocol").expect("grammar admitted protocol object");
    let metadata = get(root, "metaData").expect("grammar admitted metaData object");
    let format = get(metadata, "format").expect("grammar admitted format object");
    let configuration =
        get(metadata, "configuration").expect("grammar admitted configuration object");
    unknown(root, &["protocol", "metaData"], "", diagnostics);
    unknown(
        protocol,
        &[
            "minReaderVersion",
            "minWriterVersion",
            "readerFeatures",
            "writerFeatures",
        ],
        "/protocol",
        diagnostics,
    );
    unknown(
        metadata,
        &[
            "id",
            "name",
            "description",
            "format",
            "schemaString",
            "partitionColumns",
            "configuration",
            "createdTime",
        ],
        "/metaData",
        diagnostics,
    );
    unknown(
        format,
        &["provider", "options"],
        "/metaData/format",
        diagnostics,
    );

    let reader_features = string_array(get(protocol, "readerFeatures"));
    let writer_features = string_array(get(protocol, "writerFeatures"));
    for (version_key, feature_key, expected) in [
        ("minReaderVersion", "readerFeatures", 3.0),
        ("minWriterVersion", "writerFeatures", 7.0),
    ] {
        let version = get(protocol, version_key)
            .and_then(|n| {
                if let N::Number(s) = n {
                    s.parse::<f64>().ok()
                } else {
                    None
                }
            })
            .unwrap_or(f64::NAN);
        let feature_present = get(protocol, feature_key).is_some();
        if (version == expected) != feature_present {
            add(
                diagnostics,
                "DELTA_FEATURE_VERSION",
                &format!("/protocol/{feature_key}"),
                "Feature-list presence does not match the pinned protocol version rule",
            );
        }
        if version > expected {
            add(
                diagnostics,
                "DELTA_FUTURE_PROTOCOL",
                "/protocol",
                "Future protocol version remains uninterpreted",
            );
        }
        let features = if feature_key == "readerFeatures" {
            &reader_features
        } else {
            &writer_features
        };
        if feature_present {
            let mut seen = std::collections::BTreeSet::new();
            if features.iter().any(|name| !seen.insert(name.clone())) {
                add(
                    diagnostics,
                    "DELTA_DUPLICATE_FEATURE",
                    &format!("/protocol/{feature_key}"),
                    "Feature names must be unique",
                );
            }
            for (index, name) in features.iter().enumerate() {
                add(
                    diagnostics,
                    "DELTA_FEATURE_UNVERIFIED",
                    &format!("/protocol/{feature_key}/{index}"),
                    &format!(
                        "Feature preserved; implementation capability is not asserted: {name}"
                    ),
                );
            }
        }
    }
    for name in &reader_features {
        if !writer_features.contains(name) {
            add(
                diagnostics,
                "DELTA_READER_FEATURE_WRITER",
                "/protocol/readerFeatures",
                &format!("Reader feature absent from writer feature list: {name}"),
            );
        }
    }
    if text(get(format, "provider").expect("format provider")) != Some("parquet".to_owned()) {
        add(
            diagnostics,
            "DELTA_FORMAT_UNVERIFIED",
            "/metaData/format/provider",
            "Storage provider is outside the verified examples",
        );
    }
    if let Some(fields) = object(configuration) {
        for (key, _) in fields {
            add(
                diagnostics,
                "DELTA_CONFIGURATION_UNVERIFIED",
                &child("/metaData/configuration", &pointer(key)),
                "Table configuration and embedded SQL preserved without execution or enforcement",
            );
        }
    }

    let schema_source = text(get(metadata, "schemaString").expect("schemaString"));
    let mut parsed_schema = None;
    if let Some(source) = schema_source {
        match delta_schema::import_delta_schema(
            &source.encode_utf16().collect::<Vec<_>>(),
            &Utf16::from("embedded"),
            schema_resources,
            ctx,
        ) {
            Ok(document) => {
                let validation =
                    delta_schema::inspect_delta_schema(&document, schema_resources, ctx)?;
                for mut diagnostic in validation.diagnostics {
                    let prefix = Utf16::from("/metaData/schemaString");
                    let mut path = prefix.units().to_vec();
                    path.extend_from_slice(diagnostic.path.units());
                    diagnostic.path = Utf16::new(path);
                    diagnostics.push(diagnostic);
                }
                if let Ok(native) =
                    NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), ctx)
                {
                    parsed_schema = Some(native);
                }
            }
            Err(_) => add(
                diagnostics,
                "DELTA_EMBEDDED_SCHEMA",
                "/metaData/schemaString",
                "Embedded schema is invalid or outside known shape; exact string retained",
            ),
        }
    }
    if let Some(schema) = parsed_schema.as_ref() {
        let names: Vec<String> = match get(schema.root(), "fields") {
            Some(N::Array(fields)) => fields
                .iter()
                .filter_map(|f| get(f, "name").and_then(text))
                .collect(),
            _ => Vec::new(),
        };
        let mut seen = std::collections::BTreeSet::new();
        if let Some(N::Array(partitions)) = get(metadata, "partitionColumns") {
            for (index, partition) in partitions.iter().enumerate() {
                if let Some(name) = text(partition) {
                    if !names.contains(&name) {
                        add(
                            diagnostics,
                            "DELTA_PARTITION_UNRESOLVED",
                            &format!("/metaData/partitionColumns/{index}"),
                            "Partition name does not exactly match a top-level field",
                        );
                    }
                    if !seen.insert(name) {
                        add(
                            diagnostics,
                            "DELTA_PARTITION_DUPLICATE",
                            &format!("/metaData/partitionColumns/{index}"),
                            "Duplicate partition column",
                        );
                    }
                }
            }
        }
        fn timestamp_type(
            node: &N,
            path: &str,
            reader: &[String],
            writer: &[String],
            ds: &mut Vec<Diagnostic>,
        ) {
            use NativeJsonNode as J;
            match node {
                J::String(s)
                    if s.to_utf8().ok().as_deref() == Some("timestamp_ntz")
                        && !(reader.contains(&"timestampNtz".to_owned())
                            && writer.contains(&"timestampNtz".to_owned())) =>
                {
                    add(
                        ds,
                        "DELTA_TIMESTAMP_NTZ_FEATURE",
                        path,
                        "timestamp_ntz requires reader and writer feature declarations",
                    )
                }
                J::Object(fields) => {
                    let ty = fields
                        .iter()
                        .find(|(k, _)| k == &Utf16::from("type"))
                        .map(|(_, v)| v);
                    let ty_text = ty.and_then(|v| {
                        if let J::String(s) = v {
                            s.to_utf8().ok()
                        } else {
                            None
                        }
                    });
                    match ty_text.as_deref() {
                        Some("struct") => {
                            if let Some(J::Array(children)) = fields
                                .iter()
                                .find(|(k, _)| k == &Utf16::from("fields"))
                                .map(|(_, v)| v)
                            {
                                for (i, child) in children.iter().enumerate() {
                                    if let Some((_, value)) = object(child).and_then(|f| {
                                        f.iter().find(|(k, _)| k == &Utf16::from("type"))
                                    }) {
                                        timestamp_type(
                                            value,
                                            &format!("{path}/fields/{i}/type"),
                                            reader,
                                            writer,
                                            ds,
                                        );
                                    }
                                }
                            }
                        }
                        Some("array") => {
                            if let Some((_, v)) = fields
                                .iter()
                                .find(|(k, _)| k == &Utf16::from("elementType"))
                            {
                                timestamp_type(
                                    v,
                                    &format!("{path}/elementType"),
                                    reader,
                                    writer,
                                    ds,
                                )
                            }
                        }
                        Some("map") => {
                            for (key, segment) in
                                [("keyType", "keyType"), ("valueType", "valueType")]
                            {
                                if let Some((_, v)) =
                                    fields.iter().find(|(k, _)| k == &Utf16::from(key))
                                {
                                    timestamp_type(
                                        v,
                                        &format!("{path}/{segment}"),
                                        reader,
                                        writer,
                                        ds,
                                    )
                                }
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }
        timestamp_type(
            schema.root(),
            "/metaData/schemaString",
            &reader_features,
            &writer_features,
            diagnostics,
        );
    }
    column_mapping_warnings(root, diagnostics, ctx);
    Ok(())
}

fn column_mapping_warnings(
    root: &NativeJsonNode,
    diagnostics: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) {
    use NativeJsonNode as N;
    fn get<'a>(node: &'a N, key: &str) -> Option<&'a N> {
        if let N::Object(fields) = node {
            fields
                .iter()
                .find(|(k, _)| k == &Utf16::from(key))
                .map(|(_, v)| v)
        } else {
            None
        }
    }
    fn text(node: &N) -> Option<String> {
        if let N::String(v) = node {
            v.to_utf8().ok()
        } else {
            None
        }
    }
    fn add(ds: &mut Vec<Diagnostic>, code: &str, path: &str, message: &str) {
        ds.push(warning(code, path, message));
    }
    let (Some(meta), Some(protocol)) = (get(root, "metaData"), get(root, "protocol")) else {
        return;
    };
    let Some(config) = get(meta, "configuration") else {
        return;
    };
    let Some(mode) = get(config, "delta.columnMapping.mode") else {
        return;
    };
    if matches!(mode,N::String(value) if value.to_utf8().ok().as_deref()==Some("none")) {
        return;
    }
    let base = "/metaData/configuration/";
    let Some(mode_text) = text(mode) else {
        add(
            diagnostics,
            "DELTA_MAPPING_MODE",
            &format!("{base}delta.columnMapping.mode"),
            "Unknown mapping mode remains uninterpreted",
        );
        return;
    };
    if !["id", "name"].contains(&mode_text.as_str()) {
        add(
            diagnostics,
            "DELTA_MAPPING_MODE",
            &format!("{base}delta.columnMapping.mode"),
            "Unknown mapping mode remains uninterpreted",
        );
        return;
    }
    let features = |key: &str, name: &str| matches!(get(protocol,key),Some(N::Array(items)) if items.iter().any(|item|text(item).as_deref()==Some(name)));
    let reader = get(protocol, "minReaderVersion").and_then(|v| {
        if let N::Number(n) = v {
            Some(n.as_str())
        } else {
            None
        }
    });
    let writer = get(protocol, "minWriterVersion").and_then(|v| {
        if let N::Number(n) = v {
            Some(n.as_str())
        } else {
            None
        }
    });
    if !(reader == Some("2")
        || (reader == Some("3") && features("readerFeatures", "columnMapping")))
    {
        add(
            diagnostics,
            "DELTA_MAPPING_READER_PROTOCOL",
            "/protocol",
            "Mapping requires reader 2 or reader 3 with columnMapping",
        );
    }
    if !([Some("5"), Some("6")].contains(&writer)
        || (writer == Some("7") && features("writerFeatures", "columnMapping")))
    {
        add(
            diagnostics,
            "DELTA_MAPPING_WRITER_PROTOCOL",
            "/protocol",
            "Mapping requires writer 5/6 or writer 7 with columnMapping",
        );
    }
    add(diagnostics,"DELTA_MAPPING_HISTORY_UNVERIFIED","/metaData/schemaString","Historical physical-path uniqueness, monotonic maxColumnId and actual Parquet field IDs are not verified");
    let max_text = get(config, "delta.columnMapping.maxColumnId").and_then(text);
    let max_id = max_text
        .as_deref()
        .filter(|s| {
            let digits = s.strip_prefix('-').unwrap_or(s);
            !digits.is_empty()
                && digits.bytes().all(|b| b.is_ascii_digit())
                && digits
                    .parse::<i64>()
                    .is_ok_and(|n| n >= i32::MIN as i64 && n <= i32::MAX as i64)
        })
        .and_then(|s| s.parse::<i32>().ok());
    if max_id.is_none() {
        add(
            diagnostics,
            "DELTA_MAPPING_MAX_ID",
            &format!("{base}delta.columnMapping.maxColumnId"),
            "Expected a string containing a signed int32 maximum column ID",
        );
    }
    let Some(schema_text) = get(meta, "schemaString").and_then(text) else {
        return;
    };
    let tree =
        match NativeJsonTree::parse_json(&schema_text.encode_utf16().collect::<Vec<_>>(), ctx) {
            Ok(tree) => tree,
            Err(_) => return,
        };
    fn walk(
        node: &N,
        path: &str,
        physical: Option<Vec<String>>,
        max_id: Option<i32>,
        ids: &mut std::collections::BTreeSet<i32>,
        paths: &mut std::collections::BTreeSet<Vec<String>>,
        ds: &mut Vec<Diagnostic>,
    ) {
        let Some(kind) = get(node, "type").and_then(text) else {
            return;
        };
        match kind.as_str() {
            "struct" => {
                if let Some(N::Array(fields)) = get(node, "fields") {
                    for (index, field) in fields.iter().enumerate() {
                        let at = format!("{path}/fields/{index}");
                        let metadata = get(field, "metadata");
                        let id = metadata.and_then(|m| get(m, "delta.columnMapping.id"));
                        let name =
                            metadata.and_then(|m| get(m, "delta.columnMapping.physicalName"));
                        let id_value = id.and_then(|value| {
                            if let N::Number(token) = value {
                                Some(token.clone())
                            } else {
                                None
                            }
                        });
                        let parsed = id_value
                            .as_deref()
                            .filter(|s| {
                                !s.is_empty()
                                    && s.bytes()
                                        .enumerate()
                                        .all(|(i, b)| b.is_ascii_digit() || (i == 0 && b == b'-'))
                                    && s.parse::<i64>()
                                        .is_ok_and(|v| v >= i32::MIN as i64 && v <= i32::MAX as i64)
                            })
                            .and_then(|s| s.parse::<i32>().ok());
                        if let Some(value) = parsed {
                            if !ids.insert(value) {
                                add(
                                    ds,
                                    "DELTA_MAPPING_DUPLICATE_ID",
                                    &format!("{at}/metadata/delta.columnMapping.id"),
                                    "Column ID is reused in the current schema",
                                );
                            }
                            if max_id.is_some_and(|m| value > m) {
                                add(
                                    ds,
                                    "DELTA_MAPPING_MAX_ID_BELOW_FIELD",
                                    "/metaData/configuration/delta.columnMapping.maxColumnId",
                                    "Declared maximum is below an assigned field ID",
                                );
                            }
                        } else {
                            add(
                                ds,
                                "DELTA_MAPPING_ID",
                                &format!("{at}/metadata/delta.columnMapping.id"),
                                "Every mapped field requires an exact signed int32 column ID",
                            );
                        }
                        let physical_name = name.and_then(text).filter(|s| !s.is_empty());
                        let next = if let Some(name) = physical_name {
                            if let Some(mut parent) = physical.clone() {
                                parent.push(name);
                                if !paths.insert(parent.clone()) {
                                    add(
                                        ds,
                                        "DELTA_MAPPING_DUPLICATE_PATH",
                                        &format!("{at}/metadata/delta.columnMapping.physicalName"),
                                        "Physical field path is reused in the current schema",
                                    );
                                }
                                Some(parent)
                            } else {
                                None
                            }
                        } else {
                            add(
                                ds,
                                "DELTA_MAPPING_PHYSICAL_NAME",
                                &format!("{at}/metadata/delta.columnMapping.physicalName"),
                                "Every mapped field requires a nonempty physical name",
                            );
                            None
                        };
                        if let Some(ty) = get(field, "type") {
                            walk(ty, &format!("{at}/type"), next, max_id, ids, paths, ds);
                        }
                    }
                }
            }
            "array" => {
                if let Some(child) = get(node, "elementType") {
                    walk(
                        child,
                        &format!("{path}/elementType"),
                        physical.map(|mut p| {
                            p.push("element".to_owned());
                            p
                        }),
                        max_id,
                        ids,
                        paths,
                        ds,
                    )
                }
            }
            "map" => {
                for (key, part) in [("keyType", "key"), ("valueType", "value")] {
                    if let Some(child) = get(node, key) {
                        walk(
                            child,
                            &format!("{path}/{key}"),
                            physical.clone().map(|mut p| {
                                p.push(part.to_owned());
                                p
                            }),
                            max_id,
                            ids,
                            paths,
                            ds,
                        )
                    }
                }
            }
            _ => {}
        }
    }
    walk(
        tree.root(),
        "/metaData/schemaString",
        Some(Vec::new()),
        max_id,
        &mut std::collections::BTreeSet::new(),
        &mut std::collections::BTreeSet::new(),
        diagnostics,
    );
}

// The pinned table-context grammar contains numeric minimum/type rules. Keep
// the lossless NativeJsonTree authoritative; the projected validation view
// uses 1 only after checking the numeric assertions for the pinned schema.
fn table_shape_view(node: &NativeJsonNode, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    use NativeJsonNode as N;
    ctx.charge_work(1, Utf16::default())?;
    Ok(match node {
        N::Null => Value::Null,
        N::Boolean(v) => Value::Bool(*v),
        N::String(v) => Value::String(v.clone()),
        N::Number(_) => Value::Number(1.0),
        N::Array(items) => Value::Array(
            items
                .iter()
                .map(|v| table_shape_view(v, ctx))
                .collect::<Result<_, _>>()?,
        ),
        N::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(k, v)| Ok((k.clone(), table_shape_view(v, ctx)?)))
                .collect::<Result<_, EngineError>>()?,
        ),
    })
}

fn validate(
    document: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    let mut capabilities = TableCapabilities {
        grammar: &resources.grammar,
        schema: &resources.schema,
    };
    resources
        .engine
        .validate_document(document, &resources.registry, &mut capabilities, ctx)
}

pub fn inspect_delta_table(
    document: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    validate(document, resources, ctx)
}

pub fn import_delta_table(
    source: &[u16],
    id: &Utf16,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let tree = NativeJsonTree::parse_json(source, ctx)?;
    let extension = Value::Object(vec![
        (Utf16::from("profile"), Value::string_utf8(PROFILE)),
        (
            Utf16::from("root"),
            tree.tagged_value_preserving_extras(ctx)?,
        ),
    ]);
    let element = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("table")),
        (
            Utf16::from("extensions"),
            Value::Object(vec![(Utf16::from(EXT), extension)]),
        ),
    ]);
    let module = Value::Object(vec![
        (Utf16::from("id"), Value::string_utf8("table")),
        (Utf16::from("namespace"), Value::string_utf8("")),
        (Utf16::from("elements"), Value::Array(vec![element])),
    ]);
    let document = Value::Object(vec![
        (Utf16::from("umf"), Value::string_utf8("0.10.0")),
        (Utf16::from("id"), Value::String(id.clone())),
        (
            Utf16::from("vocabularies"),
            Value::Object(vec![(
                Utf16::from(EXT),
                Value::Object(vec![(Utf16::from("version"), Value::string_utf8("0.1.0"))]),
            )]),
        ),
        (Utf16::from("modules"), Value::Array(vec![module])),
    ]);
    let document = copy_json(&document, ctx)?;
    let result = validate(&document, resources, ctx)?;
    if !result.valid {
        return Err(validation_error("DELTA_TABLE_DOCUMENT", &result, ctx)?);
    }
    Ok(document)
}

pub fn export_delta_table(
    document: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Utf16, EngineError> {
    let validation = validate(document, resources, ctx)?;
    if !validation.valid {
        return Err(payload_error("DELTA_TABLE_DOCUMENT", &validation, ctx)?);
    }
    if validation
        .diagnostics
        .iter()
        .any(|d| d.code == Utf16::from("DELTA_TABLE_REPRESENTATION"))
    {
        return Err(err(
            "DELTA_TABLE_EXPORT",
            "Unknown representation fields cannot be discarded",
        ));
    }
    table_tree(document, ctx)?.render_compact(ctx)
}

pub fn get_delta_table_node(
    document: &Value,
    pointer: &Utf16,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let _ = validated_tree(document, resources, ctx)?;
    table_tree(document, ctx)?.subtree_clone(pointer, ctx)
}

pub fn propose_delta_table_node_edit(
    document: &Value,
    pointer: &Utf16,
    replacement: &[u16],
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<(Value, Validation), EngineError> {
    let _ = validated_tree(document, resources, ctx)?;
    native_pointer(pointer, ctx)?;
    let replacement = NativeJsonTree::parse_json(replacement, ctx)?;
    let tree = table_tree(document, ctx)?.replace_node(pointer, &replacement, ctx)?;
    let mut next = copy_json(document, ctx)?;
    set_root(&mut next, tree.tagged_value_preserving_extras(ctx)?)?;
    let validation = validate(&next, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_TABLE_DOCUMENT", &validation, ctx)?);
    }
    Ok((next, validation))
}

/// Source-preserving mapped-field rename candidate. This edits only the
/// supplied current context and does not authorize a Delta transaction.
pub fn rename_delta_mapped_field(
    document: &Value,
    options: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Some(options) = object(options) else {
        return Err(err(
            "DELTA_RENAME_POLICY",
            "Expected nonempty name, field pointer and explicit reference policy",
        ));
    };
    let pointer = field(options, "fieldPointer")
        .and_then(as_text)
        .ok_or_else(|| {
            err(
                "DELTA_RENAME_POLICY",
                "Expected nonempty name, field pointer and explicit reference policy",
            )
        })?;
    let name = field(options, "name").and_then(as_text).ok_or_else(|| {
        err(
            "DELTA_RENAME_POLICY",
            "Expected nonempty name, field pointer and explicit reference policy",
        )
    })?;
    if name.is_empty()
        || field(options, "uninterpretedReferences")
            != Some(&Value::string_utf8("preserve-and-report"))
        || options.iter().any(|(k, _)| {
            !["fieldPointer", "name", "uninterpretedReferences"]
                .iter()
                .any(|known| k == &Utf16::from(*known))
        })
    {
        return Err(err(
            "DELTA_RENAME_POLICY",
            "Expected nonempty name, field pointer and explicit reference policy",
        ));
    }
    let _ = export_delta_table(document, resources, ctx)?;
    let context = table_tree(document, ctx)?;
    if !matches!(context.root(), NativeJsonNode::Object(_)) {
        return Err(err("DELTA_RENAME_CONTEXT", "Expected table context"));
    }
    let mode = context.child(
        &Utf16::from("/metaData/configuration/delta.columnMapping.mode"),
        ctx,
    )?;
    if !matches!(mode,NativeJsonNode::String(s) if ["name","id"].iter().any(|m|s==&Utf16::from(*m)))
    {
        return Err(err(
            "DELTA_RENAME_MAPPING",
            "Rename requires active name/id column mapping",
        ));
    }
    let validation = inspect_delta_table(document, resources, ctx)?;
    let blocked_codes = [
        "DELTA_FORMAT_UNVERIFIED",
        "DELTA_DUPLICATE_NAME",
        "DELTA_EMBEDDED_SCHEMA",
        "DELTA_UNKNOWN_TYPE",
        "DELTA_FEATURE_VERSION",
        "DELTA_READER_FEATURE_WRITER",
        "DELTA_FUTURE_PROTOCOL",
        "DELTA_PARTITION_UNRESOLVED",
        "DELTA_PARTITION_DUPLICATE",
    ];
    let blockers: Vec<_> = validation
        .diagnostics
        .iter()
        .filter(|d| {
            (d.code
                .to_utf8()
                .unwrap_or_default()
                .starts_with("DELTA_MAPPING_")
                && d.code != Utf16::from("DELTA_MAPPING_HISTORY_UNVERIFIED"))
                || blocked_codes.iter().any(|c| d.code == Utf16::from(*c))
        })
        .cloned()
        .collect();
    if !blockers.is_empty() {
        return Err(err(
            "DELTA_RENAME_CONTEXT",
            &serialization::stringify_compact(&Value::Array(
                blockers.iter().map(diagnostic_as_value).collect(),
            ))?
            .to_utf8()
            .unwrap_or_default(),
        ));
    }
    let protocol = context.child(&Utf16::from("/protocol"), ctx)?;
    if let NativeJsonNode::Object(members) = protocol {
        for key in ["readerFeatures", "writerFeatures"] {
            if let Some(NativeJsonNode::Array(items)) = member(members, key) {
                if items.iter().any(|n| !matches!(n,NativeJsonNode::String(s) if ["columnMapping","appendOnly"].iter().any(|k|s==&Utf16::from(*k)))) { return Err(err("DELTA_RENAME_FEATURE", "Feature requires an explicit rename contract")); }
            }
        }
    }
    let config = context.child(&Utf16::from("/metaData/configuration"), ctx)?;
    if let NativeJsonNode::Object(members) = config {
        if members.iter().any(|(k, _)| {
            k.to_utf8()
                .unwrap_or_default()
                .starts_with("delta.constraints.")
                || k == &Utf16::from("delta.clusteringColumns")
        }) {
            return Err(err(
                "DELTA_RENAME_DEPENDENCY",
                "Constraint or clustering references require explicit rewriting",
            ));
        }
    }
    let schema_text = context.child(&Utf16::from("/metaData/schemaString"), ctx)?;
    let NativeJsonNode::String(schema_text) = schema_text else {
        return Err(err("DELTA_RENAME_CONTEXT", "Expected table context"));
    };
    let schema_doc = delta_schema::import_delta_schema(
        schema_text.units(),
        &field(
            object(document)
                .ok_or_else(|| err("DELTA_RENAME_CONTEXT", "Expected table context"))?,
            "id",
        )
        .and_then(as_text)
        .cloned()
        .unwrap_or_default(),
        &resources.schema,
        ctx,
    )?;
    let schema =
        delta_schema::get_delta_node(&schema_doc, &Utf16::default(), &resources.schema, ctx)?;
    let segments = crate::native_json::native_pointer(pointer, ctx)?;
    let target_segments = segments
        .iter()
        .map(|segment| {
            segment
                .to_utf8()
                .map(|text| text.replace('~', "~0").replace('/', "~1"))
                .map_err(|_| {
                    err(
                        "DELTA_RENAME_PATH",
                        "Pointer segment must contain well-formed UTF-16",
                    )
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let target = "/".to_owned() + &target_segments.join("/");
    let mut old_name = None;
    fn walk(
        n: &NativeJsonNode,
        path: &str,
        target: &str,
        old_name: &mut Option<Utf16>,
    ) -> Result<(), EngineError> {
        let NativeJsonNode::Object(members) = n else {
            return Ok(());
        };
        let kind = member(members, "type")
            .and_then(as_node_text)
            .unwrap_or_default();
        if kind == "struct" {
            if let Some(NativeJsonNode::Array(fields)) = member(members, "fields") {
                for (i, f) in fields.iter().enumerate() {
                    let at = format!("{path}/fields/{i}");
                    if let NativeJsonNode::Object(fm) = f {
                        if let Some(NativeJsonNode::Object(meta)) = member(fm, "metadata") {
                            if meta.iter().any(|(k, _)| {
                                [
                                    "delta.invariants",
                                    "delta.generationExpression",
                                    "CURRENT_DEFAULT",
                                    "EXISTS_DEFAULT",
                                ]
                                .iter()
                                .any(|x| k == &Utf16::from(*x))
                            }) {
                                return Err(err("DELTA_RENAME_DEPENDENCY", "Column expression/default dependencies require explicit rewriting"));
                            }
                        }
                        if at == target {
                            if let Some(NativeJsonNode::String(s)) = member(fm, "name") {
                                *old_name = Some(s.clone());
                            }
                        }
                        if let Some(t) = member(fm, "type") {
                            walk(t, &format!("{at}/type"), target, old_name)?;
                        }
                    }
                }
            }
        }
        if kind == "array" {
            if let Some(e) = member(members, "elementType") {
                walk(e, &format!("{path}/elementType"), target, old_name)?;
            }
        }
        if kind == "map" {
            for (key, seg) in [("keyType", "keyType"), ("valueType", "valueType")] {
                if let Some(v) = member(members, key) {
                    walk(v, &format!("{path}/{seg}"), target, old_name)?;
                }
            }
        }
        Ok(())
    }
    walk(schema.root(), "", &target, &mut old_name)?;
    let old_name = old_name.ok_or_else(|| {
        err(
            "DELTA_RENAME_PATH",
            "Pointer must select an actual mapped StructField",
        )
    })?;
    let name_json = serialization::stringify_compact(&Value::String(name.clone()))?;
    let (renamed_schema, _) = delta_schema::propose_delta_node_edit(
        &schema_doc,
        &Utf16::from(format!("{target}/name")),
        name_json.units(),
        &resources.schema,
        ctx,
    )?;
    let renamed_schema_text =
        delta_schema::export_delta_schema(&renamed_schema, &resources.schema, ctx)?;
    let schema_json = serialization::stringify_compact(&Value::String(renamed_schema_text))?;
    let (mut candidate, _) = propose_delta_table_node_edit(
        document,
        &Utf16::from("/metaData/schemaString"),
        schema_json.units(),
        resources,
        ctx,
    )?;
    let mut partition_updates = Vec::new();
    if segments.len() == 2
        && segments[0] == Utf16::from("fields")
        && segments[1]
            .to_utf8()
            .unwrap_or_default()
            .bytes()
            .all(|b| b.is_ascii_digit())
    {
        let current = table_tree(&candidate, ctx)?;
        if let NativeJsonNode::Array(items) =
            current.child(&Utf16::from("/metaData/partitionColumns"), ctx)?
        {
            let mut next = Vec::new();
            for (i, item) in items.iter().enumerate() {
                if matches!(item,NativeJsonNode::String(s) if s==&old_name) {
                    partition_updates.push(obj(vec![
                        ("index", Value::Number(i as f64)),
                        ("from", Value::String(old_name.clone())),
                        ("to", Value::String(name.clone())),
                    ]));
                    next.push(Value::String(name.clone()));
                } else if let NativeJsonNode::String(s) = item {
                    next.push(Value::String(s.clone()));
                }
            }
            if !partition_updates.is_empty() {
                let json = serialization::stringify_compact(&Value::Array(next))?;
                (candidate, _) = propose_delta_table_node_edit(
                    &candidate,
                    &Utf16::from("/metaData/partitionColumns"),
                    json.units(),
                    resources,
                    ctx,
                )?;
            }
        }
    }
    let validation = inspect_delta_table(&candidate, resources, ctx)?;
    if validation.diagnostics.iter().any(|d| {
        [
            "DELTA_DUPLICATE_NAME",
            "DELTA_PARTITION_UNRESOLVED",
            "DELTA_PARTITION_DUPLICATE",
        ]
        .iter()
        .any(|c| d.code == Utf16::from(*c))
    }) {
        return Err(err(
            "DELTA_RENAME_COLLISION",
            "Candidate name collides or invalidates partition references",
        ));
    }
    Ok(obj(vec![("source",copy_json(document,ctx)?),("document",candidate),("complete",Value::Bool(false)),("partitionUpdates",Value::Array(partition_updates)),("validation",validation_as_value(validation)),("diagnostics",Value::Array(vec![diagnostic_as_value(&Diagnostic{code:Utf16::from("DELTA_RENAME_EXTERNAL_STATE"),path:Utf16::from(target),python_source_path:false,severity:Severity::Warning,message:Utf16::from("Physical names/IDs retained; historical uniqueness, data-file mappings, transaction concurrency and uninterpreted external references remain unverified"),python_text_origin:None})]))]))
}

fn validated_tree(
    document: &Value,
    resources: &DeltaTableResources,
    ctx: &mut Context<'_>,
) -> Result<NativeJsonTree, EngineError> {
    let validation = validate(document, resources, ctx)?;
    if !validation.valid {
        return Err(validation_error("DELTA_TABLE_DOCUMENT", &validation, ctx)?);
    }
    table_tree(document, ctx)
}
fn table_tree(document: &Value, ctx: &mut Context<'_>) -> Result<NativeJsonTree, EngineError> {
    let modules = array(
        field(
            object(document)
                .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload"))?,
            "modules",
        )
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload"))?,
    )
    .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload"))?;
    for module in modules {
        let Some(fields) = object(module) else {
            continue;
        };
        if field(fields, "id") != Some(&Value::string_utf8("table")) {
            continue;
        }
        let Some(elements) = array(field(fields, "elements").unwrap_or(&Value::Null)) else {
            continue;
        };
        for element in elements {
            let Some(fields) = object(element) else {
                continue;
            };
            if field(fields, "id") != Some(&Value::string_utf8("table")) {
                continue;
            }
            let payload = field(
                object(field(fields, "extensions").unwrap_or(&Value::Null)).unwrap_or(&[]),
                EXT,
            )
            .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload"))?;
            let p = object(payload)
                .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload"))?;
            if field(p, "profile") != Some(&Value::string_utf8(PROFILE)) {
                return Err(err(
                    "DELTA_TABLE_PAYLOAD",
                    "Expected pinned Delta table payload",
                ));
            }
            return NativeJsonTree::from_tagged_value(
                field(p, "root").ok_or_else(|| {
                    err("DELTA_TABLE_PAYLOAD", "Expected pinned Delta table payload")
                })?,
                ctx,
            );
        }
    }
    Err(err(
        "DELTA_TABLE_PAYLOAD",
        "Expected pinned Delta table payload",
    ))
}
fn set_root(document: &mut Value, tagged: Value) -> Result<(), EngineError> {
    let Value::Object(doc) = document else {
        return Err(err(
            "DELTA_TABLE_PAYLOAD",
            "Document root must be an object",
        ));
    };
    let modules = field_mut(doc, "modules")
        .and_then(as_array_mut)
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table module is missing"))?;
    let module = modules
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("table")))
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table module is missing"))?;
    let elements = field_mut(object_mut(module).unwrap(), "elements")
        .and_then(as_array_mut)
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table element is missing"))?;
    let element = elements
        .iter_mut()
        .find(|v| field(object(v).unwrap_or(&[]), "id") == Some(&Value::string_utf8("table")))
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table element is missing"))?;
    let ext = field_mut(object_mut(element).unwrap(), "extensions")
        .and_then(as_object_mut)
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table extension is missing"))?;
    let payload = field_mut(ext, EXT)
        .and_then(as_object_mut)
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table payload is missing"))?;
    *field_mut(payload, "root")
        .ok_or_else(|| err("DELTA_TABLE_PAYLOAD", "Table root is missing"))? = tagged;
    Ok(())
}
fn warning(code: &str, path: &str, message: &str) -> Diagnostic {
    diagnostic(code, path, message, Severity::Warning)
}
fn error(code: &str, path: &str, message: &str) -> Diagnostic {
    diagnostic(code, path, message, Severity::Error)
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
    v: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    let message = v
        .diagnostics
        .iter()
        .filter(|d| d.severity == Severity::Error)
        .map(|d| {
            format!(
                "{} at {}: {}",
                d.code.to_utf8().unwrap_or_default(),
                d.path.to_utf8().unwrap_or_default(),
                d.message.to_utf8().unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    ctx.charge_text(message.encode_utf16().count(), Utf16::default())?;
    Ok(EngineError::new(code, Utf16::default(), message))
}
fn payload_error(
    code: &str,
    v: &Validation,
    ctx: &mut Context<'_>,
) -> Result<EngineError, EngineError> {
    validation_error(code, v, ctx)
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = value {
        Some(v)
    } else {
        None
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = value {
        Some(v)
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
fn as_text(value: &Value) -> Option<&Utf16> {
    if let Value::String(s) = value {
        Some(s)
    } else {
        None
    }
}
fn member<'a>(members: &'a [(Utf16, NativeJsonNode)], key: &str) -> Option<&'a NativeJsonNode> {
    members
        .iter()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn as_node_text(value: &NativeJsonNode) -> Option<String> {
    if let NativeJsonNode::String(s) = value {
        s.to_utf8().ok()
    } else {
        None
    }
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn diagnostic_as_value(d: &Diagnostic) -> Value {
    obj(vec![
        ("code", Value::String(d.code.clone())),
        ("path", Value::String(d.path.clone())),
        ("message", Value::String(d.message.clone())),
        (
            "severity",
            Value::string_utf8(if d.severity == Severity::Warning {
                "warning"
            } else {
                "error"
            }),
        ),
    ])
}
fn validation_as_value(v: Validation) -> Value {
    obj(vec![
        ("valid", Value::Bool(v.valid)),
        ("complete", Value::Bool(v.complete)),
        (
            "diagnostics",
            Value::Array(v.diagnostics.iter().map(diagnostic_as_value).collect()),
        ),
    ])
}
fn field_mut<'a>(fields: &'a mut [(Utf16, Value)], key: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(k, _)| k == &Utf16::from(key))
        .map(|(_, v)| v)
}
fn object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    if let Value::Object(v) = value {
        Some(v)
    } else {
        None
    }
}
fn as_object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
    object_mut(value)
}
fn as_array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{ensure_table_numeric_grammar, table_numeric_diagnostics};
    use crate::{
        native_json::NativeJsonTree,
        serialization::{self, Format},
        value::{Utf16, Value},
        Context,
    };

    #[test]
    fn numeric_projection_guard_accepts_only_the_pinned_table_rules() {
        let mut ctx = Context::ordinary();
        let mut grammar = serialization::read_json_value(
            &include_str!("../../../spec/extensions/delta-table/context-schema.json")
                .encode_utf16()
                .collect::<Vec<_>>(),
            Format::Json,
            &mut ctx,
        )
        .unwrap();
        assert!(ensure_table_numeric_grammar(&grammar).is_ok());
        let Value::Object(fields) = &mut grammar else {
            panic!("schema root must be object")
        };
        fields.push((
            Utf16::from("futureNumericRule"),
            Value::Object(vec![
                (Utf16::from("type"), Value::string_utf8("integer")),
                (Utf16::from("minimum"), Value::Number(0.0)),
            ]),
        ));
        assert_eq!(
            ensure_table_numeric_grammar(&grammar).unwrap_err().code,
            "DELTA_TABLE_GRAMMAR_NUMERIC"
        );
    }

    #[test]
    fn numeric_profile_matches_typescript_binary64_integer_and_minimum_boundaries() {
        fn diagnostics(protocol_value: &str, created_time: Option<&str>) -> Vec<(String, String)> {
            let created = created_time
                .map(|n| format!(",\"metaData\":{{\"createdTime\":{n}}}"))
                .unwrap_or_default();
            let source = format!("{{\"protocol\":{{\"minReaderVersion\":{protocol_value},\"minWriterVersion\":7}}{created}}}");
            let mut ctx = Context::ordinary();
            let tree =
                NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), &mut ctx)
                    .unwrap();
            table_numeric_diagnostics(tree.root())
        }
        assert!(diagnostics("0.99999999999999999", None).is_empty());
        assert!(diagnostics("1.00000000000000001", None).is_empty());
        assert!(diagnostics("1e0", None).is_empty());
        assert_eq!(
            diagnostics("0.9999999999999998", None),
            vec![
                (
                    "/protocol/minReaderVersion".into(),
                    "must be integer".into()
                ),
                ("/protocol/minReaderVersion".into(), "must be >= 1".into()),
            ]
        );
        assert_eq!(
            diagnostics("1.5", None),
            vec![(
                "/protocol/minReaderVersion".into(),
                "must be integer".into()
            ),]
        );
        assert_eq!(
            diagnostics("1e400", None),
            vec![(
                "/protocol/minReaderVersion".into(),
                "must be integer".into()
            ),]
        );
        assert!(diagnostics("3", Some("1.00000000000000001")).is_empty());
        assert_eq!(
            diagnostics("3", Some("1.5")),
            vec![(
                "/metaData/createdTime".into(),
                "must be integer,null".into()
            ),]
        );
    }
}
