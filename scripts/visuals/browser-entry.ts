// SPDX-License-Identifier: MIT OR Apache-2.0
import {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';
(globalThis as unknown as {renderVisual:typeof renderLiniPresentation}).renderVisual=renderLiniPresentation;
