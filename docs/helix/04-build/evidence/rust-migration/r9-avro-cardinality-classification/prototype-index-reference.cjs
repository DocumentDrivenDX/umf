// SPDX-License-Identifier: MIT OR Apache-2.0
// Small direct primary-parser oracle for the inherited-index compatibility gap.
// Run before rebuilding the UMF family packet; no archive/classifier claim.
const assert = require('node:assert/strict');
const {Type} = require('avsc');
const names = Object.getOwnPropertyNames(Object.prototype)
  .filter(name => Object.prototype[name] !== undefined);
const results = [];
function observe(id, schema, message) {
  try {
    Type.forSchema(schema, {registry: Object.create(null), wrapUnions: true});
    assert.equal(message, null, id);
    results.push({id, accepted: true});
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    assert.equal(error.message, message, id);
    results.push({id, error: error.message});
  }
}
for (const name of names) {
  observe(`enum/${name}`, {type:'enum',name:'n.E',symbols:[name]},
    `duplicate "n.E" symbol: ${JSON.stringify(name)}`);
  observe(`union/${name}`, [{type:'record',name,fields:[]}],
    `duplicate union branch name: ${JSON.stringify(name)}`);
  observe(`qualified-union/${name}`, [{type:'record',name:`n.${name}`,fields:[]}], null);
  observe(`standalone/${name}`, {type:'record',name,fields:[]}, null);
}
console.log(JSON.stringify({scope:'direct avsc parser only', version:require('avsc/package.json').version, names, results}, null, 2));
