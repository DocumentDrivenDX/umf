// SPDX-License-Identifier: MIT OR Apache-2.0
import {evaluateSecurityWrite} from '../../src/index';
import packet from './write-read-fixtures.json';
/** Independent finite legacy-write correction oracle; not S24/S25 qualification. */
export function runOracle(){return (packet.cases as any[]).map(c=>{const f=structuredClone(c.input),before=JSON.stringify(f);const result=evaluateSecurityWrite(f.policy,f.resolution,f.profile,f.request);return{id:c.id,expectedAdmission:c.expectedAdmission,expectedDecision:c.expectedDecision,decision:result.decision,sourceUnchanged:JSON.stringify(f)===before,passed:result.decision===c.expectedDecision&&(result.decision==='permit')===c.expectedAdmission&&JSON.stringify(f)===before};});}
