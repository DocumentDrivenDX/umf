// SPDX-License-Identifier: MIT OR Apache-2.0
import type {UmfCodegenEngine as NodeEngine} from '../../bindings/core/node/index.js';
import type {UmfCodegenEngine as WasmEngine} from '../../bindings/core/wasm/index.js';
export function inspect(engine: NodeEngine | WasmEngine, document: unknown) {
 const selected = [{module:'commerce',element:'Order'}] as const;
 const result: {records:unknown[];diagnostics:unknown[]} = engine.inspectAccessViews(document,selected);
 engine.inspectAccessViews(document,selected,[{sourceId:'binding',document}],'logical');
 engine.call('inspectAccessViews',{document,selected});
 // @ts-expect-error bindings require the original source identity
 engine.inspectAccessViews(document,selected,[{document}]);
 // @ts-expect-error the selected references retain both identity parts
 engine.inspectAccessViews(document,[{element:'Order'}]);
 return result;
}
