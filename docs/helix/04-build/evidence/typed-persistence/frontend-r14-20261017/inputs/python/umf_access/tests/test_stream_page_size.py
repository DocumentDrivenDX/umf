"""Only an original owner page-size slot permits stream-size overrides."""

import copy
import unittest
from types import SimpleNamespace

from umf_access.catalog import run_stream
from umf_access.pages import ReadObligationUnmet, stream_page_size


class StreamPageSizeTests(unittest.TestCase):
    def artifact(self):
        return {
            "obligations": {
                "rowCap": 9,
                "streamPageSize": {
                    "parameter": "__umf_page_size",
                    "minimum": 1,
                    "maximum": 9,
                },
            },
            "cursorParameters": [
                {"name": "__umf_page_size", "carrier": "integer", "nullable": False}
            ],
        }

    def test_default_and_narrow_override_preserve_original_artifact(self):
        artifact = self.artifact()
        before = copy.deepcopy(artifact)
        self.assertEqual(stream_page_size(artifact, None), 9)
        self.assertEqual(stream_page_size(artifact, 1), 1)
        self.assertEqual(stream_page_size(artifact, 9), 9)
        self.assertEqual(artifact, before)
        for size in (0, -1, True, 1.5, 1001, 10):
            with self.subTest(size=size), self.assertRaises(ValueError):
                stream_page_size(artifact, size)

    def test_absent_owner_slot_and_forged_domains_refuse(self):
        self.assertIsNone(stream_page_size({}, None))
        with self.assertRaisesRegex(
            ReadObligationUnmet, "STREAM_PAGE_SIZE_UNSUPPORTED"
        ):
            stream_page_size({}, 1)
        for part, value in [
            ("minimum", True),
            ("maximum", 10),
            ("parameter", "different"),
        ]:
            artifact = self.artifact()
            artifact["obligations"]["streamPageSize"][part] = value
            with self.subTest(part=part), self.assertRaises(ReadObligationUnmet):
                stream_page_size(artifact, None)
        artifact = self.artifact()
        artifact["cursorParameters"] *= 2
        with self.assertRaises(ReadObligationUnmet):
            stream_page_size(artifact, None)

    def test_catalog_forwards_override_but_preserves_legacy_default_calls(self):
        calls = []

        class Target:
            def stream(self, *args, **kwargs):
                calls.append(kwargs)
                return iter((1, 2))

        plan = SimpleNamespace(
            terminal="page",
            tuple_fields=(),
            bind=lambda target, args: (
                SimpleNamespace(entry="original"),
                "parameters",
                None,
            ),
        )
        self.assertEqual(list(run_stream(plan, Target(), {}, max_rows=4)), [1, 2])
        self.assertNotIn("page_size", calls[-1])
        self.assertEqual(
            list(run_stream(plan, Target(), {}, max_rows=4, page_size=1)), [1, 2]
        )
        self.assertEqual(calls[-1]["page_size"], 1)
        for size in (0, True, 1001):
            with self.assertRaises(ValueError):
                run_stream(plan, Target(), {}, max_rows=4, page_size=size)
        self.assertEqual(len(calls), 2)
