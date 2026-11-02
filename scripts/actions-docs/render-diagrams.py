# SPDX-License-Identifier: MIT OR Apache-2.0
"""Compatibility entrypoint: umf.visual owns the Lini rendering implementation."""
from pathlib import Path
import subprocess,sys
renderer=Path(__file__).resolve().parents[1]/'visuals/render-static.ts'
subprocess.run(['bun',str(renderer),'--actions',*sys.argv[1:]],check=True)
