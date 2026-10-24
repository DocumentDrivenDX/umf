# SPDX-License-Identifier: MIT OR Apache-2.0
"""Verify the explicit native compiler resource closure at package build time."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

RESOURCE_NAMES = {
    'core.schema.json', 'core.reference-schema.json', 'core.package-schema.json',
    'core.constraints.json', 'core.domain-policy.json', 'tables.package.json',
    'actions.package.json', 'binding.package.json', 'stable-binding.package.json',
}


def _resource_pin(package: Path) -> str:
    tree = ast.parse((package / '_release.py').read_text(encoding='utf-8'))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == 'RESOURCE_MANIFEST_SHA256'
            for target in node.targets
        ):
            return ast.literal_eval(node.value)
    raise ValueError('Codegen resource manifest pin is missing')


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        root = Path(self.root)
        repository = root.resolve().parents[1]
        canonical_check = repository / "scripts/rust-migration/r4/sync_codegen_resources.py"
        if canonical_check.is_file():
            subprocess.run([sys.executable, str(canonical_check)], cwd=repository, check=True)
        package = root / 'src/umf_codegen'
        assets = package / '_resources'
        raw = (assets / 'manifest.json').read_bytes()
        if hashlib.sha256(raw).hexdigest() != _resource_pin(package):
            raise ValueError('Codegen resource manifest pin differs')
        manifest = json.loads(raw)
        if manifest.get('profile') != 'umf.codegen-resources/1':
            raise ValueError('Unsupported codegen resource profile')
        files = manifest.get('files')
        actual = {str(path.relative_to(assets)) for path in assets.rglob('*') if path.is_file() and path.name != 'manifest.json'}
        if not isinstance(files, dict) or set(files) != RESOURCE_NAMES or actual != RESOURCE_NAMES:
            raise ValueError('Codegen resource inventory differs')
        for name, expected in files.items():
            if hashlib.sha256((assets / name).read_bytes()).hexdigest() != expected:
                raise ValueError('Codegen resource differs: ' + name)
