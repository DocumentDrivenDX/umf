import { type Json } from './types';
export declare function readJsonValue(text: string, format?: 'json' | 'yaml'): Json;
export declare function writeJsonValue(value: unknown, format?: 'json' | 'yaml'): string;
