# SPDX-License-Identifier: MIT OR Apache-2.0
"""Public versioned bridge for owner-declared stream page-size decisions."""

from . import _rust


def access_stream_page_size_profile_version() -> str:
    return _rust._rust_core.access_stream_page_size_profile_version()


def access_stream_page_size_request_valid(requested: object) -> bool:
    return _rust._rust_core.access_stream_page_size_request_valid(requested)


def access_stream_page_size_missing_domain_valid(requested: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_missing_domain_valid(requested)


def access_stream_page_size_domain_type_valid(exact_dict: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_domain_type_valid(exact_dict)


def access_stream_page_size_domain_keys_valid(matches: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_domain_keys_valid(matches)


def access_stream_page_size_domain_parameter_valid(matches: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_domain_parameter_valid(matches)


def access_stream_page_size_minimum_valid(exact_integer: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_minimum_valid(exact_integer)


def access_stream_page_size_minimum_comparison_valid(matches_minimum: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_minimum_comparison_valid(matches_minimum)


def access_stream_page_size_minimum_exact_value_valid(value: object) -> bool:
    return _rust._rust_core.access_stream_page_size_minimum_exact_value_valid(value)


def access_stream_page_size_maximum_valid(exact_integer: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_maximum_valid(exact_integer)


def access_stream_page_size_maximum_comparison_valid(within_closed_range: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_maximum_comparison_valid(
        within_closed_range
    )


def access_stream_page_size_maximum_exact_value_valid(value: object) -> bool:
    return _rust._rust_core.access_stream_page_size_maximum_exact_value_valid(value)


def access_stream_page_size_row_cap_valid(
    exact_integer: bool, maximum_fits: bool
) -> bool:
    return _rust._rust_core.access_stream_page_size_row_cap_valid(
        exact_integer, maximum_fits
    )


def access_stream_page_size_slot_count_valid(count: int) -> bool:
    return _rust._rust_core.access_stream_page_size_slot_count_valid(count)


def access_stream_page_size_slot_carrier_valid(matches: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_slot_carrier_valid(matches)


def access_stream_page_size_slot_nullability_valid(is_exact_false: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_slot_nullability_valid(
        is_exact_false
    )


def access_stream_page_size_final_maximum_valid(fits: bool) -> bool:
    return _rust._rust_core.access_stream_page_size_final_maximum_valid(fits)
