import {parseGregorianDate,truncateGregorianDate,GREGORIAN_DATE_PROFILE} from '../../../../../../src/adapters/gregorian-date';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const packet=JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/cases.json','utf8'));
const source='src/adapters/gregorian-date.ts';
const hash=createHash('sha256').update(readFileSync(source)).digest('hex');
if(packet.profile!==GREGORIAN_DATE_PROFILE||packet.sourceHashes[source]!==hash)throw new Error('Gregorian predecessor source/profile drift');
let checked=0;
for(const c of packet.cases){
 let actual:any;
 try{const value=c.op==='parseGregorianDate'?parseGregorianDate(c.args[0]):truncateGregorianDate(c.args[0],c.args[1]);actual={status:'ok',value};}
 catch(e:any){actual={status:'error',name:e?.name,message:e?.message};}
 if(JSON.stringify(actual)!==JSON.stringify(c.outcome))throw new Error(`${c.name}: ${JSON.stringify(actual)} != ${JSON.stringify(c.outcome)}`);
 checked++;
}
console.log(`Gregorian predecessor replay matched ${checked} cases on Bun ${Bun.version}; ${hash}`);
