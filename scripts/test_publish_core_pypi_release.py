from __future__ import annotations

import hashlib
import io
import json
import shutil
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import publish_core_pypi_release as publisher


def wheel(metadata: bytes, version: str = "0.10.7") -> bytes:
    result = io.BytesIO()
    with zipfile.ZipFile(result, "w") as archive:
        archive.writestr(f"umf_core-{version}.dist-info/METADATA", metadata)
    return result.getvalue()


def sdist(metadata: bytes, version: str = "0.10.7") -> bytes:
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as archive:
        info = tarfile.TarInfo(f"umf_core-{version}/PKG-INFO")
        info.size = len(metadata)
        archive.addfile(info, io.BytesIO(metadata))
    return result.getvalue()


class PublishPypiReleaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.assets = self.root / "assets"
        self.assets.mkdir()
        self.configure_release()

    def configure_release(self, version: str = "0.10.7", *, sdk: bool = True) -> None:
        self.version = version
        self.tag = f"{'umf' if sdk else 'python'}-v{version}"
        self.output = self.root / f"dist-{self.tag}"
        self.whl_name = f"umf_core-{version}-cp311-cp311-manylinux_2_17_x86_64.whl"
        self.sdist_name = f"umf_core-{version}.tar.gz"
        metadata = (
            f"Metadata-Version: 2.4\nName: umf-core\nVersion: {version}\n"
            "Requires-Dist: jsonschema==4.26.0\n\n"
        ).encode()
        self.payloads = {
            self.whl_name: wheel(metadata, version),
            self.sdist_name: sdist(metadata, version),
        }
        for name, payload in self.payloads.items():
            (self.assets / name).write_bytes(payload)
        self.sums = "".join(
            f"{hashlib.sha256(data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        pins = {
            "tag": self.tag,
            "commit": "a" * 40,
            "distribution": "umf-core",
            "version": version,
            "files": {
                name: hashlib.sha256(data).hexdigest()
                for name, data in self.payloads.items()
            },
        }
        if sdk:
            pins.update(sdk=version, umf_core=version)
        self.pins = json.dumps(pins).encode()
        (self.assets / "SHA256SUMS").write_bytes(self.sums)
        (self.assets / "release-pins.json").write_bytes(self.pins)
        self.release = {
            "tag_name": self.tag,
            "draft": False,
            "prerelease": False,
            "created_at": "2026-10-26T00:01:00Z",
            "published_at": "2026-10-26T00:02:00Z",
            "assets": [
                {"name": name, "digest": "sha256:" + hashlib.sha256(data).hexdigest()}
                for name, data in {
                    "SHA256SUMS": self.sums,
                    "release-pins.json": self.pins,
                    **self.payloads,
                }.items()
            ],
        }
        self.ref = {
            "ref": f"refs/tags/{self.tag}",
            "object": {"sha": "a" * 40, "type": "commit"},
        }

    def tearDown(self) -> None:
        self.temp.cleanup()

    def prepare(self, **overrides: object) -> dict[str, object]:
        values: dict[str, object] = {
            "repository": "DocumentDrivenDX/umf",
            "release": self.release,
            "tag_ref": self.ref,
            "tag_object": None,
            "assets_dir": self.assets,
            "output_dir": self.output,
            "tag": self.tag,
            "source_sha": "a" * 40,
            "expected_sums_sha256": hashlib.sha256(self.sums).hexdigest(),
            "distribution": "umf-core",
            "wheel_prefix": "umf_core-",
            "wheel_count": None,
            "require_sdist": True,
        }
        values.update(overrides)
        return publisher.prepare_release(**values)  # type: ignore[arg-type]

    def test_prepare_binds_public_assets_tag_source_and_package_metadata(self) -> None:
        receipt = self.prepare()
        self.assertEqual(receipt["status"], "verified")
        self.assertEqual(receipt["source_sha"], "a" * 40)
        self.assertEqual(set(receipt["files"]), set(self.payloads))  # type: ignore[arg-type]
        self.assertEqual(
            (self.output / self.whl_name).read_bytes(), self.payloads[self.whl_name]
        )

    def test_successor_sdk_and_standalone_have_complete_matching_pins(self) -> None:
        for version in ("0.10.8", "0.10.9"):
            for sdk in (True, False):
                with self.subTest(version=version, sdk=sdk):
                    self.configure_release(version, sdk=sdk)
                    receipt = self.prepare()
                    self.assertEqual(receipt["version"], version)
                    self.assertEqual(receipt["tag"], self.tag)
                    self.assertEqual(set(receipt["files"]), set(self.payloads))

    def test_sdk_profile_accepts_two_native_wheels_from_the_exact_pinned_cohort(self) -> None:
        extra = f"umf_core-{self.version}-cp311-cp311-manylinux_2_17_aarch64.whl"
        payload = wheel(
            f"Metadata-Version: 2.4\nName: umf-core\nVersion: {self.version}\n\n".encode(),
            self.version,
        )
        self.payloads[extra] = payload
        (self.assets / extra).write_bytes(payload)
        self.sums = "".join(
            f"{hashlib.sha256(data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        (self.assets / "SHA256SUMS").write_bytes(self.sums)
        pins = json.loads(self.pins)
        pins["files"] = {
            name: hashlib.sha256(data).hexdigest()
            for name, data in self.payloads.items()
        }
        self.pins = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(self.pins)
        self.release["assets"] = [
            {"name": name, "digest": "sha256:" + hashlib.sha256(data).hexdigest()}
            for name, data in {
                "SHA256SUMS": self.sums,
                "release-pins.json": self.pins,
                **self.payloads,
            }.items()
        ]
        receipt = self.prepare()
        self.assertEqual(set(receipt["files"]), set(self.payloads))  # type: ignore[arg-type]

    def test_prepare_refuses_source_movement_and_github_digest_mismatch(self) -> None:
        with self.assertRaisesRegex(publisher.ReleaseError, "pinned source"):
            self.prepare(source_sha="b" * 40)
        self.output = self.root / "dist2"
        changed = dict(self.release)
        changed["assets"] = list(self.release["assets"])
        changed["assets"][0] = {**changed["assets"][0], "digest": "sha256:" + "0" * 64}
        with self.assertRaisesRegex(publisher.ReleaseError, "GitHub asset digest"):
            self.prepare(release=changed, output_dir=self.output)

    def test_prepare_refuses_direct_url_metadata_and_wrong_distribution(self) -> None:
        self.output = self.root / "dist3"
        raw = wheel(
            (
                f"Metadata-Version: 2.4\nName: umf-core\nVersion: {self.version}\n"
                "Requires-Dist: umf-core @ https://example.invalid/core.whl\n\n"
            ).encode(),
            self.version,
        )
        (self.assets / self.whl_name).write_bytes(raw)
        changed = dict(self.release)
        changed["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
            if item["name"] == self.whl_name
            else item
            for item in self.release["assets"]
        ]
        sums = "".join(
            f"{hashlib.sha256(raw if name == self.whl_name else data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        (self.assets / "SHA256SUMS").write_bytes(sums)
        pins = json.loads(self.pins)
        pins["files"] = {
            name: hashlib.sha256(raw if name == self.whl_name else data).hexdigest()
            for name, data in self.payloads.items()
        }
        pin_bytes = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(pin_bytes)
        changed["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(sums).hexdigest()}
            if item["name"] == "SHA256SUMS"
            else {**item, "digest": "sha256:" + hashlib.sha256(pin_bytes).hexdigest()}
            if item["name"] == "release-pins.json"
            else item
            for item in changed["assets"]
        ]
        with self.assertRaisesRegex(publisher.ReleaseError, "direct URL"):
            self.prepare(
                release=changed,
                output_dir=self.output,
                expected_sums_sha256=hashlib.sha256(sums).hexdigest(),
            )
        self.output = self.root / "dist4"
        with self.assertRaisesRegex(
            publisher.ReleaseError, "distribution name differs"
        ):
            publisher.validate_archive(
                self.assets / self.sdist_name, "other-package", self.version
            )

    def test_standalone_core_profile_binds_source_and_explicit_file_map(self) -> None:
        for version in ("0.10.2", "0.10.7"):
            self.configure_release(version, sdk=False)
            tag = f"python-v{version}"
            pins = {
                "tag": tag,
                "commit": "a" * 40,
                "distribution": "umf-core",
                "version": version,
                "files": {
                    name: hashlib.sha256(data).hexdigest()
                    for name, data in self.payloads.items()
                },
            }
            raw = json.dumps(pins).encode()
            (self.assets / "release-pins.json").write_bytes(raw)
            release = {
                **self.release,
                "tag_name": tag,
                "assets": [
                    {**a, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                    if a["name"] == "release-pins.json"
                    else a
                    for a in self.release["assets"]
                ],
            }
            ref = {**self.ref, "ref": "refs/tags/" + tag}
            receipt = self.prepare(tag=tag, release=release, tag_ref=ref, wheel_count=None)
            self.assertEqual(receipt["version"], version)
            pins["files"][self.whl_name] = "f" * 64
            changed = json.dumps(pins).encode()
            (self.assets / "release-pins.json").write_bytes(changed)
            release["assets"] = [
                {**a, "digest": "sha256:" + hashlib.sha256(changed).hexdigest()}
                if a["name"] == "release-pins.json"
                else a
                for a in release["assets"]
            ]
            with self.assertRaisesRegex(publisher.ReleaseError, "selected file hashes"):
                self.prepare(
                    tag=tag,
                    release=release,
                    tag_ref=ref,
                    output_dir=self.root / f"refused-{version}",
                    wheel_count=None,
                )

    def test_manual_prepare_refuses_unqualified_011_core_version(self) -> None:
        self.configure_release("0.11.0", sdk=False)
        with self.assertRaisesRegex(publisher.ReleaseError, "only qualified"):
            self.prepare()

    def test_sdk_profile_refuses_multiple_wheels_without_a_selected_file_map(self) -> None:
        extra = f"umf_core-{self.version}-cp311-cp311-manylinux_2_17_aarch64.whl"
        payload = self.payloads[self.whl_name]
        self.payloads[extra] = payload
        (self.assets / extra).write_bytes(payload)
        self.sums = "".join(
            f"{hashlib.sha256(data).hexdigest()}  {name}\n"
            for name, data in self.payloads.items()
        ).encode()
        (self.assets / "SHA256SUMS").write_bytes(self.sums)
        self.release["assets"] = [
            {**item, "digest": "sha256:" + hashlib.sha256(self.sums).hexdigest()}
            if item["name"] == "SHA256SUMS"
            else item
            for item in self.release["assets"]
        ] + [{"name": extra, "digest": "sha256:" + hashlib.sha256(payload).hexdigest()}]
        with self.assertRaisesRegex(publisher.ReleaseError, "selected file hashes"):
            self.prepare(wheel_count=None)

    def test_sdk_selected_file_map_tamper_is_refused(self) -> None:
        pins = json.loads(self.pins)
        pins["files"][self.whl_name] = "f" * 64
        raw = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(raw)
        changed = {
            **self.release,
            "assets": [
                {**item, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                if item["name"] == "release-pins.json"
                else item
                for item in self.release["assets"]
            ],
        }
        with self.assertRaisesRegex(publisher.ReleaseError, "selected file hashes"):
            self.prepare(release=changed)

    def test_python_tag_binds_source_and_explicit_file_map(self) -> None:
        self.configure_release("0.10.7", sdk=False)
        tag = self.tag
        pins = {
            "tag": tag,
            "commit": "a" * 40,
            "distribution": "umf-core",
            "version": self.version,
            "files": {
                name: hashlib.sha256(data).hexdigest()
                for name, data in self.payloads.items()
            },
        }
        raw = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(raw)
        release = {
            **self.release,
            "tag_name": tag,
            "assets": [
                {**a, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                if a["name"] == "release-pins.json"
                else a
                for a in self.release["assets"]
            ],
        }
        ref = {**self.ref, "ref": "refs/tags/" + tag}
        receipt = self.prepare(tag=tag, release=release, tag_ref=ref, wheel_count=None)
        self.assertEqual(receipt["version"], self.version)
        pins["files"][self.whl_name] = "f" * 64
        changed = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(changed)
        release["assets"] = [
            {**a, "digest": "sha256:" + hashlib.sha256(changed).hexdigest()}
            if a["name"] == "release-pins.json"
            else a
            for a in release["assets"]
        ]
        with self.assertRaisesRegex(publisher.ReleaseError, "selected file hashes"):
            self.prepare(
                tag=tag,
                release=release,
                tag_ref=ref,
                output_dir=self.root / "refused",
                wheel_count=None,
            )

    def test_sdk_prepare_requires_sdk_and_distribution_versions_to_match_tag(self) -> None:
        pins = json.loads(self.pins)
        pins["umf_core"] = "0.11.1"
        raw = json.dumps(pins).encode()
        (self.assets / "release-pins.json").write_bytes(raw)
        release = {
            **self.release,
            "assets": [
                {**a, "digest": "sha256:" + hashlib.sha256(raw).hexdigest()}
                if a["name"] == "release-pins.json"
                else a
                for a in self.release["assets"]
            ],
        }
        with self.assertRaisesRegex(publisher.ReleaseError, "same artifact cohort"):
            self.prepare(release=release, output_dir=self.root / "mismatched-cohort")

    def test_raw_linux_wheel_is_refused_before_any_upload(self) -> None:
        raw = self.assets / f"umf_core-{self.version}-cp311-cp311-linux_x86_64.whl"
        raw.write_bytes(self.payloads[self.whl_name])
        with self.assertRaisesRegex(publisher.ReleaseError, "not accepted by PyPI"):
            publisher.validate_archive(raw, "umf-core", self.version)
        accepted = self.assets / f"umf_core-{self.version}-cp311-cp311-manylinux_2_28_x86_64.whl"
        accepted.write_bytes(self.payloads[self.whl_name])
        publisher.validate_archive(accepted, "umf-core", self.version)

    def test_registry_check_accepts_only_exact_public_file_bytes(self) -> None:
        payload = self.payloads[self.whl_name]
        digest = hashlib.sha256(payload).hexdigest()
        metadata = json.dumps(
            {
                "info": {"name": "umf-core", "version": self.version},
                "urls": [
                    {
                        "filename": self.whl_name,
                        "digests": {"sha256": digest},
                        "url": "https://files.pythonhosted.org/packages/truss.whl",
                    }
                ],
            }
        ).encode()

        class Response:
            def __init__(self, body: bytes):
                self.body = body

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def read(self) -> bytes:
                return self.body

        with patch.object(
            publisher.urllib.request,
            "urlopen",
            side_effect=[Response(metadata), Response(payload)],
        ):
            self.assertEqual(
                publisher.check_pypi("umf-core", self.version, {self.whl_name: digest}),
                "matching",
            )

        conflict = json.loads(metadata)
        conflict["urls"][0]["digests"]["sha256"] = "0" * 64
        with patch.object(
            publisher.urllib.request,
            "urlopen",
            return_value=Response(json.dumps(conflict).encode()),
        ):
            with self.assertRaisesRegex(publisher.ReleaseError, "version collision"):
                publisher.check_pypi("umf-core", self.version, {self.whl_name: digest})

    def test_visibility_wait_retries_absence_but_propagates_errors(self) -> None:
        with (
            patch.object(publisher, "check_pypi", side_effect=["absent", "matching"]),
            patch.object(publisher.time, "monotonic", side_effect=[0.0, 0.0, 0.0]),
            patch.object(publisher.time, "sleep") as sleep,
        ):
            self.assertEqual(
                publisher.wait_for_pypi("umf-core", self.version, {}, timeout=300),
                "matching",
            )
            sleep.assert_called_once()
        with patch.object(
            publisher, "check_pypi", side_effect=publisher.ReleaseError("HTTP 401")
        ):
            with self.assertRaisesRegex(publisher.ReleaseError, "HTTP 401"):
                publisher.wait_for_pypi("umf-core", self.version, {}, timeout=300)




def synthetic_external_core_refs(value):
    """Existing Actions reference shape, synthetic IDs/pins only."""
    files={name:'7'*64 for name in publisher.CANDIDATE01010_PACKAGES['umf-core'][2]}
    common={'/schema':'pypi-consumer-receipt.v1','/status':'passed','/index':'https://pypi.org/simple',
        '/umf_core_version':'0.10.10','/source_sha':value['coreSource']['commit'],
        '/nativeResourceInspection/profile':'umf.fresh-public-core-correspondence/1',
        '/nativeResourceInspection/status':'passed','/nativeResourceInspection/sourceS':value['coreSource']['commit'],
        '/nativeResourceInspection/wheelSHA256':files['umf_core-0.10.10-cp311-abi3-manylinux_2_34_x86_64.whl'],
        '/nativeResourceInspection/nativeSHA256':'8'*64,'/nativeResourceInspection/resourceManifestSHA256':'9'*64,
        '/nativeResourceInspection/inspectionCases':17,'/nativeResourceInspection/inspectionCalls':51,
        '/nativeResourceInspection/requestCustodyPreserved':True,'/nativeResourceInspection/canonicalResources':True,
        '/nativeResourceInspection/engineVersion':'umf-core-r2',
        '/nativeResourceInspection/codegenProtocol':'umf-codegen-r3-seven-ops-nine-resources/1',
        '/nativeResourceInspection/semanticCore':'0.10.0'}
    result={}
    for index,role in enumerate(('publication','consumer')):
        member='publication-receipt.json' if role=='publication' else 'consumer-receipt.json'
        assertions=({'/schema':'pypi-publication-receipt.v1','/status':'passed','/registry':'pypi',
            '/registry_bytes_verified':True,'/distribution':'umf-core','/version':'0.10.10',
            '/source_sha':value['coreSource']['commit'],'/tag':'umf-v0.10.10','/files':files} if role=='publication' else common)
        result[role]={'file':'synthetic-core-'+role+'.json','sha256':'a'*64,'assertions':assertions,
            'actions':{'run_id':11,'run_attempt':1,'job_id':20+index,'controller_sha':'d'*40,
                'workflow_sha256':hashlib.sha256(b'synthetic reviewed Core workflow').hexdigest(),
                'artifact_id':30+index,'artifact_name':'umf-core-pypi-'+('publication' if index==0 else 'consumer')+'-0.10.10',
                'artifact_sha256':'b'*64,'member':member,'members':{member:'a'*64,**({'source-receipt.json':'c'*64} if index==0 else {})}}}
    return result


def synthetic_candidate01010(distribution='umf-core'):
    """Clearly synthetic schema input; never written to any real admission path."""
    version,tag,names=publisher.CANDIDATE01010_PACKAGES[distribution]
    proof=lambda role:dict(path='synthetic-'+role+'.json',sha256='a'*64,validator='SYNTHETIC-UNMAPPED-'+role)
    sources={'commit':'1'*40,'tree':'2'*40}
    controls={'scripts/publish_core_pypi_release.py':'3'*64}
    if distribution!='umf-core':controls['scripts/publish_'+('access' if distribution=='umf-access' else 'codegen')+'_pypi_release.py']='4'*64
    if distribution=='umf-codegen':
        for name in ('publish_codegen_pypi_release.py','publish_access_pypi_release.py'):
            controls['scripts/'+name]=hashlib.sha256(Path(publisher.__file__).with_name(name).read_bytes()).hexdigest()
    value=dict(schema=publisher.CANDIDATE01010_SCHEMA,status='source-bound',source=sources,
        controller=dict(commit='5'*40,tree='6'*40,files=controls),distribution=distribution,version=version,tag=tag,
        files={name:'7'*64 for name in names},resources={name:'8'*64 for name in
            ('coreSchema','referenceSchema','packageSchema','constraints','domainPolicy','tablesPackage','actionsPackage','bindingPackage','stableBindingPackage')},
        protocols=dict(semantic='0.10.0',engine='umf-core-r2',codegen='umf-codegen-r3-seven-ops-nine-resources/1'),
        proofs={role:proof(role) for role in publisher.CANDIDATE01010_PROOFS},
        corePublic=None if distribution=='umf-core' else {'publication':proof('core-publication'),'consumer':proof('core-consumer')},
        coreSource=None if distribution=='umf-core' else sources.copy(),releasePinsSha256='9'*64)
    if distribution=='umf-codegen':value['corePublic']=synthetic_external_core_refs(value)
    return value


class Closed01010PublisherSourceTests(unittest.TestCase):
    def test_synthetic_schema_accepts_only_closed_new_tuples(self):
        for distribution in publisher.CANDIDATE01010_PACKAGES:
            value=synthetic_candidate01010(distribution)
            self.assertIs(publisher.validate_candidate01010_profile(value,distribution,value['source']['commit'],value['tag']),value)
        self.assertNotIn('0.10.10',publisher.QUALIFIED_CORE_VERSIONS)
        self.assertEqual(publisher.CANDIDATE01010_VALIDATORS,{})

    def test_missing_actual_committed_admission_refuses_before_eligibility(self):
        with patch('subprocess.check_output',side_effect=__import__('subprocess').CalledProcessError(128,['git'])):
            with self.assertRaisesRegex(publisher.ReleaseError,'actual committed candidate admission missing'):
                publisher.load_candidate01010_profile(Path('/synthetic'),'umf-core','1'*40,'umf-v0.10.10')

    def test_closed_version_source_controller_resources_protocols_and_roster(self):
        import copy
        for distribution in publisher.CANDIDATE01010_PACKAGES:
            original=synthetic_candidate01010(distribution)
            for mutation in ('version','tag','source','controller','resource','protocol','member','pending','missing-core-proof','extra'):
                value=copy.deepcopy(original)
                if mutation=='version':value['version']='0.10.11'
                if mutation=='tag':value['tag']='umf-v0.10.9'
                if mutation=='source':value['source']['commit']='0'*40
                if mutation=='controller':value['controller']['commit']=value['source']['commit']
                if mutation=='resource':value['resources'].pop('coreSchema')
                if mutation=='protocol':value['protocols']['engine']='other'
                if mutation=='member':value['files']['another.whl']='b'*64
                if mutation=='pending':value['status']='pending'
                if mutation=='missing-core-proof':
                    if distribution=='umf-core':value['corePublic']={}
                    else:value['corePublic'].pop('consumer')
                if mutation=='extra':value['unknown']=True
                with self.subTest(distribution=distribution,mutation=mutation),self.assertRaises(publisher.ReleaseError):
                    publisher.validate_candidate01010_profile(value,distribution,'1'*40,original['tag'])

    def test_access_may_bind_distinct_core_source_but_codegen_must_be_coupled(self):
        for distribution in ('umf-access','umf-codegen'):
            value=synthetic_candidate01010(distribution);value['coreSource']['commit']='f'*40
            if distribution=='umf-access':publisher.validate_candidate01010_profile(value,distribution,'1'*40,value['tag'])
            else:
                with self.assertRaisesRegex(publisher.ReleaseError,'coupled Codegen/Core source'):
                    publisher.validate_candidate01010_profile(value,distribution,'1'*40,value['tag'])

    def test_reviewed_admission_hash_and_external_Q_S_join(self):
        value=synthetic_candidate01010();raw=json.dumps(value).encode()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'scripts/publish_core_pypi_release.py';path.parent.mkdir();path.write_bytes(b'synthetic reviewed Q')
            value['controller']['files'][str(path.relative_to(root))]=hashlib.sha256(path.read_bytes()).hexdigest();raw=json.dumps(value).encode()
            def git(argv,**kwargs):
                if argv[1]=='show' and argv[2].startswith('HEAD:'):return raw
                if argv[1]=='show':return path.read_bytes()
                if argv[2].startswith(value['controller']['commit']):return value['controller']['tree']+'\n'
                return value['source']['tree']+'\n'
            with patch('subprocess.check_output',side_effect=git):
                result=publisher.load_candidate01010_profile(root,'umf-core','1'*40,value['tag'],hashlib.sha256(raw).hexdigest())
                self.assertEqual(result['controller']['commit'],'5'*40)
                with self.assertRaisesRegex(publisher.ReleaseError,'admission digest differs'):
                    publisher.load_candidate01010_profile(root,'umf-core','1'*40,value['tag'],'f'*64)
                path.write_bytes(b'changed caller')
                with self.assertRaisesRegex(publisher.ReleaseError,'caller bytes differ'):
                    publisher.load_candidate01010_profile(root,'umf-core','1'*40,value['tag'],hashlib.sha256(raw).hexdigest())

    def test_core_has_no_self_publication_cycle(self):
        value=synthetic_candidate01010();value['corePublic']={'publication':{'future':'not-yet-uploaded'}}
        with self.assertRaisesRegex(publisher.ReleaseError,'own future publication'):
            publisher.validate_candidate01010_profile(value,'umf-core','1'*40,value['tag'])

    def test_candidate_archive_metadata_exact_dependency_not_same_version_alias(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for distribution,version,requires in [('umf-codegen','0.10.10','umf-core==0.10.10'),('umf-access','0.1.0.dev10','umf-core==0.10.10')]:
                path=root/(distribution.replace('-','_')+'-'+version+'-py3-none-any.whl')
                def create(requirement):
                    with zipfile.ZipFile(path,'w') as archive:
                        archive.writestr(distribution.replace('-','_')+'-'+version+'.dist-info/METADATA',
                            'Name: '+distribution+'\nVersion: '+version+'\nRequires-Dist: '+requirement+'\n'+
                            ("Requires-Dist: pydantic<3,>=2.13\nRequires-Dist: typing-extensions<5,>=4.16\nRequires-Dist: cryptography==50.0.2; extra == 'owner-authority'\nRequires-Dist: pglast==7.20; extra == 'sql-containment'\n" if distribution=='umf-access' else ''))
                create(requires);publisher._candidate_archive(path,distribution,version)
                with zipfile.ZipFile(path) as archive:
                    member=archive.namelist()[0];raw=archive.read(member)
                with zipfile.ZipFile(path,'w') as archive:
                    archive.writestr(member,raw+b'Requires-Dist: unexpected-package==1\n')
                with self.assertRaises(publisher.ReleaseError):publisher._candidate_archive(path,distribution,version)
                for wrong in ('umf-core==0.10.8','umf-core>=0.10.10','umf-core==0.10.10; python_version>="3.11"'):
                    create(wrong)
                    with self.subTest(distribution=distribution,requires=wrong),self.assertRaisesRegex(publisher.ReleaseError,'exact normal public Core dependency'):
                        publisher._candidate_archive(path,distribution,version)

    def test_source_valid_schema_cannot_fake_owner_qualification(self):
        import copy
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);value=synthetic_candidate01010()
            for name in value['files']:
                path=root/name
                metadata=b'Name: umf-core\nVersion: 0.10.10\n'
                raw=sdist(metadata,'0.10.10') if name.endswith('.tar.gz') else wheel(metadata,'0.10.10')
                path.write_bytes(raw);value['files'][name]=hashlib.sha256(raw).hexdigest()
            sums=dict(value['files'])
            for role,ref in value['proofs'].items():
                raw=json.dumps({'synthetic':True,'passed':True,'count':130}).encode()
                (root/ref['path']).write_bytes(raw);ref['sha256']=hashlib.sha256(raw).hexdigest();sums[ref['path']]=ref['sha256']
            pins={'schema':'umf.closed-01010-release-pins/1','source':value['source'],'coreSource':value['source'],
                'versions':{'sdk':'0.10.10','umf-core':'0.10.10','umf-codegen':'0.10.10'},
                'tag':value['tag'],'files':dict(sums),'resources':value['resources'],'protocols':value['protocols']}
            raw=json.dumps(pins).encode();(root/'release-pins.json').write_bytes(raw)
            value['releasePinsSha256']=hashlib.sha256(raw).hexdigest();sums['release-pins.json']=value['releasePinsSha256']
            raw=''.join(sha+'  '+name+'\n' for name,sha in sums.items()).encode();(root/'SHA256SUMS').write_bytes(raw)
            with patch.object(publisher,'load_candidate01010_profile',return_value=value):
                with self.assertRaisesRegex(publisher.ReleaseError,'actual qualification validator mapping pending'):
                    publisher.verify_candidate01010_packet(root,root,distribution='umf-core',source_sha='1'*40,tag=value['tag'],sums_sha256=hashlib.sha256(raw).hexdigest())
                first=next(iter(value['files']));(root/first).write_bytes(b'same-version substituted archive')
                with self.assertRaisesRegex(publisher.ReleaseError,'byte substitution'):
                    publisher.verify_candidate01010_packet(root,root,distribution='umf-core',source_sha='1'*40,tag=value['tag'],sums_sha256=hashlib.sha256(raw).hexdigest())



class H_P01ExternalActionsCustodyTests(unittest.TestCase):
    """Synthetic ONLY: exercise actual legacy Actions custody and new dataflow."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.assets=Path(self.temp.name);self.value=synthetic_candidate01010('umf-codegen')
        self.value['status']='qualified';self.sums={};self.metadata={}
        # Seal the shared release BEFORE producing any later public receipts.
        for distribution in ('umf-core','umf-codegen'):
            version,tag,names=publisher.CANDIDATE01010_PACKAGES[distribution]
            for name in names:
                raw_metadata=('Name: '+distribution+'\nVersion: '+version+'\n'+
                    ('Requires-Dist: umf-core==0.10.10\n' if distribution=='umf-codegen' else '')).encode()
                path=self.assets/name
                if name.endswith('.whl'):
                    with zipfile.ZipFile(path,'w') as archive:
                        archive.writestr(distribution.replace('-','_')+'-'+version+'.dist-info/METADATA',raw_metadata)
                else:
                    raw=sdist(raw_metadata,version)
                    path.write_bytes(raw)
                self.sums[name]=hashlib.sha256(path.read_bytes()).hexdigest()
                if distribution=='umf-codegen':self.value['files'][name]=self.sums[name]
        self.core_files={name:self.sums[name] for name in publisher.CANDIDATE01010_PACKAGES['umf-core'][2]}
        for ref in self.value['proofs'].values():
            raw=json.dumps({'synthetic':True}).encode();(self.assets/ref['path']).write_bytes(raw)
            ref['sha256']=hashlib.sha256(raw).hexdigest();self.sums[ref['path']]=ref['sha256']
        public=self.value['corePublic'];public['publication']['assertions']['/files']=self.core_files.copy()
        public['consumer']['assertions']['/nativeResourceInspection/wheelSHA256']=self.core_files['umf_core-0.10.10-cp311-abi3-manylinux_2_34_x86_64.whl']
        pins={'schema':'umf.closed-01010-release-pins/1','source':self.value['source'],
            'coreSource':self.value['coreSource'],'versions':{'sdk':'0.10.10','umf-core':'0.10.10','umf-codegen':'0.10.10'},
            'tag':self.value['tag'],'files':self.sums.copy(),'resources':self.value['resources'],'protocols':self.value['protocols']}
        raw=json.dumps(pins).encode();(self.assets/'release-pins.json').write_bytes(raw)
        self.value['releasePinsSha256']=hashlib.sha256(raw).hexdigest();self.sums['release-pins.json']=self.value['releasePinsSha256']
        self.sealed=''.join(sha+'  '+name+'\n' for name,sha in sorted(self.sums.items())).encode()
        (self.assets/'SHA256SUMS').write_bytes(self.sealed);self.sums_hash=hashlib.sha256(self.sealed).hexdigest()
        self.release={'tag_name':'umf-v0.10.10','draft':False,'prerelease':False,'immutable':True,
            'assets':[{'name':name,'digest':'sha256:'+sha} for name,sha in {**self.sums,'SHA256SUMS':self.sums_hash}.items()]}
        self.tag_ref={'ref':'refs/tags/umf-v0.10.10','object':{'type':'commit','sha':self.value['source']['commit']}}
        self.reader=publisher._candidate01010_actions_reader(self.value)
        self.reader.actions_metadata=lambda a:self.metadata[a['artifact_id']]
        self.patch_reader=patch.object(publisher,'_candidate01010_actions_reader',return_value=self.reader)
        self.patch_reader.start();self.addCleanup(self.patch_reader.stop)

    def validators(self,distribution):
        def synthetic_owner(value, proof, assets):
            self.assertEqual(proof,{'synthetic':True})
        return {(distribution,role,ref['validator']):synthetic_owner for role,ref in self.value['proofs'].items()}

    def original_source(self):
        return {'schema':'pypi-release-source.v1','status':'verified','repository':'DocumentDrivenDX/umf',
            'source_sha':self.value['coreSource']['commit'],'source_tree':self.value['coreSource']['tree'],
            'tag':'umf-v0.10.10','distribution':'umf-core','version':'0.10.10','files':self.core_files.copy(),
            'sums_sha256':self.sums_hash,'release_pins_sha256':self.value['releasePinsSha256']}

    def make_external(self,source=None):
        import copy
        self.receipts={}
        for role,ref in self.value['corePublic'].items():
            value={}
            for pointer,expected in ref['assertions'].items():
                cursor=value;parts=pointer.lstrip('/').split('/')
                for part in parts[:-1]:cursor=cursor.setdefault(part,{})
                cursor[parts[-1]]=copy.deepcopy(expected)
            self.receipts[role]=value
            self.resign(role,source=source)

    def resign(self,role,source=None):
        ref=self.value['corePublic'][role];a=ref['actions'];raw=json.dumps(self.receipts[role]).encode()
        (self.assets/ref['file']).write_bytes(raw);ref['sha256']=hashlib.sha256(raw).hexdigest()
        contents={a['member']:raw}
        if role=='publication':contents['source-receipt.json']=json.dumps(source or self.original_source()).encode()
        a['members']={name:hashlib.sha256(raw).hexdigest() for name,raw in contents.items()}
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as archive:
            for name,body in contents.items():archive.writestr(name,body)
        raw=stream.getvalue();a['artifact_sha256']=hashlib.sha256(raw).hexdigest()
        (self.assets/self.reader.actions_zip_name(ref)).write_bytes(raw)
        jobs=[{'id':20+i,'run_id':11,'head_sha':'d'*40,'name':name,'status':'completed','conclusion':'success',
               'started_at':'2026-11-03T12:00:00Z','completed_at':'2026-11-03T12:10:00Z'} for i,name in enumerate(('publish','installed-consumer'))]
        self.metadata[a['artifact_id']]={'run':{'id':11,'run_attempt':1,'head_sha':'d'*40,'head_branch':'main',
            'path':'.github/workflows/publish-pypi.yml','event':'workflow_dispatch','status':'completed','conclusion':'success',
            'repository':{'full_name':'DocumentDrivenDX/umf','id':1382276802,'owner':{'id':273466046}},
            'head_repository':{'id':1382276802}},'job':jobs[0 if role=='publication' else 1],
            'jobs':{'total_count':2,'jobs':jobs},'workflow':b'synthetic reviewed Core workflow',
            'artifact':{'id':a['artifact_id'],'name':a['artifact_name'],'expired':False,
                'digest':'sha256:'+a['artifact_sha256'],'created_at':'2026-11-03T12:05:00Z',
                'workflow_run':{'id':11,'head_sha':'d'*40,'head_branch':'main','repository_id':1382276802,'head_repository_id':1382276802}}}

    def verify(self):
        with patch.object(publisher,'load_candidate01010_profile',return_value=self.value):
            return publisher.verify_candidate01010_packet(self.assets,self.assets,distribution='umf-codegen',
                source_sha=self.value['source']['commit'],tag=self.value['tag'],sums_sha256=self.sums_hash)

    def test_sealed_release_precedes_Core_upload_and_later_original_Actions_custody(self):
        import copy
        core=synthetic_candidate01010();core.update(status='qualified',files=self.core_files.copy(),
            proofs=copy.deepcopy(self.value['proofs']),releasePinsSha256=self.value['releasePinsSha256'])
        # The real prepare function can validate Core BEFORE future public proofs.
        with patch.object(publisher,'load_candidate01010_profile',return_value=core),patch.dict(publisher.CANDIDATE01010_VALIDATORS,self.validators('umf-core')):
            source=publisher.prepare_candidate01010_release(root=self.assets,assets=self.assets,distribution='umf-core',
                source_sha=core['source']['commit'],tag=core['tag'],sums_sha256=self.sums_hash,
                release=self.release,tag_ref=self.tag_ref,tag_object=None,output_dir=self.assets/'core-stage')
        self.assertEqual(source['files'],self.core_files)
        self.assertFalse(any((self.assets/ref['file']).exists() for ref in self.value['corePublic'].values()))
        self.make_external(source)
        # Authentic original Actions receipts are independent; production owners
        # remain unmapped, so a source-only packet stops at that exact boundary.
        with self.assertRaisesRegex(publisher.ReleaseError,'actual qualification validator mapping pending: source'):
            self.verify()
        with patch.object(publisher,'load_candidate01010_profile',return_value=self.value),patch.dict(publisher.CANDIDATE01010_VALIDATORS,self.validators('umf-codegen')):
            receipt=publisher.prepare_candidate01010_release(root=self.assets,assets=self.assets,distribution='umf-codegen',
                source_sha=self.value['source']['commit'],tag=self.value['tag'],sums_sha256=self.sums_hash,
                release=self.release,tag_ref=self.tag_ref,tag_object=None,output_dir=self.assets/'codegen-stage')
        self.assertEqual(receipt['schema'],'pypi-release-source.v1')
        self.assertEqual((self.assets/'SHA256SUMS').read_bytes(),self.sealed)
        self.assertEqual((self.assets/'codegen-stage/SHA256SUMS').read_bytes(),self.sealed)
        self.assertEqual({row['name'] for row in self.release['assets']},set(self.sums)|{'SHA256SUMS'})
        for ref in self.value['corePublic'].values():
            for name in (ref['file'],self.reader.actions_zip_name(ref)):
                self.assertNotIn(name,self.sums);self.assertEqual((self.assets/'codegen-stage'/name).read_bytes(),(self.assets/name).read_bytes())

    def test_codegen_prepare_uses_selected_download_roster_and_keeps_full_catalog_authenticated(self):
        self.make_external()
        selected=publisher.candidate01010_release_download_roster(self.value,'umf-codegen')
        downloaded=self.assets/'selected-download';downloaded.mkdir()
        for name in selected: shutil.copyfile(self.assets/name,downloaded/name)
        # These four inputs are fetched separately from the original Core
        # Actions artifacts; none of the three Core release archives is needed.
        reader=self.reader
        external={name for ref in self.value['corePublic'].values()
                  for name in (ref['file'],reader.actions_zip_name(ref))}
        for name in external: shutil.copyfile(self.assets/name,downloaded/name)
        core_archives=set(publisher.CANDIDATE01010_PACKAGES['umf-core'][2])
        self.assertTrue(core_archives.isdisjoint(selected))
        self.assertTrue(core_archives.isdisjoint({p.name for p in downloaded.iterdir()}))
        with patch.object(publisher,'load_candidate01010_profile',return_value=self.value),\
             patch.dict(publisher.CANDIDATE01010_VALIDATORS,self.validators('umf-codegen')):
            receipt=publisher.prepare_candidate01010_release(root=self.assets,assets=downloaded,
                distribution='umf-codegen',source_sha=self.value['source']['commit'],tag=self.value['tag'],
                sums_sha256=self.sums_hash,release=self.release,tag_ref=self.tag_ref,tag_object=None,
                output_dir=self.assets/'selected-stage')
        self.assertEqual(receipt['status'],'verified')
        self.assertEqual(set(self.value['files']),set(publisher.CANDIDATE01010_PACKAGES['umf-codegen'][2]))
        self.assertEqual(publisher.parse_sums((downloaded/'SHA256SUMS').read_bytes()),self.sums)
        self.assertEqual({row['name'] for row in self.release['assets']},set(self.sums)|{'SHA256SUMS'})
        self.assertEqual((downloaded/'SHA256SUMS').read_bytes(),self.sealed)
        self.assertEqual((downloaded/'release-pins.json').read_bytes(),(self.assets/'release-pins.json').read_bytes())
        self.assertFalse(any((self.assets/'selected-stage'/name).exists() for name in core_archives))

    def test_codegen_selected_roster_missing_required_asset_refuses(self):
        self.make_external()
        selected=publisher.candidate01010_release_download_roster(self.value,'umf-codegen')
        downloaded=self.assets/'selected-download-missing';downloaded.mkdir()
        for name in selected: shutil.copyfile(self.assets/name,downloaded/name)
        for ref in self.value['corePublic'].values():
            for name in (ref['file'],self.reader.actions_zip_name(ref)):
                shutil.copyfile(self.assets/name,downloaded/name)
        (downloaded/next(name for name in self.value['files'] if name.endswith('.whl'))).unlink()
        with patch.object(publisher,'load_candidate01010_profile',return_value=self.value),\
             patch.dict(publisher.CANDIDATE01010_VALIDATORS,self.validators('umf-codegen')):
            with self.assertRaisesRegex(publisher.ReleaseError,'original asset absent or unsafe'):
                publisher.prepare_candidate01010_release(root=self.assets,assets=downloaded,
                    distribution='umf-codegen',source_sha=self.value['source']['commit'],tag=self.value['tag'],
                    sums_sha256=self.sums_hash,release=self.release,tag_ref=self.tag_ref,tag_object=None,
                    output_dir=self.assets/'missing-stage')

    def test_missing_original_artifact_or_substituted_external_receipt_refuses(self):
        self.make_external();ref=self.value['corePublic']['publication'];archive=self.assets/self.reader.actions_zip_name(ref)
        archive.unlink()
        with self.assertRaises(ValueError):self.verify()
        self.resign('publication');(self.assets/ref['file']).write_bytes(b'{"substituted":true}')
        with self.assertRaises(ValueError):self.verify()

    def test_wrong_original_run_job_artifact_controller_or_workflow_refuses(self):
        import copy
        self.make_external();original=copy.deepcopy(self.metadata)
        mutations=[('run','id',12),('run','head_sha','f'*40),('job','id',99),('artifact','digest','sha256:'+'0'*64),('workflow',None,b'changed workflow')]
        for scope,key,value in mutations:
            self.metadata=copy.deepcopy(original)
            if key is None:self.metadata[30][scope]=value
            else:self.metadata[30][scope][key]=value
            with self.subTest(scope=scope,key=key),self.assertRaises(ValueError):self.verify()

    def test_resigned_wrong_source_wheel_deep_outcome_or_release_hash_refuses(self):
        import copy
        self.make_external();original=copy.deepcopy(self.receipts)
        cases=('source','tree','release-hash','wheel','consumer-outcome')
        for case in cases:
            self.receipts=copy.deepcopy(original);source=self.original_source()
            if case=='source':source['source_sha']='f'*40
            if case=='tree':source['source_tree']='f'*40
            if case=='release-hash':source['sums_sha256']='f'*64
            if case=='wheel':self.receipts['publication']['files'][next(iter(self.core_files))]='f'*64
            if case=='consumer-outcome':self.receipts['consumer']['nativeResourceInspection']['inspectionCalls']=50
            self.resign('publication',source);self.resign('consumer')
            with self.subTest(case=case),self.assertRaises(ValueError):self.verify()

    def test_wrong_reader_source_pin_refuses_before_existing_reader_import(self):
        self.value['controller']['files']['scripts/publish_codegen_pypi_release.py']='f'*64
        self.patch_reader.stop()
        with patch('importlib.util.spec_from_file_location',side_effect=AssertionError('unverified reader import')):
            with self.assertRaisesRegex(publisher.ReleaseError,'reader source/controller hash differs'):
                publisher._candidate01010_actions_reader(self.value)

    def test_later_receipts_are_not_admitted_as_mutable_release_assets(self):
        self.make_external();ref=self.value['corePublic']['publication']
        sums={**self.sums,ref['file']:ref['sha256']}
        with self.assertRaisesRegex(publisher.ReleaseError,'outside immutable release checksums'):
            publisher._candidate01010_external_core_proofs(self.value,self.assets,sums,self.sums_hash)


if __name__ == "__main__":
    unittest.main()
