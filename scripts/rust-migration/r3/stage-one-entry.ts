// SPDX-License-Identifier: MIT OR Apache-2.0
/** Bundler root used to enumerate the stage-one compiler's exact TS source closure. */
import {generateAccessPackage} from '../../../src/compilation/index';
import {request,profile} from '../../../tests/compilation/access-fixtures';
void generateAccessPackage(request(),profile());
