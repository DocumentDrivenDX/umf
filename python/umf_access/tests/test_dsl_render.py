# SPDX-License-Identifier: MIT OR Apache-2.0
"""Proposed logical Weft renderer goldens; no compiler/native execution claims.

Base syntax: Weft SQL 0.2 EBNF at 94b2de5e. Extended predicates/order:
UMF WR-A1..A8 grammar delta. Extended-form acceptance remains UNTESTED.
"""

import unittest
from collections.abc import Mapping
from decimal import Decimal
from types import MappingProxyType
from typing import ClassVar

from pydantic import BaseModel
from umf_access.capture import capture
from umf_access.dsl import Column, FieldRef, Param, Query, RecordRef, query
from umf_access.dsl.render import render_logical


class Order:
    pass


class UnitCompositeKey(BaseModel):
    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType(
        {
            "documentId": "unit-fixture",
            "coreVersion": "0.10.0",
            "module": "commerce",
            "element": "Order",
            "key": "unit-composite-key",
        }
    )
    region: str
    identifier: int


ID = FieldRef(
    module="commerce", element="Order", field="order_id", logical_name="order_id"
)
AMOUNT = FieldRef(
    module="commerce", element="Order", field="amount", logical_name="amount"
)
MEMO = FieldRef(module="commerce", element="Order", field="memo", logical_name="memo")
order_id = Column[Order, str](ID)
amount = Column[Order, Decimal](AMOUNT)
memo = Column[Order, str | None](MEMO)
objects = Query[Order, Order, str](
    RecordRef(
        module="commerce",
        element="Order",
        key=(ID,),
        logical_namespace="commerce",
        logical_name="Order",
    )
)
PREFIX = 'SELECT "r"."order_id" FROM "commerce"."Order" AS "r"'


