import Ajv2020 from 'ajv/dist/2020';
export declare function createValidator(strict?: boolean): Ajv2020;
export declare function installJsonEquality(validator: Pick<Ajv2020, 'removeKeyword' | 'addKeyword'>): void;
export declare const checkCore: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreFields: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreNullability: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreCardinality: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreFacets: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkPackage: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreKeys: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkCoreRelationships: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
