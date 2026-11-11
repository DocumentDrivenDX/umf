// SPDX-License-Identifier: MIT OR Apache-2.0
import type {NativeJson} from '../../model/native-json';
import type {Element} from '../../model/types';
import {SQLSERVER_EXTENSION,sqlserverPackage} from './package';
export { SQLSERVER_EXTENSION, sqlserverPackage };
export interface SqlServerColumnMetadata {path:string;table:{schema:string;name:string};element:Element;nativeColumn:NativeJson;}
export interface SqlServerConstraintMetadata {complete:false;tables:{path:string;table:{schema:string;name:string};available:{keys:boolean;foreign_keys:boolean;checks:boolean};keys:NativeJson[];foreign_keys:NativeJson[];checks:NativeJson[]}[];}
export interface SqlServerIndexMetadata {complete:false;tables:{path:string;table:{schema:string;name:string};available:boolean;indexes:NativeJson[]}[];}
