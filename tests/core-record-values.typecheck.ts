// SPDX-License-Identifier: MIT OR Apache-2.0
import {type CoreRecordValueCheck,validateCoreRecordValues} from '../src/model/record-values';

type Equal<Left,Right> = (<T>()=>T extends Left?1:2) extends (<T>()=>T extends Right?1:2) ? true : false;
type Expect<Condition extends true> = Condition;

type PublicResultVersionIsCurrentOnly = Expect<Equal<
 ReturnType<typeof validateCoreRecordValues>['version'],
 '2.0.0'
>>;

// @ts-expect-error The historical operation version is not returned by the current public route.
const historicalVersion: CoreRecordValueCheck['version']='1.0.0';
void historicalVersion;

export type {PublicResultVersionIsCurrentOnly};
