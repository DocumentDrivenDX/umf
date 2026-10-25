# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compatibility entrypoint for the canonical manifest-aware SDK packer tests."""
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    subprocess.run(
        [sys.executable, str(ROOT / 'scripts/test-sdk-package.py')],
        cwd=ROOT,
        check=True,
    )


if __name__ == '__main__':
    main()
