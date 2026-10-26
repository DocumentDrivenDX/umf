#!/usr/bin/env python3
"""One hosted, bounded repair-and-qualification run for the Core 0.10.2 Linux wheel."""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import selectors
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile

SOURCE_COMMIT = "a1b909d4f92da6604aeb21d3ea60e9a9943a7f87"
SOURCE_TREE = "f9f1655af59c4c030e58a19405fe22ae55db40bb"
ARTIFACT_ID = "12659280057"
ORIGINAL_RUN_ID = "40338720085"
ARTIFACT_ZIP_SHA256 = "741b45e5e15c393e5cc78571f22afb2bacda2cc0c355c929a02a4022fc2b531f"
DIRECT_WHEEL_SHA256 = "64e98887068563221070e3f265ae24d6871099cd5922f49f6be83eff944a5805"
DIRECT_NATIVE_SHA256 = "78dd1542f723b4f4d8c336c137caa478974a981ed759ada171a5877d7e0368a8"
SDIST_SHA256 = "90a107aaa507930e1d71c0cf208b77182d06c0bf2a1b13681fd5f7b6ed74cb9d"
DEADLINE_SECONDS = 1200
RESERVE_SECONDS = 120
CHILD_MAX_SECONDS = 180
LOG_LIMIT = 1_048_576
INPUT_ZIP_LIMIT = 32 * 1024 * 1024
WHEEL_LIMIT = 16 * 1024 * 1024
EVIDENCE_LIMIT = 4 * 1024 * 1024
FAMILY_LIMIT = 16 * 1024 * 1024

ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMP = pathlib.Path(os.environ["RUNNER_TEMP"])
EVIDENCE = TEMP / "core-0102-manylinux"
INPUTS = TEMP / "core-0102-manylinux-inputs"
TOOLS = TEMP / "core-0102-manylinux-tools"
TESTENV = TEMP / "core-0102-manylinux-testenv"
REPAIRED = TEMP / "core-0102-manylinux-repaired"
SOURCE = pathlib.Path(os.environ["GITHUB_WORKSPACE"]) / "source"
DEADLINE_MS = int((EVIDENCE / "deadline-ms").read_text(encoding="ascii"))


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remaining_seconds() -> int:
    return max(0, (DEADLINE_MS - time.monotonic_ns() // 1_000_000 - RESERVE_SECONDS * 1000) // 1000)


def record_command(name: str, argv: list[str], status: int, started_ns: int,
                   limit: int, truncated: bool, capture_error: bool, timed_out: bool) -> None:
    log = EVIDENCE / "logs" / f"{name}.log"
    raw = log.read_bytes()
    row = {
        "name": name,
        "stage": name,
        "argv": argv,
        "rawExit": status,
        "captureExit": 74 if capture_error else 75 if truncated else 0,
        "monotonicDurationMs": (time.monotonic_ns() - started_ns) // 1_000_000,
        "limitSeconds": limit,
        "logBytes": len(raw),
        "logSha256": hashlib.sha256(raw).hexdigest(),
        "truncated": truncated,
        "captureError": capture_error,
        "timedOut": timed_out,
    }
    with (EVIDENCE / "command-records.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row, sort_keys=True) + "\n")


def run_bounded(name: str, argv: list[str], maximum: int = CHILD_MAX_SECONDS,
                cwd: pathlib.Path | None = None, env: dict[str, str] | None = None) -> None:
    now_ms = time.monotonic_ns() // 1_000_000
    left = (DEADLINE_MS - now_ms - RESERVE_SECONDS * 1000) // 1000
    if left <= 0:
        raise RuntimeError(f"original deadline exhausted before {name}")
    limit = min(maximum, left)
    prior = sum(p.stat().st_size for p in (EVIDENCE / "logs").glob("*.log"))
    budget = max(0, LOG_LIMIT - prior)
    log = EVIDENCE / "logs" / f"{name}.log"
    started = time.monotonic_ns()
    stored = 0
    truncated = False
    capture_error = False
    marker = b"\n[LOG TRUNCATED: aggregate capture limit reached]\n"
    timed_out = False
    status = 127
    with log.open("wb") as sink:
        timeout_path = shutil.which("timeout")
        if timeout_path is None:
            capture_error = True
        else:
            wrapped_argv = [timeout_path, "--signal=TERM", "--kill-after=10s", f"{limit}s", *argv]
            try:
                process = subprocess.Popen(wrapped_argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
            except OSError:
                process = None
                capture_error = True
            if process is not None:
                assert process.stdout is not None
                selector = selectors.DefaultSelector()
                os.set_blocking(process.stdout.fileno(), False)
                selector.register(process.stdout, selectors.EVENT_READ)
                hard_stop = time.monotonic() + limit + 12
                exited_at: float | None = None
                eof = False
                while True:
                    now = time.monotonic()
                    polled = process.poll()
                    if polled is not None:
                        status = polled
                        if exited_at is None:
                            exited_at = now
                    if eof and polled is not None:
                        break
                    if polled is not None and not eof and exited_at is not None and now - exited_at >= 2:
                        capture_error = True
                        break
                    if now >= hard_stop:
                        capture_error = True
                        timed_out = True
                        if process.poll() is None:
                            process.send_signal(signal.SIGTERM)
                            try:
                                process.wait(timeout=1)
                            except subprocess.TimeoutExpired:
                                process.kill()
                                try:
                                    process.wait(timeout=1)
                                except subprocess.TimeoutExpired:
                                    capture_error = True
                        status = process.poll() if process.poll() is not None else 124
                        break
                    events = selector.select(min(0.1, max(0.0, hard_stop - now))) if selector.get_map() else []
                    if not selector.get_map() and polled is None:
                        time.sleep(0.1)
                    for key, _ in events:
                        try:
                            chunk = os.read(key.fd, 65536)
                        except OSError:
                            capture_error = True
                            chunk = b""
                        if not chunk:
                            eof = True
                            selector.unregister(key.fileobj)
                            continue
                        available = max(0, budget - stored)
                        piece = chunk[:available]
                        if piece:
                            try:
                                sink.write(piece)
                                stored += len(piece)
                            except OSError:
                                capture_error = True
                        if len(chunk) > available:
                            truncated = True
                selector.close()
                process.stdout.close()
                timed_out = timed_out or status in (124, 137)
                capture_error = capture_error or not eof
        if truncated:
            marker_bytes = marker[:budget]
            sink.seek(max(0, budget - len(marker_bytes)))
            sink.truncate()
            sink.write(marker_bytes)
    record_command(name, argv, status, started, limit, truncated, capture_error, timed_out)
    if status != 0 or timed_out or truncated or capture_error:
        raise RuntimeError(f"{name} failed (raw exit {status}, timed_out={timed_out}, truncated={truncated}, capture_error={capture_error})")


def read_bounded(response, cap: int) -> bytes:
    data = bytearray()
    while True:
        chunk = response.read(min(65536, cap + 1 - len(data)))
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > cap:
            raise ValueError("download exceeds its fixed byte cap")
    return bytes(data)


def api_json(url: str, token: str) -> dict:
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "umf-core-0102-manylinux-qualification",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = read_bounded(response, 256 * 1024)
    return json.loads(payload)


def artifact_download(token: str) -> dict:
    base = "https://api.github.com/repos/DocumentDrivenDX/umf/actions"
    artifact = api_json(f"{base}/artifacts/{ARTIFACT_ID}", token)
    run = api_json(f"{base}/runs/{ORIGINAL_RUN_ID}/attempts/1", token)
    if (str(artifact.get("id")) != ARTIFACT_ID or artifact.get("expired") is not False
            or str(artifact.get("workflow_run", {}).get("id")) != ORIGINAL_RUN_ID
            or artifact.get("workflow_run", {}).get("head_sha") != SOURCE_COMMIT
            or str(run.get("id")) != ORIGINAL_RUN_ID or run.get("head_sha") != SOURCE_COMMIT
            or run.get("run_attempt") != 1):
        raise ValueError("public source artifact/run identity differs from the frozen input")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    url = f"{base}/artifacts/{ARTIFACT_ID}/zip"
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "umf-core-0102-manylinux-qualification",
    })
    opener = urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(request, timeout=15)
    except urllib.error.HTTPError as redirect:
        if redirect.code not in (301, 302, 303, 307, 308):
            raise
        location = redirect.headers.get("Location")
        if not location or not location.startswith("https://"):
            raise ValueError("artifact archive redirect is not HTTPS") from redirect
        with urllib.request.urlopen(location, timeout=15) as response:
            archive = read_bounded(response, INPUT_ZIP_LIMIT)
    else:
        with response:
            archive = read_bounded(response, INPUT_ZIP_LIMIT)
    archive_path = INPUTS / "original-artifact.zip"
    archive_path.write_bytes(archive)
    if hashlib.sha256(archive).hexdigest() != ARTIFACT_ZIP_SHA256:
        raise ValueError("original artifact archive SHA-256 differs from its frozen receipt")
    expected = {
        "umf/umf/python/dist/umf_core-0.10.2-cp311-abi3-linux_x86_64.whl": 3580729,
        "_temp/umf-artifact-payload.json": 62033,
        "umf/umf/python/dist/umf_core-0.10.2.tar.gz": 2652087,
        "_temp/umf-direct-action-tests.xml": 32503,
        "_temp/umf-install-direct.json": 313,
        "_temp/umf-install-sdist-rebuilt.json": 313,
        "_temp/umf-installed-direct-payload.json": 299,
        "_temp/umf-installed-direct-posttest.json": 299,
        "_temp/umf-installed-sdist-rebuilt-payload.json": 299,
        "_temp/umf-installed-sdist-rebuilt-posttest.json": 299,
        "_temp/umf-qualification.json": 66132,
        "_temp/umf-sdist-rebuilt/umf_core-0.10.2-cp311-abi3-linux_x86_64.whl": 3580655,
        "_temp/umf-sdist-rebuilt-action-tests.xml": 32503,
    }
    with zipfile.ZipFile(archive_path) as bundle:
        members = bundle.infolist()
        if {row.filename: row.file_size for row in members} != expected or len(members) != len(expected):
            raise ValueError("original artifact member roster or byte sizes changed")
        for row in members:
            if row.is_dir() or (row.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("original artifact contains a directory or symbolic link")
        direct_name = next(name for name in expected if name.endswith("umf_core-0.10.2-cp311-abi3-linux_x86_64.whl") and name.startswith("umf/"))
        sdist_name = "umf/umf/python/dist/umf_core-0.10.2.tar.gz"
        direct = bundle.read(direct_name)
        sdist = bundle.read(sdist_name)
        original_qualification_bytes = bundle.read("_temp/umf-qualification.json")
        original_qualification = json.loads(original_qualification_bytes)
    if hashlib.sha256(direct).hexdigest() != DIRECT_WHEEL_SHA256 or hashlib.sha256(sdist).hexdigest() != SDIST_SHA256:
        raise ValueError("direct wheel or source distribution differs from the frozen artifact hashes")
    INPUTS.mkdir(parents=True, exist_ok=True)
    (INPUTS / pathlib.Path(direct_name).name).write_bytes(direct)
    (INPUTS / pathlib.Path(sdist_name).name).write_bytes(sdist)
    with zipfile.ZipFile(INPUTS / pathlib.Path(direct_name).name) as wheel:
        native = wheel.read("umf/_rust_core.abi3.so")
    if hashlib.sha256(native).hexdigest() != DIRECT_NATIVE_SHA256:
        raise ValueError("direct wheel native member differs from the frozen native hash")
    old_direct = original_qualification.get("artifacts", {}).get("direct", {})
    old_install = original_qualification.get("installed_artifacts", {}).get("direct", {})
    old_counts = old_install.get("test_counts")
    if (original_qualification.get("source_revision") != SOURCE_COMMIT
            or original_qualification.get("cohort") != "linux-x86_64"
            or original_qualification.get("installed_qualification") != "passed"
            or original_qualification.get("source_payload_verification") != "passed"
            or old_direct.get("sha256") != DIRECT_WHEEL_SHA256
            or old_direct.get("native_sha256") != DIRECT_NATIVE_SHA256
            or old_counts != {"tests": 254, "errors": 0, "failures": 0, "skipped": 0}
            or old_install.get("qualification") != "passed"):
        raise ValueError("historical direct-wheel qualification receipt does not match the frozen accepted cohort")
    report = {
        "artifactId": ARTIFACT_ID, "runId": ORIGINAL_RUN_ID, "runAttempt": 1,
        "sourceCommit": SOURCE_COMMIT, "archiveBytes": len(archive),
        "archiveSha256": ARTIFACT_ZIP_SHA256,
        "directWheel": {"bytes": len(direct), "sha256": DIRECT_WHEEL_SHA256},
        "nativeMemberSha256": DIRECT_NATIVE_SHA256,
        "sdist": {"bytes": len(sdist), "sha256": SDIST_SHA256},
        "originalQualificationReceiptSha256": hashlib.sha256(original_qualification_bytes).hexdigest(),
        "originalQualificationReceiptStatus": original_qualification["installed_qualification"],
        "rawArtifactRole": "historical input only; not repaired qualification evidence",
        "artifactApiMetadata": {"id": artifact["id"], "name": artifact.get("name"),
                                "sizeInBytes": artifact.get("size_in_bytes"),
                                "headSha": artifact["workflow_run"]["head_sha"]},
    }
    (EVIDENCE / "original-input.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


def download_tools() -> None:
    lock_path = ROOT / "qualification-inputs/core-0102-manylinux-tool-lock.json"
    requirements = ROOT / "qualification-inputs/core-0102-manylinux-tools-requirements.txt"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    if lock.get("profile") != "umf.core-0102-manylinux-tools/1" or len(lock.get("artifacts", [])) != 4:
        raise ValueError("tool lock is not the closed four-artifact profile")
    TOOLS.mkdir(parents=True, exist_ok=True)
    records = []
    for item in lock["artifacts"]:
        path = TOOLS / item["filename"]
        request = urllib.request.Request(item["url"], headers={"User-Agent": "umf-core-0102-manylinux-qualification"})
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = read_bounded(response, item["bytes"])
        if len(payload) != item["bytes"] or hashlib.sha256(payload).hexdigest() != item["sha256"]:
            raise ValueError(f"pinned tool wheel bytes differ: {item['distribution']}")
        path.write_bytes(payload)
        records.append({"distribution": item["distribution"], "version": item["version"],
                        "filename": item["filename"], "bytes": len(payload), "sha256": item["sha256"],
                        "url": item["url"]})
    (EVIDENCE / "tool-downloads.json").write_text(json.dumps(records, indent=2, sort_keys=True) + "\n")
    shutil.copyfile(requirements, EVIDENCE / "tool-requirements.txt")


def inspect_source() -> dict:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=SOURCE, check=True, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15).stdout.strip()
    commit = git("rev-parse", "HEAD")
    tree = git("rev-parse", "HEAD^{tree}")
    if commit != SOURCE_COMMIT or tree != SOURCE_TREE or git("status", "--porcelain", "--untracked-files=all"):
        raise ValueError("immutable source checkout identity or cleanliness failed")
    names = ["tools/verify_python_artifacts.py", "python/_native_platform.py",
             "python/tests/test_action_runtime_generated_client.py",
             "python/tests/test_action_runtime_resources.py", "python/tests/test_action_fixture_vectors.py",
             "python/tests/test_core.py", "python/tests/test_rust_core.py", "python/tests/test_extension_kinds.py",
             "python/pyproject.toml", "spec/core/schema.json", "spec/metamodel/generated/core-constraints.json"]
    files = {}
    for name in names:
        path = SOURCE / name
        files[name] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    return {"commit": commit, "tree": tree, "status": "clean", "files": files}


def inspector_code() -> str:
    return r'''import hashlib,json,pathlib,sys,zipfile,io
from email.parser import Parser
from elftools.elf.elffile import ELFFile
wheel=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
with zipfile.ZipFile(wheel) as z:
 names=z.namelist()
 if len(names)!=len(set(names)) or "umf/_rust_core.abi3.so" not in names: raise SystemExit("wheel member roster/native missing")
 native=z.read("umf/_rust_core.abi3.so")
 metadata=[n for n in names if n.endswith(".dist-info/WHEEL")]
 if len(metadata)!=1: raise SystemExit("expected one WHEEL metadata file")
 message=Parser().parsestr(z.read(metadata[0]).decode("utf-8"))
 tags=message.get_all("Tag",[])
 with zipfile.ZipFile(wheel) as z:
  elf=ELFFile(io.BytesIO(native))
  needed=[]; versions=[]; properties=[]
  for section in elf.iter_sections():
   if section.name==".dynamic":
    needed=[str(tag.needed) for tag in section.iter_tags() if tag.entry.d_tag=="DT_NEEDED"]
   if section.name==".gnu.version_r":
    for verneed,auxiliaries in section.iter_versions():
     for aux in auxiliaries: versions.append({"library":verneed.name,"version":aux.name})
   if section.name==".note.gnu.property": properties.append({"bytes":section.data_size,"sha256":hashlib.sha256(section.data()).hexdigest()})
  data={"wheelFilename":wheel.name,"wheelBytes":wheel.stat().st_size,"wheelSha256":hashlib.sha256(wheel.read_bytes()).hexdigest(),
   "nativeSha256":hashlib.sha256(native).hexdigest(),"nativeBytes":len(native),"wheelTags":tags,
   "distInfoWheel":metadata[0],"elfClass":elf.elfclass,"elfMachine":elf.header["e_machine"],
   "elfType":elf.header["e_type"],"neededLibraries":needed,"versionedSymbols":sorted(versions,key=lambda x:(x["library"],x["version"])),
   "gnuPropertyNotes":properties,"memberCount":len(names),"membersSha256":hashlib.sha256("\n".join(sorted(names)).encode()).hexdigest()}
out.write_text(json.dumps(data,indent=2,sort_keys=True)+"\n")
if data["elfClass"]!=64 or data["elfMachine"]!="EM_X86_64" or data["elfType"]!="ET_DYN": raise SystemExit("native ELF is not 64-bit x86_64 shared object")
if len(tags)!=1: raise SystemExit("closed verifier requires exactly one WHEEL tag; preserve alias discovery as HOLD")
if "cp311-abi3-" not in tags[0]: raise SystemExit("wheel tag does not declare cp311-abi3")
'''


def inspect_installed_code() -> str:
    return r'''import hashlib,importlib.metadata,json,pathlib,platform,sys,sysconfig
import umf
from umf._rust import _rust_core
from umf import current_core_version
root=pathlib.Path(umf.__file__).resolve(); platlib=pathlib.Path(sysconfig.get_path("platlib")).resolve()
native=pathlib.Path(_rust_core.__file__).resolve()
data={"python":platform.python_version(),"pythonPlatform":sysconfig.get_platform(),"machine":platform.machine(),
 "distributionVersion":importlib.metadata.version("umf-core"),"semanticCoreVersion":current_core_version(),
 "modulePath":str(root),"nativePath":str(native),"nativeSha256":hashlib.sha256(native.read_bytes()).hexdigest(),
 "insideEnvironment":root.is_relative_to(platlib),"nativeInsidePackage":native.is_relative_to(root.parent),"nativeSuffix":native.suffix}
pathlib.Path(sys.argv[1]).write_text(json.dumps(data,indent=2,sort_keys=True)+"\n")
if data["distributionVersion"]!="0.10.2" or data["semanticCoreVersion"]!="0.10.0" or not data["insideEnvironment"] or not data["nativeInsidePackage"] or data["nativeSuffix"]!=".so": raise SystemExit("installed artifact identity/origin mismatch")
'''


def run_gate() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "logs").mkdir(exist_ok=True)
    (EVIDENCE / "command-records.jsonl").touch(exist_ok=True)
    INPUTS.mkdir(parents=True, exist_ok=True)
    REPAIRED.mkdir(parents=True, exist_ok=True)
    if os.environ.get("GITHUB_EVENT_NAME") != "push" or os.environ.get("GITHUB_REF") != "refs/heads/codex/core-0102-manylinux-qualification":
        raise ValueError("unexpected workflow event or branch")
    if os.uname().machine != "x86_64" or sys.platform != "linux" or sys.version_info[:3] != (3, 11, 17):
        raise ValueError("runner is outside the frozen Ubuntu 24.04 / x86_64 / Python 3.11.17 cohort")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token:
        raise ValueError("read-only workflow token is unavailable")
    input_report = artifact_download(token)
    source = inspect_source()
    harness_commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True,
                                    text=True, stdout=subprocess.PIPE, timeout=10).stdout.strip()
    if harness_commit != os.environ.get("GITHUB_SHA"):
        raise ValueError("harness checkout does not match triggering commit")
    harness_tree = subprocess.run(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, check=True,
                                   text=True, stdout=subprocess.PIPE, timeout=10).stdout.strip()
    if subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT, check=True,
                      text=True, stdout=subprocess.PIPE, timeout=10).stdout:
        raise ValueError("qualification harness checkout is not clean")
    harness = {"commit": harness_commit,
               "tree": harness_tree,
               "workflowSha256": sha256(ROOT / ".github/workflows/core-0102-manylinux-qualification.yml"),
               "driverSha256": sha256(pathlib.Path(__file__)),
               "toolLockSha256": sha256(ROOT / "qualification-inputs/core-0102-manylinux-tool-lock.json"),
               "requirementsSha256": sha256(ROOT / "qualification-inputs/core-0102-manylinux-tools-requirements.txt")}
    (EVIDENCE / "source-identities.json").write_text(json.dumps({"harness": harness, "immutableSource": source,
        "originalInput": input_report}, indent=2, sort_keys=True) + "\n")
    download_tools()
    tool_env = os.environ.copy()
    tool_env.pop("PYTHONPATH", None)
    run_bounded("create-tool-environment", [sys.executable, "-I", "-m", "venv", str(TOOLS / "venv")])
    py = TOOLS / "venv/bin/python"
    tool_env["PATH"] = str(TOOLS / "venv/bin") + os.pathsep + tool_env.get("PATH", "")
    tool_wheels = sorted(p for p in TOOLS.glob("*.whl"))
    if len(tool_wheels) != 4:
        raise ValueError("tool wheelhouse is not exactly the four locked files")
    run_bounded("install-locked-tools", [str(py), "-I", "-m", "pip", "install", "--no-index", "--no-deps",
        "--only-binary=:all:", "--require-hashes", "--find-links", str(TOOLS),
        "-r", str(ROOT / "qualification-inputs/core-0102-manylinux-tools-requirements.txt"),
        "--report", str(EVIDENCE / "tool-install-report.json")], env=tool_env)
    versions = subprocess.run([str(py), "-I", "-c", "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ('auditwheel','packaging','pyelftools','patchelf')},sort_keys=True))"],
                              check=True, text=True, stdout=subprocess.PIPE, timeout=15).stdout.strip()
    if json.loads(versions) != {"auditwheel": "6.8.2", "packaging": "25.0", "patchelf": "0.17.2.4", "pyelftools": "0.32"}:
        raise ValueError("installed repair tools differ from the four pinned distribution versions")
    executables = {}
    for name in ("auditwheel", "patchelf"):
        path = TOOLS / f"venv/bin/{name}"
        version_argv = [str(path), "--version"]
        run_bounded(f"{name}-version", version_argv)
        executables[name] = {"path": str(path.resolve()), "version": (EVIDENCE / "logs" / f"{name}-version.log").read_text().strip(),
                             "binarySha256": sha256(path)}
    selected_patchelf = shutil.which("patchelf", path=tool_env["PATH"])
    expected_patchelf = (TOOLS / "venv/bin/patchelf").resolve()
    if selected_patchelf is None or pathlib.Path(selected_patchelf).resolve() != expected_patchelf:
        raise ValueError("auditwheel PATH does not select the locked patchelf executable")
    executables["patchelf"]["selectedByAuditwheelPath"] = str(pathlib.Path(selected_patchelf).resolve())
    executables["patchelf"]["selectedByAuditwheelSha256"] = sha256(pathlib.Path(selected_patchelf))
    if executables["patchelf"]["selectedByAuditwheelSha256"] != executables["patchelf"]["binarySha256"]:
        raise ValueError("auditwheel-selected patchelf bytes differ from the recorded locked executable")
    (EVIDENCE / "tool-versions.json").write_text(json.dumps({"distributions": json.loads(versions), "executables": executables,
        "wheelHashes": [{"filename":p.name,"sha256":sha256(p),"bytes":p.stat().st_size} for p in tool_wheels]},indent=2)+"\n")
    host_tools = {}
    for name in ("python", "git", "timeout"):
        path = pathlib.Path(shutil.which(name)).resolve(strict=True)
        host_tools[name] = {"path": str(path), "sha256": sha256(path)}
    host_tools["pythonVersion"] = sys.version
    host_tools["pipVersion"] = subprocess.run([sys.executable, "-I", "-m", "pip", "--version"],
        check=True, text=True, stdout=subprocess.PIPE, timeout=15).stdout.strip()
    host_tools["platform"] = {"system": sys.platform, "machine": os.uname().machine}
    (EVIDENCE / "host-tools.json").write_text(json.dumps(host_tools, indent=2, sort_keys=True) + "\n")
    direct = INPUTS / "umf_core-0.10.2-cp311-abi3-linux_x86_64.whl"
    raw_show = [str(TOOLS / "venv/bin/auditwheel"), "show", "--json", str(direct)]
    run_bounded("auditwheel-show-direct", raw_show, env=tool_env)
    (EVIDENCE / "direct-elf.json").write_text("{}\n")
    run_bounded("inspect-direct-elf", [str(py), "-I", str(pathlib.Path(__file__)), "inspect", str(direct), str(EVIDENCE / "direct-elf.json"), "raw"], env=tool_env)
    direct_report = json.loads((EVIDENCE / "direct-elf.json").read_text())
    if direct_report.get("nativeSha256") != DIRECT_NATIVE_SHA256:
        raise ValueError("static ELF inspection did not reproduce the pinned direct native hash")
    raw_policy = auditwheel_json_report(
        (EVIDENCE / "logs/auditwheel-show-direct.log").read_text(encoding="utf-8", errors="replace"),
        direct.name)
    direct_policy = raw_policy["overall_tag"]
    direct_report["minimalManylinuxPolicy"] = direct_policy
    direct_report["auditwheel"] = raw_policy
    (EVIDENCE / "direct-elf.json").write_text(json.dumps(direct_report, indent=2, sort_keys=True) + "\n")
    run_bounded("auditwheel-repair-auto", [str(TOOLS / "venv/bin/auditwheel"), "repair", "--plat", "auto",
        "--wheel-dir", str(REPAIRED), str(direct)], env=tool_env)
    repaired = sorted(REPAIRED.glob("*.whl"))
    if len(repaired) != 1 or repaired[0].stat().st_size > WHEEL_LIMIT:
        raise ValueError("repair did not produce exactly one wheel within 16 MiB")
    run_bounded("auditwheel-show-repaired", [str(TOOLS / "venv/bin/auditwheel"), "show", "--json", str(repaired[0])], env=tool_env)
    run_bounded("inspect-repaired-elf", [str(py), "-I", str(pathlib.Path(__file__)), "inspect", str(repaired[0]), str(EVIDENCE / "repaired-elf.json"), "repaired"], env=tool_env)
    tag = json.loads((EVIDENCE / "repaired-elf.json").read_text())["wheelTags"][0]
    repaired_policy = auditwheel_json_report(
        (EVIDENCE / "logs/auditwheel-show-repaired.log").read_text(encoding="utf-8", errors="replace"),
        repaired[0].name)
    if repaired_policy["overall_tag"] != direct_policy or tag != f"cp311-abi3-{direct_policy}":
        raise ValueError("repaired wheel does not match the unique raw-ELF minimal policy witness")
    repaired_elf = json.loads((EVIDENCE / "repaired-elf.json").read_text())
    repaired_elf["minimalManylinuxPolicy"] = direct_policy
    repaired_elf["auditwheel"] = repaired_policy
    (EVIDENCE / "repaired-elf.json").write_text(json.dumps(repaired_elf, indent=2, sort_keys=True) + "\n")
    verifier = SOURCE / "tools/verify_python_artifacts.py"
    run_bounded("verify-repaired-payload", [sys.executable, "-I", str(verifier), "--wheel", str(repaired[0]),
        "--expected-version", "0.10.2", "--expected-platform", "auto", "--repository", str(SOURCE),
        "--receipt", str(EVIDENCE / "payload-before-tests.json")])
    run_bounded("create-test-environment", [sys.executable, "-I", "-m", "venv", str(TESTENV)])
    testpy = TESTENV / "bin/python"
    run_bounded("install-original-test-tools", [str(testpy), "-I", "-m", "pip", "install",
        "pytest==8.4.2", "hatchling==1.27.0", "pydantic==2.11.9",
        "--report", str(EVIDENCE / "test-install-report.json")])
    run_bounded("install-repaired-wheel", [str(testpy), "-I", "-m", "pip", "install", "--no-index", "--no-deps",
        "--no-compile", str(repaired[0])])
    run_bounded("installed-identity-before-tests", [str(testpy), "-I", "-B", str(pathlib.Path(__file__)), "installed-check",
        str(EVIDENCE / "installed-before-tests.json")])
    run_bounded("verify-installed-before-tests", [str(testpy), "-I", "-B", str(verifier), "--wheel", str(repaired[0]),
        "--expected-version", "0.10.2", "--verify-installed-wheel", "--receipt",
        str(EVIDENCE / "installed-payload-before-tests.json")])
    installed = json.loads((EVIDENCE / "installed-before-tests.json").read_text())
    payload_before = json.loads((EVIDENCE / "payload-before-tests.json").read_text())
    installed_payload_before = json.loads((EVIDENCE / "installed-payload-before-tests.json").read_text())
    if payload_before.get("source_payload_verification") != "passed" or installed_payload_before.get("status") != "passed":
        raise ValueError("repaired source payload or pre-test installed-byte verification did not pass")
    if installed["nativeSha256"] != json.loads((EVIDENCE / "repaired-elf.json").read_text())["nativeSha256"]:
        raise ValueError("installed native member differs from repaired wheel bytes")
    test_files = [
        "test_action_runtime_generated_client.py", "test_action_runtime_resources.py",
        "test_action_fixture_vectors.py", "test_core.py", "test_rust_core.py", "test_extension_kinds.py",
    ]
    junit = EVIDENCE / "six-module-tests.xml"
    argv = [str(testpy), "-I", "-B", "-m", "pytest", "-q", f"--junitxml={junit}"]
    argv.extend(str(SOURCE / "python/tests" / filename) for filename in test_files)
    run_bounded("installed-six-module-suite", argv, cwd=TEMP)
    run_bounded("verify-repaired-payload-after-tests", [str(testpy), "-I", "-B", str(verifier), "--wheel", str(repaired[0]),
        "--expected-version", "0.10.2", "--verify-installed-wheel", "--receipt", str(EVIDENCE / "payload-after-tests.json")])
    run_bounded("installed-identity-after-tests", [str(testpy), "-I", "-B", str(pathlib.Path(__file__)), "installed-check",
        str(EVIDENCE / "installed-after-tests.json")])
    before = json.loads((EVIDENCE / "installed-before-tests.json").read_text())
    after = json.loads((EVIDENCE / "installed-after-tests.json").read_text())
    if before != after or after["nativeSha256"] != json.loads((EVIDENCE / "repaired-elf.json").read_text())["nativeSha256"]:
        raise ValueError("installed distribution/native bytes changed during the six-module suite")
    payload_after = json.loads((EVIDENCE / "payload-after-tests.json").read_text())
    if (payload_after.get("status") != "passed"
            or payload_after.get("wheel_sha256") != json.loads((EVIDENCE / "repaired-elf.json").read_text())["sha256"]
            or payload_after.get("native_sha256") != after["nativeSha256"]):
        raise ValueError("post-test installed wheel payload/native bytes do not match the repaired wheel")
    import xml.etree.ElementTree as ET
    junit_root = ET.parse(junit).getroot()
    suites = [junit_root] if junit_root.tag == "testsuite" else list(junit_root.findall("testsuite"))
    counts = {key: sum(int(suite.get(key, "0")) for suite in suites)
              for key in ("tests", "errors", "failures", "skipped")}
    if counts != {"tests": 254, "errors": 0, "failures": 0, "skipped": 0}:
        raise ValueError("six-module suite did not produce exactly 254 passes with zero errors/failures/skips")
    (EVIDENCE / "qualification.json").write_text(json.dumps({
        "profile": "umf.core-0102-manylinux-repair-qualification/1",
        "status": "QUALIFIED_REPAIRED_LINUX_WHEEL",
        "scope": "one exact repaired wheel; source/run identity and repaired bytes are distinct from historical direct/sdist evidence",
        "source": source, "harness": harness, "originalInput": input_report,
        "repairedWheel": {"filename": repaired[0].name, "bytes": repaired[0].stat().st_size,
                          "sha256": sha256(repaired[0]), "tag": tag,
                          "nativeSha256": json.loads((EVIDENCE / "repaired-elf.json").read_text())["nativeSha256"]},
        "toolchain": json.loads((EVIDENCE / "tool-versions.json").read_text()),
        "tests": {"modules": test_files, "counts": counts, "junit": "six-module-tests.xml"},
        "distributionVersion": "0.10.2", "semanticCoreVersion": "0.10.0",
        "qualificationClaims": {"repairedArtifactPayload": True, "installedBytes": True,
                                 "sixModuleSuite": True, "publication": False},
    }, indent=2, sort_keys=True) + "\n")


