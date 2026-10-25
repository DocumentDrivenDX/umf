// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in pre-Weft rendering of a deliberately small captured-declaration DTO.
//!
//! This module accepts only the tagged Python capture shape frozen by the R8
//! predecessor packet. It does not load Python declarations, infer authored
//! logical names, compile through Weft, or produce a backend artifact.

use crate::{Context, EngineError, PyText, PythonConsumerValue, Utf16};
use num_traits::ToPrimitive;

pub const PROFILE: &str = "umf-access-logical-render/0.1.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LogicalRenderRefusal {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug)]
pub enum LogicalRenderError {
    Refused(LogicalRenderRefusal),
    Resource(EngineError),
}

impl From<EngineError> for LogicalRenderError {
    fn from(value: EngineError) -> Self {
        Self::Resource(value)
    }
}

#[derive(Clone, Debug)]
struct Field {
    module: String,
    element: String,
    name: Option<String>,
}

#[derive(Clone, Debug)]
struct Record {
    module: String,
    element: String,
    logical_namespace: Option<String>,
    logical_name: Option<String>,
    key: Field,
}

#[derive(Clone, Debug)]
struct Parameter {
    name: String,
    optional: bool,
}

#[derive(Clone, Debug)]
enum Predicate {
    Omitted,
    Equal(Field, String),
}

fn refuse(code: &'static str, message: impl Into<String>) -> LogicalRenderError {
    LogicalRenderError::Refused(LogicalRenderRefusal {
        code,
        message: message.into(),
    })
}

fn invalid() -> LogicalRenderError {
    refuse(
        "CAPTURE_DTO_INVALID",
        "captured variant shape is outside logical renderer profile",
    )
}

fn unsupported(message: &'static str) -> LogicalRenderError {
    refuse("CAPTURE_UNSUPPORTED", message)
}

fn key(name: &str) -> PyText {
    PyText::from_utf8(name)
}

fn object(
    value: &PythonConsumerValue,
) -> Result<&[(PyText, PythonConsumerValue)], LogicalRenderError> {
    match value {
        PythonConsumerValue::Object(fields) => Ok(fields),
        _ => Err(invalid()),
    }
}

fn exact_object<'a>(
    value: &'a PythonConsumerValue,
    expected: &[&str],
) -> Result<&'a [(PyText, PythonConsumerValue)], LogicalRenderError> {
    let fields = object(value)?;
    validate_fields(fields, expected)?;
    Ok(fields)
}

fn validate_fields(
    fields: &[(PyText, PythonConsumerValue)],
    expected: &[&str],
) -> Result<(), LogicalRenderError> {
    if fields.len() != expected.len() {
        return Err(invalid());
    }
    for (index, (name, _)) in fields.iter().enumerate() {
        if fields[..index].iter().any(|(prior, _)| prior == name) {
            return Err(invalid());
        }
        if !expected.iter().any(|candidate| name == &key(candidate)) {
            return Err(invalid());
        }
    }
    if expected
        .iter()
        .any(|candidate| !fields.iter().any(|(name, _)| name == &key(candidate)))
    {
        return Err(invalid());
    }
    Ok(())
}

fn get<'a>(fields: &'a [(PyText, PythonConsumerValue)], name: &str) -> &'a PythonConsumerValue {
    fields
        .iter()
        .find(|(candidate, _)| candidate == &key(name))
        .map(|(_, value)| value)
        .expect("exact_object checked required members")
}

fn py_text(value: &PythonConsumerValue) -> Result<&PyText, LogicalRenderError> {
    match value {
        PythonConsumerValue::String(value) => Ok(value),
        _ => Err(invalid()),
    }
}

fn scalar_string(value: &PyText) -> Result<String, LogicalRenderError> {
    value
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point).ok_or_else(invalid))
        .collect()
}

fn nonempty_text(value: &PythonConsumerValue) -> Result<String, LogicalRenderError> {
    let value = scalar_string(py_text(value)?)?;
    if value.is_empty() {
        return Err(invalid());
    }
    Ok(value)
}

