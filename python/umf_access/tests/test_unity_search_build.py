"""Build bridge custody controls; native compiler replay is a separate gate."""

import copy
import json
import unittest
from unittest.mock import patch

from umf_access.build.unity_search import compile_unity_search
from umf_access.dsl import FieldRef, Fusion, Node, RecordRef, SearchLeg
from umf_access.native_program import NativeProgram


class Compiled:
    def __init__(self, vector, keyword):
        self.value = {"index": vector, "keywordIndex": keyword}

    def checked(self):
        return self.value


class UnitySearchBuildTests(unittest.TestCase):
    def build(self, name, *, tamper=False, filters=()):
        vector = {"kind": "vector", "vector": {"computedBy": "host"}}
        keyword = {"kind": "keyword", "keyword": {"analyzer": "implementation-defined"}}
        source = {"documentId": "fixture", "documentSha256": "a" * 64,
                  "module": "m", "pointer": "/original"}
        captured = copy.deepcopy(keyword)
        if tamper:
            captured["keyword"]["analyzer"] = "substituted"
        field = FieldRef("m", "Record", "id")
        record = RecordRef("m", "Record", (field,))
        legs = tuple(SearchLeg(record, kind, json.dumps({"source": source, "declaration": index}),
                               Node("param", (name,)))
                     for kind, index in (("text-vector", vector), ("keyword", captured)))
        requests = []

        def compile_original(compiler, request, **kwargs):
            requests.append(request)
            return Compiled(vector, keyword)

        with patch.object(NativeProgram, "build", side_effect=compile_original):
            result = compile_unity_search(
                object(), legs=legs, fusion=Fusion("target-defined"),
                target={"binding": {"modelSha256": "a" * 64,
                                    "modelJson": '{"umf":"0.9.0"}'}, "unitySearch": {}},
                selection_sql="original selection", native_parameters=list(filters),
                fields=(field,), names=("id",), top=3, allow_partial=True,
                bundle_digest="b" * 64,
            )
        return result, requests[0]

    def test_shared_filter_and_hybrid_text_argument_retains_both(self):
        result, request = self.build("q", filters=({"name": "q", "carrier": "string"},))
        self.assertEqual(result[3], (("__umf_search_text", "q"),))
        self.assertEqual(request["selection"]["parameters"][0]["name"], "q")
        self.assertEqual(request["source"]["coreVersion"], "0.9.0")

    def test_original_reserved_spelling_cannot_self_alias(self):
        result, request = self.build("__umf_search_text")
        self.assertEqual(result[3], (("__umf_search_text_", "__umf_search_text"),))
        self.assertNotEqual(request["queryParameter"], request["textQueryParameter"])

    def test_captured_keyword_semantics_cannot_be_silently_replaced(self):
        with self.assertRaisesRegex(ValueError, "captured keyword index metadata differs"):
            self.build("q", tamper=True)


if __name__ == "__main__":
    unittest.main()
