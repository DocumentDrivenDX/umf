#!/usr/bin/env python3
"""Encode the fixed codegen JSON sources as DATA, never semantic proof."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'crates/umf-core/src/canonical_codegen_literals.rs'
INPUTS = (
    ('coreSchema', 'spec/core/schema.json'),
    ('referenceSchema', 'spec/core/semantic-type-reference.schema.json'),
    ('packageSchema', 'spec/core/extension-package.schema.json'),
    ('constraints', 'spec/metamodel/generated/core-constraints.json'),
    ('domainPolicy', 'spec/metamodel/generated/domain-policy.json'),
    ('tablesPackage', 'spec/extensions/tables/package.json'),
    ('actionsPackage', 'spec/extensions/actions/package.json'),
    ('bindingPackage', 'spec/extensions/binding/package.json'),
    ('stableBindingPackage', 'spec/extensions/binding-stable/package.json'),
)

class ObjectPairs(list):
    """Ordered pairs, never JSON's last-key-wins projection."""

class Number:
    def __init__(self, kind: str, token: str):
        self.kind, self.token = kind, token

def units(text: str) -> tuple[int, ...]:
    raw = text.encode('utf-16-le', 'surrogatepass')
    return tuple(int.from_bytes(raw[i:i + 2], 'little') for i in range(0, len(raw), 2))

def parse_source(raw: bytes):
    def constant(token):
        raise ValueError('Non-JSON numeric token: ' + token)
    return json.loads(raw.decode('utf-8', 'strict'), object_pairs_hook=ObjectPairs,
                      parse_int=lambda s: Number('integer', s),
                      parse_float=lambda s: Number('binary64', s), parse_constant=constant)

def unit_array(text: str) -> str:
    return '&[' + ', '.join(str(n) for n in units(text)) + ']'

class TextDictionary:
    def __init__(self):
        self.entries: list[tuple[int, ...]] = []
        self.ordinals: dict[tuple[int, ...], int] = {}
    def intern(self, text: str) -> int:
        projected = units(text)
        # Python tuple equality resolves hash collisions; a hash is never proof.
        if projected not in self.ordinals:
            self.ordinals[projected] = len(self.entries)
            self.entries.append(projected)
        return self.ordinals[projected]

def render_literal(value, indent: str = '', dictionary: TextDictionary | None = None) -> str:
    if dictionary is None:
        dictionary = TextDictionary()
    if value is None:
        return 'Literal::Null'
    if type(value) is bool:
        return 'Literal::Bool(' + str(value).lower() + ')'
    if type(value) is Number:
        if value.kind == 'integer':
            number = int(value.token)
            if abs(number) > 2**53 - 1 or value.token == '-0':
                raise ValueError('Unsupported/ambiguous integer token: ' + value.token)
            return 'Literal::Integer { negative: ' + str(number < 0).lower() + ', magnitude: ' + str(abs(number)) + ' }'
        number = float(value.token)
        if not math.isfinite(number) or (number == 0 and any(c in '123456789' for c in value.token.split('e')[0].split('E')[0])):
            raise ValueError('Unsupported/underflowing binary64 token: ' + value.token)
        bits = int.from_bytes(struct.pack('>d', number), 'big')
        return 'Literal::Binary64 { bits: ' + str(bits) + ' }'
    if type(value) is str:
        return 'Literal::Text(' + str(dictionary.intern(value)) + ')'
    if type(value) is ObjectPairs:
        seen = set()
        rows = []
        for key, child in value:
            projected = units(key)
            if projected in seen:
                raise ValueError('Duplicate UTF16 object key')
            seen.add(projected)
            key_id = dictionary.intern(key)
            rows.append(indent + '    Member { key: ' + str(key_id) + ', value: ' + render_literal(child, indent + '    ', dictionary) + ' },')
        return 'Literal::Object(&[\n' + '\n'.join(rows) + '\n' + indent + '])'
    if type(value) is list:
        return 'Literal::Array(&[\n' + '\n'.join(indent + '    ' + render_literal(child, indent + '    ', dictionary) + ',' for child in value) + '\n' + indent + '])'
    raise ValueError('Unsupported source data type')

def render() -> str:
    dictionary = TextDictionary()
    rows = ['// SPDX-License-Identifier: MIT OR Apache-2.0',
            '// Generated literal DATA only. Runtime admission is mandatory.',
            '// Producer: tools/generate_codegen_resource_literals.py',
            'use super::{Literal, Member, SourceLiteral};',
            '#[rustfmt::skip]',
            'pub(super) static SOURCES: &[SourceLiteral] = &[']
    for name, path in INPUTS:
        raw = (ROOT / path).read_bytes()
        value = parse_source(raw)
        rows.append('    SourceLiteral { name: ' + json.dumps(name) + ', path: ' + json.dumps(path) + ', bytes: ' + str(len(raw)) + ', sha256: ' + json.dumps(hashlib.sha256(raw).hexdigest()) + ', value: ' + render_literal(value, '    ', dictionary) + ' },')
    rows.append('];\n')
    texts = ['#[rustfmt::skip]', 'pub(super) static TEXTS: &[&[u16]] = &[']
    texts.extend('    &[' + ', '.join(str(n) for n in entry) + '],' for entry in dictionary.entries)
    texts.append('];')
    rows[4:4] = texts
    return '\n'.join(rows)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = render()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != expected.encode('utf-8'):
            parser.exit(1, 'Canonical resource DATA is missing or stale\n')
    else:
        OUTPUT.write_text(expected, encoding='utf-8', newline='\n')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
