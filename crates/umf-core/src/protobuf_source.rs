// SPDX-License-Identifier: MIT OR Apache-2.0
//! Explicit host-compiler boundary for bounded Protobuf source import.
//!
//! The core validates and snapshots source text. It never resolves imports,
//! starts a process, or discovers a compiler. A trusted host must supply the
//! compiler capability and share this invocation's cooperative Context.

use crate::{
    context::Context,
    error::{Diagnostic, EngineError, Severity},
    host_json::{
        copy_host_json, read_host_string_value, HostHandle, HostJsonEvent, HostJsonKind,
        HostJsonReflection, HostJsonReply,
    },
    protobuf_document, protobuf_inspect,
    value::{copy_json, Utf16, Value},
};
use std::collections::HashSet;

const PROTOBUF_EXTENSION: &str = "umf.protobuf";

/// A compiler capability that can participate in cooperative controls.
/// Implementations must periodically charge/check the supplied Context while
/// compiling; a non-interruptible compiler must not implement this capability.
pub trait ProtobufSourceCompiler {
    /// False means the host cannot honor cooperative cancellation/deadlines;
    /// the core refuses to dispatch it under this operation contract.
    fn supports_cooperative_controls(&self) -> bool;
    fn compile(
        &mut self,
        request: &Value,
        context: &mut Context<'_>,
    ) -> Result<ProtobufCompilerResult, EngineError>;
}

/// Compiler output is opaque to the source-import coordinator until finish.
pub struct ProtobufCompilerResult {
    pub descriptor_set: Vec<u8>,
    pub compiler: Utf16,
}

/// Owned, isolated request plus immutable original-source snapshot.
pub struct PreparedProtobufSourceImport {
    id: Option<Utf16>,
    request: Value,
    files: Value,
    roots: Value,
}
impl PreparedProtobufSourceImport {
    /// Borrow the compiler-facing snapshot without granting mutation access.
    pub fn compiler_request(&self) -> &Value {
        &self.request
    }
}

/// Owned descriptor bytes prepared for a host emitter.
/// This value is consumed by `finish_source_export`, so a prepared export can
/// be finalized only once. The emitter never receives the archived source.
pub struct PreparedProtobufSourceExport {
    descriptor_set: Vec<u8>,
}

impl PreparedProtobufSourceExport {
    /// Current descriptor state encoded for the explicit host emitter.
    pub fn descriptor_set(&self) -> &[u8] {
        &self.descriptor_set
    }
}

