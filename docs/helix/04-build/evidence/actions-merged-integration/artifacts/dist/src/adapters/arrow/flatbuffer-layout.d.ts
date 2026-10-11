export type Field = {
    name: string;
    type: string;
    required: boolean;
};
export type Decl = {
    name: string;
    kind: string;
    base?: string;
    fields?: Field[];
    members?: {
        name: string;
        value: number;
    }[];
};
export declare const declarations: Map<string, Decl>;
export declare const shortName: (name: string) => string;
export declare function layout(name: string): {
    size: number;
    alignment: number;
    fields?: {
        field: Field;
        offset: number;
    }[];
};
