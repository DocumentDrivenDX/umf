//! Opt-in CONTRACT-053 finite CSV Boolean lexical conversion.
use crate::{
    context::Context,
    engine::Engine,
    error::EngineError,
    value::{Utf16, Value, copy_json},
};

fn k(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(v: &'a Value, name: &str) -> Option<&'a Value> {
    match v {
        Value::Object(fields) => fields
            .iter()
            .find(|(key, _)| key == &k(name))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

// Counts compact JSON.stringify UTF-8 bytes, stopping as soon as the ceiling is crossed.
fn bytes(v: &Value, total: &mut usize, max: usize) -> Result<(), EngineError> {
    let add = |n: usize, total: &mut usize| -> Result<(), EngineError> {
        *total = total
            .checked_add(n)
            .ok_or_else(|| fail("LIMIT", "Serialized UTF-8 byte count overflow"))?;
        if *total > max {
            Err(fail(
                "LIMIT",
                "Boolean lexical serialized JSON exceeds byte limit",
            ))
        } else {
            Ok(())
        }
    };
    match v {
        Value::Null => add(4, total)?,
        Value::Bool(b) => add(if *b { 4 } else { 5 }, total)?,
        Value::Number(n) => add(crate::ecma_number_to_string(*n).len(), total)?,
        Value::String(s) => string_bytes(s, total, max)?,
        Value::Array(items) => {
            add(2 + items.len().saturating_sub(1), total)?;
            for x in items {
                bytes(x, total, max)?;
            }
        }
        Value::Object(fields) => {
            add(2 + fields.len().saturating_sub(1), total)?;
            for (key, val) in fields {
                string_bytes(key, total, max)?;
                add(1, total)?;
                bytes(val, total, max)?;
            }
        }
    }
    Ok(())
}
fn string_bytes(s: &Utf16, total: &mut usize, max: usize) -> Result<(), EngineError> {
    let mut n = 2usize;
    let u = s.units();
    let mut i = 0;
    while i < u.len() {
        let x = u[i];
        n = n.saturating_add(match x {
            0x22 | 0x5c | 8 | 9 | 10 | 12 | 13 => 2,
            0..=31 => 6,
            0xd800..=0xdbff if i + 1 < u.len() && (0xdc00..=0xdfff).contains(&u[i + 1]) => {
                i += 1;
                4
            }
            0xd800..=0xdfff => 6,
            _ if x < 128 => 1,
            _ if x < 2048 => 2,
            _ => 3,
        });
        i += 1;
        if n.saturating_add(*total) > max {
            return Err(fail(
                "LIMIT",
                "Boolean lexical serialized JSON exceeds byte limit",
            ));
        }
    }
    *total = total
        .checked_add(n)
        .ok_or_else(|| fail("LIMIT", "Serialized UTF-8 byte count overflow"))?;
    if *total > max {
        Err(fail(
            "LIMIT",
            "Boolean lexical serialized JSON exceeds byte limit",
        ))
    } else {
        Ok(())
    }
}
fn budget(v: &Value) -> Result<(), EngineError> {
    let mut n = 0;
    bytes(v, &mut n, 4_000_000)
}
fn canonical(v: &Value) -> Value {
    match v {
        Value::Array(a) => Value::Array(a.iter().map(canonical).collect()),
        Value::Object(o) => {
            let mut fields = o
                .iter()
                .map(|(k, v)| (k.clone(), canonical(v)))
                .collect::<Vec<_>>();
            fields.sort_by(|a, b| a.0.cmp(&b.0));
            Value::Object(fields)
        }
        x => x.clone(),
    }
}

fn closed_request(r: &Value) -> Result<(), EngineError> {
    let Value::Object(fields) = r else {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Expected explicit closed Boolean lexical profile request",
        ));
    };
    if fields.len() != 4
        || get(r, "profile") != Some(&Value::string_utf8("umf.csv-boolean-lexical/1.0.0"))
    {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Expected explicit closed Boolean lexical profile request",
        ));
    }
    let Some(Value::Object(f)) = get(r, "field") else {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Expected explicit closed Boolean lexical profile request",
        ));
    };
    if f.len() != 2
        || !matches!(get(r,"token"),Some(Value::String(t)) if ["true","false","True","False"].iter().any(|s|t==&k(s)))
        || get(r, "sourceContext").is_none()
    {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Expected explicit closed Boolean lexical profile request",
        ));
    }
    for name in ["module", "element"] {
        if !matches!(get(get(r,"field").unwrap(),name),Some(Value::String(s)) if !s.is_empty()) {
            return Err(fail(
                "CSV_BOOLEAN_LEXICAL",
                "Expected explicit closed Boolean lexical profile request",
            ));
        }
    }
    Ok(())
}
fn receipt_shape(r: &Value) -> bool {
    let Value::Object(f) = r else { return false };
    let valid_validation = matches!(get(r,"validation"),Some(Value::Object(v)) if v.len()==3 && ["valid","complete","diagnostics"].iter().all(|name|v.iter().any(|(key,_)|key==&Utf16::from(*name))) && matches!(get(get(r,"validation").unwrap(),"valid"),Some(Value::Bool(_))) && matches!(get(get(r,"validation").unwrap(),"complete"),Some(Value::Bool(_))) && matches!(get(get(r,"validation").unwrap(),"diagnostics"),Some(Value::Array(ds)) if ds.iter().all(|d|matches!(d,Value::Object(fields) if fields.len()==4 && ["code","path","message","severity"].iter().all(|name|fields.iter().any(|(key,_)|key==&Utf16::from(*name))) && matches!(get(d,"code"),Some(Value::String(_))) && matches!(get(d,"path"),Some(Value::String(_))) && matches!(get(d,"message"),Some(Value::String(_))) && matches!(get(d,"severity"),Some(Value::String(s)) if s==&k("error")||s==&k("warning"))))));
    f.len() == 7
        && get(r, "operation") == Some(&Value::string_utf8("validate-csv-boolean-lexical"))
        && get(r, "version") == Some(&Value::string_utf8("1.0.0"))
        && get(r, "provenance") == Some(&Value::string_utf8("unverified"))
        && get(r, "source").is_some()
        && get(r, "request").is_some()
        && valid_validation
        && matches!(get(r,"value"),Some(Value::Object(v)) if v.len()==1 && matches!(v.first(),Some((key,Value::Bool(_))) if key==&k("boolean")))
        && f.iter().all(|(k, _)| {
            [
                "operation",
                "version",
                "source",
                "request",
                "value",
                "validation",
                "provenance",
            ]
            .iter()
            .any(|x| k == &Utf16::from(*x))
        })
}

