import { type NativeJson } from '../../model/native-json';
import { type Element } from '../../model/types';
export interface PostgresqlColumnMetadata {
    path: string;
    relation: {
        schema: string;
        name: string;
        kind: string;
    };
    element: Element;
    nativeColumn: NativeJson;
}
export declare function derivePostgresqlColumns(root: NativeJson): PostgresqlColumnMetadata[];
