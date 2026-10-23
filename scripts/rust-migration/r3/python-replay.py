#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Installed Python adapter for frozen full-result compiler comparisons."""
import json
import sys
from pathlib import Path
from umf.rust_codegen import CodegenEngine

root = Path(sys.argv[1]).resolve()
paths = {
    'coreSchema': 'spec/core/schema.json', 'referenceSchema': 'spec/core/semantic-type-reference.schema.json',
    'packageSchema': 'spec/core/extension-package.schema.json', 'constraints': 'spec/metamodel/generated/core-constraints.json',
    'domainPolicy': 'spec/metamodel/generated/domain-policy.json', 'tablesPackage': 'spec/extensions/tables/package.json',
    'actionsPackage': 'spec/extensions/actions/package.json', 'bindingPackage': 'spec/extensions/binding/package.json', 'stableBindingPackage': 'spec/extensions/binding-stable/package.json',
}
engine = CodegenEngine({name: json.loads((root / file).read_bytes()) for name, file in paths.items()})
if len(sys.argv) > 2:
    import os
    import importlib.util
    spec = importlib.util.spec_from_file_location('replay_comparator', root / 'scripts/rust-migration/r3/native-replay.py')
    comparator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(comparator)
    import gzip
    content = (root / sys.argv[2]).read_bytes()
    corpus = json.loads(gzip.decompress(content) if sys.argv[2].endswith('.gz') else content)
    rows = corpus.get('cases', corpus.get('vectors', []) + corpus.get('diffs', []))
    if not rows or len({row['id'] for row in rows}) != len(rows):
        raise ValueError('Expected nonempty corpus with unique IDs')
    results = []
    for row in rows:
        actual = engine.call(row['operation'], row['request'])
        results.append({'id': row['id'], 'matches': comparator.difference(row['expected'], actual) is None, 'actual': actual})
    report = {'python': sys.version, 'cases': len(rows), 'matches': sum(row['matches'] for row in results), 'results': results}
    if os.environ.get('UMF_R3_REPORT'):
        Path(os.environ['UMF_R3_REPORT']).write_text(json.dumps(report, ensure_ascii=True) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'results'}))
    raise SystemExit(report['cases'] != report['matches'])
else:
    for line in sys.stdin:
        request = json.loads(line)
        print(json.dumps(engine.call(request['operation'], request['request']), ensure_ascii=True, separators=(',', ':')))
