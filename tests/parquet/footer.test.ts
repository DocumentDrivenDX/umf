import {test,expect} from 'bun:test';
import {captureParquet,decodeParquetFooter,exportParquetCapture,coreSchema,parquetFooterDecodeSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(parquetFooterDecodeSchema);
const wrap=(footer:number[],magic='PAR1')=>{const b=new Uint8Array(footer.length+12);b.set(new TextEncoder().encode(magic));b.set(footer,4);new DataView(b.buffer).setUint32(b.length-8,footer.length,true);b.set(new TextEncoder().encode(magic),b.length-4);return b;};
test('US-019-AC5: exact footer trees match independent Apache Thrift observations',async()=>{
 const base='fixtures/parquet/footer/',m=await Bun.file(base+'manifest.json').json();expect(m.files).toBe(40);for(const c of m.results){const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer()),r=decodeParquetFooter(captureParquet(bytes,{id:c.id}));expect(r.status).toBe('decoded');expect({value:r.value,consumedBytes:r.consumedBytes,trailingBytes:r.trailingBytes}).toEqual(await Bun.file(base+c.id+'.expected.json').json());expect(check(r)).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);expect(r.complete).toBe(false);}
});
test('US-019-AC5: malformed and excessive wire values fail without partial interpretation',()=>{
 const varint=(n:number)=>{const b=[];while(n>127){b.push((n&127)|128);n=Math.floor(n/128);}return [...b,n];};
 for(const footer of [[0x15,0],[0x1e,0],[0x19,0x11,3,0],[0x18,10,1,0],[0x16,...Array(10).fill(255),0],[0x19,0xf5,...varint(50001),0],[0x1b,...varint(25000),0x55,0],[...Array(66).fill(0x1c),...Array(67).fill(0)]]){const bytes=wrap(footer),r=decodeParquetFooter(captureParquet(bytes,{id:'invalid'}));expect(r.status).toBe('blocked');expect(r.value).toBeUndefined();expect(exportParquetCapture(r.source)).toEqual(bytes);expect(check(r)).toBe(true);}
});
test('US-019-AC5: unknown UUID fields and trailing bytes remain distinct from native validity',()=>{
 const uuid=Array.from({length:16},(_,i)=>i),bytes=wrap([0x1d,...uuid,0,42]),r=decodeParquetFooter(captureParquet(bytes,{id:'uuid'}));expect(r.value).toEqual({kind:'struct',fields:[{id:1,value:{kind:'uuid',hex:'000102030405060708090a0b0c0d0e0f'}}]});expect(r.trailingBytes).toBe(1);expect(r.diagnostics.some(d=>d.code==='PARQUET_FOOTER_TRAILING')).toBe(true);expect(exportParquetCapture(r.source)).toEqual(bytes);
 const encrypted=decodeParquetFooter(captureParquet(wrap([0],'PARE'),{id:'encrypted'}));expect(encrypted.status).toBe('blocked');expect(encrypted.diagnostics.some(d=>d.code==='PARQUET_FOOTER_ENCRYPTED')).toBe(true);
});
