import type { RdfQuad } from '../rdf';
/** Check list structure before a native reader can silently treat malformed input as empty. */
export declare function checkShaclConstraintLists(quads: RdfQuad[]): void;
