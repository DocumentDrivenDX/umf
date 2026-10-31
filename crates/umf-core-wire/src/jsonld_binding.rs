// SPDX-License-Identifier: MIT OR Apache-2.0
//! Tagged-wire API for the source-preservation JSON-LD kernel.
use std::collections::BTreeSet;

use umf_core::{
    jsonld_source::{self as jsonld, JsonLdContextInput, JsonLdRuntime},
    Context, Diagnostic, EngineError, Severity, Utf16, Validation, Value,
};

use crate::{decode, encode, field, result_envelope};

pub const PROFILE: &str = "umf.jsonld-wire/1";
pub const OPERATIONS: &[&str] = &[
    "jsonld.import",
    "jsonld.validate",
    "jsonld.export",
    "jsonld.getNode",
    "jsonld.editNode",
    "jsonld.expand",
    "jsonld.flatten",
    "jsonld.compact",
    "jsonld.toRdf",
    "jsonld.fromRdf",
];

fn request(message: &str) -> EngineError {
    EngineError::new("REQUEST", Utf16::default(), message)
}

fn valid_utf16(text: &Utf16) -> bool {
    let mut units = text.units().iter().copied();
    while let Some(unit) = units.next() {
        match unit {
            0xD800..=0xDBFF => {
                if !matches!(units.next(), Some(0xDC00..=0xDFFF)) {
                    return false;
                }
            }
            0xDC00..=0xDFFF => return false,
            _ => {}
        }
    }
    true
}

fn ascii(text: &Utf16, expected: &str) -> bool {
    text.units().len() == expected.len() && text.units().iter().copied().eq(expected.encode_utf16())
}

fn text<'a>(value: Option<&'a Value>, name: &str) -> Result<&'a Utf16, EngineError> {
    match value {
        Some(Value::String(value)) => Ok(value),
        _ => Err(request(&format!("{name} must be a string"))),
    }
}

fn allowed(op: &str) -> Option<&'static [&'static str]> {
    Some(match op {
        "jsonld.import" => &[
            "profile",
            "op",
            "id",
            "source",
            "baseIRI",
            "processingMode",
            "contexts",
            "expandContext",
        ],
        "jsonld.validate" | "jsonld.export" => &["profile", "op", "document"],
        "jsonld.expand" => &["profile", "op", "document", "lossPolicy"],
        "jsonld.flatten" => &[
            "profile",
            "op",
            "document",
            "lossPolicy",
            "context",
            "compactArrays",
        ],
        "jsonld.compact" => &[
            "profile",
            "op",
            "document",
            "lossPolicy",
            "context",
            "compactArrays",
            "compactToRelative",
        ],
        "jsonld.toRdf" => &[
            "profile",
            "op",
            "document",
            "id",
            "produceGeneralizedRdf",
            "numericPolicy",
            "lossPolicy",
            "rdfDirection",
        ],
        "jsonld.fromRdf" => &[
            "profile",
            "op",
            "document",
            "id",
            "baseIRI",
            "processingMode",
            "lossPolicy",
            "useNativeTypes",
            "useRdfType",
            "rdfDirection",
        ],
        "jsonld.getNode" => &["profile", "op", "document", "pointer"],
        "jsonld.editNode" => &["profile", "op", "document", "pointer", "replacementJson"],
        _ => return None,
    })
}

fn validate_members(
    value: &Value,
    allowed: &[&str],
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(request("JSON-LD request must be an object"));
    };
    let mut seen = BTreeSet::new();
    for (name, _) in fields {
        ctx.charge_work(name.len().saturating_add(1), Utf16::default())?;
        if !allowed
            .iter()
            .any(|candidate| name == &Utf16::from(*candidate))
            || !seen.insert(name)
        {
            return Err(request(
                "JSON-LD request has an unknown or duplicate member",
            ));
        }
    }
    Ok(())
}

