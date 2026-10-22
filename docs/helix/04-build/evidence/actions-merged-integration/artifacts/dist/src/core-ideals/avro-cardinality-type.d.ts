import { type NativeJson } from '../model/native-json';
export interface AvroTypeLocation {
    path: string;
    dependencyId?: string;
}
export interface AvroShapeBranch {
    location: AvroTypeLocation;
    native: NativeJson;
    type: string;
    shape: 'one' | 'array' | 'map' | 'null';
    definition?: AvroTypeLocation;
    item?: {
        location: AvroTypeLocation;
        native: NativeJson;
    };
}
interface AvroShape {
    branches: AvroShapeBranch[];
    /** Shape of a present, non-null value only; never member omission or reader defaults. */
    shape: 'one' | 'array' | 'map' | 'unspecified';
    allowsNull: boolean;
}
export interface AvroFieldShape extends AvroShape {
    field: AvroTypeLocation;
}
export interface AvroTypeShape extends AvroShape {
    location: AvroTypeLocation;
}
type Roots = {
    root: NativeJson;
    dependencyId?: string;
}[];
/** Structural carrier analysis. Defaults, logical types and unknown metadata stay in native nodes.
 * avsc validates declaration order, names, duplicate union branches and structural references.
 * It never receives numeric metadata or logical annotations that it could normalize.
 */
export declare function inspectAvroFieldShape(input: Roots, recordName: string, fieldName: string): AvroFieldShape;
/** Resolve only paths registered as type syntax, never paths into defaults or opaque metadata. */
export declare function inspectAvroTypeShape(input: Roots, location: AvroTypeLocation): AvroTypeShape;
/** Facet-specific structural profile. Earlier shape bindings retain their own
 * positive-size profile; this adds exact integer tokens and fixed size zero. */
export declare function inspectAvroFacetTypeShape(input: Roots, location: AvroTypeLocation): AvroTypeShape;
export {};
