export type PublicCompanyRow = Record<string, string | null>;
/** Local supplied recent arrays only; original JSON remains the source authority. */
export declare function projectSecSubmissions(input: string, sourceId: string): {
    companies: PublicCompanyRow[];
    identifiers: PublicCompanyRow[];
    filings: PublicCompanyRow[];
};
/** Every standard entity-wide Company Facts observation; no deduplication or Number conversion. */
export declare function projectSecCompanyFacts(input: string, sourceId: string): PublicCompanyRow[];
