// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ExtensionPackage} from '../../model/types';
import manifest from '../../../spec/extensions/generalized-rdf/package.json';
export const GENERALIZED_RDF_EXTENSION='umf.generalized-rdf';
export const generalizedRdfPackage=manifest as unknown as ExtensionPackage;
