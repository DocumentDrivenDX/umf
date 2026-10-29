set -euo pipefail
START_MS="$(cat "$D5_ROOT/monotonic-start-ms")"
DEADLINE_MS="$(cat "$D5_ROOT/monotonic-deadline-ms")"
NOW_MS="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
REMAINING_SECONDS="$(((DEADLINE_MS - NOW_MS - 70000) / 1000))"
if (( REMAINING_SECONDS <= 0 )); then
  echo "Original 30-minute D5 budget exhausted before replay work." >&2
  exit 124
fi
timeout --signal=TERM --kill-after=10s "${REMAINING_SECONDS}s" bash -euo pipefail <<'BOUNDED_D5_WORK'
EVIDENCE="$D5_ROOT/evidence"
WORK="$D5_ROOT/work"
VENV_PARENT="$D5_ROOT/venv-parent"
VENV="$VENV_PARENT/venv"
ACTIVE_COMMAND="$EVIDENCE/active-command.json"
mkdir -p "$WORK" "$VENV_PARENT" "$EVIDENCE/logs" "$EVIDENCE/reports" "$EVIDENCE/replay"
: > "$EVIDENCE/command-records.jsonl"

run_bounded() {
  local name="$1" maximum="$2" now_ms deadline_ms remaining limit status capture_status log started_ms ended_ms prior_log_bytes available_log_bytes
  local -a pipeline_status
  shift 2
  now_ms="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
  deadline_ms="$(cat "$D5_ROOT/monotonic-deadline-ms")"
  remaining="$(((deadline_ms - now_ms - 70000) / 1000))"
  if (( remaining <= 0 )); then
    echo "Original D5 aggregate work deadline exhausted before $name" >&2
    return 124
  fi
  limit="$maximum"
  if (( remaining < limit )); then limit="$remaining"; fi
  log="$EVIDENCE/logs/$name.log"
  prior_log_bytes="$(find "$EVIDENCE/logs" -type f -name '*.log' -exec wc -c {} + | awk 'END {print $1+0}')"
  available_log_bytes=$((1048576 - prior_log_bytes))
  if (( available_log_bytes < 0 )); then available_log_bytes=0; fi
  started_ms="$now_ms"
  python -I - "$ACTIVE_COMMAND" "$name" "$started_ms" "$limit" <<'PY'
import json, os, pathlib, sys
path=pathlib.Path(sys.argv[1]); temporary=path.with_name(path.name+".tmp")
payload={"name":sys.argv[2],"startedMonotonicMs":int(sys.argv[3]),"selectedLimitSeconds":int(sys.argv[4])}
with temporary.open("w",encoding="utf-8") as stream:
    stream.write(json.dumps(payload,sort_keys=True,separators=(",",":"))+"\n")
    stream.flush(); os.fsync(stream.fileno())
os.replace(temporary,path)
PY
  : > "$log"
  set +e
  timeout --signal=TERM --kill-after=10s "${limit}s" "$@" 2>&1 | python -I -c '
import sys
path, cap = sys.argv[1], int(sys.argv[2])
marker = b"\n[LOG TRUNCATED: output exceeded aggregate capture cap]\n"
failed = False
truncated = False
stored = 0
try:
    output = open(path, "wb", buffering=0)
except OSError:
    output = None
    failed = True
while True:
    chunk = sys.stdin.buffer.read(65536)
    if not chunk:
        break
    if output is None:
        continue
    available = max(0, cap - stored)
    piece = chunk[:available]
    if piece:
        try:
            output.write(piece)
            stored += len(piece)
        except OSError:
            failed = True
            try: output.close()
            except OSError: pass
            output = None
    if len(chunk) > available:
        truncated = True
if output is not None:
    try:
        if truncated:
            marker_bytes = marker[:cap]
            output.seek(max(0, cap - len(marker_bytes)))
            output.truncate()
            output.write(marker_bytes)
        output.close()
    except OSError:
        failed = True
sys.exit(74 if failed else 75 if truncated else 0)
' "$log" "$available_log_bytes"
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  status="${pipeline_status[0]}"
  capture_status="${pipeline_status[1]}"
  ended_ms="$(awk '{printf "%d", $1 * 1000}' /proc/uptime)"
  python -I - "$EVIDENCE/command-records.jsonl" "$log" "$name" "$status" "$capture_status" "$((ended_ms - started_ms))" "$limit" "$@" <<'PY'
import hashlib, json, os, pathlib, sys
records, log_path, name, raw_exit, capture_exit, duration, limit_seconds, *argv = sys.argv[1:]
payload = pathlib.Path(log_path).read_bytes()
record = {"name":name,"stage":name,"argv":argv,"rawExit":int(raw_exit),
          "captureExit":int(capture_exit),"monotonicDurationMs":int(duration),
          "limitSeconds":int(limit_seconds),"logBytes":len(payload),
          "logSha256":hashlib.sha256(payload).hexdigest(),
          "truncated":int(capture_exit)==75,
          "truncationMarker":"LOG TRUNCATED: output exceeded aggregate capture cap" if int(capture_exit)==75 else None}
with pathlib.Path(records).open("a",encoding="utf-8") as stream:
    stream.write(json.dumps(record,sort_keys=True)+"\n")
    stream.flush(); os.fsync(stream.fileno())
PY
  rm -f "$ACTIVE_COMMAND"
  if (( status != 0 || capture_status != 0 )); then
    echo "D5 command $name failed: raw exit $status, capture exit $capture_status, limit ${limit}s" >&2
    return 1
  fi
}

