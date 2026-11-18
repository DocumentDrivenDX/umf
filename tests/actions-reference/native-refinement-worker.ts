// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {words,trace} from './native-refinement-model';
const [part,parts]=Bun.argv.slice(2).map(Number);
assert.ok(Number.isInteger(part)&&Number.isInteger(parts)&&parts===4&&part!>=0&&part!<parts!);
assert.ok(process.env.UMF_NATIVE_REFINEMENT_URL&&process.send);
const disconnected=()=>process.exit(1);process.on('disconnect',disconnected);
const store=new ReferenceActionStore(process.env.UMF_NATIVE_REFINEMENT_URL),corpus=words(3);let checked=0,transitions=0;
try{for(let index=part!;index<corpus.length;index+=parts!){const result=await trace(store,'finite-'+index,corpus[index]!);checked++;transitions+=result.transitions;}
 console.log(JSON.stringify({part,checked,transitions}));
}finally{await store.close();}
process.off('disconnect',disconnected);process.disconnect!();
