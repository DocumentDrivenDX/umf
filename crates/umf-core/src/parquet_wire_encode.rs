// SPDX-License-Identifier: MIT OR Apache-2.0
//! Exact bounded Compact Protocol writer for admitted Parquet wire values.
use crate::{Context, EngineError, Utf16, Value};

fn error(message: &'static str) -> EngineError {
    EngineError::new("PARQUET_WIRE_ENCODE", Utf16::default(), message)
}
fn key_is(key: &Utf16, name: &str) -> bool {
    key.units().iter().copied().eq(name.bytes().map(u16::from))
}
fn prop<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key_is(key, name))
        .map(|(_, v)| v)
}
fn string<'a>(value: &'a Value, name: &str) -> Option<&'a Utf16> {
    match prop(value, name) {
        Some(Value::String(s)) => Some(s),
        _ => None,
    }
}
fn kind_text(k: Option<&Utf16>) -> Result<u8, EngineError> {
    let Some(k) = k else {
        return Err(error("Unknown wire kind"));
    };
    for (name, tag) in [
        ("bool", 1),
        ("i8", 3),
        ("i16", 4),
        ("i32", 5),
        ("i64", 6),
        ("double", 7),
        ("binary", 8),
        ("list", 9),
        ("set", 10),
        ("map", 11),
        ("struct", 12),
        ("uuid", 13),
    ] {
        if key_is(k, name) {
            return Ok(tag);
        }
    }
    Err(error("Unknown wire kind"))
}
fn kind(value: &Value) -> Result<u8, EngineError> {
    kind_text(string(value, "kind"))
}
fn allowed(value: &Value, names: &[&str], message: &'static str) -> Result<(), EngineError> {
    let Value::Object(fields) = value else {
        return Err(error("Wire value structural limit exceeded"));
    };
    if fields
        .iter()
        .any(|(key, _)| !names.iter().any(|n| key_is(key, n)))
    {
        return Err(error(message));
    }
    Ok(())
}
struct Writer<'a, 'b> {
    bytes: Vec<u8>,
    nodes: usize,
    ctx: &'a mut Context<'b>,
}
impl Writer<'_, '_> {
    fn byte(&mut self, b: u8) -> Result<(), EngineError> {
        if self.bytes.len() >= 1_000_000 {
            return Err(error("Encoded value exceeds 1000000 bytes"));
        }
        self.ctx.charge_work(1, Utf16::default())?;
        self.bytes.try_reserve(1).map_err(|_| {
            EngineError::new(
                "CAPACITY",
                Utf16::default(),
                "Unable to allocate encoded value",
            )
        })?;
        self.bytes.push(b);
        Ok(())
    }
    fn unsigned(&mut self, mut n: u128) -> Result<(), EngineError> {
        loop {
            let mut b = (n & 127) as u8;
            n >>= 7;
            if n != 0 {
                b |= 128
            };
            self.byte(b)?;
            if n == 0 {
                return Ok(());
            }
        }
    }
    fn signed(&mut self, n: i128) -> Result<(), EngineError> {
        self.unsigned(if n >= 0 {
            (n as u128) << 1
        } else {
            ((-n as u128) << 1) - 1
        })
    }
    fn integer(&mut self, s: Option<&Utf16>, bits: u32) -> Result<i128, EngineError> {
        let Some(s) = s else {
            return Err(error("Expected canonical signed decimal integer"));
        };
        self.ctx.charge_work(s.len().max(1), Utf16::default())?;
        let u = s.units();
        let valid = !u.is_empty()
            && u.len() <= 21
            && (u == [48] || {
                let start = usize::from(u[0] == 45);
                start < u.len()
                    && u[start] >= 49
                    && u[start] <= 57
                    && u[start + 1..].iter().all(|x| (48..=57).contains(x))
            });
        if !valid {
            return Err(error("Expected canonical signed decimal integer"));
        }
        let text = s
            .to_utf8()
            .map_err(|_| error("Expected canonical signed decimal integer"))?;
        let n = text
            .parse::<i128>()
            .map_err(|_| error("Expected canonical signed decimal integer"))?;
        let limit = 1_i128 << (bits - 1);
        if n < -limit || n >= limit {
            return Err(error("Integer exceeds declared width"));
        }
        Ok(n)
    }
    fn hex(&mut self, s: Option<&Utf16>, length: Option<usize>) -> Result<(), EngineError> {
        let Some(s) = s else {
            return Err(error("Invalid exact byte encoding"));
        };
        let u = s.units();
        self.ctx.charge_work(u.len().max(1), Utf16::default())?;
        if u.len() > 2_000_000
            || u.len() % 2 != 0
            || length.is_some_and(|n| u.len() != 2 * n)
            || !u
                .iter()
                .all(|x| (48..=57).contains(x) || (97..=102).contains(x))
        {
            return Err(error("Invalid exact byte encoding"));
        }
        for pair in u.chunks_exact(2) {
            let nibble = |x: u16| if x <= 57 { x - 48 } else { x - 97 + 10 };
            self.byte(((nibble(pair[0]) << 4) | nibble(pair[1])) as u8)?;
        }
        Ok(())
    }
    fn write(&mut self, v: &Value, depth: usize, field: bool) -> Result<(), EngineError> {
        if !matches!(v, Value::Object(_)) || depth > 64 || self.nodes >= 50_000 {
            return Err(error("Wire value structural limit exceeded"));
        }
        self.nodes += 1;
        self.ctx.charge_work(1, Utf16::default())?;
        let k = kind(v)?;
        let names: &[&str] = match k {
            1 | 3 | 4 | 5 | 6 => &["kind", "value"],
            7 => &["kind", "bits"],
            8 | 13 => &["kind", "hex"],
            9 | 10 => &["kind", "elementType", "items"],
            11 => &["kind", "keyType", "valueType", "entries"],
            _ => &["kind", "fields"],
        };
        allowed(
            v,
            names,
            "Unknown wire representation fields cannot be discarded",
        )?;
        match k {
            1 => {
                let Some(Value::Bool(b)) = prop(v, "value") else {
                    return Err(error("Expected boolean"));
                };
                if !field {
                    self.byte(if *b { 1 } else { 2 })?
                }
            }
            3 => {
                let n = self.integer(string(v, "value"), 8)?;
                self.byte(n as u8)?
            }
            4 | 5 | 6 => {
                let n = self.integer(
                    string(v, "value"),
                    match k {
                        4 => 16,
                        5 => 32,
                        _ => 64,
                    },
                )?;
                self.signed(n)?
            }
            7 => self.hex(string(v, "bits"), Some(8))?,
            13 => self.hex(string(v, "hex"), Some(16))?,
            8 => {
                let Some(s) = string(v, "hex") else {
                    return Err(error("Binary length exceeds limit"));
                };
                let u = s.units();
                if u.len() > 2_000_000
                    || u.len() % 2 != 0
                    || !u
                        .iter()
                        .all(|x| (48..=57).contains(x) || (97..=102).contains(x))
                {
                    return Err(error("Binary length exceeds limit"));
                }
                self.unsigned((u.len() / 2) as u128)?;
                self.hex(Some(s), None)?;
            }
            9 | 10 => {
                let ty = kind_text(string(v, "elementType"))?;
                let Some(Value::Array(items)) = prop(v, "items") else {
                    return Err(error("Collection exceeds value limit"));
                };
                if items.len() > 50_000 - self.nodes {
                    return Err(error("Collection exceeds value limit"));
                }
                let n = items.len();
                self.byte(((n.min(15) as u8) << 4) | ty)?;
                if n >= 15 {
                    self.unsigned(n as u128)?
                }
                for item in items {
                    if string(item, "kind") != string(v, "elementType") {
                        return Err(error("Collection element kind differs"));
                    };
                    self.write(item, depth + 1, false)?
                }
            }
            11 => {
                let Some(Value::Array(entries)) = prop(v, "entries") else {
                    return Err(error("Map exceeds value limit"));
                };
                if entries.len().saturating_mul(2) > 50_000 - self.nodes {
                    return Err(error("Map exceeds value limit"));
                }
                self.unsigned(entries.len() as u128)?;
                if entries.is_empty() {
                    if prop(v, "keyType").is_some() || prop(v, "valueType").is_some() {
                        return Err(error(
                            "Empty Compact Protocol maps cannot encode type information",
                        ));
                    }
                } else {
                    let kt = kind_text(string(v, "keyType"))?;
                    let vt = kind_text(string(v, "valueType"))?;
                    self.byte((kt << 4) | vt)?;
                    for e in entries {
                        allowed(e, &["key", "value"], "Unknown map entry fields")?;
                        let key = prop(e, "key").ok_or_else(|| error("Map entry kind differs"))?;
                        let value =
                            prop(e, "value").ok_or_else(|| error("Map entry kind differs"))?;
                        if string(key, "kind") != string(v, "keyType")
                            || string(value, "kind") != string(v, "valueType")
                        {
                            return Err(error("Map entry kind differs"));
                        }
                        self.write(key, depth + 1, false)?;
                        self.write(value, depth + 1, false)?;
                    }
                }
            }
            _ => {
                let Some(Value::Array(fields)) = prop(v, "fields") else {
                    return Err(error("Struct exceeds value limit"));
                };
                if fields.len() > 50_000 - self.nodes {
                    return Err(error("Struct exceeds value limit"));
                }
                let mut previous = 0_i128;
                for f in fields {
                    allowed(f, &["id", "value"], "Unknown struct field properties")?;
                    let Some(Value::Number(id)) = prop(f, "id") else {
                        return Err(error("Field ID exceeds int16"));
                    };
                    if !id.is_finite() || id.fract() != 0.0 || *id < -32768.0 || *id > 32767.0 {
                        return Err(error("Field ID exceeds int16"));
                    }
                    let id = *id as i128;
                    let value = prop(f, "value").ok_or_else(|| error("Unknown wire kind"))?;
                    let vk = kind(value)?;
                    let ty = if vk == 1 {
                        if matches!(prop(value, "value"), Some(Value::Bool(true))) {
                            1
                        } else {
                            2
                        }
                    } else {
                        vk
                    };
                    let delta = id - previous;
                    if delta > 0 && delta <= 15 {
                        self.byte(((delta as u8) << 4) | ty)?
                    } else {
                        self.byte(ty)?;
                        self.signed(id)?
                    }
                    previous = id;
                    self.write(value, depth + 1, true)?;
                }
                self.byte(0)?;
            }
        }
        Ok(())
    }
}

