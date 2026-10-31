// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded local Delta DDL proposal generation.
//!
//! This module emits a conservative managed CREATE statement from an exact
//! Delta schema tree and authored definition. It never executes SQL or claims
//! protocol, permission, retention, or remote-service admission.

use sha2::{Digest, Sha256};

use crate::{
    context::Context,
    delta_schema::{self, DeltaSchemaResources},
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Validation},
    native_json::{NativeJsonNode as N, NativeJsonTree},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const QUALIFICATION: &str = "Proposed managed Databricks Delta CREATE; no application, migration, protocol/permission/retention admission, predictive optimization change or relationship enforcement. Native target acceptance requires separate evidence.";

#[derive(Debug)]
pub struct DeltaDdlProposal {
    pub sql: Utf16,
    pub schema_json: Utf16,
    pub definition: Value,
    pub qualification: Utf16,
}

const DELTA_DEFINITION_EXT: &str = "umf.delta.definition";
const DELTA_EXT: &str = "umf.delta";
const DELTA_SCHEMA_TOKEN: u64 = 0x4445_4c54_4153_4301;
const DELTA_DEFINITION_TOKEN: u64 = 0x4444_4c54_4444_4c01;

pub struct DeltaDdlResources {
    engine: Engine,
    registry: Registry,
    schema: DeltaSchemaResources,
}

impl DeltaDdlResources {
    pub fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
            let units = source.encode_utf16().count();
            ctx.charge_text(units, Utf16::default())?;
            let mut buffer = Vec::new();
            buffer
                .try_reserve(units)
                .map_err(|_| fail("LIMIT", "Resource allocation refused"))?;
            buffer.extend(source.encode_utf16());
            serialization::read_json_value(&buffer, Format::Json, ctx)
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
        let delta_manifest = resource(
            include_str!("../../../spec/extensions/delta/package.json"),
            ctx,
        )?;
        let ddl_manifest = resource(
            include_str!("../../../spec/extensions/delta-definition/package.json"),
            ctx,
        )?;
        let mut registry = Registry::new();
        registry.register(
            &delta_manifest,
            Some(DELTA_SCHEMA_TOKEN),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        registry.register(
            &ddl_manifest,
            Some(DELTA_DEFINITION_TOKEN),
            engine.package_schema(),
            &schema_resources,
            ctx,
        )?;
        Ok(Self {
            engine,
            registry,
            schema: DeltaSchemaResources::new(ctx)?,
        })
    }
}

struct DdlCapabilities;
impl Capabilities for DdlCapabilities {
    fn validate_extension(
        &mut self,
        _token: u64,
        _payload: &Value,
        _semantic: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        Ok(Vec::new())
    }
    fn validate_extension_with_context(
        &mut self,
        _token: u64,
        _payload: &Value,
        _semantic: &SemanticContext,
        _ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        Ok(Vec::new())
    }
}

fn exact_value_object(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Expected an object"));
    };
    ctx.charge_work(fields.len().saturating_mul(fields.len()), Utf16::default())?;
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|allowed| key == &Utf16::from(*allowed)) {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Unknown content must remain in UMF; DDL generation refuses to discard it",
            ));
        }
        if fields[..index].iter().any(|(previous, _)| previous == key) {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate UMF object key"));
        }
    }
    Ok(())
}
fn value_array<'a>(value: Option<&'a Value>, label: &str) -> Result<&'a [Value], EngineError> {
    match value {
        Some(Value::Array(items)) => Ok(items),
        _ => Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            &format!("{label} must be an array"),
        )),
    }
}
fn value_is_text(
    value: Option<&Value>,
    expected: &str,
    label: &str,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    match value {
        Some(Value::String(text)) => Ok(utf8(text, label, ctx)? == expected),
        _ => Ok(false),
    }
}

fn validate_document(
    document: &Value,
    resources: &DeltaDdlResources,
    ctx: &mut Context<'_>,
) -> Result<Validation, EngineError> {
    exact_value_object(
        document,
        &["umf", "id", "vocabularies", "modules", "extensions"],
        ctx,
    )?;
    let vocabularies = field_value(document, "vocabularies")
        .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Vocabularies required"))?;
    exact_value_object(vocabularies, &[DELTA_EXT, DELTA_DEFINITION_EXT], ctx)?;
    if let Value::Object(declarations) = vocabularies {
        ctx.charge_work(declarations.len(), Utf16::default())?;
        for (_, declaration) in declarations {
            exact_value_object(declaration, &["version"], ctx)?;
        }
    } else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Vocabularies must be an object",
        ));
    }
    let extensions = field_value(document, "extensions")
        .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Definition extension required"))?;
    exact_value_object(extensions, &[DELTA_DEFINITION_EXT], ctx)?;
    let modules = value_array(field_value(document, "modules"), "modules")?;
    if modules.len() != 1 {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "One schema module required"));
    }
    let module = &modules[0];
    exact_value_object(module, &["id", "namespace", "elements"], ctx)?;
    if !value_is_text(field_value(module, "id"), "schema", "module id", ctx)?
        || !value_is_text(
            field_value(module, "namespace"),
            "",
            "module namespace",
            ctx,
        )?
    {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Unexpected schema module"));
    }
    let elements = value_array(field_value(module, "elements"), "module elements")?;
    if elements.len() != 1 {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "One schema element required"));
    }
    let element = &elements[0];
    exact_value_object(element, &["id", "extensions"], ctx)?;
    if !value_is_text(field_value(element, "id"), "schema", "element id", ctx)? {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Unexpected schema element"));
    }
    exact_value_object(
        field_value(element, "extensions")
            .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Schema extension missing"))?,
        &[DELTA_EXT],
        ctx,
    )?;
    let mut capabilities = DdlCapabilities;
    let validation = resources.engine.validate_document(
        document,
        &resources.registry,
        &mut capabilities,
        ctx,
    )?;
    if validation.valid {
        return delta_schema::inspect_delta_schema(document, &resources.schema, ctx);
    }
    Ok(validation)
}

fn reject_representation_warnings(validation: &Validation) -> Result<(), EngineError> {
    if validation
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.code == Utf16::from("DELTA_REPRESENTATION"))
    {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Unknown Delta schema representation must remain in UMF; DDL generation refuses to discard it",
        ));
    }
    Ok(())
}

fn object_field_mut<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Value, EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail("DELTA_DDL_DOCUMENT", "Expected document object"));
    };
    let Some((_, child)) = fields
        .iter_mut()
        .find(|(name, _)| name == &Utf16::from(key))
    else {
        return Err(fail(
            "DELTA_DDL_DOCUMENT",
            "Required document object is missing",
        ));
    };
    Ok(child)
}

fn upsert_object(
    value: &mut Value,
    key: &str,
    child: Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_text(key.encode_utf16().count(), Utf16::default())?;
    ctx.charge_work(1, Utf16::default())?;
    let Value::Object(fields) = value else {
        return Err(fail(
            "DELTA_DDL_DOCUMENT",
            "Expected object while adding Delta definition",
        ));
    };
    let key = Utf16::from(key);
    if let Some((_, old)) = fields.iter_mut().find(|(name, _)| name == &key) {
        *old = child;
    } else {
        fields
            .try_reserve(1)
            .map_err(|_| fail("LIMIT", "Delta definition allocation refused"))?;
        fields.push((key, child));
    }
    Ok(())
}

/// Import a Delta schema and attach a validated managed table definition.
pub fn define_delta_table(
    source: &[u16],
    definition: &Value,
    id: &Utf16,
    resources: &DeltaDdlResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let definition = copy_json(definition, ctx)?;
    let mut document = delta_schema::import_delta_schema(source, id, &resources.schema, ctx)?;
    let vocabularies = object_field_mut(&mut document, "vocabularies")?;
    upsert_object(
        vocabularies,
        DELTA_DEFINITION_EXT,
        Value::Object(vec![(Utf16::from("version"), Value::string_utf8("0.1.0"))]),
        ctx,
    )?;
    if !matches!(field_value(&document, "extensions"), Some(Value::Object(_))) {
        upsert_object(&mut document, "extensions", Value::Object(Vec::new()), ctx)?;
    }
    upsert_object(
        object_field_mut(&mut document, "extensions")?,
        DELTA_DEFINITION_EXT,
        definition,
        ctx,
    )?;
    let validation = validate_document(&document, resources, ctx)?;
    reject_representation_warnings(&validation)?;
    if !validation.valid {
        return Err(EngineError::new(
            "DELTA_DDL_INVALID",
            validation
                .diagnostics
                .first()
                .map(|d| d.path.clone())
                .unwrap_or_default(),
            "Delta definition document is invalid",
        ));
    }
    let _ = generate_delta_ddl_document(&document, resources, ctx)?;
    Ok(document)
}

