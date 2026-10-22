"""Capture's in-memory boundary: no catalog writer or Weft substitute."""

import unittest

from pydantic import MISSING
from umf_access.capture import CaptureError, capture
from umf_access.dsl import Column, FieldRef, Param, Query, RecordRef, if_present, query


class Order:
    pass


ID = FieldRef(module="commerce", element="Order", field="order_id")
MEMO = FieldRef(module="commerce", element="Order", field="memo")
memo = Column[Order, str | None](MEMO)
objects = Query[Order, Order, str](
    RecordRef(module="commerce", element="Order", key=(ID,))
)


class CaptureRefusals(unittest.TestCase):
    def assert_code(self, function, expected):
        with self.assertRaises(CaptureError) as caught:
            capture(function)
        self.assertEqual(caught.exception.code, expected)

    # @covers US-082-AC6
    def test_non_param_signature_refuses(self):
        @query
        def declaration(status: str):
            return objects.limit(10).all()

        self.assert_code(declaration, "CAPTURE_SIGNATURE")

    # @covers US-082-AC6
    def test_unsupported_carrier_refuses(self):
        @query
        def declaration(value: Param[object]):
            return objects.limit(10).all()

        self.assert_code(declaration, "CAPTURE_SIGNATURE")

    # @covers US-082-AC6
    def test_variadic_signature_refuses(self):
        @query
        def declaration(*statuses: Param[str]):
            return objects.limit(10).all()

        self.assert_code(declaration, "CAPTURE_SIGNATURE")

    # @covers US-082-AC6
    def test_unsupported_result_refuses(self):
        @query
        def declaration():
            return {"sql": "SELECT * FROM Order"}

        self.assert_code(declaration, "CAPTURE_UNSUPPORTED")

    # @covers US-082-AC6
    def test_mutable_state_change_between_captures_refuses(self):
        state = {"limit": 0}

        @query
        def declaration():
            state["limit"] += 1
            return objects.limit(state["limit"]).all()

        self.assert_code(declaration, "CAPTURE_NONDETERMINISTIC")

    # @covers US-082-AC6
    def test_five_optional_filters_refuse(self):
        @query
        def declaration(
            a: Param[str | MISSING],
            b: Param[str | MISSING],
            c: Param[str | MISSING],
            d: Param[str | MISSING],
            e: Param[str | MISSING],
        ):
            return (
                objects.filter(
                    if_present(a, lambda v: memo == v),
                    if_present(b, lambda v: memo == v),
                    if_present(c, lambda v: memo == v),
                    if_present(d, lambda v: memo == v),
                    if_present(e, lambda v: memo == v),
                )
                .limit(10)
                .all()
            )

        self.assert_code(declaration, "VARIANT_LIMIT")

    # @covers US-082-AC1
    def test_repeated_optional_parameter_counts_once(self):
        @query
        def declaration(a: Param[str | MISSING]):
            return (
                objects.filter(
                    if_present(a, lambda v: memo == v),
                    if_present(a, lambda v: memo != v),
                )
                .limit(10)
                .all()
            )

        captured = capture(declaration)
        self.assertEqual(len(captured.variants), 2)
        self.assertEqual({v.presence for v in captured.variants}, {(), ("a",)})

    # @covers US-082-AC1
    def test_null_is_value_not_absence(self):
        @query
        def declaration(a: Param[str | None]):
            return objects.filter(memo == a).limit(10).all()

        self.assertEqual(len(capture(declaration).variants), 1)

    # @covers US-082-AC6
    def test_optional_filter_requires_missing_in_declared_parameter(self):
        @query
        def declaration(a: Param[str | None]):
            return (
                objects.filter(if_present(a, lambda value: memo == value))
                .limit(10)
                .all()
            )

        self.assert_code(declaration, "CAPTURE_SIGNATURE")

    # @covers US-082-AC1
    def test_nullable_optional_filter_has_two_presence_variants(self):
        @query
        def declaration(a: Param[str | None | MISSING]):
            return (
                objects.filter(if_present(a, lambda value: memo == value))
                .limit(10)
                .all()
            )

        captured = capture(declaration)
        self.assertEqual({v.presence for v in captured.variants}, {(), ("a",)})

    # @covers US-082-AC6
    def test_capture_context_resets_after_failure(self):
        from umf_access.dsl import QueryOutsideCatalog

        @query
        def declaration():
            raise RuntimeError("developer failure")

        with self.assertRaises(RuntimeError):
            capture(declaration)
        with self.assertRaises(QueryOutsideCatalog):
            objects.limit(10).all()