class LogicalWeftRendering(unittest.TestCase):
    # @covers US-082-AC8 -- WR-A11 logical grammar; compiler/native proof separate.
    def test_prefix_preserves_parameter_and_literal_characters(self):
        @query
        def parameter(prefix: Param[str]):
            return objects.filter(memo.starts_with(prefix)).select(order_id).limit(10).all()
        self.assertIn('STARTS_WITH("r"."memo", :prefix)', render_logical(capture(parameter).variants[0]))
        for prefix in ("", "%_\\", "A'B", "é", "e\u0301"):
            @query
            def literal_prefix():
                return objects.filter(order_id.starts_with(prefix)).select(order_id).limit(10).all()  # noqa: B023
            self.assertIn("STARTS_WITH(\"r\".\"order_id\", '" + prefix.replace("'", "''") + "')",
                          render_logical(capture(literal_prefix).variants[0]))
        @query
        def wrong_literal():
            return objects.filter(order_id.starts_with(3)).select(order_id).limit(10).all()
        with self.assertRaises(TypeError):
            capture(wrong_literal)

    # @covers US-082-AC8
    def test_null_safe_distinctness_preserves_owner_operators_and_nulls(self):
        for method, operator in (("is_distinct_from", "IS DISTINCT FROM"),
                                 ("is_not_distinct_from", "IS NOT DISTINCT FROM")):
            @query
            def declaration(value: Param[str | None]):
                return objects.filter(getattr(memo, method)(value)).select(order_id).limit(10).all()  # noqa: B023
            sql = render_logical(capture(declaration).variants[0])
            self.assertIn(f'"r"."memo" {operator} :value', sql)

            @query
            def null_literal():
                return objects.filter(getattr(memo, method)(None)).select(order_id).limit(10).all()  # noqa: B023
            self.assertIn(f'"r"."memo" {operator} NULL', render_logical(capture(null_literal).variants[0]))

    # @covers US-082-AC6
    def test_unbounded_group_count_refuses_but_global_count_is_one_row(self):
        @query
        def unbounded():
            return objects.group_by(order_id).count()
        @query
        def global_count():
            return objects.count()
        @query
        def limited_input():
            return objects.limit(7).group_by(order_id).limit(3).count()
        for declaration in (unbounded, limited_input):
            with self.assertRaisesRegex(ValueError, "CAPTURE_UNSUPPORTED"):
                render_logical(capture(declaration).variants[0])
        self.assertEqual(render_logical(capture(global_count).variants[0]),
                         'SELECT COUNT(*) FROM "commerce"."Order" AS "r"')
        for bound in (0, -1, 1001, True):
            @query
            def bad_bound():
                return objects.group_by(order_id).limit(bound).count()  # noqa: B023 -- Declaration is captured synchronously inside this loop.
            with self.assertRaises(ValueError):
                capture(bad_bound)

    # @covers US-082-AC1
    def test_comparison_operators_render_logical_predicates(self):
        operations = (
            (lambda c, p: c == p, "="),
            (lambda c, p: c != p, "<>"),
            (lambda c, p: c < p, "<"),
            (lambda c, p: c <= p, "<="),
            (lambda c, p: c > p, ">"),
            (lambda c, p: c >= p, ">="),
        )
        for build, operator in operations:

            @query
            def declaration(minimum: Param[Decimal]):
                return (
                    # This refusal callback is invoked synchronously inside this iteration.
                    objects.filter(build(amount, minimum))  # noqa: B023
                    .select(order_id)
                    .limit(10)
                    .all()
                )

            with self.subTest(operator=operator):
                variant = capture(declaration).variants[0]
                self.assertEqual(
                    render_logical(variant),
                    PREFIX + f' WHERE "r"."amount" {operator} :minimum LIMIT 10',
                )

    # @covers US-082-AC1
    def test_null_and_missing_tests_preserved(self):
        for method, expected in (
            ("is_null", "IS NULL"),
            ("is_not_null", "IS NOT NULL"),
            ("is_missing", "IS MISSING"),
            ("is_present", "IS NOT MISSING"),
        ):

            @query
            def declaration():
                # Test chooses a known method, never a column from a string.
                return (
                    # This refusal callback is invoked synchronously inside this iteration.
                    objects.filter(getattr(memo, method)())  # noqa: B023
                    .select(order_id)
                    .limit(10)
                    .all()
                )

            with self.subTest(method=method):
                self.assertEqual(
                    render_logical(capture(declaration).variants[0]),
                    PREFIX + f' WHERE "r"."memo" {expected} LIMIT 10',
                )

    # @covers US-082-AC1
    def test_membership_remains_a_named_list_parameter(self):
        @query
        def declaration(ids: Param[list[str]]):
            return objects.filter(order_id.is_in(ids)).select(order_id).limit(10).all()

        self.assertEqual(
            render_logical(capture(declaration).variants[0]),
            PREFIX + ' WHERE "r"."order_id" IN (:ids) LIMIT 10',
        )

    # @covers US-082-AC1
    def test_explicit_order_and_complete_key_tiebreak(self):
        @query
        def declaration():
            return (
                objects.select(order_id)
                .order_by(amount.desc().nulls_first())
                .limit(10)
                .all()
            )

        self.assertEqual(
            render_logical(capture(declaration).variants[0]),
            PREFIX
            + ' ORDER BY "r"."amount" DESC NULLS FIRST, "r"."order_id" ASC NULLS LAST LIMIT 10',
        )

    # @covers US-082-AC1
    def test_grouped_count_keeps_all_grouping_columns(self):
        @query
        def declaration():
            return objects.group_by(order_id, amount).limit(7).count()

        self.assertEqual(render_logical(capture(declaration).variants[0]), 'SELECT "r"."order_id", "r"."amount", COUNT(*) FROM "commerce"."Order" AS "r" GROUP BY "r"."order_id", "r"."amount" LIMIT 7')

    # @covers US-082-AC1
    def test_range_retains_parameters_and_canonical_whitespace(self):
        @query
        def declaration(lo: Param[Decimal], hi: Param[Decimal]):
            return (
                objects.filter(amount.between(lo, hi)).select(order_id).limit(10).all()
            )

        variant = capture(declaration).variants[0]
        self.assertEqual(
            render_logical(variant),
            PREFIX + ' WHERE "r"."amount" BETWEEN :lo AND :hi LIMIT 10',
        )
        self.assertEqual(render_logical(variant), render_logical(variant))