fn field_value<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, child)| child),
        _ => None,
    }
}

fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (Utf16::from(key), value))
            .collect(),
    )
}

/// Validate and generate a managed CREATE proposal from a full UMF document.
pub fn generate_delta_ddl_document(
    document: &Value,
    resources: &DeltaDdlResources,
    ctx: &mut Context<'_>,
) -> Result<DeltaDdlProposal, EngineError> {
    generate_delta_ddl_document_profile(document, resources, false, ctx)
}

fn generate_delta_ddl_document_profile(
    document: &Value,
    resources: &DeltaDdlResources,
    spark_local: bool,
    ctx: &mut Context<'_>,
) -> Result<DeltaDdlProposal, EngineError> {
    let validation = validate_document(document, resources, ctx)?;
    reject_representation_warnings(&validation)?;
    if !validation.valid {
        return Err(EngineError::new(
            "DELTA_DDL_INVALID",
            validation
                .diagnostics
                .first()
                .map(|d| d.path.clone())
                .unwrap_or_default(),
            "Delta definition document is invalid",
        ));
    }
    check_managed_delta_document(document, ctx)?;
    let definition = field_value(document, "extensions")
        .and_then(|v| field_value(v, DELTA_DEFINITION_EXT))
        .ok_or_else(|| fail("DELTA_DDL_INVALID", "Missing Delta definition payload"))?;
    let pointer = Utf16::default();
    let schema = delta_schema::get_delta_node(document, &pointer, &resources.schema, ctx)?;
    generate_delta_ddl_profile(&schema, definition, spark_local, None, None, ctx)
}

fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

fn assembled_text(
    prefix: &str,
    parts: &[&str],
    separator: &str,
    suffix: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    let separators = parts.len().saturating_sub(1);
    let part_bytes = parts
        .iter()
        .fold(0usize, |length, part| length.saturating_add(part.len()));
    let part_units = parts.iter().fold(0usize, |length, part| {
        length.saturating_add(part.encode_utf16().count())
    });
    let byte_len = prefix
        .len()
        .saturating_add(suffix.len())
        .saturating_add(part_bytes)
        .saturating_add(separators.saturating_mul(separator.len()));
    let unit_len = prefix
        .encode_utf16()
        .count()
        .saturating_add(suffix.encode_utf16().count())
        .saturating_add(part_units)
        .saturating_add(separators.saturating_mul(separator.encode_utf16().count()));
    ctx.charge_text(unit_len, Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(byte_len)
        .map_err(|_| fail("LIMIT", "DDL intermediate allocation refused"))?;
    output.push_str(prefix);
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            output.push_str(separator);
        }
        output.push_str(part);
    }
    output.push_str(suffix);
    Ok(output)
}

fn member<'a>(node: &'a N, key: &str) -> Option<&'a N> {
    match node {
        N::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn value_member<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(name, _)| name == &Utf16::from(key))
            .map(|(_, value)| value),
        _ => None,
    }
}

fn check_keys(node: &N, allowed: &[&str], ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let N::Object(fields) = node else {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Expected a JSON object"));
    };
    ctx.charge_work(fields.len().saturating_mul(fields.len()), Utf16::default())?;
    for (index, (name, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|allowed| name == &Utf16::from(*allowed)) {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Unknown content must remain in UMF; generation would discard it",
            ));
        }
        if fields[..index].iter().any(|(previous, _)| previous == name) {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Duplicate native schema property cannot be represented safely",
            ));
        }
    }
    Ok(())
}

fn text<'a>(node: &'a N, label: &str) -> Result<&'a Utf16, EngineError> {
    match node {
        N::String(value) => Ok(value),
        _ => Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            &format!("{label} must be a string"),
        )),
    }
}

fn utf8(text: &Utf16, label: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    ctx.charge_text(text.len(), Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(text.len().saturating_mul(3))
        .map_err(|_| fail("LIMIT", "DDL text allocation refused"))?;
    for decoded in char::decode_utf16(text.units().iter().copied()) {
        output.push(decoded.map_err(|_| {
            fail(
                "DELTA_DDL_UNSUPPORTED",
                &format!("{label} contains an isolated UTF-16 surrogate"),
            )
        })?);
    }
    Ok(output)
}

fn bool_value(node: &N, label: &str) -> Result<bool, EngineError> {
    match node {
        N::Boolean(value) => Ok(*value),
        _ => Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            &format!("{label} must be boolean"),
        )),
    }
}

fn array<'a>(node: &'a N, label: &str) -> Result<&'a [N], EngineError> {
    match node {
        N::Array(items) => Ok(items),
        _ => Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            &format!("{label} must be an array"),
        )),
    }
}

fn ascii_identifier(value: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Empty SQL identifier"));
    };
    if !(first.is_ascii_alphabetic() || first == b'_')
        || !bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Unsupported SQL identifier"));
    }
    let output_len = value.len().saturating_add(2);
    ctx.charge_text(output_len, Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(output_len)
        .map_err(|_| fail("LIMIT", "Identifier allocation refused"))?;
    output.push('`');
    output.push_str(value);
    output.push('`');
    Ok(output)
}

fn emit(out: &mut String, text: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let units = text.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    out.try_reserve(text.len())
        .map_err(|_| fail("LIMIT", "DDL output allocation refused"))?;
    out.push_str(text);
    Ok(())
}

fn comment(metadata: &N, ctx: &mut Context<'_>) -> Result<Option<String>, EngineError> {
    check_keys(metadata, &["comment"], ctx)?;
    let Some(raw) = member(metadata, "comment") else {
        return Ok(None);
    };
    let value = utf8(text(raw, "Column comment")?, "Column comment", ctx)?;
    if value.chars().any(|ch| ch.is_control() || ch == '$') {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Comment requires text without controls or client macro substitution",
        ));
    }
    let escaped_len = value
        .chars()
        .map(|ch| {
            if ch == '\\' || ch == '\'' {
                2
            } else {
                ch.len_utf8()
            }
        })
        .fold(0usize, usize::saturating_add);
    let output_len = escaped_len.saturating_add(11);
    ctx.charge_text(output_len, Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(output_len)
        .map_err(|_| fail("LIMIT", "Comment allocation refused"))?;
    output.push_str(" COMMENT '");
    for ch in value.chars() {
        if ch == '\\' || ch == '\'' {
            output.push('\\');
        }
        output.push(ch);
    }
    output.push('\'');
    Ok(Some(output))
}

