//! Exact integer-width and decimal precision/scale decisions for typed access.
//!
//! Python owns carrier admission and Decimal tuple extraction. This module
//! owns the arithmetic decisions and deliberately avoids powers of ten.

use num_bigint::{BigInt, BigUint};
use num_traits::{One, ToPrimitive, Zero};
use std::{cmp::Ordering, fmt};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessValuesError {
    IntegerWidth,
    DecimalMetadata,
    DecimalRounding,
    DecimalPrecision,
    DecimalTuple,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Float32Error {
    NonFinite,
    Overflow,
    Rounding,
}

/// Admit a finite binary64 value only when conversion to IEEE-754 binary32 is
/// finite and exact. Rust's cast uses round-to-nearest, ties-to-even.
pub fn validate_float32(value: f64) -> Result<(), Float32Error> {
    if !value.is_finite() {
        return Err(Float32Error::NonFinite);
    }
    let narrowed = value as f32;
    if !narrowed.is_finite() {
        return Err(Float32Error::Overflow);
    }
    if f64::from(narrowed) != value {
        return Err(Float32Error::Rounding);
    }
    Ok(())
}

impl fmt::Display for AccessValuesError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::IntegerWidth => "invalid authored integer width",
            Self::DecimalMetadata => "invalid authored decimal precision or scale",
            Self::DecimalRounding => "decimal requires rounding at authored scale",
            Self::DecimalPrecision => "decimal outside authored precision",
            Self::DecimalTuple => "invalid Decimal coefficient tuple",
        })
    }
}

impl std::error::Error for AccessValuesError {}

/// Return whether an already admitted arbitrary-precision integer fits its
/// authored width. `bits` remains arbitrary precision; no narrowing occurs.
pub fn integer_fits(
    value: &BigInt,
    bits: Option<&BigInt>,
    signed: bool,
) -> Result<bool, AccessValuesError> {
    let Some(bits) = bits else { return Ok(true) };
    if bits <= &BigInt::zero() {
        return Err(AccessValuesError::IntegerWidth);
    }
    let magnitude = value.magnitude();
    let width = BigInt::from(magnitude.bits());
    if signed {
        if width < *bits {
            Ok(true)
        } else if value < &BigInt::zero() && width == *bits {
            // The negative endpoint is representable only for an exact power
            // of two. This works on the magnitude without allocating 2**bits.
            Ok((magnitude & (magnitude - BigUint::one())).is_zero())
        } else {
            Ok(false)
        }
    } else {
        Ok(value >= &BigInt::zero() && width <= *bits)
    }
}

/// Compare exact integer range endpoints without narrowing either operand.
pub fn compare_integers(left: &BigInt, right: &BigInt) -> Ordering {
    left.cmp(right)
}

/// Compare finite decimal tuples without expanding powers of ten.
///
/// Equal values may have different signs for zero, coefficient lengths, trailing
/// zeros, and arbitrary-size exponents. Magnitudes are ordered first by the
/// position of their leading digit (`digits.len() + exponent`), then by
/// lexicographically comparing the in-memory coefficient digits with virtual
/// trailing zeros. No allocation depends on the exponent value.
pub fn compare_decimal_tuples(
    left_sign: bool,
    left_digits: &[u8],
    left_exponent: &BigInt,
    right_sign: bool,
    right_digits: &[u8],
    right_exponent: &BigInt,
) -> Result<Ordering, AccessValuesError> {
    validate_decimal_tuple(left_digits, left_exponent, None, None)?;
    validate_decimal_tuple(right_digits, right_exponent, None, None)?;

    let left_zero = left_digits.iter().all(|digit| *digit == 0);
    let right_zero = right_digits.iter().all(|digit| *digit == 0);
    if left_zero || right_zero {
        return Ok(match (left_zero, right_zero) {
            (true, true) => Ordering::Equal,
            (true, false) => {
                if right_sign {
                    Ordering::Greater
                } else {
                    Ordering::Less
                }
            }
            (false, true) => {
                if left_sign {
                    Ordering::Less
                } else {
                    Ordering::Greater
                }
            }
            (false, false) => unreachable!(),
        });
    }
    if left_sign != right_sign {
        return Ok(if left_sign {
            Ordering::Less
        } else {
            Ordering::Greater
        });
    }

    let left_first = left_digits.iter().position(|digit| *digit != 0).unwrap();
    let right_first = right_digits.iter().position(|digit| *digit != 0).unwrap();
    let left = &left_digits[left_first..];
    let right = &right_digits[right_first..];
    let left_order = left_exponent + BigInt::from(left.len());
    let right_order = right_exponent + BigInt::from(right.len());
    let mut ordering = left_order.cmp(&right_order);
    if ordering == Ordering::Equal {
        for index in 0..left.len().max(right.len()) {
            let left_digit = left.get(index).copied().unwrap_or(0);
            let right_digit = right.get(index).copied().unwrap_or(0);
            ordering = left_digit.cmp(&right_digit);
            if ordering != Ordering::Equal {
                break;
            }
        }
    }
    Ok(if left_sign {
        ordering.reverse()
    } else {
        ordering
    })
}

