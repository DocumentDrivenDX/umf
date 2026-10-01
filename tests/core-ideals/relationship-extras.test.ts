import {expect,test} from 'bun:test';
import {relationshipExtraCases} from '../../scripts/core-ideals/relationship-extras-cases';
import {projectRelationshipToExtra,classifyRelationshipExtra,importRelationshipExtraArchive,verifyRelationshipExtra,recoverRelationshipExtraIdeal,recoverRelationshipExtraNative,readJsonValue,writeJsonValue,declareCoreRelationship,type Document,type RelationshipExtraArchive,type RelationshipExtraProjection,type RelationshipExtraSystem} from '../../src';
const cases=relationshipExtraCases();
for(const c of cases)test('CONTRACT-041 extras authored '+c.name,()=>{
 const before=JSON.stringify(c),r=projectRelationshipToExtra(c.source,c.author,c.request);expect(r.status).toBe(c.expected);expect(JSON.stringify(c)).toBe(before);
 expect(r.residuals.length).toBeGreaterThan(8);expect(r.diagnostics.length).toBe(r.residuals.length);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.nativeArchive).toBeUndefined();expect(r.mappings).toEqual([]);return;}
 expect(r.mappings.length).toBeGreaterThan(0);
 const fresh=importRelationshipExtraArchive(r.nativeArchive!,'fresh-native');
 const classified=classifyRelationshipExtra(fresh,{system:c.request.system,mode:'report',archive:r.nativeArchive!});
 expect(classified.target).toEqual(fresh);expect(classified.observations.length).toBeGreaterThan(0);
 expect(classified.observations.every(o=>o.provenance==='inferred'&&o.authorIntent==='unknown')).toBe(true);
 expect(classified.target!.modules.every(m=>!Object.hasOwn(m,'relationships'))).toBe(true);
 for(const format of ['json','yaml'] as const){
  const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as RelationshipExtraProjection;
  expect(recoverRelationshipExtraIdeal(saved,classified.target!)).toEqual(c.source);
  expect(recoverRelationshipExtraNative(saved,fresh).archive).toEqual(r.nativeArchive!);
  expect(recoverRelationshipExtraNative(classified,classified.target!).document).toEqual(fresh);
 }
 for(const row of r.mappings){let value:any=r.target;for(const part of row.nativePath.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~')))value=value[part];expect(value).toBeDefined();}
 for(const l of r.residuals){let value:any=l.path.startsWith('/request')?r:c.source;for(const part of l.path==='/'?[]:l.path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~')))value=value[part];expect(l.value).toEqual(value);}
});

test('CONTRACT-041 extras native-only archives retain unknown content without authoring',async()=>{
 const native:[RelationshipExtraSystem,RelationshipExtraArchive][]=[
  ['graphql',{format:'graphql-sdl',text:'# unknown comments\ndirective @future(text: String) on FIELD_DEFINITION\ntype Query { customer: Customer @future(text: "opaque") }\ntype Customer { id: ID }\n'}],
  ['rdf',{format:'rdf-nquads',blankNodeScope:'native-original',text:await Bun.file('fixtures/relationship-native/rdf-union-domain.nq').text()}],
  ['linkml',{format:'linkml-yaml',text:await Bun.file('fixtures/relationship-native/linkml-slot.yaml').text()}],
 ];
 for(const [system,archive] of native){
  const source=importRelationshipExtraArchive(archive,'original');source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:['9007199254740993',null]}};
  const r=classifyRelationshipExtra(source,{system,mode:'report',archive});
  expect(r.source).toEqual(source);expect(r.target).toEqual(source);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;const recovered=recoverRelationshipExtraNative(saved,r.target!);expect(recovered.document).toEqual(source);expect(recovered.archive).toEqual(archive);}
  const strict=classifyRelationshipExtra(source,{system,mode:'strict',archive});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
  expect(()=>classifyRelationshipExtra(source,{system,mode:'report',archive:{...archive,text:archive.text+'# changed\n'}})).toThrow();
 }
});

test('CONTRACT-041 extras stale authors, receipts, targets and accessors refuse',()=>{
 for(const system of ['graphql','rdf','linkml'] as const){
  const c=structuredClone(cases.find(c=>c.request.system===system&&c.expected==='projected')!);
  const r=projectRelationshipToExtra(c.source,c.author,c.request);
  const forged=structuredClone(r);forged.residuals.pop();expect(()=>verifyRelationshipExtra(forged)).toThrow('Forged or stale');
  const target=structuredClone(r.target!);target.extensions={future:{forged:true}};expect(()=>recoverRelationshipExtraIdeal(r,target)).toThrow('Forged or stale');
  const stale=structuredClone(c.source);stale.modules[0]!.elements.find(e=>e.kind==='record')!.name='changed';expect(()=>projectRelationshipToExtra(stale,c.author,c.request)).toThrow('Stale endpoint');
  let reads=0;const policy={...c.request};Object.defineProperty(policy,'records',{enumerable:true,get(){reads++;return c.request.records;}});expect(()=>projectRelationshipToExtra(c.source,c.author,policy)).toThrow('accessors');expect(reads).toBe(0);
 }
});