fn ddl_type(node: &N, in_collection: bool, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    match node {
        N::String(spelling) => {
            let spelling = utf8(spelling, "Delta type", ctx)?;
            let mapped = match spelling.as_str() {
                "string" => Some("STRING"),
                "long" => Some("BIGINT"),
                "integer" => Some("INT"),
                "short" => Some("SMALLINT"),
                "byte" => Some("TINYINT"),
                "float" => Some("FLOAT"),
                "double" => Some("DOUBLE"),
                "boolean" => Some("BOOLEAN"),
                "binary" => Some("BINARY"),
                "date" => Some("DATE"),
                "timestamp" => Some("TIMESTAMP"),
                "timestamp_ntz" => Some("TIMESTAMP_NTZ"),
                _ => None,
            };
            if let Some(value) = mapped {
                return assembled_text("", &[value], "", "", ctx);
            }
            if let Some(inner) = spelling
                .strip_prefix("decimal(")
                .and_then(|s| s.strip_suffix(')'))
            {
                if let Some((precision, scale)) = inner.split_once(',') {
                    let valid_precision = (1..=2).contains(&precision.len())
                        && !precision.starts_with('0')
                        && precision.bytes().all(|b| b.is_ascii_digit());
                    let valid_scale = scale == "0"
                        || ((1..=2).contains(&scale.len())
                            && !scale.starts_with('0')
                            && scale.bytes().all(|b| b.is_ascii_digit()));
                    if valid_precision && valid_scale {
                        let p = precision.parse::<u8>().ok();
                        let scale_num = scale.parse::<u8>().ok();
                        if let (Some(p), Some(scale_num)) = (p, scale_num) {
                            if (1..=38).contains(&p) && scale_num <= p {
                                return assembled_text(
                                    "DECIMAL(",
                                    &[&p.to_string(), &scale_num.to_string()],
                                    ",",
                                    ")",
                                    ctx,
                                );
                            }
                        }
                    }
                }
            }
            Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Type has no supported DDL mapping",
            ))
        }
        N::Object(_) => {
            let kind = member(node, "type")
                .map(|v| text(v, "type"))
                .transpose()?
                .map(|v| utf8(v, "type", ctx))
                .transpose()?;
            match kind.as_deref() {
                Some("struct") => {
                    check_keys(node, &["type", "fields"], ctx)?;
                    let fields = array(
                        member(node, "fields").ok_or_else(|| {
                            fail("DELTA_DDL_UNSUPPORTED", "Struct fields required")
                        })?,
                        "Struct fields",
                    )?;
                    if fields.is_empty() {
                        return Err(fail(
                            "DELTA_DDL_UNSUPPORTED",
                            "Nonempty nested struct required",
                        ));
                    }
                    let mut names = std::collections::BTreeSet::new();
                    ctx.charge_work(fields.len(), Utf16::default())?;
                    let mut parts = Vec::new();
                    parts
                        .try_reserve(fields.len())
                        .map_err(|_| fail("LIMIT", "DDL field allocation refused"))?;
                    for field in fields {
                        ctx.charge_work(1, Utf16::default())?;
                        check_keys(field, &["name", "type", "nullable", "metadata"], ctx)?;
                        let name = utf8(
                            text(
                                member(field, "name").ok_or_else(|| {
                                    fail("DELTA_DDL_UNSUPPORTED", "Field name required")
                                })?,
                                "Field name",
                            )?,
                            "Field name",
                            ctx,
                        )?;
                        let quoted = ascii_identifier(&name, ctx)?;
                        let folded = name.to_lowercase();
                        if !names.insert(folded) {
                            return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate nested column"));
                        }
                        let nullable = bool_value(
                            member(field, "nullable").ok_or_else(|| {
                                fail("DELTA_DDL_UNSUPPORTED", "Field nullability required")
                            })?,
                            "Field nullability",
                        )?;
                        if in_collection && !nullable {
                            return Err(fail("DELTA_DDL_UNSUPPORTED", "Required fields inside collections cannot be preserved by this DDL profile"));
                        }
                        let field_type = ddl_type(
                            member(field, "type").ok_or_else(|| {
                                fail("DELTA_DDL_UNSUPPORTED", "Field type required")
                            })?,
                            in_collection,
                            ctx,
                        )?;
                        let metadata = member(field, "metadata").ok_or_else(|| {
                            fail("DELTA_DDL_UNSUPPORTED", "Field metadata required")
                        })?;
                        let comment = comment(metadata, ctx)?.unwrap_or_default();
                        let part = assembled_text(
                            "",
                            &[
                                &quoted,
                                ": ",
                                &field_type,
                                if nullable { "" } else { " NOT NULL" },
                                &comment,
                            ],
                            "",
                            "",
                            ctx,
                        )?;
                        parts.push(part);
                    }
                    ctx.charge_work(parts.len(), Utf16::default())?;
                    let mut borrowed = Vec::new();
                    borrowed
                        .try_reserve(parts.len())
                        .map_err(|_| fail("LIMIT", "DDL type allocation refused"))?;
                    borrowed.extend(parts.iter().map(String::as_str));
                    assembled_text("STRUCT<", &borrowed, ", ", ">", ctx)
                }
                Some("array") => {
                    check_keys(node, &["type", "elementType", "containsNull"], ctx)?;
                    if !bool_value(
                        member(node, "containsNull").ok_or_else(|| {
                            fail(
                                "DELTA_DDL_UNSUPPORTED",
                                "Array element nullability required",
                            )
                        })?,
                        "containsNull",
                    )? {
                        return Err(fail(
                            "DELTA_DDL_UNSUPPORTED",
                            "Nonnullable array elements cannot be preserved by SQL type syntax",
                        ));
                    }
                    let element = ddl_type(
                        member(node, "elementType").ok_or_else(|| {
                            fail("DELTA_DDL_UNSUPPORTED", "Array elementType required")
                        })?,
                        true,
                        ctx,
                    )?;
                    assembled_text("ARRAY<", &[&element], "", ">", ctx)
                }
                Some("map") => {
                    check_keys(
                        node,
                        &["type", "keyType", "valueType", "valueContainsNull"],
                        ctx,
                    )?;
                    if !bool_value(
                        member(node, "valueContainsNull").ok_or_else(|| {
                            fail("DELTA_DDL_UNSUPPORTED", "Map value nullability required")
                        })?,
                        "valueContainsNull",
                    )? {
                        return Err(fail(
                            "DELTA_DDL_UNSUPPORTED",
                            "Map value nullability must be explicitly true",
                        ));
                    }
                    if !matches!(member(node, "keyType"), Some(N::String(_))) {
                        return Err(fail(
                            "DELTA_DDL_UNSUPPORTED",
                            "This profile supports atomic map keys only",
                        ));
                    }
                    let key_type = ddl_type(member(node, "keyType").unwrap(), true, ctx)?;
                    let value_type = ddl_type(
                        member(node, "valueType").ok_or_else(|| {
                            fail("DELTA_DDL_UNSUPPORTED", "Map valueType required")
                        })?,
                        true,
                        ctx,
                    )?;
                    assembled_text("MAP<", &[&key_type, &value_type], ", ", ">", ctx)
                }
                _ => Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "Object type has no supported DDL mapping",
                )),
            }
        }
        _ => Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Type has no supported DDL mapping",
        )),
    }
}

fn definition_strings(
    definition: &Value,
    key: &str,
    ctx: &mut Context<'_>,
) -> Result<Vec<String>, EngineError> {
    let Value::Array(items) = value_member(definition, key)
        .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", &format!("{key} is required")))?
    else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            &format!("{key} must be an array"),
        ));
    };
    let mut output = Vec::new();
    output
        .try_reserve(items.len())
        .map_err(|_| fail("LIMIT", "DDL definition allocation refused"))?;
    for item in items {
        let Value::String(value) = item else {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                &format!("{key} items must be strings"),
            ));
        };
        output.push(utf8(value, key, ctx)?);
    }
    Ok(output)
}

fn props(definition: &Value, ctx: &mut Context<'_>) -> Result<Vec<(String, String)>, EngineError> {
    let Value::Object(items) = value_member(definition, "properties")
        .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "properties is required"))?
    else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "properties must be an object",
        ));
    };
    ctx.charge_work(items.len().saturating_mul(items.len()), Utf16::default())?;
    for (index, (key, _)) in items.iter().enumerate() {
        if items[..index].iter().any(|(previous, _)| previous == key) {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate property member"));
        }
    }
    ctx.charge_work(items.len(), Utf16::default())?;
    let mut output = Vec::new();
    output
        .try_reserve(items.len())
        .map_err(|_| fail("LIMIT", "DDL property allocation refused"))?;
    for (key, value) in items {
        let key = utf8(key, "Property name", ctx)?;
        let Value::String(value) = value else {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Property values must be strings",
            ));
        };
        output.push((key, utf8(value, "Property value", ctx)?));
    }
    Ok(output)
}

/// Generate the core managed Delta CREATE proposal from an exact source tree.
pub fn generate_delta_ddl(
    schema: &NativeJsonTree,
    definition: &Value,
    ctx: &mut Context<'_>,
) -> Result<DeltaDdlProposal, EngineError> {
    generate_delta_ddl_profile(schema, definition, false, None, None, ctx)
}

