import {test,expect} from 'bun:test';
import {SCALAR_TYPES,validateDocument,readDocument,writeDocument,type Document} from '../../src';
test('CONTRACT-001 scalar families are interpreted core metadata and survive both formats',()=>{
 const d:Document={umf:'0.1.0',id:'scalars',vocabularies:{},modules:[{id:'m',namespace:'sample',elements:SCALAR_TYPES.map(scalarType=>({id:scalarType,scalarType,extensions:{}}))}]};
 expect(validateDocument(d)).toEqual({valid:true,complete:true,diagnostics:[]});
 for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(d,format),format)).toEqual(d);
});
test('CONTRACT-001 unknown scalar families remain recoverable and explicitly incomplete',()=>{
 const d:Document={umf:'0.1.0',id:'future',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'x',scalarType:'future-scalar',extensions:{}}]}]};
 const r=validateDocument(d);expect(r.valid).toBe(true);expect(r.complete).toBe(false);expect(r.diagnostics.map(x=>x.code)).toEqual(['UNKNOWN_SCALAR_TYPE']);
 expect(readDocument(writeDocument(d,'yaml'),'yaml')).toEqual(d);
 for(const value of ['',null,42,{},[]]){const bad=structuredClone(d);(bad.modules[0]!.elements[0] as any).scalarType=value;expect(validateDocument(bad).valid).toBe(false);}
 delete d.modules[0]!.elements[0]!.scalarType;expect(validateDocument(d).complete).toBe(true);
});
