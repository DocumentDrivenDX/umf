#!/usr/bin/env python3
"""Cost-first orchestration. Imports are pure; native work is explicit hosted CLI only."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback
import xml.etree.ElementTree as ET

PROFILE='umf.private-retained-cost-gate/1'

def require(ok,message):
    if not ok:raise ValueError(message)

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def members(args):
    names=['measurement.json','public-controls.xml']
    names += [kind+'-cost-'+when+'.json' for when in ('before','after') for kind in ('identity','installed-record')]
    result={}
    for name in names:
        path=args.out/name
        require(not path.is_symlink() and path.is_file() and path.stat().st_size<=16*1024*1024,'Cost receipt absent/unsafe/oversized: '+name)
        result[name]={'bytes':path.stat().st_size,'sha256':sha(path)}
    return result

def complete_measurement(report,source,wheel):
    require(report.get('profile')=='umf.private-inspector-retained-feasibility/1'
        and report.get('status')=='measured-fit' and report.get('actualCandidateSource')==source
        and type(report.get('maximumWork'))is int and report['maximumWork']==1000000
        and report.get('inspectionCases')==17 and report.get('inspectionCalls')==51
        and report.get('wheel',{}).get('sha256')==wheel
        and report.get('requestCustodyPreserved')is True and report.get('installedFilesUnchanged')is True
        and report.get('publishable')is False and report.get('readyForEnrollment')is False,'Complete strict public measurement differs')
    parity=report.get('parity')
    require(type(parity)is list and len(parity)==51 and len({(p['case'],p['carrier']) for p in parity})==51
        and len({p['case'] for p in parity})==17
        and {(p['case'],p['carrier']) for p in parity}=={(p['case'],carrier) for p in parity for carrier in ('dispatcher','list','tuple')},'Incomplete public51 parity census')

def cost(args,driver,execute=None):
    """One fresh identity -> strict gate -> failure-only bounded diagnostic.

    execute is the pure fake-process seam; production uses subprocess.run and
    always writes original stdout/stderr to exclusive named logs.
    """
    pins=json.loads(args.producer_pins.read_text());path=args.out/'cost-gate.json'
    state={'profile':PROFILE,'artifactSource':driver.OWNER,'controllerSource':args.controller_sha,
        'wheelSHA256':driver.WHEEL_SHA,'nativeSHA256':pins['nativeMember']['sha256'],
        'censusSHA256':sha(args.controller/'tests/qualification/fixtures/inspector-construction-batch.json'),
        'run':os.environ.get('GITHUB_RUN_ID'),'attempt':os.environ.get('GITHUB_RUN_ATTEMPT'),
        'status':'running','fullyQualified':False,'requiredQualificationPassed':False,
        'identityBeforePassed':False,'identityAfterPassed':False,'publicProbePassed':False,
        'publicControlsPassed':False,'diagnosticPassed':False,'expensiveTestCompilationAdmitted':False,
        'commands':[],'publishable':False,'readyForEnrollment':False,
        'unexecutedSemanticGates':['affected Rust census','legacy8','boundary27','installed Saga19']}
    def save():driver.write(path,state)
    def command(label,argv,seconds=600):
        with (args.out/(label+'.log')).open('xb') as log:
            result=(execute or subprocess.run)(argv,stdout=log,stderr=subprocess.STDOUT,timeout=seconds)
        state['commands'].append({'label':label,'exit':result.returncode,'logSHA256':sha(args.out/(label+'.log'))});save()
        return result.returncode
    common=[sys.executable,'-I','-B',str(args.controller/'tools/run_inspector_attribution_lanes.py'),
        '--controller',str(args.controller),'--owner',str(args.owner),'--wheel',str(args.wheel),'--out',str(args.out),
        '--controller-sha',args.controller_sha,'--producer-pins',str(args.producer_pins)]
    budget_refusal=False
    save()
    try:
        driver.identity(args,'cost-before');state['identityBeforePassed']=True;save()
        try:
            rc=command('public-probe',[sys.executable,'-I','-B',str(args.owner/'tools/probe_inspector_retained_feasibility.py'),
                '--root',str(args.owner),'--wheel',str(args.wheel),'--source-sha',driver.OWNER,
                '--resource-pins-sha256','72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290',
                '--output',str(args.out/'measurement.json')])
            report=json.loads((args.out/'measurement.json').read_text())
            if rc:
                require(rc in (1,2) and driver.resource_limit_measurement(report),'Non-budget public gate failure')
                state['classification']='ordinary-public-RESOURCE_LIMIT';budget_refusal=True;save()
            else:
                complete_measurement(report,driver.OWNER,driver.WHEEL_SHA)
                state['publicProbePassed']=True;save()
                argv=[sys.executable,'-I','-B','-m','pytest','-q','-s','--junitxml='+str(args.out/'public-controls.xml'),
                    str(args.controller/'python/tests/test_retained_codegen_native.py')+'::PublicRetainedFeasibilityTests']
                argv += [str(args.controller/'python/tests/test_retained_codegen_native.py')+'::RetainedResourceAdmissionNativeTests::'+name for name in driver.POSITIVES]
                rc=command('public-controls',argv)
                cases=list(ET.parse(args.out/'public-controls.xml').getroot().iter('testcase'))
                require(rc==0 and len(cases)==12 and not any(c.find(k)is not None for c in cases for k in ('failure','error','skipped')),'Required public control failure')
                state['publicControlsPassed']=True;save()
        finally:
            driver.identity(args,'cost-after');state['identityAfterPassed']=True;save()
        if budget_refusal:
            # Only authentic public work exhaustion with both identities can
            # enter supplementary observation. It cannot admit compilation.
            rc=command('diagnostic',common+['--mode','diagnostic'],driver.DIAGNOSTIC_SECONDS)
            require((args.out/'diagnostic.log').stat().st_size<=driver.DIAGNOSTIC_LOG_BYTES,'Diagnostic log bound exceeded')
            require(rc==0,'Bounded diagnostic failed')
            report=json.loads((args.out/'combined-constructor-attribution.json').read_text())
            require(report.get('profile')=='umf.private-combined-constructor-attribution/1' and report.get('source')==driver.OWNER
                and report.get('controllerSource')==args.controller_sha and report.get('wheelSHA256')==driver.WHEEL_SHA
                and report.get('amountSequenceEquivalent')is True and report.get('status')in ('observed-complete-pair','observed-matching-partial-refusals')
                and report.get('publishable')is False and report.get('readyForEnrollment')is False
                and (args.out/'identity-diagnostic-after.json').is_file(),'Diagnostic actual receipt differs')
            state['diagnosticPassed']=True
        elif state['publicProbePassed'] and state['publicControlsPassed']:
            state['members']=members(args)
            state['status']='cost-gate-passed';state['expensiveTestCompilationAdmitted']=True
    except BaseException as error:
        state['fatal']={'type':type(error).__name__,'message':str(error)};traceback.print_exc()
    finally:
        if state['status']!='cost-gate-passed':state['status']='failed'
        save()
    # A cost pass remains explicitly unqualified; every semantic gate is pending.
    return 0 if state['status']=='cost-gate-passed' else 1

def intake(args,driver):
    path=args.cost_gate
    require(path.resolve()==(args.out/'cost-gate.json').resolve() and not path.is_symlink()
        and path.is_file() and path.stat().st_size<=65536,'Original same-job cost receipt absent/unsafe')
    value=json.loads(path.read_text());pins=json.loads(args.producer_pins.read_text())
    require(value.get('profile')==PROFILE and value.get('artifactSource')==driver.OWNER
        and value.get('controllerSource')==args.controller_sha and value.get('wheelSHA256')==driver.WHEEL_SHA
        and value.get('nativeSHA256')==pins['nativeMember']['sha256'] and value.get('status')=='cost-gate-passed'
        and value.get('fullyQualified')is False and value.get('requiredQualificationPassed')is False
        and value.get('publishable')is False and value.get('readyForEnrollment')is False
        and value.get('run')==os.environ.get('GITHUB_RUN_ID') and value.get('attempt')==os.environ.get('GITHUB_RUN_ATTEMPT')
        and value.get('censusSHA256')==sha(args.controller/'tests/qualification/fixtures/inspector-construction-batch.json')
        and all(value.get(k)is True for k in ('identityBeforePassed','identityAfterPassed','publicProbePassed','publicControlsPassed','expensiveTestCompilationAdmitted')),'Cost/source/job/census binding differs')
    require(value.get('members')==members(args),'Cost gate member bytes changed')
    for when in ('before','after'):
        identity=json.loads((args.out/('identity-cost-'+when+'.json')).read_text())
        installed=json.loads((args.out/('installed-record-cost-'+when+'.json')).read_text())
        require(identity.get('profile')=='umf.private-retained-installed-identity/1' and identity.get('artifactSource')==driver.OWNER
            and identity.get('controllerSource')==args.controller_sha and identity.get('wheelSHA256')==driver.WHEEL_SHA
            and identity.get('distributionOwnershipVerified')is True and identity.get('completeWheelAndInstalledRecordVerified')is True
            and len(identity.get('loadedModules',{}))==4 and identity['loadedModules']['umf/_rust_core.abi3.so']['sha256']==pins['nativeMember']['sha256']
            and installed.get('status')=='passed' and installed.get('wheel_sha256')==driver.WHEEL_SHA
            and installed.get('native_sha256')==pins['nativeMember']['sha256'],'Original cost loaded/RECORD correspondence differs')
    complete_measurement(json.loads((args.out/'measurement.json').read_text()),driver.OWNER,driver.WHEEL_SHA)
    return value

def saga(args,pins):
    report=json.loads((args.out/'public-saga19.json').read_text());binding=report.get('installedBinding',{})
    require(report.get('profile')=='umf.saga.portable-host-receipt/2' and report.get('cases')==19 and report.get('passed')==19
        and report.get('hostId')=='python' and report.get('runtime')=={'python':'3.11.17','platform':'Linux','arch':'x86_64'}
        and len(report.get('results',[]))==19 and len({r['id'] for r in report['results']})==19 and all(r.get('passed')is True for r in report['results'])
        and report.get('corpusSha256')==sha(args.owner/'fixtures/saga/portable.json')
        and binding.get('status')=='passed' and binding.get('wheelSha256')==pins['wheel']['sha256']
        and binding.get('beforeNativeSha256')==binding.get('afterNativeSha256')==pins['nativeMember']['sha256'],'Installed Saga19 exact source/wheel/native proof missing')
    import re
    custody=(args.owner/'scripts/saga-portable/custody.ts').read_text()
    roster=custody.split('export const SAGA_QUALIFICATION_INPUTS=[',1)[1].split('] as const;',1)[0]
    expected=set(re.findall(r"'([^']+)'",roster))
    require(expected and set(report.get('qualificationInputs',{}))==expected,'Complete Saga source roster differs')
    for name,digest in report['qualificationInputs'].items():
        source=args.owner/name
        require(source.resolve().is_relative_to(args.owner.resolve()) and not source.is_symlink() and sha(source)==digest,'Saga oracle/source input changed')
    return True
