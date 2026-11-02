# SPDX-License-Identifier: MIT OR Apache-2.0
"""Fail closed on drift within the coupled UMF release train; no artifact rewriting."""
import json
import re
import sys
from pathlib import Path
try:
    import tomllib
except ModuleNotFoundError:
    from pip._vendor import tomli as tomllib


def check(root):
    load = lambda path: json.loads((root / path).read_text())
    release = load("spec/release.json")
    core, series = release["coreVersion"], release["releaseSeries"]
    errors = []
    def require(ok, source):
        if not ok:
            errors.append(source)
    artifact = release["version"]
    require(artifact.rsplit(".", 1)[0] == series, "artifact release series")
    sdk = load("package.json")["version"]
    require(sdk == release["sdkVersion"] == artifact and sdk.rsplit(".", 1)[0] == series, "SDK release series/version")
    require(release["rustVersion"] == artifact, "Rust cohort version")
    workspace = tomllib.loads((root / "Cargo.toml").read_text())["workspace"]
    for member in workspace["members"]:
        package = tomllib.loads((root / member / "Cargo.toml").read_text())["package"]
        require(package["version"] == artifact, member + " Rust artifact version")
    require(release["nodeVersion"] == artifact, "Node cohort version")
    for package in ["bindings/core/node/package.json", "bindings/core/wasm/package.json"]:
        require(load(package)["version"] == artifact, package + " artifact version")
    codegen = tomllib.loads((root / "python/umf_codegen/pyproject.toml").read_text())["project"]
    require(codegen["version"] == release["codegenVersion"] == artifact, "Codegen artifact version")
    require("umf-core==" + artifact in codegen["dependencies"], "Codegen exact core dependency")
    require(f'__version__ = "{artifact}"' in (root / "python/umf_codegen/src/umf_codegen/__init__.py").read_text(), "Codegen public version")
    pins = (root / "python/umf_codegen/src/umf_codegen/_release.py").read_text()
    for name in ["UMF_CORE_VERSION", "UMF_CODEGEN_VERSION"]:
        require(f'{name} = "{artifact}"' in pins, "Codegen " + name + " pin")
    schema = load("spec/core/schema.json")
    require(schema["properties"]["umf"]["const"] == core, "core schema")
    generated = (root / "src/generated/core-model.ts").read_text()
    require(f'CURRENT_CORE_VERSION="{core}"' in generated, "generated core model")
    require((root / "spec/metamodel/umf.yaml").read_text().startswith(f"umf: {core}\n"), "authored metamodel")
    for path in sorted((root / "spec/extensions").glob("*/package.json")):
        package = json.loads(path.read_text())
        require(package["coreVersion"] == core, str(path.relative_to(root)))
    require(load("spec/metamodel/package.json")["coreVersion"] == core, "metamodel package")
    action = load("spec/extensions/actions/package.json")
    require(action["version"] == release["actionsVersion"], "action vocabulary version")
    require(f"core {core}" in action["description"], "action package description")
    executor = load("spec/extensions/actions/executor-profile.schema.json")["properties"]
    require(executor["coreVersion"]["const"] == core, "action executor core pin")
    require(executor["actionVersion"]["const"] == release["actionsVersion"], "action executor vocabulary pin")
    require(load("spec/extensions/actions/plan.schema.json")["$defs"]["model"]["properties"]["umfVersion"]["const"] == core, "action plan core pin")
    require(load("spec/extensions/saga/package.json")["version"] == release["sagaVersion"], "saga vocabulary version")
    py = (root / "python/pyproject.toml").read_text()
    match = re.search(r'^version = "([^"]+)"', py, re.M)
    require(bool(match) and match[1].rsplit(".", 1)[0] == series, "Python artifact release series")
    require(bool(match) and match[1] == release["pythonVersion"] == artifact, "Python exact cohort version")
    require(f'__version__ = "{release["pythonVersion"]}"' in (root / "python/src/umf/__init__.py").read_text(), "Python public version")
    for path in sorted((root / "docs/helix/02-design/contracts").glob("CONTRACT-90*.md")):
        text = path.read_text()
        require(not re.search(r'core(?:Version| version)?[ :]+["`]?0\.[89]\.0', text), str(path.relative_to(root)) + " stale normative core pin")
    return errors


if __name__ == "__main__":
    errors = check(Path(__file__).resolve().parents[1])
    if errors:
        sys.exit("UMF release drift: " + "; ".join(errors))
    print("UMF artifact versions agree; core, vocabulary and wire versions remain independently checked.")
