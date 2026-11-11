// SPDX-License-Identifier: MIT OR Apache-2.0
import {createCodegenEngine,isWireAdmissionError} from '../bindings/core/node/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createAccessCompilationRustDefault} from './access-compilation-rust-default';

const access=createAccessCompilationRustDefault(createCodegenEngine(CODEGEN_RESOURCES),isWireAdmissionError);
export const {inspectAccessViews,generateAccessPackage,diffAccessPackages}=access;
export type {AccessRequest,AccessProfile,AccessResult,AccessSymbolChange} from './access-compilation-rust-default';