fn validate_contexts(value: &Value, ctx: &mut Context<'_>) -> Result<(), EngineError> {
    let Value::Array(items) = value else {
        return Err(request("contexts must be an array"));
    };
    if items.len() > 100 {
        return Err(request("At most 100 supplied contexts are allowed"));
    }
    ctx.charge_work(items.len(), Utf16::default())?;
    for item in items {
        validate_members(item, &["url", "documentUrl", "text"], ctx)?;
        for name in ["url", "text"] {
            let value = text(field(item, name), name)?;
            if value.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "Context text exceeds the text limit",
                ));
            }
            if name == "url" && !valid_utf16(value) {
                return Err(request("Context URL must contain well-formed UTF-16"));
            }
        }
        if let Some(value) = field(item, "documentUrl") {
            let value = text(Some(value), "documentUrl")?;
            if value.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "documentUrl exceeds the text limit",
                ));
            }
            if !valid_utf16(value) {
                return Err(request("documentUrl must contain well-formed UTF-16"));
            }
        }
    }
    Ok(())
}

fn validate_operation(
    op: &str,
    request_value: &Value,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    match op {
        "jsonld.import" => {
            for name in ["id", "source", "baseIRI"] {
                let value = text(field(request_value, name), name)?;
                if value.len() > ctx.limits().max_text_units {
                    return Err(EngineError::new(
                        "RESOURCE_LIMIT",
                        Utf16::default(),
                        "JSON-LD input exceeds the text limit",
                    ));
                }
                if name == "baseIRI" && !valid_utf16(value) {
                    return Err(request("baseIRI must contain well-formed UTF-16"));
                }
            }
            match field(request_value, "processingMode") {
                None | Some(Value::Null) => {}
                Some(Value::String(mode)) => {
                    if !valid_utf16(mode)
                        || (!ascii(mode, "json-ld-1.0") && !ascii(mode, "json-ld-1.1"))
                    {
                        return Err(request("processingMode must be json-ld-1.0 or json-ld-1.1"));
                    }
                }
                _ => return Err(request("processingMode must be a string or null")),
            }
            if let Some(contexts) = field(request_value, "contexts") {
                validate_contexts(contexts, ctx)?;
            }
            if let Some(expand_context) = field(request_value, "expandContext") {
                let value = text(Some(expand_context), "expandContext")?;
                if value.len() > ctx.limits().max_text_units {
                    return Err(EngineError::new(
                        "RESOURCE_LIMIT",
                        Utf16::default(),
                        "expandContext exceeds the text limit",
                    ));
                }
            }
        }
        "jsonld.validate" | "jsonld.export" | "jsonld.expand" | "jsonld.flatten"
        | "jsonld.compact" | "jsonld.toRdf" | "jsonld.fromRdf" => {
            let document =
                field(request_value, "document").ok_or_else(|| request("document is required"))?;
            if matches!(op, "jsonld.toRdf" | "jsonld.fromRdf") {
                if let Value::Object(members) = document {
                    ctx.charge_work(members.len(), Utf16::default())?;
                } else {
                    return Err(request("document must be an object"));
                }
            }
            if matches!(op, "jsonld.expand" | "jsonld.flatten" | "jsonld.compact") {
                match field(request_value, "lossPolicy") {
                    Some(Value::String(value))
                        if ascii(value, "report") || ascii(value, "reject") => {}
                    _ => return Err(request("lossPolicy must be report or reject")),
                }
            }
            if op == "jsonld.toRdf" {
                let id = text(field(request_value, "id"), "id")?;
                if id.is_empty() {
                    return Err(request("id must not be empty"));
                }
                for (name, choices) in [("lossPolicy", &["report", "reject"][..])] {
                    let value = text(field(request_value, name), name)?;
                    if !choices.iter().any(|choice| ascii(value, choice)) {
                        return Err(request("toRdf policy value is unsupported"));
                    }
                }
                if let Some(value) = field(request_value, "numericPolicy") {
                    let value = text(Some(value), "numericPolicy")?;
                    if !ascii(value, "strict") && !ascii(value, "binary64") {
                        return Err(request("numericPolicy must be strict or binary64"));
                    }
                }
                if field(request_value, "produceGeneralizedRdf")
                    .is_some_and(|v| !matches!(v, Value::Bool(_)))
                {
                    return Err(request("produceGeneralizedRdf must be boolean"));
                }
                if let Some(direction) = field(request_value, "rdfDirection") {
                    if !matches!(direction, Value::Null | Value::String(_)) {
                        return Err(request("rdfDirection must be a string or null"));
                    }
                    if matches!(direction, Value::String(value) if !ascii(value, "i18n-datatype") && !ascii(value, "compound-literal"))
                    {
                        return Err(request(
                            "rdfDirection must be i18n-datatype or compound-literal",
                        ));
                    }
                }
            }
            if op == "jsonld.fromRdf" {
                let id = text(field(request_value, "id"), "id")?;
                let base = text(field(request_value, "baseIRI"), "baseIRI")?;
                if id.is_empty() || !valid_utf16(base) || base.to_utf8().is_err() {
                    return Err(request(
                        "fromRdf requires a non-empty id and well-formed baseIRI",
                    ));
                }
                match field(request_value, "processingMode") {
                    None | Some(Value::Null) => (),
                    Some(Value::String(mode))
                        if ascii(mode, "json-ld-1.0") || ascii(mode, "json-ld-1.1") =>
                    {
                        ()
                    }
                    _ => return Err(request("processingMode must be json-ld-1.0 or json-ld-1.1")),
                }
                if !matches!(field(request_value, "lossPolicy"), Some(Value::String(v)) if ascii(v, "report") || ascii(v, "reject"))
                {
                    return Err(request("lossPolicy must be report or reject"));
                }
                for name in ["useNativeTypes", "useRdfType"] {
                    if field(request_value, name).is_some_and(|v| !matches!(v, Value::Bool(_))) {
                        return Err(request("RDF conversion options must be booleans"));
                    }
                }
                if field(request_value, "rdfDirection")
                    .is_some_and(|v| !matches!(v, Value::Null | Value::String(_)))
                {
                    return Err(request("rdfDirection must be a string or null"));
                }
                if let Some(Value::String(direction)) = field(request_value, "rdfDirection") {
                    if !ascii(direction, "i18n-datatype") && !ascii(direction, "compound-literal") {
                        return Err(request(
                            "rdfDirection must be i18n-datatype or compound-literal",
                        ));
                    }
                    if ascii(direction, "compound-literal") {
                        return Err(request(
                            "compound-literal direction decoding is not supported by this profile",
                        ));
                    }
                    if matches!(field(request_value, "processingMode"), Some(Value::String(mode)) if ascii(mode, "json-ld-1.0"))
                    {
                        return Err(request("rdfDirection conversion requires JSON-LD 1.1"));
                    }
                }
            }
            if op == "jsonld.compact" {
                let context = text(field(request_value, "context"), "context")?;
                if context.len() > ctx.limits().max_text_units {
                    return Err(EngineError::new(
                        "RESOURCE_LIMIT",
                        Utf16::default(),
                        "Target context exceeds the text limit",
                    ));
                }
            }
            if op == "jsonld.flatten" {
                if let Some(context) = field(request_value, "context") {
                    if !matches!(context, Value::Null | Value::String(_)) {
                        return Err(request("context must be JSON text or null"));
                    }
                    if let Value::String(context) = context {
                        if context.len() > ctx.limits().max_text_units {
                            return Err(EngineError::new(
                                "RESOURCE_LIMIT",
                                Utf16::default(),
                                "Target context exceeds the text limit",
                            ));
                        }
                    }
                }
            }
            if matches!(op, "jsonld.flatten" | "jsonld.compact") {
                for option in ["compactArrays", "compactToRelative"] {
                    if field(request_value, option)
                        .is_some_and(|value| !matches!(value, Value::Bool(_)))
                    {
                        return Err(request("compact options must be booleans"));
                    }
                }
            }
        }
        "jsonld.getNode" => {
            field(request_value, "document").ok_or_else(|| request("document is required"))?;
            text(field(request_value, "pointer"), "pointer")?;
        }
        "jsonld.editNode" => {
            field(request_value, "document").ok_or_else(|| request("document is required"))?;
            text(field(request_value, "pointer"), "pointer")?;
            let replacement = text(field(request_value, "replacementJson"), "replacementJson")?;
            if replacement.len() > ctx.limits().max_text_units {
                return Err(EngineError::new(
                    "RESOURCE_LIMIT",
                    Utf16::default(),
                    "replacementJson exceeds the text limit",
                ));
            }
        }
        _ => return Err(request("Unknown JSON-LD operation")),
    }
    Ok(())
}

