import { type NativeJson } from '../model/native-json';
import { type CoreFacetPatch } from '../model/facets';
type Concept = 'length' | 'decimal' | 'integerWidth';
export interface TableSpecSuiteClaim {
    concept: Concept;
    path: string;
    basis: string;
}
export interface TableSpecSuiteIssue {
    path: string;
    value: NativeJson;
    reason: string;
}
/** Closed, unconditional suite subset. Unknown native content is reported, never evaluated. */
export declare function inspectTableSpecFacetSuite(table: NativeJson, column: number): {
    facets: CoreFacetPatch;
    claims: TableSpecSuiteClaim[];
    issues: TableSpecSuiteIssue[];
};
export {};
