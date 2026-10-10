import {test,expect} from 'bun:test';
import {encodeSecurityDisclosure,decodeSecurityDisclosure,type SecurityDisclosureBatch} from '../../src/extensions/security/disclosure';
import {securityFixture,ref} from './fixture';

function fixture(){
  const model=securityFixture();
  model.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.nullability='absent-allowed';
  const batch:SecurityDisclosureBatch={version:'umf.security.disclosure/0.1.0',target:ref('Resource'),fields:[ref('salary')],rows:[
    [{field:ref('salary'),disposition:'original',value:null}],
    [{field:ref('salary'),disposition:'absent'}],
    [{field:ref('salary'),disposition:'withheld'}],
    [{field:ref('salary'),disposition:'original',value:{integerToken:'9007199254740993'}}],
    [{field:ref('salary'),disposition:'transformed',outputType:ref('resourceId'),value:{string:'restricted'}}],
  ]};
  return {...model,batch};
}
test('typed disclosure preserves null, absence, withholding and replacement domain',()=>{
  const {policy,resolution,batch}=fixture();
  expect(JSON.parse(JSON.stringify(decodeSecurityDisclosure(encodeSecurityDisclosure(batch,policy,resolution),policy,resolution)))).toEqual(batch);
  // This codec accepts structurally valid originals even when the policy withholds them: it is not authorization.
  expect(batch.rows[3]![0]!.disposition).toBe('original');
});
test('whole batch refuses malformed or extra representations without exposing values',()=>{
  const {policy,resolution,batch}=fixture();
  const mutations=[
    (b:any)=>b.version='unknown',
    (b:any)=>b.rows[2][0].value={string:'private-secret'},
    (b:any)=>b.rows[4][0].value={integerToken:'123'},
    (b:any)=>b.rows[3][0].value=9007199254740992,
    (b:any)=>b.rows[3][0].field=ref('resourceId'),
    (b:any)=>b.rows[4].push(b.rows[4][0]),
    (b:any)=>b.fields.push(ref('salary')),
    (b:any)=>b.rows[4][0].outputType=ref('Resource'),
  ];
  for(const mutate of mutations){
    const altered=structuredClone(batch);mutate(altered);
    expect(()=>decodeSecurityDisclosure(JSON.stringify(altered),policy,resolution)).toThrow('Invalid or unsupported disclosure transport');
  }
  resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.nullability='required';
  expect(()=>encodeSecurityDisclosure(batch,policy,resolution)).toThrow('Invalid or unsupported disclosure transport');
});
