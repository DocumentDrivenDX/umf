#!/usr/bin/env python3
"""Bounded metadata-only re-evaluation of the immutable Full14 actual007 corpus."""
from __future__ import annotations
import argparse, hashlib, importlib.util, json, math, os, pathlib, stat, sys, time, uuid

ROOT = pathlib.Path('/private/tmp/g03-native-predicate-reanalysis-operator-006')
SOURCE = ROOT/'source'
PREDICATE = SOURCE/'g03_campaign_predicates.py'
MUTATION_TESTS = SOURCE/'test_g03_campaign_predicates.py'
MANAGED_SOURCE = pathlib.Path('/Users/erik/.codex/worktrees/g03-ordinary-native/umf/tests/lifecycle')
MANAGED_PREDICATE = MANAGED_SOURCE/'g03_campaign_predicates.py'
MANAGED_MUTATION_TESTS = MANAGED_SOURCE/'test_g03_campaign_predicates.py'
ORIGINAL = pathlib.Path('/private/tmp/g03-full14-bounded-operator-007-output/45389ee1fa7a40238d403ff0048626a1')
PACKET = pathlib.Path('/private/tmp/g03-full14-input-packet-001/inputs.json')
SEAL = pathlib.Path('/private/tmp/g03-full14-source-seal-005')
PLAN_SHA256 = 'e78ab1587b1e2097d08c68d06ca2cbaf1caee3af8a4ef80a040544c8d1964591'
SOURCE_REVIEW_FINDINGS_SHA256_006 = 'd0bf39926ecf2f9a39eb876d777cfbd2f7dee00a991af3ecdfcae3699b048e97'
SOURCE_REVIEW_FINDINGS_PATH_006 = ROOT/'inputs/cleanup-plan006.md'
PARENT_PACKET_SHA256 = 'd294c1cd3db8b819ae9f687d0683c1b3af317abe816d2e2b166c79115cb3b965'
PARENT_PACKET = ROOT/'inputs/parent-002/packet.json'
PARENT003_PACKET_SHA256 = '52981794b3fc57d97045ed5bdc8bd74329bd4e47d7417008e6887e17ef249c63'
PARENT003_PACKET = ROOT/'inputs/parent-003/packet.json'
QUALIFICATION_LIMITS = {'outerElapsedSeconds':1800,'scenarioTimeoutSeconds':180,
    'scenarioCaptureGraceSeconds':10,'allRawLogBytes':1024*1024,
    'inclusiveEvidenceBytes':16*1024*1024,'readerSafetyBytes':128*1024*1024,
    'inclusiveTerminalOuterReceipt':True}
OPERATOR_PACKET = ROOT/'inputs/packet.json'
EXPECTED_SEAL_SHA256 = '23a16e87f53df619ad06ffcfe9e234efe0394287b5437070a13209e06c945ccf'
EXPECTED_INPUT_PACKET_SHA256 = 'c91b7b4d688a51c95c09cdd51ed5084899aba8adaa83c9b7f6b48a3c48d7478b'
EXPECTED_ORIGINAL_RESULT_SHA256 = '97ced9208aff574f2b9f86f156748ff9ff554865fa8283c4214547e532fae8c7'
EXPECTED_CAMPAIGN_RESULT_SHA256 = '6a2549595c43528c52cd4a2d3287841a91504d1349ecc517a7c29b7639ea96a8'
EXPECTED_DATA_SHA256 = 'd8d66928cc3090312c93a13761084f21a1dd8dc66b807650c9e5e39f23dc8460'
MAX_FILE = 16*1024*1024
MAX_TOTAL = 128*1024*1024  # reader safety bound
MAX_EVIDENCE_BYTES = 16*1024*1024  # qualification allowance, inclusive of terminal outer receipt
MAX_FILES = 256
MAX_SECONDS = 180
FIXED_SCENARIOS = (
    ('G03-N01','transitions'),('G03-N02','empty'),('G03-N03','required'),
    ('G03-N04','admission-refusal'),('G03-N05','semantic-null'),('G03-N05','semantic-decimal'),
    ('G03-N06','rollback'),('G03-N07','commit-observation'),('G03-N07','finalize-observation'),
    ('G03-N07','finalize-before-publication'),('G03-N08','unknown-no-commit'),
    ('G03-N09','writer-barrier'),('G03-N10','domain-date'),('G03-N10','domain-text'),
    ('G03-N10','domain-decimal'),('G03-N11','domain-uuid'),('G03-N11','domain-currentTimestamp'),
    ('G03-N12','ordinary'),('G03-N13','tampering'))
MAX_RAW_LOG_BYTES = 1024*1024
MAX_OUTER_ELAPSED = 1800.0
MAX_SCENARIO_SECONDS = 180.0
SCENARIO_GRACE_SECONDS = 10.0
OUTPUT_CAP = 8*1024*1024


def fail(message: str) -> None:
    raise RuntimeError(message)


