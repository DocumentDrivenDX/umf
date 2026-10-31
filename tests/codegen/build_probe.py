# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise the native codegen package resource closure at build time."""
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "python/umf_codegen"
spec = importlib.util.spec_from_file_location("codegen_build_hook", PACKAGE / "hatch_build.py")
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


def refuses(instance, label):
    try:
        instance.initialize(None, {})
    except ValueError:
        return
    raise AssertionError(f"{label} accepted by codegen build hook")


with tempfile.TemporaryDirectory() as directory:
    package = Path(directory) / "umf_codegen"
    shutil.copytree(PACKAGE, package, ignore=shutil.ignore_patterns("__pycache__"))
    assets = package / "src/umf_codegen/_resources"
    instance = hook.CustomBuildHook(str(package), {}, None, None, str(package / "dist"), "wheel")
    instance.initialize(None, {})
    manifest = assets / "manifest.json"
    original_manifest = manifest.read_bytes()
    files = json.loads(original_manifest)["files"]
    assert len(files) == 9, "native runtime must have exactly nine trusted resources"

    manifest.write_bytes(original_manifest + b" ")
    refuses(instance, "changed release manifest")
    manifest.write_bytes(original_manifest)

    first = assets / next(iter(files))
    original_resource = first.read_bytes()
    first.write_bytes(original_resource + b" ")
    refuses(instance, "changed resource")
    first.write_bytes(original_resource)

    extra = assets / "unlisted.json"
    extra.write_text("{}")
    refuses(instance, "unlisted resource")
    extra.unlink()
    instance.initialize(None, {})

print(json.dumps({"packagingHookControls": ["pinned-cohort-passes", "changed-manifest-refuses", "changed-resource-refuses", "unlisted-resource-refuses"]}))
