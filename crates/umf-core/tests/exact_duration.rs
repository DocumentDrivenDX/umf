// SPDX-License-Identifier: MIT OR Apache-2.0

use umf_core::{
    Value,
    exact_duration::{DurationError, DurationSource, DurationUnit, ExactDuration},
    rfc3339_exact_instant::parse_rfc3339_exact_instant,
};

#[test]
fn duration_value_identity_is_independent_of_source() {
    let spelling = "-PT00H00M01.250000000S";
    let text = ExactDuration::parse(spelling).unwrap();
    let count = ExactDuration::from_count("-1250", DurationUnit::Millisecond).unwrap();
    assert_eq!(text.canonical_nanoseconds(), "-1250000000");
    assert_eq!(text.nanoseconds(), count.nanoseconds());
    assert_eq!(text.source(), &DurationSource::ElapsedText(spelling.into()));
    assert_eq!(
        ExactDuration::parse("-PT0S")
            .unwrap()
            .canonical_nanoseconds(),
        "0"
    );
    assert_eq!(
        ExactDuration::from_count("90", DurationUnit::FixedDay)
            .unwrap()
            .nanoseconds(),
        ExactDuration::parse("PT2160H").unwrap().nanoseconds(),
    );
}

#[test]
fn duration_rejects_calendar_meaning_and_inexact_or_overflowing_values() {
    for token in [
        "P1Y",
        "P1M",
        "P1D",
        "P1W",
        "PT",
        "PT1.5H",
        "PT1.0000000001S",
        "PT1S1M",
        "PT1M2M",
        "PT.S",
        "+PT1S",
        " PT1S",
        "PT1s",
        "PT१S",
    ] {
        assert_eq!(
            ExactDuration::parse(token).unwrap_err(),
            DurationError::Syntax,
            "{token}"
        );
    }
    let min = "-PT170141183460469231731687303715.884105728S";
    assert_eq!(ExactDuration::parse(min).unwrap().nanoseconds(), i128::MIN);
    assert_eq!(
        ExactDuration::parse(&min[1..]).unwrap_err(),
        DurationError::Overflow
    );
    assert_eq!(
        ExactDuration::from_count(&i128::MAX.to_string(), DurationUnit::Second).unwrap_err(),
        DurationError::Overflow,
    );
    assert_eq!(
        ExactDuration::parse(&"0".repeat(129)).unwrap_err(),
        DurationError::Limit
    );
}

#[test]
fn deadlines_cross_epoch_without_losing_anchor_precision() {
    let anchor = |text| parse_rfc3339_exact_instant(&Value::string_utf8(text)).unwrap();
    let start = anchor("1969-12-31T23:59:59.99999999900001Z");
    let equivalent = anchor("1970-01-01T00:59:59.9999999990000100+01:00");
    let nanos = ExactDuration::parse("PT0.000000001S").unwrap();
    let deadline = nanos.deadline(&start).unwrap();
    assert_eq!(deadline, nanos.deadline(&equivalent).unwrap());
    assert_eq!(deadline.utc_seconds(), 0);
    assert_eq!(deadline.fractional_digits(), "00000000000001");
    let before = ExactDuration::parse("-PT0.000000001S")
        .unwrap()
        .deadline(&start)
        .unwrap();
    assert_eq!(before.utc_seconds(), -1);
    assert_eq!(before.fractional_digits(), "99999999800001");
    assert!(before < deadline);
    assert_eq!(
        ExactDuration::from_count(&i128::MAX.to_string(), DurationUnit::Nanosecond)
            .unwrap()
            .deadline(&start)
            .unwrap_err(),
        DurationError::Overflow,
    );
}
