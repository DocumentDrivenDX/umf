import {expect, test} from 'bun:test';
import {bindCoreKindNullabilityRust} from '../src/access/rust-kind-nullability-default';
import {UmfError} from '../src/model/errors';

function branded(code: string) {
	const error = Object.assign(new Error('native response'), {name: 'UmfCoreError', code, path: '/source'});
	return error;
}

test('the default adapter maps branded domain errors and preserves resource-limit identity', () => {
	const brands = new WeakSet<object>();
	const domainError = branded('CORE_KIND_VALUE');
	const resourceError = branded('RESOURCE_LIMIT');
	brands.add(domainError);
	brands.add(resourceError);
	let thrown: unknown;
	const facade = bindCoreKindNullabilityRust({
		inspectCoreElementKind() { throw domainError; },
	} as any, error => brands.has(error as object));
	try { facade.inspectCoreElementKind({} as any, {} as any); }
	catch (error) { thrown = error; }
	expect(thrown).toBeInstanceOf(UmfError);
	expect(thrown).not.toBe(domainError);
	expect(thrown).toMatchObject({code: 'CORE_KIND_VALUE', path: '/source'});

	const resourceFacade = bindCoreKindNullabilityRust({
		inspectCoreElementKind() { throw resourceError; },
	} as any, error => brands.has(error as object));
	thrown = undefined;
	try { resourceFacade.inspectCoreElementKind({} as any, {} as any); }
	catch (error) { thrown = error; }
	expect(thrown).toBe(resourceError);
});

test('unbranded caller errors retain identity without reading their properties', () => {
	let reads = 0;
	const error = new Proxy(new Error('caller failure'), {
		get(target, key, receiver) {
			if (key === 'code' || key === 'message' || key === 'path') reads++;
			return Reflect.get(target, key, receiver);
		},
	});
	const facade = bindCoreKindNullabilityRust({
		inspectCoreElementKind() { throw error; },
	} as any, () => false);
	let thrown: unknown;
	try { facade.inspectCoreElementKind({} as any, {} as any); }
	catch (caught) { thrown = caught; }
	expect(thrown).toBe(error);
	expect(reads).toBe(0);
});
