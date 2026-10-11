/** Direct decimal -> binary32 rounding; avoids decimal -> binary64 -> binary32 double rounding. */
export declare function parseShaclFloat(source: string, width: 32 | 64): {
    value: number;
} | null;
