use super::codec::*;
use super::common::*;
use crate::actions::inspect_document;
use crate::canonical::sha256_source_text;
use crate::resources::CodegenEngine;
use crate::value::read_source_value;
use umf_core::literal::{literal_errors, literal_identity};
use umf_core::{serialization::Format, Context, EngineError, Utf16, Value};

impl CodegenEngine<'_> {
    pub fn admit_generated_record_values(
        &self,
        request: &Value,
        ctx: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let mut node_count = 0;
        let mut estimated_bytes = 0;
        check_tree(request, 0, &mut node_count, &mut estimated_bytes, ctx)?;
        let _admitted_request = umf_core::copy_json(request, ctx)?;
        exact_object(request, &["source", "model", "record", "values"], "")?;
        let source = get(request, "source").ok_or_else(|| invalid("/source"))?;
        exact_object(source, &["mediaType", "utf8", "sha256"], "/source")?;
        if owned_text(
            get(source, "mediaType").ok_or_else(|| invalid("/source/mediaType"))?,
            "/source/mediaType",
        )? != "application/json"
        {
            return Err(invalid("/source/mediaType"));
        }
        let source_text = owned_text(
            get(source, "utf8").ok_or_else(|| invalid("/source/utf8"))?,
            "/source/utf8",
        )?;
        if source_text.len() > MAX_ARTIFACT_BYTES {
            return Err(EngineError::new(
                "LIMIT",
                Utf16::from("/source/utf8"),
                "Source artifact exceeds 1 MiB",
            ));
        }
        let digest = hash_hex(&sha256_source_text(&Utf16::from(source_text.clone()), ctx)?);
        if owned_text(
            get(source, "sha256").ok_or_else(|| invalid("/source/sha256"))?,
            "/source/sha256",
        )? != digest
        {
            return Err(integrity("/source/sha256"));
        }
        let model = get(request, "model").ok_or_else(|| invalid("/model"))?;
        exact_object(
            model,
            &["documentId", "revision", "umfVersion", "sha256"],
            "/model",
        )?;
        if owned_text(
            get(model, "sha256").ok_or_else(|| invalid("/model/sha256"))?,
            "/model/sha256",
        )? != digest
            || owned_text(
                get(model, "umfVersion").ok_or_else(|| invalid("/model/umfVersion"))?,
                "/model/umfVersion",
            )? != "0.10.0"
        {
            return Err(integrity("/model"));
        }
        for name in ["documentId", "revision"] {
            let value = owned_text(get(model, name).ok_or_else(|| invalid("/model"))?, "/model")?;
            if value.is_empty() || value.encode_utf16().count() > 256 {
                return Err(invalid("/model"));
            }
        }
        let record_ref = get(request, "record").ok_or_else(|| invalid("/record"))?;
        exact_object(record_ref, &["module", "element"], "/record")?;
        let module_id = bounded_identifier(
            get(record_ref, "module").ok_or_else(|| invalid("/record/module"))?,
            "/record/module",
        )?;
        let record_id = bounded_identifier(
            get(record_ref, "element").ok_or_else(|| invalid("/record/element"))?,
            "/record/element",
        )?;
        let document = read_source_value(&Utf16::from(source_text), Format::Json, ctx)?;
        let mut document_nodes = 0;
        let mut document_bytes = 0;
        check_tree(&document, 0, &mut document_nodes, &mut document_bytes, ctx)?;
        if bounded_identifier(
            get(&document, "id").ok_or_else(|| invalid("/source/id"))?,
            "/source/id",
        )? != bounded_identifier(
            get(model, "documentId").ok_or_else(|| invalid("/model/documentId"))?,
            "/model/documentId",
        )? {
            return Err(integrity("/model/documentId"));
        }
        let inspection = inspect_document(&document, self.resources(), None, ctx)?;
        if !inspection.validation.valid {
            return Err(invalid("/source"));
        }
        let record_shape = super::record_shape::select_record(&document, &module_id)?;
        if record_shape.record_id != record_id {
            return Err(unsupported("/record"));
        }
        let key_id = record_shape.key_id;
        let key_field = record_shape.key_field;
        let value_fields = record_shape.members;
        let expected_ids = value_fields
            .iter()
            .map(|field| {
                let (field_module, element) = field_identity(field)?;
                if field_module != module_id {
                    return Err(unsupported("/record/members"));
                }
                Ok(element)
            })
            .collect::<Result<Vec<_>, EngineError>>()?;
        let supplied = string_map(
            get(request, "values").ok_or_else(|| invalid("/values"))?,
            &expected_ids,
            "/values",
        )?;
        let map = supplied
            .into_iter()
            .collect::<std::collections::BTreeMap<_, _>>();
        let mut output_values = Vec::new();
        let mut key_text = None;
        for field_ref in &value_fields {
            let (_, element) = field_identity(field_ref)?;
            let field = require_supported_string_field(&document, field_ref, "/record/values")?;
            let value = map.get(&element).ok_or_else(|| invalid("/values"))?;
            let literal = if same_ref(field_ref, &key_field) {
                key_text = Some(value.clone());
                admit_key_value(
                    &document,
                    &field,
                    value,
                    self.resources().engine().policy(),
                    ctx,
                )?
            } else {
                admit_string_value(
                    &document,
                    &field,
                    value,
                    self.resources().engine().policy(),
                    ctx,
                )?
            };
            output_values.push(obj(vec![
                ("field", field_ref.clone()),
                ("literal", literal),
                ("native", strval(value)),
            ]));
        }
        let components = array([value_for_field(
            key_text.as_deref().ok_or_else(|| invalid("/values"))?,
        )]);
        let tuple = tuple_hex(key_text.as_deref().unwrap(), ctx)?;
        let entity = obj(vec![
            (
                "key",
                obj(vec![
                    ("module", strval(&module_id)),
                    ("element", strval(&record_id)),
                    ("key", strval(&key_id)),
                ]),
            ),
            ("fields", array([key_field])),
            ("components", components),
            ("profile", strval("umf-key-tuple-v1")),
            ("tupleHex", strval(tuple)),
        ]);
        Ok(obj(vec![
            ("profile", strval("umf.actions.single-record-values/1")),
            ("source", umf_core::copy_json(source, ctx)?),
            ("model", umf_core::copy_json(model, ctx)?),
            ("record", umf_core::copy_json(record_ref, ctx)?),
            ("values", array(output_values)),
            ("entity", entity),
            ("executionVerified", Value::Bool(false)),
        ]))
    }
}

fn admit_string_value(
    document: &Value,
    field: &Value,
    value: &str,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let literal = value_for_field(value);
    let errors = literal_errors(document, field, &literal, true, policy, ctx)?;
    if let Some(error) = errors.first() {
        return Err(EngineError::new(
            error
                .code
                .to_utf8()
                .unwrap_or_else(|_| "ACTION_VALUE".into()),
            error.path.clone(),
            error.message.clone(),
        ));
    }
    Ok(literal)
}

fn admit_key_value(
    document: &Value,
    field: &Value,
    value: &str,
    policy: &umf_core::literal_policy::PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let literal = admit_string_value(document, field, value, policy, ctx)?;
    if literal_identity(field, &literal, policy, ctx)?.is_none() {
        return Err(unsupported("/record/key"));
    }
    Ok(literal)
}