/// Validate the document and prepare current descriptor bytes for a trusted
/// host emitter. No compiler, printer, process, filesystem, or network is
/// discovered or invoked here. The caller supplies its current document to
/// finish after the callback; archived Protobuf sources are never replayed.
pub fn prepare_source_export(
    document: &Value,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceExport, EngineError> {
    let descriptor_set = protobuf_document::export_descriptor_set(document, context)?;
    context.charge_work(0, Utf16::default())?;
    Ok(PreparedProtobufSourceExport { descriptor_set })
}

/// Prepare a source export from an opaque host document.
///
/// The first full JSON copy and inspection match `inspectProtobuf(document)`.
/// Only after that succeeds does the host reflection follow the predecessor's
/// `modules.find` / `elements.find` / vocabulary property-read sequence and
/// copy the selected extension payload. The original payload, rather than its
/// inspection snapshot, supplies descriptor bytes so mutation observed by
/// those ordinary reads remains visible.
pub fn prepare_source_export_host(
    document_handle: HostHandle,
    host: &mut dyn HostJsonReflection,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceExport, EngineError> {
    let document = match copy_host_json(document_handle, host, context) {
        Ok(document) => document,
        Err(error) if error.is_control_failure() => return Err(error),
        Err(error) => return Err(document_copy_failure(error)),
    };
    let inspection = protobuf_document::inspect(&document, context)?;
    if !inspection.valid {
        return Err(validation_failure(
            "PROTOBUF_DOCUMENT",
            inspection.diagnostics,
        ));
    }

    let modules = read_property(host, document_handle, "modules", context)?;
    let Some(modules_handle) = object_handle(modules) else {
        return Err(payload_failure());
    };
    let (_module_index, module_handle) =
        match find_host_array_item(modules_handle, "schema", host, context)? {
            Some(found) => found,
            None => return Err(payload_failure()),
        };
    let elements = read_property(host, module_handle, "elements", context)?;
    let Some(elements_handle) = object_handle(elements) else {
        return Err(payload_failure());
    };
    let (_element_index, element_handle) =
        match find_host_array_item(elements_handle, "schema", host, context)? {
            Some(found) => found,
            None => return Err(payload_failure()),
        };
    let extensions = read_property(host, element_handle, "extensions", context)?;
    let Some(extensions_handle) = object_handle(extensions) else {
        return Err(payload_failure());
    };
    let payload = read_property(host, extensions_handle, PROTOBUF_EXTENSION, context)?;

    // The vocabulary/version expression is evaluated after payload lookup and
    // before the payload schema/copy step in the TypeScript predecessor.
    let vocabularies = read_property(host, document_handle, "vocabularies", context)?;
    let version_value = match object_handle(vocabularies) {
        Some(vocabularies_handle) => {
            let vocabulary = read_property(host, vocabularies_handle, PROTOBUF_EXTENSION, context)?;
            match object_handle(vocabulary) {
                Some(vocabulary_handle) => {
                    Some(read_property(host, vocabulary_handle, "version", context)?)
                }
                None => None,
            }
        }
        None => None,
    };
    let version_matches = match version_value {
        Some(HostJsonKind::String(value)) => {
            read_host_string_value(
                host,
                value,
                &Utf16::from("/vocabularies/umf.protobuf/version"),
            )? == Utf16::from("0.1.0")
        }
        _ => false,
    };
    if !version_matches {
        return Err(payload_failure());
    }

    let Some(payload_handle) = object_handle(payload) else {
        return Err(payload_failure());
    };
    let payload_value =
        copy_host_json(payload_handle, host, context).map_err(document_copy_failure)?;
    if !protobuf_inspect::validate_protobuf_payload_schema_admitted(&payload_value, context)? {
        return Err(payload_failure());
    }
    prepare_source_export_payload(&payload_value, context)
}

fn prepare_source_export_payload(
    payload: &Value,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceExport, EngineError> {
    let descriptor_set = protobuf_document::export_descriptor_payload(payload, context)?;
    context.charge_work(0, Utf16::default())?;
    Ok(PreparedProtobufSourceExport { descriptor_set })
}

fn find_host_array_item(
    array: HostHandle,
    expected_id: &str,
    host: &mut dyn HostJsonReflection,
    context: &mut Context<'_>,
) -> Result<Option<(usize, HostHandle)>, EngineError> {
    // Touch the ordinary `.find` property before its length/index reads. The
    // supported profile uses the native Array.prototype.find implementation;
    // custom replacement methods are outside this host-reflection contract.
    let _find = read_property(host, array, "find", context)?;
    let length = read_property(host, array, "length", context)?;
    let HostJsonKind::Number(length) = length else {
        return Ok(None);
    };
    if !length.is_finite() || length < 0.0 || length.fract() != 0.0 || length > 100_000.0 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Protobuf document array exceeds host traversal limit",
        ));
    }
    for index in 0..length as usize {
        context.charge_work(1, Utf16::default())?;
        let item = read_property(host, array, &index.to_string(), context)?;
        let Some(item_handle) = object_handle(item) else {
            // The prior full copy/inspection admits ordinary non-null objects;
            // a changed proxy result outside that subset is treated as absent.
            continue;
        };
        let id = read_property(host, item_handle, "id", context)?;
        if let HostJsonKind::String(id) = id {
            if read_host_string_value(host, id, &Utf16::default())? == Utf16::from(expected_id) {
                return Ok(Some((index, item_handle)));
            }
        }
    }
    Ok(None)
}

