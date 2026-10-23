# SPDX-License-Identifier: MIT OR Apache-2.0
"""Freeze the Python-to-Rust package and protocol identity."""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import types
import unittest
import importlib.util
import struct
import tracemalloc
from pathlib import Path
from unittest.mock import patch

from umf_codegen import GenerationError
from umf_codegen import _native
from umf_codegen._release import CODEGEN_PROTOCOL_VERSION, RESOURCE_MANIFEST_SHA256


ROOT = Path(__file__).resolve().parents[1]
RESOURCE_DIR = ROOT / "src/umf_codegen/_resources"
RESOURCE_NAMES = {
    "core.schema.json", "core.reference-schema.json", "core.package-schema.json",
    "core.constraints.json", "core.domain-policy.json", "tables.package.json",
    "actions.package.json", "binding.package.json", "stable-binding.package.json",
}


class NativeCodegenContract(unittest.TestCase):
    def test_pinned_manifest_covers_exact_nine_resources(self):
        raw = (RESOURCE_DIR / "manifest.json").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), RESOURCE_MANIFEST_SHA256)
        manifest = json.loads(raw)
        self.assertEqual(manifest["profile"], "umf.codegen-resources/1")
        self.assertEqual(set(manifest["files"]), RESOURCE_NAMES)
        for name, digest in manifest["files"].items():
            self.assertEqual(hashlib.sha256((RESOURCE_DIR / name).read_bytes()).hexdigest(), digest)

    def test_native_protocol_identity_is_pinned(self):
        self.assertEqual(CODEGEN_PROTOCOL_VERSION, "umf-codegen-r3-seven-ops-nine-resources/1")

    def test_wrong_or_missing_native_protocol_refuses(self):
        for protocol in ("umf-codegen-r2", None):
            with self.subTest(protocol=protocol):
                self._verify_native_with(protocol=protocol, expected="ENGINE_UNAVAILABLE")

    def test_wrong_native_package_version_refuses(self):
        with patch.object(_native, "version", return_value="0.10.0"):
            with self.assertRaises(GenerationError) as caught:
                _native._verify_native()
        self.assertEqual(caught.exception.code, "ENGINE_UNAVAILABLE")

    def test_malformed_cli_error_cannot_escape_as_python_type_error(self):
        for raw in (b"{}", b'{"ok":false,"error":null}',
                    b'{"ok":false,"error":{"code":2,"message":"bad"}}',
                    b'{"ok":true,"result":[]}', b"not-json"):
            with self.subTest(raw=raw), self.assertRaises(GenerationError) as caught:
                _native._decode_cli_error(raw)
            self.assertEqual(caught.exception.code, "GENERATION_FAILED")

    def test_wrong_or_missing_cli_capability_refuses(self):
        manifest = json.loads((RESOURCE_DIR / "manifest.json").read_bytes())
        good = {"protocol": "umf.codegen-cli/1", "version": "0.11.0", "profile": "umf.codegen-resources/1",
                "resourceManifest": manifest, "resourceManifestSha256": RESOURCE_MANIFEST_SHA256,
                "inputFormat": "umf.codegen-json-core-admission/1", "outputWireProtocol": "umf.core-wire/1"}
        for field, value in (("protocol", None), ("outputWireProtocol", "stale")):
            bad = dict(good)
            if value is None:
                del bad[field]
            else:
                bad[field] = value
            with self.subTest(field=field), self.assertRaises(GenerationError) as caught:
                _native._check_cli_capabilities(json.dumps(bad).encode(), manifest)
            self.assertEqual(caught.exception.code, "ENGINE_UNAVAILABLE")

    @unittest.skipUnless(os.name == "posix", "bounded selector runner is POSIX-only")
    def test_cli_runner_enforces_deadline_and_output_limit(self):
        deadline = time.monotonic() + 0.05
        with self.assertRaises(GenerationError) as timed_out:
            _native._run_cli(Path(sys.executable), ["-c", "import time; time.sleep(2)"],
                             b"", deadline, 1024)
        self.assertEqual(timed_out.exception.code, "GENERATION_TIMEOUT")
        with self.assertRaises(GenerationError) as oversized:
            _native._run_cli(Path(sys.executable), ["-c", "import sys; sys.stdout.write('x'*100)"],
                             b"", time.monotonic() + 2, 10)
        self.assertEqual(oversized.exception.code, "GENERATION_CAPACITY")

    def test_json_admission_matches_r3_wire_and_preserves_float_tokens(self):
        helper, rust = self._load_rust_codegen()
        samples = [None, True, -0, 0.0, -0.0, 1.25, 2**53 - 1,
                   "\ud800x😀", {"a/~": [1, False, "ok"]}]
        for sample in samples:
            with self.subTest(sample=repr(sample)):
                rust._wire(sample, max_values=sys.maxsize, max_depth=256)
                encoded = helper.encode_codegen_cli_request_json(sample)
                self.assertEqual(json.loads(encoded), sample)
        self.assertEqual(helper.encode_codegen_cli_request_json(-0.0), "-0.0")
        for number in (0.0, -0.0, 5e-324, 1.7976931348623157e308, 1.1):
            decoded = json.loads(helper.encode_codegen_cli_request_json(number))
            self.assertEqual(struct.pack(">d", decoded), struct.pack(">d", number))
        for bad in (2**53, float("nan"), {1: "bad"}, object()):
            with self.subTest(bad=repr(bad)), self.assertRaises(ValueError):
                helper.encode_codegen_cli_request_json(bad)
        too_deep = None
        for _ in range(257):
            too_deep = [too_deep]
        for bad in ({"a/~": [2**53]}, {"a": object()}, too_deep):
            with self.subTest(bad=repr(bad)[:40]):
                with self.assertRaises(ValueError) as wire_error:
                    rust._wire(bad, max_values=sys.maxsize, max_depth=256)
                with self.assertRaises(ValueError) as json_error:
                    helper.encode_codegen_cli_request_json(bad)
                self.assertEqual((json_error.exception.code, json_error.exception.path),
                                 (wire_error.exception.code, wire_error.exception.path))

    def test_request_size_preflight_and_deadline_happen_before_serialization(self):
        helper, _rust = self._load_rust_codegen()
        near_source_limit = helper.encode_codegen_cli_request_json({"text": "a" * (16 * 1024 * 1024)})
        self.assertEqual(len(near_source_limit), 16 * 1024 * 1024 + len('{"text":""}'))
        with self.assertRaisesRegex(ValueError, "32 MiB"):
            helper.encode_codegen_cli_request_json({"x": "a" * (32 * 1024 * 1024)})
        with self.assertRaises(ValueError) as caught:
            helper.encode_codegen_cli_request_json({}, deadline=0)
        self.assertEqual(getattr(caught.exception, "code", None), "DEADLINE")

    def test_deep_long_key_admission_has_bounded_path_memory(self):
        helper, _rust = self._load_rust_codegen()
        key = "k" * 16_000
        value = None
        for _ in range(160):
            value = {key: value}
        tracemalloc.start()
        try:
            tracemalloc.reset_peak()
            encoded = helper.encode_codegen_cli_request_json(value)
            _current, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertGreater(len(encoded), 2_000_000)
        self.assertLess(peak, 64 * 1024 * 1024)

    @staticmethod
    def _load_rust_codegen():
        package = types.ModuleType("umf")
        package.__path__ = [str(ROOT.parent / "src/umf")]
        core = types.ModuleType("umf._rust_core")
        rust_path = ROOT.parent / "src/umf/_rust.py"
        rust_spec = importlib.util.spec_from_file_location("umf._rust", rust_path)
        rust = importlib.util.module_from_spec(rust_spec)
        with patch.dict(sys.modules, {"umf": package, "umf._rust_core": core}):
            rust_spec.loader.exec_module(rust)
            codegen_spec = importlib.util.spec_from_file_location("umf.rust_codegen", ROOT.parent / "src/umf/rust_codegen.py")
            codegen = importlib.util.module_from_spec(codegen_spec)
            sys.modules["umf._rust"] = rust
            codegen_spec.loader.exec_module(codegen)
            sys.modules["umf._rust"] = rust
            return codegen, rust

    def _verify_native_with(self, *, protocol, expected):
        rust_core = types.SimpleNamespace(
            execute_codegen_wire=lambda *_args: "{}",
            engine_version=lambda: "umf-core-r2",
        )
        if protocol is not None:
            rust_core.codegen_protocol_version = lambda: protocol
        rust_module = types.ModuleType("umf._rust")
        rust_module._rust_core = rust_core
        codegen_module = types.ModuleType("umf.rust_codegen")
        codegen_module.UmfCoreError = ValueError
        codegen_module.encode_codegen_cli_request_json = lambda value, **_kwargs: json.dumps(value)
        codegen_module.decode_codegen_cli_response_wire = lambda value, **_kwargs: json.loads(value)
        operation_names = (
            "generate_python_client", "compile_table_deployment", "verify_table_deployment",
            "compile_table_migration", "verify_table_migration",
            "discover_table_migration_changes", "normalize_row_scope",
        )
        codegen_module.CodegenEngine = type("CodegenEngine", (), {
            name: lambda self, *_args: None for name in operation_names
        })
        codegen_module.UmfCodegenError = type("UmfCodegenError", (ValueError,), {})
        with patch.object(_native, "version", return_value="0.11.0"), patch.dict(
            sys.modules,
            {"umf": types.ModuleType("umf"), "umf._rust": rust_module,
             "umf.rust_codegen": codegen_module},
        ):
            with self.assertRaises(GenerationError) as caught:
                _native._verify_native()
        self.assertEqual(caught.exception.code, expected)


if __name__ == "__main__":
    unittest.main()
