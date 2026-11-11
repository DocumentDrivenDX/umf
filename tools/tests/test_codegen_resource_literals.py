"""Independent literal-DATA correspondence. Pure Python; never imports native UMF."""
from __future__ import annotations
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import unittest
from unittest import mock

REPO = Path(os.environ.get("UMF_LITERAL_TEST_REPO", Path(__file__).resolve().parents[2]))
GENERATOR_SHA = "23b788c916e8a57ca102bb714b17edd87e3749062f4beddc656953afdc67dbb9"
DATA_SHA = "586c67c832f86ae27b2dc5d83c9d7e73c8aa9f4437b2e7fe296e367737599e76"
# Full GEN1 run 43060243401, original artifact 13873332393. The DATA digest
# joins output-receipt.json to stages/C.oracle.json. The ordered raw roster
# digest is over that oracle's roots, as compact JSON with sorted object keys.
CANDIDATE_01011_DATA_SHA = "0280b6a6d602eac87c069e8fadf9484dbaad4089e78bfc4f5bf4b560117c92a6"
CANDIDATE_01011_RAW_ROSTER_SHA = "2887fd91b27095973966c483b18b3f705d0c34cd7791b24f58329f3e6ead89c8"
INPUTS = (
    ("coreSchema", "spec/core/schema.json"),
    ("referenceSchema", "spec/core/semantic-type-reference.schema.json"),
    ("packageSchema", "spec/core/extension-package.schema.json"),
    ("constraints", "spec/metamodel/generated/core-constraints.json"),
    ("domainPolicy", "spec/metamodel/generated/domain-policy.json"),
    ("tablesPackage", "spec/extensions/tables/package.json"),
    ("actionsPackage", "spec/extensions/actions/package.json"),
    ("bindingPackage", "spec/extensions/binding/package.json"),
    ("stableBindingPackage", "spec/extensions/binding-stable/package.json"),
)
HEADER = "\n".join((
    "// SPDX-License-Identifier: MIT OR Apache-2.0",
    "// Generated literal DATA only. Runtime admission is mandatory.",
    "// Producer: tools/generate_codegen_resource_literals.py",
    "use super::{Literal, Member, SourceLiteral};",
    "#[rustfmt::skip]",
    "pub(super) static SOURCES: &[SourceLiteral] = &[",
))
TOKEN = re.compile(r'\s*(::|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|"(?:\\.|[^"\\])*"|[&\[\]{}(),:;])')

class DataReader:
    """Closed DATA grammar, deliberately no eval, Rust execution or proof fields."""
    def __init__(self, text, dictionary=()):
        self.dictionary = tuple(tuple(entry) for entry in dictionary)
        if any(type(unit) is not int or not 0 <= unit <= 65535
               for entry in self.dictionary for unit in entry):
            raise ValueError("not u16 dictionary DATA")
        self.used_ids = []
        self.tokens = []
        at = 0
        while at < len(text):
            match = TOKEN.match(text, at)
            if match is None:
                if text[at:].strip():
                    raise ValueError("outside literal DATA grammar")
                break
            self.tokens.append(match[1])
            at = match.end()
        self.at = 0

    def peek(self):
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def take(self, expected=None):
        got = self.peek()
        if got is None or (expected is not None and got != expected):
            raise ValueError(f"expected {expected!r}, got {got!r}")
        self.at += 1
        return got

    def number(self):
        token = self.take()
        if not token.isdecimal():
            raise ValueError("unsigned decimal DATA only")
        return int(token)

    def boolean(self):
        token = self.take()
        if token not in ("true", "false"):
            raise ValueError("boolean DATA only")
        return token == "true"

    def string(self):
        token = self.take()
        if not token.startswith('"'):
            raise ValueError("quoted string required")
        return json.loads(token)

    def array(self, element):
        self.take("&"); self.take("[")
        values = []
        while self.peek() != "]":
            values.append(element())
            if self.peek() != "]": self.take(",")
        self.take("]")
        return tuple(values)

    def unit(self):
        value = self.number()
        if not 0 <= value <= 65535: raise ValueError("not u16 DATA")
        return value

    def text_id(self):
        ordinal = self.number()
        if ordinal >= len(self.dictionary):
            raise ValueError("text ID outside dictionary DATA")
        self.used_ids.append(ordinal)
        return self.dictionary[ordinal]

    def member(self):
        self.take("Member"); self.take("{"); self.take("key"); self.take(":")
        key = self.text_id()
        self.take(","); self.take("value"); self.take(":")
        value = self.literal()
        self.take("}")
        return key, value

    def literal(self):
        self.take("Literal"); self.take("::"); kind = self.take()
        if kind == "Null": return ("null",)
        if kind in ("Bool", "Text", "Array", "Object"):
            self.take("(")
            if kind == "Bool": result = ("bool", self.boolean())
            elif kind == "Text": result = ("text", self.text_id())
            elif kind == "Array": result = ("array", self.array(self.literal))
            else: result = ("object", self.array(self.member))
            self.take(")")
            return result
        self.take("{")
        if kind == "Integer":
            self.take("negative"); self.take(":"); negative = self.boolean()
            self.take(","); self.take("magnitude"); self.take(":"); magnitude = self.number()
            if magnitude > 2**64-1: raise ValueError("outside DATA u64")
            result = ("integer", negative, magnitude)
        elif kind == "Binary64":
            self.take("bits"); self.take(":"); bits = self.number()
            if bits > 2**64-1: raise ValueError("outside binary64 bits")
            result = ("binary64", bits)
        else:
            raise ValueError("no acceptance/descriptor/other tag in DATA")
        self.take("}")
        return result

    def finish(self):
        if self.peek() is not None: raise ValueError("unconsumed DATA")


