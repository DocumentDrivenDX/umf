/** Pinned Iceberg 1.11.0 single-source transform type rules; no value execution. */
export interface IcebergTransformType {
    sourceType: string;
    transform: string;
    status: 'compatible' | 'incompatible' | 'uninterpreted';
    resultType?: string;
    complete: false;
    reason: string;
}
export declare function inspectIcebergTransformType(sourceType: string, transform: string): IcebergTransformType;
