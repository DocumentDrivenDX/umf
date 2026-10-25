import {parseGregorianDate,truncateGregorianDate,GREGORIAN_DATE_PROFILE} from '../../../../../../src/adapters/gregorian-date';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const source='src/adapters/gregorian-date.ts';
const sourceHash=createHash('sha256').update(readFileSync(source)).digest('hex');
const cases:any[]=[];
function run(name:string,op:'parseGregorianDate'|'truncateGregorianDate',args:any[]){
 try { const value=op==='parseGregorianDate'?parseGregorianDate(args[0]):truncateGregorianDate(args[0],args[1]); cases.push({name,op,args, outcome:{status:'ok',value}}); }
 catch(e:any){ cases.push({name,op,args,outcome:{status:'error',name:e?.name,message:e?.message}}); }
}
for(const token of ['0001-01-01','0099-12-31','0400-02-29','1600-02-29','1900-02-28','2000-02-29','9999-12-31'])run('valid-'+token,'parseGregorianDate',[token]);
for(const token of ['0000-01-01','10000-01-01','-001-01-01','1900-02-29','2100-02-29','2000-02-30','2026-04-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','2026-1-01','2026-01-1','2026-01-01\n',' 2026-01-01','２０２６-01-01','2026-W01-1','2026-001','2026-01-01T00:00:00Z'])run('invalid-'+JSON.stringify(token),'parseGregorianDate',[token]);
for(const token of [null,1,true,{},[]])run('raw-host-'+JSON.stringify(token),'parseGregorianDate',[token]);
for(const [u,expect] of [['year','2026-01-01'],['quarter','2026-10-01'],['month','2026-10-01'],['day','2026-10-15']])run('truncate-'+u,'truncateGregorianDate',['2026-10-15',u]);
for(const [month,quarter] of [[1,1],[3,1],[4,4],[6,4],[7,7],[9,7],[10,10],[12,10]])run('quarter-'+month,'truncateGregorianDate',[`2000-${String(month).padStart(2,'0')}-15`,'quarter']);
for(const unit of ['Year','',null,{},'week'])run('unit-'+JSON.stringify(unit),'truncateGregorianDate',['2026-10-15',unit]);
run('date-before-unit-error','truncateGregorianDate',['2026-02-30','week']);
run('invalid-token-type-before-invalid-unit','truncateGregorianDate',[null,'week']);
const packet={format:'umf-r5-gregorian-date-typescript-predecessor/1',runtime:{bun:Bun.version},profile:GREGORIAN_DATE_PROFILE,sourceHashes:{[source]:sourceHash},cases};
writeFileSync('docs/helix/04-build/evidence/rust-migration/r5-gregorian-date-wire/cases.json',JSON.stringify(packet,null,2)+'\n');
console.log(JSON.stringify({sourceHash,cases:cases.length,ok:cases.filter(c=>c.outcome.status==='ok').length,errors:cases.filter(c=>c.outcome.status==='error').length}));
