# SPDX-License-Identifier: MIT OR Apache-2.0
"""Scoped installed generator ownership checks without importing or executing it."""
import argparse
import ast
from pathlib import Path

HOST_EXECUTION = {'system', 'popen', 'spawnl', 'spawnle', 'spawnlp', 'spawnlpe', 'spawnv', 'spawnve', 'spawnvp', 'spawnvpe', 'execl', 'execle', 'execlp', 'execlpe', 'execv', 'execve', 'execvp', 'execvpe', 'posix_spawn', 'posix_spawnp', 'import_module', 'exec_module', 'run_module', 'run_path'}

ALLOWED = {
    '__init__': {'__future__', 'typing', '_embedded'},
    '_embedded': {'__future__', 'gzip', 'hashlib', 'json', 'time', 'importlib.metadata', 'importlib.resources', '_release', 'py_mini_racer'},
    '_release': set(),
    '_writer': {'__future__', 'hashlib', 'json', 'os', 'shutil', 'tempfile', 'collections.abc', 'pathlib', ''},
    '__main__': {'__future__', 'argparse', 'json', 'sys', 'pathlib', '', '_writer'},
}


def check(root: Path) -> list[str]:
    errors = []
    found = set()
    for source in sorted(root.glob('*.py')):
        name = source.stem
        found.add(name)
        if name not in ALLOWED:
            errors.append(f'{name}: module lacks a declared owner')
            continue
        tree = ast.parse(source.read_text())
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                imports = [n.name for n in node.names] if isinstance(node, ast.Import) else [node.module or '']
                if isinstance(node, ast.ImportFrom) and any(n.name in HOST_EXECUTION for n in node.names):
                    errors.append(f'{name}: imported host execution API')
                for target in imports:
                    if target not in ALLOWED[name]:
                        errors.append(f'{name}: forbidden import {target}')
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Attribute) and node.func.attr in HOST_EXECUTION:
                    errors.append(f'{name}: host execution API')
                if isinstance(node.func, ast.Name) and node.func.id in {'eval', 'exec', '__import__', 'compile'}:
                    errors.append(f'{name}: dynamic host execution')
                if isinstance(node.func, ast.Attribute) and node.func.attr == 'eval' and name != '_embedded':
                    errors.append(f'{name}: embedded execution outside owner')
    if found != set(ALLOWED):
        errors.append('complete declared module set required')
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('python/umf_codegen/src/umf_codegen'))
    args = parser.parse_args()
    errors = check(args.root)
    if errors:
        raise SystemExit('\n'.join(errors))
    print('Codegen boundaries: embedded V8, filesystem writer and CLI own their separate host effects')