pub fn validate_csv_boolean_lexical(
    source_input: &Value,
    request_input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source_input, ctx)?;
    let request = copy_json(request_input, ctx)?;
    budget(&obj(vec![
        ("source", source.clone()),
        ("request", request.clone()),
    ]))?;
    closed_request(&request)?;
    // Existing property inspector owns source validation and current-version admission.
    let identity = obj(vec![
        ("scope", Value::string_utf8("element")),
        (
            "module",
            get(get(&request, "field").unwrap(), "module")
                .unwrap()
                .clone(),
        ),
        (
            "element",
            get(get(&request, "field").unwrap(), "element")
                .unwrap()
                .clone(),
        ),
    ]);
    crate::schema_properties::inspect_core_schema_properties(&source, &identity, engine, ctx)?;
    let module = get(get(&request, "field").unwrap(), "module").unwrap();
    let element = get(get(&request, "field").unwrap(), "element").unwrap();
    let modules = get(&source, "modules")
        .and_then(|x| {
            if let Value::Array(a) = x {
                Some(a)
            } else {
                None
            }
        })
        .ok_or_else(|| {
            fail(
                "CSV_BOOLEAN_LEXICAL",
                "Authored core Boolean Field required",
            )
        })?;
    let found = modules
        .iter()
        .find(|m| get(m, "id") == Some(module))
        .and_then(|m| get(m, "elements"))
        .and_then(|x| {
            if let Value::Array(a) = x {
                Some(a)
            } else {
                None
            }
        })
        .and_then(|es| es.iter().find(|e| get(e, "id") == Some(element)));
    let Some(field) = found else {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Authored core Boolean Field required",
        ));
    };
    if get(field, "kind") != Some(&Value::string_utf8("field"))
        || get(field, "scalarType") != Some(&Value::string_utf8("boolean"))
        || matches!(get(field,"cardinality"),Some(Value::String(c)) if c==&k("array")||c==&k("map"))
    {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Authored core Boolean Field required",
        ));
    }
    let token = get(&request, "token").unwrap();
    let truth = matches!(token,Value::String(t) if t==&k("true")||t==&k("True"));
    let val = obj(vec![("boolean", Value::Bool(truth))]);
    let validation = engine.validate_core_field_value_public(
        &source,
        &obj(vec![
            ("module", module.clone()),
            ("element", element.clone()),
        ]),
        &val,
        ctx,
    )?;
    let validation = obj(vec![
        ("valid", Value::Bool(validation.valid)),
        ("complete", Value::Bool(validation.complete)),
        (
            "diagnostics",
            Value::Array(
                validation
                    .diagnostics
                    .into_iter()
                    .map(|d| {
                        obj(vec![
                            ("code", Value::String(d.code)),
                            ("path", Value::String(d.path)),
                            ("message", Value::String(d.message)),
                            (
                                "severity",
                                Value::string_utf8(match d.severity {
                                    crate::error::Severity::Error => "error",
                                    crate::error::Severity::Warning => "warning",
                                }),
                            ),
                        ])
                    })
                    .collect(),
            ),
        ),
    ]);
    let receipt = obj(vec![
        (
            "operation",
            Value::string_utf8("validate-csv-boolean-lexical"),
        ),
        ("version", Value::string_utf8("1.0.0")),
        ("source", source),
        ("request", request),
        ("value", val),
        ("validation", validation),
        ("provenance", Value::string_utf8("unverified")),
    ]);
    // Match the public TypeScript copy boundary after assembling the complete
    // receipt: this enforces aggregate value/depth limits before byte/schema
    // admission, including nesting introduced by the receipt envelope.
    let receipt = copy_json(&receipt, ctx)?;
    budget(&receipt)?;
    if !receipt_shape(&receipt) {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Boolean lexical receipt violates versioned schema",
        ));
    }
    Ok(receipt)
}

