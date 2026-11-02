// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned validation and public document operations for `umf.dashboard`.
use crate::{
    context::Context,
    engine::{Capabilities, CapabilityError, Engine, ResourceSet, SemanticContext},
    error::{Diagnostic, EngineError, Severity, Validation},
    registry::Registry,
    serialization::{self, Format},
    value::{copy_json, Utf16, Value},
};

const TOKEN: u64 = 0x4441_5348_424f_4152;
const DASHBOARD_ID: &str = "umf.dashboard";
const DASHBOARD_VERSION: &str = "0.1.0";

fn k(text: &str) -> Utf16 {
    Utf16::from(text)
}
fn err(code: &'static str, message: &'static str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, value)| value),
        _ => None,
    }
}
fn get_key<'a>(value: &'a Value, name: &Utf16) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value),
        _ => None,
    }
}
fn text(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(text)) => Some(text),
        _ => None,
    }
}
fn array(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(values)) => values,
        _ => &[],
    }
}
fn object(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(name, value)| (k(name), value))
            .collect(),
    )
}
fn set(value: &mut Value, name: &str, next: Value) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(err("DASHBOARD_DOCUMENT", "Expected object"));
    };
    if let Some((_, old)) = fields.iter_mut().find(|(key, _)| key == &k(name)) {
        *old = next;
    } else {
        fields.push((k(name), next));
    }
    Ok(())
}
fn pointer(value: &Utf16) -> Utf16 {
    let mut out = Vec::with_capacity(value.len());
    for unit in value.units() {
        match *unit {
            0x7e => out.extend("~0".encode_utf16()),
            0x2f => out.extend("~1".encode_utf16()),
            other => out.push(other),
        }
    }
    Utf16::new(out)
}
fn diag(code: &str, path: Utf16, message: impl Into<Utf16>, severity: Severity) -> Diagnostic {
    Diagnostic {
        code: k(code),
        path,
        python_source_path: false,
        message: message.into(),
        severity,
        python_text_origin: None,
    }
}
fn push_utf16(
    out: &mut Vec<Diagnostic>,
    base: &Utf16,
    code: &str,
    suffix: &Utf16,
    message: impl Into<Utf16>,
    severity: Severity,
) {
    let mut units = base.units().to_vec();
    units.extend(suffix.units());
    out.push(diag(code, Utf16::new(units), message, severity));
}
fn push(
    out: &mut Vec<Diagnostic>,
    base: &Utf16,
    code: &str,
    suffix: &str,
    message: impl Into<Utf16>,
    severity: Severity,
) {
    let mut units = base.units().to_vec();
    units.extend(suffix.encode_utf16());
    out.push(diag(code, Utf16::new(units), message, severity));
}

struct DashboardCapabilities {
    manifest: Value,
}
impl Capabilities for DashboardCapabilities {
    fn validate_extension(
        &mut self,
        token: u64,
        _payload: &Value,
        _context: &SemanticContext,
    ) -> Result<Vec<Diagnostic>, Utf16> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        Err(Utf16::from(
            "Dashboard semantic validation requires the invocation Context",
        ))
    }
    fn validate_extension_with_context(
        &mut self,
        token: u64,
        payload: &Value,
        context: &SemanticContext,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Diagnostic>, CapabilityError> {
        if token != TOKEN {
            return Ok(Vec::new());
        }
        dashboard_semantics(
            payload,
            &context.document,
            &context.path,
            &context.scope,
            &self.manifest,
            ctx,
        )
        .map_err(CapabilityError::Engine)
    }
}

