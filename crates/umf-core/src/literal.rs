// SPDX-License-Identifier: MIT OR Apache-2.0
use num_bigint::BigInt;
use num_traits::{Signed, ToPrimitive, Zero};

use crate::{
    context::Context,
    ecma_coercion::{Primitive, to_number},
    error::{Diagnostic, EngineError, Severity},
    literal_policy::PreparedPolicy,
    value::{Utf16, Value, copy_json},
};

#[cfg(not(all(feature = "metamodel-compiler", not(feature = "full-core"))))]
use crate::host_json::{HostJsonReflection, unicode_count_host_copy};
#[cfg(all(test, not(all(feature = "metamodel-compiler", not(feature = "full-core")))))]
use crate::host_json;

// The compiler-only metamodel closure excludes runtime host adapters. Literal
// APIs in that closure never receive a host, but share the evaluator's type
// shape with full-core builds. Keep only an unreachable local shim here rather
// than pulling the runtime reflection module into the compiler closure.
#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
mod host_json {
    use crate::{Context, EngineError, Utf16, Value};

    #[derive(Clone, Debug, PartialEq)]
    pub enum HostJsonEvent {
        UnicodeCount { value: Value },
    }

    #[derive(Clone, Debug, PartialEq)]
    pub enum HostJsonReply {
        Count(usize),
    }

    pub trait HostJsonReflection {
        fn reflect(&mut self, event: HostJsonEvent) -> Result<HostJsonReply, EngineError>;
        fn release_descriptor_snapshot(&mut self, token: u64);
    }

    pub fn unicode_count_host_copy(
        _: &Value,
        _: &mut dyn HostJsonReflection,
        _: &mut Context<'_>,
    ) -> Result<usize, EngineError> {
        Err(EngineError::new(
            "HOST_JSON_UNAVAILABLE",
            Utf16::default(),
            "Host JSON reflection is unavailable in the metamodel compiler closure",
        ))
    }
}

#[cfg(all(feature = "metamodel-compiler", not(feature = "full-core")))]
use host_json::{HostJsonReflection, unicode_count_host_copy};

/// Canonical base-10 integer coefficient used when decimal text must stay
/// linear in its number of digits instead of passing through BigInt radix
/// conversion. Zero is always positive and has the single digit `0`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CanonicalInteger {
    negative: bool,
    digits: String,
}

impl CanonicalInteger {
    pub fn is_negative(&self) -> bool {
        self.negative
    }

    pub fn digits(&self) -> &str {
        &self.digits
    }

    pub fn decimal_len(&self) -> usize {
        self.digits.len() + usize::from(self.negative)
    }

    pub fn compare(&self, other: &Self) -> std::cmp::Ordering {
        match (self.negative, other.negative) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            (negative, _) => {
                let magnitude = self
                    .digits
                    .len()
                    .cmp(&other.digits.len())
                    .then_with(|| self.digits.cmp(&other.digits));
                if negative {
                    magnitude.reverse()
                } else {
                    magnitude
                }
            }
        }
    }

    /// Add or subtract two canonical values with work admitted before output
    /// allocation. The decimal algorithm is linear in the input digit count.
    pub fn arithmetic(
        &self,
        other: &Self,
        subtract: bool,
        ctx: &mut Context<'_>,
    ) -> Result<Self, EngineError> {
        let rhs_negative = other.negative ^ subtract;
        let maximum = self.digits.len().max(other.digits.len());
        let estimate = maximum.saturating_mul(3).saturating_add(1);
        ctx.charge_work(estimate, Utf16::default())?;
        let (negative, digits) = if self.negative == rhs_negative {
            (
                self.negative,
                add_magnitudes(&self.digits, &other.digits, ctx)?,
            )
        } else {
            match compare_magnitudes(&self.digits, &other.digits) {
                std::cmp::Ordering::Equal => (false, "0".to_owned()),
                std::cmp::Ordering::Greater => (
                    self.negative,
                    subtract_magnitudes(&self.digits, &other.digits, ctx)?,
                ),
                std::cmp::Ordering::Less => (
                    rhs_negative,
                    subtract_magnitudes(&other.digits, &self.digits, ctx)?,
                ),
            }
        };
        let is_zero = digits == "0";
        Ok(Self {
            negative: negative && !is_zero,
            digits,
        })
    }

    /// Produce the public exact decimal spelling after its text/work precharge.
    pub fn to_decimal_string(&self, ctx: &mut Context<'_>) -> Result<String, EngineError> {
        let length = self.decimal_len();
        ctx.charge_work(length, Utf16::default())?;
        let mut out = String::new();
        reserve_numeric_string(&mut out, length)?;
        if self.negative {
            out.push('-');
        }
        out.push_str(&self.digits);
        ctx.check_cancelled(Utf16::default())?;
        ctx.check_deadline(Utf16::default())?;
        Ok(out)
    }
}

fn allocation_refusal() -> EngineError {
    EngineError::new(
        "LIMIT",
        Utf16::default(),
        "Numeric work allocation exceeds resource limit",
    )
}

fn reserve_numeric<T>(buffer: &mut Vec<T>, capacity: usize) -> Result<(), EngineError> {
    buffer
        .try_reserve_exact(capacity)
        .map_err(|_| allocation_refusal())
}

fn reserve_numeric_string(buffer: &mut String, capacity: usize) -> Result<(), EngineError> {
    buffer
        .try_reserve_exact(capacity)
        .map_err(|_| allocation_refusal())
}

fn compare_magnitudes(left: &str, right: &str) -> std::cmp::Ordering {
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn checkpoint(ctx: &mut Context<'_>, completed: usize) -> Result<(), EngineError> {
    if completed.is_multiple_of(65_536) {
        ctx.check_cancelled(Utf16::default())?;
        ctx.check_deadline(Utf16::default())?;
    }
    Ok(())
}

fn add_magnitudes(left: &str, right: &str, ctx: &mut Context<'_>) -> Result<String, EngineError> {
    let capacity = left.len().max(right.len()).saturating_add(1);
    let mut reversed = Vec::new();
    reserve_numeric(&mut reversed, capacity)?;
    let (mut i, mut j, mut carry) = (left.len(), right.len(), 0u8);
    while i > 0 || j > 0 || carry > 0 {
        let a = if i > 0 {
            left.as_bytes()[i - 1] - b'0'
        } else {
            0
        };
        let b = if j > 0 {
            right.as_bytes()[j - 1] - b'0'
        } else {
            0
        };
        let sum = a + b + carry;
        reversed.push(b'0' + sum % 10);
        carry = sum / 10;
        i = i.saturating_sub(1);
        j = j.saturating_sub(1);
        checkpoint(ctx, reversed.len())?;
    }
    reversed.reverse();
    Ok(String::from_utf8(reversed).expect("decimal digits are ASCII"))
}

fn subtract_magnitudes(
    larger: &str,
    smaller: &str,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    debug_assert!(compare_magnitudes(larger, smaller) != std::cmp::Ordering::Less);
    let mut reversed = Vec::new();
    reserve_numeric(&mut reversed, larger.len())?;
    let (mut i, mut j, mut borrow) = (larger.len(), smaller.len(), 0i8);
    while i > 0 {
        let a = (larger.as_bytes()[i - 1] - b'0') as i8 - borrow;
        let b = if j > 0 {
            (smaller.as_bytes()[j - 1] - b'0') as i8
        } else {
            0
        };
        let mut digit = a - b;
        borrow = i8::from(digit < 0);
        if digit < 0 {
            digit += 10;
        }
        reversed.push(b'0' + digit as u8);
        i -= 1;
        j = j.saturating_sub(1);
        checkpoint(ctx, reversed.len())?;
    }
    while reversed.len() > 1 && reversed.last() == Some(&b'0') {
        reversed.pop();
    }
    reversed.reverse();
    Ok(String::from_utf8(reversed).expect("decimal digits are ASCII"))
}

#[derive(Debug)]
struct LiteralFault {
    reason: String,
    path: Utf16,
    detail: Utf16,
    engine_error: Option<EngineError>,
}
impl LiteralFault {
    fn new(reason: &str) -> Self {
        Self {
            reason: reason.to_owned(),
            path: Utf16::default(),
            detail: Utf16::default(),
            engine_error: None,
        }
    }
    fn from_engine(error: EngineError) -> Self {
        Self {
            reason: String::new(),
            path: error.path.clone(),
            detail: Utf16::default(),
            engine_error: Some(error),
        }
    }
    fn at(mut self, path: Utf16) -> Self {
        self.path = path;
        self
    }
}
fn key(s: &str) -> Utf16 {
    Utf16::from(s)
}
fn get<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(m) => m.iter().find(|(k, _)| k == &key(name)).map(|(_, v)| v),
        _ => None,
    }
}
fn path_get<'a>(value: &'a Value, path: &[String]) -> Option<&'a Value> {
    let mut current = value;
    for part in path {
        current = get(current, part)?;
    }
    Some(current)
}
fn text(value: &Value) -> Option<&Utf16> {
    match value {
        Value::String(s) => Some(s),
        _ => None,
    }
}

