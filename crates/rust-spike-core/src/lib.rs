//! Deliberately bounded R1 engine slice. This crate is not the UMF core port.
use serde_json::{json, Map, Value};
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fmt;

const MAX_SOURCE_UNITS: usize = 1_048_576;
const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;

pub type Validator<'a> = dyn FnMut(&[u16]) -> Result<(), String> + 'a;

#[derive(Debug)]
struct Fault {
    code: &'static str,
    message: String,
}

impl Fault {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

/// Execute the frozen JSON protocol. `now_ms` is supplied by each host binding,
/// keeping ambient clock access outside this library.
pub fn run(request_json: &str) -> String {
    run_with_clock(request_json, || None, None)
}

pub fn run_with_validator(request_json: &str, validator: &mut Validator<'_>) -> String {
    run_with_clock(request_json, || None, Some(validator))
}

/// Host bindings provide the clock capability; callback failures become explicit
/// incomplete error responses instead of being mistaken for successful validation.
pub fn run_with(
    request_json: &str,
    mut now_ms: impl FnMut() -> u64,
    validator: Option<&mut Validator<'_>>,
) -> String {
    run_with_control(request_json, || Some(now_ms()), || false, validator)
        .unwrap_or_else(|message| callback_error_response(&message))
}

pub fn run_with_clock(
    request_json: &str,
    now_ms: impl FnMut() -> Option<u64>,
    validator: Option<&mut Validator<'_>>,
) -> String {
    run_with_control(request_json, now_ms, || false, validator)
        .unwrap_or_else(|message| callback_error_response(&message))
}

/// The host polls cancellation at every bounded-work step. Cancellation is
/// cooperative and cannot interrupt a parser or regular expression mid-call.
pub fn run_with_control(
    request_json: &str,
    mut now_ms: impl FnMut() -> Option<u64>,
    mut cancelled: impl FnMut() -> bool,
    mut validator: Option<&mut Validator<'_>>,
) -> Result<String, String> {
    let response = match run_inner(request_json, &mut now_ms, &mut cancelled, &mut validator) {
        Ok(value) => value,
        Err(fault) if fault.code == "CALLBACK_ERROR" => return Err(fault.message),
        Err(fault) => failure_value(fault),
    };
    Ok(serde_json::to_string(&response).unwrap_or_else(|_| {
        r#"{"ok":false,"code":"INTERNAL_SERIALIZATION","message":"Response could not be serialized"}"#.to_owned()
    }))
}

fn callback_error_response(message: &str) -> String {
    serde_json::to_string(&failure_value(Fault::new("CALLBACK_ERROR", message)))
        .unwrap_or_else(|_| r#"{"ok":false,"code":"CALLBACK_ERROR","complete":false}"#.to_owned())
}

fn failure_value(fault: Fault) -> Value {
    json!({
        "ok":false,"code":fault.code,"message":fault.message,"complete":false,
        "diagnostics":[{"code":fault.code,"path":"","severity":"error","message":fault.message}]
    })
}

fn run_inner(
    request_json: &str,
    now_ms: &mut impl FnMut() -> Option<u64>,
    cancelled: &mut impl FnMut() -> bool,
    validator: &mut Option<&mut Validator<'_>>,
) -> Result<Value, Fault> {
    if request_json.len() > MAX_REQUEST_BYTES {
        return Err(Fault::new("CAPACITY", "Request exceeds the 8 MiB R1 input capacity"));
    }
    let request: Value = serde_json::from_str(request_json)
        .map_err(|error| Fault::new("INVALID_REQUEST", format!("Invalid request JSON: {error}")))?;
    let object = request.as_object().ok_or_else(|| Fault::new("INVALID_REQUEST", "Request must be an object"))?;
    let op = object.get("op").and_then(Value::as_str).ok_or_else(|| Fault::new("INVALID_REQUEST", "Missing string op"))?;
    let options = object.get("options").and_then(Value::as_object);
    let max_steps = options.and_then(|o| o.get("maxSteps")).and_then(Value::as_u64).unwrap_or(10_000) as usize;
    let capacity = options.and_then(|o| o.get("capacity")).and_then(Value::as_u64).unwrap_or(MAX_SOURCE_UNITS as u64) as usize;
    let deadline = options.and_then(|o| o.get("deadlineUnixMs")).and_then(Value::as_u64);
    if let Some(deadline) = deadline {
        let now = now_ms().ok_or_else(|| Fault::new("CLOCK_CAPABILITY_REQUIRED", "Host clock capability is required for deadline requests"))?;
        if now > deadline {
            return Err(Fault::new("DEADLINE", "Request deadline elapsed before execution"));
        }
    }
    let source_units = read_units(object.get("sourceUnits"), capacity)?;
    if object.get("validatorRequired").and_then(Value::as_bool) == Some(true) {
        let callback = validator.as_deref_mut().ok_or_else(|| Fault::new("CAPABILITY_REQUIRED", "Trusted validator callback is required for this request"))?;
        callback(&source_units).map_err(|error| Fault::new("CALLBACK_ERROR", error))?;
    }
    let mut budget = Budget { max_steps, cancel_at: options.and_then(|o| o.get("cancelAtStep")).and_then(Value::as_u64).map(|v| v as usize), steps: 0, deadline, now_ms, cancelled };
    let mut response = match op {
        "source-roundtrip" => json!({"ok": true, "op": op, "sourceUnits": source_units}),
        "validate-record" => validate_record(object, &source_units, &mut budget)?,
        "generate-keyed-record" => generate_keyed_record(object, &source_units, &mut budget)?,
        _ => return Err(Fault::new("UNKNOWN_OPERATION", format!("Unsupported R1 operation: {op}"))),
    };
    if let Some(response_obj) = response.as_object_mut() {
        response_obj.insert("steps".to_owned(), json!(budget.steps));
        response_obj.insert("cooperativeCancellation".to_owned(), json!(true));
    }
    Ok(response)
}

struct Budget<'a, F: FnMut() -> Option<u64>> {
    max_steps: usize,
    cancel_at: Option<usize>,
    steps: usize,
    deadline: Option<u64>,
    now_ms: &'a mut F,
    cancelled: &'a mut dyn FnMut() -> bool,
}

impl<F: FnMut() -> Option<u64>> Budget<'_, F> {
    fn step(&mut self) -> Result<(), Fault> {
        self.steps += 1;
        if self.max_steps == 0 || self.steps > self.max_steps {
            return Err(Fault::new("CAPACITY", "Cooperative work-step budget exhausted"));
        }
        if self.cancel_at == Some(self.steps) {
            return Err(Fault::new("CANCELLED", "Cooperative cancellation requested"));
        }
        if (self.cancelled)() {
            return Err(Fault::new("CANCELLED", "Host cooperative cancellation requested"));
        }
        if let Some(deadline) = self.deadline {
            let now = (self.now_ms)().ok_or_else(|| Fault::new("CLOCK_CAPABILITY_REQUIRED", "Host clock capability is required for deadline requests"))?;
            if now > deadline { return Err(Fault::new("DEADLINE", "Request deadline elapsed during execution")); }
        }
        Ok(())
    }
}

