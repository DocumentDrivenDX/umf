import {test,expect} from 'bun:test';
import {OriginalSecurityPreparation,type OriginalPreparedHandle} from './truss-original-preparation';
import {lowerOriginalUsePreExecutionChecks} from '/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts';
const foundation=await Bun.file('docs/helix/04-build/evidence/security/weft-original-use.json').json();
const profileSha256=foundation.artifacts[0].handoff.profile.sha256;
const binary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff';
test('fresh owner preparation issues only locally owned handles',async()=>{
 const host=new OriginalSecurityPreparation(binary,foundation.sourceDigests,profileSha256);
 const handle=await host.prepare(JSON.stringify(foundation.artifacts[0].request));
 const rendered=host.render(handle);
 expect(rendered.handoff).toEqual(foundation.artifacts[0].handoff);
 expect(lowerOriginalUsePreExecutionChecks(rendered.program).length).toBeGreaterThan(0);
 expect(()=>host.render({...handle})).toThrow('ORIGINAL_PREPARATION_REFUSED');
 const other=new OriginalSecurityPreparation(binary,foundation.sourceDigests,profileSha256);
 expect(()=>other.render(handle)).toThrow('ORIGINAL_PREPARATION_REFUSED');
 rendered.request.sql='SELECT 1';rendered.handoff.version='forged';
 expect(host.render(handle).request.sql).toBe(foundation.artifacts[0].request.sql);
 expect(host.render(handle).handoff).toEqual(foundation.artifacts[0].handoff);
});
test('owner refusal and stale executable never issue a handle',async()=>{
 const host=new OriginalSecurityPreparation(binary,foundation.sourceDigests,profileSha256);
 const request=structuredClone(foundation.artifacts[0].request);
 request.queryProfileJson=JSON.stringify({...JSON.parse(request.queryProfileJson),ontologySha256:'0'.repeat(64)});
 await expect(host.prepare(JSON.stringify(request))).rejects.toThrow('ORIGINAL_PREPARATION_REFUSED');
 const stale=new OriginalSecurityPreparation(binary,{...foundation.sourceDigests,[binary]:'0'.repeat(64)},profileSha256);
 await expect(stale.prepare(JSON.stringify(foundation.artifacts[0].request))).rejects.toThrow('ORIGINAL_PREPARATION_REFUSED');
 expect(()=>host.render({kind:'original-prepared-query'} as OriginalPreparedHandle)).toThrow('ORIGINAL_PREPARATION_REFUSED');
});
test('owner success cannot bypass consumer refusal or selected host profile',async()=>{
 const host=new OriginalSecurityPreparation(binary,foundation.sourceDigests,profileSha256);
 const request=structuredClone(foundation.artifacts[0].request);request.sql='SELECT r.salary FROM Resource r';
 const owner=Bun.spawn([binary],{stdin:new TextEncoder().encode(JSON.stringify(request)),stdout:'pipe',stderr:'pipe'});
 expect(await owner.exited).toBe(0);
 expect(JSON.parse(await new Response(owner.stdout).text()).version).toBe('weft.security.mapping-handoff/0.2.0');
 await expect(host.prepare(JSON.stringify(request))).rejects.toThrow('TRUSS_SECURITY_QUERY_USE_UNSUPPORTED');
 await expect(host.prepare(JSON.stringify(foundation.artifacts.at(-1).request))).rejects.toThrow();
});
