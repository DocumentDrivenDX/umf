let wasm;

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_2.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let WASM_VECTOR_LEN = 0;

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_export_2.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}
/**
 * Opt-in CONTRACT-052 generated schema. The caller parses the string to receive a fresh JS value.
 * @param {string} version
 * @returns {string}
 */
export function domainPackSchemaJson(version) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(version, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.domainPackSchemaJson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Default-route schema graph with Rust-owned intra-result alias metadata.
 * @returns {string}
 */
export function domainPackSchemaGraphJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.domainPackSchemaGraphJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function datasetSourceSchemaGraphJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.datasetSourceSchemaGraphJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function artifactCollectionSchemaGraphJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.artifactCollectionSchemaGraphJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function domainPackLoaderSchemaGraphJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.domainPackLoaderSchemaGraphJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function loaderInventorySchemaGraphJson() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.loaderInventorySchemaGraphJson();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Pure CONTRACT-057 loader inspection; accepts the JSON copied by the JS host wrapper.
 * @param {string} input_json
 * @returns {string}
 */
export function inspectDomainPackLoaderWire(input_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.inspectDomainPackLoaderWire(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Pure CONTRACT-052/053 pack-profile inspection after host JSON admission.
 * @param {string} input_json
 * @returns {string}
 */
export function inspectDomainPackProfileWire(input_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(input_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.inspectDomainPackProfileWire(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {string}
 */
export function accessRrfProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.accessRrfProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
export function accessTemporalProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.accessTemporalProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeAccessTemporalWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAccessTemporalWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function graphqlProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.graphqlProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
export function nativeFamilyDispatcherProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.nativeFamilyDispatcherProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} family
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeNativeFamilyWire(family, wire_json, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(family, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeNativeFamilyWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeGraphqlWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeGraphqlWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Run the native GraphQL editor with a synchronous tagged-wire host callback.
 * @param {string} wire_json
 * @param {Function} editor
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeGraphqlEditWire(wire_json, editor, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeGraphqlEditWire(ptr0, len0, editor, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAccessRrfWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAccessRrfWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {any} token
 * @returns {string}
 */
export function temporalParseGregorianDateWire(token) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.temporalParseGregorianDateWire(token);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {any} token
 * @param {any} unit
 * @returns {string}
 */
export function temporalTruncateGregorianDateWire(token, unit) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.temporalTruncateGregorianDateWire(token, unit);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {any} token
 * @returns {string}
 */
export function temporalParseRfc3339ExactInstantWire(token) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.temporalParseRfc3339ExactInstantWire(token);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {any} left
 * @param {any} right
 * @returns {string}
 */
export function temporalSameRfc3339ExactInstantWire(left, right) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.temporalSameRfc3339ExactInstantWire(left, right);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function copyJsonWire(wire_json) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.copyJsonWire(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeSemanticValueWire(wire_json, dispatcher, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSemanticValueWire(ptr0, len0, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeBit128Wire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeBit128Wire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function jsonNumberProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.jsonNumberProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeJsonNumberWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeJsonNumberWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} profile
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeCodegenHostReadV3Wire(wire_json, profile, dispatcher, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeCodegenHostReadV3Wire(ptr0, len0, ptr1, len1, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Narrow V3 bridge probe: call the JS-owned closed dispatcher synchronously
 * and return its already-serialized wire response without touching the
 * original host exception value.
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCodegenHostReadV3Probe(dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.executeCodegenHostReadV3Probe(dispatcher);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} format
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function readValueWire(wire_json, format, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.readValueWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} format
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function readTypescriptJsonValueWire(wire_json, format, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.readTypescriptJsonValueWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} format
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function writeTypescriptJsonValueWire(wire_json, format, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.writeTypescriptJsonValueWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} format
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function writeValueWire(wire_json, format, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.writeValueWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {string}
 */
export function engineVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.engineVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {string} profile
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeRequestWire(wire_json, profile, dispatcher, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeRequestWire(ptr0, len0, ptr1, len1, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Opt-in closed current-core Bit128 Field authoring route. This deliberately
 * accepts one wire operation and does not widen the default request router.
 * @param {string} wire_json
 * @param {string} profile
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeCoreBit128FieldRequestWire(wire_json, profile, dispatcher, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeCoreBit128FieldRequestWire(ptr0, len0, ptr1, len1, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeIcebergWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeIcebergWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeIcebergTableWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeIcebergTableWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function icebergTableProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.icebergTableProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
export function icebergSchemaProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.icebergSchemaProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeDeltaSchemaTableWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeDeltaSchemaTableWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function deltaSchemaTableProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.deltaSchemaTableProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeDeltaLogWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeDeltaLogWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function deltaLogProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.deltaLogProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeArrowSchemaWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeArrowSchemaWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function arrowSchemaProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.arrowSchemaProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeArrowIpcWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeArrowIpcWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function arrowIpcProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.arrowIpcProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeParquetCaptureWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeParquetCaptureWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function parquetCaptureProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.parquetCaptureProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeProtobufInspectWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeProtobufInspectWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeArtifactReferencesWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeArtifactReferencesWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function protobufInspectProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.protobufInspectProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeJsonSchemaWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeJsonSchemaWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function jsonSchemaProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.jsonSchemaProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeDocumentComparisonWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeDocumentComparisonWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function documentComparisonProfile() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.documentComparisonProfile();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAvroFieldsWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAvroFieldsWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeRecordTypeWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeRecordTypeWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function recordTypeBindingProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.recordTypeBindingProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAvroCardinalityWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAvroCardinalityWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function avroCardinalityBindingProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.avroCardinalityBindingProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeDbtWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeDbtWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function dbtProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.dbtProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeRdfWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeRdfWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function rdfProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.rdfProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
export function avroFieldsProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.avroFieldsProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeJavascriptNumericWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeJavascriptNumericWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeSecurityLogicWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityLogicWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeSecurityFunctionsWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityFunctionsWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeSecurityProtectionSourceWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityProtectionSourceWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function execute_security_policy_source_wire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.execute_security_policy_source_wire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeSecurityDomainsWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityDomainsWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeSecurityQueryPropertiesWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityQueryPropertiesWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @returns {string}
 */
export function executeSecurityProtectionParametersWire(wire_json) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeSecurityProtectionParametersWire(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} value
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function securityNotScalar(value, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.securityNotScalar(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}
/**
 * @param {string} resources_wire
 * @param {string} operation
 * @param {number} first
 * @param {number} second
 * @param {number} third
 * @param {number} fourth
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeCoreKindNullabilityHostJson(resources_wire, operation, first, second, third, fourth, dispatcher, control_dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeCoreKindNullabilityHostJson(ptr0, len0, ptr1, len1, first, second, third, fourth, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Opt-in general JSON admission over opaque host handles. Reflection order,
 * cycles, limits and the copied value are owned by the shared Rust core.
 * @param {number} value_handle
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeCopyJsonHostJson(value_handle, dispatcher, control_dispatcher) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.executeCopyJsonHostJson(value_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} resources_wire
 * @param {number} source
 * @param {number} identity
 * @param {number} values
 * @param {Function} dispatcher
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeValidateCoreRecordValuesHostJson(resources_wire, source, identity, values, dispatcher, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeValidateCoreRecordValuesHostJson(ptr0, len0, source, identity, values, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @param {string} resources_wire
 * @param {string} operation
 * @param {number} source_handle
 * @param {number} identity_handle
 * @param {number} third_handle
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCoreSchemaPropertiesHostJson(resources_wire, operation, source_handle, identity_handle, third_handle, dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeCoreSchemaPropertiesHostJson(ptr0, len0, ptr1, len1, source_handle, identity_handle, third_handle, dispatcher);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Private opt-in Core Cardinality route with one Rust-owned operation Context.
 * @param {string} resources_wire
 * @param {string} operation
 * @param {number} source_handle
 * @param {number} identity_handle
 * @param {number} third_handle
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCoreCardinalityHostJson(resources_wire, operation, source_handle, identity_handle, third_handle, dispatcher) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.executeCoreCardinalityHostJson(ptr0, len0, ptr1, len1, source_handle, identity_handle, third_handle, dispatcher);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Private opt-in host route for R8 Selection. Kept outside the package roots.
 * @param {string} resources_wire
 * @param {boolean} has_registry
 * @param {number} source_handle
 * @param {number} query_handle
 * @param {number} registry_handle
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCoreElementSelectionHostJson(resources_wire, has_registry, source_handle, query_handle, registry_handle, dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeCoreElementSelectionHostJson(ptr0, len0, has_registry, source_handle, query_handle, registry_handle, dispatcher);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Private R8 carrier probe: return a host-owned invocation result by identity.
 * @param {number} function_handle
 * @param {number} receiver_handle
 * @param {number} argument_handle
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCoreOpaqueReturnHostJson(function_handle, receiver_handle, argument_handle, dispatcher) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.executeCoreOpaqueReturnHostJson(function_handle, receiver_handle, argument_handle, dispatcher);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Private staged caller-owned Registry.kindRuntime validation delegation.
 * @param {boolean} has_registry
 * @param {number} source_handle
 * @param {number} registry_handle
 * @param {Function} dispatcher
 * @returns {string}
 */
export function executeCoreKindRuntimeValidationHostJson(has_registry, source_handle, registry_handle, dispatcher) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.executeCoreKindRuntimeValidationHostJson(has_registry, source_handle, registry_handle, dispatcher);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * @returns {string}
 */
export function jsonSchemaImportSessionProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.jsonSchemaImportSessionProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @returns {string}
 */
export function protobufSourceProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.protobufSourceProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAvroDocumentInspectWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAvroDocumentInspectWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function avroDocumentInspectProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.avroDocumentInspectProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Execute the bounded Avro schema inspector over Rust-owned wire input.
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAvroInspectWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAvroInspectWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function avroInspectProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.avroInspectProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Execute the bounded Avro candidate proposal over Rust-owned wire input.
 * @param {string} wire_json
 * @param {Function | null} [control_dispatcher]
 * @returns {string}
 */
export function executeAvroCandidateWire(wire_json, control_dispatcher) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.executeAvroCandidateWire(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {string}
 */
export function avroCandidateProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.avroCandidateProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} wire_json
 * @param {Uint8Array} input_binary
 * @param {Function | null} [control_dispatcher]
 * @returns {ProtobufDocumentResponse}
 */
export function executeProtobufDocumentWire(wire_json, input_binary, control_dispatcher) {
    const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(input_binary, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.executeProtobufDocumentWire(ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
    return ProtobufDocumentResponse.__wrap(ret);
}

/**
 * @returns {string}
 */
export function protobufDocumentProfileVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.protobufDocumentProfileVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {Uint16Array} input
 * @param {Uint16Array} source_id
 * @returns {string}
 */
export function projectSecSubmissionsUtf16Wire(input, source_id) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.projectSecSubmissionsUtf16Wire(input, source_id);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {Uint16Array} input
 * @param {Uint16Array} source_id
 * @returns {string}
 */
export function projectSecCompanyFactsUtf16Wire(input, source_id) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.projectSecCompanyFactsUtf16Wire(input, source_id);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

const ActionPlanSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_actionplansession_free(ptr >>> 0, 1));

export class ActionPlanSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ActionPlanSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_actionplansession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.actionplansession_new();
        this.__wbg_ptr = ret >>> 0;
        ActionPlanSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.actionplansession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeActionPlanSessionWire(wire_json, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.actionplansession_executeActionPlanSessionWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const ArrowSchemaResourcesRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_arrowschemaresourcesruntime_free(ptr >>> 0, 1));
/**
 * Opt-in owner for prepared Arrow schema grammar/resources. The JS wrapper
 * supplies setup and per-call controls independently.
 */
export class ArrowSchemaResourcesRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ArrowSchemaResourcesRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_arrowschemaresourcesruntime_free(ptr, 0);
    }
    /**
     * @param {string} setup_wire
     * @param {Function | null} [setup_dispatcher]
     */
    constructor(setup_wire, setup_dispatcher) {
        const ptr0 = passStringToWasm0(setup_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.arrowschemaresourcesruntime_new(ptr0, len0, isLikeNone(setup_dispatcher) ? 0 : addToExternrefTable0(setup_dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        ArrowSchemaResourcesRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    dispose() {
        wasm.arrowschemaresourcesruntime_dispose(this.__wbg_ptr);
    }
    /**
     * @param {string} request_wire
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeWire(request_wire, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(request_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.arrowschemaresourcesruntime_executeWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const CoreDatasetValuesRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_coredatasetvaluesruntime_free(ptr >>> 0, 1));
/**
 * Retained immutable engine and Dataset schemas for the host-admission facade.
 */
export class CoreDatasetValuesRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreDatasetValuesRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_coredatasetvaluesruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [control_dispatcher]
     */
    constructor(resources_wire, control_dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.coredatasetvaluesruntime_new(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreDatasetValuesRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} operation_name
     * @param {number} source_handle
     * @param {number} input_handle
     * @param {number} expected_handle
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    execute(operation_name, source_handle, input_handle, expected_handle, dispatcher, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(operation_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.coredatasetvaluesruntime_execute(this.__wbg_ptr, ptr0, len0, source_handle, input_handle, expected_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const CoreKeyTupleRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_corekeytupleruntime_free(ptr >>> 0, 1));

export class CoreKeyTupleRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreKeyTupleRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_corekeytupleruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeytupleruntime_new(ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreKeyTupleRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} source_wire
     * @param {string} identity_wire
     * @param {string} values_wire
     * @param {string | null} [profile]
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    encode(source_wire, identity_wire, values_wire, profile, dispatcher) {
        let deferred6_0;
        let deferred6_1;
        try {
            const ptr0 = passStringToWasm0(source_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(identity_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passStringToWasm0(values_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len2 = WASM_VECTOR_LEN;
            var ptr3 = isLikeNone(profile) ? 0 : passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len3 = WASM_VECTOR_LEN;
            const ret = wasm.corekeytupleruntime_encode(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr5 = ret[0];
            var len5 = ret[1];
            if (ret[3]) {
                ptr5 = 0; len5 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred6_0 = ptr5;
            deferred6_1 = len5;
            return getStringFromWasm0(ptr5, len5);
        } finally {
            wasm.__wbindgen_free(deferred6_0, deferred6_1, 1);
        }
    }
    /**
     * @param {string} source_wire
     * @param {string} identity_wire
     * @param {string} values_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyTupleEncodeHandle}
     */
    prepareEncoding(source_wire, identity_wire, values_wire, dispatcher) {
        const ptr0 = passStringToWasm0(source_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(identity_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(values_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.corekeytupleruntime_prepareEncoding(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyTupleEncodeHandle.__wrap(ret[0]);
    }
    /**
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyTupleVerificationHandle}
     */
    prepareVerification(receipt_wire, dispatcher) {
        const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeytupleruntime_prepareVerification(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyTupleVerificationHandle.__wrap(ret[0]);
    }
    /**
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyTupleByteReadHandle}
     */
    prepareByteRead(receipt_wire, dispatcher) {
        const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeytupleruntime_prepareByteRead(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyTupleByteReadHandle.__wrap(ret[0]);
    }
    /**
     * @param {string} source_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyTupleHandle}
     */
    prepare(source_wire, dispatcher) {
        const ptr0 = passStringToWasm0(source_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeytupleruntime_prepare(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyTupleHandle.__wrap(ret[0]);
    }
}

const CoreKeyVerificationRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_corekeyverificationruntime_free(ptr >>> 0, 1));

export class CoreKeyVerificationRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreKeyVerificationRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_corekeyverificationruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeyverificationruntime_new(ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreKeyVerificationRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyVerificationHandle}
     */
    prepareVerification(receipt_wire, dispatcher) {
        const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekeyverificationruntime_prepareVerification(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyVerificationHandle.__wrap(ret[0]);
    }
    /**
     * @param {PreparedCoreKeyVerificationHandle} handle
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    finishVerification(handle, current_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            _assertClass(handle, PreparedCoreKeyVerificationHandle);
            const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.corekeyverificationruntime_finishVerification(this.__wbg_ptr, handle.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {PreparedCoreKeyVerificationHandle} handle
     */
    discardVerification(handle) {
        _assertClass(handle, PreparedCoreKeyVerificationHandle);
        const ret = wasm.corekeyverificationruntime_discardVerification(this.__wbg_ptr, handle.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}

const CoreKindNullabilityRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_corekindnullabilityruntime_free(ptr >>> 0, 1));
/**
 * Retained immutable resources/engine for one Core kind/nullability factory.
 * Construction admits resources once; each method gets a fresh operation Context.
 */
export class CoreKindNullabilityRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreKindNullabilityRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_corekindnullabilityruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [control_dispatcher]
     */
    constructor(resources_wire, control_dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekindnullabilityruntime_new(ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreKindNullabilityRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Stage receipt-first Core Key verification on this runtime's retained Engine.
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreKeyVerificationHandle}
     */
    prepareVerification(receipt_wire, dispatcher) {
        const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corekindnullabilityruntime_prepareVerification(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreKeyVerificationHandle.__wrap(ret[0]);
    }
    /**
     * Finish the one-use stage; consume it before decoding current as before.
     * @param {PreparedCoreKeyVerificationHandle} handle
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    finishVerification(handle, current_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            _assertClass(handle, PreparedCoreKeyVerificationHandle);
            const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.corekindnullabilityruntime_finishVerification(this.__wbg_ptr, handle.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {PreparedCoreKeyVerificationHandle} handle
     */
    discardVerification(handle) {
        _assertClass(handle, PreparedCoreKeyVerificationHandle);
        const ret = wasm.corekindnullabilityruntime_discardVerification(this.__wbg_ptr, handle.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} wire_json
     * @param {string} profile
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeModelRequestWire(wire_json, profile, dispatcher, control_dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.corekindnullabilityruntime_executeModelRequestWire(this.__wbg_ptr, ptr0, len0, ptr1, len1, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {string} operation
     * @param {number} first
     * @param {number} second
     * @param {number} third
     * @param {number} fourth
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    execute(operation, first, second, third, fourth, dispatcher, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.corekindnullabilityruntime_execute(this.__wbg_ptr, ptr0, len0, first, second, third, fourth, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * Execute the Rust-owned extension edit with one cumulative operation
     * Context across prevalidation, callback and postvalidation.
     * @param {string} wire_json
     * @param {string} profile
     * @param {Function} editor
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeModelEditWire(wire_json, profile, editor, dispatcher, control_dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(profile, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.corekindnullabilityruntime_executeModelEditWire(this.__wbg_ptr, ptr0, len0, ptr1, len1, editor, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
}

const CoreRecordMembersInspectionRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_corerecordmembersinspectionruntime_free(ptr >>> 0, 1));

export class CoreRecordMembersInspectionRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreRecordMembersInspectionRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_corerecordmembersinspectionruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corerecordmembersinspectionruntime_new(ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreRecordMembersInspectionRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} source_wire
     * @param {string} identity_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    inspect(source_wire, identity_wire, dispatcher) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(source_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(identity_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.corerecordmembersinspectionruntime_inspect(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
}

const CoreRecordTypeVerificationRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_corerecordtypeverificationruntime_free(ptr >>> 0, 1));

export class CoreRecordTypeVerificationRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CoreRecordTypeVerificationRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_corerecordtypeverificationruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corerecordtypeverificationruntime_new(ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        CoreRecordTypeVerificationRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedCoreRecordTypeVerificationHandle}
     */
    prepareVerification(receipt_wire, dispatcher) {
        const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.corerecordtypeverificationruntime_prepareVerification(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedCoreRecordTypeVerificationHandle.__wrap(ret[0]);
    }
    /**
     * @param {PreparedCoreRecordTypeVerificationHandle} handle
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    finishVerification(handle, current_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            _assertClass(handle, PreparedCoreRecordTypeVerificationHandle);
            const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.corerecordtypeverificationruntime_finishVerification(this.__wbg_ptr, handle.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
}

const JavascriptNumericRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_javascriptnumericruntime_free(ptr >>> 0, 1));

export class JavascriptNumericRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JavascriptNumericRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_javascriptnumericruntime_free(ptr, 0);
    }
    /**
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.javascriptnumericruntime_new(ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        JavascriptNumericRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} operation
     * @param {string} args_wire
     * @param {Function | null} [dispatcher]
     * @returns {PreparedJavascriptNumericStage}
     */
    prepare(operation, args_wire, dispatcher) {
        const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(args_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.javascriptnumericruntime_prepare(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return PreparedJavascriptNumericStage.__wrap(ret[0]);
    }
}

const JsonSchemaImportSessionHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_jsonschemaimportsessionhandle_free(ptr >>> 0, 1));
/**
 * Private per-call owner for staged JSON Schema import.
 */
export class JsonSchemaImportSessionHandle {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        JsonSchemaImportSessionHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_jsonschemaimportsessionhandle_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.jsonschemaimportsessionhandle_new();
        this.__wbg_ptr = ret >>> 0;
        JsonSchemaImportSessionHandleFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} wire_json
     * @returns {string}
     */
    executeStage(wire_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.jsonschemaimportsessionhandle_executeStage(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const PostgresqlParserSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_postgresqlparsersession_free(ptr >>> 0, 1));

export class PostgresqlParserSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PostgresqlParserSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_postgresqlparsersession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.postgresqlparsersession_new();
        this.__wbg_ptr = ret >>> 0;
        PostgresqlParserSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.postgresqlparsersession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executePostgresqlParserSessionWire(wire_json, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.postgresqlparsersession_executePostgresqlParserSessionWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const PreparedCoreKeyTupleByteReadHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorekeytuplebytereadhandle_free(ptr >>> 0, 1));

export class PreparedCoreKeyTupleByteReadHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreKeyTupleByteReadHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreKeyTupleByteReadHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreKeyTupleByteReadHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorekeytuplebytereadhandle_free(ptr, 0);
    }
    /**
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {Uint8Array}
     */
    readBytes(current_wire, dispatcher) {
        const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.preparedcorekeytuplebytereadhandle_readBytes(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}

const PreparedCoreKeyTupleEncodeHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorekeytupleencodehandle_free(ptr >>> 0, 1));

export class PreparedCoreKeyTupleEncodeHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreKeyTupleEncodeHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreKeyTupleEncodeHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreKeyTupleEncodeHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorekeytupleencodehandle_free(ptr, 0);
    }
    /**
     * @param {string | null} [options_wire]
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    encodeWithOptions(options_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            var ptr0 = isLikeNone(options_wire) ? 0 : passStringToWasm0(options_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len0 = WASM_VECTOR_LEN;
            const ret = wasm.preparedcorekeytupleencodehandle_encodeWithOptions(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
}

const PreparedCoreKeyTupleHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorekeytuplehandle_free(ptr >>> 0, 1));

export class PreparedCoreKeyTupleHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreKeyTupleHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreKeyTupleHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreKeyTupleHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorekeytuplehandle_free(ptr, 0);
    }
    /**
     * @param {string} source_wire
     * @param {string} resources_wire
     * @param {Function | null} [dispatcher]
     */
    constructor(source_wire, resources_wire, dispatcher) {
        const ptr0 = passStringToWasm0(source_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(resources_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.preparedcorekeytuplehandle_new(ptr0, len0, ptr1, len1, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        PreparedCoreKeyTupleHandleFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} identity_wire
     * @param {string} values_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    encode(identity_wire, values_wire, dispatcher) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(identity_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(values_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.preparedcorekeytuplehandle_encode(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * @param {string} receipt_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    verify(receipt_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(receipt_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.preparedcorekeytuplehandle_verify(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    sourceWire(dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.preparedcorekeytuplehandle_sourceWire(this.__wbg_ptr, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const PreparedCoreKeyTupleVerificationHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorekeytupleverificationhandle_free(ptr >>> 0, 1));

export class PreparedCoreKeyTupleVerificationHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreKeyTupleVerificationHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreKeyTupleVerificationHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreKeyTupleVerificationHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorekeytupleverificationhandle_free(ptr, 0);
    }
    /**
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    verifyCurrent(current_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.preparedcorekeytupleverificationhandle_verifyCurrent(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * @param {string} current_wire
     * @param {Function | null} [dispatcher]
     * @returns {Uint8Array}
     */
    readBytes(current_wire, dispatcher) {
        const ptr0 = passStringToWasm0(current_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.preparedcorekeytupleverificationhandle_readBytes(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}

const PreparedCoreKeyVerificationHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorekeyverificationhandle_free(ptr >>> 0, 1));

export class PreparedCoreKeyVerificationHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreKeyVerificationHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreKeyVerificationHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreKeyVerificationHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorekeyverificationhandle_free(ptr, 0);
    }
}

const PreparedCoreRecordTypeVerificationHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedcorerecordtypeverificationhandle_free(ptr >>> 0, 1));

export class PreparedCoreRecordTypeVerificationHandle {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedCoreRecordTypeVerificationHandle.prototype);
        obj.__wbg_ptr = ptr;
        PreparedCoreRecordTypeVerificationHandleFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedCoreRecordTypeVerificationHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedcorerecordtypeverificationhandle_free(ptr, 0);
    }
}

const PreparedJavascriptNumericStageFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedjavascriptnumericstage_free(ptr >>> 0, 1));

export class PreparedJavascriptNumericStage {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(PreparedJavascriptNumericStage.prototype);
        obj.__wbg_ptr = ptr;
        PreparedJavascriptNumericStageFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedJavascriptNumericStageFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedjavascriptnumericstage_free(ptr, 0);
    }
    /**
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    take_output(dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.preparedjavascriptnumericstage_take_output(this.__wbg_ptr, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} context_wire
     * @param {Function | null} [dispatcher]
     * @returns {string}
     */
    validate_context(context_wire, dispatcher) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(context_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.preparedjavascriptnumericstage_validate_context(this.__wbg_ptr, ptr0, len0, isLikeNone(dispatcher) ? 0 : addToExternrefTable0(dispatcher));
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
}

const PreparedJsonSchemaRuntimeHandleFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_preparedjsonschemaruntimehandle_free(ptr >>> 0, 1));

export class PreparedJsonSchemaRuntimeHandle {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PreparedJsonSchemaRuntimeHandleFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_preparedjsonschemaruntimehandle_free(ptr, 0);
    }
    /**
     * @param {Function | null} [resource_control]
     */
    constructor(resource_control) {
        const ret = wasm.preparedjsonschemaruntimehandle_new(isLikeNone(resource_control) ? 0 : addToExternrefTable0(resource_control));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        PreparedJsonSchemaRuntimeHandleFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} wire_json
     * @param {Function | null} [operation_control]
     * @returns {string}
     */
    execute(wire_json, operation_control) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.preparedjsonschemaruntimehandle_execute(this.__wbg_ptr, ptr0, len0, isLikeNone(operation_control) ? 0 : addToExternrefTable0(operation_control));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const ProtobufDocumentResponseFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_protobufdocumentresponse_free(ptr >>> 0, 1));

export class ProtobufDocumentResponse {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ProtobufDocumentResponse.prototype);
        obj.__wbg_ptr = ptr;
        ProtobufDocumentResponseFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProtobufDocumentResponseFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_protobufdocumentresponse_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get wireEnvelope() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.protobufdocumentresponse_wireEnvelope(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get binary() {
        const ret = wasm.protobufdocumentresponse_binary(this.__wbg_ptr);
        return ret;
    }
}

const ProtobufSourceResponseFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_protobufsourceresponse_free(ptr >>> 0, 1));

export class ProtobufSourceResponse {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ProtobufSourceResponse.prototype);
        obj.__wbg_ptr = ptr;
        ProtobufSourceResponseFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProtobufSourceResponseFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_protobufsourceresponse_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get wireEnvelope() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.protobufsourceresponse_wireEnvelope(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get binary() {
        const ret = wasm.protobufsourceresponse_binary(this.__wbg_ptr);
        return ret;
    }
}

const ProtobufSourceSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_protobufsourcesession_free(ptr >>> 0, 1));

export class ProtobufSourceSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProtobufSourceSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_protobufsourcesession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.protobufsourcesession_new();
        this.__wbg_ptr = ret >>> 0;
        ProtobufSourceSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} request_handle
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    prepareImportHost(request_handle, dispatcher, control_dispatcher) {
        const ret = wasm.protobufsourcesession_prepareImportHost(this.__wbg_ptr, request_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} compiler
     * @param {Uint8Array} descriptor_set
     * @param {string} id
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    finishImportWithId(compiler, descriptor_set, id, control_dispatcher) {
        const ptr0 = passStringToWasm0(compiler, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(descriptor_set, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_finishImportWithId(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {Uint8Array} descriptor_set
     * @param {string} id
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    beginImportDescriptor(descriptor_set, id, control_dispatcher) {
        const ptr0 = passArray8ToWasm0(descriptor_set, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_beginImportDescriptor(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {any} compiler
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    finishImportArchive(compiler, control_dispatcher) {
        const ret = wasm.protobufsourcesession_finishImportArchive(this.__wbg_ptr, compiler, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} request_wire
     * @param {string} id
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    prepareImport(request_wire, id, control_dispatcher) {
        const ptr0 = passStringToWasm0(request_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_prepareImport(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} compiler
     * @param {Uint8Array} descriptor_set
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    finishImport(compiler, descriptor_set, control_dispatcher) {
        const ptr0 = passStringToWasm0(compiler, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(descriptor_set, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_finishImport(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} document_wire
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    prepareExport(document_wire, control_dispatcher) {
        const ptr0 = passStringToWasm0(document_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_prepareExport(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {number} document_handle
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    prepareExportHost(document_handle, dispatcher, control_dispatcher) {
        const ret = wasm.protobufsourcesession_prepareExportHost(this.__wbg_ptr, document_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} result_wire
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    admitEmitterResult(result_wire, control_dispatcher) {
        const ptr0 = passStringToWasm0(result_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_admitEmitterResult(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {number} result_handle
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    admitEmitterResultHost(result_handle, dispatcher, control_dispatcher) {
        const ret = wasm.protobufsourcesession_admitEmitterResultHost(this.__wbg_ptr, result_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {string} document_wire
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    finishExport(document_wire, control_dispatcher) {
        const ptr0 = passStringToWasm0(document_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protobufsourcesession_finishExport(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
    /**
     * @param {number} document_handle
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {ProtobufSourceResponse}
     */
    finishExportHost(document_handle, dispatcher, control_dispatcher) {
        const ret = wasm.protobufsourcesession_finishExportHost(this.__wbg_ptr, document_handle, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
        return ProtobufSourceResponse.__wrap(ret);
    }
}

const RetainedCodegenResourcesRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_retainedcodegenresourcesruntime_free(ptr >>> 0, 1));
/**
 * Exercise bounded schema recursion on actual wasm32 with the production
 * evaluator and ordinary resource profile. This exists only in the isolated
 * conformance build, not the shipped binding surface.
 * Opt-in owner for compiled codegen resources. The JS wrapper provides setup
 * and per-call controls independently; callbacks are never retained here.
 */
export class RetainedCodegenResourcesRuntime {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RetainedCodegenResourcesRuntimeFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_retainedcodegenresourcesruntime_free(ptr, 0);
    }
    /**
     * @param {string} setup_wire
     * @param {Function | null} [setup_dispatcher]
     */
    constructor(setup_wire, setup_dispatcher) {
        const ptr0 = passStringToWasm0(setup_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.retainedcodegenresourcesruntime_new(ptr0, len0, isLikeNone(setup_dispatcher) ? 0 : addToExternrefTable0(setup_dispatcher));
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        RetainedCodegenResourcesRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} request_wire
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeWire(request_wire, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(request_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.retainedcodegenresourcesruntime_executeWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {string} request_wire
     * @param {Function} dispatcher
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeHostReadV3Wire(request_wire, dispatcher, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(request_wire, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.retainedcodegenresourcesruntime_executeHostReadV3Wire(this.__wbg_ptr, ptr0, len0, dispatcher, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const SecurityAuthorityGuardSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_securityauthorityguardsession_free(ptr >>> 0, 1));

export class SecurityAuthorityGuardSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SecurityAuthorityGuardSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_securityauthorityguardsession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.securityauthorityguardsession_new();
        this.__wbg_ptr = ret >>> 0;
        SecurityAuthorityGuardSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.securityauthorityguardsession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @returns {string}
     */
    executeSecurityAuthorityGuardWire(wire_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.securityauthorityguardsession_executeSecurityAuthorityGuardWire(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const SecurityReadRegistrationSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_securityreadregistrationsession_free(ptr >>> 0, 1));

export class SecurityReadRegistrationSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SecurityReadRegistrationSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_securityreadregistrationsession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.securityreadregistrationsession_new();
        this.__wbg_ptr = ret >>> 0;
        SecurityReadRegistrationSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.securityreadregistrationsession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @returns {string}
     */
    executeSecurityReadRegistrationWire(wire_json) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.securityreadregistrationsession_executeSecurityReadRegistrationWire(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const SmithySessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_smithysession_free(ptr >>> 0, 1));

export class SmithySession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SmithySessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_smithysession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.smithysession_new();
        this.__wbg_ptr = ret >>> 0;
        SmithySessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.smithysession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeSmithySessionWire(wire_json, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.smithysession_executeSmithySessionWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

const TypeSpecSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_typespecsession_free(ptr >>> 0, 1));

export class TypeSpecSession {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TypeSpecSessionFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_typespecsession_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.typespecsession_new();
        this.__wbg_ptr = ret >>> 0;
        TypeSpecSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    profileVersion() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.typespecsession_profileVersion(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} wire_json
     * @param {Function | null} [control_dispatcher]
     * @returns {string}
     */
    executeTypeSpecSessionWire(wire_json, control_dispatcher) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(wire_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.typespecsession_executeTypeSpecSessionWire(this.__wbg_ptr, ptr0, len0, isLikeNone(control_dispatcher) ? 0 : addToExternrefTable0(control_dispatcher));
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = arg0.buffer;
        return ret;
    };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_833bed5770ea2041 = function() { return handleError(function (arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, arg2, arg3);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_charCodeAt_abe5953e37f4b5a6 = function(arg0, arg1) {
        const ret = arg0.charCodeAt(arg1 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_length_8cfd2c6409af88ad = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_length_d56737991078581b = function(arg0) {
        const ret = arg0.length;
        return ret;
    };
    imports.wbg.__wbg_new_9fee97a409b32b68 = function(arg0) {
        const ret = new Uint16Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_new_c68d7209be747379 = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_set_f4f1f0daa30696fc = function(arg0, arg1, arg2) {
        arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbindgen_boolean_get = function(arg0) {
        const v = arg0;
        const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_2;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return ret;
    };
    imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'number' ? obj : undefined;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    };
    imports.wbg.__wbindgen_number_new = function(arg0) {
        const ret = arg0;
        return ret;
    };
    imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
        const obj = arg1;
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('umf_core_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
