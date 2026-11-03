# SPDX-License-Identifier: MIT OR Apache-2.0
import copy,importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('public_probe',Path(__file__).with_name('probe_public_core_release.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Controls(unittest.TestCase):
 def report(self):return {'install':[{'metadata':{'name':'umf_core','version':'0.10.8'},'download_info':{'url':'https://files.pythonhosted.org/packages/core.whl','archive_info':{'hashes':{'sha256':m.WHEEL}}}}]}
 def test_public_index_exact_hash_and_version(self):self.assertEqual(m.validate_report(self.report())['metadata']['version'],'0.10.8')
 def test_wrong_origin_version_digest_and_duplicate_refuse(self):
  for mutate in [lambda r:r['install'][0]['download_info'].update(url='file:///tmp/core.whl'),lambda r:r['install'][0]['download_info'].update(url='https://github.com/Core.whl'),lambda r:r['install'][0]['metadata'].update(version='0.10.7'),lambda r:r['install'][0]['download_info']['archive_info']['hashes'].update(sha256='f'*64),lambda r:r['install'].append(r['install'][0]),lambda r:r['install'].clear()]:
   r=copy.deepcopy(self.report());mutate(r)
   with self.assertRaises(ValueError):m.validate_report(r)


import importlib.util,hashlib,io,tarfile,tempfile,unittest
from pathlib import Path
archive_spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('verify_core_release_source_archive.py'));archive_module=importlib.util.module_from_spec(archive_spec);archive_spec.loader.exec_module(archive_module)
class ArchiveControls(unittest.TestCase):
 def sample(self,root,mutate=None):
  data=b'original bytes\r\n';mode='100755';name='script';oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();roster={name:(mode,oid)};entries=[(name,data,0o755)]
  if mutate:mutate(roster,entries)
  file=root/'source.tar.gz'
  with tarfile.open(file,'w:gz',format=tarfile.PAX_FORMAT,pax_headers={'comment':archive_module.SOURCE})as t:
   for name,b,perm in entries:
    info=tarfile.TarInfo(archive_module.PREFIX+name);info.mode=perm;info.size=len(b);t.addfile(info,io.BytesIO(b))
  return file,roster
 def test_complete_byte_and_mode_correspondence(self):
  with tempfile.TemporaryDirectory()as d:
   f,r=self.sample(Path(d));self.assertEqual(archive_module.verify_tar(f,r)['trackedMembersVerified'],1)
 def test_extra_missing_duplicate_changed_and_exec_refuse(self):
  for mutate in [lambda r,e:e.append(('extra',b'bytes',0o644)),lambda r,e:e.clear(),lambda r,e:e.append(e[0]),lambda r,e:e.__setitem__(0,('script',b'changed',0o755)),lambda r,e:e.__setitem__(0,('script',e[0][1],0o644)),lambda r,e:e.__setitem__(0,('../escape',e[0][1],0o755))]:
   with tempfile.TemporaryDirectory()as d:
    f,r=self.sample(Path(d),mutate)
    with self.assertRaises(ValueError):archive_module.verify_tar(f,r)
class PublisherWiringControls(unittest.TestCase):
 def test_closed_0108_source_and_postpublication_public_proof_wiring(self):
  source=(Path(__file__).resolve().parents[1]/'.github/workflows/publish-pypi.yml').read_text()
  self.assertIn('test "$TARGET_TAG" = umf-v0.10.8',source)
  self.assertIn('test "$SOURCE_SHA" = '+m.SOURCE,source)
  self.assertIn('test "$LOCALLY_QUALIFIED" != true',source)
  self.assertIn('verify_core_release_source_archive.py --repo .',source)
  self.assertIn('cp incoming/source-archive.json dist/source-archive.json',source)
  consumer=source.split('  installed-consumer:\n',1)[1]
  self.assertIn('needs: [verify-release, publish]',consumer)
  self.assertIn('INSTALL_ARGS+=(--no-compile --report',consumer)
  self.assertNotIn('--no-deps',consumer)
  self.assertIn('--index-url https://pypi.org/simple "umf-core==$VERSION"',consumer)
  self.assertIn('probe_public_core_release.py',consumer)
  self.assertIn('temporal_resume.py inventory',consumer)
  self.assertIn('if: always() && inputs.tag ==',consumer)
  self.assertIn('umf-core-public-correspondence-0.10.8-${{ github.run_id }}',consumer)
  self.assertIn('if: ${{ inputs.locally_qualified != true }}',consumer)
  self.assertNotIn('umf-codegen',consumer)

if __name__=='__main__':unittest.main()
