# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify packaged generator assets; never build JavaScript during Python packaging."""
import ast
import hashlib
import json
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        root = Path(self.root)
        package = root / 'src/umf_codegen'
        constants = ast.parse((package / '_release.py').read_text())
        pin = next(ast.literal_eval(n.value) for n in constants.body
                   if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'MANIFEST_SHA256' for t in n.targets))
        assets = package / '_assets'
        raw = (assets / 'manifest.json').read_bytes()
        if hashlib.sha256(raw).hexdigest() != pin:
            raise ValueError('Codegen manifest pin differs')
        manifest = json.loads(raw)
        files = manifest['files']
        if {str(p.relative_to(assets)) for p in assets.rglob('*') if p.is_file()} != set(files) | {'manifest.json'}:
            raise ValueError('Codegen payload inventory differs')
        for name, expected in files.items():
            if hashlib.sha256((assets / name).read_bytes()).hexdigest() != expected:
                raise ValueError('Codegen asset differs: ' + name)
        repository = root.parent.parent
        if (repository / '.helix.yml').exists():
            for name, expected in manifest['inputs'].items():
                if name.startswith('node_modules/'):
                    continue
                path = repository / name
                if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
                    raise ValueError('Stale generator source; run bun scripts/build-codegen.ts: ' + name)
