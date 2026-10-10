"""@covers US-078-AC5 Independent ZIP/source/row/relationship and DuckDB checks."""
import argparse,csv,hashlib,io,json
from decimal import Decimal
from pathlib import Path
from zipfile import ZipFile
import duckdb
p=argparse.ArgumentParser();p.add_argument('--archive',required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[2]/'spec/domain-packs/public-company-intelligence';pack=json.loads((root/'pack.json').read_text())
db=duckdb.connect();tables={};total=0
with ZipFile(args.archive) as z:
 manifest=json.loads(z.read('manifest.json'));assert json.loads(z.read('domain-pack.json'))==pack
 assert manifest['origin']=='external' and manifest['seed'] is None
 for declaration in pack['schemas']:
  assert z.read(manifest['schema_artifacts'][declaration['reference']])==(root/declaration['reference']).read_bytes()
 for reference,member in manifest['source_artifacts'].items():assert z.read(member)==(root/reference).read_bytes()
 for name in pack['execution_profile']['targets']['tabular']:
  spec=json.loads((root/f'umf/{name}.json').read_text());binding=next(b for b in pack['source_bindings'] if b['schema_id']==name and b['role']=='rows');source=pack['sources'][binding['source_id']]
  original=list(csv.DictReader(io.StringIO((root/source['reference']).read_text())));actual=list(csv.DictReader(io.StringIO(z.read(manifest['tables'][name]['file']).decode())))
  assert actual==original,(name,'exact source cell difference');assert len(actual)==manifest['tables'][name]['rows']==pack['fixture_counts'][name]
  assert len({r['id'] for r in actual})==len(actual);tables[name]=(spec,actual);total+=len(actual)
  columns=[c['name'] for c in spec['columns']];db.execute('CREATE TABLE "'+name+'" ('+','.join('"'+c+'" VARCHAR' for c in columns)+')')
  if actual:db.executemany('INSERT INTO "'+name+'" VALUES ('+','.join('?' for c in columns)+')',[[None if r[c]=='\\N' else r[c] for c in columns] for r in actual])
  for c in spec['columns']:
   if not c['nullable']:assert all(r[c['name']]!='\\N' for r in actual)
 for name,(spec,actual) in tables.items():
  for fk in spec.get('relationships',{}).get('foreign_keys',[]):
   parents={r[fk['references_column']] for r in tables[fk['references_table']][1]};assert all(r[fk['column']]=='\\N' or r[fk['column']] in parents for r in actual),(name,fk)
 for r in tables['financial_observations'][1]:
  native=json.loads(r['native_json'],parse_float=Decimal,parse_int=Decimal)
  if r['value_state']=='present':assert Decimal(r['value'])==native['val']
  elif r['value_state']=='absent':assert 'val' not in native and r['value']=='\\N'
  else:assert native['val'] is None and r['value']=='\\N'
 # The reviewed SELECT is a fixed repository query, not arbitrary manifest SQL.
 sql="SELECT DISTINCT f.company_id,f.accession FROM filings f JOIN business_events e ON e.filing_id=f.id WHERE e.native_item IN ('2.01','2.05') ORDER BY f.company_id,f.accession"
 assert pack['scenario_checks'][0]['sql']==sql
 assert [list(r) for r in db.execute(sql).fetchall()]==[['0000034088','0001193125-26-291986'],['0000858877','0000858877-26-000075']]
 assert db.execute("SELECT COUNT(*) FROM documents WHERE availability='unavailable-http-403'").fetchone()[0]==25
 assert db.execute("SELECT COUNT(*) FROM opportunity_hypotheses WHERE review_status='unreviewed-authored-hypothesis'").fetchone()[0]==2
print(json.dumps({'engine':'DuckDB '+duckdb.__version__,'tables':len(tables),'rows':total,'source_artifacts':len(manifest['source_artifacts']),'scenario_accessions':2,'archive_sha256':hashlib.sha256(Path(args.archive).read_bytes()).hexdigest()}))