run_bounded source-freeze 60 python -I - <<'PY'
import hashlib, json, os, pathlib, shutil, subprocess
head=subprocess.run(["git","rev-parse","HEAD"],check=True,text=True,stdout=subprocess.PIPE).stdout.strip()
tree=subprocess.run(["git","rev-parse","HEAD^{tree}"],check=True,text=True,stdout=subprocess.PIPE).stdout.strip()
status=subprocess.run(["git","status","--porcelain"],check=True,text=True,stdout=subprocess.PIPE).stdout
event=os.environ["GITHUB_EVENT_NAME"]
if event=="pull_request":
    assert os.environ["GITHUB_HEAD_REF"]=="codex/mig-g02-typed-backfills"
else:
    assert event=="workflow_dispatch" and not os.environ["GITHUB_HEAD_REF"]
    ref=os.environ["GITHUB_REF"]
    resolved=subprocess.run(["git","rev-parse","--verify",ref+"^{commit}"],check=True,text=True,stdout=subprocess.PIPE).stdout.strip()
    assert resolved==head,(ref,resolved,head)
assert head==os.environ["GITHUB_SHA"] and not status,(head,os.environ["GITHUB_SHA"],status)
tools={}
for name in ("python","timeout","git"):
    path=shutil.which(name); assert path,name
    resolved=str(pathlib.Path(path).resolve())
    version=subprocess.run([path,"--version"],check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout.strip()
    tools[name]={"path":resolved,"sha256":hashlib.sha256(pathlib.Path(resolved).read_bytes()).hexdigest(),"version":version}
workflow_file=pathlib.Path(".github/workflows/access-boundaries.yml")
pathlib.Path(os.environ["D5_ROOT"],"evidence","qualification-inputs.json").write_text(json.dumps({
    "sourceCommit":head,"sourceTree":tree,"runId":os.environ["GITHUB_RUN_ID"],
    "runAttempt":os.environ["GITHUB_RUN_ATTEMPT"],"ref":os.environ["GITHUB_REF"],
    "event":os.environ["GITHUB_EVENT_NAME"],"headRef":os.environ["GITHUB_HEAD_REF"],
    "workflow":os.environ["GITHUB_WORKFLOW"],"workflowSha256":hashlib.sha256(workflow_file.read_bytes()).hexdigest(),"tools":tools,
    "bounds":{"aggregateSeconds":1800,"workSeconds":1730,"evidenceReserveSeconds":60,
               "childSeconds":180,"killGraceSeconds":10,"logBytes":1048576,"evidenceBytes":16777216}},
    sort_keys=True,indent=2)+"\n")
PY

run_bounded safe-extract-retained-fixtures 60 python -I - <<'PY'
import hashlib, json, pathlib, tarfile
root=pathlib.Path(__import__("os").environ["D5_ROOT"])
evidence=root/"evidence"; replay=evidence/"replay"
archive=pathlib.Path("docs/helix/04-build/evidence/mig-g02/independent-review/candidate-009-independent-evidence.tar.gz")
fixture=pathlib.Path("docs/helix/04-build/evidence/mig-g02/independent-review/independent-native-replay-fixture.json.gz")
expected={"candidate-009/installed-text-oracle.py":"5dfddd7f1bd7f6e254e927292246ceddf5debfe172995ad267d4bbbfd32c2ea4",
          "candidate-009/fault-runner.py":"f34931dfea75db09014978f7d069284f50080b8b700e96603c28e03fe7f9433d",
          "candidate-009/no-default-runner.py":"a756e43e7f91d7d55eeb34d639790636bf4af92b6de0fec191d956d0ff568a07",
          "candidate-009/fault-fixture.json":"09173dd6294e84e5e6a6416e675a17110b831339b450de8cb597b9bfa2a798cc",
          "candidate-009/no-default-fixture.json":"ba3c914d6590ed86640c22c6f4dbd1447168efca833b03c47f9270e2dc8c3af5"}
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="092b2db842101fe9aac485e05c8d79775b048602b671189a9c83e91467a64d86"
assert hashlib.sha256(fixture.read_bytes()).hexdigest()=="c29ee30dd76e6e4fbbf6ceea64cb22d77764c2a349081819d0d7ac1c1dc59af1"
replay.mkdir(parents=True,exist_ok=True)
(replay/"candidate-009").mkdir();(replay/"g01").mkdir()
with tarfile.open(archive,"r:gz") as source:
    for name,digest in expected.items():
        member=source.getmember(name); assert member.isfile() and member.size<=100000
        payload=source.extractfile(member).read(); assert hashlib.sha256(payload).hexdigest()==digest
        target=replay/name; target.write_bytes(payload)
(replay/"g01"/"fixture.json.gz").write_bytes(fixture.read_bytes())
(evidence/"replay"/"archive.tar.gz").write_bytes(archive.read_bytes())
(evidence/"replay"/"fixture.json.gz").write_bytes(fixture.read_bytes())
import difflib, gzip
successor_root=pathlib.Path("docs/helix/04-build/evidence/mig-g02/independent-review/d5-row-observation-successor")
compressed=(successor_root/"installed-text-oracle-d5-row-observation-successor.py.gz").read_bytes()
patch=(successor_root/"original-to-successor.patch").read_bytes()
custody=(successor_root/"custody.json").read_bytes()
assert hashlib.sha256(compressed).hexdigest()=="1f2e5d676a8480838d973962e23a5cb3687c6798beecb038d5a31e324d40875e"
assert hashlib.sha256(patch).hexdigest()=="660733be45ea13036d1aa8b29bb858803c606bcd15ac0963933d1483b38bead6"
assert hashlib.sha256(custody).hexdigest()=="0865f14764f68dfc6e2818a54e336e2034720c696f797a6066816fdf5414957e"
successor=gzip.decompress(compressed)
assert hashlib.sha256(successor).hexdigest()=="89ba88c6187bee2f350e4448266f6aa470a42862fc146f97e1b43edccdd41639"
original=(replay/"candidate-009"/"installed-text-oracle.py").read_bytes()
assert hashlib.sha256(original).hexdigest()=="5dfddd7f1bd7f6e254e927292246ceddf5debfe172995ad267d4bbbfd32c2ea4"
expected_patch="".join(difflib.unified_diff(original.decode().splitlines(keepends=True),successor.decode().splitlines(keepends=True),fromfile="candidate-009/installed-text-oracle.py",tofile="candidate-009/installed-text-oracle-d5-row-observation-successor.py")).encode()
assert expected_patch==patch
custody_record=json.loads(custody)
assert custody_record["originalArchiveSha256"]==hashlib.sha256(archive.read_bytes()).hexdigest()
assert custody_record["originalOracleSha256"]==hashlib.sha256(original).hexdigest()
assert custody_record["successorSha256"]==hashlib.sha256(successor).hexdigest()
assert custody_record["successorGzipSha256"]==hashlib.sha256(compressed).hexdigest()
assert custody_record["successorPatchSha256"]==hashlib.sha256(patch).hexdigest()
(replay/"candidate-009"/"installed-text-oracle-d5-row-observation-successor.py").write_bytes(successor)
(evidence/"replay"/"oracle-successor.py.gz").write_bytes(compressed)
(evidence/"replay"/"oracle-successor.patch").write_bytes(patch)
(evidence/"replay"/"oracle-successor-custody.json").write_bytes(custody)
metadata_root=pathlib.Path("docs/helix/04-build/evidence/mig-g02/independent-review/d5-weft55-metadata-successor")
nd_gz=(metadata_root/"no-default-runner-d5-weft55-metadata-successor.py.gz").read_bytes()
nd_patch=(metadata_root/"no-default-parent-to-successor.patch").read_bytes()
meta_gz=(metadata_root/"installed-text-oracle-d5-weft55-metadata-successor.py.gz").read_bytes()
meta_patch=(metadata_root/"row-observation-parent-to-successor.patch").read_bytes()
meta_custody=(metadata_root/"custody.json").read_bytes()
fixed={"no-default-runner-d5-weft55-metadata-successor.py.gz":"870a220eb95ec41c232bc578ca9cf0d0a94296d40efd92aa8696a167d1d6a6cc",
       "no-default-parent-to-successor.patch":"042262de18502a6f44534a21d75d402f8e81211a1c5886cca68ad538af2fa9d8",
       "installed-text-oracle-d5-weft55-metadata-successor.py.gz":"edb4bbf6a709ea4971a8e234b1e8ef6b648de2252eb7b134adc4f2a803bb2407",
       "row-observation-parent-to-successor.patch":"fdacd514f6dfba0be8df9474fd5ed1bd19f5dca265674c60644ab400a26221ab",
       "custody.json":"6ae8277fbd3cf65e785134161c255d1d4a97de222d18dc59d15a401279d6735f"}
for name,payload in (("no-default-runner-d5-weft55-metadata-successor.py.gz",nd_gz),("no-default-parent-to-successor.patch",nd_patch),
                     ("installed-text-oracle-d5-weft55-metadata-successor.py.gz",meta_gz),("row-observation-parent-to-successor.patch",meta_patch),("custody.json",meta_custody)):
    assert hashlib.sha256(payload).hexdigest()==fixed[name],name
record=json.loads(meta_custody); nd_source=gzip.decompress(nd_gz); meta_source=gzip.decompress(meta_gz)
assert hashlib.sha256(nd_source).hexdigest()=="b25c3e319f4173366214156bdd2dd255f1c08ba8bddf6a21f647ddc6b4aef955"
assert hashlib.sha256(meta_source).hexdigest()=="e197d3630079c597964aa81b875ef6e7cd53f1c2fab42018bdb5a8684bf53600"
original_nd=(replay/"candidate-009/no-default-runner.py").read_bytes()
patch_nd="".join(difflib.unified_diff(original_nd.decode().splitlines(keepends=True),nd_source.decode().splitlines(keepends=True),fromfile="candidate-009/no-default-runner.py",tofile="candidate-009/no-default-runner-d5-weft55-metadata-successor.py")).encode()
patch_meta="".join(difflib.unified_diff(successor.decode().splitlines(keepends=True),meta_source.decode().splitlines(keepends=True),fromfile="candidate-009/installed-text-oracle-d5-row-observation-successor.py",tofile="candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py")).encode()
assert patch_nd==nd_patch and patch_meta==meta_patch
assert record["originalArchive"]["sha256"]==hashlib.sha256(archive.read_bytes()).hexdigest()
assert record["originalNoDefault"]["sha256"]==hashlib.sha256(original_nd).hexdigest()
assert record["originalOracle"]["sha256"]==hashlib.sha256(original).hexdigest()
assert record["rowObservationParent"]["sourceSha256"]==hashlib.sha256(successor).hexdigest()
assert record["successors"]["noDefault"]["sourceSha256"]==hashlib.sha256(nd_source).hexdigest()
assert record["successors"]["rowObservationOracle"]["sourceSha256"]==hashlib.sha256(meta_source).hexdigest()
(replay/"candidate-009/no-default-runner-d5-weft55-metadata-successor.py").write_bytes(nd_source)
(replay/"candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py").write_bytes(meta_source)
for name,payload in (("no-default-metadata-successor.py.gz",nd_gz),("no-default-metadata-successor.patch",nd_patch),
                     ("metadata-oracle-successor.py.gz",meta_gz),("metadata-oracle-successor.patch",meta_patch),
                     ("metadata-successor-custody.json",meta_custody)):
    (evidence/"replay"/name).write_bytes(payload)
PY

run_bounded create-fresh-venv 120 python -m venv "$VENV"
run_bounded install-complete-current-cohort-offline 180 "$VENV/bin/python" -I -m pip --isolated install --disable-pip-version-check --no-cache-dir --no-index --only-binary=:all: --find-links /tmp/umf-g02-cohort/wheelhouse --require-hashes -r /tmp/umf-g02-cohort/mirror/requirements.lock
run_bounded pip-check-and-version-identity 120 "$VENV/bin/python" -I - <<'PY'
import importlib.metadata as m, json, pathlib
expected={"umf-access":"0.1.0.dev8","umf-codegen":"0.1.0a5","umf-weft":"0.4.55","umf-core":"0.10.3","mini-racer":"0.14.1"}
actual={name:m.version(name) for name in expected}
assert actual==expected,actual
pathlib.Path(__import__("os").environ["D5_ROOT"],"evidence","installed-versions.json").write_text(json.dumps({"versions":actual,"python":__import__("sys").version},sort_keys=True,indent=2)+"\n")
PY
run_bounded pip-consistency-check 90 "$VENV/bin/python" -I -m pip --isolated check

run_bounded freeze-actual-18-wheel-and-installed-file-custody 180 "$VENV/bin/python" -I - /tmp/umf-g02-cohort "$EVIDENCE/owner-artifacts.json" "$GITHUB_SHA" "$D5_ROOT" <<'PY'
import hashlib, importlib.metadata as metadata, json, os, pathlib, re, sys, zipfile
cohort,out,source,d5=map(pathlib.Path,sys.argv[1:5]); lock_path=cohort/"cohort.lock.json"
lock=json.loads(lock_path.read_text()); assert len(lock["wheels"])==18 and len(lock["packages"])==18
wheelhouse=cohort/"wheelhouse"; wheels=sorted(wheelhouse.glob("*.whl")); assert len(wheels)==18
artifacts={}; wheel_details={}; core_native=[]
locked_wheels={}
for row in lock["wheels"]:
    filename=row["filename"]
    assert filename not in locked_wheels, ("duplicate lock wheel filename",filename)
    locked_wheels[filename]={"sha256":row["sha256"],"bytes":row["size"]}
for wheel in wheels:
    raw=wheel.read_bytes(); digest=hashlib.sha256(raw).hexdigest(); artifacts[wheel.name]={"sha256":digest,"bytes":len(raw)}
    members=[]
    with zipfile.ZipFile(wheel) as z:
        for info in z.infolist():
            if info.is_dir(): continue
            body=z.read(info.filename); members.append({"path":info.filename,"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()})
            if wheel.name=="umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl" and info.filename.endswith(".so"):
                core_native.append({"path":info.filename,"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()})
    wheel_details[wheel.name]={"sha256":digest,"bytes":len(raw),"members":members}
assert artifacts==locked_wheels, ("complete physical wheel map differs from all 18 locked rows",artifacts,locked_wheels)
assert artifacts.get("umf_core-0.10.3-cp311-abi3-manylinux_2_34_x86_64.whl",{}).get("sha256")=="cd35f255900ec122e5e2d47d1fbac658cc127d3f16ba82e643e199b7d8cebd75"
assert len(core_native)==1 and core_native[0]["sha256"]=="c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57"
normalize=lambda value: re.sub(r"[-_.]+","-",value).lower()
lock_names=[normalize(row["distribution"]) for row in lock["packages"]]
assert len(lock_names)==len(set(lock_names)), ("normalized lock distribution collision",lock_names)
expected={normalize(row["distribution"]):row["version"] for row in lock["packages"]}
distributions={}
for dist in metadata.distributions():
    name=dist.metadata.get("Name")
    if name:
        normalized=normalize(name)
        if normalized in expected:
            assert normalized not in distributions, ("normalized installed distribution collision",normalized)
            distributions[normalized]=dist
assert set(distributions)==set(expected), (sorted(distributions),sorted(expected))
installed={}
for name,dist in sorted(distributions.items()):
    assert dist.version==expected[name],(name,dist.version,expected[name])
    files=[]
    for item in dist.files or ():
        path=pathlib.Path(dist.locate_file(item))
        if not path.is_file(): continue
        body=path.read_bytes(); files.append({"path":str(item),"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()})
    assert files, name
    installed[name]={"version":dist.version,"files":files}
installed_core_native=[item for item in installed["umf-core"]["files"] if item["path"].endswith(".so")]
assert len(installed_core_native)==1 and installed_core_native[0]["sha256"]==core_native[0]["sha256"],installed_core_native
root=pathlib.Path(d5); lock_copy=root/"evidence"/"cohort.lock.json"; lock_copy.write_bytes(lock_path.read_bytes())
mirror=cohort/"mirror"/"manifest.json"; mirror_copy=root/"evidence"/"mirror-manifest.json"; mirror_copy.write_bytes(mirror.read_bytes())
assets=pathlib.Path("python/umf_codegen/src/umf_codegen/_assets/manifest.json"); assets_bytes=assets.read_bytes()
manifest={"status":"frozen-current-D5-cohort","candidate":"G02-D5-"+source.name,
   "sourceCommit":source.name,"runId":os.environ["GITHUB_RUN_ID"],"runAttempt":os.environ["GITHUB_RUN_ATTEMPT"],
   "ref":os.environ["GITHUB_REF"],"workflow":os.environ["GITHUB_WORKFLOW"],
   "workflowSha256":hashlib.sha256(pathlib.Path(".github/workflows/access-boundaries.yml").read_bytes()).hexdigest(),
   "postgresql":{"required":"18.6","serverVersionNum":"180006","dsnPolicy":"local disposable service; connect_timeout=5; statement_timeout=120000; lock_timeout=5000"},
   "cohortLockSha256":hashlib.sha256(lock_path.read_bytes()).hexdigest(),"mirrorManifestSha256":hashlib.sha256(mirror.read_bytes()).hexdigest(),
   "lockedPackages":lock["packages"],
   "embeddedGeneratorManifestSha256":hashlib.sha256(assets_bytes).hexdigest(),"embeddedGeneratorInputs":json.loads(assets_bytes)["inputs"],
   "wheelCount":len(wheels),"wheels":wheel_details,"artifacts":artifacts,"installedDistributions":installed,
   "coreNativeMember":core_native[0],"replayArchiveSha256":"092b2db842101fe9aac485e05c8d79775b048602b671189a9c83e91467a64d86",
   "oracleSha256":"5dfddd7f1bd7f6e254e927292246ceddf5debfe172995ad267d4bbbfd32c2ea4",
   "oracleObservationParentSha256":"89ba88c6187bee2f350e4448266f6aa470a42862fc146f97e1b43edccdd41639",
   "oracleObservationParentGzipSha256":"1f2e5d676a8480838d973962e23a5cb3687c6798beecb038d5a31e324d40875e",
   "oracleObservationParentPatchSha256":"660733be45ea13036d1aa8b29bb858803c606bcd15ac0963933d1483b38bead6",
   "oracleObservationParentCustodySha256":"0865f14764f68dfc6e2818a54e336e2034720c696f797a6066816fdf5414957e",
   "oracleSuccessorSha256":"e197d3630079c597964aa81b875ef6e7cd53f1c2fab42018bdb5a8684bf53600",
   "oracleSuccessorGzipSha256":"edb4bbf6a709ea4971a8e234b1e8ef6b648de2252eb7b134adc4f2a803bb2407",
   "oracleSuccessorPatchSha256":"fdacd514f6dfba0be8df9474fd5ed1bd19f5dca265674c60644ab400a26221ab",
   "oracleSuccessorCustodySha256":"6ae8277fbd3cf65e785134161c255d1d4a97de222d18dc59d15a401279d6735f",
   "noDefaultOriginalRunnerSha256":"a756e43e7f91d7d55eeb34d639790636bf4af92b6de0fec191d956d0ff568a07",
   "noDefaultRunnerSha256":"b25c3e319f4173366214156bdd2dd255f1c08ba8bddf6a21f647ddc6b4aef955",
   "noDefaultRunnerGzipSha256":"870a220eb95ec41c232bc578ca9cf0d0a94296d40efd92aa8696a167d1d6a6cc",
   "noDefaultRunnerPatchSha256":"042262de18502a6f44534a21d75d402f8e81211a1c5886cca68ad538af2fa9d8",
   "noDefaultRunnerCustodySha256":"6ae8277fbd3cf65e785134161c255d1d4a97de222d18dc59d15a401279d6735f",
   "faultRunnerSha256":"f34931dfea75db09014978f7d069284f50080b8b700e96603c28e03fe7f9433d",
   "fixtureSha256":"c29ee30dd76e6e4fbbf6ceea64cb22d77764c2a349081819d0d7ac1c1dc59af1"}
out.write_text(json.dumps(manifest,sort_keys=True,indent=2)+"\n")
owner_copy=pathlib.Path(d5)/"venv-parent"/"owner-artifacts.json"
owner_copy.write_bytes(out.read_bytes())
assert owner_copy.read_bytes()==out.read_bytes()
PY
run_bounded baseline-postgresql-cleanup-audit 90 "$VENV/bin/python" -I - "$PG_DSN" "$EVIDENCE/reports/resource-baseline.json" <<'PY'
import json,sys,psycopg
dsn,path=sys.argv[1:]
with psycopg.connect(dsn,autocommit=True) as c:
    server,server_version,number=c.execute("select pg_catalog.version(), current_setting('server_version'), current_setting('server_version_num')").fetchone()
    assert "PostgreSQL 18.6" in server and isinstance(server_version,str) and server_version and number=="180006",(server,server_version,number)
    databases=c.execute("select datname from pg_catalog.pg_database where datname like 'rv_g02_%' or datname like 'g02f_%' or datname like 'g02nd_%' order by 1").fetchall()
    roles=c.execute("select rolname from pg_catalog.pg_roles where rolname like 'rv_g02_%' or rolname like 'g02f_%' or rolname like 'g02_%' order by 1").fetchall()
    schemas=c.execute("select nspname from pg_catalog.pg_namespace where nspname like 'ambient_%' order by 1").fetchall()
assert not databases and not roles and not schemas,(databases,roles,schemas)
open(path,"w").write(json.dumps({"server":server,"serverVersion":server_version,"serverVersionNum":number,"databases":databases,"roles":roles,"schemas":schemas},sort_keys=True,indent=2)+"\n")
PY

ORACLE="$D5_ROOT/evidence/replay/candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py"
REPORTS="$EVIDENCE/reports"
run_bounded oracle-date 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-date.json" --domain date
run_bounded oracle-integer 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-integer.json" --domain integer
run_bounded oracle-decimal-controls 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-decimal.json" --domain decimal --ambient-operators --nan-program-guard --unknown-commit
run_bounded oracle-text 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-text.json"
run_bounded oracle-eq-null-lost-commit 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-eq-null.json" --text-expression eq-null --case valid --unknown-commit
run_bounded oracle-ne-null 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-ne-null.json" --text-expression ne-null --case valid
run_bounded oracle-not-eq-value 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-not-eq-value.json" --text-expression not-eq-value --case valid
run_bounded oracle-not-ne-null 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-not-ne-null.json" --text-expression not-ne-null --case valid
run_bounded oracle-coalesce-empty 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-coalesce-empty.json" --text-expression coalesce --empty-input --case valid
run_bounded oracle-enum 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-enum.json" --domain integer --case invalid --enum-rejection
run_bounded oracle-unique 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-unique.json" --native-constraint unique --shape existing --case invalid
run_bounded oracle-foreign-key 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-foreign-key.json" --native-constraint foreign-key --shape existing --case invalid
run_bounded oracle-varchar-loss 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-varchar-loss.json" --native-constraint varchar-loss --case invalid
run_bounded oracle-bound-excess 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-bound-excess.json" --bound-excess --case invalid
run_bounded oracle-empty-table 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-empty-table.json" --empty-table --case valid
run_bounded oracle-all-populated 180 "$VENV/bin/python" -I "$ORACLE" --dsn "$PG_DSN" --report "$REPORTS/oracle-all-populated.json" --all-populated --shape existing --case valid

run_bounded no-default-replay 180 "$VENV/bin/python" -I "$D5_ROOT/evidence/replay/candidate-009/no-default-runner-d5-weft55-metadata-successor.py" --dsn "$PG_DSN" --fixture "$D5_ROOT/evidence/replay/candidate-009/no-default-fixture.json" --report "$REPORTS/no-default.json"
FAULT="$D5_ROOT/evidence/replay/candidate-009/fault-runner.py"
FIXTURE="$D5_ROOT/evidence/replay/candidate-009/fault-fixture.json"
for scenario in fenced-resume backfill-commit-lost existing-target-commit-lost; do
  run_bounded "fault-$scenario" 180 "$VENV/bin/python" -I "$FAULT" --dsn "$PG_DSN" --fixture "$FIXTURE" --manifest "$EVIDENCE/owner-artifacts.json" --scenario "$scenario" --report "$REPORTS/fault-$scenario.json"
done
run_bounded assemble-sdk-release-wheel-payload 60 "$VENV/bin/python" -I - "$D5_ROOT" "/tmp/umf-g02-cohort" <<'PY'
import hashlib,json,os,pathlib,re,stat,sys
root,cohort=map(pathlib.Path,sys.argv[1:]); evidence=root/"evidence"
owner=json.loads((evidence/"owner-artifacts.json").read_text()); lock=json.loads((evidence/"cohort.lock.json").read_text())
output=root/"release-payload"; assert not output.exists()
selected=[]; sources=[]
for distribution,version in (("umf-access","0.1.0.dev8"),("umf-codegen","0.1.0a5")):
    normalize=lambda value: re.sub(r"[-_.]+","-",value).lower()
    packages=[row for row in lock["packages"] if normalize(row["distribution"])==distribution and row["version"]==version]
    assert len(packages)==1,(distribution,version,packages)
    wheels=[row for row in lock["wheels"] if normalize(row["distribution"])==distribution and row["version"]==version]
    assert len(wheels)==1,(distribution,version,wheels)
    row=wheels[0]; filename=row["filename"]; expected={"sha256":row["sha256"],"bytes":row["size"]}
    assert pathlib.Path(filename).name==filename and filename.endswith(".whl")
    assert owner["artifacts"].get(filename)==expected,(filename,owner["artifacts"].get(filename),expected)
    source=cohort/"wheelhouse"/filename; metadata=source.lstat()
    assert stat.S_ISREG(metadata.st_mode) and metadata.st_size==expected["bytes"],(filename,metadata.st_size,expected)
    sources.append((source,filename,expected))
    selected.append({"distribution":distribution,"version":version,"filename":filename,**expected})
assert len({filename for _,filename,_ in sources})==2
receipt={"status":"current-job-built-release-payload","sourceCommit":owner["sourceCommit"],"sourceTree":json.loads((evidence/"qualification-inputs.json").read_text())["sourceTree"],"workflowSha256":owner["workflowSha256"],"runId":owner["runId"],"runAttempt":owner["runAttempt"],"cohortLockSha256":owner["cohortLockSha256"],"ownerManifestSha256":hashlib.sha256((evidence/"owner-artifacts.json").read_bytes()).hexdigest(),"wheels":selected}
receipt_bytes=(json.dumps(receipt,sort_keys=True,indent=2)+"\n").encode()
assert sum(expected["bytes"] for _,_,expected in sources)+len(receipt_bytes)<=2097152
output.mkdir()
for source,filename,expected in sources:
    descriptor=os.open(source,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
    try:
        opened=os.fstat(descriptor)
        assert stat.S_ISREG(opened.st_mode) and opened.st_size==expected["bytes"],filename
        with os.fdopen(descriptor,"rb",closefd=False) as stream: raw=stream.read(expected["bytes"]+1)
    finally:
        os.close(descriptor)
    assert len(raw)==expected["bytes"] and hashlib.sha256(raw).hexdigest()==expected["sha256"],filename
    target=output/filename; target.write_bytes(raw); copied=target.read_bytes()
    assert len(copied)==expected["bytes"] and hashlib.sha256(copied).hexdigest()==expected["sha256"],filename
(output/"release-payload-receipt.json").write_bytes(receipt_bytes)
assert sum(p.stat().st_size for p in output.iterdir())<=2097152
PY
run_bounded final-postgresql-cleanup-audit 90 "$VENV/bin/python" -I - "$PG_DSN" "$EVIDENCE/reports/resource-final.json" <<'PY'
import json,sys,psycopg
dsn,path=sys.argv[1:]
with psycopg.connect(dsn,autocommit=True) as c:
    server,server_version,number=c.execute("select pg_catalog.version(), current_setting('server_version'), current_setting('server_version_num')").fetchone()
    databases=c.execute("select datname from pg_catalog.pg_database where datname like 'rv_g02_%' or datname like 'g02f_%' or datname like 'g02nd_%' order by 1").fetchall()
    roles=c.execute("select rolname from pg_catalog.pg_roles where rolname like 'rv_g02_%' or rolname like 'g02f_%' or rolname like 'g02_%' order by 1").fetchall()
    schemas=c.execute("select nspname from pg_catalog.pg_namespace where nspname like 'ambient_%' order by 1").fetchall()
result={"server":server,"serverVersion":server_version,"serverVersionNum":number,"databases":databases,"roles":roles,"schemas":schemas}
assert "PostgreSQL 18.6" in server and isinstance(server_version,str) and server_version and number=="180006" and not databases and not roles and not schemas,result
open(path,"w").write(json.dumps(result,sort_keys=True,indent=2)+"\n")
PY
python -I - "$EVIDENCE/execution-complete.json" "$EVIDENCE/command-records.jsonl" "$D5_ROOT/monotonic-start-ms" "$D5_ROOT/monotonic-deadline-ms" <<'PY'
import json,pathlib,sys
path,records,start_path,deadline_path=sys.argv[1:]
rows=[json.loads(line) for line in pathlib.Path(records).read_text().splitlines() if line]
assert rows and all(x["rawExit"]==0 and x["captureExit"]==0 and not x["truncated"] for x in rows)
now=int(float(pathlib.Path("/proc/uptime").read_text().split()[0])*1000)
start=int(pathlib.Path(start_path).read_text()); deadline=int(pathlib.Path(deadline_path).read_text())
assert start<=now<=deadline-60000,(start,now,deadline)
pathlib.Path(path).write_text(json.dumps({"status":"commands-complete","commandCount":len(rows),"commandNames":[x["name"] for x in rows],"startedMonotonicMs":start,"endedMonotonicMs":now,"aggregateElapsedMs":now-start,"deadlineMonotonicMs":deadline},sort_keys=True,indent=2)+"\n")
PY
BOUNDED_D5_WORK

