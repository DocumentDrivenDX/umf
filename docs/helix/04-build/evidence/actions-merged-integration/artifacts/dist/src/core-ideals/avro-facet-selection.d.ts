import { type NativeJson } from '../model/native-json';
import { type AvroFacetTypeInspection } from '../adapters/avro/facet-type';
import { type AvroTypeLocation, type AvroShapeBranch } from './avro-cardinality-type';
export interface AvroFacetRoot {
    root: NativeJson;
    dependencyId?: string;
}
export interface AvroFacetSelectedBranch {
    branch: AvroShapeBranch;
    /** A named reference retains both its use site and complete definition. */
    declaration: {
        location: AvroTypeLocation;
        native: NativeJson;
    };
    inspection: AvroFacetTypeInspection;
}
export interface AvroFacetSelection {
    location: AvroTypeLocation;
    native: NativeJson;
    shape: 'one' | 'array' | 'map' | 'unspecified';
    allowsNull: boolean;
    branches: AvroFacetSelectedBranch[];
    basis: 'structural-selection-not-enforcement';
}
/** Resolve native type syntax only. Never select defaults/custom metadata or
 * merge union branch domains, infer authored facets, or flatten containers. */
export declare function inspectAvroFacetSelection(input: AvroFacetRoot[], selected: AvroTypeLocation): AvroFacetSelection;
