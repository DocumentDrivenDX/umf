// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {verifyFacetRoundTripsWorker,type FacetTask,type FacetInventory} from './facets-roundtrips';
assert.ok(process.send,'Facet worker requires its coordinator');
const disconnected=()=>process.exit(1);
process.on('disconnect',disconnected);
const next=(inventory:FacetInventory)=>new Promise<FacetTask|null>(resolve=>{
 process.once('message',message=>resolve(message as FacetTask|null));
 process.send!({ready:true,inventory});
});
console.log(JSON.stringify({coverage:await verifyFacetRoundTripsWorker(next,(system,index)=>console.log(JSON.stringify({progress:{system,index}})))}));
process.off('disconnect',disconnected);
process.disconnect!();
