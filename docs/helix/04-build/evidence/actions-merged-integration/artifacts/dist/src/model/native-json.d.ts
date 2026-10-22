export type NativeJson = {
    kind: 'null';
} | {
    kind: 'boolean';
    value: boolean;
} | {
    kind: 'string';
    value: string;
} | {
    kind: 'number';
    value: string;
} | {
    kind: 'array';
    items: NativeJson[];
} | {
    kind: 'object';
    members: Record<string, NativeJson>;
};
export declare function parseNativeJson(text: string): NativeJson;
/** Internal renderer: callers must check tree structure first. Never parses numbers. */
export declare function renderTree(node: NativeJson): string;
export declare function cloneTree(node: NativeJson): NativeJson;
export declare function nativePointer(pointer: string): string[];
export declare function treeChild(node: NativeJson, key: string): NativeJson;
/** JSON-compatible YAML with explicit scalar profile and exact numeric tokens; aliases/tags are rejected. */
export declare function parseNativeYaml(text: string, options?: {
    version?: '1.1' | '1.2';
    dateOnly?: 'string';
    booleanLexicon?: 'pyyaml';
}): NativeJson;
