"""B-TP-005 unit contract; generated commerce acceptance is a separate gate."""
from decimal import Decimal
import unittest

from umf_access.capture import capture
from umf_access.dsl import (
    Column, FieldRef, Param, Predicate, Query, QueryOutsideCatalog, RecordRef, query,
)


class Order:
    pass


ID = FieldRef(module="commerce", element="Order", field="order_id")
AMOUNT = FieldRef(module="commerce", element="Order", field="amount")
RECORD = RecordRef(module="commerce", element="Order", key=(ID,))
amount = Column[Order, Decimal](AMOUNT)
objects = Query[Order, Order, str](RECORD)


class RuntimeGuards(unittest.TestCase):
    # @covers US-082-AC2
    def test_foreign_rhs_column_refuses_even_under_a_valid_root_predicate(self):
        foreign = Column[Order, Decimal](FieldRef(module="commerce", element="Customer", field="credit"))

        @query
        def declaration():
            return objects.filter(amount > foreign).limit(1).all()

        with self.assertRaises((TypeError, ValueError)):
            capture(declaration)

    # @covers US-082-AC5
    def test_schema_constructors_reject_string_column_paths(self):
        with self.assertRaises(TypeError):
            Column[Order, Decimal]("commerce.Order.amount")
        with self.assertRaises(TypeError):
            Query[Order, Order, str]("commerce.Order")

    # @covers US-082-AC5
    def test_decorated_declaration_cannot_run_outside_capture(self):
        @query
        def declaration():
            return objects.limit(1).all()

        with self.assertRaises(QueryOutsideCatalog):
            declaration()

    # @covers US-082-AC5
    def test_field_evaluation_outside_capture_refuses(self):
        with self.assertRaises(QueryOutsideCatalog):
            amount > Decimal("1")

    # @covers US-082-AC5
    def test_query_root_evaluation_outside_capture_refuses(self):
        with self.assertRaises(QueryOutsideCatalog):
            objects.limit(10).all()

    # @covers US-082-AC5
    def test_predicate_boolean_operators_refuse(self):
        for operation in (
            lambda p: bool(p), lambda p: p and p,
            lambda p: p or p, lambda p: not p,
        ):
            @query
            def declaration(minimum: Param[Decimal]):
                operation(amount > minimum)
                return objects.limit(1).all()

            with self.subTest(operation=operation):
                with self.assertRaises(TypeError):
                    capture(declaration)

    # @covers US-082-AC5
    def test_chained_comparison_refuses(self):
        @query
        def declaration(minimum: Param[Decimal], maximum: Param[Decimal]):
            return objects.filter(minimum < amount < maximum).limit(1).all()

        with self.assertRaises(TypeError):
            capture(declaration)

    # @covers US-082-AC5
    def test_columns_unhashable_and_when_absent(self):
        with self.assertRaises(TypeError):
            hash(amount)
        self.assertFalse(hasattr(objects, "when"))
        self.assertFalse(hasattr(objects, "raw"))
        self.assertFalse(hasattr(objects, "sql"))

    # @covers US-082-AC5
    def test_string_column_lookup_and_ordering_refuse(self):
        for operation in (
            lambda: objects.select("amount"),
            lambda: objects.order_by("-amount"),
            lambda: objects.filter(amount__gt=1),
            lambda: objects.filter("amount > 1"),
        ):
            @query
            def declaration():
                return operation()

            with self.subTest(operation=operation):
                with self.assertRaises(TypeError):
                    capture(declaration)

    # @covers US-082-AC1
    def test_where_exact_alias_and_immutable_builders(self):
        self.assertIs(Query.where, Query.filter)

        @query
        def declaration(minimum: Param[Decimal]):
            filtered = objects.filter(amount > minimum)
            self.assertIsNot(filtered, objects)
            bounded = filtered.limit(10)
            self.assertIsNot(bounded, filtered)
            return bounded.all()

        first = capture(declaration)
        self.assertEqual(first, capture(declaration))


class SchemaIdentityAndContinuations(unittest.TestCase):
    # @covers US-082-AC5
    def test_cross_module_field_identity_survives_capture(self):
        reference = FieldRef(module="commerce", element="Order", field="shared_amount", field_module="common")
        column = Column[Order, Decimal](reference)

        @query
        def declaration(minimum: Param[Decimal]):
            return objects.filter(column > minimum).limit(1).all()

        captured = capture(declaration)
        predicate = captured.variants[0].node.args[1][0].args[0]
        self.assertEqual(predicate.args[0].args[0].field_module, "common")
        self.assertEqual(predicate.args[0].args[0].module, "commerce")

    # @covers US-082-AC5
    def test_foreign_record_filter_refuses_even_without_checker(self):
        other = Column[object, str](FieldRef(module="commerce", element="Customer", field="name"))

        @query
        def declaration():
            return objects.filter(other == "a").limit(1).all()

        with self.assertRaises(TypeError):
            capture(declaration)

    # @covers US-082-AC1
    def test_continuation_keeps_key_sort_states_and_target(self):
        from dataclasses import FrozenInstanceError
        from pydantic import MISSING
        from umf_access.dsl import Continuation

        continuation = Continuation(key="o-1", sort_values=(None, MISSING, Decimal("1.20"), "o-1"), identity_digest="target-v1")
        self.assertIs(continuation.sort_values[1], MISSING)
        self.assertEqual(str(continuation.sort_values[2]), "1.20")
        self.assertEqual(continuation.key, "o-1")
        with self.assertRaises(FrozenInstanceError):
            continuation.identity_digest = "other"
        with self.assertRaises(TypeError):
            Continuation(key="o-1", sort_values=([1], "o-1"), identity_digest="target-v1")

    # @covers US-082-AC5
    def test_root_reexports_are_exact_and_guarded(self):
        from umf_access import Column as PublicColumn, query as public_query, Param as PublicParam
        self.assertIs(PublicColumn, Column)
        self.assertIs(public_query, query)
        self.assertIs(PublicParam, Param)