fn diagnostic_value(diagnostic: Diagnostic) -> Value {
    Value::Object(vec![
        (Utf16::from("code"), Value::String(diagnostic.code)),
        (Utf16::from("path"), Value::String(diagnostic.path)),
        (Utf16::from("message"), Value::String(diagnostic.message)),
        (
            Utf16::from("severity"),
            Value::String(Utf16::from(match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            })),
        ),
    ])
}

fn validation_value(validation: Validation, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    ctx.charge_work(validation.diagnostics.len(), Utf16::default())?;
    Ok(Value::Object(vec![
        (Utf16::from("valid"), Value::Bool(validation.valid)),
        (Utf16::from("complete"), Value::Bool(validation.complete)),
        (
            Utf16::from("diagnostics"),
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(diagnostic_value)
                    .collect(),
            ),
        ),
    ]))
}

fn execute(request_value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = text(field(request_value, "op"), "op")?;
    if op.len() > 32 || !valid_utf16(op) {
        return Err(request("op is not a valid JSON-LD wire operation"));
    }
    let op = OPERATIONS
        .iter()
        .copied()
        .find(|candidate| ascii(op, candidate))
        .ok_or_else(|| request("Unknown JSON-LD operation"))?;
    if !matches!(field(request_value, "profile"), Some(Value::String(profile)) if ascii(profile, PROFILE))
    {
        return Err(request("JSON-LD wire profile is required"));
    }
    validate_members(request_value, allowed(op).unwrap(), ctx)?;
    validate_operation(op, request_value, ctx)?;

    let runtime = JsonLdRuntime::new(ctx)?;
    match op {
        "jsonld.import" => {
            let id = text(field(request_value, "id"), "id")?;
            let source = text(field(request_value, "source"), "source")?;
            let base_iri = text(field(request_value, "baseIRI"), "baseIRI")?;
            let processing_mode = match field(request_value, "processingMode") {
                Some(Value::String(value)) => Some(value),
                _ => None,
            };
            let mut contexts = Vec::new();
            if let Some(Value::Array(items)) = field(request_value, "contexts") {
                ctx.charge_work(items.len(), Utf16::default())?;
                for item in items {
                    let url = text(field(item, "url"), "context url")?;
                    ctx.charge_text(url.len(), Utf16::default())?;
                    let url = url.clone();
                    let document_url = if let Some(value) = field(item, "documentUrl") {
                        let value = text(Some(value), "documentUrl")?;
                        ctx.charge_text(value.len(), Utf16::default())?;
                        Some(value.clone())
                    } else {
                        None
                    };
                    let source = text(field(item, "text"), "context text")?;
                    ctx.charge_text(source.len(), Utf16::default())?;
                    let source = source.clone();
                    contexts.push(JsonLdContextInput {
                        url,
                        document_url,
                        source,
                    });
                }
            }
            jsonld::import_jsonld_document(
                source,
                id,
                base_iri,
                processing_mode,
                &contexts,
                field(request_value, "expandContext")
                    .map(|value| text(Some(value), "expandContext"))
                    .transpose()?,
                &runtime,
                ctx,
            )
        }
        "jsonld.validate" => validation_value(
            jsonld::inspect_jsonld_document(
                field(request_value, "document").unwrap(),
                &runtime,
                ctx,
            )?,
            ctx,
        ),
        "jsonld.export" => Ok(Value::String(jsonld::export_jsonld_document(
            field(request_value, "document").unwrap(),
            &runtime,
            ctx,
        )?)),
        "jsonld.expand" => jsonld::propose_jsonld_expansion(
            field(request_value, "document").unwrap(),
            text(field(request_value, "lossPolicy"), "lossPolicy")?,
            &runtime,
            ctx,
        ),
        "jsonld.flatten" => jsonld::propose_jsonld_flatten(
            field(request_value, "document").unwrap(),
            text(field(request_value, "lossPolicy"), "lossPolicy")?,
            match field(request_value, "context") {
                Some(Value::String(value)) => Some(value),
                _ => None,
            },
            match field(request_value, "compactArrays") {
                Some(Value::Bool(value)) => *value,
                _ => true,
            },
            &runtime,
            ctx,
        ),
        "jsonld.compact" => jsonld::propose_jsonld_compaction(
            field(request_value, "document").unwrap(),
            text(field(request_value, "lossPolicy"), "lossPolicy")?,
            text(field(request_value, "context"), "context")?,
            match field(request_value, "compactArrays") {
                Some(Value::Bool(value)) => *value,
                _ => true,
            },
            match field(request_value, "compactToRelative") {
                Some(Value::Bool(value)) => *value,
                _ => true,
            },
            &runtime,
            ctx,
        ),
        "jsonld.toRdf" => {
            let rdf_runtime = umf_core::rdf::RdfRuntime::new(ctx)?;
            let default_numeric_policy = Utf16::from("strict");
            jsonld::propose_jsonld_to_rdf(
                field(request_value, "document").unwrap(),
                text(field(request_value, "id"), "id")?,
                matches!(
                    field(request_value, "produceGeneralizedRdf"),
                    Some(Value::Bool(true))
                ),
                match field(request_value, "numericPolicy") {
                    Some(Value::String(value)) => value,
                    _ => &default_numeric_policy,
                },
                text(field(request_value, "lossPolicy"), "lossPolicy")?,
                match field(request_value, "rdfDirection") {
                    Some(Value::String(value)) => Some(value),
                    _ => None,
                },
                &runtime,
                &rdf_runtime,
                ctx,
            )
        }
        "jsonld.fromRdf" => {
            let rdf_runtime = umf_core::rdf::RdfRuntime::new(ctx)?;
            let default_processing_mode = Utf16::from("json-ld-1.1");
            let processing_mode = match field(request_value, "processingMode") {
                Some(Value::String(value)) => value,
                _ => &default_processing_mode,
            };
            jsonld::propose_rdf_to_jsonld(
                field(request_value, "document").unwrap(),
                text(field(request_value, "id"), "id")?,
                text(field(request_value, "baseIRI"), "baseIRI")?,
                processing_mode,
                text(field(request_value, "lossPolicy"), "lossPolicy")?,
                matches!(
                    field(request_value, "useNativeTypes"),
                    Some(Value::Bool(true))
                ),
                matches!(field(request_value, "useRdfType"), Some(Value::Bool(true))),
                match field(request_value, "rdfDirection") {
                    Some(Value::String(value)) => Some(value),
                    _ => None,
                },
                &rdf_runtime,
                &runtime,
                ctx,
            )
        }
        "jsonld.getNode" => jsonld::get_jsonld_node(
            field(request_value, "document").unwrap(),
            text(field(request_value, "pointer"), "pointer")?,
            &runtime,
            ctx,
        )?
        .tagged_value_preserving_extras(ctx),
        "jsonld.editNode" => {
            let (document, validation) = jsonld::propose_jsonld_node_edit(
                field(request_value, "document").unwrap(),
                text(field(request_value, "pointer"), "pointer")?,
                text(field(request_value, "replacementJson"), "replacementJson")?,
                &runtime,
                ctx,
            )?;
            Ok(Value::Object(vec![
                (Utf16::from("document"), document),
                (
                    Utf16::from("validation"),
                    validation_value(validation, ctx)?,
                ),
            ]))
        }
        _ => Err(request("Unknown JSON-LD operation")),
    }
}