fn read_property(
    host: &mut dyn HostJsonReflection,
    handle: HostHandle,
    key: &str,
    context: &mut Context<'_>,
) -> Result<HostJsonKind, EngineError> {
    context.charge_work(
        key.encode_utf16().count().saturating_add(1),
        Utf16::default(),
    )?;
    match host.reflect(HostJsonEvent::ReadProperty {
        handle,
        key: key.encode_utf16().collect(),
    })? {
        HostJsonReply::Kind(value) => Ok(value),
        _ => Err(EngineError::new(
            "HOST_JSON_PROTOCOL",
            Utf16::default(),
            "Host returned an invalid ordinary-property reply",
        )),
    }
}

fn object_handle(value: HostJsonKind) -> Option<HostHandle> {
    match value {
        HostJsonKind::Object(handle) => Some(handle),
        _ => None,
    }
}

fn payload_failure() -> EngineError {
    EngineError::new(
        "PROTOBUF_PAYLOAD",
        Utf16::default(),
        "Missing or malformed Protobuf payload",
    )
}

fn document_copy_failure(error: EngineError) -> EngineError {
    let code = quote_json(&error.code);
    let path = quote_json_utf16(&error.path);
    let message = quote_json_utf16(&error.message);
    let diagnostic = format!(
        "[{{\"code\":{code},\"path\":{path},\"message\":{message},\"severity\":\"error\"}}]"
    );
    EngineError::new("PROTOBUF_DOCUMENT", Utf16::default(), diagnostic)
}

fn validation_failure(code: &str, diagnostics: Vec<Diagnostic>) -> EngineError {
    let diagnostics = diagnostics
        .into_iter()
        .map(|diagnostic| {
            let severity = match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            };
            let code = quote_json_utf16(&diagnostic.code);
            let path = quote_json_utf16(&diagnostic.path);
            let message = quote_json_utf16(&diagnostic.message);
            format!(
                "{{\"code\":{code},\"path\":{path},\"message\":{message},\"severity\":\"{severity}\"}}"
            )
        })
        .collect::<Vec<_>>();
    EngineError::new(
        code,
        Utf16::default(),
        format!("[{}]", diagnostics.join(",")),
    )
}

fn quote_json_utf16(text: &Utf16) -> String {
    let mut output = String::with_capacity(text.units().len().saturating_add(2));
    output.push('"');
    for unit in text.units() {
        match *unit {
            0x0022 => output.push_str("\\\""),
            0x005c => output.push_str("\\\\"),
            0x000a => output.push_str("\\n"),
            0x000d => output.push_str("\\r"),
            0x0009 => output.push_str("\\t"),
            0x0000..=0x001f | 0xd800..=0xdfff => {
                use std::fmt::Write as _;
                let _ = write!(output, "\\u{unit:04x}");
            }
            unit => output.push(char::from_u32(unit as u32).unwrap_or('\u{fffd}')),
        }
    }
    output.push('"');
    output
}

/// Finalize a prepared source export using the explicit result returned by a
/// trusted host emitter. The original Context must span both phases so late
/// cancellation, deadlines, and work limits are checked before the final copy.
/// Unknown emitter result fields are retained, matching the TypeScript result
/// spread; source and diagnostics are replaced by core-owned values.
pub fn finish_source_export(
    prepared: PreparedProtobufSourceExport,
    document_after_callback: &Value,
    emitter_result: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let result = admit_source_export_result(emitter_result, context)?;
    finish_source_export_admitted(prepared, document_after_callback, result, context)
}

