/** Raw Snappy block decoder. Output size is validated before allocation and every copy. */
export declare function decodeSnappyBounded(input: Uint8Array, expected: number): Uint8Array;
