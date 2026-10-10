export interface AvroRelationshipCarrier {
    recordName: string;
    namespace: string;
    fieldName: string;
    keyRecordName: string;
    shape: 'one' | 'nullable-one' | 'array';
    components: {
        name: string;
        type: 'boolean' | 'int' | 'long' | 'float' | 'double' | 'bytes' | 'string';
    }[];
}
/** Internal wire builder: callers must separately verify authored mapping and report semantic losses. */
export declare function buildAvroRelationshipCarrier(input: AvroRelationshipCarrier): string;
