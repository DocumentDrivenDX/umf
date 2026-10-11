import { type Document } from '../../model/types';
/** Preserve supplied IDL/JSON text. No browser syntax or semantic validity claim. */
export declare function importSmithySources(input: {
    files: Record<string, string>;
}, options: {
    id: string;
}): Document;
export declare function exportSmithySources(document: Document): {
    files: Record<string, string>;
};
export declare function proposeSmithySourceEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
