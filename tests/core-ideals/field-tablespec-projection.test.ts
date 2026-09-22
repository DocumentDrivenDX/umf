import {test,expect} from 'bun:test';
import {projectFieldToTableSpec,recoverFieldFromTableSpec,type FieldTableSpecRequest} from '../../src/core-ideals/field-tablespec-projection';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyTableSpecField} from '../../src/core-ideals/tablespec-field';
import {exportTableSpec,importTableSpec} from '../../src/adapters/tablespec';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {type Document} from '../../src/model/types';
const doc=(extra:Record<string,unknown>={}):Document=>({umf:'0.2.0',id:'ideal',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[{id:'id',name:'id',extensions:{},...extra}]}]});
const request:FieldTableSpecRequest={id:'native',tableName:'Orders',columnName:'id',nativeType:'INTEGER',mode:'strict'};
const author=(extra:Record<string,unknown>={})=>declareCoreElementKind(doc(extra),{module:'sales',element:'id'},'field');
test('authored field projects to a complete native table and recovers author meaning with retained receipt',()=>{
 for(const nativeType of ['BOOLEAN','INTEGER','DECIMAL','FLOAT','TEXT','VARCHAR','CHAR','DATE','DATETIME','TIMESTAMP'] as const){
  const receipt=projectFieldToTableSpec(author(),{...request,nativeType,mode:'report'});expect(receipt.status).toBe('projected');expect(receipt.mapping.outcome).toBe('not-expressible');expect(receipt.residuals.map(r=>r.path)).toEqual(['/modules/0/namespace']);
  const text=exportTableSpec(receipt.target!);expect(JSON.parse(text).columns[0].data_type).toBe(nativeType);
  for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;expect(recoverFieldFromTableSpec(back,text)).toEqual(receipt.source);}
  const nativeOnly=upgradeFieldEnvelope(importTableSpec(text,{id:'reimport',format:'json'})).target;
  const classified=classifyTableSpecField(nativeOnly,{column:0,mode:'strict'});expect(classified.mapping.origin).toBe('classified');expect(classified.request.author).toBeUndefined();
 }
});
test('strict blocks omitted meaning while report retains every residual and source assertion',()=>{
 const a=author({scalarType:'string',future:{defaultExecution:'unknown'},references:[]});
 const strict=projectFieldToTableSpec(a,request);expect(strict.status).toBe('blocked');expect(Object.hasOwn(strict,'target')).toBe(false);
 const report=projectFieldToTableSpec(a,{...request,mode:'report'});expect(report.status).toBe('projected');expect(report.mapping.outcome).toBe('not-expressible');
 expect(report.residuals.map(r=>r.path)).toEqual(['/modules/0/namespace','/modules/0/elements/0/future','/modules/0/elements/0/references','/modules/0/elements/0/scalarType']);
 expect(recoverFieldFromTableSpec(report,exportTableSpec(report.target!))).toEqual(a.target);
});
test('record/group cannot lower to a single column and name changes are explicit loss',()=>{
 for(const kind of ['record','group'] as const){const a=declareCoreElementKind(doc(),{module:'sales',element:'id'},kind);for(const mode of ['strict','report'] as const)expect(projectFieldToTableSpec(a,{...request,mode}).status).toBe('blocked');}
 const renamed=projectFieldToTableSpec(author(),{...request,columnName:'new'});expect(renamed.status).toBe('blocked');expect(renamed.residuals[0]!.path).toBe('/modules/0/elements/0/name');
});
test('receipt tampering, stale native text, malformed policy and metadata omission cannot pass silently',()=>{
 const a=author(),receipt=projectFieldToTableSpec(a,{...request,mode:'report'}),text=exportTableSpec(receipt.target!);
 expect(()=>recoverFieldFromTableSpec(receipt,text+' ')).toThrow();receipt.mapping.idealPath='/wrong';expect(()=>recoverFieldFromTableSpec(receipt,text)).toThrow();
 expect(()=>projectFieldToTableSpec(a,{...request,mode:'allow' as any})).toThrow();
 const source=doc();source.modules.push({id:'other',namespace:'other',elements:[]});source.future={x:1};source.modules[0]!.future=true;
 const rich=projectFieldToTableSpec(declareCoreElementKind(source,{module:'sales',element:'id'},'field'),{...request,mode:'report'});
 expect(rich.residuals.map(r=>r.path)).toEqual(['/future','/modules/0/namespace','/modules/0/future','/modules/1']);
});
test('diagnostics mirror disclosed loss and legacy receipts still recover without weakening checks',()=>{
 const clean=projectFieldToTableSpec(author(),request);expect(clean.status).toBe('blocked');expect(clean.diagnostics.map(d=>d.path)).toEqual(['/modules/0/namespace']);
 for(const mode of ['strict','report'] as const){const result=projectFieldToTableSpec(author({future:{constraint:'retain'}}),{...request,mode});expect(result.diagnostics).toHaveLength(result.residuals.length);expect(result.diagnostics.map(d=>[d.path,d.message,d.severity])).toEqual(result.residuals.map(r=>[r.path,r.reason,mode==='strict'?'error':'warning']));}
 for(const mode of ['strict','report'] as const){const a=declareCoreElementKind(doc(),{module:'sales',element:'id'},'record'),blocked=projectFieldToTableSpec(a,{...request,mode});expect(blocked.diagnostics.every(d=>d.severity==='error')).toBe(true);}
 const report=projectFieldToTableSpec(author({future:'retain'}),{...request,mode:'report'}),native=exportTableSpec(report.target!);
 const legacy:import('../../src/core-ideals/field-tablespec-projection').FieldTableSpecProjection=copyJson(report) as unknown as typeof report;delete legacy.diagnostics;expect(recoverFieldFromTableSpec(legacy,native)).toEqual(report.source);
 legacy.mapping.idealPath='/tampered';expect(()=>recoverFieldFromTableSpec(legacy,native)).toThrow('does not match');
 report.diagnostics[0]!.severity='error';expect(()=>recoverFieldFromTableSpec(report,native)).toThrow('Expected projected receipt');
});
test('empty namespace permits strict projection but discarded namespace receipts cannot claim exactness',()=>{const source=doc();source.modules[0]!.namespace='';const a=declareCoreElementKind(source,{module:'sales',element:'id'},'field');const exact=projectFieldToTableSpec(a,request);expect(exact.status).toBe('projected');expect(exact.residuals).toEqual([]);const reported=projectFieldToTableSpec(author(),{...request,mode:'report'}),text=exportTableSpec(reported.target!);reported.residuals=[];reported.diagnostics=[];reported.mapping.outcome='exact';expect(()=>recoverFieldFromTableSpec(reported,text)).toThrow();});
