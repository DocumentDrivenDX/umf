import {readJsonValue} from '../../src/model/serialization';
import {ontology} from './ontology';
import {domains,archaeologyAssets,type Table} from './catalog';
import {readdir,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
const base='spec/domain-packs';
const encode=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const hash=(text:string)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');
const csv=(rows:unknown[][])=>rows.map(row=>row.map(v=>'"'+(v===null?'\\N':String(v)).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
function schema(table:Table){
 const columns=table.fields.map(field=>{
  const [left,target]=field.split('@'),[name,type='VARCHAR']=left!.split(':');
  return {name:name!.replace('?',''),data_type:type,nullable:name!.includes('?'),description:`Authored ${table.name} ${name!.replace('?','')}; synthetic reference scenario.`,...(type==='DECIMAL'?{precision:18,scale:2}:{})};
 });
 const foreign_keys=table.fields.filter(f=>f.includes('@')).map(f=>({column:f.split('@')[0]!.replace('?',''),references_table:f.split('@')[1]!,references_column:'id'}));
 return {version:'1.0',table_name:table.name,description:`Synthetic ${table.name}; illustrative, not population-valid or native-standard conformance.`,columns,primary_key:['id'],...(foreign_keys.length?{relationships:{foreign_keys}}:{})};
}
for(const domain of domains){
 const root=join(base,domain.id);await mkdir(join(root,'umf'),{recursive:true});await mkdir(join(root,'data'),{recursive:true});
 const specs=domain.tables.map(schema),sources:any={},source_bindings:any[]=[],schemas:any[]=[],identities:any={};
 for(const [i,table] of domain.tables.entries()){
  if(table.rows.some(row=>row.length!==table.fields.length))throw Error(domain.id+'/'+table.name+': fixture width mismatch');
  const spec=specs[i]!,reference='data/'+table.name+'.csv',text=csv([spec.columns.map(c=>c.name),...table.rows]);
  await Bun.write(join(root,'umf',table.name+'.json'),encode(spec));await Bun.write(join(root,reference),text);
  sources['template_'+table.name]={kind:'external',data_kind:'fabricated',reference,format:'csv',revision:'1.0.0',checksum:{algorithm:'sha256',value:hash(text)},license:{redistribution:'allowed',attribution:'UMF project, authored synthetic fixture'},provenance:{publisher:'UMF project',transformations:['Authored synthetic fixture; no real records or imported standard dataset.']}};
  source_bindings.push({schema_id:table.name,source_id:'template_'+table.name,role:'rows'});schemas.push({id:table.name,format:'tablespec',reference:'umf/'+table.name+'.json'});
  identities[table.name]=['id',...(spec.relationships?.foreign_keys.map(f=>f.column)??[])];
 }
 const assets:Record<string,string>={};
 if(domain.id==='construction')assets['plan.svg']='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect x="20" y="20" width="200" height="120" fill="none" stroke="black"/><text x="20" y="170">Synthetic construction plan; local grid</text></svg>\n';
 if(domain.id==='archaeology')Object.assign(assets,archaeologyAssets);
 for(const [name,text] of Object.entries(assets)){await Bun.write(join(root,'assets',name),text);sources['asset_'+name.replace('.','_')]={kind:'external',data_kind:'fabricated',reference:'assets/'+name,revision:'1.0.0',format:name.endsWith('.svg')?'svg':'text',checksum:{algorithm:'sha256',value:hash(text)},license:{redistribution:'allowed',attribution:'UMF authored synthetic illustration'}};}
 await Bun.write(join(root,'ontology.json'),encode(ontology(domain.id,specs)));schemas.push({id:'ontology',format:'umf',reference:'ontology.json'});
 const profile={version:'1.0.0',targets:{tabular:domain.tables.map(t=>t.name),graph:['ontology']},mode:'scenario-replay',scales:{small:1,demo:10,large:100},identity_columns:identities,include_sources:Object.keys(sources).filter(k=>k.startsWith('asset_')),qualification:'Independent scenario-component replay; count scaling only. No calibrated distributions, independently varied topology/time/effort, external native-standard conformance or graph-storage execution claim.'};
 const pack={id:domain.id,version:'1.0.0',description:domain.id+' synthetic reference scenarios with tabular and UMF ontology schemas.',domain_types:{native_identity:{description:'Source-qualified native literal; replay identities use exact JSON tuples.'},source_literal:{description:'Exact authored literal; methods, units and temporal conventions retain domain-specific meaning.'}},sources,source_bindings,schemas,execution_profile:profile,scenario_checks:domain.checks,fixture_counts:Object.fromEntries(domain.tables.map(t=>[t.name,t.rows.length])),qualification:{origin:'fabricated',native_conformance:'not claimed',graph_target:'schema candidate only; consumer acceptance required',scope:'Authored initial corpus; desired feature scope and deferred source/realism work remain separate.'}};
 await Bun.write(join(root,'pack.json'),encode(pack));
 const rows=domain.tables.map(t=>`| ${t.name} | ${t.rows.length} | ${t.fields.join(', ')} |`).join('\n');
 await Bun.write(join(root,'README.md'),`# ${domain.id} reference pack\n\nVersion 1.0.0. Authored synthetic fixtures only. Tables and ontology schemas are UMF-owned; TableSpec owns dataset replay/ingestion. Graph schema is a candidate for Truss/Ashlar binding, not tested native intake.\n\n## Inventory\n\n| Concept/table | Fixture rows | Authored fields |\n| --- | --- | --- |\n${rows}\n\n## Scenario checks\n\n${domain.checks.map(c=>'- '+c.id+': '+c.question).join('\n')}\n\n## Generation and limits\n\nUse TableSpec sample-data replay with this pack. Small/demo/large are 1/10/100 independent components. Seed and component ordinal namespace identity strings; all foreign keys follow that mapping. This scales row count, not population validity, time span or network complexity. Original literals and templates remain preserved.\n\nNo third-party dataset or native-standard vocabulary is bundled. Ecology is a synthetic scientific-method fixture; archaeology is a synthetic context/evidence corpus with illustrative SVGs, not Madaba Plains records or actual excavation photos. External source selection remains separately governed.\n`);
}
// Both delivered baselines also get schema-only graph targets, without changing rows.
for(const id of ['legal','medical']){
 const root=join(base,id),path=join(root,'pack.json'),pack:any=readJsonValue(await Bun.file(path).text(),'json');
 const declarations=pack.schemas.filter((s:any)=>s.format==='tablespec'),specs=await Promise.all(declarations.map((s:any)=>Bun.file(join(root,s.reference)).json()));
 await Bun.write(join(root,'ontology.json'),encode(ontology(id,specs)));
 pack.schemas=[...declarations,{id:'ontology',format:'umf',reference:'ontology.json'}];
 pack.execution_profile={version:'1.0.0',targets:{tabular:declarations.map((s:any)=>s.id),graph:['ontology']},mode:'fixed',include_sources:Object.keys(pack.sources??{}).filter(k=>!(pack.sources[k].reference??'').includes(':')),qualification:'Delivered tabular behavior unchanged. Graph schema candidate only; no graph storage acceptance.'};
 await Bun.write(path,encode(pack));
}
console.log(`Built ${domains.length} synthetic packs and two baseline ontology targets.`);

await Bun.write('fixtures/domain-packs/reviewed-checks.json',encode(Object.fromEntries(domains.map(d=>[d.id,{tables:d.tables,checks:d.checks}]))));
