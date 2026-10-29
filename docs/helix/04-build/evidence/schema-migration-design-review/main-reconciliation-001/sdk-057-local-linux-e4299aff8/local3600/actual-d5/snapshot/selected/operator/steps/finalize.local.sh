python -I - <<'PY'
import hashlib, json, os, pathlib, re, shutil, stat, sys, time
root=pathlib.Path(os.environ["D5_ROOT"]); evidence=root/"evidence"; upload=root/"upload"
receipt=upload/"d5-receipt.json"; upload.mkdir(parents=True,exist_ok=True)
expected_oracles={"oracle-date":4,"oracle-integer":4,"oracle-decimal":4,"oracle-text":4,
  "oracle-eq-null":2,"oracle-ne-null":2,"oracle-not-eq-value":2,"oracle-not-ne-null":2,
  "oracle-coalesce-empty":2,"oracle-enum":2,"oracle-unique":1,"oracle-foreign-key":1,
  "oracle-varchar-loss":2,"oracle-bound-excess":2,"oracle-empty-table":2,"oracle-all-populated":1}
expected_names=["source-freeze","safe-extract-retained-fixtures","create-fresh-venv","install-complete-current-cohort-offline",
  "pip-check-and-version-identity","pip-consistency-check","freeze-actual-18-wheel-and-installed-file-custody",
  "baseline-postgresql-cleanup-audit",*["oracle-"+x for x in ("date","integer","decimal-controls","text","eq-null-lost-commit","ne-null","not-eq-value","not-ne-null","coalesce-empty","enum","unique","foreign-key","varchar-loss","bound-excess","empty-table","all-populated")],
  "no-default-replay","fault-fenced-resume","fault-backfill-commit-lost","fault-existing-target-commit-lost","assemble-sdk-release-wheel-payload","final-postgresql-cleanup-audit"]
failure_report_names={"resource-baseline.json","resource-final.json","no-default.json",
  *["oracle-"+x+".json" for x in ("date","integer","decimal","text","eq-null","ne-null","not-eq-value","not-ne-null","coalesce-empty","enum","unique","foreign-key","varchar-loss","bound-excess","empty-table","all-populated")],
  *["fault-"+x+".json" for x in ("fenced-resume","backfill-commit-lost","existing-target-commit-lost")]}
def finalizer_failure_code(error):
    message=str(error)
    if message=="evidence directory missing": return "evidence-directory-missing"
    if message=="required evidence missing": return "required-evidence-missing"
    if message=="aggregate raw logs exceed 1 MiB": return "raw-log-cap-exceeded"
    if message=="evidence exceeds 16 MiB before parsing or staging": return "evidence-cap-exceeded"
    if "aggregate D5 deadline or evidence reserve exceeded" in message: return "deadline-evidence-invalid"
    if "command" in message or "commands" in message: return "command-evidence-invalid"
    if "report" in message or "oracle" in message or "fault" in message: return "report-evidence-invalid"
    return "finalizer-validation-failed" if isinstance(error,ValueError) else "finalizer-internal-failure"
