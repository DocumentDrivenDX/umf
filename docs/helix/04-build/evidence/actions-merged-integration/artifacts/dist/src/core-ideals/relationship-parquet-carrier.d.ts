import { type AvroRelationshipCarrier } from './relationship-avro-carrier';
/** Restricted common ASCII naming profile; namespace and keyRecordName are logical labels only. */
export type ParquetRelationshipCarrier = AvroRelationshipCarrier;
export declare function buildParquetRelationshipCarrier(input: ParquetRelationshipCarrier): Uint8Array;
