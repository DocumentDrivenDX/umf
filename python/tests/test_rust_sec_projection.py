import unittest

import umf
from umf import rust_sec_projection


class RustSecProjectionTests(unittest.TestCase):
    def test_company_facts_preserve_numeric_lexeme_and_surrogates(self):
        source = '{"cik":320193,"facts":{"us-gaap":{"Cash":{"label":"\ud800","units":{"USD":[{"val":9007199254740993.0100,"accn":"A"}]}}}}}'
        result = umf.project_sec_company_facts(source, "source\ud800")
        self.assertIn("9007199254740993.0100", result)
        self.assertIn("\\ud800", result)
        self.assertEqual(rust_sec_projection.profile_version(), "umf-sec-projection/2.0.0")

    def test_invalid_source_id_preserves_input_and_root_error_precedence(self):
        with self.assertRaises(umf.SecProjectionError) as malformed:
            umf.project_sec_company_facts("{", 3)
        self.assertEqual(malformed.exception.name, "UmfError")
        self.assertNotEqual(malformed.exception.message, "Invalid SEC source identity")
        with self.assertRaisesRegex(umf.SecProjectionError, "Expected SEC object"):
            umf.project_sec_company_facts("[]", 3)
        with self.assertRaisesRegex(umf.SecProjectionError, "Invalid SEC source identity") as caught:
            umf.project_sec_company_facts('{"cik":1,"facts":{}}', 3)
        self.assertEqual(caught.exception.name, "Error")
        self.assertIsNone(caught.exception.code)
        self.assertIsNone(caught.exception.path)

    def test_bad_input_type_and_utf16_length_refuse(self):
        with self.assertRaisesRegex(TypeError, "input must be JSON text"):
            umf.project_sec_submissions(b"{}", "source")
        with self.assertRaises(umf.SecProjectionError) as caught:
            umf.project_sec_company_facts(" " * 4_000_001, "source")
        self.assertEqual(caught.exception.name, "UmfError")
        self.assertEqual(caught.exception.code, "LIMIT")
        self.assertEqual(caught.exception.path, "")


if __name__ == "__main__":
    unittest.main()