fn generate_delta_ddl_profile(
    schema: &NativeJsonTree,
    definition: &Value,
    spark_local: bool,
    target_relation: Option<&str>,
    target_location: Option<&str>,
    ctx: &mut Context<'_>,
) -> Result<DeltaDdlProposal, EngineError> {
    let root = schema.root();
    check_keys(root, &["type", "fields"], ctx)?;
    if text(
        member(root, "type")
            .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Schema type required"))?,
        "Schema type",
    )?
    .to_utf8()
    .ok()
    .as_deref()
        != Some("struct")
    {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Nonempty struct required"));
    }
    let fields = array(
        member(root, "fields")
            .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Schema fields required"))?,
        "Schema fields",
    )?;
    if fields.is_empty() {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "Nonempty struct required"));
    }
    let profile = value_member(definition, "profile");
    let profile_matches = match profile {
        Some(Value::String(value)) => {
            utf8(value, "Definition profile", ctx)? == "databricks-managed-delta/0.1"
        }
        _ => false,
    };
    if !profile_matches {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Missing or unknown definition profile",
        ));
    }
    let Value::Object(definition_fields) = definition else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Definition must be an object",
        ));
    };
    const KEYS: &[&str] = &["profile", "name", "clusterBy", "partitionBy", "properties"];
    let duplicate_work = definition_fields
        .len()
        .saturating_mul(definition_fields.len());
    ctx.charge_work(duplicate_work, Utf16::default())?;
    for (index, (key, _)) in definition_fields.iter().enumerate() {
        if definition_fields[..index]
            .iter()
            .any(|(previous, _)| previous == key)
        {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate definition member"));
        }
    }
    if definition_fields.iter().any(|(key, _)| {
        key.to_utf8()
            .ok()
            .is_none_or(|k| !KEYS.contains(&k.as_str()))
    }) {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Unknown definition content must remain in UMF; generation would discard it",
        ));
    }
    let names = definition_strings(definition, "name", ctx)?;
    if names.is_empty() || names.len() > 3 {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "One to three table name components required",
        ));
    }
    let quoted_names = names
        .iter()
        .map(|name| ascii_identifier(name, ctx))
        .collect::<Result<Vec<_>, _>>()?;
    let clustering = definition_strings(definition, "clusterBy", ctx)?;
    let partition = definition_strings(definition, "partitionBy", ctx)?;
    if !clustering.is_empty() && !partition.is_empty() {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Liquid clustering and partitioning cannot coexist",
        ));
    }
    if clustering.len() > 4 {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "At most four clustering columns supported",
        ));
    }
    let mut seen = std::collections::BTreeSet::new();
    ctx.charge_work(fields.len(), Utf16::default())?;
    let mut columns = Vec::new();
    columns
        .try_reserve(fields.len())
        .map_err(|_| fail("LIMIT", "DDL column allocation refused"))?;
    let mut field_names = std::collections::BTreeSet::new();
    for field in fields {
        ctx.charge_work(1, Utf16::default())?;
        check_keys(field, &["name", "type", "nullable", "metadata"], ctx)?;
        let name = utf8(
            text(
                member(field, "name")
                    .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Field name required"))?,
                "Field name",
            )?,
            "Field name",
            ctx,
        )?;
        let quoted = ascii_identifier(&name, ctx)?;
        if !field_names.insert(name.to_lowercase()) {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate column"));
        }
        let nullable = bool_value(
            member(field, "nullable")
                .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Field nullability required"))?,
            "Field nullability",
        )?;
        let field_type = ddl_type(
            member(field, "type")
                .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Field type required"))?,
            false,
            ctx,
        )?;
        let metadata = member(field, "metadata")
            .ok_or_else(|| fail("DELTA_DDL_UNSUPPORTED", "Field metadata required"))?;
        let comment = comment(metadata, ctx)?.unwrap_or_default();
        let column = assembled_text(
            "  ",
            &[
                &quoted,
                " ",
                &field_type,
                if nullable { "" } else { " NOT NULL" },
                &comment,
            ],
            "",
            "",
            ctx,
        )?;
        columns.push(column);
    }
    for names in [&clustering, &partition] {
        seen.clear();
        for name in names {
            ctx.charge_work(1, Utf16::default())?;
            let _quoted = ascii_identifier(name, ctx)?;
            if !seen.insert(name.to_lowercase()) {
                return Err(fail("DELTA_DDL_UNSUPPORTED", "Duplicate layout column"));
            }
            if !field_names.contains(&name.to_lowercase()) {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "Layout column absent from schema",
                ));
            }
            let field = fields
                .iter()
                .find(|field| {
                    member(field, "name")
                        .and_then(|n| match n {
                            N::String(s) => s.to_utf8().ok(),
                            _ => None,
                        })
                        .is_some_and(|n| n.to_lowercase() == name.to_lowercase())
                })
                .unwrap();
            if !matches!(member(field, "type"), Some(N::String(_))) {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "Complex layout columns require a separately qualified profile",
                ));
            }
        }
    }
    let properties = props(definition, ctx)?;
    ctx.charge_work(properties.len(), Utf16::default())?;
    let mut property_sql = Vec::new();
    property_sql
        .try_reserve(properties.len())
        .map_err(|_| fail("LIMIT", "DDL property output allocation refused"))?;
    let allowed = [
        "delta.dataSkippingStatsColumns",
        "delta.targetFileSize",
        "delta.parquet.compression.codec",
        "delta.deletedFileRetentionDuration",
        "delta.logRetentionDuration",
    ];
    for (key, value) in &properties {
        if spark_local
            && ["delta.targetFileSize", "delta.parquet.compression.codec"].contains(&key.as_str())
        {
            continue;
        }
        if !allowed.contains(&key.as_str())
            || !value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_,. -".contains(&b))
        {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Property has no supported literal interpretation",
            ));
        }
        if key == "delta.dataSkippingStatsColumns"
            && value
                .split(',')
                .any(|c| !field_names.contains(&c.to_lowercase()))
        {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Statistics column absent from schema",
            ));
        }
        if key == "delta.targetFileSize"
            && (value.is_empty()
                || value.starts_with('0')
                || value.len() > 16
                || !value.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Invalid file target"));
        }
        if key == "delta.parquet.compression.codec"
            && !([
                "zstd",
                "snappy",
                "gzip",
                "uncompressed",
                "lz4",
                "brotli",
                "lzo",
            ]
            .contains(&value.to_lowercase().as_str()))
        {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Unknown codec"));
        }
        if [
            "delta.deletedFileRetentionDuration",
            "delta.logRetentionDuration",
        ]
        .contains(&key.as_str())
            && !["seconds", "minutes", "hours", "days", "weeks"]
                .iter()
                .any(|unit| {
                    value.strip_prefix("interval ").is_some_and(|r| {
                        r.strip_suffix(&format!(" {unit}")).is_some_and(|n| {
                            (1..=9).contains(&n.len())
                                && n.bytes().all(|b| b.is_ascii_digit())
                                && !n.starts_with('0')
                        })
                    })
                })
        {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Unsupported retention interval",
            ));
        }
        property_sql.push(assembled_text("'", &[key, "'='", value], "", "'", ctx)?);
    }
    let mut sql = String::new();
    emit(&mut sql, "CREATE TABLE ", &mut *ctx)?;
    if let Some(relation) = target_relation {
        emit(&mut sql, relation, ctx)?;
    } else {
        for (index, name) in quoted_names.iter().enumerate() {
            if index != 0 {
                emit(&mut sql, ".", ctx)?;
            }
            emit(&mut sql, name, ctx)?;
        }
    }
    emit(&mut sql, " (\n", ctx)?;
    for (i, column) in columns.iter().enumerate() {
        if i > 0 {
            emit(&mut sql, ",\n", ctx)?;
        }
        emit(&mut sql, column, ctx)?;
    }
    emit(&mut sql, "\n) USING DELTA", ctx)?;
    if !clustering.is_empty() {
        emit(&mut sql, " CLUSTER BY (", ctx)?;
        for (i, name) in clustering.iter().enumerate() {
            if i > 0 {
                emit(&mut sql, ", ", ctx)?;
            }
            emit(&mut sql, &ascii_identifier(name, ctx)?, ctx)?;
        }
        emit(&mut sql, ")", ctx)?;
    }
    if !partition.is_empty() {
        emit(&mut sql, " PARTITIONED BY (", ctx)?;
        for (i, name) in partition.iter().enumerate() {
            if i > 0 {
                emit(&mut sql, ", ", ctx)?;
            }
            emit(&mut sql, &ascii_identifier(name, ctx)?, ctx)?;
        }
        emit(&mut sql, ")", ctx)?;
    }
    if let Some(location) = target_location {
        emit(&mut sql, " LOCATION ", ctx)?;
        emit(&mut sql, location, ctx)?;
    }
    if !property_sql.is_empty() {
        emit(&mut sql, "\nTBLPROPERTIES (", ctx)?;
        for (i, value) in property_sql.iter().enumerate() {
            if i > 0 {
                emit(&mut sql, ",\n", ctx)?;
            }
            emit(&mut sql, value, ctx)?;
        }
        emit(&mut sql, ")", ctx)?;
    }
    emit(&mut sql, ";\n", ctx)?;
    ctx.charge_text(QUALIFICATION.encode_utf16().count(), Utf16::default())?;
    let definition = copy_json(definition, ctx)?;
    Ok(DeltaDdlProposal {
        sql: Utf16::from(sql),
        schema_json: schema.render_compact(ctx)?,
        definition,
        qualification: Utf16::from(QUALIFICATION),
    })
}

