#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Prepare exact redistributable bulk assets in a new external directory. No network."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def prepare(output,tag):
 if not tag.startswith('domain-pack-assets-') or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-.' for c in tag):raise ValueError('Dedicated asset tag required')
 rawlock=(ROOT/'scripts/assets/domain-packs.lock.json').read_bytes()
 pin=re.search(r'packLockSha256 = "([a-f0-9]{64})"',(ROOT/'scripts/assets/pack-lock-pin.ts').read_text())
 if not pin or hashlib.sha256(rawlock).hexdigest()!=pin.group(1):raise ValueError('Untrusted pack lock')
 lock=json.loads(rawlock)
 selected=[]
 for a in lock['assets']:
  parts=a['path'].split('/')
  if parts[3] in ('data','sources') and a['bytes']>65536 and a['rights']=='allowed' and (not a.get('url') or a.get('transport')=='github-release' and '/'+tag+'/' in a['url']):selected.append(a)
 if not selected:raise ValueError('No unpublished cleared bulk assets')
 if output.resolve().is_relative_to(ROOT.resolve()):raise ValueError('Publication staging must be outside checkout')
 # Preflight every original before creating any publication files.
 payloads=[]
 for a in selected:
  p=ROOT/a['path'];raw=p.read_bytes()
  if len(raw)!=a['bytes'] or hashlib.sha256(raw).hexdigest()!=a['sha256']:raise ValueError('Source bytes changed: '+a['path'])
  suffix=p.suffix.lower().lstrip('.')
  if not suffix or not suffix.isalnum():raise ValueError('Unsupported extension')
  payloads.append((a,a['sha256']+'.'+suffix,raw))
 output.mkdir(mode=0o700)
 records=[];provenance=[]
 for a,name,raw in payloads:
  (output/name).write_bytes(raw)
  records.append({'path':a['path'],'bytes':a['bytes'],'sha256':a['sha256'],
                  'url':'https://github.com/DocumentDrivenDX/umf/releases/download/'+tag+'/'+name,
                  'downloadMediaType':'application/octet-stream'})
  source={k:v for k,v in a.items() if k not in ('transport','downloadMediaType')}
  if a.get('transport')=='github-release':source.pop('url',None)
  provenance.append(source)
 publication={'version':1,'baseline':lock['revision'],'releaseTag':tag,'assets':records}
 (output/'published-assets.json').write_text(json.dumps(publication,indent=2)+'\n')
 (output/'asset-provenance.json').write_text(json.dumps({'baseline':lock['revision'],'assets':provenance},indent=2)+'\n')
 notice='''UMF domain-pack assets: source-qualified original bytes and derived data.\nThese files retain their per-source rights and attribution, recorded in asset-provenance.json.\nNo new native compatibility, data completeness or SDK qualification is claimed.\nDecision pages derive from official judicial opinions/orders; financial inputs retain SEC/UMF source lineage.\nThe DICOM sample retains its TCIA license and de-identification limits; see the included source notice.\n'''
 (output/'NOTICE.txt').write_text(notice)
 (output/'medical-imaging-NOTICE.txt').write_bytes((ROOT/'spec/domain-packs/medical-imaging/licenses/NOTICE.txt').read_bytes())
 files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir()) if p.is_file()}
 (output/'SHA256SUMS').write_text(''.join(h+'  '+name+'\n' for name,h in files.items()))
 return {'directory':str(output),'assets':len(selected),'bytes':sum(a['bytes'] for a in selected),'releaseTag':tag}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--tag',required=True);a=p.parse_args();print(json.dumps(prepare(a.output,a.tag)))
