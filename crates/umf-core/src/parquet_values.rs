// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded Parquet logical views that retain each physical carrier.

use crate::{
    context::Context,
    engine::{Capabilities, Engine},
    error::EngineError,
    parquet_capture_inspection::{diagnostic, from_json, inspect_parquet_containers, to_json},
    parquet_rows::assemble_parquet_rows,
    registry::Registry,
    value::{ecma_number_to_string, Utf16, Value},
};
use num_bigint::{BigInt, Sign};
use serde_json::{json, Value as Json};
use std::collections::{BTreeMap, BTreeSet};

const TEXT_UNITS_LIMIT: usize = 64 * 1024 * 1024;
const JSON_TEXT_UNITS_LIMIT: usize = 4_000_000;
const JSON_DEPTH_LIMIT: usize = 128;
const JSON_VALUES_LIMIT: usize = 100_000;
const DECIMAL_BYTES_LIMIT: usize = 4_096;
const DECIMAL_DIGITS_LIMIT: usize = 10_000;

fn error(message: impl AsRef<str>) -> EngineError {
    EngineError::new(
        "PARQUET_VALUE_PROJECTION",
        Utf16::default(),
        message.as_ref(),
    )
}

fn member<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    let Value::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(key, _)| key == &Utf16::from(name))
        .map(|(_, value)| value)
}

fn array(value: &Value) -> Option<&[Value]> {
    if let Value::Array(values) = value {
        Some(values)
    } else {
        None
    }
}

fn text(value: &Value) -> Option<String> {
    if let Value::String(value) = value {
        value.to_utf8().ok()
    } else {
        None
    }
}

fn public_result(source: Value, status: &str, diagnostics: Vec<Value>) -> Value {
    Value::Object(vec![
        (Utf16::from("source"), source),
        (Utf16::from("status"), Value::string_utf8(status)),
        (Utf16::from("complete"), Value::Bool(false)),
        (Utf16::from("diagnostics"), Value::Array(diagnostics)),
    ])
}

// The internal JSON maps are lookup structures. Reconstruct only the known
// public carrier shapes in their specified member order; opaque parameters
// retain the original ordered core Value from logical inspection.
fn ordered_projection(
    value: Json,
    parameters: &BTreeMap<usize, &Value>,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    ctx.charge_work(1, Utf16::default())?;
    Ok(match value {
        Json::Array(values) => {
            ctx.charge_work(values.len(), Utf16::default())?;
            Value::Array(
                values
                    .into_iter()
                    .map(|v| ordered_projection(v, parameters, ctx))
                    .collect::<Result<_, _>>()?,
            )
        }
        Json::Object(mut fields) => {
            ctx.charge_work(fields.len(), Utf16::default())?;
            let index = fields
                .remove("__schemaIndex")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize);
            let keys: &[&str] = if fields.contains_key("type") {
                &["type", "value", "hex"]
            } else if fields.contains_key("index") && fields.contains_key("name") {
                &["index", "name", "value"]
            } else if fields.contains_key("key") {
                &["key", "value"]
            } else {
                match fields.get("kind").and_then(Json::as_str) {
                    Some("record" | "struct") => &["kind", "fields"],
                    Some("list" | "repeated") => &["kind", "items"],
                    Some("map") => &["kind", "duplicateKeys", "entries"],
                    Some("opaque") => &["kind", "annotation", "parameters", "physical"],
                    Some("time" | "timestamp") => {
                        &["kind", "unit", "isAdjustedToUTC", "value", "physical"]
                    }
                    Some("int" | "uint" | "float") => &["kind", "bits", "value", "physical"],
                    Some("physical") => &["kind", "value"],
                    _ => &["kind", "value", "physical"],
                }
            };
            let mut ordered = Vec::new();
            for key in keys {
                if let Some(value) = fields.remove(*key) {
                    let value = if *key == "parameters" {
                        if let Some(original) = index.and_then(|i| parameters.get(&i)) {
                            crate::value::copy_json(original, ctx)?
                        } else {
                            ordered_projection(value, parameters, ctx)?
                        }
                    } else {
                        ordered_projection(value, parameters, ctx)?
                    };
                    ctx.charge_work(key.len(), Utf16::default())?;
                    ordered.push((Utf16::from(*key), value));
                }
            }
            debug_assert!(fields.is_empty(), "unexpected internal projection fields");
            Value::Object(ordered)
        }
        Json::String(text) => {
            ctx.charge_work(text.encode_utf16().count(), Utf16::default())?;
            Value::string_utf8(text)
        }
        scalar => from_json(scalar),
    })
}

struct Projector<'a, 'ctx> {
    annotations: BTreeMap<usize, Json>,
    containers: BTreeMap<usize, Json>,
    opaque_reported: BTreeSet<usize>,
    diagnostics: Vec<Value>,
    text_units: usize,
    ctx: &'a mut Context<'ctx>,
}