/// Copy and validate an emitter result before the caller admits the
/// post-callback document. Bindings use this checkpoint to preserve the
/// predecessor's result-before-source access order across an async callback.
pub fn admit_source_export_result(
    emitter_result: &Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Match the predecessor's copy-first result admission: bad numbers or
    // duplicate keys are rejected before emitter shape validation.
    let result = copy_json(emitter_result, context)?;
    let fields = object(&result).ok_or_else(|| emit_error("Invalid emitter result"))?;
    let files = get_metered(fields, "files", context)?
        .and_then(object)
        .ok_or_else(|| emit_error("Invalid emitter result"))?;
    if !js_truthy(get_metered(fields, "compiler", context)?)
        || !js_truthy(get_metered(fields, "printer", context)?)
    {
        return Err(emit_error("Invalid emitter result"));
    }
    for (name, text) in files {
        context.charge_work(1, Utf16::default())?;
        if name.is_empty() || !matches!(text, Value::String(_)) {
            return Err(emit_error("Emitted files require names and text"));
        }
    }
    Ok(result)
}

/// Finish source emission only after the emitter result has been admitted.
pub fn finish_source_export_admitted(
    _prepared: PreparedProtobufSourceExport,
    document_after_callback: &Value,
    result: Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // TypeScript copies source only after the awaited callback returns. Keep
    // that timing explicit: a trusted callback which closes over and mutates
    // the caller's document affects this returned source snapshot, while the
    // emitter still received only the already-prepared descriptor bytes.
    let source = copy_json(document_after_callback, context)?;
    finish_source_export_owned_source(source, result, context)
}

/// Finish after the binding already copied the post-callback host document
/// with `copy_host_json`. That copy is the returned source; inspection still
/// performs its own predecessor-compatible copy internally.
pub fn finish_source_export_host_admitted(
    source: Value,
    result: Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    finish_source_export_owned_source(source, result, context)
}

fn finish_source_export_owned_source(
    source: Value,
    mut result: Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let inspection = protobuf_document::inspect(&source, context)?;
    context.charge_work(
        inspection.diagnostics.len().saturating_add(1),
        Utf16::default(),
    )?;
    let mut diagnostics = Vec::with_capacity(inspection.diagnostics.len().saturating_add(1));
    for diagnostic in inspection.diagnostics {
        diagnostics.push(diagnostic_value(diagnostic, context)?);
    }
    const LAYOUT_CODE: &str = "PROTOBUF_SOURCE_LAYOUT";
    const LAYOUT_MESSAGE: &str = "Source layout, locations and comment attachment can change during emission; retain source UMF and its original archive.";
    context.charge_work(
        4usize.saturating_add(
            [
                LAYOUT_CODE,
                "",
                LAYOUT_MESSAGE,
                "warning",
                "code",
                "path",
                "message",
                "severity",
            ]
            .iter()
            .map(|text| text.encode_utf16().count())
            .sum::<usize>(),
        ),
        Utf16::default(),
    )?;
    diagnostics.push(diagnostic_value(
        Diagnostic {
            code: Utf16::from(LAYOUT_CODE),
            path: Utf16::default(),
            python_source_path: false,
            message: Utf16::from(LAYOUT_MESSAGE),
            severity: Severity::Warning,
            python_text_origin: None,
        },
        context,
    )?);
    set_field(&mut result, "source", source, context)?;
    set_field(
        &mut result,
        "diagnostics",
        Value::Array(diagnostics),
        context,
    )?;

    // A host cancellation/deadline check immediately precedes the final
    // defensive copy, including when the emitter returns an empty file set.
    context.charge_work(0, Utf16::default())?;
    copy_json(&result, context)
}

