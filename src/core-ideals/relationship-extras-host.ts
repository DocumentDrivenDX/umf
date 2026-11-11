// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only callback adapter for native archives; actual import semantics are injected by the Rust-backed V4 roots. */
import type {Document} from '../model/types';
import type {RelationshipExtraArchive} from './relationship-extras-types';

export type RelationshipExtraImporter = (archive:RelationshipExtraArchive,id:string)=>Document;
export function importRelationshipExtraArchive(input:RelationshipExtraArchive,id:string,importers:{graphql:(text:string,id:string)=>Document;rdf:(text:string,id:string,blankNodeScope:string)=>Document;linkml:(text:string,id:string,format:'json'|'yaml')=>Document}):Document{
 if(input.format==='graphql-sdl')return importers.graphql(input.text,id);
 if(input.format==='rdf-nquads')return importers.rdf(input.text,id,input.blankNodeScope);
 return importers.linkml(input.text,id,input.format==='linkml-json'?'json':'yaml');
}
