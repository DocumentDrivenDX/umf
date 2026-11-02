// SPDX-License-Identifier: MIT OR Apache-2.0
//! Rust-owned correspondence checks for the published Security disclosure 0.2 transport.
//! A successful result is data-only and carries neither authorization nor custody evidence.
use crate::{
    context::Context,
    engine::Engine,
    error::EngineError,
    serialization::Format,
    value::{copy_json, Utf16, Value},
};

fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}
fn arr(value: Option<&Value>) -> &[Value] {
    match value {
        Some(Value::Array(items)) => items,
        _ => &[],
    }
}
fn txt(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(value)) => value.to_utf8().ok(),
        _ => None,
    }
}
fn s(value: &str) -> Value {
    Value::string_utf8(value)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(key, value)| (key.into(), value))
            .collect(),
    )
}
fn diag(code: &str, path: &str, message: &str, severity: &str) -> Value {
    obj(vec![
        ("code", s(code)),
        ("path", s(path)),
        ("message", s(message)),
        ("severity", s(severity)),
    ])
}
fn exact(value: &Value, required: &[&str], optional: &[&str]) -> bool {
    let Value::Object(fields) = value else {
        return false;
    };
    required
        .iter()
        .all(|k| fields.iter().any(|(name, _)| name == &Utf16::from(*k)))
        && fields.iter().all(|(name, _)| {
            required
                .iter()
                .chain(optional)
                .any(|k| name == &Utf16::from(*k))
        })
}
fn text_unit(value: Option<&Value>) -> Option<&Utf16> {
    match value {
        Some(Value::String(v)) => Some(v),
        _ => None,
    }
}
fn ref_key(value: &Value) -> Option<(Utf16, Utf16, Utf16)> {
    if !exact(value, &["documentId", "moduleId", "elementId"], &[]) {
        return None;
    }
    let [Some(d), Some(m), Some(e)] =
        ["documentId", "moduleId", "elementId"].map(|k| text_unit(get(value, k)).cloned())
    else {
        return None;
    };
    if [&d, &m, &e].iter().any(|x| x.is_empty() || x.len() > 4096) {
        return None;
    }
    Some((d, m, e))
}
fn ref_units(reference: &(Utf16, Utf16, Utf16)) -> usize {
    reference
        .0
        .len()
        .saturating_add(reference.1.len())
        .saturating_add(reference.2.len())
}
fn same_ref_metered(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let left = ref_key(a);
    let right = ref_key(b);
    if let (Some(left), Some(right)) = (&left, &right) {
        ctx.charge_work(
            ref_units(left).saturating_add(ref_units(right)),
            Utf16::default(),
        )?;
    }
    Ok(left.is_some() && left == right)
}
fn finish(source: Value, batch: Option<Value>, params: &Value, diagnostics: Vec<Value>) -> Value {
    obj(vec![
        (
            "status",
            s(if batch.is_some() {
                "validated-disclosure"
            } else {
                "refused"
            }),
        ),
        ("source", source),
        ("batch", batch.unwrap_or(Value::Null)),
        (
            "policy",
            get(params, "policy").cloned().unwrap_or(Value::Null),
        ),
        (
            "catalog",
            get(params, "catalog").cloned().unwrap_or(Value::Null),
        ),
        (
            "closure",
            get(params, "closure").cloned().unwrap_or(Value::Null),
        ),
        ("complete", Value::Bool(false)),
        ("authority", Value::Bool(false)),
        ("diagnostics", Value::Array(diagnostics)),
    ])
}
fn fail(source: Value, params: &Value, mut ds: Vec<Value>, code: &str, msg: &str) -> Value {
    ds.push(diag(code, "", msg, "error"));
    finish(source, None, params, ds)
}
fn bounded(value: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    let mut stack = vec![value];
    let mut units = 0usize;
    while let Some(v) = stack.pop() {
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::String(x) => units = units.saturating_add(x.len()),
            Value::Array(xs) => stack.extend(xs),
            Value::Object(xs) => {
                for (k, v) in xs {
                    units = units.saturating_add(k.len());
                    stack.push(v)
                }
            }
            _ => {}
        }
        if units > 4_000_000 {
            return Ok(false);
        }
    }
    Ok(true)
}
fn find_field<'a>(
    reference: &Value,
    closure: &'a Value,
    ctx: &mut Context<'_>,
) -> Result<Option<(&'a Value, &'a Value)>, EngineError> {
    let Some((d, m, e)) = ref_key(reference) else {
        return Ok(None);
    };
    let identity_units = d.len().saturating_add(m.len()).saturating_add(e.len());
    for entry in arr(get(closure, "documents")) {
        ctx.charge_work(1usize.saturating_add(identity_units), Utf16::default())?;
        let Some(doc) = get(entry, "document") else {
            continue;
        };
        if text_unit(get(doc, "id")) != Some(&d) {
            continue;
        }
        for module in arr(get(doc, "modules")) {
            ctx.charge_work(m.len(), Utf16::default())?;
            if text_unit(get(module, "id")) != Some(&m) {
                continue;
            }
            for field in arr(get(module, "elements")) {
                ctx.charge_work(1usize.saturating_add(e.len()), Utf16::default())?;
                if text_unit(get(field, "id")) == Some(&e)
                    && txt(get(field, "kind")).as_deref() == Some("field")
                {
                    return Ok(Some((doc, field)));
                }
            }
        }
    }
    Ok(None)
}
fn find_transform<'a>(
    reference: &Value,
    catalog: &'a Value,
    ctx: &mut Context<'_>,
) -> Result<Option<&'a Value>, EngineError> {
    if !exact(reference, &["id", "version"], &[]) {
        return Ok(None);
    }
    let Some(id) = text_unit(get(reference, "id")) else {
        return Ok(None);
    };
    let Some(version) = text_unit(get(reference, "version")) else {
        return Ok(None);
    };
    if id.is_empty() || version.is_empty() || id.len() > 4096 || version.len() > 4096 {
        return Ok(None);
    }
    for transform in arr(get(catalog, "transforms")) {
        ctx.charge_work(1, Utf16::default())?;
        let candidate_id = text_unit(get(transform, "id"));
        let candidate_version = text_unit(get(transform, "version"));
        if let (Some(candidate_id), Some(candidate_version)) = (candidate_id, candidate_version) {
            ctx.charge_work(
                id.len()
                    .saturating_add(version.len())
                    .saturating_add(candidate_id.len())
                    .saturating_add(candidate_version.len()),
                Utf16::default(),
            )?;
            if candidate_id == id && candidate_version == version {
                return Ok(Some(transform));
            }
        }
    }
    Ok(None)
}
fn index(v: Option<&Value>) -> Option<usize> {
    match v {
        Some(Value::Number(n))
            if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n < 4_000_000.0 =>
        {
            Some(*n as usize)
        }
        _ => None,
    }
}
fn source_failure(error: EngineError) -> EngineError {
    if error.is_control_failure() {
        error
    } else {
        EngineError::new(
            "SECURITY_DISCLOSURE_V2",
            Utf16::default(),
            "Invalid or unsupported disclosure transport",
        )
    }
}

