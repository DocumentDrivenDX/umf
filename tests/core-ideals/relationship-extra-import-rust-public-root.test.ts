// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importRelationshipExtraArchive} from '../../src/index-node-v4';

test('Relationship Extra archive import is Rust-backed at the public Node root',()=>{
 const archive={format:'graphql-sdl' as const,text:'type Query { ping: String }'};
 const document=importRelationshipExtraArchive(archive,'relationship-extra-import');
 expect(document.id).toBe('relationship-extra-import');
 expect(document.vocabularies['umf.graphql']?.version).toBe('0.1.0');
 expect(archive).toEqual({format:'graphql-sdl',text:'type Query { ping: String }'});
 expect(()=>importRelationshipExtraArchive({format:'rdf-nquads',text:'',blankNodeScope:''} as never,'invalid')).toThrow();
 const recovered=importRelationshipExtraArchive(archive,'relationship-extra-recovery');
 expect(recovered.id).toBe('relationship-extra-recovery');
 expect(recovered.vocabularies['umf.graphql']?.version).toBe('0.1.0');
});
