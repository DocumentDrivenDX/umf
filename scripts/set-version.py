# SPDX-License-Identifier: MIT OR Apache-2.0
"""Move every manifest of the coupled UMF release (Rust, SDK, Python core, codegen, access) to one version.

    python scripts/set-version.py 0.10.12 [--no-regenerate]

Edits the version strings, then regenerates the outputs that embed digests of them
(metamodel, action runtime resources, codegen resources, action plan identity).
Afterwards run `python scripts/check-release-versions.py --access` and `bun scripts/metamodel/build.ts --check`.
The document/core format version (spec/release.json coreVersion) is not touched.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Files that repeat the umf-access version as data (compatibility profiles, wheel/identity tests, fixtures).
ACCESS_PIN_FILES = [
    "python/umf_access/compatibility-profile.json",
    "python/umf_access/compatibility-profile-linux311.json",
    "python/umf_access/tests/packaging/runtime_identity_e2e.py",
    "python/umf_access/tests/test_wheel_contract.py",
    "scripts/access-runtime-fix-fixture.ts",
]
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def sub(path, pattern, repl, count=1):
    file = ROOT / path
    text = file.read_text()
    new, n = re.subn(pattern, repl, text, flags=re.M)
    if n != count:
        sys.exit(f"{path}: expected {count} match(es) for {pattern!r}, found {n}")
    file.write_text(new)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1 or not SEMVER.match(args[0]):
        sys.exit(__doc__)
    new = args[0]
    old = json.loads((ROOT / "spec/release.json").read_text())["version"]
    series = new.rsplit(".", 1)[0]
    if new == old:
        sys.exit(f"already at {old}")
    if series != json.loads((ROOT / "spec/release.json").read_text())["releaseSeries"]:
        sys.exit("a new release series also needs spec/release.json releaseSeries and the compatibility ranges changed by hand")
    lit = re.escape(old)
    release = ROOT / "spec/release.json"
    text = release.read_text()
    text = re.sub(r'("(?:sdkVersion|pythonVersion|version|rustVersion|nodeVersion|codegenVersion)": ")' + lit + '"', r"\g<1>" + new + '"', text)
    release.write_text(text)
    for path in ["package.json", "bindings/core/node/package.json", "bindings/core/wasm/package.json"]:
        sub(path, r'^(  "version": ")' + lit + '"', r"\g<1>" + new + '"')
    members = re.findall(r'"([^"]+)"', re.search(r"members\s*=\s*\[(.*?)\]", (ROOT / "Cargo.toml").read_text(), re.S)[1])
    bindings = ["bindings/core/node", "bindings/core/python", "bindings/core/wasm", "bindings/pack-tools/wasm"]
    for member in members + bindings:
        sub(f"{member}/Cargo.toml", r'^(version = ")' + lit + '"', r"\g<1>" + new + '"')
    lock = ROOT / "Cargo.lock"
    text = lock.read_text()
    text, n = re.subn(r'(name = "umf-[^"]+"\nversion = ")' + lit + '"', r"\g<1>" + new + '"', text)
    if n != len(members) + len(bindings):
        sys.exit(f"Cargo.lock: updated {n} workspace packages, expected {len(members) + len(bindings)}")
    lock.write_text(text)
    sub("python/pyproject.toml", r'^(version = ")' + lit + '"', r"\g<1>" + new + '"')
    sub("python/src/umf/__init__.py", r'^(__version__ = ")' + lit + '"', r"\g<1>" + new + '"')
    sub("python/umf_codegen/pyproject.toml", r'^(version = ")' + lit + '"', r"\g<1>" + new + '"')
    sub("python/umf_codegen/pyproject.toml", r'"umf-core==' + lit + '"', f'"umf-core=={new}"')
    sub("python/umf_codegen/src/umf_codegen/__init__.py", r'^(__version__ = ")' + lit + '"', r"\g<1>" + new + '"')
    sub("python/umf_codegen/src/umf_codegen/_release.py", r'^((?:UMF_CODEGEN_VERSION|UMF_CORE_VERSION) = ")' + lit + '"', r"\g<1>" + new + '"', 2)
    # umf-access is on the unified line: same version, and it needs at least this umf-core.
    access_file = ROOT / "python/umf_access/src/umf_access/_version.py"
    old_access = re.search(r'__version__ = "([^"]+)"', access_file.read_text())[1]
    if old_access != new:
        for path in ACCESS_PIN_FILES:
            file = ROOT / path
            file.write_text(file.read_text().replace(old_access, new))
    sub("python/umf_access/src/umf_access/_version.py", r'^__version__ = "[^"]+"', f'__version__ = "{new}"')
    sub("python/umf_access/pyproject.toml", r'"umf-core(?:==[^"]+|>=[^"]+)"', f'"umf-core>={new},<{series.split(".")[0]}.{int(series.split(".")[1]) + 1}"')
    if "--no-regenerate" in argv:
        return
    for command in [
        ["bun", "scripts/metamodel/build.ts"],
        [sys.executable, "scripts/action-runtime-resources.py"],
        [sys.executable, "scripts/sync-codegen-resources.py", "--write"],
        ["bun", "scripts/actions-plan-identity.ts"],
    ]:
        print("+", " ".join(command))
        subprocess.run(command, cwd=ROOT, check=True)


if __name__ == "__main__":
    main(sys.argv[1:])
