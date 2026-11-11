// SPDX-License-Identifier: MIT OR Apache-2.0
/** A property-path description returned by the native SHACL subset. */
export type ShaclPath=
 | {kind:'predicate';iri:string}
 | {kind:'sequence'|'alternative';paths:ShaclPath[]}
 | {kind:'inverse'|'zeroOrMore'|'oneOrMore'|'zeroOrOne';path:ShaclPath};