/// Inspect V2 transport structure and source correspondence against Rust-resolved domains.
pub fn inspect_security_disclosure_v2(
    input: &Value,
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let params = crate::security_parameters::validate_security_protection_parameters_candidate(
        policy, catalog, closure, ctx,
    )?;
    let source = match copy_json(input, ctx) {
        Ok(v) => v,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => {
            return Ok(fail(
                Value::Null,
                &params,
                arr(get(&params, "diagnostics")).to_vec(),
                &e.code,
                &e.message.to_utf8().unwrap_or_default(),
            ))
        }
    };
    if !bounded(&source, ctx)? {
        return Ok(fail(
            source,
            &params,
            arr(get(&params, "diagnostics")).to_vec(),
            "SECURITY_DISCLOSURE_V2_BOUND",
            "resource-exhausted: source key/string text exceeds4000000 UTF-16 units",
        ));
    }
    let mut ds = arr(get(&params, "diagnostics")).to_vec();
    if txt(get(&params, "status")).as_deref() != Some("validated-parameters") {
        return Ok(finish(source, None, &params, ds));
    }
    let p = get(&params, "policy").unwrap_or(&Value::Null);
    let c = get(&params, "catalog").unwrap_or(&Value::Null);
    let cl = get(&params, "closure").unwrap_or(&Value::Null);
    if !exact(
        &source,
        &[
            "version",
            "policy",
            "protection",
            "domains",
            "columns",
            "rows",
        ],
        &[],
    ) || txt(get(&source, "version")).as_deref() != Some("umf.security.disclosure/0.2.0")
    {
        return Ok(fail(
            source,
            &params,
            ds,
            "SECURITY_DISCLOSURE_V2",
            "Exact closed disclosure 0.2.0 object required",
        ));
    }
    let pins_match = [
        (get(&source, "policy").unwrap_or(&Value::Null), p),
        (get(&source, "protection").unwrap_or(&Value::Null), c),
    ]
    .into_iter()
    .all(|(pin, expected)| {
        exact(pin, &["id", "revision"], &[])
            && get(pin, "id") == get(expected, "id")
            && get(pin, "revision") == get(expected, "revision")
    });
    if !pins_match {
        return Ok(fail(
            source,
            &params,
            ds,
            "SECURITY_DISCLOSURE_V2",
            "Exact policy/catalog pin mismatch",
        ));
    }
    let pins = arr(get(cl, "pins"));
    let domain_pins = arr(get(&source, "domains"));
    if !matches!(get(&source, "domains"), Some(Value::Array(_))) || pins.len() != domain_pins.len()
    {
        return Ok(fail(
            source,
            &params,
            ds,
            "SECURITY_DISCLOSURE_V2",
            "Exact core pin bijection required",
        ));
    }
    let mut remaining = Vec::with_capacity(pins.len());
    for pin in pins {
        let (Some(document), Some(revision)) = (
            text_unit(get(pin, "documentId")),
            text_unit(get(pin, "revision")),
        ) else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Malformed resolved core pin",
            ));
        };
        if document.is_empty()
            || revision.is_empty()
            || document.len() > 4096
            || revision.len() > 4096
        {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Malformed resolved core pin",
            ));
        }
        ctx.charge_work(
            document.len().saturating_add(revision.len()),
            Utf16::default(),
        )?;
        remaining.push((document.clone(), revision.clone()));
    }
    for pin in domain_pins {
        if !exact(pin, &["documentId", "revision"], &[]) {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Stale, duplicate, or extra core pin",
            ));
        }
        let (Some(document), Some(revision)) = (
            text_unit(get(pin, "documentId")),
            text_unit(get(pin, "revision")),
        ) else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Stale, duplicate, or extra core pin",
            ));
        };
        if document.is_empty()
            || revision.is_empty()
            || document.len() > 4096
            || revision.len() > 4096
        {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Stale, duplicate, or extra core pin",
            ));
        }
        let mut match_index = None;
        for (index, (candidate_document, candidate_revision)) in remaining.iter().enumerate() {
            ctx.charge_work(
                document
                    .len()
                    .saturating_add(revision.len())
                    .saturating_add(candidate_document.len())
                    .saturating_add(candidate_revision.len()),
                Utf16::default(),
            )?;
            if candidate_document == document && candidate_revision == revision {
                match_index = Some(index);
                break;
            }
        }
        let Some(index) = match_index else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Stale, duplicate, or extra core pin",
            ));
        };
        remaining.remove(index);
    }
    if !remaining.is_empty() {
        return Ok(fail(
            source,
            &params,
            ds,
            "SECURITY_DISCLOSURE_V2",
            "Missing core pin",
        ));
    }
    let columns = arr(get(&source, "columns"));
    let rows = arr(get(&source, "rows"));
    if !matches!(get(&source, "columns"), Some(Value::Array(_)))
        || !matches!(get(&source, "rows"), Some(Value::Array(_)))
        || columns.len() > 256
        || rows.len() > 4096
        || columns.len().saturating_mul(rows.len()) > 16384
    {
        return Ok(fail(
            source,
            &params,
            ds,
            "SECURITY_DISCLOSURE_V2_BOUND",
            "resource-exhausted: column/row/cell count",
        ));
    }
    let engine = match crate::security_parameters::core_engine() {
        Ok(v) => v,
        Err(e) if e.is_control_failure() => return Err(e),
        Err(e) => {
            return Ok(fail(
                source,
                &params,
                ds,
                &e.code,
                &e.message.to_utf8().unwrap_or_default(),
            ))
        }
    };
    let transforms = arr(get(c, "transforms"));
    let mut fields = Vec::new();
    let mut seen = Vec::new();
    for column in columns {
        if !exact(
            column,
            &["field", "storageEffect"],
            &["storageTransform", "valueProfile"],
        ) {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Closed disclosure column required",
            ));
        }
        let rf = get(column, "field").unwrap_or(&Value::Null);
        let Some((doc, field)) = find_field(rf, cl, ctx)? else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Exact qualified Field missing",
            ));
        };
        let Some(key) = ref_key(rf) else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Exact qualified Field missing",
            ));
        };
        let mut duplicate = false;
        for prior in &seen {
            ctx.charge_work(
                ref_units(&key).saturating_add(ref_units(prior)),
                Utf16::default(),
            )?;
            if prior == &key {
                duplicate = true;
                break;
            }
        }
        if duplicate || !profile_ok(field, get(column, "valueProfile")) {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Duplicate Field or invalid value profile",
            ));
        }
        seen.push(key);
        match txt(get(column, "storageEffect")).as_deref() {
            Some("stored-transformed") => {
                let Some(t) = find_transform(
                    get(column, "storageTransform").unwrap_or(&Value::Null),
                    c,
                    ctx,
                )?
                else {
                    return Ok(fail(
                        source,
                        &params,
                        ds,
                        "SECURITY_DISCLOSURE_V2",
                        "Exact storage transform required",
                    ));
                };
                if !matches!(txt(get(t, "kind")).as_deref(), Some("tokenize" | "encrypt"))
                    || txt(get(
                        get(t, "custody").unwrap_or(&Value::Null),
                        "storageEffect",
                    ))
                    .as_deref()
                        != Some("stored-transformed")
                    || !same_ref_metered(get(t, "outputDomain").unwrap_or(&Value::Null), rf, ctx)?
                {
                    return Ok(fail(
                        source,
                        &params,
                        ds,
                        "SECURITY_DISCLOSURE_V2",
                        "Stored carrier must name exact storage-transform output Field",
                    ));
                }
            }
            Some("canonical") => {
                let mut declared_carrier = false;
                for transform in transforms {
                    ctx.charge_work(1, Utf16::default())?;
                    if txt(get(
                        get(transform, "custody").unwrap_or(&Value::Null),
                        "storageEffect",
                    ))
                    .as_deref()
                        == Some("stored-transformed")
                        && same_ref_metered(
                            get(transform, "outputDomain").unwrap_or(&Value::Null),
                            rf,
                            ctx,
                        )?
                    {
                        declared_carrier = true;
                        break;
                    }
                }
                if get(column, "storageTransform").is_some() || declared_carrier {
                    return Ok(fail(
                        source,
                        &params,
                        ds,
                        "SECURITY_DISCLOSURE_V2",
                        "Canonical storage tag conflicts with declared stored carrier",
                    ));
                }
            }
            _ => {
                return Ok(fail(
                    source,
                    &params,
                    ds,
                    "SECURITY_DISCLOSURE_V2",
                    "Unknown storage effect",
                ))
            }
        }
        fields.push((doc, field));
    }
    let mut literal_visits = 0usize;
    let mut literal_units = 0usize;
    for row in rows {
        let Value::Array(cells) = row else {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Rectangular ordered row required",
            ));
        };
        if cells.len() != columns.len() {
            return Ok(fail(
                source,
                &params,
                ds,
                "SECURITY_DISCLOSURE_V2",
                "Rectangular ordered row required",
            ));
        }
        for (i, cell) in cells.iter().enumerate() {
            let column = &columns[i];
            let (from_doc, from_field) = fields[i];
            if !matches!(cell, Value::Object(_)) {
                return Ok(fail(
                    source,
                    &params,
                    ds,
                    "SECURITY_DISCLOSURE_V2",
                    "Tagged cell object required",
                ));
            }
            match txt(get(cell, "disposition")).as_deref() {
                Some("withheld") => {
                    if !exact(cell, &["disposition"], &[]) {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Closed withheld cell required",
                        ));
                    }
                }
                Some("absent") => {
                    if !exact(cell, &["disposition"], &[])
                        || txt(get(from_field, "nullability")).as_deref() != Some("absent-allowed")
                    {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Absent requires explicit absent-allowed Field",
                        ));
                    }
                }
                Some("original") => {
                    if !exact(cell, &["disposition", "value"], &[]) {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Closed original cell required",
                        ));
                    }
                    match literal(
                        from_doc,
                        from_field,
                        get(cell, "value").unwrap_or(&Value::Null),
                        get(column, "valueProfile"),
                        &engine,
                        &mut literal_visits,
                        &mut literal_units,
                        ctx,
                    ) {
                        Ok(true) => {}
                        Ok(false) => {
                            return Ok(fail(
                                source,
                                &params,
                                ds,
                                "SECURITY_DISCLOSURE_V2",
                                "Original literal violates exact Field/profile",
                            ))
                        }
                        Err(e) if e.is_control_failure() => return Err(e),
                        Err(_) => {
                            return Ok(fail(
                                source,
                                &params,
                                ds,
                                "SECURITY_DISCLOSURE_V2",
                                "Original literal violates exact Field/profile",
                            ))
                        }
                    }
                }
                Some("transformed") => {
                    if !exact(
                        cell,
                        &[
                            "disposition",
                            "selection",
                            "outputDomain",
                            "transform",
                            "value",
                        ],
                        &["valueProfile"],
                    ) {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Closed transformed cell required",
                        ));
                    }
                    let selection = get(cell, "selection").unwrap_or(&Value::Null);
                    if !exact(selection, &["ruleIndex", "disclosureIndex"], &[]) {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Exact transform selection required",
                        ));
                    }
                    let (Some(ri), Some(di)) = (
                        index(get(selection, "ruleIndex")),
                        index(get(selection, "disclosureIndex")),
                    ) else {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Exact nonnegative safe selection indices required",
                        ));
                    };
                    let Some(selected) = get(p, "rules")
                        .and_then(|rules| arr(Some(rules)).get(ri))
                        .and_then(|rule| get(rule, "disclosure"))
                        .and_then(|disclosure| arr(Some(disclosure)).get(di))
                    else {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Policy transform selection missing",
                        ));
                    };
                    let disposition = get(selected, "disposition").unwrap_or(&Value::Null);
                    let Some(t) =
                        find_transform(get(cell, "transform").unwrap_or(&Value::Null), c, ctx)?
                    else {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Exact transform identity missing",
                        ));
                    };
                    let output = get(cell, "outputDomain").unwrap_or(&Value::Null);
                    let Some((to_doc, to_field)) = find_field(output, cl, ctx)? else {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Exact transform output Field missing",
                        ));
                    };
                    let column_field = get(column, "field").unwrap_or(&Value::Null);
                    let selected_matches = same_ref_metered(
                        get(selected, "field").unwrap_or(&Value::Null),
                        column_field,
                        ctx,
                    )?;
                    let input_matches = same_ref_metered(
                        get(t, "inputDomain").unwrap_or(&Value::Null),
                        column_field,
                        ctx,
                    )?;
                    let disposition_matches = same_ref_metered(
                        get(disposition, "field").unwrap_or(&Value::Null),
                        output,
                        ctx,
                    )?;
                    let transform_output_matches = same_ref_metered(
                        get(t, "outputDomain").unwrap_or(&Value::Null),
                        output,
                        ctx,
                    )?;
                    if txt(get(disposition, "kind")).as_deref() != Some("transformed")
                        || txt(get(disposition, "vocabulary")).as_deref()
                            != Some("umf.security.protection")
                        || get(disposition, "transform") != get(t, "id")
                        || get(disposition, "version") != get(t, "version")
                        || !selected_matches
                        || !input_matches
                        || !disposition_matches
                        || !transform_output_matches
                    {
                        return Ok(fail(
                            source,
                            &params,
                            ds,
                            "SECURITY_DISCLOSURE_V2",
                            "Exact selected policy/transform input/output correspondence required",
                        ));
                    }
                    match literal(
                        to_doc,
                        to_field,
                        get(cell, "value").unwrap_or(&Value::Null),
                        get(cell, "valueProfile"),
                        &engine,
                        &mut literal_visits,
                        &mut literal_units,
                        ctx,
                    ) {
                        Ok(true) => {}
                        Ok(false) => {
                            return Ok(fail(
                                source,
                                &params,
                                ds,
                                "SECURITY_DISCLOSURE_V2",
                                "Transformed literal violates exact Field/profile",
                            ))
                        }
                        Err(e) if e.is_control_failure() => return Err(e),
                        Err(_) => {
                            return Ok(fail(
                                source,
                                &params,
                                ds,
                                "SECURITY_DISCLOSURE_V2",
                                "Transformed literal violates exact Field/profile",
                            ))
                        }
                    }
                }
                _ => {
                    return Ok(fail(
                        source,
                        &params,
                        ds,
                        "SECURITY_DISCLOSURE_V2",
                        "Unknown or unsupported disposition",
                    ))
                }
            }
        }
    }
    ds.push(diag("SECURITY_DISCLOSURE_DATA_ONLY","","Transport shape/domain/source correspondence only; no row authorization, actual transform execution, current custody or native admission","warning"));
    Ok(finish(source.clone(), Some(source), &params, ds))
}

