# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent encoding-only controls; no JSON/UMF/native acceptance claim."""
from contextlib import redirect_stderr, redirect_stdout
import importlib.util
import io
import os
from pathlib import Path
import re
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SYMBOLS=('OPERATION_SCHEMA_UTF16','ROW_EXPRESSION_OPERATION_SCHEMA_UTF16')
ROOT=Path(os.environ['UMF_OPERATION_ENCODING_SOURCE']) if 'UMF_OPERATION_ENCODING_SOURCE' in os.environ else Path(__file__).resolve().parents[2]
RECIPE=ROOT/'tools/generate_operation_schema_utf16.py'
MODULE=ROOT/'crates/umf-codegen/src/operation_schemas_utf16.rs'
SOURCES=(ROOT/'spec/extensions/tables/operation.schema.json',ROOT/'spec/extensions/tables/operation-0.2.schema.json')
spec=importlib.util.spec_from_file_location('_operation_encoding_recipe_under_test',RECIPE)
recipe=importlib.util.module_from_spec(spec);spec.loader.exec_module(recipe)

def independent_units(raw):
    # Per-Unicode-scalar arithmetic, deliberately not the recipe's byte unpacking.
    result=[]
    for c in raw.decode('utf-8','strict'):
        n=ord(c)
        if n<0x10000: result.append(n)
        else:
            n-=0x10000; result.extend((0xd800+(n>>10),0xdc00+(n&1023)))
    return tuple(result)

def arrays(raw):
    """Closed DATA-only parser: exactly two named typed numeric arrays, no eval."""
    text=raw.decode('ascii','strict')
    body='\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('//') and line.strip()!='#[rustfmt::skip]')
    pattern=re.compile(r'\s*pub\(super\) static ([A-Z_0-9]+): &\[u16\] = &\[\s*((?:0x[0-9a-f]{4},\s*)*)\];')
    result=[];pos=0
    while pos<len(body) and body[pos:].strip():
        match=pattern.match(body,pos)
        if match is None: raise AssertionError('Generated output outside narrow array grammar')
        result.append((match.group(1),tuple(int(s,16) for s in re.findall(r'0x([0-9a-f]{4}),',match.group(2)))))
        pos=match.end()
    if tuple(name for name,_ in result)!=SYMBOLS: raise AssertionError('Expected exactly two sources in declared order')
    return tuple(u for _,u in result)

def assert_correspondence(case, generated, first, second):
    case.assertEqual(arrays(generated),(independent_units(first),independent_units(second)))

