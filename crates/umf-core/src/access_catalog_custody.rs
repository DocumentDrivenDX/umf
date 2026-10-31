// SPDX-License-Identifier: MIT OR Apache-2.0
//! Pure extraction of original native binding source references for the
//! Python stage-two catalog builder. This does not admit native schema meaning
//! or touch stage-one files; Python retains those custody checks.

use crate::{PyText, PythonConsumerValue};
use num_bigint::BigInt;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CatalogCustodyRefusal {
    RelatedReadCustody,
    ColumnSetBound,
    OriginalBindingShape,
    OriginalBindingUtf8,
    OriginalBindingDigest,
    NonFiniteEquality,
    SourceInventoryShape,
    SourceMembership,
}

impl CatalogCustodyRefusal {
    pub fn code(self) -> &'static str {
        match self {
            Self::RelatedReadCustody => "RELATED_READ_CUSTODY",
            Self::ColumnSetBound => "COLUMN_SET_BOUND",
            Self::OriginalBindingShape => "ORIGINAL_BINDING_SHAPE",
            Self::OriginalBindingUtf8 => "ORIGINAL_BINDING_UTF8",
            Self::OriginalBindingDigest => "ORIGINAL_BINDING_DIGEST",
            Self::NonFiniteEquality => "NONFINITE_EQUALITY_UNSUPPORTED",
            Self::SourceInventoryShape => "SOURCE_INVENTORY_SHAPE",
            Self::SourceMembership => "SOURCE_MEMBERSHIP",
        }
    }

    pub fn predecessor_message(self) -> &'static str {
        match self {
            Self::RelatedReadCustody => {
                "related reads require one identical original native binding"
            }
            Self::ColumnSetBound => "bounded original native ColumnSet sources required",
            Self::OriginalBindingShape => "native columns require an original binding source",
            Self::OriginalBindingUtf8 => "native binding source must be UTF-8",
            Self::OriginalBindingDigest => "native binding source digest differs",
            Self::NonFiniteEquality => "nonfinite values are outside catalog custody input",
            Self::SourceInventoryShape => "invalid stage-one source inventory",
            Self::SourceMembership => "native binding differs from retained stage-one source",
        }
    }
}

/// Confirm each binding reference against a parsed stage-one `sources.json`
/// array. File custody, manifest digest validation and JSON decoding stay in
/// the caller; non-object source entries mirror Python's filtered scan.
pub fn check_native_column_sources(
    bindings: &PythonConsumerValue,
    sources: &PythonConsumerValue,
) -> Result<(), CatalogCustodyRefusal> {
    let PythonConsumerValue::Array(bindings) = bindings else {
        return Err(CatalogCustodyRefusal::OriginalBindingShape);
    };
    if bindings.is_empty() {
        return Ok(());
    }
    let PythonConsumerValue::Array(sources) = sources else {
        return Err(CatalogCustodyRefusal::SourceInventoryShape);
    };

    // Python source entries are dictionaries from json.loads. Index only dict
    // entries whose `id` is a string, preserving duplicate counts.
    let mut by_id: BTreeMap<PyText, Vec<&PythonConsumerValue>> = BTreeMap::new();
    for source in sources {
        let Some(fields) = object_fields(source) else {
            continue;
        };
        let id = fields
            .iter()
            .find(|(name, _)| name == &key("id"))
            .and_then(|(_, value)| text(value));
        if let Some(id) = id {
            by_id.entry(id.clone()).or_default().push(source);
        }
    }
    for binding in bindings {
        let Some(binding_fields) = object_fields(binding) else {
            return Err(CatalogCustodyRefusal::OriginalBindingShape);
        };
        let source_id = binding_fields
            .iter()
            .find(|(name, _)| name == &key("sourceId"))
            .and_then(|(_, value)| text(value));
        let document_json = binding_fields
            .iter()
            .find(|(name, _)| name == &key("documentJson"))
            .and_then(|(_, value)| text(value));
        let (Some(source_id), Some(document_json)) = (source_id, document_json) else {
            return Err(CatalogCustodyRefusal::OriginalBindingShape);
        };
        let Some(matches) = by_id.get(source_id) else {
            return Err(CatalogCustodyRefusal::SourceMembership);
        };
        if matches.len() != 1 || member(matches[0], "text").and_then(text) != Some(document_json) {
            return Err(CatalogCustodyRefusal::SourceMembership);
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeBindingRef {
    pub source_id: PyText,
    pub document_json: PyText,
    pub document_sha256: PyText,
}

fn key(name: &str) -> PyText {
    PyText::from_utf8(name)
}

fn member<'a>(value: &'a PythonConsumerValue, name: &str) -> Option<&'a PythonConsumerValue> {
    let PythonConsumerValue::Object(fields) = value else {
        return None;
    };
    fields
        .iter()
        .find(|(field, _)| field == &key(name))
        .map(|(_, value)| value)
}

fn object_fields(value: &PythonConsumerValue) -> Option<&[(PyText, PythonConsumerValue)]> {
    match value {
        PythonConsumerValue::Object(fields) => Some(fields),
        _ => None,
    }
}

fn text(value: &PythonConsumerValue) -> Option<&PyText> {
    match value {
        PythonConsumerValue::String(value) => Some(value),
        _ => None,
    }
}

fn utf8(value: &PyText) -> Option<String> {
    value
        .codepoints()
        .iter()
        .map(|point| char::from_u32(*point))
        .collect()
}

fn digest_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut output = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(&mut output, "{byte:02x}");
    }
    output
}

