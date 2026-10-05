import {schemaPropertiesFixture} from './core-schema-properties-cases';
import {validateCoreFieldValue} from '../src/index';
const tokens=['-9223372036854775809','-9223372036854775808','-2','-1','-0','0','0.0','0e99999999','1','1.0','1e0','1.20','1.001','1.5','2','2e0','1e-1','0.01','0.009','999999999999999999.99','1000000000000000000','9223372036854775807','9223372036854775808','1e30','1e-30','1e99999999','01','NaN','1\n'];
const probes=[];
for(const domain of ['integer','decimal'] as const){
 const doc=schemaPropertiesFixture(),element=domain==='integer'?'quantity':'price',field=doc.modules[0]!.elements.find(e=>e.id===element)!;
 delete field.default;delete field.examples;delete field.allowedValues;
 if(domain==='decimal')field.facets={precision:20,scale:2};
 for(const token of tokens){const value=domain==='integer'?{integerToken:token}:{decimalToken:token};const result=validateCoreFieldValue(doc,{module:'m',element},value);probes.push({domain,token,accepted:result.valid});}
}
await Bun.write('fixtures/validation/core-schema-properties-oracle-inputs.json',JSON.stringify({scope:'Exact integer64 and decimal(20,2) literal acceptance, not native storage equivalence',probes},null,2)+'\n');
