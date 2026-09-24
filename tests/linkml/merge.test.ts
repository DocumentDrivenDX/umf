import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/linkml/merge-schema.json';
import {proposeLinkmlImportMerge,importLinkmlDocument,exportLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,readDocument,writeDocument} from '../../src';
const fixture=await Bun.file('fixtures/linkml/merge/results.json').json(),cases=fixture.cases;
test('US-024-AC9: both explicit precedence policies preserve context and candidate round trips',async()=>{
 const check=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema),native=await Bun.file('fixtures/linkml/merge/oracle-results.json').json();
 expect(native.results.filter((r:any)=>r.comparison==='normalized-candidate')).toHaveLength(8);expect(native.results.filter((r:any)=>r.comparison==='unresolved')).toHaveLength(4);
 for(const c of cases)for(const row of c.reports){const r=proposeLinkmlImportMerge(row.report.context,{mode:row.mode});expect(r).toEqual(row.report);expect(check(r)).toBe(true);expect(r.complete).toBe(false);for(const s of r.context.schemas)expect(exportLinkmlDocument(s.document)).toBe(c.sources.find((x:any)=>x.key===s.key).text);if(r.candidate){expect(exportLinkmlDocument(readDocument(writeDocument(r.candidate,row.format),row.format))).toBe(row.output);expect(getLinkmlDocumentNode(r.candidate,'/imports')).toEqual({kind:'array',items:[]});}else expect(r.status).toBe('blocked');}
});
test('US-024-AC9: lookup and merge_imports differ on imported collisions; root and provenance survive',()=>{
 const c=cases.find((c:any)=>c.id==='diamond'),view=proposeLinkmlImportMerge(c.context,{mode:'view'}),merge=proposeLinkmlImportMerge(c.context,{mode:'merge-imports'});
 expect(view.selections.find(s=>s.collection==='classes'&&s.name==='Collision')!.winner).toBe('right');expect(merge.selections.find(s=>s.collection==='classes'&&s.name==='Collision')!.winner).toBe('shared');
 for(const r of [view,merge]){expect(r.selections.find(s=>s.collection==='classes'&&s.name==='RootWins')!.winner).toBe('root');expect(getLinkmlDocumentNode(r.candidate!,'/description')).toEqual({kind:'string',value:'Schema metadata root'});const winner=r.selections.find(s=>s.collection==='classes'&&s.name==='Collision')!.winner;expect(getLinkmlDocumentNode(r.candidate!,'/classes/Collision/from_schema')).toEqual({kind:'string',value:'https://example.org/'+winner});expect(getLinkmlDocumentNode(r.candidate!,'/classes/Collision/attributes/local/from_schema')).toEqual({kind:'string',value:'https://example.org/'+winner});expect(r.context.schemas.map(s=>s.key)).toContain('unused');}
 view.context.schemas[0]!.key='mutated';expect(c.context.schemas[0].key).toBe('root');
});
test('US-024-AC9: ambiguous policy and malformed dictionaries cannot produce a candidate',()=>{
 const c=cases.find((c:any)=>c.id==='diamond');expect(()=>proposeLinkmlImportMerge(c.context,{} as any)).toThrow();
 for(const [path,value] of [['/classes','[]'],['/id','123'],['/classes/root_own/attributes','[]']] as const){const context=structuredClone(c.context);context.schemas[0].document=proposeLinkmlDocumentNodeEdit(context.schemas[0].document,path,value).document;const r=proposeLinkmlImportMerge(context,{mode:'view'});expect(r.status).toBe('blocked');expect(r.candidate).toBeUndefined();expect(r.selections).toEqual([]);}
});

test('US-024-AC9: unknown imported metadata and overwritten provenance remain recoverable',()=>{
 const c=structuredClone(cases.find((c:any)=>c.id==='diamond')),s=c.sources.find((s:any)=>s.key==='right'),native=JSON.parse(s.text);native.future_root={meaning:'retained in context'};native.classes.Collision.future_definition={meaning:'retained in candidate'};s.text=JSON.stringify(native);c.context.schemas.find((s:any)=>s.key==='right').document=importLinkmlDocument(s.text,{id:'right',format:'json'});const r=proposeLinkmlImportMerge(c.context,{mode:'view'});
 expect(r.status).toBe('candidate');expect(exportLinkmlDocument(r.context.schemas.find(s=>s.key==='right')!.document)).toBe(s.text);expect(getLinkmlDocumentNode(r.candidate!,'/classes/Collision/future_definition/meaning')).toEqual({kind:'string',value:'retained in candidate'});expect(getLinkmlDocumentNode(r.context.schemas.find(s=>s.key==='right')!.document,'/classes/Collision/from_schema')).toEqual({kind:'string',value:'https://example.org/original-provenance'});expect(r.diagnostics.some(d=>d.code==='LINKML_MERGE_CONTEXT'&&d.message.includes('imported top-level metadata'))).toBe(true);
});
