// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in inspection of direct core references. A reference role is not proof
//! of target type; unknown qualifiers remain attached to each occurrence.
use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const INSPECTION_SCHEMA: &str =
    include_str!("../../../spec/core/reference-links-inspection-v0.3.schema.json");
fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn text(s: &str) -> Value {
    Value::string_utf8(s)
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn get_metered<'a>(
    value: &'a Value,
    name: &str,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<&'a Value>, EngineError> {
    let Value::Object(fields) = value else {
        return Ok(None);
    };
    let expected = k(name);
    for (key, child) in fields {
        ctx.charge_work(key.units().len().saturating_add(1), path.clone())?;
        if key == &expected {
            return Ok(Some(child));
        }
    }
    Ok(None)
}
fn raw(value: &Value) -> Option<Utf16> {
    match value {
        Value::String(value) => Some(value.clone()),
        _ => None,
    }
}
fn err(code: &str, message: impl Into<String>, path: &str) -> EngineError {
    EngineError::new(code, k(path), message.into())
}
fn validate_source(
    source: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    let validation = engine.validate_document(source, registry, capabilities, ctx)?;
    if validation.valid {
        return Ok(validation.diagnostics);
    }
    let diagnostics = Value::Array(
        validation
            .diagnostics
            .into_iter()
            .map(|d| {
                object(vec![
                    ("code", Value::String(d.code)),
                    ("path", Value::String(d.path)),
                    ("message", Value::String(d.message)),
                    (
                        "severity",
                        text(match d.severity {
                            Severity::Error => "error",
                            Severity::Warning => "warning",
                        }),
                    ),
                ])
            })
            .collect(),
    );
    let message = crate::serialization::stringify_compact_metered(&diagnostics, ctx)?;
    Err(err(
        "CORE_REFERENCE_LINKS_SOURCE",
        message.to_utf8().unwrap_or_default(),
        "",
    ))
}
fn validate_result(
    value: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let schema = crate::serialization::read_json_value(
        &INSPECTION_SCHEMA.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        ctx,
    )?;
    let resources = engine.schema_resources_with_context(ctx)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, ctx)?;
    let errors = compiled.validate(value, ctx)?;
    if let Some(error) = errors.first() {
        return Err(err(
            "CORE_REFERENCE_LINKS_RESULT",
            error.message.to_utf8().unwrap_or_default(),
            &error.instance_path.to_utf8().unwrap_or_default(),
        ));
    }
    Ok(())
}
fn equals(value: Option<&Value>, expected: &str) -> bool {
    value.and_then(raw).is_some_and(|v| v == k(expected))
}

fn find_element<'a>(
    modules: &'a [Value],
    module_id: &Utf16,
    element_id: &Utf16,
    ctx: &mut Context<'_>,
    path: &Utf16,
) -> Result<Option<(usize, usize, &'a Value)>, EngineError> {
    for (module_index, module) in modules.iter().enumerate() {
        ctx.charge_work(module_id.units().len().saturating_add(1), path.clone())?;
        if get_metered(module, "id", ctx, path)?.and_then(raw).as_ref() != Some(module_id) {
            continue;
        }
        let Some(Value::Array(elements)) = get_metered(module, "elements", ctx, path)? else {
            return Ok(None);
        };
        for (element_index, element) in elements.iter().enumerate() {
            ctx.charge_work(element_id.units().len().saturating_add(1), path.clone())?;
            if get_metered(element, "id", ctx, path)?
                .and_then(raw)
                .as_ref()
                == Some(element_id)
            {
                return Ok(Some((module_index, element_index, element)));
            }
        }
        return Ok(None);
    }
    Ok(None)
}