fn read_units(value: Option<&Value>, capacity: usize) -> Result<Vec<u16>, Fault> {
    let value = value.ok_or_else(|| Fault::new("INVALID_REQUEST", "sourceUnits is required as an array of UTF-16 code units"))?;
    let array = value.as_array().ok_or_else(|| Fault::new("INVALID_REQUEST", "sourceUnits must be an array of UTF-16 code units"))?;
    if array.len() > MAX_SOURCE_UNITS || array.len() > capacity {
        return Err(Fault::new("CAPACITY", "UTF-16 source exceeds configured capacity"));
    }
    array.iter().map(|unit| {
        unit.as_u64().filter(|n| *n <= u16::MAX as u64).map(|n| n as u16)
            .ok_or_else(|| Fault::new("INVALID_REQUEST", "sourceUnits entries must be integers from 0 through 65535"))
    }).collect()
}

fn validate_record<F: FnMut() -> Option<u64>>(object: &Map<String, Value>, source_units: &[u16], budget: &mut Budget<'_, F>) -> Result<Value, Fault> {
    let model = verified_model(object, source_units)?;
    let errors = structural_errors(&model, budget)?;
    let valid = errors.is_empty();
    let mut diagnostics: Vec<Value> = errors.into_iter().map(|message| json!({
        "code":"SCHEMA_INVALID","path":"","severity":"error","message":message
    })).collect();
    diagnostics.push(json!({
        "code":"R1_SEMANTIC_VALIDATION_INCOMPLETE","path":"","severity":"warning",
        "message":"R1 evaluates only the generated core 0.10.0 JSON Schema; ordered constraints, extensions, callbacks, exact-source parsing and semantic validation remain incomplete"
    }));
    let source_digest = digest_source(source_units)?;
    Ok(json!({
        "ok":true,"op":"validate-record","valid":valid,"complete":false,"diagnostics":diagnostics,
        "tsComparable":{"valid":valid},"sourceDigest":source_digest,
        "retainedModel":model,"sourceUnits":source_units,
        "sourceModelCorrespondence":"verified JSON value equality; duplicate keys are refused"
    }))
}

