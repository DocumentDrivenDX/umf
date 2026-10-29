import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCoreFacetOutcomeParity,coreFacetOutcomeShape,resourceSuiteSource} from './core-facets-resource-suite.mjs';

const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);

test('null-prototype outcomes are allowed when frozen data and raw structure agree',()=>{
 const a=Object.assign(Object.create(null),{nested:Object.assign(Object.create(null),{value:1}),list:[1,{x:true}]});
 const b=Object.assign(Object.create(null),{nested:Object.assign(Object.create(null),{value:1}),list:[1,{x:true}]});
 assert.equal(canonical(a),canonical(b));
 assert.equal(assertCoreFacetOutcomeParity(a,b,canonical),coreFacetOutcomeShape(a));
});

test('prototype-only divergence is rejected, with ordinary historical objects still supported',()=>{
 const nullValue=Object.assign(Object.create(null),{nested:Object.assign(Object.create(null),{value:1}),list:[1,{x:true}]});
 const ordinary={nested:{value:1},list:[1,{x:true}]};
 assert.equal(canonical(nullValue),canonical(ordinary));
 assert.throws(()=>assertCoreFacetOutcomeParity(nullValue,ordinary,canonical),/prototype\/own shape/);
 assert.match(coreFacetOutcomeShape(ordinary),/^\["object"/);
 assert.match(coreFacetOutcomeShape([1,{x:true}]),/^\["array"/);
});

test('frozen data changes and custom prototypes are rejected',()=>{
 const a=Object.assign(Object.create(null),{value:1});
 const changed=Object.assign(Object.create(null),{value:2});
 assert.throws(()=>assertCoreFacetOutcomeParity(a,changed,canonical),/frozen data/);
 const custom=Object.create({inherited:true});custom.value=1;
 assert.throws(()=>coreFacetOutcomeShape(custom),/custom outcome prototype/);
});

test('arrays require the intrinsic prototype and include hidden own descriptors and length flags',()=>{
 const ordinary=[1];
 const nullArray=[1];Object.setPrototypeOf(nullArray,null);
 const customArray=[1];Object.setPrototypeOf(customArray,{custom:true});
 assert.throws(()=>coreFacetOutcomeShape(nullArray),/custom array prototype/);
 assert.throws(()=>coreFacetOutcomeShape(customArray),/custom array prototype/);
 const hiddenA={value:1},hiddenB={value:1};
 Object.defineProperty(hiddenA,'secret',{value:'a',enumerable:false,writable:true,configurable:true});
 Object.defineProperty(hiddenB,'secret',{value:'b',enumerable:false,writable:true,configurable:true});
 assert.notEqual(coreFacetOutcomeShape(hiddenA),coreFacetOutcomeShape(hiddenB));
 const frozenLength=[1];Object.defineProperty(frozenLength,'length',{writable:false});
 assert.notEqual(coreFacetOutcomeShape(ordinary),coreFacetOutcomeShape(frozenLength));
 assert.match(coreFacetOutcomeShape(ordinary),/"length"/);
});

test('shape traversal is linear at depth and distinguishes JSON numeric edge values',()=>{
 let value='leaf';for(let index=0;index<100;index++)value={x:value};
 const signature=coreFacetOutcomeShape(value);
 assert.ok(signature.length<20_000,`depth-100 shape unexpectedly expanded to ${signature.length} characters`);
 assert.equal(canonical(-0),canonical(0));
 assert.throws(()=>assertCoreFacetOutcomeParity(-0,0,canonical),/prototype\/own shape/);
 assert.throws(()=>assertCoreFacetOutcomeParity(NaN,null,canonical),/prototype\/own shape/);
});

test('generated embedded browser resource harness is valid JavaScript',()=>{
 assert.doesNotThrow(()=>new Function(resourceSuiteSource));
});


test('embedded installed probe defines its parity helper and preserves data and own-shape guards',()=>{
 const embeddedParity=new Function(resourceSuiteSource+'\nreturn assertCoreFacetOutcomeParity;')();
 const left=Object.assign(Object.create(null),{nested:Object.assign(Object.create(null),{value:1}),list:[1,{x:true}]});
 const same=Object.assign(Object.create(null),{nested:Object.assign(Object.create(null),{value:1}),list:[1,{x:true}]});
 assert.equal(embeddedParity(left,same,canonical),coreFacetOutcomeShape(left));
 assert.throws(()=>embeddedParity(left,{nested:{value:1},list:[1,{x:true}]},canonical),/prototype\/own shape/);
 same.nested.value=2;
 assert.throws(()=>embeddedParity(left,same,canonical),/frozen data/);
});
