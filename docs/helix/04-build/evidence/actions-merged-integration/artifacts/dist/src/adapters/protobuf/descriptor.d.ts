import { type DescMessage } from '@bufbuild/protobuf';
import { type Json } from '../../model/types';
export interface DescriptorNode {
    type: string;
    fields: Record<string, Json>;
    unknown: {
        number: number;
        wireType: number;
        data: string;
    }[];
}
export declare const descriptorRoot: DescMessage;
export declare function readDescriptorSet(binary: Uint8Array): DescriptorNode;
export declare function writeDescriptorSet(input: DescriptorNode): Uint8Array;
