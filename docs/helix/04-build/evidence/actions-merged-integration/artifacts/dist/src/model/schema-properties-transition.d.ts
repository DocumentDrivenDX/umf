import { type Document, type Json } from './types';
export interface SchemaPropertiesUpgradeReceipt {
    operation: 'upgrade-schema-properties-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    residuals: {
        path: string;
        value: Json;
        reason: 'Legacy content retained without reinterpretation';
    }[];
}
export declare function upgradeSchemaPropertiesEnvelope(input: Document): SchemaPropertiesUpgradeReceipt;
export declare function verifySchemaPropertiesUpgrade(input: SchemaPropertiesUpgradeReceipt): SchemaPropertiesUpgradeReceipt;
export declare function rollbackSchemaPropertiesEnvelope(input: SchemaPropertiesUpgradeReceipt, current: Document): {
    operation: 'rollback-schema-properties-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    receipt: SchemaPropertiesUpgradeReceipt;
    reason: string;
};
