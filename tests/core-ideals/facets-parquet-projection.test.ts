import {test,expect} from 'bun:test';
import * as u from '../../src';
import {projectFacetsToParquet as project,recoverFacetsFromParquet as recover,type FacetsParquetRequest} from '../../src';
const identity={module:'m',element:'value'};
function ideal(scalarType:string):u.Document{return {umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]}]};}
const request:FacetsParquetRequest={id:'native',recordName:'Record',fieldName:'value',nullable:false,carrier:{kind:'integer',bits:8,signed:false},mode:'strict',encoding:'native-type',profile:'declared-schema',obligation:'value-domain'};
const author=(family:string,facets:u.CoreFacetPatch)=>u.declareCoreFacets(ideal(family),identity,facets);
test('integer widths and decimal carriers project only matched declared domains',()=>{
 for(const bits of [8,16,32,64] as const)for(const signed of [true,false]){
  const a=author('integer',{integerWidth:{bits,signed}}),r=project(a,{...request,carrier:{kind:'integer',bits,signed}});
  expect(r.status).toBe('projected');expect(r.mapping.facets.integerWidth).toEqual({bits,signed});
  expect(recover(r,u.exportParquetCapture(r.target!))).toEqual(a.target);
  expect(project(a,{...request,carrier:{kind:'integer',bits,signed:!signed}}).status).toBe('blocked');
 }
 const a=author('decimal',{precision:4,scale:2});
 for(const carrier of ['int32','int64','bytes','fixed'] as const){
  const r=project(a,{...request,carrier:{kind:'decimal',carrier,precision:4,scale:2,...(carrier==='fixed'?{bytes:2}:{})}});
  expect(r.status).toBe('projected');expect(r.mapping.facets).toEqual({precision:4,scale:2});
 }
 expect(project(a,{...request,carrier:{kind:'decimal',carrier:'bytes',precision:5,scale:2}}).status).toBe('blocked');
},30000);
test('native validity, reader limitations and non-enforcing length metadata stay separate',()=>{
 const large=author('decimal',{precision:77,scale:0}),carrier={kind:'decimal' as const,carrier:'bytes' as const,precision:77,scale:0};
 expect(project(large,{...request,carrier}).status).toBe('projected');
 expect(project(large,{...request,carrier,profile:'pyarrow-21'}).status).toBe('blocked');
 const report=project(large,{...request,carrier,profile:'pyarrow-21',mode:'report'});expect(report.status).toBe('projected');expect(report.residuals.some(r=>r.reason.includes('above 76'))).toBe(true);
 const length=author('binary',{length:{max:2,unit:'byte'}});
 expect(project(length,{...request,carrier:{kind:'fixed',bytes:2}}).status).toBe('blocked');
 for(const bytes of [0,4097])for(const mode of ['strict','report'] as const){const r=project(length,{...request,carrier:{kind:'fixed',bytes},mode});expect(r.status).toBe('blocked');expect(r.target).toBeUndefined();}
 const string=author('string',{length:{max:1,unit:'unicode-scalar'}});
 for(const encoding of ['native-type','metadata-only','carrier-only'] as const){
  const r=project(string,{...request,carrier:{kind:'primitive',nativeType:'string'},encoding,mode:'report'});expect(r.mapping.outcome).toBe('not-expressible');
  const metadata=u.inspectParquetMetadata(r.target!).metadata as any;expect(Boolean(metadata.key_value_metadata)).toBe(encoding==='metadata-only');
 }
},30000);
test('profile/mode/encoding matrix recovers full authored ideals in both serializations',()=>{
 const seeds:[string,u.CoreFacetPatch,FacetsParquetRequest['carrier']][]=[['integer',{integerWidth:{bits:8,signed:false}},{kind:'integer',bits:8,signed:false}],['integer',{integerWidth:{bits:7,signed:true}},{kind:'integer',bits:8,signed:true}],['decimal',{precision:3,scale:2},{kind:'decimal',carrier:'fixed',precision:3,scale:2,bytes:2}],['string',{length:{max:2,unit:'unicode-scalar'}},{kind:'primitive',nativeType:'string'}]];
 let projected=0,blocked=0;
 for(const [family,facets,carrier] of seeds)for(const profile of ['declared-schema','pyarrow-21'] as const)for(const mode of ['strict','report'] as const)for(const encoding of ['native-type','metadata-only','carrier-only'] as const){
  const a=author(family,facets),r=project(a,{...request,carrier,profile,mode,encoding});
  if(r.status==='blocked'){blocked++;expect(r.target).toBeUndefined();continue;}projected++;
  const bytes=u.exportParquetCapture(r.target!);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;expect(recover(receipt,bytes)).toEqual(a.target);}
 }
 expect(projected).toBe(36);expect(blocked).toBe(12);
},60000);
test('unknown content, false authorship, changed bytes and unsafe inputs cannot pass recovery',()=>{
 const source=ideal('float');source.vocabularies.future={version:'1.0.0'};source.modules[0]!.elements[0]!.extensions.future={opaque:'kept'};
 const a=u.declareCoreElementKind(source,identity,'field'),r=project(a,{...request,carrier:{kind:'primitive',nativeType:'float32'},mode:'report',obligation:'exact-input'});
 expect(r.residuals.some(x=>x.reason.includes('1.0000000000000002'))).toBe(true);const bytes=u.exportParquetCapture(r.target!);expect(recover(r,bytes)).toEqual(a.target);
 const changed=bytes.slice();changed[4]=changed[4]!^1;expect(()=>recover(r,changed)).toThrow();
 const forged=u.copyJson(r) as unknown as typeof r;forged.residuals=[];expect(()=>recover(forged,bytes)).toThrow();
 const wrong=ideal('integer');wrong.modules[0]!.elements[0]!.facets={integerWidth:{bits:8,signed:false}};
 const kind=u.declareCoreElementKind(wrong,identity,'field');expect(project(kind,request).status).toBe('blocked');
 let calls=0;expect(()=>project({get operation(){calls++;return 'declare-core-facets';}} as never,request)).toThrow();expect(calls).toBe(0);
});
