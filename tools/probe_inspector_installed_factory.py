#!/usr/bin/env python3
"""Installed-canonical public cost probe. Import is pure; CLI alone imports UMF.

Source-frozen named selection; compiled/native qualification remains unexecuted.
A manifest is paid provenance, never a runtime-validation or native-test proof.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import weakref

LIMIT=1_000_000
INPUT='installed-canonical/1'
PROFILE='umf.private-installed-factory-cost/1'
CENSUS='tests/qualification/fixtures/inspector-construction-batch.json'
CORPUS='tests/rust-core/fixtures/access-inspection/cases.json'
CORPUS_SHA='2e939f0d0f68f71a6b78c38e4fcd151e7b363513311f1aed170f9576333cbdc3'
PINS_SHA='72102654e5b8daf70d713abe986e0ecdc046f984094fa7fd36923d5cd6ceb290'
NAMES=('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy','tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')
REQUIRED_SOURCE=('Cargo.lock','crates/umf-core/Cargo.toml','crates/umf-core-wire/Cargo.toml','crates/umf-codegen/Cargo.toml','bindings/core/python/Cargo.toml',CORPUS,'tools/probe_inspector_installed_factory.py','crates/umf-core/src/canonical_codegen_literals.rs','crates/umf-core/src/canonical_codegen_resources.rs','python/src/umf/rust_codegen.py','tools/run_inspector_cost_gate.py','tools/run_inspector_attribution_lanes.py','tools/qualify_inspector_construction_batch.py','tools/inspector_stage_budget.py','.github/workflows/inspector-retained-attribution.yml','tools/probe_inspector_retained_feasibility.py','tools/generate_codegen_resource_literals.py','tools/generate_operation_schema_utf16.py','tools/generate_schema_metas_utf16.py','crates/umf-core/src/schema_metas_utf16.rs','crates/umf-codegen/src/operation_schemas_utf16.rs')
COVERAGE=('raw9_data_correspondence','native_factory_admission','native_factory_semantics','native_factory_first_denial','native_factory_manifest','ph1_arena','ph1_bridge','static_nk1','explicit_compatibility')

def require(ok,message):
    if not ok:raise ValueError(message)

def digest(raw):return hashlib.sha256(raw).hexdigest()

def sha(path):return digest(path.read_bytes())

def closed(value,keys):require(type(value)is dict and set(value)==set(keys),'Closed factory fields differ')

def hexsha(value):require(type(value)is str and re.fullmatch('[a-f0-9]{64}',value) is not None,'Exact SHA256 required')

def safe(root,name):
    require(type(name)is str and name and not Path(name).is_absolute() and '..' not in Path(name).parts,'Unsafe source name')
    root=root.resolve();p=root/name
    require(p.is_file() and not any(q.is_symlink() for q in (p,*p.parents)) and p.resolve().is_relative_to(root.resolve()),'Source file absent/unsafe: '+name)
    return p

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()

LOADER='python/tests/test_retained_codegen_native.py'
ORIGINAL_LOADER_SHA='2f6a35343298ccfa356acf21d559c80c93fc9a8e78de395f9d3fbe92d75e528e'
CURRENT_LOADER_SHA='b6af33945c4db2c43fc046060cf8e87e3e1803c6dcf17b6bd5e758b747d52944'
HISTORICAL_CORPUS='python/tests/fixtures/inspector-retained-source-S'

def original_loader(raw):
    text=raw.decode()
    line="HISTORICAL_RESOURCE_ROOT = ROOT / 'python/tests/fixtures/inspector-retained-source-S'\n"
    access="(HISTORICAL_RESOURCE_ROOT / row['path'])"
    require(text.count(line)==1 and text.count(access)==1,'Approved loader adapter shape differs')
    original=text.replace(line,'').replace(access,"(ROOT / row['path'])").encode()
    require(digest(original)==ORIGINAL_LOADER_SHA,'Original loader bodies/assertions changed')
    return original

def verified_loader_sha(root):
    raw=safe(root,LOADER).read_bytes()
    require(digest(raw)==CURRENT_LOADER_SHA,'Approved current loader changed')
    original_loader(raw)
    return digest(raw)

def case_partition(census,v):
    early=v['publicControls'];late=[x for g in v['python'] for x in g['cases']]
    d=v['legacyDisposition'];history=d.get('historicalOnly');new=d.get('newPythonCases')
    require(type(history)is list and len(history)==len(set(history)) and type(new)is list and len(new)==len(set(new)),'Named Python partition pending')
    original=[x for g in census['python'] for x in g['cases']]
    full=early+late+history
    require(len(full)==len(set(full)) and len(original)==len(set(original)) and not set(original)&set(new) and set(full)==set(original+new),'Python partition overlap/omission/substitution')
    return history

def selection(root,census):
    """Use only a reviewed committed roster, never discover/enroll tests online.

    No pending case name or hash is synthesized. Bind authenticates this census
    against Git before setup; this function checks its typed source/test closure.
    """
    v=census.get('installedFactory')
    require(type(v)is dict and v.get('status')=='source-frozen','Installed factory owner/source census pending')
    closed(v,('status','inputProfile','sourceFiles','moduleGraph','rust','python','publicControls','coverage','closureSHA256','modelSHA256','legacyDisposition','currentInputs'))
    require(v['inputProfile']==INPUT,'Wrong factory input profile')
    require(type(v['sourceFiles'])is dict and bool(v['sourceFiles']),'Complete factory source pins pending')
    require(CENSUS not in v['sourceFiles'],'Census cannot hash itself')
    for name,h in v['sourceFiles'].items():hexsha(h);require(sha(safe(root,name))==h,'Factory source pin differs: '+name)
    require(set(census.get('fileHashes',{}))<=set(v['sourceFiles']),'Original affected source closure omitted')
    for required in REQUIRED_SOURCE:
        require(required in v['sourceFiles'],'Factory source closure missing: '+required)
    hexsha(v['modelSHA256']);hexsha(v['closureSHA256'])
    require(v['closureSHA256']==digest(canonical({k:v[k] for k in ('sourceFiles','moduleGraph','rust','python','publicControls','coverage','modelSHA256','legacyDisposition','currentInputs')})),'Factory reviewed closure digest differs')
    require(type(v['moduleGraph'])is list and bool(v['moduleGraph']),'Module/cfg/include closure pending')
    for edge in v['moduleGraph']:
        closed(edge,('parent','child','module','declaration','cfg'))
        require(edge['parent'] in v['sourceFiles'] and edge['child'] in v['sourceFiles'] and type(edge['module'])is str and (bool(edge['module']) or edge['declaration'].splitlines()[-1].startswith('include!')) and type(edge['declaration'])is str and bool(edge['declaration']) and type(edge['cfg'])is list and all(type(x)is str for x in edge['cfg']),'Unpinned module edge')
        body=safe(root,edge['parent']).read_text()
        require(body.count(edge['declaration'])==1 and all(x in body for x in edge['cfg']),'Actual module/cfg declaration differs')
    require(type(v['rust'])is list and bool(v['rust']) and type(v['python'])is list and bool(v['python']),'Named owner cases pending')
    keys=[];ids=[]
    for row in v['rust']:
        require(row.get('source') in v['sourceFiles'] and type(row.get('cases'))is list and bool(row['cases']),'Unpinned Rust cases')
        require(row.get('features') in ('native-postgresql','umf-core/native-postgresql'),'Existing feature graph required')
        for case in row['cases']:
            name=case.get('name');require(type(name)is str and re.fullmatch(r'\w+(?:::\w+)*',name) is not None,'Exact Rust case required')
            require(re.search(r'\bfn\s+'+re.escape(name.rsplit('::',1)[-1])+r'\s*\(',safe(root,row['source']).read_text())is not None,'Named Rust source missing')
            if row['target']=='lib':require(any(e['child']==row['source'] and name.startswith(e['module']+'::') for e in v['moduleGraph']),'Rust module reachability pending')
            key=(row['package'],row['target'],name);keys.append(key);ids.append('rust:'+':'.join(key))
    require(len(keys)==len(set(keys)),'Duplicate Rust case')
    py=[]
    for group in v['python']:
        require(type(group.get('cases'))is list and bool(group['cases']),'Empty Python group')
        py.extend(group['cases'])
    require(len(py)==len(set(py)) and type(v['publicControls'])is list and bool(v['publicControls']) and len(v['publicControls'])==len(set(v['publicControls'])),'Duplicate/empty Python selection')
    history=case_partition(census,v)
    for selector in py+v['publicControls']+history:
        require(type(selector)is str and len(selector.split('::')) in (2,3),'Named Python method required; no class/wildcard')
        path,*parts=selector.split('::');require(path in v['sourceFiles'],'Python selector source unpinned')
        nodes=ast.parse(safe(root,path).read_bytes()).body
        for i,part in enumerate(parts):
            matches=[n for n in nodes if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name==part]
            require(len(matches)==1,'Python selector missing/ambiguous')
            node=matches[0];require(isinstance(node,ast.FunctionDef) if i==len(parts)-1 else isinstance(node,ast.ClassDef),'Whole class selection refused');nodes=node.body
        if selector not in history:ids.append('python:'+selector)
    closed(v['coverage'],COVERAGE)
    for group,selected in v['coverage'].items():require(type(selected)is list and bool(selected) and len(selected)==len(set(selected)) and set(selected)<=set(ids),'Missing named owner coverage: '+group)
    require(type(v['legacyDisposition'])is dict and v['legacyDisposition'].get('oldProbeUnchanged')is True and v['legacyDisposition'].get('warmed51IsFactoryEvidence')is False and type(v['legacyDisposition'].get('separateExplicitHistory'))is str and bool(v['legacyDisposition']['separateExplicitHistory']),'Explicit history disposition pending')
    # Target widening is forbidden. New owner controls belong in existing targets.
    allowed={(r['package'],r['target'],r['features']) for r in census['rust']}
    require({(r['package'],r['target'],r['features']) for r in v['rust']}<=allowed,'Factory target widened')
    current_inputs(root,v)
    require(v['sourceFiles'].get(LOADER)==verified_loader_sha(root),'Current loader source binding differs')
    historical=json.loads(safe(root,'tests/qualification/fixtures/inspector-retained-resources.json').read_text())
    for row in historical['resources'].values():
        name=HISTORICAL_CORPUS+'/'+row['path'];p=safe(root,name)
        require(v['sourceFiles'].get(name)==row['sha256'] and sha(p)==row['sha256'] and p.stat().st_size==row['bytes'],'Historical SourceS resource custody differs')
    return v

CURRENT_FIXTURE='tests/qualification/fixtures/inspector-installed-current-resources.json'
CURRENT_PROFILE='umf.inspector-installed-canonical-current-resources/1'
RAW_PATHS=('spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/extensions/tables/package.json','spec/extensions/actions/package.json','spec/extensions/binding/package.json','spec/extensions/binding-stable/package.json')

REQUIRED_SOURCE+=RAW_PATHS+(CURRENT_FIXTURE,'tests/qualification/fixtures/inspector-retained-resources.json','python/pyproject.toml','python/src/umf/__init__.py','tools/verify_python_artifacts.py')

CANDIDATE_VERSION='0.10.11'
CANDIDATE_FIXTURE='tests/qualification/fixtures/inspector-installed-candidate-01011-resources.json'
CANDIDATE_PROFILE='umf.inspector-installed-canonical-candidate-resources/1'
GEN1_WORKFLOW='.github/workflows/merged-source-generation.yml'
GEN1_MANIFEST='spec/metamodel/generated/manifest.json'
GEN1_OUTPUT_RECEIPT='tests/qualification/fixtures/inspector-gen1-01011/output-receipt.json'
GEN1_ATTESTATION='tests/qualification/fixtures/inspector-gen1-01011/final-attestation.json'
GEN1_MEMBER_PINS=((GEN1_MANIFEST,'outputManifestSHA256'),
                  (GEN1_OUTPUT_RECEIPT,'correspondenceReceiptSHA256'),
                  (GEN1_ATTESTATION,'finalAttestationSHA256'))
GEN1_FIELDS=('sourceCommit','sourceTree','workflowPath','workflowSHA256',
             'runId','attempt','jobId','artifactId','artifactDigest',
             'outputManifestSHA256','correspondenceReceiptSHA256',
             'finalAttestationSHA256','compilerSHA256','compilerBinarySHA256')

# Populated only after independent custody review of an actual selected GEN1.
CANDIDATE_ADMISSION={'fixtureSHA256': '7a9bf968200e07d0a41c2cab20a7717e4e61110394acda0863865a1d73180d18',
 'generation': {'sourceCommit': '2fa8290ef73ce80a3419714f70966770515d7fa5',
                'sourceTree': 'eddda4d6a93ac0ba4e93ec3c235d5667c0908162',
                'workflowPath': '.github/workflows/merged-source-generation.yml',
                'workflowSHA256': 'b54068851dfdbeb6d35aaf528154b0e4d915376d5a026f45cfff2f4416e9ca1f',
                'runId': '42990548950',
                'attempt': '1',
                'jobId': '130422101621',
                'artifactId': '13840858429',
                'artifactDigest': '43e4565d9dacb1b94880e9dc0da5a5bc3516cc6b019ab0369a7140f4a253af4d',
                'outputManifestSHA256': 'ba8ad73323bd5752a50546d7c33db5f2ab1e7f4d101f7eb8e62abc907806e1bd',
                'correspondenceReceiptSHA256': 'cfea75db4faa58f5d9ce3aec9c13a19d1209e79991e0d54a36c78fa8261fc177',
                'finalAttestationSHA256': '5e2df00ed960161e3499d5741ba4f1ee31df22d8a124aa85272c5273f81184f5',
                'compilerSHA256': 'bb76e81d148381e9d21da69db98a6723f656269dfedb3ef48fb5daa4847795c9',
                'compilerBinarySHA256': 'e4fcd0dca64be724fcd95fdec10f0d6c5bdc6e53e431b29a1685012a8f38075d'}}

def candidate_generation(root,selected,binding,value):
    admission=CANDIDATE_ADMISSION
    closed(admission,('fixtureSHA256','generation'))
    generation=value['generation']
    closed(generation,GEN1_FIELDS)
    require(admission['fixtureSHA256']==binding['fixtureSHA256']
            and admission['generation']==generation,'Selected GEN1 admission differs')
    for key in ('sourceCommit','sourceTree'):
        require(type(generation[key])is str and re.fullmatch('[a-f0-9]{40}',generation[key]),
                'GEN1 source commit/tree differs')
    for key in ('runId','attempt','jobId','artifactId'):
        require(type(generation[key])is str and re.fullmatch('[1-9][0-9]*',generation[key]),
                'GEN1 Actions identity differs: '+key)
    require(generation['workflowPath']==GEN1_WORKFLOW,'Selected GEN1 workflow differs')
    for key in ('workflowSHA256','artifactDigest','compilerSHA256','compilerBinarySHA256',
                *(key for _,key in GEN1_MEMBER_PINS)):
        hexsha(generation[key])
    require(sha(safe(root,GEN1_WORKFLOW))==generation['workflowSHA256']
            and selected['sourceFiles'].get(GEN1_WORKFLOW)==generation['workflowSHA256'],
            'Selected GEN1 workflow source custody differs')
    require(len({generation[key] for _,key in GEN1_MEMBER_PINS})==3,
            'GEN1 producer artifact roles must be distinct')
    members=[]
    for path,key in GEN1_MEMBER_PINS:
        raw=safe(root,path).read_bytes()
        require(digest(raw)==generation[key] and selected['sourceFiles'].get(path)==generation[key],
                'GEN1 producer member custody differs: '+path)
        members.append((raw,json.loads(raw)))
    (manifest_bytes,manifest),(_,receipt),(_,attestation)=members
    closed(receipt,('profile','outputs'))
    require(receipt['profile']=='umf.gen1.g0-source-output/1' and type(receipt['outputs'])is dict,
            'Raw GEN1 output receipt required')
    literal=value['literalData']
    for path,length,expected in (
            (GEN1_MANIFEST,len(manifest_bytes),generation['outputManifestSHA256']),
            (literal['path'],safe(root,literal['path']).stat().st_size,literal['sha256'])):
        require(receipt['outputs'].get(path)=={'bytes':length,'sha256':expected},
                'Raw GEN1 output receipt source correspondence differs: '+path)
    model=value['candidateModelSHA256']
    hexsha(model)
    require(selected.get('modelSHA256')==model,'Candidate reviewed model binding differs')
    require(type(manifest)is dict and manifest.get('profile')=='umf.metamodel.outputs/1'
            and manifest.get('provenance')=={'modelSha256':model,'compilerSha256':generation['compilerSHA256']},
            'Final GEN1 manifest identity differs')
    closed(attestation,('profile','modelSha256','compilerSha256','sourceAttestation',
                        'executable','compilerArtifact','portableOutputs'))
    require(attestation['profile']=='umf.metamodel.compile/1' and attestation['modelSha256']==model
            and attestation['compilerSha256']==generation['compilerSHA256'],
            'Final GEN1 attestation identity differs')
    source=attestation['sourceAttestation']
    closed(source,('sources','binarySha256'))
    require(type(source['sources'])is dict and bool(source['sources'])
            and source['binarySha256']==generation['compilerBinarySHA256'],
            'Final GEN1 attested compiler differs')
    executable=attestation['compilerArtifact']
    closed(executable,('path','bytes','sha256'))
    require(executable['path']=='compiler-evidence/umf-metamodel-cli'
            and type(executable['bytes'])is int and executable['bytes']>0
            and executable['sha256']==generation['compilerBinarySHA256'],
            'Final GEN1 staged compiler differs')
    runner_executable=attestation['executable']
    closed(runner_executable,('path','bytes','sha256'))
    require(type(runner_executable['path'])is str and Path(runner_executable['path']).is_absolute()
            and runner_executable['bytes']==executable['bytes']
            and runner_executable['sha256']==executable['sha256'],
            'Final GEN1 runner/staged compiler identity differs')
    portable=attestation['portableOutputs']
    require(type(portable)is dict and bool(portable) and type(manifest.get('outputs'))is dict
            and all(type(manifest['outputs'].get(path))is dict
                    and manifest['outputs'][path].get('sha256')==expected
                    for path,expected in portable.items()),'Final GEN1 portable outputs differ')
    return generation

def current_inputs(root,selected):
    """Authenticated PRIVATE assembly inputs. No caller version or legacy alias."""
    binding=selected.get('currentInputs')
    require(type(binding)is dict,'Current input bindings pending')
    closed(binding,('fixturePath','fixtureSHA256','metadataVersion'))
    fixture=binding['fixturePath']
    candidate=fixture==CANDIDATE_FIXTURE
    require(candidate or fixture==CURRENT_FIXTURE,'Unknown fixed current-input fixture')
    if candidate:
        require(CANDIDATE_ADMISSION is not None,'Candidate GEN1 admission pending')
    hexsha(binding['fixtureSHA256'])
    require(selected['sourceFiles'].get(fixture)==binding['fixtureSHA256']
            and sha(safe(root,fixture))==binding['fixtureSHA256'],'Current fixture source custody differs')
    value=json.loads(safe(root,fixture).read_text())
    fields=('profile','inputProfile','maximumWork','baseline','historicalFixture','resources',
            'encodingOnlyProducer','literalData','acceptance')
    version=binding['metadataVersion']
    if candidate:
        closed(value,fields+('candidateArtifactVersion','bindingStatus','generation','candidateModelSHA256'))
        require(value['profile']==CANDIDATE_PROFILE and value['bindingStatus']=='source-bound'
                and version==value['candidateArtifactVersion']==CANDIDATE_VERSION,'Candidate fixture/version differs')
    else:
        closed(value,fields)
        require(value['profile']==CURRENT_PROFILE and version=='0.10.9','Inherited fixture/version differs')
    require(value['inputProfile']==INPUT and type(value['maximumWork'])is int
            and value['maximumWork']==LIMIT,'Current fixture profile/allowance differs')
    baseline=value['baseline']
    closed(baseline,('mainCommit','mainTree','inheritedCoreDistributionVersion','scope'))
    for key in ('mainCommit','mainTree'):
        require(type(baseline[key])is str and re.fullmatch('[a-f0-9]{40}',baseline[key]) is not None,
                'Current baseline identity missing')
    require(baseline['inheritedCoreDistributionVersion']=='0.10.9','Exact inherited private metadata differs')
    if candidate:
        require(baseline['mainCommit']=='97ac05f17bc159d67c8eab931d3e0d66c85ee8f0'
                and baseline['mainTree']=='ad128d5c2c910464befbee820739f6e97a5d64b7',
                'Candidate baseline identity differs')
    import tomllib
    for name in ('python/pyproject.toml','python/src/umf/__init__.py'):
        require(name in selected['sourceFiles'] and sha(safe(root,name))==selected['sourceFiles'][name],'Metadata source pin differs')
    project=tomllib.loads(safe(root,'python/pyproject.toml').read_text())
    require(project['project']['name']=='umf-core' and project['project']['version']==version,'Assembled pyproject metadata differs')
    assignments=[n.value.value for n in ast.parse(safe(root,'python/src/umf/__init__.py').read_bytes()).body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='__version__' for t in n.targets) and isinstance(n.value,ast.Constant)]
    require(assignments==[version],'Assembled package metadata differs')
    historical=value['historicalFixture'];closed(historical,('path','sha256','sourceS','scope'))
    require(historical['path']=='tests/qualification/fixtures/inspector-retained-resources.json' and historical['sha256']==PINS_SHA and sha(safe(root,historical['path']))==PINS_SHA and historical['sourceS']=='e3f38ef6f05ae636d2837f9d69f8d6805222664b','Original historical fixture changed/relabelled')
    closed(value['resources'],NAMES)
    for name,path in zip(NAMES,RAW_PATHS):
        row=value['resources'][name];closed(row,('path','bytes','sha256'))
        require(row['path']==path and type(row['bytes'])is int and 0<row['bytes']<=2**53-1,'Current raw9 role/path/length differs')
        raw=safe(root,path).read_bytes();hexsha(row['sha256'])
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'] and selected['sourceFiles'].get(path)==row['sha256'],'Current raw9 source custody differs: '+name)
    for key,path in (('encodingOnlyProducer','tools/generate_codegen_resource_literals.py'),('literalData','crates/umf-core/src/canonical_codegen_literals.rs')):
        row=value[key];closed(row,('path','sha256'));hexsha(row['sha256'])
        require(row['path']==path and sha(safe(root,path))==row['sha256'] and selected['sourceFiles'].get(path)==row['sha256'],'Current DATA/producer source differs')
    if candidate:
        generation=candidate_generation(root,selected,binding,value)
        return value,{'resourceFixture':fixture,'resourceFixtureSHA256':binding['fixtureSHA256'],
                      'candidateArtifactVersion':version,'literalDataSHA256':value['literalData']['sha256'],
                      'generation':generation,'scope':'private-candidate-component-only-not-release-proof'}
    return value,{'resourceFixture':CURRENT_FIXTURE,'resourceFixtureSHA256':binding['fixtureSHA256'],'inheritedPrivateMetadataVersion':version,'literalDataSHA256':value['literalData']['sha256'],'scope':'private-component-only-not-release-proof'}

def input_metadata_version(identity):
    require(type(identity)is dict,'Current input identity missing')
    common={'resourceFixture','resourceFixtureSHA256','literalDataSHA256','scope'}
    if set(identity)==common|{'inheritedPrivateMetadataVersion'}:
        require(identity['resourceFixture']==CURRENT_FIXTURE
                and identity['inheritedPrivateMetadataVersion']=='0.10.9'
                and identity['scope']=='private-component-only-not-release-proof','Inherited metadata authority differs')
        return identity['inheritedPrivateMetadataVersion']
    closed(identity,common|{'candidateArtifactVersion','generation'})
    require(identity['resourceFixture']==CANDIDATE_FIXTURE
            and identity['candidateArtifactVersion']==CANDIDATE_VERSION
            and identity['scope']=='private-candidate-component-only-not-release-proof'
            and CANDIDATE_ADMISSION is not None
            and identity['resourceFixtureSHA256']==CANDIDATE_ADMISSION['fixtureSHA256']
            and identity['generation']==CANDIDATE_ADMISSION['generation'],'Candidate metadata authority differs')
    return identity['candidateArtifactVersion']

def installed_wheel(wheel,dist,version):
    """Version-aware archive/full RECORD/installed bytes; strict verifier remains.

    This supplements the unchanged strict verifier and generated pip metadata
    checks. It never invokes a compiler or reconstructs package/source bytes.
    """
    import base64,csv,io,zipfile,email.parser
    require(dist.version==version,'Installed distribution metadata differs')
    expected_info='umf_core-'+version+'.dist-info';rows=[]
    with zipfile.ZipFile(wheel) as archive:
        names=archive.namelist();require(len(names)==len(set(names)),'Duplicate wheel members')
        roots={n.split('/',1)[0] for n in names if '.dist-info/' in n};require(roots=={expected_info},'Wheel dist-info metadata identity differs')
        metadata=email.parser.BytesParser().parsebytes(archive.read(expected_info+'/METADATA'))
        require(metadata['Name']=='umf-core' and metadata['Version']==version,'Wheel METADATA differs')
        for info in archive.infolist():
            name=info.filename
            require(not name.startswith('/') and '..' not in Path(name).parts and (info.external_attr>>16)&0o170000!=0o120000,'Unsafe wheel member')
            raw=archive.read(name);rows.append({'name':name,'bytes':len(raw),'sha256':digest(raw)})
            if name.startswith('umf/') or name.startswith(expected_info+'/') and not name.endswith('/RECORD'):
                actual=Path(dist.locate_file(name));require(actual.is_file() and not actual.is_symlink() and actual.read_bytes()==raw,'Installed wheel member differs: '+name)
        record=expected_info+'/RECORD';entries=list(csv.reader(io.StringIO(archive.read(record).decode())))
        require(len(entries)==len(names) and {r[0] for r in entries}==set(names),'Incomplete/duplicate wheel RECORD')
        for row in entries:
            require(len(row)==3,'Malformed wheel RECORD')
            name,checksum,size=row
            if name==record:require(checksum==size=='','RECORD self row differs');continue
            raw=archive.read(name);expected='sha256='+base64.urlsafe_b64encode(hashlib.sha256(raw).digest()).rstrip(b'=').decode()
            require(checksum==expected and size==str(len(raw)),'Wheel RECORD member differs')
    return rows

def expected_manifest(pins):
    return {'profile':'umf.codegen.installed-source-manifest/1','inputProfile':INPUT,
            'resources':[{'name':n,**pins['resources'][n]} for n in NAMES]}

def manifest(value,expected):
    closed(value,('profile','inputProfile','resources'))
    require(value['profile']==expected['profile'] and value['inputProfile']==INPUT and type(value['resources'])is list and len(value['resources'])==9,'Factory manifest profile/roster differs')
    for row,want in zip(value['resources'],expected['resources']):
        closed(row,('name','path','bytes','sha256'))
        size=row['bytes'];expected_size=want['bytes']
        # Actual _from_wire transports native Value::Number as Python float.
        # Preserve that shape: no int() conversion or provenance normalization.
        require(type(expected_size)is int and 0<expected_size<=2**53-1,'Expected raw source byte identity invalid')
        require(type(size)is float and math.isfinite(size) and size.is_integer() and 0<size<=2**53-1 and size==expected_size,'Native manifest bytes float shape/identity differs')
        hexsha(row['sha256']);require(row==want,'Paid handle manifest source/order differs')
    return digest(canonical(value))

class _ConstructorPhaseObservation:
    """Fixed native phase buckets for one constructor; no event or stack log."""
    PHASES=('native-installed-materialization','native-installed-full-admission',
            'native-core-copy','native-resource-compilation','native-schema-compilation',
            'native-schema-validation','native-result-envelope')
    MAX_CALLS=(1<<32)-1
    MAX_AMOUNT=2*sys.maxsize+1

    def __init__(self):
        self.totals={phase:[0,0,0] for phase in (*self.PHASES,None)}
        self.calls=0
        self.incomplete=False
        self.denied=None

    def record(self,args,kwargs,returned):
        amount=args[0] if args else kwargs.get('amount')
        phase=args[1] if len(args)>1 else kwargs.get('phase')
        phase=phase if type(phase) is str and phase in self.PHASES else None
        if (type(amount) is not int or not 0<=amount<=self.MAX_AMOUNT
                or self.calls>=self.MAX_CALLS):
            self.incomplete=True
            return
        self.calls+=1
        bucket=self.totals[phase]
        bucket[0]+=1;bucket[1]+=amount
        if returned:
            bucket[2]+=amount
        elif self.denied is None:
            self.denied={'phase':phase,'amount':amount,'nativeCallback':self.calls}

    def retain_failure(self,output,identity,case,carrier,row):
        phases=[{'phase':phase,'calls':n,'attemptedWork':a,'returnedWork':r}
                for phase,(n,a,r) in self.totals.items() if n]
        receipt={'profile':'umf.private-installed-constructor-phase-failure/1',
                 **identity,'case':case,'carrier':carrier,'maximumWork':LIMIT,
                 'constructorAttemptedWork':row['attemptedWork'],
                 'constructorReturnedWork':row['returnedWork'],
                 'nativeObservationIncomplete':self.incomplete,
                 'nativePhases':phases,'firstNativeRefusal':self.denied}
        body=json.dumps(receipt,indent=2)+'\n'
        with output.with_name('constructor-phase-failure.json').open('x') as f:
            f.write(body)


class _ObservedConstructorControl:
    def __init__(self,delegate,observation):
        self.delegate=delegate
        self.observation=observation

    @property
    def failure(self):
        # The native bridge reads this exact original exception on denial.
        return self.delegate.failure

    def _observe(self,args,kwargs,returned):
        try:self.observation.record(args,kwargs,returned)
        except BaseException:self.observation.incomplete=True

    def __call__(self,*args,**kwargs):
        try:result=self.delegate(*args,**kwargs)
        except BaseException:
            self._observe(args,kwargs,False)
            raise
        self._observe(args,kwargs,result is None)
        return result


class WorkObserver:
    """Pass-through actual _host_work; no patched allowance/native return value."""
    def __init__(self,compiler,*,observe_constructor_phase=False):
        self.compiler=compiler;self.current=None
        self.observe_constructor_phase=observe_constructor_phase

    def construct(self,factory,output,identity,case,carrier):
        if not self.observe_constructor_phase:
            return factory(max_work=LIMIT)
        try:
            original=self.compiler._native_control
            observation=_ConstructorPhaseObservation()
        except BaseException:
            return factory(max_work=LIMIT)
        if not callable(original):
            return factory(max_work=LIMIT)

        def native_control(*args,**kwargs):
            delegate=original(*args,**kwargs)
            try:return _ObservedConstructorControl(delegate,observation)
            except BaseException:
                observation.incomplete=True
                return delegate

        self.compiler._native_control=native_control
        try:
            return factory(max_work=LIMIT)
        except BaseException:
            try:observation.retain_failure(output,identity,case,carrier,self.current)
            except BaseException:pass
            raise
        finally:
            self.compiler._native_control=original

    def __enter__(self):
        self.original=self.compiler._host_work
        def host_work(maximum,*controls):
            require(maximum==LIMIT and self.current is not None and not self.current['workCreated'],'One original1M work lifetime required')
            row=self.current;row['workCreated']=True;delegate=self.original(maximum,*controls)
            def work(amount):
                require(type(amount)is int and amount>=0,'Invalid work amount');row['attemptedWork']+=amount
                result=delegate(amount);row['returnedWork']+=amount;return result
            return work
        self.compiler._host_work=host_work;return self
    def __exit__(self,*args):self.compiler._host_work=self.original
    def begin(self):
        self.current={'maximumWork':LIMIT,'attemptedWork':0,'returnedWork':0,'workCreated':False,'completed':False};return self.current
    def complete(self):
        require(self.current['workCreated'] and self.current['returnedWork']<=LIMIT,'Missing/over-budget actual lifetime');self.current['completed']=True

def probe(engine_type,cases,expected,output,identity,observer):
    require(type(cases)is list and len(cases)==17 and len({r['id'] for r in cases})==17,'Exact17 original vectors required')
    value={'profile':PROFILE,'inputProfile':INPUT,**identity,'maximumWork':LIMIT,'status':'partial','pairs':[],
           'requestCustodyPreserved':False,'installedFilesUnchanged':False,'publishable':False,'readyForEnrollment':False}
    def save():output.write_text(json.dumps(value,indent=2)+'\n')
    previous=None;save()
    try:
        for case in cases:
            for carrier in ('dispatcher','list','tuple'):
                row={'case':case['id'],'carrier':carrier,'constructor':observer.begin()};value['pairs'].append(row);save()
                engine=observer.construct(engine_type.from_installed,output,identity,case['id'],carrier)
                require(previous is None or previous() is not engine,'Warm engine substituted for fresh factory');previous=weakref.ref(engine)
                observer.complete();request=json.loads(json.dumps(case['request'],ensure_ascii=True));before=canonical(request)
                row['call']=observer.begin();save()
                if carrier=='dispatcher':actual=engine.call('inspectAccessViews',request);require(actual=={'ok':True,'result':case['expected']},'Factory dispatcher oracle differs')
                else:
                    bindings=list(request.get('bindings',())) if carrier=='list' else tuple(request.get('bindings',()))
                    actual=engine.inspect_access_views(request['document'],request['selected'],bindings,request.get('sourceId','logical'));require(actual==case['expected'],'Factory facade oracle differs')
                require(canonical(request)==before,'Factory request mutated');observer.complete();row['resultSHA256']=digest(canonical(actual))
                # Paid manifest AFTER cold call. Never a warm setup for that call.
                row['manifest']=observer.begin();save();report=engine.resource_source_manifest();row['manifestSHA256']=manifest(report,expected);row['sourceManifest']=json.loads(json.dumps(report));observer.complete()
                actual.clear();report.clear();row['completed']=True;save()
                # Release completed engine. weakref is an observation only, never
                # pointer/hash capability or proof of native semantic validity.
                del engine
        value.update(status='cost-complete',inspectionCases=17,inspectionCalls=51,freshConstructors=51,requestCustodyPreserved=True)
        save();return value
    except BaseException as error:
        value['status']='resource-limited' if getattr(error,'code',None)=='RESOURCE_LIMIT' else 'failed'
        value['failure']={'type':type(error).__name__,'code':getattr(error,'code',None),'message':str(error)[:1024]};save();raise

def complete(report,source,wheel,expected,pairs):
    require(report.get('profile')==PROFILE and report.get('inputProfile')==INPUT and report.get('status')=='cost-complete' and report.get('actualCandidateSource')==source and report.get('wheelSHA256')==wheel,'Complete installed factory identity differs')
    for k,n in [('maximumWork',LIMIT),('inspectionCases',17),('inspectionCalls',51),('freshConstructors',51)]:require(type(report.get(k))is int and report[k]==n,'Factory complete count/type differs')
    require(report.get('requestCustodyPreserved')is True and report.get('installedFilesUnchanged')is True and report.get('publishable')is False and report.get('readyForEnrollment')is False,'Factory completion/custody flags differ')
    rows=report.get('pairs');require(type(rows)is list and len(rows)==51 and [(r.get('case'),r.get('carrier')) for r in rows]==[(p[0],p[1]) for p in pairs],'Original cold pair order/census differs')
    for row,pair in zip(rows,pairs):
        require(row.get('resultSHA256')==pair[2],'Original complete result digest differs')
        require(row.get('completed')is True and row.get('manifestSHA256')==manifest(row.get('sourceManifest'),expected),'Incomplete factory pair/manifest');hexsha(row.get('resultSHA256'))
        for stage in ('constructor','call','manifest'):
            life=row.get(stage);require(type(life)is dict and life.get('completed')is True and life.get('workCreated')is True and type(life.get('maximumWork'))is int and life['maximumWork']==LIMIT and type(life.get('returnedWork'))is int and type(life.get('attemptedWork'))is int and 0<=life['returnedWork']==life['attemptedWork']<=LIMIT,'Incomplete/split/budget lifetime')

def junit(path,selectors):
    import xml.etree.ElementTree as ET
    require(type(selectors)is list and bool(selectors) and len(selectors)==len(set(selectors)),'Exact nonempty named controls required')
    expected=[]
    for selector in selectors:
        file,*parts=selector.split('::');require(len(parts) in (1,2),'Whole class/wildcard controls refused')
        expected.append(('.'.join([file.removesuffix('.py').replace('/','.'),*parts[:-1]]),parts[-1]))
    cases=list(ET.parse(path).getroot().iter('testcase'))
    actual=[(c.get('classname'),c.get('name')) for c in cases]
    require(len(actual)==len(set(actual)) and set(actual)==set(expected) and not any(c.find(k)is not None for c in cases for k in ('failure','error','skipped')),'Exact named control XML differs/failed/skipped')
    return True

def run(args):
    root=args.root.resolve();require(sys.flags.isolated and sys.dont_write_bytecode,'Isolated -I -B required')
    require(platform.python_version()=='3.11.17' and platform.system()=='Linux' and platform.machine()=='x86_64','Only selected hosted Linux311')
    require(subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==args.source_sha and not subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=root),'Exact immutable source required')
    census=json.loads((root/CENSUS).read_text());selected=selection(root,census)
    require(sha(root/CORPUS)==CORPUS_SHA,'Original public oracle changed')
    pins,input_identity=current_inputs(root,selected)
    require(args.resource_pins_sha256==input_identity['resourceFixtureSHA256'],'CLI current fixture binding differs')
    producer=json.loads(args.producer_pins.read_text())
    require(producer.get('currentInputIdentity')==input_identity,'Probe producer/current input differs')
    from importlib import metadata
    import sysconfig
    import umf
    import umf._rust as wire
    import umf.rust_codegen as compiler
    import umf._rust_core as native
    dist=metadata.distribution('umf-core');version=input_metadata_version(input_identity);installed_wheel(args.wheel,dist,version)
    package=Path(compiler.__file__).resolve().parent
    require(dist.version==version and umf.__version__==version and native.engine_version()=='umf-core-r2' and native.codegen_protocol_version()=='umf-codegen-r3-seven-ops-nine-resources/1','Inherited private wheel version/protocol differs')
    base=Path(sysconfig.get_path('platlib')).resolve()
    for name,path in {'umf/__init__.py':Path(umf.__file__),'umf/rust_codegen.py':Path(compiler.__file__),'umf/_rust.py':Path(wire.__file__),'umf/_rust_core.abi3.so':Path(native.__file__)}.items():
        require(not path.is_symlink() and path.resolve().is_relative_to(base) and path.resolve()==Path(dist.locate_file(name)).resolve(),'Installed factory loaded owner differs: '+name)
    require(sha(Path(native.__file__))==json.loads(args.producer_pins.read_text())['nativeMember']['sha256'],'Loaded factory native differs')
    for n,row in pins['resources'].items():
        raw=package/'action_runtime_resources'/(n+'.json');require(raw.is_file() and not raw.is_symlink() and raw.stat().st_size==row['bytes'] and sha(raw)==row['sha256'],'Installed raw9 differs')
    before={p.relative_to(package).as_posix():sha(p) for p in package.rglob('*') if p.is_file()}
    with WorkObserver(compiler,observe_constructor_phase=version==CANDIDATE_VERSION) as observer:
        value=probe(compiler.CodegenEngine,json.loads((root/CORPUS).read_text())['cases'],expected_manifest(pins),args.output,
          {'actualCandidateSource':args.source_sha,'wheelSHA256':sha(args.wheel),'nativeSHA256':sha(Path(native.__file__)),'closureSHA256':selected['closureSHA256'],'currentInputIdentity':input_identity},observer)
    installed_wheel(args.wheel,dist,version)
    require(before=={p.relative_to(package).as_posix():sha(p) for p in package.rglob('*') if p.is_file()},'Factory installed files changed')
    value['installedFilesUnchanged']=True;args.output.write_text(json.dumps(value,indent=2)+'\n')
    complete(value,args.source_sha,sha(args.wheel),expected_manifest(pins),[(r['id'],c,digest(canonical({'ok':True,'result':r['expected']} if c=='dispatcher' else r['expected']))) for r in json.loads((root/CORPUS).read_text())['cases'] for c in ('dispatcher','list','tuple')]);return 0

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for n in ('root','wheel','output','producer-pins'):p.add_argument('--'+n,type=Path,required=True)
    p.add_argument('--source-sha',required=True);p.add_argument('--resource-pins-sha256',required=True)
    a=p.parse_args();raise SystemExit(run(a))
