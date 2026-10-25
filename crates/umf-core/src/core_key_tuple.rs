// SPDX-License-Identifier: MIT OR Apache-2.0
//! Opt-in, deterministic current-core Key tuple encoding.
use num_bigint::BigInt;
use num_traits::{Signed, Zero};

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::{EngineError, Severity},
    registry::Registry,
    value::{Utf16, Value, copy_json},
};

const V4: &str = include_str!("../../../spec/core/key-tuple-operation-v4.schema.json");
const LIMIT: usize = 4_000_000;
const V1: &str = "umf-key-tuple-v1";
const V2: &str = "umf-key-tuple-v2";
fn s(v: &str) -> Value {
    Value::string_utf8(v)
}
fn obj(v: Vec<(&str, Value)>) -> Value {
    Value::Object(v.into_iter().map(|(k, v)| (Utf16::from(k), v)).collect())
}
fn get<'a>(v: &'a Value, n: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.iter().find(|(k, _)| k == &Utf16::from(n)).map(|(_, v)| v),
        _ => None,
    }
}
fn text(v: Option<&Value>) -> Option<String> {
    match v {
        Some(Value::String(s)) => s.to_utf8().ok(),
        _ => None,
    }
}
fn arr(v: Option<&Value>) -> Option<&[Value]> {
    match v {
        Some(Value::Array(a)) => Some(a),
        _ => None,
    }
}
fn err(code: &str, message: &str, path: &str) -> EngineError {
    EngineError::new(code, Utf16::from(path), message)
}
fn charge(ctx: &mut Context<'_>, n: usize, path: &str) -> Result<(), EngineError> {
    ctx.charge_work(n, Utf16::from(path))?;
    ctx.check_cancelled(Utf16::from(path))
}
fn canonical(a: &Value, b: &Value, ctx: &mut Context<'_>) -> Result<bool, EngineError> {
    charge(ctx, 1, "")?;
    match (a, b) {
        (Value::Array(x), Value::Array(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (a, b) in x.iter().zip(y) {
                if !canonical(a, b, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        (Value::Object(x), Value::Object(y)) => {
            if x.len() != y.len() {
                return Ok(false);
            }
            for (k, v) in x {
                charge(ctx, 1, "")?;
                let Some((_, w)) = y.iter().find(|(q, _)| q == k) else {
                    return Ok(false);
                };
                if !canonical(v, w, ctx)? {
                    return Ok(false);
                }
            }
            Ok(true)
        }
        _ => Ok(a == b),
    }
}
fn leb(mut n: usize) -> Vec<u8> {
    let mut o = vec![];
    loop {
        let b = (n & 127) as u8;
        n >>= 7;
        o.push(b | if n > 0 { 128 } else { 0 });
        if n == 0 {
            return o;
        }
    }
}
fn leb_u64(mut n: u64) -> Vec<u8> {
    let mut o = vec![];
    loop {
        let b = (n & 127) as u8;
        n >>= 7;
        o.push(b | if n > 0 { 128 } else { 0 });
        if n == 0 {
            return o;
        }
    }
}
fn nonnegative_usize(value: f64) -> usize {
    if value <= 0.0 {
        0
    } else if value >= usize::MAX as f64 {
        usize::MAX
    } else {
        value as usize
    }
}
fn hex(bytes: &[u8]) -> String {
    const H: &[u8] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(H[(b >> 4) as usize] as char);
        s.push(H[(b & 15) as usize] as char)
    }
    s
}
fn from_hex(s: &str) -> Result<Vec<u8>, EngineError> {
    if s.len() % 2 != 0 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(err(
            "KEY_TUPLE_VALUE",
            "Binary input must be whole hexadecimal bytes",
            "",
        ));
    }
    Ok((0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect())
}
fn exact_object(v: &Value, keys: &[&str]) -> bool {
    matches!(v,Value::Object(m) if m.len()==keys.len()&&m.iter().all(|(k,_)|keys.iter().any(|x|k==&Utf16::from(*x)))&&keys.iter().all(|k|get(v,k).is_some()))
}
fn identity_valid(v: &Value) -> bool {
    exact_object(v, &["module", "element", "key"])
        && ["module", "element", "key"]
            .iter()
            .all(|k| matches!(get(v,k),Some(Value::String(s)) if !s.is_empty()))
}

/// Preserve the predecessor's copy/identity/current-version/options order.
/// Bindings call this after independently admitting source, identity, and
/// values, but before observing or encoding options.
pub fn validate_core_key_tuple_encode_prefix(
    source: &Value,
    identity: &Value,
) -> Result<(), EngineError> {
    if !identity_valid(identity) {
        return Err(err(
            "KEY_TUPLE_IDENTITY",
            "Explicit Record and stable Key identities are required",
            "/identity",
        ));
    }
    if !matches!(get(source, "umf"), Some(Value::String(v)) if v == &Utf16::from("0.10.0")) {
        return Err(err(
            "KEY_TUPLE_SOURCE",
            "Expected current core 0.10.0 document",
            "/source/umf",
        ));
    }
    Ok(())
}
fn scalar_count(text: &Utf16, path: &str, ctx: &mut Context<'_>) -> Result<usize, EngineError> {
    let mut i = 0;
    let mut count = 0;
    let mut charged = 0;
    while i < text.units().len() {
        let u = text.units()[i];
        if (0xd800..=0xdbff).contains(&u) {
            if i + 1 >= text.units().len() || !(0xdc00..=0xdfff).contains(&text.units()[i + 1]) {
                return Err(err("KEY_TUPLE_UNICODE", "Unpaired high surrogate", path));
            }
            i += 2
        } else if (0xdc00..=0xdfff).contains(&u) {
            return Err(err("KEY_TUPLE_UNICODE", "Unpaired low surrogate", path));
        } else {
            i += 1
        }
        count += 1;
        charged += 1;
        if charged == 4096 {
            charge(ctx, charged, path)?;
            charged = 0;
        }
    }
    if charged > 0 {
        charge(ctx, charged, path)?;
    }
    Ok(count)
}
fn schema_valid(v: &Value, e: &Engine, x: &mut Context<'_>) -> Result<bool, EngineError> {
    let schema = crate::serialization::read_json_value(
        &V4.encode_utf16().collect::<Vec<_>>(),
        crate::serialization::Format::Json,
        x,
    )?;
    let resources = e.schema_resources_with_context(x)?;
    let compiled = crate::schema::CompiledSchema::compile(&schema, &resources, x)?;
    Ok(compiled.validate(v, x)?.is_empty())
}
fn source_validate(
    v: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Vec<crate::error::Diagnostic>, EngineError> {
    let out = e.validate_document(v, r, c, x)?;
    if out.valid {
        Ok(out.diagnostics)
    } else {
        let equality = out
            .diagnostics
            .iter()
            .any(|d| d.code == Utf16::from("KEY_EQUALITY"));
        let ds = Value::Array(
            out.diagnostics
                .into_iter()
                .map(|d| {
                    obj(vec![
                        ("code", Value::String(d.code)),
                        ("path", Value::String(d.path)),
                        ("message", Value::String(d.message)),
                        (
                            "severity",
                            s(if d.severity == Severity::Warning {
                                "warning"
                            } else {
                                "error"
                            }),
                        ),
                    ])
                })
                .collect(),
        );
        let msg = crate::serialization::stringify_compact_metered(&ds, x)?
            .to_utf8()
            .unwrap_or_default();
        Err(err(
            if equality {
                "KEY_TUPLE_EQUALITY"
            } else {
                "KEY_TUPLE_SOURCE"
            },
            &msg,
            "/source",
        ))
    }
}
fn select(
    source: &Value,
    identity: &Value,
    x: &mut Context<'_>,
) -> Result<(Value, String, Vec<(Value, String, String)>), EngineError> {
    let module = match get(identity, "module") {
        Some(Value::String(s)) => s.clone(),
        _ => unreachable!("validated identity"),
    };
    let element = match get(identity, "element") {
        Some(Value::String(s)) => s.clone(),
        _ => unreachable!("validated identity"),
    };
    let keyid = match get(identity, "key") {
        Some(Value::String(s)) => s.clone(),
        _ => unreachable!("validated identity"),
    };
    let modules = arr(get(source, "modules")).ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let mut selected = None;
    for (mi, m) in modules.iter().enumerate() {
        charge(x, 1, "/identity")?;
        if get(m, "id") == Some(&Value::String(module.clone())) {
            selected = Some((mi, m));
            break;
        }
    }
    let (mi, m) = selected.ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let elements = arr(get(m, "elements")).ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let mut ri = None;
    for (i, e) in elements.iter().enumerate() {
        charge(x, 1, "/identity")?;
        if get(e, "id") == Some(&Value::String(element.clone())) {
            ri = Some((i, e));
            break;
        }
    }
    let (ei, record) = ri.ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let keys = arr(get(record, "keys")).ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let mut ki = None;
    for (i, k) in keys.iter().enumerate() {
        charge(x, 1, "/identity")?;
        if get(k, "id") == Some(&Value::String(keyid.clone())) {
            ki = Some((i, k));
            break;
        }
    }
    let (ki, key) = ki.ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let keypath = format!("/modules/{mi}/elements/{ei}/keys/{ki}");
    let refs = arr(get(key, "fields")).ok_or_else(|| {
        err(
            "KEY_TUPLE_MISSING",
            "Explicit Record/Key identity does not resolve",
            "/identity",
        )
    })?;
    let members = arr(get(record, "members")).unwrap_or(&[]);
    let mut fields = vec![];
    for rf in refs {
        charge(x, 1, "/identity")?;
        let fm = match get(rf, "module") {
            Some(Value::String(s)) => s.clone(),
            _ => Utf16::default(),
        };
        let fe = match get(rf, "element") {
            Some(Value::String(s)) => s.clone(),
            _ => Utf16::default(),
        };
        let mut found = None;
        for (fmi, fmval) in modules.iter().enumerate() {
            charge(x, 1, "/identity")?;
            if get(fmval, "id") == Some(&Value::String(fm.clone())) {
                if let Some(es) = arr(get(fmval, "elements")) {
                    for (fei, field) in es.iter().enumerate() {
                        charge(x, 1, "/identity")?;
                        if get(field, "id") == Some(&Value::String(fe.clone())) {
                            found = Some((field, format!("/modules/{fmi}/elements/{fei}/facets")));
                            break;
                        }
                    }
                }
                break;
            }
        }
        let (field, path) = found.ok_or_else(|| {
            err(
                "KEY_TUPLE_MISSING",
                "Explicit Record/Key identity does not resolve",
                "/identity",
            )
        })?;
        let field = copy_json(field, x)?;
        let mut member = usize::MAX;
        for (index, v) in members.iter().enumerate() {
            charge(x, 1, "/identity")?;
            if get(v, "module") == Some(&Value::String(fm.clone()))
                && get(v, "element") == Some(&Value::String(fe.clone()))
            {
                member = index;
                break;
            }
        }
        fields.push((
            field,
            path,
            format!("/modules/{mi}/elements/{ei}/members/{member}"),
        ));
    }
    Ok((copy_json(key, x)?, keypath, fields))
}
fn payload(
    field: &Value,
    value: &Value,
    profile: &str,
    path: &str,
    x: &mut Context<'_>,
) -> Result<(u8, Vec<u8>), EngineError> {
    let Value::Object(w) = value else {
        return Err(err(
            "KEY_TUPLE_ABSENT",
            "Key component must be present and typed",
            path,
        ));
    };
    charge(x, w.len(), path)?;
    if w.iter().any(|(k, _)| k == &Utf16::from("absent")) {
        return Err(err(
            "KEY_TUPLE_ABSENT",
            "Key component must be present and typed",
            path,
        ));
    }
    if w.len() != 1 {
        return Err(err(
            "KEY_TUPLE_VALUE",
            "Value wrapper does not match key component",
            path,
        ));
    }
    let scalar = text(get(field, "scalarType")).unwrap_or_default();
    let wrap = match scalar.as_str() {
        "boolean" => "boolean",
        "integer" => "integerToken",
        "decimal" => "decimalToken",
        "string" => "string",
        "binary" => "binaryHex",
        "bits128" => "bits128Hex",
        "uuid" => "uuid",
        _ => {
            return Err(err(
                "KEY_TUPLE_VALUE",
                "Value wrapper does not match key component",
                path,
            ));
        }
    };
    let v = get(value, wrap).ok_or_else(|| {
        err(
            "KEY_TUPLE_VALUE",
            "Value wrapper does not match key component",
            path,
        )
    })?;
    let facets = get(field, "facets");
    match scalar.as_str() {
        "boolean" => {
            if let Value::Bool(b) = v {
                Ok((1, vec![u8::from(*b)]))
            } else {
                Err(err("KEY_TUPLE_VALUE", "Expected boolean", path))
            }
        }
        "integer" | "decimal" => {
            let Value::String(token_units) = v else {
                return Err(err(
                    "KEY_TUPLE_VALUE",
                    "Numeric and binary values require exact lexical strings",
                    path,
                ));
            };
            let scale = if scalar == "decimal" {
                get(facets.unwrap_or(&Value::Null), "scale")
                    .and_then(|v| {
                        if let Value::Number(n) = v {
                            Some(*n as i64)
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0)
            } else {
                0
            };
            let precision = get(facets.unwrap_or(&Value::Null), "precision").and_then(|v| {
                if let Value::Number(n) = v {
                    // Facet values are validated as nonnegative safe integers before reaching
                    // tuple encoding. Saturation preserves the native-width comparison on
                    // wasm32: reachable coefficients are bounded by Context far below usize::MAX.
                    Some(nonnegative_usize(*n))
                } else {
                    None
                }
            });
            let normalized_token = normalize_tuple_exponent(token_units, x, path)?;
            let coefficient = crate::literal::exact_coefficient(
                &normalized_token,
                scale,
                if scalar == "decimal" { precision } else { None },
                x,
            )
            .map_err(|e| {
                if e.is_control_failure() {
                    e
                } else if e.code == "numeric-rounding" {
                    err(
                        "KEY_TUPLE_ROUNDING",
                        "Value is not exactly representable at declared scale",
                        path,
                    )
                } else if e.code == "numeric-precision" {
                    err(
                        "KEY_TUPLE_DOMAIN",
                        "Decimal coefficient exceeds precision",
                        path,
                    )
                } else if e.code == "numeric-resource" {
                    if scalar == "decimal"
                        && precision.is_some_and(|p| p < x.limits().max_coefficient_digits)
                    {
                        err(
                            "KEY_TUPLE_DOMAIN",
                            "Decimal coefficient exceeds precision",
                            path,
                        )
                    } else {
                        err("LIMIT", "Numeric expansion exceeds tuple limit", path)
                    }
                } else if e.code == "numeric-exponent" {
                    err(
                        "LIMIT",
                        "Nonzero exponent exceeds bounded tuple domain",
                        path,
                    )
                } else {
                    err("KEY_TUPLE_TOKEN", "Expected exact JSON numeric token", path)
                }
            })?;
            if scalar == "integer" {
                if let Some(width) = get(facets.unwrap_or(&Value::Null), "integerWidth") {
                    let bits = get(width, "bits")
                        .and_then(|v| {
                            if let Value::Number(n) = v {
                                // Larger declared widths cannot be reached by any coefficient
                                // admitted under Context's bounded digit limit. Preserve their
                                // native behavior on wasm32 instead of wrapping the width.
                                Some(nonnegative_usize(*n))
                            } else {
                                None
                            }
                        })
                        .unwrap_or(0);
                    let signed = matches!(get(width, "signed"), Some(Value::Bool(true)));
                    let negative = coefficient.is_negative();
                    let magnitude = coefficient.abs();
                    let bit_len = magnitude.to_str_radix(2).len();
                    let fits = if signed {
                        if magnitude.is_zero() {
                            true
                        } else if negative {
                            bit_len < bits
                                || (bit_len == bits
                                    && (&magnitude & (&magnitude - BigInt::from(1u8))).is_zero())
                        } else {
                            bit_len < bits
                        }
                    } else {
                        !negative && bit_len <= bits
                    };
                    if !fits {
                        return Err(err(
                            "KEY_TUPLE_DOMAIN",
                            "Integer exceeds declared width/signedness",
                            path,
                        ));
                    }
                }
                let digits = coefficient.to_str_radix(10);
                Ok((2, digits.into_bytes()))
            } else {
                let digits = coefficient.to_str_radix(10);
                let significant = digits.trim_start_matches('-').trim_start_matches('0');
                if precision.is_some_and(|p| significant.len() > p) {
                    return Err(err(
                        "KEY_TUPLE_DOMAIN",
                        "Decimal coefficient exceeds precision",
                        path,
                    ));
                }
                let mut bytes = leb_u64(scale as u64);
                bytes.extend(digits.bytes());
                Ok((3, bytes))
            }
        }
        "string" => {
            let Value::String(t) = v else {
                return Err(err(
                    "KEY_TUPLE_VALUE",
                    "Numeric and binary values require exact lexical strings",
                    path,
                ));
            };
            let scalars = scalar_count(t, path, x)?;
            let text = t.to_utf8().expect("validated UTF-16");
            x.charge_text(t.len(), Utf16::from(path))?;
            if let Some(max) = facets
                .and_then(|f| get(f, "length"))
                .and_then(|l| get(l, "max"))
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
            {
                if scalars > max {
                    return Err(err(
                        "KEY_TUPLE_DOMAIN",
                        "String exceeds Unicode scalar bound",
                        path,
                    ));
                }
            }
            if text.len() > LIMIT {
                return Err(err("LIMIT", "UTF-8 payload exceeds tuple limit", path));
            }
            Ok((4, text.into_bytes()))
        }
        "binary" => {
            let Value::String(raw_units) = v else {
                return Err(err(
                    "KEY_TUPLE_VALUE",
                    "Numeric and binary values require exact lexical strings",
                    path,
                ));
            };
            let raw = raw_units.to_utf8().map_err(|_| {
                err(
                    if scalar == "uuid" {
                        "UUID_SYNTAX"
                    } else {
                        "BIT128_SYNTAX"
                    },
                    if scalar == "uuid" {
                        "Expected complete hyphenated UUID text"
                    } else {
                        "Expected exactly 32 hexadecimal digits"
                    },
                    "",
                )
            })?;
            let bytes = from_hex(&raw).map_err(|_| {
                err(
                    "KEY_TUPLE_VALUE",
                    "Binary input must be whole hexadecimal bytes",
                    path,
                )
            })?;
            if let Some(max) = facets
                .and_then(|f| get(f, "length"))
                .and_then(|l| get(l, "max"))
                .and_then(|v| {
                    if let Value::Number(n) = v {
                        Some(*n as usize)
                    } else {
                        None
                    }
                })
            {
                if bytes.len() > max {
                    return Err(err("KEY_TUPLE_DOMAIN", "Binary exceeds byte bound", path));
                }
            }
            Ok((5, bytes))
        }
        "bits128" | "uuid" => {
            if profile != V2 {
                return Err(err(
                    "KEY_TUPLE_PROFILE",
                    "128-bit values require tuple v2",
                    path,
                ));
            }
            let Value::String(raw_units) = v else {
                return Err(err(
                    "KEY_TUPLE_VALUE",
                    "Numeric and binary values require exact lexical strings",
                    path,
                ));
            };
            let raw = raw_units.to_utf8().map_err(|_| {
                err(
                    if scalar == "uuid" {
                        "UUID_SYNTAX"
                    } else {
                        "BIT128_SYNTAX"
                    },
                    if scalar == "uuid" {
                        "Expected complete hyphenated UUID text"
                    } else {
                        "Expected exactly 32 hexadecimal digits"
                    },
                    "",
                )
            })?;
            let hex = if scalar == "uuid" {
                if raw.len() != 36
                    || !raw.as_bytes().iter().enumerate().all(|(i, b)| {
                        if [8, 13, 18, 23].contains(&i) {
                            *b == b'-'
                        } else {
                            b.is_ascii_hexdigit()
                        }
                    })
                {
                    return Err(err(
                        "UUID_SYNTAX",
                        "Expected complete hyphenated UUID text",
                        "",
                    ));
                }
                raw.replace('-', "")
            } else {
                if raw.len() != 32 || !raw.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(err(
                        "BIT128_SYNTAX",
                        "Expected exactly 32 hexadecimal digits",
                        "",
                    ));
                }
                raw
            };
            let bytes = from_hex(&hex)?;
            Ok((if scalar == "uuid" { 7 } else { 6 }, bytes))
        }
        _ => unreachable!(),
    }
}

// The TypeScript tuple encoder strips leading zeroes from the exponent before
// passing the token into literal validation. Keep that tuple-specific order
// here instead of changing the shared literal parser contract.
fn normalize_tuple_exponent(
    token: &Utf16,
    ctx: &mut Context<'_>,
    path: &str,
) -> Result<Utf16, EngineError> {
    // Admit the complete scan and possible copy before converting or building
    // a normalized token. This remains cooperative for long untrusted input.
    charge(ctx, token.units().len(), path)?;
    let Ok(raw) = token.to_utf8() else {
        return Ok(token.clone());
    };
    let Some(pos) = raw.find(['e', 'E']) else {
        return Ok(token.clone());
    };
    let (mantissa, exp) = raw.split_at(pos + 1);
    let sign_len = usize::from(exp.starts_with('+') || exp.starts_with('-'));
    let (sign, digits) = exp.split_at(sign_len);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Ok(token.clone());
    }
    let trimmed = digits.trim_start_matches('0');
    let normalized = if trimmed.is_empty() { "0" } else { trimmed };
    if sign == "-"
        && normalized.len() == 32
        && exact_json_number(&raw)
        && mantissa.bytes().any(|b| b.is_ascii_digit() && b != b'0')
    {
        // The TypeScript tuple coefficient admits 32 significant exponent
        // digits (the sign is excluded), then resolves this nonzero value as
        // inexact at the declared scale before literal validation.
        return Err(err(
            "KEY_TUPLE_ROUNDING",
            "Value is not exactly representable at declared scale",
            path,
        ));
    }
    // The shared literal parser intentionally counts a sign in its 32-byte
    // bound. Strip '+' here only when the tuple's sign-exempt bound needs it.
    let sign = if sign == "+" { "" } else { sign };
    Ok(Utf16::from(format!("{mantissa}{sign}{normalized}")))
}

fn exact_json_number(raw: &str) -> bool {
    let bytes = raw.as_bytes();
    let mut i = 0;
    if bytes.get(i) == Some(&b'-') {
        i += 1;
    }
    match bytes.get(i) {
        Some(b'0') => i += 1,
        Some(b'1'..=b'9') => {
            i += 1;
            while bytes.get(i).is_some_and(u8::is_ascii_digit) {
                i += 1;
            }
        }
        _ => return false,
    }
    if bytes.get(i) == Some(&b'.') {
        i += 1;
        let start = i;
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    if matches!(bytes.get(i), Some(b'e' | b'E')) {
        i += 1;
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let start = i;
        while bytes.get(i).is_some_and(u8::is_ascii_digit) {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    i == bytes.len()
}

#[cfg(test)]
mod tuple_normalization_tests {
    use super::*;

    #[test]
    fn exponent_scan_is_metered_before_normalization_copy() {
        let token = Utf16::from(format!("1e{}1", "0".repeat(4096)));
        let expected = token.units().len();
        let mut seen = 0usize;
        let mut meter = |amount: usize| {
            seen += amount;
            if amount == expected {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "tuple normalization scan refused",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = normalize_tuple_exponent(&token, &mut ctx, "/values/0").unwrap_err();
        assert_eq!(seen, expected);
        assert_eq!(error.code, "METER_STOP");
        assert!(error.is_control_failure());
    }
}

fn encode_bytes(
    source: &Value,
    identity: &Value,
    values: &Value,
    profile: &str,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
    prevalidated: Option<&[crate::error::Diagnostic]>,
) -> Result<(String, String, Vec<u8>), EngineError> {
    if !identity_valid(identity) {
        return Err(err(
            "KEY_TUPLE_IDENTITY",
            "Explicit Record and stable Key identities are required",
            "/identity",
        ));
    }
    if !matches!(get(source,"umf"),Some(Value::String(v)) if v==&Utf16::from("0.10.0")) {
        return Err(err(
            "KEY_TUPLE_SOURCE",
            "Expected current core 0.10.0 document",
            "/source/umf",
        ));
    }
    if profile != V1 && profile != V2 {
        return Err(err(
            "KEY_TUPLE_PROFILE",
            "Select one supported current key tuple codec",
            "/profile",
        ));
    }
    let diagnostics = if let Some(ds) = prevalidated {
        ds.to_vec()
    } else {
        source_validate(source, e, r, c, x)?
    };
    let (_key, keypath, fields) = select(source, identity, x)?;
    let vals = arr(Some(values)).ok_or_else(|| {
        err(
            "KEY_TUPLE_ARITY",
            "Expected one value per key component",
            "/values",
        )
    })?;
    if vals.len() != fields.len() {
        return Err(err(
            "KEY_TUPLE_ARITY",
            "Expected one value per key component",
            "/values",
        ));
    }
    let mut total = 0usize;
    for v in vals {
        charge(x, 1, "/values")?;
        if let Value::Object(m) = v {
            for (_, q) in m {
                if let Value::String(t) = q {
                    total = total.saturating_add(t.len());
                }
            }
        }
    }
    if total > LIMIT {
        return Err(err(
            "LIMIT",
            "Aggregate key value text exceeds limit",
            "/values",
        ));
    }
    let mut relevant = vec![keypath.clone()];
    for (_, p, m) in &fields {
        relevant.push(p.clone());
        relevant.push(m.clone())
    }
    for d in &diagnostics {
        charge(x, 1, "/source")?;
        if d.severity == Severity::Warning
            && [
                "UNKNOWN_KEY_QUALIFIER",
                "UNKNOWN_FACET",
                "UNKNOWN_FACET_UNIT",
            ]
            .contains(&d.code.to_utf8().unwrap_or_default().as_str())
            && relevant.iter().any(|p| {
                d.path == Utf16::from(p.as_str())
                    || d.path
                        .units()
                        .starts_with(Utf16::from(format!("{p}/")).units())
            })
        {
            return Err(EngineError::new(
                "KEY_TUPLE_UNKNOWN",
                d.path.clone(),
                "Relevant qualifier has no defined encoding meaning",
            ));
        }
    }
    let mut bytes = if profile == V1 {
        b"UMFK1".to_vec()
    } else {
        b"UMFK2".to_vec()
    };
    bytes.extend(leb(vals.len()));
    for (i, ((field, _, _), v)) in fields.iter().zip(vals).enumerate() {
        charge(x, 1, &format!("/values/{i}"))?;
        let path = format!("/values/{i}");
        let (tag, p) = payload(field, v, profile, &path, x)?;
        let checked = e.validate_schema_literal_public(source, field, v, x)?;
        if !checked.valid {
            if let Some(d) = checked
                .diagnostics
                .iter()
                .find(|d| d.severity == Severity::Error)
            {
                return Err(EngineError::new(
                    d.code.to_utf8().unwrap_or_default(),
                    d.path.clone(),
                    d.message.to_utf8().unwrap_or_default(),
                ));
            }
        }
        let header = leb(p.len());
        bytes.push(tag);
        bytes.extend(header);
        bytes.extend(p);
        if bytes.len() > LIMIT {
            return Err(err("LIMIT", "Encoded tuple exceeds limit", "/values"));
        }
    }
    Ok((keypath, profile.to_owned(), bytes))
}

/// Compact dataset evaluator body. The source and its document validation are
/// invocation-owned; return only the Key receipt body with a shared source ref.
pub(crate) fn encode_core_key_tuple_compact_body(
    source: &Value,
    identity: &Value,
    values: &Value,
    profile: Option<&str>,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
    diagnostics: &[crate::error::Diagnostic],
) -> Result<Value, EngineError> {
    let profile = profile.unwrap_or(V1);
    let (keypath, profile, bytes) = encode_bytes(
        source,
        identity,
        values,
        profile,
        e,
        r,
        c,
        x,
        Some(diagnostics),
    )?;
    Ok(obj(vec![
        ("operation", s("encode-core-key-tuple")),
        ("version", s("4.0.0")),
        ("profile", s(&profile)),
        ("identity", identity.clone()),
        ("values", values.clone()),
        ("keyPath", s(&keypath)),
        ("bytesHex", s(&hex(&bytes))),
        ("sourceRef", s("#/source")),
    ]))
}

pub fn encode_core_key_tuple(
    source: &Value,
    identity: &Value,
    values: &Value,
    profile: Option<&str>,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let source = copy_json(source, x)?;
    let identity = copy_json(identity, x)?;
    let values = copy_json(values, x)?;
    let profile = profile.unwrap_or(V1);
    let (keypath, profile, bytes) =
        encode_bytes(&source, &identity, &values, profile, e, r, c, x, None)?;
    let receipt = obj(vec![
        ("operation", s("encode-core-key-tuple")),
        ("version", s("4.0.0")),
        ("profile", s(&profile)),
        ("source", source),
        ("identity", identity),
        ("values", values),
        ("keyPath", s(&keypath)),
        ("bytesHex", s(&hex(&bytes))),
    ]);
    if !schema_valid(&receipt, e, x)? {
        return Err(err("KEY_TUPLE_RESULT", "Malformed encoding receipt", ""));
    }
    Ok(receipt)
}
pub fn verify_core_key_tuple(
    receipt: &Value,
    current: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let verified = validate_core_key_tuple_receipt(receipt, e, r, c, x)?;
    validate_verified_core_key_tuple_current(&verified, current, x)?;
    Ok(verified.into_value())
}

/// Receipt that passed schema validation and exact recomputation.
#[derive(Debug)]
pub struct VerifiedCoreKeyTupleReceipt {
    receipt: Value,
}

impl VerifiedCoreKeyTupleReceipt {
    pub fn as_value(&self) -> &Value { &self.receipt }
    pub fn into_value(self) -> Value { self.receipt }
}

/// Validate shape and exact recomputation without observing the current document.
pub fn validate_core_key_tuple_receipt(
    receipt: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<VerifiedCoreKeyTupleReceipt, EngineError> {
    let receipt = copy_json(receipt, x)?;
    if !schema_valid(&receipt, e, x)? {
        return Err(err("KEY_TUPLE_RECEIPT", "Malformed encoding receipt", ""));
    }
    let source = get(&receipt, "source").unwrap();
    let identity = get(&receipt, "identity").unwrap();
    let values = get(&receipt, "values").unwrap();
    let profile = text(get(&receipt, "profile")).unwrap();
    let expected = encode_core_key_tuple(source, identity, values, Some(&profile), e, r, c, x)?;
    if !canonical(&expected, &receipt, x)? {
        return Err(err(
            "KEY_TUPLE_RECEIPT",
            "Receipt differs from exact recomputation",
            "",
        ));
    }
    Ok(VerifiedCoreKeyTupleReceipt { receipt })
}

/// Compare a previously checked receipt's source to current, preserving the
/// receipt-before-current admission order at host boundaries.
pub fn validate_verified_core_key_tuple_current(
    verified: &VerifiedCoreKeyTupleReceipt,
    current: &Value,
    x: &mut Context<'_>,
) -> Result<(), EngineError> {
    let current = copy_json(current, x)?;
    if !canonical(&current, get(&verified.receipt, "source").unwrap(), x)? {
        return Err(err(
            "KEY_TUPLE_STALE",
            "Current document differs from retained context",
            "/source",
        ));
    }
    Ok(())
}
pub fn read_core_key_tuple_bytes(
    receipt: &Value,
    current: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let verified = validate_core_key_tuple_receipt(receipt, e, r, c, x)?;
    validate_verified_core_key_tuple_current(&verified, current, x)?;
    read_verified_core_key_tuple_bytes(&verified, x)
}

/// Return bytes from an opaque receipt already admitted by Rust, after checking
/// current against that receipt's retained source.
pub fn read_verified_core_key_tuple_bytes(
    verified: &VerifiedCoreKeyTupleReceipt,
    x: &mut Context<'_>,
) -> Result<Vec<u8>, EngineError> {
    let raw = text(get(&verified.receipt, "bytesHex")).unwrap();
    let size = raw.len() / 2;
    x.charge_work(size, Utf16::from("/bytes"))?;
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(size).map_err(|_| {
        err(
            "LIMIT",
            "Tuple byte result exceeds available allocation",
            "/bytes",
        )
    })?;
    for index in (0..raw.len()).step_by(2) {
        bytes.push(u8::from_str_radix(&raw[index..index + 2], 16).unwrap());
    }
    Ok(bytes)
}
#[derive(Debug)]
pub struct PreparedCoreKeyTuples {
    source: Value,
    diagnostics: Vec<crate::error::Diagnostic>,
}
impl PreparedCoreKeyTuples {
    pub fn source(&self) -> &Value {
        &self.source
    }
    /// Move the admitted source snapshot into a result without an unmetered clone.
    pub fn into_source(self) -> Value {
        self.source
    }
    fn encode_profile(
        &self,
        identity: &Value,
        values: &Value,
        profile: &str,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let identity = copy_json(identity, x)?;
        let values = copy_json(values, x)?;
        let (keypath, profile, bytes) = encode_bytes(
            &self.source,
            &identity,
            &values,
            profile,
            e,
            r,
            c,
            x,
            Some(&self.diagnostics),
        )?;
        let receipt = obj(vec![
            ("operation", s("encode-core-key-tuple")),
            ("version", s("4.0.0")),
            ("profile", s(&profile)),
            ("source", copy_json(&self.source, x)?),
            ("identity", identity),
            ("values", values),
            ("keyPath", s(&keypath)),
            ("bytesHex", s(&hex(&bytes))),
        ]);
        if !schema_valid(&receipt, e, x)? {
            return Err(err("KEY_TUPLE_RESULT", "Malformed encoding receipt", ""));
        }
        Ok(receipt)
    }
    pub fn encode(
        &self,
        identity: &Value,
        values: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        self.encode_profile(identity, values, V1, e, r, c, x)
    }
    pub fn verify(
        &self,
        receipt: &Value,
        e: &Engine,
        r: &Registry,
        c: &mut dyn Capabilities,
        x: &mut Context<'_>,
    ) -> Result<Value, EngineError> {
        let receipt = copy_json(receipt, x)?;
        if !schema_valid(&receipt, e, x)? {
            return Err(err("KEY_TUPLE_RECEIPT", "Malformed encoding receipt", ""));
        }
        let retained = get(&receipt, "source").unwrap();
        if !canonical(retained, &self.source, x)? {
            return verify_core_key_tuple(&receipt, &self.source, e, r, c, x);
        }
        let identity = get(&receipt, "identity").unwrap();
        let values = get(&receipt, "values").unwrap();
        let profile = text(get(&receipt, "profile")).unwrap();
        let expected = self.encode_profile(identity, values, &profile, e, r, c, x)?;
        if !canonical(&expected, &receipt, x)? {
            return Err(err(
                "KEY_TUPLE_RECEIPT",
                "Receipt differs from exact recomputation",
                "",
            ));
        }
        Ok(receipt)
    }
}
pub fn prepare_core_key_tuples(
    source: &Value,
    e: &Engine,
    r: &Registry,
    c: &mut dyn Capabilities,
    x: &mut Context<'_>,
) -> Result<PreparedCoreKeyTuples, EngineError> {
    let source = copy_json(source, x)?;
    if !matches!(get(&source,"umf"),Some(Value::String(v)) if v==&Utf16::from("0.10.0")) {
        return Err(err(
            "KEY_TUPLE_SOURCE",
            "Expected current core 0.10.0 document",
            "/source/umf",
        ));
    }
    let diagnostics = source_validate(&source, e, r, c, x)?;
    Ok(PreparedCoreKeyTuples {
        source,
        diagnostics,
    })
}