/// Inspect explicitly selected direct links, retaining the complete owned source.
pub fn inspect_core_reference_links(
    input: &Value,
    identity_input: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(input, ctx)?;
    let identity = copy_json(identity_input, ctx)?;
    let fields = match &identity {
        Value::Object(fields) => fields,
        _ => {
            return Err(err(
                "CORE_REFERENCE_LINKS_IDENTITY",
                "Expected explicit qualified identity",
                "",
            ));
        }
    };
    ctx.charge_work(fields.len(), Utf16::default())?;
    if fields
        .iter()
        .any(|(key, _)| key != &k("module") && key != &k("element"))
    {
        return Err(err(
            "CORE_REFERENCE_LINKS_IDENTITY",
            "Expected explicit qualified identity",
            "",
        ));
    }
    let module = get_metered(&identity, "module", ctx, &Utf16::default())?
        .and_then(raw)
        .filter(|v| !v.is_empty());
    let element_id = get_metered(&identity, "element", ctx, &Utf16::default())?
        .and_then(raw)
        .filter(|v| !v.is_empty());
    let (Some(module), Some(element_id)) = (module, element_id) else {
        return Err(err(
            "CORE_REFERENCE_LINKS_IDENTITY",
            "Expected explicit qualified identity",
            "",
        ));
    };
    if !equals(
        get_metered(&source, "umf", ctx, &Utf16::default())?,
        "0.10.0",
    ) {
        return Err(err(
            "CORE_REFERENCE_LINKS_VERSION",
            "Current core 0.10.0 document required",
            "",
        ));
    }
    let diagnostics = validate_source(&source, engine, registry, capabilities, ctx)?;
    let modules = match get_metered(&source, "modules", ctx, &Utf16::default())? {
        Some(Value::Array(v)) => v,
        _ => {
            return Err(err(
                "CORE_REFERENCE_LINKS_MISSING",
                "Element identity is absent",
                "",
            ));
        }
    };
    let found = find_element(modules, &module, &element_id, ctx, &Utf16::default())?;
    let (mi, ei, element) = found.ok_or_else(|| {
        err(
            "CORE_REFERENCE_LINKS_MISSING",
            "Element identity is absent",
            "",
        )
    })?;
    let path = format!("/modules/{mi}/elements/{ei}/references");
    let references_value = get_metered(element, "references", ctx, &Utf16::from(path.as_str()))?;
    let meaning = if references_value.is_none() {
        object(vec![("state", text("missing"))])
    } else {
        let references = references_value.expect("references present");
        let refs = match references {
            Value::Array(v) => v,
            _ => {
                return Err(err(
                    "CORE_REFERENCE_LINKS_SOURCE",
                    "Validated references must be an array",
                    "",
                ));
            }
        };
        let mut links = Vec::with_capacity(refs.len());
        for (index, reference) in refs.iter().enumerate() {
            let at = format!("{path}/{index}");
            let at_units = Utf16::from(at.as_str());
            ctx.charge_work(1, at_units.clone())?;
            let ref_module = get_metered(reference, "module", ctx, &at_units)?
                .and_then(raw)
                .expect("validated reference module");
            let ref_element = get_metered(reference, "element", ctx, &at_units)?
                .and_then(raw)
                .expect("validated reference element");
            let target = find_element(modules, &ref_module, &ref_element, ctx, &at_units)?
                .expect("validated reference target");
            let prefix = Utf16::from(format!("{at}/"));
            let mut uninterpreted = Vec::new();
            for diagnostic in &diagnostics {
                ctx.charge_work(
                    diagnostic.path.units().len().saturating_add(1),
                    at_units.clone(),
                )?;
                if diagnostic.severity == Severity::Warning
                    && diagnostic.code == k("UNKNOWN_CORE_FIELD")
                    && (diagnostic.path == at_units
                        || diagnostic.path.units().starts_with(prefix.units()))
                {
                    uninterpreted.push(Value::String(diagnostic.path.clone()));
                }
            }
            let (tmi, tei, target_element) = target;
            let mut target_fields = vec![
                (
                    "identity",
                    object(vec![
                        ("module", Value::String(ref_module)),
                        ("element", Value::String(ref_element)),
                    ]),
                ),
                ("path", text(&format!("/modules/{tmi}/elements/{tei}"))),
            ];
            if let Some(kind) = get_metered(target_element, "kind", ctx, &at_units)? {
                target_fields.push(("kind", copy_json(kind, ctx)?));
            }
            let reference_copy = copy_json(reference, ctx)?;
            links.push(object(vec![
                ("index", Value::Number(index as f64)),
                ("path", text(&at)),
                ("reference", reference_copy),
                ("target", object(target_fields)),
                ("uninterpretedPaths", Value::Array(uninterpreted)),
                ("typeAssertion", text("unverified")),
            ]));
        }
        object(vec![
            ("state", text("present")),
            ("links", Value::Array(links)),
        ])
    };
    let result = object(vec![
        ("operation", text("inspect-core-reference-links")),
        ("version", text("0.3.0")),
        ("source", source),
        (
            "identity",
            object(vec![
                ("module", Value::String(module)),
                ("element", Value::String(element_id)),
            ]),
        ),
        ("path", text(&path)),
        ("meaning", meaning),
        ("provenance", text("unverified")),
    ]);
    validate_result(&result, engine, ctx)?;
    Ok(result)
}
