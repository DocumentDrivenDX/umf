// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from './schema-literals';
export type CoreSchemaPropertyIdentity={scope:'document'}|{scope:'module';module:string}|{scope:'element';module:string;element:string};
export interface CoreSchemaPropertyPatch {
 title?:string;aliases?:string[];examples?:CoreLiteral[];allowedValues?:CoreLiteral[];
 default?:{value:CoreLiteral;on:'missing'|'null'|'missing-or-null'};
 facets?:{length?:{min?:number;max?:number;unit:'unicode-scalar'|'byte'};collectionSize?:{min?:number;max?:number};range?:{min?:CoreLiteral;max?:CoreLiteral;minInclusive?:boolean;maxInclusive?:boolean}};
}
export type CoreDefaultInput={state:'missing'}|{state:'present';value:CoreLiteral};