fn original_binding(
    value: &PythonConsumerValue,
) -> Result<NativeBindingRef, CatalogCustodyRefusal> {
    let binding = member(value, "binding").ok_or(CatalogCustodyRefusal::OriginalBindingShape)?;
    let fields = object_fields(binding).ok_or(CatalogCustodyRefusal::OriginalBindingShape)?;
    let required = [key("sourceId"), key("documentJson"), key("documentSha256")];
    if fields.len() != required.len()
        || required
            .iter()
            .any(|field| !fields.iter().any(|(name, _)| name == field))
    {
        return Err(CatalogCustodyRefusal::OriginalBindingShape);
    }
    let source_id =
        text(member(binding, "sourceId").ok_or(CatalogCustodyRefusal::OriginalBindingShape)?)
            .ok_or(CatalogCustodyRefusal::OriginalBindingShape)?;
    let document_json =
        text(member(binding, "documentJson").ok_or(CatalogCustodyRefusal::OriginalBindingShape)?)
            .ok_or(CatalogCustodyRefusal::OriginalBindingShape)?;
    let document_sha256 =
        text(member(binding, "documentSha256").ok_or(CatalogCustodyRefusal::OriginalBindingShape)?)
            .ok_or(CatalogCustodyRefusal::OriginalBindingShape)?;
    if source_id.is_empty() || document_json.is_empty() || document_sha256.is_empty() {
        return Err(CatalogCustodyRefusal::OriginalBindingShape);
    }
    let document_utf8 = utf8(document_json).ok_or(CatalogCustodyRefusal::OriginalBindingUtf8)?;
    let expected = digest_hex(document_utf8.as_bytes());
    if utf8(document_sha256).as_deref() != Some(expected.as_str()) {
        return Err(CatalogCustodyRefusal::OriginalBindingDigest);
    }
    Ok(NativeBindingRef {
        source_id: source_id.clone(),
        document_json: document_json.clone(),
        document_sha256: document_sha256.clone(),
    })
}

