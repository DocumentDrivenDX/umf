# SPDX-License-Identifier: MIT OR Apache-2.0
"""Local-only installed-wheel replay. No checkout runtime fallback or publishing."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import json
import os
import platform
import re
import stat
import subprocess
import sys
import tempfile
import zipfile
from email.parser import BytesParser
from pathlib import Path, PurePosixPath


def isolated_environment(environ: dict[str, str]) -> dict[str, str]:
    forbidden = {
        "PYTHONPATH",
        "PYTHONHOME",
        "MYPYPATH",
        "VIRTUAL_ENV",
        "CONDA_PREFIX",
        "PYRIGHT_PYTHON_FORCE_VERSION",
    }
    return {key: value for key, value in environ.items() if key not in forbidden}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in value.split("/") or "\\" in value:
        raise ValueError("unsafe artifact path")
    return path


def check_runtime_pin(actual: dict, expected: dict) -> None:
    if actual != expected:
        raise ValueError("generated manifest runtime distribution/version/ABI mismatch")


def inspect_wheel(path: Path, pin: dict) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("duplicate wheel member")
        for info in archive.infolist():
            safe_relative(info.filename)
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError("wheel symlink")
        files = {name: archive.read(name) for name in names if not name.endswith("/")}
    metadata = [name for name in files if name.endswith(".dist-info/METADATA")]
    if len(metadata) != 1:
        raise ValueError("wheel must have one distribution metadata record")
    meta = BytesParser().parsebytes(files[metadata[0]])

    def normalized(text):
        return re.sub(r"[-_.]+", "-", text).lower()

    if (
        normalized(meta.get("Name", "")) != normalized(pin["distribution"])
        or meta.get("Version") != pin["version"]
    ):
        raise ValueError("wheel distribution/version mismatch")
    dist_info = metadata[0].rsplit("/", 1)[0] + "/"
    if any(not (name.startswith(("umf_access/", dist_info))) for name in files):
        raise ValueError("unexpected wheel namespace")
    if "umf_access/__init__.py" not in files or "umf_access/py.typed" not in files:
        raise ValueError("wheel lacks runtime facade or typing marker")
    return files


def verify_installed_files(files: dict[str, bytes], site: Path) -> None:
    for name, expected in files.items():
        if name.endswith(".dist-info/RECORD"):
            continue  # Installer adds INSTALLER/direct_url and rewrites RECORD.
        path = site.joinpath(*safe_relative(name).parts)
        if path.is_symlink() or not path.is_file() or path.read_bytes() != expected:
            raise ValueError("installed wheel member differs: " + name)
    expected = {name for name in files if name.startswith("umf_access/")}
    actual = {
        str(path.relative_to(site)).replace(os.sep, "/")
        for path in (site / "umf_access").rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }
    if expected != actual:
        raise ValueError("installed runtime inventory differs from wheel")


def check_generated_inventory(root: Path, manifest: dict) -> None:
    if root.is_symlink():
        raise ValueError("generated root symlink")
    root = root.resolve()
    inventory = manifest.get("inventory")
    if not isinstance(inventory, list) or not inventory:
        raise ValueError("generated manifest inventory missing")
    seen = set()
    for member in inventory:
        relative = safe_relative(member["path"])
        if str(relative) in seen:
            raise ValueError("duplicate generated inventory path")
        seen.add(str(relative))
        path = root.joinpath(*relative.parts)
        inside = [path] + [
            parent for parent in path.parents if parent.is_relative_to(root)
        ]
        if any(parent.is_symlink() for parent in inside):
            raise ValueError("generated inventory symlink")
        if not path.is_file() or sha(path) != member["sha256"]:
            raise ValueError("generated output differs from manifest")
    packages = {PurePosixPath(member["path"]).parts[0] for member in inventory}
    actual_python = {
        str(path.relative_to(root)).replace(os.sep, "/")
        for package in packages
        for path in (root / package).rglob("*.py")
    }
    if not actual_python.issubset(seen):
        raise ValueError("generated Python outside manifest inventory")
    if (root / "umf_access").exists() or (root / "umf_access.py").exists():
        raise ValueError("generated root shadows runtime")


def classify_import_open(value: str, flags: int, site: Path | None = None) -> str:
    if flags & (os.O_WRONLY | os.O_RDWR | os.O_APPEND | os.O_CREAT | os.O_TRUNC):
        raise ValueError("import attempted file write")
    if Path(value).suffix in {".py", ".pyc", ".so", ".pyd"}:
        return "module"
    # CPython macOS sysconfig initialization during zoneinfo/Pydantic loading.
    # Retain this qualified exception; never claim a cold import opens no metadata.
    if value == "/System/Library/CoreServices/SystemVersion.plist":
        return "stdlib-loader-platform-metadata"
    path = Path(value)
    if (
        site is not None
        and path.name in {"entry_points.txt", "METADATA"}
        and path.parent.name.endswith(".dist-info")
        and path.parent.parent.resolve() == site.resolve()
    ):
        return "installed-distribution-loader-metadata"
    raise ValueError("import attempted non-module file I/O: " + path.name)


def check_public_runtime_abi(runtime: object, pin: dict) -> None:
    if getattr(runtime, "RUNTIME_ABI", None) != pin["abi"]:
        raise ValueError("runtime public RUNTIME_ABI mismatch or missing")


def child(config: dict, *, runtime_only: bool = False) -> dict:
    profile = config["profile"]
    if platform.python_version() != profile["python"]:
        raise ValueError("Python execution pin mismatch")
    if os.environ.get("PYTHONPATH") or os.environ.get("PYTHONHOME"):
        raise ValueError("ambient Python path is prohibited")
    root = None
    if not runtime_only:
        manifest = json.loads(Path(config["manifest"]).read_text())
        check_runtime_pin(manifest.get("runtimeAbi", {}), profile["runtimeAbi"])
        root = Path(config["generatedRoot"]).resolve()
        check_generated_inventory(root, manifest)
    for name, version in profile["runtimeDependencies"].items():
        if importlib.metadata.version(name) != version:
            raise ValueError("runtime dependency pin mismatch: " + name)
    pin = profile["runtimeAbi"]
    distribution = importlib.metadata.distribution(pin["distribution"])
    if distribution.version != pin["version"]:
        raise ValueError("installed runtime version mismatch")
    site = Path(distribution.locate_file("")).resolve()
    if not site.is_relative_to(Path(sys.prefix).resolve()):
        raise ValueError("runtime is outside isolated environment")
    verify_installed_files(inspect_wheel(Path(config["wheel"]), pin), site)
    reads = []
    loader_metadata = []

    def audit(event: str, args: tuple) -> None:
        if event.startswith(("socket.", "subprocess.")) or event in {
            "os.system",
            "os.exec",
            "os.posix_spawn",
        }:
            raise ValueError("import attempted network/process I/O")
        if event == "open" and isinstance(args[0], (str, bytes)):
            value = os.fsdecode(args[0])
            category = classify_import_open(value, args[2], site)
            if category != "module":
                loader_metadata.append({"path": value, "classification": category})
            reads.append(value)

    sys.addaudithook(audit)
    runtime = importlib.import_module("umf_access")
    check_public_runtime_abi(runtime, pin)
    for module_name, exports in profile["requiredExports"].items():
        module = importlib.import_module(module_name)
        origin = Path(module.__file__).resolve()
        if not origin.is_relative_to(site / "umf_access"):
            raise ValueError("runtime module loaded outside installed wheel")
        for name in exports:
            if not hasattr(module, name):
                raise ValueError(
                    "required runtime export missing: " + module_name + "." + name
                )
    generated_path = None
    if root is not None:
        sys.path.insert(
            0, str(root)
        )  # Explicit generated output only; runtime already verified.
        generated = importlib.import_module(config["package"])
        if not Path(generated.__file__).resolve().is_relative_to(root):
            raise ValueError("generated package imported outside declared output")
        generated_path = str(generated.__file__)
    forbidden = set(profile["forbiddenImports"]) & {
        name.split(".")[0] for name in sys.modules
    }
    if forbidden:
        raise ValueError("forbidden runtime imports: " + ",".join(sorted(forbidden)))
    return {
        "status": "pass",
        "installedRuntime": str(runtime.__file__),
        "generatedPackage": generated_path,
        "scope": "installed runtime only; generated replay UNTESTED"
        if runtime_only
        else "installed runtime plus generated-package import",
        "moduleReads": len(reads),
        "moduleLoaderMetadataReads": loader_metadata,
        "ioScope": "Module reads plus explicitly recorded CPython platform-loader metadata only; not blanket cold-process zero-I/O acceptance",
        "runtimeAbi": pin,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--child", type=Path)
    parser.add_argument("--runtime-only-child", type=Path)
    parser.add_argument("--wheel", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--build-report", type=Path)
    parser.add_argument("--generated-root", type=Path)
    parser.add_argument("--package")
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--checker-python", type=Path, default=Path(sys.executable))
    args = parser.parse_args()
    if args.child or args.runtime_only_child:
        try:
            config_path = args.child or args.runtime_only_child
            result = child(
                json.loads(config_path.read_text()),
                runtime_only=args.runtime_only_child is not None,
            )
            print(json.dumps(result))
            return 0
        # Retain native failure custody across cleanup, cancellation and audit boundaries.
        except Exception as error:  # noqa: BLE001
            print(json.dumps({"status": "refused", "reason": str(error)}))
            return 1
    if not all(
        (
            args.wheel,
            args.manifest,
            args.generated_root,
            args.package,
            args.profile,
            args.report,
            args.build_report,
        )
    ):
        parser.error(
            "wheel, build-report, manifest, generated-root, package, profile and report are required"
        )
    report = {
        "harnessSha256": sha(Path(__file__)),
        "kind": "local-production-installed-wheel-replay",
        "status": "UNTESTED",
        "commands": [],
        "nativeTargets": "UNTESTED; no selected driver/platform",
        "storyAcceptance": "Not B-TP-004 closure",
    }
    env = isolated_environment(dict(os.environ))
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    def execute(command: list[str], cwd: Path) -> subprocess.CompletedProcess:
        result = subprocess.run(
            command, cwd=cwd, env=env, text=True, capture_output=True, check=False
        )
        report["commands"].append(
            {
                "command": command,
                "exitCode": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
            }
        )
        if result.returncode:
            raise ValueError("replay command failed; see retained command outcome")
        return result

    try:
        build_report = json.loads(args.build_report.read_text())
        if build_report.get("status") != "pass" or build_report.get(
            "wheelSha256"
        ) != sha(args.wheel):
            raise ValueError("wheel lacks matching passing build report")
        report["buildReportSha256"] = sha(args.build_report)
        report["runtimeSources"] = build_report["sources"]
        profile = json.loads(args.profile.read_text())
        if platform.python_version() != profile["python"]:
            raise ValueError("replay host Python pin mismatch")
        manifest = json.loads(args.manifest.read_text())
        if (
            manifest.get("contract") != "umf-access-generate/0.1"
            or manifest.get("abi") != "umf-python-types/0.1"
        ):
            raise ValueError("generated package contract/ABI mismatch")
        check_runtime_pin(manifest.get("runtimeAbi", {}), profile["runtimeAbi"])
        inspect_wheel(args.wheel, profile["runtimeAbi"])
        check_generated_inventory(args.generated_root.resolve(), manifest)
        if not args.package.isidentifier() or args.package == "umf_access":
            raise ValueError("invalid generated package name")
        report.update(
            profileSha256=sha(args.profile),
            wheelSha256=sha(args.wheel),
            manifestSha256=sha(args.manifest),
            generatedInventory=manifest["inventory"],
        )
        with tempfile.TemporaryDirectory(prefix="umf-access-installed-") as temporary:
            work = Path(temporary)
            execute(
                [sys.executable, "-m", "venv", "--without-pip", str(work / "venv")],
                work,
            )
            python = work / "venv/bin/python"
            pins = [
                f"{name}=={version}"
                for name, version in profile["runtimeDependencies"].items()
            ]
            execute(
                [
                    "uv",
                    "pip",
                    "install",
                    "--offline",
                    "--python",
                    str(python),
                    str(args.wheel.resolve()),
                    *pins,
                ],
                work,
            )
            config = {
                "profile": profile,
                "wheel": str(args.wheel.resolve()),
                "manifest": str(args.manifest.resolve()),
                "generatedRoot": str(args.generated_root.resolve()),
                "package": args.package,
            }
            config_path = work / "replay.json"
            config_path.write_text(json.dumps(config))
            execute(
                [
                    str(python),
                    "-I",
                    "-B",
                    str(Path(__file__).resolve()),
                    "--child",
                    str(config_path),
                ],
                work,
            )
            checker_python = str(args.checker_python.absolute())
            execute(
                [
                    checker_python,
                    "-I",
                    "-c",
                    f'import importlib.metadata as m; assert m.version("mypy")=={profile["checkers"]["mypy"]!r}; assert m.version("pyright")=={profile["checkers"]["pyright"]!r}',
                ],
                work,
            )
            package_root = args.generated_root.resolve() / args.package
            sources = [str(path) for path in sorted(package_root.rglob("*.py"))]
            if not sources:
                raise ValueError("no generated Python source")
            mypy_config = work / "mypy.ini"
            mypy_config.write_text(
                "[mypy]\npython_version = 3.12\ncheck_untyped_defs = True\ndisallow_any_generics = True\nwarn_unused_ignores = True\n"
            )
            pyright_config = work / "pyrightconfig.json"
            pyright_config.write_text(
                json.dumps(
                    {
                        "pythonVersion": "3.12",
                        "typeCheckingMode": "strict",
                        "extraPaths": [str(args.generated_root.resolve())],
                        "reportUnusedImport": False,
                    }
                )
            )
            env["MYPY_CACHE_DIR"] = str(work / "mypy-cache")
            execute(
                [
                    checker_python,
                    "-I",
                    "-m",
                    "mypy",
                    "--python-executable",
                    str(python),
                    "--config-file",
                    str(mypy_config),
                    *sources,
                ],
                work,
            )
            execute(
                [
                    checker_python,
                    "-I",
                    "-m",
                    "pyright",
                    "--pythonpath",
                    str(python),
                    "--project",
                    str(pyright_config),
                    *sources,
                ],
                work,
            )
            report["checkerConfigurations"] = {
                "mypy": mypy_config.read_text(),
                "pyright": json.loads(pyright_config.read_text()),
            }
            check_generated_inventory(args.generated_root.resolve(), manifest)
            if (
                sha(args.wheel) != report["wheelSha256"]
                or sha(args.manifest) != report["manifestSha256"]
            ):
                raise ValueError("wheel or manifest changed during replay")
            report["status"] = "pass"
    # Retain native failure custody across cleanup, cancellation and audit boundaries.
    except Exception as error:  # noqa: BLE001
        report.update(status="refused", reason=str(error))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "report": str(args.report)}))
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
