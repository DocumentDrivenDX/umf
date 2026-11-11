// SPDX-License-Identifier: MIT OR Apache-2.0
import {PARQUET_EXTENSION,PARQUET_MAX_BYTES,parquetPackage} from './package';
import type {Document,Diagnostic} from '../../model/types';
export {PARQUET_EXTENSION,PARQUET_MAX_BYTES,parquetPackage};
export interface ParquetFraming {source:Document;status:'located'|'invalid';complete:false;byteLength:number;footerRegion?:{offset:number;length:number;mode:'plaintext-or-signed'|'encrypted'};diagnostics:Diagnostic[]}