test('CONTRACT-041 extras every unsafe policy or unknown governing qualifier refuses atomically',()=>{
 const graph=()=>structuredClone(cases.find(c=>c.request.system==='graphql'&&c.expected==='projected')!);
 for(const ending of ['\n','\r','\u2028','\u2029']){const c=graph();c.request.records[0]!.name+=ending;expect(()=>projectRelationshipToExtra(c.source,c.author,c.request)).toThrow();}
 const mutations:((c:ReturnType<typeof graph>)=>void)[]=[c=>c.request.records.pop(),c=>c.request.records.push(c.request.records[0]!),c=>{(c.request as any).field='_umfRecord';},c=>{(c.request as any).root.typeName=c.request.records[0]!.name;},c=>{delete (c.request as any).inverseField;},c=>{c.request.records[0]!.element='missing';},c=>{(c.request as any).extra='ignored';}];
 for(const mutate of mutations){const c=graph();mutate(c);expect(()=>projectRelationshipToExtra(c.source,c.author,c.request)).toThrow();}
 const c=graph(),edited=structuredClone(c.source);(edited.modules[0]!.relationships as any[])[0].futureMeaning={unknown:true};
 const unknownAuthor=declareCoreRelationship(edited,{module:c.author.identity.module},c.author.request); // Presentation-only update retains unknown qualifiers.
 const r=projectRelationshipToExtra(unknownAuthor.target as unknown as Document,unknownAuthor,c.request);expect(r.status).toBe('blocked');expect(r.nativeArchive).toBeUndefined();
 const undirected=structuredClone(cases.find(c=>c.name==='undirected-rdf-report')!);delete undirected.request.orientation;expect(projectRelationshipToExtra(undirected.source,undirected.author,undirected.request).status).toBe('blocked');
});

test('CONTRACT-041 extras complete result schema rejects incomplete policy, source and native targets',async()=>{
 const {createValidator}=await import('../../src/validation/schema');const {relationshipExtrasSchema}=await import('../../src');const v=createValidator(false);
 for(const p of ['schema','field-document.schema','nullability-document.schema','cardinality-document.schema','facet-document.schema','key-document.schema','relationship-document.schema','relationship-operation.schema'])v.addSchema(await Bun.file('spec/core/'+p+'.json').json());
 const check=v.compile(relationshipExtrasSchema),c=cases.find(c=>c.expected==='projected')!,r=projectRelationshipToExtra(c.source,c.author,c.request);expect(check(r)).toBe(true);
 for(const mutate of [(x:any)=>delete x.author,(x:any)=>delete x.request.relationship.id,(x:any)=>delete x.nativeArchive,(x:any)=>x.mappings[0].provenance='inferred',(x:any)=>x.status='blocked']){const bad=structuredClone(r);mutate(bad);expect(check(bad)).toBe(false);}
});

test('CONTRACT-041 extras native identifiers reject scalar collisions and RDF injection while retaining Unicode IRIs',()=>{
 for(const name of ['String','Boolean','Int','Float','ID']){
  const c=structuredClone(cases.find(c=>c.request.system==='graphql'&&c.expected==='projected')!);c.request.records[0]!.name=name;expect(()=>projectRelationshipToExtra(c.source,c.author,c.request)).toThrow('built-in scalar');
 }
 for(const suffix of ['> <https://evil.test/p> <https://evil.test/o> .','\\x','\n','\r','\u2028','\u2029','\ud800','\u0000','\u007f']){
  const c=structuredClone(cases.find(c=>c.request.system==='rdf'&&c.expected==='projected')!);c.request.records[0]!.name+=suffix;expect(()=>projectRelationshipToExtra(c.source,c.author,c.request)).toThrow('native Record name');
 }
 const unicode=structuredClone(cases.find(c=>c.request.system==='rdf'&&c.expected==='projected')!);unicode.request.records[0]!.name='https://example.org/顧客/😀';
 const r=projectRelationshipToExtra(unicode.source,unicode.author,unicode.request);expect(r.nativeArchive!.text).toContain('https://example.org/顧客/😀');expect(recoverRelationshipExtraIdeal(r,r.target!)).toEqual(unicode.source);
});

test('CONTRACT-041 extras unknown LinkML metamodel is retained without claiming pinned interpretation',()=>{
 const archive:RelationshipExtraArchive={format:'linkml-json',text:JSON.stringify({id:'https://example.org/future',name:'future',metamodel_version:'99.0.0',classes:{Future:{slots:[]}}})};
 const source=importRelationshipExtraArchive(archive,'future');const r=classifyRelationshipExtra(source,{system:'linkml',mode:'report',archive});expect(r.status).toBe('blocked');expect(r.observations).toEqual([]);expect(r.source).toEqual(source);expect(r.request.archive).toEqual(archive);expect(r.residuals.some(l=>l.outcome==='unknown')).toBe(true);
});
