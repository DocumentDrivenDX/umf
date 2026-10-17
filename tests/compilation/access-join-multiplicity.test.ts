import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import {profile,request,mutateSource} from './access-fixtures';

test('generated required and optional to-one descriptors retain authored multiplicity',()=>{
 for(const minimum of [0,1]){
  const q=request();q.records.push({module:'commerce',element:'Customer'});
  mutateSource(q,d=>Object.assign(d.modules[0]!,{relationships:[{id:'customer',name:'customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:minimum,max:1},targetLifecycle:'independent',directed:true}]}));
  const result=generateAccessPackage(q,profile());expect(result.outcome).toBe('candidate');
  const fields=result.files.find(f=>f.path==='shop/fields.py')!.text;
  const kind=minimum===0?'OptionalJoin':'RequiredJoin';
  expect(fields).toContain(`customer: ${kind}[Order, Customer, CustomerKey] = ${kind}(`);
  expect(fields).toContain(`optional=${minimum===0?'True':'False'}`);
 }
});
