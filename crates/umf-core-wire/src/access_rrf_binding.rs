// SPDX-License-Identifier: MIT OR Apache-2.0
//! Bounded opt-in reciprocal-rank scoring for PostgreSQL search.
use umf_core::{Context, EngineError, Utf16, Value};

pub const PROFILE: &str = "umf-r8-access-rrf/0.1.0";
const MAX_ITEMS: usize = 10_000;
const MAX_DIGITS: usize = 4096;

pub fn execute_wire(wire: &str) -> String {
    let mut control = |_n: usize| Ok(());
    execute_wire_with_control(wire, &mut control)
}

pub fn execute_wire_with_control(
    wire: &str,
    control: &mut dyn FnMut(usize) -> Result<(), EngineError>,
) -> String {
    let result = (|| {
        let mut ctx = Context::ordinary().with_host_control(control);
        let request = ctx.with_tagged_transport_limit(|ctx| super::decode(wire, ctx))?;
        if text(&request, "profile").as_deref() != Some(PROFILE) {
            return Err(fail("REQUEST", "RRF profile is required"));
        }
        if text(&request, "op").as_deref() != Some("access.rrf.score") {
            return Err(fail("REQUEST", "Unknown RRF operation"));
        }
        let constant = text(&request, "constant")
            .ok_or_else(|| fail("REQUEST", "constant must be a decimal string"))?;
        if constant.is_empty()
            || constant.len() > MAX_DIGITS
            || !constant.bytes().all(|b| b.is_ascii_digit())
            || constant.as_bytes()[0] == b'0'
        {
            return Err(fail(
                "REQUEST",
                "constant must be a bounded positive decimal integer",
            ));
        }
        let top_k = usize_field(&request, "topK")?;
        let key_count = usize_field(&request, "keyCount")?;
        if key_count > MAX_ITEMS || top_k > MAX_ITEMS {
            return Err(fail("RRF_LIMIT", "RRF identity or topK bound exceeded"));
        }
        let key_order_value =
            field(&request, "keyOrder").ok_or_else(|| fail("REQUEST", "keyOrder is required"))?;
        let key_order_items = as_array(key_order_value)
            .ok_or_else(|| fail("REQUEST", "keyOrder must be an array"))?;
        if key_order_items.len() > MAX_ITEMS {
            return Err(fail("RRF_LIMIT", "RRF identity bound exceeded"));
        }
        let key_order = integer_array(key_order_value)?;
        if key_order.len() != key_count {
            return Err(fail("REQUEST", "keyOrder must be a permutation"));
        }
        let legs = field(&request, "legs")
            .and_then(as_array)
            .ok_or_else(|| fail("REQUEST", "legs must be an array"))?;
        if legs.len() > MAX_ITEMS {
            return Err(fail("RRF_LIMIT", "RRF observation bound exceeded"));
        }
        let mut total = 0usize;
        for leg in legs {
            let items =
                as_array(leg).ok_or_else(|| fail("REQUEST", "each leg must be an array"))?;
            total = total
                .checked_add(items.len())
                .filter(|n| *n <= MAX_ITEMS)
                .ok_or_else(|| fail("RRF_LIMIT", "RRF observation bound exceeded"))?;
        }
        let legs = legs
            .iter()
            .map(|leg| integer_array(leg))
            .collect::<Result<Vec<_>, _>>()?;
        let scored =
            umf_core::access_search_rrf::score(&constant, &key_order, &legs, top_k, &mut ctx)?;
        let ordered = scored
            .into_iter()
            .map(|(id, score)| {
                Value::Object(vec![
                    (Utf16::from("identity"), Value::Number(id as f64)),
                    (Utf16::from("score"), Value::Number(score)),
                ])
            })
            .collect();
        super::encode(
            &Value::Object(vec![(Utf16::from("ordered"), Value::Array(ordered))]),
            &mut ctx,
        )
    })();
    super::result_envelope(result)
}

fn field<'a>(v: &'a Value, k: &str) -> Option<&'a Value> {
    if let Value::Object(f) = v {
        f.iter().find(|(n, _)| n == &Utf16::from(k)).map(|(_, v)| v)
    } else {
        None
    }
}
fn as_array(v: &Value) -> Option<&Vec<Value>> {
    if let Value::Array(a) = v {
        Some(a)
    } else {
        None
    }
}
fn text(v: &Value, k: &str) -> Option<String> {
    field(v, k).and_then(|x| {
        if let Value::String(s) = x {
            s.to_utf8().ok()
        } else {
            None
        }
    })
}
fn integer(v: &Value) -> Option<usize> {
    if let Value::Number(n) = v {
        if n.is_finite() && *n >= 0.0 && n.fract() == 0.0 && *n <= usize::MAX as f64 {
            Some(*n as usize)
        } else {
            None
        }
    } else {
        None
    }
}
fn usize_field(v: &Value, k: &str) -> Result<usize, EngineError> {
    integer(field(v, k).ok_or_else(|| fail("REQUEST", "integer field is required"))?)
        .ok_or_else(|| fail("REQUEST", "field must be a nonnegative integer"))
}
fn integer_array(v: &Value) -> Result<Vec<usize>, EngineError> {
    as_array(v)
        .ok_or_else(|| fail("REQUEST", "expected integer array"))?
        .iter()
        .map(|x| integer(x).ok_or_else(|| fail("REQUEST", "expected nonnegative integer")))
        .collect()
}
fn fail(code: &str, message: &str) -> EngineError {
    EngineError::new(code, Utf16::default(), message)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(constant: &str) -> String {
        let value = Value::Object(vec![
            (Utf16::from("profile"), Value::string_utf8(PROFILE)),
            (Utf16::from("op"), Value::string_utf8("access.rrf.score")),
            (Utf16::from("constant"), Value::string_utf8(constant)),
            (Utf16::from("topK"), Value::Number(2.0)),
            (Utf16::from("keyCount"), Value::Number(2.0)),
            (
                Utf16::from("keyOrder"),
                Value::Array(vec![Value::Number(0.0), Value::Number(1.0)]),
            ),
            (
                Utf16::from("legs"),
                Value::Array(vec![Value::Array(vec![
                    Value::Number(0.0),
                    Value::Number(1.0),
                ])]),
            ),
        ]);
        super::super::encode(&value, &mut Context::ordinary()).unwrap()
    }
    #[test]
    fn computes_and_orders_binary64_rrf() {
        let result = execute_wire(&request("2"));
        assert!(result.contains("3fd5555555555555"));
        assert!(result.contains("3fd0000000000000"));
    }
    #[test]
    fn oversized_constant_returns_python_overflow_code() {
        let result = execute_wire(&request(&format!("1{}", "0".repeat(400))));
        let envelope: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(envelope["code"], "RRF_CONSTANT_OVERFLOW");
        let expected: Vec<u16> = "int too large to convert to float".encode_utf16().collect();
        assert_eq!(envelope["messageUnits"], serde_json::json!(expected));
    }

    #[test]
    fn zero_work_control_refuses_before_scoring() {
        let mut control = |_: usize| Err(fail("RESOURCE_LIMIT", "Maximum work exceeded"));
        let response = execute_wire_with_control(&request("2"), &mut control);
        assert!(response.contains("RESOURCE_LIMIT"));
    }

    #[test]
    fn decimal_constant_requires_canonical_positive_form() {
        let response = execute_wire(&request("02"));
        assert!(response.contains("\"code\":\"REQUEST\""));
    }
}
