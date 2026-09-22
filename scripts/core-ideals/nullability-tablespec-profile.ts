import assert from 'node:assert/strict';
import {importTableSpec,exportTableSpec,getTableSpecColumn,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,inspectCoreNullability,readDocument,writeDocument,writeJsonValue} from '../../src';
const native=await Bun.file('fixtures/validation/nullability-tablespec-profile-native.json').json(),rows=[];
for(const row of native.rows)for(const nativeFormat of ['json','yaml'] as const)for(const variant of ['native','unknown-root'] as const){
 const original=nativeFormat==='json'?JSON.stringify(row.source)+'\n':writeJsonValue(row.source,'yaml');
 const text=variant==='native'?original:nativeFormat==='json'?original.trimEnd().replace(/}$/,',"future_native":9007199254740993}')+'\n':original+'future_native: 9007199254740993\n';
 const initial=importTableSpec(text,{id:row.case+':'+variant,format:nativeFormat});
 const field=classifyTableSpecField(upgradeFieldEnvelope(initial).target,{column:0,mode:'strict'});assert.ok(field.target);
 const model=upgradeNullabilityEnvelope(field.target).target;
 assert.equal(inspectCoreNullability(model,{module:'table',element:'column:0'}).meaning.state,'missing');
 const recovered=[];
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(model,format),format);assert.equal(exportTableSpec(restored),text);assert.deepEqual(getTableSpecColumn(restored,0),getTableSpecColumn(initial,0));recovered.push({format,text:exportTableSpec(restored)});}
 rows.push({case:row.case+':'+variant,nativeCase:row.case,variant,nativeFormat,text,model,recovered});
}
await Bun.write('fixtures/validation/nullability-tablespec-profile.json',JSON.stringify({scope:'Native availability counterexamples survive the existing TableSpec Field classification and explicit Nullability envelope migration without inferred availability',rows},null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,recoveries:rows.reduce((n,r)=>n+r.recovered.length,0),inferredAvailability:0}));
