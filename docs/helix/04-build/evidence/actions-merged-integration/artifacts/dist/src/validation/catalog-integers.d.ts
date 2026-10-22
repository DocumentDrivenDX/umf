import type { NativeJson } from '../model/native-json';
/** Exact integer preflight for the owned catalog schemas. Not a JSON Schema validator.
 * Traverses declared properties/items, local $defs references and nullable anyOf.
 * Unknown native properties remain uninterpreted.
 */
export declare function catalogIntegerErrors(root: NativeJson, schema: any): string[];
