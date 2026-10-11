import {copyJson} from '../../model/json';
import {refreshParquetFieldMetadata} from './field-metadata';
import type {Document} from '../../model/types';
import type {ParquetWireValue} from './footer';
import {encodeParquetWire} from './encode';
import {exportParquetCapture,inspectParquetFraming,PARQUET_MAX_BYTES,PARQUET_EXTENSION} from './index';
/** Caller must check footer signatures, crypto, unknown fields and operation-specific semantics. */
export function rewriteParquetFooter(source:Document,tree:ParquetWireValue){
 const footer=encodeParquetWire(tree),framing=inspectParquetFraming(source),offset=framing.footerRegion!.offset,original=exportParquetCapture(source),size=offset+footer.length+8;if(size>PARQUET_MAX_BYTES)throw Error('Edited file exceeds capture limit');
 const bytes=new Uint8Array(size);bytes.set(original.subarray(0,offset));bytes.set(footer,offset);new DataView(bytes.buffer).setUint32(size-8,footer.length,true);bytes.set([80,65,82,49],size-4);
 const output=copyJson(source) as unknown as Document,p=output.modules.find(m=>m.id==='parquet')!.elements.find(e=>e.id==='source')!.extensions[PARQUET_EXTENSION] as any;p.bytes=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');refreshParquetFieldMetadata(output);return {output,unchangedPrefixBytes:offset};
}
export function unsafeParquetMetadata(v:any):boolean{return !!(v&&typeof v==='object'&&(Object.keys(v).some(k=>['$unknown','encryption_algorithm','footer_signing_key_metadata','crypto_metadata','encrypted_column_metadata'].includes(k))||Object.values(v).some(unsafeParquetMetadata)));}