fn nullable_text(value: &PythonConsumerValue) -> Result<Option<String>, LogicalRenderError> {
    match value {
        PythonConsumerValue::Null => Ok(None),
        PythonConsumerValue::String(value) => Ok(Some(scalar_string(value)?)),
        _ => Err(invalid()),
    }
}

fn tagged_fields<'a>(
    value: &'a PythonConsumerValue,
    class_name: &str,
) -> Result<&'a [(PyText, PythonConsumerValue)], LogicalRenderError> {
    let outer = exact_object(value, &["$type", "fields"])?;
    if scalar_string(py_text(get(outer, "$type"))?)? != class_name {
        return Err(invalid());
    }
    object(get(outer, "fields"))
}

fn tuple_values(value: &PythonConsumerValue) -> Result<&[PythonConsumerValue], LogicalRenderError> {
    let wrapper = exact_object(value, &["$tuple"])?;
    match get(wrapper, "$tuple") {
        PythonConsumerValue::Array(items) => Ok(items),
        _ => Err(invalid()),
    }
}

fn empty_tuple(value: &PythonConsumerValue) -> Result<(), LogicalRenderError> {
    if tuple_values(value)?.is_empty() {
        Ok(())
    } else {
        Err(invalid())
    }
}

fn expect_null(value: &PythonConsumerValue) -> Result<(), LogicalRenderError> {
    if matches!(value, PythonConsumerValue::Null) {
        Ok(())
    } else {
        Err(unsupported(
            "captured source, temporal, and alias metadata are outside logical renderer profile",
        ))
    }
}

fn field(value: &PythonConsumerValue) -> Result<Field, LogicalRenderError> {
    let fields = tagged_fields(value, "umf_access.dsl._nodes.FieldRef")?;
    validate_fields(
        fields,
        &[
            "alias",
            "element",
            "field",
            "field_module",
            "logical_name",
            "module",
            "source",
            "temporal",
        ],
    )?;
    expect_null(get(fields, "alias"))?;
    expect_null(get(fields, "source"))?;
    expect_null(get(fields, "temporal"))?;
    let module = nonempty_text(get(fields, "module"))?;
    let element = nonempty_text(get(fields, "element"))?;
    let field_module = nonempty_text(get(fields, "field_module"))?;
    if field_module != module {
        return Err(unsupported(
            "Field ownership metadata is outside logical renderer profile",
        ));
    }
    let _field_id = nonempty_text(get(fields, "field"))?;
    let name = nullable_text(get(fields, "logical_name"))?;
    Ok(Field {
        module,
        element,
        name,
    })
}

fn record(value: &PythonConsumerValue) -> Result<Record, LogicalRenderError> {
    let fields = tagged_fields(value, "umf_access.dsl._nodes.RecordRef")?;
    validate_fields(
        fields,
        &[
            "alias",
            "element",
            "key",
            "key_id",
            "logical_name",
            "logical_namespace",
            "module",
            "source",
        ],
    )?;
    expect_null(get(fields, "alias"))?;
    expect_null(get(fields, "source"))?;
    expect_null(get(fields, "key_id"))?;
    let module = nonempty_text(get(fields, "module"))?;
    let element = nonempty_text(get(fields, "element"))?;
    let logical_namespace = nullable_text(get(fields, "logical_namespace"))?;
    let logical_name = nullable_text(get(fields, "logical_name"))?;
    let key_fields = tuple_values(get(fields, "key"))?;
    if key_fields.len() != 1 {
        return Err(unsupported(
            "captured Key shape is outside logical renderer profile",
        ));
    }
    let key = field(&key_fields[0])?;
    if key.module != module || key.element != element {
        return Err(unsupported(
            "captured Key ownership differs from selected Record",
        ));
    }
    Ok(Record {
        module,
        element,
        logical_namespace,
        logical_name,
        key,
    })
}

fn carrier_is_string(value: &PythonConsumerValue) -> bool {
    exact_object(value, &["$typeRef"])
        .ok()
        .and_then(|fields| py_text(get(fields, "$typeRef")).ok())
        .and_then(|text| scalar_string(text).ok())
        .as_deref()
        == Some("builtins.str")
}