fn structural_errors<F: FnMut() -> Option<u64>>(model: &Value, budget: &mut Budget<'_, F>) -> Result<Vec<String>, Fault> {
    let mut schema: Value = serde_json::from_str(include_str!("../../../spec/core/schema.json"))
        .map_err(|error| Fault::new("ENGINE_RESOURCE_INVALID", format!("Embedded generated core schema is invalid: {error}")))?;
    let semantic_schema: Value = serde_json::from_str(include_str!("../../../spec/core/semantic-type-reference.schema.json"))
        .map_err(|error| Fault::new("ENGINE_RESOURCE_INVALID", format!("Embedded semantic reference schema is invalid: {error}")))?;
    replace_schema_ref(&mut schema, "urn:umf:core:semantic-type-reference:1.0.0", "#/$defs/r1SemanticTypeReference");
    schema.get_mut("$defs").and_then(Value::as_object_mut)
        .ok_or_else(|| Fault::new("ENGINE_RESOURCE_INVALID", "Generated core schema has no $defs object"))?
        .insert("r1SemanticTypeReference".to_owned(), semantic_schema);
    let node_count = count_nodes(model, budget)?;
    if node_count > 100_000 { return Err(Fault::new("CAPACITY", "Model exceeds the 100,000-node R1 structural capacity")); }
    let validator = jsonschema::validator_for(&schema)
        .map_err(|error| Fault::new("ENGINE_RESOURCE_INVALID", format!("Embedded schema could not be compiled: {error}")))?;
    Ok(validator.iter_errors(model).take(8).map(|error| error.to_string()).collect())
}

fn replace_schema_ref(value: &mut Value, from: &str, to: &str) {
    match value {
        Value::Object(properties) => {
            if properties.get("$ref").and_then(Value::as_str) == Some(from) {
                properties.insert("$ref".to_owned(), Value::String(to.to_owned()));
            }
            for child in properties.values_mut() { replace_schema_ref(child, from, to); }
        }
        Value::Array(items) => for child in items { replace_schema_ref(child, from, to); },
        _ => {}
    }
}

fn count_nodes<F: FnMut() -> Option<u64>>(value: &Value, budget: &mut Budget<'_, F>) -> Result<usize, Fault> {
    budget.step()?;
    let mut count = 1;
    match value {
        Value::Array(items) => for item in items { count += count_nodes(item, budget)?; },
        Value::Object(properties) => for item in properties.values() { count += count_nodes(item, budget)?; },
        _ => {}
    }
    Ok(count)
}