fn resource(source: &str, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let units: Vec<u16> = source.encode_utf16().collect();
    ctx.charge_text(units.len(), Utf16::default())?;
    serialization::read_json_value(&units, Format::Json, ctx)
}
fn resources(ctx: &mut Context<'_>) -> Result<(Engine, Registry, Value), EngineError> {
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
        include_str!("../../../spec/extensions/dashboard/package.json"),
        ctx,
    )?;
    let id = text(get(&manifest, "id"))
        .cloned()
        .ok_or_else(|| err("DASHBOARD_RESOURCE", "Dashboard package id is missing"))?;
    let version = text(get(&manifest, "version"))
        .cloned()
        .ok_or_else(|| err("DASHBOARD_RESOURCE", "Dashboard package version is missing"))?;
    let scopes = array(get(&manifest, "scopes"))
        .iter()
        .map(|scope| {
            text(Some(scope))
                .cloned()
                .ok_or_else(|| err("DASHBOARD_RESOURCE", "Dashboard scope is malformed"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let schema = get(&manifest, "schema")
        .ok_or_else(|| err("DASHBOARD_RESOURCE", "Dashboard package schema is missing"))?;
    let schema_resources = engine.schema_resources_with_context(ctx)?;
    let mut registry = Registry::new();
    registry.register_extension(
        &id,
        &version,
        &scopes,
        schema,
        true,
        Some(TOKEN),
        engine.package_schema(),
        &schema_resources,
        ctx,
    )?;
    Ok((engine, registry, manifest))
}

fn extension<'a>(value: &'a Value) -> Option<&'a Value> {
    get(get(value, "extensions")?, DASHBOARD_ID)
}
fn kind(value: &Value) -> Option<&Utf16> {
    text(get(value, "kind"))
}
fn eq(value: Option<&Value>, expected: &str) -> bool {
    text(value).is_some_and(|value| value == &k(expected))
}
fn string(value: &str) -> Value {
    Value::String(k(value))
}
fn indexed_path(base: &str, field: &str, index: usize) -> String {
    format!("{base}/{field}/{index}")
}
fn ref_display(reference: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    serialization::stringify_compact_metered(reference, ctx)
}
fn missing_dataset_message(reference: &Value, ctx: &mut Context<'_>) -> Result<Utf16, EngineError> {
    let mut units = k("Missing dashboard dataset ").units().to_vec();
    units.extend_from_slice(ref_display(reference, ctx)?.units());
    Ok(Utf16::new(units))
}

fn unknown(
    node: &Value,
    schema: &Value,
    defs: &Value,
    base: &Utf16,
    suffix: &Utf16,
    out: &mut Vec<Diagnostic>,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    ctx.charge_work(1, base.clone())?;
    let mut selected_schema = schema;
    if let Some(reference) = text(get(schema, "$ref")) {
        let name = reference
            .units()
            .split(|unit| *unit == b'/' as u16)
            .last()
            .unwrap_or(&[]);
        let name = Utf16::new(name.to_vec());
        let definitions = get(defs, "$defs").unwrap_or(&Value::Null);
        let Some(resolved) = get_key(definitions, &name) else {
            return Ok(());
        };
        selected_schema = resolved;
    }
    if let Some(Value::Array(choices)) = get(selected_schema, "oneOf") {
        let node_kind = get(node, "kind");
        let mut chosen = None;
        for choice in choices {
            let constant = get(
                get(get(choice, "properties").unwrap_or(&Value::Null), "kind")
                    .unwrap_or(&Value::Null),
                "const",
            );
            if constant == node_kind {
                chosen = Some(choice);
                break;
            }
        }
        if let Some(choice) = chosen {
            return unknown(node, choice, defs, base, suffix, out, ctx);
        }
        return Ok(());
    }
    if eq(get(selected_schema, "type"), "object") {
        let Value::Object(properties) = node else {
            return Ok(());
        };
        let schema_properties = get(selected_schema, "properties").unwrap_or(&Value::Null);
        let additional = get(selected_schema, "additionalProperties")
            .filter(|schema| matches!(schema, Value::Object(_)));
        for (name, child) in properties {
            ctx.charge_work(name.len(), base.clone())?;
            let property_schema = get_key(schema_properties, name).or(additional);
            let mut child_suffix = suffix.units().to_vec();
            child_suffix.push(b'/' as u16);
            child_suffix.extend(pointer(name).units());
            let child_suffix = Utf16::new(child_suffix);
            if let Some(property_schema) = property_schema {
                unknown(child, property_schema, defs, base, &child_suffix, out, ctx)?;
            } else {
                push_utf16(
                    out,
                    base,
                    "DASHBOARD_UNKNOWN",
                    &child_suffix,
                    "Unknown dashboard content retained",
                    Severity::Warning,
                );
            }
        }
    } else if eq(get(selected_schema, "type"), "array") {
        if let (Value::Array(values), Some(items)) = (node, get(selected_schema, "items")) {
            for (index, child) in values.iter().enumerate() {
                let index = index.to_string();
                ctx.charge_work(index.len().saturating_add(1), base.clone())?;
                let mut child_suffix = suffix.units().to_vec();
                child_suffix.push(b'/' as u16);
                child_suffix.extend(index.encode_utf16());
                unknown(
                    child,
                    items,
                    defs,
                    base,
                    &Utf16::new(child_suffix),
                    out,
                    ctx,
                )?;
            }
        }
    }
    Ok(())
}

fn dashboard_semantics(
    payload: &Value,
    document: &Value,
    path: &Utf16,
    scope: &str,
    manifest: &Value,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut out = Vec::new();
    let p_kind = kind(payload)
        .and_then(|value| value.to_utf8().ok())
        .unwrap_or_default();
    let schema_defs =
        get(get(manifest, "schema").unwrap_or(&Value::Null), "$defs").unwrap_or(&Value::Null);
    if let Some(schema) = get(schema_defs, &p_kind) {
        unknown(
            payload,
            schema,
            get(manifest, "schema").unwrap_or(&Value::Null),
            path,
            &Utf16::default(),
            &mut out,
            ctx,
        )?;
    }
    let module_index = path.to_utf8().ok().and_then(|path| {
        let start = path.strip_prefix("/modules/")?;
        let (index, suffix) = start.split_once('/')?;
        let module_extension = suffix == "extensions/umf.dashboard";
        let element_extension = suffix
            .strip_prefix("elements/")
            .and_then(|tail| tail.split_once('/'))
            .is_some_and(|(element, rest)| {
                !element.is_empty() && rest == "extensions/umf.dashboard"
            });
        if module_extension || element_extension {
            index.parse::<usize>().ok()
        } else {
            None
        }
    });
    let modules = array(get(document, "modules"));
    let local = module_index.and_then(|index| modules.get(index));
    let root = extension(document);
    let expected_scope = match p_kind.as_str() {
        "dashboard" => "document",
        "page" | "data" => "module",
        "dataset" | "visual" | "text" | "filter" => "element",
        _ => "",
    };
    if scope != expected_scope {
        push(
            &mut out,
            path,
            "DASHBOARD_SCOPE",
            "",
            "Dashboard declaration has the wrong attachment scope",
            Severity::Error,
        );
        return Ok(out);
    }
    if scope == "element" {
        let container = local.and_then(extension).and_then(kind);
        if !eq(root.and_then(|value| get(value, "kind")), "dashboard") {
            push(
                &mut out,
                path,
                "DASHBOARD_ROOT",
                "",
                "Dashboard elements require a document-level dashboard declaration",
                Severity::Error,
            );
        }
        if p_kind == "dataset" && container != Some(&k("data")) {
            push(
                &mut out,
                path,
                "DASHBOARD_PLACEMENT",
                "",
                "Datasets belong in a data module",
                Severity::Error,
            );
        }
        if ["visual", "text", "filter"].contains(&p_kind.as_str()) && container != Some(&k("page"))
        {
            push(
                &mut out,
                path,
                "DASHBOARD_PLACEMENT",
                "",
                "Visuals, text and filters belong in a page module",
                Severity::Error,
            );
        }
        if container == Some(&k("page"))
            && eq(
                local
                    .and_then(extension)
                    .and_then(|value| get(value, "role")),
                "global-filters",
            )
            && p_kind != "filter"
        {
            push(
                &mut out,
                path,
                "DASHBOARD_GLOBAL_FILTERS",
                "",
                "A global-filters page holds only filters",
                Severity::Error,
            );
        }
        if ["visual", "text", "filter"].contains(&p_kind.as_str()) {
            if let (Some(position), Some(columns)) = (
                get(payload, "position"),
                get(
                    root.and_then(|value| get(value, "layout"))
                        .unwrap_or(&Value::Null),
                    "columns",
                ),
            ) {
                if let (Some(x), Some(width), Value::Number(columns)) = (
                    get(position, "x").and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n)
                        } else {
                            None
                        }
                    }),
                    get(position, "width").and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n)
                        } else {
                            None
                        }
                    }),
                    columns,
                ) {
                    if x + width > *columns {
                        push(
                            &mut out,
                            path,
                            "DASHBOARD_LAYOUT",
                            "/position",
                            "Position exceeds the declared grid columns",
                            Severity::Error,
                        );
                    }
                }
            }
        }
    }
    if p_kind == "dashboard" {
        let pages: Vec<&Value> = modules
            .iter()
            .filter(|module| {
                eq(
                    extension(module).and_then(|value| get(value, "kind")),
                    "page",
                )
            })
            .collect();
        let mut listed: Vec<Utf16> = Vec::new();
        for (index, id) in array(get(payload, "pages")).iter().enumerate() {
            ctx.charge_work(1, path.clone())?;
            let Some(id) = text(Some(id)) else {
                continue;
            };
            if listed.contains(id) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_PAGES",
                    &format!("/pages/{index}"),
                    "Page is listed more than once",
                    Severity::Error,
                );
            }
            listed.push(id.clone());
            if !pages
                .iter()
                .any(|module| text(get(module, "id")) == Some(id))
            {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_PAGES",
                    &format!("/pages/{index}"),
                    "Listed page is not a page module",
                    Severity::Error,
                );
            }
        }
        for module in &pages {
            let Some(id) = text(get(module, "id")) else {
                continue;
            };
            if !listed.contains(id) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_PAGES",
                    "/pages",
                    format!("Page module {:?} is not listed in page order", id),
                    Severity::Error,
                );
            }
        }
        let mut traces: Vec<(Utf16, Utf16)> = Vec::new();
        for module in modules {
            ctx.charge_work(1, path.clone())?;
            for element in array(get(module, "elements")) {
                ctx.charge_work(1, path.clone())?;
                let Some(trace) = text(get(extension(element).unwrap_or(&Value::Null), "trace"))
                else {
                    continue;
                };
                let mut owner_units = text(get(module, "id"))
                    .map(Utf16::units)
                    .unwrap_or(&[])
                    .to_vec();
                owner_units.push(0);
                owner_units.extend(text(get(element, "id")).map(Utf16::units).unwrap_or(&[]));
                let owner = Utf16::new(owner_units);
                ctx.charge_work(trace.len().saturating_add(owner.len()), path.clone())?;
                let mut previous = None;
                for (candidate, prior_owner) in &traces {
                    ctx.charge_work(candidate.len().saturating_add(trace.len()), path.clone())?;
                    if candidate == trace {
                        previous = Some(prior_owner);
                        break;
                    }
                }
                if let Some(previous) = previous {
                    let mut message = "Trace id is shared by ".encode_utf16().collect::<Vec<_>>();
                    message.extend(previous.units());
                    message.extend(" and ".encode_utf16());
                    message.extend(owner.units());
                    push(
                        &mut out,
                        path,
                        "DASHBOARD_TRACE",
                        "",
                        Utf16::new(message),
                        Severity::Error,
                    );
                } else {
                    traces.push((trace.clone(), owner));
                }
            }
        }
        for page in pages {
            let mut boxes: Vec<(&Value, &Value)> = Vec::new();
            for element in array(get(page, "elements")) {
                ctx.charge_work(1, path.clone())?;
                if let Some(position) = (|| {
                    let value = extension(element)?;
                    let kind = kind(value)?.to_utf8().ok()?;
                    if !["visual", "text", "filter"].contains(&kind.as_str()) {
                        return None;
                    }
                    get(value, "position")
                })() {
                    boxes.push((element, position));
                }
            }
            for i in 0..boxes.len() {
                for j in i + 1..boxes.len() {
                    ctx.charge_work(1, path.clone())?;
                    let (a, b) = (boxes[i].1, boxes[j].1);
                    let number = |value: Option<&Value>| {
                        value
                            .and_then(|v| {
                                if let Value::Number(n) = v {
                                    Some(*n)
                                } else {
                                    None
                                }
                            })
                            .unwrap_or(0.0)
                    };
                    let (ax, ay, aw, ah, bx, by, bw, bh) = (
                        number(get(a, "x")),
                        number(get(a, "y")),
                        number(get(a, "width")),
                        number(get(a, "height")),
                        number(get(b, "x")),
                        number(get(b, "y")),
                        number(get(b, "width")),
                        number(get(b, "height")),
                    );
                    if ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah {
                        let left = text(get(boxes[i].0, "id")).cloned().unwrap_or_default();
                        let right = text(get(boxes[j].0, "id")).cloned().unwrap_or_default();
                        let page_id = text(get(page, "id")).cloned().unwrap_or_default();
                        let mut message = "Items ".encode_utf16().collect::<Vec<_>>();
                        message.extend(left.units());
                        message.extend(" and ".encode_utf16());
                        message.extend(right.units());
                        message.extend(" overlap on page ".encode_utf16());
                        message.extend(page_id.units());
                        message.extend("; rendering order is unspecified".encode_utf16());
                        push(
                            &mut out,
                            path,
                            "DASHBOARD_LAYOUT_OVERLAP",
                            "/pages",
                            Utf16::new(message),
                            Severity::Warning,
                        );
                    }
                }
            }
        }
    }
    if p_kind == "dataset" {
        if eq(
            get(get(payload, "source").unwrap_or(&Value::Null), "kind"),
            "query",
        ) {
            push(&mut out,path,"DASHBOARD_EXPRESSION_OPAQUE","/source/query","Expression is preserved with its language/version; it is not parsed, executed or translated",Severity::Warning);
        }
        if let Value::Object(fields) = get(payload, "fields").unwrap_or(&Value::Null) {
            for (name, field) in fields {
                if eq(get(field, "role"), "measure") && get(field, "expression").is_none() {
                    push(
                        &mut out,
                        path,
                        "DASHBOARD_MEASURE",
                        &format!("/fields/{}/", pointer(name).to_utf8().unwrap_or_default()),
                        "Measure fields declare their aggregate expression",
                        Severity::Error,
                    );
                }
                if get(field, "expression").is_some() {
                    let mut suffix = format!(
                        "/fields/{}/expression",
                        pointer(name).to_utf8().unwrap_or_default()
                    );
                    if suffix.ends_with('/') {
                        suffix.pop();
                    }
                    push(&mut out,path,"DASHBOARD_EXPRESSION_OPAQUE",&suffix,"Expression is preserved with its language/version; it is not parsed, executed or translated",Severity::Warning);
                }
            }
        }
    }
    if p_kind == "visual" {
        let dataset_ref = get(payload, "dataset").unwrap_or(&Value::Null);
        let mut dataset = None;
        let module_id = text(get(dataset_ref, "module"));
        let element_id = text(get(dataset_ref, "element"));
        if let (Some(module_id), Some(element_id)) = (module_id, element_id) {
            'modules: for module in modules {
                ctx.charge_work(module_id.len() + 1, path.clone())?;
                if text(get(module, "id")) != Some(module_id) {
                    continue;
                }
                for element in array(get(module, "elements")) {
                    ctx.charge_work(element_id.len() + 1, path.clone())?;
                    if text(get(element, "id")) == Some(element_id) {
                        dataset = extension(element);
                        break 'modules;
                    }
                }
            }
        }
        if dataset.is_none() {
            push(
                &mut out,
                path,
                "DASHBOARD_REFERENCE",
                "/dataset",
                missing_dataset_message(dataset_ref, ctx)?,
                Severity::Error,
            );
        } else if !eq(dataset.and_then(|value| get(value, "kind")), "dataset") {
            push(
                &mut out,
                path,
                "DASHBOARD_REFERENCE",
                "/dataset",
                "Reference must denote a dataset",
                Severity::Error,
            );
        }
        let chart = text(get(payload, "chart"))
            .and_then(|value| value.to_utf8().ok())
            .unwrap_or_default();
        let (required, allowed): (&[&str], &[&str]) = match chart.as_str() {
            "counter" => (&["value"], &["value", "target", "tooltip"]),
            "bar" | "line" | "area" => (
                &["x", "y"],
                &["x", "y", "color", "label", "detail", "tooltip"],
            ),
            "scatter" => (
                &["x", "y"],
                &["x", "y", "color", "size", "label", "detail", "tooltip"],
            ),
            "pie" => (&["angle", "color"], &["angle", "color", "label", "tooltip"]),
            "heatmap" => (
                &["x", "y", "color"],
                &["x", "y", "color", "label", "tooltip"],
            ),
            "table" => (&["column"], &["column"]),
            _ => (&[], &[]),
        };
        let mut counts: Vec<(Utf16, usize)> = Vec::new();
        for (index, encoding) in array(get(payload, "encodings")).iter().enumerate() {
            ctx.charge_work(1, path.clone())?;
            let channel = text(get(encoding, "channel")).cloned().unwrap_or_default();
            let entry = counts
                .iter_mut()
                .find(|(candidate, _)| candidate == &channel);
            if let Some((_, count)) = entry {
                *count += 1
            } else {
                counts.push((channel.clone(), 1));
            }
            let suffix = indexed_path("", "encodings", index);
            let channel_name = channel.to_utf8().unwrap_or_default();
            if !allowed.contains(&channel_name.as_str()) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_ENCODING",
                    &suffix,
                    format!("Channel {} is not used by a {} visual", channel_name, chart),
                    Severity::Error,
                );
            }
            let field_name = text(get(encoding, "field")).cloned().unwrap_or_default();
            let field = dataset.and_then(|ds| {
                get(
                    get(ds, "fields").unwrap_or(&Value::Null),
                    &field_name.to_utf8().unwrap_or_default(),
                )
            });
            if dataset.is_some() && field.is_none() {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_FIELD",
                    &format!("{suffix}/field"),
                    "Field is not declared by the dataset",
                    Severity::Error,
                );
            }
            if field.is_some_and(|field| eq(get(field, "role"), "measure"))
                && !eq(get(encoding, "aggregation"), "measure")
            {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_AGGREGATION",
                    &suffix,
                    "Measure fields are used through their declared aggregate",
                    Severity::Error,
                );
            }
            if field.is_some_and(|field| eq(get(field, "role"), "column"))
                && eq(get(encoding, "aggregation"), "measure")
            {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_AGGREGATION",
                    &suffix,
                    "Only measure fields use aggregation measure",
                    Severity::Error,
                );
            }
            let custom = eq(get(encoding, "aggregation"), "custom");
            if custom != get(encoding, "expression").is_some() {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_AGGREGATION",
                    &suffix,
                    "A custom aggregation and an encoding expression require each other",
                    Severity::Error,
                );
            }
            if eq(get(payload, "rows"), "detail") && !eq(get(encoding, "aggregation"), "none") {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_AGGREGATION",
                    &suffix,
                    "Detail rows are not aggregated",
                    Severity::Error,
                );
            }
            if let Some(sort) = get(encoding, "sort") {
                if eq(get(sort, "by"), "custom") != get(sort, "values").is_some() {
                    push(
                        &mut out,
                        path,
                        "DASHBOARD_SORT",
                        &format!("{suffix}/sort"),
                        "Custom sort and explicit sort values require each other",
                        Severity::Error,
                    );
                }
            }
            if get(encoding, "expression").is_some() {
                push(&mut out,path,"DASHBOARD_EXPRESSION_OPAQUE",&format!("{suffix}/expression"),"Expression is preserved with its language/version; it is not parsed, executed or translated",Severity::Warning);
            }
        }
        for channel in required {
            if !counts.iter().any(|(candidate, _)| candidate == &k(channel)) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_ENCODING",
                    "/encodings",
                    format!("A {} visual requires channel {}", chart, channel),
                    Severity::Error,
                );
            }
        }
        for channel in ["x", "value", "target", "angle", "color", "size"] {
            if counts
                .iter()
                .find(|(candidate, _)| candidate == &k(channel))
                .is_some_and(|(_, count)| *count > 1)
            {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_ENCODING",
                    "/encodings",
                    format!("Channel {} may appear only once", channel),
                    Severity::Error,
                );
            }
        }
    }
    if p_kind == "filter" {
        let mut seen: Vec<Utf16> = Vec::new();
        for (index, target) in array(get(payload, "targets")).iter().enumerate() {
            ctx.charge_work(1, path.clone())?;
            let dataset_ref = get(target, "dataset").unwrap_or(&Value::Null);
            let field = text(get(target, "field")).cloned().unwrap_or_default();
            let display = ref_display(dataset_ref, ctx)?;
            let mut key_units = display.units().to_vec();
            key_units.push(0);
            key_units.extend(field.units());
            let key = Utf16::new(key_units);
            if seen.contains(&key) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_FILTER",
                    &format!("/targets/{index}"),
                    "Duplicate filter target",
                    Severity::Error,
                );
            }
            seen.push(key);
            let mut dataset = None;
            let module_id = text(get(dataset_ref, "module"));
            let element_id = text(get(dataset_ref, "element"));
            if let (Some(module_id), Some(element_id)) = (module_id, element_id) {
                'modules: for module in modules {
                    ctx.charge_work(module_id.len() + 1, path.clone())?;
                    if text(get(module, "id")) != Some(module_id) {
                        continue;
                    }
                    for element in array(get(module, "elements")) {
                        ctx.charge_work(element_id.len() + 1, path.clone())?;
                        if text(get(element, "id")) == Some(element_id) {
                            dataset = extension(element);
                            break 'modules;
                        }
                    }
                }
            }
            if dataset.is_none() {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_REFERENCE",
                    &format!("/targets/{index}/dataset"),
                    missing_dataset_message(dataset_ref, ctx)?,
                    Severity::Error,
                );
                continue;
            }
            let field_value = dataset.and_then(|ds| {
                get(
                    get(ds, "fields").unwrap_or(&Value::Null),
                    &field.to_utf8().unwrap_or_default(),
                )
            });
            if field_value.is_none() {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_FIELD",
                    &format!("/targets/{index}/field"),
                    "Field is not declared by the dataset",
                    Severity::Error,
                );
            }
            if field_value.is_some_and(|value| eq(get(value, "role"), "measure")) {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_FILTER",
                    &format!("/targets/{index}"),
                    "Filters target column fields, not aggregate measures",
                    Severity::Error,
                );
            }
            if eq(get(payload, "control"), "date-range")
                && field_value
                    .and_then(|value| text(get(value, "type")))
                    .is_some_and(|value| value != &k("date") && value != &k("date-time"))
            {
                push(
                    &mut out,
                    path,
                    "DASHBOARD_FILTER",
                    &format!("/targets/{index}"),
                    "A date-range filter targets date or date-time fields",
                    Severity::Error,
                );
            }
        }
        if eq(get(payload, "control"), "single-select") {
            if let Some(default) = get(payload, "default") {
                if array(get(default, "values")).len() != 1 {
                    push(
                        &mut out,
                        path,
                        "DASHBOARD_FILTER",
                        "/default",
                        "A single-select default has exactly one value",
                        Severity::Error,
                    );
                }
            }
        }
    }
    for diagnostic in &out {
        ctx.charge_work(
            diagnostic
                .code
                .len()
                .saturating_add(diagnostic.path.len())
                .saturating_add(diagnostic.message.len()),
            diagnostic.path.clone(),
        )?;
    }
    Ok(out)
}

