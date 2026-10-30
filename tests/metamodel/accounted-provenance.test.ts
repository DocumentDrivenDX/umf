// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {admitAccountedInput} from '../../scripts/metamodel/accounted-provenance';
const old='906cd23c97dc5c1f2d63c269999b86a7bb21f348ad6579bd2347218714d796bb',next='1'.repeat(64);
const pins:Record<string,string>={'src/generated/core-validators.ts':'563602e0f21f6d6b0efd1ae069dbda28926e085585b4bf0430347b65ff2bd0ff','spec/core/schema.json':'c6004664eb93dcef28ce6e0583f91225b618aa0fb42967a892242402557cf71d','spec/core/semantic-type-reference.schema.json':'207abbad54ebf8c660a958e2deda072a5a3236b5b8df5af8a8656f90c3e46ba9','spec/core/extension-package.schema.json':'4df3c8f92c5baa2c52f965d83b681ff306392bf9ba333bd39213a8f1065ac766'};
const encode=(text:string)=>new TextEncoder().encode(text);
for(const [path,pin] of Object.entries(pins)){
 const current=await Bun.file(path).text(),historical=current.replace(/(Generated from spec\/metamodel\/umf\.yaml; model 42144576e3b15da4945ca744623a31967e3b29efa54da8ba3961e446b1c0e34b; compiler )[0-9a-f]{64}/g,'$1'+old),bytes=encode(historical),fresh=historical.replaceAll('compiler '+old,'compiler '+next);
 test(path+' admits exact historical bytes and only provenance changes',()=>{
  expect(admitAccountedInput(path,bytes,pin,bytes.length).provenanceOnly).toBe(false);
  const result=admitAccountedInput(path,encode(fresh),pin,bytes.length);expect(result.provenanceOnly).toBe(true);expect(result.sha256).not.toBe(pin);expect(result.historicalSha256).toBe(pin);
 });
 test(path+' refuses same-length schema/code and provenance shape mutations',()=>{
  const variants=[fresh.replace('42144576','02144576'),fresh.replace('Generated from spec/metamodel','Generated from spec/metamodeX'),fresh.replace('compiler '+next,'compileR '+next),fresh.replace('"object"','"string"')];
  if(path.endsWith('.ts'))variants.push(fresh.replace('const schema','const schemb'),fresh.replace('compiler '+next,'compiler '+'2'.repeat(64)));
  for(const value of variants){expect(value).not.toBe(fresh);expect(()=>admitAccountedInput(path,encode(value),pin,bytes.length)).toThrow('METAMODEL_COMPANION_INPUT_DRIFT');}
  expect(()=>admitAccountedInput(path,encode(fresh+'extra provenance'),pin,bytes.length)).toThrow();
 });
}
test('unlisted paths cannot opt into provenance admission',()=>{expect(()=>admitAccountedInput('src/other.ts',encode('x'),'00',1)).toThrow();});
