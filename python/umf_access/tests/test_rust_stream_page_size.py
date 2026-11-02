# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed-wheel behavior checks for the bounded stream-size owner rules."""

from __future__ import annotations

import unittest
from collections.abc import Mapping

from umf_access.pages import ReadObligationUnmet, stream_page_size


def valid_artifact(maximum: int = 25, row_cap: int = 40) -> dict[str, object]:
    return {
        "obligations": {
            "streamPageSize": {
                "parameter": "__umf_page_size",
                "minimum": 1,
                "maximum": maximum,
            },
            "rowCap": row_cap,
        },
        "cursorParameters": [
            {
                "name": "__umf_page_size",
                "carrier": "integer",
                "nullable": False,
            }
        ],
    }


class IntSubclass(int):
    pass


class ReadMarker(Exception):
    pass


class TraceMapping(Mapping[str, object]):
    def __init__(self, values: dict[str, object], trace: list[tuple[str, str]]) -> None:
        self.values = values
        self.trace = trace

    def __getitem__(self, key: str) -> object:
        self.trace.append(("getitem", key))
        return self.values[key]

    def __iter__(self):
        return iter(self.values)

    def __len__(self) -> int:
        return len(self.values)

    def get(self, key: str, default: object = None) -> object:
        self.trace.append(("get", key))
        return self.values.get(key, default)


class ThrowingMapping(Mapping[str, object]):
    def __init__(self, marker: BaseException) -> None:
        self.marker = marker

    def __getitem__(self, key: str) -> object:
        raise self.marker

    def __iter__(self):
        return iter(())

    def __len__(self) -> int:
        return 0

    def get(self, key: str, default: object = None) -> object:
        raise self.marker


class EqualityFailure:
    def __init__(self, trace: list[str], marker: BaseException) -> None:
        self.trace = trace
        self.marker = marker

    def __ne__(self, other: object) -> bool:
        self.trace.append("ne")
        raise self.marker


class ExactDomain(dict[str, object]):
    pass


class ExactList(list[object]):
    pass


class HostileKey(str):
    __hash__ = str.__hash__

    def __new__(
        cls,
        value: str,
        marker: BaseException,
        *,
        raise_at: int | None = None,
        mutate_at: int | None = None,
        mutation: tuple[dict[str, object], str, object] | None = None,
    ):
        instance = super().__new__(cls, value)
        instance.calls = 0
        instance.marker = marker
        instance.raise_at = raise_at
        instance.mutate_at = mutate_at
        instance.mutation = mutation
        return instance

    def __eq__(self, other: object) -> bool:
        self.calls += 1
        if self.calls == self.raise_at:
            raise self.marker
        if self.calls == self.mutate_at and self.mutation is not None:
            mapping, key, value = self.mutation
            mapping[key] = value
        return str.__eq__(self, other)


class StatefulTruth:
    def __init__(
        self,
        trace: list[str],
        marker: BaseException,
        *,
        raise_at: int | None = None,
    ) -> None:
        self.trace = trace
        self.marker = marker
        self.raise_at = raise_at
        self.calls = 0

    def __bool__(self) -> bool:
        self.calls += 1
        self.trace.append("bool")
        if self.calls == self.raise_at:
            raise self.marker
        return self.calls > 1


class ComparisonResultMaximum:
    def __init__(self, result: StatefulTruth) -> None:
        self.result = result

    def __ge__(self, other: object) -> StatefulTruth:
        return self.result

    def __le__(self, other: object) -> bool:
        return True


