// SPDX-License-Identifier: MIT OR Apache-2.0
export type PackToolsTarget='ddl'|'orm'|'crud';
export type PackToolsSourceFormat='json'|'yaml';
export interface PackToolsSource {
 id:string;
 path:string;
 format:PackToolsSourceFormat;
 schemaFormat:string;
 text:string;
}
export interface PackToolsRequest {
 profile:'umf.pack-tools/1';
 pack:{id:string;version:string;text:string};
 sources:PackToolsSource[];
 options:{schema:string;package:string};
 targets:PackToolsTarget[];
}
export type PackToolsFileKind='ddl'|'orm'|'crud'|'source'|'report'|'readme';
export interface PackToolsFile {path:string;text:string;sha256:string;kind:PackToolsFileKind}
export interface PackToolsDiagnostic {
 severity:'info'|'warning'|'error';
 code:string;
 source:string;
 path:string;
 message:string;
}
export interface PackToolsCoverage {
 source:string;
 status:'generated'|'unsupported'|'blocked';
 table?:string;
 operations:string[];
}
export interface PackToolsResult {
 profile:'umf.pack-tools-result/1';
 status:'generated'|'partial'|'blocked';
 pack:{id:string;version:string};
 sourceDigest:string;
 files:PackToolsFile[];
 diagnostics:PackToolsDiagnostic[];
 coverage:PackToolsCoverage[];
}
