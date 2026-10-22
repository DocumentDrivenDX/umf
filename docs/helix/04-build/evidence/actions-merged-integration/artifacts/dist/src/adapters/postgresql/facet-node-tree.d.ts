/** Bounded reader for the analyzed PostgreSQL 17.4 node subset used by CHECKs.
 * This is not a general pg_node_tree codec. Unknown fields are retained here
 * and must be refused by the semantic interpreter. */
export interface PgFacetNode {
    tag: string;
    fields: Record<string, PgFacetValue>;
}
export type PgFacetValue = string | PgFacetValue[] | PgFacetNode;
export declare function readFacetNodeTree(text: string): PgFacetNode | undefined;
/** Pinned little-endian, 64-bit Datum representation. No host-endian inference.
 * Numeric layout: PostgreSQL REL_17_4 numeric.c. Returned decimal is mathematical
 * value, with display-scale zeroes omitted; NaN/infinities remain unsupported. */
export declare function decodeFacetConstant(node: PgFacetNode): string | undefined;
