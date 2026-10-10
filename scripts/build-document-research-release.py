"""Publish authored collector tools and evidence; never redistribute acquired originals."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/helix/05-deploy/microsite/dist/research'
OUT.mkdir(parents=True, exist_ok=True)
paths = list((ROOT/'spec/domain-packs/legal-supreme-court').rglob('*'))
paths += list((ROOT/'scripts/domain-packs').glob('supreme-court-*.py'))
paths += [ROOT/'scripts/domain-packs/qualify-sec-acquisition.py',ROOT/'tests/domain-packs/supreme-court-mirror_test.py']
paths += list((ROOT/'tests/domain-packs/fixtures/supreme-court').glob('*'))
paths += list((ROOT/'scripts/qualification').glob('supreme-court-*.py'))
paths += list((ROOT/'docs/helix/04-build/evidence').glob('supreme-court-*'))
paths += list((ROOT/'docs/helix/04-build/evidence').glob('public-company-live-qualification.*'))
paths += [ROOT/p for p in ['docs/helix/02-design/contracts/CONTRACT-060-supreme-court-mirror.md','docs/helix/02-design/technical-designs/TD-061-supreme-court-mirror.md','docs/helix/03-test/test-plans/STP-061-supreme-court-mirror.md','docs/helix/04-build/supreme-court-mirror-plan.md','docs/helix/05-deploy/document-research.md']]
paths = sorted({p for p in paths if p.is_file()})
archive = OUT/'document-research-tools-1.0.0.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in paths:
        member='document-research-tools-1.0.0/'+p.relative_to(ROOT).as_posix()
        info=zipfile.ZipInfo(member,(2000,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=0o100644<<16
        z.writestr(info,p.read_bytes(),compresslevel=9)
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
release={'version':'1.0.0','scope':'Authored discovery/qualification tools and evidence; acquired original archive excluded because redistribution rights are unknown','bundles':[{'id':'document-research-tools','version':'1.0.0','reference':archive.name,'sha256':sha,'bytes':archive.stat().st_size}],'qualification':{'local_spark':'Spark 4.0.1 / Delta 4.0.0 / TableSpec 0.0.9 / umf-core 0.8.1; three court PDFs','live_sec':'pending genuine user-agent identity','live_databricks':'pending caller-designated targets'}}
(OUT/'release.json').write_text(json.dumps(release,indent=2)+'\n')
(OUT/'SHA256SUMS').write_text(sha+'  '+archive.name+'\n')
shutil.copy2(ROOT/'docs/helix/05-deploy/document-research.md',OUT/'README.md')
for name in ['supreme-court-spark-runtime.md','supreme-court-spark-runtime.json','public-company-live-qualification.md','public-company-live-qualification.json']:
    shutil.copy2(ROOT/'docs/helix/04-build/evidence'/name,OUT/name)
print(json.dumps(release))