class GeneratedDelegationHooks(unittest.TestCase):
    # @covers US-082-AC1
    def test_projection_uses_explicit_fields_and_immutable_query(self):
        from typing import ClassVar
        from pydantic import BaseModel
        from umf_access.dsl.render import render_logical

        field = FieldRef(module="commerce", element="Order", field="amount-id", logical_name="Amount")
        key = FieldRef(module="commerce", element="Order", field="id", logical_name="ID")
        root = Query[Order, Order, str](RecordRef(module="commerce", element="Order", key=(key,), logical_namespace="sales", logical_name="Orders"))

        class UnitProjection(BaseModel):
            amount: Decimal
            UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (field,)

        @query
        def declaration():
            projected = root._into(UnitProjection)
            self.assertIsNot(projected, root)
            return projected.limit(10).all()

        captured = capture(declaration)
        self.assertEqual(captured.variants[0].node.args[1][0].op, "into")
        projection = captured.variants[0].node.args[1][0].args[0]
        self.assertEqual(projection.name, UnitProjection.__qualname__)
        self.assertEqual(projection.module, UnitProjection.__module__)
        self.assertEqual(render_logical(captured.variants[0]), 'SELECT "r"."Amount" FROM "sales"."Orders" AS "r" LIMIT 10')

    # @covers US-082-AC6
    def test_projection_without_explicit_metadata_refuses(self):
        from pydantic import BaseModel
        from umf_access.capture import CaptureError

        class UnitProjection(BaseModel):
            amount: Decimal

        @query
        def declaration():
            return objects._into(UnitProjection).limit(10).all()

        with self.assertRaises(CaptureError):
            capture(declaration)

    # @covers US-082-AC1
    def test_command_keeps_action_and_explicit_mutable_field_map(self):
        from collections.abc import Mapping
        from dataclasses import dataclass
        from types import MappingProxyType
        from typing import ClassVar
        from umf_access.dsl import command
        from umf_access.dsl.render import render_logical

        id_ref = FieldRef(module="commerce", element="Order", field="order-id", logical_name="OrderID")
        amount_ref = FieldRef(module="commerce", element="Order", field="amount-id", logical_name="Amount")
        memo_ref = FieldRef(module="commerce", element="Order", field="memo-id", logical_name="Memo")
        record = RecordRef(module="commerce", element="Order", key=(id_ref,), logical_namespace="sales", logical_name="Orders")
        unit_amount = Column[Order, Decimal](amount_ref)

        class UnitRoot(Query[Order, Order, str]):
            UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({"python_memo": memo_ref})

        from umf_access.types import ActionRef, ActionSource, ActionProfile, StrictModel

        class UnitActionInput(StrictModel):
            memo: str

        action = ActionRef(module="commerce", action="annotate-orders", input_type=UnitActionInput, output_type=type(None), source=ActionSource("unit", "0.8.0", "commerce", "annotate-orders", "a" * 64, "/modules/0/extensions/umf.actions/actions/0", ActionProfile("umf.actions.tx", "1")))

        @command(action=action)
        def declaration(minimum: Param[Decimal], memo_value: Param[str]):
            return UnitRoot(record).filter(unit_amount > minimum)._update({"python_memo": memo_value})

        captured = capture(declaration)
        self.assertEqual(captured.action, action.source)
        self.assertEqual(captured.action.documentSha256, "a" * 64)
        from dataclasses import replace
        changed = replace(action, source=replace(action.source, documentSha256="b" * 64))
        @command(action=changed)
        def changed_declaration(minimum: Param[Decimal], memo_value: Param[str]):
            return UnitRoot(record).filter(unit_amount > minimum)._update({"python_memo": memo_value})
        self.assertNotEqual(captured.action, capture(changed_declaration).action)
        self.assertEqual(render_logical(captured.variants[0]), 'UPDATE "sales"."Orders" SET "Memo" = :memo_value WHERE "Amount" > :minimum')

    # @covers US-082-AC6
    def test_projection_and_repeated_hydration_do_not_lose_result_shape(self):
        from typing import ClassVar
        from pydantic import BaseModel
        from umf_access.capture import CaptureError
        from umf_access.dsl import Related

        relation = Related[Order, str](FieldRef(module="commerce", element="Order", field="customer"))

        class UnitProjection(BaseModel):
            amount: Decimal
            UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (AMOUNT,)

        for change in (
            lambda q: q.select(amount),
            lambda q: q._into(UnitProjection),
            lambda q: q.include_keys(relation, limit=5),
        ):
            @query
            def declaration():
                return change(objects.include_keys(relation, limit=5)).limit(10).all()

            with self.subTest(change=change), self.assertRaises(CaptureError) as caught:
                capture(declaration)
            self.assertEqual(caught.exception.code, "CAPTURE_UNSUPPORTED")

    # @covers US-082-AC6
    def test_query_cannot_capture_a_write_terminal(self):
        from typing import ClassVar
        from umf_access.capture import CaptureError

        class UnitRoot(Query[Order, Order, str]):
            UMF_UPDATE_FIELDS: ClassVar[dict[str, FieldRef]] = {"amount": AMOUNT}

        @query
        def declaration():
            return UnitRoot(RECORD)._update({"amount": Decimal("2")})

        with self.assertRaises(CaptureError) as caught:
            capture(declaration)
        self.assertEqual(caught.exception.code, "CAPTURE_UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()
