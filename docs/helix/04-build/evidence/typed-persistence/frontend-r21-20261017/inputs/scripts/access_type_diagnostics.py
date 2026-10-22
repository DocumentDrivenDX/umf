"""Fail-closed static-negative diagnostics, pinned to reviewed source call sites."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import re


class DiagnosticMismatch(ValueError):
    pass


@dataclass(frozen=True, order=True)
class Diagnostic:
    path: str
    line: int
    rule: str


def _path(value: str, root: Path) -> str:
    path = Path(value)
    if not path.is_absolute():
        path = root / path
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise DiagnosticMismatch('diagnostic outside repository: ' + value) from error


def parse_diagnostics(tool: str, text: str, root: Path) -> list[Diagnostic]:
    result = []
    if tool == 'pyright':
        try:
            data = json.loads(text)
        except ValueError as error:
            raise DiagnosticMismatch('pyright JSON required') from error
        if not isinstance(data, dict) or not isinstance(data.get('generalDiagnostics'), list):
            raise DiagnosticMismatch('complete pyright diagnostics required')
        for item in data['generalDiagnostics']:
            if item.get('severity') != 'error' or not isinstance(item.get('rule'), str):
                raise DiagnosticMismatch('unexpected pyright severity or missing rule')
            try:
                line = item['range']['start']['line']
                if type(line) is not int or line < 0:
                    raise ValueError('line')
                result.append(Diagnostic(_path(item['file'], root), line + 1, item['rule']))
            except (KeyError, TypeError, ValueError) as error:
                raise DiagnosticMismatch('malformed pyright diagnostic') from error
        return result
    if tool not in ('mypy', 'ty'):
        raise DiagnosticMismatch('unknown checker')
    pattern = (r'^(.*\.py):(\d+)(?::\d+)?: error: .*\s+\[([^\]]+)\]$'
               if tool == 'mypy' else r'^(.*\.py):(\d+):\d+: error\[([^\]]+)\] .*$')
    for line in text.splitlines():
        match = re.match(pattern, line)
        if match:
            file, number, rule = match.groups()
            result.append(Diagnostic(_path(file, root), int(number), rule))
        elif re.search(r'\berror\b', line, re.IGNORECASE) and not re.match(r'^Found \d+ errors? in ', line):
            # Notes/overload continuations may quote "error" in type text, but
            # pinned output has no such expected rows. Refuse unfamiliar output.
            raise DiagnosticMismatch('unparsed checker error: ' + line)
    return result


def expected_diagnostics(spec: dict, tool: str, root: Path) -> list[Diagnostic]:
    if spec.get('version') != 'umf-static-negative-sites/0.1':
        raise DiagnosticMismatch('unknown expectation version')
    result = []
    paths = set()
    for case in spec['cases']:
        path = case['path']
        if path in paths:
            raise DiagnosticMismatch('duplicate expected file')
        paths.add(path)
        source = (root / path).read_bytes()
        if hashlib.sha256(source).hexdigest() != case['sourceSha256']:
            raise DiagnosticMismatch('reviewed negative source changed: ' + path)
        lines = source.decode().splitlines()
        for site in case['sites']:
            number = site['line']
            if type(number) is not int or not 1 <= number <= len(lines) or lines[number - 1].strip() != site['source']:
                raise DiagnosticMismatch('reviewed negative call site moved: ' + path)
            rules = site['rules'][tool]
            if not rules or any(not isinstance(rule, str) or not rule for rule in rules):
                raise DiagnosticMismatch('expected exact rules required')
            result += [Diagnostic(path, number, rule) for rule in rules]
    return result


def validate_negative(tool: str, text: str, spec: dict, root: Path, *, returncode: int, files: list[Path]) -> list[Diagnostic]:
    if returncode != 1:
        raise DiagnosticMismatch('negative checker requires diagnostic exit 1, got ' + str(returncode))
    expected_files = {case['path'] for case in spec['cases']}
    if {_path(str(path), root) for path in files} != expected_files:
        raise DiagnosticMismatch('requested and reviewed negative file sets differ')
    expected = Counter(expected_diagnostics(spec, tool, root))
    actual = Counter(parse_diagnostics(tool, text, root))
    forbidden = {'import-not-found', 'import-untyped', 'reportMissingImports', 'reportMissingModuleSource', 'unresolved-import'}
    if any(item.rule in forbidden for item in actual):
        raise DiagnosticMismatch('import errors never qualify a negative call-site test')
    if actual != expected:
        raise DiagnosticMismatch('diagnostics differ: missing=' + repr(list((expected-actual).elements())) + '; extra=' + repr(list((actual-expected).elements())))
    return sorted(actual.elements())
