import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import {classifyTableSpecKeys,recoverTableSpecKeySource} from '../../src/core-ideals/key-tablespec';
import {projectKeysToTableSpec,recoverKeysTableSpecIdeal} from '../../src/core-ideals/key-tablespec-projection';
import {importTableSpec} from '../../src/adapters/tablespec';
import {tableSpecKeyAuthors} from '../../scripts/core-ideals/key-tablespec-projection-cases';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
function deep(){let value:any={quoted:'"\\',array:['a','b']};for(let i=0;i<40;i++)value={nested:value};return value;}
test('deep JSON const/enum/unique comparisons avoid exponential string escaping',()=>{
 const value=deep(),copy=structuredClone(value),ajv=createValidator(false);
 expect(ajv.compile({const:value})(copy)).toBe(true);expect(ajv.compile({enum:[value]})(copy)).toBe(true);
 const unique=ajv.compile({type:'array',uniqueItems:true});expect(unique([value,copy])).toBe(false);expect(unique([value,{different:copy}])).toBe(true);
 expect(ajv.compile({const:{a:1,b:[2]}})({b:[2],a:1})).toBe(true);expect(ajv.compile({const:{a:'1'}})({a:1})).toBe(false);
});
test('deep unknown native content survives TableSpec receipt verification',()=>{
 const text=JSON.stringify({version:'1.0',table_name:'Deep',columns:[{name:'id',data_type:'INTEGER'}],primary_key:['id'],future:deep()}),doc=importTableSpec(text,{id:'deep',format:'json'}),r=classifyTableSpecKeys(doc,{mode:'report',profile:'declared-metadata'});
 for(const format of ['json','yaml'] as const){const stored=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverTableSpecKeySource(stored,stored.target!)).toBe(text);}
});
test('deep unrelated metadata survives authored TableSpec projection and exact ideal recovery',()=>{
 const c=tableSpecKeyAuthors();c.source=structuredClone(c.source);c.source.vocabularies.future={version:'1.0.0'};c.source.extensions={future:deep()};const r=projectKeysToTableSpec(c.source,c.authors,c.request);
 for(const format of ['json','yaml'] as const){const stored=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverKeysTableSpecIdeal(stored,stored.target!)).toEqual(c.source);}
});
