"""Publish authored collector tools and evidence; never redistribute acquired originals."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/helix/05-deploy/microsite/dist/research'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=Path, help='Build an optional local ZIP at this caller-selected path')
args = parser.parse_args()
shutil.rmtree(OUT, ignore_errors=True)
OUT.mkdir(parents=True, exist_ok=True)
paths = list((ROOT/'spec/domain-packs/legal-supreme-court').rglob('*'))
paths += list((ROOT/'scripts/domain-packs').glob('supreme-court-*.py'))
paths += [ROOT/'scripts/domain-packs/qualify-sec-acquisition.py',ROOT/'tests/domain-packs/supreme-court-mirror_test.py',ROOT/'scripts/build-document-research-release.py',ROOT/'scripts/build-domain-pack-releases.ts']
paths += list((ROOT/'tests/domain-packs/fixtures/supreme-court').glob('*'))
paths += list((ROOT/'scripts/qualification').glob('supreme-court-*.py'))
paths += list((ROOT/'docs/helix/04-build/evidence').glob('supreme-court-*'))
paths += list((ROOT/'docs/helix/04-build/evidence').glob('public-company-live-qualification.*'))
paths += [ROOT/p for p in ['docs/helix/02-design/contracts/CONTRACT-060-supreme-court-mirror.md','docs/helix/02-design/technical-designs/TD-061-supreme-court-mirror.md','docs/helix/03-test/test-plans/STP-061-supreme-court-mirror.md','docs/helix/04-build/supreme-court-mirror-plan.md','docs/helix/05-deploy/document-research.md']]
paths = sorted({p for p in paths if p.is_file()})
artifacts = []
for p in paths:
    reference = 'tools/' + p.relative_to(ROOT).as_posix()
    target = OUT/reference
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, target)
    artifacts.append({'reference':reference,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
if args.archive is not None:
    args.archive.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in paths:
            member='document-research-tools-1.0.1/'+p.relative_to(ROOT).as_posix()
            info=zipfile.ZipInfo(member,(2000,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            z.writestr(info,p.read_bytes(),compresslevel=9)
release={'version':'1.0.1','scope':'Individual authored discovery/qualification tools and evidence; generated archives are consumer-built','artifacts':artifacts,'qualification':{'local_spark':'Spark 4.0.1 / Delta 4.0.0 / TableSpec 0.0.9 / umf-core 0.8.1; three court PDFs','live_sec':'pending genuine user-agent identity','live_databricks':'pending caller-designated targets'}}
(OUT/'release.json').write_text(json.dumps(release,indent=2)+'\n')
(OUT/'SHA256SUMS').write_text(''.join(a['sha256']+'  '+a['reference']+'\n' for a in artifacts))
shutil.copy2(ROOT/'docs/helix/05-deploy/document-research.md',OUT/'README.md')
for name in ['supreme-court-spark-runtime.md','supreme-court-spark-runtime.json','public-company-live-qualification.md','public-company-live-qualification.json']:
    shutil.copy2(ROOT/'docs/helix/04-build/evidence'/name,OUT/name)
print(json.dumps({'version':release['version'],'artifacts':len(artifacts),'local_archive':str(args.archive) if args.archive else None}))