pub fn execute_wire(wire: &str) -> String {
    let mut no_control = |_: usize| Ok(());
    execute_wire_with_control(wire, &mut no_control)
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request_value = ctx.with_tagged_transport_limit(|ctx| decode(wire, ctx))?;
        let result = execute(&request_value, &mut ctx)?;
        encode(&result, &mut ctx)
    })();
    result_envelope(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(value: Value) -> Result<Value, String> {
        let wire = crate::encode(&value, &mut Context::ordinary()).unwrap();
        let response = execute_wire(&wire);
        let envelope: serde_json::Value = serde_json::from_str(&response).unwrap();
        if envelope["status"] != "ok" {
            return Err(envelope.to_string());
        }
        crate::decode(envelope["wire"].as_str().unwrap(), &mut Context::ordinary())
            .map_err(|error| error.to_string())
    }

    fn request_value(op: &str, fields: Vec<(&str, Value)>) -> Value {
        let mut members = vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("op"), Value::string_utf8(op)),
        ];
        members.extend(
            fields
                .into_iter()
                .map(|(key, value)| (Utf16::from(key), value)),
        );
        Value::Object(members)
    }

    #[test]
    fn source_archive_edit_refusal_and_incomplete_status() {
        let source =
            Utf16::from(r#"{"@context":"https://example.test/context","name":"old","n":1.2300}"#);
        let imported = run(request_value(
            "jsonld.import",
            vec![
                ("id", Value::string_utf8("catalog")),
                ("source", Value::String(source.clone())),
                ("baseIRI", Value::string_utf8("https://example.test/")),
            ],
        ))
        .unwrap();
        assert_eq!(field(&imported, "id"), Some(&Value::string_utf8("catalog")));
        let validate = run(request_value(
            "jsonld.validate",
            vec![("document", imported.clone())],
        ))
        .unwrap();
        assert_eq!(field(&validate, "valid"), Some(&Value::Bool(true)));
        assert_eq!(field(&validate, "complete"), Some(&Value::Bool(false)));
        assert!(
            matches!(field(&validate, "diagnostics"), Some(Value::Array(items)) if items.iter().any(|item| text(field(item, "code"), "code").ok().is_some_and(|code| ascii(code, "JSONLD_CONTEXT"))))
        );
        let exported = run(request_value(
            "jsonld.export",
            vec![("document", imported.clone())],
        ))
        .unwrap();
        assert_eq!(exported, Value::String(source));

        let edited = run(request_value(
            "jsonld.editNode",
            vec![
                ("document", imported.clone()),
                ("pointer", Value::string_utf8("/name")),
                ("replacementJson", Value::string_utf8(r#""new""#)),
            ],
        ))
        .unwrap();
        let edited_document = field(&edited, "document").unwrap();
        let edited_text = run(request_value(
            "jsonld.export",
            vec![("document", edited_document.clone())],
        ))
        .unwrap();
        assert!(
            matches!(edited_text, Value::String(ref value) if value.to_utf8().unwrap().contains("\"name\":\"new\""))
        );
        assert_eq!(field(&imported, "id"), Some(&Value::string_utf8("catalog")));

        let refused = run(request_value(
            "jsonld.export",
            vec![("document", imported), ("unexpected", Value::Bool(true))],
        ));
        assert!(refused.is_err());
    }

    #[test]
    fn expansion_report_uses_the_supplied_context_and_requires_loss_policy() {
        let document = run(request_value(
            "jsonld.import",
            vec![
                (
                    "id",
                    Value::string_utf8("person"),
                ),
                (
                    "source",
                    Value::string_utf8(
                        r#"{"@context":"https://example.test/context","@id":"https://example.test/person","name":"Ada"}"#,
                    ),
                ),
                (
                    "baseIRI",
                    Value::string_utf8("https://example.test/"),
                ),
                (
                    "contexts",
                    Value::Array(vec![Value::Object(vec![
                        (
                            Utf16::from("url"),
                            Value::string_utf8("https://example.test/context"),
                        ),
                        (
                            Utf16::from("text"),
                            Value::string_utf8(
                                r#"{"@context":{"name":"https://schema.org/name"}}"#,
                            ),
                        ),
                    ])]),
                ),
            ],
        ))
        .unwrap();
        let report = run(request_value(
            "jsonld.expand",
            vec![
                ("document", document.clone()),
                ("lossPolicy", Value::string_utf8("report")),
            ],
        ))
        .unwrap();
        assert_eq!(field(&report, "complete"), Some(&Value::Bool(false)));
        assert_eq!(
            field(&report, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        assert_eq!(field(&report, "source"), Some(&document));
        assert!(field(&report, "candidate").is_some());
        assert_eq!(
            field(&report, "resourcesUsed"),
            Some(&Value::Array(vec![Value::string_utf8(
                "https://example.test/context",
            )]))
        );
        assert!(run(request_value(
            "jsonld.expand",
            vec![("document", document.clone())],
        ))
        .is_err());

        let flattened = run(request_value(
            "jsonld.flatten",
            vec![
                ("document", document.clone()),
                ("lossPolicy", Value::string_utf8("report")),
            ],
        ))
        .unwrap();
        assert_eq!(
            field(&flattened, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        assert!(field(&flattened, "candidate").is_some());

        let compacted = run(request_value(
            "jsonld.compact",
            vec![
                ("document", document),
                ("lossPolicy", Value::string_utf8("report")),
                (
                    "context",
                    Value::string_utf8(r#"{"name":"https://schema.org/name"}"#),
                ),
            ],
        ))
        .unwrap();
        assert_eq!(
            field(&compacted, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        assert!(field(&compacted, "candidate").is_some());
    }

    #[test]
    fn rdf_conversion_wire_roundtrips_and_refuses_unimplemented_options() {
        let document = run(request_value(
            "jsonld.import",
            vec![
                ("id", Value::string_utf8("person")),
                (
                    "source",
                    Value::string_utf8(
                        r#"{"@context":{"name":"https://schema.org/name"},"@id":"https://example.test/person","name":{"@value":"Ada","@language":"en"}}"#,
                    ),
                ),
                ("baseIRI", Value::string_utf8("https://example.test/")),
            ],
        ))
        .unwrap();
        let rdf = run(request_value(
            "jsonld.toRdf",
            vec![
                ("document", document),
                ("id", Value::string_utf8("person-rdf")),
                ("lossPolicy", Value::string_utf8("report")),
            ],
        ))
        .unwrap();
        assert_eq!(
            field(&rdf, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        let candidate = field(&rdf, "candidate").unwrap().clone();
        let view = run(request_value(
            "jsonld.fromRdf",
            vec![
                ("document", candidate),
                ("id", Value::string_utf8("person-view")),
                ("baseIRI", Value::string_utf8("https://example.test/")),
                ("lossPolicy", Value::string_utf8("report")),
            ],
        ))
        .unwrap();
        assert_eq!(
            field(&view, "status"),
            Some(&Value::string_utf8("candidate"))
        );
        assert!(field(&view, "candidate").is_some());

        assert!(run(request_value(
            "jsonld.fromRdf",
            vec![
                ("document", field(&rdf, "candidate").unwrap().clone()),
                ("id", Value::string_utf8("person-view")),
                ("baseIRI", Value::string_utf8("https://example.test/")),
                ("lossPolicy", Value::string_utf8("report")),
                ("rdfDirection", Value::string_utf8("compound-literal")),
            ],
        ))
        .is_err());
    }
}
