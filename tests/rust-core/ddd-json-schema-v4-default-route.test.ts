// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createUmfRegistry,dddFieldBinding,dddRegistry,editDddDefinition,getDddDefinition,inspectDdd,projectDddToJsonSchema,readDddDocument,validateDocument,writeDddDocument,type DddDocumentBindings,UmfError} from '../../src/index-node-v4';
import {readFileSync} from 'node:fs';

const source=readDddDocument(readFileSync('fixtures/ddd/sales.json','utf8'),'json');
const bindings:DddDocumentBindings={id:'order-document',schemaId:'https://example.test/order-document',root:{module:'sales',element:'Order'},closedObjects:true,integer:'json-integer',decimal:'decimal-string',dateTime:'string',bytes:'hex-string',collection:'array',lossPolicy:'allow-reported-loss',relations:{'/sales/Order/fields/total':'embed','/sales/Order/fields/lines':'embed','/sales/Order/fields/shipping':'embed','/sales/Order/fields/customer':'identity','/sales/OrderLine/fields/price':'embed'}};

test('DDD document projection public Node root delegates binding and projection outcomes to Rust',()=>{
 expect(dddFieldBinding({module:'sales/~archive',element:'Order/Item'},'a~b/c')).toBe('/sales~1~0archive/Order~1Item/fields/a~0b~1c');
 expect(()=>dddFieldBinding({module:'\ud800',element:'Order'},'id')).toThrow(UmfError);
 const result=projectDddToJsonSchema(source,bindings);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.target).toBeDefined();
 expect(result.issues.some(issue=>issue.code==='IDENTITY_REFERENCE')).toBe(true);
 expect(inspectDdd(source).valid).toBe(true);
 expect(validateDocument(source,dddRegistry()).valid).toBe(true);
 expect(validateDocument(source,createUmfRegistry()).valid).toBe(true);
 expect(getDddDefinition(source,'sales','Order').kind).toBe('entity');
 // The authored prose invariant is intentionally preserved but not interpreted;
 // complete-validation edit guards refuse the original source just as legacy TS does.
 expect(()=>editDddDefinition(source,'sales','Order',definition=>({...definition,description:'Reviewed order'}))).toThrow(UmfError);
 const editable=structuredClone(source);
 const order=editable.modules[0]!.elements.find(element=>element.id==='Order')!;
 delete (order.extensions['umf.ddd'] as any).invariants;
 expect(inspectDdd(editable)).toMatchObject({valid:true,complete:true});
 const edited=editDddDefinition(editable,'sales','Order',definition=>({...definition,description:'Reviewed order'}));
 expect(inspectDdd(edited).valid).toBe(true);
 const roundTrip=readDddDocument(writeDddDocument(edited,'json'),'json');
 expect(getDddDefinition(roundTrip,'sales','Order').description).toBe('Reviewed order');
 const invalid=JSON.parse(readFileSync('fixtures/ddd/sales.json','utf8'));
 invalid.modules[0].elements.find((element:any)=>element.id==='Order').extensions['umf.ddd'].identity.fields=['missing'];
 expect(inspectDdd(invalid).diagnostics.some(diagnostic=>diagnostic.code==='DDD_IDENTITY')).toBe(true);
 expect(()=>projectDddToJsonSchema(invalid,bindings)).toThrow(UmfError);
 expect(validateDocument(invalid,dddRegistry()).diagnostics.some(diagnostic=>diagnostic.code==='DDD_IDENTITY')).toBe(true);
 expect(()=>getDddDefinition(invalid,'sales','Order')).toThrow(UmfError);
 expect(()=>editDddDefinition(source,'sales','Order',definition=>({...definition,identity:{fields:['missing']}}))).toThrow(UmfError);
 const refused=projectDddToJsonSchema(source,{...bindings,relations:{}});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
},60_000);
