#!/usr/bin/env python3
"""Validate already-published release archives before a PyPI OIDC upload."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from email.parser import BytesParser
from pathlib import Path
from typing import Any

SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
TAG = re.compile(r"(?:umf|python)-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
QUALIFIED_CORE_VERSIONS = frozenset({"0.10.2", "0.10.7", "0.10.8", "0.10.9"})


class ReleaseError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ReleaseError(message)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_sums(data: bytes) -> dict[str, str]:
    try:
        lines = data.decode("ascii").splitlines()
    except UnicodeDecodeError as exc:
        raise ReleaseError("SHA256SUMS is not ASCII") from exc
    result: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9_.+-]+)", line)
        _require(match is not None, "SHA256SUMS has a malformed entry")
        assert match is not None
        digest, filename = match.groups()
        _require(filename not in result, "SHA256SUMS has duplicate filenames")
        result[filename] = digest
    _require(bool(result), "SHA256SUMS is empty")
    return result


def _metadata(raw: bytes, distribution: str, version: str) -> None:
    message = BytesParser().parsebytes(raw)
    _require(
        message.get("Name") == distribution,
        "archive metadata distribution name differs",
    )
    _require(message.get("Version") == version, "archive metadata version differs")
    _require(
        not any("@" in item for item in message.get_all("Requires-Dist", [])),
        "archive metadata contains a direct URL dependency",
    )


def validate_archive(path: Path, distribution: str, version: str) -> None:
    if path.name.endswith(".whl"):
        platform_tags = path.name[:-4].rsplit("-", 1)[-1].split(".")
        _require(
            all(
                re.fullmatch(
                    r"(?:any|manylinux_[A-Za-z0-9_]+|manylinux[0-9]+_[A-Za-z0-9_]+|musllinux_[A-Za-z0-9_]+|macosx_[A-Za-z0-9_]+|win32|win_amd64|win_arm64)",
                    tag,
                )
                for tag in platform_tags
            ),
            "wheel platform is not accepted by PyPI; qualify genuine portable wheel bytes before publication",
        )
    if path.name.endswith(".whl"):
        try:
            with zipfile.ZipFile(path) as archive:
                names = [
                    name
                    for name in archive.namelist()
                    if name.endswith(".dist-info/METADATA")
                ]
                _require(
                    len(names) == 1, "wheel must contain exactly one METADATA file"
                )
                _metadata(archive.read(names[0]), distribution, version)
        except (OSError, zipfile.BadZipFile) as exc:
            raise ReleaseError("wheel archive is invalid") from exc
    elif path.name.endswith(".tar.gz"):
        try:
            with tarfile.open(path, "r:gz") as archive:
                members = [
                    item
                    for item in archive.getmembers()
                    if item.isfile() and item.name.endswith("/PKG-INFO")
                ]
                _require(
                    len(members) == 1, "sdist must contain exactly one PKG-INFO file"
                )
                stream = archive.extractfile(members[0])
                _require(stream is not None, "sdist PKG-INFO cannot be read")
                assert stream is not None
                _metadata(stream.read(), distribution, version)
        except (OSError, tarfile.TarError) as exc:
            raise ReleaseError("source archive is invalid") from exc
    else:
        raise ReleaseError("unsupported distribution archive")


def resolve_tag_commit(
    ref: dict[str, Any], annotated: dict[str, Any] | None, expected_tag: str
) -> str:
    _require(
        ref.get("ref") == f"refs/tags/{expected_tag}", "tag reference is malformed"
    )
    obj = ref.get("object")
    _require(isinstance(obj, dict), "tag reference object is missing")
    sha = obj.get("sha")
    kind = obj.get("type")
    _require(
        isinstance(sha, str) and COMMIT.fullmatch(sha) is not None,
        "tag object SHA is invalid",
    )
    if kind == "commit":
        _require(
            annotated is None, "lightweight tag unexpectedly has an annotated object"
        )
        return sha
    _require(
        kind == "tag" and isinstance(annotated, dict), "annotated tag object is missing"
    )
    assert isinstance(annotated, dict)
    _require(annotated.get("sha") == sha, "annotated tag object identity differs")
    target = annotated.get("object")
    _require(
        isinstance(target, dict) and target.get("type") == "commit",
        "tag target is not a commit",
    )
    assert isinstance(target, dict)
    target_sha = target.get("sha")
    _require(
        isinstance(target_sha, str) and COMMIT.fullmatch(target_sha) is not None,
        "tag target SHA is invalid",
    )
    return target_sha


# PARKED source route. Original qualified versions and historical S profiles stay
# immutable. No actual 0.10.10 admission or owner-validator mapping is minted here.
CANDIDATE01010_ADMISSIONS = {
    'umf-core': '.github/release-admissions/umf-core-0.10.10.json',
    'umf-codegen': '.github/release-admissions/umf-codegen-0.10.10.json',
    'umf-access': '.github/release-admissions/access-v0.1.0.dev10-core-0.10.10.json',
}
CANDIDATE01010_SCHEMA = 'umf.closed-01010-publication-admission/1'
CANDIDATE01010_PACKAGES = {
    'umf-core': ('0.10.10', 'umf-v0.10.10', frozenset((
        'umf_core-0.10.10-cp311-abi3-manylinux_2_34_x86_64.whl',
        'umf_core-0.10.10-cp311-abi3-macosx_11_0_arm64.whl', 'umf_core-0.10.10.tar.gz'))),
    'umf-codegen': ('0.10.10', 'umf-v0.10.10', frozenset((
        'umf_codegen-0.10.10-py3-none-any.whl', 'umf_codegen-0.10.10.tar.gz'))),
    'umf-access': ('0.1.0.dev10', 'access-v0.1.0.dev10', frozenset((
        'umf_access-0.1.0.dev10-py3-none-any.whl', 'umf_access-0.1.0.dev10.tar.gz'))),
}
CANDIDATE01010_PROOFS = ('source', 'qualification', 'resources', 'native', 'installed', 'sdkBrowser')
# Deliberately absent until actual owner receipt schemas and exact validator
# source pins are reviewed. A caller cannot register code/validators via JSON.
CANDIDATE01010_VALIDATORS = {}


def _candidate_closed(value, keys, label):
    _require(type(value) is dict and set(value) == set(keys), '01010 closed ' + label + ' required')


def _candidate_hash(value, length=64):
    pattern = SHA if length == 64 else COMMIT
    _require(type(value) is str and pattern.fullmatch(value) is not None and set(value) != {'0'},
             '01010 actual nonzero source/hash pin required')


def _candidate_path(name):
    from pathlib import PurePosixPath
    _require(type(name) is str and name and '\\' not in name and not any(ord(c) < 32 for c in name),
             '01010 unsafe proof/member path')
    path = PurePosixPath(name)
    _require(not path.is_absolute() and '..' not in path.parts and str(path) == name and name != '.',
             '01010 unsafe proof/member path')
    return name


def validate_candidate01010_profile(value, distribution, source_sha, tag):
    """Closed source schema only, never semantic or publication qualification."""
    _require(distribution in CANDIDATE01010_PACKAGES, '01010 unsupported distribution')
    _candidate_closed(value, ('schema','status','source','controller','distribution','version','tag',
        'files','resources','protocols','proofs','corePublic','coreSource','releasePinsSha256'), 'candidate profile')
    _require(value['schema'] == CANDIDATE01010_SCHEMA and value['status'] in ('source-bound','qualified'),
             '01010 actual source-bound admission missing or pending')
    version, expected_tag, filenames = CANDIDATE01010_PACKAGES[distribution]
    _require((value['distribution'],value['version'],value['tag'],tag) ==
             (distribution,version,expected_tag,expected_tag), '01010 closed version/distribution/tag differs')
    _candidate_closed(value['source'], ('commit','tree'), 'source S')
    _candidate_closed(value['controller'], ('commit','tree','files'), 'controller Q')
    for identity in (value['source'], value['controller']):
        _candidate_hash(identity['commit'],40); _candidate_hash(identity['tree'],40)
    _require(value['source']['commit'] == source_sha and value['controller']['commit'] != source_sha,
             '01010 source S/controller Q confusion')
    expected_controls = {'umf-core': 'scripts/publish_core_pypi_release.py',
        'umf-codegen': 'scripts/publish_codegen_pypi_release.py',
        'umf-access': 'scripts/publish_access_pypi_release.py'}
    control_files = {'scripts/publish_core_pypi_release.py', expected_controls[distribution]}
    if distribution=='umf-codegen':
        control_files.add('scripts/publish_access_pypi_release.py')  # existing Actions reader dependency
    _candidate_closed(value['controller']['files'], control_files, 'controller source files')
    _candidate_closed(value['files'], filenames, 'original candidate archives')
    for mapping in (value['controller']['files'], value['files']):
        for name, sha in mapping.items(): _candidate_path(name); _candidate_hash(sha)
    names = ('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy',
             'tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')
    _candidate_closed(value['resources'], names, 'nine source resource identities')
    for sha in value['resources'].values(): _candidate_hash(sha)
    _require(value['protocols'] == {'semantic':'0.10.0','engine':'umf-core-r2',
             'codegen':'umf-codegen-r3-seven-ops-nine-resources/1'}, '01010 exact protocol identity differs')
    _candidate_closed(value['proofs'], CANDIDATE01010_PROOFS, 'owner proof roster')
    _candidate_hash(value['releasePinsSha256'])
    refs = list(value['proofs'].values())
    if distribution == 'umf-core':
        _require(value['corePublic'] is None and value['coreSource'] is None,
                 '01010 Core upload cannot depend on its own future publication')
    else:
        _candidate_closed(value['corePublic'], ('publication','consumer'), 'actual public Core prerequisite')
        _candidate_closed(value['coreSource'], ('commit','tree'), 'public Core source')
        _candidate_hash(value['coreSource']['commit'],40); _candidate_hash(value['coreSource']['tree'],40)
        if distribution == 'umf-codegen':
            _require(value['coreSource'] == value['source'], '01010 coupled Codegen/Core source differs')
        if distribution == 'umf-codegen':
            reader=_candidate01010_actions_reader(value)
            external={ref['file'] for ref in value['corePublic'].values()} | {reader.actions_zip_name(ref) for ref in value['corePublic'].values()}
            _require(not external.intersection(value['files']) and not external.intersection(ref['path'] for ref in refs),
                     '01010 external Actions proof/member path collision')
        else:
            refs += list(value['corePublic'].values())
    paths = set()
    for ref in refs:
        _candidate_closed(ref, ('path','sha256','validator'), 'original proof reference')
        _candidate_path(ref['path']); _candidate_hash(ref['sha256'])
        _require(type(ref['validator']) is str and ref['validator'] and ref['path'] not in paths,
                 '01010 unique named proof/validator required')
        _require(ref['path'] not in value['files'] and ref['path'] not in ('SHA256SUMS','release-pins.json','source-receipt.json'),
                 '01010 reserved proof filename')
        paths.add(ref['path'])
    return value


def load_candidate01010_profile(root, distribution, source_sha, tag, expected_hash=None):
    """Read the immutable P admission; Q and already frozen S are external pins."""
    import subprocess
    root = Path(root)
    _require(distribution in CANDIDATE01010_ADMISSIONS, '01010 unsupported distribution')
    try:
        raw = subprocess.check_output(['git','show','HEAD:' + CANDIDATE01010_ADMISSIONS[distribution]], cwd=root,
                                      stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError as error:
        raise ReleaseError('01010 actual committed candidate admission missing; source preparation only') from error
    if expected_hash is not None:
        _candidate_hash(expected_hash)
        _require(_sha(raw) == expected_hash, '01010 reviewed committed admission digest differs')
    value = validate_candidate01010_profile(json.loads(raw), distribution, source_sha, tag)
    q = value['controller']
    tree = subprocess.check_output(['git','rev-parse',q['commit']+'^{tree}'],cwd=root,text=True).strip()
    _require(tree == q['tree'], '01010 reviewed controller Q tree differs')
    source_tree = subprocess.check_output(['git','rev-parse',source_sha+'^{tree}'],cwd=root,text=True).strip()
    _require(source_tree == value['source']['tree'], '01010 already frozen source S tree differs')
    for path, expected in q['files'].items():
        original = subprocess.check_output(['git','show',q['commit']+':'+path],cwd=root)
        _require(_sha(original) == expected and _sha((root/path).read_bytes()) == expected,
                 '01010 controller Q/current caller bytes differ')
    return value


def _candidate_asset(assets, name, expected):
    _candidate_path(name)
    root = Path(assets).resolve(); path = root / name
    _require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),
             '01010 original asset absent or unsafe: ' + name)
    _require(path.stat().st_size <= 67108864, '01010 original asset exceeds existing envelope')
    raw = path.read_bytes(); _require(_sha(raw) == expected, '01010 original asset byte substitution: ' + name)
    return raw


def _candidate_archive(path, distribution, version):
    """Inspect exact original metadata/member closure; never rebuild/rename."""
    import stat
    _metadata_bytes = []
    def members(names):
        _require(len(names) == len(set(names)), '01010 duplicate archive member')
        for name in names: _candidate_path(name.rstrip('/'))
    if path.name.endswith('.whl'):
        with zipfile.ZipFile(path) as archive:
            members(archive.namelist())
            _require(all(not stat.S_ISLNK(info.external_attr >> 16) for info in archive.infolist()),
                     '01010 symlink archive member')
            selected = [name for name in archive.namelist() if name.endswith('.dist-info/METADATA')]
            _require(len(selected)==1, '01010 one original wheel metadata required')
            _metadata_bytes.append(archive.read(selected[0]))
    else:
        with tarfile.open(path,'r:gz') as archive:
            rows = archive.getmembers(); members([row.name for row in rows])
            _require(all(row.isfile() or row.isdir() for row in rows), '01010 special source archive member')
            selected = [row for row in rows if row.isfile() and row.name.count('/')==1 and row.name.endswith('/PKG-INFO')]
            _require(len(selected)==1, '01010 original top-level source metadata required')
            _metadata_bytes.append(archive.extractfile(selected[0]).read())
    from email.parser import BytesParser
    for raw in _metadata_bytes:
        _metadata(raw,distribution,version); message=BytesParser().parsebytes(raw)
        requirements=message.get_all('Requires-Dist', [])
        if distribution != 'umf-core':
            core_requirements=[item for item in requirements if re.split(r'[<>=!~ ;\[]',item.lower().replace('_','-'),1)[0]=='umf-core']
            _require(core_requirements == ['umf-core==0.10.10'], '01010 exact normal public Core dependency required')
            if distribution == 'umf-codegen':
                _require(requirements == ['umf-core==0.10.10'], '01010 Codegen Core-only dependency closure differs')
            else:
                normalized = [re.sub(r'\s+', '', item).replace(chr(34), chr(39)) for item in requirements]
                expected = {"pydantic<3,>=2.13", "typing-extensions<5,>=4.16", "umf-core==0.10.10",
                    "cryptography==50.0.2;extra=='owner-authority'", "pglast==7.20;extra=='sql-containment'"}
                _require(len(normalized)==len(set(normalized)) and set(normalized)==expected,
                         '01010 exact Access declared dependency/extra closure differs')


def _candidate01010_actions_reader(value):
    """Bind the EXISTING original Actions reader to a distinct closed profile.

    Load an isolated module instance: never mutate the active 0.10.8 reader or
    its immutable constants. load_candidate01010_profile already authenticates
    this exact Codegen helper in Q's source-controlled file-hash roster.
    """
    import importlib.util
    _require(value['distribution']=='umf-codegen', '01010 external Core Actions route is Codegen-only')
    path=Path(__file__).with_name('publish_codegen_pypi_release.py')
    for relative in ('scripts/publish_codegen_pypi_release.py','scripts/publish_access_pypi_release.py'):
        actual=Path(__file__).resolve().parents[1]/relative
        expected=value['controller']['files'].get(relative)
        _candidate_hash(expected)
        _require(actual.is_file() and not actual.is_symlink() and _sha(actual.read_bytes())==expected,
                 '01010 original Actions reader source/controller hash differs')
    spec=importlib.util.spec_from_file_location('_closed_01010_original_actions_reader',path)
    reader=importlib.util.module_from_spec(spec); spec.loader.exec_module(reader)
    reader.SOURCE=value['coreSource']['commit']; reader.TREE=value['coreSource']['tree']
    reader.TAG='umf-v0.10.10'; reader.VERSION='0.10.10'
    reader.CORE_SCOPES={
        'publication':('publish','umf-core-pypi-publication-0.10.10','publication-receipt.json'),
        'consumer':('installed-consumer','umf-core-pypi-consumer-0.10.10','consumer-receipt.json')}
    public=value['corePublic']; reader.actions_pair({'core':public})
    for ref in public.values():
        _candidate_hash(ref['sha256']); _candidate_hash(ref['actions']['controller_sha'],40)
        for key in ('workflow_sha256','artifact_sha256'): _candidate_hash(ref['actions'][key])
    assertions=public['publication']['assertions']
    required={'/schema':'pypi-publication-receipt.v1','/status':'passed','/registry':'pypi',
        '/registry_bytes_verified':True,'/distribution':'umf-core','/version':'0.10.10',
        '/source_sha':reader.SOURCE,'/tag':reader.TAG}
    _require(type(assertions) is dict and all(type(assertions.get(k)) is type(v) and assertions[k]==v
             for k,v in required.items()), '01010 external original publication assertions differ')
    files=assertions.get('/files')
    _candidate_closed(files,CANDIDATE01010_PACKAGES['umf-core'][2],'published Core archive identity')
    for digest in files.values(): _candidate_hash(digest)
    expected=dict(reader.CORE_CONSUMER_REQUIRED)
    expected.update({'/umf_core_version':'0.10.10','/source_sha':reader.SOURCE,
                     '/nativeResourceInspection/sourceS':reader.SOURCE})
    supplied=public['consumer']['assertions']
    _require(type(supplied) is dict, '01010 external deep public consumer assertions required')
    for key in ('wheelSHA256','nativeSHA256','resourceManifestSHA256'):
        pointer='/nativeResourceInspection/'+key
        _candidate_hash(supplied.get(pointer)); expected[pointer]=supplied[pointer]
    linux='umf_core-0.10.10-cp311-abi3-manylinux_2_34_x86_64.whl'
    _require(expected['/nativeResourceInspection/wheelSHA256']==files[linux],
             '01010 external public consumer Core wheel differs')
    _require(all(type(supplied.get(k)) is type(v) and supplied[k]==v for k,v in expected.items()),
             '01010 external original deep consumer assertions differ')
    reader.CORE_CONSUMER_REQUIRED=expected
    return reader


def _candidate01010_external_core_proofs(value, assets, sums, sums_sha256):
    """Authenticate later proofs independently of the immutable release roster."""
    reader=_candidate01010_actions_reader(value); public=value['corePublic']; result={}
    external={ref['file'] for ref in public.values()} | {reader.actions_zip_name(ref) for ref in public.values()}
    _require(len(external)==4 and not external.intersection(sums),
             '01010 later Core Actions proofs must remain outside immutable release checksums')
    _require(all(sums.get(name)==sha for name,sha in public['publication']['assertions']['/files'].items()),
             '01010 external public Core wheels differ from sealed coupled release')
    for role,ref in public.items():
        # Existing custody implementation checks run/attempt/job/repository,
        # controller/workflow SHA, upload time, ZIP/member hashes, exact original
        # source/publication and mandatory deep normal-public consumer outcomes.
        result['core-'+role]=reader.core_actions_proof(Path(assets),ref,role)
        if role=='publication':
            members=reader.original_actions_members(reader.read_asset(Path(assets),reader.actions_zip_name(ref),
                ref['actions']['artifact_sha256']),ref,role)
            source=reader.decode(members['source-receipt.json'])
            _require(source.get('source_tree')==value['coreSource']['tree']
                and source.get('sums_sha256')==sums_sha256
                and source.get('release_pins_sha256')==value['releasePinsSha256'],
                '01010 external Core source/tree/immutable release pins differ')
    return result


def candidate01010_release_download_roster(value, distribution):
    """Return only immutable release bytes this route authenticates and stages.

    The complete shared release catalog is checked against SHA256SUMS, release
    pins and GitHub's immutable asset digest roster. Unselected sibling-package
    and source/SDK assets stay catalogued but are not downloaded or staged.
    Later Codegen Core Actions files remain separately fetched by the original
    Actions reader and are not part of this immutable release roster.
    """
    _require(distribution in CANDIDATE01010_PACKAGES and value.get('distribution') == distribution,
             '01010 route distribution differs')
    names = {'SHA256SUMS', 'release-pins.json', *value['files']}
    refs = list(value['proofs'].values())
    if distribution == 'umf-access':
        refs.extend(value['corePublic'].values())
    for ref in refs:
        _candidate_path(ref['path'])
        names.add(ref['path'])
    for name in names:
        _candidate_path(name)
    return tuple(sorted(names))


def _candidate01010_stage_external_core(value, assets, output):
    """Retain original later Actions bytes locally; never append release assets."""
    reader=_candidate01010_actions_reader(value)
    for ref in value['corePublic'].values():
        for name,expected in ((ref['file'],ref['sha256']),
                              (reader.actions_zip_name(ref),ref['actions']['artifact_sha256'])):
            raw=reader.read_asset(Path(assets),name,expected)
            destination=Path(output)/name
            _require(not destination.exists() and not destination.is_symlink(),
                     '01010 external Actions staging collision')
            with destination.open('xb') as stream:stream.write(raw)


def verify_candidate01010_packet(root, assets, *, distribution, source_sha, tag, sums_sha256, admission_sha256=None):
    value=load_candidate01010_profile(root,distribution,source_sha,tag,admission_sha256)
    sums=parse_sums(_candidate_asset(assets,'SHA256SUMS',sums_sha256))
    _require(sums.get('release-pins.json') == value['releasePinsSha256'], '01010 release pins checksum differs')
    pins = json.loads(_candidate_asset(assets,'release-pins.json',value['releasePinsSha256']))
    _candidate_closed(pins, ('schema','source','coreSource','versions','tag','files','resources','protocols'), 'release pins')
    versions=({'umf-access':'0.1.0.dev10','umf-core':'0.10.10'} if distribution=='umf-access' else
              {'sdk':'0.10.10','umf-core':'0.10.10','umf-codegen':'0.10.10'})
    _require(pins['schema']=='umf.closed-01010-release-pins/1' and pins['source']==value['source']
        and pins['coreSource']==(value['source'] if distribution=='umf-core' else value['coreSource'])
        and pins['versions']==versions and pins['tag']==tag and pins['resources']==value['resources']
        and pins['protocols']==value['protocols'], '01010 release pins/source/cohort differs')
    _require(type(pins['files']) is dict and pins['files'] and all(pins['files'].get(name)==sha
             for name,sha in value['files'].items()), '01010 shared coupled release archive inventory differs')
    for name,sha in pins['files'].items():
        _candidate_path(name); _candidate_hash(sha)
    _require(pins['files']=={name:sha for name,sha in sums.items() if name!='release-pins.json'},
             '01010 complete shared release pins/checksum inventory differs')
    for name, expected in value['files'].items():
        _require(sums.get(name)==expected,'01010 qualified archive checksum differs')
        _candidate_asset(assets,name,expected)
        _candidate_archive(Path(assets)/name,distribution,value['version'])
    prefix={'umf-core':'umf_core-','umf-codegen':'umf_codegen-','umf-access':'umf_access-'}[distribution]
    _require({name for name in sums if name.startswith(prefix) and name.endswith(('.whl','.tar.gz'))} == set(value['files']),
             '01010 selected archive roster differs')
    proofs={}
    refs={**value['proofs'], **({} if value['corePublic'] is None or distribution=='umf-codegen' else
          {'core-'+name:ref for name,ref in value['corePublic'].items()})}
    for role,ref in refs.items():
        _require(sums.get(ref['path'])==ref['sha256'],'01010 original proof absent from public checksums')
        proof=json.loads(_candidate_asset(assets,ref['path'],ref['sha256']))
        if role=='core-publication':
            _require(proof.get('schema')=='pypi-publication-receipt.v1' and proof.get('status')=='passed'
                and proof.get('registry')=='pypi' and proof.get('registry_bytes_verified') is True
                and proof.get('distribution')=='umf-core' and proof.get('version')=='0.10.10'
                and proof.get('source_sha')==value['coreSource']['commit'] and bool(proof.get('files')), '01010 actual public Core byte proof differs')
        elif role=='core-consumer':
            _require(proof.get('schema')=='pypi-consumer-receipt.v1' and proof.get('status')=='passed'
                and proof.get('index')=='https://pypi.org/simple' and proof.get('umf_core_version')=='0.10.10',
                '01010 actual normal public Core consumer differs')
        proofs[role]=proof
    if distribution=='umf-codegen':
        proofs.update(_candidate01010_external_core_proofs(value,assets,sums,sums_sha256))
    # No passed:true/count/producer-flag substitute. Actual owner schema mappings
    # must be supplied as reviewed CODE, never JSON-selected imports or callbacks.
    for role,ref in refs.items():
        validator=CANDIDATE01010_VALIDATORS.get((distribution,role,ref['validator']))
        _require(validator is not None, '01010 actual qualification validator mapping pending: '+role)
        validator(value,proofs[role],Path(assets))
    _require(value['status']=='qualified','01010 original owner qualification pending')
    return value,sums


def prepare_candidate01010_release(*, root, assets, distribution, source_sha, tag, sums_sha256,
                                  release, tag_ref, tag_object, output_dir):
    value,sums=verify_candidate01010_packet(root,assets,distribution=distribution,
        source_sha=source_sha,tag=tag,sums_sha256=sums_sha256)
    _require(resolve_tag_commit(tag_ref,tag_object,tag)==source_sha, '01010 peeled tag/source S differs')
    _require(release.get('tag_name')==tag and release.get('draft') is False and
             release.get('prerelease') is (distribution=='umf-access'), '01010 actual published release identity differs')
    assets_by_name={item['name']:item for item in release.get('assets',[])}
    _require(len(assets_by_name)==len(release.get('assets',[])), '01010 duplicate GitHub asset')
    expected={**sums,'SHA256SUMS':sums_sha256}
    _require(set(assets_by_name)==set(expected) and all(assets_by_name[name].get('digest')=='sha256:'+sha
             for name,sha in expected.items()), '01010 immutable GitHub asset digest/roster differs')
    _require(release.get('immutable') is True, '01010 immutable release required')
    _require(not Path(output_dir).exists(), '01010 output must be new')
    Path(output_dir).mkdir(parents=True)
    for name in candidate01010_release_download_roster(value, distribution):
        sha=expected[name]
        (Path(output_dir)/name).write_bytes(_candidate_asset(assets,name,sha))
    if distribution=='umf-codegen':
        _candidate01010_stage_external_core(value,assets,output_dir)
    return {'schema':'pypi-release-source.v1','status':'verified','repository':'DocumentDrivenDX/umf',
        'source_sha':source_sha,'source_tree':value['source']['tree'],'tag':tag,'distribution':distribution,
        'version':value['version'],'files':value['files'],'sums_sha256':sums_sha256,
        'release_pins_sha256':value['releasePinsSha256'],'github_release_immutable':True,
        'candidateAdmissionSchema':CANDIDATE01010_SCHEMA,'controller':value['controller']}


def candidate01010_source_command(args, distribution):
    """Closed new route; actual missing admissions/mappings refuse before effects."""
    root=Path(__file__).resolve().parents[1]
    if distribution=='umf-codegen' and args.command=='fetch-core-proofs':
        value=load_candidate01010_profile(root,distribution,args.source_sha,args.tag,args.expected_admission_sha256)
        reader=_candidate01010_actions_reader(value)
        reader.fetch_core_proofs({'core':value['corePublic']},args.assets_dir)
        print(json.dumps({'coreActionsFetched':True,'qualification':'not asserted'}));return 0
    value,sums=verify_candidate01010_packet(root,args.assets_dir,distribution=distribution,
        source_sha=args.source_sha,tag=args.tag,sums_sha256=args.expected_sums_sha256,
        admission_sha256=args.expected_admission_sha256)
    if args.command in ('prepare','check-pypi') and distribution != 'umf-core':
        # Core's publication is an independent prerequisite for dependent packages;
        # Core itself has no publication-before-initial-upload dependency.
        publication_ref=value['corePublic']['publication']
        publication=json.loads(_candidate_asset(args.assets_dir,publication_ref['file' if distribution=='umf-codegen' else 'path'],
            publication_ref['sha256']))
        _require(check_pypi('umf-core','0.10.10',publication['files'])=='matching',
                 '01010 actual public Core bytes required before dependent publication')
    if args.command=='verify':
        print(json.dumps({'status':'verified-candidate-inputs','distribution':distribution,'source':value['source']}));return 0
    if args.command=='prepare':
        _require(args.release_json and args.tag_ref_json and args.output_dir, '01010 actual release/ref/output required')
        receipt=prepare_candidate01010_release(root=root,assets=args.assets_dir,distribution=distribution,
            source_sha=args.source_sha,tag=args.tag,sums_sha256=args.expected_sums_sha256,
            release=json.loads(args.release_json.read_bytes()),tag_ref=json.loads(args.tag_ref_json.read_bytes()),
            tag_object=json.loads(args.tag_object_json.read_bytes()) if args.tag_object_json else None,
            output_dir=args.output_dir)
        (args.output_dir/'source-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');return 0
    if args.command=='check-pypi':
        result=(wait_for_pypi(distribution,value['version'],value['files']) if args.wait else
                check_pypi(distribution,value['version'],value['files']))
        print(json.dumps({'registryState':result,'files':value['files']}))
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'],'a') as stream:stream.write('status='+result+'\n')
        return 0
    raise ReleaseError('01010 candidate command is not admitted; existing original staging route unchanged')


def prepare_release(
    *,
    repository: str,
    release: dict[str, Any],
    tag_ref: dict[str, Any],
    tag_object: dict[str, Any] | None,
    assets_dir: Path,
    output_dir: Path,
    tag: str,
    source_sha: str,
    expected_sums_sha256: str,
    distribution: str,
    wheel_prefix: str,
    wheel_count: int | None,
    require_sdist: bool,
) -> dict[str, Any]:
    if tag in ('umf-v0.10.10','python-v0.10.10'):
        _require(tag == 'umf-v0.10.10', '01010 requires the exact coupled SDK tag')
        _require(repository=='DocumentDrivenDX/umf' and distribution=='umf-core' and wheel_prefix=='umf_core-' and require_sdist,
                 '01010 closed Core publisher caller differs')
        return prepare_candidate01010_release(root=Path(__file__).resolve().parents[1], assets=assets_dir,
            distribution=distribution,source_sha=source_sha,tag=tag,sums_sha256=expected_sums_sha256,
            release=release,tag_ref=tag_ref,tag_object=tag_object,output_dir=output_dir)
    _require(
        TAG.fullmatch(tag) is not None,
        "tag must be numeric umf-vX.Y.Z or python-vX.Y.Z",
    )
    _require(COMMIT.fullmatch(source_sha) is not None, "source SHA is invalid")
    _require(
        SHA.fullmatch(expected_sums_sha256) is not None, "SHA256SUMS pin is invalid"
    )
    _require(
        release.get("tag_name") == tag
        and release.get("draft") is False
        and release.get("prerelease") is False,
        "release is absent, draft, prerelease or for another tag",
    )
    _require(
        resolve_tag_commit(tag_ref, tag_object, tag) == source_sha,
        "tag does not resolve to the pinned source",
    )
    is_sdk_tag = tag.startswith("umf-v")
    tag_version = tag[5:] if is_sdk_tag else tag.removeprefix("python-v")
    raw_assets = release.get("assets")
    _require(isinstance(raw_assets, list), "release asset inventory is missing")
    assets: dict[str, dict[str, Any]] = {}
    for item in raw_assets:
        _require(
            isinstance(item, dict) and isinstance(item.get("name"), str),
            "release has an invalid asset",
        )
        name = item["name"]
        _require(name not in assets, "release has duplicate asset names")
        assets[name] = item

    def read_asset(name: str) -> bytes:
        _require(Path(name).name == name, "release asset filename is unsafe")
        item = assets.get(name)
        _require(item is not None, f"release is missing {name}")
        assert item is not None
        path = assets_dir / name
        _require(
            path.is_file() and not path.is_symlink(),
            f"release asset {name} is missing or unsafe",
        )
        digest = item.get("digest")
        _require(
            isinstance(digest, str) and digest == "sha256:" + _sha(path.read_bytes()),
            f"GitHub asset digest differs for {name}",
        )
        return path.read_bytes()

    sums_bytes = read_asset("SHA256SUMS")
    _require(
        _sha(sums_bytes) == expected_sums_sha256,
        "SHA256SUMS differs from its explicit pin",
    )
    sums = parse_sums(sums_bytes)
    pin_bytes = read_asset("release-pins.json")
    try:
        pins = json.loads(pin_bytes)
    except json.JSONDecodeError as exc:
        raise ReleaseError("release-pins.json is invalid") from exc
    _require(
        repository == "DocumentDrivenDX/umf"
        and distribution == "umf-core"
        and wheel_prefix == "umf_core-"
        and require_sdist,
        "publisher is restricted to the official umf-core wheel and source archive",
    )
    _require(
        isinstance(pins, dict)
        and pins.get("tag") == tag
        and pins.get("commit") == source_sha
        and pins.get("distribution") == distribution,
        "release pins differ from tag, source or distribution",
    )
    if is_sdk_tag:
        _require(
            pins.get("sdk") == tag_version
            and pins.get("umf_core") == tag_version,
            "SDK tag, SDK pin and umf-core pin must identify the same artifact cohort",
        )
    version = pins.get("version")
    _require(
        version == tag_version,
        "release pin version differs from tag",
    )
    _require(
        isinstance(version, str)
        and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is not None,
        "release pins do not identify a numeric core version",
    )
    _require(
        version in QUALIFIED_CORE_VERSIONS,
        "Core versions " + ", ".join(sorted(QUALIFIED_CORE_VERSIONS))
        + " are the only qualified versions for this publisher",
    )
    archives = sorted(
        name for name in sums if name.startswith(wheel_prefix) and name.endswith(".whl")
    )
    _require(
        1 <= len(archives) <= 32
        and (wheel_count is None or len(archives) == wheel_count),
        "SHA256SUMS wheel inventory differs from the expected cohort",
    )
    sdist_prefix = wheel_prefix.rstrip("-")
    sdists = sorted(
        name
        for name in sums
        if name.startswith(sdist_prefix) and name.endswith(".tar.gz")
    )
    _require(
        len(sdists) == (1 if require_sdist else 0),
        "SHA256SUMS source archive inventory differs",
    )
    selected = archives + sdists
    published_archives = {
        name
        for name in assets
        if name.startswith(wheel_prefix)
        and (name.endswith(".whl") or name.endswith(".tar.gz"))
    }
    _require(
        set(selected) == published_archives,
        "release archive inventory differs from checksum cohort",
    )
    _require(
        pins.get("files") == {name: sums[name] for name in selected},
        "selected file hashes differ from release pins",
    )
    _require(not output_dir.exists(), "verified distribution output path must be new")
    output_dir.mkdir(parents=True)
    files: dict[str, str] = {}
    for name in selected:
        path = assets_dir / name
        _require(
            path.is_file() and not path.is_symlink(),
            f"release archive {name} is missing or unsafe",
        )
        data = path.read_bytes()
        _require(_sha(data) == sums[name], f"SHA256SUMS digest differs for {name}")
        item = assets[name]
        _require(
            item.get("digest") == "sha256:" + _sha(data),
            f"GitHub digest differs for {name}",
        )
        validate_archive(path, distribution, version)
        (output_dir / name).write_bytes(data)
        files[name] = sums[name]
    receipt = {
        "schema": "pypi-release-source.v1",
        "status": "verified",
        "repository": repository,
        "tag": tag,
        "source_sha": source_sha,
        "distribution": distribution,
        "version": version,
        "sums_sha256": _sha(sums_bytes),
        "release_pins_sha256": _sha(pin_bytes),
        "files": files,
    }
    return receipt


def check_pypi(distribution: str, version: str, expected_files: dict[str, str]) -> str:
    url = f"https://pypi.org/pypi/{distribution}/{version}/json"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            value = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return "absent"
        raise ReleaseError(f"PyPI returned HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ReleaseError("PyPI version lookup failed") from exc
    _require(isinstance(value, dict), "PyPI response is malformed")
    info = value.get("info")
    _require(
        isinstance(info, dict)
        and info.get("name") == distribution
        and info.get("version") == version,
        "PyPI response identifies a different release",
    )
    raw = value.get("urls")
    _require(isinstance(raw, list), "PyPI file inventory is missing")
    actual: dict[str, str] = {}
    for item in raw:
        _require(
            isinstance(item, dict) and isinstance(item.get("filename"), str),
            "PyPI file record is malformed",
        )
        name = item["filename"]
        digest = (
            item.get("digests", {}).get("sha256")
            if isinstance(item.get("digests"), dict)
            else None
        )
        _require(
            name not in actual
            and isinstance(digest, str)
            and SHA.fullmatch(digest) is not None,
            "PyPI file inventory contains a duplicate or invalid digest",
        )
        actual[name] = digest
    _require(
        actual == expected_files,
        "PyPI version collision: published file inventory or digest differs",
    )
    for item in raw:
        file_url = item.get("url")
        _require(
            isinstance(file_url, str)
            and file_url.startswith("https://files.pythonhosted.org/"),
            "PyPI file URL is outside the public file host",
        )
        request = urllib.request.Request(file_url)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                digest = _sha(response.read())
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ReleaseError("PyPI file download failed") from exc
        _require(
            digest == expected_files[item["filename"]],
            "PyPI-served archive bytes differ",
        )
    return "matching"


def wait_for_pypi(
    distribution: str, version: str, files: dict[str, str], timeout: int = 300
) -> str:
    _require(
        type(timeout) is int and 1 <= timeout <= 600,
        "PyPI visibility bound must be 1–600 seconds",
    )
    deadline = time.monotonic() + timeout
    while True:
        state = check_pypi(distribution, version, files)
        if state == "matching":
            return state
        remaining = deadline - time.monotonic()
        _require(
            remaining > 0,
            "PyPI did not expose exact archive bytes before the visibility timeout",
        )
        time.sleep(min(5, remaining))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("prepare", "check-pypi"))
    parser.add_argument("--receipt", required=True, type=Path)
    parser.add_argument("--dist-dir", type=Path)
    parser.add_argument("--release-json", type=Path)
    parser.add_argument("--tag-ref-json", type=Path)
    parser.add_argument("--tag-object-json", type=Path)
    parser.add_argument("--assets-dir", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--repository")
    parser.add_argument("--tag")
    parser.add_argument("--source-sha")
    parser.add_argument("--expected-sums-sha256")
    parser.add_argument("--distribution")
    parser.add_argument("--wheel-prefix")
    parser.add_argument("--wheel-count", type=int)
    parser.add_argument("--require-sdist", action="store_true")
    parser.add_argument("--wait", action="store_true")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if args.command == "prepare":
        required = (
            args.release_json,
            args.tag_ref_json,
            args.assets_dir,
            args.output_dir,
            args.repository,
            args.tag,
            args.source_sha,
            args.expected_sums_sha256,
            args.distribution,
            args.wheel_prefix,
        )
        _require(
            all(value is not None for value in required),
            "prepare requires complete release inputs",
        )
        _require(
            args.receipt.parent == args.output_dir,
            "receipt must be written beside verified archives",
        )

        def load(path: Path) -> Any:
            return json.loads(path.read_text(encoding="utf-8"))

        receipt = prepare_release(
            repository=args.repository,
            release=load(args.release_json),
            tag_ref=load(args.tag_ref_json),
            tag_object=load(args.tag_object_json) if args.tag_object_json else None,
            assets_dir=args.assets_dir,
            output_dir=args.output_dir,
            tag=args.tag,
            source_sha=args.source_sha,
            expected_sums_sha256=args.expected_sums_sha256,
            distribution=args.distribution,
            wheel_prefix=args.wheel_prefix,
            wheel_count=args.wheel_count,
            require_sdist=args.require_sdist,
        )
        args.receipt.write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(
            json.dumps(
                {"status": "verified", "version": receipt["version"]}, sort_keys=True
            )
        )
        return 0
    _require(
        args.dist_dir is not None,
        "registry check requires the verified archive directory",
    )
    receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
    _require(
        receipt.get("schema") == "pypi-release-source.v1"
        and receipt.get("status") == "verified",
        "verified source receipt is invalid",
    )
    for name, digest in receipt["files"].items():
        path = args.dist_dir / name
        _require(
            Path(name).name == name and path.is_file() and not path.is_symlink(),
            "verified archive is missing",
        )
        _require(
            _sha(path.read_bytes()) == digest,
            "verified archive changed after release validation",
        )

    def check() -> str:
        return check_pypi(receipt["distribution"], receipt["version"], receipt["files"])

    status = (
        wait_for_pypi(
            receipt["distribution"], receipt["version"], receipt["files"], args.timeout
        )
        if args.wait
        else check()
    )
    print(json.dumps({"status": status}, sort_keys=True))
    import os

    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"status={status}\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ReleaseError, OSError, KeyError, TypeError) as exc:
        print(f"release validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
