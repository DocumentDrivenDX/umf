"""Original-owner strict search packets; native qualification is separate."""
import json
import time
import unittest
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import weft
from umf_access.postgres_read import _RESOLUTION, ReadObligationUnmet
from umf_access.postgres_search import _program
from umf_access.targets import PostgresConfiguration, binding_digest


class SearchResolutionOrderTests(unittest.TestCase):
    def compiled(self):
        root = Path(__file__).resolve().parents[3]
        request = json.loads((root / "fixtures/access/native-catalog-fence/source-6d7c463/ranked-request.json").read_text())
        request["selection"]["binding"]["schemaBinding"] = "search-path"
        request["selection"]["binding"]["schema"] = None
        program = json.loads(weft.compile_search_json(json.dumps(request)))
        self.assertEqual(program["status"], "compiled", program)
        class Entry:
            def artifact(self): return program
        config = PostgresConfiguration("native_app", binding_digest(program["binding"]), (180006,), timedelta(seconds=5))
        gen = _program(SimpleNamespace(entries=(Entry(),)), {}, config, {}, time.monotonic()+5,
                       verify_only=True, target_profile="postgresql18", database="postgres")
        return gen, program

    def test_original_strict_locks_precede_caller_resolution_and_protected_path(self):
        gen, program = self.compiled()
        prefix = []
        for step in gen:
            prefix.append(step)
            if step[0] == "execute": break
        self.assertEqual(prefix[0], ("begin",))
        self.assertEqual(prefix[1], ("catalog-fence", program["obligations"]["nativeCatalogFence"]["lockSql"]))
        self.assertEqual(prefix[2:], [*(('snapshot-free', sql) for sql in dict.fromkeys(program["selectionTemplate"]["lockSql"])),
                                     ("execute", _RESOLUTION, (["docs"], False, "native_app"))])
        self.assertNotIn("SET LOCAL search_path", str(prefix))
        gen.close()

    def test_wrong_schema_and_temp_shadow_refuse_before_protected_path(self):
        for schema in ("foreign_app", "pg_temp_3"):
            gen, _ = self.compiled()
            for step in gen:
                if step[0] == "execute": break
            self.assertEqual(next(gen), ("many", 2))
            rows = [("postgres", "123", ["pg_catalog", schema, "native_app"], "docs", schema, 1234, "reader", "reader", 5)]
            with self.assertRaises(ReadObligationUnmet): gen.send(rows)

    def test_correct_caller_context_is_observed_before_protected_path(self):
        gen, _ = self.compiled()
        for step in gen:
            if step[0] == "execute": break
        self.assertEqual(next(gen), ("many", 2))
        rows = [("postgres", "123", ["pg_catalog", "native_app"], "docs", "native_app", 1234, "reader", "reader", 5)]
        step = gen.send(rows)
        self.assertEqual(step[0], "execute")
        self.assertIn("set_config('search_path'", step[1])
        gen.close()
