# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated search projections retain their owner and terminal opt-in."""

import unittest

from search_docs import Doc, DocSummary
from search_docs.fields import DocSummaryProjection
from umf_access.capture import capture
from umf_access.dsl import CaptureError, Param, query


class RankedProjectionTests(unittest.TestCase):
    def test_generated_model_and_existing_wrapper_capture_same_projection(self):
        @query
        def model(text: Param[str]):
            return Doc.objects.search(Doc.s.text.matches(text)).into(DocSummary).top(3)

        @query
        def wrapper(text: Param[str]):
            return (
                Doc.objects.search(Doc.s.text.matches(text))
                .into(DocSummaryProjection)
                .top(3)
            )

        self.assertEqual(
            capture(model).variants[0].node, capture(wrapper).variants[0].node
        )

    def test_select_then_model_and_terminal_partial_opt_in(self):
        @query
        def model(text: Param[str]):
            return (
                Doc.objects.search(Doc.s.text.matches(text))
                .select(Doc.c.id)
                .into(DocSummary)
                .top(3, allow_partial=True)
            )

        node = capture(model).variants[0].node
        self.assertIs(node.args[-1], True)
        self.assertEqual(node.args[1][-1].op, "into")

    def test_foreign_model_refuses_at_capture(self):
        from commerce import OrderSummary

        @query
        def invalid(text: Param[str]):
            return (
                Doc.objects.search(Doc.s.text.matches(text)).into(OrderSummary).top(3)
            )

        with self.assertRaises(CaptureError):
            capture(invalid)

    def test_wrong_partial_type_refuses_at_capture(self):
        @query
        def invalid(text: Param[str]):
            return Doc.objects.search(Doc.s.text.matches(text)).top(3, allow_partial=1)

        with self.assertRaises(CaptureError):
            capture(invalid)

    def test_presearch_selection_and_projection_keep_generated_model_surface(self):
        @query
        def selected(text: Param[str]):
            return Doc.objects.select(Doc.c.id).search(Doc.s.text.matches(text)).into(DocSummary).top(3)
        @query
        def projected(text: Param[str]):
            return Doc.objects.into(DocSummary).search(Doc.s.text.matches(text)).into(DocSummary).top(3)
        for declaration in (selected, projected):
            node = capture(declaration).variants[0].node
            self.assertEqual(node.op, "search_top")
            self.assertEqual(node.args[1][-1].op, "into")
            self.assertEqual(node.args[1][-1].args[0].name, "DocSummary")