def decode_literal(text, dictionary=()):
    reader = DataReader(text, dictionary)
    result = reader.literal(); reader.finish()
    return result


def decode_module(text):
    # Exact declarations are transport grammar only, never acceptance flags.
    preamble = "\n".join(HEADER.splitlines()[:4]) + "\n"
    dictionary_decl = "#[rustfmt::skip]\npub(super) static TEXTS: &[&[u16]] = "
    sources_decl = "#[rustfmt::skip]\npub(super) static SOURCES: &[SourceLiteral] = &["
    if not text.startswith(preamble + dictionary_decl):
        raise ValueError("unexpected generated dictionary preamble")
    dictionary_text, marker, source_text = text[len(preamble):].partition(sources_decl)
    if not marker: raise ValueError("missing source DATA declaration")
    pool = DataReader(dictionary_text[len(dictionary_decl):])
    dictionary = pool.array(lambda: pool.array(pool.unit))
    pool.take(";"); pool.finish()
    if len(set(dictionary)) != len(dictionary):
        raise ValueError("dictionary must contain distinct exact UTF16 sequences")
    reader = DataReader(source_text, dictionary); rows = []
    while reader.peek() != "]":
        reader.take("SourceLiteral"); reader.take("{")
        row = {}
        for field, parse in (("name", reader.string), ("path", reader.string),
                             ("bytes", reader.number), ("sha256", reader.string),
                             ("value", reader.literal)):
            reader.take(field); reader.take(":"); row[field] = parse()
            if field != "value": reader.take(",")
        reader.take("}"); reader.take(","); rows.append(row)
    reader.take("]"); reader.take(";"); reader.finish()
    seen = set(); first_ids = []
    for ordinal in reader.used_ids:
        if ordinal not in seen:
            seen.add(ordinal); first_ids.append(ordinal)
    if first_ids != list(range(len(dictionary))):
        raise ValueError("dictionary IDs must be complete first-use ordered DATA")
    return rows, dictionary


def decode_sources(text):
    return decode_module(text)[0]


class Pairs(list): pass
class Numeric:
    def __init__(self, category, token): self.category, self.token = category, token