/// Extract ordered exact source references from one JSON-compatible target.
/// Related-read child bindings use Python's recursive equality rules for
/// finite JSON values, including bool/int and int/float equality.
pub fn native_column_bindings(
    target: &PythonConsumerValue,
) -> Result<Vec<NativeBindingRef>, CatalogCustodyRefusal> {
    if member(target, "version") == Some(&PythonConsumerValue::String(key("weft.related-read/0.1")))
    {
        let source = member(target, "source").ok_or(CatalogCustodyRefusal::RelatedReadCustody)?;
        let destination =
            member(target, "target").ok_or(CatalogCustodyRefusal::RelatedReadCustody)?;
        if member(source, "version") == member(target, "version")
            || member(destination, "version") == member(target, "version")
        {
            return Err(CatalogCustodyRefusal::RelatedReadCustody);
        }
        let source_binding = member(source, "binding").filter(|v| object_fields(v).is_some());
        let destination_binding = member(destination, "binding");
        let Some(source_binding) = source_binding else {
            return Err(CatalogCustodyRefusal::RelatedReadCustody);
        };
        let Some(destination_binding) = destination_binding else {
            return Err(CatalogCustodyRefusal::RelatedReadCustody);
        };
        if !finite(source_binding) || !finite(destination_binding) {
            return Err(CatalogCustodyRefusal::NonFiniteEquality);
        }
        if !python_equal(source_binding, destination_binding) {
            return Err(CatalogCustodyRefusal::RelatedReadCustody);
        }
        let mut result = native_column_bindings(source)?;
        result.extend(native_column_bindings(destination)?);
        return Ok(result);
    }

    let mut result = Vec::new();
    if let Some(unity) = member(target, "unitySearch").filter(|v| object_fields(v).is_some()) {
        if let Some(columns) = member(unity, "nativeColumns") {
            result.push(original_binding(columns)?);
        }
    }
    if let Some(logical) = member(target, "binding").filter(|v| object_fields(v).is_some()) {
        if let Some(columns) = member(logical, "nativeColumns") {
            let sets = member(columns, "sets").and_then(|v| match v {
                PythonConsumerValue::Array(values) => Some(values),
                _ => None,
            });
            let Some(sets) = sets.filter(|values| (1..=64).contains(&values.len())) else {
                return Err(CatalogCustodyRefusal::ColumnSetBound);
            };
            for item in sets {
                result.push(original_binding(item)?);
            }
        }
    }
    Ok(result)
}

fn integer_float_equal(integer: &BigInt, value: f64) -> bool {
    if !value.is_finite() {
        return false;
    }
    let bits = value.to_bits();
    let negative = bits >> 63 != 0;
    let exponent = ((bits >> 52) & 0x7ff) as i32;
    let fraction = bits & ((1_u64 << 52) - 1);
    let (mantissa, shift) = if exponent == 0 {
        (fraction, -1022 - 52)
    } else {
        ((1_u64 << 52) | fraction, exponent - 1023 - 52)
    };
    let mut significand = BigInt::from(mantissa);
    if negative {
        significand = -significand;
    }
    if shift >= 0 {
        (significand << shift as usize) == *integer
    } else {
        significand == (integer << (-shift) as usize)
    }
}

fn finite(value: &PythonConsumerValue) -> bool {
    match value {
        PythonConsumerValue::Float(bits) => f64::from_bits(*bits).is_finite(),
        PythonConsumerValue::Array(items) => items.iter().all(finite),
        PythonConsumerValue::Object(fields) => fields.iter().all(|(_, value)| finite(value)),
        _ => true,
    }
}

/// Python equality for the JSON carrier domain. Python dict comparison treats
/// bool as int and compares integers to floats by exact numeric value.
fn python_equal(left: &PythonConsumerValue, right: &PythonConsumerValue) -> bool {
    match (left, right) {
        (PythonConsumerValue::Null, PythonConsumerValue::Null) => true,
        (PythonConsumerValue::Bool(a), PythonConsumerValue::Bool(b)) => a == b,
        (PythonConsumerValue::Integer(a), PythonConsumerValue::Integer(b)) => a == b,
        (PythonConsumerValue::Float(a), PythonConsumerValue::Float(b)) => {
            f64::from_bits(*a) == f64::from_bits(*b)
        }
        (PythonConsumerValue::Bool(a), PythonConsumerValue::Integer(b))
        | (PythonConsumerValue::Integer(b), PythonConsumerValue::Bool(a)) => {
            b == &BigInt::from(u8::from(*a))
        }
        (PythonConsumerValue::Bool(a), PythonConsumerValue::Float(b))
        | (PythonConsumerValue::Float(b), PythonConsumerValue::Bool(a)) => {
            integer_float_equal(&BigInt::from(u8::from(*a)), f64::from_bits(*b))
        }
        (PythonConsumerValue::Integer(a), PythonConsumerValue::Float(b))
        | (PythonConsumerValue::Float(b), PythonConsumerValue::Integer(a)) => {
            integer_float_equal(a, f64::from_bits(*b))
        }
        (PythonConsumerValue::String(a), PythonConsumerValue::String(b)) => a == b,
        (PythonConsumerValue::Array(a), PythonConsumerValue::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(x, y)| python_equal(x, y))
        }
        (PythonConsumerValue::Object(a), PythonConsumerValue::Object(b)) => object_equal(a, b),
        _ => false,
    }
}

