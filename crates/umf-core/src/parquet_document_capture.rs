// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact byte capture from a current UMF Parquet Document.
//!
//! This is an adapter boundary, not the full record-type classifier. It
//! validates the core envelope, admits only the pinned Parquet source profile,
//! decodes its native schema, and associates the requested schema index with
//! the imported `parquet.fields` identity when that module is present.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_record_type_candidate::SchemaElement,
    parquet_schema_decode::decode_schema,
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const PARQUET_EXTENSION: &str = "umf.parquet";
const PARQUET_VERSION: &str = "0.1.0";
const PARQUET_PROFILE: &str = "parquet-file-source";
const MAX_BYTES: usize = 1_000_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SchemaIdentity {
    pub module: Utf16,
    pub element: Utf16,
}
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParquetDocumentCapture {
    pub bytes: Vec<u8>,
    pub schema_index: usize,
    pub schema_identity: Option<SchemaIdentity>,
    pub schema: Vec<SchemaElement>,
}

/// Capture the authoritative Parquet source and resolve a requested schema
/// index from a current core Document. If `parquet.fields` is present, its
/// selected element must use the adapter's schema-index identity.
pub fn capture_parquet_document(
    document: &Value,
    schema_index: usize,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<ParquetDocumentCapture, EngineError> {
    let copied = copy_json(document, ctx)?;
    let validation = engine.validate_document(&copied, registry, capabilities, ctx)?;
    if !validation.valid {
        return Err(err("INVALID_DOCUMENT", "Current UMF document is invalid"));
    }

    let bytes = source_bytes(&copied, ctx)?;
    let decoded = decode_schema(&bytes, ctx)?;
    let selected = decoded.schema.get(schema_index).ok_or_else(|| {
        err(
            "PARQUET_SCHEMA_INDEX",
            "Requested schema index is out of range",
        )
    })?;
    // Force identity text to be well-formed and meter the selected native name.
    selected.name.to_utf8().map_err(|_| {
        err(
            "PARQUET_SCHEMA_INDEX",
            "Selected schema identity is not valid UTF-8",
        )
    })?;
    ctx.charge_work(selected.name.len(), Utf16::from("/schema"))?;

    let schema_identity = selected_field_identity(&copied, schema_index, ctx)?;
    Ok(ParquetDocumentCapture {
        bytes,
        schema_index,
        schema_identity,
        schema: decoded.schema,
    })
}

fn source_bytes(document: &Value, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    let version = get(
        get(document, "vocabularies").ok_or_else(|| missing("vocabularies"))?,
        PARQUET_EXTENSION,
    )
    .and_then(|v| get(v, "version"))
    .and_then(as_text);
    if version.as_deref() != Some(PARQUET_VERSION) {
        return Err(err("PARQUET_CAPTURE", "Expected umf.parquet version 0.1.0"));
    }
    let module = unique_by_id(document, "modules", "parquet")?;
    let source = unique_by_id(module, "elements", "source")?;
    let payload = get(
        get(source, "extensions").ok_or_else(|| missing("extensions"))?,
        PARQUET_EXTENSION,
    )
    .ok_or_else(|| err("PARQUET_CAPTURE", "Missing Parquet source payload"))?;
    let profile = get(payload, "profile").and_then(as_text);
    let encoding = get(payload, "encoding").and_then(as_text);
    let hex = get(payload, "bytes").and_then(as_utf16).ok_or_else(|| {
        err(
            "PARQUET_CAPTURE",
            "Parquet bytes must be a hexadecimal string",
        )
    })?;
    if profile.as_deref() != Some(PARQUET_PROFILE) || encoding.as_deref() != Some("hex") {
        return Err(err(
            "PARQUET_CAPTURE",
            "Unsupported Parquet capture profile or encoding",
        ));
    }
    let payload_members = as_object(payload)
        .ok_or_else(|| err("PARQUET_CAPTURE", "Parquet payload must be an object"))?;
    if payload_members.iter().any(|(key, _)| {
        !["profile", "encoding", "bytes"].contains(&key.to_utf8().unwrap_or_default().as_str())
    }) {
        return Err(err(
            "PARQUET_UNKNOWN_CONTENT",
            "Unknown Parquet capture properties cannot be discarded",
        ));
    }
    let units = hex.units();
    if units.len() % 2 != 0
        || units.len() > MAX_BYTES * 2
        || !units
            .iter()
            .all(|&b| matches!(b, 0x30..=0x39 | 0x61..=0x66))
    {
        return Err(err(
            "PARQUET_CAPTURE",
            "Parquet capture must be bounded lowercase hexadecimal",
        ));
    }
    ctx.charge_work(
        units.len(),
        Utf16::from("/modules/parquet/elements/source/extensions/umf.parquet/bytes"),
    )?;
    let mut bytes = Vec::with_capacity(units.len() / 2);
    for pair in units.chunks_exact(2) {
        let hi = hex_nibble(pair[0] as u8)
            .ok_or_else(|| err("PARQUET_CAPTURE", "Invalid hexadecimal source"))?;
        let lo = hex_nibble(pair[1] as u8)
            .ok_or_else(|| err("PARQUET_CAPTURE", "Invalid hexadecimal source"))?;
        bytes.push((hi << 4) | lo);
    }
    Ok(bytes)
}

fn selected_field_identity(
    document: &Value,
    index: usize,
    ctx: &mut Context<'_>,
) -> Result<Option<SchemaIdentity>, EngineError> {
    let modules = get(document, "modules")
        .and_then(as_array)
        .ok_or_else(|| missing("modules"))?;
    let fields_module_id = Utf16::from("parquet.fields");
    let mut matching_modules = modules.iter().filter(|module| {
        get(module, "id").is_some_and(|id| as_utf16(id) == Some(&fields_module_id))
    });
    let Some(module) = matching_modules.next() else {
        return Ok(None);
    };
    if matching_modules.next().is_some() {
        return Err(err(
            "PARQUET_FIELD_IDENTITY",
            "Duplicate parquet.fields modules make identity ambiguous",
        ));
    }
    let elements = get(module, "elements").and_then(as_array).ok_or_else(|| {
        err(
            "PARQUET_FIELD_IDENTITY",
            "parquet.fields elements must be an array",
        )
    })?;
    let expected_len = 7 + decimal_digits(index);
    ctx.charge_work(
        expected_len,
        Utf16::from("/modules/parquet.fields/elements"),
    )?;
    let expected = format!("schema:{index}");
    let expected_id = Utf16::from(expected.as_str());
    let mut matching_elements = elements
        .iter()
        .filter(|element| get(element, "id").is_some_and(|id| as_utf16(id) == Some(&expected_id)));
    let Some(element) = matching_elements.next() else {
        return Err(err(
            "PARQUET_FIELD_IDENTITY",
            "Selected schema index has no matching parquet.fields identity",
        ));
    };
    if matching_elements.next().is_some() {
        return Err(err(
            "PARQUET_FIELD_IDENTITY",
            "Duplicate schema-index identities are ambiguous",
        ));
    }
    let _ = element;
    Ok(Some(SchemaIdentity {
        module: Utf16::from("parquet.fields"),
        element: Utf16::from(expected),
    }))
}

fn unique_by_id<'a>(
    parent: &'a Value,
    collection: &str,
    id: &str,
) -> Result<&'a Value, EngineError> {
    let values = get(parent, collection)
        .and_then(as_array)
        .ok_or_else(|| missing(collection))?;
    let expected_id = Utf16::from(id);
    let mut matches = values
        .iter()
        .filter(|v| get(v, "id").is_some_and(|value| as_utf16(value) == Some(&expected_id)));
    let value = matches
        .next()
        .ok_or_else(|| err("PARQUET_CAPTURE", "Missing Parquet source identity"))?;
    if matches.next().is_some() {
        return Err(err("PARQUET_CAPTURE", "Duplicate Parquet source identity"));
    }
    Ok(value)
}

fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    as_object(value)?
        .iter()
        .find(|(name, _)| name == &Utf16::from(key))
        .map(|(_, value)| value)
}
fn as_object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = value {
        Some(v)
    } else {
        None
    }
}
fn as_array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}
fn as_text(value: &Value) -> Option<String> {
    if let Value::String(v) = value {
        v.to_utf8().ok()
    } else {
        None
    }
}
fn as_utf16(value: &Value) -> Option<&Utf16> {
    if let Value::String(v) = value {
        Some(v)
    } else {
        None
    }
}
fn decimal_digits(mut value: usize) -> usize {
    let mut digits = 1;
    while value >= 10 {
        value /= 10;
        digits += 1;
    }
    digits
}
fn hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}
fn missing(name: &str) -> EngineError {
    err("PARQUET_CAPTURE", &format!("Missing Parquet {name}"))
}
fn err(code: &'static str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        serialization::{Format, read_json_value},
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

    fn parse(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
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
    fn document(bytes: &[u8], identity: &str, extra: &str) -> Value {
        let hex = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
        let json = r#"{"umf":"0.10.0","id":"list-fixture","vocabularies":{"umf.parquet":{"version":"0.1.0"}},"modules":[{"id":"parquet","namespace":"","elements":[{"id":"source","extensions":{"umf.parquet":{"profile":"parquet-file-source","encoding":"hex","bytes":"@HEX@"@EXTRA@}}}]},{"id":"parquet.fields","namespace":"","elements":[{"id":"@IDENTITY@","name":"list","extensions":{}}]}]}"#;
        parse(
            &json
                .replace("@HEX@", &hex)
                .replace("@IDENTITY@", identity)
                .replace("@EXTRA@", extra),
        )
    }

    #[test]
    fn captures_pinned_list_source_and_index_identity() {
        let source = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let doc = document(source, "schema:2", "");
        let mut caps = NoCapabilities;
        let captured = capture_parquet_document(
            &doc,
            2,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap();
        assert_eq!(captured.bytes, source);
        assert_eq!(captured.schema_index, 2);
        assert_eq!(
            captured.schema_identity,
            Some(SchemaIdentity {
                module: "parquet.fields".into(),
                element: "schema:2".into()
            })
        );
    }

    #[test]
    fn rejects_malformed_source_and_wrong_schema_identity() {
        let mut caps = NoCapabilities;
        let bad = document(b"not parquet", "schema:2", "");
        let error = capture_parquet_document(
            &bad,
            2,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "PARQUET_TRUNCATED");

        let source = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let wrong = document(source, "schema:3", "");
        let error = capture_parquet_document(
            &wrong,
            2,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "PARQUET_FIELD_IDENTITY");
    }

    #[test]
    fn refuses_unknown_capture_properties() {
        let source = include_bytes!("../../../fixtures/parquet/containers/list-tuple.parquet");
        let doc = document(source, "schema:2", ",\"future\":true");
        let mut caps = NoCapabilities;
        let error = capture_parquet_document(
            &doc,
            2,
            &engine(),
            &Registry::new(),
            &mut caps,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.code, "PARQUET_UNKNOWN_CONTENT");
    }
}