pub fn encode_parquet_wire(value: &Value, ctx: &mut Context<'_>) -> Result<Vec<u8>, EngineError> {
    let mut writer = Writer {
        bytes: Vec::new(),
        nodes: 0,
        ctx,
    };
    writer.write(value, 0, false)?;
    Ok(writer.bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn obj(fields: Vec<(&str, Value)>) -> Value {
        Value::Object(
            fields
                .into_iter()
                .map(|(k, v)| (Utf16::from(k), v))
                .collect(),
        )
    }
    fn boolean() -> Value {
        obj(vec![
            ("kind", Value::string_utf8("bool")),
            ("value", Value::Bool(true)),
        ])
    }
    fn list(item: Value) -> Value {
        let element_type = string(&item, "kind").unwrap().clone();
        obj(vec![
            ("kind", Value::string_utf8("list")),
            ("elementType", Value::String(element_type)),
            ("items", Value::Array(vec![item])),
        ])
    }
    #[test]
    fn structural_limits_and_control() {
        let mut deep = boolean();
        for _ in 0..65 {
            deep = list(deep)
        }
        assert_eq!(
            encode_parquet_wire(&deep, &mut Context::ordinary())
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Wire value structural limit exceeded"
        );
        let many = obj(vec![
            ("kind", Value::string_utf8("list")),
            ("elementType", Value::string_utf8("bool")),
            ("items", Value::Array(vec![boolean(); 50_000])),
        ]);
        assert_eq!(
            encode_parquet_wire(&many, &mut Context::ordinary())
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Collection exceeds value limit"
        );
        let mut meter = |_: usize| Err(EngineError::new("STOP", Utf16::default(), "meter refused"));
        let err = encode_parquet_wire(&boolean(), &mut Context::ordinary().with_meter(&mut meter))
            .unwrap_err();
        assert_eq!(err.code, "STOP");
    }
    #[test]
    fn raw_utf16_unknown_and_integer_refusal() {
        let mut value = boolean();
        let Value::Object(ref mut fields) = value else {
            unreachable!()
        };
        fields.push((Utf16::new(vec![0xd800]), Value::Null));
        assert_eq!(
            encode_parquet_wire(&value, &mut Context::ordinary())
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Unknown wire representation fields cannot be discarded"
        );
        let value = obj(vec![
            ("kind", Value::string_utf8("i64")),
            ("value", Value::String(Utf16::new(vec![0xd800]))),
        ]);
        assert_eq!(
            encode_parquet_wire(&value, &mut Context::ordinary())
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Expected canonical signed decimal integer"
        );
    }
    #[test]
    fn inclusive_node_and_byte_ceiling() {
        let list = obj(vec![
            ("kind", Value::string_utf8("list")),
            ("elementType", Value::string_utf8("bool")),
            ("items", Value::Array(vec![boolean(); 49_999])),
        ]);
        assert_eq!(
            encode_parquet_wire(&list, &mut Context::ordinary())
                .unwrap()
                .len(),
            50_003
        );
        let binary = obj(vec![
            ("kind", Value::string_utf8("binary")),
            ("hex", Value::string_utf8("00".repeat(999_997))),
        ]);
        assert_eq!(
            encode_parquet_wire(&binary, &mut Context::ordinary())
                .unwrap()
                .len(),
            1_000_000
        );
    }
}
