# SPDX-License-Identifier: MIT OR Apache-2.0
"""Real installed seeded/fixed wheels against one unchanged generated package."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inventory(folder):
    return {
        str(p.relative_to(folder)): sha(p)
        for p in sorted(folder.rglob("*"))
        if p.is_file()
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--dependency-python", type=Path, required=True)
    parser.add_argument("--bun", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    args = parser.parse_args()
    work = args.work.resolve()
    work.mkdir(parents=True, exist_ok=False)
    commands = []
    report = {
        "status": "fail",
        "scope": "STP-081 AC7 non-temporal installed two-wheel proof; no native or temporal qualification",
        "commands": commands,
    }
    env = {
        k: v
        for k, v in os.environ.items()
        if k not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "MYPYPATH"}
    }

    def run(label, argv, cwd=ROOT):
        result = subprocess.run(
            list(map(str, argv)),
            cwd=cwd,
            env=env,
            text=True,
            capture_output=True,
            check=False,
        )
        (work / (label + ".stdout")).write_text(result.stdout)
        (work / (label + ".stderr")).write_text(result.stderr)
        commands.append(
            {
                "label": label,
                "argv": list(map(str, argv)),
                "exitCode": result.returncode,
            }
        )
        if result.returncode:
            raise AssertionError(label + ": " + result.stderr)
        return result.stdout

    try:
        fixed_dir = work / "fixed-wheel"
        fixed_dir.mkdir()
        fixed = fixed_dir / args.wheel.name
        shutil.copyfile(args.wheel, fixed)
        source = work / "seeded-source"
        (source / "src").mkdir(parents=True)
        with zipfile.ZipFile(fixed) as archive:
            for name in archive.namelist():
                if name.startswith("umf_access/") and not name.endswith("/"):
                    target = source / "src" / name
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(name))
        shutil.copyfile(
            ROOT / "python/umf_access/pyproject.toml", source / "pyproject.toml"
        )
        values = source / "src/umf_access/values.py"
        original = values.read_text()
        defect = 'raise ValueRuleError("decimal requires rounding at authored scale")'
        assert original.count(defect) == 1
        values.write_text(
            original.replace(
                defect,
                "pass  # Deliberate AC7 seeded scale defect; test artifact only.",
            )
        )
        seeded_dir = work / "seeded-wheel"
        run(
            "build-seeded-wheel",
            [
                sys.executable,
                "-m",
                "build",
                "--wheel",
                "--no-isolation",
                "--outdir",
                seeded_dir,
                source,
            ],
        )
        seeded = next(seeded_dir.glob("*.whl"))
        with zipfile.ZipFile(fixed) as old, zipfile.ZipFile(seeded) as new:
            payloads = [
                n
                for n in old.namelist()
                if n.startswith("umf_access/") and not n.endswith("/")
            ]
            changed = [n for n in payloads if old.read(n) != new.read(n)]
            assert changed == ["umf_access/values.py"], changed
        run(
            "author-fixture",
            [
                args.bun,
                ROOT / "scripts/access-runtime-fix-fixture.ts",
                work / "fixture",
            ],
        )
        output = work / "generated"
        cli = [args.bun, ROOT / "scripts/umf-access-generate.ts"]
        flags = [
            "--request",
            work / "fixture/request.json",
            "--profile",
            work / "fixture/profile.json",
            "--output",
            output,
        ]
        run("generate-once", [*cli, "generate", *flags])
        before = inventory(output)
        dependency_site = run(
            "dependency-site",
            [
                args.dependency_python,
                "-I",
                "-c",
                "import sysconfig;print(sysconfig.get_path('purelib'))",
            ],
        ).strip()
        probe = """import hashlib,importlib.metadata,json,sys,zipfile
from pathlib import Path
import umf_access
from decimal import Decimal
wheel=Path(sys.argv[1]);generated=Path(sys.argv[2]);mode=sys.argv[3]
assert sys.version_info[:3] == (3,14,8)
assert importlib.metadata.version('pydantic') == '2.14.1'
assert umf_access.RUNTIME_ABI == 'umf-access-runtime/0.1'
site=Path(umf_access.__file__).parent.parent
with zipfile.ZipFile(wheel) as archive:
 payloads=[n for n in archive.namelist() if n.startswith('umf_access/') and not n.endswith('/')]
 for name in payloads: assert(site/name).read_bytes()==archive.read(name),name
sys.path.insert(0,str(generated))
from runtime_fix import OrderCreate
from runtime_fix.codecs import encode_Order_create
if mode=='seeded':
 result=encode_Order_create(OrderCreate(order_id='proof',amount=Decimal('1.234')))
 assert result['amount'].as_tuple()==Decimal('1.234').as_tuple()
else:
 try: encode_Order_create(OrderCreate(order_id='proof',amount=Decimal('1.234')))
 except ValueError as error:
  assert 'amount' in str(error) and 'scale' in str(error)
 else: raise AssertionError('scale defect survived fixed wheel')
print(json.dumps({'status':'pass','mode':mode,'wheelSha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),'runtime':umf_access.__file__,'verifiedPayloads':len(payloads)}))
"""
        observations = []
        for mode, wheel in [("seeded", seeded), ("fixed", fixed)]:
            environment = work / (mode + "-env")
            run(
                mode + "-venv",
                ["uv", "venv", "--python", args.dependency_python, environment],
            )
            python = environment / "bin/python"
            run(
                mode + "-install",
                ["uv", "pip", "install", "--python", python, "--no-deps", wheel],
            )
            site = run(
                mode + "-site",
                [
                    python,
                    "-I",
                    "-c",
                    "import sysconfig;print(sysconfig.get_path('purelib'))",
                ],
            ).strip()
            (Path(site) / "dependency-profile.pth").write_text(dependency_site + "\n")
            observed = json.loads(
                run(
                    mode + "-probe",
                    [python, "-I", "-B", "-c", probe, wheel, output, mode],
                    cwd=work,
                )
            )
            run(mode + "-drift-check", [*cli, "check", *flags])
            assert inventory(output) == before
            observations.append(observed)
        report.update(
            status="pass",
            fixedWheelSha256=sha(fixed),
            seededWheelSha256=sha(seeded),
            changedRuntimePayloads=changed,
            generatedInventory=before,
            observations=observations,
            temporal="HELD",
        )
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        (work / "proof.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "pass", "report": str(work / "proof.json")}))


if __name__ == "__main__":
    main()