class AuthoredLogicalNames(unittest.TestCase):
    # @covers US-082-AC1
    def test_authored_names_are_separate_from_ids_and_python_names(self):
        identity = FieldRef(
            module="module-id",
            element="record-id",
            field="field-id",
            field_module="field-module-id",
            logical_name='select"value',
        )
        # Local Python symbol is an explicit override; it is never SQL identity.
        python_name_override = Column[Order, str](identity)
        root = Query[Order, Order, str](
            RecordRef(
                module="module-id",
                element="record-id",
                key=(identity,),
                logical_namespace="sales.v2",
                logical_name='Order"Rows',
            )
        )

        @query
        def declaration(value: Param[str]):
            return (
                root.filter(python_name_override == value)
                .select(python_name_override)
                .limit(10)
                .all()
            )

        variant = capture(declaration).variants[0]
        self.assertEqual(
            render_logical(variant),
            'SELECT "r"."select""value" FROM "sales.v2"."Order""Rows" AS "r" WHERE "r"."select""value" = :value LIMIT 10',
        )
        self.assertEqual(variant.node.args[0].module, "module-id")
        self.assertEqual(variant.node.args[0].key[0].field_module, "field-module-id")

    # @covers US-082-AC6
    def test_missing_logical_record_name_never_falls_back_to_id(self):
        root = Query[Order, Order, str](
            RecordRef(module="commerce", element="Order", key=(ID,))
        )

        @query
        def declaration():
            return root.limit(10).all()

        from umf_access.capture import CaptureError

        with self.assertRaises(CaptureError):
            render_logical(capture(declaration).variants[0])

    # @covers US-082-AC6
    def test_missing_logical_field_name_never_falls_back_to_id(self):
        field = Column[Order, str](
            FieldRef(module="commerce", element="Order", field="id-only")
        )

        @query
        def declaration():
            return objects.select(field).limit(10).all()

        from umf_access.capture import CaptureError

        with self.assertRaises(CaptureError):
            render_logical(capture(declaration).variants[0])


class LogicalFormCoverage(unittest.TestCase):
    # @covers US-082-AC1
    def test_boolean_tree_and_not_in_remain_logical(self):
        @query
        def declaration(ids: Param[list[str]], lo: Param[Decimal], hi: Param[Decimal]):
            return (
                objects.filter(
                    (amount >= lo) & ((amount <= hi) | ~(order_id.not_in(ids)))
                )
                .select(order_id)
                .limit(10)
                .all()
            )

        self.assertEqual(
            render_logical(capture(declaration).variants[0]),
            PREFIX
            + ' WHERE ("r"."amount" >= :lo AND ("r"."amount" <= :hi OR NOT ("r"."order_id" NOT IN (:ids)))) LIMIT 10',
        )

    # @covers US-082-AC1
    def test_absent_optional_omits_whole_top_level_filter(self):
        from pydantic import MISSING
        from umf_access.dsl import if_present

        @query
        def declaration(status: Param[str | None | MISSING]):
            return (
                objects.filter(if_present(status, lambda value: memo == value))
                .select(order_id)
                .limit(10)
                .all()
            )

        absent, present = capture(declaration).variants
        self.assertEqual(render_logical(absent), PREFIX + " LIMIT 10")
        self.assertEqual(
            render_logical(present), PREFIX + ' WHERE "r"."memo" = :status LIMIT 10'
        )

    # @covers US-082-AC1
    def test_literals_keep_decimal_spelling_and_escape_string(self):
        @query
        def declaration():
            return (
                objects.filter(amount == Decimal("1.200"), memo == "x' OR 1=1")
                .select(order_id)
                .limit(10)
                .all()
            )

        text = render_logical(capture(declaration).variants[0])
        self.assertIn('"r"."amount" = 1.200', text)
        self.assertIn("'x'' OR 1=1'", text)

    # @covers US-082-AC1
    def test_page_metadata_retains_cursor_outside_logical_grammar(self):
        @query
        def declaration(after: Param[str | None]):
            return (
                objects.select(order_id)
                .order_by(amount.desc())
                .page(size=20, after=after)
            )

        variant = capture(declaration).variants[0]
        self.assertEqual(variant.node.op, "page")
        self.assertEqual(variant.node.args[3].args, ("after",))
        self.assertEqual(
            render_logical(variant),
            PREFIX
            + ' ORDER BY "r"."amount" DESC NULLS LAST, "r"."order_id" ASC NULLS LAST LIMIT 20',
        )

    # @covers US-082-AC1
    def test_count_exists_first_and_one_are_distinct_terminals(self):
        for terminal, projection, limit in (
            ("count", "COUNT(*)", ""),
            ("exists", '"r"."order_id"', " LIMIT 1"),
            ("first", '"r".*', " LIMIT 1"),
            ("one", '"r".*', " LIMIT 2"),
        ):

            @query
            def declaration():
                # This refusal callback is invoked synchronously inside this iteration.
                return getattr(objects, terminal)()  # noqa: B023

            variant = capture(declaration).variants[0]
            self.assertEqual(variant.node.op, terminal)
            self.assertEqual(
                render_logical(variant),
                f'SELECT {projection} FROM "commerce"."Order" AS "r"{limit}',
            )

    # @covers US-082-AC6
    def test_unbounded_list_refuses_instead_of_truncating(self):
        from umf_access.capture import CaptureError

        @query
        def declaration():
            return objects.all()

        with self.assertRaises(CaptureError):
            render_logical(capture(declaration).variants[0])

    # @covers US-082-AC6
    def test_undeclared_symbolic_parameter_refuses(self):
        from umf_access.capture import CaptureError

        @query
        def declaration():
            return objects.filter(amount > Param[Decimal]("undeclared")).limit(10).all()

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_SIGNATURE")


