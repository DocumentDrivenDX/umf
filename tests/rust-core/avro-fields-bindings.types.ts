import type {AvroFieldMetadata as NodeAvroField, AvroFieldsEngine as NodeAvroEngine} from '../../bindings/core/node/index.js';
import type {AvroFieldMetadata as WasmAvroField, AvroFieldsEngine as WasmAvroEngine} from '../../bindings/core/wasm/index.js';

declare const wasmField: WasmAvroField;
declare const nodeField: NodeAvroField;
declare const wasmEngine: WasmAvroEngine;
declare const nodeEngine: NodeAvroEngine;

const wasmElementName: string = wasmField.element.name;
const nodeElementName: string = nodeField.element.name;
const optionalDependencyId: string | undefined = wasmField.dependencyId;
const wasmFromNode: WasmAvroField = nodeField;
const nodeFromWasm: NodeAvroField = wasmField;
const wasmResults: WasmAvroField[] = wasmEngine.deriveAvroFields({}, [{id: 'dependency', root: {}}]);
const nodeResults: NodeAvroField[] = nodeEngine.deriveAvroFields({});

// @ts-expect-error Derived properties are nested under `element`.
wasmField.name;
// @ts-expect-error Root fields omit dependencyId rather than returning null.
const requiredDependencyId: string = wasmField.dependencyId;

void [wasmElementName, nodeElementName, optionalDependencyId, wasmFromNode, nodeFromWasm, wasmResults, nodeResults, requiredDependencyId];
