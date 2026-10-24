# SPDX-License-Identifier: MIT OR Apache-2.0
"""Scoped native generator ownership checks without importing or executing it."""
import argparse
import ast
from pathlib import Path

HOST_EXECUTION = {'system', 'popen', 'spawnl', 'spawnle', 'spawnlp', 'spawnlpe', 'spawnv', 'spawnve', 'spawnvp', 'spawnvpe', 'execl', 'execle', 'execlp', 'execlpe', 'execv', 'execve', 'execvp', 'execvpe', 'posix_spawn', 'posix_spawnp', 'import_module', 'exec_module', 'run_module', 'run_path'}

ALLOWED = {
    '__init__': {'__future__', 'typing', '_native', '_release'},
    '_native': {'__future__', 'hashlib', 'json', 'math', 'os', 'selectors', 'subprocess', 'sys', 'time', 'contextlib', 'importlib', 'importlib.metadata', 'pathlib', 'typing', 'umf._rust', 'umf.rust_codegen', '_release'},
    '_embedded': {'_native'},
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
                if isinstance(node.func, ast.Attribute) and node.func.attr == 'Popen':
                    if name != '_native' or not isinstance(node.func.value, ast.Name) or node.func.value.id != 'subprocess':
                        errors.append(f'{name}: subprocess outside native worker owner')
                    elif (not node.args or not isinstance(node.args[0], ast.List)
                          or len(node.args[0].elts) != 2
                          or not isinstance(node.args[0].elts[0], ast.Call)
                          or not isinstance(node.args[0].elts[0].func, ast.Attribute)
                          or not isinstance(node.args[0].elts[0].func.value, ast.Name)
                          or node.args[0].elts[0].func.value.id != 'os'
                          or node.args[0].elts[0].func.attr != 'fspath'
                          or len(node.args[0].elts[0].args) != 1
                          or not isinstance(node.args[0].elts[0].args[0], ast.Name)
                          or node.args[0].elts[0].args[0].id != 'binary'
                          or not isinstance(node.args[0].elts[1], ast.Starred)
                          or not isinstance(node.args[0].elts[1].value, ast.Name)
                          or node.args[0].elts[1].value.id != 'arguments'):
                        errors.append(f'{name}: native CLI subprocess target changed')
                if isinstance(node.func, ast.Attribute) and node.func.attr in HOST_EXECUTION:
                    errors.append(f'{name}: host execution API')
                if isinstance(node.func, ast.Name) and node.func.id in {'eval', 'exec', '__import__', 'compile'}:
                    errors.append(f'{name}: dynamic host execution')
                if isinstance(node.func, ast.Attribute) and node.func.attr == 'eval':
                    errors.append(f'{name}: embedded execution is retired')
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
    print('Codegen boundaries: installed Rust CLI, filesystem writer and package CLI own their separate host effects')