validation_error_codes=(
    ("missing:","required-evidence-file-missing"),
    ("run/source identity mismatch","run-source-identity-mismatch"),
    ("harness workflow identity mismatch","harness-workflow-identity-mismatch"),
    ("commands incomplete","commands-incomplete"),
    ("aggregate D5 deadline or evidence reserve exceeded","aggregate-deadline-or-reserve-exceeded"),
    ("command roster mismatch","command-roster-mismatch"),
    ("completion record does not bind exact command roster","completion-command-roster-mismatch"),
    ("command failed, exceeded 180 seconds, or capture truncated","command-result-invalid"),
    ("missing command log:","command-log-missing"),
    ("command log custody mismatch:","command-log-custody-mismatch"),
    ("current cohort custody incomplete","current-cohort-custody-incomplete"),
    ("reviewed original/observation-parent identity mismatch","reviewed-observation-parent-identity-mismatch"),
    ("reviewed executed metadata successors mismatch","reviewed-metadata-successor-identity-mismatch"),
    ("complete 18-wheel filename/hash/size map mismatch","cohort-wheel-map-mismatch"),
    ("D5 original/successor replay custody mismatch:","replay-input-custody-mismatch"),
    ("retained observation-parent source mismatch","observation-parent-source-mismatch"),
    ("retained observation-parent custody mismatch","observation-parent-custody-mismatch"),
    ("executed metadata oracle source mismatch","metadata-oracle-source-mismatch"),
    ("executed no-default metadata source mismatch","no-default-source-mismatch"),
    ("metadata-successor custody mismatch","metadata-successor-custody-mismatch"),
    ("SDK release payload missing or exceeds 2 MiB","release-payload-missing-or-over-cap"),
    ("SDK release payload identity or roster mismatch","release-payload-identity-or-roster-mismatch"),
    ("SDK release wheel is not unique in current lock:","release-wheel-not-unique-in-lock"),
    ("SDK release payload does not match exact locked Access/Codegen wheel rows","release-payload-wheel-map-mismatch"),
    ("SDK release payload wheel bytes mismatch","release-payload-wheel-bytes-mismatch"),
    ("published Core native member mismatch","published-core-native-member-mismatch"),
    ("cohort lock digest mismatch","cohort-lock-digest-mismatch"),
    ("mirror manifest digest mismatch","mirror-manifest-digest-mismatch"),
    ("fixed report roster mismatch","fixed-report-roster-mismatch"),
    ("oracle report failed:","oracle-report-failed"),
    ("oracle original/successor/fixture provenance mismatch:","oracle-report-provenance-mismatch"),
    ("actual native row/column/future-default observations missing or malformed:","oracle-row-observations-invalid"),
    ("oracle current owner manifest mismatch:","oracle-owner-manifest-mismatch"),
    ("oracle PostgreSQL identity mismatch:","oracle-postgresql-identity-mismatch"),
    ("baseline PostgreSQL server_version missing or malformed","baseline-postgresql-version-invalid"),
    ("independent oracle case total is not 37","oracle-case-total-mismatch"),
    ("decimal ambient-operator SQLSTATE/rollback control missing","decimal-ambient-operator-control-missing"),
    ("decimal nonfinite used/unused branch control missing","decimal-nonfinite-branch-control-missing"),
    ("decimal lost-commit controls missing","decimal-lost-commit-controls-missing"),
    ("eq-null lost-commit controls missing","eq-null-lost-commit-controls-missing"),
    ("no-default report incomplete/current cohort mismatch","no-default-report-or-cohort-mismatch"),
    ("no-default successor runner/fixture mismatch","no-default-runner-fixture-mismatch"),
    ("fault recovery or cleanup incomplete:","fault-recovery-or-cleanup-incomplete"),
    ("fault current owner manifest mismatch:","fault-owner-manifest-mismatch"),
    ("uncertain database/role/schema cleanup or PostgreSQL identity","final-database-cleanup-or-identity-mismatch"),
)
def validation_failure_codes(error):
    message=str(error)
    direct_codes={"evidence directory missing":"evidence-directory-missing",
        "required evidence missing":"required-evidence-missing",
        "aggregate raw logs exceed 1 MiB":"raw-log-cap-exceeded",
        "evidence exceeds 16 MiB before parsing or staging":"evidence-cap-exceeded",
        "staged evidence exceeds 16 MiB":"staged-evidence-cap-exceeded",
        "final receipt would exceed the 16 MiB evidence cap":"final-receipt-cap-exceeded"}
    if message in direct_codes and message!="required evidence missing":
        return [direct_codes[message]]
    observed=list(errors) if message=="required evidence missing" else message.split("; ")
    codes=[direct_codes[message]] if message=="required evidence missing" else []
    for prefix,code in validation_error_codes:
        if any(item==prefix or (prefix.endswith(":") and item.startswith(prefix)) for item in observed): codes.append(code)
    if not observed or any(not any(item==prefix or (prefix.endswith(":") and item.startswith(prefix)) for prefix,_ in validation_error_codes) for item in observed):
        codes.append("unknown-validation-branch")
    return codes if len(codes)<=len(validation_error_codes)+1 else ["unknown-validation-branch"]
def diagnostic_failure_code(error):
    message=str(error)
    if message=="failure raw logs exceed 1 MiB": return "failure-log-cap-exceeded"
    if message=="failure evidence and complete receipt exceed 16 MiB": return "failure-evidence-cap-exceeded"
    if message=="unexpected failure evidence entry": return "unexpected-failure-entry"
    if message.startswith("unsafe failure evidence"): return "unsafe-failure-evidence"
    if message in ("failure evidence changed after stat","failure evidence copy mismatch"): return "failure-evidence-copy-mismatch"
    return "failure-diagnostics-unavailable"
