// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/dashboard/package.json';
import type {ExtensionPackage} from '../../model/types';

export const DASHBOARD_EXTENSION='umf.dashboard';
export const dashboardPackage=manifest as unknown as ExtensionPackage;
