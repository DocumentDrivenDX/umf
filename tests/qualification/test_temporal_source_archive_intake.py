# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pure pre-tag transport/wiring refusals; no full archive/native execution."""
from pathlib import Path
import copy,hashlib,importlib.util,io,json,tempfile,unittest,urllib.error
from unittest.mock import Mock,patch
ROOT=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('intake',ROOT/'tools/temporal_source_archive_intake.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Controls(unittest.TestCase):
 def values(self):
  release={'id':101,'draft':True,'prerelease':True,'published_at':None,'tag_name':m.TAG,'name':m.TAG,'target_commitish':m.SOURCE,'body':m.BODY,'assets':[{'id':201+n,'name':name,'state':'uploaded','size':size,'digest':'sha256:'+sha}for n,(name,(size,sha))in enumerate(m.FILES.items())]}
  return release,{'ref':'refs/tags/'+m.TAG,'object':{'type':'commit','sha':m.SOURCE}}
 def test_closed_draft_source_assets_and_tag(self):
  r,t=self.values();self.assertEqual(set(m.validate_release(r,t,101)),set(m.FILES))
  for mutate in [lambda r,t:r.update(id=101.0),lambda r,t:r.update(draft=False),lambda r,t:r.update(published_at='now'),lambda r,t:r.update(target_commitish='f'*40),lambda r,t:r.update(tag_name='umf-v0.10.8'),lambda r,t:t['object'].update(sha='f'*40),lambda r,t:r['assets'].append(r['assets'][0]),lambda r,t:r['assets'][0].update(size=float(m.FILES[m.ARCHIVE][0])),lambda r,t:r['assets'][0].update(size=1),lambda r,t:r['assets'][0].update(digest='sha256:'+'f'*64),lambda r,t:r['assets'][1].update(id=201)]:
   r,t=self.values();mutate(r,t)
   with self.assertRaises(ValueError):m.validate_release(r,t,101)
  r,t=self.values()
  for identity in [True,0,-1,102]:
   with self.assertRaises(ValueError):m.validate_release(r,t,identity)
 def test_unpinned_or_resigned_manifest_cannot_choose_new_archive_or_modes(self):
  with self.assertRaises(ValueError):m.validate_manifest(b'{}')
  fixture={'profile':'umf.source-archive-transport/1','unqualifiedTransportOnly':True,'sourceCommit':m.SOURCE,'sourceTree':m.TREE,'archive':{'filename':m.ARCHIVE,'bytes':m.FILES[m.ARCHIVE][0],'sha256':m.FILES[m.ARCHIVE][1]},'gitObjectRoster':{'count':70549,'sha256':'6c46d53fd58f10ee7107f93f045521f40320fb9094a8b62214d54dbbb1a30481'},'producerPolicy':{'tarUmask':'0002','regular':'0664','executable':'0775','directory':'0775','symlink':'0777','typeAndSpecialBits':'Exact Git archive classes; special permission bits refused'},'scope':'synthetic, no qualification'}
  for mutate,ok in [(lambda x:None,True),(lambda x:x['producerPolicy'].update(executable='0755'),False),(lambda x:x.update(sourceCommit='f'*40),False),(lambda x:x.update(extra=True),False)]:
   x=copy.deepcopy(fixture);mutate(x);raw=json.dumps(x).encode();pins=dict(m.FILES);pins[m.MANIFEST]=(len(raw),hashlib.sha256(raw).hexdigest())
   with patch.object(m,'FILES',pins):
    if ok:m.validate_manifest(raw)
    else:
     with self.assertRaises(ValueError):m.validate_manifest(raw)
 def response(self,payload):
  r=io.BytesIO(payload);r.status=200;return r
 def test_download_direct_hash_length_and_no_authorization_redirect(self):
  asset={'id':7,'size':3,'digest':'sha256:'+hashlib.sha256(b'abc').hexdigest()}
  with tempfile.TemporaryDirectory()as d:
   opener=Mock();opener.open.return_value=self.response(b'abc')
   with patch.object(m.urllib.request,'build_opener',return_value=opener):m.download(Path(d)/'direct',asset,'secretfixture')
   opener.open.side_effect=urllib.error.HTTPError('api',302,'redirect',{'Location':'https://objects.githubusercontent.com/bytes'},None)
   with patch.object(m.urllib.request,'build_opener',return_value=opener),patch.object(m.urllib.request,'urlopen',return_value=self.response(b'abc'))as dl:
    m.download(Path(d)/'redirect',asset,'secretfixture');self.assertEqual(dl.call_args.args,('https://objects.githubusercontent.com/bytes',))
   for data in [b'abcd',b'bad']:
    opener=Mock();opener.open.return_value=self.response(data)
    with patch.object(m.urllib.request,'build_opener',return_value=opener):
     with self.assertRaises(ValueError):m.download(Path(d)/('bad'+str(len(data))),asset,'secretfixture')
 def test_only_one_source_job_no_product_or_native_commands(self):
  s=(ROOT/'.github/workflows/sagas.yml').read_text();job=s.split('  pretag-source-archive:\n',1)[1]
  self.assertIn("inputs.temporal_phase == 'source-archive'",job);self.assertIn('timeout-minutes: 20',job);self.assertIn("python-version: '3.13.17'",job);self.assertIn('contents: write',job)
  self.assertNotIn('matrix:',job)
  for text in ['cargo ','bun ','pip install','git archive','gh release','publish-pypi']:self.assertNotIn(text,job)
  verify=job.split('      - name: Verify all retained source members',1)[1].split('      - name:',1)[0]
  self.assertNotIn('GH_TOKEN',verify);self.assertNotIn('github.token',verify)
  self.assertIn('verify_core_release_source_archive.py',verify)
  self.assertIn('!${{ runner.temp }}/pretag-source-archive/umf-v0.10.8-source.tar.gz',job)
if __name__=='__main__':unittest.main()