/// Compatibility for the public TypeScript field-value API's dynamic
/// `value.length` / `value.charCodeAt(i)` sequence. JSON copying creates
/// null-prototype objects, so object-to-primitive conversion has no default.
fn public_string_carrier_count(
    raw: &Value,
    host: &mut Option<&mut dyn HostJsonReflection>,
    ctx: &mut Context<'_>,
) -> Result<usize, EngineError> {
    // These text values remain only for the historical direct-Rust R5
    // compatibility surface. The installed host route replaces each native
    // TypeError case with an adapter-local probe and never exposes this text
    // as canonical JavaScript wording.
    let type_error = |message: &str| EngineError::new("TYPE_ERROR", Utf16::default(), message);
    let native_error = |host: &mut Option<&mut dyn HostJsonReflection>,
                        ctx: &mut Context<'_>,
                        probe: Value,
                        message: &str|
     -> Result<usize, EngineError> {
        if let Some(host) = host.as_deref_mut() {
            unicode_count_host_copy(&probe, host, ctx)
        } else {
            Err(type_error(message))
        }
    };
    enum LengthValue<'a> {
        Borrowed(&'a Value),
        Number(f64),
        Undefined,
    }
    let length = match raw {
        Value::Null => {
            return native_error(
                host,
                ctx,
                Value::Null,
                "null is not an object (evaluating 'value.length')",
            );
        }
        Value::Array(values) => LengthValue::Number(values.len() as f64),
        Value::Object(_) => get(raw, "length")
            .map(LengthValue::Borrowed)
            .unwrap_or(LengthValue::Undefined),
        _ => LengthValue::Undefined,
    };
    let length = match length {
        LengthValue::Borrowed(value) => value,
        LengthValue::Undefined => return Ok(0),
        LengthValue::Number(value) => {
            if value > 0.0 {
                return native_error(
                    host,
                    ctx,
                    Value::Object(vec![(key("length"), Value::Number(1.0))]),
                    "value.charCodeAt is not a function. (In 'value.charCodeAt(i)', 'value.charCodeAt' is undefined)",
                );
            }
            return Ok(0);
        }
    };

    fn array_to_string(values: &[Value], out: &mut Vec<u16>) -> Result<(), EngineError> {
        for (index, value) in values.iter().enumerate() {
            if index != 0 {
                out.push(b',' as u16);
            }
            match value {
                Value::Null => {}
                Value::String(s) => out.extend_from_slice(s.units()),
                Value::Bool(v) => out.extend(v.to_string().encode_utf16()),
                Value::Number(v) => out.extend(v.to_string().encode_utf16()),
                Value::Array(nested) => array_to_string(nested, out)?,
                Value::Object(_) => {
                    return Err(EngineError::new(
                        "TYPE_ERROR",
                        Utf16::default(),
                        "No default value",
                    ));
                }
            }
        }
        Ok(())
    }

    let number = match length {
        Value::Null => to_number(Primitive::Null, ctx)?,
        Value::Bool(value) => to_number(Primitive::Bool(*value), ctx)?,
        Value::Number(value) => to_number(Primitive::Number(*value), ctx)?,
        Value::String(value) => to_number(Primitive::String(value), ctx)?,
        Value::Array(values) => {
            // First walk the whole JSON subtree, admitting each node and its
            // copied text before allocating the recursive Array#join result.
            let mut pending = vec![values.as_slice()];
            let mut text_units = 0usize;
            while let Some(items) = pending.pop() {
                ctx.charge_work(items.len().saturating_add(1), Utf16::default())?;
                text_units = text_units.saturating_add(items.len().saturating_sub(1));
                for item in items {
                    match item {
                        Value::String(s) => {
                            ctx.charge_work(s.len(), Utf16::default())?;
                            text_units = text_units.saturating_add(s.len());
                        }
                        Value::Bool(_) => {
                            ctx.charge_work(5, Utf16::default())?;
                            text_units = text_units.saturating_add(5);
                        }
                        Value::Number(_) => {
                            // Fixed-point Display of the smallest f64
                            // subnormal is 326 characters; 400 safely admits
                            // the conversion and output slot before formatting.
                            ctx.charge_work(400, Utf16::default())?;
                            text_units = text_units.saturating_add(400);
                        }
                        Value::Array(children) => pending.push(children),
                        Value::Null | Value::Object(_) => {
                            ctx.charge_work(1, Utf16::default())?;
                        }
                    }
                }
            }
            ctx.charge_work(text_units, Utf16::default())?;
            let mut joined = Vec::with_capacity(text_units);
            if let Err(error) = array_to_string(values, &mut joined) {
                if host.is_some() {
                    return native_error(
                        host,
                        ctx,
                        Value::Object(vec![(key("length"), Value::Object(Vec::new()))]),
                        "No default value",
                    );
                }
                return Err(error);
            }
            to_number(Primitive::String(&Utf16::new(joined)), ctx)?
        }
        Value::Object(_) => {
            return native_error(
                host,
                ctx,
                Value::Object(vec![(key("length"), Value::Object(Vec::new()))]),
                "No default value",
            );
        }
    };
    if number > 0.0 {
        return native_error(
            host,
            ctx,
            Value::Object(vec![(key("length"), Value::Number(1.0))]),
            "value.charCodeAt is not a function. (In 'value.charCodeAt(i)', 'value.charCodeAt' is undefined)",
        );
    }
    Ok(0)
}

#[cfg(test)]
mod public_carrier_tests {
    use super::*;

    struct ErrorProbeHost(Vec<super::host_json::HostJsonEvent>);
    impl HostJsonReflection for ErrorProbeHost {
        fn reflect(
            &mut self,
            event: super::host_json::HostJsonEvent,
        ) -> Result<super::host_json::HostJsonReply, EngineError> {
            self.0.push(event);
            Err(EngineError::new(
                "HOST_JSON_CALLBACK",
                Utf16::default(),
                "native host exception probe",
            ))
        }
        fn release_descriptor_snapshot(&mut self, _: u64) {}
    }

    struct ZeroCountHost;
    impl HostJsonReflection for ZeroCountHost {
        fn reflect(
            &mut self,
            _: super::host_json::HostJsonEvent,
        ) -> Result<super::host_json::HostJsonReply, EngineError> {
            Ok(super::host_json::HostJsonReply::Count(0))
        }
        fn release_descriptor_snapshot(&mut self, _: u64) {}
    }

    #[test]
    fn decimal_precision_limits_saturate_by_target_width_but_reject_invalid_facets() {
        let max_safe = Some(9_007_199_254_740_991i64);
        let expected = usize::try_from(9_007_199_254_740_991u64).unwrap_or(usize::MAX);
        assert_eq!(precision_limit(max_safe), Some(expected));
        assert_eq!(precision_limit(Some(-1)), None);
        assert_eq!(num_at(&Value::Object(vec![(key("p"), Value::Number(1.5))]), "p"), None);
    }