fn carrier_is_optional_string(value: &PythonConsumerValue) -> bool {
    let Ok(fields) = exact_object(value, &["$typing", "args"]) else {
        return false;
    };
    let Ok(origin) = py_text(get(fields, "$typing")).and_then(scalar_string) else {
        return false;
    };
    if origin != "typing.Union" {
        return false;
    }
    let Ok(items) = array(get(fields, "args")) else {
        return false;
    };
    items.len() == 2
        && carrier_is_string(&items[0])
        && exact_object(&items[1], &["$sentinel"])
            .ok()
            .and_then(|sentinel| py_text(get(sentinel, "$sentinel")).ok())
            .and_then(|text| scalar_string(text).ok())
            .as_deref()
            == Some("umf_access.types.MISSING")
}

fn array(value: &PythonConsumerValue) -> Result<&[PythonConsumerValue], LogicalRenderError> {
    match value {
        PythonConsumerValue::Array(items) => Ok(items),
        _ => Err(invalid()),
    }
}

fn parameters(value: &PythonConsumerValue) -> Result<Vec<Parameter>, LogicalRenderError> {
    let mut result = Vec::new();
    for parameter in tuple_values(value)? {
        let fields = tagged_fields(parameter, "umf_access.capture.CapturedParameter")?;
        validate_fields(
            fields,
            &[
                "carrier",
                "key_components",
                "key_identity",
                "key_source",
                "name",
                "optional",
            ],
        )?;
        empty_tuple(get(fields, "key_components"))?;
        empty_tuple(get(fields, "key_identity"))?;
        expect_null(get(fields, "key_source"))?;
        let name = nonempty_text(get(fields, "name"))?;
        let optional = match get(fields, "optional") {
            PythonConsumerValue::Bool(value) => *value,
            _ => return Err(invalid()),
        };
        let carrier = get(fields, "carrier");
        if (!optional && !carrier_is_string(carrier))
            || (optional && !carrier_is_optional_string(carrier))
        {
            return Err(unsupported(
                "captured parameter carrier is outside logical renderer profile",
            ));
        }
        if result
            .iter()
            .any(|existing: &Parameter| existing.name == name)
        {
            return Err(invalid());
        }
        result.push(Parameter { name, optional });
    }
    Ok(result)
}

fn node(
    value: &PythonConsumerValue,
) -> Result<(String, Vec<PythonConsumerValue>), LogicalRenderError> {
    let fields = tagged_fields(value, "umf_access.dsl._nodes.Node")?;
    validate_fields(fields, &["args", "op"])?;
    let op = nonempty_text(get(fields, "op"))?;
    let args = tuple_values(get(fields, "args"))?.to_vec();
    Ok((op, args))
}

fn parse_predicate(value: &PythonConsumerValue) -> Result<Predicate, LogicalRenderError> {
    let (op, args) = node(value)?;
    if op == "omitted" {
        if args.is_empty() {
            return Ok(Predicate::Omitted);
        }
        return Err(invalid());
    }
    if op != "=" || args.len() != 2 {
        return Err(unsupported("unsupported logical predicate"));
    }
    let (left_op, left_args) = node(&args[0])?;
    let (right_op, right_args) = node(&args[1])?;
    if left_op != "column" || left_args.len() != 1 || right_op != "param" || right_args.len() != 1 {
        return Err(unsupported("unsupported logical predicate"));
    }
    let field = field(&left_args[0])?;
    let parameter = nonempty_text(&right_args[0])?;
    Ok(Predicate::Equal(field, parameter))
}

fn quote(value: &str) -> Result<String, LogicalRenderError> {
    if value.is_empty() || value.contains('\0') {
        return Err(unsupported(
            "logical identifier is outside Weft text profile",
        ));
    }
    Ok(format!("\"{}\"", value.replace('"', "\"\"")))
}