fn generate_keyed_record<F: FnMut() -> Option<u64>>(object: &Map<String, Value>, source_units: &[u16], budget: &mut Budget<'_, F>) -> Result<Value, Fault> {
    let model = verified_model(object, source_units)?;
    if !structural_errors(&model, budget)?.is_empty() {
        return Err(Fault::new("INVALID_MODEL", "R1 Key generation requires a model accepted by the embedded generated core schema"));
    }
    let model = model.as_object().ok_or_else(|| Fault::new("INVALID_MODEL", "model must be an object"))?;
    if model.get("umf").and_then(Value::as_str) != Some("0.10.0") {
        return Err(Fault::new("UNSUPPORTED_VERSION", "R1 generation is limited to current core 0.10.0"));
    }
    let key = object.get("recordKey").and_then(Value::as_str).ok_or_else(|| Fault::new("INVALID_REQUEST", "recordKey must be a qualified module.element string"))?;
    let (module_id, record_id) = key.split_once('.').ok_or_else(|| Fault::new("INVALID_REQUEST", "recordKey must be module.element"))?;
    let modules = model.get("modules").and_then(Value::as_array).ok_or_else(|| Fault::new("INVALID_MODEL", "model.modules must be an array"))?;
    let module_matches: Vec<_> = modules.iter().filter(|module| module.get("id").and_then(Value::as_str) == Some(module_id)).collect();
    if module_matches.len() != 1 { return Err(Fault::new("AMBIGUOUS_RECORD", "R1 requires exactly one module with the requested identity")); }
    let module = module_matches[0];
    let elements = module.get("elements").and_then(Value::as_array).ok_or_else(|| Fault::new("INVALID_MODEL", "module.elements must be an array"))?;
    let record_matches: Vec<_> = elements.iter().filter(|e| e.get("id").and_then(Value::as_str) == Some(record_id)).collect();
    if record_matches.len() != 1 { return Err(Fault::new("AMBIGUOUS_RECORD", "R1 requires exactly one Record with the requested identity")); }
    let record = record_matches[0];
    if record.get("kind").and_then(Value::as_str) != Some("record") { return Err(Fault::new("RECORD_NOT_FOUND", "The requested element is not a Record")); }
    if record.get("extensions").and_then(Value::as_object).is_some_and(|extensions| !extensions.is_empty()) {
        return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses selected Record extensions whose meanings the emitted Key block does not represent"));
    }
    let keys = record.get("keys").and_then(Value::as_array).ok_or_else(|| Fault::new("UNSUPPORTED_RECORD", "R1 requires a declared Key"))?;
    let primaries: Vec<_> = keys.iter().filter(|k| k.get("primary").and_then(Value::as_bool) == Some(true)).collect();
    if primaries.len() > 1 { return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses Records with multiple primary Keys")); }
    let selected = primaries.first().copied().or_else(|| if keys.len() == 1 { keys.first() } else { None }).ok_or_else(|| Fault::new("UNSUPPORTED_RECORD", "R1 requires an unambiguous primary or sole Key"))?;
    let key_fields = selected.get("fields").and_then(Value::as_array).filter(|a| !a.is_empty()).ok_or_else(|| Fault::new("UNSUPPORTED_RECORD", "R1 requires at least one Key field"))?;
    let members = record.get("members").and_then(Value::as_array).ok_or_else(|| Fault::new("INVALID_RECORD", "Record requires declared members"))?;
    let member_identities: Vec<_> = members.iter().map(|member| {
        let member_module = member.get("module").and_then(Value::as_str).unwrap_or(module_id);
        let element = member.get("element").and_then(Value::as_str).unwrap_or("");
        format!("{member_module}.{element}")
    }).collect();
    let key_identities: Vec<_> = key_fields.iter().map(|reference| {
        let field_module = reference.get("module").and_then(Value::as_str).unwrap_or(module_id);
        let element = reference.get("element").and_then(Value::as_str).unwrap_or("");
        format!("{field_module}.{element}")
    }).collect();
    if member_identities.len() != key_identities.len()
        || member_identities.iter().collect::<HashSet<_>>().len() != member_identities.len()
        || key_identities.iter().collect::<HashSet<_>>().len() != key_identities.len()
        || member_identities.iter().any(|identity| !key_identities.contains(identity)) {
        return Err(Fault::new("UNSUPPORTED_RECORD", "R1 generation is restricted to Records whose members are exactly the declared Key fields"));
    }
    let mut declarations = Vec::new();
    let mut seen_fields = HashSet::new();
    let mut seen_names = HashSet::new();
    for reference in key_fields {
        budget.step()?;
        let field_module = reference.get("module").and_then(Value::as_str).unwrap_or(module_id);
        let field_id = reference.get("element").and_then(Value::as_str).ok_or_else(|| Fault::new("INVALID_RECORD", "Key field requires an element reference"))?;
        if field_module != module_id { return Err(Fault::new("UNSUPPORTED_RECORD", "R1 generator supports same-module scalar key fields")); }
        if !seen_fields.insert(field_id.to_owned()) { return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses repeated Key field references")); }
        if !members.iter().any(|member| member.get("module").and_then(Value::as_str).unwrap_or(module_id) == module_id && member.get("element").and_then(Value::as_str) == Some(field_id)) {
            return Err(Fault::new("INVALID_RECORD", "Every Key field must also be a declared Record member"));
        }
        let field_matches: Vec<_> = elements.iter().filter(|e| e.get("id").and_then(Value::as_str) == Some(field_id)).collect();
        if field_matches.len() != 1 { return Err(Fault::new("AMBIGUOUS_RECORD", "R1 requires each Key field to resolve to exactly one authored Field")); }
        let field = field_matches[0];
        if field.get("kind").and_then(Value::as_str) != Some("field") { return Err(Fault::new("INVALID_RECORD", "Key field reference does not resolve to an authored Field")); }
        if field.get("cardinality").and_then(Value::as_str) != Some("one") || field.get("nullability").and_then(Value::as_str) != Some("required") {
            return Err(Fault::new("UNSUPPORTED_RECORD", "R1 Key fields must be required scalar Fields"));
        }
        if field.get("facets").is_some() || field.get("allowedValues").is_some() || field.get("semanticTypes").is_some()
            || field.get("extensions").and_then(Value::as_object).is_some_and(|extensions| !extensions.is_empty()) {
            return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses selected Key Field facets, enumerations, semantic qualifiers, or extensions that the emitted Key block cannot represent"));
        }
        let raw_field_name = field.get("name").and_then(Value::as_str).unwrap_or(field_id);
        let selected_field_name = raw_field_name.rsplit('.').next().unwrap_or(raw_field_name);
        // The current TS generator preserves leading/trailing separators as an
        // invalid Python identifier. Refuse before the word splitter can erase them.
        if has_ambiguous_name_separators(selected_field_name) {
            return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses field names whose Python normalization would drop boundary separators"));
        }
        let py_name = snake_case(selected_field_name);
        if !safe_python_identifier(&py_name, false) || !seen_names.insert(py_name.clone()) {
            return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses invalid, reserved, or colliding generated Python field names"));
        }
        let scalar = field.get("scalarType").and_then(Value::as_str).ok_or_else(|| Fault::new("UNSUPPORTED_RECORD", "Key Field needs an explicit scalar type"))?;
        let py_type = match scalar { "string"=>"str", "integer"=>"int", "decimal"=>"Decimal", "float"=>"float", "boolean"=>"bool", "binary"=>"bytes", "date"=>"date", "timestamp"=>"ExactTimestamp", "uuid"=>"UUID", "bits128"=>"bytes", _=>return Err(Fault::new("UNSUPPORTED_RECORD", format!("R1 cannot emit scalar type {scalar}"))) };
        declarations.push(format!("    {py_name}: {py_type}"));
    }
    let raw_class_name = record.get("name").and_then(Value::as_str).unwrap_or(record_id);
    if has_ambiguous_name_separators(raw_class_name) {
        return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses Record names whose Python normalization would drop boundary or repeated separators"));
    }
    let class_name = pascal_case(raw_class_name);
    if !safe_python_identifier(&class_name, true) || !safe_python_identifier(&format!("{class_name}Key"), true) {
        return Err(Fault::new("UNSUPPORTED_RECORD", "R1 refuses invalid or reserved generated Python class names"));
    }
    if class_name != record_id && !record.get("name").and_then(Value::as_str).is_some_and(|name| name.contains('.')) {
        // Name transformation is supported; record identity remains the metadata key.
    }
    let block = format!("@dataclass(frozen=True)\nclass {class_name}Key:\n{}\n    def __post_init__(self) -> None:\n        validate_model(self, _METADATA[{}]['key'])", declarations.join("\n"), py_literal(&format!("{module_id}.{record_id}")));
    let digest = digest_source(source_units)?;
    Ok(json!({"ok":true,"op":"generate-keyed-record","pythonSource":block,"sourceDigest":digest,"complete":false,"diagnostics":[{"code":"R1_GENERATOR_SUBSET","path":format!("/modules/{module_id}/elements/{record_id}"),"severity":"warning","message":"Emits only the current generator's Key class block for a required scalar Key; full package generation is not implemented"}],"sourceUnits":source_units,"retainedModel":model}))
}

fn verified_model(object: &Map<String, Value>, source_units: &[u16]) -> Result<Value, Fault> {
    if source_units.is_empty() { return Err(Fault::new("INVALID_SOURCE", "Interpretation requires original JSON sourceUnits")); }
    let source = String::from_utf16(source_units).map_err(|_| Fault::new("INVALID_SOURCE", "Interpretation refuses unpaired UTF-16 source units; transport remains lossless"))?;
    let mut deserializer = serde_json::Deserializer::from_str(&source);
    UniqueJson::deserialize(&mut deserializer).map_err(|error| {
        let message = error.to_string();
        if message.contains("duplicate JSON object key") { Fault::new("DUPLICATE_JSON_KEY", message) }
        else { Fault::new("INVALID_SOURCE", format!("Source is not valid JSON: {message}")) }
    })?;
    deserializer.end().map_err(|error| Fault::new("INVALID_SOURCE", format!("Source has trailing content: {error}")))?;
    let parsed: Value = serde_json::from_str(&source).map_err(|error| Fault::new("INVALID_SOURCE", format!("Source is not valid JSON: {error}")))?;
    let supplied = object.get("model").ok_or_else(|| Fault::new("INVALID_MODEL", "model is required"))?;
    if &parsed != supplied { return Err(Fault::new("MODEL_SOURCE_MISMATCH", "model must equal the JSON document represented by sourceUnits")); }
    Ok(parsed)
}

struct UniqueJson;

impl<'de> Deserialize<'de> for UniqueJson {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where D: serde::Deserializer<'de> {
        deserializer.deserialize_any(UniqueJsonVisitor)
    }
}

struct UniqueJsonVisitor;

impl<'de> Visitor<'de> for UniqueJsonVisitor {
    type Value = UniqueJson;
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result { formatter.write_str("any JSON value with unique object keys") }
    fn visit_bool<E: de::Error>(self, _: bool) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_i64<E: de::Error>(self, _: i64) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_u64<E: de::Error>(self, _: u64) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_f64<E: de::Error>(self, _: f64) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_str<E: de::Error>(self, _: &str) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_string<E: de::Error>(self, _: String) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> { Ok(UniqueJson) }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
        while seq.next_element::<UniqueJson>()?.is_some() {}
        Ok(UniqueJson)
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut keys = HashSet::new();
        while let Some(key) = map.next_key::<String>()? {
            if !keys.insert(key) { return Err(de::Error::custom("duplicate JSON object key")); }
            map.next_value::<UniqueJson>()?;
        }
        Ok(UniqueJson)
    }
}

