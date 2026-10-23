# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed runtime codec consumer for the CONTRACT-075 instant profile."""

import unittest
from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import BaseModel, ConfigDict

from umf._rust import _rust_core
from umf_access.codec_support import CodecField, encode_model
from umf_access.types import ValueRuleError
from umf_access.values import temporal_token


class _Consumer(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)
    placed_at: datetime


_FIELDS: tuple[CodecField, ...] = (
    {"python": "placed_at", "field": "placedAt", "kind": "instant", "item": None},
)


class AccessTemporalCodecTests(unittest.TestCase):
    def test_consumer_codec_normalizes_second_and_microsecond_offsets(self):
        value = _Consumer(
            placed_at=datetime(
                2024,
                1,
                1,
                0,
                0,
                0,
                123456,
                tzinfo=timezone(timedelta(seconds=30, microseconds=1)),
            )
        )
        self.assertEqual(
            encode_model(_Consumer, value, _FIELDS)["placedAt"],
            datetime(2023, 12, 31, 23, 59, 30, 123455, tzinfo=UTC),
        )

    def test_consumer_codec_refuses_utc_year_underflow(self):
        value = _Consumer(
            placed_at=datetime(
                1,
                1,
                1,
                tzinfo=timezone(timedelta(microseconds=1)),
            )
        )
        with self.assertRaisesRegex(
            ValueRuleError, "instant UTC normalization outside supported years"
        ) as caught:
            encode_model(_Consumer, value, _FIELDS)
        self.assertNotIn("0001-01-01", str(caught.exception))

    def test_temporal_profile_mismatch_refuses_without_python_fallback(self):
        native = SimpleNamespace(
            access_temporal_canonical_token=lambda *args: "unexpected",
            access_temporal_profile_version=lambda: "umf-access-temporal/other",
        )
        with patch("umf._rust._rust_core", native):
            with self.assertRaisesRegex(ValueRuleError, "required temporal profile"):
                temporal_token("instant", datetime(2024, 1, 1, tzinfo=UTC))

    def test_raw_native_microsecond_bounds_are_exact_and_value_free(self):
        canonicalize = _rust_core.access_temporal_canonical_token
        self.assertEqual(
            canonicalize("instant", 2024, 1, 2, 12, 0, 0, 999_999, 0),
            "2024-01-02T12:00:00.999999Z",
        )
        for microsecond in (1_000_000, 1_234_567, 2**32 - 1):
            with self.subTest(microsecond=microsecond):
                with self.assertRaises(ValueError) as caught:
                    canonicalize("instant", 2024, 1, 2, 12, 0, 0, microsecond, 0)
                self.assertEqual(
                    str(caught.exception), "invalid Gregorian access temporal fields"
                )
                self.assertNotIn(str(microsecond), str(caught.exception))


if __name__ == "__main__":
    unittest.main()