def inspect_wheel() -> None:
    import io
    import re
    import zipfile
    from email.parser import Parser
    from elftools.elf.elffile import ELFFile
    from packaging.utils import parse_wheel_filename
    wheel, output = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
    role = sys.argv[4] if len(sys.argv) > 4 else ""
    if wheel.stat().st_size > WHEEL_LIMIT:
        raise SystemExit("wheel exceeds 16 MiB before inspection")
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        native = archive.read("umf/_rust_core.abi3.so")
        wheel_files = [name for name in names if name.endswith(".dist-info/WHEEL")]
        if len(wheel_files) != 1:
            raise SystemExit("expected exactly one WHEEL metadata file")
        metadata = Parser().parsestr(archive.read(wheel_files[0]).decode("utf-8"))
        tags = metadata.get_all("Tag", [])
        elf = ELFFile(io.BytesIO(native))
        needed, versions, properties = [], [], []
        for section in elf.iter_sections():
            if section.name == ".dynamic":
                needed = [str(tag.needed) for tag in section.iter_tags() if tag.entry.d_tag == "DT_NEEDED"]
            elif section.name == ".gnu.version_r":
                for verneed, auxiliaries in section.iter_versions():
                    versions.extend({"library": verneed.name, "version": aux.name} for aux in auxiliaries)
            elif section.name == ".note.gnu.property":
                properties.append({"bytes": section.data_size, "sha256": hashlib.sha256(section.data()).hexdigest()})
    result = {"filename": wheel.name, "bytes": wheel.stat().st_size, "sha256": sha256(wheel),
              "nativeSha256": hashlib.sha256(native).hexdigest(), "nativeBytes": len(native), "wheelTags": tags,
              "elfClass": elf.elfclass, "elfMachine": elf.header["e_machine"], "elfType": elf.header["e_type"],
              "neededLibraries": needed, "versionedSymbols": sorted(versions, key=lambda row:(row["library"],row["version"])),
              "gnuPropertyNotes": properties, "memberCount": len(names),
              "membersSha256": hashlib.sha256("\n".join(sorted(names)).encode()).hexdigest()}
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    if result["elfClass"] != 64 or result["elfMachine"] != "EM_X86_64" or result["elfType"] != "ET_DYN":
        raise SystemExit("native ELF is not a 64-bit x86_64 shared object")
    if len(tags) != 1:
        raise SystemExit("closed product verifier requires one WHEEL tag; multiple aliases are a HOLD")
    if not tags[0].startswith("cp311-abi3-"):
        raise SystemExit("wheel does not retain the cp311-abi3 interpreter/ABI")
    project, version, _, filename_tags = parse_wheel_filename(wheel.name)
    if (project != "umf-core" or str(version) != "0.10.2" or len(filename_tags) != 1
            or {str(tag) for tag in filename_tags} != set(tags)):
        raise SystemExit("wheel filename and WHEEL metadata do not agree exactly")
    platform_tag = tags[0].split("-", 2)[2]
    if role == "raw":
        if wheel.name != "umf_core-0.10.2-cp311-abi3-linux_x86_64.whl" or platform_tag != "linux_x86_64":
            raise SystemExit("raw input is not the one frozen cp311-abi3 linux_x86_64 wheel")
    elif role == "repaired":
        if not re.fullmatch(r"manylinux_2_[0-9]+_x86_64", platform_tag):
            raise SystemExit("repaired platform tag is not an exact x86_64 manylinux policy")
    else:
        raise SystemExit("wheel inspection requires an explicit raw or repaired role")