struct DashboardResources {
    engine: Engine,
    registry: Registry,
    manifest: Value,
}
impl DashboardResources {
    fn new(ctx: &mut Context<'_>) -> Result<Self, EngineError> {
        let (engine, registry, manifest) = resources(ctx)?;
        Ok(Self {
            engine,
            registry,
            manifest,
        })
    }
    fn validate(&self, document: &Value, ctx: &mut Context<'_>) -> Result<Validation, EngineError> {
        self.engine.validate_document(
            document,
            &self.registry,
            &mut DashboardCapabilities {
                manifest: copy_json(&self.manifest, ctx)?,
            },
            ctx,
        )
    }
}

fn diagnostic_value(d: Diagnostic) -> Value {
    object(vec![
        ("code", Value::String(d.code)),
        ("path", Value::String(d.path)),
        ("message", Value::String(d.message)),
        (
            "severity",
            string(match d.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            }),
        ),
    ])
}
fn profile(document: &Value) -> Result<(), EngineError> {
    if text(
        get(
            get(document, "vocabularies").unwrap_or(&Value::Null),
            DASHBOARD_ID,
        )
        .and_then(|v| get(v, "version")),
    )
    .is_some_and(|v| v == &k(DASHBOARD_VERSION))
        && eq(
            extension(document).and_then(|v| get(v, "kind")),
            "dashboard",
        )
    {
        Ok(())
    } else {
        Err(err(
            "DASHBOARD_PROFILE",
            "Expected umf.dashboard 0.1.0 and a document-level dashboard",
        ))
    }
}
fn document_report(document: &Value, ctx: &mut Context<'_>) -> Result<Validation, EngineError> {
    let resources = DashboardResources::new(ctx)?;
    resources.validate(document, ctx)
}