fn diagnostic_value(
    diagnostic: Diagnostic,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    const FIELDS: [&str; 4] = ["code", "path", "message", "severity"];
    let message = match diagnostic.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    };
    let units = diagnostic
        .code
        .len()
        .saturating_add(diagnostic.path.len())
        .saturating_add(diagnostic.message.len())
        .saturating_add(message.encode_utf16().count())
        .saturating_add(
            FIELDS
                .iter()
                .map(|field| field.encode_utf16().count())
                .sum::<usize>(),
        );
    context.charge_work(4usize.saturating_add(units), Utf16::default())?;
    Ok(Value::Object(vec![
        (Utf16::from("code"), Value::String(diagnostic.code)),
        (Utf16::from("path"), Value::String(diagnostic.path)),
        (Utf16::from("message"), Value::String(diagnostic.message)),
        (Utf16::from("severity"), Value::string_utf8(message)),
    ]))
}

fn js_truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(false)) => false,
        Some(Value::String(text)) => !text.is_empty(),
        Some(Value::Number(number)) => *number != 0.0,
        Some(Value::Bool(true)) | Some(Value::Array(_)) | Some(Value::Object(_)) => true,
    }
}

fn set_field(
    value: &mut Value,
    name: &str,
    replacement: Value,
    context: &mut Context<'_>,
) -> Result<(), EngineError> {
    let fields = object_mut(value).ok_or_else(|| emit_error("Invalid emitter result"))?;
    let mut found = None;
    for (index, (key, _)) in fields.iter().enumerate() {
        context.charge_work(1, Utf16::default())?;
        if key_eq_ascii(key, name) {
            found = Some(index);
            break;
        }
    }
    if let Some(index) = found {
        fields[index].1 = replacement;
    } else {
        context.charge_work(1usize.saturating_add(name.len()), Utf16::default())?;
        fields.push((Utf16::from(name), replacement));
    }
    Ok(())
}

