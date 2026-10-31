// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure, bounded `umf-128/1` codecs for opaque 128-bit values and UUIDs.
use num_bigint::BigInt;
use num_traits::{Signed, ToPrimitive, Zero};

use crate::{
    context::Context,
    error::EngineError,
    value::{Utf16, Value},
};

const PROFILE: &str = "umf-128/1";

fn err(code: &str, message: &str) -> EngineError {
    EngineError::new(format!("BIT128_{code}"), Utf16::default(), message)
}
fn uuid_err(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}
fn charge(ctx: &mut Context<'_>, n: usize) -> Result<(), EngineError> {
    ctx.charge_work(n, Utf16::default())?;
    ctx.check_cancelled(Utf16::default())
}
fn text<'a>(
    v: &'a Value,
    ctx: &mut Context<'_>,
    expected: &'static str,
) -> Result<&'a Utf16, EngineError> {
    match v {
        Value::String(s) => {
            ctx.charge_text(s.len(), Utf16::default())?;
            Ok(s)
        }
        _ => Err(err("TYPE", expected)),
    }
}
fn ascii(s: &Utf16) -> Option<String> {
    if s.units().iter().any(|u| *u > 0x7f) {
        return None;
    }
    Some(s.units().iter().map(|u| *u as u8 as char).collect())
}
fn get<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m
            .iter()
            .find(|(key, _)| key.units().iter().copied().eq(k.encode_utf16()))
            .map(|(_, v)| v),
        _ => None,
    }
}
fn object(v: &Value) -> Option<&[(Utf16, Value)]> {
    if let Value::Object(m) = v {
        Some(m)
    } else {
        None
    }
}
fn exact_object(
    v: &Value,
    names: &[&str],
    code: &str,
    message: &str,
    ctx: &mut Context<'_>,
) -> Result<(), EngineError> {
    let Some(m) = object(v) else {
        return Err(err(code, message));
    };
    let units = m.iter().fold(0usize, |n, (k, _)| n.saturating_add(k.len()));
    ctx.charge_text(units, Utf16::default())?;
    charge(ctx, m.len())?;
    if m.len() != names.len()
        || m.iter().any(|(k, _)| {
            !names
                .iter()
                .any(|n| k.units().iter().copied().eq(n.encode_utf16()))
        })
        || names.iter().any(|n| get(v, n).is_none())
    {
        return Err(err(code, message));
    }
    Ok(())
}
fn s(v: impl AsRef<str>) -> Value {
    Value::string_utf8(v)
}
fn obj(fields: Vec<(&str, Value)>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|(k, v)| (Utf16::from(k), v))
            .collect(),
    )
}
fn hex_value(hex: &str) -> Value {
    obj(vec![("profile", s(PROFILE)), ("hex", s(hex))])
}
fn parse_hex_str(raw: &str) -> Result<String, EngineError> {
    if raw.len() != 32 || !raw.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(err("SYNTAX", "Expected exactly 32 hexadecimal digits"));
    }
    Ok(raw.to_ascii_lowercase())
}
fn bits(v: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    exact_object(
        v,
        &["profile", "hex"],
        "VALUE",
        "Invalid bit value snapshot",
        ctx,
    )?;
    let p = get(v, "profile").unwrap();
    let h = get(v, "hex").unwrap();
    let p = match p {
        Value::String(p) => p,
        _ => return Err(err("VALUE", "Unknown bit profile")),
    };
    ctx.charge_text(p.len(), Utf16::default())?;
    if p.len() != PROFILE.len() || ascii(p).as_deref() != Some(PROFILE) {
        return Err(err("VALUE", "Unknown bit profile"));
    }
    let h = match h {
        Value::String(h) => h,
        _ => return Err(err("VALUE", "Noncanonical bit snapshot")),
    };
    ctx.charge_text(p.len().saturating_add(h.len()), Utf16::default())?;
    if h.len() != 32 {
        return Err(err("VALUE", "Noncanonical bit snapshot"));
    }
    let Some(h) = ascii(h) else {
        return Err(err("VALUE", "Noncanonical bit snapshot"));
    };
    if h.len() != 32
        || !h
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
    {
        return Err(err("VALUE", "Noncanonical bit snapshot"));
    }
    charge(ctx, 32)?;
    Ok(h)
}
fn uuid(v: &Value, ctx: &mut Context<'_>) -> Result<(String, String, String), EngineError> {
    if object(v).is_none_or(|members| members.len() != 4) {
        return Err(err("VALUE", "Invalid UUID snapshot"));
    }
    exact_object(
        v,
        &["profile", "hex", "canonicalText", "originalText"],
        "VALUE",
        "Unknown UUID snapshot members or accessors",
        ctx,
    )?;
    let Some(Value::String(o)) = get(v, "originalText") else {
        return Err(err("VALUE", "Invalid original UUID text in snapshot"));
    };
    ctx.charge_text(o.len(), Utf16::default())?;
    if o.len() != 36 {
        return Err(err("VALUE", "Invalid original UUID text in snapshot"));
    }
    let Some(o) = ascii(o) else {
        return Err(err("VALUE", "Invalid original UUID text in snapshot"));
    };
    let (canon, orighex) =
        parse_uuid_str(&o).map_err(|_| err("VALUE", "Invalid original UUID text in snapshot"))?;
    let fields = ["profile", "hex", "canonicalText"];
    let mut values = Vec::with_capacity(3);
    for k in fields {
        match get(v, k) {
            Some(Value::String(t)) => {
                ctx.charge_text(t.len(), Utf16::default())?;
                let width = if k == "hex" {
                    32
                } else if k == "canonicalText" {
                    36
                } else {
                    PROFILE.len()
                };
                values.push(if t.len() == width { ascii(t) } else { None });
            }
            _ => values.push(None),
        }
    }
    let p = values[0].as_deref();
    let h = values[1].as_deref();
    let c = values[2].as_deref();
    if p != Some(PROFILE) || h != Some(orighex.as_str()) || c != Some(canon.as_str()) {
        return Err(err("VALUE", "Inconsistent UUID snapshot"));
    }
    Ok((orighex, canon, o))
}
fn parse_uuid_str(t: &str) -> Result<(String, String), EngineError> {
    if t.len() != 36
        || ![8, 13, 18, 23].iter().all(|i| t.as_bytes()[*i] == b'-')
        || !t
            .bytes()
            .enumerate()
            .all(|(i, b)| [8, 13, 18, 23].contains(&i) || b.is_ascii_hexdigit())
    {
        return Err(uuid_err(
            "UUID_SYNTAX",
            "Expected complete hyphenated UUID text",
        ));
    }
    let h = t.replace('-', "").to_ascii_lowercase();
    let c = format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    );
    Ok((c, h))
}
fn raw_integer(v: &Value, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    exact_object(
        v,
        &["integerToken"],
        "TYPE",
        "Expected one integerToken",
        ctx,
    )?;
    let Some(Value::String(t)) = get(v, "integerToken") else {
        return Err(err("TYPE", "Expected integer token text"));
    };
    if t.len() > 4_000_000 {
        return Err(err("LIMIT", "Integer text exceeds bound"));
    }
    ctx.charge_text(t.len(), Utf16::default())?;
    ascii(t).ok_or_else(|| err("SYNTAX", "Expected JSON integer token"))
}
fn parse_integer(t: &str, signed: bool) -> Result<BigInt, EngineError> {
    // Validate bounded JSON-number syntax, then perform exact decimal/exponent arithmetic.
    let b = t.as_bytes();
    let mut i = 0;
    let neg = if b.first() == Some(&b'-') {
        i = 1;
        true
    } else {
        false
    };
    if i >= b.len() {
        return Err(err("SYNTAX", "Expected JSON integer token"));
    }
    let start = i;
    if b[i] == b'0' {
        i += 1;
        if i < b.len() && b[i].is_ascii_digit() {
            return Err(err("SYNTAX", "Expected JSON integer token"));
        }
    } else if (b'1'..=b'9').contains(&b[i]) {
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1
        }
    } else {
        return Err(err("SYNTAX", "Expected JSON integer token"));
    }
    let int_end = i;
    let mut frac = "";
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let fs = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1
        }
        if i == fs {
            return Err(err("SYNTAX", "Expected JSON integer token"));
        }
        frac = &t[fs..i];
    }
    let mut exp = BigInt::zero();
    let mut exponent: Option<(usize, usize, bool, bool)> = None;
    if i < b.len() && matches!(b[i], b'e' | b'E') {
        i += 1;
        let has_sign = i < b.len() && matches!(b[i], b'+' | b'-');
        let sign = if i < b.len() && matches!(b[i], b'+' | b'-') {
            let x = b[i] == b'-';
            i += 1;
            x
        } else {
            false
        };
        let es = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1
        }
        if i == es {
            return Err(err("SYNTAX", "Expected JSON integer token"));
        }
        exponent = Some((es, i, sign, has_sign));
    }
    if i != b.len() {
        return Err(err("SYNTAX", "Expected JSON integer token"));
    }
    if let Some((es, end, sign, has_sign)) = exponent {
        if end - (es - usize::from(has_sign)) > 32 {
            return Err(err("LIMIT", "Exponent exceeds bound"));
        }
        exp = BigInt::parse_bytes(t[es..end].as_bytes(), 10)
            .ok_or_else(|| err("SYNTAX", "Expected JSON integer token"))?;
        if sign {
            exp = -exp;
        }
    }
    let mut digits = format!("{}{}", &t[start..int_end], frac);
    let trimmed = digits.trim_start_matches('0');
    digits = trimmed.to_owned();
    if digits.is_empty() {
        if neg {
            return Err(err("RANGE", "Negative zero loses sign"));
        }
        return Ok(BigInt::zero());
    }
    let shift = exp - BigInt::from(frac.len());
    if shift < BigInt::zero() {
        let n = -shift;
        if n > BigInt::from(digits.len()) {
            return Err(err("RANGE", "Nonintegral value"));
        }
        let n = n
            .to_usize()
            .ok_or_else(|| err("RANGE", "Nonintegral value"))?;
        let split = digits.len() - n;
        if digits[split..].bytes().any(|b| b != b'0') {
            return Err(err("RANGE", "Nonintegral value"));
        }
        digits.truncate(split);
        if digits.is_empty() {
            return Err(err("RANGE", "Nonintegral value"));
        }
    } else {
        if BigInt::from(digits.len()) + &shift > BigInt::from(39u8) {
            return Err(err("RANGE", "Integer outside 128-bit domain"));
        }
        let zeroes = shift
            .to_usize()
            .ok_or_else(|| err("RANGE", "Integer outside 128-bit domain"))?;
        digits.push_str(&"0".repeat(zeroes));
    }
    if digits.len() > 39 {
        return Err(err("RANGE", "Integer outside 128-bit domain"));
    }
    let mut n = BigInt::parse_bytes(digits.as_bytes(), 10)
        .ok_or_else(|| err("SYNTAX", "Expected JSON integer token"))?;
    if neg {
        n = -n;
    }
    let two128 = BigInt::from(1u8) << 128usize;
    let half = BigInt::from(1u8) << 127usize;
    let min = if signed { -&half } else { BigInt::zero() };
    let max = if signed {
        &half - BigInt::from(1u8)
    } else {
        &two128 - BigInt::from(1u8)
    };
    if n < min || n > max {
        return Err(err("RANGE", "Integer outside selected 128-bit domain"));
    }
    Ok(n)
}
fn as_u128(hex: &str) -> u128 {
    u128::from_str_radix(hex, 16).unwrap()
}
fn hex128(n: u128) -> String {
    format!("{n:032x}")
}
fn signedness(v: &Value) -> Result<bool, EngineError> {
    if let Value::Bool(b) = v {
        Ok(*b)
    } else {
        Err(err("TYPE", "Signedness must be explicit"))
    }
}