    #[test]
    fn array_length_coercion_is_stopped_by_the_cooperative_meter_before_join() {
        let values = (0..128)
            .map(|_| Value::String(Utf16::default()))
            .collect::<Vec<_>>();
        let raw = Value::Object(vec![(key("length"), Value::Array(values))]);
        let mut meter = |_: usize| {
            Err(EngineError::new(
                "METER_STOP",
                Utf16::default(),
                "work denied",
            ))
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = public_string_carrier_count(&raw, &mut None, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_STOP");
    }

    #[test]
    fn long_numeric_array_text_is_admitted_before_float_formatting() {
        let raw = Value::Object(vec![(
            key("length"),
            Value::Array(vec![Value::Number(1e-300)]),
        )]);
        let mut meter = |amount: usize| {
            if amount >= 400 {
                Err(EngineError::new(
                    "METER_STOP",
                    Utf16::default(),
                    "formatting work denied",
                ))
            } else {
                Ok(())
            }
        };
        let mut ctx = Context::ordinary().with_meter(&mut meter);
        let error = public_string_carrier_count(&raw, &mut None, &mut ctx).unwrap_err();
        assert_eq!(error.code, "METER_STOP");
    }

    #[test]
    fn native_unicode_errors_send_only_minimal_dynamic_length_copies() {
        let cases = [
            (
                Value::Null,
                Value::Null,
            ),
            (
                Value::Array(vec![Value::Null]),
                Value::Object(vec![(key("length"), Value::Number(1.0))]),
            ),
            (
                Value::Array(vec![Value::Number(1.0)]),
                Value::Object(vec![(key("length"), Value::Number(1.0))]),
            ),
            (
                Value::Object(vec![(key("length"), Value::Object(vec![(key("ignored"), Value::Bool(true))]))]),
                Value::Object(vec![(key("length"), Value::Object(Vec::new()))]),
            ),
            (
                Value::Object(vec![(key("length"), Value::Array(vec![Value::Object(Vec::new())]))]),
                Value::Object(vec![(key("length"), Value::Object(Vec::new()))]),
            ),
        ];
        for (raw, expected_probe) in cases {
            let mut probe = ErrorProbeHost(Vec::new());
            let mut host = Some(&mut probe as &mut dyn HostJsonReflection);
            let error = public_string_carrier_count(
                &raw,
                &mut host,
                &mut Context::ordinary(),
            )
            .unwrap_err();
            drop(host);
            assert_eq!(error.code, "HOST_JSON_CALLBACK");
            assert_eq!(probe.0.len(), 1);
            assert_eq!(
                probe.0[0],
                super::host_json::HostJsonEvent::UnicodeCount {
                    value: expected_probe,
                }
            );
        }
    }

    #[test]
    fn successful_zero_length_carriers_do_not_need_a_native_error_probe() {
        for raw in [
            Value::Object(vec![(key("length"), Value::Number(0.0))]),
            Value::Object(vec![(key("length"), Value::Array(Vec::new()))]),
            Value::Object(Vec::new()),
            Value::Array(Vec::new()),
        ] {
            let mut probe = ErrorProbeHost(Vec::new());
            let mut host = Some(&mut probe as &mut dyn HostJsonReflection);
            let count = public_string_carrier_count(
                &raw,
                &mut host,
                &mut Context::ordinary(),
            )
            .unwrap();
            drop(host);
            assert_eq!(count, 0);
            assert!(probe.0.is_empty());
        }
    }

    #[test]
    fn zero_count_malformed_unicode_identity_uses_ecmascript_json_value() {
        let family = Value::Object(vec![
            (key("carrier"), Value::string_utf8("string")),
            (key("mechanic"), Value::string_utf8("unicode")),
            (key("equality"), Value::Bool(true)),
        ]);
        let field = Value::Object(vec![(key("family"), Value::string_utf8("unicode"))]);
        let wanted = Value::Object(vec![(key("string"), Value::Number(7.0))]);
        let candidate = Value::Object(vec![(key("string"), Value::string_utf8("7"))]);
        let policy = Value::Object(vec![
            (key("fields"), Value::Object(vec![(key("family"), Value::string_utf8("family"))])),
            (key("families"), Value::Object(vec![(key("unicode"), family)])),
            (key("wrapperKeys"), Value::Number(1.0)),
        ]);
        let mut host: Option<&mut dyn HostJsonReflection> = Some(&mut ZeroCountHost);
        let wanted_identity = exact_identity_with_host(&field, &wanted, &policy, &mut host, &mut Context::ordinary()).unwrap();
        let candidate_identity = exact_identity(&field, &candidate, &policy, &mut Context::ordinary()).unwrap();
        assert_eq!(wanted_identity, "unicode:7");
        assert_eq!(candidate_identity, "unicode:\"7\"");
        assert_ne!(wanted_identity, candidate_identity);
    }

    #[test]
    fn zero_count_malformed_unicode_allowed_value_refuses_nonmatching_identity() {
        let policy = Value::Object(vec![
            (
                key("fields"),
                Value::Object(vec![
                    (key("family"), Value::string_utf8("family")),
                    (key("facets"), Value::string_utf8("facets")),
                ]),
            ),
            (
                key("families"),
                Value::Object(vec![(
                    key("unicode"),
                    Value::Object(vec![
                        (key("carrier"), Value::string_utf8("string")),
                        (key("mechanic"), Value::string_utf8("unicode")),
                        (key("equality"), Value::Bool(true)),
                    ]),
                )]),
            ),
            (key("wrapperKeys"), Value::Number(1.0)),
            (
                key("refinements"),
                Value::Array(vec![Value::Object(vec![
                    (key("mechanic"), Value::string_utf8("allowed-membership")),
                    (key("selector"), Value::Array(vec![Value::string_utf8("allowedValues")])),
                    (key("applies"), Value::string_utf8("all")),
                    (key("mode"), Value::string_utf8("refinements")),
                    (key("phase"), Value::string_utf8("after")),
                    (key("error"), Value::string_utf8("allowed")),
                ])]),
            ),
        ]);
        let family = get(&policy, "families").and_then(|families| get(families, "unicode")).unwrap();
        let field = Value::Object(vec![
            (key("family"), Value::string_utf8("unicode")),
            (key("facets"), Value::Object(Vec::new())),
            (key("allowedValues"), Value::Array(vec![Value::Object(vec![(key("string"), Value::string_utf8("new"))])])),
        ]);
        let wanted = Value::Object(vec![(key("string"), Value::Number(7.0))]);
        let mut host: Option<&mut dyn HostJsonReflection> = Some(&mut ZeroCountHost);
        let error = apply_refinements(
            &field,
            &wanted,
            true,
            &policy,
            "scalar",
            Some(family),
            Some(0),
            "after",
            &mut host,
            &mut Context::ordinary(),
        )
        .unwrap_err();
        assert_eq!(error.reason, "allowed");
    }

    #[test]
    fn shared_literal_bound_counts_exponent_sign() {
        let negative = Utf16::from(format!("1e-{}", "1".repeat(32)));
        let error = exact_coefficient(&negative, 0, None, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "numeric-exponent");

        let positive = Utf16::from(format!("1e+{}", "1".repeat(32)));
        let error = exact_coefficient(&positive, 0, None, &mut Context::ordinary()).unwrap_err();
        assert_eq!(error.code, "numeric-exponent");
    }
}
fn utf8(value: &Value) -> Option<String> {
    text(value)?.to_utf8().ok()
}
fn ascii(value: &Value) -> Option<String> {
    let s = utf8(value)?;
    if s.is_ascii() { Some(s) } else { None }
}
fn object(value: &Value) -> Option<&[(Utf16, Value)]> {
    match value {
        Value::Object(m) => Some(m),
        _ => None,
    }
}
fn array(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(a) => Some(a),
        _ => None,
    }
}
fn str_at<'a>(value: &'a Value, name: &str) -> Option<String> {
    get(value, name).and_then(ascii)
}
fn truth_at(value: &Value, name: &str) -> bool {
    matches!(get(value, name), Some(Value::Bool(true)))
}
fn num_at(value: &Value, name: &str) -> Option<i64> {
    match get(value, name) {
        Some(Value::Number(n))
            if n.is_finite()
                && n.fract() == 0.0
                && *n >= i64::MIN as f64
                && *n <= i64::MAX as f64 =>
        {
            Some(*n as i64)
        }
        _ => None,
    }
}
/// Precision limits are counts compared with bounded input digits. On a
/// narrower target, preserve any nonnegative i64 limit by saturating to the
/// largest representable count; reachable input remains bounded by Context.
fn precision_limit(value: Option<i64>) -> Option<usize> {
    let value = value?;
    if value < 0 {
        return None;
    }
    Some(usize::try_from(value).unwrap_or(usize::MAX))
}
fn ptr_escape(source: &Utf16) -> Utf16 {
    let mut out = Vec::new();
    for u in source.units() {
        match u {
            0x7e => out.extend([0x7e, 0x30]),
            0x2f => out.extend([0x7e, 0x31]),
            v => out.push(*v),
        }
    }
    Utf16::new(out)
}
fn append_path(base: &Utf16, segment: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(0x2f);
    out.extend(ptr_escape(segment).units());
    Utf16::new(out)
}
fn append_raw_path(base: &Utf16, segment: &Utf16) -> Utf16 {
    let mut out = base.units().to_vec();
    out.push(0x2f);
    out.extend(segment.units());
    Utf16::new(out)
}
fn append_ascii(base: &Utf16, segment: &str) -> Utf16 {
    append_path(base, &key(segment))
}
fn fail(reason: &str) -> LiteralFault {
    LiteralFault::new(reason)
}
fn known(
    value: &Value,
    allowed: &[String],
    path: &Utf16,
    raw_unknown_path: bool,
) -> Result<(), LiteralFault> {
    let Some(members) = object(value) else {
        return Err(fail("object").at(path.clone()));
    };
    for (name, _) in members {
        if !allowed.iter().any(|s| name == &key(s)) {
            return Err(LiteralFault {
                reason: "unknown".into(),
                path: if raw_unknown_path {
                    append_raw_path(path, name)
                } else {
                    append_path(path, name)
                },
                detail: name.clone(),
                engine_error: None,
            });
        }
    }
    Ok(())
}
fn prop_list(value: &Value, name: &str) -> Vec<String> {
    array(get(value, name).unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .filter_map(ascii)
        .collect()
}

fn field_names(policy: &Value) -> &Value {
    get(policy, "fields").unwrap()
}
fn selector(policy: &Value, name: &str) -> String {
    str_at(field_names(policy), name).unwrap_or_default()
}
fn policy_error(
    error: &LiteralFault,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<Diagnostic, EngineError> {
    let Some(rule) = get(get(policy, "errors").unwrap_or(&Value::Null), &error.reason) else {
        return Err(EngineError::new(
            "CONSTRAINT_POLICY",
            Utf16::default(),
            format!("Missing literal diagnostic: {}", error.reason),
        ));
    };
    let code_source = text(get(rule, "code").unwrap_or(&Value::Null)).ok_or_else(|| {
        EngineError::new(
            "CONSTRAINT_POLICY",
            Utf16::default(),
            "Malformed literal diagnostic",
        )
    })?;
    let severity = match get(rule, "severity") {
        Some(Value::String(value)) if value == &key("warning") => Severity::Warning,
        Some(Value::String(value)) if value == &key("error") => Severity::Error,
        _ => {
            return Err(EngineError::new(
                "CONSTRAINT_POLICY",
                Utf16::default(),
                "Malformed literal diagnostic severity",
            ));
        }
    };
    let empty_message = Utf16::default();
    let message_source =
        text(get(rule, "message").unwrap_or(&Value::Null)).unwrap_or(&empty_message);
    let marker: Vec<u16> = "{detail}".encode_utf16().collect();
    let units = message_source.units();
    // The substitution scan itself is proportional to arbitrary model-owned
    // text, so admit its work before inspecting any units.
    ctx.charge_work(units.len(), Utf16::default())?;
    let mut occurrences = 0usize;
    let mut i = 0;
    while i < units.len() {
        if units[i..].starts_with(&marker) {
            occurrences = occurrences.saturating_add(1);
            i += marker.len();
        } else {
            i += 1;
        }
    }
    let message_capacity = units
        .len()
        .saturating_add(error.detail.len().saturating_mul(occurrences));
    // Charge every model-owned diagnostic string and the replacement buffer
    // before cloning/allocating them. They are private copies, so this is
    // cooperative work accounting rather than the serialized-text ceiling.
    ctx.charge_work(
        code_source
            .len()
            .saturating_add(units.len())
            .saturating_add(error.detail.len())
            .saturating_add(error.path.len())
            .saturating_add(message_capacity),
        Utf16::default(),
    )?;
    let code = code_source.clone();
    let mut out = Vec::with_capacity(message_capacity);
    i = 0;
    while i < units.len() {
        if units[i..].starts_with(&marker) {
            if !error.detail.is_empty() {
                out.extend(error.detail.units());
            }
            i += marker.len();
        } else {
            out.push(units[i]);
            i += 1;
        }
    }
    let message = Utf16::new(out);
    Ok(Diagnostic {
        code,
        path: error.path.clone(),
        python_source_path: false,
        message,
        severity,
        python_text_origin: None,
    })
}

/// Upper bound the decimal chunk-by-growing-limb work used by num-bigint's
/// pinned radix-10 parser. Charge before its opaque allocation/arithmetic loop
/// so caller meters can refuse expensive coefficients.
fn decimal_parse_work(digits: usize) -> u64 {
    if digits == 0 {
        return 0;
    }
    let word_bits = usize::BITS as u128;
    let chunk_digits = if word_bits >= 64 { 19u128 } else { 9u128 };
    let digits = digits as u128;
    let groups = (digits + chunk_digits - 1) / chunk_digits;
    let limb_denominator = 1_000u128 * word_bits;
    let limbs = (digits * 3_322 + limb_denominator - 1) / limb_denominator;
    u64::try_from(digits + groups * limbs).unwrap_or(u64::MAX)
}

fn decimal_format_work(value: &BigInt) -> u64 {
    if value.is_zero() {
        return 1;
    }
    let bits = value.bits() as u128;
    let word_bits = usize::BITS as u128;
    let limbs = (bits + word_bits - 1) / word_bits;
    let output_digits = (bits * 30_103 + 99_999) / 100_000;
    u64::try_from(limbs * limbs + output_digits).unwrap_or(u64::MAX)
}

fn format_decimal(value: &BigInt, ctx: &mut Context<'_>) -> Result<String, LiteralFault> {
    if value.is_zero() {
        return Ok("0".to_owned());
    }
    ctx.charge_work_u64(decimal_format_work(value), Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    let text = value.to_string();
    ctx.check_cancelled(Utf16::default())
        .and_then(|_| ctx.check_deadline(Utf16::default()))
        .map_err(LiteralFault::from_engine)?;
    Ok(text)
}

/// Format a numeric BigInt for the JavaScript numeric adapter using the same
/// precharged radix-10 work estimate and post-format cooperative checks as
/// core literal evaluation.
pub(crate) fn format_bigint_decimal_for_numeric(
    value: &BigInt,
    ctx: &mut Context<'_>,
) -> Result<String, EngineError> {
    if value.is_zero() {
        return Ok("0".to_owned());
    }
    ctx.charge_work_u64(decimal_format_work(value), Utf16::default())?;
    let text = value.to_string();
    ctx.check_cancelled(Utf16::default())?;
    ctx.check_deadline(Utf16::default())?;
    Ok(text)
}

fn parse_token_digits(
    token: &Utf16,
    scale: i64,
    precision: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<CanonicalInteger, LiteralFault> {
    let units = token.units();
    // Numeric tokens are typed carrier strings, not serialized source text.
    // Bound scanning before materializing ASCII digits; do not apply the
    // source/output text ceiling to an admitted coefficient.
    ctx.charge_work(units.len(), Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    let s = token.to_utf8().map_err(|_| fail("numeric-token"))?;
    let bytes = s.as_bytes();
    if bytes.is_empty() {
        return Err(fail("numeric-token"));
    }
    let mut i = 0;
    let negative = bytes[0] == b'-';
    if negative {
        i += 1;
    }
    if i >= bytes.len() {
        return Err(fail("numeric-token"));
    }
    let int_start = i;
    if bytes[i] == b'0' {
        i += 1;
        if i < bytes.len() && bytes[i].is_ascii_digit() {
            return Err(fail("numeric-token"));
        }
    } else if (b'1'..=b'9').contains(&bytes[i]) {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
    } else {
        return Err(fail("numeric-token"));
    }
    let int_end = i;
    let mut frac_start = i;
    let mut frac_len = 0usize;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        frac_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        frac_len = i - frac_start;
        if frac_len == 0 {
            return Err(fail("numeric-token"));
        }
    }
    let mut exponent_range = None;
    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        i += 1;
        let exp_start = i;
        if i < bytes.len() && (bytes[i] == b'+' || bytes[i] == b'-') {
            i += 1;
        }
        let digit_start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == digit_start {
            return Err(fail("numeric-token"));
        }
        exponent_range = Some((exp_start, i));
    }
    if i != bytes.len() {
        return Err(fail("numeric-token"));
    }
    let digit_count = int_end - int_start + frac_len;
    ctx.charge_work(digit_count, Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    let mut digits = String::new();
    digits
        .try_reserve_exact(digit_count)
        .map_err(|_| LiteralFault::from_engine(allocation_refusal()))?;
    digits.push_str(&s[int_start..int_end]);
    if frac_len > 0 {
        digits.push_str(&s[frac_start..frac_start + frac_len]);
    }
    let trimmed = digits.trim_start_matches('0');
    // The predecessor canonicalizes zero before applying the exponent spelling
    // bound; retain that behavior, including negative zero.
    if trimmed.is_empty() {
        return Ok(CanonicalInteger {
            negative: false,
            digits: "0".to_owned(),
        });
    }
    let digits = trimmed;
    let exponent = if let Some((start, end)) = exponent_range {
        let source = &s[start..end];
        // Preserve the shared literal/schema contract: the bound includes an
        // optional sign. The tuple encoder applies its specific admission
        // before calling this parser.
        if source.len() > 32 {
            return Err(fail("numeric-exponent"));
        }
        let (negative, magnitude) = match source.as_bytes().first() {
            Some(b'-') => (true, &source[1..]),
            Some(b'+') => (false, &source[1..]),
            _ => (false, source),
        };
        ctx.charge_work_u64(decimal_parse_work(magnitude.len()), Utf16::default())
            .map_err(LiteralFault::from_engine)?;
        let parsed = BigInt::parse_bytes(magnitude.as_bytes(), 10)
            .ok_or_else(|| fail("numeric-exponent"))?;
        if negative { -parsed } else { parsed }
    } else {
        BigInt::zero()
    };
    let shift = exponent - BigInt::from(frac_len) + BigInt::from(scale);
    let coefficient = if shift < BigInt::zero() {
        let cut = shift.abs();
        if cut > BigInt::from(digits.len()) {
            return Err(fail("numeric-rounding"));
        }
        let cut = cut.to_usize().ok_or_else(|| fail("numeric-rounding"))?;
        let split = digits.len() - cut;
        if digits.as_bytes()[split..].iter().any(|x| *x != b'0') {
            return Err(fail("numeric-rounding"));
        }
        let head = &digits[..split];
        ctx.charge_work(head.len(), Utf16::default())
            .map_err(LiteralFault::from_engine)?;
        if head.is_empty() {
            "0".to_owned()
        } else {
            head.to_owned()
        }
    } else {
        let bound = precision
            .unwrap_or(ctx.limits().max_coefficient_digits)
            .min(ctx.limits().max_coefficient_digits);
        let size = BigInt::from(digits.len()) + &shift;
        if size > BigInt::from(bound) {
            return Err(fail("numeric-resource"));
        }
        let size = size.to_usize().ok_or_else(|| fail("numeric-resource"))?;
        let shift = size - digits.len();
        ctx.charge_work(size, Utf16::default())
            .map_err(LiteralFault::from_engine)?;
        let mut out = String::new();
        out.try_reserve_exact(size)
            .map_err(|_| LiteralFault::from_engine(allocation_refusal()))?;
        out.push_str(digits);
        out.extend(std::iter::repeat_n('0', shift));
        out
    };
    let significant = coefficient.trim_start_matches('0');
    let precision_digits = if significant.is_empty() {
        1
    } else {
        significant.len()
    };
    if precision.is_some_and(|p| precision_digits > p) {
        return Err(fail("numeric-precision"));
    }
    if significant.len() > ctx.limits().max_coefficient_digits {
        return Err(fail("numeric-resource"));
    }
    ctx.charge_work(significant.len(), Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    if significant.is_empty() {
        return Ok(CanonicalInteger {
            negative: false,
            digits: "0".to_owned(),
        });
    }
    Ok(CanonicalInteger {
        negative,
        digits: significant.to_owned(),
    })
}

fn parse_token(
    token: &Utf16,
    scale: i64,
    precision: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<BigInt, LiteralFault> {
    let canonical = parse_token_digits(token, scale, precision, ctx)?;
    if canonical.digits == "0" {
        return Ok(BigInt::zero());
    }
    ctx.charge_work_u64(decimal_parse_work(canonical.digits.len()), Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    let mut value = BigInt::parse_bytes(canonical.digits.as_bytes(), 10)
        .ok_or_else(|| fail("numeric-token"))?;
    if canonical.negative {
        value = -value;
    }
    Ok(value)
}

pub fn exact_coefficient(
    token: &Utf16,
    scale: i64,
    precision: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<BigInt, EngineError> {
    parse_token(token, scale, precision, ctx).map_err(|e| {
        e.engine_error
            .unwrap_or_else(|| EngineError::new(e.reason, e.path, "Invalid exact numeric token"))
    })
}

/// Parse an exact numeric token into canonical sign/digits without constructing
/// a BigInt. The parser is shared with [`exact_coefficient`] so grammar,
/// exponent, scale, precision, and resource refusal order stay aligned.
pub fn exact_coefficient_digits(
    token: &Utf16,
    scale: i64,
    precision: Option<usize>,
    ctx: &mut Context<'_>,
) -> Result<CanonicalInteger, EngineError> {
    parse_token_digits(token, scale, precision, ctx).map_err(|e| {
        e.engine_error
            .unwrap_or_else(|| EngineError::new(e.reason, e.path, "Invalid exact numeric token"))
    })
}

fn family<'a>(field: &Value, policy: &'a Value) -> Option<&'a Value> {
    let scalar = get(field, &selector(policy, "family"))?;
    let scalar = text(scalar)?.to_utf8().ok()?;
    get(get(policy, "families")?, &scalar)
}
fn carrier<'a>(value: &'a Value, family: &Value) -> Option<&'a Value> {
    let name = str_at(family, "carrier")?;
    get(value, &name)
}
fn exact_identity(
    field: &Value,
    value: &Value,
    policy: &Value,
    ctx: &mut Context<'_>,
) -> Result<String, LiteralFault> {
    if matches!(value, Value::Null) {
        return Err(fail("null-equality"));
    }
    let family = family(field, policy).ok_or_else(|| fail("equality"))?;
    if !truth_at(family, "equality") {
        return Err(fail("equality"));
    }
    let Some(members) = object(value) else {
        return Err(fail("equality"));
    };
    if members.len() != num_at(policy, "wrapperKeys").unwrap_or(1) as usize {
        return Err(fail("equality"));
    }
    let Some(raw) = carrier(value, family) else {
        return Err(fail("equality"));
    };
    let mechanic = str_at(family, "mechanic").unwrap_or_default();
    let scalar = utf8(get(field, &selector(policy, "family")).ok_or_else(|| fail("equality"))?)
        .ok_or_else(|| fail("equality"))?;
    let result = match mechanic.as_str() {
        "bits128" => {
            let Some(s) = utf8(raw) else {
                return Err(fail("bits128"));
            };
            if s.len() != 32 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err(fail("bits128"));
            }
            s.to_ascii_lowercase()
        }
        "uuid" => {
            let Some(s) = utf8(raw) else {
                return Err(fail("uuid"));
            };
            if s.len() != 36
                || !s.bytes().enumerate().all(|(i, b)| {
                    if [8, 13, 18, 23].contains(&i) {
                        b == b'-'
                    } else {
                        b.is_ascii_hexdigit()
                    }
                })
            {
                return Err(fail("uuid"));
            }
            s.replace("-", "").to_ascii_lowercase()
        }
        "integer" => {
            let Some(s) = text(raw) else {
                return Err(fail("numeric-token"));
            };
            parse_token_digits(s, 0, None, ctx)?
                .to_decimal_string(ctx)
                .map_err(LiteralFault::from_engine)?
        }
        "decimal" => {
            let facets = get(field, &selector(policy, "facets")).unwrap_or(&Value::Null);
            let scale =
                num_at(facets, &selector(policy, "scale")).ok_or_else(|| fail("decimal-domain"))?;
            let precision = num_at(facets, &selector(policy, "precision"))
                .and_then(|v| precision_limit(Some(v)))
                .ok_or_else(|| fail("decimal-domain"))?;
            let Some(s) = text(raw) else {
                return Err(fail("numeric-token"));
            };
            parse_token_digits(s, scale, Some(precision), ctx)?
                .to_decimal_string(ctx)
                .map_err(LiteralFault::from_engine)?
        }
        "unicode" => {
            let Some(s) = text(raw) else {
                return Err(fail("text"));
            };
            unicode_count(s)?;
            json_string(s)
        }
        "hex" => {
            let Some(s) = utf8(raw) else {
                return Err(fail("hex"));
            };
            if s.len() % 2 != 0 || !s.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err(fail("hex"));
            }
            s.to_ascii_lowercase()
        }
        "boolean" => match raw {
            Value::Bool(true) => "true",
            Value::Bool(false) => "false",
            _ => return Err(fail("boolean")),
        }
        .to_owned(),
        _ => return Err(fail("mechanic")),
    };
    Ok(format!("{scalar}:{result}"))
}

fn exact_identity_with_host(
    field: &Value,
    value: &Value,
    policy: &Value,
    host: &mut Option<&mut dyn HostJsonReflection>,
    ctx: &mut Context<'_>,
) -> Result<String, LiteralFault> {
    let fam = family(field, policy).ok_or_else(|| fail("equality"))?;
    let mechanic = str_at(fam, "mechanic").unwrap_or_default();
    let Some(raw) = carrier(value, fam) else {
        return exact_identity(field, value, policy, ctx);
    };
    if mechanic != "unicode" || matches!(raw, Value::String(_)) || host.is_none() {
        return exact_identity(field, value, policy, ctx);
    }
    if matches!(value, Value::Null) || !truth_at(fam, "equality") {
        return Err(fail(if matches!(value, Value::Null) { "null-equality" } else { "equality" }));
    }
    let Some(members) = object(value) else { return Err(fail("equality")); };
    if members.len() != num_at(policy, "wrapperKeys").unwrap_or(1) as usize {
        return Err(fail("equality"));
    }
    let count = public_string_carrier_count(raw, host, ctx).map_err(LiteralFault::from_engine)?;
    debug_assert_eq!(count, 0, "positive malformed Unicode lengths fail in host reflection");
    let family_name = utf8(get(field, &selector(policy, "family")).ok_or_else(|| fail("equality"))?)
        .ok_or_else(|| fail("equality"))?;
    let encoded = crate::serialization::stringify_compact_metered(raw, ctx)
        .map_err(LiteralFault::from_engine)?
        .to_utf8()
        .map_err(|_| fail("text"))?;
    Ok(format!("{family_name}:{encoded}"))
}
fn json_string(value: &Utf16) -> String {
    let mut out = String::from("\"");
    let u = value.units();
    let mut i = 0;
    while i < u.len() {
        let c = u[i];
        match c {
            0x22 => out.push_str("\\\""),
            0x5c => out.push_str("\\\\"),
            0x08 => out.push_str("\\b"),
            0x0c => out.push_str("\\f"),
            0x0a => out.push_str("\\n"),
            0x0d => out.push_str("\\r"),
            0x09 => out.push_str("\\t"),
            0..=0x1f => out.push_str(&format!("\\u{c:04x}")),
            0xd800..=0xdbff => {
                let n = u[i + 1];
                let cp = 0x10000 + (((c as u32 - 0xd800) << 10) + (n as u32 - 0xdc00));
                out.push(char::from_u32(cp).unwrap());
                i += 1;
            }
            _ => out.push(char::from_u32(c as u32).unwrap()),
        }
        i += 1;
    }
    out.push('"');
    out
}
fn unicode_count(value: &Utf16) -> Result<usize, LiteralFault> {
    let units = value.units();
    let mut i = 0;
    let mut count = 0;
    while i < units.len() {
        let u = units[i];
        if (0xd800..=0xdbff).contains(&u) {
            if i + 1 >= units.len() || !(0xdc00..=0xdfff).contains(&units[i + 1]) {
                return Err(fail("unicode"));
            }
            i += 2;
        } else if (0xdc00..=0xdfff).contains(&u) {
            return Err(fail("unicode"));
        } else {
            i += 1;
        }
        count += 1;
    }
    Ok(count)
}
fn check_wrapper(value: &Value, wrapper_keys: usize) -> Result<(), LiteralFault> {
    let Some(m) = object(value) else {
        return Err(fail("wrapper"));
    };
    if m.len() != wrapper_keys {
        return Err(fail("wrapper"));
    }
    Ok(())
}
fn rules<'a>(policy: &'a Value) -> &'a [Value] {
    array(get(policy, "refinements").unwrap_or(&Value::Null)).unwrap_or(&[])
}
fn apply_refinements(
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &Value,
    kind: &str,
    fam: Option<&Value>,
    count: Option<usize>,
    phase: &str,
    host: &mut Option<&mut dyn HostJsonReflection>,
    ctx: &mut Context<'_>,
) -> Result<(), LiteralFault> {
    let selector_fields = field_names(policy);
    let facet_name = str_at(selector_fields, "facets").unwrap_or_else(|| "facets".to_owned());
    let facets = get(field, &facet_name).unwrap_or(&Value::Null);
    for rule in rules(policy) {
        if phase != "all" && str_at(rule, "phase").as_deref() != Some(phase)
            || matches!(get(rule, "enabled"), Some(Value::Bool(false)))
            || !matches!(str_at(rule, "applies").as_deref(), Some("all"))
                && str_at(rule, "applies").as_deref() != Some(kind)
            || str_at(rule, "mode").as_deref() == Some("refinements") && !enabled
        {
            continue;
        }
        let rule_selector = array(get(rule, "selector").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .map(ascii)
            .collect::<Option<Vec<_>>>()
            .ok_or_else(|| fail("mechanic"))?;
        let Some(constraint) = path_get(field, &rule_selector) else {
            continue;
        };
        let mechanic = str_at(rule, "mechanic").unwrap_or_default();
        match mechanic.as_str() {
            "count-bounds" => {
                if let Some(unit_selector) = str_at(rule, "unit") {
                    if str_at(constraint, &unit_selector)
                        != fam.and_then(|f| str_at(f, "lengthUnit"))
                    {
                        return Err(fail(
                            &str_at(rule, "unitError").unwrap_or_else(|| "length-unit".into()),
                        ));
                    }
                }
                let n = count.ok_or_else(|| {
                    fail(&str_at(rule, "domainError").unwrap_or_else(|| "length-domain".into()))
                })?;
                let min = str_at(rule, "min")
                    .and_then(|s| num_at(constraint, &s))
                    .unwrap_or(0);
                let max = str_at(rule, "max").and_then(|s| num_at(constraint, &s));
                if min > 0 && n < (min as usize) || max.is_some_and(|m| n > m as usize) {
                    return Err(fail(
                        &str_at(rule, "error").unwrap_or_else(|| "length".into()),
                    ));
                }
            }
            "integer-width" => {
                let family = fam.ok_or_else(|| fail("mechanic"))?;
                let tok = text(carrier(value, family).ok_or_else(|| fail("family"))?)
                    .ok_or_else(|| fail("numeric-token"))?;
                let number = parse_token(tok, 0, None, ctx)?;
                let bits_selector = str_at(rule, "bits").unwrap_or_default();
                let signed_selector = str_at(rule, "signed").unwrap_or_default();
                let bits = num_at(constraint, &bits_selector)
                    .filter(|x| *x > 0)
                    .ok_or_else(|| fail("integer-width"))? as u64;
                let signed = truth_at(constraint, &signed_selector);
                let width = number.bits();
                let fits = if signed && number.is_negative() {
                    if width < bits {
                        true
                    } else if width == bits {
                        // Charge before `abs` and the radix conversion allocate
                        // private intermediates; this is work, not source text.
                        ctx.charge_work_u64(width, Utf16::default())
                            .map_err(LiteralFault::from_engine)?;
                        number
                            .magnitude()
                            .to_str_radix(2)
                            .bytes()
                            .filter(|b| *b == b'1')
                            .count()
                            == 1
                    } else {
                        false
                    }
                } else if signed {
                    width < bits
                } else {
                    !number.is_negative() && width <= bits
                };
                if !fits {
                    return Err(fail(
                        &str_at(rule, "error").unwrap_or_else(|| "integer-width".into()),
                    ));
                }
            }
            "coefficient-range" => {
                let family = fam.ok_or_else(|| fail("mechanic"))?;
                let facet_scale = if str_at(family, "mechanic").as_deref() == Some("decimal") {
                    num_at(facets, &selector(policy, "scale")).unwrap_or(0)
                } else {
                    0
                };
                let token = text(carrier(value, family).ok_or_else(|| fail("family"))?)
                    .ok_or_else(|| fail("numeric-token"))?;
                let precision = num_at(facets, &selector(policy, "precision"))
                    .and_then(|n| precision_limit(Some(n)));
                let number = parse_token(token, facet_scale, precision, ctx)?;
                for (bound, inclusive, lower) in [
                    (
                        str_at(rule, "min").unwrap_or_default(),
                        str_at(rule, "minInclusive").unwrap_or_default(),
                        true,
                    ),
                    (
                        str_at(rule, "max").unwrap_or_default(),
                        str_at(rule, "maxInclusive").unwrap_or_default(),
                        false,
                    ),
                ] {
                    if let Some(endpoint) = get(constraint, &bound) {
                        if matches!(endpoint, Value::Null) {
                            let mut error = fail(
                                &str_at(rule, "nullError").unwrap_or_else(|| "numeric-null".into()),
                            );
                            let mut path = Utf16::default();
                            for part in &rule_selector {
                                path = append_ascii(&path, part);
                            }
                            error.path = append_ascii(&path, &bound);
                            return Err(error);
                        }
                        let endpoint_token =
                            text(carrier(endpoint, family).ok_or_else(|| fail("family"))?)
                                .ok_or_else(|| fail("numeric-token"))?;
                        let target = parse_token(endpoint_token, facet_scale, precision, ctx)?;
                        let exclusive =
                            matches!(get(constraint, &inclusive), Some(Value::Bool(false)));
                        if if lower {
                            number < target || exclusive && number == target
                        } else {
                            number > target || exclusive && number == target
                        } {
                            return Err(fail(
                                &str_at(rule, "error").unwrap_or_else(|| "range".into()),
                            ));
                        }
                    }
                }
            }
            "allowed-membership" => {
                let Some(candidates) = array(constraint) else {
                    return Err(fail("allowed"));
                };
                let wanted = exact_identity_with_host(field, value, policy, host, ctx)?;
                let mut found = false;
                for candidate in candidates {
                    if exact_identity_with_host(field, candidate, policy, host, ctx)? == wanted {
                        found = true;
                        break;
                    }
                }
                if !found {
                    return Err(fail(
                        &str_at(rule, "error").unwrap_or_else(|| "allowed".into()),
                    ));
                }
            }
            _ => return Err(fail("mechanic")),
        }
    }
    Ok(())
}
fn evaluate(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &Value,
    depth: usize,
    public_field_value: bool,
    host: &mut Option<&mut dyn HostJsonReflection>,
    ctx: &mut Context<'_>,
) -> Result<(), LiteralFault> {
    ctx.charge_work(1, Utf16::default())
        .map_err(LiteralFault::from_engine)?;
    if depth > ctx.limits().max_depth {
        return Err(fail("depth"));
    }
    let kind_key = selector(policy, "role");
    if str_at(field, &kind_key).as_deref() != str_at(policy, "fieldKind").as_deref() {
        return Err(fail("field-role"));
    }
    let references_key = selector(policy, "references");
    let role_key = selector(policy, "referenceRole");
    let record_role = str_at(policy, "recordReferenceRole");
    if array(get(field, &references_key).unwrap_or(&Value::Null))
        .unwrap_or(&[])
        .iter()
        .any(|r| str_at(r, &role_key) == record_role)
    {
        return Err(fail("record-value"));
    }
    let item_key = selector(policy, "item");
    if let Some(item) = get(field, &item_key) {
        let allowed = prop_list(policy, "itemReferenceKeys");
        known(
            item,
            &allowed,
            &append_ascii(&Utf16::default(), &item_key),
            public_field_value,
        )?;
    }
    let facets_key = selector(policy, "facets");
    let empty_facets = Value::Object(Vec::new());
    let facets = get(field, &facets_key).unwrap_or(&empty_facets);
    known(
        facets,
        &prop_list(policy, "facetKeys"),
        &append_ascii(&Utf16::default(), &facets_key),
        public_field_value,
    )?;
    for (group, keys) in object(get(policy, "facetGroups").unwrap_or(&Value::Null)).unwrap_or(&[]) {
        let Some(group) = group.to_utf8().ok() else {
            return Err(fail("object"));
        };
        if let Some(g) = get(facets, &group) {
            if !matches!(g, Value::Null) {
                known(
                    g,
                    &array(keys)
                        .unwrap_or(&[])
                        .iter()
                        .filter_map(ascii)
                        .collect::<Vec<_>>(),
                    &append_ascii(&append_ascii(&Utf16::default(), &facets_key), &group),
                    public_field_value,
                )?;
            }
        }
    }
    if matches!(value, Value::Null) {
        if str_at(field, &selector(policy, "availability")) != str_at(policy, "nullability") {
            return Err(fail("null"));
        }
        return Ok(());
    }
    check_wrapper(value, num_at(policy, "wrapperKeys").unwrap_or(1) as usize)?;
    let card_key = selector(policy, "cardinality");
    let card = str_at(field, &card_key).unwrap_or_default();
    let containers = get(policy, "containers").unwrap_or(&Value::Null);
    if let Some(container) = get(containers, &card) {
        let carrier_name = str_at(container, "carrier").unwrap_or_default();
        let items = get(value, &carrier_name).ok_or_else(|| fail("container"))?;
        let sequence = str_at(container, "mechanic").as_deref() == Some("sequence");
        if sequence && !matches!(items, Value::Array(_))
            || !sequence && !matches!(items, Value::Object(_))
        {
            return Err(fail("container"));
        }
        let item_ref = get(field, &item_key).ok_or_else(|| fail("item-required"))?;
        let lookup = get(policy, "itemLookup").unwrap();
        let modules_key = str_at(lookup, "modules").unwrap();
        let module_id_key = str_at(lookup, "moduleId").unwrap();
        let elements_key = str_at(lookup, "elements").unwrap();
        let element_id_key = str_at(lookup, "elementId").unwrap();
        let module_ref =
            text(get(item_ref, &str_at(lookup, "moduleRef").unwrap()).unwrap_or(&Value::Null))
                .cloned()
                .unwrap_or_default();
        let element_ref =
            text(get(item_ref, &str_at(lookup, "elementRef").unwrap()).unwrap_or(&Value::Null))
                .cloned()
                .unwrap_or_default();
        let mut found = None;
        for module in array(get(document, &modules_key).unwrap_or(&Value::Null)).unwrap_or(&[]) {
            if text(get(module, &module_id_key).unwrap_or(&Value::Null)) == Some(&module_ref) {
                for element in
                    array(get(module, &elements_key).unwrap_or(&Value::Null)).unwrap_or(&[])
                {
                    if text(get(element, &element_id_key).unwrap_or(&Value::Null))
                        == Some(&element_ref)
                    {
                        found = Some(element);
                        break;
                    }
                }
            }
        }
        let child = found.ok_or_else(|| fail("item-missing"))?;
        let count = if sequence {
            array(items).unwrap().len()
        } else {
            object(items).unwrap().len()
        };
        apply_refinements(
            field,
            value,
            enabled,
            policy,
            "container",
            None,
            Some(count),
            "before",
            host,
            ctx,
        )?;
        if sequence {
            for child_value in array(items).unwrap() {
                evaluate(
                    document,
                    child,
                    child_value,
                    enabled,
                    policy,
                    depth + 1,
                    public_field_value,
                    host,
                    ctx,
                )?
            }
        } else {
            for (_, child_value) in object(items).unwrap() {
                evaluate(
                    document,
                    child,
                    child_value,
                    enabled,
                    policy,
                    depth + 1,
                    public_field_value,
                    host,
                    ctx,
                )?
            }
        }
        apply_refinements(
            field,
            value,
            enabled,
            policy,
            "container",
            None,
            Some(count),
            "after",
            host,
            ctx,
        )?;
        return Ok(());
    }
    let cardinalities = prop_list(policy, "singular");
    if !card.is_empty() && !cardinalities.contains(&card) {
        return Err(fail("cardinality"));
    }
    let fam = family(field, policy).ok_or_else(|| fail("family"))?;
    let raw = carrier(value, fam).ok_or_else(|| fail("family"))?;
    if !truth_at(fam, "refinements") {
        if enabled {
            return Err(fail("refinements"));
        }
        if text(raw).is_none() {
            return Err(fail("text"));
        }
        return Ok(());
    }
    if public_field_value
        && str_at(fam, "mechanic").as_deref() == Some("unicode")
        && !matches!(raw, Value::String(_))
    {
        // `identity()` calls unicodeCount first, then evaluate computes the
        // count used by before/after refinements. The host path runs both
        // checkpoints against the admitted copy; direct Rust callers retain
        // their existing single portable compatibility pass.
        let count = if host.is_some() {
            let _ = public_string_carrier_count(raw, host, ctx)
                .map_err(LiteralFault::from_engine)?;
            public_string_carrier_count(raw, host, ctx)
                .map_err(LiteralFault::from_engine)?
        } else {
            public_string_carrier_count(raw, host, ctx).map_err(LiteralFault::from_engine)?
        };
        let has_length = get(facets, "length").is_some();
        let has_allowed = get(field, "allowedValues").is_some();
        apply_refinements(
            field,
            value,
            enabled,
            policy,
            "scalar",
            Some(fam),
            Some(count),
            "before",
            host,
            ctx,
        )?;
        if !has_allowed {
            apply_refinements(
                field,
                value,
                enabled,
                policy,
                "scalar",
                Some(fam),
                Some(count),
                "after",
                host,
                ctx,
            )?;
            return Ok(());
        }
        if host.is_some() && count == 0 {
            apply_refinements(
                field,
                value,
                enabled,
                policy,
                "scalar",
                Some(fam),
                Some(count),
                "after",
                host,
                ctx,
            )?;
            return Ok(());
        }
        if has_length {
            // The dynamic unicode loop fails for positive lengths above; for
            // zero-length carriers, continue through normal allowed-value
            // evaluation rather than silently accepting them.
        }
    }
    let _identity = exact_identity(field, value, policy, ctx)?;
    let mechanic = str_at(fam, "mechanic").unwrap_or_default();
    let count = if mechanic == "unicode" {
        Some(unicode_count(text(raw).ok_or_else(|| fail("text"))?)?)
    } else if mechanic == "hex" {
        let raw = text(raw).ok_or_else(|| fail("hex"))?;
        Some(raw.len() / 2)
    } else {
        None
    };
    apply_refinements(
        field,
        value,
        enabled,
        policy,
        "scalar",
        Some(fam),
        count,
        "all",
        host,
        ctx,
    )?;
    Ok(())
}

pub fn literal_errors(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let document = copy_json(document, ctx)?;
    let field = copy_json(field, ctx)?;
    let value = copy_json(value, ctx)?;
    literal_errors_admitted(&document, &field, &value, enabled, policy, ctx)
}

/// Evaluate inputs that have already crossed ordinary `Value` admission in
/// the current operation. Interpreter and binding internals use this helper
/// to avoid charging a second copy of the same admitted values.
pub(crate) fn literal_errors_admitted(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut host = None;
    match evaluate(
        document,
        field,
        value,
        enabled,
        policy.value(),
        0,
        false,
        &mut host,
        ctx,
    ) {
        Ok(()) => Ok(Vec::new()),
        Err(error) => match error.engine_error {
            Some(engine_error) => Err(engine_error),
            None => Ok(vec![policy_error(&error, policy.value(), ctx)?]),
        },
    }
}

pub(crate) fn literal_field_value_errors_admitted(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    literal_field_value_errors_host_admitted(document, field, value, enabled, policy, None, ctx)
}

pub(crate) fn literal_field_value_errors_with_host_admitted(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &PreparedPolicy,
    host: &mut dyn HostJsonReflection,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    literal_field_value_errors_host_admitted(
        document,
        field,
        value,
        enabled,
        policy,
        Some(host),
        ctx,
    )
}

fn literal_field_value_errors_host_admitted(
    document: &Value,
    field: &Value,
    value: &Value,
    enabled: bool,
    policy: &PreparedPolicy,
    host: Option<&mut dyn HostJsonReflection>,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let mut host = host;
    match evaluate(
        document,
        field,
        value,
        enabled,
        policy.value(),
        0,
        true,
        &mut host,
        ctx,
    ) {
        Ok(()) => Ok(Vec::new()),
        Err(error) => match error.engine_error {
            Some(engine_error) => Err(engine_error),
            None => Ok(vec![policy_error(&error, policy.value(), ctx)?]),
        },
    }
}
pub fn literal_identity(
    field: &Value,
    value: &Value,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    let field = copy_json(field, ctx)?;
    let value = copy_json(value, ctx)?;
    literal_identity_admitted(&field, &value, policy, ctx)
}

pub(crate) fn literal_identity_admitted(
    field: &Value,
    value: &Value,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Option<Utf16>, EngineError> {
    match exact_identity(field, value, policy.value(), ctx) {
        Ok(value) => Ok(Some(Utf16::from(value))),
        Err(error) => match error.engine_error {
            Some(engine_error) => Err(engine_error),
            None => Ok(None),
        },
    }
}

pub fn numeric_interval(
    field: &Value,
    range: &Value,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let field = copy_json(field, ctx)?;
    let range = copy_json(range, ctx)?;
    numeric_interval_admitted(&field, &range, policy, ctx)
}

pub(crate) fn numeric_interval_admitted(
    field: &Value,
    range: &Value,
    policy: &PreparedPolicy,
    ctx: &mut Context<'_>,
) -> Result<Vec<Diagnostic>, EngineError> {
    let p = policy.value();
    let interval = get(p, "interval").ok_or_else(|| {
        EngineError::new(
            "CONSTRAINT_POLICY",
            Utf16::default(),
            "Numeric interval policy is missing",
        )
    })?;
    let min_name = str_at(interval, "min").unwrap_or_default();
    let max_name = str_at(interval, "max").unwrap_or_default();
    let family = family(field, p).ok_or_else(|| {
        EngineError::new(
            "CONSTRAINT_POLICY",
            Utf16::default(),
            "Numeric interval family missing",
        )
    })?;
    let facets_name = selector(p, "facets");
    let facets = get(field, &facets_name).unwrap_or(&Value::Null);
    let scale = if str_at(family, "mechanic").as_deref() == Some("decimal") {
        num_at(facets, &selector(p, "scale")).unwrap_or(0)
    } else {
        0
    };
    let precision = num_at(facets, &selector(p, "precision"))
        .and_then(|n| precision_limit(Some(n)));
    let field_members = object(field).ok_or_else(|| {
        EngineError::new(
            "CONSTRAINT_POLICY",
            Utf16::default(),
            "Numeric interval field must be an object",
        )
    })?;
    let mut base_members = Vec::with_capacity(field_members.len());
    for (name, value) in field_members {
        ctx.charge_work(name.len(), Utf16::default())?;
        base_members.push((name.clone(), copy_json(value, ctx)?));
    }
    let numeric_keys = prop_list(p, "numericFacetKeys");
    let facet_members = object(facets).unwrap_or(&[]);
    let mut numeric_facets = Vec::new();
    for (name, value) in facet_members {
        if name
            .to_utf8()
            .ok()
            .is_some_and(|text| numeric_keys.contains(&text))
        {
            ctx.charge_work(name.len(), Utf16::default())?;
            numeric_facets.push((name.clone(), copy_json(value, ctx)?));
        }
    }
    if let Some((_, value)) = base_members
        .iter_mut()
        .find(|(k, _)| k == &key(&facets_name))
    {
        *value = Value::Object(numeric_facets);
    }
    for omitted in prop_list(interval, "omit") {
        base_members.retain(|(k, _)| k != &key(&omitted));
    }
    for (group, keys) in
        object(get(interval, "qualifierKeys").unwrap_or(&Value::Null)).unwrap_or(&[])
    {
        let Some(group_name) = group.to_utf8().ok() else {
            continue;
        };
        let Some((_, Value::Object(facet_members))) = base_members
            .iter_mut()
            .find(|(k, _)| k == &key(&facets_name))
        else {
            continue;
        };
        if let Some((_, Value::Object(group_members))) =
            facet_members.iter_mut().find(|(k, _)| k == group)
        {
            let allowed = array(keys)
                .unwrap_or(&[])
                .iter()
                .filter_map(ascii)
                .collect::<Vec<_>>();
            group_members.retain(|(k, _)| k.to_utf8().ok().is_some_and(|n| allowed.contains(&n)));
        }
        let _ = group_name;
    }
    let base = Value::Object(base_members);
    let modules_name =
        str_at(get(p, "itemLookup").unwrap_or(&Value::Null), "modules").unwrap_or_default();
    let doc = Value::Object(vec![(key(&modules_name), Value::Array(vec![]))]);
    let mut diagnostics = Vec::new();
    for end in [&min_name, &max_name] {
        if let Some(bound) = get(range, end) {
            if matches!(bound, Value::Null) {
                let mut error = fail("numeric-null");
                error.path = append_ascii(&error.path, end);
                diagnostics.push(policy_error(&error, p, ctx)?);
                return Ok(diagnostics);
            }
            let mut host = None;
            if let Err(error) = evaluate(&doc, &base, bound, true, p, 0, false, &mut host, ctx) {
                if let Some(engine_error) = error.engine_error {
                    return Err(engine_error);
                }
                diagnostics.push(policy_error(&error, p, ctx)?);
                return Ok(diagnostics);
            }
        }
    }
    let parse_bound = |name: &str, ctx: &mut Context<'_>| -> Result<Option<BigInt>, LiteralFault> {
        let Some(bound) = get(range, name) else {
            return Ok(None);
        };
        let raw = carrier(bound, family).ok_or_else(|| fail("family"))?;
        let token = text(raw).ok_or_else(|| fail("numeric-token"))?;
        parse_token(token, scale, precision, ctx).map(Some)
    };
    let min = match parse_bound(&min_name, ctx) {
        Ok(v) => v,
        Err(e) => {
            if let Some(engine_error) = e.engine_error {
                return Err(engine_error);
            }
            diagnostics.push(policy_error(&e, p, ctx)?);
            return Ok(diagnostics);
        }
    };
    let max = match parse_bound(&max_name, ctx) {
        Ok(v) => v,
        Err(e) => {
            if let Some(engine_error) = e.engine_error {
                return Err(engine_error);
            }
            diagnostics.push(policy_error(&e, p, ctx)?);
            return Ok(diagnostics);
        }
    };
    let min_exclusive = matches!(
        get(range, &str_at(interval, "minInclusive").unwrap_or_default()),
        Some(Value::Bool(false))
    );
    let max_exclusive = matches!(
        get(range, &str_at(interval, "maxInclusive").unwrap_or_default()),
        Some(Value::Bool(false))
    );
    let is_extreme = |number: &BigInt,
                      end: &str,
                      ctx: &mut Context<'_>|
     -> Result<bool, EngineError> {
        if str_at(family, "mechanic").as_deref() == Some("decimal") {
            if (end == "min" && !number.is_negative()) || (end == "max" && !number.is_positive()) {
                return Ok(false);
            }
            // `abs` copies the coefficient and `to_string` performs radix-10
            // formatting. Charge their bounded cost before either allocation.
            ctx.charge_work_u64(decimal_format_work(number), Utf16::default())?;
            let digits = number.abs().to_string();
            return Ok(
                precision.is_some_and(|n| digits.len() == n && digits.bytes().all(|b| b == b'9'))
            );
        }
        let width_path = array(get(interval, "width").unwrap_or(&Value::Null))
            .unwrap_or(&[])
            .iter()
            .filter_map(ascii)
            .collect::<Vec<_>>();
        let width_value = path_get(field, &width_path).unwrap_or(&Value::Null);
        let bits = str_at(interval, "bits")
            .and_then(|name| num_at(width_value, &name))
            .filter(|n| *n > 0)
            .unwrap_or(0) as u64;
        let signed = str_at(interval, "signed").is_some_and(|name| truth_at(width_value, &name));
        if bits == 0 {
            return Ok(false);
        }
        if end == "min" {
            if !signed {
                return Ok(number.is_zero());
            }
            if !number.is_negative() || number.bits() != bits {
                return Ok(false);
            }
            ctx.charge_work_u64(bits, Utf16::default())?;
            return Ok(number
                .magnitude()
                .to_str_radix(2)
                .bytes()
                .filter(|b| *b == b'1')
                .count()
                == 1);
        }
        if number.is_negative() {
            return Ok(false);
        }
        let target = bits.saturating_sub(u64::from(signed));
        if number.bits() != target {
            return Ok(false);
        }
        ctx.charge_work_u64(target, Utf16::default())?;
        Ok(number.to_str_radix(2).bytes().all(|b| b == b'1'))
    };
    let empty = match (&min, &max) {
        (Some(a), Some(b)) => {
            let limb_work =
                |n: &BigInt| n.bits().div_ceil(u64::from(usize::BITS)).saturating_add(1);
            ctx.charge_work_u64(limb_work(a).saturating_add(limb_work(b)), Utf16::default())?;
            a + BigInt::from(i8::from(min_exclusive)) > b - BigInt::from(i8::from(max_exclusive))
        }
        _ => false,
    };
    let min_is_extreme = if min_exclusive {
        match min.as_ref() {
            Some(value) => is_extreme(value, "max", ctx)?,
            None => false,
        }
    } else {
        false
    };
    let max_is_extreme = if max_exclusive {
        match max.as_ref() {
            Some(value) => is_extreme(value, "min", ctx)?,
            None => false,
        }
    } else {
        false
    };
    if empty || min_is_extreme || max_is_extreme {
        diagnostics.push(policy_error(&fail("interval"), p, ctx)?);
    }
    Ok(diagnostics)
}
