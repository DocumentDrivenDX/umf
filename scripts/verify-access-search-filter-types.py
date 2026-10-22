# SPDX-License-Identifier: MIT OR Apache-2.0
"""Record separately scoped pinned checker outputs for the six filter misuse sites."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--environment', type=Path, required=True)
parser.add_argument('--generated', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'scripts'))
from access_type_diagnostics import validate_negative

environment, generated, out = args.environment.resolve(), args.generated.resolve(), args.out.resolve()
out.mkdir(exist_ok=False)
runtime = Path(subprocess.check_output([str(environment / 'bin/python'), '-I', '-c', 'import sysconfig; print(sysconfig.get_path("purelib"))'], text=True).strip())
base = root / 'tests/compilation/python/static/search-filter-parameters'
negative = sorted((base / 'negative').glob('*.py'))
assert len(negative) == 6
expectations = json.loads((base / 'negative-sites.json').read_text())
report = {}
for tool, pinned in [('mypy', '2.4.0'), ('pyright', '1.1.414'), ('ty', '0.0.88')]:
    version = subprocess.check_output([str(environment / 'bin' / tool), '--version'], text=True).strip()
    assert version.split()[1] == pinned, version
    report[tool] = {'version': version}
    for phase, files in [('positive', [base / 'positive.py', generated / 'search_docs']), ('negative', negative)]:
        command = [str(environment / 'bin' / tool)]
        if tool == 'mypy':
            command += ['--python-executable', str(environment / 'bin/python'), '--python-version', '3.11', '--check-untyped-defs', '--namespace-packages', '--explicit-package-bases', '--follow-imports=silent', '--cache-dir', str(out / 'mypy-cache'), *map(str, files)]
        elif tool == 'ty':
            command += ['check', '--python-version', '3.11', '--python', str(environment), '--extra-search-path', str(runtime), '--extra-search-path', str(generated), '--output-format', 'concise', *map(str, files)]
        else:
            config = out / f'pyright-{phase}.json'
            config.write_text(json.dumps({'include': [os.path.relpath(p, out) for p in files], 'extraPaths': [str(runtime), str(generated)], 'typeCheckingMode': 'basic', 'pythonVersion': '3.11'}))
            command += ['--project', str(config), '--pythonpath', str(environment / 'bin/python'), '--outputjson']
        result = subprocess.run(command, check=False, cwd=root, env=dict(os.environ, PYTHONPATH=str(generated), MYPYPATH=str(generated)), capture_output=True, text=True)
        output = result.stdout + result.stderr
        (out / f'{tool}-{phase}.log').write_text(output)
        if tool == 'pyright':
            summary = json.loads(result.stdout)['summary']
            assert summary['filesAnalyzed'] >= len(files), summary
        diagnostics = validate_negative(tool, output, expectations, root, returncode=result.returncode, files=negative) if phase == 'negative' else []
        report[tool][phase] = {'command': command, 'exitCode': result.returncode, 'diagnostics': [vars(item) for item in diagnostics]}
        print(tool, phase, result.returncode, len(diagnostics), flush=True)
        if phase == 'positive':
            assert result.returncode == 0, output
        else:
            assert result.returncode != 0
            assert {item.path for item in diagnostics} == {str(p.relative_to(root)) for p in negative}
            assert all(item.line == 5 for item in diagnostics)
(out / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
