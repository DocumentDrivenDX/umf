#!/usr/bin/env python3
"""Pure source release metadata guard. Does not inspect hosted state or publish."""
from __future__ import annotations

import json
import pathlib
import sys
import tomllib

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) == 2 else '/workspace')
EXPECTED_FEATURES = [
    'ashlar-sdk-ordered-page-candidate',
    'raw-postgresql-reads',
    'ashlar-databricks-paths-keys',
    'ashlar-databricks-qualified',
    'truss-postgresql-pg18',
    'current-postgresql-scalar-candidate',
    'current-databricks-scalar-candidate',
    'current-query-refinement-candidate',
    'current-presence-graph-requirements-candidate',
]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


pyproject = tomllib.loads((ROOT / 'crates/weft-python/pyproject.toml').read_text())
cargo = tomllib.loads((ROOT / 'crates/weft-python/Cargo.toml').read_text())
version = pyproject['project']['version']
require(version == '0.4.56', 'pyproject version must be 0.4.56')
require(cargo['package']['version'] == version, 'Cargo package version differs from pyproject')
require(cargo['package']['name'] == 'weft-python', 'Cargo package name must be weft-python')
require(pyproject['project']['name'] == 'umf-weft', 'pyproject project name must be umf-weft')
features = pyproject['tool']['maturin']['features']
require(features == EXPECTED_FEATURES, 'Maturin feature list differs from the exact P56 nine-feature set')

sys.path.insert(0, str(ROOT / 'scripts/release'))
from publish_pypi_release import distribution_for_version, wheel_prefix_for_version  # noqa: E402

distribution = distribution_for_version(version)
prefix = wheel_prefix_for_version(version)
require(distribution == 'umf-weft', 'source version mapping does not select umf-weft')
require(prefix == 'umf_weft-0.4.56-', 'source wheel prefix mapping differs')

lock = (ROOT / 'Cargo.lock').read_text()
hits = [block for block in lock.split('[[package]]') if '\nname = "weft-python"\n' in block]
require(len(hits) == 1, 'Cargo.lock must contain exactly one weft-python package')
require('\nversion = "0.4.56"\n' in hits[0], 'Cargo.lock weft-python version must be 0.4.56')

print(json.dumps({
    'status': 'PASS',
    'version': version,
    'projectName': pyproject['project']['name'],
    'distribution': distribution,
    'wheelPrefix': prefix,
    'features': features,
    'cargoLockPackage': 'weft-python 0.4.56',
    'tagRequirementForPublication': 'v0.4.56 (not checked for source-only guard)',
}, sort_keys=True))
