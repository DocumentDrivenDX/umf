#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Freeze independent Python re compile/search boundaries; never run candidate Rust.

Inputs are three exact CPython interpreter paths (3.11, 3.12, 3.13).
Full test_re literal calls are AST-extracted, not executed as a unittest suite.
"""
from __future__ import annotations
import ast
import hashlib
import itertools
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/fixtures/cpython-re/test_re-3.11.14.py'
OUTPUT = ROOT / 'tests/fixtures/cpython-re/independent-boundaries.json'
TSV_OUTPUT = ROOT / 'tests/fixtures/cpython-re/independent-outcomes.tsv'
CASES: list[dict] = []
SEEN = set()

def add(family, pattern, text=None, source_line=None):
    key = (pattern, text)
    if key in SEEN:
        return
    SEEN.add(key)
    item = {'id': f'independent-{len(CASES):05d}', 'family': family,
            'operation': 'compile' if text is None else 'search',
            'patternCodepoints': [ord(c) for c in pattern]}
    if text is not None:
        item['textCodepoints'] = [ord(c) for c in text]
    if source_line is not None:
        item['sourceLine'] = source_line
    CASES.append(item)

# Explicit reviewer counterexamples and adjacent admission boundaries.
patterns = ['(?<n>a)', '(?-i:a)', '(?i)(?m)a', '(?i)(?i)a', '(?x)(?i)a',
            '(?<=(a)\\1)b', '(?<=(?P<n>a)(?P=n))b', '(?(1)a|b)',
            '(?(2)a|b)(a)', '(?(1)a|b)(a)', '(a(?(1)b|c))', '(?(0)a|b)',
            '(?u:(?a:\\w))', '(?a:(?u:\\w))', '(?au:a)', '(?i-i:a)',
            '(?i--m:a)', '(?-im:a)', '(?i-m:a)', '(?P<n>a)(?P=n)',
            '(?P<é>a)(?P=é)', '(?P<1>a)', '(?P<a-b>a)', '(?P<\ud800>a)',
            '(?P<n>a)(?(n)b|c)', '(a)?(?(1)b|c)', '(a)?(?(1)b)',
            '(?<=a|bc)d', '(?<=a|b)c', '(?<!a)b', '(?=a(a))\\1',
            '(?:a?)*', '(a?){2}', '(a?){2,4}', '(a?)*?', '(a|ab)++b',
            '(?>a|ab)b', 'a*+a', '(a*)\\1', '(?i)(a)\\1', '(?s:.)',
            '\\Aabc\\Z', '\\B', '\\b', '(?m)^a$', '(?t)a', '(?t)a*']
for pattern in patterns:
    add('explicit-admission', pattern)
    for text in ['', 'a', 'A', 'ab', 'ac', 'aa', 'aab', 'abc', '\n', '\ud800', '\U00010000', '\ud800\udc00']:
        add('explicit-search', pattern, text)

# Systematic range endpoints expose non-monotone case mappings.
ends = ['@', 'A', 'B', 'Z', '[', '_', '`', 'a', 'b', 'z', 'µ', 'Σ', 'ς', 'σ']
texts = ['@', 'A', 'B', 'C', 'Z', '[', '_', '`', 'a', 'b', 'c', 'z', 'µ', 'Μ', 'μ', 'Σ', 'ς', 'σ', 'İ', 'ı', 'ſ', 'K']
for a, b in itertools.combinations_with_replacement(ends, 2):
    if ord(a) > ord(b):
        a, b = b, a
    for flags in ['(?i)', '(?ai)']:
        pattern = flags + '[\\u%04x-\\u%04x]' % (ord(a), ord(b))
        for text in texts:
            add('ignorecase-range-crossproduct', pattern, text)
for a, b in [('µ','μ'),('ς','σ'),('ϐ','β'),('ϑ','θ'),('ϕ','φ'),('ϖ','π'),('ϰ','κ'),('ϱ','ρ'),('ϵ','ε'),('ͅ','ι'),('İ','i'),('ı','i'),('ſ','s'),('K','k')]:
    for left, right in [(a,b),(b,a)]:
        for flags in ['(?i)', '(?ai)']:
            add('unicode-case-equivalence', flags + left, right)
            add('unicode-case-backreference', flags + '(' + left + ')\\1', left + right)
for cp in [9,10,11,12,13,32,0x85,0xa0,0x1680,0x2000,0x200b,0x2028,0x2029,0x202f,0x205f,0x3000]:
    add('verbose-whitespace', '(?x)a' + chr(cp) + 'b', 'ab')
    add('verbose-whitespace', '(?x)a' + chr(cp) + 'b', 'a' + chr(cp) + 'b')
for outer, inner in itertools.product(['','(?a)','(?u)','(?i)','(?x)'], ['a','u','i','-i','-m','i-m','im-s','ai','ui','au','-a','-u','-x']):
    for atom, text in [('A','a'),('\\w','é'),('\\w','a'),('\\d','٢'),('.','\n')]:
        add('scoped-flags-crossproduct', outer + '(?' + inner + ':' + atom + ')', text)
for first, second in itertools.product(['i','m','s','x','a','u','t'], repeat=2):
    add('global-flags-crossproduct', '(?' + first + ')(?' + second + ')a', 'A')
for escape in ['\\0','\\07','\\08','\\1','\\11','\\111','\\400','\\a','\\b','\\B','\\A','\\Z','\\z','\\uD800','\\U00010000','\\N{EM DASH}','\\N{null}','\\N{NULL}','\\N{LATIN CAPITAL LETTER A}']:
    for form in [escape, '['+escape+']']:
        add('escape-admission', form)
        for text in ['a','\0','\x07','\ud800','\U00010000','—','A']:
            add('escape-search', form, text)

# Pull literal compile/search patterns from the much broader official test_re.
# Parameterized loops, flags arguments, substitutions and assertions remain
# excluded and are recorded as such; this is not a claim to run full test_re.
extracted = 0
for node in ast.walk(ast.parse(SOURCE.read_text())):
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
        continue
    if not isinstance(node.func.value, ast.Name) or node.func.value.id != 're':
        continue
    if node.func.attr not in {'compile','search','match','fullmatch'} or not node.args:
        continue
    try:
        pattern = ast.literal_eval(node.args[0])
        text = ast.literal_eval(node.args[1]) if node.func.attr != 'compile' and len(node.args) > 1 else None
    except (ValueError, TypeError, SyntaxError):
        continue
    if not isinstance(pattern, str) or len(pattern)>256 or (text is not None and (not isinstance(text,str) or len(text)>32)):
        continue
    if len(node.args) > (1 if text is None else 2) or node.keywords:
        continue
    before=len(CASES)
    add('cpython-test_re-literal-' + node.func.attr, pattern, text, node.lineno)
    extracted += len(CASES)>before

RUNNER = r'''
import json,re,sys,unicodedata,warnings
expected_minor=int(sys.argv[1])
assert sys.version_info[:2]==(3,expected_minor),sys.version
cases=json.load(sys.stdin);results=[]
for case in cases:
 pattern=''.join(map(chr,case['patternCodepoints']))
 with warnings.catch_warnings():
  warnings.simplefilter('ignore')
  try:
   r=re.compile(pattern)
  except (re.error,ValueError,OverflowError,RecursionError) as error:
   results.append({'status':'compile-error','errorClass':type(error).__name__,'message':str(error)})
   continue
  result={'status':'compiled'}
  if case['operation']=='search':
   text=''.join(map(chr,case['textCodepoints']))
   match=r.search(text)
   result['span']=list(match.span()) if match else None
  results.append(result)
print(json.dumps({'version':sys.version,'executable':sys.executable,'unicodeVersion':unicodedata.unidata_version,'results':results},ensure_ascii=True))
'''
if len(sys.argv)!=4:
    raise SystemExit('usage: generate_independent_python_re_boundaries.py PY311 PY312 PY313')
profiles={}
for minor, interpreter in zip((11,12,13),sys.argv[1:]):
    process=subprocess.run([interpreter,'-c',RUNNER,str(minor)],input=json.dumps(CASES,ensure_ascii=True),text=True,capture_output=True,check=True)
    profiles[f'3.{minor}']=json.loads(process.stdout)
record={'profile':'umf.independent-python-re-boundaries/1','source':{'url':'https://raw.githubusercontent.com/python/cpython/v3.11.14/Lib/test/test_re.py','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest()},'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'scope':{'cases':len(CASES),'literalCallsExtracted':extracted,'fullTestReExecuted':False,'exclusions':['byte patterns','parameterized/nonliteral official calls','explicit flags arguments','substitution/split/capture-group API results','full Python unittest harness']},'cases':CASES,'oracles':profiles}
OUTPUT.write_text(json.dumps(record,ensure_ascii=True,separators=(',',':'))+'\n')
tsv=[]
for minor, key in zip((11,12,13), ('3.11','3.12','3.13')):
    for case, result in zip(CASES, profiles[key]['results']):
        span = result.get('span')
        span_text = '-' if span is None else f'{span[0]},{span[1]}'
        text = ','.join(map(str, case.get('textCodepoints', [])))
        pattern = ','.join(map(str, case['patternCodepoints']))
        status = 'E' if result['status'] != 'compiled' else ('N' if span is None else 'M')
        tsv.append('\t'.join((str(minor), case['id'], case['operation'], status, span_text, text, pattern)))
TSV_OUTPUT.write_text('\n'.join(tsv)+'\n', encoding='ascii')
print(json.dumps({'output':str(OUTPUT),'cases':len(CASES),'officialLiteralCalls':extracted,'sha256':hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),'tsvOutput':str(TSV_OUTPUT),'tsvSha256':hashlib.sha256(TSV_OUTPUT.read_bytes()).hexdigest(),'versions':{k:v['version'].split()[0] for k,v in profiles.items()}}))
