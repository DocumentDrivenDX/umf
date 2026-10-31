# SPDX-License-Identifier: MIT OR Apache-2.0
"""One public adapter capability baseline against the built Rust extension."""
import json
from pathlib import Path
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


    def test_public_rdf_edit_export_and_refusal(self):
        self.assertIn("importGeneralizedDataset", adapter_info("rdf")["operations"])
        source = '<https://example.test/s> <https://example.test/p> "before" .\n'
        document = execute_adapter("rdf", "importNQuads", source=source,
                                   options={"id": "python-rdf"})
        payload = document["modules"][0]["elements"][0]["extensions"]["umf.rdf"]
        diagnostics = execute_adapter("rdf", "inspectPayload",
                                      family="rdf", payload=payload)
        self.assertIn("RDF_CONTEXT", [item["code"] for item in diagnostics])
        self.assertTrue(all(item["severity"] != "error" for item in diagnostics))
        quads = execute_adapter("rdf", "getQuads", document=document)
        self.assertEqual(len(quads), 1)
        replacement = {**quads[0], "object": {
            "kind": "literal", "value": "after",
            "datatype": "http://www.w3.org/2001/XMLSchema#string",
        }}
        proposal = execute_adapter("rdf", "editQuad", document=document,
                                   index=0, replacement=replacement)
        self.assertTrue(proposal["validation"]["valid"])
        self.assertIn('"after"', execute_adapter(
            "rdf", "exportNQuads", document=proposal["document"]))
        self.assertEqual(execute_adapter("rdf", "exportNQuads", document=document), source)
        with self.assertRaises(UmfCoreError) as refused:
            execute_adapter("rdf", "importNQuads", source="invalid nquads",
                            options={"id": "invalid"})
        self.assertEqual(refused.exception.code, "RDF_SYNTAX")


    def test_public_iceberg_table_edit_export_and_refusal(self):
        self.assertIn("editNode", adapter_info("iceberg-table")["operations"])
        fixture = Path(__file__).resolve().parents[2] / "fixtures/iceberg/table/TableMetadataV2ValidMinimal.json.json"
        source = fixture.read_text()
        document = execute_adapter("iceberg-table", "import", source=source,
                                   id="python-iceberg-table")
        proposal = execute_adapter("iceberg-table", "editNode", document=document,
                                   path="/location", replacementJson='"s3://bucket/python-edited"')
        self.assertTrue(proposal["validation"]["valid"])
        exported = execute_adapter("iceberg-table", "export", document=proposal["document"])
        self.assertEqual(json.loads(exported)["location"], "s3://bucket/python-edited")
        self.assertEqual(execute_adapter("iceberg-table", "export", document=document), source)
        with self.assertRaises(UmfCoreError) as refused:
            execute_adapter("iceberg-table", "import", source="{}", id="invalid")
        self.assertEqual(refused.exception.code, "ICEBERG_TABLE_DOCUMENT")


if __name__ == "__main__":
    unittest.main()
