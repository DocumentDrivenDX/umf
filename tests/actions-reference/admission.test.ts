import {test,expect} from 'bun:test';
import {encodeReferenceJson,encodeReferenceIdentity,decodeReferenceJson} from '../../scripts/actions-reference/codec';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {admitReferenceRequest,canonicalReferenceVersions} from '../../scripts/actions-reference/protocol';
import fixture from '../../fixtures/actions/approve.json';
import type {Action} from '../../src/extensions/actions';
// Partial protocol/issuer witnesses; complete US-901 end-to-end criteria remain unqualified.
test('trusted issuer authenticates human and service independently and refuses credential tampering',()=>{
 const issuer=new ReferenceActionIssuer(),identity={tenant:'tenant',principal:'human',service:'service'},credential=issuer.issue(identity);
 expect(issuer.authenticate(credential)).toEqual(identity);expect(()=>new ReferenceActionIssuer().authenticate(credential)).toThrow('AUTHENTICATION');
 const changed=Buffer.from(JSON.stringify({...identity,principal:'admin'})).toString('base64url')+'.'+credential.split('.')[1];expect(()=>issuer.authenticate(changed)).toThrow('AUTHENTICATION');
 expect(()=>issuer.issue({...identity,principal:''})).toThrow('AUTHENTICATION');expect(()=>issuer.issue({...identity,roles:['admin']} as any)).toThrow('AUTHENTICATION');
 expect(issuer.authenticate(issuer.issue({...identity,service:'another-service'})).principal).toBe('human');
 const escaped={tenant:'\u0000'.repeat(256),principal:'\u0000'.repeat(256),service:'\u0000'.repeat(256)};expect(issuer.authenticate(issuer.issue(escaped))).toEqual(escaped);
});
test('logical requests refuse spoofed context and canonicalize version assertions by declaration',()=>{
 const base={protocol:'umf.actions.tx/1',target:{module:'sales',action:'approve',revision:'r1'},inputs:{},key:'token'},action=structuredClone(fixture.modules[0]!.extensions['umf.actions'].actions[0]) as unknown as Action;
 action.reads=[{...structuredClone(action.writes[0]!),id:'order-read'}];
 const request=admitReferenceRequest({...base,expectedVersions:[{frame:'order-write',version:'v1'},{frame:'order-read',version:'v0'}]},'invoke');
 expect(canonicalReferenceVersions(action,request)).toEqual([{frame:'order-read',version:'v0'},{frame:'order-write',version:'v1'}]);
 const reversed=admitReferenceRequest({...base,expectedVersions:[...request.expectedVersions!].reverse()},'invoke');expect(canonicalReferenceVersions(action,reversed)).toEqual(canonicalReferenceVersions(action,request));
 for(const input of [{...base,principal:'admin'},{...base,tenant:'other'},{...base,service:'other'},{...base,target:{...base.target,document:'foreign'}},{...base,expectedVersions:[{frame:'order-read',version:'v1'},{frame:'order-read',version:'v2'}]},{...base,key:'x'.repeat(1025)}])expect(()=>admitReferenceRequest(input,'invoke')).toThrow();
 expect(()=>admitReferenceRequest(base,'preview')).toThrow();expect(()=>admitReferenceRequest({...base,key:undefined},'lookup')).toThrow();
 expect(()=>canonicalReferenceVersions(action,admitReferenceRequest({...base,expectedVersions:[{frame:'missing',version:'v0'}]},'lookup'))).toThrow();
});

test('lossless native codec preserves every admitted string identity and refuses ambiguous representations',()=>{
 const value=JSON.parse('{"10":"\\u0000","2":"\\ud800","__proto__":{"retained":true}}');expect(decodeReferenceJson(encodeReferenceJson(value))).toEqual(value);expect(decodeReferenceJson(encodeReferenceIdentity(value))).toEqual(value);
 expect(encodeReferenceIdentity('\ud800')).not.toBe(encodeReferenceIdentity('\ud801'));expect(()=>decodeReferenceJson('{"x":1,"x":2}')).toThrow();expect(()=>decodeReferenceJson('{ "x":1 }')).toThrow();
});
