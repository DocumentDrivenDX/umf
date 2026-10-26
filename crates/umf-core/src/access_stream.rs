// SPDX-License-Identifier: MIT OR Apache-2.0
//! Owner-declared page-size decisions for bounded access streams.

use num_bigint::BigInt;
use num_traits::ToPrimitive;

pub const MIN_PAGE_SIZE: u16 = 1;
pub const MAX_PAGE_SIZE: u16 = 1000;

/// Private structural post-host result-frame rules from CONTRACT-079/081.
///
/// This profile is intentionally independent of database drivers: Python still
/// acquires rows and decodes each native scalar before applying cardinality.
/// It has no shared Context charge; callers must establish bounded row counts
/// and a cumulative budget before any public routing could use it.
pub const READ_FRAME_PROFILE: &str = "umf-python-read-frame/0.1.0";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadFrameKind {
    Count,
    One,
    Optional,
    Many,
    Page,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadFrameError {
    CountCardinality,
    ResultArity,
    RequiredRowMissing,
    SingleRowExceeded,
    RowBoundExceeded,
    PageBoundExceeded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReadFrameShapeFault<E> {
    Refusal(ReadFrameError),
    Host(E),
}

/// Ask the host for row widths only in the predecessor's left-to-right order.
/// A host failure stays opaque, and a structural refusal stops later host reads.
pub fn validate_read_frame_shape_with<E>(
    kind: ReadFrameKind,
    output_count: usize,
    row_count: usize,
    mut read_width: impl FnMut(usize) -> Result<usize, E>,
) -> Result<(), ReadFrameShapeFault<E>> {
    if kind == ReadFrameKind::Count {
        if row_count != 1 {
            return Err(ReadFrameShapeFault::Refusal(
                ReadFrameError::CountCardinality,
            ));
        }
        let width = read_width(0).map_err(ReadFrameShapeFault::Host)?;
        if width != 1 {
            return Err(ReadFrameShapeFault::Refusal(
                ReadFrameError::CountCardinality,
            ));
        }
    } else {
        for index in 0..row_count {
            let width = read_width(index).map_err(ReadFrameShapeFault::Host)?;
            if width != output_count {
                return Err(ReadFrameShapeFault::Refusal(ReadFrameError::ResultArity));
            }
        }
    }
    Ok(())
}

/// Preserve the predecessor's post-decode cardinality order.
pub fn validate_read_frame_cardinality(
    kind: ReadFrameKind,
    row_count: usize,
    bound: usize,
) -> Result<(), ReadFrameError> {
    match kind {
        ReadFrameKind::Count => Ok(()),
        ReadFrameKind::One if row_count == 0 => Err(ReadFrameError::RequiredRowMissing),
        ReadFrameKind::One | ReadFrameKind::Optional if row_count > 1 => {
            Err(ReadFrameError::SingleRowExceeded)
        }
        ReadFrameKind::Many if row_count > bound => Err(ReadFrameError::RowBoundExceeded),
        ReadFrameKind::Page if row_count > bound => match bound.checked_add(1) {
            Some(lookahead) if row_count == lookahead => Ok(()),
            _ => Err(ReadFrameError::PageBoundExceeded),
        },
        _ => Ok(()),
    }
}

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
    fn post_host_read_frame_keeps_structural_refusal_order() {
        assert_eq!(
            validate_read_frame_shape_with(ReadFrameKind::Count, 1, 2, |_| Ok::<_, ()>(1)),
            Err(ReadFrameShapeFault::Refusal(
                ReadFrameError::CountCardinality
            ))
        );
        assert_eq!(
            validate_read_frame_shape_with(ReadFrameKind::Many, 2, 2, |index| {
                Ok::<_, ()>(if index == 0 { 2 } else { 1 })
            }),
            Err(ReadFrameShapeFault::Refusal(ReadFrameError::ResultArity))
        );
        assert_eq!(
            validate_read_frame_shape_with(ReadFrameKind::Count, 1, 1, |_| Ok::<_, ()>(1)),
            Ok(())
        );
        assert_eq!(
            validate_read_frame_shape_with(ReadFrameKind::Page, 0, 1, |_| Ok::<_, ()>(0)),
            Ok(())
        );
    }

    #[test]
    fn read_frame_shape_short_circuits_later_host_observations() {
        let mut observed = Vec::new();
        let result = validate_read_frame_shape_with(ReadFrameKind::Many, 2, 3, |index| {
            observed.push(index);
            if index == 2 {
                Err("later host failure")
            } else {
                Ok(if index == 1 { 1 } else { 2 })
            }
        });
        assert_eq!(
            result,
            Err(ReadFrameShapeFault::Refusal(ReadFrameError::ResultArity))
        );
        assert_eq!(observed, [0, 1]);

        let result = validate_read_frame_shape_with(ReadFrameKind::Many, 2, 1, |_| {
            Err::<usize, _>("opaque host failure")
        });
        assert_eq!(
            result,
            Err(ReadFrameShapeFault::Host("opaque host failure"))
        );
    }

    #[test]
    fn post_host_read_frame_preserves_terminal_cardinality_rules() {
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::One, 0, 1),
            Err(ReadFrameError::RequiredRowMissing)
        );
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::Optional, 0, 1),
            Ok(())
        );
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::Optional, 2, 1),
            Err(ReadFrameError::SingleRowExceeded)
        );
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::Many, 2, 1),
            Err(ReadFrameError::RowBoundExceeded)
        );
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::Page, 2, 1),
            Ok(())
        );
        assert_eq!(
            validate_read_frame_cardinality(ReadFrameKind::Page, 3, 1),
            Err(ReadFrameError::PageBoundExceeded)
        );
    }

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