class PresenceBounds(unittest.TestCase):
    # @covers US-082-AC6
    def test_four_optional_filters_produce_exactly_sixteen_variants(self):
        @query
        def declaration(
            a: Param[str | MISSING],
            b: Param[str | MISSING],
            c: Param[str | MISSING],
            d: Param[str | MISSING],
        ):
            return (
                objects.filter(
                    if_present(a, lambda p: memo == p),
                    if_present(b, lambda p: memo == p),
                    if_present(c, lambda p: memo == p),
                    if_present(d, lambda p: memo == p),
                )
                .limit(10)
                .all()
            )

        captured = capture(declaration)
        self.assertEqual(len(captured.variants), 16)
        self.assertEqual(len({variant.presence for variant in captured.variants}), 16)

    # @covers US-082-AC6
    def test_nested_optional_boolean_composition_refuses(self):
        for combine in (
            lambda p: p | (memo == "x"),
            lambda p: p & (memo == "x"),
            lambda p: ~p,
        ):

            @query
            def declaration(a: Param[str | MISSING]):
                return (
                    # This refusal callback is invoked synchronously inside this iteration.
                    objects.filter(combine(if_present(a, lambda p: memo == p)))  # noqa: B023
                    .limit(10)
                    .all()
                )

            with self.subTest(combine=combine):
                with self.assertRaises(CaptureError) as caught:
                    capture(declaration)
                self.assertEqual(caught.exception.code, "CAPTURE_UNSUPPORTED")

    # @covers US-082-AC6
    def test_more_than_64_parameters_refuses_before_body(self):
        @query
        def declaration(
            p0: Param[str],
            p1: Param[str],
            p2: Param[str],
            p3: Param[str],
            p4: Param[str],
            p5: Param[str],
            p6: Param[str],
            p7: Param[str],
            p8: Param[str],
            p9: Param[str],
            p10: Param[str],
            p11: Param[str],
            p12: Param[str],
            p13: Param[str],
            p14: Param[str],
            p15: Param[str],
            p16: Param[str],
            p17: Param[str],
            p18: Param[str],
            p19: Param[str],
            p20: Param[str],
            p21: Param[str],
            p22: Param[str],
            p23: Param[str],
            p24: Param[str],
            p25: Param[str],
            p26: Param[str],
            p27: Param[str],
            p28: Param[str],
            p29: Param[str],
            p30: Param[str],
            p31: Param[str],
            p32: Param[str],
            p33: Param[str],
            p34: Param[str],
            p35: Param[str],
            p36: Param[str],
            p37: Param[str],
            p38: Param[str],
            p39: Param[str],
            p40: Param[str],
            p41: Param[str],
            p42: Param[str],
            p43: Param[str],
            p44: Param[str],
            p45: Param[str],
            p46: Param[str],
            p47: Param[str],
            p48: Param[str],
            p49: Param[str],
            p50: Param[str],
            p51: Param[str],
            p52: Param[str],
            p53: Param[str],
            p54: Param[str],
            p55: Param[str],
            p56: Param[str],
            p57: Param[str],
            p58: Param[str],
            p59: Param[str],
            p60: Param[str],
            p61: Param[str],
            p62: Param[str],
            p63: Param[str],
            p64: Param[str],
        ):
            self.fail("signature must refuse before body")

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_SIGNATURE")


class TemporalProfileCapture(unittest.TestCase):
    # @covers US-082-AC6
    def test_instant_local_column_comparison_refuses(self):
        from datetime import datetime

        instant = Column[Order, datetime](
            FieldRef(
                module="commerce", element="Order", field="instant", temporal="instant"
            )
        )
        local = Column[Order, datetime](
            FieldRef(
                module="commerce", element="Order", field="local", temporal="local"
            )
        )

        @query
        def declaration():
            return objects.filter(instant == local).limit(10).all()

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_UNSUPPORTED")

    # @covers US-082-AC6
    def test_parameter_cannot_span_instant_and_local_profiles(self):
        from datetime import datetime

        instant = Column[Order, datetime](
            FieldRef(
                module="commerce", element="Order", field="instant", temporal="instant"
            )
        )
        local = Column[Order, datetime](
            FieldRef(
                module="commerce", element="Order", field="local", temporal="local"
            )
        )

        @query
        def declaration(value: Param[datetime]):
            return objects.filter(instant == value, local == value).limit(10).all()

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()


class GeneratedClientTypeVarExports(unittest.TestCase):
    def test_executor_typevars_remain_importable(self):
        from umf_access.protocols import ExecutorT, ReplayingExecutorT
        self.assertEqual(ExecutorT.__name__, "ExecutorT")
        self.assertEqual(ReplayingExecutorT.__name__, "ReplayingExecutorT")