class StreamPageSizeInstalledTests(unittest.TestCase):
    def assert_read_obligation(self, artifact: object, requested: object = None) -> None:
        with self.assertRaises(ReadObligationUnmet):
            stream_page_size(artifact, requested)  # type: ignore[arg-type]

    def test_request_carrier_range_and_short_circuit(self) -> None:
        class Unread(Mapping[str, object]):
            def __init__(self) -> None:
                self.reads = 0

            def __getitem__(self, key: str) -> object:
                raise AssertionError("mapping must remain unread")

            def __iter__(self):
                return iter(())

            def __len__(self) -> int:
                return 0

            def get(self, key: str, default: object = None) -> object:
                self.reads += 1
                raise AssertionError("mapping must remain unread")

        for requested in (True, IntSubclass(2), 0, 1001, 10**5000):
            artifact = Unread()
            with self.subTest(requested=type(requested).__name__):
                with self.assertRaisesRegex(
                    ValueError, "page_size must be an integer from 1 through 1000"
                ):
                    stream_page_size(artifact, requested)  # type: ignore[arg-type]
                self.assertEqual(artifact.reads, 0)
        self.assertEqual(stream_page_size(valid_artifact(), 1), 1)

    def test_mapping_get_trace_and_exception_identity(self) -> None:
        trace: list[tuple[str, str]] = []
        valid = valid_artifact()
        obligations = TraceMapping(valid["obligations"], trace)  # type: ignore[arg-type]
        artifact = TraceMapping(
            {"obligations": obligations, "cursorParameters": valid["cursorParameters"]},
            trace,
        )
        self.assertEqual(stream_page_size(artifact, None), 25)
        self.assertEqual(
            trace,
            [
                ("get", "obligations"),
                ("get", "streamPageSize"),
                ("get", "rowCap"),
                ("getitem", "rowCap"),
                ("get", "cursorParameters"),
            ],
        )

        marker = ReadMarker("preserve original exception")
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(ThrowingMapping(marker), None)  # type: ignore[arg-type]
        self.assertIs(raised.exception, marker)

    def test_domain_and_slot_exactness_and_cardinality(self) -> None:
        artifact = valid_artifact()
        artifact["obligations"]["streamPageSize"] = ExactDomain(
            artifact["obligations"]["streamPageSize"]
        )  # type: ignore[index,arg-type]
        self.assert_read_obligation(artifact)

        artifact = valid_artifact()
        artifact["cursorParameters"] = ExactList(artifact["cursorParameters"])  # type: ignore[arg-type]
        self.assert_read_obligation(artifact)

        duplicate_slot = dict(valid_artifact()["cursorParameters"][0])  # type: ignore[index]
        for parameters in (
            [],
            [*valid_artifact()["cursorParameters"], duplicate_slot],
        ):
            artifact = valid_artifact()
            artifact["cursorParameters"] = parameters
            self.assert_read_obligation(artifact)

        for nullable in (True, None, 0):
            artifact = valid_artifact()
            artifact["cursorParameters"][0]["nullable"] = nullable  # type: ignore[index]
            self.assert_read_obligation(artifact)

        artifact = valid_artifact()
        del artifact["cursorParameters"][0]["nullable"]  # type: ignore[index]
        self.assertEqual(stream_page_size(artifact, None), 25)

    def test_owner_domain_bounds(self) -> None:
        for maximum, row_cap in ((0, 40), (1001, 1001), (25, 24), (25, True)):
            with self.subTest(maximum=maximum, row_cap=row_cap):
                self.assert_read_obligation(valid_artifact(maximum, row_cap))
        for minimum in (True, IntSubclass(1), 0, 2):
            artifact = valid_artifact()
            artifact["obligations"]["streamPageSize"]["minimum"] = minimum  # type: ignore[index]
            self.assert_read_obligation(artifact)

    def test_custom_equality_exception_identity_and_order(self) -> None:
        marker = ReadMarker("same callback error")
        trace: list[str] = []
        artifact = valid_artifact()
        artifact["obligations"]["streamPageSize"]["parameter"] = EqualityFailure(  # type: ignore[index]
            trace, marker
        )
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)
        self.assertEqual(trace, ["ne"])

        marker = ReadMarker("slot comparison error")
        trace = []
        artifact = valid_artifact()
        artifact["cursorParameters"][0]["carrier"] = EqualityFailure(  # type: ignore[index]
            trace, marker
        )
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)
        self.assertEqual(trace, ["ne"])

    def test_callback_mutation_keeps_later_owner_field_reads_live(self) -> None:
        artifact = valid_artifact()
        obligations = artifact["obligations"]

        class MutatingObligations(dict[str, object]):
            def get(self, key: str, default: object = None) -> object:
                value = super().get(key, default)
                if key == "rowCap":
                    obligations["streamPageSize"]["maximum"] = 0  # type: ignore[index]
                return value

        artifact["obligations"] = MutatingObligations(obligations)
        self.assertEqual(stream_page_size(artifact, None), 0)

    def test_hostile_minimum_key_preserves_third_lookup_exception_and_mutation(self) -> None:
        marker = ReadMarker("minimum third lookup")
        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["minimum"]  # type: ignore[index]
        key = HostileKey("minimum", marker, raise_at=3)
        domain[key] = 1  # type: ignore[index]
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)

        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["minimum"]  # type: ignore[index]
        key = HostileKey(
            "minimum",
            marker,
            mutate_at=3,
            mutation=(domain, "minimum", 0),  # type: ignore[arg-type]
        )
        domain[key] = 1  # type: ignore[index]
        self.assert_read_obligation(artifact)

        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["minimum"]  # type: ignore[index]
        key = HostileKey("minimum", marker, raise_at=3)
        domain[key] = True  # type: ignore[index]
        self.assert_read_obligation(artifact)
        self.assertEqual(key.calls, 2)

        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["minimum"]  # type: ignore[index]
        key = HostileKey(
            "minimum",
            marker,
            mutate_at=3,
            mutation=(domain, "minimum", 1.0),  # type: ignore[arg-type]
        )
        domain[key] = 1  # type: ignore[index]
        self.assertEqual(stream_page_size(artifact, None), 25)

    def test_hostile_maximum_key_preserves_range_lookup_exception(self) -> None:
        marker = ReadMarker("maximum range lookup")
        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        key = HostileKey("maximum", marker, raise_at=3)
        domain[key] = 25  # type: ignore[index]
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)

        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        key = HostileKey("maximum", marker, raise_at=3)
        domain[key] = True  # type: ignore[index]
        self.assert_read_obligation(artifact)
        self.assertEqual(key.calls, 2)

        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        key = HostileKey(
            "maximum",
            marker,
            mutate_at=3,
            mutation=(domain, "maximum", 25.0),  # type: ignore[arg-type]
        )
        domain[key] = 25  # type: ignore[index]
        self.assertEqual(stream_page_size(artifact, None), 25.0)

    def test_hostile_default_maximum_key_preserves_final_lookup_exception(self) -> None:
        marker = ReadMarker("final default maximum lookup")
        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        key = HostileKey("maximum", marker, raise_at=6)
        domain[key] = 25  # type: ignore[index]
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)

    def test_maximum_comparison_truth_is_converted_once_and_preserves_exception(self) -> None:
        marker = ReadMarker("second truth conversion")
        trace: list[str] = []
        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        result = StatefulTruth(trace, marker, raise_at=2)
        maximum = ComparisonResultMaximum(result)
        key = HostileKey(
            "maximum",
            marker,
            mutate_at=3,
            mutation=(domain, "maximum", maximum),  # type: ignore[arg-type]
        )
        domain[key] = 25  # type: ignore[index]
        self.assert_read_obligation(artifact)
        self.assertEqual(trace, ["bool"])

        marker = ReadMarker("first truth conversion")
        trace = []
        artifact = valid_artifact()
        domain = artifact["obligations"]["streamPageSize"]  # type: ignore[index]
        del domain["maximum"]  # type: ignore[index]
        result = StatefulTruth(trace, marker, raise_at=1)
        maximum = ComparisonResultMaximum(result)
        key = HostileKey(
            "maximum",
            marker,
            mutate_at=3,
            mutation=(domain, "maximum", maximum),  # type: ignore[arg-type]
        )
        domain[key] = 25  # type: ignore[index]
        with self.assertRaises(ReadMarker) as raised:
            stream_page_size(artifact, None)
        self.assertIs(raised.exception, marker)
        self.assertEqual(trace, ["bool"])

    def test_independent_exhaustive_integer_oracle(self) -> None:
        """Compare installed behavior to the contract's finite integer model."""
        maximum = 37
        for requested in range(-2, 1003):
            expected_valid = 1 <= requested <= 1000
            expected_fits_owner = expected_valid and requested <= maximum
            with self.subTest(requested=requested):
                if not expected_valid:
                    with self.assertRaisesRegex(
                        ValueError, "page_size must be an integer from 1 through 1000"
                    ):
                        stream_page_size(valid_artifact(maximum), requested)
                elif not expected_fits_owner:
                    with self.assertRaisesRegex(
                        ValueError, "page_size exceeds the original compiled maximum"
                    ):
                        stream_page_size(valid_artifact(maximum), requested)
                else:
                    self.assertEqual(
                        stream_page_size(valid_artifact(maximum), requested), requested
                    )

    def test_unrequested_default_matches_every_compiled_maximum(self) -> None:
        for maximum in range(1, 1001):
            with self.subTest(maximum=maximum):
                self.assertEqual(stream_page_size(valid_artifact(maximum, 1000), None), maximum)


if __name__ == "__main__":
    unittest.main()
