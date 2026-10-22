# SPDX-License-Identifier: MIT OR Apache-2.0
"""Closed logical aggregate grammar; native qualification is a separate gate."""
import unittest
from decimal import Decimal

from umf_access.capture import capture
from umf_access.dsl import (
    Column,
    FieldRef,
    Query,
    RecordRef,
    avg_,
    count,
    count_distinct,
    query,
    sum_,
)
from umf_access.dsl.render import render_logical


class Row:
    pass

FIELD = FieldRef(module="unit", element="Row", field="n", logical_name="n")
TEXT = FieldRef(module="unit", element="Row", field="text", logical_name="text")
number = Column[Row, int](FIELD)
text = Column[Row, str | None](TEXT)
rows = Query[Row, Row, str](RecordRef(module="unit", element="Row", key=(FIELD,), logical_namespace="unit", logical_name="Row"))

class AggregateRendering(unittest.TestCase):
    def test_huge_integer_bucket_width_refuses_before_decimal_serialization(self):
        @query
        def declaration():
            return rows.select(number.bucket_width(1 << 14000)).limit(1).all()
        with self.assertRaisesRegex(ValueError, "4096-digit resource bound"):
            capture(declaration)

    def test_whole_set_has_exact_owner_grammar_and_no_input_limit(self):
        @query
        def declaration():
            return rows.select(sum_(number), avg_(number, scale=1), count(), count_distinct(text)).all()
        self.assertEqual(render_logical(capture(declaration).variants[0]),
            'SELECT SUM("r"."n"), AVG_SCALE("r"."n", 1), COUNT(*), COUNT(DISTINCT "r"."text") FROM "unit"."Row" AS "r"')

    def test_bucket_groups_have_explicit_result_bound(self):
        @query
        def declaration():
            return rows.group_by(number.bucket_width(Decimal("0.25"))).limit(7).select(number.bucket_width(Decimal("0.25")), sum_(number)).all()
        sql = render_logical(capture(declaration).variants[0])
        self.assertIn('GROUP BY BUCKET_WIDTH("r"."n", 0.25) LIMIT 7', sql)
        @query
        def unbounded():
            return rows.group_by(number).select(number, sum_(number)).all()
        with self.assertRaisesRegex(ValueError, "result-group limit"):
            render_logical(capture(unbounded).variants[0])

    def test_limit_after_group_selection_bounds_results_and_input_limit_refuses(self):
        @query
        def grouped():
            return rows.group_by(number).select(number, sum_(number)).limit(3).all()
        self.assertTrue(render_logical(capture(grouped).variants[0]).endswith('GROUP BY "r"."n" LIMIT 3'))
        @query
        def input_bound():
            return rows.limit(3).group_by(number).limit(2).select(number, sum_(number)).all()
        with self.assertRaisesRegex(ValueError, "input-row limit"):
            render_logical(capture(input_bound).variants[0])

    def test_repeated_grouping_refuses_instead_of_replacing_keys(self):
        @query
        def declaration():
            return rows.group_by(number).select(number, sum_(number)).group_by(number.bucket_width(3)).limit(2).select(number.bucket_width(3), sum_(number)).all()
        with self.assertRaisesRegex(ValueError, "repeated grouping"):
            render_logical(capture(declaration).variants[0])

    def test_integral_decimal_width_keeps_decimal_literal_kind(self):
        @query
        def declaration():
            return rows.select(number.bucket_width(Decimal(3)), number.bucket_width(Decimal("1E+1"))).limit(2).all()
        sql = render_logical(capture(declaration).variants[0])
        self.assertIn('BUCKET_WIDTH("r"."n", 3.0)', sql)
        self.assertIn('BUCKET_WIDTH("r"."n", 10.0)', sql)

    def test_zero_key_count_having_has_no_input_bound(self):
        @query
        def declaration():
            return rows.select(count()).having((count() > 0) & (sum_(number) > 0)).all()
        self.assertIn('HAVING (COUNT(*) > 0 AND SUM("r"."n") > 0)', render_logical(capture(declaration).variants[0]))

    def test_literal_width_and_scale_refuse_invalid_domain(self):
        for width in (0, -1, Decimal("NaN"), Decimal("Infinity"), True):
            @query
            def declaration():
                return rows.select(number.bucket_width(width)).limit(1).all()  # noqa: B023
            with self.assertRaises((TypeError, ValueError)):
                capture(declaration)
        for scale in (-1, 1001, True):
            @query
            def declaration():
                return rows.select(avg_(number, scale=scale)).all()  # noqa: B023
            with self.assertRaises((TypeError, ValueError)):
                capture(declaration)

    def test_term_functions_preserve_bound_query(self):
        from umf_access.dsl import Param
        for method, name in (("matches_all_terms", "MATCHES_ALL_TERMS"), ("matches_any_term", "MATCHES_ANY_TERM")):
            @query
            def declaration(term: Param[str]):
                return rows.filter(getattr(text, method)(term)).select(number).limit(2).all()  # noqa: B023
            self.assertIn(name + '("r"."text", :term)', render_logical(capture(declaration).variants[0]))

class GeneratedAggregateRows(unittest.TestCase):
    def test_real_generated_inputs_do_not_leak_numeric_input_domains(self):
        from commerce import Order
        from umf_access.codec_support import (
            make_scalar_projection_model,
            validate_graph,
        )
        model = make_scalar_projection_model("AggregateResult", (
            ("total", Order, "revision", "sum", None, True),
            ("average", Order, "revision", "avg", 2, True),
            ("amount", Order, "amount", "sum", None, True),
            ("count", Order, "memo", "count_distinct", None, False),
        ))
        row = validate_graph(model, {"total": 2**64, "average": Decimal("0.25"), "amount": Decimal("123456789.00"), "count": 0})
        self.assertEqual(row.total, 2**64)
        self.assertEqual(row.amount, Decimal("123456789.00"))
        for changes in ({"total": Decimal(2)}, {"average": Decimal("0.251")}, {"amount": Decimal("1.001")}, {"count": None}):
            with self.assertRaises(ValueError):
                validate_graph(model, {"total": 2**64, "average": Decimal("0.25"), "amount": Decimal("123456789.00"), "count": 0} | changes)