class KeyAndRelationshipRendering(unittest.TestCase):
    # @covers US-082-AC1
    def test_composite_get_uses_declared_component_order(self):
        region = FieldRef(
            module="commerce", element="Order", field="region-id", logical_name="Region"
        )
        identifier = FieldRef(
            module="commerce", element="Order", field="order-id", logical_name="ID"
        )
        root = Query[Order, Order, UnitCompositeKey](
            RecordRef(
                module="commerce",
                element="Order",
                key=(region, identifier),
                logical_namespace="sales",
                logical_name="Orders",
            )
        )

        @query
        def declaration(key: Param[UnitCompositeKey]):
            return root.get(key)

        captured = capture(declaration)
        self.assertEqual(
            captured.parameters[0].key_components, ("region", "identifier")
        )
        self.assertEqual(
            render_logical(captured.variants[0]),
            'SELECT "r".* FROM "sales"."Orders" AS "r" WHERE "r"."Region" = :key__region AND "r"."ID" = :key__identifier',
        )

    # @covers US-082-AC1
    def test_literal_and_parameter_keys_retain_same_exact_identity(self):
        from commerce import CustomerKey
        from commerce import Order as GeneratedOrder

        @query
        def literal_declaration():
            return GeneratedOrder.objects.filter(
                GeneratedOrder.c.customer.has(CustomerKey(customer_id="x"))
            ).limit(10).all()

        @query
        def parameter_declaration(key: Param[CustomerKey]):
            return GeneratedOrder.objects.filter(GeneratedOrder.c.customer.has(key)).limit(10).all()

        literal_capture = capture(literal_declaration)
        parameter_capture = capture(parameter_declaration)
        literal_key = (
            literal_capture.variants[0].node.args[1][0].args[0].args[1].args[0]
        )
        self.assertEqual(
            literal_key.identity, parameter_capture.parameters[0].key_identity
        )
        self.assertEqual(
            dict(literal_key.identity), dict(CustomerKey.KEY_IDENTITY)
        )

    # @covers US-082-AC6
    def test_same_component_values_do_not_erase_different_key_identity(self):
        from umf_access.capture import CaptureError

        class OtherKey(BaseModel):
            KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType(
                {
                    **dict(UnitCompositeKey.KEY_IDENTITY),
                    "element": "Customer",
                    "key": "other-key",
                }
            )
            region: str
            identifier: int

        @query
        def declaration():
            return objects.get(OtherKey(region="x", identifier=1))

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_SIGNATURE")

        @query
        def symbolic_declaration(key: Param[OtherKey]):
            return objects.get(key)

        with self.assertRaises(CaptureError) as symbolic:
            capture(symbolic_declaration)
        self.assertEqual(symbolic.exception.code, "CAPTURE_SIGNATURE")

    # @covers US-082-AC6
    def test_arbitrary_model_is_not_a_key_carrier(self):
        from umf_access.capture import CaptureError

        class NotAKey(BaseModel):
            region: str
            identifier: int

        @query
        def declaration():
            return objects.get(NotAKey(region="x", identifier=1))

        with self.assertRaises(CaptureError):
            capture(declaration)

    # @covers US-082-AC1
    def test_has_and_include_keys_keep_explicit_relationship(self):
        from umf_access.dsl import Related

        relationship = Related[Order, UnitCompositeKey](
            FieldRef(
                module="commerce",
                element="Order",
                field="related-id",
                logical_name="customer",
            )
        )

        @query
        def declaration(key: Param[UnitCompositeKey]):
            return (
                objects.filter(relationship.has(key))
                .include_keys(relationship, limit=5)
                .limit(10)
                .all()
            )

        from umf_access.dsl import CaptureError
        # This historical handwritten relationship has no source/Key target.
        # The qualified native profile must require regeneration, not infer a
        # same-shaped composite Key from the value presented by its caller.
        with self.assertRaisesRegex(CaptureError, "WR-A6 regenerate"):
            capture(declaration)


    # @covers US-082-AC6
    def test_component_marker_collision_refuses(self):
        from umf_access.capture import CaptureError

        @query
        def declaration(key: Param[UnitCompositeKey], key__region: Param[str]):
            return objects.limit(10).all()

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_SIGNATURE")


if __name__ == "__main__":
    unittest.main()
