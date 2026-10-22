# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exercise SDK layout allowlisting against an isolated synthetic dist tree."""
from pathlib import Path
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/package-sdk.py"


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="umf-sdk-layout-") as temporary:
        work = Path(temporary)
        files = [
            "dist/umf.js",
            "dist/umf.js.map",
            "dist/loader-contract.js",
            "dist/src/index.d.ts",
            "dist/spec/extensions/actions/package.json",
            "dist/spec/extensions/actions/schema.json",
            "dist/postgresql/runtime.js",
            "dist/protobuf/runtime.js",
            "dist/obsolete-validator.js",
            "dist/explorer.html",
            "dist/not-an-sdk/entry.js",
        ]
        for relative in files:
            path = work / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture\n")
        output = work / ".cache/sdk-distribution"
        output.mkdir(parents=True)
        (output / "package.json").write_text("{}\n")
        (output / "README.md").write_text("fixture\n")
        subprocess.run(["python3", str(SCRIPT)], cwd=work, check=True, capture_output=True, text=True)
        archive_path = work / ".cache/sdk-distribution/umf-sdk.tgz"
        with tarfile.open(archive_path, "r:gz") as archive:
            members = {member.name.removeprefix("package/") for member in archive.getmembers() if member.isfile()}
        assert "dist/umf.js" in members
        assert "dist/src/index.d.ts" in members
        assert "dist/postgresql/runtime.js" in members
        assert "dist/protobuf/runtime.js" in members
        assert "dist/obsolete-validator.js" not in members
        assert "dist/explorer.html" not in members
        assert "dist/not-an-sdk/entry.js" not in members
        print({"isolatedSdkLayout": "pass", "included": len(members), "excludedForbiddenRoots": 3})


if __name__ == "__main__":
    main()
