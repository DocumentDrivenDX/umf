// SPDX-License-Identifier: MIT OR Apache-2.0
import {
 parseNativeJson,parseNativeYaml,readJsonValue,readDocument,validateDocument,
 importTableSpec,inspectTableSpec,inspectDomainPack,
} from '../../../../src/index-node-v4';
import {renderTree} from '../../../../src/model/native-json';
import {parseEntry as parse,type Entry,type ExplorerRuntime} from './explorer-model';

const runtime:ExplorerRuntime={
 parseNativeJson,parseNativeYaml,renderNative:renderTree,readJsonValue,readDocument,validateDocument,
 importTableSpec,inspectTableSpec,inspectDomainPack,
};
export const parseEntry=(entry:Entry)=>parse(entry,runtime);
export {matches,type Entry} from './explorer-model';
