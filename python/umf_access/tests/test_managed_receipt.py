# SPDX-License-Identifier: MIT OR Apache-2.0
"""Receipt ABI and cleanup controls, deliberately no native capability claim."""

import unittest
from contextlib import contextmanager

from umf_access.managed_support import checked_receipt, preserve_body_failure
from umf_access.native_actions import NativeScope
from umf_access.native_program import canonical_json
from umf_access.protocols import ActionRefused, Receipt


class ManagedReceiptControls(unittest.TestCase):
    table = "11111111-1111-1111-1111-111111111111"

    def scope(self):
        return NativeScope(
            canonical_json([self.table]),
            "original-epoch",
            "human",
            "effective",
            object(),
        )

    def receipt(self, versions):
        return Receipt(self.scope().store, "original-epoch", canonical_json(versions))

    def test_original_exact_ordered_vector_retained(self):
        receipt = self.receipt(
            [
                {"tableUuid": self.table, "version": "9"},
                {"tableUuid": self.table, "version": "10"},
            ]
        )
        self.assertIs(checked_receipt(receipt, self.scope()), receipt)

    def test_missing_wrong_noncanonical_or_reordered_receipt_refuses(self):
        for receipt in [
            None,
            Receipt(self.scope().store, "wrong", "[]"),
            Receipt("[]", "original-epoch", "[]"),
            self.receipt([]),
            self.receipt([{"tableUuid": self.table, "version": "01"}]),
            self.receipt([{"tableUuid": self.table, "version": 1}]),
            self.receipt(
                [
                    {"tableUuid": self.table, "version": "2"},
                    {"tableUuid": self.table, "version": "1"},
                ]
            ),
            self.receipt([{"tableUuid": self.table, "version": "1", "inferred": True}]),
            Receipt(
                self.scope().store,
                "original-epoch",
                '[ {"tableUuid":"' + self.table + '","version":"1"} ]',
            ),
        ]:
            with self.subTest(receipt=receipt), self.assertRaises(ActionRefused):
                checked_receipt(receipt, self.scope())

    def test_cleanup_cannot_suppress_original_or_replace_it(self):
        original = ConnectionError("original attempt")
        cleanup = RuntimeError("native cleanup")

        @contextmanager
        def suppressed():
            try:
                yield object()
            except ConnectionError:
                pass

        with (
            self.assertRaises(ConnectionError) as caught,
            preserve_body_failure(suppressed()),
        ):
            raise original
        self.assertIs(caught.exception, original)

        @contextmanager
        def replaced():
            try:
                yield object()
            finally:
                raise cleanup

        with (
            self.assertRaises(ConnectionError) as caught,
            preserve_body_failure(replaced()),
        ):
            raise original
        self.assertIs(caught.exception, original)
        self.assertIs(caught.exception.__cause__, cleanup)
