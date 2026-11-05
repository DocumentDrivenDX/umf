"""Independent encoding-only controls; no Rust/runtime schema acceptance claim.

All writes and CLI calls use TemporaryDirectory fixtures. Canonical inputs are
read only; the default-path CLI is exercised using an exact private recipe copy.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import re
import runpy
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[2]
RECIPE = ROOT / "tools/generate_schema_metas_utf16.py"
SOURCE = ROOT / "crates/umf-core/src/schema_metas.json"
MODULE = ROOT / "crates/umf-core/src/schema_metas_utf16.rs"
API = runpy.run_path(str(RECIPE))


def independent_units(text: str) -> tuple[int, ...]:
    """Scalar arithmetic oracle: no UTF-16 byte codec or endian reinterpretation."""
    out = []
    for char in text:
        point = ord(char)
        if point <= 0xFFFF:
            out.append(point)
        else:
            point -= 0x10000
            out.extend((0xD800 + (point >> 10), 0xDC00 + (point & 0x3FF)))
    return tuple(out)


def rendered_units(raw: bytes) -> tuple[int, ...]:
    text = raw.decode("ascii")
    match = re.search(r"pub\(super\) static SCHEMA_METAS_UTF16: &\[u16\] = &\[(.*?)\];\n\Z", text, re.S)
    if match is None:
        raise AssertionError("exact typed u16 static, no runtime cast/expression")
    body = match.group(1)
    if re.sub(r"0x[0-9a-f]{4},|\s+", "", body):
        raise AssertionError("typed data must contain only numeric u16 literals")
    return tuple(int(unit, 16) for unit in re.findall(r"0x([0-9a-f]{4}),", body))


def cli(source: Path, output: Path, check: bool = False) -> subprocess.CompletedProcess:
    args = [sys.executable, "-B", str(RECIPE), "--source", str(source), "--output", str(output)]
    if check:
        args.append("--check")
    return subprocess.run(args, capture_output=True, check=False)


def snapshot(directory: Path) -> dict:
    return {str(p.relative_to(directory)): (p.read_bytes(), p.stat().st_mtime_ns)
            for p in directory.rglob("*") if p.is_file()}


class SchemaMetasUtf16EncodingTests(unittest.TestCase):
    def test_literal_ascii_bmp_and_nonbmp_units(self):
        vectors = [
            (b"", ()),
            (b"A\x00z", (0x0041, 0x0000, 0x007A)),
            (b"\xc3\xa9\xce\xa9\xe4\xb8\xad", (0x00E9, 0x03A9, 0x4E2D)),
            (b"\xf0\x9f\x98\x80\xf0\x90\x80\x80", (0xD83D, 0xDE00, 0xD800, 0xDC00)),
        ]
        for raw, expected in vectors:
            with self.subTest(raw=raw):
                self.assertEqual(API["source_units"](raw), expected)
                self.assertEqual(rendered_units(API["render"](raw)), expected)
                self.assertEqual(independent_units(raw.decode("utf-8")), expected)

    def test_bom_crlf_whitespace_escapes_and_invalid_json_are_literal_text(self):
        vectors = [
            (b"\xef\xbb\xbf \r\n\t", (0xFEFF, 0x20, 0x0D, 0x0A, 0x09)),
            (b'"\\uD800"', (0x22, 0x5C, 0x75, 0x44, 0x38, 0x30, 0x30, 0x22)),
            (b'{} trailing\n', (0x7B, 0x7D, 0x20, 0x74, 0x72, 0x61, 0x69, 0x6C, 0x69, 0x6E, 0x67, 0x0A)),
            (b'{"x":NaN,', (0x7B, 0x22, 0x78, 0x22, 0x3A, 0x4E, 0x61, 0x4E, 0x2C)),
        ]
        for raw, expected in vectors:
            with self.subTest(raw=raw):
                self.assertEqual(API["source_units"](raw), expected)
                self.assertEqual(rendered_units(API["render"](raw)), expected)

    def test_deterministic_render_has_complete_numeric_units_and_custody_only_header(self):
        raw = b'\xef\xbb\xbf["\xc3\xa9", "\xf0\x9f\x98\x80", "\\uD800"]\r\n !'
        first = API["render"](raw)
        self.assertEqual(first, API["render"](raw))
        self.assertEqual(rendered_units(first), independent_units(raw.decode("utf-8")))
        self.assertIn(sha256(raw).hexdigest().encode("ascii"), first)
        self.assertIn(b"establishes no JSON/schema acceptance", first)
        self.assertIn(f"Original UTF-8 bytes: {len(raw)}; UTF-16 units: {len(independent_units(raw.decode('utf-8')))}.".encode(), first)

    def test_invalid_utf8_helpers_and_cli_refuse_without_touching_output(self):
        for raw in [b"\xff", b"\xc0\xaf", b"\xe2\x82", b"\xed\xa0\x80", b"\xf4\x90\x80\x80"]:
            with self.subTest(raw=raw), TemporaryDirectory() as tmp:
                for helper in ["source_units", "render"]:
                    with self.assertRaises(UnicodeDecodeError):
                        API[helper](raw)
                folder = Path(tmp)
                source, output = folder / "source", folder / "output"
                source.write_bytes(raw)
                output.write_bytes(b"retain prior bytes")
                before = snapshot(folder)
                for check in [False, True]:
                    result = cli(source, output, check)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertIn(b"source encoding refused:", result.stderr)
                    self.assertEqual(result.stdout, b"")
                    self.assertEqual(snapshot(folder), before)

    def test_cli_explicit_and_default_paths_generate_only_private_fixture(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            recipe = folder / "tools/generate_schema_metas_utf16.py"
            recipe.parent.mkdir()
            recipe.write_bytes(RECIPE.read_bytes())
            source = folder / "crates/umf-core/src/schema_metas.json"
            source.parent.mkdir(parents=True)
            source.write_bytes(b"\xef\xbb\xbfnot JSON\r\n")
            output = source.with_name("schema_metas_utf16.rs")
            result = subprocess.run([sys.executable, "-B", str(recipe)], capture_output=True, check=False, cwd=folder)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(output.read_bytes(), API["render"](source.read_bytes()))
            custom_source, custom_output = folder / "custom", folder / "custom-u16"
            custom_source.write_bytes(b'"\xf0\x9f\x98\x80" trailing')
            default_before = snapshot(source.parent)
            result = cli(custom_source, custom_output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(rendered_units(custom_output.read_bytes()), (0x22, 0xD83D, 0xDE00, 0x22, 0x20, 0x74, 0x72, 0x61, 0x69, 0x6C, 0x69, 0x6E, 0x67))
            self.assertEqual(snapshot(source.parent), default_before)

    def test_check_is_readonly_for_missing_stale_and_exact_output(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source, output = folder / "source", folder / "output"
            source.write_bytes(b'{"a":1}\r\n')
            for state in ["missing", "stale", "exact"]:
                if state == "stale":
                    output.write_bytes(b"retained stale file")
                elif state == "exact":
                    output.write_bytes(API["render"](source.read_bytes()))
                before = snapshot(folder)
                result = cli(source, output, True)
                self.assertEqual(result.returncode, 0 if state == "exact" else 1, result.stderr)
                self.assertEqual(snapshot(folder), before)
                self.assertIn((b"verified exact" if state == "exact" else state.encode()), result.stdout if state == "exact" else result.stderr)

    def test_canonical_source_and_actual_generated_module_match_every_numeric_unit(self):
        raw, generated = SOURCE.read_bytes(), MODULE.read_bytes()
        self.assertEqual(generated, API["render"](raw))
        units = rendered_units(generated)
        self.assertEqual(units, independent_units(raw.decode("utf-8")))
        # Reconstitute code points arithmetically, not by a native-endian cast.
        points, i = [], 0
        while i < len(units):
            unit = units[i]
            if 0xD800 <= unit <= 0xDBFF:
                self.assertLess(i + 1, len(units))
                low = units[i + 1]
                self.assertTrue(0xDC00 <= low <= 0xDFFF)
                points.append(chr(0x10000 + ((unit - 0xD800) << 10) + low - 0xDC00))
                i += 2
            else:
                self.assertFalse(0xDC00 <= unit <= 0xDFFF)
                points.append(chr(unit))
                i += 1
        self.assertEqual("".join(points).encode("utf-8"), raw)

    def test_source_or_typed_unit_mutation_cannot_pass_via_unchanged_digest(self):
        with TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source, output = folder / "source", folder / "output"
            raw = b'{"x":1}\r\n'
            source.write_bytes(raw)
            original = API["render"](raw)
            # Leave the correct original custody digest in place; corrupt data.
            damaged = original.replace(b"0x007b,", b"0x007d,", 1)
            self.assertNotEqual(damaged, original)
            self.assertIn(sha256(raw).hexdigest().encode(), damaged)
            output.write_bytes(damaged)
            before = snapshot(folder)
            self.assertEqual(cli(source, output, True).returncode, 1)
            self.assertEqual(snapshot(folder), before)
            output.write_bytes(original)
            for changed in [b' {"x":1}\r\n', b'{"x":1}\n', b'{"x":1}\r\n!', b'\xef\xbb\xbf'+raw]:
                source.write_bytes(changed)
                before = snapshot(folder)
                self.assertEqual(cli(source, output, True).returncode, 1)
                self.assertEqual(snapshot(folder), before)


if __name__ == "__main__":
    unittest.main()