def auditwheel_json_report(text: str, expected_filename: str) -> dict:
    import re
    expected = {
        "version", "wheel", "pure", "overall_tag", "sym_tag", "pyfpe", "ucs2",
        "unsupported_isa", "versioned_symbols", "external_libs", "policy_upgrades",
    }
    reports = []
    for line in text.splitlines():
        candidate = line.strip()
        if not candidate.startswith("{"):
            continue
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError as error:
            raise ValueError("auditwheel JSON output is malformed") from error
        if not isinstance(value, dict):
            raise ValueError("auditwheel JSON result is not an object")
        reports.append(value)
    if len(reports) != 1:
        raise ValueError("auditwheel did not emit exactly one structured policy result")
    report = reports[0]
    if set(report) != expected:
        raise ValueError("auditwheel JSON fields are incomplete or differ from the pinned version-1 profile")
    if (type(report["version"]) is not int or report["version"] != 1
            or report["wheel"] != expected_filename or report["pure"] is not False
            or report["pyfpe"] is not False or report["ucs2"] is not False
            or report["unsupported_isa"] is not False
            or not isinstance(report["versioned_symbols"], dict)
            or not isinstance(report["external_libs"], dict)
            or not isinstance(report["policy_upgrades"], dict)
            or any(not isinstance(key, str) or not isinstance(values, list)
                   or any(not isinstance(value, str) for value in values)
                   for key, values in report["versioned_symbols"].items())
            or any(not isinstance(key, str) or (value is not None and not isinstance(value, str))
                   for key, value in report["external_libs"].items())
            or not re.fullmatch(r"manylinux_2_[0-9]+_x86_64", str(report["overall_tag"]))
            or not re.fullmatch(r"manylinux_2_[0-9]+_x86_64", str(report["sym_tag"]))):
        raise ValueError("auditwheel result has no valid supported x86_64 minimum-policy witness")
    return report