impl Projector<'_, '_> {
    fn text(&mut self, value: String) -> Result<String, EngineError> {
        let units = value.encode_utf16().count();
        self.text_units = self
            .text_units
            .checked_add(units)
            .filter(|total| *total <= TEXT_UNITS_LIMIT)
            .ok_or_else(|| error("Logical text exceeds 64 Mi UTF-16 unit budget"))?;
        self.ctx.charge_work(units, Utf16::default())?;
        Ok(value)
    }

    fn physical<'value>(&self, value: &'value Json) -> Result<&'value Json, EngineError> {
        (value["kind"] == "physical")
            .then_some(&value["value"])
            .ok_or_else(|| error("Expected physical carrier"))
    }

    fn integer(&self, physical: &Json) -> Result<BigInt, EngineError> {
        match physical["type"].as_str() {
            Some("INT32" | "INT64") => BigInt::parse_bytes(
                physical["value"]
                    .as_str()
                    .ok_or_else(|| error("Expected integer carrier"))?
                    .as_bytes(),
                10,
            )
            .ok_or_else(|| error("Expected integer carrier")),
            _ => Err(error("Expected integer carrier")),
        }
    }

    fn bytes(&mut self, physical: &Json) -> Result<Vec<u8>, EngineError> {
        let hex = physical["hex"]
            .as_str()
            .ok_or_else(|| error("Expected physical bytes"))?;
        if hex.len() % 2 != 0 {
            return Err(error("Invalid physical bytes"));
        }
        self.ctx.charge_work(hex.len(), Utf16::default())?;
        let mut bytes = Vec::new();
        bytes
            .try_reserve_exact(hex.len() / 2)
            .map_err(|_| allocation_error())?;
        for pair in hex.as_bytes().chunks_exact(2) {
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                _ => None,
            };
            let high = digit(pair[0]).ok_or_else(|| error("Invalid physical bytes"))?;
            let low = digit(pair[1]).ok_or_else(|| error("Invalid physical bytes"))?;
            bytes.push((high << 4) | low);
        }
        Ok(bytes)
    }

    fn opaque(&mut self, index: usize, raw: &Json, annotation: &Json) -> Json {
        if self.opaque_reported.insert(index) {
            self.diagnostics.push(diagnostic(
                "PARQUET_VALUE_OPAQUE",
                &format!("/schema/{index}"),
                "warning",
                &format!(
                    "Logical annotation {} retains its physical representation without interpretation",
                    annotation["name"].as_str().unwrap_or("unknown")
                ),
            ));
        }
        json!({
            "__schemaIndex":index,
            "kind":"opaque",
            "annotation":annotation["name"],
            "parameters":annotation["parameters"],
            "physical":raw
        })
    }

    fn project(
        &mut self,
        index: usize,
        raw: &Json,
        in_repeated: bool,
    ) -> Result<Json, EngineError> {
        self.ctx.charge_work(1, Utf16::default())?;
        if raw.is_null() {
            return Ok(Json::Null);
        }
        let annotation = self.annotations.get(&index).cloned();
        let container = self.containers.get(&index).cloned();
        if raw["kind"] == "repeated" && !in_repeated {
            let items = raw["items"]
                .as_array()
                .ok_or_else(|| error("Expected repeated container"))?;
            let mut output = Vec::new();
            output
                .try_reserve_exact(items.len())
                .map_err(|_| allocation_error())?;
            for item in items {
                output.push(self.project(index, item, true)?);
            }
            return Ok(json!({"kind":"list","items":output}));
        }
        if let Some(container) = container {
            let repeated_index = json_index(&container["repeatedIndex"])?;
            let repeated = row_field(raw, repeated_index)?;
            if repeated["kind"] != "repeated" {
                return Err(error("Expected repeated container"));
            }
            let items = repeated["items"]
                .as_array()
                .ok_or_else(|| error("Expected repeated container"))?;
            if container["kind"] == "list" {
                let element_index = json_index(&container["elementIndex"])?;
                let mut output = Vec::new();
                output
                    .try_reserve_exact(items.len())
                    .map_err(|_| allocation_error())?;
                for item in items {
                    let element = if container["layout"] == "two-level" {
                        item
                    } else {
                        row_field(item, element_index)?
                    };
                    output.push(self.project(element_index, element, true)?);
                }
                return Ok(json!({"kind":"list","items":output}));
            }
            let key_index = json_index(&container["keyIndex"])?;
            let value_index = container
                .get("valueIndex")
                .filter(|value| !value.is_null())
                .map(json_index)
                .transpose()?;
            let mut entries = Vec::new();
            entries
                .try_reserve_exact(items.len())
                .map_err(|_| allocation_error())?;
            for item in items {
                let key = row_field(item, key_index)?;
                let key = self.project(key_index, key, false)?;
                let value = if let Some(index) = value_index {
                    self.project(index, row_field(item, index)?, false)?
                } else {
                    Json::Null
                };
                entries.push(json!({
                    "key":key,
                    "value":value
                }));
            }
            return Ok(json!({
                "kind":"map",
                "duplicateKeys":"last-value",
                "entries":entries
            }));
        }

        if raw["kind"] == "record" {
            if let Some(annotation) = annotation.as_ref() {
                return Ok(self.opaque(index, raw, annotation));
            }
            let fields = raw["fields"]
                .as_array()
                .ok_or_else(|| error("Expected physical record"))?;
            let mut output = Vec::new();
            output
                .try_reserve_exact(fields.len())
                .map_err(|_| allocation_error())?;
            for field in fields {
                let field_index = json_index(&field["index"])?;
                output.push(json!({
                    "index":field_index,
                    "name":field["name"],
                    "value":self.project(field_index,&field["value"],false)?
                }));
            }
            return Ok(json!({"kind":"struct","fields":output}));
        }
        if raw["kind"] != "physical" {
            return Err(error("Unexpected physical structure"));
        }
        let physical = self.physical(raw)?.clone();
        let retained_physical = physical.clone();
        let annotation_name = annotation.as_ref().and_then(|a| a["name"].as_str());
        let parameters = annotation.as_ref().map(|a| &a["parameters"]);

        if annotation_name == Some("UNKNOWN") {
            return Err(error("Non-null value contradicts UNKNOWN annotation"));
        }
        if annotation_name == Some("DECIMAL") {
            let parameters = parameters.unwrap();
            let precision = json_number(&parameters["precision"])?;
            let scale = json_number(&parameters["scale"])?;
            if precision > DECIMAL_DIGITS_LIMIT || scale > DECIMAL_DIGITS_LIMIT {
                return Err(error("Decimal digit/scale budget exceeded"));
            }
            let mut number = if matches!(physical["type"].as_str(), Some("INT32" | "INT64")) {
                self.integer(&physical)?
            } else {
                let hex = physical["hex"]
                    .as_str()
                    .ok_or_else(|| error("Expected physical bytes"))?;
                if hex.is_empty() || hex.len() > DECIMAL_BYTES_LIMIT * 2 {
                    return Err(error("Decimal byte budget exceeded"));
                }
                let bytes = self.bytes(&physical)?;
                let unsigned = BigInt::from_bytes_be(Sign::Plus, &bytes);
                if bytes[0] & 0x80 != 0 {
                    unsigned - (BigInt::from(1u8) << (bytes.len() * 8))
                } else {
                    unsigned
                }
            };
            let negative = number.sign() == Sign::Minus;
            if negative {
                number = -number;
            }
            let digits = number.to_str_radix(10);
            if digits.len() > precision {
                return Err(error("Decimal value exceeds declared precision"));
            }
            let mut padded = String::new();
            let needed = scale.saturating_add(1);
            padded
                .try_reserve_exact(needed.max(digits.len()))
                .map_err(|_| allocation_error())?;
            if digits.len() < needed {
                padded.extend(std::iter::repeat_n('0', needed - digits.len()));
            }
            padded.push_str(&digits);
            let result = if scale == 0 {
                padded
            } else {
                let split = padded.len() - scale;
                format!("{}.{}", &padded[..split], &padded[split..])
            };
            return Ok(json!({
                "kind":"decimal",
                "value":self.text(format!("{}{}",if negative{"-"}else{""},result))?,
                "physical":retained_physical
            }));
        }
        if annotation_name == Some("INTEGER") {
            let parameters = parameters.unwrap();
            let mut integer = self.integer(&physical)?;
            let bits = json_number(&parameters["bitWidth"])?;
            let signed = parameters["isSigned"].as_bool().unwrap_or(false);
            if !signed && integer.sign() == Sign::Minus && bits == physical_width(&physical)? {
                integer += BigInt::from(1u8) << bits;
            }
            let low = if signed {
                -(BigInt::from(1u8) << (bits - 1))
            } else {
                BigInt::from(0u8)
            };
            let high =
                (BigInt::from(1u8) << (bits - if signed { 1 } else { 0 })) - BigInt::from(1u8);
            if integer < low || integer > high {
                return Err(error("Integer value exceeds logical width"));
            }
            return Ok(json!({
                "kind":if signed{"int"}else{"uint"},
                "bits":bits,
                "value":self.text(integer.to_string())?,
                "physical":retained_physical
            }));
        }
        if matches!(annotation_name, Some("STRING" | "ENUM" | "JSON")) {
            let bytes = self.bytes(&physical)?;
            let value =
                String::from_utf8(bytes).map_err(|_| error("Invalid UTF-8 logical text"))?;
            if annotation_name == Some("JSON") {
                check_json_text(&value)?;
            }
            return Ok(json!({
                "kind":annotation_name.unwrap().to_ascii_lowercase(),
                "value":self.text(value)?,
                "physical":retained_physical
            }));
        }
        if annotation_name == Some("DATE") {
            let date = self.integer(&physical)?.to_string();
            return Ok(json!({
                "kind":"date",
                "value":self.text(date)?,
                "physical":retained_physical
            }));
        }
        if matches!(annotation_name, Some("TIME" | "TIMESTAMP")) {
            let parameters = parameters.unwrap();
            let unit = parameters["unit"]
                .as_object()
                .and_then(|units| units.keys().find(|key| key.as_str() != "$unknown"))
                .cloned();
            let Some(unit) =
                unit.filter(|unit| matches!(unit.as_str(), "MILLIS" | "MICROS" | "NANOS"))
            else {
                return Ok(self.opaque(index, raw, annotation.as_ref().unwrap()));
            };
            let integer = self.integer(&physical)?;
            if annotation_name == Some("TIME") {
                let per_day = match unit.as_str() {
                    "MILLIS" => BigInt::from(86_400_000u32),
                    "MICROS" => BigInt::from(86_400_000_000u64),
                    _ => BigInt::from(86_400_000_000_000u64),
                };
                if integer.sign() == Sign::Minus || integer >= per_day {
                    return Err(error("Time value is outside a day"));
                }
            }
            return Ok(json!({
                "kind":if annotation_name==Some("TIME"){"time"}else{"timestamp"},
                "unit":unit,
                "isAdjustedToUTC":parameters["isAdjustedToUTC"],
                "value":self.text(integer.to_string())?,
                "physical":retained_physical
            }));
        }
        if annotation_name == Some("UUID") {
            let hex = physical["hex"]
                .as_str()
                .ok_or_else(|| error("Expected physical bytes"))?;
            if hex.len() != 32 {
                return Err(error("Expected physical bytes"));
            }
            let uuid = format!(
                "{}-{}-{}-{}-{}",
                &hex[..8],
                &hex[8..12],
                &hex[12..16],
                &hex[16..20],
                &hex[20..]
            );
            return Ok(json!({
                "kind":"uuid",
                "value":self.text(uuid)?,
                "physical":retained_physical
            }));
        }
        if annotation_name == Some("FLOAT16")
            || annotation.is_none() && matches!(physical["type"].as_str(), Some("FLOAT" | "DOUBLE"))
        {
            let bytes = self.bytes(&physical)?;
            let (number, bits) = if annotation_name == Some("FLOAT16") {
                if bytes.len() != 2 {
                    return Err(error("Expected physical bytes"));
                }
                (
                    half_to_f64(u16::from_le_bytes([bytes[0], bytes[1]])),
                    16usize,
                )
            } else if physical["type"] == "FLOAT" {
                if bytes.len() != 4 {
                    return Err(error("Expected physical bytes"));
                }
                (
                    f32::from_le_bytes(bytes[..4].try_into().unwrap()) as f64,
                    32usize,
                )
            } else {
                if bytes.len() != 8 {
                    return Err(error("Expected physical bytes"));
                }
                (f64::from_le_bytes(bytes[..8].try_into().unwrap()), 64usize)
            };
            return Ok(json!({
                "kind":"float",
                "bits":bits,
                "value":self.text(number_string(number))?,
                "physical":retained_physical
            }));
        }
        if let Some(annotation) = annotation.as_ref() {
            return Ok(self.opaque(index, raw, annotation));
        }
        if physical["type"] == "BOOLEAN" {
            return Ok(json!({
                "kind":"bool",
                "value":physical["value"],
                "physical":retained_physical
            }));
        }
        if matches!(physical["type"].as_str(), Some("INT32" | "INT64")) {
            let bits = if physical["type"] == "INT32" { 32 } else { 64 };
            return Ok(json!({
                "kind":"int",
                "bits":bits,
                "value":self.text(physical["value"].as_str().unwrap_or_default().to_owned())?,
                "physical":retained_physical
            }));
        }
        let kind = if physical["type"] == "INT96" {
            "int96"
        } else {
            "bytes"
        };
        Ok(json!({
            "kind":kind,
            "value":self.text(physical["hex"].as_str().unwrap_or_default().to_owned())?,
            "physical":retained_physical
        }))
    }
}

