#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pin the historical SDK archive, every tar member, and its captured source cohort."""
import hashlib, json, os, pathlib, sys, tarfile

archive=pathlib.Path(os.environ['UMF_R8_RETIREMENT_ARCHIVE'])
package=pathlib.Path(os.environ['UMF_R8_RETIREMENT_ARCHIVE_ROOT'])
evidence=pathlib.Path('docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay')
archive_sha='5513efdca5ddb98fce9c5f8d9e105b07205bed1ebd8cd7cf87354e912da0a02e'
def sha(data): return hashlib.sha256(data).hexdigest()
if sha(archive.read_bytes()) != archive_sha: raise SystemExit('ce1acfb65 archive digest mismatch')
rust=json.loads((package/'dist/rust-default-manifest.json').read_text())
source=rust['sourceClosure']
if source['sha256']!='4d4fcdc18399339146e5cb710521f68124833adb5cbba6b19a4543bf07aee0e7' or source['capturedLiveSha256']!=source['sha256'] or source['transform']['status']!='fixed-point' or source['transform']['generatedInputs']:
 raise SystemExit('archive source closure identity is not the expected sealed fixed-point cohort')
with tarfile.open(archive,'r:gz') as tf:
 members={}
 for item in tf.getmembers():
  if item.isfile(): members[item.name]=sha(tf.extractfile(item).read())
manifest=json.loads((archive.parent/'manifest.json').read_text())
archive_member_map=manifest['sha256']
if any(members.get('package/'+name)!=digest for name,digest in archive_member_map.items()): raise SystemExit('outer dist member map mismatch')
member_path=evidence/'archive-members.json'
member_map={name.removeprefix('package/'):digest for name,digest in members.items()}
member_doc={'format':'umf.r8.relationship-retirement-archive-members/1','status':'pass','algorithm':'sha256','archiveSha256':archive_sha,'packageManifestSha256':member_map['package.json'],'archiveMemberCount':len(member_map),'verifiedMemberCount':len(member_map),'members':member_map}
member_bytes=(json.dumps(member_doc,indent=2)+'\n').encode()
(evidence/'archive-members.json').write_bytes(member_bytes)
source_doc={'format':'umf.r8.relationship-retirement-historical-source-cohort/1','status':'historical-fixed-point-at-build','sourceClosure':{'sha256':source['sha256'],'capturedLiveSha256':source['capturedLiveSha256'],'fileCount':source['fileCount'],'transform':source['transform'],'inputs':source['liveInputs']}}
source_bytes=(json.dumps(source_doc,indent=2)+'\n').encode()
(evidence/'archive-source-cohort.json').write_bytes(source_bytes)
(evidence/'archive-package.json').write_bytes((package/'package.json').read_bytes())
current_differences=[]
for name,digest in source['liveInputs'].items():
 path=pathlib.Path(name)
 if not path.is_file() or sha(path.read_bytes())!=digest: current_differences.append(name)
packet_names=[f'{name}.packet.json' for name in ['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation']]
missing_packets=[name for name in packet_names if name not in source['liveInputs']]
packet_pins={name:sha((evidence/name).read_bytes()) for name in packet_names}
fixtures=['scripts/core-relationship-cases.ts','scripts/core-relationship-operation-cases.ts','docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json']
fixture_pins={name:{'capturedArchiveSha256':source['liveInputs'].get(name),'currentSha256':sha(pathlib.Path(name).read_bytes())} for name in fixtures}
package_bytes=(package/'package.json').read_bytes()
rust_bytes=(package/'dist/rust-default-manifest.json').read_bytes()
outer_bytes=(archive.parent/'manifest.json').read_bytes()
cohort={'format':'umf.r8.relationship-retirement-cohort-pins/1','status':'historical-replay-only','archive':{'path':str(archive),'sha256':archive_sha,'bytes':archive.stat().st_size,'memberManifestPath':'archive-members.json','memberManifestSha256':sha(member_bytes),'archiveMemberCount':len(members),'packageManifestSha256':sha(package_bytes),'rustDefaultManifestSha256':sha(rust_bytes),'outerDistManifestSha256':sha(outer_bytes)},'sourceClosure':{'sha256':source['sha256'],'capturedLiveSha256':source['capturedLiveSha256'],'sourceInputCount':source['fileCount'],'capturedAtBuildFixedPoint':True,'currentCheckoutMatches':not current_differences,'currentDifferenceCount':len(current_differences),'currentDifferences':current_differences[:100],'sourceManifestPath':'archive-source-cohort.json','sourceManifestSha256':sha(source_bytes)},'packetPins':packet_pins,'packetsAbsentFromArchiveSourceClosure':missing_packets,'fixturePins':fixture_pins,'qualification':'Installed ce1acfb65 historical cohort replay only. This packet/harness and current checkout are outside the archived source closure; source-current retirement is blocked.'}
(evidence/'cohort-pins.json').write_text(json.dumps(cohort,indent=2)+'\n')
print(json.dumps({'archiveSha256':archive_sha,'archiveMemberCount':len(members),'sourceInputCount':source['fileCount'],'currentDifferences':len(current_differences),'packetsAbsentFromArchiveSourceClosure':missing_packets,'status':cohort['status']}))
