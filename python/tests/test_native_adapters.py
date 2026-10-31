# SPDX-License-Identifier: MIT OR Apache-2.0
"""One public adapter capability baseline against the built Rust extension."""
import json
from pathlib import Path
import unittest

from umf import adapter_info, execute_adapter
from umf._rust import UmfCoreError


class NativeAdapterBaseline(unittest.TestCase):
    def test_public_delta_spark_bundle_and_refusal(self):
        source = '{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}'
        definition = {"profile": "databricks-managed-delta/0.1",
                      "name": ["catalog", "schema", "items"], "clusterBy": [],
                      "partitionBy": [], "properties": {"delta.targetFileSize": "67108864",
                      "delta.parquet.compression.codec": "zstd"}}
        document = execute_adapter("delta-ddl", "defineTable", source=source,
                                   definition=definition, id="python-spark-table")
        target = {"kind": "relation", "relation": ["local_catalog", "local_schema", "items"],
                  "location": "/tmp/items"}
        proposal = execute_adapter("delta-ddl", "realizeSparkDelta4", document=document, target=target)
        self.assertIn("CREATE TABLE `local_catalog`.`local_schema`.`items`", proposal["sql"])
        self.assertIn("LOCATION '/tmp/items'", proposal["sql"])
        self.assertEqual(len(proposal["writerSettings"]), 1)
        self.assertTrue(any(row["outcome"] == "unrealized-performance-hint"
                            for row in proposal["dispositions"]))
        bundle = execute_adapter("delta-ddl", "generateBundle", documents=[document])
        self.assertEqual(len(bundle["tables"]), 1)
        with self.assertRaises(UmfCoreError):
            execute_adapter("delta-ddl", "realizeSparkDelta4", document=document,
                            target={"kind": "delta-path", "path": "https://example.test/items"})


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


    def test_public_delta_source_operations_and_refusal(self):
        source = '{"type":"struct","fields":[{"name":"before","type":"integer","nullable":true,"metadata":{}}]}'
        document = execute_adapter("delta-schema", "import", source=source, id="python-delta")
        edited = execute_adapter("delta-schema", "proposeNodeEdit", document=document,
                                 pointer="/fields/0/name", replacement='"after"')
        self.assertTrue(edited["validation"]["valid"])
        self.assertIn('"after"', execute_adapter("delta-schema", "export", document=edited["document"]))
        self.assertEqual(execute_adapter("delta-schema", "export", document=document), source)
        fixture = Path(__file__).resolve().parents[2] / "fixtures/delta/table-context/partitioned.json"
        table_source = fixture.read_text()
        table = execute_adapter("delta-table", "import", source=table_source, id="python-delta-table")
        table_edited = execute_adapter("delta-table", "proposeNodeEdit", document=table,
                                      pointer="/metaData/description", replacement='"Python table edit"')
        self.assertTrue(table_edited["validation"]["valid"])
        self.assertEqual(json.loads(execute_adapter("delta-table", "export", document=table_edited["document"]))["metaData"]["description"], "Python table edit")
        self.assertEqual(execute_adapter("delta-table", "export", document=table), table_source)
        log_source = '{"commitInfo":{"timestamp":1}}' + chr(10)
        log = execute_adapter("delta-log", "capture", source=log_source, id="python-delta-log")
        self.assertEqual(execute_adapter("delta-log", "export", document=log), log_source)
        with self.assertRaises(UmfCoreError):
            execute_adapter("delta-schema", "import", source="{bad", id="invalid")


    def test_public_delta_definition_ddl_and_refusal(self):
        source = '{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}'
        definition = {"profile": "databricks-managed-delta/0.1",
                      "name": ["catalog", "schema", "items"], "clusterBy": ["id"],
                      "partitionBy": [], "properties": {"delta.targetFileSize": "67108864"}}
        document = execute_adapter("delta-ddl", "defineTable", source=source,
                                   definition=definition, id="python-delta-definition")
        proposal = execute_adapter("delta-ddl", "generate", document=document)
        self.assertEqual(json.loads(proposal["schemaJson"]), json.loads(source))
        self.assertEqual(proposal["definition"], definition)
        self.assertIn("CREATE TABLE `catalog`.`schema`.`items`", proposal["sql"])
        with self.assertRaises(UmfCoreError) as refused:
            execute_adapter("delta-ddl", "defineTable", source=source,
                            definition={**definition, "futureMeaning": "retained"}, id="invalid")
        self.assertEqual(refused.exception.code, "DELTA_DDL_UNSUPPORTED")


if __name__ == "__main__":
    unittest.main()