def bounded_read(path: pathlib.Path, cap: int, deadline: float) -> tuple[bytes, dict]:
    if not path.is_absolute() or path.resolve(strict=True) != path:
        fail(f'noncanonical input path: {path}')
    st = path.lstat()
    if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size > cap:
        fail(f'unsafe or oversized input: {path}')
    digest = hashlib.sha256(); chunks=[]; count=0
    with path.open('rb') as stream:
        while True:
            if time.monotonic() >= deadline: fail('metadata read deadline exceeded')
            block=stream.read(65536)
            if not block: break
            count += len(block)
            if count > cap: fail(f'input grew beyond cap: {path}')
            digest.update(block); chunks.append(block)
    after=path.lstat()
    if count != st.st_size or (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
        fail(f'input changed during read: {path}')
    return b''.join(chunks), {'path':str(path),'sizeBytes':count,'sha256':digest.hexdigest()}


def load_json(path: pathlib.Path, cap: int, deadline: float):
    raw, identity = bounded_read(path, cap, deadline)
    return json.loads(raw), identity


def inventory(root: pathlib.Path, deadline: float) -> tuple[list[dict], int]:
    rows=[]; total=0
    if not root.is_dir() or root.is_symlink(): fail(f'unsafe evidence root: {root}')
    for base, dirs, files in os.walk(root, followlinks=False):
        if time.monotonic() >= deadline: fail('evidence inventory deadline exceeded')
        b=pathlib.Path(base)
        if any((b/name).is_symlink() for name in dirs): fail('symlink directory in immutable evidence')
        for name in sorted(files):
            p=b/name
            if p.relative_to(root).as_posix() == 'operator-result.json':
                continue
            if len(rows)>=MAX_FILES: fail('immutable evidence file-count cap exceeded')
            _, row=bounded_read(p, MAX_FILE, deadline)
            row['path']=p.relative_to(root).as_posix(); rows.append(row); total+=row['sizeBytes']
            if total>MAX_TOTAL: fail('immutable evidence byte cap exceeded')
    return sorted(rows,key=lambda r:r['path']),total


def verify_evidence_tree(operator_result: dict, deadline: float, outer_receipt_bytes: int) -> list[dict]:
    listed=operator_result.get('evidenceFiles')
    if type(listed) is not list or not listed: fail('outer operator has no closed evidence manifest')
    actual,total=inventory(ORIGINAL,deadline)
    claimed=sorted(({'path':row.get('path'),'sizeBytes':row.get('sizeBytes'),'sha256':row.get('sha256')} for row in listed),key=lambda r:r['path'])
    if claimed != actual: fail('full14 physical evidence inventory differs from sealed outer manifest')
    if len(actual)!=181 or total>MAX_TOTAL: fail('full14 evidence roster or reader safety cap mismatch')
    if type(outer_receipt_bytes) is not int or total+outer_receipt_bytes>MAX_EVIDENCE_BYTES:
        fail('inclusive original evidence plus terminal outer receipt exceeds 16 MiB')
    return actual


def _finite(value: int | float) -> bool:
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def finite_number(value: object) -> bool:
    return type(value) in (int, float) and _finite(value)


def scenario_component(case_id: str, scenario: str) -> str:
    if type(case_id) is not str or type(scenario) is not str:
        fail('scenario identity is not text')
    if (case_id,scenario) not in FIXED_SCENARIOS:
        fail('case/scenario pair is outside fixed Full14 raw roster')
    return f'{case_id.lower()}-{scenario}'


def expected_raw_guest_path(item: dict) -> str:
    ordinal=item.get('ordinal')
    if type(ordinal) is not int or not 1 <= ordinal <= 19:
        fail('scenario ordinal is not an exact integer in fixed roster')
    if (item.get('caseId'),item.get('scenario'))!=FIXED_SCENARIOS[ordinal-1]:
        fail('ordinal/case/scenario tuple differs from fixed raw roster')
    component=scenario_component(item.get('caseId'),item.get('scenario'))
    return f'/out/scenarios/{ordinal:02d}-{component}/raw-scenario.json'


def expected_command_name(item: dict) -> str:
    return scenario_component(item.get('caseId'),item.get('scenario'))


def expected_log_guest_path(item: dict, stream: str) -> str:
    ordinal=item.get('ordinal')
    if type(ordinal) is not int or not 1 <= ordinal <= 19 or stream not in ('stdout','stderr'):
        fail('invalid fixed scenario log identity')
    if (item.get('caseId'),item.get('scenario'))!=FIXED_SCENARIOS[ordinal-1]:
        fail('ordinal/case/scenario tuple differs from fixed log roster')
    return f'/out/logs/{ordinal-1:02d}-{expected_command_name(item)}.{stream}.log'


def map_campaign_guest_path(raw_path: object, expected: str) -> pathlib.Path:
    if type(raw_path) is not str or raw_path != expected:
        fail('campaign guest path differs from its fixed canonical /out roster path')
    pure=pathlib.PurePosixPath(raw_path)
    if (not pure.is_absolute() or str(pure)!=raw_path or pure.parts[0]!='/'
            or any(part in ('','.','..') for part in pure.parts[1:])):
        fail('noncanonical, traversing, or non-/out campaign path')
    if not raw_path.startswith('/out/'):
        fail('campaign artifact is outside /out')
    rel=pathlib.PurePosixPath(*pure.parts[2:])
    target=ORIGINAL/'campaign'/rel
    if target.resolve(strict=True)!=target or target.is_symlink():
        fail('campaign artifact maps through a symlink or noncanonical host path')
    return target


SETUP_COMMANDS = (
    ('python-runtime',20),('bun-runtime',20),('fixture-generation',180),
    ('create-venv',60),('install-exact-cohort',180),('pip-check',60),
    ('candidate-wheel-physical-match',60),('installed-cohort-snapshot',180))


def map_setup_log_path(raw_path: object, index: int, name: str, stream: str) -> pathlib.Path:
    expected=f'/out/logs/{index:02d}-{name}.{stream}.log'
    if type(raw_path) is not str or raw_path!=expected or stream not in ('stdout','stderr'):
        fail('setup guest log path differs from its exact closed roster')
    pure=pathlib.PurePosixPath(raw_path)
    if (not pure.is_absolute() or str(pure)!=raw_path or pure.parts[0]!='/'
            or any(part in ('','.','..') for part in pure.parts[1:]) or not raw_path.startswith('/out/')):
        fail('noncanonical or traversing setup guest log path')
    target=ORIGINAL/'setup/logs'/f'{index:02d}-{name}.{stream}.log'
    if target.resolve(strict=True)!=target or target.is_symlink():
        fail('setup log maps through a symlink or noncanonical host path')
    return target


def verify_setup_receipt(outer: dict, packet: dict, evidence: list[dict], deadline: float) -> tuple[int,int,dict]:
    by_path={row['path']:row for row in evidence}
    receipt=outer.get('setupReceipt')
    expected_path=ORIGINAL/'setup/setup-result.json'
    if (type(receipt) is not dict or receipt.get('status')!='PASS_SETUP'
            or receipt.get('path')!=str(expected_path)):
        fail('outer setup receipt does not bind the fixed setup result')
    setup_raw,setup_identity=bounded_read(expected_path,MAX_FILE,deadline)
    if (setup_identity['sha256']!=receipt.get('sha256') or setup_identity['sizeBytes']!=receipt.get('sizeBytes')
            or by_path.get('setup/setup-result.json')!=dict(setup_identity,path='setup/setup-result.json')):
        fail('setup receipt differs from its physical evidence inventory')
    setup=json.loads(setup_raw)
    if setup.get('profile')!='umf.g03-full14-setup/1' or setup.get('status')!='PASS_SETUP':
        fail('setup profile/status is not the accepted original receipt')
    seal,seal_identity=load_json(SEAL/'manifest.json',1024*1024,deadline)
    if (setup.get('sourceSeal')!=seal or setup.get('sourceSealSha256')!=EXPECTED_SEAL_SHA256
            or setup.get('sourceMapping')!={'guestPath':'/harness','packetRoot':str(SEAL)}
            or setup.get('cohortMapping')!={'guestPath':'/cohort','packetRoot':packet.get('cohort',{}).get('root')}):
        fail('setup source seal or source/cohort mapping differs from frozen inputs')
    if setup.get('selectedWeftWheel')!=packet.get('cohort',{}).get('weftWheel'):
        fail('setup selected wheel differs from frozen cohort identity')
    if (setup.get('installedCohort')!=packet.get('expectedInstalledCohort')
            or setup.get('installedCohortSha256')!=packet.get('expectedInstalledCohortSha256')):
        fail('setup installed cohort differs from frozen packet expectation')
    fixture=setup.get('fixture',{})
    fixture_path=ORIGINAL/'setup/g03-defaults-native-fixture.json'
    fixture_bytes,fixture_identity=bounded_read(fixture_path,MAX_FILE,deadline)
    fixture_manifest=by_path.get('setup/g03-defaults-native-fixture.json')
    if (fixture.get('path')!='/out/g03-defaults-native-fixture.json'
            or fixture_identity['sha256']!=fixture.get('sha256') or fixture_identity['sizeBytes']!=fixture.get('sizeBytes')
            or fixture_manifest!=dict(fixture_identity,path='setup/g03-defaults-native-fixture.json')
            or fixture.get('sha256')!=packet.get('fixtureSha256')):
        fail('setup fixture artifact does not close against packet and physical inventory')
    snapshot_ref=setup.get('installedCohortSnapshotFile',{})
    snapshot_helper=setup.get('installedCohortSnapshotHelperReceipt',{})
    snapshot_path=ORIGINAL/'setup/installed-cohort-snapshot.json'
    snapshot_raw,snapshot_identity=bounded_read(snapshot_path,MAX_FILE,deadline)
    snapshot_manifest=by_path.get('setup/installed-cohort-snapshot.json')
    if (snapshot_ref.get('path')!='/out/installed-cohort-snapshot.json'
            or snapshot_ref.get('sha256')!=snapshot_identity['sha256'] or snapshot_ref.get('sizeBytes')!=snapshot_identity['sizeBytes']
            or snapshot_manifest!=dict(snapshot_identity,path='setup/installed-cohort-snapshot.json')
            or snapshot_helper.get('profile')!='umf.g03-installed-cohort-snapshot/1'
            or snapshot_helper.get('canonical') is not True or snapshot_helper.get('snapshotPath')!=snapshot_ref.get('path')
            ):
        fail('installed-cohort snapshot receipt is malformed')
    lf=bytes([10])
    if not snapshot_raw.endswith(lf) or snapshot_raw.endswith(lf+lf) or snapshot_raw.count(lf)!=1:
        fail('installed-cohort snapshot must end in exactly one LF byte')
    canonical_snapshot=snapshot_raw[:-1]
    snapshot_value=json.loads(canonical_snapshot)
    canonical_json=json.dumps(snapshot_value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    if (canonical_snapshot!=canonical_json
            or snapshot_helper.get('snapshotBytes')!=len(canonical_snapshot)
            or snapshot_helper.get('snapshotSha256')!=hashlib.sha256(canonical_snapshot).hexdigest()
            or snapshot_value!=setup.get('installedCohort')):
        fail('setup installed-cohort snapshot receipt does not bind its physical artifact')
    commands=setup.get('commands')
    if type(commands) is not list or len(commands)!=len(SETUP_COMMANDS):
        fail('setup command roster is not the exact eight-command stream')
    raw_total=0; physical_total=0
    for index,(command,(name,timeout)) in enumerate(zip(commands,SETUP_COMMANDS)):
        if (type(command) is not dict or command.get('name')!=name or command.get('timeoutSeconds')!=timeout
                or type(command.get('timeoutSeconds')) is not int or command.get('exitCode')!=0
                or command.get('timedOut') is not False or command.get('drainExpired') is not False
                or command.get('logCapExceeded') is not False or command.get('captureStatus')!='PASS_CAPTURE_CLOSED'):
            fail('setup command differs from exact bounded success roster: '+name)
        elapsed=command.get('elapsedSeconds')
        if not finite_number(elapsed) or elapsed<0 or elapsed>timeout+10:
            fail('setup command timer exceeds its fixed timeout plus bounded grace: '+name)
        for stream in ('stdout','stderr'):
            capture=command.get(stream)
            if type(capture) is not dict: fail('setup command stream capture missing')
            raw_bytes=capture.get('rawBytes'); retained=capture.get('retainedBytes')
            if (type(raw_bytes) is not int or type(retained) is not int or raw_bytes<0 or raw_bytes!=retained
                    or capture.get('truncated') is not False or capture.get('sha256')!=capture.get('rawSha256')):
                fail('setup stream is not a closed untruncated raw capture')
            path=map_setup_log_path(capture.get('path'),index,name,stream)
            evidence_path=path.relative_to(ORIGINAL).as_posix()
            _,physical=bounded_read(path,MAX_FILE,deadline)
            if (physical['sizeBytes']!=raw_bytes or physical['sha256']!=capture.get('sha256')
                    or by_path.get(evidence_path)!=dict(physical,path=evidence_path)):
                fail('setup stream capture differs from physical evidence: '+evidence_path)
            raw_total+=raw_bytes; physical_total+=physical['sizeBytes']
            if raw_total>MAX_RAW_LOG_BYTES: fail('setup command streams exceed 1 MiB raw-log cap')
    if type(setup.get('rawLogBytes')) is not int or setup['rawLogBytes']!=raw_total or raw_total!=5435 or physical_total!=raw_total:
        fail('setup aggregate raw and physical log totals do not reconcile to 5,435 bytes')
    return raw_total,physical_total,setup_identity


def verify_path_refusal_controls(first_execution: dict) -> None:
    expected=expected_raw_guest_path(first_execution)
    valid=map_campaign_guest_path(expected,expected)
    if valid!=ORIGINAL/'campaign/scenarios/01-g03-n01-transitions/raw-scenario.json':
        fail('canonical first raw path did not map to fixed physical evidence')
    mutations=(expected.replace('/out/','/tmp/out/',1),
               expected.replace('/scenarios/','/scenarios/../scenarios/',1),
               expected.replace('/raw-scenario.json','//raw-scenario.json'),
               expected.replace('01-g03-n01','02-g03-n01'),
               expected.replace('/out/','/out//',1))
    for changed in mutations:
        try:
            map_campaign_guest_path(changed,expected)
        except RuntimeError:
            continue
        fail('single-fact noncanonical guest-path mutation was accepted')


def verify_capture_rows(commands: list, *, campaign_logs: bool, evidence: list[dict], deadline: float,
                        scenario_executions: list | None = None) -> int:
    by_path={row['path']:row for row in evidence}
    if type(commands) is not list or not commands: fail('closed command capture roster missing')
    raw_total=0
    if campaign_logs and (type(scenario_executions) is not list or len(commands)!=len(scenario_executions)):
        fail('campaign log roster does not match fixed scenario executions')
    for index, command in enumerate(commands):
        if (command.get('timedOut') is not False or command.get('drainExpired') is not False
                or command.get('logCapExceeded') is not False): fail('command timeout/drain/log-cap uncertainty')
        if campaign_logs:
            scenario=scenario_executions[index]
            if (command.get('name')!=expected_command_name(scenario)
                    or command.get('exitCode')!=0 or command.get('captureStatus')!='PASS_CAPTURE_CLOSED'):
                fail('scenario command is outside fixed roster or did not return a closed raw dictionary')
            elapsed=command.get('elapsedSeconds'); timeout=command.get('timeoutSeconds')
            if (timeout!=180 or type(timeout) is not int or not finite_number(elapsed)
                    or elapsed<0 or elapsed>MAX_SCENARIO_SECONDS+SCENARIO_GRACE_SECONDS):
                fail('scenario recorded timer exceeds bounded 180s plus 10s grace profile')
        for stream in ('stdout','stderr'):
            item=command.get(stream,{})
            raw_bytes=item.get('rawBytes'); retained=item.get('retainedBytes')
            if (item.get('truncated') is not False or type(raw_bytes) is not int
                    or type(retained) is not int or raw_bytes<0 or raw_bytes!=retained
                    or item.get('sha256')!=item.get('rawSha256')):
                fail('raw stream capture is incomplete or has noncanonical byte counts')
            raw_total+=raw_bytes
            if raw_total>MAX_RAW_LOG_BYTES: fail('combined raw logs exceed 1 MiB qualification allowance')
            raw_path=item.get('path')
            if type(raw_path) is not str: fail('command stream has no physical path')
            if campaign_logs:
                expected=expected_log_guest_path(scenario,stream)
                path=map_campaign_guest_path(raw_path,expected)
                evidence_rel='campaign/'+path.relative_to(ORIGINAL/'campaign').as_posix()
            else:
                path=pathlib.Path(raw_path)
                try: evidence_rel=path.relative_to(ORIGINAL).as_posix()
                except ValueError: fail('outer command log escapes immutable run')
            _, actual=bounded_read(path,MAX_FILE,deadline)
            manifest_row=by_path.get(evidence_rel)
            if (manifest_row is None or actual['sha256']!=item.get('sha256')
                    or actual['sizeBytes']!=retained):
                fail('command capture does not bind its physical evidence file')
    return raw_total


def verify_source_seal(deadline: float) -> list[dict]:
    manifest, ident=load_json(SEAL/'manifest.json',1024*1024,deadline)
    if ident['sha256']!=EXPECTED_SEAL_SHA256 or manifest.get('profile')!='umf.g03-reviewed-harness-source-subset/2' or manifest.get('status')!='SOURCE_ACCEPTED_NOT_EXECUTED':
        fail('source005 seal identity/status mismatch')
    rows=[]; total=0
    for item in manifest.get('files',[]):
        rel=pathlib.PurePosixPath(item.get('path',''))
        if rel.is_absolute() or not rel.parts or any(part in ('','.','..') for part in rel.parts): fail('unsafe seal path')
        _, actual=bounded_read(SEAL.joinpath(*rel.parts), item['sizeBytes'], deadline)
        if (actual['sha256'],actual['sizeBytes'])!=(item['sha256'],item['sizeBytes']): fail('sealed source file changed: '+item['path'])
        rows.append(actual); total+=actual['sizeBytes']
    if len(rows)!=8: fail('source005 file roster changed')
    prior=manifest.get('previousReviews',[])
    if len(prior)!=3: fail('source005 review-binding roster changed')
    for item in prior:
        _, actual=bounded_read(pathlib.Path(item['path']),1024*1024,deadline)
        if actual['sha256']!=item.get('sha256'): fail('prior source-review digest mismatch')
    return rows


def verify_commands_and_raws(full: dict, deadline: float) -> list[dict]:
    executions=full.get('scenarioExecutions')
    if type(executions) is not list or len(executions)!=19: fail('actual007 raw scenario execution roster incomplete')
    raw_rows=[]; seen=set()
    for expected_ordinal,item in enumerate(executions,1):
        if type(item.get('ordinal')) is not int or item.get('ordinal')!=expected_ordinal:
            fail('scenario ordinal differs from fixed 1..19 source roster')
        command=item.get('command',{})
        elapsed=command.get('elapsedSeconds'); timeout=command.get('timeoutSeconds')
        if (type(timeout) is not int or timeout!=180 or not finite_number(elapsed)
                or elapsed<0 or elapsed>MAX_SCENARIO_SECONDS+SCENARIO_GRACE_SECONDS):
            fail('scenario execution timer is not finite within the 180s plus 10s profile')
        if (item.get('campaignId')!=full.get('campaignId') or item.get('outcome')!='RETURNED_RAW_DICTIONARY'
                or command.get('name')!=expected_command_name(item)
                or command.get('exitCode')!=0 or command.get('timedOut') is not False
                or command.get('drainExpired') is not False or command.get('logCapExceeded') is not False
                or command.get('captureStatus')!='PASS_CAPTURE_CLOSED'):
            fail('raw scenario command is incomplete, timed out, truncated, or foreign')
        expected_path=expected_raw_guest_path(item)
        raw_path=item.get('rawReportPath')
        artifact=map_campaign_guest_path(raw_path,expected_path)
        rel=artifact.relative_to(ORIGINAL/'campaign')
        if rel.as_posix() in seen: fail('duplicate raw scenario report path')
        seen.add(rel.as_posix())
        raw, ident=bounded_read(artifact, MAX_FILE, deadline)
        if (ident['sha256'],ident['sizeBytes'])!=(item.get('rawReportSha256'),item.get('rawReportBytes')): fail('raw scenario envelope hash/size mismatch')
        envelope=json.loads(raw)
        if (envelope.get('campaignId')!=full.get('campaignId') or envelope.get('caseId')!=item.get('caseId')
                or envelope.get('scenario')!=item.get('scenario') or envelope.get('outcome') not in (None,'RETURNED_RAW_DICTIONARY')
                or type(envelope.get('rawScenario')) is not dict): fail('raw scenario envelope identity mismatch')
        raw_rows.append({'caseId':item['caseId'],'scenario':item['scenario'],'ordinal':item.get('ordinal'),**ident})
    roster=[(x['caseId'],x['scenario']) for x in executions]
    if len(set(roster))!=19 or len(seen)!=19: fail('raw scenario roster has duplicates or omissions')
    return raw_rows


def verify_case_report_raw_correspondence(full: dict, expected_data: dict, deadline: float) -> None:
    campaign=full['campaignReport']; cases=campaign.get('caseReports',[])
    by_scenario={(case.get('caseId'),record.get('scenario')):record
                 for case in cases for record in case.get('scenarioResults',[])}
    for item in full['scenarioExecutions']:
        envelope_path=map_campaign_guest_path(item.get('rawReportPath'),expected_raw_guest_path(item))
        envelope_raw,_=bounded_read(envelope_path,MAX_FILE,deadline)
        envelope=json.loads(envelope_raw)
        record=by_scenario.get((item['caseId'],item['scenario']))
        raw=envelope.get('rawScenario')
        if type(record) is not dict or type(raw) is not dict or any(record.get(k)!=v for k,v in raw.items()):
            fail('case report raw dictionary diverges from immutable scenario envelope')
        expected=expected_data.get('caseBindings',{}).get(item['scenario'])
        campaign_binding=record.get('campaignBinding',{})
        if (campaign_binding.get('campaignId')!=full.get('campaignId')
                or campaign_binding.get('scenario')!=item['scenario']
                or campaign_binding.get('expectedCaseBinding')!=expected):
            fail('case expected binding differs from frozen expected-data manifest')


def verify_native_cleanup_roster(cases: list[dict], target: dict, expected_data: dict) -> None:
    if type(cases) is not list or len(cases)!=14: fail('native cleanup case roster incomplete')
    bindings=expected_data.get('caseBindings')
    expected_roster=expected_data.get('roster')
    if type(bindings) is not dict or type(expected_roster) is not list or len(expected_roster)!=14:
        fail('cleanup verifier lacks the independently frozen Full14 roster/bindings')
    case_summaries=[]; resource_count=0; no_resource_count=0
    for case_index,case in enumerate(cases[:-1]):
        case_id=f'G03-N{case_index+1:02d}'
        if type(case) is not dict or case.get('caseId')!=case_id:
            fail('native case summary identity differs: '+case_id)
        roster_entry=expected_roster[case_index]
        if roster_entry.get('caseId')!=case_id or type(roster_entry.get('scenarios')) is not list:
            fail('independent cleanup scenario roster differs: '+case_id)
        results=case.get('scenarioResults')
        if type(results) is not list or [x.get('scenario') for x in results]!=roster_entry['scenarios']:
            fail('cleanup scenario rows do not exactly follow the fixed per-case roster: '+case_id)
        case_cleanup=case.get('cleanup')
        if (type(case_cleanup) is not dict or set(case_cleanup)!={'status','subcaseStatuses'}
                or case_cleanup.get('status')!='PASS'):
            fail('case-level orchestration cleanup summary has an unexpected schema: '+case_id)
        raw_statuses=[]
        for result in results:
            scenario=result.get('scenario')
            binding=bindings.get(scenario)
            if type(binding) is not dict or result.get('targetContinuity')!='PASS':
                fail('scenario cleanup lacks fixed binding or target continuity: '+str(scenario))
            if (result.get('database')!=binding.get('database') or result.get('schema')!=binding.get('schema')
                    or result.get('roleNames')!=binding.get('roleNames')):
                fail('scenario database/schema/native roles differ from frozen expected binding: '+str(scenario))
            if scenario!='admission-refusal' and result.get('targetIdentity')!=target:
                fail('resource-creating scenario target identity differs from original target: '+str(scenario))
            raw_cleanup=result.get('cleanup')
            if type(raw_cleanup) is not dict: fail('scenario cleanup report is not an object: '+str(scenario))
            raw_status=raw_cleanup.get('status')
            raw_statuses.append(raw_status)
            if scenario=='admission-refusal':
                before=result.get('targetBefore'); after=result.get('targetAfter')
                if (set(raw_cleanup)!={'status'} or raw_status!='PASS_NO_NATIVE_RESOURCES_CREATED'
                        or result.get('cleanupVerification') is not None
                        or result.get('nativeEffects')!='none; compilation refusal only'
                        or type(before) is not dict or before!=after
                        or set(before)!={'observer','ownedDatabase','ownedRoles','ownedSchema','ownedSchemaObjects','target'}
                        or before.get('ownedDatabase') is not None or before.get('ownedRoles')!=[]
                        or before.get('ownedSchema') is not None or before.get('ownedSchemaObjects')!=[]):
                    fail('admission-refusal no-resource observation is not closed')
                observer=before.get('observer',{})
                expected_observer={'currentUser':target.get('currentUser'),'oid':target.get('observerOid'),
                    'sessionUser':target.get('sessionUser'),'superuser':target.get('observerSuperuser')}
                before_target=before.get('target',{})
                expected_before_target={'database':target.get('maintenanceDatabase'),
                    'postmasterStart':target.get('postmasterStart'),'serverAddress':target.get('serverAddress'),
                    'serverPort':target.get('serverPort'),'serverVersion':target.get('serverVersion'),
                    'systemIdentifier':target.get('systemIdentifier')}
                if (observer!=expected_observer or before_target!=expected_before_target
                        or result.get('targetBefore')!=result.get('targetAfter')):
                    fail('admission-refusal target-before/after does not match original target identity')
                expected_roles=binding.get('roleNames')
                if result.get('roleNames')!=expected_roles:
                    fail('admission-refusal expected-role binding differs')
                no_resource_count+=1
                continue
            expected_roles=binding.get('allOwnedRoleNames',binding.get('roleNames'))
            if (type(expected_roles) is not list or not expected_roles
                    or result.get('allOwnedRoleNames')!=expected_roles
                    or result.get('logicalRoleNames',[])!=binding.get('logicalRoleNames',[])):
                fail('resource-owning role roster differs from frozen expected binding: '+str(scenario))
            if (set(raw_cleanup)!={'createdDatabase','createdRoles','errors','status'}
                    or raw_status!='PASS' or raw_cleanup.get('createdDatabase') is not True
                    or raw_cleanup.get('createdRoles')!=expected_roles or raw_cleanup.get('errors')!=[]):
                fail('raw owned-resource cleanup report is not exact and closed: '+str(scenario))
            verification=result.get('cleanupVerification')
            expected_verification={'ownedDatabaseAbsent':True,'ownedDatabaseRemaining':None,
                'ownedRolesAbsent':True,'remainingRoleIdentities':[],
                'targetIdentityUnchanged':True,'schemaAndTableAbsentByOwnedDatabaseRemoval':True}
            if (type(verification) is not dict or set(verification)!=set(expected_verification)
                    or verification.get('ownedDatabaseAbsent') is not True
                    or verification.get('ownedDatabaseRemaining') is not None
                    or verification.get('ownedRolesAbsent') is not True
                    or type(verification.get('remainingRoleIdentities')) is not list
                    or verification.get('remainingRoleIdentities')!=[]
                    or verification.get('targetIdentityUnchanged') is not True
                    or verification.get('schemaAndTableAbsentByOwnedDatabaseRemoval') is not True):
                fail('fresh owned-resource absence/continuity witnesses are incomplete: '+str(scenario))
            resource_count+=1
        if case_cleanup.get('subcaseStatuses')!=raw_statuses:
            fail('case cleanup summary does not exactly correlate ordered scenario cleanup statuses: '+case_id)
        case_summaries.append(case_cleanup['status'])
    final=cases[-1]
    if (resource_count!=18 or no_resource_count!=1):
        fail('cleanup scenario branch counts differ from fixed 18-resource/1-refusal roster')
    if (not isinstance(final,dict) or final.get('caseId')!='G03-N14'
            or final.get('executedRosterComplete') is not True or final.get('missingOrFailedCleanupCases')!=[]
            or final.get('perCaseCleanupStatuses')!=case_summaries or len(case_summaries)!=13
            or final.get('finalTargetObservation')!=target or final.get('finalTargetObservationError') is not None):
        fail('N14 actual cleanup/roster observation does not correlate with 13 verified summaries')


def verify_cleanup_and_setup(full: dict, outer: dict) -> None:
    elapsed=outer.get('elapsedSeconds')
    if not finite_number(elapsed) or elapsed<0 or elapsed>MAX_OUTER_ELAPSED:
        fail('outer elapsed timer is not finite within the 1800s campaign ceiling')
    if full.get('campaignId')!=outer.get('campaignId') or full.get('status')!='FAIL_OR_UNKNOWN' or outer.get('status')!='FAIL_OR_UNKNOWN':
        fail('original campaign failure identity/status was not preserved')
    if full.get('campaignExitCode')!=2 or full.get('scenarioDispatchCount')!=19:
        fail('original full14 command exit or dispatch count differs')
    if outer.get('captureFailed') is not False or outer.get('inputsStableAfterRun') is not True:
        fail('original full14 capture or input stability receipt is not closed')
    if (outer.get('inputPacketSha256')!=EXPECTED_INPUT_PACKET_SHA256
            or outer.get('sourceSeal',{}).get('manifestSha256')!=EXPECTED_SEAL_SHA256
            or outer.get('campaignResult',{}).get('sha256')!=EXPECTED_CAMPAIGN_RESULT_SHA256
            or outer.get('campaignResult',{}).get('status')!='FAIL_OR_UNKNOWN'):
        fail('original outer packet/source/campaign-result provenance mismatch')
    if full.get('setupEvidenceInventoryBefore')!=full.get('setupEvidenceInventoryAfter'):
        fail('pre/post campaign setup inventory changed')
    cleanup=outer.get('cleanup',{})
    if cleanup.get('status')!='PASS' or cleanup.get('errors')!=[] or cleanup.get('elapsedSeconds')!=856.044:
        fail('actual007 outer cleanup evidence does not close')
    resources=cleanup.get('resources',{})
    expected={'g03-f14-campaign-'+outer.get('executionId'),
              'g03-f14-setup-'+outer.get('executionId'),
              'g03-f14-pg-'+outer.get('executionId'),
              'g03-f14-net-'+outer.get('executionId'),
              'g03-f14-venv-'+outer.get('executionId'),
              'g03-f14-pgdata-'+outer.get('executionId')}
    if set(resources)!=expected: fail('actual007 owned cleanup resource roster differs')
    if any(v.get('executionIdLabel')!=outer.get('executionId') for v in resources.values()): fail('cleanup owner labels differ')
    if resources['g03-f14-campaign-'+outer['executionId']].get('exitCode')!=2: fail('original campaign container exit not retained')
    nonzero=[(c.get('name'),c.get('exitCode')) for c in outer.get('commands',[]) if c.get('exitCode')!=0]
    if sorted(nonzero)!=[('guest-campaign',2),('postgres-readiness',2)]: fail('original bounded command failure roster changed')
    command_rows={c.get('name'):c for c in outer.get('commands',[])}
    absent_names=[f"cleanup-verify-absent-g03-f14-{kind}-{outer['executionId']}" for kind in ('campaign','setup','pg')]
    absent_names += [f"cleanup-volume-verify-absent-g03-f14-{kind}-{outer['executionId']}" for kind in ('pgdata','venv')]
    absent_names += ['cleanup-network-absence']
    for name in absent_names:
        row=command_rows.get(name)
        if row is None or row.get('exitCode')!=0 or row.get('stdout',{}).get('rawBytes')!=0:
            fail('actual007 cleanup absence was not physically verified: '+name)


def write_receipt(path: pathlib.Path, value: dict, deadline: float) -> dict:
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode('utf-8')
    if len(raw)>OUTPUT_CAP: fail('derived reanalysis receipt exceeds 8 MiB')
    flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
    fd=os.open(path,flags,0o600)
    try:
        with os.fdopen(fd,'wb') as stream:
            for at in range(0,len(raw),65536):
                if time.monotonic()>=deadline: fail('receipt write deadline exceeded')
                stream.write(raw[at:at+65536])
            stream.flush();os.fsync(stream.fileno())
    except BaseException:
        try: path.unlink()
        except OSError: pass
        raise
    _, physical=bounded_read(path,OUTPUT_CAP,deadline)
    if (physical['sizeBytes'],physical['sha256'])!=(len(raw),hashlib.sha256(raw).hexdigest()): fail('derived receipt physical closure mismatch')
    return physical


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--execute',action='store_true')
    parser.add_argument('--review-json',required=True,type=pathlib.Path)
    parser.add_argument('--review-sha256',required=True)
    parser.add_argument('--packet-sha256',required=True)
    args=parser.parse_args()
    if not args.execute or os.environ.get('G03_PREDICATE_REANALYSIS_EXECUTE')!='1': fail('explicit metadata-only execution opt-in absent')
    start=time.monotonic(); deadline=start+MAX_SECONDS
    review,review_identity=load_json(args.review_json,64*1024,deadline)
    if review_identity['sha256']!=args.review_sha256 or review.get('status')!='ACCEPTED': fail('independent Sol source review is missing or not accepted')
    frozen, frozen_identity=load_json(OPERATOR_PACKET,1024*1024,deadline)
    operator_identity=bounded_read(pathlib.Path(__file__).resolve(),1024*1024,deadline)[1]
    predicate_identity=bounded_read(PREDICATE,1024*1024,deadline)[1]
    test_identity=bounded_read(MUTATION_TESTS,1024*1024,deadline)[1]
    managed_predicate_identity=bounded_read(MANAGED_PREDICATE,1024*1024,deadline)[1]
    managed_test_identity=bounded_read(MANAGED_MUTATION_TESTS,1024*1024,deadline)[1]
    if (managed_predicate_identity['sha256']!=predicate_identity['sha256']
            or managed_test_identity['sha256']!=test_identity['sha256']):
        fail('managed native source copies differ from frozen operator/source copies')
    packet,packet_identity=load_json(PACKET,16*1024*1024,deadline)
    if (packet_identity['sha256']!=EXPECTED_INPUT_PACKET_SHA256
            or packet.get('campaignId')!='661e79df-3dcb-40e3-87ed-29afcc472124'
            or packet.get('status')!='FROZEN_FINAL_INPUTS'):
        fail('frozen actual007 packet mismatch')
    if packet.get('source')!={'manifestSha256':EXPECTED_SEAL_SHA256,'profile':'umf.g03-reviewed-harness-source-subset/2','root':str(SEAL)}:
        fail('actual007 packet does not bind source005 seal')
    parent_packet_identity=bounded_read(PARENT_PACKET,1024*1024,deadline)[1]
    if parent_packet_identity['sha256']!=PARENT_PACKET_SHA256:
        fail('parent 002 frozen operator packet hash mismatch')
    parent003_identity=bounded_read(PARENT003_PACKET,1024*1024,deadline)[1]
    if parent003_identity['sha256']!=PARENT003_PACKET_SHA256:
        fail('parent 003 frozen operator packet hash mismatch')
    findings_identity=bounded_read(SOURCE_REVIEW_FINDINGS_PATH_006,64*1024,deadline)[1]
    if findings_identity['sha256']!=SOURCE_REVIEW_FINDINGS_SHA256_006:
        fail('sealed 006 Sol cleanup plan bytes differ from the fixed review identity')
    if frozen_identity['sha256']!=args.packet_sha256 or review.get('sourceReviewSha256') is None:
        fail('frozen operator packet/review binding missing')
    if frozen.get('operatorSha256')!=operator_identity['sha256'] or frozen.get('predicateSha256')!=predicate_identity['sha256'] or frozen.get('mutationTestsSha256')!=test_identity['sha256']:
        fail('current operator or predicate sources differ from frozen operator packet')
    if (frozen.get('profile')!='umf.g03-native-predicate-reanalysis-inputs/6'
            or frozen.get('status')!='FROZEN_FOR_INDEPENDENT_SOL_REVIEW_NOT_EXECUTABLE'
            or frozen.get('reviewedPlanSha256')!=PLAN_SHA256
            or frozen.get('sourceReviewFindingsSha256')!=SOURCE_REVIEW_FINDINGS_SHA256_006
            or frozen.get('parentPacketSha256')!=PARENT_PACKET_SHA256
            or frozen.get('sourceReviewFindingsPath')!=str(SOURCE_REVIEW_FINDINGS_PATH_006)
            or frozen.get('sourceReviewFindingsSha256')!=findings_identity['sha256']
            or frozen.get('parent003PacketPath')!=str(PARENT003_PACKET)
            or frozen.get('parent003PacketSha256')!=PARENT003_PACKET_SHA256
            or frozen.get('qualificationLimits')!=QUALIFICATION_LIMITS
            or frozen.get('predicatePath')!=str(PREDICATE)
            or frozen.get('mutationTestsPath')!=str(MUTATION_TESTS)
            or frozen.get('operatorPath')!=str(pathlib.Path(__file__).resolve())
            or frozen.get('parentPacketPath')!=str(PARENT_PACKET)
            or frozen.get('cleanupReviewPlanPath')!=str(SOURCE_REVIEW_FINDINGS_PATH_006)
            or frozen.get('cleanupReviewPlanSha256')!=SOURCE_REVIEW_FINDINGS_SHA256_006
            or frozen.get('inputPacketSha256')!=EXPECTED_INPUT_PACKET_SHA256
            or frozen.get('sourceSealManifestSha256')!=EXPECTED_SEAL_SHA256
            or frozen.get('setupCaptureClosure')!={'profile':'umf.g03-full14-setup/1','status':'PASS_SETUP',
                'commandCount':8,'setupRawLogBytes':5435,'campaignRawLogBytes':954,
                'outerOnlyCombinedRawLogBytes':2619,'allCaptureRawLogBytes':9008,
                'physicalLogBytes':9008,'setupGuestLogRoot':'/out/logs/',
                'setupPhysicalLogRoot':'setup/logs/'}
            or frozen.get('snapshotCanonicalization')!={'lineFeedByte':10,'requiredTrailingLfCount':1,
                'canonicalBytes':'snapshot_raw[:-1]','canonicalJson':'sorted keys, compact separators, UTF-8, ensure_ascii false',
                'canonicalSizeBytes':53399,'canonicalSha256':'5e002268af9fa6105e88fd7fd5e10f252e914ba284a6985afef42124892b4d6a'}
            or frozen.get('cleanupValidationProfile')!={'caseSummaryKeys':['status','subcaseStatuses'],
                'rawResourceScenarioCount':18,'admissionNoResourceScenarioCount':1,
                'requiredResourceCleanupKeys':['createdDatabase','createdRoles','errors','status'],
                'requiredCleanupVerificationKeys':['ownedDatabaseAbsent','ownedDatabaseRemaining','ownedRolesAbsent',
                    'remainingRoleIdentities','targetIdentityUnchanged','schemaAndTableAbsentByOwnedDatabaseRemoval'],
                'n14CorrelatesCaseCleanupStatuses':True,'usesExpectedDataRoleBindings':True}
            or frozen.get('full14RawLogBytes')!=6389 or frozen.get('allCaptureRawLogBytes')!=9008
            or frozen.get('physicalLogBytes')!=9008 or frozen.get('setupCaptureCommandCount')!=8
            or frozen.get('originalOperatorResultSha256')!=EXPECTED_ORIGINAL_RESULT_SHA256
            or frozen.get('originalCampaignResultSha256')!=EXPECTED_CAMPAIGN_RESULT_SHA256
            or frozen.get('campaignExpectedDataSha256')!=EXPECTED_DATA_SHA256
            or frozen.get('originalOutputRoot')!=str(ORIGINAL)):
        fail('frozen reanalysis input packet provenance differs')
    if (review.get('predicateSha256')!=predicate_identity['sha256']
            or review.get('mutationTestsSha256')!=test_identity['sha256']
            or review.get('packetSha256')!=frozen_identity['sha256']
            or review.get('originalInputPacketSha256')!=packet_identity['sha256']
            or review.get('operatorSha256')!=operator_identity['sha256']
            or review.get('reviewedPlanSha256')!=PLAN_SHA256
            or review.get('sourceReviewFindingsSha256')!=SOURCE_REVIEW_FINDINGS_SHA256_006):
        fail('Sol review does not bind exact sources, plan, and input packet')
    _, source_review=bounded_read(pathlib.Path(review.get('sourceReviewPath','')),1024*1024,deadline)
    if source_review['sha256']!=review.get('sourceReviewSha256'): fail('Sol source review document hash mismatch')
    seal_rows=verify_source_seal(deadline)
    outer,outer_identity=load_json(ORIGINAL/'operator-result.json',MAX_FILE,deadline)
    full,full_identity=load_json(ORIGINAL/'campaign/full14-result.json',MAX_FILE,deadline)
    if outer_identity['sha256']!=EXPECTED_ORIGINAL_RESULT_SHA256 or full_identity['sha256']!=EXPECTED_CAMPAIGN_RESULT_SHA256: fail('immutable original007 result hash mismatch')
    if (frozen.get('campaignId')!=full.get('campaignId') or frozen.get('executionId')!=outer.get('executionId')
            or packet.get('campaignId')!=full.get('campaignId')): fail('frozen campaign/execution identity mismatch')
    if (frozen.get('rawScenarioEnvelopeCount')!=19 or frozen.get('scenarioDispatchCount')!=19
            or frozen.get('physicalEvidenceFileCount')!=181 or frozen.get('outerCleanupStatus')!='PASS'
            or frozen.get('outerCleanupElapsedSeconds')!=856.044):
        fail('frozen actual007 roster/custody/cleanup facts changed')
    expected_data,expected_data_identity=load_json(ORIGINAL/'campaign/campaign-expected-data.json',MAX_FILE,deadline)
    if (expected_data_identity['sha256']!=EXPECTED_DATA_SHA256
            or full.get('campaignExpectedDataSha256')!=EXPECTED_DATA_SHA256
            or expected_data.get('campaignId')!=full.get('campaignId')
            or expected_data.get('profile')!='umf.g03-native-campaign-expected-data/0.1'
            or expected_data.get('fixtureSha256')!=packet.get('fixtureSha256')
            or full.get('sourceSealSha256')!=EXPECTED_SEAL_SHA256):
        fail('expected-data manifest hash/identity mismatch')
    runtime=outer.get('postgresRuntime',{})
    packet_pg=packet.get('postgresRuntime',{})
    if (any(runtime.get(key)!=packet_pg.get(key) for key in ('fullVersion','shortVersion','serverVersionNum'))
            or runtime.get('platform')!=packet.get('images',{}).get('postgres',{}).get('platform')
            or runtime.get('publishedPorts') is not False
            or outer.get('cohort',{}).get('root')!=packet.get('cohort',{}).get('root')
            or outer.get('images',{}).get('postgres',{}).get('id')!=packet.get('images',{}).get('postgres',{}).get('id')):
        fail('actual007 cohort or PostgreSQL runtime identity differs from input packet')
    verify_cleanup_and_setup(full,outer)
    physical_evidence=verify_evidence_tree(outer,deadline,outer_identity['sizeBytes'])
    outer_raw_log_bytes=verify_capture_rows(outer.get('commands'),campaign_logs=False,evidence=physical_evidence,deadline=deadline)
    campaign_raw_log_bytes=verify_capture_rows(full.get('commands'),campaign_logs=True,evidence=physical_evidence,deadline=deadline,scenario_executions=full.get('scenarioExecutions'))
    setup_raw_log_bytes,setup_physical_log_bytes,setup_identity=verify_setup_receipt(outer,packet,physical_evidence,deadline)
    raw_log_bytes=outer_raw_log_bytes+campaign_raw_log_bytes+setup_raw_log_bytes
    if raw_log_bytes>MAX_RAW_LOG_BYTES: fail('all physical command captures exceed 1 MiB raw-log allowance')
    if (type(outer.get('combinedRawLogBytes')) is not int
            or outer.get('combinedRawLogBytes')!=outer_raw_log_bytes):
        fail('recorded outer-only combined raw-log bytes differ from its physical captures')
    if (type(full.get('rawLogBytes')) is not int
            or full.get('rawLogBytes')!=campaign_raw_log_bytes+setup_raw_log_bytes):
        fail('recorded full raw-log total differs from setup plus campaign captures')
    physical_log_bytes=sum(row['sizeBytes'] for row in physical_evidence if '/logs/' in row['path'] or row['path'].endswith('.log'))
    if (type(outer.get('physicalLogBytes')) is not int or outer.get('physicalLogBytes')!=physical_log_bytes
            or physical_log_bytes!=raw_log_bytes or setup_physical_log_bytes!=setup_raw_log_bytes
            or raw_log_bytes!=9008):
        fail('all outer and guest physical log bytes differ from complete evidence inventory')
    raw_evidence=verify_commands_and_raws(full,deadline)
    verify_path_refusal_controls(full['scenarioExecutions'][0])
    campaign=full.get('campaignReport',{})
    cases=campaign.get('caseReports')
    if type(cases) is not list or [x.get('caseId') for x in cases]!=[f'G03-N{i:02d}' for i in range(1,15)]: fail('complete fixed14 case report roster mismatch')
    roster=campaign.get('fixedRoster',[])
    expected_roster=expected_data.get('roster',[])
    if len(roster)!=14 or roster!=expected_roster: fail('campaign fixed roster differs from frozen expected-data manifest')
    expected_pairs=[(entry['caseId'],scenario) for entry in roster[:-1] for scenario in entry['scenarios']]
    if [(x['caseId'],x['scenario']) for x in full['scenarioExecutions']]!=expected_pairs: fail('complete ordered raw scenario roster differs from fixed P56 campaign')
    bindings=expected_data.get('caseBindings')
    if type(bindings) is not dict: fail('frozen expected case bindings missing')
    scenario_bindings={name:value for name,value in bindings.items()}
    for entry in roster:
        if type(entry) is not dict or type(entry.get('caseId')) is not str: fail('malformed fixed campaign roster')
    if campaign.get('campaignId')!=full.get('campaignId') or campaign.get('targetIdentity')!=full.get('targetBefore'):
        fail('known target identity does not close against full14 preflight')
    if expected_data.get('target')!=full.get('targetBefore'): fail('independent target identity differs from frozen expected-data manifest')
    verify_native_cleanup_roster(cases,full['targetBefore'],expected_data)
    verify_case_report_raw_correspondence(full,expected_data,deadline)
    sys.path.insert(0,str(SEAL/'tests/lifecycle'))
    orchestration_path=SEAL/'tests/lifecycle/g03_campaign_orchestration.py'
    orchestration_spec=importlib.util.spec_from_file_location('g03_campaign_orchestration',orchestration_path)
    orchestration=importlib.util.module_from_spec(orchestration_spec);sys.modules['g03_campaign_orchestration']=orchestration;orchestration_spec.loader.exec_module(orchestration)
    spec=importlib.util.spec_from_file_location('g03_campaign_predicates_reanalysis',PREDICATE)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    # This is the first and only semantic operation: the pure conjunction consumes
    # verified immutable dictionaries and independently bound fixture expectations.
    derived=module.evaluate_campaign(cases,expected_case_bindings=scenario_bindings,
        expected_target=full['targetBefore'],final_target_observation=campaign['targetIdentity'])
    result={'profile':'umf.g03-full14-predicate-reanalysis/6','executionKind':'metadata_only_pure_predicate_reanalysis',
      'status':'PREDICATE_REANALYSIS_PASS' if derived['predicatePassed'] else 'PREDICATE_REANALYSIS_OPEN',
      'scope':'Reinterprets only the immutable actual007 raw corpus; original run stays FAIL_OR_UNKNOWN; no DB, product import, runner, or live observation.',
      'originalRun':{'executionId':outer['executionId'],'campaignId':full['campaignId'],'status':outer['status'],
        'campaignStatus':full['status'],'campaignExitCode':full['campaignExitCode'],'scenarioDispatchCount':full['scenarioDispatchCount'],
        'operatorResult':outer_identity,'campaignResult':full_identity,'inputPacket':packet_identity,
        'expectedData':expected_data_identity,'sourceSealManifest':{'path':str(SEAL/'manifest.json'),'sha256':EXPECTED_SEAL_SHA256}},
      'originalPredicateReport':{'status':campaign.get('status'),'casePredicates':campaign.get('casePredicates')},
      'revisedSources':{'predicate':predicate_identity,'mutationTests':test_identity,
        'managedPredicateCopy':managed_predicate_identity,'managedMutationTestsCopy':managed_test_identity,
        'SolReview':review_identity,'planSha256':PLAN_SHA256,'cleanupReviewPlan':findings_identity},
      'custody':{'physicalEvidenceFileCount':len(physical_evidence),'physicalEvidenceBytes':sum(x['sizeBytes'] for x in physical_evidence),
        'rawScenarioCount':len(raw_evidence),'sourceSealFileCount':len(seal_rows),'setupInventoryUnchanged':True,
        'outerRawLogBytes':outer_raw_log_bytes,'campaignRawLogBytes':campaign_raw_log_bytes,
        'setupRawLogBytes':setup_raw_log_bytes,'setupReceipt':setup_identity,
        'allRawLogBytes':raw_log_bytes,'physicalLogBytes':physical_log_bytes,
        'outerCleanupStatus':outer['cleanup']['status'],'targetIdentity':campaign['targetIdentity'],
        'physicalEvidenceInventory':physical_evidence,'rawScenarioInventory':raw_evidence,'sourceSealFiles':seal_rows},
      'derivedPredicateResult':derived,'originalFailuresPreserved':True,'elapsedSeconds':round(time.monotonic()-start,3)}
    if (verify_evidence_tree(outer,deadline,outer_identity['sizeBytes'])!=physical_evidence
            or verify_source_seal(deadline)!=seal_rows
            or bounded_read(ORIGINAL/'operator-result.json',MAX_FILE,deadline)[1]!=outer_identity
            or bounded_read(ORIGINAL/'setup/setup-result.json',MAX_FILE,deadline)[1]!=setup_identity):
        fail('immutable original evidence or terminal outer receipt changed during predicate reanalysis')
    if (load_json(PACKET,16*1024*1024,deadline)[1]!=packet_identity
            or load_json(OPERATOR_PACKET,1024*1024,deadline)[1]!=frozen_identity
            or bounded_read(PARENT_PACKET,1024*1024,deadline)[1]!=parent_packet_identity
            or bounded_read(PARENT003_PACKET,1024*1024,deadline)[1]!=parent003_identity
            or bounded_read(SOURCE_REVIEW_FINDINGS_PATH_006,64*1024,deadline)[1]!=findings_identity
            or bounded_read(args.review_json,64*1024,deadline)[1]!=review_identity
            or bounded_read(pathlib.Path(review.get('sourceReviewPath','')),1024*1024,deadline)[1]!=source_review):
        fail('frozen source-review or input packet changed during predicate reanalysis')
    if (bounded_read(PREDICATE,1024*1024,deadline)[1]!=predicate_identity
            or bounded_read(MUTATION_TESTS,1024*1024,deadline)[1]!=test_identity
            or bounded_read(MANAGED_PREDICATE,1024*1024,deadline)[1]!=managed_predicate_identity
            or bounded_read(MANAGED_MUTATION_TESTS,1024*1024,deadline)[1]!=managed_test_identity):
        fail('reviewed source copy or managed PR copy changed during reanalysis')
    run_id=uuid.uuid4().hex; output=ROOT/'runs'/run_id; output.mkdir(mode=0o700)
    receipt=write_receipt(output/'predicate-reanalysis.json',result,deadline)
    print(json.dumps({'status':result['status'],'runId':run_id,'receipt':str(output/'predicate-reanalysis.json'),'receiptSha256':receipt['sha256']},sort_keys=True))
    return 0 if derived['predicatePassed'] else 1

if __name__=='__main__': raise SystemExit(main())