fn json_index(value: &Json) -> Result<usize, EngineError> {
    value
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .or_else(|| value.as_str().and_then(|value| value.parse::<usize>().ok()))
        .ok_or_else(|| error("Schema index unavailable"))
}

fn json_number(value: &Json) -> Result<usize, EngineError> {
    value
        .as_u64()
        .and_then(|value| usize::try_from(value).ok())
        .or_else(|| value.as_str().and_then(|value| value.parse::<usize>().ok()))
        .ok_or_else(|| error("Invalid logical parameter"))
}

fn physical_width(physical: &Json) -> Result<usize, EngineError> {
    match physical["type"].as_str() {
        Some("INT32") => Ok(32),
        Some("INT64") => Ok(64),
        _ => Err(error("Expected integer carrier")),
    }
}

fn row_field(row: &Json, index: usize) -> Result<&Json, EngineError> {
    if row["kind"] != "record" {
        return Err(error("Expected physical record"));
    }
    row["fields"]
        .as_array()
        .and_then(|fields| {
            fields
                .iter()
                .find(|field| field["index"].as_u64() == Some(index as u64))
        })
        .map(|field| &field["value"])
        .ok_or_else(|| error("Physical field missing"))
}

fn half_to_f64(value: u16) -> f64 {
    let sign = if value & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exponent = (value >> 10) & 0x1f;
    let fraction = value & 0x03ff;
    if exponent == 0x1f {
        if fraction != 0 {
            f64::NAN
        } else {
            sign * f64::INFINITY
        }
    } else if exponent == 0 {
        sign * 2f64.powi(-14) * f64::from(fraction) / 1024.0
    } else {
        sign * 2f64.powi(i32::from(exponent) - 15) * (1.0 + f64::from(fraction) / 1024.0)
    }
}

