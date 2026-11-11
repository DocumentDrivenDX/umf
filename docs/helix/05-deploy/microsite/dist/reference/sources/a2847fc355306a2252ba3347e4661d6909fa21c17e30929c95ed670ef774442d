// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Element} from './types';
export {inspectCoreReferenceLinks} from '#umf-source';
export interface CoreReferenceLinkIdentity {module:string;element:string}
export interface CoreReferenceLink {index:number;path:string;reference:NonNullable<Element['references']>[number];target:{identity:CoreReferenceLinkIdentity;path:string;kind?:string};uninterpretedPaths:string[];typeAssertion:'unverified'}
export interface CoreReferenceLinksInspection {operation:'inspect-core-reference-links';version:'0.3.0';source:Document;identity:CoreReferenceLinkIdentity;path:string;meaning:{state:'missing'}|{state:'present';links:CoreReferenceLink[]};provenance:'unverified'}