/// Match Python dict equality without a quadratic scan over wide JSON objects.
/// Duplicate keys cannot occur in a Python dict, but fail closed if a carrier
/// is constructed with them instead of silently picking one.
fn object_equal(a: &[(PyText, PythonConsumerValue)], b: &[(PyText, PythonConsumerValue)]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut left: Vec<_> = a.iter().collect();
    let mut right: Vec<_> = b.iter().collect();
    left.sort_unstable_by(|(key_a, _), (key_b, _)| key_a.cmp(key_b));
    right.sort_unstable_by(|(key_a, _), (key_b, _)| key_a.cmp(key_b));
    left.iter()
        .zip(&right)
        .all(|((key_a, value_a), (key_b, value_b))| {
            key_a == key_b && python_equal(value_a, value_b)
        })
        && left.windows(2).all(|pair| pair[0].0 != pair[1].0)
        && right.windows(2).all(|pair| pair[0].0 != pair[1].0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use num_bigint::BigInt;

    #[test]
    fn python_numeric_equality_matches_bool_integer_and_exact_float_cases() {
        assert!(python_equal(
            &PythonConsumerValue::Bool(true),
            &PythonConsumerValue::Integer(BigInt::from(1))
        ));
        assert!(python_equal(
            &PythonConsumerValue::Integer(BigInt::from(1)),
            &PythonConsumerValue::float(1.0)
        ));
        assert!(
            python_equal(
                &PythonConsumerValue::Integer(BigInt::from(9_007_199_254_740_993_i64)),
                &PythonConsumerValue::float(9_007_199_254_740_992.0)
            ) == false
        );
        assert!(python_equal(
            &PythonConsumerValue::Integer(BigInt::from(0)),
            &PythonConsumerValue::float(-0.0)
        ));
        assert!(!python_equal(
            &PythonConsumerValue::Bool(false),
            &PythonConsumerValue::float(f64::NAN)
        ));
    }

    #[test]
    fn rejects_nonfinite_related_binding_equality_domain() {
        assert!(!finite(&PythonConsumerValue::float(f64::INFINITY)));
    }

    #[test]
    fn wide_object_equality_is_order_independent_and_duplicate_safe() {
        let left: Vec<_> = (0..20_000)
            .map(|index| {
                (
                    PyText::from_utf8(&format!("field-{index:05}")),
                    PythonConsumerValue::Integer(BigInt::from(index)),
                )
            })
            .collect();
        let right: Vec<_> = left.iter().rev().cloned().collect();
        assert!(object_equal(&left, &right));

        let duplicate = vec![
            (PyText::from_utf8("same"), PythonConsumerValue::Bool(true)),
            (
                PyText::from_utf8("same"),
                PythonConsumerValue::Integer(BigInt::from(1)),
            ),
        ];
        assert!(!object_equal(&duplicate, &duplicate));
    }

    #[test]
    fn source_join_ignores_non_objects_and_refuses_ambiguous_ids() {
        let binding = PythonConsumerValue::Object(vec![
            (key("sourceId"), PythonConsumerValue::String(key("alias"))),
            (key("documentJson"), PythonConsumerValue::String(key("{}"))),
        ]);
        let source = PythonConsumerValue::Object(vec![
            (key("id"), PythonConsumerValue::String(key("alias"))),
            (key("text"), PythonConsumerValue::String(key("{}"))),
        ]);
        let bindings = PythonConsumerValue::Array(vec![binding]);
        let sources = PythonConsumerValue::Array(vec![
            PythonConsumerValue::Null,
            PythonConsumerValue::Integer(BigInt::from(7)),
            source.clone(),
        ]);
        assert!(check_native_column_sources(&bindings, &sources).is_ok());

        let duplicates = PythonConsumerValue::Array(vec![source.clone(), source]);
        assert_eq!(
            check_native_column_sources(&bindings, &duplicates),
            Err(CatalogCustodyRefusal::SourceMembership)
        );
        assert!(
            check_native_column_sources(
                &PythonConsumerValue::Array(Vec::new()),
                &PythonConsumerValue::Null
            )
            .is_ok()
        );
    }
}