fn profile_ok(field: &Value, profile: Option<&Value>) -> bool {
    let Some(profile) = profile else { return true };
    profile == &s(crate::gregorian_date::GREGORIAN_DATE_PROFILE)
        && txt(get(field, "scalarType")).as_deref() == Some("date")
        && txt(get(field, "cardinality")).as_deref() == Some("one")
        && matches!(
            txt(get(field, "nullability")).as_deref(),
            Some("required" | "absent-allowed")
        )
        && get(field, "itemType").is_none()
        && arr(get(field, "references")).is_empty()
        && get(field, "facets")
            .is_none_or(|v| matches!(v,Value::Object(members)if members.is_empty()))
        && get(field, "allowedValues").is_none()
        && get(field, "default").is_none()
}
fn measure_literal(
    value: &Value,
    visits: &mut usize,
    units: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    let mut stack = vec![value];
    while let Some(v) = stack.pop() {
        *visits = visits.saturating_add(1);
        ctx.charge_work(1, Utf16::default())?;
        match v {
            Value::String(x) => *units = units.saturating_add(x.len()),
            Value::Array(xs) => stack.extend(xs),
            Value::Object(xs) => {
                for (k, v) in xs {
                    *units = units.saturating_add(k.len());
                    stack.push(v)
                }
            }
            _ => {}
        }
        if *units > 4_000_000 {
            return Ok(false);
        }
    }
    Ok(true)
}
fn literal(
    doc: &Value,
    field: &Value,
    input: &Value,
    profile: Option<&Value>,
    engine: &Engine,
    visits: &mut usize,
    units: &mut usize,
    ctx: &mut Context<'_>,
) -> Result<bool, EngineError> {
    if !measure_literal(input, visits, units, ctx)?
        || crate::serialization::stringify_compact_metered(input, ctx)?.len() > 4096
    {
        return Ok(false);
    }
    if profile.is_none() {
        return match engine.check_schema_literal_public(doc, field, input, ctx) {
            Ok(()) => Ok(true),
            Err(e) if e.is_control_failure() => Err(e),
            Err(_) => Ok(false),
        };
    }
    if !profile_ok(field, profile) {
        return Ok(false);
    }
    if input == &Value::Null {
        return Ok(txt(get(field, "nullability")).as_deref() == Some("absent-allowed"));
    }
    if !exact(input, &["date"], &[]) {
        return Ok(false);
    }
    Ok(
        crate::gregorian_date::parse_gregorian_date(get(input, "date").unwrap_or(&Value::Null))
            .is_ok(),
    )
}

