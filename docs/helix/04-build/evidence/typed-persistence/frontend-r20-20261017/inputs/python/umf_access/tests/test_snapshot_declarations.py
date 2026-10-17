"""Snapshot declaration metadata; native version authority is separately qualified."""
import json
import unittest
from dataclasses import replace

from test_dsl_render import UnitCompositeKey
from test_dsl_render import objects as rows
from umf_access.capture import capture
from umf_access.dsl import Continuation, Param, query
from umf_access.dsl.render import render_logical
from umf_access.pages import ReadContinuation
from umf_access.reviewed import ReadBuildError, ReviewedSQL
from umf_access.types import StrictModel


class SnapshotDeclarations(unittest.TestCase):
    def test_default_page_ast_is_unchanged_and_snapshot_is_explicit(self):
        @query
        def live(after: Param[UnitCompositeKey | None]):
            return rows.page(size=3, after=after)
        @query
        def frozen(after: Param[UnitCompositeKey | None]):
            return rows.page(size=3, after=after, snapshot=True)
        a, b = capture(live).variants[0], capture(frozen).variants[0]
        self.assertEqual(a.node.args[1], ())
        self.assertEqual(b.node.args[1][0].op, "snapshot")
        self.assertEqual(b.node.args[1][0].args, (True,))
        self.assertEqual(render_logical(a), render_logical(b))

    def test_snapshot_parameter_is_not_a_literal_boolean(self):
        @query
        def invalid(after: Param[UnitCompositeKey | None], enabled: Param[bool]):
            return rows.page(size=3, after=after, snapshot=enabled)
        with self.assertRaisesRegex(TypeError, "literal boolean"):
            capture(invalid)

    def test_both_continuation_layers_validate_exact_immutable_vector(self):
        vector = (("table", "uuid", 3),)
        raw = ReadContinuation((1,), "digest", b"owner", vector)
        typed = Continuation("key", (1,), "digest", b"owner", vector)
        self.assertEqual(raw.snapshot_versions, typed.snapshot_versions)
        for bad in ((("table", "uuid", True),), (("table", "uuid", -1),), (("b", "id", 1), ("a", "id", 2))):
            for original in (raw, typed):
                with self.assertRaises(TypeError):
                    replace(original, snapshot_versions=bad)

    def test_reviewed_request_emits_true_only_and_refuses_other_profiles(self):
        class Empty(StrictModel):
            pass
        class Recorder:
            def __init__(self):
                self.requests = []
            def compile_raw_read_json(self, request):
                self.requests.append(json.loads(request))
                return '{"status":"refused","diagnostics":[]}'
        compiler = Recorder()
        declaration = ReviewedSQL("SELECT 1", Empty, Empty, keyset=True)
        for enabled in (False, True):
            with self.assertRaisesRegex(ReadBuildError, "Weft refused"):
                declaration.build(compiler, target="spark-delta4", binding={}, snapshot=enabled)
        self.assertNotIn("snapshot", compiler.requests[0])
        self.assertIs(compiler.requests[1]["snapshot"], True)
        for target in ("postgresql18", "lakebase18", "unity-catalog"):
            with self.assertRaisesRegex(ReadBuildError, "SNAPSHOT_UNSUPPORTED"):
                declaration.build(compiler, target=target, binding={}, snapshot=True)
        self.assertEqual(len(compiler.requests), 2)