fn get_metered<'a>(
    fields: &'a [(Utf16, Value)],
    name: &str,
    context: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    for (key, value) in fields {
        context.charge_work(1, Utf16::default())?;
        if key_eq_ascii(key, name) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

fn key_eq_ascii(key: &Utf16, expected: &str) -> bool {
    let units = key.units();
    units.len() == expected.len()
        && units
            .iter()
            .zip(expected.bytes())
            .all(|(unit, byte)| *unit == u16::from(byte))
}

fn emit_error(message: &str) -> EngineError {
    EngineError::new("PROTOBUF_EMIT", Utf16::default(), message)
}

/// Validate and copy `{files, roots}` before a trusted compiler is called.
pub fn prepare_source_import(
    request: &Value,
    id: &str,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceImport, EngineError> {
    prepare_source_import_admitted(request, Some(id), context)
}

/// Admit the public request before the callback, deferring `options.id` until
/// descriptor-set import just as the TypeScript predecessor does.
pub fn prepare_source_import_request(
    request: &Value,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceImport, EngineError> {
    prepare_source_import_admitted(request, None, context)
}

fn prepare_source_import_admitted(
    request: &Value,
    id: Option<&str>,
    context: &mut Context<'_>,
) -> Result<PreparedProtobufSourceImport, EngineError> {
    // Match the TypeScript predecessor's copy-first behavior: invalid numbers,
    // duplicate keys, depth and tree limits precede all request-shape errors.
    let request = copy_json(request, context)?;
    let source =
        object(&request).ok_or_else(|| source_error("Expected files and nonempty roots"))?;
    let files = get(source, "files")
        .and_then(object)
        .ok_or_else(|| source_error("Expected files and nonempty roots"))?;
    let roots = get(source, "roots")
        .and_then(array)
        .ok_or_else(|| source_error("Expected files and nonempty roots"))?;
    if roots.is_empty() {
        return Err(source_error("Expected files and nonempty roots"));
    }

    // The predecessor checks request shape before rejecting unknown keys.
    for (key, _) in source {
        context.charge_work(1, Utf16::default())?;
        if !key_is(key, "files") && !key_is(key, "roots") {
            return Err(source_error("Unknown source request fields"));
        }
    }
    let mut file_names = HashSet::new();
    for (name, contents) in files {
        context.charge_work(1, Utf16::default())?;
        string_ref(contents).ok_or_else(|| source_error("Source files require names and text"))?;
        if name.is_empty() {
            return Err(source_error("Source files require names and text"));
        }
        if !file_names.insert(name.clone()) {
            return Err(source_error("Source file names must be distinct"));
        }
    }
    let mut seen_roots = HashSet::new();
    for root in roots {
        context.charge_work(1, Utf16::default())?;
        let root = string_ref(root)
            .ok_or_else(|| source_error("Roots must name distinct supplied source files"))?;
        let root = root.clone();
        if root.is_empty() || !file_names.contains(&root) || !seen_roots.insert(root) {
            return Err(source_error(
                "Roots must name distinct supplied source files",
            ));
        }
    }

    // JS JSON.stringify(request).length is the predecessor's admission bound.
    // This count includes punctuation and escaping, including six units for a
    // NUL or lone surrogate; it is performed only after shape/root refusals.
    let serialized_units = stringify_length(&request, context)?;
    if serialized_units > context.limits().max_text_units.min(4_000_000) {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Source request exceeds serialized text limit",
        ));
    }
    let files = copy_json(get(object(&request).unwrap(), "files").unwrap(), context)?;
    let roots = copy_json(get(object(&request).unwrap(), "roots").unwrap(), context)?;
    Ok(PreparedProtobufSourceImport {
        id: id.map(Utf16::from),
        request,
        files,
        roots,
    })
}

/// Invoke the explicit host capability, then validate and finalize its result.
/// The Context spans request admission, callback work, descriptor decoding and
/// final inspection. Compiler errors and host control failures propagate.
pub fn import_sources(
    request: &Value,
    id: &str,
    compiler: &mut impl ProtobufSourceCompiler,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let prepared = prepare_source_import(request, id, context)?;
    if !compiler.supports_cooperative_controls() {
        return Err(EngineError::new(
            "COMPILER_CONTROL_UNAVAILABLE",
            Utf16::default(),
            "Compiler cannot honor cooperative cancellation and deadline controls",
        ));
    }
    context.charge_work(0, Utf16::default())?;
    let compiled = compiler.compile(&prepared.request, context)?;
    context.charge_work(0, Utf16::default())?;
    finish_source_import(prepared, compiled, context)
}

/// Check compiler identity and bounded descriptor bytes, then attach the
/// untouched archive snapshot to a validated imported descriptor document.
pub fn finish_source_import(
    prepared: PreparedProtobufSourceImport,
    compiled: ProtobufCompilerResult,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    finish_source_import_bytes(
        prepared,
        &compiled.compiler,
        &compiled.descriptor_set,
        context,
    )
}

/// Finalize source import from a borrowed host byte snapshot. Bindings use this
/// form to avoid an unmetered second descriptor-buffer allocation.
pub fn finish_source_import_bytes(
    prepared: PreparedProtobufSourceImport,
    compiler: &Utf16,
    descriptor_set: &[u8],
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let id = prepared
        .id
        .as_ref()
        .ok_or_else(|| source_error("Document id was not admitted"))?
        .clone();
    finish_source_import_bytes_with_id(prepared, compiler, descriptor_set, &id, context)
}

/// Finalize a request-only prepared import after predecessor-ordered host
/// access has admitted compiler identity, descriptor bytes, and document id.
pub fn finish_source_import_bytes_with_id(
    prepared: PreparedProtobufSourceImport,
    compiler: &Utf16,
    descriptor_set: &[u8],
    id: &Utf16,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if compiler.is_empty() {
        return Err(source_error("Compiler identity is required"));
    }
    if descriptor_set.len() > 4_000_000 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Protobuf descriptor input exceeds 4 MB",
        ));
    }
    context.charge_work(descriptor_set.len(), Utf16::default())?;
    let document = begin_source_import_descriptor(descriptor_set, id, context)?;
    finish_source_import_document(prepared, document, compiler, context)
}

