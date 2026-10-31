# SPDX-License-Identifier: MIT OR Apache-2.0
"""One public adapter capability baseline against the built Rust extension."""
import json
import unittest

from umf import adapter_info, execute_adapter
from umf._rust import UmfCoreError


class NativeAdapterBaseline(unittest.TestCase):
    def test_public_openapi_roundtrip_and_native_refusal(self):
        self.assertIn("import", adapter_info("openapi")["operations"])
        source = json.dumps({
            "openapi": "3.1.0", "info": {"title": "Native Python", "version": "1"},
            "paths": {}, "x-preserved": {"future": [], "token": "kept"},
        })
        document = execute_adapter("openapi", "import", source=source,
                                   id="public-python-openapi", format="json")
        exported = execute_adapter("openapi", "export", document=document, format="json")
        self.assertEqual(json.loads(exported), json.loads(source))
        with self.assertRaises(UmfCoreError) as refused:
            execute_adapter("openapi", "import", source="{", id="invalid", format="json")
        self.assertEqual(refused.exception.code, "JSON_SCHEMA_SYNTAX")
        with self.assertRaises(UmfCoreError) as limited:
            execute_adapter("openapi", "import", source=source, id="limited",
                            format="json", max_work=0)
        self.assertEqual(limited.exception.code, "RESOURCE_LIMIT")


if __name__ == "__main__":
    unittest.main()
