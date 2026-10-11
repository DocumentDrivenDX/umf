import { type Document } from '../model/types';
import { type NativeJson } from '../model/native-json';
/** Declaration traversal only: never follow named references or inspect arbitrary annotations. */
export declare function avroRecords(source: Document): {
    path: string;
    dependencyId?: string;
    namespace: string;
    name: string;
    fullname: string;
    native: NativeJson;
}[];