/// Decode the descriptor and build its UMF document before the predecessor
/// reads the compiler identity a second time for the archive.
pub fn begin_source_import_descriptor(
    descriptor_set: &[u8],
    id: &Utf16,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if descriptor_set.len() > 4_000_000 {
        return Err(EngineError::new(
            "LIMIT",
            Utf16::default(),
            "Protobuf descriptor input exceeds 4 MB",
        ));
    }
    context.charge_work(descriptor_set.len(), Utf16::default())?;
    protobuf_document::import_descriptor_set(
        descriptor_set,
        &id.to_utf8()
            .map_err(|_| source_error("Invalid document id"))?,
        context,
    )
}

/// Attach source archive after descriptor import, preserving the callback
/// result's second compiler property read and its place in predecessor order.
pub fn finish_source_import_document(
    prepared: PreparedProtobufSourceImport,
    document: Value,
    compiler: &Utf16,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    finish_source_import_document_value(
        prepared,
        document,
        Value::String(compiler.clone()),
        context,
    )
}

/// Finalize using the callback's second `compiler` read. Non-string values
/// remain values until ordinary descriptor inspection reports their schema
/// mismatch, matching the predecessor's non-copying archive assignment.
pub fn finish_source_import_document_value(
    prepared: PreparedProtobufSourceImport,
    mut document: Value,
    compiler: Value,
    context: &mut Context<'_>,
) -> Result<Value, EngineError> {
    if !matches!(compiler, Value::String(_)) {
        const DIAGNOSTIC: &str = "[{\"code\":\"EXTENSION_STRUCTURE\",\"path\":\"/modules/0/elements/0/extensions/umf.protobuf/sourceArchive/compiler\",\"message\":\"must be string\",\"severity\":\"error\"}]";
        return Err(EngineError::new(
            "PROTOBUF_SOURCE",
            Utf16::default(),
            DIAGNOSTIC,
        ));
    }
    let archive = obj(vec![
        ("role", Value::string_utf8("original")),
        ("compiler", compiler),
        ("files", prepared.files),
        ("roots", prepared.roots),
    ]);
    attach_archive(&mut document, archive)?;
    let validation = protobuf_document::inspect(&document, context)?;
    if !validation.valid {
        let diagnostics = validation.diagnostics.into_iter().map(|diagnostic| {
            let severity = match diagnostic.severity { Severity::Error => "error", Severity::Warning => "warning" };
            let code = quote_json(&diagnostic.code.to_utf8().unwrap_or_default());
            let path = quote_json(&diagnostic.path.to_utf8().unwrap_or_default());
            let message = quote_json(&diagnostic.message.to_utf8().unwrap_or_default());
            format!("{{\"code\":{code},\"path\":{path},\"message\":{message},\"severity\":\"{severity}\"}}")
        }).collect::<Vec<_>>();
        let message = format!("[{}]", diagnostics.join(","));
        return Err(EngineError::new(
            "PROTOBUF_SOURCE",
            Utf16::default(),
            message,
        ));
    }
    copy_json(&document, context)
}

fn quote_json(text: &str) -> String {
    let mut output = String::with_capacity(text.len().saturating_add(2));
    output.push('"');
    for character in text.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character <= '\u{1f}' => {
                use std::fmt::Write as _;
                let _ = write!(output, "\\u{:04x}", character as u32);
            }
            character => output.push(character),
        }
    }
    output.push('"');
    output
}

