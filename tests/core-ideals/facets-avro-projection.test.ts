import {test,expect} from 'bun:test';
import * as u from '../../src';
import type {FacetsAvroRequest} from '../../src';
const {projectFacetsToAvro:project,recoverFacetsFromAvro:recover}=u;
const identity={module:'m',element:'value'};
function ideal(scalarType:string):u.Document{return {umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]}]};}
const request:FacetsAvroRequest={id:'native',recordName:'Record',namespace:'example',fieldName:'value',nativeType:'int',mode:'strict',encoding:'native-type',profile:'declared-schema',obligation:'value-domain'};
const author=(family:string,facets:u.CoreFacetPatch)=>u.declareCoreFacets(ideal(family),identity,facets);
test('authored domains distinguish exact carriers from unenforced approximations',()=>{
 const signed=author('integer',{integerWidth:{bits:32,signed:true}});
 expect(project(signed,request).mapping.facets).toEqual({integerWidth:{bits:32,signed:true}});
 for(const integerWidth of [{bits:8,signed:true},{bits:32,signed:false},{bits:64,signed:true}]){
  const a=author('integer',{integerWidth});expect(project(a,request).status).toBe('blocked');
  const r=project(a,{...request,mode:'report'});expect(r.status).toBe('projected');expect(r.mapping.facets).toEqual({});expect(r.residuals.length).toBeGreaterThan(0);
 }
 const text=author('string',{length:{max:2,unit:'unicode-scalar'}});
 for(const encoding of ['native-type','metadata-only','carrier-only'] as const){const r=project(text,{...request,nativeType:'string',encoding,mode:'report'});expect(r.mapping.outcome).toBe('not-expressible');expect(r.nativeSchema!.includes('umfFacets')).toBe(encoding==='metadata-only');expect(project(text,{...r.request,mode:'strict'}).status).toBe('blocked');}
 const decimal=author('decimal',{precision:3,scale:2});expect(project(decimal,{...request,nativeType:'decimal-bytes'}).status).toBe('projected');
 for(const profile of ['apache-datum-writer','fastavro-schemaless-writer'] as const)expect(project(decimal,{...request,nativeType:'decimal-bytes',profile}).status).toBe('blocked');
 expect(project(signed,{...request,profile:'fastavro-schemaless-writer'}).status).toBe('blocked');
});
test('fixed bounds preserve lower-bound losses and refuse impossible or oversized carriers',()=>{
 for(const max of [0,2]){const a=author('binary',{length:{max,unit:'byte'}}),r=project(a,{...request,nativeType:'fixed',fixedName:'Bytes',fixedSize:max});expect(r.status).toBe(max===0?'projected':'blocked');}
 const a=author('decimal',{precision:3,scale:2});
 for(const fixedSize of [0,1,4097])for(const mode of ['strict','report'] as const){const r=project(a,{...request,nativeType:'decimal-fixed',fixedName:'Decimal',fixedSize,mode});expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}
 expect(project(a,{...request,nativeType:'decimal-fixed',fixedName:'Decimal',fixedSize:2}).status).toBe('projected');
 expect(project(a,{...request,nativeType:'decimal-fixed',fixedName:'Record',fixedSize:2,mode:'report'}).status).toBe('blocked');
 expect(project(author('decimal',{precision:4097,scale:0}),{...request,nativeType:'decimal-bytes',mode:'report'}).status).toBe('blocked');
});
test('all profile, encoding and mode combinations recover authored ideals with explicit losses',()=>{
 const seeds:[string,u.CoreFacetPatch,Partial<FacetsAvroRequest>][]=[['integer',{integerWidth:{bits:32,signed:true}},{}],['integer',{integerWidth:{bits:64,signed:true}},{nativeType:'long'}],['string',{length:{max:2,unit:'unicode-scalar'}},{nativeType:'string'}],['binary',{length:{max:0,unit:'byte'}},{nativeType:'fixed',fixedSize:0,fixedName:'Empty'}],['decimal',{precision:3,scale:2},{nativeType:'decimal-bytes'}]];
 let emitted=0,blocked=0;
 for(const [family,facets,native] of seeds)for(const profile of ['declared-schema','apache-datum-writer','fastavro-schemaless-writer'] as const)for(const encoding of ['native-type','metadata-only','carrier-only'] as const)for(const mode of ['strict','report'] as const){
  const a=author(family,facets),r=project(a,{...request,...native,profile,encoding,mode});
  if(r.status==='blocked'){blocked++;expect(r.target).toBeUndefined();continue;}emitted++;
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;expect(recover(receipt,receipt.nativeSchema!)).toEqual(a.target);}
 }
 expect(emitted).toBeGreaterThan(40);expect(blocked).toBeGreaterThan(10);
},60000);
test('receipt integrity, unknown metadata, invalid names and exact-input counterexamples remain explicit',()=>{
 const source=ideal('float');source.vocabularies.future={version:'1.0.0'};source.modules[0]!.elements[0]!.extensions.future={meaning:'retained'};
 const a=u.declareCoreElementKind(source,identity,'field'),r=project(a,{...request,nativeType:'float',mode:'report',obligation:'exact-input'});
 expect(r.residuals.some(x=>x.reason.includes('1.0000000000000002'))).toBe(true);expect(recover(r,r.nativeSchema!)).toEqual(a.target);
 expect(()=>recover(r,r.nativeSchema+' ')).toThrow();const forged=u.copyJson(r) as unknown as typeof r;forged.residuals=[];expect(()=>recover(forged,forged.nativeSchema!)).toThrow();
 for(const fieldName of ['bad\n','9bad','a.b',''])expect(()=>project(a,{...request,fieldName})).toThrow();
 let calls=0;expect(()=>project({get operation(){calls++;return 'declare-core-facets';}} as never,request)).toThrow();expect(calls).toBe(0);
});
