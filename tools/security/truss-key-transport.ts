/** Original pinned UMF tuple producer and actual portable backend transport. */
import {loadUmfValueProducer} from '/Users/erik/Projects/truss/packages/umf-bun/src/index';
import {createSecurityKeyTransportVerifier} from '/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts';
const directory='/private/tmp/truss-umf-runtime-bG1IMG';
const producer=await loadUmfValueProducer(directory);
const fixture=await Bun.file('/Users/erik/Projects/truss/tests/umf-fixtures/value-key.json').json();
const selection={source:fixture.model,identity:fixture.identity,namespaceHex:Bun.env.UMF_SECURITY_NAMESPACE_HEX??'010203'};
const verifier=createSecurityKeyTransportVerifier(producer,selection);
const expected=verifier.encode(fixture.values);
const receipt=producer.encodeCoreKeyTuple(fixture.model,fixture.identity,fixture.values);
if(receipt.bytesHex!==fixture.expectedHex)throw Error('Original independent tuple oracle differs');
selection.namespaceHex='04';selection.identity.key='changed';
const checks:Record<string,boolean>={original:verifier.matches(fixture.values,expected),namespaceIsolation:!verifier.matches(fixture.values,{...expected,namespaceHex:'040506'}),changedPayload:!verifier.matches(fixture.values,{...expected,keyHex:expected.keyHex.slice(0,-2)+'00'}),prefixOnly:!verifier.matches(fixture.values,{...expected,keyHex:Buffer.from('umf-key-tuple-v1:hex:00').toString('hex')}),reorderedValues:!verifier.matches([...fixture.values].reverse(),expected),selectionCopied:verifier.encode(fixture.values).namespaceHex===expected.namespaceHex};
if(Object.values(checks).some(v=>!v))throw Error('Transport correspondence failed');
console.log(JSON.stringify({checks,expected,receipt,values:fixture.values,model:fixture.model,identity:receipt.identity,producer:{directory,sourceRevision:producer.sourceRevision,bundleSha256:producer.bundleSha256},scope:'Actual registered UMF current-core owner tuple and Truss exact transport comparison. Namespace selection is an opaque independently admitted host premise, not native issuer/catalog authentication or graph profile qualification.'}));
