import {test,expect} from 'bun:test';
import {evaluateCompositionEvidence,verifyCompositionFingerprints,verifyCompositionQualification} from '../scripts/uuid/composition-gates';
const base='fixtures/validation/uuid/';
async function evidence(){const [artifacts,pg,ms,files,tablespec,browser,returned,recovery]=await Promise.all(['composition-artifacts','composition-postgresql','composition-sqlserver','composition-files','composition-tablespec','composition-browser','composition-returned','composition-recovery'].map(n=>Bun.file(base+n+'.json').json()));return {artifacts,pg,ms,files,tablespec,browser,returned,recovery};}
test('source-bound composition qualification requires all five native targets and all stages',async()=>{expect((await verifyCompositionQualification()).fiveTargetCompositionDelivery).toBe(true);},30_000);
test('missing, falsified, stale and unsafe evidence cannot promote composition',async()=>{
 const e=await evidence();for(const change of [(v:any)=>v.pg.observations.pop(),(v:any)=>v.files.versions.avro='0',(v:any)=>v.browser.result.nodeGlobalsAbsent=false,(v:any)=>v.returned.rows--,(v:any)=>v.recovery.total--]){const v=structuredClone(e);change(v);expect(()=>evaluateCompositionEvidence(v)).toThrow();}
 await expect(verifyCompositionFingerprints({fingerprints:{}})).rejects.toThrow('Missing');
 await expect(verifyCompositionFingerprints({fingerprints:{'src/index.ts':'00','../escape':'00'}})).rejects.toThrow();
 const q=await Bun.file(base+'composition-qualification.json').json();q.fingerprints['../escape']='00';await expect(verifyCompositionFingerprints(q)).rejects.toThrow('Unsafe');
},30_000);