/// Generate an ordered, all-or-nothing set of managed CREATE proposals.
pub fn generate_delta_ddl_bundle(
    documents: &Value,
    resources: &DeltaDdlResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let Value::Array(inputs) = documents else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Nonempty table document bundle required",
        ));
    };
    if inputs.is_empty() {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Nonempty table document bundle required",
        ));
    }
    ctx.charge_work(inputs.len(), Utf16::default())?;
    let mut ids: Vec<Utf16> = Vec::new();
    let mut names: Vec<String> = Vec::new();
    let mut proposals = Vec::new();
    ids.try_reserve(inputs.len())
        .map_err(|_| fail("LIMIT", "Bundle ID allocation refused"))?;
    names
        .try_reserve(inputs.len())
        .map_err(|_| fail("LIMIT", "Bundle name allocation refused"))?;
    proposals
        .try_reserve(inputs.len())
        .map_err(|_| fail("LIMIT", "Bundle proposal allocation refused"))?;

    for document in inputs {
        ctx.charge_work(1, Utf16::default())?;
        let id = match field_value(document, "id") {
            Some(Value::String(id)) => id,
            _ => return Err(fail("DELTA_DDL_INVALID", "Bundle document ID is required")),
        };
        ctx.charge_work(ids.len().saturating_add(names.len()), Utf16::default())?;
        if ids.iter().any(|prior| prior == id) {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Duplicate document identity in bundle",
            ));
        }
        let proposal = generate_delta_ddl_document(document, resources, ctx)?;
        let table_name = definition_strings(&proposal.definition, "name", ctx)?;
        if table_name.len() != 3 {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Bundle tables require explicit catalog, schema and table names",
            ));
        }
        let normalized_units = table_name
            .iter()
            .map(|part| part.len())
            .sum::<usize>()
            .saturating_add(table_name.len().saturating_sub(1));
        ctx.charge_text(normalized_units, Utf16::default())?;
        let mut normalized = String::new();
        normalized
            .try_reserve(normalized_units)
            .map_err(|_| fail("LIMIT", "Bundle name allocation refused"))?;
        for (index, part) in table_name.iter().enumerate() {
            if index != 0 {
                normalized.push('.');
            }
            normalized.extend(part.bytes().map(|byte| byte.to_ascii_lowercase() as char));
        }
        if names.iter().any(|prior| prior == &normalized) {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Duplicate qualified table name in bundle",
            ));
        }
        ctx.charge_text(id.len(), Utf16::default())?;
        ids.push(id.clone());
        ctx.charge_text(id.len(), Utf16::default())?;
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_work(5, Utf16::default())?;
        ctx.charge_text(normalized.encode_utf16().count(), Utf16::default())?;
        names.push(normalized);
        proposals.push((id.clone(), proposal));
    }

    let mut total_sql_units = proposals.len().saturating_sub(1);
    for (_, proposal) in &proposals {
        total_sql_units = total_sql_units.saturating_add(proposal.sql.len());
    }
    ctx.charge_text(total_sql_units, Utf16::default())?;
    let mut sql = String::new();
    sql.try_reserve(total_sql_units)
        .map_err(|_| fail("LIMIT", "Bundle SQL allocation refused"))?;
    let mut table_rows = Vec::new();
    table_rows
        .try_reserve(proposals.len())
        .map_err(|_| fail("LIMIT", "Bundle table output allocation refused"))?;
    for (index, (id, proposal)) in proposals.into_iter().enumerate() {
        if index != 0 {
            sql.push('\n');
        }
        let sql_text = proposal
            .sql
            .to_utf8()
            .map_err(|_| fail("DELTA_DDL_UNSUPPORTED", "Generated SQL is not UTF-8"))?;
        sql.push_str(&sql_text);
        table_rows.push(object(vec![
            ("documentId", Value::String(id)),
            ("sql", Value::String(proposal.sql)),
            ("definition", proposal.definition),
            ("schemaJson", Value::String(proposal.schema_json)),
            ("qualification", Value::String(proposal.qualification)),
        ]));
    }
    let qualification = "Complete ordered managed Delta CREATE proposal; generation is all-or-nothing, database application is not atomic. No application, migration, dependency ordering, relationship enforcement or native admission.";
    ctx.charge_text(qualification.encode_utf16().count(), Utf16::default())?;
    Ok(object(vec![
        ("sql", Value::String(Utf16::from(sql))),
        ("tables", Value::Array(table_rows)),
        ("qualification", Value::String(Utf16::from(qualification))),
    ]))
}

