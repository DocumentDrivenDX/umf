import {expect,test} from 'bun:test';
import {parseEntry,type Entry} from '../../docs/helix/05-deploy/microsite/explorer-model';
import {ontologyModel} from '../../docs/helix/05-deploy/microsite/ontology-view';

test('ontology inspection separates records and fields without changing relationship meaning',async()=>{
 const text=await Bun.file('spec/domain-packs/ecology/ontology.json').text();
 const entry:Entry={id:'ecology',title:'ecology',category:'domain',path:'ontology.json',text,format:'json'};
 const model=ontologyModel(parseEntry(entry));
 expect(model.records).toHaveLength(19);expect(model.fields).toHaveLength(81);expect(model.edges).toHaveLength(20);
 expect(model.edges.map(e=>e.value)).toEqual(JSON.parse(text).modules[0].relationships);
 expect(new Set(model.records.map(r=>r.key)).size).toBe(19);
 expect(new Set(model.edges.map(e=>e.key)).size).toBe(20);
});
test('catalog owns each ontology once and retains legacy deep-link aliases',async()=>{
 const catalog=await Bun.file('docs/helix/05-deploy/microsite/dist/schema-catalog.json').json();
 const canonical=catalog.entries.find((e:any)=>e.id==='schema:ecology@1.0.0:ontology');
 expect(canonical.pack).toBe('ecology');
 expect(canonical.aliases).toContain('spec/domain-packs/ecology/ontology.json');
 expect(catalog.entries.some((e:any)=>e.id==='spec/domain-packs/ecology/ontology.json')).toBe(false);
 expect(catalog.entries.filter((e:any)=>e.text===canonical.text)).toHaveLength(1);
});