def oracle(raw):
    """Independent ordered raw parser; does NOT call generator parser/units/render."""
    def convert(value):
        if value is None: return ("null",)
        if type(value) is bool: return ("bool", value)
        if isinstance(value, Numeric):
            if value.category == "integer":
                number = int(value.token)
                return ("integer", number < 0, abs(number))
            return ("binary64", struct.unpack(">Q", struct.pack(">d", float(value.token)))[0])
        if type(value) is str:
            raw_units = value.encode("utf-16-le", "surrogatepass")
            return ("text", struct.unpack("<" + "H"*(len(raw_units)//2), raw_units))
        if type(value) is Pairs:
            return ("object", tuple((convert(k)[1], convert(v)) for k,v in value))
        if type(value) is list: return ("array", tuple(map(convert, value)))
        raise AssertionError(type(value))
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=Pairs,
                       parse_int=lambda s: Numeric("integer",s),
                       parse_float=lambda s: Numeric("binary64",s))
    return convert(value)


class CodegenLiteralCorrespondenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        generator = REPO / "tools/generate_codegen_resource_literals.py"
        data = REPO / "crates/umf-core/src/canonical_codegen_literals.rs"
        if hashlib.sha256(generator.read_bytes()).hexdigest() != GENERATOR_SHA:
            raise AssertionError("v2 generator changed: review/rebind required")
        release = json.loads((REPO / "spec/release.json").read_bytes())
        cls.candidate_01011 = release["rustVersion"] == "0.10.11"
        expected_data = CANDIDATE_01011_DATA_SHA if cls.candidate_01011 else DATA_SHA
        if hashlib.sha256(data.read_bytes()).hexdigest() != expected_data:
            raise AssertionError("v2 DATA changed: review/rebind required")
        spec = importlib.util.spec_from_file_location("actual_codegen_literal_generator_v2", generator)
        cls.gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(cls.gen)
        cls.data_text = data.read_text()
        cls.rows, cls.dictionary = decode_module(cls.data_text)

    def rendered(self, raw):
        dictionary = self.gen.TextDictionary()
        rendered = self.gen.render_literal(self.gen.parse_source(raw), dictionary=dictionary)
        return decode_literal(rendered, dictionary.entries)

    @contextlib.contextmanager
    def fixture_cohort(self):
        with tempfile.TemporaryDirectory(prefix="umf-literal-pure-") as directory:
            root = Path(directory)
            for _, relative in INPUTS:
                target = root / relative; target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b'{"unknown":{"keep":0},"order":[1,2]}\n')
            with mock.patch.object(self.gen,"ROOT",root), mock.patch.object(self.gen,"OUTPUT",root/"data.rs"):
                yield root

    def check_cli(self):
        with mock.patch.object(sys,"argv",["generator","--check"]), contextlib.redirect_stderr(io.StringIO()):
            return self.gen.main()

    def test_all_nine_raw_values_order_metadata_and_unknown_content_correspond(self):
        if not self.candidate_01011:
            pins_path = REPO / "tests/qualification/fixtures/inspector-installed-current-resources.json"
            self.assertEqual(hashlib.sha256(pins_path.read_bytes()).hexdigest(),"251c5e64ede46b686e4b207a020e8da4e78aca7aed236f8e6ce25d193edd2363")
            pins = json.loads(pins_path.read_bytes())["resources"]
        self.assertEqual(self.gen.INPUTS,INPUTS)
        self.assertEqual([(r["name"],r["path"]) for r in self.rows],list(INPUTS))
        total=0
        raw_roster = []
        for row, (name,relative) in zip(self.rows,INPUTS):
            raw=(REPO/relative).read_bytes();total+=len(raw)
            raw_sha = hashlib.sha256(raw).hexdigest()
            if self.candidate_01011:
                raw_roster.append({"role": name, "path": relative, "bytes": len(raw), "sha256": raw_sha})
            else:
                self.assertEqual(pins[name]["path"],relative)
                self.assertEqual(raw_sha,pins[name]["sha256"])
            self.assertEqual(row["sha256"],raw_sha)
            self.assertEqual(row["bytes"],len(raw))
            self.assertEqual(row["value"],oracle(raw),name)
        if self.candidate_01011:
            canonical_roster = json.dumps(raw_roster, sort_keys=True, separators=(",", ":")).encode()
            self.assertEqual(hashlib.sha256(canonical_roster).hexdigest(), CANDIDATE_01011_RAW_ROSTER_SHA)
        self.assertEqual(total,394103)
        # Independent RAW parser traversal, keys before children, across all9.
        expected_pool = []; seen = set()
        def remember(units):
            if units not in seen:
                seen.add(units); expected_pool.append(units)
        def visit(value):
            if value[0] == "text": remember(value[1])
            elif value[0] == "array":
                for child in value[1]: visit(child)
            elif value[0] == "object":
                for key, child in value[1]: remember(key); visit(child)
        for _, relative in INPUTS: visit(oracle((REPO/relative).read_bytes()))
        self.assertEqual(self.dictionary,tuple(expected_pool))
        self.assertEqual(len(self.dictionary),888)
        self.assertEqual(sum(map(len,self.dictionary)),16114)

    def test_authored_order_unknown_data_and_exact_utf16_units(self):
        raw=r'{"z":null,"unknown":{"a":[true,false,"\u0000\r\n\ud800\ud83d\ude00"]},"2":2,"1":1}'.encode()
        actual=self.rendered(raw);self.assertEqual(actual,oracle(raw))
        self.assertEqual([bytes().join(n.to_bytes(2,"little") for n in k).decode("utf-16-le") for k,_ in actual[1]],["z","unknown","2","1"])
        text=actual[1][1][1][1][0][1][1][2]
        self.assertEqual(text,("text",(0,13,10,55296,55357,56832)))

    def test_integer_category_and_binary64_bit_oracles_are_exact(self):
        raw=b'[0,9007199254740991,-9007199254740991,0.0,-0.0,1e0,1.25,-1.25,5e-324]'
        actual=self.rendered(raw);self.assertEqual(actual,oracle(raw))
        self.assertEqual(actual,("array",(("integer",False,0),("integer",False,9007199254740991),("integer",True,9007199254740991),("binary64",0),("binary64",0x8000000000000000),("binary64",0x3ff0000000000000),("binary64",0x3ff4000000000000),("binary64",0xbff4000000000000),("binary64",1))))

    def test_unsupported_numeric_utf8_and_syntax_inputs_refuse(self):
        for raw in [b'-0',b'9007199254740992',b'-9007199254740992',b'NaN',b'Infinity',b'1e9999',b'1e-9999',b'"\xff"',b'[0,]']:
            with self.subTest(raw=raw), self.assertRaises((ValueError,UnicodeError)):
                self.rendered(raw)
        with self.assertRaises(ValueError): self.gen.render_literal(object())

    def test_duplicate_utf16_keys_refuse_without_unicode_normalization(self):
        for raw in [b'{"x":0,"x":1}', '{"😀":0,"\\ud83d\\ude00":1}'.encode()]:
            with self.subTest(raw=raw), self.assertRaises(ValueError): self.rendered(raw)
        raw=r'{"e\u0301":0,"\u00e9":1,"\ud800":2,"\udc00":3}'.encode()
        self.assertEqual(self.rendered(raw),oracle(raw))

    def test_independent_reader_accepts_only_complete_data_grammar(self):
        for text in ['Literal::Validated(true)','Literal::Text(&[65536])','Literal::Integer { negative: false, magnitude: 18446744073709551616 }','Literal::Null; side_effect()']:
            with self.subTest(text=text), self.assertRaises(ValueError): decode_literal(text)
        # New ID representation must fail for BOTH value and member IDs.
        for literal in ['Literal::Text(1)', 'Literal::Object(&[Member { key: 1, value: Literal::Null },])']:
            with self.subTest(literal=literal), self.assertRaises(ValueError):
                decode_literal(literal, ((65,),))
        with self.assertRaises(ValueError): decode_literal('Literal::Text(0)', ((65536,),))
        self.assertIn('Literal::Text(1)',self.data_text)
        with self.assertRaises(ValueError):
            decode_sources(self.data_text.replace('Literal::Text(1)','Literal::Text(888)',1))
        for changed in [self.data_text.replace('SourceLiteral { name:', 'SourceLiteral { validated: true, name:',1), self.data_text+'fn fake_proof() {}']:
            with self.assertRaises(ValueError): decode_sources(changed)

    def test_source_mutation_including_byte_only_change_makes_check_stale(self):
        with self.fixture_cohort() as root:
            baseline=self.gen.render();self.gen.OUTPUT.write_text(baseline);self.assertEqual(self.check_cli(),0)
            source=root/INPUTS[0][1]
            for raw in [b' {"unknown":{"keep":0},"order":[1,2]}\n',b'{"unknown":{"keep":1},"order":[1,2]}\n',b'{"order":[1,2],"unknown":{"keep":0}}\n']:
                source.write_bytes(raw)
                with self.assertRaises(SystemExit) as failure:self.check_cli()
                self.assertEqual(failure.exception.code,1)
                self.assertEqual(self.gen.OUTPUT.read_text(),baseline)
                self.assertEqual(decode_sources(self.gen.render())[0]["value"],oracle(raw))

    def test_determinism_missing_source_and_tampered_or_missing_output_refuse(self):
        with self.fixture_cohort() as root:
            first=self.gen.render();self.assertEqual(first,self.gen.render())
            self.gen.OUTPUT.write_text(first);self.assertEqual(self.check_cli(),0)
            self.gen.OUTPUT.write_text(first.replace('Literal::Integer { negative: false, magnitude: 0 }','Literal::Integer { negative: false, magnitude: 1 }',1))
            with self.assertRaises(SystemExit) as failure:self.check_cli()
            self.assertEqual(failure.exception.code,1)
            self.gen.OUTPUT.unlink()
            with self.assertRaises(SystemExit) as failure:self.check_cli()
            self.assertEqual(failure.exception.code,1)
            (root/INPUTS[-1][1]).unlink()
            with self.assertRaises(FileNotFoundError):self.gen.render()

if __name__ == "__main__": unittest.main()
