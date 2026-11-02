// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKindDeclaration} from '../model/field-kind';
import type {CoreRecordTypeDeclaration} from '../model/record-type';
import type {Document} from '../model/types';
import {copyJson} from '../model/json';
import {UmfError} from '../model/errors';

export interface CoreRecordTypeRustEngine {
  declareCoreRecordType(fieldAuthor: unknown, recordAuthor: unknown): unknown;
  prepareCoreRecordTypeVerification(receipt: unknown): object;
  finishCoreRecordTypeVerification(handle: object, current: unknown): unknown;
  discardCoreRecordTypeVerification(handle: object): void;
}

type NativeCoreErrorGuard = (error: unknown) => boolean;

function rustCall<T>(operation: () => T, isNativeUmfCoreError: NativeCoreErrorGuard): T {
  try {
    return operation();
  } catch (error) {
    if (!isNativeUmfCoreError(error)) throw error;
    const value = error as {name?: unknown; code?: unknown; message?: unknown; path?: unknown};
    if (value?.name === 'UmfCoreError' && typeof value.code === 'string' && value.code.startsWith('CORE_RECORD_TYPE_')) {
      throw new UmfError(value.code, String(value.message ?? ''), typeof value.path === 'string' ? value.path : '');
    }
    throw error;
  }
}

/** Select the retained Rust Record Type v6 operations while preserving predecessor admission order. */
export function bindCoreRecordTypeRust(
  engine: CoreRecordTypeRustEngine,
  isNativeUmfCoreError: NativeCoreErrorGuard = () => false,
) {
  return Object.freeze({
    declareCoreRecordType(fieldInput: CoreKindDeclaration, recordInput: CoreKindDeclaration): CoreRecordTypeDeclaration {
      const fieldAuthor = copyJson(fieldInput) as unknown as CoreKindDeclaration;
      const recordAuthor = copyJson(recordInput) as unknown as CoreKindDeclaration;
      return rustCall(
        () => engine.declareCoreRecordType(fieldAuthor, recordAuthor),
        isNativeUmfCoreError,
      ) as CoreRecordTypeDeclaration;
    },
    verifyCoreRecordTypeDeclaration(input: CoreRecordTypeDeclaration, current: Document): CoreRecordTypeDeclaration {
      const receipt = copyJson(input) as unknown as CoreRecordTypeDeclaration;
      const handle = rustCall(() => engine.prepareCoreRecordTypeVerification(receipt), isNativeUmfCoreError);
      try {
        const copiedCurrent = copyJson(current) as unknown as Document;
        return rustCall(
          () => engine.finishCoreRecordTypeVerification(handle, copiedCurrent),
          isNativeUmfCoreError,
        ) as CoreRecordTypeDeclaration;
      } catch (error) {
        try {
          engine.discardCoreRecordTypeVerification(handle);
        } catch {
          // Preserve the original host-admission or finish failure.
        }
        throw error;
      }
    },
  });
}