def active_command_snapshot():
    path=evidence/"active-command.json"
    try:
        before=path.lstat()
        if not stat.S_ISREG(before.st_mode) or before.st_size>512: return None
        with path.open("rb") as stream:
            opened=os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode) or (opened.st_dev,opened.st_ino)!=(before.st_dev,before.st_ino): return None
            raw=stream.read(513)
        after=path.lstat()
        if len(raw)>512 or not stat.S_ISREG(after.st_mode): return None
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns): return None
        if (opened.st_dev,opened.st_ino,opened.st_size)!=(after.st_dev,after.st_ino,after.st_size): return None
        value=json.loads(raw.decode("utf-8"))
        if not isinstance(value,dict): return None
        if set(value)!={"name","startedMonotonicMs","selectedLimitSeconds"}: return None
        if value.get("name") not in expected_names: return None
        if type(value.get("startedMonotonicMs")) is not int or value["startedMonotonicMs"]<0: return None
        if type(value.get("selectedLimitSeconds")) is not int or not 1<=value["selectedLimitSeconds"]<=180: return None
        return value
    except (OSError,ValueError,TypeError):
        return None
errors=[]; files=[]
try:
    if not evidence.is_dir(): raise ValueError("evidence directory missing")
    for path in evidence.rglob("*"):
        if path.is_file(): files.append(path)
    total=sum(p.stat().st_size for p in files)
    logs=[p for p in files if p.parent.name=="logs"]
    log_total=sum(p.stat().st_size for p in logs)
    if log_total>1048576: raise ValueError("aggregate raw logs exceed 1 MiB")
    if total>16777216: raise ValueError("evidence exceeds 16 MiB before parsing or staging")
    required=["qualification-inputs.json","owner-artifacts.json","command-records.jsonl","execution-complete.json"]
    for name in required:
        if not (evidence/name).is_file(): errors.append("missing:"+name)
    if errors: raise ValueError("required evidence missing")
    inputs=json.loads((evidence/"qualification-inputs.json").read_text())
    owner=json.loads((evidence/"owner-artifacts.json").read_text())
    complete=json.loads((evidence/"execution-complete.json").read_text())
    if inputs.get("sourceCommit")!=os.environ["LOCAL_SOURCE_COMMIT"] or inputs.get("localExecutionId")!=os.environ["LOCAL_EXECUTION_ID"] or inputs.get("localAttempt")!=os.environ["LOCAL_ATTEMPT"] or inputs.get("localSourceRef")!=os.environ["LOCAL_SOURCE_REF"]: errors.append("run/source identity mismatch")
    if owner.get("workflowSha256")!=inputs.get("workflowSha256"): errors.append("harness workflow identity mismatch")
    if complete.get("status")!="commands-complete": errors.append("commands incomplete")
    if inputs.get("resourceProfile")!="LOCAL_EMULATED_3600" or inputs.get("resourceProfileSha256")!=os.environ["LOCAL_RESOURCE_PROFILE_SHA"] or inputs.get("operatorHashes")!=json.loads(os.environ["LOCAL_OPERATOR_HASHES"]): errors.append("resource profile or operator hash identity mismatch")
    if complete.get("aggregateElapsedMs",3600001)>3600000 or complete.get("endedMonotonicMs",0)>complete.get("deadlineMonotonicMs",0)-60000: errors.append("aggregate D5 deadline or evidence reserve exceeded")
    rows=[json.loads(line) for line in (evidence/"command-records.jsonl").read_text().splitlines() if line]
    names=[x.get("name") for x in rows]
    if names!=expected_names or len(set(names))!=len(expected_names): errors.append("command roster mismatch")
    if complete.get("commandCount")!=len(expected_names) or complete.get("commandNames")!=expected_names: errors.append("completion record does not bind exact command roster")
    if any(x.get("rawExit")!=0 or x.get("captureExit")!=0 or x.get("truncated") is not False or x.get("monotonicDurationMs",181000)>180000 for x in rows): errors.append("command failed, exceeded 180 seconds, or capture truncated")
    for row in rows:
        log=evidence/"logs"/(row["name"]+".log")
        if not log.is_file(): errors.append("missing command log:"+row["name"]); continue
        body=log.read_bytes()
        if len(body)!=row.get("logBytes") or hashlib.sha256(body).hexdigest()!=row.get("logSha256"): errors.append("command log custody mismatch:"+row["name"])
    if owner.get("status")!="frozen-current-D5-cohort" or owner.get("sourceCommit")!=os.environ["LOCAL_SOURCE_COMMIT"] or owner.get("wheelCount")!=18 or len(owner.get("artifacts",{}))!=18: errors.append("current cohort custody incomplete")
    if owner.get("oracleSha256")!="5dfddd7f1bd7f6e254e927292246ceddf5debfe172995ad267d4bbbfd32c2ea4" or owner.get("oracleObservationParentSha256")!="89ba88c6187bee2f350e4448266f6aa470a42862fc146f97e1b43edccdd41639" or owner.get("oracleObservationParentGzipSha256")!="1f2e5d676a8480838d973962e23a5cb3687c6798beecb038d5a31e324d40875e" or owner.get("oracleObservationParentPatchSha256")!="660733be45ea13036d1aa8b29bb858803c606bcd15ac0963933d1483b38bead6" or owner.get("oracleObservationParentCustodySha256")!="0865f14764f68dfc6e2818a54e336e2034720c696f797a6066816fdf5414957e": errors.append("reviewed original/observation-parent identity mismatch")
    if owner.get("oracleSuccessorSha256")!="e197d3630079c597964aa81b875ef6e7cd53f1c2fab42018bdb5a8684bf53600" or owner.get("oracleSuccessorGzipSha256")!="edb4bbf6a709ea4971a8e234b1e8ef6b648de2252eb7b134adc4f2a803bb2407" or owner.get("oracleSuccessorPatchSha256")!="fdacd514f6dfba0be8df9474fd5ed1bd19f5dca265674c60644ab400a26221ab" or owner.get("oracleSuccessorCustodySha256")!="6ae8277fbd3cf65e785134161c255d1d4a97de222d18dc59d15a401279d6735f" or owner.get("noDefaultOriginalRunnerSha256")!="a756e43e7f91d7d55eeb34d639790636bf4af92b6de0fec191d956d0ff568a07" or owner.get("noDefaultRunnerSha256")!="b25c3e319f4173366214156bdd2dd255f1c08ba8bddf6a21f647ddc6b4aef955" or owner.get("noDefaultRunnerGzipSha256")!="870a220eb95ec41c232bc578ca9cf0d0a94296d40efd92aa8696a167d1d6a6cc" or owner.get("noDefaultRunnerPatchSha256")!="042262de18502a6f44534a21d75d402f8e81211a1c5886cca68ad538af2fa9d8" or owner.get("noDefaultRunnerCustodySha256")!="6ae8277fbd3cf65e785134161c255d1d4a97de222d18dc59d15a401279d6735f": errors.append("reviewed executed metadata successors mismatch")
    lock_obj=json.loads((evidence/"cohort.lock.json").read_text())
    lock_rows=lock_obj.get("wheels",[])
    locked_map={row.get("filename"): {"sha256":row.get("sha256"),"bytes":row.get("size")} for row in lock_rows}
    if len(locked_map)!=18 or owner.get("artifacts")!=locked_map: errors.append("complete 18-wheel filename/hash/size map mismatch")
    replay=evidence/"replay"; expected_replay={"archive.tar.gz":"092b2db842101fe9aac485e05c8d79775b048602b671189a9c83e91467a64d86","fixture.json.gz":"c29ee30dd76e6e4fbbf6ceea64cb22d77764c2a349081819d0d7ac1c1dc59af1","oracle-successor.py.gz":owner.get("oracleObservationParentGzipSha256"),"oracle-successor.patch":owner.get("oracleObservationParentPatchSha256"),"oracle-successor-custody.json":owner.get("oracleObservationParentCustodySha256"),"no-default-metadata-successor.py.gz":owner.get("noDefaultRunnerGzipSha256"),"no-default-metadata-successor.patch":owner.get("noDefaultRunnerPatchSha256"),"metadata-oracle-successor.py.gz":owner.get("oracleSuccessorGzipSha256"),"metadata-oracle-successor.patch":owner.get("oracleSuccessorPatchSha256"),"metadata-successor-custody.json":owner.get("oracleSuccessorCustodySha256")}
    for filename,digest in expected_replay.items():
        path=replay/filename
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest: errors.append("D5 original/successor replay custody mismatch:"+filename)
    observation_parent_path=replay/"candidate-009/installed-text-oracle-d5-row-observation-successor.py"
    if not observation_parent_path.is_file() or hashlib.sha256(observation_parent_path.read_bytes()).hexdigest()!=owner.get("oracleObservationParentSha256"): errors.append("retained observation-parent source mismatch")
    observation_parent_custody=json.loads((replay/"oracle-successor-custody.json").read_text())
    if observation_parent_custody.get("originalArchiveSha256")!="092b2db842101fe9aac485e05c8d79775b048602b671189a9c83e91467a64d86" or observation_parent_custody.get("originalOracleSha256")!=owner.get("oracleSha256") or observation_parent_custody.get("fixtureSha256")!="c29ee30dd76e6e4fbbf6ceea64cb22d77764c2a349081819d0d7ac1c1dc59af1" or observation_parent_custody.get("successorSha256")!=owner.get("oracleObservationParentSha256") or observation_parent_custody.get("successorGzipSha256")!=owner.get("oracleObservationParentGzipSha256") or observation_parent_custody.get("successorPatchSha256")!=owner.get("oracleObservationParentPatchSha256"): errors.append("retained observation-parent custody mismatch")
    successor_path=replay/"candidate-009/installed-text-oracle-d5-weft55-metadata-successor.py"
    if not successor_path.is_file() or hashlib.sha256(successor_path.read_bytes()).hexdigest()!=owner.get("oracleSuccessorSha256"): errors.append("executed metadata oracle source mismatch")
    nd_successor_path=replay/"candidate-009/no-default-runner-d5-weft55-metadata-successor.py"
    if not nd_successor_path.is_file() or hashlib.sha256(nd_successor_path.read_bytes()).hexdigest()!=owner.get("noDefaultRunnerSha256"): errors.append("executed no-default metadata source mismatch")
    metadata_custody=json.loads((replay/"metadata-successor-custody.json").read_text())
    if metadata_custody.get("originalArchive",{}).get("sha256")!="092b2db842101fe9aac485e05c8d79775b048602b671189a9c83e91467a64d86" or metadata_custody.get("originalOracle",{}).get("sha256")!=owner.get("oracleSha256") or metadata_custody.get("originalNoDefault",{}).get("sha256")!=owner.get("noDefaultOriginalRunnerSha256") or metadata_custody.get("rowObservationParent",{}).get("sourceSha256")!=owner.get("oracleObservationParentSha256") or metadata_custody.get("successors",{}).get("rowObservationOracle",{}).get("sourceSha256")!=owner.get("oracleSuccessorSha256") or metadata_custody.get("successors",{}).get("noDefault",{}).get("sourceSha256")!=owner.get("noDefaultRunnerSha256"): errors.append("metadata-successor custody mismatch")
    payload=root/"release-payload"; payload_files=[p for p in payload.iterdir() if p.is_file()] if payload.is_dir() else []
    payload_names={p.name for p in payload_files}
    payload_receipt=payload/"release-payload-receipt.json"
    if not payload_receipt.is_file() or sum(p.stat().st_size for p in payload_files)>2097152: errors.append("SDK release payload missing or exceeds 2 MiB")
    else:
        payload_json=json.loads(payload_receipt.read_text()); expected_payload={"umf_access-0.1.0.dev8-py3-none-any.whl","umf_codegen-0.1.0a5-py3-none-any.whl","release-payload-receipt.json"}
        inputs_for_release=json.loads((evidence/"qualification-inputs.json").read_text())
        if payload_names!=expected_payload or payload_json.get("status")!="current-job-built-release-payload" or payload_json.get("sourceCommit")!=owner.get("sourceCommit") or payload_json.get("sourceTree")!=inputs_for_release.get("sourceTree") or payload_json.get("workflowSha256")!=owner.get("workflowSha256") or payload_json.get("localExecutionId")!=owner.get("localExecutionId") or payload_json.get("localAttempt")!=owner.get("localAttempt") or payload_json.get("cohortLockSha256")!=owner.get("cohortLockSha256") or payload_json.get("ownerManifestSha256")!=hashlib.sha256((evidence/"owner-artifacts.json").read_bytes()).hexdigest(): errors.append("SDK release payload identity or roster mismatch")
        expected_release=[]
        for distribution,version in (("umf-access","0.1.0.dev8"),("umf-codegen","0.1.0a5")):
            normalize=lambda value: re.sub(r"[-_.]+","-",value).lower()
            selected_rows=[row for row in lock_obj.get("wheels",[]) if normalize(row.get("distribution",""))==distribution and row.get("version")==version]
            if len(selected_rows)!=1: errors.append("SDK release wheel is not unique in current lock:"+distribution); continue
            row=selected_rows[0]; expected_release.append({"distribution":distribution,"version":version,"filename":row["filename"],"sha256":row["sha256"],"bytes":row["size"]})
        if payload_json.get("wheels")!=expected_release: errors.append("SDK release payload does not match exact locked Access/Codegen wheel rows")
        for item in payload_json.get("wheels",[]):
            path=payload/item.get("filename","")
            if not path.is_file() or path.stat().st_size!=item.get("bytes") or hashlib.sha256(path.read_bytes()).hexdigest()!=item.get("sha256"): errors.append("SDK release payload wheel bytes mismatch")
    if owner.get("coreNativeMember",{}).get("sha256")!="c51b511a06bc1ccde6cc2208d33a4fb70ef66c67507ba8f2a6ea05fd2543cf57": errors.append("published Core native member mismatch")
    if owner.get("cohortLockSha256")!=hashlib.sha256((evidence/"cohort.lock.json").read_bytes()).hexdigest(): errors.append("cohort lock digest mismatch")
    if owner.get("mirrorManifestSha256")!=hashlib.sha256((evidence/"mirror-manifest.json").read_bytes()).hexdigest(): errors.append("mirror manifest digest mismatch")
    actual_reports={p.name for p in (evidence/"reports").glob("*.json")}
    expected_report_names={"resource-baseline.json","resource-final.json","no-default.json",*["oracle-"+x+".json" for x in ("date","integer","decimal","text","eq-null","ne-null","not-eq-value","not-ne-null","coalesce-empty","enum","unique","foreign-key","varchar-loss","bound-excess","empty-table","all-populated")],*["fault-"+x+".json" for x in ("fenced-resume","backfill-commit-lost","existing-target-commit-lost")]}
    if actual_reports!=expected_report_names: errors.append("fixed report roster mismatch")
    base=json.loads((evidence/"reports/resource-baseline.json").read_text())
    baseline_server_version=base.get("serverVersion")
    if not isinstance(baseline_server_version,str) or not baseline_server_version.strip(): errors.append("baseline PostgreSQL server_version missing or malformed")
    total_cases=0
    for command,count in expected_oracles.items():
        name=command.removeprefix("oracle-")
        report=json.loads((evidence/"reports"/("oracle-"+name+".json")).read_text())
        if report.get("status")!="passed" or len(report.get("cases",[]))!=count or not all(c.get("passed") is True for c in report.get("cases",[])): errors.append("oracle report failed:"+name)
        total_cases+=len(report.get("cases",[]))
        if report.get("provenance",{}).get("runnerSha256")!=owner.get("oracleSuccessorSha256") or report.get("provenance",{}).get("originalRunnerSha256")!=owner.get("oracleSha256") or report.get("provenance",{}).get("fixtureSha256")!="c29ee30dd76e6e4fbbf6ceea64cb22d77764c2a349081819d0d7ac1c1dc59af1": errors.append("oracle original/successor/fixture provenance mismatch:"+name)
        observations=report.get("cases",[])
        if any(not isinstance(case.get("actualColumns"),list) or not case.get("actualColumns") or not isinstance(case.get("actualRows"),list) or "futureDefaultValue" not in case or any(not isinstance(row,list) or len(row)!=len(case.get("actualColumns",[])) for row in case.get("actualRows",[])) or (not case.get("invalid") and case.get("futureDefaultValue") is None) for case in observations): errors.append("actual native row/column/future-default observations missing or malformed:"+name)
        if report.get("provenance",{}).get("artifactManifestSha256")!=hashlib.sha256((evidence/"owner-artifacts.json").read_bytes()).hexdigest(): errors.append("oracle current owner manifest mismatch:"+name)
        if not isinstance(baseline_server_version,str) or not baseline_server_version.strip() or report.get("server")!=baseline_server_version: errors.append("oracle PostgreSQL identity mismatch:"+name)
    if total_cases!=37: errors.append("independent oracle case total is not 37")
    decimal=json.loads((evidence/"reports/oracle-decimal.json").read_text())["cases"]
    ambient=[x.get("ambientOperatorGuard") for x in decimal if x.get("ambientOperatorGuard") is not None]
    nonfinite=[x.get("injectedNonfiniteGuard") for x in decimal if x.get("injectedNonfiniteGuard") is not None]
    if len(ambient)!=1 or ambient[0].get("nativeSqlstate")!="22012" or ambient[0].get("rollbackVerified") is not True: errors.append("decimal ambient-operator SQLSTATE/rollback control missing")
    nonfinite_cases=[case for group in nonfinite for case in group.get("cases",[])]
    if len(nonfinite_cases)!=2 or {case.get("unusedBranch") for case in nonfinite_cases}!={False,True} or any(case.get("nativeSqlstate")!="22012" or case.get("statementRollbackVerified") is not True for case in nonfinite_cases): errors.append("decimal nonfinite used/unused branch control missing")
    decimal_unknown={event for case in decimal for event in case.get("unknownCommitAfterRealPhase",[])}
    if decimal_unknown!={"backfill-tighten","backfill-add"}: errors.append("decimal lost-commit controls missing")
    eq=json.loads((evidence/"reports/oracle-eq-null.json").read_text())["cases"]
    eq_unknown={event for case in eq for event in case.get("unknownCommitAfterRealPhase",[])}
    if eq_unknown!={"backfill-tighten","backfill-add"}: errors.append("eq-null lost-commit controls missing")
    nd=json.loads((evidence/"reports/no-default.json").read_text())
    if len(nd.get("checks",[]))!=19 or nd.get("packages")!={"umf-access":"0.1.0.dev8","umf-codegen":"0.1.0a5","umf-weft":"0.4.55","umf-core":"0.10.3"} or "PostgreSQL 18.6" not in nd.get("server",""): errors.append("no-default report incomplete/current cohort mismatch")
    if nd.get("runnerSha256")!=owner.get("noDefaultRunnerSha256") or nd.get("fixtureSha256")!="ba3c914d6590ed86640c22c6f4dbd1447168efca833b03c47f9270e2dc8c3af5": errors.append("no-default successor runner/fixture mismatch")
    for scenario,count in (("fenced-resume",33),("backfill-commit-lost",27),("existing-target-commit-lost",27)):
        report=json.loads((evidence/"reports"/("fault-"+scenario+".json")).read_text())
        obs=report.get("observations",{}); cleanup=obs.get("cleanup",{})
        if len(report.get("checks",[]))!=count or not cleanup.get("droppedDatabase") or cleanup.get("databaseExists") is not False or cleanup.get("remainingRoles")!=[] or cleanup.get("droppedRoles")!=5: errors.append("fault recovery or cleanup incomplete:"+scenario)
        if obs.get("manifestSha256")!=hashlib.sha256((evidence/"owner-artifacts.json").read_bytes()).hexdigest(): errors.append("fault current owner manifest mismatch:"+scenario)
    final=json.loads((evidence/"reports/resource-final.json").read_text())
    if base!=final or base.get("serverVersionNum")!="180006" or base.get("databases") or base.get("roles") or base.get("schemas"): errors.append("uncertain database/role/schema cleanup or PostgreSQL identity")
    if errors: raise ValueError("; ".join(errors))
    shutil.rmtree(upload); upload.mkdir(parents=True)
    for p in files:
        rel=p.relative_to(evidence); dest=upload/rel; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,dest)
    staged=[p for p in upload.rglob("*") if p.is_file()]
    staged_total=sum(p.stat().st_size for p in staged)
    if staged_total>16777216: raise ValueError("staged evidence exceeds 16 MiB")
    result={"status":"LOCAL_DIAGNOSTIC_PASS_G02_D5_37_CASES_AND_RECOVERY","executionKind":"local_linux_diagnostic","localSourceRef":os.environ["LOCAL_SOURCE_REF"],"localSourceBranch":os.environ["LOCAL_SOURCE_BRANCH"],"adapterWorkflow":os.environ["LOCAL_WORKFLOW_ID"],"sourceCommit":os.environ["LOCAL_SOURCE_COMMIT"],"localExecutionId":os.environ["LOCAL_EXECUTION_ID"],"localAttempt":os.environ["LOCAL_ATTEMPT"],"resourceProfile":"LOCAL_EMULATED_3600","resourceProfileSha256":os.environ["LOCAL_RESOURCE_PROFILE_SHA"],"operatorHashes":json.loads(os.environ["LOCAL_OPERATOR_HASHES"]),"aggregateSeconds":3600,"cases":37,"oracleGroups":16,"faultScenarios":3,"noDefaultChecks":19,"commandCount":len(rows),"logBytes":log_total,"evidenceBytes":staged_total,"cleanupVerified":True,"currentCohortLockSha256":owner["cohortLockSha256"],"currentOwnerManifestSha256":hashlib.sha256((evidence/"owner-artifacts.json").read_bytes()).hexdigest(),"originalOracleSha256":owner["oracleSha256"],"oracleSuccessorSha256":owner["oracleSuccessorSha256"],"oracleSuccessorPatchSha256":owner["oracleSuccessorPatchSha256"],"releasePayloadReceiptSha256":hashlib.sha256((root/"release-payload"/"release-payload-receipt.json").read_bytes()).hexdigest()}
    result_text=json.dumps(result,sort_keys=True,indent=2)+"\n"
    if staged_total+len(result_text.encode())>16777216: raise ValueError("final receipt would exceed the 16 MiB evidence cap")
    (upload/"d5-receipt.json").write_text(result_text)
    (evidence/"final-receipt.json").write_text(result_text)
    print(json.dumps(result,sort_keys=True))
