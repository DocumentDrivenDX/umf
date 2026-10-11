import * as graphql from '../../../node_modules/@typespec/graphql/dist/src/tsp-index.js';
import * as json_schema from '../../../node_modules/@typespec/json-schema/dist/src/tsp-index.js';
import * as protobuf from '../../../node_modules/@typespec/protobuf/dist/src/tsp-index.js';
import * as openapi3 from '../../../node_modules/@typespec/openapi3/dist/src/tsp-index.js';
import * as sse from '../../../node_modules/@typespec/sse/dist/src/tsp-index.js';
import * as events from '../../../node_modules/@typespec/events/dist/src/tsp-index.js';
import * as versioningDecorators from '../../../node_modules/@typespec/versioning/dist/src/decorators.js';
import * as versioningValidate from '../../../node_modules/@typespec/versioning/dist/src/validate.js';
import * as http from '../../../node_modules/@typespec/http/dist/src/tsp-index.js';
import * as rest from '../../../node_modules/@typespec/rest/dist/src/tsp-index.js';
import * as restInternal from '../../../node_modules/@typespec/rest/dist/src/internal-decorators.js';
import * as openapi from '../../../node_modules/@typespec/openapi/dist/src/tsp-index.js';
import * as streams from '../../../node_modules/@typespec/streams/dist/src/tsp-index.js';
import bundles from '../../../spec/extensions/typespec/libraries.json';
export const typeSpecLibraries=bundles as Record<string,{version:string;files:Record<string,string>}>;
export const typeSpecLibraryModules:Record<string,Record<string,any>>={
 '@typespec/graphql/dist/src/tsp-index.js':graphql,
 '@typespec/json-schema/dist/src/tsp-index.js':json_schema,
 '@typespec/protobuf/dist/src/tsp-index.js':protobuf,
 '@typespec/openapi3/dist/src/tsp-index.js':openapi3,
 '@typespec/sse/dist/src/tsp-index.js':sse,
 '@typespec/events/dist/src/tsp-index.js':events,
 '@typespec/versioning/dist/src/decorators.js':versioningDecorators,
 '@typespec/versioning/dist/src/validate.js':versioningValidate,

 '@typespec/http/dist/src/tsp-index.js':http,
 '@typespec/rest/dist/src/tsp-index.js':rest,
 '@typespec/rest/dist/src/internal-decorators.js':restInternal,
 '@typespec/openapi/dist/src/tsp-index.js':openapi,
 '@typespec/streams/dist/src/tsp-index.js':streams,
};