fn number_string(value: f64) -> String {
    if value.is_nan() {
        "NaN".to_owned()
    } else if value == f64::INFINITY {
        "Infinity".to_owned()
    } else if value == f64::NEG_INFINITY {
        "-Infinity".to_owned()
    } else if value == 0.0 && value.is_sign_negative() {
        "-0".to_owned()
    } else {
        ecma_number_to_string(value)
    }
}

fn check_json_text(text: &str) -> Result<(), EngineError> {
    if text.encode_utf16().count() > JSON_TEXT_UNITS_LIMIT {
        return Err(error("JSON text budget exceeded"));
    }
    struct Scanner<'a> {
        bytes: &'a [u8],
        at: usize,
        values: usize,
    }
    impl Scanner<'_> {
        fn fail() -> EngineError {
            error("Invalid JSON text or syntax budget exceeded")
        }
        fn whitespace(&mut self) {
            while self.at < self.bytes.len()
                && matches!(self.bytes[self.at], b' ' | b'\t' | b'\n' | b'\r')
            {
                self.at += 1;
            }
        }
        fn string(&mut self) -> Result<(), EngineError> {
            if self.bytes.get(self.at) != Some(&b'"') {
                return Err(Self::fail());
            }
            self.at += 1;
            while self.at < self.bytes.len() {
                let byte = self.bytes[self.at];
                self.at += 1;
                if byte == b'"' {
                    return Ok(());
                }
                if byte < 0x20 {
                    return Err(Self::fail());
                }
                if byte == b'\\' {
                    let escaped = *self.bytes.get(self.at).ok_or_else(Self::fail)?;
                    self.at += 1;
                    if escaped == b'u' {
                        for _ in 0..4 {
                            let digit = *self.bytes.get(self.at).ok_or_else(Self::fail)?;
                            if !digit.is_ascii_hexdigit() {
                                return Err(Self::fail());
                            }
                            self.at += 1;
                        }
                    } else if !matches!(
                        escaped,
                        b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't'
                    ) {
                        return Err(Self::fail());
                    }
                }
            }
            Err(Self::fail())
        }
        fn value(&mut self, depth: usize) -> Result<(), EngineError> {
            if depth > JSON_DEPTH_LIMIT {
                return Err(Self::fail());
            }
            self.values += 1;
            if self.values > JSON_VALUES_LIMIT {
                return Err(Self::fail());
            }
            self.whitespace();
            match self.bytes.get(self.at).copied() {
                Some(b'"') => self.string(),
                Some(b'[') | Some(b'{') => {
                    let object = self.bytes[self.at] == b'{';
                    let end = if object { b'}' } else { b']' };
                    self.at += 1;
                    self.whitespace();
                    if self.bytes.get(self.at) == Some(&end) {
                        self.at += 1;
                        return Ok(());
                    }
                    loop {
                        if object {
                            self.whitespace();
                            self.string()?;
                            self.whitespace();
                            if self.bytes.get(self.at) != Some(&b':') {
                                return Err(Self::fail());
                            }
                            self.at += 1;
                        }
                        self.value(depth + 1)?;
                        self.whitespace();
                        if self.bytes.get(self.at) == Some(&end) {
                            self.at += 1;
                            return Ok(());
                        }
                        if self.bytes.get(self.at) != Some(&b',') {
                            return Err(Self::fail());
                        }
                        self.at += 1;
                    }
                }
                Some(b'n')
                    if self
                        .bytes
                        .get(self.at..self.at + 4)
                        .is_some_and(|value| value == b"null") =>
                {
                    self.at += 4;
                    Ok(())
                }
                Some(b't')
                    if self
                        .bytes
                        .get(self.at..self.at + 4)
                        .is_some_and(|value| value == b"true") =>
                {
                    self.at += 4;
                    Ok(())
                }
                Some(b'f')
                    if self
                        .bytes
                        .get(self.at..self.at + 5)
                        .is_some_and(|value| value == b"false") =>
                {
                    self.at += 5;
                    Ok(())
                }
                Some(_) => self.number(),
                None => Err(Self::fail()),
            }
        }
        fn number(&mut self) -> Result<(), EngineError> {
            let start = self.at;
            if self.bytes.get(self.at) == Some(&b'-') {
                self.at += 1;
            }
            match self.bytes.get(self.at) {
                Some(b'0') => self.at += 1,
                Some(b'1'..=b'9') => {
                    self.at += 1;
                    while self.bytes.get(self.at).is_some_and(u8::is_ascii_digit) {
                        self.at += 1;
                    }
                }
                _ => return Err(Self::fail()),
            }
            if self.bytes.get(self.at) == Some(&b'.') {
                self.at += 1;
                let fraction = self.at;
                while self.bytes.get(self.at).is_some_and(u8::is_ascii_digit) {
                    self.at += 1;
                }
                if fraction == self.at {
                    return Err(Self::fail());
                }
            }
            if matches!(self.bytes.get(self.at), Some(b'e' | b'E')) {
                self.at += 1;
                if matches!(self.bytes.get(self.at), Some(b'+' | b'-')) {
                    self.at += 1;
                }
                let exponent = self.at;
                while self.bytes.get(self.at).is_some_and(u8::is_ascii_digit) {
                    self.at += 1;
                }
                if exponent == self.at {
                    return Err(Self::fail());
                }
            }
            if self.at == start {
                return Err(Self::fail());
            }
            Ok(())
        }
    }

    let mut scanner = Scanner {
        bytes: text.as_bytes(),
        at: 0,
        values: 0,
    };
    scanner.value(0)?;
    scanner.whitespace();
    if scanner.at != scanner.bytes.len() {
        return Err(Scanner::fail());
    }
    Ok(())
}