/// Produce the explicitly local Spark Delta 4 CREATE/config proposal.
pub fn realize_spark_delta4_ddl_document(
    document: &Value,
    target: &Value,
    resources: &DeltaDdlResources,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    // Validate the complete managed document first, including representational closure.
    let validation = validate_document(document, resources, ctx)?;
    reject_representation_warnings(&validation)?;
    if !validation.valid {
        return Err(EngineError::new(
            "DELTA_DDL_INVALID",
            validation
                .diagnostics
                .first()
                .map(|d| d.path.clone())
                .unwrap_or_default(),
            "Delta definition document is invalid",
        ));
    }
    check_managed_delta_document(document, ctx)?;
    let Value::Object(target_fields) = target else {
        return Err(fail("DELTA_DDL_UNSUPPORTED", "target must be an object"));
    };
    check_value_keys(
        target_fields,
        &["kind", "relation", "location", "path"],
        ctx,
    )?;
    let kind_value = field_value(target, "kind")
        .and_then(|v| match v {
            Value::String(s) => Some(s),
            _ => None,
        })
        .ok_or_else(|| {
            fail(
                "DELTA_DDL_UNSUPPORTED",
                "target.kind must be a supported local Delta binding",
            )
        })?;
    ctx.charge_text(kind_value.len(), Utf16::default())?;
    let kind = kind_value.to_utf8().map_err(|_| {
        fail(
            "DELTA_DDL_UNSUPPORTED",
            "target.kind must be well-formed text",
        )
    })?;

    let (identity, target_output, relation_sql, location_sql) = if kind == "relation" {
        check_value_keys(target_fields, &["kind", "relation", "location"], ctx)?;
        let relation = match field_value(target, "relation") {
            Some(Value::Array(parts)) if (1..=3).contains(&parts.len()) => parts,
            _ => {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "target.relation must have one to three identifier components",
                ))
            }
        };
        ctx.charge_work(relation.len(), Utf16::default())?;
        let mut relation_strings = Vec::new();
        relation_strings
            .try_reserve(relation.len())
            .map_err(|_| fail("LIMIT", "Target relation allocation refused"))?;
        let mut quoted = Vec::new();
        quoted
            .try_reserve(relation.len())
            .map_err(|_| fail("LIMIT", "Target relation SQL allocation refused"))?;
        for part in relation {
            let Value::String(part) = part else {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "target.relation components must be strings",
                ));
            };
            let part = utf8(part, "Target relation", ctx)?;
            quoted.push(ascii_identifier(&part, ctx)?);
            ctx.charge_text(part.encode_utf16().count(), Utf16::default())?;
            relation_strings.push(Value::String(Utf16::from(part)));
        }
        let location = match field_value(target, "location") {
            Some(Value::String(location)) => utf8(location, "Target location", ctx)?,
            _ => {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "target.location must be a local absolute path",
                ))
            }
        };
        let location_sql = local_location(&location, ctx)?;
        ctx.charge_text(location.encode_utf16().count(), Utf16::default())?;
        let identity = object(vec![
            ("profile", Value::string_utf8("spark-delta4/0.1")),
            ("kind", Value::string_utf8("relation")),
            ("relation", Value::Array(relation_strings)),
            ("location", Value::String(Utf16::from(location))),
        ]);
        let output = copy_json(&identity, ctx)?;
        let relation_units = quoted
            .iter()
            .map(|part| part.encode_utf16().count())
            .sum::<usize>()
            .saturating_add(quoted.len().saturating_sub(1));
        let relation_bytes = quoted
            .iter()
            .map(String::len)
            .sum::<usize>()
            .saturating_add(quoted.len().saturating_sub(1));
        ctx.charge_text(relation_units, Utf16::default())?;
        let mut relation_sql = String::new();
        relation_sql
            .try_reserve(relation_bytes)
            .map_err(|_| fail("LIMIT", "Target relation SQL allocation refused"))?;
        for (index, part) in quoted.iter().enumerate() {
            if index != 0 {
                relation_sql.push('.');
            }
            relation_sql.push_str(part);
        }
        (identity, output, relation_sql, Some(location_sql))
    } else if kind == "delta-path" {
        check_value_keys(target_fields, &["kind", "path"], ctx)?;
        let path = match field_value(target, "path") {
            Some(Value::String(path)) => utf8(path, "Target path", ctx)?,
            _ => {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "target.path must be a local absolute path",
                ))
            }
        };
        let sql_path = local_delta_path(&path, ctx)?;
        ctx.charge_text(path.encode_utf16().count(), Utf16::default())?;
        let identity = object(vec![
            ("profile", Value::string_utf8("spark-delta4/0.1")),
            ("kind", Value::string_utf8("delta-path")),
            ("path", Value::String(Utf16::from(path))),
        ]);
        let output = copy_json(&identity, ctx)?;
        let mut relation_sql = String::new();
        append_text(&mut relation_sql, "delta.", ctx)?;
        append_text(&mut relation_sql, &sql_path, ctx)?;
        (identity, output, relation_sql, None)
    } else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "target.kind must be a supported local Delta binding",
        ));
    };

    let definition = field_value(document, "extensions")
        .and_then(|v| field_value(v, DELTA_DEFINITION_EXT))
        .ok_or_else(|| fail("DELTA_DDL_INVALID", "Missing Delta definition payload"))?;
    let schema = delta_schema::get_delta_node(document, &Utf16::default(), &resources.schema, ctx)?;
    let proposal = generate_delta_ddl_profile(
        &schema,
        definition,
        true,
        Some(&relation_sql),
        location_sql.as_deref(),
        ctx,
    )?;
    let definition_value = &proposal.definition;
    let cluster = definition_strings(definition_value, "clusterBy", ctx)?;
    let partition = definition_strings(definition_value, "partitionBy", ctx)?;
    let properties = props(definition_value, ctx)?;
    let mut dispositions = Vec::new();
    dispositions
        .try_reserve(2usize.saturating_add(properties.len().max(1)))
        .map_err(|_| fail("LIMIT", "Disposition output allocation refused"))?;
    push_layout_disposition(
        &mut dispositions,
        "clusterBy",
        &cluster,
        "Authored order is emitted as local Delta CLUSTER BY SQL.",
        "No columns were authored for this layout choice.",
        ctx,
    )?;
    push_layout_disposition(
        &mut dispositions,
        "partitionBy",
        &partition,
        "Authored order is emitted as local Delta PARTITIONED BY SQL.",
        "No columns were authored for this layout choice.",
        ctx,
    )?;
    let mut ordered_properties = properties;
    ordered_properties.sort_by(|a, b| a.0.cmp(&b.0));
    let mut writer_settings = Vec::new();
    writer_settings
        .try_reserve(1)
        .map_err(|_| fail("LIMIT", "Writer setting allocation refused"))?;
    if ordered_properties.is_empty() {
        ctx.charge_work(5, Utf16::default())?;
        ctx.charge_text(
            "/extensions/umf.delta.definition/properties"
                .encode_utf16()
                .count(),
            Utf16::default(),
        )?;
        ctx.charge_text("none-authored".len(), Utf16::default())?;
        ctx.charge_text("No table properties were authored.".len(), Utf16::default())?;
        dispositions.push(object(vec![
            (
                "sourcePointer",
                Value::string_utf8("/extensions/umf.delta.definition/properties"),
            ),
            ("authoredValue", Value::Object(Vec::new())),
            ("outcome", Value::string_utf8("none-authored")),
            (
                "explanation",
                Value::string_utf8("No table properties were authored."),
            ),
        ]));
    }
    for (key, value) in ordered_properties {
        let path = property_pointer(&key, ctx)?;
        if key == "delta.targetFileSize" {
            push_property_disposition(&mut dispositions, path, value, "unrealized-performance-hint", "Retained the exact authored byte-size target; local Delta 4 realization does not apply or guarantee this file size.", ctx)?;
        } else if key == "delta.parquet.compression.codec" {
            if !value.eq_ignore_ascii_case("zstd") {
                return Err(fail(
                    "DELTA_DDL_UNSUPPORTED",
                    "Spark Delta 4 writer mapping is not qualified for codec",
                ));
            }
            ctx.charge_work(5, Utf16::default())?;
            writer_settings.push(object(vec![
                (
                    "key",
                    Value::string_utf8("spark.sql.parquet.compression.codec"),
                ),
                ("value", Value::string_utf8("zstd")),
            ]));
            push_property_disposition(&mut dispositions, path, value, "writer-setting", "Translated to required Spark writer setting spark.sql.parquet.compression.codec=zstd; this proposal does not execute the setting.", ctx)?;
        } else {
            push_property_disposition(
                &mut dispositions,
                path,
                value,
                "sql",
                "Authored property is preserved in local Delta table property SQL.",
                ctx,
            )?;
        }
    }
    let digest_identity = canonical_hash(&identity, ctx)?;
    let digest_source = canonical_hash(document, ctx)?;
    let digest_schema = hash_utf16(&proposal.schema_json, ctx)?;
    let qualification = "Pure local Spark Delta 4 DDL/config proposal only; no Spark execution, Delta protocol admission, clustering/statistics effectiveness, target-file-size realization, UC behavior or managed Databricks behavior is established.";
    ctx.charge_text(qualification.encode_utf16().count(), Utf16::default())?;
    let mut target_output_fields = match target_output {
        Value::Object(fields) => fields,
        _ => return Err(fail("LIMIT", "Target identity projection failed")),
    };
    target_output_fields
        .try_reserve(1)
        .map_err(|_| fail("LIMIT", "Target identity output allocation refused"))?;
    target_output_fields.push((
        Utf16::from("identitySha256"),
        Value::String(digest_identity),
    ));
    ctx.charge_work(
        11usize
            .saturating_add(writer_settings.len())
            .saturating_add(dispositions.len()),
        Utf16::default(),
    )?;
    Ok(object(vec![
        ("targetProfile", Value::string_utf8("spark-delta4/0.1")),
        (
            "realizationProfile",
            Value::string_utf8("umf.delta.spark-realization/0.1.0"),
        ),
        ("target", Value::Object(target_output_fields)),
        ("sql", Value::String(proposal.sql)),
        ("definition", proposal.definition),
        ("schemaJson", Value::String(proposal.schema_json)),
        ("sourceSha256", Value::String(digest_source)),
        ("schemaSha256", Value::String(digest_schema)),
        ("writerSettings", Value::Array(writer_settings)),
        ("dispositions", Value::Array(dispositions)),
        ("qualification", Value::String(Utf16::from(qualification))),
    ]))
}

fn check_value_keys(
    fields: &[(Utf16, Value)],
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let work = fields.len().saturating_mul(fields.len());
    ctx.charge_work(work, Utf16::default())?;
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|name| key == &Utf16::from(*name))
            || fields[..index].iter().any(|(prior, _)| prior == key)
        {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Unknown or duplicate target content",
            ));
        }
    }
    Ok(())
}

fn check_managed_delta_document(
    document: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    check_document_object(
        document,
        &["umf", "id", "vocabularies", "modules", "extensions"],
        ctx,
    )?;
    if field_value(document, "umf") != Some(&Value::string_utf8("0.10.0")) {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "This DDL profile requires core 0.10.0",
        ));
    }

    let vocabularies = field_value(document, "vocabularies").ok_or_else(|| {
        fail(
            "DELTA_DDL_UNSUPPORTED",
            "Vocabulary declarations are required",
        )
    })?;
    check_document_object(vocabularies, &[DELTA_EXT, DELTA_DEFINITION_EXT], ctx)?;
    for (extension, version) in [(DELTA_EXT, "0.1.0"), (DELTA_DEFINITION_EXT, "0.1.0")] {
        let declaration = field_value(vocabularies, extension).ok_or_else(|| {
            fail(
                "DELTA_DDL_UNSUPPORTED",
                "Required vocabulary declaration is missing",
            )
        })?;
        check_document_object(declaration, &["version"], ctx)?;
        if field_value(declaration, "version") != Some(&Value::string_utf8(version)) {
            return Err(fail("DELTA_DDL_UNSUPPORTED", "Unknown vocabulary version"));
        }
    }

    if let Some(extensions) = field_value(document, "extensions") {
        check_document_object(extensions, &[DELTA_DEFINITION_EXT], ctx)?;
    }
    let modules = match field_value(document, "modules") {
        Some(Value::Array(modules)) if modules.len() == 1 => modules,
        _ => {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "One Delta schema module is required",
            ))
        }
    };
    let module = &modules[0];
    check_document_object(module, &["id", "namespace", "elements"], ctx)?;
    if field_value(module, "id") != Some(&Value::string_utf8("schema"))
        || field_value(module, "namespace") != Some(&Value::string_utf8(""))
    {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Unexpected Delta schema module identity",
        ));
    }
    let elements = match field_value(module, "elements") {
        Some(Value::Array(elements)) if elements.len() == 1 => elements,
        _ => {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "One Delta schema element is required",
            ))
        }
    };
    let element = &elements[0];
    check_document_object(element, &["id", "extensions"], ctx)?;
    if field_value(element, "id") != Some(&Value::string_utf8("schema")) {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Unexpected Delta schema element identity",
        ));
    }
    let element_extensions = field_value(element, "extensions").ok_or_else(|| {
        fail(
            "DELTA_DDL_UNSUPPORTED",
            "Delta schema element extension is missing",
        )
    })?;
    check_document_object(element_extensions, &[DELTA_EXT], ctx)?;
    Ok(())
}

