"""Generated projection streams preserve WithKeys and the original cleanup."""

import unittest
from types import SimpleNamespace

from commerce import OrderKey
from umf_access.catalog import run_stream
from umf_access.dsl import RelatedKeys, WithKeys
from umf_access.types import CodecError


def plan():
    return SimpleNamespace(
        terminal="page",
        tuple_fields=(),
        related_field="parent_keys",
        related_row_model=OrderKey,
        bind=lambda target, arguments: (SimpleNamespace(entry="original"), {}, None),
    )


def rows():
    keys = RelatedKeys((OrderKey(order_id="a"), OrderKey(order_id="a")), True)
    return [
        SimpleNamespace(order_id="x", parent_keys=keys),
        SimpleNamespace(order_id="y", parent_keys=RelatedKeys((), False)),
    ]


class RelatedProjectionStreamTests(unittest.TestCase):
    def target(self, values, closed):
        class Target:
            def stream(self, *args, **kwargs):
                try:
                    yield from values
                finally:
                    closed.append(True)

        return Target()

    def test_natural_stream_matches_generated_row_and_key_shape(self):
        original, closed = rows(), []
        answer = list(run_stream(plan(), self.target(original, closed), {}, max_rows=4))
        self.assertEqual(
            answer,
            [WithKeys(OrderKey(order_id=row.order_id), row.parent_keys) for row in original],
        )
        self.assertIs(answer[0].keys, original[0].parent_keys)
        self.assertEqual(closed, [True])

    def test_early_close_preserves_original_stream_cleanup(self):
        closed = []
        stream = run_stream(plan(), self.target(rows(), closed), {}, max_rows=4)
        try:
            self.assertIsInstance(next(stream), WithKeys)
        finally:
            stream.close()
        self.assertEqual(closed, [True])

    def test_invalid_projected_row_refuses_and_closes_original_stream(self):
        closed = []
        invalid = SimpleNamespace(order_id=1, parent_keys=RelatedKeys((), False))
        stream = run_stream(plan(), self.target([invalid], closed), {}, max_rows=4)
        try:
            with self.assertRaises(CodecError):
                next(stream)
        finally:
            stream.close()
        self.assertEqual(closed, [True])


class AsyncRelatedProjectionStreamTests(unittest.IsolatedAsyncioTestCase):
    def target(self, values, closed):
        class Target:
            async def stream(self, *args, **kwargs):
                try:
                    for value in values:
                        yield value
                finally:
                    closed.append(True)

        return Target()

    async def test_natural_stream_matches_generated_row_and_key_shape(self):
        original, closed = rows(), []
        answer = [item async for item in run_stream(plan(), self.target(original, closed), {}, max_rows=4)]
        self.assertEqual(
            answer,
            [WithKeys(OrderKey(order_id=row.order_id), row.parent_keys) for row in original],
        )
        self.assertIs(answer[0].keys, original[0].parent_keys)
        self.assertEqual(closed, [True])

    async def test_early_close_preserves_original_stream_cleanup(self):
        closed = []
        stream = run_stream(plan(), self.target(rows(), closed), {}, max_rows=4)
        try:
            self.assertIsInstance(await anext(stream), WithKeys)
        finally:
            await stream.aclose()
        self.assertEqual(closed, [True])

    async def test_invalid_projected_row_refuses_and_closes_original_stream(self):
        closed = []
        invalid = SimpleNamespace(order_id=1, parent_keys=RelatedKeys((), False))
        stream = run_stream(plan(), self.target([invalid], closed), {}, max_rows=4)
        try:
            with self.assertRaises(CodecError):
                await anext(stream)
        finally:
            await stream.aclose()
        self.assertEqual(closed, [True])
