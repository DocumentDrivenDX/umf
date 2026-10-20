// SPDX-License-Identifier: MIT OR Apache-2.0
export type Ref={module:string;element:string};
export type FieldInfo={id:string;python:string;scalar:string;cardinality:string;missing:boolean;nullable:boolean;facets:Record<string,unknown>;item?:FieldInfo;allowed?:unknown[];allowedLiterals?:unknown[];semanticTypes?:unknown;semanticTypeInterpretation?:string;extensions?:Record<string,unknown>;extensionInterpretation?:'opaque-presentation-metadata-only'};
