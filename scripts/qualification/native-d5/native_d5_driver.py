#!/usr/bin/env python3
"""One-run native Linux wrapper for the unchanged G02-D5 local adapters.

The adapter's LOCAL_* identity describes the child runner. GitHub's Q/run
identity remains untouched and is captured separately in operator-run.json.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import signal
import stat
import subprocess
import sys
import threading
import time
import uuid

P_COMMIT = "e4299aff8e87e9d211f9d86df2f2013ab9c95945"
P_TREE = "8b98c0d895983ba2b7637dd3aea567dab0943883"
WORKFLOW_PATH = ".github/workflows/access-boundaries.yml"
WORKFLOW_SHA = "f0963d2df1e371112ba6e57999dbf69290796d711eb97ed46637d4ebc63918a1"
COHORT_LOCK_SHA = "4337ab0597dcec245402abe73bcf8ea1d09bc72a4cb2907473c9e53d0327e611"
EXPECTED_PYTHON_SHA = "ae713815fe406a06f1691856f697a0b1e58b3e986f44e62f0cd0bca2424f1aac"
PYTHON_RELEASE_ID = 401059204
PYTHON_RELEASE_TAG = "3.11.17-36876195594"
PYTHON_ASSET_ID = 603458734
PYTHON_ARCHIVE_SIZE = 92_586_271
PG_IMAGE = "docker.io/library/postgres@sha256:f4b419e350fd98d4a8429603295208976dea4c8fb8326d818d346d3e29f1db6f"
PG_REPO_DIGEST = "sha256:f4b419e350fd98d4a8429603295208976dea4c8fb8326d818d346d3e29f1db6f"
PG_REPO_DIGEST_ALIASES = {
    "docker.io/library/postgres@" + PG_REPO_DIGEST,
    "library/postgres@" + PG_REPO_DIGEST,
    "postgres@" + PG_REPO_DIGEST,
}
PG_SERVER_VERSION = "18.6 (Debian 18.6-1.pgdg13+2)"
OPERATOR_WORKFLOW_PATH = ".github/workflows/native-d5-linux.yml"
DRIVER_PATH = "scripts/qualification/native-d5/native_d5_driver.py"
ACQUIRER_PATH = "scripts/qualification/native-d5/acquire_inputs.py"
LOG_CAP = 1_048_576
EVIDENCE_CAP = 16_777_216
EXTERNAL_STREAM_MAX = 65_536
EXTERNAL_STREAM_MARKER_MAX = 64
D5_SECONDS = 1_800
FINALIZER_RESERVE = 60
TERM_GRACE = 10


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".partial")
    with tmp.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    tmp.replace(path)


class Capture:
    def __init__(self, root: Path, limit: int = LOG_CAP):
        self.root = root
        self.limit = limit
        self.total = 0
        self.truncated = False
        self.lock = threading.Lock()
        root.mkdir(parents=True, exist_ok=True)

    def reader(self, source, name: str) -> None:
        target = self.root / name
        with target.open("ab") as output:
            while True:
                block = source.read(8192)
                if not block:
                    break
                with self.lock:
                    remaining = max(0, self.limit - self.total)
                    keep = block[:remaining]
                    self.total += len(keep)
                    if len(keep) != len(block):
                        self.truncated = True
                if keep:
                    output.write(keep)
                    output.flush()

    def run(self, name: str, argv: list[str], *, timeout: float,
            env: dict[str, str] | None = None, cwd: Path | None = None) -> dict:
        started = time.monotonic()
        proc = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        assert proc.stdout is not None and proc.stderr is not None
        out_thread = threading.Thread(target=self.reader, args=(proc.stdout, name + ".stdout"), daemon=True)
        err_thread = threading.Thread(target=self.reader, args=(proc.stderr, name + ".stderr"), daemon=True)
        out_thread.start(); err_thread.start()
        timed_out = False
        try:
            proc.wait(timeout=max(0.01, timeout))
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                proc.wait(timeout=TERM_GRACE)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait()
        out_thread.join(timeout=TERM_GRACE)
        err_thread.join(timeout=TERM_GRACE)
        if out_thread.is_alive() or err_thread.is_alive():
            self.truncated = True
        return {"name": name, "exitCode": proc.returncode, "timedOut": timed_out,
                "durationSeconds": round(time.monotonic() - started, 3),
                "captureTruncated": self.truncated}


def run_json(capture: Capture, name: str, argv: list[str], *, timeout: float,
             env: dict[str, str] | None = None, cwd: Path | None = None) -> tuple[dict, str | None]:
    before_out = capture.root / (name + ".stdout")
    before_err = capture.root / (name + ".stderr")
    before_out.unlink(missing_ok=True)
    before_err.unlink(missing_ok=True)
    result = capture.run(name, argv, timeout=timeout, env=env, cwd=cwd)
    stdout = before_out.read_text(errors="replace") if before_out.exists() else ""
    return result, stdout


def cleanup_json(capture: Capture, name: str, argv: list[str]) -> tuple[dict, str | None]:
    try:
        return run_json(capture, name, argv, timeout=15)
    except Exception:
        return ({"name": name, "exitCode": None, "timedOut": False,
                 "captureTruncated": False}, None)


def git_value(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=10)
    return result.stdout.strip()


def host_identity() -> dict:
    os_release = {}
    try:
        for line in Path("/etc/os-release").read_text().splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                os_release[key] = value.strip('"')
    except OSError:
        pass
    mem = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        match = re.fullmatch(r"(MemTotal|MemAvailable):\s+(\d+) kB", line)
        if match:
            mem[match.group(1)] = int(match.group(2)) * 1024
    return {"system": platform.system(), "release": platform.release(),
        "machine": platform.machine(), "processor": platform.processor(),
        "osRelease": os_release, "logicalCpuCount": os.cpu_count(),
        "memoryBytes": mem, "hostname": os.environ.get("RUNNER_NAME"),
        "runnerImageOS": os.environ.get("ImageOS"),
        "runnerImageVersion": os.environ.get("ImageVersion"),
        "workflowRunId": os.environ.get("GITHUB_RUN_ID"),
        "workflowRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT")}


def _tree_inventory(root: Path) -> dict[str, Path]:
    inventory = {}
    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in dirs + files:
            path = current_path / name
            relative = path.relative_to(root).as_posix()
            if relative in inventory:
                raise ValueError("Python tree contains a duplicate path")
            inventory[relative] = path
    return inventory


def _verify_python_install(archive_tree: Path, install_root: Path, marker: Path) -> dict:
    if install_root.is_symlink() or not install_root.is_dir() or marker.is_symlink() or not marker.is_file() or marker.stat().st_size != 0:
        raise ValueError("exact Python toolcache installation or marker is invalid")
    expected = _tree_inventory(archive_tree)
    setup_archive = archive_tree / "setup.sh"
    if setup_archive.is_symlink() or not setup_archive.is_file():
        raise ValueError("verified Python archive setup member is unavailable")
    actual = _tree_inventory(install_root)
    aliases = {"python": "./bin/python3.11", "bin/python311": "python3.11",
               "bin/python": "python3.11"}
    expected.pop("setup.sh", None)
    if set(expected) - set(actual):
        raise ValueError("Python toolcache is missing an archive path")
    extras = set(actual) - set(expected)
    extras.discard("python")
    extras.discard("bin/python311")
    extras.discard("bin/python")
    site_prefix = "lib/python3.11/site-packages/"
    extra_records = []
    extra_bytes = 0
    for relative in sorted(extras):
        path = actual[relative]
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            if not relative.startswith(site_prefix):
                raise ValueError("Python toolcache has an unexpected directory")
            extra_records.append({"path": relative, "kind": "directory",
                                 "mode": stat.S_IMODE(info.st_mode)})
            if len(extra_records) > 10_000:
                raise ValueError("Python toolcache site-packages extras exceed bounded inventory")
            continue
        if not relative.startswith(site_prefix):
            raise ValueError("Python toolcache has an unexpected non-archive path")
        if stat.S_ISREG(info.st_mode):
            extra_bytes += info.st_size
            extra_records.append({"path": relative, "kind": "file", "sizeBytes": info.st_size,
                                 "mode": stat.S_IMODE(info.st_mode), "sha256": sha256(path)})
        elif stat.S_ISLNK(info.st_mode):
            extra_records.append({"path": relative, "kind": "symlink", "target": os.readlink(path)})
        else:
            raise ValueError("Python toolcache has a special site-packages entry")
        if len(extra_records) > 10_000 or extra_bytes > 305_635_289:
            raise ValueError("Python toolcache site-packages extras exceed bounded inventory")
    for relative, expected_path in expected.items():
        path = actual[relative]
        expected_info = expected_path.lstat()
        actual_info = path.lstat()
        if stat.S_ISLNK(expected_info.st_mode):
            if not stat.S_ISLNK(actual_info.st_mode) or os.readlink(path) != os.readlink(expected_path):
                raise ValueError("Python toolcache archive symlink mismatch")
        elif stat.S_ISREG(expected_info.st_mode):
            if not stat.S_ISREG(actual_info.st_mode) or actual_info.st_size != expected_info.st_size or sha256(path) != sha256(expected_path):
                raise ValueError("Python toolcache archive file bytes mismatch")
            expected_mode = stat.S_IMODE(expected_info.st_mode)
            actual_mode = stat.S_IMODE(actual_info.st_mode)
            if actual_mode != expected_mode:
                if relative not in {"bin/python3", "bin/python3.11"} or (actual_mode & 0o111) != 0o111 or (actual_mode & 0o666) != (expected_mode & 0o666):
                    raise ValueError("Python toolcache archive file mode mismatch")
        elif stat.S_ISDIR(expected_info.st_mode) and not stat.S_ISDIR(actual_info.st_mode):
            raise ValueError("Python toolcache archive directory mismatch")
    for relative, target in aliases.items():
        path = install_root / relative
        if path.exists() or path.is_symlink():
            if not path.is_symlink() or os.readlink(path) != target:
                raise ValueError("Python toolcache setup alias mismatch")
        else:
            raise ValueError("Python toolcache setup alias missing")
    encoded = b"".join((json.dumps(item, sort_keys=True, separators=(",", ":")) + "\n").encode()
                       for item in extra_records)
    return {"archiveRegularFilesCompared": 9_970, "sourceArchiveSha256": EXPECTED_PYTHON_SHA,
            "sitePackagesExtraFiles": sum(item["kind"] == "file" for item in extra_records),
            "sitePackagesExtraDirectories": sum(item["kind"] == "directory" for item in extra_records),
            "sitePackagesExtraSymlinks": sum(item["kind"] == "symlink" for item in extra_records),
            "sitePackagesExtraBytes": extra_bytes,
            "sitePackagesExtraInventorySha256": hashlib.sha256(encoded).hexdigest(),
            "completeMarkerBytes": marker.stat().st_size}


def install_pinned_python(runtime_archive_tree: Path) -> tuple[Path, dict]:
    toolcache = os.environ.get("RUNNER_TOOL_CACHE")
    if not toolcache:
        raise ValueError("runner tool cache path unavailable")
    toolcache_root = Path(toolcache)
    if toolcache_root != Path("/opt/hostedtoolcache") or toolcache_root.is_symlink() or toolcache_root.resolve() != toolcache_root:
        raise ValueError("Python toolcache root is not the approved canonical path")
    version_root = toolcache_root / "Python" / "3.11.17"
    install_root = version_root / "x64"
    marker = version_root / "x64.complete"
    if version_root.parent.is_symlink() or version_root.parent.resolve() != version_root.parent:
        raise ValueError("Python toolcache parent is linked or noncanonical")
    existing = install_root.exists() or install_root.is_symlink() or marker.exists() or marker.is_symlink()
    if version_root.is_symlink():
        raise ValueError("Python toolcache version path is linked")
    if not existing:
        version_root.mkdir(mode=0o755, parents=True, exist_ok=False)
        shutil.copytree(runtime_archive_tree, install_root, symlinks=True)
        setup = install_root / "setup.sh"
        if setup.exists():
            setup.unlink()
        (install_root / "python").symlink_to("./bin/python3.11")
        bin_dir = install_root / "bin"
        (bin_dir / "python311").symlink_to("python3.11")
        if not (bin_dir / "python").exists():
            (bin_dir / "python").symlink_to("python3.11")
        (install_root / "python").chmod(0o755)
        for name in ("python3", "python3.11", "python311", "python"):
            path = bin_dir / name
            if path.exists() and not path.is_symlink():
                path.chmod(path.stat().st_mode | 0o111)
        marker.touch(exist_ok=False)
    bin_dir = install_root / "bin"
    tree_validation = _verify_python_install(runtime_archive_tree, install_root, marker)
    return bin_dir, {"toolcacheRoot": str(install_root), "completeMarker": str(marker),
        "runtimeArchiveSha256": EXPECTED_PYTHON_SHA, "pipUpgradeRan": False,
        "setupScriptExecuted": False, "provisioning": "existing-prefix-byte-verified" if existing else "exact-archive-installed-at-canonical-prefix",
        "archiveComparison": tree_validation}


def validate_context(workflow_q: Path, candidate: Path, inputs: dict) -> dict:
    required_env = ("GITHUB_REPOSITORY", "GITHUB_EVENT_NAME", "GITHUB_REF", "GITHUB_SHA",
                    "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_WORKFLOW_REF", "GITHUB_WORKFLOW_SHA")
    if any(not os.environ.get(key) for key in required_env):
        raise ValueError("workflow identity context missing")
    if os.environ["GITHUB_REPOSITORY"] != "DocumentDrivenDX/umf" or os.environ["GITHUB_EVENT_NAME"] != "workflow_dispatch":
        raise ValueError("unexpected repository or event")
    if not re.fullmatch(r"refs/(heads|tags)/[A-Za-z0-9._/-]+", os.environ["GITHUB_REF"]):
        raise ValueError("workflow ref malformed")
    if not re.fullmatch(r"[0-9a-f]{40}", os.environ["GITHUB_SHA"]):
        raise ValueError("workflow Q commit malformed")
    q_head = git_value(workflow_q, "rev-parse", "HEAD")
    if q_head != os.environ["GITHUB_SHA"]:
        raise ValueError("workflow checkout does not match actual event Q")
    q_status = git_value(workflow_q, "status", "--porcelain", "--untracked-files=all")
    if q_status:
        raise ValueError("workflow Q checkout is dirty")
    if git_value(candidate, "rev-parse", "HEAD") != P_COMMIT:
        raise ValueError("producer source P checkout mismatch")
    if git_value(candidate, "rev-parse", "HEAD^{tree}") != P_TREE:
        raise ValueError("producer source tree mismatch")
    if git_value(candidate, "status", "--porcelain", "--untracked-files=all"):
        raise ValueError("producer sparse checkout is dirty")
    workflow = candidate / WORKFLOW_PATH
    if not workflow.is_file() or sha256(workflow) != WORKFLOW_SHA:
        raise ValueError("producer D5 workflow source hash mismatch")
    q_workflow = workflow_q / OPERATOR_WORKFLOW_PATH
    q_driver = workflow_q / DRIVER_PATH
    q_acquirer = workflow_q / ACQUIRER_PATH
    for path in (q_workflow, q_driver, q_acquirer):
        if path.is_symlink() or not path.is_file():
            raise ValueError("operator workflow source file missing or linked")
    lock = inputs / "carrier" / "cohort" / "cohort.lock.json"
    if sha256(lock) != COHORT_LOCK_SHA:
        raise ValueError("carrier current cohort lock mismatch")
    return {"workflowRepository": os.environ["GITHUB_REPOSITORY"],
        "eventName": os.environ["GITHUB_EVENT_NAME"], "eventRef": os.environ["GITHUB_REF"],
        "eventShaQ": os.environ["GITHUB_SHA"], "workflowRef": os.environ["GITHUB_WORKFLOW_REF"],
        "workflowSha": os.environ["GITHUB_WORKFLOW_SHA"],
        "workflowQTree": git_value(workflow_q, "rev-parse", "HEAD^{tree}"),
        "operatorHarnessFiles": {
            OPERATOR_WORKFLOW_PATH: sha256(q_workflow),
            DRIVER_PATH: sha256(q_driver),
            ACQUIRER_PATH: sha256(q_acquirer)},
        "runId": os.environ["GITHUB_RUN_ID"], "runAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
        "producerSourceP": P_COMMIT, "producerTree": P_TREE,
        "producerWorkflowPath": WORKFLOW_PATH, "producerWorkflowSha256": WORKFLOW_SHA,
        "cohortLockSha256": COHORT_LOCK_SHA}


def files_under(root: Path, *, max_bytes: int = EVIDENCE_CAP) -> tuple[list[tuple[Path, int]], int]:
    files = []
    total = 0
    if not root.is_dir() or root.is_symlink():
        raise ValueError("D5 upload directory missing or linked")
    for path in root.rglob("*"):
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            continue
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("D5 output contains a non-regular member")
        relative = path.relative_to(root)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("D5 output path escaped root")
        total += info.st_size
        if len(files) >= 512 or total > max_bytes:
            raise ValueError("D5 output exceeds evidence family bounds")
        files.append((path, info.st_size))
    return files, total


def _copy_tree_with_receipt(source: Path, output: Path, destination_name: str,
                            *, max_bytes: int) -> tuple[list[dict], int]:
    files, total = files_under(source, max_bytes=max_bytes)
    output.mkdir(parents=True, exist_ok=True)
    destination_root = output / destination_name
    if destination_root.exists() or destination_root.is_symlink():
        raise ValueError("D5 evidence destination is not fresh")
    roster = []
    for source_path, expected_size in files:
        rel = source_path.relative_to(source)
        dest = destination_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        before = source_path.lstat()
        if before.st_size != expected_size or not stat.S_ISREG(before.st_mode):
            raise ValueError("D5 output changed before copy")
        digest = sha256(source_path)
        shutil.copyfile(source_path, dest)
        after = source_path.lstat()
        if after.st_size != expected_size or sha256(dest) != digest:
            raise ValueError("D5 output copy custody mismatch")
        roster.append({"path": str(PurePosixPath(destination_name) / PurePosixPath(rel.as_posix())),
                       "sizeBytes": expected_size, "sha256": digest})
    return roster, total


def copy_upload_tree(source: Path, output: Path) -> tuple[list[dict], int]:
    return _copy_tree_with_receipt(source, output, "d5-upload", max_bytes=EVIDENCE_CAP)


def copy_release_payload(source: Path, output: Path) -> dict:
    expected_names = {"umf_access-0.1.0.dev8-py3-none-any.whl",
                      "umf_codegen-0.1.0a5-py3-none-any.whl",
                      "release-payload-receipt.json"}
    files, total = files_under(source, max_bytes=2_097_152)
    if {path.name for path, _ in files} != expected_names or any(path.parent != source for path, _ in files):
        raise ValueError("D5 release payload exact roster mismatch")
    roster, copied_total = _copy_tree_with_receipt(source, output, "d5-release-payload", max_bytes=2_097_152)
    if copied_total != total:
        raise ValueError("D5 release payload changed during copy")
    return {"path": "d5-release-payload", "sizeBytes": total, "files": roster}


def output_family_bytes(root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            total += info.st_size
        elif not stat.S_ISDIR(info.st_mode):
            raise ValueError("evidence contains a non-regular path")
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--workflow-q", type=Path, required=True)
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--runner-temp", type=Path, required=True)
    parser.add_argument("--acquisition-receipt", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_root
    if output.is_symlink() or (output.exists() and not output.is_dir()):
        raise SystemExit("OUTPUT_REJECTED: evidence output path is not a regular directory")
    if output.exists():
        initial = list(output.iterdir())
        expected = {"outer-logs"}
        if {path.name for path in initial} != expected:
            raise SystemExit("OUTPUT_REJECTED: evidence output has unexpected initial paths")
        outer = output / "outer-logs"
        if outer.is_symlink() or not outer.is_dir():
            raise SystemExit("OUTPUT_REJECTED: initial outer log directory is linked or invalid")
        allowed_outer = {"acquisition.stdout", "acquisition.stderr"}
        for path in outer.iterdir():
            info = path.lstat()
            if path.name not in allowed_outer or not stat.S_ISREG(info.st_mode) or info.st_size > 65_536:
                raise SystemExit("OUTPUT_REJECTED: unexpected acquisition log member")
    output.mkdir(parents=True, mode=0o700, exist_ok=True)
    capture = Capture(output / "outer-logs")
    outer_started = time.monotonic()
    exec_id = f"gha-local-d5:{os.environ.get('GITHUB_RUN_ID','unknown')}:{os.environ.get('GITHUB_RUN_ATTEMPT','unknown')}"
    d5_root = args.runner_temp / f"umf-g02-d5-{os.environ.get('GITHUB_RUN_ID','0')}-{os.environ.get('GITHUB_RUN_ATTEMPT','0')}"
    cohort_tmp = Path("/tmp/umf-g02-cohort")
    pg_name = "umf-d5-pg-" + re.sub(r"[^a-zA-Z0-9]", "", exec_id)[-20:]
    network_name = pg_name + "-net"
    pg_password = uuid.uuid4().hex + uuid.uuid4().hex
    step_results = []
    pg_context = {"image": PG_IMAGE, "containerName": pg_name, "networkName": network_name,
                  "cleanupVerified": False}
    d5_receipt = None
    d5_status = "FAIL_OR_UNKNOWN"
    error_code = None
    source_context = None
    source_post_context = None
    acquisition = None
    host = None
    python_install = None
    release_payload_context = None
    d5_started = False
    docker_created = False
    network_created = False
    cohort_created = False
    try:
        acquisition = json.loads(args.acquisition_receipt.read_text())
        if acquisition.get("status") != "verified" or acquisition.get("profile") != "umf.g02-d5-native-input-acquisition/1":
            raise ValueError("input acquisition receipt not verified")
        acquired_python = acquisition.get("pythonRuntime")
        python_archive = args.input_root / "python-3.11.17-linux-24.04-x64.tar.gz"
        if (not isinstance(acquired_python, dict) or acquired_python.get("releaseId") != PYTHON_RELEASE_ID or
                acquired_python.get("releaseTag") != PYTHON_RELEASE_TAG or acquired_python.get("assetId") != PYTHON_ASSET_ID or
                acquired_python.get("assetName") != python_archive.name or acquired_python.get("sizeBytes") != PYTHON_ARCHIVE_SIZE or
                acquired_python.get("sha256") != EXPECTED_PYTHON_SHA or not python_archive.is_file() or
                python_archive.is_symlink() or python_archive.stat().st_size != PYTHON_ARCHIVE_SIZE or
                sha256(python_archive) != EXPECTED_PYTHON_SHA):
            raise ValueError("official CPython release asset identity or bytes mismatch")
        source_context = validate_context(args.workflow_q, args.candidate, args.input_root)
        host = host_identity()
        if host["system"] != "Linux" or host["machine"] not in ("x86_64", "amd64"):
            raise ValueError("runner is not Linux/amd64")
        osr = host.get("osRelease", {})
        if osr.get("ID") != "ubuntu" or osr.get("VERSION_ID") != "24.04":
            raise ValueError("runner is not Ubuntu 24.04")
        if not isinstance(host.get("logicalCpuCount"), int) or host["logicalCpuCount"] < 1:
            raise ValueError("runner CPU identity unavailable")
        if host.get("memoryBytes", {}).get("MemTotal", 0) <= 0:
            raise ValueError("runner memory identity unavailable")
        carrier = args.input_root / "carrier"
        if cohort_tmp.exists() or cohort_tmp.is_symlink():
            raise ValueError("fixed D5 cohort path already exists")
        shutil.copytree(carrier / "cohort", cohort_tmp, symlinks=False)
        cohort_created = True
        # Reconfirm the lock after the exact carrier cohort is copied to the
        # path hard-coded by the accepted D5 local adapter.
        if sha256(cohort_tmp / "cohort.lock.json") != COHORT_LOCK_SHA:
            raise ValueError("staged cohort lock mismatch")
        docker_version, docker_version_stdout = run_json(capture, "docker-engine-version",
            ["docker", "version", "--format", "{{.Server.Version}}"], timeout=20)
        if docker_version["exitCode"] != 0 or not docker_version_stdout.strip():
            raise ValueError("Docker engine identity unavailable")
        docker_platform, docker_platform_stdout = run_json(capture, "docker-engine-platform",
            ["docker", "info", "--format", "{{.OSType}}/{{.Architecture}}"], timeout=20)
        if docker_platform["exitCode"] != 0 or docker_platform_stdout.strip() != "linux/x86_64":
            raise ValueError("Docker engine is not native Linux/amd64")
        image_result, image_stdout = run_json(capture, "postgres-image-inspect",
            ["docker", "image", "inspect", PG_IMAGE, "--format", "{{.Os}}/{{.Architecture}}"], timeout=20)
        if image_result["exitCode"] != 0 or image_stdout.strip() != "linux/amd64":
            # Pull once, then inspect the exact digest, never a tag.
            pull, _ = run_json(capture, "postgres-image-pull", ["docker", "pull", PG_IMAGE], timeout=300)
            if pull["exitCode"] != 0:
                raise ValueError("pinned PostgreSQL image pull failed")
            image_result, image_stdout = run_json(capture, "postgres-image-inspect-after-pull",
                ["docker", "image", "inspect", PG_IMAGE, "--format", "{{.Os}}/{{.Architecture}}"], timeout=20)
        if image_result["exitCode"] != 0 or image_stdout.strip() != "linux/amd64":
            raise ValueError("pinned PostgreSQL image platform mismatch")
        image_identity, image_identity_stdout = run_json(capture, "postgres-image-identity",
            ["docker", "image", "inspect", PG_IMAGE, "--format", "{{.Id}}|{{join .RepoDigests \",\"}}"], timeout=20)
        if image_identity["exitCode"] != 0:
            raise ValueError("pinned PostgreSQL image identity unavailable")
        image_parts = image_identity_stdout.strip().split("|", 1)
        repo_digests = [value.strip() for value in image_parts[1].split(",")] if len(image_parts) == 2 else []
        if (len(image_parts) != 2 or not re.fullmatch(r"sha256:[0-9a-f]{64}", image_parts[0]) or
                not repo_digests or any(not value for value in repo_digests) or
                not (set(repo_digests) & PG_REPO_DIGEST_ALIASES) or
                not set(repo_digests) <= PG_REPO_DIGEST_ALIASES):
            raise ValueError("pinned PostgreSQL image digest identity mismatch")
        network_created = True
        run, network_stdout = run_json(capture, "create-owned-postgres-network",
            ["docker", "network", "create", "--label", "org.umf.d5.execution=" + exec_id,
             network_name], timeout=20)
        if run["exitCode"] != 0:
            raise ValueError("owned PostgreSQL network creation failed")
        docker_created = True
        run, _ = run_json(capture, "start-owned-postgres", ["docker", "run", "--detach",
            "--name", pg_name, "--network", network_name, "--network-alias", "pg",
            "--label", "org.umf.d5.execution=" + exec_id,
            "--cpus=2", "--memory=2147483648", "--pids-limit=2048",
            "--publish", "127.0.0.1::5432", "--env", "POSTGRES_USER=postgres",
            "--env", "POSTGRES_PASSWORD=" + pg_password, "--env", "POSTGRES_DB=postgres",
            PG_IMAGE], timeout=30)
        if run["exitCode"] != 0:
            raise ValueError("owned PostgreSQL container start failed")
        for attempt in range(60):
            ready, _ = run_json(capture, f"postgres-readiness-{attempt + 1:02d}", ["docker", "exec", pg_name,
                "pg_isready", "-U", "postgres", "-d", "postgres"], timeout=3)
            if ready["exitCode"] == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("PostgreSQL did not become ready within 60 seconds")
        query = ("SELECT current_setting('server_version'), current_setting('server_version_num'), "
                 "version();")
        pgcheck, pgstdout = run_json(capture, "postgres-identity-query", ["docker", "exec", "-e",
            "PGPASSWORD=" + pg_password, pg_name, "psql", "-X", "-A", "-t", "-F", "\t",
            "-U", "postgres", "-d", "postgres", "-c", query], timeout=10)
        if pgcheck["exitCode"] != 0:
            raise ValueError("PostgreSQL identity query failed")
        fields = pgstdout.strip().split("\t", 2)
        if (len(fields) != 3 or fields[0] != PG_SERVER_VERSION or fields[1] != "180006" or
                not fields[2].startswith("PostgreSQL " + PG_SERVER_VERSION)):
            raise ValueError("PostgreSQL exact identity mismatch")
        port, port_stdout = run_json(capture, "postgres-loopback-port", ["docker", "port", pg_name, "5432/tcp"], timeout=10)
        if port["exitCode"] != 0:
            raise ValueError("PostgreSQL loopback port lookup failed")
        match = re.fullmatch(r"127\.0\.0\.1:(\d+)\s*", port_stdout)
        if not match or not (1 <= int(match.group(1)) <= 65535):
            raise ValueError("PostgreSQL port was not loopback-bound")
        pg_context.update({"engineVersion": docker_version_stdout.strip(),
                "enginePlatform": docker_platform_stdout.strip(),
                "imagePlatform": "linux/amd64", "imageId": image_parts[0],
            "repoDigests": repo_digests, "serverVersion": fields[0],
            "serverVersionNum": int(fields[1]), "serverFullVersion": fields[2],
            "hostPort": int(match.group(1)), "cpuLimit": 2,
            "memoryLimitBytes": 2 * 1024**3, "pidsLimit": 2048})
        # The downloaded archive is fixed by SHA/size and extracted without
        # invoking its setup.sh (which would alter pip). Use its private Python
        # only for the D5 PATH; the D5 adapter creates its own fresh venv.
        python_root = args.input_root / "python-3.11.17"
        python_bin, python_install = install_pinned_python(python_root)
        python_root = python_bin.parent
        env = os.environ.copy()
        env.pop("GITHUB_TOKEN", None)
        env.update({"PATH": str(python_bin) + ":" + env.get("PATH", "/usr/bin:/bin"),
            "PYTHONNOUSERSITE": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
            "LD_LIBRARY_PATH": str(python_root / "lib") + ":" + env.get("LD_LIBRARY_PATH", ""),
            "D5_ROOT": str(d5_root), "LOCAL_SOURCE_COMMIT": P_COMMIT,
            "LOCAL_EXECUTION_ID": exec_id, "LOCAL_ATTEMPT": os.environ["GITHUB_RUN_ATTEMPT"],
            "LOCAL_SOURCE_REF": "local:detached:" + P_COMMIT, "LOCAL_SOURCE_BRANCH": "",
            "LOCAL_WORKFLOW_ID": "native-d5-local-adapter@" + os.environ["GITHUB_SHA"],
            "LOCAL_EXECUTION_KIND": "local_linux_diagnostic",
            "PG_DSN": f"postgresql://postgres:{pg_password}@127.0.0.1:{match.group(1)}/postgres",
            "PGHOST": "127.0.0.1", "PGPORT": match.group(1), "PGUSER": "postgres",
            "PGPASSWORD": pg_password, "PGDATABASE": "postgres"})
        python_version, python_version_stdout = run_json(capture, "pinned-python-runtime-version",
            [str(python_bin / "python3.11"), "--version"], timeout=10, env=env)
        if python_version["exitCode"] != 0 or python_version_stdout.strip() != "Python 3.11.17":
            raise ValueError("pinned Python runtime version mismatch")
        python_install["observedVersion"] = python_version_stdout.strip()
        if d5_root.exists() or d5_root.is_symlink():
            raise ValueError("D5 run directory is not fresh")
        steps = carrier / "steps"
        expected_steps = {
            "initialize.local.sh": "1aa3122eef9040d321947a33c64d63d97969ea8838c44e60540167c04488cfd0",
            "replay.local.sh": "9c0ea55948e1a210ac3100d330c08349d5801e4d15cdfd50397782bdc5ef7cc7",
            "finalize.local.sh": "af48510b3e5e297a03a90e4b1b0f31bbba4852609226dc8170ff9ff9920ee04a",
        }
        for name, expected in expected_steps.items():
            if sha256(steps / name) != expected:
                raise ValueError("local D5 adapter hash mismatch")
        d5_start = time.monotonic()
        init, _ = run_json(capture, "d5-initialize-local-adapter",
            ["bash", str(steps / "initialize.local.sh")], timeout=60, env=env, cwd=args.candidate)
        step_results.append(init)
        if init["exitCode"] == 0 and not init["timedOut"]:
            d5_started = True
            elapsed = time.monotonic() - d5_start
            replay_budget = max(1, D5_SECONDS - FINALIZER_RESERVE - TERM_GRACE - int(elapsed))
            replay, _ = run_json(capture, "d5-replay-local-adapter",
                ["bash", str(steps / "replay.local.sh")], timeout=replay_budget,
                env=env, cwd=args.candidate)
            step_results.append(replay)
        else:
            step_results.append({"name": "d5-replay-local-adapter", "exitCode": None,
                                 "skipped": True, "reason": "initialization did not complete"})
        elapsed = time.monotonic() - d5_start
        finalize_budget = max(1, min(FINALIZER_RESERVE - TERM_GRACE,
            D5_SECONDS - int(elapsed) - TERM_GRACE))
        final, _ = run_json(capture, "d5-finalize-local-adapter",
            ["bash", str(steps / "finalize.local.sh")], timeout=finalize_budget,
            env=env, cwd=args.candidate)
        step_results.append(final)
        receipt_path = d5_root / "upload" / "d5-receipt.json"
        if receipt_path.is_file() and not receipt_path.is_symlink():
            try:
                d5_receipt = json.loads(receipt_path.read_text())
            except Exception:
                d5_receipt = None
        if final["exitCode"] != 0 or not d5_receipt:
            error_code = "d5-finalizer-did-not-validate"
        elif d5_receipt.get("status") != "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY":
            error_code = "d5-local-adapter-not-pass"
        elif d5_receipt.get("commandCount") != 30 or d5_receipt.get("cases") != 37 or d5_receipt.get("oracleGroups") != 16 or d5_receipt.get("noDefaultChecks") != 19 or d5_receipt.get("faultScenarios") != 3:
            error_code = "d5-fixed-obligation-count-mismatch"
        elif d5_receipt.get("cleanupVerified") is not True or d5_receipt.get("sourceCommit") != P_COMMIT or d5_receipt.get("localExecutionId") != exec_id:
            error_code = "d5-cleanup-or-source-identity-mismatch"
        else:
            d5_status = "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY"
        source_post_context = {
            "commit": git_value(args.candidate, "rev-parse", "HEAD"),
            "tree": git_value(args.candidate, "rev-parse", "HEAD^{tree}"),
            "status": git_value(args.candidate, "status", "--porcelain", "--untracked-files=all")}
        if (source_post_context["commit"] != P_COMMIT or source_post_context["tree"] != P_TREE or
                source_post_context["status"]):
            error_code = error_code or "producer-source-changed-during-d5"
    except Exception as error:
        error_code = "driver-" + type(error).__name__
        event = {"event": "driverFailure", "code": error_code}
        with (capture.root / "driver-events.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, sort_keys=True) + "\n")
    finally:
        if args.acquisition_receipt.is_file() and not args.acquisition_receipt.is_symlink():
            try:
                shutil.copyfile(args.acquisition_receipt, output / "input-acquisition.json")
            except OSError:
                error_code = error_code or "acquisition-receipt-copy-failed"
        if docker_created:
            inspect, label = cleanup_json(capture, "postgres-owned-container-check",
                ["docker", "inspect", "--format", '{{ index .Config.Labels "org.umf.d5.execution" }}', pg_name])
            if inspect["exitCode"] != 0:
                pg_context["cleanupVerified"] = False
                error_code = error_code or "postgres-container-cleanup-identity-unavailable"
            elif label.strip() != exec_id:
                pg_context["cleanupVerified"] = False
                error_code = error_code or "postgres-resource-ownership-uncertain"
            else:
                stop, _ = cleanup_json(capture, "postgres-stop", ["docker", "stop", "--time", "5", pg_name])
                rm, _ = cleanup_json(capture, "postgres-remove", ["docker", "rm", "--force", "--volumes", pg_name])
                absent, _ = cleanup_json(capture, "postgres-absence-check", ["docker", "inspect", pg_name])
                pg_context["cleanupVerified"] = stop["exitCode"] == 0 and rm["exitCode"] == 0 and absent["exitCode"] != 0
        else:
            pg_context["cleanupVerified"] = True
        if network_created:
            inspect, label = cleanup_json(capture, "postgres-owned-network-check",
                ["docker", "network", "inspect", "--format", '{{ index .Labels "org.umf.d5.execution" }}', network_name])
            if inspect["exitCode"] != 0:
                pg_context["networkCleanupVerified"] = False
                error_code = error_code or "postgres-network-cleanup-identity-unavailable"
            elif label.strip() != exec_id:
                pg_context["networkCleanupVerified"] = False
                error_code = error_code or "postgres-network-ownership-uncertain"
            else:
                net, _ = cleanup_json(capture, "postgres-network-remove", ["docker", "network", "rm", network_name])
                absent, _ = cleanup_json(capture, "postgres-network-absence-check", ["docker", "network", "inspect", network_name])
                pg_context["networkCleanupVerified"] = net["exitCode"] == 0 and absent["exitCode"] != 0
        else:
            pg_context["networkCleanupVerified"] = True
        if cohort_created:
            try:
                shutil.rmtree(cohort_tmp)
            except OSError:
                error_code = error_code or "staged-cohort-cleanup-failed"
        if d5_root.exists():
            try:
                upload = d5_root / "upload"
                release_payload = d5_root / "release-payload"
                if d5_status == "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY" and not release_payload.is_dir():
                    error_code = error_code or "d5-release-payload-missing"
                if upload.is_dir() and release_payload.is_dir():
                    _, upload_bytes = files_under(upload)
                    release_files, release_bytes = files_under(release_payload, max_bytes=2_097_152)
                    expected_release_names = {"umf_access-0.1.0.dev8-py3-none-any.whl",
                        "umf_codegen-0.1.0a5-py3-none-any.whl", "release-payload-receipt.json"}
                    if ({path.name for path, _ in release_files} != expected_release_names or
                            any(path.parent != release_payload for path, _ in release_files)):
                        raise ValueError("D5 release payload exact roster mismatch")
                    current_bytes = output_family_bytes(output)
                    # Reserve room for the bounded operator receipt and both
                    # separately captured driver streams before either copy.
                    reserve = 256 * 1024 + 2 * (EXTERNAL_STREAM_MAX + EXTERNAL_STREAM_MARKER_MAX)
                    if current_bytes + upload_bytes + release_bytes + reserve > EVIDENCE_CAP:
                        error_code = error_code or "evidence-family-cap-reserve-exceeded"
                    else:
                        copy_upload_tree(upload, output)
                        release_payload_context = copy_release_payload(release_payload, output)
                        copied_receipt = next(item for item in release_payload_context["files"]
                                              if item["path"] == "d5-release-payload/release-payload-receipt.json")
                        if not d5_receipt or d5_receipt.get("releasePayloadReceiptSha256") != copied_receipt["sha256"]:
                            raise ValueError("D5 release payload receipt is not bound to the child receipt")
                elif upload.is_dir():
                    _, upload_bytes = files_under(upload)
                    current_bytes = output_family_bytes(output)
                    reserve = 256 * 1024 + 2 * (EXTERNAL_STREAM_MAX + EXTERNAL_STREAM_MARKER_MAX)
                    if current_bytes + upload_bytes + reserve > EVIDENCE_CAP:
                        error_code = error_code or "evidence-family-cap-reserve-exceeded"
                    else:
                        copy_upload_tree(upload, output)
            except Exception:
                error_code = error_code or "d5-evidence-export-failed"
        if capture.truncated:
            error_code = error_code or "outer-log-cap-exceeded"
        if capture.total > LOG_CAP:
            error_code = error_code or "outer-log-cap-exceeded"
        native_pass = (d5_status == "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY" and
            error_code is None and pg_context.get("cleanupVerified") is True and
            pg_context.get("networkCleanupVerified") is True and not capture.truncated)
        identity = {}
        try:
            identity = {key: os.environ.get(key) for key in (
                "GITHUB_REPOSITORY", "GITHUB_EVENT_NAME", "GITHUB_REF", "GITHUB_SHA",
                "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_WORKFLOW_REF", "GITHUB_WORKFLOW_SHA")}
        except Exception:
            pass
        operator = {"profile": "umf.g02-d5-native-linux-operator/1",
            "status": "NATIVE_LINUX_D5_PASS" if native_pass else "FAIL_OR_UNKNOWN",
            "hostedWorkflowIdentity": identity,
            "producerSource": {"commit": P_COMMIT, "tree": P_TREE,
                "workflowPath": WORKFLOW_PATH, "workflowSha256": WORKFLOW_SHA},
            "sourceValidation": source_context,
            "postRunSourceValidation": source_post_context,
            "runner": host,
            "postgres": pg_context,
            "pythonRuntimeInstall": python_install if source_context else None,
            "releasePayload": release_payload_context,
            "inputAcquisitionReceipt": str(args.acquisition_receipt),
            "inputAcquisitionReceiptSha256": sha256(args.acquisition_receipt) if args.acquisition_receipt.exists() else None,
            "inputArchives": {
                "carrier": {"releaseId": acquisition["carrier"]["releaseId"],
                    "releaseTag": acquisition["carrier"]["releaseTag"],
                    "assetId": acquisition["carrier"]["assetId"],
                    "path": str(args.input_root / "d5-input-carrier.tar.gz"),
                    "sizeBytes": (args.input_root / "d5-input-carrier.tar.gz").stat().st_size,
                    "sha256": sha256(args.input_root / "d5-input-carrier.tar.gz")},
                "pythonRuntime": {"releaseId": acquisition["pythonRuntime"]["releaseId"],
                    "releaseTag": acquisition["pythonRuntime"]["releaseTag"],
                    "assetId": acquisition["pythonRuntime"]["assetId"],
                    "path": str(args.input_root / "python-3.11.17-linux-24.04-x64.tar.gz"),
                    "sizeBytes": (args.input_root / "python-3.11.17-linux-24.04-x64.tar.gz").stat().st_size,
                    "sha256": sha256(args.input_root / "python-3.11.17-linux-24.04-x64.tar.gz")}},
            "cohortLockSha256": COHORT_LOCK_SHA,
            "pythonArchiveSha256": EXPECTED_PYTHON_SHA,
            "childAdapter": {"executionKind": "local_linux_diagnostic",
                "localExecutionId": exec_id, "localSourceCommit": P_COMMIT,
                "localWorkflowLabel": "native-d5-local-adapter@" + os.environ.get("GITHUB_SHA", "unavailable"),
                "status": d5_status, "receipt": d5_receipt},
            "stepResults": step_results, "outerLogBytes": capture.total,
            "outerLogTruncated": capture.truncated,
            "durationSeconds": round(time.monotonic() - outer_started, 3),
            "errorCode": error_code}
        try:
            write_json(output / "operator-run.json", operator)
            evidence = output_family_bytes(output)
            # The workflow appends two separately captured <=64 KiB driver
            # streams after this point. Reserve their full bound up front.
            if evidence > EVIDENCE_CAP - 2 * (EXTERNAL_STREAM_MAX + EXTERNAL_STREAM_MARKER_MAX):
                shutil.rmtree(output / "d5-upload", ignore_errors=True)
                shutil.rmtree(output / "d5-release-payload", ignore_errors=True)
                operator["status"] = "FAIL_OR_UNKNOWN"
                operator["errorCode"] = "evidence-family-cap-reserve-exceeded"
                operator["releasePayload"] = None
                operator["childAdapter"]["status"] = "FAIL_OR_UNKNOWN" if operator["childAdapter"]["status"] == "LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY" else operator["childAdapter"]["status"]
                write_json(output / "operator-run.json", operator)
                if output_family_bytes(output) > EVIDENCE_CAP - 2 * (EXTERNAL_STREAM_MAX + EXTERNAL_STREAM_MARKER_MAX):
                    return 1
                return 1
        except Exception:
            return 1
        print("NATIVE_D5_STATUS=" + ("PASS" if native_pass and error_code is None else "FAIL_OR_UNKNOWN"))
        return 0 if native_pass and error_code is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
