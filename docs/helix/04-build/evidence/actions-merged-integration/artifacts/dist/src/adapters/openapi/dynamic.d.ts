import { type Document } from '../../model/types';
/** Resolve one $dynamicRef against an explicit outermost-to-innermost resource stack. */
export declare function resolveOpenapiDynamicReference(document: Document, input: {
    pointer: string;
    resourceUri?: string;
    schemaResources?: string[];
    evaluationScope: string[];
}): {
    source: import("./scope").OpenapiSchemaLocation;
    initialTarget: import("./scope").OpenapiSchemaLocation;
    target: import("./scope").OpenapiSchemaLocation;
    node: import("../json-schema").NativeJson;
    evaluationScope: string[];
    resolution: "dynamic" | "static";
    complete: false;
    limitations: string[];
};
