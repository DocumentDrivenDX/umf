// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '../../model/types';
import type {LakeviewIds,LakeviewProjection} from './projection-types';

export interface LakeviewLegacyProjectionNativeFamily {
  ['lakeview-legacy-projection']:{
    projectLakeviewToLegacyDashboard(fields:{view:unknown;ids:LakeviewIds;title:string}):unknown;
  };
}

/** Synchronous compatibility facade over the Rust-owned Lakeview projector. */
export function createLakeviewLegacyProjectionRustDefault(engine:LakeviewLegacyProjectionNativeFamily) {
  return Object.freeze({
    projectLakeviewToLegacyDashboard(view:unknown,ids:LakeviewIds,options:{title:string}):LakeviewProjection {
      const result=engine['lakeview-legacy-projection'].projectLakeviewToLegacyDashboard({view,ids,title:options.title}) as {
        root:Json;modules:[string,Json][];elements:[string,Json][];issues:LakeviewProjection['issues'];
      };
      return {root:result.root,modules:new Map(result.modules),elements:new Map(result.elements),issues:result.issues};
    },
  });
}