def installed_check() -> None:
    import importlib.metadata
    import platform
    import sysconfig
    import umf
    from umf import current_core_version
    from umf._rust import _rust_core
    root = pathlib.Path(umf.__file__).resolve()
    native = pathlib.Path(_rust_core.__file__).resolve()
    platlib = pathlib.Path(sysconfig.get_path("platlib")).resolve()
    data = {"python": platform.python_version(), "machine": platform.machine(),
            "pythonPlatform": sysconfig.get_platform(), "distributionVersion": importlib.metadata.version("umf-core"),
            "semanticCoreVersion": current_core_version(), "modulePath": str(root), "nativePath": str(native),
            "nativeSha256": sha256(native), "insideEnvironment": root.is_relative_to(platlib),
            "nativeInsidePackage": native.is_relative_to(root.parent), "nativeSuffix": native.suffix}
    pathlib.Path(sys.argv[2]).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    if (data["distributionVersion"] != "0.10.2" or data["semanticCoreVersion"] != "0.10.0"
            or not data["insideEnvironment"] or not data["nativeInsidePackage"] or data["nativeSuffix"] != ".so"):
        raise SystemExit("installed artifact identity or origin mismatch")


def main() -> int:
    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else "run"
        if mode == "inspect":
            inspect_wheel()
        elif mode == "installed-check":
            installed_check()
        elif mode == "run":
            run_gate()
        else:
            raise ValueError("unknown driver mode")
        return 0
    except BaseException as error:
        if len(sys.argv) <= 1 or sys.argv[1] == "run":
            EVIDENCE.mkdir(parents=True, exist_ok=True)
            (EVIDENCE / "qualification.json").write_text(json.dumps({
                "profile": "umf.core-0102-manylinux-repair-qualification/1",
                "status": "FAIL_OR_UNKNOWN", "reasonType": type(error).__name__,
                "sourceCommit": SOURCE_COMMIT, "claims": {"repairedArtifactPayload": False,
                "installedBytes": False, "sixModuleSuite": False, "publication": False}},
                indent=2, sort_keys=True) + "\n")
        print(type(error).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