pub fn verify_csv_boolean_lexical(
    receipt_input: &Value,
    source: &Value,
    request: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    finish_csv_boolean_lexical_verification(receipt_input, source, request, engine, ctx)
}

/// Admit a receipt before the host reads or serializes independently expected inputs.
/// The returned value is still untrusted input; finish re-admits and recomputes it.
pub fn prepare_csv_boolean_lexical_verification(
    receipt_input: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = copy_json(receipt_input, ctx)?;
    budget(&receipt)?;
    if !receipt_shape(&receipt) {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Malformed Boolean lexical receipt",
        ));
    }
    closed_request(get(&receipt, "request").unwrap())
        .map_err(|_| fail("CSV_BOOLEAN_LEXICAL", "Malformed Boolean lexical receipt"))?;
    let source_diagnostics = engine
        .core_structure_diagnostics(get(&receipt, "source").unwrap(), ctx)
        .map_err(|error| {
            if error.is_control_failure() {
                error
            } else {
                fail("CSV_BOOLEAN_LEXICAL", "Malformed Boolean lexical receipt")
            }
        })?;
    if !source_diagnostics.is_empty() {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Malformed Boolean lexical receipt",
        ));
    }
    Ok(receipt)
}

/// Revalidate prepared bytes, recompute from independent inputs, and return the
/// recomputed receipt. Direct wire callers cannot bypass receipt admission.
pub fn finish_csv_boolean_lexical_verification(
    prepared_receipt: &Value,
    source: &Value,
    request: &Value,
    engine: &Engine,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let receipt = prepare_csv_boolean_lexical_verification(prepared_receipt, engine, ctx)?;
    let expected = validate_csv_boolean_lexical(source, request, engine, ctx)?;
    if canonical(&receipt) != canonical(&expected) {
        return Err(fail(
            "CSV_BOOLEAN_LEXICAL",
            "Stale or forged Boolean lexical receipt",
        ));
    }
    Ok(expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn utf8_budget_counts_json_escapes_unicode_surrogates_and_exact_ceiling() {
        for (value, expected) in [
            (Value::string_utf8("雪"), 5usize),
            (Value::string_utf8("a\n"), 5usize),
            (Value::String(Utf16::new(vec![0xd800])), 8usize),
            (Value::String(Utf16::new(vec![0xd83d, 0xde42])), 6usize),
        ] {
            let mut count = 0;
            bytes(&value, &mut count, expected).unwrap();
            assert_eq!(count, expected);
            let mut count = 0;
            assert_eq!(
                bytes(&value, &mut count, expected - 1).unwrap_err().code,
                "LIMIT"
            );
        }
        let at_limit = Value::string_utf8(&"x".repeat(3_999_998));
        let mut count = 0;
        bytes(&at_limit, &mut count, 4_000_000).unwrap();
        assert_eq!(count, 4_000_000);
        let mut count = 0;
        assert_eq!(
            bytes(&at_limit, &mut count, 3_999_999).unwrap_err().code,
            "LIMIT"
        );
    }
}