fn attach_archive(document: &mut Value, archive: Value) -> Result<(), EngineError> {
    let root =
        object_mut(document).ok_or_else(|| source_error("Imported document is malformed"))?;
    let modules = get_mut(root, "modules")
        .and_then(array_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    let module = modules
        .first_mut()
        .and_then(object_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    let elements = get_mut(module, "elements")
        .and_then(array_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    let element = elements
        .first_mut()
        .and_then(object_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    let extensions = get_mut(element, "extensions")
        .and_then(object_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    let payload = get_mut(extensions, "umf.protobuf")
        .and_then(object_mut)
        .ok_or_else(|| source_error("Imported document is malformed"))?;
    payload.push((Utf16::from("sourceArchive"), archive));
    Ok(())
}

fn stringify_length(value: &Value, context: &mut Context<'_>) -> Result<usize, EngineError> {
    fn add(total: &mut usize, amount: usize) -> Result<(), EngineError> {
        *total = total.checked_add(amount).ok_or_else(|| {
            EngineError::new(
                "LIMIT",
                Utf16::default(),
                "Serialized source length overflow",
            )
        })?;
        Ok(())
    }
    fn string(
        units: &[u16],
        total: &mut usize,
        context: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        add(total, 2)?;
        let mut index = 0;
        while index < units.len() {
            context.charge_work(1, Utf16::default())?;
            let unit = units[index];
            let escaped = match unit {
                0x22 | 0x5c | 0x08 | 0x09 | 0x0a | 0x0c | 0x0d => 2,
                0x00..=0x1f => 6,
                0xd800..=0xdbff
                    if units
                        .get(index + 1)
                        .is_some_and(|next| (0xdc00..=0xdfff).contains(next)) =>
                {
                    2
                }
                0xd800..=0xdfff => 6,
                _ => 1,
            };
            add(total, escaped)?;
            if (0xd800..=0xdbff).contains(&unit) && escaped == 2 {
                index += 1;
            }
            index += 1;
        }
        Ok(())
    }
    fn visit(
        value: &Value,
        total: &mut usize,
        context: &mut Context<'_>,
    ) -> Result<(), EngineError> {
        context.charge_work(1, Utf16::default())?;
        match value {
            Value::Null => add(total, 4),
            Value::Bool(true) => add(total, 4),
            Value::Bool(false) => add(total, 5),
            Value::Number(number) => add(total, crate::value::ecma_number_to_string(*number).len()),
            Value::String(text) => string(text.units(), total, context),
            Value::Array(items) => {
                add(total, 2)?;
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        add(total, 1)?;
                    }
                    visit(item, total, context)?;
                }
                Ok(())
            }
            Value::Object(items) => {
                add(total, 2)?;
                for (index, (key, item)) in items.iter().enumerate() {
                    if index > 0 {
                        add(total, 1)?;
                    }
                    string(key.units(), total, context)?;
                    add(total, 1)?;
                    visit(item, total, context)?;
                }
                Ok(())
            }
        }
    }
    let mut total = 0;
    visit(value, &mut total, context)?;
    Ok(total)
}

fn source_error(message: &str) -> EngineError {
    EngineError::new("PROTOBUF_SOURCE", Utf16::default(), message)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(v) = value {
        Some(v)
    } else {
        None
    }
}
fn object_mut(value: &mut Value) -> Option<&mut Vec<(Utf16, Value)>> {
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
fn array_mut(value: &mut Value) -> Option<&mut Vec<Value>> {
    if let Value::Array(v) = value {
        Some(v)
    } else {
        None
    }
}
fn string_ref(value: &Value) -> Option<&Utf16> {
    if let Value::String(v) = value {
        Some(v)
    } else {
        None
    }
}
fn get<'a>(fields: &'a [(Utf16, Value)], key: &str) -> Option<&'a Value> {
    fields.iter().find(|(k, _)| key_is(k, key)).map(|(_, v)| v)
}
fn get_mut<'a>(fields: &'a mut [(Utf16, Value)], key: &str) -> Option<&'a mut Value> {
    fields
        .iter_mut()
        .find(|(k, _)| key_is(k, key))
        .map(|(_, v)| v)
}
fn key_is(key: &Utf16, expected: &str) -> bool {
    key.to_utf8().is_ok_and(|v| v == expected)
}