fn digest_source(units: &[u16]) -> Result<String, Fault> {
    let text = String::from_utf16(units).map_err(|_| Fault::new("INVALID_SOURCE_UNITS", "Hashing refuses unpaired UTF-16 surrogates; source-roundtrip still preserves them"))?;
    let digest = Sha256::digest(text.as_bytes());
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn snake_case(raw: &str) -> String {
    let words = python_words(raw);
    words.into_iter().map(|word| word.to_ascii_lowercase()).collect::<Vec<_>>().join("_")
}

fn has_ambiguous_name_separators(name: &str) -> bool {
    let is_separator = |ch| matches!(ch, '_' | ' ' | '-' | '.');
    name.chars().next().is_some_and(is_separator)
        || name.chars().last().is_some_and(is_separator)
        || name.chars().zip(name.chars().skip(1)).any(|(a,b)| is_separator(a) && is_separator(b))
}

fn pascal_case(raw: &str) -> String {
    python_words(raw).into_iter().map(|word| {
        let mut chars = word.chars();
        chars.next().map(|first| first.to_ascii_uppercase().to_string() + chars.as_str()).unwrap_or_default()
    }).collect()
}

/// Matches the current TypeScript generator's ASCII acronym-aware word splitting.
fn python_words(raw: &str) -> Vec<String> {
    let chars: Vec<char> = raw.chars().collect();
    let mut words = Vec::new();
    let mut current = String::new();
    for (index, ch) in chars.iter().copied().enumerate() {
        if matches!(ch, '_' | '.' | ' ' | '-') {
            if !current.is_empty() { words.push(std::mem::take(&mut current)); }
            continue;
        }
        let previous = index.checked_sub(1).and_then(|i| chars.get(i)).copied();
        let next = chars.get(index + 1).copied();
        let lower_to_upper = previous.is_some_and(|p| p.is_ascii_lowercase() || p.is_ascii_digit()) && ch.is_ascii_uppercase();
        let acronym_end = previous.is_some_and(|p| p.is_ascii_uppercase()) && ch.is_ascii_uppercase() && next.is_some_and(|n| n.is_ascii_lowercase());
        if (lower_to_upper || acronym_end) && !current.is_empty() { words.push(std::mem::take(&mut current)); }
        current.push(ch);
    }
    if !current.is_empty() { words.push(current); }
    words
}

fn safe_python_identifier(name: &str, class_name: bool) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else { return false };
    if !first.is_ascii_alphabetic() || !chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_') { return false; }
    const KEYWORDS: &str = "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case";
    // Frozen from src/access/index.ts for this R1 spike only. Production code
    // must share the TypeScript generator's policy rather than maintain this table.
    const RESERVED: &str = "AccessError Actions Any AsyncActions AsyncClient AsyncTransport ClassVar Client Decimal ExactTimestamp Field Literal MISSING Missing Ordering Page PreconditionFailed Query Receipt Relationship RuntimeClient RuntimeSyncClient SchemaMismatch SyncActions SyncClient SyncQuery SyncTransport Transport UUID Unsupported WriteOutcomeUnknown date objects c";
    !KEYWORDS.split_whitespace().any(|keyword| keyword == name)
        && !RESERVED.split_whitespace().any(|reserved| reserved == name)
        && !(class_name && name == "Key")
}