fn allocation_error() -> EngineError {
    EngineError::new(
        "RESOURCE_LIMIT",
        Utf16::default(),
        "Parquet value allocation failed",
    )
    .with_control_failure()
}

/// Project verified physical rows into bounded logical views with carriers retained.
pub fn decode_parquet_values(
    document: &Value,
    engine: &Engine,
    registry: &Registry,
    capabilities: &mut dyn Capabilities,
    ctx: &mut Context<'_>,
) -> Result<Value, EngineError> {
    let view = inspect_parquet_containers(document, engine, registry, capabilities, ctx)?;
    let source = member(&view, "source")
        .ok_or_else(|| error("Container result omitted source"))?
        .clone();
    let mut diagnostics = array(
        member(&view, "diagnostics").ok_or_else(|| error("Container diagnostics unavailable"))?,
    )
    .unwrap_or(&[])
    .to_vec();
    if text(member(&view, "status").unwrap_or(&Value::Null)).as_deref() != Some("checked") {
        return Ok(public_result(source, "blocked", diagnostics));
    }

    let assembled = assemble_parquet_rows(document, engine, registry, capabilities, ctx)?;
    diagnostics.extend(
        array(
            member(&assembled, "diagnostics")
                .ok_or_else(|| error("Row diagnostics unavailable"))?,
        )
        .unwrap_or(&[])
        .iter()
        .cloned(),
    );
    if text(member(&assembled, "status").unwrap_or(&Value::Null)).as_deref() != Some("assembled") {
        return Ok(public_result(source, "blocked", diagnostics));
    }

    let parameter_values: BTreeMap<usize, &Value> =
        array(member(&view, "annotations").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .filter_map(|annotation| {
                let Value::Number(index) = member(annotation, "index")? else {
                    return None;
                };
                Some((*index as usize, member(annotation, "parameters")?))
            })
            .collect();
    let annotations = to_json(member(&view, "annotations").unwrap_or(&Value::Array(Vec::new())))?;
    let containers = to_json(member(&view, "containers").unwrap_or(&Value::Array(Vec::new())))?;
    let rows =
        to_json(member(&assembled, "rows").ok_or_else(|| error("Assembled rows unavailable"))?)?;
    let projection = (|| -> Result<Vec<Json>, EngineError> {
        let annotation_list = annotations
            .as_array()
            .ok_or_else(|| error("Logical annotations unavailable"))?;
        let container_list = containers
            .as_array()
            .ok_or_else(|| error("Container interpretations unavailable"))?;
        let mut annotation_map = BTreeMap::new();
        for annotation in annotation_list {
            annotation_map.insert(json_index(&annotation["index"])?, annotation.clone());
        }
        let mut container_map = BTreeMap::new();
        for container in container_list {
            container_map.insert(json_index(&container["index"])?, container.clone());
        }
        let mut projector = Projector {
            annotations: annotation_map,
            containers: container_map,
            opaque_reported: BTreeSet::new(),
            diagnostics: Vec::new(),
            text_units: 0,
            ctx,
        };
        let row_list = rows
            .as_array()
            .ok_or_else(|| error("Assembled rows unavailable"))?;
        let mut output = Vec::new();
        output
            .try_reserve_exact(row_list.len())
            .map_err(|_| allocation_error())?;
        for row in row_list {
            output.push(projector.project(0, row, false)?);
        }
        diagnostics.extend(projector.diagnostics);
        Ok(output)
    })();

    match projection {
        Ok(rows) => {
            diagnostics.push(diagnostic(
                "PARQUET_VALUE_SCOPE",
                "",
                "warning",
                "Implemented logical views projected with physical scalars retained; unsupported meanings are opaque, other codecs/encodings remain unsupported and cross-system lowering is separate",
            ));
            let mut result = public_result(source, "projected", diagnostics);
            if let Value::Object(fields) = &mut result {
                fields.push((
                    Utf16::from("rows"),
                    ordered_projection(Json::Array(rows), &parameter_values, ctx)?,
                ));
            }
            Ok(result)
        }
        Err(failure) if failure.is_control_failure() => Err(failure),
        Err(failure) => {
            diagnostics.push(diagnostic(
                "PARQUET_VALUE_PROJECTION",
                "",
                "error",
                &failure.message.to_utf8().unwrap_or_default(),
            ));
            Ok(public_result(source, "blocked", diagnostics))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        engine::{ResourceSet, SemanticContext},
        error::Diagnostic,
        parquet_capture_inspection::capture_parquet,
        registry::Registry,
        serialization::{read_json_value, Format},
    };
    use std::{fs, path::PathBuf};

    struct NoCapabilities;
    impl Capabilities for NoCapabilities {
        fn validate_extension(
            &mut self,
            _: u64,
            _: &Value,
            _: &SemanticContext,
        ) -> Result<Vec<Diagnostic>, Utf16> {
            Ok(Vec::new())
        }
    }

    fn parse_value(source: &str) -> Value {
        read_json_value(
            &source.encode_utf16().collect::<Vec<_>>(),
            Format::Json,
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn test_engine() -> Engine {
        Engine::new(
            ResourceSet::new(
                parse_value(include_str!("../../../spec/core/schema.json")),
                parse_value(include_str!(
                    "../../../spec/core/semantic-type-reference.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/core/extension-package.schema.json"
                )),
                parse_value(include_str!(
                    "../../../spec/metamodel/generated/core-constraints.json"
                )),
                parse_value(include_str!(
                    "../../../spec/metamodel/generated/domain-policy.json"
                )),
            ),
            &mut Context::ordinary(),
        )
        .unwrap()
    }

    fn fixture(path: &str) -> Vec<u8> {
        fs::read(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../")
                .join(path),
        )
        .unwrap()
    }

    #[test]
    fn ordered_output_checks_controls_before_copying_opaque_parameters() {
        let opaque = Value::Object(vec![
            (Utf16::from("z"), Value::string_utf8("x".repeat(10_000))),
            (Utf16::from("a"), Value::Bool(true)),
        ]);
        let parameters = BTreeMap::from([(7, &opaque)]);
        let projection = json!({"kind":"opaque","annotation":"future","parameters":{},"__schemaIndex":7,
            "physical":{"type":"INT32","value":"1"}});
        let output =
            ordered_projection(projection.clone(), &parameters, &mut Context::ordinary()).unwrap();
        assert_eq!(member(&output, "parameters"), Some(&opaque));
        let mut meter = |amount: usize| {
            if amount >= 10_000 {
                Err(EngineError::new(
                    "TEST_STOP",
                    Utf16::default(),
                    "stop before opaque string clone",
                ))
            } else {
                Ok(())
            }
        };
        let failure = ordered_projection(
            projection,
            &parameters,
            &mut Context::ordinary().with_meter(&mut meter),
        )
        .unwrap_err();
        assert_eq!(failure.code, "TEST_STOP");
        assert!(failure.is_control_failure());
    }

    #[test]
    fn map_projection_observes_key_before_value_failure_and_warning_order() {
        let raw = json!({"kind":"record","fields":[{"index":3,"name":"entry","value":{"kind":"repeated","items":[{"kind":"record","fields":[
            {"index":1,"name":"key","value":{"kind":"physical","value":{"type":"INT32","value":"12"}}},
            {"index":2,"name":"value","value":{"kind":"physical","value":{"type":"BYTE_ARRAY","hex":"ff"}}}
        ]}]}}]});
        let containers = BTreeMap::from([(
            0,
            json!({"kind":"map","repeatedIndex":3,"keyIndex":1,"valueIndex":2}),
        )]);
        let mut ctx = Context::ordinary();
        let mut projector = Projector {
            annotations: BTreeMap::from([
                (
                    1,
                    json!({"name":"DECIMAL","parameters":{"precision":"1","scale":"0"}}),
                ),
                (2, json!({"name":"STRING","parameters":{}})),
            ]),
            containers: containers.clone(),
            opaque_reported: BTreeSet::new(),
            diagnostics: Vec::new(),
            text_units: 0,
            ctx: &mut ctx,
        };
        assert_eq!(
            projector
                .project(0, &raw, false)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "Decimal value exceeds declared precision"
        );
        let mut ctx = Context::ordinary();
        let mut projector = Projector {
            annotations: BTreeMap::from([
                (1, json!({"name":"KEY_FUTURE","parameters":{}})),
                (2, json!({"name":"VALUE_FUTURE","parameters":{}})),
            ]),
            containers,
            opaque_reported: BTreeSet::new(),
            diagnostics: Vec::new(),
            text_units: 0,
            ctx: &mut ctx,
        };
        projector.project(0, &raw, false).unwrap();
        let paths: Vec<_> = projector
            .diagnostics
            .iter()
            .map(|d| text(member(d, "path").unwrap()).unwrap())
            .collect();
        assert_eq!(paths, ["/schema/1", "/schema/2"]);
    }

    #[test]
    fn bounded_value_projection_matches_authored_success_and_refusal_cases() {
        let engine = test_engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/values/authored/manifest.json"
        ))
        .unwrap();
        for case in manifest["cases"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let result = decode_parquet_values(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = to_json(&result).unwrap();
            assert_eq!(public["status"], case["status"], "{id}");
            assert_eq!(public["complete"], false, "{id}");
            if case["status"] == "projected" {
                let actual = &public["rows"][0]["fields"][0]["value"];
                let expected = &case["expectedValue"];
                assert_eq!(actual["kind"], expected["kind"], "{id}");
                for key in ["value", "bits", "annotation"] {
                    if !expected[key].is_null() {
                        assert_eq!(actual[key], expected[key], "{id} {key}");
                    }
                }
            } else {
                assert!(public.get("rows").is_none(), "{id}");
                assert_eq!(
                    public["diagnostics"].as_array().unwrap().last().unwrap()["code"],
                    "PARQUET_VALUE_PROJECTION",
                    "{id}"
                );
            }
        }
    }

    #[test]
    fn logical_value_rows_match_typescript_frozen_corpus_outputs() {
        let engine = test_engine();
        let registry = Registry::new();
        let mut capabilities = NoCapabilities;
        let manifest: Json = serde_json::from_str(include_str!(
            "../../../fixtures/parquet/values/results.json"
        ))
        .unwrap();
        for case in manifest["results"].as_array().unwrap() {
            let id = case["id"].as_str().unwrap();
            let bytes = fixture(case["path"].as_str().unwrap());
            let document = capture_parquet(
                &bytes,
                &Utf16::from(id),
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let result = decode_parquet_values(
                &document,
                &engine,
                &registry,
                &mut capabilities,
                &mut Context::ordinary(),
            )
            .unwrap();
            let public = to_json(&result).unwrap();
            assert_eq!(public["status"], case["status"], "{id}");
            assert_eq!(public["complete"], false, "{id}");
            if case["status"] == "projected" {
                let expected = parse_value(
                    std::str::from_utf8(&fixture(&format!("fixtures/parquet/values/{id}.json")))
                        .unwrap(),
                );
                assert_eq!(
                    member(&result, "rows"),
                    Some(&expected),
                    "{id}: complete ordered rows"
                );
            } else {
                assert!(public.get("rows").is_none(), "{id}");
            }
        }
    }

    #[test]
    fn json_text_scanner_preserves_syntax_only_inputs_and_bounds() {
        for value in [
            r#"{"n":9007199254740993,"n":-0}"#,
            r#"[1e9999,true,false,null,"\ud800"]"#,
            "{}",
            "[]",
            " \"text\" ",
        ] {
            assert!(check_json_text(value).is_ok());
        }
        for value in ["[1,]", "{\"x\":1,}", "01", "\"\\q\"", "[", "{\"x\" 1}"] {
            assert!(check_json_text(value).is_err(), "{value}");
        }
        let deep = format!("{}0{}", "[".repeat(129), "]".repeat(129));
        assert!(check_json_text(&deep).is_err());
        let many = format!("[{}]", vec!["0"; JSON_VALUES_LIMIT].join(","));
        assert!(check_json_text(&many).is_err());
        let too_long = " ".repeat(JSON_TEXT_UNITS_LIMIT + 1);
        assert_eq!(
            check_json_text(&too_long)
                .unwrap_err()
                .message
                .to_utf8()
                .unwrap(),
            "JSON text budget exceeded"
        );
    }
}