class OperationSchemaUTF16EncodingTests(unittest.TestCase):
    def invoke(self,argv,entrypoint=False):
        stdout=io.StringIO();stderr=io.StringIO()
        with redirect_stdout(stdout),redirect_stderr(stderr):
            if entrypoint:
                with patch.object(sys,'argv',[str(RECIPE),*map(str,argv)]):
                    try: runpy.run_path(str(RECIPE),run_name='__main__')
                    except SystemExit as e: code=e.code
                    else: code=0
            else: code=recipe.main(list(map(str,argv)))
        return code,stdout.getvalue(),stderr.getvalue()

    def fixture(self,root,first,second):
        a=root/'first.raw';b=root/'second.raw';output=root/'out.rs'
        a.write_bytes(first);b.write_bytes(second)
        return a,b,output,['--operation-source',a,'--row-expression-source',b,'--output',output]

    def test_canonical_two_sources_complete_numeric_arrays_and_utf8_roundtrip(self):
        first,second=(p.read_bytes() for p in SOURCES)
        actual=MODULE.read_bytes();u=arrays(actual)
        self.assertEqual(tuple(map(len,u)),(15950,9101))
        assert_correspondence(self,actual,first,second)
        # Canonical sources are ASCII: every raw byte is independently its unit.
        self.assertEqual(u,(tuple(first),tuple(second)))
        for raw,us in zip((first,second),u):
            encoded=b''.join(n.to_bytes(2,'little') for n in us)
            self.assertEqual(encoded.decode('utf-16-le').encode('utf-8'),raw)
        self.assertEqual(recipe.render(first,second),actual)
        self.assertEqual(recipe.render(first,second),recipe.render(first,second))

    def test_literal_units_preserve_bom_crlf_whitespace_nonbmp_and_json_escapes(self):
        fixtures=[(b'A\r\n \t',(65,13,10,32,9)),
                  (b'\xef\xbb\xbfZ',(0xfeff,90)),
                  ('é中😀'.encode('utf-8'),(233,20013,0xd83d,0xde00)),
                  (b'"\\ud800\\ud83d\\ude00"',(34,92,117,100,56,48,48,92,117,100,56,51,100,92,117,100,101,48,48,34)),
                  (b'',())]
        for raw,expected in fixtures:
            with self.subTest(raw=raw):
                self.assertEqual(recipe.source_units(raw),expected)
                self.assertEqual(independent_units(raw),expected)
                self.assertEqual(arrays(recipe.render(raw,b'')),(expected,()))

    def test_encoding_does_not_parse_or_normalize_invalid_json_duplicate_keys_or_trailing(self):
        fixtures=[b'{broken',b'{"x":1,"x":2}',b'null trailing\n',b'NaN',b'1e999',b'[]\r\n  ',b'"\\udfff"']
        for raw in fixtures:
            with self.subTest(raw=raw):
                self.assertEqual(recipe.source_units(raw),tuple(raw))
                assert_correspondence(self,recipe.render(raw,b'null'),raw,b'null')
        # Distinct spelling and line endings stay distinct even if JSON meanings agree.
        self.assertNotEqual(recipe.source_units(b'"a"'),recipe.source_units(b'"\\u0061"'))
        self.assertNotEqual(recipe.source_units(b'{}\n'),recipe.source_units(b'{}\r\n'))

    def test_invalid_utf8_refuses_helpers_both_sources_and_cli_without_output_mutation(self):
        for bad in (b'\xff',b'\xc0\xaf',b'\xed\xa0\x80',b'\xf0\x9f',b'\xf4\x90\x80\x80'):
            with self.subTest(bad=bad):
                with self.assertRaises(UnicodeDecodeError): recipe.source_units(bad)
                for first,second in ((bad,b'{}'),(b'{}',bad)):
                    with self.assertRaises(UnicodeDecodeError): recipe.render(first,second)
                    with tempfile.TemporaryDirectory() as td:
                        a,b,out,argv=self.fixture(Path(td),first,second)
                        out.write_bytes(b'untouched')
                        code,stdout,stderr=self.invoke(argv,entrypoint=True)
                        self.assertEqual(code,2);self.assertEqual(stdout,'')
                        self.assertIn('encoding refused',stderr)
                        self.assertEqual(out.read_bytes(),b'untouched')
                        self.assertEqual((a.read_bytes(),b.read_bytes()),(first,second))

    def test_cli_source_overrides_encode_exact_two_in_original_order_and_detect_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            first=b'\xef\xbb\xbf{broken\r\n';second='["😀"] trailing'.encode('utf-8')
            a,b,out,argv=self.fixture(Path(td),first,second)
            self.assertEqual(self.invoke(argv,entrypoint=True)[0],0)
            assert_correspondence(self,out.read_bytes(),first,second)
            original=out.read_bytes();a.write_bytes(first+b' ')
            with patch.object(Path,'write_bytes',side_effect=AssertionError('check wrote output')):
                self.assertEqual(self.invoke([*argv,'--check'])[0],1)
            self.assertEqual(out.read_bytes(),original)
            self.assertEqual(self.invoke(argv)[0],0)
            assert_correspondence(self,out.read_bytes(),first+b' ',second)
            self.assertNotEqual(out.read_bytes(),original)

    def test_check_matching_stale_and_missing_output_never_writes(self):
        with tempfile.TemporaryDirectory() as td:
            a,b,out,argv=self.fixture(Path(td),b'one\r\n',b'two')
            exact=recipe.render(a.read_bytes(),b.read_bytes());out.write_bytes(exact)
            before=out.stat().st_mtime_ns
            with patch.object(Path,'write_bytes',side_effect=AssertionError('check attempted a write')):
                self.assertEqual(self.invoke([*argv,'--check'],entrypoint=True)[0],0)
            self.assertEqual(out.read_bytes(),exact);self.assertEqual(out.stat().st_mtime_ns,before)
            out.write_bytes(b'stale sentinel');before=out.stat().st_mtime_ns
            with patch.object(Path,'write_bytes',side_effect=AssertionError('stale check attempted a write')):
                self.assertEqual(self.invoke([*argv,'--check'])[0],1)
            self.assertEqual(out.read_bytes(),b'stale sentinel');self.assertEqual(out.stat().st_mtime_ns,before)
            out.unlink();existing=set(Path(td).iterdir())
            with patch.object(Path,'write_bytes',side_effect=AssertionError('missing check attempted a write')):
                self.assertEqual(self.invoke([*argv,'--check'])[0],1)
            self.assertFalse(out.exists());self.assertEqual(set(Path(td).iterdir()),existing)

    def test_independent_array_oracle_rejects_one_bad_unit_extra_or_reordered_source(self):
        first=b'A\n';second=b'B';good=recipe.render(first,second)
        assert_correspondence(self,good,first,second)
        mutant=good.replace(b'0x0041,',b'0x0042,',1)
        self.assertNotEqual(mutant,good)
        with self.assertRaises(AssertionError): assert_correspondence(self,mutant,first,second)
        with self.assertRaises(AssertionError): assert_correspondence(self,recipe.render(second,first),first,second)
        with self.assertRaises(AssertionError): arrays(good+b'pub(super) static EXTRA: &[u16] = &[];\n')

    def test_omitted_final_newline_is_stale_and_check_preserves_mutant(self):
        with tempfile.TemporaryDirectory() as td:
            a,b,out,argv=self.fixture(Path(td),b'A\n',b'B\n')
            good=recipe.render(a.read_bytes(),b.read_bytes())
            self.assertTrue(good.endswith(b'\n'));mutant=good[:-1];out.write_bytes(mutant)
            # Unit equality alone intentionally cannot detect formatting mutation.
            assert_correspondence(self,mutant,a.read_bytes(),b.read_bytes())
            with patch.object(Path,'write_bytes',side_effect=AssertionError('mutant check wrote')):
                code,_,stderr=self.invoke([*argv,'--check'])
            self.assertEqual(code,1);self.assertIn('stale',stderr)
            self.assertEqual(out.read_bytes(),mutant)

if __name__=='__main__': unittest.main()