pub fn encode_security_disclosure_v2(
    input: &Value,
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let result = inspect_security_disclosure_v2(input, policy, catalog, closure, ctx)?;
    if txt(get(&result, "status")).as_deref() != Some("validated-disclosure") {
        return Err(EngineError::new(
            "SECURITY_DISCLOSURE_V2",
            Utf16::default(),
            "Invalid or unsupported disclosure transport",
        ));
    }
    let batch = get(&result, "batch").ok_or_else(|| {
        EngineError::new(
            "SECURITY_DISCLOSURE_V2",
            Utf16::default(),
            "Invalid or unsupported disclosure transport",
        )
    })?;
    let text = crate::security_policy_source::write_security_source(batch, format, ctx)
        .map_err(source_failure)?;
    Ok(Value::String(text))
}
pub fn decode_security_disclosure_v2(
    source: &Utf16,
    policy: &Value,
    catalog: &Value,
    closure: &Value,
    format: Format,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let parsed = crate::security_policy_source::read_security_source(source.units(), format, ctx)
        .map_err(source_failure)?;
    let result = inspect_security_disclosure_v2(&parsed, policy, catalog, closure, ctx)?;
    if txt(get(&result, "status")).as_deref() == Some("validated-disclosure") {
        Ok(get(&result, "batch").cloned().unwrap_or(Value::Null))
    } else {
        Err(EngineError::new(
            "SECURITY_DISCLOSURE_V2",
            Utf16::default(),
            "Invalid or unsupported disclosure transport",
        ))
    }
}