fn py_literal(value: &str) -> String { serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_owned()) }

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    fn generator_request(field_name: &str) -> Value {
        let model = json!({
            "umf":"0.10.0","id":"rust-spike-test","vocabularies":{},"extensions":{},
            "modules":[{"id":"m","namespace":"","extensions":{},"elements":[
                {"id":"id","name":field_name,"kind":"field","scalarType":"string","cardinality":"one","nullability":"required","extensions":{}},
                {"id":"Item","name":"Item","kind":"record","members":[{"module":"m","element":"id"}],"keys":[{"id":"primary","name":"primary","primary":true,"fields":[{"module":"m","element":"id"}]}],"extensions":{}}
            ]}]
        });
        let source = serde_json::to_string(&model).unwrap();
        let request = json!({"op":"generate-keyed-record","recordKey":"m.Item","model":model,"sourceUnits":source.encode_utf16().collect::<Vec<_>>()});
        request
    }

    fn validation_request(options: &str) -> String {
        let source = r#"{"umf":"0.10.0","id":"x","vocabularies":{},"modules":[],"extensions":{}}"#;
        let units = source.encode_utf16().map(|unit| unit.to_string()).collect::<Vec<_>>().join(",");
        format!(r#"{{"op":"validate-record","model":{source},"sourceUnits":[{units}],"options":{options}}}"#)
    }

    #[test]
    fn host_cancellation_is_polled_during_model_walk() {
        let request = validation_request(r#"{}"#);
        let polls = Cell::new(0usize);
        let response = run_with_control(&request, || Some(0), || {
            let count = polls.get() + 1;
            polls.set(count);
            count == 2
        }, None).unwrap();
        let response: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(response["code"], "CANCELLED");
        assert!(polls.get() >= 2);
        assert_eq!(response["complete"], false);
    }

    #[test]
    fn injected_clock_can_expire_during_bounded_model_walk() {
        let request = validation_request(r#"{"deadlineUnixMs":10}"#);
        let reads = Cell::new(0usize);
        let response = run_with_control(&request, || {
            let count = reads.get() + 1;
            reads.set(count);
            Some(if count == 1 { 0 } else { 11 })
        }, || false, None).unwrap();
        let response: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(response["code"], "DEADLINE");
        assert!(reads.get() >= 2);
        assert_eq!(response["complete"], false);
    }

    #[test]
    fn key_generator_refuses_model_outside_generated_core_schema() {
        let mut request = generator_request("id");
        request["model"].as_object_mut().unwrap().remove("vocabularies");
        let altered_source = serde_json::to_string(&request["model"]).unwrap();
        request["sourceUnits"] = json!(altered_source.encode_utf16().collect::<Vec<_>>());
        let response: Value = serde_json::from_str(&run(&serde_json::to_string(&request).unwrap())).unwrap();
        assert_eq!(response["code"], "INVALID_MODEL");
        assert_eq!(response["complete"], false);
    }

    #[test]
    fn key_generator_matches_field_dot_rule_and_refuses_invalid_python_names() {
        let request = generator_request("a.b");
        let response: Value = serde_json::from_str(&run(&serde_json::to_string(&request).unwrap())).unwrap();
        assert_eq!(response["pythonSource"].as_str().unwrap().contains("    b: str"), true);

        let request = generator_request("a:b");
        let response: Value = serde_json::from_str(&run(&serde_json::to_string(&request).unwrap())).unwrap();
        assert_eq!(response["code"], "UNSUPPORTED_RECORD");
        assert_eq!(response["complete"], false);
    }

    #[test]
    fn key_generator_refuses_boundary_normalization_and_ts_reserved_classes() {
        for name in ["_id", "id_", " a "] {
            let request = generator_request(name);
            let response: Value = serde_json::from_str(&run(&serde_json::to_string(&request).unwrap())).unwrap();
            assert_eq!(response["code"], "UNSUPPORTED_RECORD", "name={name}");
            assert_eq!(response["complete"], false);
        }
        for name in ["ClassVar", "Actions", "Unsupported", "SchemaMismatch", "PreconditionFailed", "WriteOutcomeUnknown"] {
            let mut request = generator_request("id");
            request["model"]["modules"][0]["elements"][1]["name"] = json!(name);
            let source = serde_json::to_string(&request["model"]).unwrap();
            request["sourceUnits"] = json!(source.encode_utf16().collect::<Vec<_>>());
            let response: Value = serde_json::from_str(&run(&serde_json::to_string(&request).unwrap())).unwrap();
            assert_eq!(response["code"], "UNSUPPORTED_RECORD", "record name={name}");
            assert_eq!(response["complete"], false);
        }
    }
}

