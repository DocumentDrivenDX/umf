//! Exact, generated-scalar access constraint decisions.
//!
//! Python owns carrier admission, `len`, iteration and every unsupported or
//! custom Python comparison. This module only decides over admitted scalars.

use num_bigint::BigInt;
use std::cmp::Ordering;

/// Compare an already measured Python length to optional exact integer bounds.
/// The minimum check intentionally precedes (and may short-circuit) maximum.
pub fn length_within(size: usize, minimum: Option<&BigInt>, maximum: Option<&BigInt>) -> bool {
    let size = BigInt::from(size);
    if minimum.is_some_and(|bound| size < *bound) {
        return false;
    }
    if maximum.is_some_and(|bound| size > *bound) {
        return false;
    }
    true
}

pub fn equal_boolean(left: bool, right: bool) -> bool {
    left == right
}

pub fn equal_integer(left: &BigInt, right: &BigInt) -> bool {
    left == right
}

pub fn equal_text(left: &str, right: &str) -> bool {
    left == right
}

pub fn equal_bytes(left: &[u8], right: &[u8]) -> bool {
    left == right
}

pub fn equal_decimal(
    left_sign: bool,
    left_digits: &[u8],
    left_exponent: &BigInt,
    right_sign: bool,
    right_digits: &[u8],
    right_exponent: &BigInt,
) -> bool {
    crate::access_values::compare_decimal_tuples(
        left_sign,
        left_digits,
        left_exponent,
        right_sign,
        right_digits,
        right_exponent,
    )
    .is_ok_and(|ordering| ordering == Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_uses_exact_unbounded_integer_bounds() {
        assert!(length_within(
            1,
            Some(&BigInt::from(-1)),
            Some(&BigInt::from(1))
        ));
        assert!(!length_within(1, Some(&BigInt::from(2)), None));
        assert!(!length_within(1, None, Some(&BigInt::from(0))));
        assert!(!length_within(
            usize::MAX,
            None,
            Some(&(BigInt::from(usize::MAX) - 1))
        ));
    }

    #[test]
    fn generated_scalar_equality_is_exact() {
        assert!(equal_boolean(true, true));
        assert!(!equal_boolean(true, false));
        let huge = BigInt::from(1u8) << 4096;
        assert!(equal_integer(&huge, &huge));
        assert!(equal_text("😀", "😀"));
        assert!(equal_bytes(&[0, 255], &[0, 255]));
        assert!(equal_decimal(
            false,
            &[1, 2, 0],
            &BigInt::from(-2),
            false,
            &[1, 2],
            &BigInt::from(-1)
        ));
        assert!(equal_decimal(
            true,
            &[0],
            &BigInt::from(-9),
            false,
            &[0],
            &BigInt::from(0)
        ));
        assert!(!equal_decimal(
            false,
            &[1],
            &BigInt::from(0),
            false,
            &[2],
            &BigInt::from(0)
        ));
    }
}