fn marker(value: &str) -> Result<String, LogicalRenderError> {
    let mut chars = value.chars();
    if !chars
        .next()
        .is_some_and(|first| first == '_' || first.is_ascii_alphabetic())
        || !chars.all(|item| item == '_' || item.is_ascii_alphanumeric())
    {
        return Err(refuse(
            "CAPTURE_SIGNATURE",
            "parameter is outside Weft marker grammar",
        ));
    }
    Ok(format!(":{value}"))
}

fn render(
    record: &Record,
    predicate: Option<&Predicate>,
    limit: u32,
) -> Result<String, LogicalRenderError> {
    let (Some(namespace), Some(name)) = (&record.logical_namespace, &record.logical_name) else {
        return Err(unsupported(
            "Record requires authored namespace and logical name",
        ));
    };
    let source = format!("{}.{}", quote(namespace)?, quote(name)?);
    let mut query = format!("SELECT \"r\".* FROM {source} AS \"r\"");
    if let Some(Predicate::Equal(field, parameter)) = predicate {
        let Some(field_name) = &field.name else {
            return Err(unsupported("Field has no authored logical name"));
        };
        if field_name.is_empty() {
            return Err(unsupported("Field has no authored logical name"));
        }
        if field.module != record.module || field.element != record.element {
            return Err(unsupported("column owner absent from joined query"));
        }
        query.push_str(&format!(
            " WHERE \"r\".{} = {}",
            quote(field_name)?,
            marker(parameter)?
        ));
    }
    // The selected-Key identity is checked above and belongs to the captured
    // DTO, although this no-order/no-page subset does not render a Key clause.
    let _selected_key = &record.key;
    query.push_str(&format!(" LIMIT {limit}"));
    Ok(query)
}

