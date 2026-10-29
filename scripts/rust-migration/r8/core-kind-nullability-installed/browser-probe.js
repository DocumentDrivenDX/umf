import * as root from '@umf/core';
import * as reference from '@umf/core/reference';
import {runSuite} from '/suite.mjs';
const fixture=await(await fetch('/fixtures.json')).json();
try{window.__kindNullabilityResult=await runSuite(root,reference,fixture,(route,id)=>globalThis.__kindNullabilityProgress={route,id,time:performance.now()})}catch(e){window.__kindNullabilityFailure=String(e.stack||e)}
