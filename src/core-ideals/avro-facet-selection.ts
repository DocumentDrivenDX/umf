import {copyJson} from '../model/json';
import {nativePointer,treeChild,type NativeJson} from '../model/native-json';
import {inspectAvroFacetType,type AvroFacetTypeInspection} from '../adapters/avro/facet-type';
import {inspectAvroFacetTypeShape,type AvroTypeLocation,type AvroShapeBranch} from './avro-cardinality-type';

export interface AvroFacetRoot {root:NativeJson;dependencyId?:string;}
export interface AvroFacetSelectedBranch {
 branch:AvroShapeBranch;
 /** A named reference retains both its use site and complete definition. */
 declaration:{location:AvroTypeLocation;native:NativeJson};
 inspection:AvroFacetTypeInspection;
}
export interface AvroFacetSelection {
 location:AvroTypeLocation;native:NativeJson;
 shape:'one'|'array'|'map'|'unspecified';allowsNull:boolean;
 branches:AvroFacetSelectedBranch[];
 basis:'structural-selection-not-enforcement';
}
/** Resolve native type syntax only. Never select defaults/custom metadata or
 * merge union branch domains, infer authored facets, or flatten containers. */
export function inspectAvroFacetSelection(input:AvroFacetRoot[],selected:AvroTypeLocation):AvroFacetSelection {
 const roots=copyJson(input) as unknown as AvroFacetRoot[],location=copyJson(selected) as unknown as AvroTypeLocation;
 const shape=inspectAvroFacetTypeShape(roots,location);
 function at(loc:AvroTypeLocation):NativeJson {
  const root=roots.find(r=>r.dependencyId===loc.dependencyId);
  if(!root)throw Error('Missing native dependency');
  let node=root.root;for(const part of nativePointer(loc.path))node=treeChild(node,part);return node;
 }
 const branches=shape.branches.map(branch=>{
  const resolved=branch.definition??branch.location,native=at(resolved);
  return {branch,declaration:{location:resolved,native},inspection:inspectAvroFacetType(native)};
 });
 return copyJson({location,native:at(location),shape:shape.shape,allowsNull:shape.allowsNull,branches,basis:'structural-selection-not-enforcement'}) as unknown as AvroFacetSelection;
}
