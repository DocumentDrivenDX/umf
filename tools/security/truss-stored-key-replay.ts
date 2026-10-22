/** Current assembly against original codec and retained native bucket outputs. */
import {loadUmfValueProducer} from '/Users/erik/Projects/truss/packages/umf-bun/src/index';
import {createSecurityStoredKeyVerifier} from '/Users/erik/Projects/truss/packages/postgresql/src/security-stored-key.ts';
const original=await Bun.file('docs/helix/04-build/evidence/security/truss-key-transport.json').json();
const report=original.transportReport,producer=await loadUmfValueProducer(report.producer.directory);
const bytes=Buffer.from(report.expected.namespaceHex,'hex'),values=JSON.parse(bytes.toString('utf8'));
const namespace={profile:values[0],sourceEpoch:values[1],installationId:values[2],typeId:values[3],keyNumber:values[4],encoding:{identity:values[5],version:values[6],sha256:values[7]}};
const canonical=(candidate:readonly string[])=>{if(JSON.stringify(candidate)!==JSON.stringify(values))throw Error('No original native canonical observation');return report.expected.namespaceHex;};
const selection={source:report.model,identity:report.identity,namespace,namespaceHex:report.expected.namespaceHex};
const binding=await createSecurityStoredKeyVerifier(producer,selection,canonical);
selection.namespace.encoding.sha256='0'.repeat(64);selection.namespace.sourceEpoch='changed';selection.identity.key='changed';
const checks:Record<string,boolean>={original:await binding.matches(report.values,original.nativeStored[0]),foreignNamespaceRefused:!await binding.matches(report.values,original.nativeStored[1]),copiedSelection:JSON.stringify(binding.encode(report.values))===JSON.stringify(report.expected)};
const restored={source:report.model,identity:report.receipt.identity,namespace:{...namespace,sourceEpoch:values[1],encoding:{identity:values[5],version:values[6],sha256:'0'.repeat(64)}},namespaceHex:report.expected.namespaceHex};
try{await createSecurityStoredKeyVerifier(producer,restored,canonical);checks.codecPinMismatchRefused=false;}catch{checks.codecPinMismatchRefused=true;}
// Suspend canonical verification and replace caller-owned methods while pending.
let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
const mutable={...producer,encodeCoreKeyTuple:producer.encodeCoreKeyTuple,verifyCoreKeyTuple:producer.verifyCoreKeyTuple};
const capturedSelection={source:report.model,identity:report.receipt.identity,namespace:{...namespace,sourceEpoch:values[1],encoding:{identity:values[5],version:values[6],sha256:values[7]}},namespaceHex:report.expected.namespaceHex};
const pending=createSecurityStoredKeyVerifier(mutable,capturedSelection,async candidate=>{await gate;return canonical(candidate);});
mutable.encodeCoreKeyTuple=(()=>{throw Error('Replaced producer');}) as typeof mutable.encodeCoreKeyTuple;
mutable.verifyCoreKeyTuple=(()=>{throw Error('Replaced verifier');}) as typeof mutable.verifyCoreKeyTuple;
release();const captured=await pending;
checks.pendingProducerCaptured=await captured.matches(report.values,original.nativeStored[0]);
// An async canonical callback must not make an initially invalid tuple valid.
const repairedStored={...original.nativeStored[0],keyHex:'00'};
const repairAttempt=binding.matches(report.values,repairedStored);
repairedStored.keyHex=original.nativeStored[0].keyHex;
checks.pendingInvalidStoredRefused=!await repairAttempt;
const changedStored={...original.nativeStored[0]};
const originalAttempt=binding.matches(report.values,changedStored);
changedStored.keyHex='00';
checks.pendingOriginalStoredCaptured=await originalAttempt;
const repairedValues=structuredClone(report.values);repairedValues[1].string='foreign';
const valuesAttempt=binding.matches(repairedValues,original.nativeStored[0]);
repairedValues[1].string=report.values[1].string;
checks.pendingInvalidValuesRefused=!await valuesAttempt;
if(Object.values(checks).some(v=>!v))throw Error('Stored key assembly replay mismatch: '+JSON.stringify(checks));
console.log(JSON.stringify({checks,scope:'Current namespace/transport assembly on actual registered UMF producer and retained original native 0.15 bucket/canonical bytes. No fresh native execution or native scope/producer/current authority/complete graph qualification.'}));
