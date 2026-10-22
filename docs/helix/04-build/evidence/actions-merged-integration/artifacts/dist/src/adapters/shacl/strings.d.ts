import type SHACLValidator from 'rdf-validate-shacl';
/** Unicode scalar ordering, independent of host locale and UTF-16 surrogate ordering. */
export declare function compareShaclStrings(a: string, b: string): number;
export declare function installShaclStrings(validator: SHACLValidator): void;