pub fn parse_bits128(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let t = text(value, ctx, "Expected hexadecimal text")?;
    if t.len() != 32 {
        return Err(err("SYNTAX", "Expected exactly 32 hexadecimal digits"));
    }
    let h = ascii(t).ok_or_else(|| err("SYNTAX", "Expected exactly 32 hexadecimal digits"))?;
    charge(ctx, 32)?;
    Ok(hex_value(&parse_hex_str(&h)?))
}
pub fn parse_uuid(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let t = text(value, ctx, "Expected UUID text")?;
    if t.len() != 36 {
        return Err(uuid_err(
            "UUID_SYNTAX",
            "Expected complete hyphenated UUID text",
        ));
    }
    let raw = ascii(t)
        .ok_or_else(|| uuid_err("UUID_SYNTAX", "Expected complete hyphenated UUID text"))?;
    charge(ctx, 36)?;
    let (c, h) = parse_uuid_str(&raw)?;
    Ok(obj(vec![
        ("profile", s(PROFILE)),
        ("hex", s(h)),
        ("canonicalText", s(c)),
        ("originalText", s(raw)),
    ]))
}
pub fn bits128_from_bytes(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let Value::Array(a) = value else {
        return Err(err("TYPE", "Expected a Uint8Array"));
    };
    if a.len() != 16 {
        return Err(err("SYNTAX", "Expected exactly 16 bytes"));
    }
    charge(ctx, 16)?;
    let mut h = String::with_capacity(32);
    for x in a {
        match x {
            Value::Number(n) if n.is_finite() && n.fract() == 0.0 && *n >= 0.0 && *n <= 255.0 => {
                h.push_str(&format!("{:02x}", *n as u8))
            }
            _ => return Err(err("TYPE", "Expected a Uint8Array")),
        }
    }
    Ok(hex_value(&h))
}
pub fn bits128_to_bytes(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let h = bits(value, ctx)?;
    charge(ctx, 16)?;
    let a = (0..16)
        .map(|i| Value::Number(u8::from_str_radix(&h[i * 2..i * 2 + 2], 16).unwrap() as f64))
        .collect();
    Ok(Value::Array(a))
}
pub fn uuid_from_bits128(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let h = bits(value, ctx)?;
    let c = format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    );
    Ok(obj(vec![
        ("profile", s(PROFILE)),
        ("hex", s(h)),
        ("canonicalText", s(c.clone())),
        ("originalText", s(c)),
    ]))
}
pub fn uuid_to_bits128(value: &Value, ctx: &mut Context<'_>) -> Result<Value, EngineError> {
    let (h, _, _) = uuid(value, ctx)?;
    Ok(hex_value(&h))
}
pub fn compare_bits128(
    left: &Value,
    right: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let a = bits(left, ctx)?;
    let b = bits(right, ctx)?;
    Ok(Value::Number(match a.cmp(&b) {
        std::cmp::Ordering::Less => -1.0,
        std::cmp::Ordering::Equal => 0.0,
        std::cmp::Ordering::Greater => 1.0,
    }))
}
pub fn bits128_to_words(
    value: &Value,
    signed: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let signed = signedness(signed)?;
    let h = bits(value, ctx)?;
    let n = as_u128(&h);
    let word = |x: u64| {
        let z = if signed && (x >> 63) != 0 {
            (x as i64).to_string()
        } else {
            x.to_string()
        };
        s(z)
    };
    Ok(obj(vec![
        ("high", word((n >> 64) as u64)),
        ("low", word(n as u64)),
    ]))
}
pub fn bits128_from_words(
    value: &Value,
    signed: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let signed = signedness(signed)?;
    exact_object(
        value,
        &["high", "low"],
        "TYPE",
        "Expected exactly high and low words",
        ctx,
    )?;
    let mut parse = |key: &str| -> Result<u64, EngineError> {
        let Some(Value::String(t)) = get(value, key) else {
            return Err(err("TYPE", "Words require exact text"));
        };
        ctx.charge_text(t.len(), Utf16::default())?;
        if t.len() > 20 {
            return Err(err("LIMIT", "Word text exceeds 20 characters"));
        }
        let Some(t) = ascii(t) else {
            return Err(err("SYNTAX", "Expected canonical decimal word"));
        };
        let canonical = if let Some(rest) = t.strip_prefix('-') {
            !rest.is_empty()
                && (b'1'..=b'9').contains(&rest.as_bytes()[0])
                && rest.bytes().all(|b| b.is_ascii_digit())
        } else {
            t == "0"
                || (!t.is_empty()
                    && (b'1'..=b'9').contains(&t.as_bytes()[0])
                    && t.bytes().all(|b| b.is_ascii_digit()))
        };
        if !canonical {
            return Err(err("SYNTAX", "Expected canonical decimal word"));
        }
        let n = t
            .parse::<i128>()
            .map_err(|_| err("RANGE", "Word outside selected 64-bit domain"))?;
        let (min, max) = if signed {
            (-(1i128 << 63), (1i128 << 63) - 1)
        } else {
            (0, (1i128 << 64) - 1)
        };
        if n < min || n > max {
            return Err(err("RANGE", "Word outside selected 64-bit domain"));
        }
        Ok(if n < 0 {
            (n + (1i128 << 64)) as u64
        } else {
            n as u64
        })
    };
    let hi = parse("high")?;
    let lo = parse("low")?;
    charge(ctx, 32)?;
    Ok(hex_value(&hex128(((hi as u128) << 64) | lo as u128)))
}
pub fn bits128_to_integer(
    value: &Value,
    signed: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let signed = signedness(signed)?;
    let h = bits(value, ctx)?;
    let n = BigInt::from(as_u128(&h));
    let two = BigInt::from(1u8) << 128usize;
    let n = if signed && n.sign() == num_bigint::Sign::Plus && n >= (BigInt::from(1u8) << 127usize)
    {
        n - two
    } else {
        n
    };
    Ok(obj(vec![("integerToken", s(n.to_string()))]))
}
pub fn bits128_from_integer(
    value: &Value,
    signed: &Value,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let signed = signedness(signed)?;
    let t = raw_integer(value, ctx)?;
    charge(ctx, t.len())?;
    let n = parse_integer(&t, signed)?;
    let two = BigInt::from(1u8) << 128usize;
    let encoded = if n.is_negative() { n + two } else { n };
    let h = format!(
        "{:032x}",
        encoded
            .to_u128()
            .ok_or_else(|| err("RANGE", "Integer outside selected 128-bit domain"))?
    );
    Ok(hex_value(&h))
}
