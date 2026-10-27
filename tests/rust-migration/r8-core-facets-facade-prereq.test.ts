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