except BaseException as error:
    shutil.rmtree(upload,ignore_errors=True); upload.mkdir(parents=True,exist_ok=True)
    result={"status":"FAIL_OR_UNKNOWN","executionKind":"local_linux_diagnostic","sourceCommit":os.environ["LOCAL_SOURCE_COMMIT"],"localSourceBranch":os.environ["LOCAL_SOURCE_BRANCH"],"localExecutionId":os.environ["LOCAL_EXECUTION_ID"],"localAttempt":os.environ["LOCAL_ATTEMPT"],"localSourceRef":os.environ["LOCAL_SOURCE_REF"],"adapterWorkflow":os.environ.get("LOCAL_WORKFLOW_ID"),"resourceProfile":"LOCAL_EMULATED_3600","resourceProfileSha256":os.environ["LOCAL_RESOURCE_PROFILE_SHA"],"operatorHashes":json.loads(os.environ["LOCAL_OPERATOR_HASHES"]),"aggregateSeconds":3600,"localEventKind":os.environ.get("LOCAL_EXECUTION_KIND"),"reason":"fixed D5 report/custody/cleanup finalizer did not close","errorClass":type(error).__name__,"finalizerFailureCode":finalizer_failure_code(error),"validationFailureCodes":validation_failure_codes(error),"activeCommand":active_command_snapshot()}
    try:
        import stat
        selected=[]
        if evidence.is_dir() and not evidence.is_symlink():
            fixed=("qualification-inputs.json","command-records.jsonl","owner-artifacts.json","cohort.lock.json","mirror-manifest.json","installed-versions.json","execution-complete.json","active-command.json")
            for name in fixed:
                candidate=evidence/name
                if candidate.exists() or candidate.is_symlink(): selected.append(candidate)
            for dirname,suffix in (("logs",".log"),("reports",".json")):
                directory=evidence/dirname
                if directory.exists() or directory.is_symlink():
                    info=directory.lstat()
                    if not stat.S_ISDIR(info.st_mode): raise ValueError("unsafe failure evidence directory")
                    for entry in os.scandir(directory):
                        candidate=pathlib.Path(entry.path)
                        if dirname=="reports" and entry.name=="plans":
                            plans_info=entry.stat(follow_symlinks=False)
                            if not stat.S_ISDIR(plans_info.st_mode): raise ValueError("unsafe failure evidence directory")
                            for plan in os.scandir(candidate):
                                if re.fullmatch(r"[0-9a-f]{64}\.json",plan.name) is None: raise ValueError("unexpected failure evidence entry")
                                if not stat.S_ISREG(plan.stat(follow_symlinks=False).st_mode): raise ValueError("unsafe failure evidence file")
                                selected.append(pathlib.Path(plan.path))
                            continue
                        allowed={name+".log" for name in expected_names} if dirname=="logs" else failure_report_names
                        if entry.name not in allowed: raise ValueError("unexpected failure evidence entry")
                        selected.append(candidate)
        measured=[]; log_total=0; selected_total=0
        for candidate in selected:
            info=candidate.lstat()
            if not stat.S_ISREG(info.st_mode): raise ValueError("unsafe failure evidence file")
            size=info.st_size
            rel=candidate.relative_to(evidence)
            if rel.parts and rel.parts[0]=="logs": log_total+=size
            selected_total+=size; measured.append((candidate,rel,size))
        if log_total>1048576: raise ValueError("failure raw logs exceed 1 MiB")
        result["failureEvidence"]={"status":"bounded-diagnostics-preserved","logBytes":log_total,"selectedBytes":selected_total,"files":[str(rel) for _,rel,_ in measured]}
        receipt_text=json.dumps(result,sort_keys=True,indent=2)+"\n"
        if selected_total+len(receipt_text.encode())>16777216: raise ValueError("failure evidence and complete receipt exceed 16 MiB")
        for source,rel,size in measured:
            target=upload/rel; target.parent.mkdir(parents=True,exist_ok=True)
            before=source.lstat()
            if not stat.S_ISREG(before.st_mode) or before.st_size!=size: raise ValueError("failure evidence changed after stat")
            shutil.copyfile(source,target)
            after=target.lstat()
            if not stat.S_ISREG(after.st_mode) or after.st_size!=size: raise ValueError("failure evidence copy mismatch")
        (upload/"d5-receipt.json").write_text(receipt_text)
    except BaseException as staging_error:
        for child in list(upload.iterdir()):
            if child.is_dir(): shutil.rmtree(child,ignore_errors=True)
            else: child.unlink(missing_ok=True)
        result["failureEvidence"]={"status":"receipt-only-because-diagnostics-unavailable-or-over-cap","errorClass":type(staging_error).__name__,"failureCode":diagnostic_failure_code(staging_error)}
        (upload/"d5-receipt.json").write_text(json.dumps(result,sort_keys=True,indent=2)+"\n")
    print(json.dumps(result,sort_keys=True),file=sys.stderr)
    raise SystemExit(1)
PY

