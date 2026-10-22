"""Explicit selected-input inventory, not a hermetic Cargo build claim."""
from pathlib import Path

ROOT = Path('/Users/erik/.codex/worktrees/1598/umf')
OWNER = Path('/Users/erik/Projects/weft')
TOOL = Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
CONFIGS = [OWNER / '.cargo/config', OWNER / '.cargo/config.toml',
           Path('/private/tmp/weft-toolchain/cargo/config'), Path('/private/tmp/weft-toolchain/cargo/config.toml')]

def selected_inputs():
    paths = {Path(__file__).resolve(), ROOT / 'tools/security/weft-source-demands.py',
             ROOT / 'tools/security/validate-source-demands.py',
             ROOT / 'docs/helix/02-design/spikes/security/owner-semantic-allocation-v0.1.md',
             ROOT / 'docs/helix/02-design/spikes/security/obligation-assignment-v0.1.md',
             ROOT / 'docs/helix/02-design/spikes/security/obligation-source-correspondence-v0.1.md',
             ROOT / 'docs/helix/02-design/spikes/security/source-demand-binding-v0.1.md',
             ROOT / 'docs/helix/02-design/spikes/security/admission-obligation-v0.1.md',
             ROOT / 'docs/helix/02-design/spikes/security/admission-obligation-v0.1.schema.json',
             ROOT / 'docs/helix/02-design/spikes/SPIKE-010-security-result-coverage.md',
             OWNER / 'Cargo.toml', OWNER / 'Cargo.lock', OWNER / 'crates/weft-core/Cargo.toml'}
    aliases = {}
    def visit(path, ancestors):
        resolved = path.resolve(strict=True)
        if path.is_symlink(): aliases[str(path)] = str(resolved)
        if path.is_file(): paths.add(path); return
        if not path.is_dir() or resolved in ancestors: raise RuntimeError('Unknown/cyclic selected input: ' + str(path))
        for child in sorted(path.iterdir()): visit(child, ancestors | {resolved})
    for base in [OWNER / 'crates/weft-core/src', OWNER / 'crates/weft-core/tests',
                 OWNER / 'tests', OWNER / 'docs/helix/02-design/contracts',
                 OWNER / 'docs/helix/03-test/fixtures', OWNER / 'spec/upstream',
                 OWNER / 'vendor', TOOL, TOOL.parent / 'lib']:
        visit(base, set())
    presence = {str(p): p.exists() for p in CONFIGS}
    for config in CONFIGS:
        if config.exists(): visit(config, set())
    return paths, presence, aliases