/// Render one versioned tagged `CapturedVariant` DTO.
pub fn render_captured_variant(
    input: &PythonConsumerValue,
    ctx: &mut Context<'_>,
) -> Result<String, LogicalRenderError> {
    input.admit(ctx)?;
    let envelope = exact_object(input, &["profile", "variant"])?;
    if nonempty_text(get(envelope, "profile"))? != PROFILE {
        return Err(refuse(
            "CAPTURE_DTO_PROFILE",
            "captured variant profile mismatch",
        ));
    }
    let variant_fields = tagged_fields(
        get(envelope, "variant"),
        "umf_access.capture.CapturedVariant",
    )?;
    validate_fields(variant_fields, &["node", "parameters", "presence"])?;
    // Match Python's render order for a structurally valid capture: authored
    // Record identity refusal wins before unsupported query-step semantics.
    let (terminal, terminal_args) = node(get(variant_fields, "node"))?;
    if terminal != "all" || terminal_args.len() != 2 {
        return Err(unsupported("unsupported terminal form"));
    }
    let record = record(&terminal_args[0])?;
    if record
        .logical_namespace
        .as_deref()
        .is_none_or(str::is_empty)
        || record.logical_name.as_deref().is_none_or(str::is_empty)
    {
        return Err(unsupported(
            "Record requires authored namespace and logical name",
        ));
    }
    let parameters = parameters(get(variant_fields, "parameters"))?;
    let mut present = Vec::new();
    for item in tuple_values(get(variant_fields, "presence"))? {
        let name = nonempty_text(item)?;
        if present.contains(&name) || !parameters.iter().any(|p| p.optional && p.name == name) {
            return Err(invalid());
        }
        present.push(name);
    }

    let steps = tuple_values(&terminal_args[1])?;
    let mut predicate = None;
    let mut limit = None;
    let mut saw_limit = false;
    let mut parameter_uses: Vec<String> = Vec::new();
    for step in steps {
        ctx.charge_work(1, Utf16::default())?;
        let (op, args) = node(step)?;
        match op.as_str() {
            "filter" if !saw_limit && predicate.is_none() => {
                if args.len() != 1 {
                    return Err(unsupported("unsupported logical query step"));
                }
                match parse_predicate(&args[0])? {
                    Predicate::Omitted => predicate = Some(Predicate::Omitted),
                    Predicate::Equal(field, parameter) => {
                        parameter_uses.push(parameter.clone());
                        predicate = Some(Predicate::Equal(field, parameter));
                    }
                }
            }
            "limit" if !saw_limit && args.len() == 1 => {
                let PythonConsumerValue::Integer(number) = &args[0] else {
                    return Err(invalid());
                };
                let bound = number.to_u32().ok_or_else(invalid)?;
                if !(1..=1000).contains(&bound) {
                    return Err(unsupported("list reads require an explicit bound"));
                }
                limit = Some(bound);
                saw_limit = true;
            }
            "join" => {
                return Err(unsupported(
                    "join rendering requires declared build-time bindings",
                ));
            }
            _ => return Err(unsupported("unsupported logical query step")),
        }
    }
    let limit = limit.ok_or_else(|| unsupported("list reads require an explicit bound"))?;
    for parameter in &parameters {
        let uses = parameter_uses
            .iter()
            .filter(|name| *name == &parameter.name)
            .count();
        let should_be_used = !parameter.optional || present.contains(&parameter.name);
        if (should_be_used && uses != 1) || (!should_be_used && uses != 0) {
            return Err(invalid());
        }
    }
    if parameter_uses
        .iter()
        .any(|name| !parameters.iter().any(|parameter| parameter.name == *name))
    {
        return Err(invalid());
    }
    let predicate = match &predicate {
        Some(Predicate::Omitted) => None,
        value => value.as_ref(),
    };
    let output = render(&record, predicate, limit)?;
    let units = output.encode_utf16().count();
    ctx.charge_text(units, Utf16::default())?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use num_bigint::BigInt;

    fn text(value: &str) -> PythonConsumerValue {
        PythonConsumerValue::String(PyText::from_utf8(value))
    }

    fn object(values: Vec<(&str, PythonConsumerValue)>) -> PythonConsumerValue {
        PythonConsumerValue::Object(
            values
                .into_iter()
                .map(|(name, value)| (key(name), value))
                .collect(),
        )
    }

    fn tuple(values: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        object(vec![("$tuple", PythonConsumerValue::Array(values))])
    }

    fn tagged(name: &str, fields: Vec<(&str, PythonConsumerValue)>) -> PythonConsumerValue {
        object(vec![("$type", text(name)), ("fields", object(fields))])
    }

    fn field(name: Option<&str>, field_id: &str) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.FieldRef",
            vec![
                ("alias", PythonConsumerValue::Null),
                ("element", text("Invoice")),
                ("field", text(field_id)),
                ("field_module", text("billing")),
                (
                    "logical_name",
                    name.map(text).unwrap_or(PythonConsumerValue::Null),
                ),
                ("module", text("billing")),
                ("source", PythonConsumerValue::Null),
                ("temporal", PythonConsumerValue::Null),
            ],
        )
    }

    fn node(op: &str, args: Vec<PythonConsumerValue>) -> PythonConsumerValue {
        tagged(
            "umf_access.dsl._nodes.Node",
            vec![("args", tuple(args)), ("op", text(op))],
        )
    }

    fn variant(steps: Vec<PythonConsumerValue>, presence: Vec<&str>) -> PythonConsumerValue {
        let key = field(Some("invoiceId"), "id");
        let record = tagged(
            "umf_access.dsl._nodes.RecordRef",
            vec![
                ("alias", PythonConsumerValue::Null),
                ("element", text("Invoice")),
                ("key", tuple(vec![key])),
                ("key_id", PythonConsumerValue::Null),
                ("logical_name", text("Invoice")),
                ("logical_namespace", text("com.example.billing")),
                ("module", text("billing")),
                ("source", PythonConsumerValue::Null),
            ],
        );
        let root = node("all", vec![record, tuple(steps)]);
        object(vec![
            ("profile", text(PROFILE)),
            (
                "variant",
                tagged(
                    "umf_access.capture.CapturedVariant",
                    vec![
                        ("node", root),
                        ("parameters", tuple(vec![])),
                        ("presence", tuple(presence.into_iter().map(text).collect())),
                    ],
                ),
            ),
        ])
    }

    #[test]
    fn direct_variant_renders_explicit_authored_logical_names() {
        let input = variant(
            vec![node(
                "limit",
                vec![PythonConsumerValue::Integer(BigInt::from(4))],
            )],
            vec![],
        );
        assert_eq!(
            render_captured_variant(&input, &mut Context::ordinary()).unwrap(),
            "SELECT \"r\".* FROM \"com.example.billing\".\"Invoice\" AS \"r\" LIMIT 4"
        );
    }

    #[test]
    fn missing_authored_record_identity_matches_python_refusal() {
        let mut input = variant(
            vec![node(
                "limit",
                vec![PythonConsumerValue::Integer(BigInt::from(4))],
            )],
            vec![],
        );
        if let PythonConsumerValue::Object(envelope) = &mut input {
            if let Some((_, PythonConsumerValue::Object(variant))) = envelope
                .iter_mut()
                .find(|(name, _)| name == &key("variant"))
            {
                if let Some((_, PythonConsumerValue::Object(root))) =
                    variant.iter_mut().find(|(name, _)| name == &key("fields"))
                {
                    if let Some((_, PythonConsumerValue::Object(args))) =
                        root.iter_mut().find(|(name, _)| name == &key("node"))
                    {
                        if let Some((_, PythonConsumerValue::Object(fields))) =
                            args.iter_mut().find(|(name, _)| name == &key("fields"))
                        {
                            if let Some((_, PythonConsumerValue::Object(root_args))) =
                                fields.iter_mut().find(|(name, _)| name == &key("args"))
                            {
                                if let Some(PythonConsumerValue::Object(record)) = match root_args
                                    .iter_mut()
                                    .find(|(name, _)| name == &key("$tuple"))
                                {
                                    Some((_, PythonConsumerValue::Array(items))) => {
                                        items.first_mut()
                                    }
                                    _ => None,
                                } {
                                    if let Some((_, PythonConsumerValue::Object(record_fields))) =
                                        record.iter_mut().find(|(name, _)| name == &key("fields"))
                                    {
                                        for (name, value) in record_fields {
                                            if name == &key("logical_namespace")
                                                || name == &key("logical_name")
                                            {
                                                *value = PythonConsumerValue::Null;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        let error = render_captured_variant(&input, &mut Context::ordinary()).unwrap_err();
        let LogicalRenderError::Refused(error) = error else {
            panic!("unexpected resource error")
        };
        assert_eq!(error.code, "CAPTURE_UNSUPPORTED");
        assert_eq!(
            error.message,
            "Record requires authored namespace and logical name"
        );
    }

    #[test]
    fn unknown_variant_field_is_rejected() {
        let mut input = variant(
            vec![node(
                "limit",
                vec![PythonConsumerValue::Integer(BigInt::from(4))],
            )],
            vec![],
        );
        if let PythonConsumerValue::Object(envelope) = &mut input {
            if let Some((_, PythonConsumerValue::Object(variant))) = envelope
                .iter_mut()
                .find(|(name, _)| name == &key("variant"))
            {
                if let Some((_, PythonConsumerValue::Object(fields))) =
                    variant.iter_mut().find(|(name, _)| name == &key("fields"))
                {
                    fields.push((key("future"), PythonConsumerValue::Null));
                }
            }
        }
        let error = render_captured_variant(&input, &mut Context::ordinary()).unwrap_err();
        let LogicalRenderError::Refused(error) = error else {
            panic!("unexpected resource error")
        };
        assert_eq!(error.code, "CAPTURE_DTO_INVALID");
    }

    #[test]
    fn join_refuses_without_binding_context() {
        let input = variant(
            vec![
                node("join", vec![]),
                node("limit", vec![PythonConsumerValue::Integer(BigInt::from(4))]),
            ],
            vec![],
        );
        let error = render_captured_variant(&input, &mut Context::ordinary()).unwrap_err();
        let LogicalRenderError::Refused(error) = error else {
            panic!("unexpected resource error")
        };
        assert_eq!(error.code, "CAPTURE_UNSUPPORTED");
        assert_eq!(
            error.message,
            "join rendering requires declared build-time bindings"
        );
    }
}
