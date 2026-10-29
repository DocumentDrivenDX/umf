// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private JSON-only document reader for a single internal accounting scope. */
import type {AccountingContext} from './internal/accounting-context';
import {UmfError,type Document} from './types';
import {validateDocumentWithAccounting} from '../validation/document';
import {Registry} from '../registry/registry';
import {scanJsonFrameCharged} from './internal/scan-json-frame';

export function readJsonDocumentWithAccounting(text:string,accounting:AccountingContext):Document{
 if(text.length>4_000_000)throw new UmfError('LIMIT','Source text exceeds limit');
 accounting.scanUtf8(text,'/source');
 // Reserve the complete bounded scanner pass before it inspects or creates
 // any decoded string/key. This is actual input length, not a post-hoc estimate.
 accounting.visit('json-source-scan-block','/source',Math.ceil(text.length/4096));
 // Use UMF's qualified JSON grammar scanner directly. readJsonValue's normal
 // JSON path may route through the YAML AST/converter when the scoped catalog
 // value limit is inactive; R2 must not hide that unmetered allocation.
 scanJsonFrameCharged(text,100_000,128,
  ()=>accounting.visit('json-token','/source'),
  (decodedBytes,isKey)=>{accounting.retainBytes(isKey?'json-scanner-key':'json-scanner-string',decodedBytes,`/source/${isKey?'@key':'@string'}`);},
  (_value,isKey,decodedBytes)=>{accounting.retainBytes(isKey?'json-document-key':'json-document-string',decodedBytes,`/source/${isKey?'@key':'@string'}`);if(isKey)accounting.visit('json-object-key-set-retention','/source/@key');},
 );
 const value=JSON.parse(text);
 const result=validateDocumentWithAccounting(value,new Registry(),(category,count)=>accounting.visit(`document-${category}`,'/document',count),{
  property:(key,path,isArray)=>{accounting.visit('document-copy-property-preflight',path);if(!isArray)accounting.scanUtf8(key,path);},
  text:(text,path)=>{accounting.scanUtf8(text,path);},
 });
 if(!result.valid)throw new UmfError('INVALID_DOCUMENT',JSON.stringify(result.diagnostics));
 return value as unknown as Document;
}
