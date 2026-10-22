# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent consumer schema admission controls from the frozen Python predecessor."""
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys

predecessor = Path(os.environ['UMF_PREDECESSOR_PYTHON_SOURCE']).resolve()
expected_sources = {
    'schemas.py': '22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402',
    'json.py': '3b9362c4111fb96b5e79604e7150eacf88be07a8232013a1d2695afae97c7539',
}
for name, expected in expected_sources.items():
    actual = hashlib.sha256((predecessor / 'umf' / name).read_bytes()).hexdigest()
    if actual != expected:
        raise RuntimeError(f'Predecessor source mismatch: {name}')
if sys.version_info[:2] != (3, 11) or importlib.metadata.version('jsonschema') != '4.26.0':
    raise RuntimeError('This capture requires the frozen CPython 3.11 / jsonschema 4.26.0 oracle')
sys.path.insert(0, str(predecessor))
from umf.schemas import schema_validator

DIALECTS = {
    'draft3': 'http://json-schema.org/draft-03/schema#',
    'draft4': 'http://json-schema.org/draft-04/schema#',
    'draft6': 'http://json-schema.org/draft-06/schema#',
    'draft7': 'http://json-schema.org/draft-07/schema#',
    'draft2019-09': 'https://json-schema.org/draft/2019-09/schema',
    'draft2020-12': 'https://json-schema.org/draft/2020-12/schema',
}
KEYWORDS = '''type enum const multipleOf divisibleBy minimum maximum exclusiveMinimum exclusiveMaximum minLength maxLength pattern format minItems maxItems uniqueItems items additionalItems contains minContains maxContains prefixItems minProperties maxProperties properties patternProperties additionalProperties required dependencies dependentRequired dependentSchemas propertyNames allOf anyOf oneOf not if then else extends disallow definitions $defs $ref $dynamicRef $recursiveRef $recursiveAnchor $anchor $dynamicAnchor $id id $vocabulary title description default examples readOnly writeOnly deprecated contentEncoding contentMediaType contentSchema $comment unknownAnnotation'''.split()
VALUES = [None, True, False, 0, 1, -1, .5, '', 'string', 'unknown', '#/definitions/x', 'urn:test:id', '[', [], ['string'], ['string', 'string'], ['unknown'], [True], [{}], {}, {'x': True}, {'x': 'string'}, {'x': ['string']}, {'type': 'integer'}]

cases = []
for dialect, uri in DIALECTS.items():
    for keyword in KEYWORDS:
        for index, value in enumerate(VALUES):
            schema = {'$schema': uri, keyword: value}
            try:
                schema_validator(schema)
                outcome = {'accepted': True}
            except Exception as error:
                outcome = {'accepted': False, 'exception': type(error).__name__}
            cases.append({'id': f'{dialect}/{keyword}/{index}', 'schema': schema, **outcome})
    for index, body in enumerate([True, False, {'type': []}, {'type': ['integer', {'type': 'string'}]}, {'enum': []}, {'required': []}, {'properties': {'x': {'required': True}}}, {'exclusiveMinimum': True, 'minimum': 1}, {'exclusiveMinimum': 1}, {'unknownAnnotation': {'$ref': 'https://example.test/missing'}}, {'$ref': '#/missing'}]):
        schema = {'$schema': uri, **body} if isinstance(body, dict) else body
        try:
            schema_validator(schema)
            outcome = {'accepted': True}
        except Exception as error:
            outcome = {'accepted': False, 'exception': type(error).__name__}
        cases.append({'id': f'{dialect}/combined/{index}', 'schema': schema, **outcome})

source_hashes = {name: hashlib.sha256((predecessor / 'umf' / name).read_bytes()).hexdigest() for name in ('schemas.py', 'json.py')}
receipt = {
    'profile': 'umf.r2.schema-admission-predecessor/1',
    'sourceCommit': '53de049136c7e41b482d1a73665d031cd5fbaec6',
    'sourceHashes': source_hashes,
    'python': sys.version,
    'jsonschema': importlib.metadata.version('jsonschema'),
    'dialects': DIALECTS,
    'cases': cases,
    'count': len(cases),
    'accepted': sum(case['accepted'] for case in cases),
    'qualification': 'Exact previous UMF schema_validator construction, including local-reference gate and check_schema; exception classes are recorded as context, accepted/refused is the compatibility control. Boolean root schemas have no dialect marker and use the predecessor default.',
}
output = Path(sys.argv[1])
output.write_text(json.dumps(receipt, indent=2, ensure_ascii=True) + '\n')
print(json.dumps({'path': str(output), 'cases': receipt['count'], 'accepted': receipt['accepted'], 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))