/// Apply the predecessor Decimal tuple rule. The all-zero coefficient returns
/// early after metadata validation, preserving sign and exponent in Python.
pub fn validate_decimal_tuple(
    digits: &[u8],
    exponent: &BigInt,
    precision: Option<&BigInt>,
    scale: Option<&BigInt>,
) -> Result<(), AccessValuesError> {
    if digits.is_empty() || digits.iter().any(|digit| *digit > 9) {
        return Err(AccessValuesError::DecimalTuple);
    }
    if precision.is_some_and(|value| value < &BigInt::one())
        || scale.is_some_and(|value| value < &BigInt::zero())
        || matches!((precision, scale), (Some(p), Some(s)) if s > p)
    {
        return Err(AccessValuesError::DecimalMetadata);
    }
    if digits.iter().all(|digit| *digit == 0) {
        return Ok(());
    }

    if let Some(scale) = scale {
        let shift = exponent + scale;
        let length = BigInt::from(digits.len()) + &shift;
        if shift < BigInt::zero() {
            let cut = -shift;
            if cut > BigInt::from(digits.len()) {
                return Err(AccessValuesError::DecimalRounding);
            }
            // Conversion is safe only after proving the value is bounded by
            // the in-memory coefficient length.
            let cut = cut.to_usize().ok_or(AccessValuesError::DecimalTuple)?;
            if digits[digits.len() - cut..].iter().any(|digit| *digit != 0) {
                return Err(AccessValuesError::DecimalRounding);
            }
        }
        if precision.is_some_and(|p| length > *p) {
            return Err(AccessValuesError::DecimalPrecision);
        }
    } else if precision.is_some_and(|p| BigInt::from(digits.len()) > *p) {
        return Err(AccessValuesError::DecimalPrecision);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(value: i64) -> BigInt {
        BigInt::from(value)
    }

    #[test]
    fn integer_signed_unsigned_and_unbounded_metadata() {
        assert!(integer_fits(&n(-128), Some(&n(8)), true).unwrap());
        assert!(!integer_fits(&n(-129), Some(&n(8)), true).unwrap());
        assert!(integer_fits(&n(255), Some(&n(8)), false).unwrap());
        assert!(!integer_fits(&n(-1), Some(&n(8)), false).unwrap());
        let value = BigInt::one() << 4096usize;
        let width = BigInt::from(4098u16);
        assert!(integer_fits(&value, Some(&width), true).unwrap());
        assert!(!integer_fits(&value, Some(&n(4096)), true).unwrap());
        assert!(integer_fits(&value, None, true).unwrap());
    }

    #[test]
    fn decimal_preserves_exact_scale_rules_and_zero_early_return() {
        assert!(validate_decimal_tuple(&[1, 2, 0, 0], &n(-4), Some(&n(3)), Some(&n(2))).is_ok());
        assert_eq!(
            validate_decimal_tuple(&[1, 2, 3, 4], &n(-3), Some(&n(4)), Some(&n(2))),
            Err(AccessValuesError::DecimalRounding)
        );
        assert!(
            validate_decimal_tuple(&[0, 0, 0], &n(999_999_999), Some(&n(1)), Some(&n(0))).is_ok()
        );
        assert!(
            validate_decimal_tuple(&[1], &n(999_999_999_999), Some(&n(4)), Some(&n(2))).is_err()
        );
        assert!(
            validate_decimal_tuple(&[1], &n(-999_999_999_999), Some(&n(4)), Some(&n(2))).is_err()
        );
    }

    #[test]
    fn exact_integer_and_decimal_ordering() {
        assert_eq!(compare_integers(&n(-5), &n(2)), Ordering::Less);
        assert_eq!(compare_integers(&n(2), &n(2)), Ordering::Equal);
        assert_eq!(
            compare_decimal_tuples(false, &[1, 0, 0], &n(-2), false, &[1], &n(0)),
            Ok(Ordering::Equal)
        );
        assert_eq!(
            compare_decimal_tuples(false, &[1], &n(1_000_000_000), false, &[9], &n(999_999_999)),
            Ok(Ordering::Greater)
        );
        assert_eq!(
            compare_decimal_tuples(
                true,
                &[0],
                &n(1_000_000_000),
                false,
                &[0, 0],
                &n(-1_000_000_000)
            ),
            Ok(Ordering::Equal)
        );
        assert_eq!(
            compare_decimal_tuples(true, &[1, 2, 3], &n(-2), true, &[1, 2, 4], &n(-2)),
            Ok(Ordering::Greater)
        );
        assert_eq!(
            compare_decimal_tuples(
                false,
                &[1],
                &n(-1_000_000_000),
                false,
                &[2],
                &n(-1_000_000_000)
            ),
            Ok(Ordering::Less)
        );
    }

    #[test]
    fn exact_decimal_comparison_rejects_malformed_tuples() {
        assert_eq!(
            compare_decimal_tuples(false, &[1, 10], &n(0), false, &[1], &n(0)),
            Err(AccessValuesError::DecimalTuple)
        );
        assert_eq!(
            compare_decimal_tuples(false, &[], &n(0), false, &[1], &n(0)),
            Err(AccessValuesError::DecimalTuple)
        );
    }

    #[test]
    fn binary32_admission_preserves_finite_overflow_and_rounding_classes() {
        assert_eq!(validate_float32(-0.0), Ok(()));
        assert_eq!(validate_float32(2.0f64.powi(-149)), Ok(()));
        assert_eq!(validate_float32(2.0f64.powi(-150)), Err(Float32Error::Rounding));
        assert_eq!(validate_float32(f64::from(f32::MAX)), Ok(()));
        assert_eq!(validate_float32(f64::from_bits(0x47efffffefffffff)), Err(Float32Error::Rounding));
        assert_eq!(validate_float32(f64::from_bits(0x47effffff0000000)), Err(Float32Error::Overflow));
        assert_eq!(validate_float32(f64::from_bits(0x47effffff0000001)), Err(Float32Error::Overflow));
        assert_eq!(validate_float32(f64::NAN), Err(Float32Error::NonFinite));
        assert_eq!(validate_float32(f64::INFINITY), Err(Float32Error::NonFinite));
        assert_eq!(
            validate_float32(1.0 + 2.0f64.powi(-24)),
            Err(Float32Error::Rounding)
        );
    }
}
