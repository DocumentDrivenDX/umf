// SPDX-License-Identifier: MIT OR Apache-2.0
//! Owner-declared page-size decisions for bounded access streams.

use num_bigint::BigInt;
use num_traits::ToPrimitive;

pub const MIN_PAGE_SIZE: u16 = 1;
pub const MAX_PAGE_SIZE: u16 = 1000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StreamPageSizeError {
    InvalidRequest,
    Unsupported,
    InvalidObligation,
    ParameterDiffers,
    ExceedsMaximum,
}

pub fn request_is_valid(requested: Option<&BigInt>) -> bool {
    requested.is_none_or(|value| {
        value >= &BigInt::from(MIN_PAGE_SIZE) && value <= &BigInt::from(MAX_PAGE_SIZE)
    })
}

pub fn missing_domain(requested: bool) -> Result<(), StreamPageSizeError> {
    if requested {
        Err(StreamPageSizeError::Unsupported)
    } else {
        Ok(())
    }
}

pub fn domain_type_is_valid(exact_dict: bool) -> Result<(), StreamPageSizeError> {
    exact_dict
        .then_some(())
        .ok_or(StreamPageSizeError::InvalidObligation)
}

pub fn domain_keys_are_valid(matches: bool) -> Result<(), StreamPageSizeError> {
    matches
        .then_some(())
        .ok_or(StreamPageSizeError::InvalidObligation)
}

pub fn domain_parameter_is_valid(matches: bool) -> Result<(), StreamPageSizeError> {
    matches
        .then_some(())
        .ok_or(StreamPageSizeError::InvalidObligation)
}

pub fn minimum_carrier_is_valid(exact_integer: bool) -> bool {
    exact_integer
}

pub fn minimum_value_is_valid(matches_minimum: bool) -> bool {
    matches_minimum
}

pub fn minimum_exact_value_is_valid(value: &BigInt) -> bool {
    value == &BigInt::from(MIN_PAGE_SIZE)
}

pub fn maximum_carrier_is_valid(exact_integer: bool) -> bool {
    exact_integer
}

pub fn maximum_value_is_valid(within_closed_range: bool) -> bool {
    within_closed_range
}

pub fn maximum_exact_value_is_valid(value: &BigInt) -> bool {
    value >= &BigInt::from(MIN_PAGE_SIZE) && value <= &BigInt::from(MAX_PAGE_SIZE)
}

pub fn row_cap_is_valid(exact_integer: bool, maximum_fits: bool) -> bool {
    exact_integer && maximum_fits
}

pub fn slot_count_is_valid(count: usize) -> bool {
    count == 1
}

pub fn slot_carrier_is_valid(matches: bool) -> bool {
    matches
}

pub fn slot_nullability_is_valid(is_exact_false: bool) -> bool {
    is_exact_false
}

pub fn final_maximum_is_valid(fits: bool) -> Result<(), StreamPageSizeError> {
    if fits {
        Ok(())
    } else {
        Err(StreamPageSizeError::ExceedsMaximum)
    }
}

pub fn effective_page_size(
    maximum: &BigInt,
    requested: Option<&BigInt>,
) -> Result<u16, StreamPageSizeError> {
    let selected = requested.unwrap_or(maximum);
    if selected > maximum {
        return Err(StreamPageSizeError::ExceedsMaximum);
    }
    selected
        .to_u16()
        .filter(|size| (MIN_PAGE_SIZE..=MAX_PAGE_SIZE).contains(size))
        .ok_or(StreamPageSizeError::InvalidObligation)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_and_owner_maximum_use_closed_integer_domain() {
        assert!(request_is_valid(None));
        assert!(request_is_valid(Some(&BigInt::from(1))));
        assert!(request_is_valid(Some(&BigInt::from(1000))));
        assert!(!request_is_valid(Some(&BigInt::from(0))));
        assert!(!request_is_valid(Some(&BigInt::from(1001))));
        assert!(maximum_carrier_is_valid(true));
        assert!(!maximum_carrier_is_valid(false));
        assert!(maximum_value_is_valid(true));
        assert!(!maximum_value_is_valid(false));
        assert!(minimum_exact_value_is_valid(&BigInt::from(1)));
        assert!(!minimum_exact_value_is_valid(&BigInt::from(2)));
        assert!(maximum_exact_value_is_valid(&BigInt::from(1000)));
        assert!(!maximum_exact_value_is_valid(&BigInt::from(1001)));
    }

    #[test]
    fn effective_size_and_owner_slots_preserve_explicit_outcomes() {
        assert_eq!(effective_page_size(&BigInt::from(25), None), Ok(25));
        assert_eq!(
            effective_page_size(&BigInt::from(25), Some(&BigInt::from(20))),
            Ok(20)
        );
        assert_eq!(
            effective_page_size(&BigInt::from(25), Some(&BigInt::from(26))),
            Err(StreamPageSizeError::ExceedsMaximum)
        );
        assert!(!slot_count_is_valid(0));
        assert!(!slot_count_is_valid(2));
        assert!(slot_count_is_valid(1));
        assert_eq!(final_maximum_is_valid(true), Ok(()));
        assert_eq!(
            final_maximum_is_valid(false),
            Err(StreamPageSizeError::ExceedsMaximum)
        );
    }
}
