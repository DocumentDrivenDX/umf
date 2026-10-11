import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type TableSpecFacetProfile } from './facets-tablespec';
export { default as facetsTableSpecProjectionSchema } from '../../spec/core/facets-tablespec-projection.schema.json';
export interface FacetsTableSpecRequest {
    id: string;
    tableName: string;
    columnName: string;
    nativeType: 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'FLOAT' | 'TEXT' | 'VARCHAR' | 'CHAR' | 'DATE' | 'DATETIME' | 'TIMESTAMP';
    mode: 'strict' | 'report';
    profile: TableSpecFacetProfile;
    input: 'raw' | 'model-normalized';
    obligation: 'value-domain' | 'exact-input';
}
type Author = CoreFacetDeclaration | CoreKindDeclaration;
type Outcome = 'exact' | 'approximated' | 'unknown' | 'not-expressible';
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
export interface FacetsTableSpecProjection {
    operation: 'project-facets-tablespec';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: Author;
    request: FacetsTableSpecRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/columns/0';
        facets: CoreFacetPatch;
        profile: TableSpecFacetProfile;
        outcome: Outcome;
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        recovery: typeof recovery;
    }[];
}
/** Project verified author intent. Native carrier defaults never become author assertions. */
export declare function projectFacetsToTableSpec(input: Author, options: FacetsTableSpecRequest): FacetsTableSpecProjection;
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export declare function recoverFacetsFromTableSpec(input: FacetsTableSpecProjection, nativeText: string): Document;