fn check_document_object(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "Unexpected document representation",
        ));
    };
    let work = fields.len().saturating_mul(fields.len());
    ctx.charge_work(work, Utf16::default())?;
    for (index, (key, _)) in fields.iter().enumerate() {
        if !allowed.iter().any(|name| key == &Utf16::from(*name))
            || fields[..index].iter().any(|(prior, _)| prior == key)
        {
            return Err(fail(
                "DELTA_DDL_UNSUPPORTED",
                "Unknown or duplicate document content would be discarded",
            ));
        }
    }
    Ok(())
}

fn validate_local_location(path: &str, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    ctx.charge_text(path.encode_utf16().count(), Utf16::default())?;
    if !path.starts_with('/')
        || path == "/"
        || path.contains("//")
        || path.ends_with('/')
        || path.chars().any(|ch| (ch as u32) < 0x20 || ch == '\u{7f}')
        || path
            .split('/')
            .skip(1)
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(fail(
            "DELTA_DDL_UNSUPPORTED",
            "target location must be a normalized absolute local POSIX path",
        ));
    }
    Ok(())
}

fn local_location(path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    validate_local_location(path, ctx)?;
    let size = path
        .chars()
        .map(|ch| {
            if ch == '\\' || ch == '\'' {
                2
            } else {
                ch.len_utf16()
            }
        })
        .sum::<usize>()
        .saturating_add(2);
    ctx.charge_text(size, Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(path.len().saturating_mul(2).saturating_add(2))
        .map_err(|_| fail("LIMIT", "Target location SQL allocation refused"))?;
    output.push('\'');
    for ch in path.chars() {
        if ch == '\\' || ch == '\'' {
            output.push('\\');
        }
        output.push(ch);
    }
    output.push('\'');
    Ok(output)
}

fn local_delta_path(path: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    validate_local_location(path, ctx)?;
    let size = path
        .chars()
        .map(|ch| if ch == '`' { 2 } else { ch.len_utf16() })
        .sum::<usize>()
        .saturating_add(2);
    ctx.charge_text(size, Utf16::default())?;
    let mut output = String::new();
    output
        .try_reserve(path.len().saturating_mul(2).saturating_add(2))
        .map_err(|_| fail("LIMIT", "Target path SQL allocation refused"))?;
    output.push('`');
    for ch in path.chars() {
        output.push(ch);
        if ch == '`' {
            output.push('`');
        }
    }
    output.push('`');
    Ok(output)
}

fn push_layout_disposition(
    out: &mut Vec<Value>,
    key: &str,
    values: &[String],
    present: &str,
    absent: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let pointer = layout_pointer(key, ctx)?;
    let mut items = Vec::new();
    ctx.charge_work(values.len(), Utf16::default())?;
    items
        .try_reserve(values.len())
        .map_err(|_| fail("LIMIT", "Layout disposition allocation refused"))?;
    for value in values {
        ctx.charge_text(value.encode_utf16().count(), Utf16::default())?;
        items.push(Value::String(Utf16::from(value.as_str())));
    }
    let explanation = if values.is_empty() { absent } else { present };
    ctx.charge_text(explanation.encode_utf16().count(), Utf16::default())?;
    ctx.charge_work(5, Utf16::default())?;
    out.push(object(vec![
        ("sourcePointer", Value::String(Utf16::from(pointer))),
        ("authoredValue", Value::Array(items)),
        (
            "outcome",
            Value::string_utf8(if values.is_empty() {
                "none-authored"
            } else {
                "sql"
            }),
        ),
        ("explanation", Value::string_utf8(explanation)),
    ]));
    Ok(())
}

fn layout_pointer(key: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    const PREFIX: &str = "/extensions/umf.delta.definition/";
    let units = PREFIX
        .encode_utf16()
        .count()
        .saturating_add(key.encode_utf16().count());
    ctx.charge_text(units, Utf16::default())?;
    let mut pointer = String::new();
    pointer
        .try_reserve(PREFIX.len().saturating_add(key.len()))
        .map_err(|_| fail("LIMIT", "Disposition path allocation refused"))?;
    pointer.push_str(PREFIX);
    pointer.push_str(key);
    Ok(pointer)
}

fn property_pointer(key: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    const PREFIX: &str = "/extensions/umf.delta.definition/properties/";
    let units = PREFIX
        .encode_utf16()
        .count()
        .saturating_add(key.encode_utf16().count());
    ctx.charge_text(units, Utf16::default())?;
    let mut pointer = String::new();
    pointer
        .try_reserve(PREFIX.len().saturating_add(key.len()))
        .map_err(|_| fail("LIMIT", "Disposition path allocation refused"))?;
    pointer.push_str(PREFIX);
    pointer.push_str(key);
    Ok(pointer)
}

fn push_property_disposition(
    out: &mut Vec<Value>,
    pointer: String,
    authored_value: String,
    outcome: &str,
    explanation: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(8, Utf16::default())?;
    ctx.charge_text(authored_value.encode_utf16().count(), Utf16::default())?;
    ctx.charge_text(outcome.encode_utf16().count(), Utf16::default())?;
    ctx.charge_text(explanation.encode_utf16().count(), Utf16::default())?;
    out.push(object(vec![
        ("sourcePointer", Value::String(Utf16::from(pointer))),
        ("authoredValue", Value::String(Utf16::from(authored_value))),
        ("outcome", Value::string_utf8(outcome)),
        ("explanation", Value::string_utf8(explanation)),
    ]));
    Ok(())
}

fn canonical_hash(value: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut text = String::new();
    canonical_write(value, &mut text, ctx, 0)?;
    ctx.charge_work(text.len(), Utf16::default())?;
    let digest = Sha256::digest(text.as_bytes());
    hex_digest(&digest, ctx)
}

fn hash_utf16(value: &Utf16, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let text = utf8(value, "Hash source", ctx)?;
    ctx.charge_work(text.len(), Utf16::default())?;
    let digest = Sha256::digest(text.as_bytes());
    hex_digest(&digest, ctx)
}

fn hex_digest(digest: &[u8], ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    ctx.charge_work(digest.len(), Utf16::default())?;
    ctx.charge_text(digest.len().saturating_mul(2), Utf16::default())?;
    let mut output = Vec::new();
    output
        .try_reserve(digest.len().saturating_mul(2))
        .map_err(|_| fail("LIMIT", "Digest allocation refused"))?;
    for byte in digest {
        output.push(HEX[(byte >> 4) as usize]);
        output.push(HEX[(byte & 15) as usize]);
    }
    let output =
        String::from_utf8(output).map_err(|_| fail("LIMIT", "Digest formatting failed"))?;
    Ok(Utf16::from(output))
}

fn canonical_write(
    value: &Value,
    out: &mut String,
    ctx: &mut Context<'_>,
    depth: usize,
) -> Result<(), EngineError> {
    if depth > 256 {
        return Err(fail("LIMIT", "Canonical hash depth exceeded"));
    }
    ctx.charge_work(1, Utf16::default())?;
    match value {
        Value::Null => append_text(out, "null", ctx),
        Value::Bool(true) => append_text(out, "true", ctx),
        Value::Bool(false) => append_text(out, "false", ctx),
        Value::Number(number) => {
            append_text(out, crate::value::ecma_number_to_string(*number), ctx)
        }
        Value::String(value) => append_json_string(out, value, ctx),
        Value::Array(items) => {
            append_text(out, "[", ctx)?;
            ctx.charge_work(items.len(), Utf16::default())?;
            for (index, item) in items.iter().enumerate() {
                if index != 0 {
                    append_text(out, ",", ctx)?;
                }
                canonical_write(item, out, ctx, depth + 1)?;
            }
            append_text(out, "]", ctx)
        }
        Value::Object(fields) => {
            ctx.charge_work(fields.len().saturating_mul(fields.len()), Utf16::default())?;
            let mut sorted = Vec::new();
            sorted
                .try_reserve(fields.len())
                .map_err(|_| fail("LIMIT", "Canonical key allocation refused"))?;
            sorted.extend(fields.iter());
            sorted.sort_by(|left, right| left.0.cmp(&right.0));
            for pair in sorted.windows(2) {
                if pair[0].0 == pair[1].0 {
                    return Err(fail(
                        "DUPLICATE_KEY",
                        "Duplicate key cannot be hashed canonically",
                    ));
                }
            }
            append_text(out, "{", ctx)?;
            for (index, (key, child)) in sorted.iter().enumerate() {
                if index != 0 {
                    append_text(out, ",", ctx)?;
                }
                append_json_string(out, key, ctx)?;
                append_text(out, ":", ctx)?;
                canonical_write(child, out, ctx, depth + 1)?;
            }
            append_text(out, "}", ctx)
        }
    }
}

fn append_text(
    out: &mut String,
    value: impl AsRef<str>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let value = value.as_ref();
    ctx.charge_text(value.encode_utf16().count(), Utf16::default())?;
    out.try_reserve(value.len())
        .map_err(|_| fail("LIMIT", "Canonical text allocation refused"))?;
    out.push_str(value);
    Ok(())
}

fn append_json_string(
    out: &mut String,
    value: &Utf16,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(value.len(), Utf16::default())?;
    let mut units = 2usize;
    let mut bytes = 2usize;
    for decoded in std::char::decode_utf16(value.units().iter().copied()) {
        let ch = decoded.map_err(|_| {
            fail(
                "DELTA_DDL_UNSUPPORTED",
                "Canonical hashing requires well-formed Unicode",
            )
        })?;
        units = units.saturating_add(match ch {
            '"' | '\\' | '\u{8}' | '\u{9}' | '\u{a}' | '\u{c}' | '\u{d}' => 2,
            ch if (ch as u32) < 0x20 => 6,
            ch => ch.len_utf16(),
        });
        bytes = bytes.saturating_add(match ch {
            '"' | '\\' | '\u{8}' | '\u{9}' | '\u{a}' | '\u{c}' | '\u{d}' => 2,
            ch if (ch as u32) < 0x20 => 6,
            ch => ch.len_utf8(),
        });
    }
    ctx.charge_text(units, Utf16::default())?;
    let mut token = String::new();
    token
        .try_reserve(bytes)
        .map_err(|_| fail("LIMIT", "Canonical string allocation refused"))?;
    token.push('"');
    for decoded in std::char::decode_utf16(value.units().iter().copied()) {
        let ch = decoded.map_err(|_| {
            fail(
                "DELTA_DDL_UNSUPPORTED",
                "Canonical hashing requires well-formed Unicode",
            )
        })?;
        match ch {
            '"' => token.push_str("\\\""),
            '\\' => token.push_str("\\\\"),
            '\u{8}' => token.push_str("\\b"),
            '\u{9}' => token.push_str("\\t"),
            '\u{a}' => token.push_str("\\n"),
            '\u{c}' => token.push_str("\\f"),
            '\u{d}' => token.push_str("\\r"),
            ch if (ch as u32) < 0x20 => {
                const HEX: &[u8; 16] = b"0123456789abcdef";
                let code = ch as usize;
                token.push_str("\\u00");
                token.push(HEX[(code >> 4) & 15] as char);
                token.push(HEX[code & 15] as char);
            }
            ch => token.push(ch),
        }
    }
    token.push('"');
    out.try_reserve(token.len())
        .map_err(|_| fail("LIMIT", "Canonical output allocation refused"))?;
    out.push_str(&token);
    Ok(())
}

/// Native validator hook for the definition payload. Unknown payload keys are
/// retained by UMF structural validation and the DDL generator refuses them.
pub fn inspect_delta_definition_payload(
    payload: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    let mut diagnostics = Vec::new();
    let Value::Object(fields) = payload else {
        return Ok(diagnostics);
    };
    const KNOWN: &[&str] = &["profile", "name", "clusterBy", "partitionBy", "properties"];
    for (key, _) in fields {
        ctx.charge_work(1, Utf16::default())?;
        ctx.charge_text(key.len(), Utf16::default())?;
        if key
            .to_utf8()
            .ok()
            .is_none_or(|k| !KNOWN.contains(&k.as_str()))
        {
            ctx.charge_text(key.len(), Utf16::default())?;
            diagnostics.push(crate::error::Diagnostic {
                code: Utf16::from("DELTA_DDL_UNKNOWN"),
                path: key.clone(),
                python_source_path: false,
                message: Utf16::from(
                    "Unknown definition content is retained and blocks SQL generation",
                ),
                severity: crate::error::Severity::Warning,
                python_text_origin: None,
            });
        }
    }
    Ok(diagnostics)
}

#[cfg(test)]
mod tests {
    use super::{
        define_delta_table, generate_delta_ddl, generate_delta_ddl_document, DeltaDdlResources,
    };
    use crate::delta_schema;
    use crate::{
        context::Context,
        native_json::NativeJsonTree,
        value::{Utf16, Value},
    };

    fn schema(source: &str, ctx: &mut Context<'_>) -> NativeJsonTree {
        NativeJsonTree::parse_json(&source.encode_utf16().collect::<Vec<_>>(), ctx).unwrap()
    }

    fn definition() -> Value {
        Value::Object(vec![
            (
                Utf16::from("profile"),
                Value::string_utf8("databricks-managed-delta/0.1"),
            ),
            (
                Utf16::from("name"),
                Value::Array(vec![
                    Value::string_utf8("catalog"),
                    Value::string_utf8("schema"),
                    Value::string_utf8("items"),
                ]),
            ),
            (
                Utf16::from("clusterBy"),
                Value::Array(vec![Value::string_utf8("id")]),
            ),
            (Utf16::from("partitionBy"), Value::Array(vec![])),
            (
                Utf16::from("properties"),
                Value::Object(vec![(
                    Utf16::from("delta.targetFileSize"),
                    Value::string_utf8("67108864"),
                )]),
            ),
        ])
    }

    #[test]
    fn emits_managed_create_from_exact_delta_schema_tree() {
        let mut ctx = Context::ordinary();
        let schema = schema(
            r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}},{"name":"caption","type":"string","nullable":true,"metadata":{}}]}"#,
            &mut ctx,
        );
        let result = generate_delta_ddl(&schema, &definition(), &mut ctx).unwrap();
        assert_eq!(result.sql.to_utf8().unwrap(), "CREATE TABLE `catalog`.`schema`.`items` (\n  `id` BIGINT NOT NULL,\n  `caption` STRING\n) USING DELTA CLUSTER BY (`id`)\nTBLPROPERTIES ('delta.targetFileSize'='67108864');\n");
    }

    #[test]
    fn unknown_definition_content_refuses_generation() {
        let mut ctx = Context::ordinary();
        let schema = schema(
            r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#,
            &mut ctx,
        );
        let mut definition = definition();
        if let Value::Object(fields) = &mut definition {
            fields.push((Utf16::from("future"), Value::string_utf8("retain")));
        }
        assert_eq!(
            generate_delta_ddl(&schema, &definition, &mut ctx)
                .unwrap_err()
                .code,
            "DELTA_DDL_UNSUPPORTED"
        );
    }

    #[test]
    fn document_flow_preserves_schema_tree_and_generates_ddl() {
        let mut ctx = Context::ordinary();
        let resources = DeltaDdlResources::new(&mut ctx).unwrap();
        let source = r#"{
          "type": "struct",
          "fields": [{"name":"id","type":"long","nullable":false,"metadata":{}}]
        }"#;
        let id = Utf16::from("table/orders");
        let document = define_delta_table(
            &source.encode_utf16().collect::<Vec<_>>(),
            &definition(),
            &id,
            &resources,
            &mut ctx,
        )
        .unwrap();
        assert_eq!(
            delta_schema::export_delta_schema(&document, &resources.schema, &mut ctx)
                .unwrap()
                .to_utf8()
                .unwrap(),
            r#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#
        );
        let proposal = generate_delta_ddl_document(&document, &resources, &mut ctx).unwrap();
        assert!(proposal
            .sql
            .to_utf8()
            .unwrap()
            .contains("CREATE TABLE `catalog`.`schema`.`items`"));
        assert_eq!(proposal.definition, definition());
    }

    #[test]
    fn document_flow_refuses_unknown_definition_without_losing_it() {
        let mut ctx = Context::ordinary();
        let resources = DeltaDdlResources::new(&mut ctx).unwrap();
        let mut authored = definition();
        if let Value::Object(fields) = &mut authored {
            fields.push((Utf16::from("futureMeaning"), Value::string_utf8("retain")));
        }
        let error = define_delta_table(
            br#"{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}"#
                .iter()
                .map(|byte| *byte as u16)
                .collect::<Vec<_>>()
                .as_slice(),
            &authored,
            &Utf16::from("table/orders"),
            &resources,
            &mut ctx,
        )
        .unwrap_err();
        assert_eq!(error.code, "DELTA_DDL_UNSUPPORTED");
    }
}
