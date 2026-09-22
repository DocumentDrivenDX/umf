import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
test('native projected schemas recover authored facets or explicit residuals without inventing authorship',async()=>{
 const proof=await Bun.file('fixtures/validation/facets-sqlserver-composition.json').json();
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.bindingAccepted).toBe(false);
 expect(proof.counts).toEqual({cases:145,idealRecoveries:145,nativeRecoveries:145,exactFacetRecoveries:57,explicitResiduals:88,fullCatalogNativeRecoveries:2});
 for(const [path,hash] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),path).toBe(hash);
 for(const row of proof.results)if(!row.recoversAuthoredFacets)expect(row.residuals.length).toBeGreaterThan(0);
 const find=(name:string,encoding='checked',mode='strict')=>proof.results.find((r:any)=>r.name===name&&r.encoding===encoding&&r.mode===mode);
 expect(find('smallint-8-true').classified).toEqual({integerWidth:{bits:8,signed:true}});
 expect(find('length-nvarchar-0').classified).toEqual({length:{max:0,unit:'unicode-scalar'}});
 expect(find('decimal-5-2').classified).toEqual({precision:5,scale:2});
 const carrier=find('facetless-int');expect(carrier.authored).toEqual({});expect(carrier.nativeRefinements).toEqual({integerWidth:{bits:32,signed:true}});
 expect(find('decimal-integer-127','checked','report').recoversAuthoredFacets).toBe(false);
 expect(find('length-nvarchar-2','checked','report').residuals.length).toBeGreaterThan(0);
});
