export type MedicalRow = Record<string, string | boolean | null>;
export type MedicalTables = Record<string, MedicalRow[]>;
/** Selected R4 views only. Originals, exact fragments and unresolved edges remain explicit. */
export declare function projectMedicalFhir(inputs: {
    source_id: string;
    text: string;
}[], namespace: string): MedicalTables;
/** The specific CDC leading-causes dataset has adjusted rates and no row denominators. */
export declare function projectCdcMortality(textSource: string, sourceId: string): MedicalRow[];
/** DICOM JSON metadata only. Does not read binaries, dereference BulkDataURI or decode pixels. */
export declare function projectDicomMetadata(textSource: string, sourceId: string): MedicalTables;
export interface MedicalTerminologyRecord {
    system: string;
    release: string;
    code: string;
    display?: string;
    [key: string]: unknown;
}
/** Exact local lookup; an unavailable dictionary is not evidence that a code is invalid. */
export declare function lookupMedicalTerminology(query: {
    system: string;
    release: string;
    code: string;
}, records?: MedicalTerminologyRecord[]): {
    status: 'matched' | 'not-in-subset' | 'source-unavailable';
    matches: MedicalTerminologyRecord[];
};
