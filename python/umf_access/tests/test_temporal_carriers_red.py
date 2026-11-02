# SPDX-License-Identifier: MIT OR Apache-2.0
"""CONTRACT-075 carrier corpus. Not a permissive token parser or target codec.

Proposed temporal_token(kind, carrier) ABI requires generator-owner agreement.
Only admitted source tokens are parsed here to construct Python test inputs.
"""

import json
import unittest
from datetime import UTC, date, datetime, timedelta, timezone, tzinfo
from pathlib import Path
from zoneinfo import ZoneInfo

from umf_access.values import (
    temporal_token,
    validate_date,
    validate_instant,
    validate_local,
)

ROOT = Path(__file__).resolve().parents[3]
PROFILE = ROOT / "fixtures/access/golden-vectors/temporal-profile.json"
SAMPLE = (
    ROOT
    / "docs/helix/04-build/evidence/typed-persistence/temporal-profile/python-normalization-sample.json"
)
VALIDATORS = {
    "date": validate_date,
    "instant": validate_instant,
    "local": validate_local,
}


def carrier(kind, token):
    return (
        date.fromisoformat(token) if kind == "date" else datetime.fromisoformat(token)
    )


class DynamicZone(tzinfo):
    def utcoffset(self, value):
        return timedelta(hours=1 if value.month < 7 else 2)

    def dst(self, value):
        return timedelta(0)


class CustomFixedZone(tzinfo):
    def utcoffset(self, value):
        return timedelta(hours=1)

    def dst(self, value):
        return timedelta(0)


class DateSubclass(date):
    pass


class DatetimeSubclass(datetime):
    pass


class TemporalCarrierTests(unittest.TestCase):
    # @covers US-081-AC2
    def test_admitted_profile_canonical_carrier_agreement(self):
        corpus = json.loads(PROFILE.read_text())
        self.assertEqual(corpus["profile"], "umf-access-temporal/0.1.0")
        accepted = [v for v in corpus["cases"] if v["accept"]]
        self.assertGreater(len(accepted), 0)
        for vector in accepted:
            with self.subTest(case=vector["id"]):
                value = carrier(vector["kind"], vector["token"])
                checked = VALIDATORS[vector["kind"]](value)
                self.assertIs(checked, value)
                self.assertEqual(
                    temporal_token(vector["kind"], checked),
                    vector["expected"]["canonicalText"],
                )

    # @covers US-081-AC2
    def test_recorded_python_normalization_sample(self):
        for vector in json.loads(SAMPLE.read_text()):
            with self.subTest(token=vector["token"]):
                value = datetime.fromisoformat(vector["token"])
                if vector["accept"]:
                    self.assertEqual(
                        temporal_token("instant", value), vector["canonicalText"]
                    )
                else:
                    with self.assertRaises(ValueError):
                        temporal_token("instant", value)
                    with self.assertRaises(ValueError):
                        validate_instant(value)

    # @covers US-081-AC2
    def test_second_and_microsecond_fixed_offsets_preserve_exact_instant(self):
        for offset in (
            timedelta(seconds=30),
            timedelta(seconds=-30),
            timedelta(microseconds=1),
            timedelta(microseconds=-1),
            timedelta(hours=23, minutes=59, seconds=59, microseconds=999999),
        ):
            value = datetime(2024, 1, 2, 12, 0, 0, 123456, tzinfo=timezone(offset))
            with self.subTest(offset=offset):
                self.assertIs(validate_instant(value), value)
                utc = value.astimezone(UTC)
                expected = (
                    f"{utc.year:04d}-{utc.month:02d}-{utc.day:02d}T"
                    f"{utc.hour:02d}:{utc.minute:02d}:{utc.second:02d}."
                    f"{utc.microsecond:06d}Z"
                )
                self.assertEqual(temporal_token("instant", value), expected)

    # @covers US-081-AC2
    def test_python_datetime_oracle_across_epoch_and_gregorian_boundaries(self):
        # Python's date/datetime implementation is the independent carrier and
        # normalization oracle; no timestamp float or local timezone is used.
        values = (
            datetime(1, 1, 1, tzinfo=UTC),
            datetime(1600, 2, 29, 23, 59, 59, 999999, tzinfo=UTC),
            datetime(1570, 1, 1, tzinfo=UTC),
            datetime(1569, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
            datetime(1970, 1, 1, tzinfo=UTC),
            datetime(1969, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
            datetime(9999, 12, 31, 23, 59, 59, 999999, tzinfo=UTC),
            datetime(2024, 1, 2, 12, 0, 0, 123456, tzinfo=timezone(timedelta(microseconds=1))),
            datetime(2024, 1, 2, 12, 0, 0, 123456, tzinfo=timezone(timedelta(microseconds=-1))),
        )
        for value in values:
            with self.subTest(value=value.isoformat()):
                try:
                    oracle = value.astimezone(UTC)
                except (OverflowError, ValueError):
                    with self.assertRaises(ValueError):
                        temporal_token("instant", value)
                    continue
                expected = (
                    f"{oracle.year:04d}-{oracle.month:02d}-{oracle.day:02d}T"
                    f"{oracle.hour:02d}:{oracle.minute:02d}:{oracle.second:02d}."
                    f"{oracle.microsecond:06d}Z"
                )
                self.assertEqual(temporal_token("instant", value), expected)

    # @covers US-081-AC2
    def test_year_padding_preepoch_and_utc_overflow(self):
        self.assertEqual(temporal_token("date", date(1, 1, 1)), "0001-01-01")
        self.assertEqual(
            temporal_token("local", datetime(1, 1, 1)), "0001-01-01T00:00:00.000000"
        )
        self.assertEqual(
            temporal_token(
                "instant",
                datetime(1969, 12, 31, 23, 59, 59, 500000, tzinfo=UTC),
            ),
            "1969-12-31T23:59:59.500000Z",
        )
        for value in (
            datetime.min.replace(tzinfo=timezone(timedelta(microseconds=1))),
            datetime.max.replace(tzinfo=timezone(timedelta(microseconds=-1))),
        ):
            with self.assertRaisesRegex(
                ValueError, "instant UTC normalization outside supported years"
            ):
                temporal_token("instant", value)
            with self.assertRaisesRegex(
                ValueError, "instant UTC normalization outside supported years"
            ):
                validate_instant(value)

    # @covers US-081-AC2
    def test_fold_dynamic_zones_and_wrong_carriers_refuse_without_value_leak(self):
        invalid = [
            ("local", datetime(2024, 11, 3, 1, 30, fold=1)),
            ("instant", datetime(2024, 11, 3, 1, 30, fold=1, tzinfo=UTC)),
            ("instant", datetime(2024, 1, 1, tzinfo=DynamicZone())),
            ("instant", datetime(2024, 1, 1, tzinfo=CustomFixedZone())),
            ("instant", DatetimeSubclass(2024, 1, 1, tzinfo=UTC)),
            ("local", DatetimeSubclass(2024, 1, 1)),
            ("date", DateSubclass(2024, 1, 1)),
            ("instant", datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))),
            ("date", datetime(2024, 1, 1)),
            ("local", datetime(2024, 1, 1, tzinfo=UTC)),
            ("instant", datetime(2024, 1, 1)),
        ]
        for kind, value in invalid:
            with (
                self.subTest(kind=kind, type=type(value).__name__),
                self.assertRaises(ValueError),
            ):
                temporal_token(kind, value)
        for check in VALIDATORS.values():
            with self.assertRaises(ValueError) as caught:
                check("private-unadmitted-token")
            self.assertNotIn("private-unadmitted-token", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
