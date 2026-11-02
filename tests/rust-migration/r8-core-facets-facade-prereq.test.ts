// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import type {CoreFacetsRustEngine} from '../../src/access/rust-facets-default';
import {bindCoreFacetsRust} from '../../src/access/rust-facets-default';
import {UmfError} from '../../src/model/errors';
import type {Document} from '../../src/model/types';

const document = (): Document => ({
	umf: '0.10.0',
	id: 'facets',
	vocabularies: {},
	extensions: {},
	modules: [],
});

function observedObject<T extends object>(value: T, trace: string[], label: string): T {
	return new Proxy(value, {
		getPrototypeOf(target) {
			trace.push(`${label}:getPrototypeOf`);
			return Reflect.getPrototypeOf(target);
		},
		ownKeys(target) {
			trace.push(`${label}:ownKeys`);
			return Reflect.ownKeys(target);
		},
		getOwnPropertyDescriptor(target, key) {
			trace.push(`${label}:descriptor:${String(key)}`);
			return Reflect.getOwnPropertyDescriptor(target, key);
		},
	});
}

function facetError(code: string, message: string) {
	return Object.assign(new Error(message), {
		name: 'UmfCoreError',
		code: `CORE_FACET_${code}`,
		path: '/facets',
	});
}

test('Core Facets facade rejects declaration requests before reflecting over source', () => {
	const order: string[] = [];
	const sourceTrace: string[] = [];
	const engine = {
		admitCoreFacetRequest() {
			order.push('admit-request');
			throw facetError('REQUEST', 'Invalid facet patch');
		},
	} as unknown as CoreFacetsRustEngine;
	const api = bindCoreFacetsRust(engine);
	const source = observedObject(document(), sourceTrace, 'source');

	let thrown: unknown;
	try {
		api.declareCoreFacets(source, {module: 'm', element: 'v'}, {precision: 2, scale: 1});
	} catch (error) {
		thrown = error;
	}

	expect(order).toEqual(['admit-request']);
	expect(sourceTrace).toEqual([]);
	expect(thrown).toBeInstanceOf(UmfError);
	expect(thrown).toMatchObject({
		code: 'CORE_FACET_REQUEST',
		message: 'Invalid facet patch',
		path: '/facets',
	});
});

test('Core Facets facade validates a receipt before reflecting over current document', () => {
	const order: string[] = [];
	const currentTrace: string[] = [];
	const engine = {
		prepareCoreFacetVerification() {
			order.push('prepare-receipt');
			throw facetError('RECEIPT', 'Invalid facet receipt');
		},
	} as unknown as CoreFacetsRustEngine;
	const api = bindCoreFacetsRust(engine);
	const current = observedObject(document(), currentTrace, 'current');

	let thrown: unknown;
	try {
		api.verifyCoreFacetDeclaration({} as never, current);
	} catch (error) {
		thrown = error;
	}

	expect(order).toEqual(['prepare-receipt']);
	expect(currentTrace).toEqual([]);
	expect(thrown).toBeInstanceOf(UmfError);
	expect(thrown).toMatchObject({
		code: 'CORE_FACET_RECEIPT',
		message: 'Invalid facet receipt',
		path: '/facets',
	});
});

test('Core Facets inspection copies source before identity and preserves copied extension content', () => {
	const order: string[] = [];
	const engine = {
		inspectCoreFacets(source: Document, identity: unknown) {
			order.push('inspect');
			return {source, identity};
		},
	} as unknown as CoreFacetsRustEngine;
	const api = bindCoreFacetsRust(engine);
	const trace: string[] = [];
	const sourceWithUnknown = document();
	sourceWithUnknown.extensions = {future: {opaque: 'preserve-me'}};
	const result = api.inspectCoreFacets(
		observedObject(sourceWithUnknown, trace, 'source'),
		observedObject({module: 'm', element: 'v'}, trace, 'identity'),
	);

	expect(order).toEqual(['inspect']);
	expect(trace.some(event => event.startsWith('source:'))).toBe(true);
	expect(trace.some(event => event.startsWith('identity:'))).toBe(true);
	expect(trace).toContain('source:descriptor:extensions');
	expect(trace.findIndex(event => event.startsWith('identity:'))).toBeGreaterThan(
		trace.reduce((last, event, index) => event.startsWith('source:') ? index : last, -1),
	);
	expect(result.source).not.toBe(sourceWithUnknown);
	expect(result.source.extensions).toEqual({future: {opaque: 'preserve-me'}});
});

test('Core Facets historical projection copies input before invoking Rust', () => {
	const order: string[] = [];
	const engine = {
		historicalCoreFacetPatch(input: unknown) {
			order.push('historical');
			return input;
		},
	} as unknown as CoreFacetsRustEngine;
	const api = bindCoreFacetsRust(engine);
	const input = {length: {max: 8, unit: 'byte' as const}, integerWidth: {bits: 16, signed: true}};
	const output = api.historicalCoreFacetPatch(input);

	expect(order).toEqual(['historical']);
	expect(output).toEqual(input);
	expect(output).not.toBe(input);
	expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
	expect(Object.getPrototypeOf(output.length)).toBe(Object.prototype);
	expect(Object.getPrototypeOf(output.integerWidth)).toBeNull();
});

test('Core Facets preserves the public ordinary-limit error and distinct engine resource failures', () => {
	const ordinary = Object.assign(new Error('JSON structural limit exceeded'), {
		name: 'UmfCoreError', code: 'LIMIT', path: '/target/extensions/future/items/49965',
	});
	const resource = Object.assign(new Error('Work budget exhausted'), {
		name: 'UmfCoreError', code: 'RESOURCE_LIMIT', path: '',
	});
	for (const failure of [ordinary, resource]) {
		const api = bindCoreFacetsRust({inspectCoreFacets() { throw failure; }} as unknown as CoreFacetsRustEngine);
		let thrown: unknown;
		try { api.inspectCoreFacets(document(), {module: 'm', element: 'v'}); }
		catch (error) { thrown = error; }
		if (failure === ordinary) {
			expect(thrown).toBeInstanceOf(UmfError);
			expect(thrown).toMatchObject({code: 'LIMIT', message: ordinary.message, path: ordinary.path});
		} else expect(thrown).toBe(resource);
	}
});
