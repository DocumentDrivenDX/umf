/** Source preservation only; no transform interpretation or native authority. */
import {copyJson} from '../../../model/json';
import {readJsonValue,writeJsonValue} from '../../../model/serialization';
import type {Json} from '../../../model/types';

export const readProtectionSource=(text:string,format:'json'|'yaml'='json'):Json=>readJsonValue(text,format);
export const writeProtectionSource=(input:unknown,format:'json'|'yaml'='json'):string=>writeJsonValue(copyJson(input),format);