fn validation_value(validation: Validation) -> Value {
    object(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        (
            "diagnostics",
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(diagnostic_value)
                    .collect(),
            ),
        ),
    ])
}

pub fn execute(request: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let op = text(get(request, "op"))
        .and_then(|v| v.to_utf8().ok())
        .unwrap_or_default();
    if text(get(request, "profile")) != Some(&k("umf.dashboard-public/1.0.0")) {
        return Err(err("REQUEST", "Wrong Dashboard public profile"));
    }
    match op.as_str() {
        "validateDashboardSemantics" => {
            let payload =
                get(request, "payload").ok_or_else(|| err("REQUEST", "payload required"))?;
            let document =
                get(request, "document").ok_or_else(|| err("REQUEST", "document required"))?;
            let path = text(get(request, "path")).ok_or_else(|| err("REQUEST", "path required"))?;
            let scope = text(get(request, "scope"))
                .and_then(|v| v.to_utf8().ok())
                .unwrap_or_default();
            let (_, _, manifest) = resources(ctx)?;
            let diagnostics = dashboard_semantics(payload, document, path, &scope, &manifest, ctx)?;
            Ok(Value::Array(
                diagnostics
                    .into_iter()
                    .map(|d| {
                        object(vec![
                            ("code", Value::String(d.code)),
                            ("path", Value::String(d.path)),
                            ("message", Value::String(d.message)),
                            (
                                "severity",
                                string(match d.severity {
                                    Severity::Error => "error",
                                    Severity::Warning => "warning",
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ))
        }
        "inspectDashboard" => {
            let document = copy_json(
                get(request, "document").ok_or_else(|| err("REQUEST", "document required"))?,
                ctx,
            )?;
            Ok(validation_value(document_report(&document, ctx)?))
        }
        "readDashboardDocument" => {
            let source =
                text(get(request, "source")).ok_or_else(|| err("REQUEST", "source required"))?;
            let format = format(
                text(get(request, "format"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    .unwrap_or("yaml"),
            )?;
            let document = serialization::read_json_value(source.units(), format, ctx)?;
            profile(&document)?;
            let validation = document_report(&document, ctx)?;
            if !validation.valid {
                return Err(EngineError::new(
                    "DASHBOARD_DOCUMENT",
                    Utf16::default(),
                    "Dashboard document is invalid",
                ));
            }
            Ok(document)
        }
        "writeDashboardDocument" => {
            let document = copy_json(
                get(request, "document").ok_or_else(|| err("REQUEST", "document required"))?,
                ctx,
            )?;
            let format = format(
                text(get(request, "format"))
                    .and_then(|v| v.to_utf8().ok())
                    .as_deref()
                    .unwrap_or("yaml"),
            )?;
            profile(&document)?;
            let validation = document_report(&document, ctx)?;
            if !validation.valid {
                return Err(EngineError::new(
                    "DASHBOARD_DOCUMENT",
                    Utf16::default(),
                    "Dashboard document is invalid",
                ));
            }
            Ok(Value::String(serialization::write_json_value(
                &document, format, ctx,
            )?))
        }
        "getDashboardDefinition" => {
            let document =
                get(request, "document").ok_or_else(|| err("REQUEST", "document required"))?;
            profile(document)?;
            let validation = document_report(document, ctx)?;
            if !validation.valid {
                return Err(EngineError::new(
                    "DASHBOARD_DOCUMENT",
                    Utf16::default(),
                    "Invalid dashboard model",
                ));
            }
            let module =
                text(get(request, "module")).ok_or_else(|| err("REQUEST", "module required"))?;
            let element =
                text(get(request, "element")).ok_or_else(|| err("REQUEST", "element required"))?;
            for m in array(get(document, "modules")) {
                ctx.charge_work(module.len(), Utf16::default())?;
                if text(get(m, "id")) != Some(module) {
                    continue;
                }
                for e in array(get(m, "elements")) {
                    ctx.charge_work(element.len(), Utf16::default())?;
                    if text(get(e, "id")) == Some(element) {
                        return copy_json(
                            extension(e).ok_or_else(|| {
                                err("DASHBOARD_REFERENCE", "Missing dashboard definition")
                            })?,
                            ctx,
                        );
                    }
                }
            }
            Err(err("DASHBOARD_REFERENCE", "Missing dashboard definition"))
        }
        _ => Err(err("REQUEST", "Unknown Dashboard public operation")),
    }
}
fn format(name: &str) -> Result<Format, EngineError> {
    match name {
        "json" => Ok(Format::Json),
        "yaml" => Ok(Format::Yaml),
        _ => Err(err("FORMAT", "Format must be json or yaml")),
    }
}
