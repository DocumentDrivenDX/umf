import"./chunk-7z2b65k4.js";import{paramMessage,SyntaxKind,compilerAssert,createDiagnosticCollector,typespecTypeToJson,isVoidType,isNullType,isArrayModelType,useStateMap,useStateSet,getMinValue,getMaxValue,getDiscriminator,DuplicateTracker,navigateType,getProperty,isVisible,getLifecycleVisibilityEnum,getParameterVisibilityFilter,getDoc,getReturnsDoc,getErrorsDoc,isErrorModel,getMediaTypeHint,getEncode,getOverloads,getOverloadedOperation,$,parse2,filterModelProperties,walkPropertiesInherited,fileRef,createTypeSpecLibrary,definePackageFlags,defineLinter,defineTypeInfoProvider,createLinterRule,setTypeSpecNamespace}from"./chunk-57zc54qs.js";import"./chunk-g1npbg7q.js";import"./chunk-yc072vtb.js";import{createValidator}from"./chunk-q7d9xqsf.js";import{Registry,validateDocument}from"./chunk-60aq4gnb.js";import{__preload}from"./chunk-jwf18hx1.js";import{UmfError,pointer,LIMITS,copyJson}from"./chunk-rne4mzjk.js";var EmitterOptionsSchema={type:"object",additionalProperties:!1,properties:{"output-file":{type:"string",nullable:!0,description:["Name of the output file."," Output file will interpolate the following values:"," - schema-name: Name of the schema if multiple",""," Default: `{schema-name}.graphql`",""," Example Single schema"," - `schema.graphql`",""," Example Multiple schemas"," - `Org1.Schema1.graphql`"," - `Org1.Schema2.graphql`"].join(`
`)},"new-line":{type:"string",enum:["crlf","lf"],default:"lf",nullable:!0,description:"Set the newLine character for emitting files."},"omit-unreachable-types":{type:"boolean",nullable:!0,description:["Omit unreachable types.","By default all types declared under the schema namespace will be included.","With this flag on only types references in an operation will be emitted."].join(`
`)}},required:[]},libDef={name:"@typespec/graphql",diagnostics:{"graphql-operation-kind-duplicate":{severity:"error",messages:{default:paramMessage`GraphQL Operation Kind already applied to \`${"entityName"}\`.`}},"operation-field-conflict":{severity:"error",messages:{default:paramMessage`Operation \`${"operation"}\` conflicts with an existing ${"conflictType"} on model \`${"model"}\`.`}},"operation-field-duplicate":{severity:"warning",messages:{default:paramMessage`Operation \`${"operation"}\` is defined multiple times on \`${"model"}\`.`}},"invalid-interface":{severity:"error",messages:{default:paramMessage`All models used with \`@compose\` must be marked with \`@graphqlInterface\`, but ${"interface"} is not.`}},"circular-interface":{severity:"error",messages:{default:"An interface cannot implement itself."}},"missing-interface-property":{severity:"error",messages:{default:paramMessage`Model must contain property \`${"property"}\` from \`${"interface"}\` in order to implement it in GraphQL.`}},"incompatible-interface-property":{severity:"error",messages:{default:paramMessage`Property \`${"property"}\` is incompatible with \`${"interface"}\`.`}},"unrecognized-union":{severity:"error",messages:{default:"Unrecognized union construction. Union must be named, a return type, a model property, or an alias."}},"duplicate-union-variant":{severity:"warning",messages:{default:paramMessage`Union variant type "${"type"}" appears multiple times after flattening nested unions. Duplicate removed.`}},"empty-union":{severity:"error",messages:{default:"Union has no non-null variants. A GraphQL union must contain at least one member type."}},"graphql-builtin-scalar-collision":{severity:"warning",messages:{default:paramMessage`Scalar "${"name"}" collides with GraphQL built-in type "${"builtinName"}". This may cause unexpected behavior. Consider renaming the scalar.`}},"type-name-collision":{severity:"error",messages:{default:paramMessage`Type "${"name"}" collides with another type of the same name in the GraphQL schema. Consider renaming one of the types.`}},"operation-fields-ignored-on-input":{severity:"warning",messages:{default:paramMessage`@operationFields on \`${"model"}\` is ignored in input context — GraphQL input types cannot have operation fields.`}},"empty-schema":{severity:"warning",messages:{default:"GraphQL schema has no operations. At minimum a Query root type is required."}},"empty-enum":{severity:"error",messages:{default:paramMessage`Enum "${"name"}" must define at least one value. GraphQL enums cannot be empty.`}},"reserved-name":{severity:"error",messages:{default:paramMessage`Name "${"name"}" must not begin with "__" (two underscores), which is reserved by GraphQL for introspection.`}},"unsupported-type":{severity:"warning",messages:{default:paramMessage`Type "${"type"}" has no GraphQL equivalent. Using String as fallback.`}}},emitter:{options:EmitterOptionsSchema,capabilities:{dryRun:!0}},state:{operationKind:{description:"State for the graphql operation kind decorators (@query, @mutation, @subscription)"},operationFields:{description:"State for the @operationFields decorator."},compose:{description:"State for the @compose decorator."},interface:{description:"State for the @interface decorator."},interfaceOnly:{description:"State for @interface(#{interfaceOnly: true})."},schema:{description:"State for the @schema decorator."},specifiedBy:{description:"State for the @specifiedBy decorator."}}},$lib=createTypeSpecLibrary(libDef),{reportDiagnostic,createDiagnostic,stateKeys:GraphQLKeys}=$lib;var[getInterface,setInterface]=useStateSet(GraphQLKeys.interface),[getInterfaceOnly,setInterfaceOnly]=useStateSet(GraphQLKeys.interfaceOnly),[getComposition,setComposition,_getCompositionMap]=useStateMap(GraphQLKeys.compose);var[getOperationFieldsInternal,setOperationFields,_getOperationFieldsMap]=useStateMap(GraphQLKeys.operationFields);var[getOperationKind,setOperationKindInternal,_getOperationKindMap]=useStateMap(GraphQLKeys.operationKind);function validateOperationKindUniqueOnNode(context,operation){if(operation.decorators.filter((x)=>OPERATION_KIND_DECORATORS.includes(x.decorator)&&x.node?.kind===SyntaxKind.DecoratorExpression&&x.node?.parent===operation.node).length>1)return reportDiagnostic(context.program,{code:"graphql-operation-kind-duplicate",format:{entityName:operation.name},target:context.decoratorTarget}),!1;return!0}function setOperationKind(context,entity,operationKind){if(validateOperationKindUniqueOnNode(context,entity))setOperationKindInternal(context.program,entity,operationKind)}function createOperationKindDecorator(operationKind){return(context,entity)=>{setOperationKind(context,entity,operationKind)}}var $mutation=createOperationKindDecorator("Mutation"),$query=createOperationKindDecorator("Query"),$subscription=createOperationKindDecorator("Subscription"),OPERATION_KIND_DECORATORS=[$mutation,$query,$subscription];var[getSchema,setSchema,getSchemaMap]=useStateMap(GraphQLKeys.schema);var[getSpecifiedByUrl,setSpecifiedByUrl]=useStateMap(GraphQLKeys.specifiedBy);var EmitterOptionsSchema2={type:"object",additionalProperties:!1,properties:{"file-type":{type:"string",enum:["yaml","json"],nullable:!0,description:"Serialize the schema as either yaml or json."},"int64-strategy":{type:"string",enum:["string","number"],nullable:!0,description:`How to handle 64 bit integers on the wire. Options are:

* string: serialize as a string (widely interoperable)
* number: serialize as a number (not widely interoperable)`},bundleId:{type:"string",nullable:!0,description:"When provided, bundle all the schemas into a single json schema document with schemas under $defs. The provided id is the id of the root document and is also used for the file name."},emitAllModels:{type:"boolean",nullable:!0,description:"When true, emit all model declarations to JSON Schema without requiring the @jsonSchema decorator."},emitAllRefs:{type:"boolean",nullable:!0,description:"When true, emit all references as json schema files, even if the referenced type does not have the `@jsonSchema` decorator or is not within a namespace with the `@jsonSchema` decorator."},"seal-object-schemas":{type:"boolean",nullable:!0,default:!1,description:["If true, then for models emitted as object schemas we default `unevaluatedProperties` to `{ not: {} }`,","if not explicitly specified elsewhere.","Default: `false`"].join(`
`)},"polymorphic-models-strategy":{type:"string",enum:["ignore","oneOf","anyOf"],nullable:!0,default:"ignore",description:["Strategy for emitting models with the @discriminator decorator:","- ignore: Emit as regular object schema (default). Derived models use allOf to reference their base model.","- oneOf: Emit a oneOf schema with references to all derived models (closed union)","- anyOf: Emit an anyOf schema with references to all derived models (open union)","","When using oneOf or anyOf, derived models will inline all properties from their base model","instead of using allOf references. This avoids circular references in the generated schemas,","since the base model references derived models via oneOf/anyOf."].join(`
`)}},required:[]},$lib2=createTypeSpecLibrary({name:"@typespec/json-schema",diagnostics:{"invalid-default":{severity:"error",messages:{default:paramMessage`Invalid type '${"type"}' for a default value`}},"duplicate-id":{severity:"error",messages:{default:paramMessage`There are multiple types with the same id "${"id"}".`}},"unknown-scalar":{severity:"warning",messages:{default:paramMessage`Scalar '${"name"}' is not a known scalar type and doesn't extend a known scalar type.`}}},emitter:{options:EmitterOptionsSchema2},state:{JsonSchema:{description:"State indexing types marked with @jsonSchema"},"JsonSchema.baseURI":{description:"Contains data configured with @baseUri decorator"},"JsonSchema.multipleOf":{description:"Contains data configured with @multipleOf decorator"},"JsonSchema.id":{description:"Contains data configured with @id decorator"},"JsonSchema.oneOf":{description:"Contains data configured with @oneOf decorator"},"JsonSchema.contains":{description:"Contains data configured with @contains decorator"},"JsonSchema.minContains":{description:"Contains data configured with @minContains decorator"},"JsonSchema.maxContains":{description:"Contains data configured with @maxContains decorator"},"JsonSchema.uniqueItems":{description:"Contains data configured with @uniqueItems decorator"},"JsonSchema.minProperties":{description:"Contains data configured with @minProperties decorator"},"JsonSchema.maxProperties":{description:"Contains data configured with @maxProperties decorator"},"JsonSchema.contentEncoding":{description:"Contains data configured with @contentEncoding decorator"},"JsonSchema.contentSchema":{description:"Contains data configured with @contentSchema decorator"},"JsonSchema.contentMediaType":{description:"Contains data configured with @contentMediaType decorator"},"JsonSchema.prefixItems":{description:"Contains data configured with @prefixItems decorator"},"JsonSchema.extension":{description:"Contains data configured with @extension decorator"}}}),$flags=definePackageFlags({}),{reportDiagnostic:reportDiagnostic2,createStateSymbol,stateKeys:JsonSchemaStateKeys}=$lib2;function createDataDecorator(key,validate){let[getData,setData]=useStateMap(key);return[getData,setData,(...args)=>{if(validate&&!validate(...args))return;let[context,target,value]=args;setData(context.program,target,value)}]}var[getJsonSchema,markJsonSchema]=useStateSet(JsonSchemaStateKeys.JsonSchema);var[getBaseUri,setBaseUri,$baseUri]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.baseURI"]);var[getMultipleOfAsNumeric,setMultipleOf,$multipleOf]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.multipleOf"]);var[getId,setId,$id]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.id"]),[isOneOf,markOneOf]=useStateSet(JsonSchemaStateKeys["JsonSchema.oneOf"]);var[getContains,setContains,$contains]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.contains"]),[getMinContains,setMinContains,$minContains]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.minContains"]),[getMaxContains,setMaxContains,$maxContains]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.maxContains"]),[getUniqueItems,setUniqueItems]=useStateMap(JsonSchemaStateKeys["JsonSchema.uniqueItems"]);var[getMinProperties,setMinProperties,$minProperties]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.minProperties"]),[getMaxProperties,setMaxProperties,$maxProperties]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.maxProperties"]),[getContentEncoding,setContentEncoding,$contentEncoding]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.contentEncoding"]),[getContentMediaType,setContentMediaType,$contentMediaType]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.contentMediaType"]),[getContentSchema,setContentSchema,$contentSchema]=createDataDecorator(JsonSchemaStateKeys["JsonSchema.contentSchema"]),[getPrefixItems,setPrefixItems]=useStateMap(JsonSchemaStateKeys["JsonSchema.prefixItems"]);var[getExtensionsInternal,_,getExtensionsStateMap]=useStateMap(JsonSchemaStateKeys["JsonSchema.extension"]);var $validatesRawJson=(context,target,value)=>{let[_,diagnostics]=typespecTypeToJson(value,target);if(diagnostics.length>0)context.program.reportDiagnostics(diagnostics)};setTypeSpecNamespace("Private",$validatesRawJson);var $scalar=Symbol("$scalar"),$ref=Symbol("$ref"),$map=Symbol("$map");var StreamingMode;(function(StreamingMode){StreamingMode[StreamingMode.Duplex=3]="Duplex",StreamingMode[StreamingMode.In=2]="In",StreamingMode[StreamingMode.Out=1]="Out",StreamingMode[StreamingMode.None=0]="None"})(StreamingMode||(StreamingMode={}));var EmitterOptionsSchema3={type:"object",additionalProperties:!1,properties:{noEmit:{type:"boolean",nullable:!0,description:"If set to `true`, this emitter will not write any files. It will still validate the TypeSpec sources to ensure they are compatible with Protobuf, but the files will simply not be written to the output directory."},"omit-unreachable-types":{type:"boolean",nullable:!0,description:"By default, the emitter will create `message` declarations for any models in a namespace decorated with `@package` that have an `@field` decorator on every property. If this option is set to true, this behavior will be disabled, and only messages that are explicitly decorated with `@message` or that are reachable from a service operation will be emitted."}},required:[]},PACKAGE_NAME="@typespec/protobuf",TypeSpecProtobufLibrary=createTypeSpecLibrary({name:PACKAGE_NAME,capabilities:{dryRun:!0},requireImports:[PACKAGE_NAME],diagnostics:{"field-index":{severity:"error",messages:{missing:paramMessage`field ${"name"} does not have a field index, but one is required (try using the '@field' decorator)`,invalid:paramMessage`field index ${"index"} is invalid (must be an integer greater than zero)`,"out-of-bounds":paramMessage`field index ${"index"} is out of bounds (must be less than ${"max"})`,reserved:paramMessage`field index ${"index"} falls within the implementation-reserved range of 19000-19999 inclusive`,"user-reserved":paramMessage`field index ${"index"} was reserved by a call to @reserve on this model`,"user-reserved-range":paramMessage`field index ${"index"} falls within a range reserved by a call to @reserve on this model`}},"field-name":{severity:"error",messages:{"user-reserved":paramMessage`field name '${"name"}' was reserved by a call to @reserve on this model`}},"root-operation":{severity:"error",messages:{default:"operations in the root namespace are not supported (no associated Protobuf service)"}},"unsupported-intrinsic":{severity:"error",messages:{default:paramMessage`intrinsic type ${"name"} is not supported in Protobuf`}},"unsupported-return-type":{severity:"error",messages:{default:"Protobuf methods must return a named Model"}},"unsupported-input-type":{severity:"error",messages:{"wrong-number":"Protobuf methods must accept exactly one Model input (an empty model will do)","wrong-type":"Protobuf methods may only accept a named Model as an input",unconvertible:"input parameters cannot be converted to a Protobuf message"}},"unsupported-field-type":{severity:"error",messages:{unconvertible:paramMessage`cannot convert a ${"type"} to a protobuf type (only intrinsic types and models are supported)`,"unknown-intrinsic":paramMessage`no known protobuf scalar for intrinsic type ${"name"}`,"unknown-scalar":paramMessage`no known protobuf scalar for TypeSpec scalar type ${"name"}`,"recursive-map":"a protobuf map's 'value' type may not refer to another map",union:"a message field's type may not be a union"}},"optional-array-field":{severity:"warning",messages:{default:"optional array fields cannot preserve unset versus empty in protobuf; emitting a repeated field without the 'optional' label"}},"optional-map-field":{severity:"warning",messages:{default:"optional map fields cannot preserve unset versus empty in protobuf; emitting a map field without the 'optional' label"}},"namespace-collision":{severity:"error",messages:{default:paramMessage`the package name ${"name"} has already been used`}},"unconvertible-enum":{severity:"error",messages:{default:"enums must explicitly assign exactly one integer to each member to be used in a Protobuf message","no-zero-first":"the first variant of an enum must be set to zero to be used in a Protobuf message"}},"nested-array":{severity:"error",messages:{default:"nested arrays are not supported by the Protobuf emitter"}},"invalid-package-name":{severity:"error",messages:{default:paramMessage`${"name"} is not a valid package name (must consist of letters and numbers separated by ".")`}},"illegal-reservation":{severity:"error",messages:{default:"reservation value must be a string literal, uint32 literal, or a tuple of two uint32 literals denoting a range"}},"model-not-in-package":{severity:"error",messages:{default:paramMessage`model ${"name"} is not in a namespace that uses the '@Protobuf.package' decorator`}},"anonymous-model":{severity:"error",messages:{default:"anonymous models cannot be used in Protobuf messages"}},"unspeakable-template-argument":{severity:"error",messages:{default:paramMessage`template ${"name"} cannot be converted to a Protobuf message because it has an unspeakable argument (try using the '@friendlyName' decorator on the template)`}},package:{severity:"error",messages:{"disallowed-option-type":paramMessage`option '${"name"}' with type '${"type"}' is not allowed in a package declaration (only string, boolean, and numeric types are allowed)`}}},emitter:{options:EmitterOptionsSchema3}}),__DIAGNOSTIC_CACHE=new WeakMap;function getDiagnosticCache(program){let cache=__DIAGNOSTIC_CACHE.get(program);if(!cache)cache=new Map,__DIAGNOSTIC_CACHE.set(program,cache);return cache}function getAppliedCodesForTarget(program,target){let cache=getDiagnosticCache(program),codes=cache.get(target);if(!codes)codes=new Set,cache.set(target,codes);return codes}var reportDiagnostic3=Object.assign(TypeSpecProtobufLibrary.reportDiagnostic,{once:function(program,diagnostic){let codes=getAppliedCodesForTarget(program,diagnostic.target);if(codes.has(diagnostic.code))return;codes.add(diagnostic.code),TypeSpecProtobufLibrary.reportDiagnostic(program,diagnostic)}}),keys=["fieldIndex","package","service","externRef","stream","reserve","message","_map"],state=Object.fromEntries(keys.map((k)=>[k,TypeSpecProtobufLibrary.createStateSymbol(k)]));var operationIdStrategySchema={type:"string",enum:["parent-container","fqn","explicit-only"],default:"parent-container",description:["Determines how to generate operation IDs when `@operationId` is not used.","Avaliable options are:"," - `parent-container`: Uses the parent namespace and operation name to generate the ID."," - `fqn`: Uses the fully qualified name of the operation to generate the ID."," - `explicit-only`: Only use explicitly defined operation IDs."].join(`
`)},EmitterOptionsSchema4={type:"object",additionalProperties:!1,properties:{"file-type":{type:["string","array"],nullable:!0,oneOf:[{type:"string",enum:["yaml","json"]},{type:"array",items:{type:"string",enum:["yaml","json"]},uniqueItems:!0,minItems:1}],description:"If the content should be serialized as YAML or JSON. Can be a single value or an array to emit multiple formats. Default 'yaml', if not specified infer from the `output-file` extension"},"output-file":{type:"string",nullable:!0,description:["Name of the output file."," Output file will interpolate the following values:","  - service-name: Name of the service","  - service-name-if-multiple: Name of the service if multiple","  - version: Version of the service if multiple","  - file-type: The file type being emitted (json or yaml). Useful when `file-type` is an array.","",' Default: `{service-name-if-multiple}.{version}.openapi.yaml` or `.json` if `file-type` is `"json"`'," When `file-type` is an array: `{service-name-if-multiple}.{version}.openapi.{file-type}`",""," Example Single service no versioning","  - `openapi.yaml`",""," Example Multiple services no versioning","  - `openapi.Org1.Service1.yaml`","  - `openapi.Org1.Service2.yaml`",""," Example Single service with versioning","  - `openapi.v1.yaml`","  - `openapi.v2.yaml`",""," Example Multiple service with versioning","  - `openapi.Org1.Service1.v1.yaml`","  - `openapi.Org1.Service1.v2.yaml`","  - `openapi.Org1.Service2.v1.0.yaml`","  - `openapi.Org1.Service2.v1.1.yaml`    "].join(`
`)},"openapi-versions":{title:"OpenAPI Versions",type:"array",items:{type:"string",enum:["3.0.0","3.1.0","3.2.0"],nullable:!0,description:"The versions of OpenAPI to emit. Defaults to `[3.0.0]`"},nullable:!0,uniqueItems:!0,minItems:1,default:["3.0.0"]},"new-line":{type:"string",enum:["crlf","lf"],default:"lf",nullable:!0,description:"Set the newline character for emitting files."},"omit-unreachable-types":{type:"boolean",nullable:!0,description:`Omit unreachable types.
By default all types declared under the service namespace will be included. With this flag on only types references in an operation will be emitted.`},"include-x-typespec-name":{type:"string",enum:["inline-only","never"],nullable:!0,default:"never",description:"If the generated openapi types should have the `x-typespec-name` extension set with the name of the TypeSpec type that created it.\nThis extension is meant for debugging and should not be depended on."},"safeint-strategy":{type:"string",enum:["double-int","int64"],nullable:!0,default:"int64",description:["How to handle safeint type. Options are:"," - `double-int`: Will produce `type: integer, format: double-int`"," - `int64`: Will produce `type: integer, format: int64`","","Default: `int64`"].join(`
`)},"seal-object-schemas":{type:"boolean",nullable:!0,default:!1,description:["If true, then for models emitted as object schemas we default `additionalProperties` to false for","OpenAPI 3.0, and `unevaluatedProperties` to false for OpenAPI 3.1, if not explicitly specified elsewhere.","Default: `false`"].join(`
`)},"experimental-parameter-examples":{type:"string",enum:["data","serialized"],nullable:!0,description:["Determines how to emit examples on parameters.","Note: This is an experimental feature and may change in future versions.","See https://spec.openapis.org/oas/v3.0.4.html#style-examples for parameter example serialization rules","See https://github.com/OAI/OpenAPI-Specification/discussions/4622 for discussion on handling parameter examples."].join(`
`)},"operation-id-strategy":{oneOf:[operationIdStrategySchema,{type:"object",properties:{kind:operationIdStrategySchema,separator:{type:"string",nullable:!0,description:"Separator used to join segment in the operation name."}},required:["kind"]}]},"enum-strategy":{type:"string",enum:["default","annotated"],nullable:!0,default:"default",description:["How to emit TypeSpec enums and unions of literals. Options are:"," - `default`: Emit as a single schema using the `enum` keyword."," - `annotated`: Emit as a `oneOf` of `const` subschemas annotated with `title` and `description`","   from each member's/variant's `@summary` and `@doc`. Follows the OpenAPI 3.1.1 annotated enumerations pattern.","   Only supported by OpenAPI 3.1.0 and above; on 3.0.0 the `default` style is used and a warning is reported."].join(`
`)}},required:[]},$lib3=createTypeSpecLibrary({name:"@typespec/openapi3",capabilities:{dryRun:!0},diagnostics:{"oneof-union":{severity:"error",messages:{default:"@oneOf decorator can only be used on a union or a model property which type is a union."}},"inconsistent-shared-route-request-visibility":{severity:"error",messages:{default:"All operations with `@sharedRoutes` must have the same `@requestVisibility`."}},"invalid-server-variable":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/invalid-server-variable.md"),messages:{default:paramMessage`Server variable '${"propName"}' must be assignable to 'string'. It must either be a string, enum of string or union of strings.`}},"invalid-format":{severity:"warning",messages:{default:paramMessage`Collection format '${"value"}' is not supported in OpenAPI3 ${"paramType"} parameters. Defaulting to type 'string'.`}},"invalid-style":{severity:"warning",messages:{default:paramMessage`Style '${"style"}' is not supported in OpenAPI3 ${"paramType"} parameters. Defaulting to style 'simple'.`,optionalPath:paramMessage`Style '${"style"}' is not supported in OpenAPI3 ${"paramType"} parameters. The style ${"style"} could be introduced by an optional parameter. Defaulting to style 'simple'.`}},"path-reserved-expansion":{severity:"warning",messages:{default:"Reserved expansion of path parameter with '+' operator #{allowReserved: true} is not supported in OpenAPI3."}},"resource-namespace":{severity:"error",messages:{default:"Resource goes on namespace"}},"path-query":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/path-query.md"),messages:{default:"OpenAPI does not allow paths containing a query string."}},"duplicate-header":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/duplicate-header.md"),messages:{default:paramMessage`The header ${"header"} is defined across multiple content types`}},"status-code-in-default-response":{severity:"error",messages:{default:"a default response should not have an explicit status code"}},"invalid-schema":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/invalid-schema.md"),messages:{default:paramMessage`Couldn't get schema for type ${"type"}`}},"union-null":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/union-null.md"),messages:{default:"Cannot have a union containing only null types."}},"empty-union":{severity:"error",messages:{default:"Empty unions are not supported for OpenAPI v3 - enums must have at least one value."}},"empty-enum":{severity:"error",messages:{default:"Empty enums are not supported for OpenAPI v3 - enums must have at least one value."}},"enum-unique-type":{severity:"error",messages:{default:"Enums are not supported unless all options are literals of the same type."}},"inline-cycle":{severity:"error",docs:fileRef.fromPackageRoot("src/diagnostics/inline-cycle.md"),messages:{default:paramMessage`Cycle detected in '${"type"}'. Use @friendlyName decorator to assign an OpenAPI definition name and make it non-inline.`}},"unsupported-status-code-range":{severity:"error",messages:{default:paramMessage`Status code range '${"start"} to '${"end"}' is not supported. OpenAPI 3.0 can only represent range 1XX, 2XX, 3XX, 4XX and 5XX. Example: \`@minValue(400) @maxValue(499)\` for 4XX.`}},"invalid-model-property":{severity:"error",messages:{default:paramMessage`'${"type"}' cannot be specified as a model property.`}},"unsupported-auth":{severity:"warning",messages:{default:paramMessage`Authentication "${"authType"}" is not a known authentication by the openapi3 emitter, it will be ignored.`}},"xml-attribute-invalid-property-type":{severity:"warning",messages:{default:paramMessage`XML \`@attribute\` can only be primitive types in the OpenAPI 3 emitter, Property '${"name"}' type will be changed to type: string.`}},"xml-unwrapped-invalid-property-type":{severity:"warning",messages:{default:paramMessage`XML \`@unwrapped\` can only used on array properties or primitive ones in the OpenAPI 3 emitter, Property '${"name"}' will be ignored.`}},"invalid-component-fixed-field-key":{severity:"warning",messages:{default:paramMessage`Invalid key '${"value"}' used in a fixed field of the Component object. Only alphanumerics, dot (.), hyphen (-), and underscore (_) characters are allowed in keys.`}},"streams-not-supported":{severity:"warning",messages:{default:"Streams with itemSchema are only fully supported in OpenAPI 3.2.0 or above. The response will be emitted without itemSchema. Consider using OpenAPI 3.2.0 for full stream support."}},"default-not-supported":{severity:"warning",messages:{default:paramMessage`Default value is not supported in OpenAPI 3.0 ${"message"}`}},"enum-strategy-not-supported":{severity:"warning",messages:{default:"`enum-strategy: annotated` is only supported for OpenAPI 3.1.0 and above. The default enum strategy will be used for OpenAPI 3.0.0."}}},emitter:{options:EmitterOptionsSchema4}}),{createDiagnostic:createDiagnostic2,reportDiagnostic:reportDiagnostic4,createStateSymbol:createStateSymbol2}=$lib3;var refTargetsKey=createStateSymbol2("refs");var oneOfKey=createStateSymbol2("oneOf");var $lib4=createTypeSpecLibrary({name:"@typespec/sse",diagnostics:{"terminal-event-not-in-events":{severity:"error",messages:{default:"A field marked as '@terminalEvent' must be a member of a type decorated with '@TypeSpec.Events.events'."}},"sse-stream-union-not-events":{severity:"error",messages:{default:"SSEStream type parameter must be a union decorated with '@TypeSpec.Events.events'."}}},state:{terminalEvent:{description:"State for the @terminalEvent decorator."}}}),{reportDiagnostic:reportDiagnostic5,createDiagnostic:createDiagnostic3,stateKeys:SSEStateKeys}=$lib4;var[isTerminalEvent,setTerminalEvent]=useStateSet(SSEStateKeys.terminalEvent);var $lib5=createTypeSpecLibrary({name:"@typespec/events",diagnostics:{"invalid-content-type-target":{severity:"error",messages:{default:"@contentType can only be specified on the top-level event envelope, or the event payload marked with @data"}},"multiple-event-payloads":{severity:"error",messages:{default:paramMessage`Event payload already applied to ${"dataPath"} but also exists under ${"currentPath"}`,payloadInIndexedModel:paramMessage`Event payload applied from inside a Record or Array at ${"dataPath"}`}}},state:{events:{description:"State for the @events decorator."},contentType:{description:"State for the @contentType decorator."},data:{description:"State for the @data decorator."}}}),{reportDiagnostic:reportDiagnostic6,createDiagnostic:createDiagnostic4,stateKeys:EventsStateKeys}=$lib5;var[isEvents,setEvents]=useStateSet(EventsStateKeys.events);var[getContentType,setContentType]=useStateMap(EventsStateKeys.contentType);var[isEventData,setEventData]=useStateSet(EventsStateKeys.data);var $lib6=createTypeSpecLibrary({name:"@typespec/http",diagnostics:{"http-verb-duplicate":{severity:"error",messages:{default:paramMessage`HTTP verb already applied to ${"entityName"}`}},"missing-uri-param":{severity:"error",messages:{default:paramMessage`Route reference parameter '${"param"}' but wasn't found in operation parameters`}},"incompatible-uri-param":{severity:"error",messages:{default:paramMessage`Parameter '${"param"}' is defined in the uri as a ${"uriKind"} but is annotated as a ${"annotationKind"}.`}},"use-uri-template":{severity:"error",messages:{default:paramMessage`Parameter '${"param"}' is already defined in the uri template. Explode, style and allowReserved property must be defined in the uri template as described by RFC 6570.`}},"double-slash":{severity:"warning",messages:{default:paramMessage`Route will result in duplicate slashes as parameter '${"paramName"}' use path expansion and is prefixed with a /`,optionalUnset:paramMessage`Route will result in duplicate slashes when optional parameter '${"paramName"}' is not set.`,optionalSet:paramMessage`Route will result in duplicate slashes when optional parameter '${"paramName"}' is set.`}},"missing-server-param":{severity:"error",messages:{default:paramMessage`Server url contains parameter '${"param"}' but wasn't found in given parameters`}},"duplicate-body":{severity:"error",messages:{default:"Operation has multiple @body parameters declared",duplicateUnannotated:"Operation has multiple unannotated parameters. There can only be one representing the body",bodyAndUnannotated:"Operation has a @body and an unannotated parameter. There can only be one representing the body"}},"duplicate-route-decorator":{severity:"error",messages:{namespace:"@route was defined twice on this namespace and has different values."}},"operation-param-duplicate-type":{severity:"error",messages:{default:paramMessage`Param ${"paramName"} has multiple types: [${"types"}]`}},"duplicate-operation":{severity:"error",messages:{default:paramMessage`Duplicate operation "${"operationName"}" routed at "${"verb"} ${"path"}".`}},"multiple-status-codes":{severity:"error",messages:{default:"Multiple `@statusCode` decorators defined for this operation response."}},"status-code-invalid":{severity:"error",messages:{default:"statusCode value must be a numeric or string literal or union of numeric or string literals",value:"statusCode value must be a three digit code between 100 and 599"}},"content-type-string":{severity:"error",messages:{default:"contentType parameter must be a string literal or union of string literals"}},"content-type-ignored":{severity:"warning",messages:{default:"`Content-Type` header ignored because there is no body."}},"metadata-ignored":{severity:"warning",messages:{default:paramMessage`${"kind"} property will be ignored as it is inside of a @body property. Use @bodyRoot instead if wanting to mix.`}},"response-cookie-not-supported":{severity:"warning",messages:{default:paramMessage`@cookie on response is not supported. Property '${"propName"}' will be ignored in the body. If you need 'Set-Cookie', use @header instead.`}},"no-service-found":{severity:"warning",messages:{default:paramMessage`No namespace with '@service' was found, but Namespace '${"namespace"}' contains routes. Did you mean to annotate this with '@service'?`}},"invalid-type-for-auth":{severity:"error",messages:{default:paramMessage`@useAuth ${"kind"} only accept Auth model, Tuple of auth model or union of auth model.`}},"shared-inconsistency":{severity:"error",messages:{default:paramMessage`Each operation routed at "${"verb"} ${"path"}" needs to have the @sharedRoute decorator.`}},"multipart-invalid-content-type":{severity:"error",messages:{default:paramMessage`Content type '${"contentType"}' is not a multipart content type. Supported content types are: ${"supportedContentTypes"}.`}},"multipart-model":{severity:"error",messages:{default:"Multipart request body must be a model or a tuple of http parts."}},"no-implicit-multipart":{severity:"error",messages:{default:"Using multipart payloads requires the use of @multipartBody and HttpPart<T> models."}},"multipart-part":{severity:"error",messages:{default:"Expect item to be an HttpPart model."}},"multipart-nested":{severity:"error",messages:{default:"Cannot use @multipartBody inside of an HttpPart"}},"http-file-extra-property":{severity:"error",messages:{default:paramMessage`File model cannot define extra properties. Found '${"propName"}'.`}},"http-file-disallowed-metadata":{severity:"error",messages:{default:paramMessage`File model cannot define HTTP metadata type '${"metadataType"}' on property '${"propName"}'.`}},"formdata-no-part-name":{severity:"error",messages:{default:"Part used in multipart/form-data must have a name."}},"http-file-structured":{severity:"warning",messages:{default:paramMessage`HTTP File body is serialized as a structured model in '${"contentTypes"}' instead of being treated as the contents of a file because an explicit Content-Type header is defined. Override the \`contentType\` property of the file model to declare the internal media type of the file's contents, or suppress this warning if you intend to serialize the File as a model.`,union:"An HTTP File in a union is serialized as a structured model instead of being treated as the contents of a file. Declare a separate operation using `@sharedRoute` that has only the File model as the body type to treat it as a file, or suppress this warning if you intend to serialize the File as a model."}},"http-file-content-type-not-string":{severity:"error",messages:{default:paramMessage`The 'contentType' property of the file model must be 'TypeSpec.string', a string literal, or a union of string literals. Found '${"type"}'.`}},"http-file-contents-not-scalar":{severity:"error",messages:{default:paramMessage`The 'contents' property of the file model must be a scalar type that extends 'string' or 'bytes'. Found '${"type"}'.`}},"deprecated-implicit-optionality":{severity:"warning",messages:{default:"The implicitOptionality option is deprecated. To preserve previous behavior, use an explicit patch model with optional properties. For actual merge-patch semantics, use MergePatchUpdate<T> for the @body type."}},"merge-patch-contains-null":{severity:"error",messages:{default:"Cannot convert model to a merge-patch compatible shape because it contains the 'null' intrinsic type."}},"merge-patch-content-type":{severity:"warning",messages:{default:paramMessage`The content-type of a request using a merge-patch template should be 'application/merge-patch+json' detected a header with content-type '${"contentType"}'.`}},"merge-patch-contains-metadata":{severity:"error",messages:{default:paramMessage`The MergePatch transform does not operate on http envelope metadata.  Remove any http metadata decorators ('@query', '@header', '@path', '@cookie', '@statusCode') from the model passed to the MergePatch template. Found '${"metadataType"}' decorating property '${"propertyName"}'`}}},state:{authentication:{description:"State for the @auth decorator"},header:{description:"State for the @header decorator"},cookie:{description:"State for the @cookie decorator"},query:{description:"State for the @query decorator"},path:{description:"State for the @path decorator"},body:{description:"State for the @body decorator"},bodyRoot:{description:"State for the @bodyRoot decorator"},bodyIgnore:{description:"State for the @bodyIgnore decorator"},multipartBody:{description:"State for the @bodyIgnore decorator"},statusCode:{description:"State for the @statusCode decorator"},verbs:{description:"State for the verb decorators (@get, @post, @put, etc.)"},patchOptions:{description:"State for the options of the @patch decorator"},servers:{description:"State for the @server decorator"},includeInapplicableMetadataInPayload:{description:"State for the @includeInapplicableMetadataInPayload decorator"},externalInterfaces:{},routeProducer:{},routes:{},sharedRoutes:{description:"State for the @sharedRoute decorator"},routeOptions:{},file:{description:"State for the @Private.file decorator"},httpPart:{description:"State for the @Private.httpPart decorator"},mergePatchModel:{description:"State marking mergePatch models "},mergePatchProperty:{description:"State marking merge path model property source"},mergePatchPropertyOptions:{description:"Override options for a property in a merge patch transform"}}}),{reportDiagnostic:reportDiagnostic7,createDiagnostic:createDiagnostic5,stateKeys:HttpStateKeys}=$lib6;function error(target){return[[],[createDiagnostic5({code:"status-code-invalid",target,messageId:"value"})]]}function validateStatusCode(code,diagnosticTarget){let codeAsNumber=typeof code==="string"?parseInt(code,10):code;if(isNaN(codeAsNumber))return error(diagnosticTarget);if(!Number.isInteger(codeAsNumber))return error(diagnosticTarget);if(codeAsNumber<100||codeAsNumber>599)return error(diagnosticTarget);return[[codeAsNumber],[]]}function getStatusCodesFromType(program,type,diagnosticTarget){switch(type.kind){case"String":case"Number":return validateStatusCode(type.value,diagnosticTarget);case"Union":let diagnostics=createDiagnosticCollector(),statusCodes=[...type.variants.values()].flatMap((variant)=>diagnostics.pipe(getStatusCodesFromType(program,variant.type,diagnosticTarget)));return diagnostics.wrap(statusCodes);case"Scalar":return validateStatusCodeRange(program,type,type,diagnosticTarget);case"ModelProperty":if(type.type.kind==="Scalar")return validateStatusCodeRange(program,type,type.type,diagnosticTarget);else return getStatusCodesFromType(program,type.type,diagnosticTarget);default:return error(diagnosticTarget)}}function validateStatusCodeRange(program,type,scalar,diagnosticTarget){if(!isInt32(program,scalar))return error(diagnosticTarget);let range=getStatusCodesRange(program,type,diagnosticTarget);if(isRangeComplete(range))return[[range],[]];else return error(diagnosticTarget)}function isRangeComplete(range){return range.start!==void 0&&range.end!==void 0}function getStatusCodesRange(program,type,diagnosticTarget){let start=getMinValue(program,type),end=getMaxValue(program,type),baseRange={};if(type.kind==="ModelProperty"&&(type.type.kind==="Scalar"||type.type.kind==="ModelProperty"))baseRange=getStatusCodesRange(program,type.type,diagnosticTarget);else if(type.kind==="Scalar"&&type.baseScalar)baseRange=getStatusCodesRange(program,type.baseScalar,diagnosticTarget);return{...baseRange,start,end}}function isInt32(program,type){let tk=$(program);return tk.type.isAssignableTo(type,tk.builtin.int32,type)}function getHeaderFieldOptions(program,entity){return program.stateMap(HttpStateKeys.header).get(entity)}function isHeader(program,entity){return program.stateMap(HttpStateKeys.header).has(entity)}function getCookieParamOptions(program,entity){return program.stateMap(HttpStateKeys.cookie).get(entity)}function isCookieParam(program,entity){return program.stateMap(HttpStateKeys.cookie).has(entity)}var[getQueryOptions,setQueryOptions]=useStateMap(HttpStateKeys.query);function resolveQueryOptionsWithDefaults(options){return{explode:options.explode??!1,name:options.name}}function isQueryParam(program,entity){return program.stateMap(HttpStateKeys.query).has(entity)}var[getPathOptions,setPathOptions]=useStateMap(HttpStateKeys.path);function resolvePathOptionsWithDefaults(options){return{explode:options.explode??!1,allowReserved:options.allowReserved??!1,style:options.style??"simple",name:options.name}}function isPathParam(program,entity){return program.stateMap(HttpStateKeys.path).has(entity)}function isBody(program,entity){return program.stateSet(HttpStateKeys.body).has(entity)}function isBodyRoot(program,entity){return program.stateSet(HttpStateKeys.bodyRoot).has(entity)}function isBodyIgnore(program,entity){return program.stateSet(HttpStateKeys.bodyIgnore).has(entity)}function isMultipartBodyProperty(program,entity){return program.stateSet(HttpStateKeys.multipartBody).has(entity)}function isStatusCode(program,entity){return program.stateSet(HttpStateKeys.statusCode).has(entity)}function getStatusCodesWithDiagnostics(program,type){return getStatusCodesFromType(program,type,type)}function getStatusCodeDescription(statusCode){if(typeof statusCode==="object")return rangeDescription(statusCode.start,statusCode.end);let statusCodeNumber=typeof statusCode==="string"?parseInt(statusCode,10):statusCode;switch(statusCodeNumber){case 200:return"The request has succeeded.";case 201:return"The request has succeeded and a new resource has been created as a result.";case 202:return"The request has been accepted for processing, but processing has not yet completed.";case 204:return"There is no content to send for this request, but the headers may be useful. ";case 301:return"The URL of the requested resource has been changed permanently. The new URL is given in the response.";case 304:return"The client has made a conditional request and the resource has not been modified.";case 400:return"The server could not understand the request due to invalid syntax.";case 401:return"Access is unauthorized.";case 403:return"Access is forbidden.";case 404:return"The server cannot find the requested resource.";case 409:return"The request conflicts with the current state of the server.";case 412:return"Precondition failed.";case 503:return"Service unavailable."}return rangeDescription(statusCodeNumber,statusCodeNumber)}function rangeDescription(start,end){if(start>=100&&end<=199)return"Informational";else if(start>=200&&end<=299)return"Successful";else if(start>=300&&end<=399)return"Redirection";else if(start>=400&&end<=499)return"Client error";else if(start>=500&&end<=599)return"Server error";return}function setOperationVerb(context,entity,verb){validateVerbUniqueOnNode(context,entity),context.program.stateMap(HttpStateKeys.verbs).set(entity,verb)}function validateVerbUniqueOnNode(context,type){if(type.decorators.filter((x)=>VERB_DECORATORS.includes(x.decorator)&&x.node?.kind===SyntaxKind.DecoratorExpression&&x.node?.parent===type.node).length>1)return reportDiagnostic7(context.program,{code:"http-verb-duplicate",format:{entityName:type.name},target:context.decoratorTarget}),!1;return!0}function getOperationVerb(program,entity){return program.stateMap(HttpStateKeys.verbs).get(entity)}function createVerbDecorator(verb){return(context,entity)=>{setOperationVerb(context,entity,verb)}}var $get=createVerbDecorator("get"),$put=createVerbDecorator("put"),$post=createVerbDecorator("post"),$delete=createVerbDecorator("delete"),$head=createVerbDecorator("head"),_patch=createVerbDecorator("patch"),[_getPatchOptions,setPatchOptions]=useStateMap(HttpStateKeys.patchOptions);function isOriginalDecoratorApplication(context,entity){let decoratorNode=context.decoratorTarget;if(entity.interface!==void 0&&entity.node!==void 0&&entity.node.parent!==entity.interface.node)return!1;if(entity.sourceOperation!==void 0)return!1;if(decoratorNode?.kind===SyntaxKind.DecoratorExpression&&decoratorNode.parent){if(decoratorNode.parent!==entity.node)return!1}return!0}var $patch=(context,entity,options)=>{if(_patch(context,entity),options){if(options.implicitOptionality===!0){if(isOriginalDecoratorApplication(context,entity))reportDiagnostic7(context.program,{code:"deprecated-implicit-optionality",target:entity})}setPatchOptions(context.program,entity,options)}};function getPatchOptions(program,operation){return _getPatchOptions(program,operation)}var VERB_DECORATORS=[$get,$head,$post,$put,$patch,$delete];function getAuthentication(program,entity){return program.stateMap(HttpStateKeys.authentication).get(entity)}function getAuthenticationForOperation(program,operation){let operationAuth=getAuthentication(program,operation);if(operationAuth)return operationAuth;if(operation.interface!==void 0){let interfaceAuth=getAuthentication(program,operation.interface);if(interfaceAuth)return interfaceAuth}let namespace=operation.namespace;while(namespace){let namespaceAuth=getAuthentication(program,namespace);if(namespaceAuth)return namespaceAuth;namespace=namespace.namespace}return}function getContentTypes(property){let diagnostics=createDiagnosticCollector();if(property.type.kind==="String")return[[property.type.value],[]];else if(property.type.kind==="Union"){let contentTypes=[];for(let option of property.type.variants.values())if(option.type.kind==="String")contentTypes.push(option.type.value);else{diagnostics.add(createDiagnostic5({code:"content-type-string",target:property}));continue}return diagnostics.wrap(contentTypes)}else if(property.type.kind==="Scalar"&&property.type.name==="string")return[["*/*"],[]];return[[],[createDiagnostic5({code:"content-type-string",target:property})]]}var[getSharedRoute,setSharedRouteFor]=useStateMap(HttpStateKeys.sharedRoutes);function isSharedRoute(program,operation){return getSharedRoute(program,operation)===!0}var[getRouteState,setRouteState]=useStateMap(HttpStateKeys.routes);function isHttpFile(program,type){return program.stateSet(HttpStateKeys.file).has(type)}function isOrExtendsHttpFile(program,type){if(type.kind!=="Model")return!1;let current=type;while(current){if(isHttpFile(program,current))return!0;current=current.baseModel}return!1}function getHttpFileModel(program,type,filter){if(type.kind!=="Model")return;let contentType=getProperty(type,"contentType"),filename=getProperty(type,"filename"),contents=getProperty(type,"contents");if(!contentType||!filename||!contents)return;if(!propertyIsFromHttpFile(program,contentType)||!propertyIsFromHttpFile(program,filename)||!propertyIsFromHttpFile(program,contents))return;let effectiveProperties=new Set(walkPropertiesInherited(type));if(filter){for(let prop of effectiveProperties)if(!filter(prop))effectiveProperties.delete(prop)}if(effectiveProperties.size!==3)return;return{contents,contentType,filename,type}}function propertyIsFromHttpFile(program,property){if(property.model?isOrExtendsHttpFile(program,property.model):!1)return!0;if(property.sourceProperty)return propertyIsFromHttpFile(program,property.sourceProperty);return!1}function getHttpPart(program,target){return program.stateMap(HttpStateKeys.httpPart).get(target)}var Visibility;(function(Visibility){Visibility[Visibility.Read=1]="Read",Visibility[Visibility.Create=2]="Create",Visibility[Visibility.Update=4]="Update",Visibility[Visibility.Delete=8]="Delete",Visibility[Visibility.Query=16]="Query",Visibility[Visibility.None=0]="None",Visibility[Visibility.All=31]="All",Visibility[Visibility.Item=1048576]="Item",Visibility[Visibility.Patch=2097152]="Patch",Visibility[Visibility.Synthetic=3145728]="Synthetic"})(Visibility||(Visibility={}));function filterToVisibility(program,filter){let Lifecycle=getLifecycleVisibilityEnum(program);if(compilerAssert(!filter.all,"Unexpected: `all` constraint in visibility filter passed to filterToVisibility"),compilerAssert(!filter.none,"Unexpected: `none` constraint in visibility filter passed to filterToVisibility"),!filter.any)return Visibility.All;else{let visibility=Visibility.None;for(let modifierConstraint of filter.any??[]){if(modifierConstraint.enum!==Lifecycle)continue;switch(modifierConstraint.name){case"Read":visibility|=Visibility.Read;break;case"Create":visibility|=Visibility.Create;break;case"Update":visibility|=Visibility.Update;break;case"Delete":visibility|=Visibility.Delete;break;case"Query":visibility|=Visibility.Query;break;default:compilerAssert(!1,`Unreachable: unrecognized Lifecycle visibility member: '${modifierConstraint.name}'`)}}return visibility}}var VISIBILITY_FILTER_CACHE_MAP=new WeakMap;function getVisibilityFilterCache(program){let cache=VISIBILITY_FILTER_CACHE_MAP.get(program);if(!cache)cache=new Map,VISIBILITY_FILTER_CACHE_MAP.set(program,cache);return cache}function visibilityToFilter(program,visibility){if(visibility&=~Visibility.Synthetic,visibility===Visibility.All)return{};let cache=getVisibilityFilterCache(program),filter=cache.get(visibility);if(!filter){let LifecycleEnum=getLifecycleVisibilityEnum(program),Lifecycle={Create:LifecycleEnum.members.get("Create"),Read:LifecycleEnum.members.get("Read"),Update:LifecycleEnum.members.get("Update"),Delete:LifecycleEnum.members.get("Delete"),Query:LifecycleEnum.members.get("Query")},any=new Set;if(visibility&Visibility.Read)any.add(Lifecycle.Read);if(visibility&Visibility.Create)any.add(Lifecycle.Create);if(visibility&Visibility.Update)any.add(Lifecycle.Update);if(visibility&Visibility.Delete)any.add(Lifecycle.Delete);if(visibility&Visibility.Query)any.add(Lifecycle.Query);compilerAssert(any.size>0||visibility===Visibility.None,"invalid visibility"),filter={any},cache.set(visibility,filter)}return filter}function getDefaultVisibilityForVerb(verb){switch(verb){case"get":case"head":return Visibility.Query;case"post":return Visibility.Create;case"put":return Visibility.Create|Visibility.Update;case"patch":return Visibility.Update;case"delete":return Visibility.Delete;default:compilerAssert(!1,`Unreachable: unrecognized HTTP verb: '${verb}'`)}}function HttpVisibilityProvider(verbOrParameterOptions){let hasVerb=typeof verbOrParameterOptions==="string";return{parameters:(program,operation)=>{let verb=hasVerb?verbOrParameterOptions:verbOrParameterOptions?.verbSelector?.(program,operation)??getOperationVerb(program,operation);if(!verb){let[{parameters}]=resolvePathAndParameters(program,operation,void 0,{});verb=parameters.verb}return visibilityToFilter(program,getDefaultVisibilityForVerb(verb))},returnType:(program,_)=>{let Read=getLifecycleVisibilityEnum(program).members.get("Read");return{any:new Set([Read])}}}}function resolveRequestVisibility(program,operation,verb){let parameterVisibilityFilter=getParameterVisibilityFilter(program,operation,HttpVisibilityProvider(verb)),visibility=filterToVisibility(program,parameterVisibilityFilter);if(verb==="patch"){if(getPatchOptions(program,operation)?.implicitOptionality)visibility|=Visibility.Patch}return visibility}function isVisible2(program,property,visibility){return isVisible(program,property,visibilityToFilter(program,visibility))}var[getMergePatchSource,setMergePatchSource]=useStateMap(HttpStateKeys.mergePatchModel),[getMergePatchPropertySource,setMergePatchPropertySource]=useStateMap(HttpStateKeys.mergePatchProperty),[getMergePatchPropertyOverrides,setMergePatchPropertyOverrides]=useStateMap(HttpStateKeys.mergePatchPropertyOptions);function isMergePatch(program,model){return getMergePatchSource(program,model)!==void 0}function isMergePatchBody(program,bodyType){let _visitedTypes=new WeakMap;function isMergePatchModel(type){if(_visitedTypes.has(type))return!1;if(_visitedTypes.set(bodyType,!0),!$(program).model.is(type))return!1;if(isMergePatch(program,type))return!0;if($(program).array.is(type)||$(program).record.is(type))return isMergePatchModel(type.indexer.value);return!1}switch(bodyType.kind){case"Model":return isMergePatchModel(bodyType)||bodyType.sourceModels.some((m)=>isMergePatchModel(m.model))||[...bodyType.properties.values()].some((p)=>getMergePatchPropertySource(program,p)!==void 0||isMergePatchModel(p.type));case"ModelProperty":return isMergePatchModel(bodyType.type);case"Union":return[...bodyType.variants.values()].some((v)=>isMergePatchModel(v.type));case"UnionVariant":return isMergePatchModel(bodyType.type);case"Tuple":return bodyType.values.some((v)=>isMergePatchModel(v));default:return!1}}function getHttpProperty(program,property,path,options={}){let diagnostics=[];function createResult(opts){return[{...opts,property,path},diagnostics]}let annotations={header:getHeaderFieldOptions(program,property),cookie:getCookieParamOptions(program,property),query:getQueryOptions(program,property),path:getPathOptions(program,property),body:isBody(program,property),bodyRoot:isBodyRoot(program,property),multipartBody:isMultipartBodyProperty(program,property),statusCode:isStatusCode(program,property)},defined=Object.entries(annotations).filter((x)=>!!x[1]),implicit=options.implicitParameter?.(property);if(implicit&&defined.length>0)if(implicit.type==="path"&&annotations.path){if(annotations.path.explode!==void 0||annotations.path.style!==void 0||annotations.path.allowReserved!==void 0)diagnostics.push(createDiagnostic5({code:"use-uri-template",format:{param:property.name},target:property}))}else if(implicit.type==="query"&&annotations.query){if(annotations.query.explode!==void 0)diagnostics.push(createDiagnostic5({code:"use-uri-template",format:{param:property.name},target:property}))}else diagnostics.push(createDiagnostic5({code:"incompatible-uri-param",format:{param:property.name,uriKind:implicit.type,annotationKind:defined[0][0]},target:property}));if(implicit)return createResult({kind:implicit.type,options:implicit,property});if(defined.length===0)return isBodyIgnore(program,property)?createResult({kind:"bodyIgnore"}):createResult({kind:"bodyProperty"});else if(defined.length>1)diagnostics.push(createDiagnostic5({code:"operation-param-duplicate-type",format:{paramName:property.name,types:defined.map((x)=>x[0]).join(", ")},target:property}));if(annotations.header){if(annotations.header.name.toLowerCase()==="content-type"&&!options.treatContentTypeAsHeader)return createResult({kind:"contentType"});return createResult({kind:"header",options:annotations.header})}else if(annotations.cookie)return createResult({kind:"cookie",options:annotations.cookie});else if(annotations.query)return createResult({kind:"query",options:resolveQueryOptionsWithDefaults(annotations.query)});else if(annotations.path)return createResult({kind:"path",options:resolvePathOptionsWithDefaults(annotations.path)});else if(annotations.statusCode)return createResult({kind:"statusCode"});else if(annotations.body)return createResult({kind:"body"});else if(annotations.bodyRoot)return createResult({kind:"bodyRoot"});else if(annotations.multipartBody)return createResult({kind:"multipartBody"});compilerAssert(!1,"Unexpected http property type")}function resolvePayloadProperties(program,type,visibility,disposition,options={}){let diagnostics=createDiagnosticCollector(),httpProperties=new Map;if(type.kind!=="Model"||type.properties.size===0&&!type.baseModel)return diagnostics.wrap([]);let visited=new Set;function checkModel(model,path){visited.add(model);let foundBody=!1,foundBodyProperty=!1;for(let property of walkPropertiesInherited(model)){let propPath=[...path,property.name];if(!isVisible2(program,property,visibility))continue;let httpProperty=diagnostics.pipe(getHttpProperty(program,property,propPath,options));if(httpProperty.kind!=="bodyIgnore"&&shouldTreatAsBodyProperty(httpProperty,disposition))httpProperty={kind:"bodyProperty",property,path:propPath};if(httpProperty.kind==="cookie"&&disposition===HttpPayloadDisposition.Response){diagnostics.add(createDiagnostic5({code:"response-cookie-not-supported",target:property,format:{propName:property.name}}));continue}if(httpProperty.kind==="body"||httpProperty.kind==="bodyRoot"||httpProperty.kind==="multipartBody")foundBody=!0;if(!(httpProperty.kind==="body"||httpProperty.kind==="multipartBody")&&isModelWithProperties(property.type)&&!visited.has(property.type)){if(checkModel(property.type,propPath)){foundBody=!0;continue}}if(httpProperty.kind==="bodyProperty")foundBodyProperty=!0;if(httpProperty.kind!=="bodyIgnore")httpProperties.set(property,httpProperty)}return foundBody&&!foundBodyProperty}return checkModel(type,[]),diagnostics.wrap([...httpProperties.values()])}function isModelWithProperties(type){return type.kind==="Model"&&!type.indexer&&type.properties.size>0}function shouldTreatAsBodyProperty(property,disposition){switch(disposition){case HttpPayloadDisposition.Request:return property.kind==="statusCode";case HttpPayloadDisposition.Response:return property.kind==="query"||property.kind==="path";case HttpPayloadDisposition.Multipart:return property.kind==="path"||property.kind==="query"||property.kind==="statusCode";default:return!1}}var HttpPayloadDisposition;(function(HttpPayloadDisposition){HttpPayloadDisposition[HttpPayloadDisposition.Request=0]="Request",HttpPayloadDisposition[HttpPayloadDisposition.Response=1]="Response",HttpPayloadDisposition[HttpPayloadDisposition.Multipart=2]="Multipart"})(HttpPayloadDisposition||(HttpPayloadDisposition={}));function resolveHttpPayload(program,type,visibility,disposition,options={}){let diagnostics=createDiagnosticCollector(),metadata=diagnostics.pipe(resolvePayloadProperties(program,type,visibility,disposition,options)),body=diagnostics.pipe(resolveBody(program,type,metadata,visibility,disposition));if(body){if(body.contentTypes.some((x)=>x.startsWith("multipart/"))&&body.bodyKind!=="multipart")return diagnostics.add(createDiagnostic5({code:"no-implicit-multipart",target:body.property??type})),diagnostics.wrap({body:void 0,metadata})}return diagnostics.wrap({body,metadata})}function resolveBody(program,requestOrResponseType,metadata,visibility,disposition){let diagnostics=createDiagnosticCollector(),contentTypeProperty=metadata.find((x)=>x.kind==="contentType"),file=getHttpFileModel(program,requestOrResponseType,createHttpFileModelFilter(metadata));if(file!==void 0)if(!contentTypeProperty)return diagnostics.join(getFileBody(file));else{let contentTypes=contentTypeProperty&&diagnostics.pipe(getContentTypes(contentTypeProperty.property));reportDiagnostic7(program,{code:"http-file-structured",format:{contentTypes:contentTypes.join(", ")},target:contentTypeProperty.property})}if(requestOrResponseType.kind!=="Model"||isArrayModelType(requestOrResponseType))return diagnostics.wrap({bodyKind:"single",...diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,requestOrResponseType)),type:requestOrResponseType,isExplicit:!1,containsMetadataAnnotations:!1});let resolvedBody=diagnostics.pipe(resolveExplicitBodyProperty(program,metadata,contentTypeProperty,visibility,disposition));if(resolvedBody===void 0){if(requestOrResponseType.baseModel||requestOrResponseType.indexer)return diagnostics.wrap({bodyKind:"single",...diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,requestOrResponseType)),type:requestOrResponseType,isExplicit:!1,containsMetadataAnnotations:!1});if(requestOrResponseType.derivedModels.length>0&&getDiscriminator(program,requestOrResponseType))return diagnostics.wrap({bodyKind:"single",...diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,requestOrResponseType)),type:requestOrResponseType,isExplicit:!1,containsMetadataAnnotations:!1})}let unannotatedProperties=filterModelProperties(program,requestOrResponseType,(p)=>metadata.some((x)=>x.property===p&&x.kind==="bodyProperty"));if(unannotatedProperties.properties.size>0)if(resolvedBody===void 0)return diagnostics.wrap({bodyKind:"single",...diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,requestOrResponseType)),type:unannotatedProperties,isExplicit:!1,containsMetadataAnnotations:!1});else diagnostics.add(createDiagnostic5({code:"duplicate-body",messageId:"bodyAndUnannotated",target:requestOrResponseType}));if(resolvedBody===void 0&&contentTypeProperty)diagnostics.add(createDiagnostic5({code:"content-type-ignored",target:contentTypeProperty.property}));return diagnostics.wrap(resolvedBody)}function resolveExplicitBodyProperty(program,metadata,contentTypeProperty,visibility,disposition){let diagnostics=createDiagnosticCollector(),resolvedBody,duplicateTracker=new DuplicateTracker;for(let item of metadata){if(item.kind==="body"||item.kind==="bodyRoot"||item.kind==="multipartBody")duplicateTracker.track("body",item.property);switch(item.kind){case"body":case"bodyRoot":let containsMetadataAnnotations=!1;if(item.kind==="body")containsMetadataAnnotations=!diagnostics.pipe(validateBodyProperty(program,item.property,disposition));let file=getHttpFileModel(program,item.property.type,createHttpFileModelFilter(metadata)),isFile=file!==void 0&&!contentTypeProperty;if(file&&contentTypeProperty){let contentTypes=diagnostics.pipe(getContentTypes(contentTypeProperty.property));reportDiagnostic7(program,{code:"http-file-structured",format:{contentTypes:contentTypes.join(", ")},target:contentTypeProperty.property})}if(item.property.type.kind==="Union"&&unionContainsFile(program,item.property.type))reportDiagnostic7(program,{code:"http-file-structured",messageId:"union",target:item.property.node?.kind===SyntaxKind.ModelProperty?item.property.node.value:item.property});resolvedBody??=isFile?diagnostics.pipe(getFileBody(file,item.property)):{bodyKind:"single",...diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,item.property.type)),type:item.property.type,isExplicit:item.kind==="body",containsMetadataAnnotations,property:item.property};break;case"multipartBody":resolvedBody=diagnostics.pipe(resolveMultiPartBody(program,item.property,contentTypeProperty,visibility));break}}for(let[_,items]of duplicateTracker.entries())for(let prop of items)diagnostics.add(createDiagnostic5({code:"duplicate-body",target:prop}));return diagnostics.wrap(resolvedBody)}function unionContainsFile(program,u){return unionContainsFileWorker(u);function unionContainsFileWorker(u,visited=new Set){if(visited.has(u))return!1;visited.add(u);for(let{type}of u.variants.values())if(!!getHttpFileModel(program,type)||type.kind==="Union"&&unionContainsFileWorker(type,visited))return!0;return!1}}function validateBodyProperty(program,property,disposition){let diagnostics=createDiagnosticCollector();return navigateType(property.type,{modelProperty:(prop)=>{let kind=isHeader(program,prop)?"header":(disposition===HttpPayloadDisposition.Request||disposition===HttpPayloadDisposition.Response)&&isCookieParam(program,prop)?"cookie":(disposition===HttpPayloadDisposition.Request||disposition===HttpPayloadDisposition.Multipart)&&isQueryParam(program,prop)?"query":disposition===HttpPayloadDisposition.Request&&isPathParam(program,prop)?"path":disposition===HttpPayloadDisposition.Response&&isStatusCode(program,prop)?"statusCode":void 0;if(kind)diagnostics.add(createDiagnostic5({code:"metadata-ignored",format:{kind},target:prop}))}},{}),diagnostics.wrap(diagnostics.diagnostics.length===0)}function resolveMultiPartBody(program,property,contentTypeProperty,visibility){let diagnostics=createDiagnosticCollector(),type=property.type,contentTypes=contentTypeProperty&&diagnostics.pipe(getContentTypes(contentTypeProperty.property));for(let contentType of contentTypes??[])if(!multipartContentTypesValues.includes(contentType))diagnostics.add(createDiagnostic5({code:"multipart-invalid-content-type",format:{contentType,supportedContentTypes:multipartContentTypesValues.join(", ")},target:type}));if(type.kind==="Model")return diagnostics.join(resolveMultiPartBodyFromModel(program,property,type,contentTypeProperty,visibility));else if(type.kind==="Tuple")return diagnostics.join(resolveMultiPartBodyFromTuple(program,property,type,contentTypeProperty,visibility));else return diagnostics.add(createDiagnostic5({code:"multipart-model",target:property})),diagnostics.wrap(void 0)}function resolveMultiPartBodyFromModel(program,property,type,contentTypeProperty,visibility){let diagnostics=createDiagnosticCollector(),parts=[];for(let item of type.properties.values()){let part=diagnostics.pipe(resolvePartOrParts(program,item.type,visibility,item));if(part)parts.push({partKind:"model",...part,name:part.name??item.name,optional:item.optional,property:item})}let resolvedContentTypes=contentTypeProperty?{contentTypeProperty:contentTypeProperty.property,contentTypes:diagnostics.pipe(getContentTypes(contentTypeProperty.property))}:{contentTypes:[multipartContentTypes.formData]};return diagnostics.wrap({bodyKind:"multipart",multipartKind:"model",...resolvedContentTypes,parts,property,type})}var multipartContentTypes={formData:"multipart/form-data",mixed:"multipart/mixed"},multipartContentTypesValues=Object.values(multipartContentTypes);function resolveMultiPartBodyFromTuple(program,property,type,contentTypeProperty,visibility){let diagnostics=createDiagnosticCollector(),parts=[],contentTypes=contentTypeProperty&&diagnostics.pipe(getContentTypes(contentTypeProperty?.property));for(let[index,item]of type.values.entries()){let part=diagnostics.pipe(resolvePartOrParts(program,item,visibility));if(part?.name===void 0&&contentTypes?.includes(multipartContentTypes.formData))diagnostics.add(createDiagnostic5({code:"formdata-no-part-name",target:type.node?.values[index]??type.values[index]}));if(part)parts.push({partKind:"tuple",...part,optional:!1})}let resolvedContentTypes=contentTypeProperty?{contentTypeProperty:contentTypeProperty.property,contentTypes:diagnostics.pipe(getContentTypes(contentTypeProperty.property))}:{contentTypes:[multipartContentTypes.formData]};return diagnostics.wrap({bodyKind:"multipart",multipartKind:"tuple",...resolvedContentTypes,parts,property,type})}function resolvePartOrParts(program,type,visibility,property){if(type.kind==="Model"&&isArrayModelType(type)){let[part,diagnostics]=resolvePart(program,type.indexer.value,visibility,property);if(part)return[{...part,multi:!0},diagnostics];return[part,diagnostics]}else return resolvePart(program,type,visibility,property)}function resolvePart(program,type,visibility,property){let diagnostics=createDiagnosticCollector(),part=getHttpPart(program,type);if(part){let{body,metadata}=diagnostics.pipe(resolveHttpPayload(program,part.type,visibility,HttpPayloadDisposition.Multipart)),contentTypeProperty=metadata.find((x)=>x.kind==="contentType");if(body===void 0)return diagnostics.wrap(void 0);else if(body.bodyKind==="multipart")return diagnostics.add(createDiagnostic5({code:"multipart-nested",target:type})),diagnostics.wrap(void 0);if(body.contentTypes.length===0)body={...body,contentTypes:diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,body.type)).contentTypes};return diagnostics.wrap({multi:!1,property,name:part.options.name,body,optional:!1,headers:metadata.filter((x)=>x.kind==="header"),filename:body.bodyKind==="file"?body.filename:void 0})}return diagnostics.add(createDiagnostic5({code:"multipart-part",target:type})),diagnostics.wrap(void 0)}function createHttpFileModelFilter(metadata){let metadataPropToMetadata=new Map(metadata.map((x)=>[x.property,x]));return function(property){let httpProperty=metadataPropToMetadata.get(property);if(["filename"].includes(property.name))return!0;if(!httpProperty)return!0;if(httpProperty.kind!=="bodyProperty")return!1;return!0}}function getFileBody(file,property){let[contentTypes,diagnostics]=getContentTypes(file.contentType),isText=isOrExtendsString(file.contents.type);return[{bodyKind:"file",type:file.type,contents:file.contents,filename:file.filename,isText,contentTypeProperty:file.contentType,contentTypes,property},diagnostics];function isOrExtendsString(type){return isString(type)||!!type.baseScalar&&isOrExtendsString(type.baseScalar);function isString(type){return type.name==="string"&&!!type.namespace&&type.namespace.name==="TypeSpec"&&!!type.namespace.namespace&&type.namespace.namespace.name===""&&!type.namespace.namespace.namespace}}}function getDefaultContentTypeForKind(type){return type.kind==="Scalar"?"text/plain":"application/json"}function isLiteralType(type){return type.kind==="String"||type.kind==="Number"||type.kind==="Boolean"||type.kind==="StringTemplate"}function resolveContentTypesForBody(program,contentTypeProperty,type,getDefaultContentType=getDefaultContentTypeForKind){let diagnostics=createDiagnosticCollector();return diagnostics.wrap(resolve());function resolve(){let mpContentType;if(isMergePatchBody(program,type))mpContentType="application/merge-patch+json";if(contentTypeProperty){let explicitContentTypes=diagnostics.pipe(getContentTypes(contentTypeProperty.property));if(mpContentType){let badContentTypes=explicitContentTypes.filter((c)=>!c.startsWith(mpContentType));if(badContentTypes.length>0)diagnostics.add(createDiagnostic5({code:"merge-patch-content-type",target:contentTypeProperty.property??type,format:{contentType:badContentTypes[0]}}))}return{contentTypes:explicitContentTypes,contentTypeProperty:contentTypeProperty.property}}if(mpContentType)return{contentTypes:[mpContentType]};if(isLiteralType(type))switch(type.kind){case"StringTemplate":case"String":type=program.checker.getStdType("string");break;case"Boolean":type=program.checker.getStdType("boolean");break;case"Number":type=program.checker.getStdType("numeric");break;default:}let encoded;while((type.kind==="Scalar"||type.kind==="ModelProperty")&&(encoded=getEncode(program,type)))type=encoded.type;if(type.kind==="Union"){let variants=[...type.variants.values()];if(variants.some((v)=>v.type.kind==="Intrinsic"&&v.type.name==="null"))return{contentTypes:["application/json"]};let set=new Set;for(let variant of variants){let resolved=diagnostics.pipe(resolveContentTypesForBody(program,contentTypeProperty,variant.type));for(let contentType of resolved.contentTypes)set.add(contentType)}return{contentTypes:[...set]}}else return{contentTypes:[getMediaTypeHint(program,type)??getDefaultContentType(type)]}}}var operators=["+","#",".","/",";","?","&"],uriTemplateRegex=/\{([^{}]+)\}|([^{}]+)/g,expressionRegex=/([^:*]*)(?::(\d+)|(\*))?/;function parseUriTemplate(template){let parameters=[],segments=[],matches=template.matchAll(uriTemplateRegex);for(let[_,expression,literal]of matches)if(expression){let operator;if(operators.includes(expression[0]))operator=expression[0],expression=expression.slice(1);let items=expression.split(",");for(let item of items){let match=item.match(expressionRegex),parameter={name:match[1],operator,modifier:match[3]?{type:"explode"}:match[2]?{type:"prefix",value:Number(match[2])}:void 0};parameters.push(parameter),segments.push(parameter)}}else segments.push(literal);return{segments,parameters}}function getOperationParameters(program,operation,partialUriTemplate,overloadBase,options={}){let verb=(options?.verbSelector&&options.verbSelector(program,operation))??getOperationVerb(program,operation)??overloadBase?.verb;if(verb)return getOperationParametersForVerb(program,operation,verb,partialUriTemplate);let post=getOperationParametersForVerb(program,operation,"post",partialUriTemplate);return post[0].body?post:getOperationParametersForVerb(program,operation,"get",partialUriTemplate)}var operatorToStyle={";":"matrix","#":"fragment",".":"label","/":"path"};function getOperationParametersForVerb(program,operation,verb,partialUriTemplate){let diagnostics=createDiagnosticCollector(),visibility=resolveRequestVisibility(program,operation,verb),parsedUriTemplate=parseUriTemplate(partialUriTemplate),parameters=[],{body:resolvedBody,metadata}=diagnostics.pipe(resolveHttpPayload(program,operation.parameters,visibility,HttpPayloadDisposition.Request,{implicitParameter:(param)=>{let isTopLevel=param.model===operation.parameters,pathOptions=getPathOptions(program,param),queryOptions=getQueryOptions(program,param),name=pathOptions?.name??queryOptions?.name??param.name,uriParam=isTopLevel&&parsedUriTemplate.parameters.find((x)=>x.name===name);if(!uriParam){let pathOptions=getPathOptions(program,param);if(pathOptions&&param.optional)return{type:"path",name:pathOptions.name,explode:!1,allowReserved:!1,style:operatorToStyle["/"]};return}let explode=uriParam.modifier?.type==="explode";if(uriParam.operator==="?"||uriParam.operator==="&")return{type:"query",name:uriParam.name,explode};else if(uriParam.operator==="+")return{type:"path",name:uriParam.name,explode,allowReserved:!0,style:"simple"};else return{type:"path",name:uriParam.name,explode,allowReserved:!1,style:(uriParam.operator&&operatorToStyle[uriParam.operator])??"simple"}}}));for(let item of metadata)switch(item.kind){case"contentType":parameters.push({name:"Content-Type",type:"header",param:item.property});break;case"path":case"query":case"cookie":case"header":parameters.push({type:item.kind,...item.options,param:item.property});break}let body=resolvedBody;return diagnostics.wrap({properties:metadata,parameters,verb,body,get bodyType(){return body?.type},get bodyParameter(){return body?.property}})}var AllowedSegmentSeparators=["/",":","?"];function needsSlashPrefix(fragment){return!(fragment.length===0||AllowedSegmentSeparators.indexOf(fragment[0])!==-1||fragment[0]==="{"&&fragment[1]==="/")}function normalizeFragment(fragment,trimLast=!1){if(needsSlashPrefix(fragment))fragment=`/${fragment}`;if(trimLast&&fragment[fragment.length-1]==="/")return fragment.slice(0,-1);return fragment}function joinPathSegments(rest){let current="";for(let[index,segment]of rest.entries())current+=normalizeFragment(segment,index<rest.length-1);return current}function buildPath(pathFragments){let path=pathFragments.length===0?"/":joinPathSegments(pathFragments);return AllowedSegmentSeparators.includes(path[0])||path[0]==="{"&&path[1]==="/"?path:`/${path}`}function resolvePathAndParameters(program,operation,overloadBase,options){let diagnostics=createDiagnosticCollector(),{uriTemplate,parameters}=diagnostics.pipe(getUriTemplateAndParameters(program,operation,overloadBase,options)),parsedUriTemplate=parseUriTemplate(uriTemplate),paramByName=new Set(parameters.parameters.filter(({type})=>type==="path"||type==="query").map((x)=>x.name));validateDoubleSlash(parsedUriTemplate,operation,parameters).forEach((d)=>diagnostics.add(d));for(let routeParam of parsedUriTemplate.parameters){let decoded=decodeURIComponent(routeParam.name);if(!paramByName.has(routeParam.name)&&!paramByName.has(decoded))diagnostics.add(createDiagnostic5({code:"missing-uri-param",format:{param:routeParam.name},target:operation}))}let path=produceLegacyPathFromUriTemplate(parsedUriTemplate);return diagnostics.wrap({uriTemplate,path,parameters})}function validateDoubleSlash(parsedUriTemplate,operation,parameters){let diagnostics=createDiagnosticCollector();if(parsedUriTemplate.segments){let[firstSeg,...rest]=parsedUriTemplate.segments,lastSeg=firstSeg;for(let seg of rest)if(typeof seg!=="string"){let parameter=parameters.parameters.find((x)=>x.name===seg.name);if(seg.operator==="/"){if(typeof lastSeg==="string"&&lastSeg.endsWith("/"))diagnostics.add(createDiagnostic5({code:"double-slash",messageId:parameter?.param.optional?"optionalUnset":"default",format:{paramName:seg.name},target:operation}))}lastSeg=seg}}return diagnostics.diagnostics}function produceLegacyPathFromUriTemplate(uriTemplate){let result="";for(let segment of uriTemplate.segments??[])if(typeof segment==="string")result+=segment;else if(segment.operator!=="?"&&segment.operator!=="&")result+=`{${segment.name}}`;return result}function collectSegmentsAndOptions(program,source){if(source===void 0)return[[],{}];let[parentSegments,parentOptions]=collectSegmentsAndOptions(program,source.namespace),route=getRoutePath(program,source)?.path,options=source.kind==="Namespace"?getRouteOptionsForNamespace(program,source)??{}:{};return[[...parentSegments,...route?[route]:[]],{...parentOptions,...options}]}function getUriTemplateAndParameters(program,operation,overloadBase,options){let[parentSegments,parentOptions]=collectSegmentsAndOptions(program,operation.interface??operation.namespace),routeProducer=getRouteProducer(program,operation)??DefaultRouteProducer,[result,diagnostics]=routeProducer(program,operation,parentSegments,overloadBase,{...parentOptions,...options});return[{uriTemplate:buildPath([result.uriTemplate]),parameters:result.parameters},diagnostics]}function DefaultRouteProducer(program,operation,parentSegments,overloadBase,options){let diagnostics=createDiagnosticCollector(),routePath=getRoutePath(program,operation)?.path,uriTemplate=!routePath&&overloadBase?overloadBase.uriTemplate:joinPathSegments([...parentSegments,...routePath?[routePath]:[]]),parsedUriTemplate=parseUriTemplate(uriTemplate),parameters=diagnostics.pipe(getOperationParameters(program,operation,uriTemplate,overloadBase,options.paramOptions)),unreferencedPathParamNames=new Map(parameters.parameters.filter(({type})=>type==="path"||type==="query").map((x)=>[x.name,x]));for(let uriParam of parsedUriTemplate.parameters)unreferencedPathParamNames.delete(uriParam.name);let resolvedUriTemplate=addOperationTemplateToUriTemplate(uriTemplate,[...unreferencedPathParamNames.values()]);return diagnostics.wrap({uriTemplate:resolvedUriTemplate,parameters})}var styleToOperator={matrix:";",label:".",simple:"",path:"/",fragment:"#"};function getUriTemplatePathParam(param){return`{${param.param.optional?"/":param.allowReserved?"+":styleToOperator[param.style]}${param.name}${param.explode?"*":""}}`}function getUriTemplateQueryParamPart(param){return`${escapeUriTemplateParamName(param.name)}${param.explode?"*":""}`}function addQueryParamsToUriTemplate(uriTemplate,params){let queryParams=params.filter((x)=>x.type==="query");return uriTemplate+(queryParams.length>0?`{?${queryParams.map((x)=>getUriTemplateQueryParamPart(x)).join(",")}}`:"")}function addOperationTemplateToUriTemplate(uriTemplate,params){let pathParams=params.filter((x)=>x.type==="path").map(getUriTemplatePathParam),queryParams=params.filter((x)=>x.type==="query"),pathPart=joinPathSegments([uriTemplate,...pathParams]);return addQueryParamsToUriTemplate(pathPart,queryParams)}function escapeUriTemplateParamName(name){return encodeURIComponent(name).replace(/[:-]/g,function(c){return"%"+c.charCodeAt(0).toString(16).toUpperCase()})}function getRouteProducer(program,operation){return program.stateMap(HttpStateKeys.routeProducer).get(operation)}function getRouteOptionsForNamespace(program,namespace){return program.stateMap(HttpStateKeys.routeOptions).get(namespace)}function getRoutePath(program,entity){let path=program.stateMap(HttpStateKeys.routes).get(entity);return path?{path,shared:entity.kind==="Operation"&&isSharedRoute(program,entity)}:void 0}var opReferenceContainerRouteRule=createLinterRule({name:"op-reference-container-route",severity:"warning",description:"Check for referenced (`op is`) operations which have a @route on one of their containers.",url:"https://typespec.io/docs/libraries/http/rules/op-reference-container-route",docs:fileRef.fromPackageRoot("src/rules/op-reference-container-route.md"),messages:{default:paramMessage`Operation ${"opName"} references an operation which has a @route prefix on its namespace or interface: "${"routePrefix"}".  This operation will not carry forward the route prefix so the final route may be different than the referenced operation.`},create(context){let checkedOps=new Map;function getContainerRoutePrefix(container){if(container===void 0)return;if(container.kind==="Operation")return getContainerRoutePrefix(container.interface)??getContainerRoutePrefix(container.namespace);let route=getRoutePath(context.program,container);return route?route.path:getContainerRoutePrefix(container.namespace)}function checkOperationReferences(op,originalOp){if(op!==void 0){let container=op.interface??op.namespace,originalContainer=originalOp.interface??originalOp.namespace;if(container!==originalContainer){let route=checkedOps.get(op);if(route===void 0)route=getContainerRoutePrefix(op),checkedOps.set(op,route);if(route){context.reportDiagnostic({target:originalOp,format:{opName:originalOp.name,routePrefix:route}});return}}checkOperationReferences(op.sourceOperation,originalOp)}}return{operation:(op)=>{checkOperationReferences(op.sourceOperation,op)}}}});var $linter=defineLinter({rules:[opReferenceContainerRouteRule]});function useCache(program,key,type,compute){let stage=program.currentStage;if(stage!=="validating"&&stage!=="linting"&&stage!=="emitting")return compute();if(!type.isFinished)return compute();let map=program.stateMap(key),existing=map.get(type);if(existing!==void 0)return existing;let value=compute();return map.set(type,value),value}function getResponsesForOperation(program,operation){let diagnostics=createDiagnosticCollector(),responses=new ResponseIndex,variants=resolveResponseVariants(program,operation.returnType);for(let{type,description}of variants)processResponseType(program,diagnostics,operation,responses,type,description);return diagnostics.wrap(responses.values())}function resolveResponseVariants(program,responseType,parentDescription){let tk=$(program);if(!tk.union.is(responseType)||tk.union.getDiscriminatedUnion(responseType))return[{type:responseType,description:parentDescription}];let unionDescription=getDoc(program,responseType)??parentDescription,plainVariants=[],responseEnvelopes=[];for(let option of responseType.variants.values()){if(isNullType(option.type))continue;let resolved=resolveResponseVariants(program,option.type,getDoc(program,option)??unionDescription);for(let variant of resolved)if(isPlainResponseBody(program,variant.type))plainVariants.push(variant.type);else responseEnvelopes.push(variant)}let results=[];if(plainVariants.length===1)results.push({type:plainVariants[0],description:unionDescription});else if(plainVariants.length>1){let unionType=responseEnvelopes.length===0?responseType:tk.union.create(plainVariants);results.push({type:unionType,description:unionDescription})}return results.push(...responseEnvelopes),results}class ResponseIndex{#index=new Map;get(statusCode){return this.#index.get(this.#indexKey(statusCode))}set(statusCode,response){this.#index.set(this.#indexKey(statusCode),response)}values(){return[...this.#index.values()]}#indexKey(statusCode){if(typeof statusCode==="number"||statusCode==="*")return String(statusCode);else return`${statusCode.start}-${statusCode.end}`}}function processResponseType(program,diagnostics,operation,responses,responseType,parentDescription){let verb=getOperationVerb(program,operation),{body:resolvedBody,metadata}=diagnostics.pipe(resolveHttpPayload(program,responseType,Visibility.Read,HttpPayloadDisposition.Response,{treatContentTypeAsHeader:verb==="head"})),statusCodes=diagnostics.pipe(getResponseStatusCodes(program,responseType,metadata)),headers=getResponseHeaders(program,metadata);if(statusCodes.length===0)if(isErrorModel(program,responseType))statusCodes.push("*");else if(isVoidType(responseType))resolvedBody=void 0,statusCodes.push(204);else if(resolvedBody===void 0||isVoidType(resolvedBody.type))resolvedBody=void 0,statusCodes.push(200);else statusCodes.push(200);for(let statusCode of statusCodes){let response=responses.get(statusCode)??{statusCodes:statusCode,type:responseType,description:getResponseDescription(program,operation,responseType,statusCode,metadata,parentDescription),responses:[]};if(resolvedBody!==void 0)response.responses.push({body:resolvedBody,headers,properties:metadata});else response.responses.push({headers,properties:metadata});responses.set(statusCode,response)}}function getResponseStatusCodes(program,responseType,metadata){let codes=[],diagnostics=createDiagnosticCollector(),statusFound=!1;for(let prop of metadata)if(prop.kind==="statusCode"){if(statusFound)reportDiagnostic7(program,{code:"multiple-status-codes",target:responseType});statusFound=!0,codes.push(...diagnostics.pipe(getStatusCodesWithDiagnostics(program,prop.property)))}if(responseType.kind==="Model")for(let t=responseType;t;t=t.baseModel)codes.push(...getExplicitSetStatusCode(program,t));return diagnostics.wrap(codes)}function getExplicitSetStatusCode(program,entity){return program.stateMap(HttpStateKeys.statusCode).get(entity)??[]}function getResponseHeaders(program,metadata){let responseHeaders={};for(let prop of metadata)if(prop.kind==="header")responseHeaders[prop.options.name]=prop.property;return responseHeaders}function isResponseEnvelope(metadata){return metadata.some((prop)=>prop.kind==="body"||prop.kind==="bodyRoot"||prop.kind==="multipartBody"||prop.kind==="statusCode")}function isPlainResponseBody(program,type){if(isVoidType(type)||isErrorModel(program,type))return!1;if(type.kind==="Model"&&getExplicitSetStatusCode(program,type).length>0)return!1;let[result]=resolveHttpPayload(program,type,Visibility.Read,HttpPayloadDisposition.Response);return!result||!result.metadata.some((p)=>p.kind!=="bodyProperty")}function getResponseDescription(program,operation,responseType,statusCode,metadata,parentDescription){if(parentDescription)return parentDescription;if(isResponseEnvelope(metadata)){let desc=getDoc(program,responseType);if(desc)return desc}let desc=isErrorModel(program,responseType)?getErrorsDoc(program,operation):getReturnsDoc(program,operation);if(desc)return desc;return getStatusCodeDescription(statusCode)}var httpOperationCacheKey=Symbol.for("@typespec/http.httpOperationCache");function getHttpOperation(program,operation,options){if(!options)return useCache(program,httpOperationCacheKey,operation,()=>getHttpOperationInternal(program,operation,options,new Map));return getHttpOperationInternal(program,operation,options,new Map)}function getHttpOperationInternal(program,operation,options,cache){let existing=cache.get(operation);if(existing)return[existing,[]];let diagnostics=createDiagnosticCollector(),httpOperationRef={operation};cache.set(operation,httpOperationRef);let overloadBase=getOverloadedOperation(program,operation),overloading;if(overloadBase)overloading=httpOperationRef.overloading=diagnostics.pipe(getHttpOperationInternal(program,overloadBase,options,cache));let route=diagnostics.pipe(resolvePathAndParameters(program,operation,overloading,options??{})),responses=diagnostics.pipe(getResponsesForOperation(program,operation)),authentication=getAuthenticationForOperation(program,operation),httpOperation={path:route.path,uriTemplate:route.uriTemplate,verb:route.parameters.verb,container:operation.interface??operation.namespace??program.getGlobalNamespaceType(),parameters:route.parameters,responses,operation,authentication};Object.assign(httpOperationRef,httpOperation);let overloads=getOverloads(program,operation);if(overloads)httpOperationRef.overloads=overloads.map((x)=>diagnostics.pipe(getHttpOperationInternal(program,x,options,cache)));return diagnostics.wrap(httpOperationRef)}var $provideTypeInfo=defineTypeInfoProvider(({program,target})=>{if(target.kind!=="Operation")return;let[operation]=getHttpOperation(program,target);if(!operation)return;let lines=[`\`HTTP Route\`: \`${operation.verb.toUpperCase()} ${operation.uriTemplate}\``],statusCodes=operation.responses.map((response)=>formatStatusCode(response.statusCodes));if(statusCodes.length>0)lines.push(`\`Responses\`: ${statusCodes.map((code)=>`\`${code}\``).join(", ")}`);return{content:lines.join(`

`)}});function formatStatusCode(statusCode){if(statusCode==="*")return"*";if(typeof statusCode==="number")return String(statusCode);return`${statusCode.start}-${statusCode.end}`}var $lib7=createTypeSpecLibrary({name:"@typespec/versioning",diagnostics:{"versioned-dependency-tuple":{severity:"error",messages:{default:"Versioned dependency mapping must be a tuple [SourceVersion, TargetVersion]."}},"versioned-dependency-tuple-enum-member":{severity:"error",messages:{default:"Versioned dependency mapping must be between enum members."}},"versioned-dependency-same-namespace":{severity:"error",messages:{default:"Versioned dependency mapping must all point to the same namespace but 2 versions have different namespaces 'namespace1' and 'namespace2'."}},"versioned-dependency-not-picked":{severity:"error",messages:{default:paramMessage`The versionedDependency decorator must provide a version of the dependency '${"dependency"}'.`}},"version-not-found":{severity:"error",messages:{default:paramMessage`The provided version '${"version"}' from '${"enumName"}' is not declared as a version enum. Use '@versioned(${"enumName"})' on the containing namespace.`}},"version-duplicate":{severity:"error",messages:{default:paramMessage`Multiple versions from '${"name"}' resolve to the same value. Version enums must resolve to unique values.`}},"invalid-renamed-from-value":{severity:"error",messages:{default:"@renamedFrom.oldName cannot be empty string."}},"incompatible-versioned-reference":{severity:"error",messages:{default:paramMessage`'${"sourceName"}' is referencing versioned type '${"targetName"}' but is not versioned itself.`,addedAfter:paramMessage`'${"sourceName"}' was added in version '${"sourceAddedOn"}' but referencing type '${"targetName"}' added in version '${"targetAddedOn"}'.`,dependentAddedAfter:paramMessage`'${"sourceName"}' was added in version '${"sourceAddedOn"}' but contains type '${"targetName"}' added in version '${"targetAddedOn"}'.`,removedBefore:paramMessage`'${"sourceName"}' was removed in version '${"sourceRemovedOn"}' but referencing type '${"targetName"}' removed in version '${"targetRemovedOn"}'.`,dependentRemovedBefore:paramMessage`'${"sourceName"}' was removed in version '${"sourceRemovedOn"}' but contains type '${"targetName"}' removed in version '${"targetRemovedOn"}'.`,versionedDependencyAddedAfter:paramMessage`'${"sourceName"}' is referencing type '${"targetName"}' added in version '${"targetAddedOn"}' but version used is '${"dependencyVersion"}'.`,versionedDependencyRemovedBefore:paramMessage`'${"sourceName"}' is referencing type '${"targetName"}' removed in version '${"targetAddedOn"}' but version used is '${"dependencyVersion"}'.`,doesNotExist:paramMessage`'${"sourceName"}' is referencing type '${"targetName"}' which does not exist in version '${"version"}'.`}},"incompatible-versioned-namespace-use-dependency":{severity:"error",messages:{default:"The useDependency decorator can only be used on a Namespace if the namespace is unversioned. For versioned namespaces, put the useDependency decorator on the version enum members."}},"made-optional-not-optional":{severity:"error",messages:{default:paramMessage`Property '${"name"}' marked with @madeOptional but is required. Should be '${"name"}?'`}},"made-required-optional":{severity:"error",messages:{default:paramMessage`Property '${"name"}?' marked with @madeRequired but is optional. Should be '${"name"}'`}},"renamed-duplicate-property":{severity:"error",messages:{default:paramMessage`Property '${"name"}' marked with '@renamedFrom' conflicts with existing property in version ${"version"}.`}}},state:{versionIndex:{description:"Version index"},addedOn:{description:"State for @addedOn decorator"},removedOn:{description:"State for @removedOn decorator"},versions:{description:"State for @versioned decorator"},useDependencyNamespace:{description:"State for @useDependency decorator on Namespaces"},useDependencyEnum:{description:"State for @useDependency decorator on Enums"},renamedFrom:{description:"State for @renamedFrom decorator"},madeOptional:{description:"State for @madeOptional decorator"},madeRequired:{description:"State for @madeRequired decorator"},typeChangedFrom:{description:"State for @typeChangedFrom decorator"},returnTypeChangedFrom:{description:"State for @returnTypeChangedFrom decorator"}}}),{reportDiagnostic:reportDiagnostic8,createStateSymbol:createStateSymbol3,stateKeys:VersioningStateKeys}=$lib7;var Availability;(function(Availability){Availability.Unavailable="Unavailable",Availability.Added="Added",Availability.Available="Available",Availability.Removed="Removed"})(Availability||(Availability={}));var $lib8=createTypeSpecLibrary({name:"@typespec/rest",diagnostics:{"not-key-type":{severity:"error",messages:{default:"Cannot copy keys from a non-key type (KeysOf<T> or ParentKeysOf<T>)"}},"resource-missing-key":{severity:"error",messages:{default:paramMessage`Type '${"modelName"}' is used as a resource and therefore must have a key. Use @key to designate a property as the key.`}},"resource-missing-error":{severity:"error",messages:{default:paramMessage`Type '${"modelName"}' is used as an error and therefore must have the @error decorator applied.`}},"duplicate-key":{severity:"error",messages:{default:paramMessage`More than one key found on model type ${"resourceName"}`}},"duplicate-parent-key":{severity:"error",messages:{default:paramMessage`Resource type '${"resourceName"}' has a key property named '${"keyName"}' which conflicts with the key name of a parent or child resource.`}},"invalid-action-name":{severity:"error",messages:{default:"Action name cannot be empty string."}},"shared-route-unspecified-action-name":{severity:"error",messages:{default:paramMessage`An operation marked as '@sharedRoute' must have an explicit collection action name passed to '${"decoratorName"}'.`}},"circular-parent-resource":{severity:"error",messages:{default:paramMessage`Resource has a parent cycle (${"cycle"})`}}}}),{reportDiagnostic:reportDiagnostic9,createDiagnostic:createDiagnostic6,createStateSymbol:createStateSymbol4}=$lib8;var resourceKeysKey=createStateSymbol4("resourceKeys"),resourceTypeForKeyParamKey=createStateSymbol4("resourceTypeForKeyParam");function $resourceTypeForKeyParam(context,entity,resourceType){context.program.stateMap(resourceTypeForKeyParamKey).set(entity,resourceType)}setTypeSpecNamespace("Private",$resourceTypeForKeyParam);var[getParentResource,setParentResource]=useStateMap(createStateSymbol4("parentResourceTypes"));var getStreamOf2;try{getStreamOf2=(await (__preload("bfejaf54"),import("./chunk-bfejaf54.js"))).getStreamOf}catch{getStreamOf2=()=>{throw Error("@typespec/streams was not found")}}var autoRouteKey=createStateSymbol4("autoRoute");var segmentsKey=createStateSymbol4("segments");var actionSeparatorKey=createStateSymbol4("actionSeparator");var resourceOperationsKey=createStateSymbol4("resourceOperations");var actionsSegmentKey=createStateSymbol4("actionSegment"),$actionSegment=(context,entity,name)=>{context.program.stateMap(actionsSegmentKey).set(entity,name)};function getActionSegment(program,entity){return program.stateMap(actionsSegmentKey).get(entity)}var actionsKey=createStateSymbol4("actions");var collectionActionsKey=createStateSymbol4("collectionActions");var resourceLocationsKey=createStateSymbol4("resourceLocations"),$resourceLocation=(context,entity,resourceType)=>{if(resourceType.kind==="TemplateParameter")return;context.program.stateMap(resourceLocationsKey).set(entity,resourceType)};setTypeSpecNamespace("Private",$resourceLocation,$actionSegment,getActionSegment);var validatedMissingKey=createStateSymbol4("validatedMissing");var validatedErrorKey=createStateSymbol4("validatedError");var $lib9=createTypeSpecLibrary({name:"@typespec/openapi",diagnostics:{"invalid-extension-key":{severity:"error",messages:{default:paramMessage`OpenAPI extension must start with 'x-' but was '${"value"}'`}},"duplicate-type-name":{severity:"error",messages:{default:paramMessage`Duplicate type name: '${"value"}'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.`,parameter:paramMessage`Duplicate parameter key: '${"value"}'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.`}},"not-url":{severity:"error",messages:{default:paramMessage`${"property"}: ${"value"} is not a valid URL.`}},"duplicate-tag":{severity:"error",messages:{default:paramMessage`"Metadata for tag '${"tagName"}' was specified twice."`}},"mixed-tag-metadata-form":{severity:"error",messages:{default:'Cannot mix the array form and the inline form of @tagMetadata on the same namespace. Use either @tagMetadata(#[...]) or multiple @tagMetadata("name", #{...}) calls, not both.'}},"tag-metadata-array-with-metadata-arg":{severity:"error",messages:{default:"When using the array form of @tagMetadata, the second argument (tagMetadata) must not be provided. Include all tag metadata inside the array elements."}},"tag-metadata-target-service":{severity:"error",messages:{default:paramMessage`@tagMetadata must be used on the service namespace. Did you mean to annotate '${"namespace"}'  with '@service'?`}},"default-response-with-status-code":{severity:"warning",messages:{statusCode:"@defaultResponse should not be used on a model that already has a status code defined. The status code will be ignored in favor of the default response.",error:"@defaultResponse should not be used on a model that is marked with @error. Use either @defaultResponse or @error, not both."}},"license-url-identifier-conflict":{severity:"error",messages:{default:"License 'url' and 'identifier' are mutually exclusive. Specify only one of them."}}},state:{tagsMetadata:{description:"State for the @tagMetadata decorator."}}}),{createDiagnostic:createDiagnostic7,reportDiagnostic:reportDiagnostic10,createStateSymbol:createStateSymbol5,stateKeys:OpenAPIKeys}=$lib9;var[getOperationId,setOperationId]=useStateMap(createStateSymbol5("operationIds"));var openApiExtensionKey=createStateSymbol5("openApiExtension");var defaultResponseKey=createStateSymbol5("defaultResponse");var externalDocsKey=createStateSymbol5("externalDocs");var infoKey=createStateSymbol5("info");var[getTagsMetadata,setTagsMetadata]=useStateMap(OpenAPIKeys.tagsMetadata),[isTagsMetadataArrayFormUsed,setTagsMetadataArrayFormUsed]=useStateSet(createStateSymbol5("tagsMetadataArrayForm"));var libraries_default={"@typespec/http":{version:"1.16.0",files:{"package.json":`{
  "name": "@typespec/http",
  "version": "1.16.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec HTTP protocol binding",
  "homepage": "https://github.com/microsoft/typespec",
  "docusaurusWebsite": "https://typespec.io/docs",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    },
    "./streams": {
      "typespec": "./lib/streams/main.tsp",
      "types": "./dist/src/streams/index.d.ts",
      "default": "./dist/src/streams/index.js"
    },
    "./experimental": {
      "types": "./dist/src/experimental/index.d.ts",
      "default": "./dist/src/experimental/index.js"
    },
    "./experimental/typekit": {
      "types": "./dist/src/experimental/typekit/index.d.ts",
      "default": "./dist/src/experimental/typekit/index.js"
    },
    "./experimental/merge-patch": {
      "import": "./dist/src/experimental/merge-patch/index.js"
    }
  },
  "imports": {
    "#test/*": "./test/*"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/**/*.tsp",
    "tspconfig.yaml",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0",
    "@typespec/streams": "^0.86.0"
  },
  "peerDependenciesMeta": {
    "@typespec/streams": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/streams": "^0.86.0",
    "@typespec/tspd": "^0.77.1",
    "@typespec/compiler": "^1.16.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "api-extractor": "api-extractor run --local --verbose",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --typekits --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/http/reference --rules-dir ../rules"
  }
}`,"lib/auth.tsp":`namespace TypeSpec.Http;

@doc("Authentication type")
enum AuthType {
  @doc("HTTP")
  http,

  @doc("API key")
  apiKey,

  @doc("OAuth2")
  oauth2,

  @doc("OpenID connect")
  openIdConnect,

  @doc("Empty auth")
  noAuth,
}

/**
 * Basic authentication is a simple authentication scheme built into the HTTP protocol.
 * The client sends HTTP requests with the Authorization header that contains the word Basic word followed by a space and a base64-encoded string username:password.
 * For example, to authorize as demo / \`p@55w0rd\` the client would send
 * \`\`\`
 * Authorization: Basic ZGVtbzpwQDU1dzByZA==
 * \`\`\`
 */
@doc("")
model BasicAuth {
  @doc("Http authentication")
  type: AuthType.http;

  @doc("basic auth scheme")
  scheme: "Basic";
}

/**
 * Bearer authentication (also called token authentication) is an HTTP authentication scheme that involves security tokens called bearer tokens.
 * The name “Bearer authentication” can be understood as “give access to the bearer of this token.” The bearer token is a cryptic string, usually generated by the server in response to a login request.
 * The client must send this token in the Authorization header when making requests to protected resources:
 * \`\`\`
 * Authorization: Bearer <token>
 * \`\`\`
 */
@doc("")
model BearerAuth {
  @doc("Http authentication")
  type: AuthType.http;

  @doc("bearer auth scheme")
  scheme: "Bearer";
}

@doc("Describes the location of the API key")
enum ApiKeyLocation {
  @doc("API key is a header value")
  header,

  @doc("API key is a query parameter")
  query,

  @doc("API key is found in a cookie")
  cookie,
}

/**
 * An API key is a token that a client provides when making API calls. The key can be sent in the query string:
 *
 * \`\`\`
 * GET /something?api_key=abcdef12345
 * \`\`\`
 *
 * or as a request header
 *
 * \`\`\`
 * GET /something HTTP/1.1
 * X-API-Key: abcdef12345
 * \`\`\`
 *
 * or as a cookie
 *
 * \`\`\`
 * GET /something HTTP/1.1
 * Cookie: X-API-KEY=abcdef12345
 * \`\`\`
 *
 * @template Location The location of the API key
 * @template Name The name of the API key
 */
@doc("")
model ApiKeyAuth<Location extends ApiKeyLocation, Name extends string> {
  @doc("API key authentication")
  type: AuthType.apiKey;

  @doc("location of the API key")
  in: Location;

  @doc("name of the API key")
  name: Name;
}

/**
 * OAuth 2.0 is an authorization protocol that gives an API client limited access to user data on a web server.
 *
 * OAuth relies on authentication scenarios called flows, which allow the resource owner (user) to share the protected content from the resource server without sharing their credentials.
 * For that purpose, an OAuth 2.0 server issues access tokens that the client applications can use to access protected resources on behalf of the resource owner.
 * For more information about OAuth 2.0, see oauth.net and RFC 6749.
 *
 * @template Flows The list of supported OAuth2 flows
 * @template Scopes The list of OAuth2 scopes, which are common for every flow from \`Flows\`. This list is combined with the scopes defined in specific OAuth2 flows.
 */
@doc("")
model OAuth2Auth<Flows extends OAuth2Flow[], Scopes extends string[] = []> {
  @doc("OAuth2 authentication")
  type: AuthType.oauth2;

  @doc("Supported OAuth2 flows")
  flows: Flows;

  @doc("Oauth2 scopes of every flow. Overridden by scope definitions in specific flows")
  defaultScopes: Scopes;
}

@doc("Describes the OAuth2 flow type")
enum OAuth2FlowType {
  @doc("authorization code flow")
  authorizationCode,

  @doc("implicit flow")
  implicit,

  @doc("password flow")
  password,

  @doc("client credential flow")
  clientCredentials,
}

alias OAuth2Flow = AuthorizationCodeFlow | ImplicitFlow | PasswordFlow | ClientCredentialsFlow;

@doc("Authorization Code flow")
model AuthorizationCodeFlow {
  @doc("authorization code flow")
  type: OAuth2FlowType.authorizationCode;

  @doc("the authorization URL")
  authorizationUrl: string;

  @doc("the token URL")
  tokenUrl: string;

  @doc("the refresh URL")
  refreshUrl?: string;

  @doc("list of scopes for the credential")
  scopes?: string[];
}

@doc("Implicit flow")
model ImplicitFlow {
  @doc("implicit flow")
  type: OAuth2FlowType.implicit;

  @doc("the authorization URL")
  authorizationUrl: string;

  @doc("the refresh URL")
  refreshUrl?: string;

  @doc("list of scopes for the credential")
  scopes?: string[];
}

@doc("Resource Owner Password flow")
model PasswordFlow {
  @doc("password flow")
  type: OAuth2FlowType.password;

  @doc("the token URL")
  tokenUrl: string;

  @doc("the refresh URL")
  refreshUrl?: string;

  @doc("list of scopes for the credential")
  scopes?: string[];
}

@doc("Client credentials flow")
model ClientCredentialsFlow {
  @doc("client credential flow")
  type: OAuth2FlowType.clientCredentials;

  @doc("the token URL")
  tokenUrl: string;

  @doc("the refresh URL")
  refreshUrl?: string;

  @doc("list of scopes for the credential")
  scopes?: string[];
}

/**
 * OpenID Connect (OIDC) is an identity layer built on top of the OAuth 2.0 protocol and supported by some OAuth 2.0 providers, such as Google and Azure Active Directory.
 * It defines a sign-in flow that enables a client application to authenticate a user, and to obtain information (or "claims") about that user, such as the user name, email, and so on.
 * User identity information is encoded in a secure JSON Web Token (JWT), called ID token.
 * OpenID Connect defines a discovery mechanism, called OpenID Connect Discovery, where an OpenID server publishes its metadata at a well-known URL, typically
 *
 * \`\`\`http
 * https://server.com/.well-known/openid-configuration
 * \`\`\`
 *
 * @template ConnectUrl The openIdConnectUrl, where the OpenID provider publishes its discovery metadata. It can be specified relative to the server URL.
 * @template Scopes The scope names required for operations that use this scheme.
 */
model OpenIdConnectAuth<ConnectUrl extends string, Scopes extends string[] = []> {
  /** Auth type */
  type: AuthType.openIdConnect;

  /** Connect url. It can be specified relative to the server URL */
  openIdConnectUrl: ConnectUrl;

  /** Scope names required for operations that use this authentication scheme. */
  scopes: Scopes;
}

/**
 * This authentication option signifies that API is not secured at all.
 * It might be useful when overriding authentication on interface of operation level.
 */
@doc("")
model NoAuth {
  /** No authentication. */
  type: AuthType.noAuth;
}
`,"lib/decorators.tsp":`namespace TypeSpec.Http;

using TypeSpec.Reflection;

/**
 * Header options.
 */
model HeaderOptions {
  /**
   * Name of the header when sent over HTTP.
   */
  name?: string;

  /**
   * Equivalent of adding \`*\` in the path parameter as per [RFC-6570](https://datatracker.ietf.org/doc/html/rfc6570#section-3.2.3)
   *
   *  | Style  | Explode | Primitive value = 5 | Array = [3, 4, 5] | Object = {"role": "admin", "firstName": "Alex"} |
   *  | ------ | ------- | ------------------- | ----------------- | ----------------------------------------------- |
   *  | simple | false   | \`5   \`              | \`3,4,5\`           | \`role,admin,firstName,Alex\`                     |
   *  | simple | true    | \`5\`                 | \`3,4,5\`           | \`role=admin,firstName=Alex\`                     |
   *
   */
  explode?: boolean;
}

/**
 * Specify this property is to be sent or received as an HTTP header.
 *
 * @param headerNameOrOptions Optional name of the header when sent over HTTP or header options.
 *  By default the header name will be the property name converted from camelCase to kebab-case. (e.g. \`contentType\` -> \`content-type\`)
 *
 * @example
 *
 * \`\`\`typespec
 * op read(@header accept: string): {@header("ETag") eTag: string};
 * op create(@header({name: "X-Color", format: "csv"}) colors: string[]): void;
 * \`\`\`
 *
 * @example Implicit header name
 *
 * \`\`\`typespec
 * op read(): {@header contentType: string}; // headerName: content-type
 * op update(@header ifMatch: string): void; // headerName: if-match
 * \`\`\`
 */
extern dec header(target: ModelProperty, headerNameOrOptions?: valueof string | HeaderOptions);

/**
 * Cookie Options.
 */
model CookieOptions {
  /**
   * Name in the cookie.
   */
  name?: string;
}

/**
 * Specify this property is to be sent or received in the cookie.
 *
 * @param cookieNameOrOptions Optional name of the cookie in the cookie or cookie options.
 *  By default the cookie name will be the property name converted from camelCase to snake_case. (e.g. \`authToken\` -> \`auth_token\`)
 *
 * @example
 *
 * \`\`\`typespec
 * op read(@cookie token: string): {data: string[]};
 * op create(@cookie({name: "auth_token"}) data: string[]): void;
 * \`\`\`
 *
 * @example Implicit header name
 *
 * \`\`\`typespec
 * op read(): {@cookie authToken: string}; // headerName: auth_token
 * op update(@cookie AuthToken: string): void; // headerName: auth_token
 * \`\`\`
 */
extern dec cookie(target: ModelProperty, cookieNameOrOptions?: valueof string | CookieOptions);

/**
 * Query parameter options.
 */
model QueryOptions {
  /**
   * Name of the query when included in the url.
   */
  name?: string;

  /**
   * If true send each value in the array/object as a separate query parameter.
   * Equivalent of adding \`*\` in the path parameter as per [RFC-6570](https://datatracker.ietf.org/doc/html/rfc6570#section-3.2.3)
   *
   *  | Style  | Explode | Uri Template   | Primitive value id = 5 | Array id = [3, 4, 5]    | Object id = {"role": "admin", "firstName": "Alex"} |
   *  | ------ | ------- | -------------- | ---------------------- | ----------------------- | -------------------------------------------------- |
   *  | simple | false   | \`/users{?id}\`  | \`/users?id=5\`          | \`/users?id=3,4,5\`       | \`/users?id=role,admin,firstName,Alex\`              |
   *  | simple | true    | \`/users{?id*}\` | \`/users?id=5\`          | \`/users?id=3&id=4&id=5\` | \`/users?role=admin&firstName=Alex\`                 |
   *
   */
  explode?: boolean;
}

/**
 * Specify this property is to be sent as a query parameter.
 *
 * @param queryNameOrOptions Optional name of the query when included in the url or query parameter options.
 *
 * @example
 *
 * \`\`\`typespec
 * op read(@query select: string, @query("order-by") orderBy: string): void;
 * op list(@query(#{name: "id", explode: true}) ids: string[]): void;
 * \`\`\`
 */
extern dec query(target: ModelProperty, queryNameOrOptions?: valueof string | QueryOptions);

/**
 * Options for configuring how a path parameter is serialized into the URI template.
 */
model PathOptions {
  /** Name of the parameter in the URI template. */
  name?: string;

  /**
   * When interpolating this parameter in the case of array or object expand each value using the given style.
   * Equivalent of adding \`*\` in the path parameter as per [RFC-6570](https://datatracker.ietf.org/doc/html/rfc6570#section-3.2.3)
   */
  explode?: boolean;

  /**
   * Different interpolating styles for the path parameter.
   * - \`simple\`: No special encoding.
   * - \`label\`: Using \`.\` separator.
   * - \`matrix\`: \`;\` as separator.
   * - \`fragment\`: \`#\` as separator.
   * - \`path\`: \`/\` as separator.
   */
  style?: "simple" | "label" | "matrix" | "fragment" | "path";

  /**
   * When interpolating this parameter do not encode reserved characters.
   * Equivalent of adding \`+\` in the path parameter as per [RFC-6570](https://datatracker.ietf.org/doc/html/rfc6570#section-3.2.3)
   */
  allowReserved?: boolean;
}

/**
 * Explicitly specify that this property is to be interpolated as a path parameter.
 *
 * @param paramNameOrOptions Optional name of the parameter in the URI template or options.
 *
 * @example
 *
 * \`\`\`typespec
 * @route("/read/{explicit}/things/{implicit}")
 * op read(@path explicit: string, implicit: string): void;
 * \`\`\`
 */
extern dec path(target: ModelProperty, paramNameOrOptions?: valueof string | PathOptions);

/**
 * Explicitly specify that this property type will be exactly the HTTP body.
 *
 * This means that any properties under \`@body\` cannot be marked as headers, query parameters, or path parameters.
 * If wanting to change the resolution of the body but still mix parameters, use \`@bodyRoot\`.
 *
 * @example
 *
 * \`\`\`typespec
 * op upload(@body image: bytes): void;
 * op download(): {@body image: bytes};
 * \`\`\`
 */
extern dec body(target: ModelProperty);

/**
 * Specify that the body resolution should be resolved from that property.
 * By default the body is resolved by including all properties in the operation request/response that are not metadata.
 * This allows to nest the body in a property while still allowing to use headers, query parameters, and path parameters in the same model.
 *
 * @example
 *
 * \`\`\`typespec
 * op upload(@bodyRoot user: {name: string, @header id: string}): void;
 * op download(): {@bodyRoot user: {name: string, @header id: string}};
 * \`\`\`
 */
extern dec bodyRoot(target: ModelProperty);
/**
 * Specify that this property shouldn't be included in the HTTP body.
 * This can be useful when bundling metadata together that would result in an empty property to be included in the body.
 *
 * @example
 *
 * \`\`\`typespec
 * op upload(name: string, @bodyIgnore headers: {@header id: string}): void;
 * \`\`\`
 */
extern dec bodyIgnore(target: ModelProperty);

/**
 * Specify that the target property is the body of a multipart request or response.
 *
 * The property type must be a model or tuple whose members are all \`HttpPart\`, each describing one
 * part of the payload.
 *
 * @example
 *
 * \`\`\`tsp
 * op upload(
 *   @header \`content-type\`: "multipart/form-data",
 *   @multipartBody body: {
 *     fullName: HttpPart<string>;
 *     headShots: HttpPart<Image>[];
 *   },
 * ): void;
 * \`\`\`
 */
extern dec multipartBody(target: ModelProperty);

/**
 * Specify the status code for this response. Property type must be a status code integer or a union of status code integer.
 *
 * @example
 *
 * \`\`\`typespec
 * op read(): {
 *   @statusCode _: 200;
 *   @body pet: Pet;
 * };
 * op create(): {
 *   @statusCode _: 201 | 202;
 * };
 * \`\`\`
 */
extern dec statusCode(target: ModelProperty);

/**
 * Specify the HTTP verb for the target operation to be \`GET\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @get op read(): string
 * \`\`\`
 */
extern dec get(target: Operation);

/**
 * Specify the HTTP verb for the target operation to be \`PUT\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @put op set(pet: Pet): void
 * \`\`\`
 */
extern dec put(target: Operation);

/**
 * Specify the HTTP verb for the target operation to be \`POST\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @post op create(pet: Pet): void
 * \`\`\`
 */
extern dec post(target: Operation);

/**
 * Options for PATCH operations.
 */
model PatchOptions {
  /**
   * If set to \`false\`, disables the implicit transform that makes the body of a
   * PATCH operation deeply optional.
   *
   * **Deprecated:** \`implicitOptionality\` is deprecated and will be removed.
   * To preserve the previous behavior, define and use an explicit patch model
   * with optional properties for your \`@body\` parameter.
   * For actual JSON Merge Patch behavior, use \`MergePatchUpdate<T>\` as the
   * \`@body\` type (for example: \`@patch op update(@body pet: MergePatchUpdate<Pet>): void;\`).
   */
  implicitOptionality?: boolean;
}

/**
 * Specify the HTTP verb for the target operation to be \`PATCH\`.
 *
 * @param options Options for the PATCH operation.
 *
 * @example
 *
 * \`\`\`typespec
 * @patch op update(pet: Pet): void;
 * \`\`\`
 *
 * @example Using MergePatch template for proper merge-patch semantics
 * \`\`\`typespec
 * @patch op update(@body pet: MergePatchUpdate<Pet>): void;
 * \`\`\`
 */
extern dec patch(target: Operation, options?: valueof PatchOptions);

/**
 * Specify the HTTP verb for the target operation to be \`DELETE\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @delete op set(petId: string): void
 * \`\`\`
 */
extern dec delete(target: Operation);

/**
 * Specify the HTTP verb for the target operation to be \`HEAD\`.
 * @example
 *
 * \`\`\`typespec
 * @head op ping(petId: string): void
 * \`\`\`
 */
extern dec head(target: Operation);

/**
 * Specify an endpoint for this service. Multiple \`@server\` decorators can be used to specify multiple endpoints.
 *
 *  @param url Server endpoint
 *  @param description Description of the endpoint
 *  @param parameters Optional set of parameters used to interpolate the url.
 *
 * @example
 *
 * \`\`\`typespec
 * @service
 * @server("https://example.com")
 * namespace PetStore;
 * \`\`\`
 *
 * @example With a description
 *
 * \`\`\`typespec
 * @service
 * @server("https://example.com", "Single server endpoint")
 * namespace PetStore;
 * \`\`\`
 *
 * @example Parameterized
 *
 * \`\`\`typespec
 * @server("https://{region}.foo.com", "Regional endpoint", {
 *   @doc("Region name")
 *   region?: string = "westus",
 * })
 * \`\`\`
 *
 * @example Multiple
 * \`\`\`typespec
 * @service
 * @server("https://example.com", "Standard endpoint")
 * @server("https://{project}.private.example.com", "Private project endpoint", {
 *   project: string;
 * })
 * namespace PetStore;
 * \`\`\`
 *
 */
extern dec server(
  target: Namespace,
  url: valueof string,
  description?: valueof string,
  parameters?: Record<unknown>
);

/**
 * Specify authentication for a whole service or specific methods. See the [documentation in the Http library](https://typespec.io/docs/libraries/http/authentication) for full details.
 *
 * @param auth Authentication configuration. Can be a single security scheme, a union(either option is valid authentication) or a tuple (must use all authentication together)
 * @example
 *
 * \`\`\`typespec
 * @service
 * @useAuth(BasicAuth)
 * namespace PetStore;
 * \`\`\`
 */
extern dec useAuth(target: Namespace | Interface | Operation, auth: {} | Union | {}[]);

/**
 * Defines the relative route URI template for the target operation as defined by [RFC 6570](https://datatracker.ietf.org/doc/html/rfc6570#section-3.2.3)
 *
 * \`@route\` can only be applied to operations, namespaces, and interfaces.
 *
 * @param path URI template for this operation.
 *
 * @example Simple path parameter
 *
 * \`\`\`typespec
 * @route("/widgets/{id}") op getWidget(@path id: string): Widget;
 * \`\`\`
 *
 * @example Reserved characters
 * \`\`\`typespec
 * @route("/files{+path}") op getFile(@path path: string): bytes;
 * \`\`\`
 *
 * @example Query parameter
 * \`\`\`typespec
 * @route("/files") op list(select?: string, filter?: string): Files[];
 * @route("/files{?select,filter}") op listFullUriTemplate(select?: string, filter?: string): Files[];
 * \`\`\`
 */
extern dec route(target: Namespace | Interface | Operation, path: valueof string);

/**
 * \`@sharedRoute\` marks the operation as sharing a route path with other operations.
 *
 * When an operation is marked with \`@sharedRoute\`, it enables other operations to share the same
 * route path as long as those operations are also marked with \`@sharedRoute\`.
 *
 * \`@sharedRoute\` can only be applied directly to operations.
 *
 * \`\`\`typespec
 * @sharedRoute
 * @route("/widgets")
 * op getWidget(@path id: string): Widget;
 * \`\`\`
 */
extern dec sharedRoute(target: Operation);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./decorators.tsp";
import "./private.decorators.tsp";
import "./auth.tsp";

namespace TypeSpec.Http;

using Private;

/**
 * Describes an HTTP response.
 *
 * @template Status The status code of the response.
 */
@doc("")
model Response<Status> {
  @doc("The status code.")
  @statusCode
  statusCode: Status;
}

/**
 * Defines a model with a single property of the given type, marked with \`@body\`.
 *
 * This can be useful in situations where you cannot use a bare type as the body
 * and it is awkward to add a property.
 *
 * @template Type The type of the model's \`body\` property.
 */
@doc("")
model Body<Type> {
  @body
  @doc("The body type of the operation request or response.")
  body: Type;
}

/**
 * The Location header contains the URL where the status of the long running operation can be checked.
 */
model LocationHeader {
  @doc("The Location header contains the URL where the status of the long running operation can be checked.")
  @header
  location: string;
}

// Don't put @doc on these, change \`getStatusCodeDescription\` implementation
// to update the default descriptions for these status codes. This ensures
// that we get consistent emit between different ways to spell the same
// responses in TypeSpec.

/**
 * The request has succeeded.
 */
model OkResponse is Response<200>;
/**
 * The request has succeeded and a new resource has been created as a result.
 */
model CreatedResponse is Response<201>;
/**
 * The request has been accepted for processing, but processing has not yet completed.
 */
model AcceptedResponse is Response<202>;
/**
 * There is no content to send for this request, but the headers may be useful.
 */
model NoContentResponse is Response<204>;
/**
 * The URL of the requested resource has been changed permanently. The new URL is given in the response.
 */
model MovedResponse is Response<301> {
  ...LocationHeader;
}
/**
 * The client has made a conditional request and the resource has not been modified.
 */
model NotModifiedResponse is Response<304>;
/**
 * The server could not understand the request due to invalid syntax.
 */
model BadRequestResponse is Response<400>;
/**
 * Access is unauthorized.
 */
model UnauthorizedResponse is Response<401>;
/**
 * Access is forbidden.
 */
model ForbiddenResponse is Response<403>;
/**
 * The server cannot find the requested resource.
 */
model NotFoundResponse is Response<404>;
/**
 * The request conflicts with the current state of the server.
 */
model ConflictResponse is Response<409>;

/**
 * Produces a new model with the same properties as T, but with \`@query\`,
 * \`@header\`, \`@body\`, and \`@path\` decorators removed from all properties.
 *
 * @template Data The model to spread as the plain data.
 */
@plainData
model PlainData<Data> {
  ...Data;
}

/**
 * A file in an HTTP request, response, or multipart payload.
 *
 * Files have a special meaning that the HTTP library understands. When the body of an HTTP request, response,
 * or multipart payload is _effectively_ an instance of \`TypeSpec.Http.File\` or any type that extends it, the
 * operation is treated as a file upload or download.
 *
 * When using file bodies, the fields of the file model are defined to come from particular locations by default:
 *
 * - \`contentType\`: The \`Content-Type\` header of the request, response, or multipart payload (CANNOT be overridden or changed).
 * - \`contents\`: The body of the request, response, or multipart payload (CANNOT be overridden or changed).
 * - \`filename\`: The \`filename\` parameter value of the \`Content-Disposition\` header of the response or multipart payload
 *   (MAY be overridden or changed).
 *
 * A File may be used as a normal structured JSON object in a request or response, if the request specifies an explicit
 * \`Content-Type\` header. In this case, the entire File model is serialized as if it were any other model. In a JSON payload,
 * it will have a structure like:
 *
 * \`\`\`
 * {
 *   "contentType": <string?>,
 *   "filename": <string?>,
 *   "contents": <string, base64>
 * }
 * \`\`\`
 *
 * The \`contentType\` _within_ the file defines what media types the data inside the file can be, but if the specification
 * defines a \`Content-Type\` for the payload as HTTP metadata, that \`Content-Type\` metadata defines _how the file is
 * serialized_. See the examples below for more information.
 *
 * NOTE: The \`filename\` and \`contentType\` fields are optional. Furthermore, the default location of \`filename\`
 * (\`Content-Disposition: <disposition>; filename=<filename>\`) is only valid in HTTP responses and multipart payloads. If
 * you wish to send the \`filename\` in a request, you must use HTTP metadata decorators to describe the location of the
 * \`filename\` field. You can combine the metadata decorators with \`@visibility\` to control when the \`filename\` location
 * is overridden, as shown in the examples below.
 *
 * @template ContentType The allowed media (MIME) types of the file contents.
 * @template Contents The type of the file contents. This can be \`string\`, \`bytes\`, or any scalar that extends them.
 *
 * @example
 * \`\`\`tsp
 * // Download a file
 * @get op download(): File;
 *
 * // Upload a file
 * @post op upload(@bodyRoot file: File): void;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // Upload and download files in a multipart payload
 * op multipartFormDataUpload(
 *   @multipartBody fields: {
 *     files: HttpPart<File>[];
 *   },
 * ): void;
 *
 * op multipartFormDataDownload(): {
 *   @multipartBody formFields: {
 *     files: HttpPart<File>[];
 *   }
 * };
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // Declare a custom type of text file, where the filename goes in the path
 * // in requests.
 * model SpecFile extends File<"application/json" | "application/yaml", string> {
 *   // Provide a header that contains the name of the file when created or updated
 *   @header("x-filename")
 *   @path filename: string;
 * }
 *
 * @get op downloadSpec(@path name: string): SpecFile;
 *
 * @post op uploadSpec(@bodyRoot spec: SpecFile): void;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // Declare a custom type of binary file
 * model ImageFile extends File {
 *   contentType: "image/png" | "image/jpeg";
 *   @path filename: string;
 * }
 *
 * @get op downloadImage(@path name: string): ImageFile;
 *
 * @post op uploadImage(@bodyRoot image: ImageFile): void;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // Use a File as a structured JSON object. The HTTP library will warn you that the File will be serialized as JSON,
 * // so you should suppress the warning if it's really what you want instead of a binary file upload/download.
 *
 * // The response body is a JSON object like \`{"contentType":<string?>,"filename":<string?>,"contents":<string>}\`
 * @get op downloadTextFileJson(): {
 *   @header contentType: "application/json",
 *   @body file: File<"text/plain", string>,
 * };
 *
 * // The request body is a JSON object like \`{"contentType":<string?>,"filename":<string?>,"contents":<base64>}\`
 * @post op uploadBinaryFileJson(
 *   @header contentType: "application/json",
 *   @body file: File<"image/png", bytes>,
 * ): void;
 *
 */
@summary("A file in an HTTP request, response, or multipart payload.")
@Private.httpFile
model File<ContentType extends string = string, Contents extends bytes | string = bytes> {
  /**
   * The allowed media (MIME) types of the file contents.
   *
   * In file bodies, this value comes from the \`Content-Type\` header of the request or response. In JSON bodies,
   * this value is serialized as a field in the response.
   *
   * NOTE: this is not _necessarily_ the same as the \`Content-Type\` header of the request or response, but
   * it will be for file bodies. It may be different if the file is serialized as a JSON object. It always refers to the
   * _contents_ of the file, and not necessarily the way the file itself is transmitted or serialized.
   */
  @summary("The allowed media (MIME) types of the file contents.")
  contentType?: ContentType;

  /**
   * The name of the file, if any.
   *
   * In file bodies, this value comes from the \`filename\` parameter of the \`Content-Disposition\` header of the response
   * or multipart payload. In JSON bodies, this value is serialized as a field in the response.
   *
   * NOTE: By default, \`filename\` cannot be sent in request payloads and can only be sent in responses and multipart
   * payloads, as the \`Content-Disposition\` header is not valid in requests. If you want to send the \`filename\` in a request,
   * you must extend the \`File\` model and override the \`filename\` property with a different location defined by HTTP metadata
   * decorators.
   */
  @summary("The name of the file, if any.")
  filename?: string;

  /**
   * The contents of the file.
   *
   * In file bodies, this value comes from the body of the request, response, or multipart payload. In JSON bodies,
   * this value is serialized as a field in the response.
   */
  @summary("The contents of the file.")
  contents: Contents;
}

/**
 * Options for configuring an individual part of a multipart payload.
 */
model HttpPartOptions {
  /** Name of the part when using the array form. */
  name?: string;
}

/**
 * Represents a single part of a multipart payload.
 *
 * @template Type The type of the part's content.
 * @template Options Options for this part, such as the name to use when the part is repeated.
 *
 * @example
 *
 * \`\`\`typespec
 * op upload(
 *   @header \`content-type\`: "multipart/form-data",
 *   @multipartBody body: {
 *     fullName: HttpPart<string>;
 *     headShots: HttpPart<Image>[];
 *   },
 * ): void;
 * \`\`\`
 */
@Private.httpPart(Type, Options)
model HttpPart<Type, Options extends valueof HttpPartOptions = #{}> {}

/**
 * Describes a web link as defined by [RFC 8288](https://datatracker.ietf.org/doc/html/rfc8288).
 */
model Link {
  /** The target URI of the link. */
  target: url;

  /** The relation type of the link, describing how the target relates to the current resource. */
  rel: string;

  /** Additional target attributes to serialize as link parameters. */
  attributes?: Record<unknown>;
}

/**
 * A \`Link\` header value as defined by [RFC 8288](https://datatracker.ietf.org/doc/html/rfc8288).
 *
 * @template T The links carried by the header, either as a map of relation type to URI or as a
 * list of \`Link\`.
 */
scalar LinkHeader<T extends Record<url> | Link[]> extends string;

/**
 * Create a MergePatch Request body for updating the given resource Model.
 * The MergePatch request created by this template provides a TypeSpec description of a
 * JSON MergePatch request that can successfully update the given resource.
 * The transformation follows the definition of JSON MergePatch requests in
 * rfc 7396: https://www.rfc-editor.org/rfc/rfc7396,
 * applying the merge-patch transform recursively to keyed types in the resource Model.
 *
 * Using this template in a PATCH request body overrides the \`implicitOptionality\`
 * setting for PATCH operations and sets \`application/merge-patch+json\` as the request
 * content-type.
 *
 * @template T The type of the resource to create a MergePatch update request body for.
 * @template NameTemplate A StringTemplate used to name any models created by applying
 * the merge-patch transform to the resource. The default name template is \`{name}MergePatchUpdate\`,
 * for example, the merge patch transform of model \`Widget\` is named \`WidgetMergePatchUpdate\`.
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(@body request: MergePatchUpdate<Widget>): Widget;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(@bodyRoot request: MergePatchUpdate<Widget>): Widget;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(...MergePatchUpdate<Widget>): Widget;
 * \`\`\`
 */
alias MergePatchUpdate<
  T extends Reflection.Model,
  NameTemplate extends valueof string = "{name}MergePatchUpdate"
> = applyMergePatchTransform(
  T,
  NameTemplate,
  #{ visibilityMode: Private.MergePatchVisibilityMode.Update }
);

/**
 * Create a MergePatch Request body for creating or updating the given resource Model.
 * The MergePatch request created by this template provides a TypeSpec description of a
 * JSON MergePatch request that can successfully create or update the given resource.
 * The transformation follows the definition of JSON MergePatch requests in
 * rfc 7396: https://www.rfc-editor.org/rfc/rfc7396,
 * applying the merge-patch transform recursively to keyed types in the resource Model.
 *
 * Using this template in a PATCH request body overrides the \`implicitOptionality\`
 * setting for PATCH operations and sets \`application/merge-patch+json\` as the request
 * content-type.
 *
 * @template T The type of the resource to create a MergePatch update request body for.
 * @template NameTemplate A StringTemplate used to name any models created by applying
 * the merge-patch transform to the resource. The default name template is \`{name}MergePatchCreateOrUpdate\`,
 * for example, the merge patch transform of model \`Widget\` is named \`WidgetMergePatchCreateOrUpdate\`.
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(@body request: MergePatchCreateOrUpdate<Widget>): Widget;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(@bodyRoot request: MergePatchCreateOrUpdate<Widget>): Widget;
 * \`\`\`
 *
 * @example
 * \`\`\`tsp
 * // An operation updating a 'Widget' using merge-patch
 * @patch op update(...MergePatchCreateOrUpdate<Widget>): Widget;
 * \`\`\`
 */
alias MergePatchCreateOrUpdate<
  T extends Reflection.Model,
  NameTemplate extends valueof string = "{name}MergePatchCreateOrUpdate"
> = applyMergePatchTransform(
  T,
  NameTemplate,
  #{ visibilityMode: Private.MergePatchVisibilityMode.CreateOrUpdate }
);
`,"lib/private.decorators.tsp":`/**
 * Private decorators. Those are meant for internal use inside Http types only.
 */
namespace TypeSpec.Http.Private;

extern dec plainData(target: TypeSpec.Reflection.Model);
extern dec httpFile(target: TypeSpec.Reflection.Model);
extern dec httpPart(
  target: TypeSpec.Reflection.Model,
  type: unknown,
  options: valueof HttpPartOptions
);

/**
 * Specify if inapplicable metadata should be included in the payload for the given entity.
 * @param value If true, inapplicable metadata will be included in the payload.
 */
extern dec includeInapplicableMetadataInPayload(target: unknown, value: valueof boolean);

/**
 * The visibility mode for the merge patch transform.
 */
enum MergePatchVisibilityMode {
  /**
   * The Update mode. This is used when a resource can be updated but must already exist.
   */
  Update,

  /**
   * The Create or Update mode. This is used when a resource can be created OR updated in a single operation.
   */
  CreateOrUpdate,
}

/**
 * Options for the \`@applyMergePatch\` decorator.
 */
model ApplyMergePatchOptions {
  /**
   * The visibility mode to use.
   */
  visibilityMode: MergePatchVisibilityMode;
}

/**
 * Performs the canonical merge-patch transformation on the given model and injects its
 * transformed properties into the target.
 */
#deprecated "applyMergePatch is deprecated and will be removed in a future release. This decorator is not intended for public use."
extern dec applyMergePatch(
  target: Reflection.Model,
  source: Reflection.Model,
  nameTemplate: valueof string,
  options: valueof ApplyMergePatchOptions
);

#suppress "experimental-feature"
internal extern fn applyMergePatchTransform(
  input: Reflection.Model,
  nameTemplate: valueof string,
  options: valueof ApplyMergePatchOptions
): Reflection.Model;

/**
 * Marks a model that was generated by applying the MergePatch
 * transform and links to its source model
 */
extern dec mergePatchModel(target: Reflection.Model, source: Reflection.Model);

/**
 * Links a modelProperty mutated as part of a mergePatch transform to
 * its source property;
 */
extern dec mergePatchProperty(target: Reflection.ModelProperty, source: Reflection.ModelProperty);
`,"lib/streams/main.tsp":`import "@typespec/streams";
import "../main.tsp";

using TypeSpec.Streams;

namespace TypeSpec.Http.Streams;

/**
 * Defines a model that represents a stream protocol type whose data is described
 * by \`Type\`.
 *
 * The \`ContentType\` and \`BodyType\` describe how the stream is encoded over the wire,
 * while \`Type\` describes the data that the stream contains.
 *
 * @template Type The type of the stream's data.
 * @template ContentType The content type of the stream.
 * @template BodyType The underlying wire type of the stream.
 */
@doc("")
model HttpStream<Type, ContentType extends valueof string, BodyType extends bytes | string = string>
  is Stream<Type> {
  @header contentType: typeof ContentType;
  @body body: BodyType;
}

/**
 * Describes a stream of JSON data with one JSON object per line and sets
 * the content type to \`application/jsonl\`.
 *
 * The JSON data is described by \`Type\`.
 *
 * @template Type The set of models describing the JSON data in the stream.
 *
 * @example
 *
 * \`\`\`typespec
 * model Message {
 *   id: string;
 *   text: string;
 * }
 *
 * @TypeSpec.Events.events
 * union Events {
 *   Message,
 * }
 *
 * op subscribe(): JsonlStream<Events>;
 * \`\`\`
 */
@doc("")
model JsonlStream<Type> is HttpStream<Type, "application/jsonl">;
`,"tspconfig.yaml":"# Opt this library into the experimental `type-info-provider` feature so that the\n# `$provideTypeInfo` provider exported from `src/type-info.ts` is registered by the compiler.\n# Per-package feature enablement is resolved from the owning package's config, so consumers do\n# not need to enable it.\n# NOTE: this file must stay listed in `package.json#files` or the opt-in is lost when published.\nkind: project\nfeatures:\n  - type-info-provider\n"}},"@typespec/rest":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/rest",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec REST protocol binding",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/rest.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/rest.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0",
    "@typespec/http": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/http": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/tspd": "^0.77.1"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/rest/reference"
  }
}`,"lib/resource.tsp":`import "@typespec/http";
import "../dist/src/internal-decorators.js";

namespace TypeSpec.Rest.Resource;

using Http;

@doc("The default error response for resource operations.")
model ResourceError {
  @doc("The error code.")
  code: int32;

  @doc("The error message.")
  message: string;
}

/**
 * Dynamically gathers keys of the model type \`Resource\`.
 *
 * @template Resource The target resource model.
 */
@doc("Dynamically gathers keys of the model type Resource.")
@copyResourceKeyParameters
@friendlyName("{name}Key", Resource)
model KeysOf<Resource> {}

/**
 * Dynamically gathers parent keys of the model type \`Resource\`.
 *
 * @template Resource The target resource model.
 */
@doc("Dynamically gathers parent keys of the model type Resource.")
@copyResourceKeyParameters("parent")
@friendlyName("{name}ParentKey", Resource)
model ParentKeysOf<Resource> {}

/**
 * Represents operation parameters for the resource of type \`Resource\`.
 *
 * @template Resource The resource model.
 */
@doc("Represents operation parameters for resource Resource.")
model ResourceParameters<Resource extends {}> {
  ...KeysOf<Resource>;
}

/**
 * Represents collection operation parameters for the resource of type \`Resource\`.
 *
 * @template Resource The resource model.
 */
@doc("Represents collection operation parameters for resource Resource.")
model ResourceCollectionParameters<Resource extends {}> {
  ...ParentKeysOf<Resource>;
}

/**
 * Represents the resource GET operation.
 *
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceRead<Resource extends {}, Error> {
  /**
   * Gets an instance of the resource.
   */
  @autoRoute
  @doc("Gets an instance of the resource.")
  @readsResource(Resource)
  get(...ResourceParameters<Resource>): Resource | Error;
}

/**
 * Resource create operation completed successfully.
 *
 * @template Resource The resource model that was created.
 */
@doc("Resource create operation completed successfully.")
model ResourceCreatedResponse<Resource> {
  ...CreatedResponse;

  /** The created resource. */
  @bodyRoot body: Resource;
}

/**
 * Resource create or replace operation template.
 *
 * @template Resource The resource model to create or replace.
 * @template Error The error response.
 */
interface ResourceCreateOrReplace<Resource extends {}, Error> {
  /**
   * Creates or replaces a instance of the resource.
   */
  @autoRoute
  @doc("Creates or replaces an instance of the resource.")
  @createsOrReplacesResource(Resource)
  createOrReplace(
    ...ResourceParameters<Resource>,

    /** The properties of the resource to create or replace. */
    @doc("")
    @bodyRoot
    resource: ResourceCreateModel<Resource>,
  ): Resource | ResourceCreatedResponse<Resource> | Error;
}

/**
 * Resource create or update operation model.
 *
 * @template Resource The resource model to create or update.
 */
@friendlyName("{name}Update", Resource)
model ResourceCreateOrUpdateModel<Resource extends {}>
  is OptionalProperties<UpdateableProperties<DefaultKeyVisibility<Resource, Lifecycle.Read>>>;

/**
 * Resource create or update operation template.
 *
 * @template Resource The resource model to create or update.
 * @template Error The error response.
 */
interface ResourceCreateOrUpdate<Resource extends {}, Error> {
  /**
   * Creates or update an instance of the resource.
   */
  #suppress "@typespec/http/deprecated-implicit-optionality" "for legacy behavior"
  @autoRoute
  @doc("Creates or update an instance of the resource.")
  @createsOrUpdatesResource(Resource)
  @patch(#{ implicitOptionality: true }) // for legacy behavior
  createOrUpdate(
    ...ResourceParameters<Resource>,

    /** The properties of the resource to create or update. */
    @doc("")
    @bodyRoot
    resource: ResourceCreateOrUpdateModel<Resource>,
  ): Resource | ResourceCreatedResponse<Resource> | Error;
}

/**
 * Resource create operation model.
 *
 * @template Resource The resource model to create.
 */
@friendlyName("{name}Create", Resource)
@withVisibility(Lifecycle.Create)
model ResourceCreateModel<Resource extends {}> is DefaultKeyVisibility<Resource, Lifecycle.Read>;

/**
 * Resource create operation template.
 *
 * @template Resource The resource model to create.
 * @template Error The error response.
 */
interface ResourceCreate<Resource extends {}, Error> {
  /**
   * Creates a new instance of the resource.
   */
  @autoRoute
  @doc("Creates a new instance of the resource.")
  @createsResource(Resource)
  create(
    ...ResourceCollectionParameters<Resource>,

    /** The properties of the resource to create. */
    @doc("")
    @bodyRoot
    resource: ResourceCreateModel<Resource>,
  ): Resource | ResourceCreatedResponse<Resource> | Error;
}

/**
 * Resource update operation template.
 *
 * @template Resource The resource model to update.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceUpdate<Resource extends {}, Error> {
  /**
   * Updates an existing instance of the resource.
   */
  #suppress "@typespec/http/deprecated-implicit-optionality" "for legacy behavior"
  @autoRoute
  @doc("Updates an existing instance of the resource.")
  @updatesResource(Resource)
  @patch(#{ implicitOptionality: true }) // for legacy behavior
  update(
    ...ResourceParameters<Resource>,

    /** The properties of the resource to update. */
    @doc("")
    @bodyRoot
    properties: ResourceCreateOrUpdateModel<Resource>,
  ): Resource | Error;
}

@doc("Resource deleted successfully.")
model ResourceDeletedResponse {
  @doc("The status code.")
  @statusCode
  _: 200;
}

/**
 * Resource delete operation template.
 *
 * @template Resource The resource model to delete.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceDelete<Resource extends {}, Error> {
  /**
   * Deletes an existing instance of the resource.
   */
  @autoRoute
  @doc("Deletes an existing instance of the resource.")
  @deletesResource(Resource)
  delete(...ResourceParameters<Resource>): ResourceDeletedResponse | Error;
}

/**
 * Structure for a paging response using \`value\` and \`nextLink\` to represent pagination.
 *
 * @template Resource The resource type of the collection.
 */
@doc("Paged response of {name} items", Resource)
@friendlyName("{name}CollectionWithNextLink", Resource)
model CollectionWithNextLink<Resource extends {}> {
  @doc("The items on this page")
  @pageItems
  value: Resource[];

  @doc("The link to the next page of items")
  @nextLink
  nextLink?: ResourceLocation<Resource>;
}

/**
 * Resource list operation template.
 *
 * @template Resource The resource model to list.
 * @template Error The error response.
 */
interface ResourceList<Resource extends {}, Error> {
  /**
   * Lists all instances of the resource.
   */
  @autoRoute
  @doc("Lists all instances of the resource.")
  @listsResource(Resource)
  list(...ResourceCollectionParameters<Resource>): CollectionWithNextLink<Resource> | Error;
}

/**
 * Resource operation templates for resource instances.
 *
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceInstanceOperations<Resource extends {}, Error>
  extends ResourceRead<Resource, Error>,
    ResourceUpdate<Resource, Error>,
    ResourceDelete<Resource, Error> {}

/**
 * Resource operation templates for resource collections.
 *
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceCollectionOperations<Resource extends {}, Error>
  extends ResourceCreate<Resource, Error>,
    ResourceList<Resource, Error> {}

/**
 * Resource operation templates for resources.
 *
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ResourceOperations<Resource extends {}, Error>
  extends ResourceInstanceOperations<Resource, Error>,
    ResourceCollectionOperations<Resource, Error> {}

/**
 * Singleton resource read operation template.
 *
 * @template Singleton The singleton resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface SingletonResourceRead<Singleton extends {}, Resource extends {}, Error> {
  /**
   * Gets the singleton resource.
   */
  @autoRoute
  @doc("Gets the singleton resource.")
  @segmentOf(Singleton)
  @readsResource(Singleton)
  get(...ResourceParameters<Resource>): Singleton | Error;
}

/**
 * Singleton resource update operation template.
 *
 * @template Singleton The singleton resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface SingletonResourceUpdate<Singleton extends {}, Resource extends {}, Error> {
  /**
   * Updates the singleton resource.
   */
  #suppress "@typespec/http/deprecated-implicit-optionality" "for legacy behavior"
  @autoRoute
  @doc("Updates the singleton resource.")
  @segmentOf(Singleton)
  @updatesResource(Singleton)
  @patch(#{ implicitOptionality: true }) // for legacy behavior
  update(
    ...ResourceParameters<Resource>,

    /** The properties of the singleton resource to update. */
    @doc("")
    @body
    properties: ResourceCreateOrUpdateModel<Singleton>,
  ): Singleton | Error;
}

/**
 * Singleton resource operation templates for singleton resource instances.
 *
 * @template Singleton The singleton resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface SingletonResourceOperations<Singleton extends {}, Resource extends {}, Error>
  extends SingletonResourceRead<Singleton, Resource, Error>,
    SingletonResourceUpdate<Singleton, Resource, Error> {}

/**
 * Extension resource read operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
@Private.validateHasKey(Resource)
@Private.validateIsError(Error)
interface ExtensionResourceRead<Extension extends {}, Resource extends {}, Error> {
  /**
   * Gets an instance of the extension resource.
   */
  @autoRoute
  @doc("Gets an instance of the extension resource.")
  @readsResource(Extension)
  get(...ResourceParameters<Resource>, ...ResourceParameters<Extension>): Extension | Error;
}

/**
 * Extension resource create or update operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceCreateOrUpdate<Extension extends {}, Resource extends {}, Error> {
  /**
   * Creates or update an instance of the extension resource.
   */
  #suppress "@typespec/http/deprecated-implicit-optionality" "for legacy behavior"
  @autoRoute
  @doc("Creates or update an instance of the extension resource.")
  @createsOrUpdatesResource(Extension)
  @patch(#{ implicitOptionality: true }) // for legacy behavior
  createOrUpdate(
    ...ResourceParameters<Resource>,
    ...ResourceParameters<Extension>,

    /** The properties of the extension resource to create or update. */
    @doc("")
    @bodyRoot
    resource: ResourceCreateOrUpdateModel<Extension>,
  ): Extension | ResourceCreatedResponse<Extension> | Error;
}

/**
 * Extension resource create operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceCreate<Extension extends {}, Resource extends {}, Error> {
  /**
   * Creates a new instance of the extension resource.
   */
  @autoRoute
  @doc("Creates a new instance of the extension resource.")
  @createsResource(Extension)
  create(
    ...ResourceParameters<Resource>,

    /** The properties of the extension resource to create. */
    @doc("")
    @bodyRoot
    resource: ResourceCreateModel<Extension>,
  ): Extension | ResourceCreatedResponse<Extension> | Error;
}

/**
 * Extension resource update operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceUpdate<Extension extends {}, Resource extends {}, Error> {
  /**
   * Updates an existing instance of the extension resource.
   */
  #suppress "@typespec/http/deprecated-implicit-optionality" "for legacy behavior"
  @autoRoute
  @doc("Updates an existing instance of the extension resource.")
  @updatesResource(Extension)
  @patch(#{ implicitOptionality: true }) // for legacy behavior
  update(
    ...ResourceParameters<Resource>,
    ...ResourceParameters<Extension>,

    /** The properties of the extension resource to update. */
    @doc("")
    @body
    properties: ResourceCreateOrUpdateModel<Extension>,
  ): Extension | Error;
}

/**
 * Extension resource delete operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceDelete<Extension extends {}, Resource extends {}, Error> {
  /**
   * Deletes an existing instance of the extension resource.
   */
  @autoRoute
  @doc("Deletes an existing instance of the extension resource.")
  @deletesResource(Extension)
  delete(...ResourceParameters<Resource>, ...ResourceParameters<Extension>):
    | ResourceDeletedResponse
    | Error;
}

/**
 * Extension resource list operation template.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceList<Extension extends {}, Resource extends {}, Error> {
  /**
   * Lists all instances of the extension resource.
   */
  @autoRoute
  @doc("Lists all instances of the extension resource.")
  @listsResource(Extension)
  list(...ResourceParameters<Resource>, ...ResourceCollectionParameters<Extension>):
    | CollectionWithNextLink<Extension>
    | Error;
}

/**
 * Extension resource operation templates for extension resource instances.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceInstanceOperations<Extension extends {}, Resource extends {}, Error>
  extends ExtensionResourceRead<Extension, Resource, Error>,
    ExtensionResourceUpdate<Extension, Resource, Error>,
    ExtensionResourceDelete<Extension, Resource, Error> {}

/**
 * Extension resource operation templates for extension resource collections.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceCollectionOperations<Extension extends {}, Resource extends {}, Error>
  extends ExtensionResourceCreate<Extension, Resource, Error>,
    ExtensionResourceList<Extension, Resource, Error> {}

/**
 * Extension resource operation templates for extension resource instances and collections.
 *
 * @template Extension The extension resource model.
 * @template Resource The resource model.
 * @template Error The error response.
 */
interface ExtensionResourceOperations<Extension extends {}, Resource extends {}, Error>
  extends ExtensionResourceInstanceOperations<Extension, Resource, Error>,
    ExtensionResourceCollectionOperations<Extension, Resource, Error> {}
`,"lib/rest-decorators.tsp":`namespace TypeSpec.Rest;

using TypeSpec.Reflection;

/**
 * This interface or operation should resolve its route automatically. To be used with resource types where the route segments area defined on the models.
 *
 * @example
 *
 * \`\`\`typespec
 * @autoRoute
 * interface Pets {
 *   get(@segment("pets") @path id: string): void; //-> route: /pets/{id}
 * }
 * \`\`\`
 */
extern dec autoRoute(target: Interface | Operation);

/**
 * Defines the preceding path segment for a \`@path\` parameter in auto-generated routes.
 *
 * @param name Segment that will be inserted into the operation route before the path parameter's name field.
 *
 * @example
 *
 * \`\`\`typespec
 * @autoRoute
 * interface Pets {
 *   get(@segment("pets") @path id: string): void; //-> route: /pets/{id}
 * }
 * \`\`\`
 */
extern dec segment(target: Model | ModelProperty | Operation, name: valueof string);

/**
 * Returns the URL segment of a given model if it has \`@segment\` and \`@key\` decorator.
 * @param type Target model
 */
extern dec segmentOf(target: Operation, type: Model);

/**
 * Defines the separator string that is inserted before the action name in auto-generated routes for actions.
 *
 * When applied to a namespace, the separator applies to all action operations in that namespace and its sub-namespaces.
 * When applied to an interface, the separator applies to all action operations in that interface and overrides any namespace-level separator.
 * When applied to an operation, the separator applies only to that operation and overrides any interface or namespace-level separator.
 *
 * @param seperator Seperator seperating the action segment from the rest of the url
 */
extern dec actionSeparator(
  target: Operation | Interface | Namespace,
  seperator: valueof "/" | ":" | "/:"
);

/**
 * Mark this model as a resource type with a name.
 *
 * @param collectionName type's collection name
 */
extern dec resource(target: Model, collectionName: valueof string);

/**
 * Mark model as a child of the given parent resource.
 * @param parent Parent model.
 */
extern dec parentResource(target: Model, parent: Model);

/**
 * Specify that this is a Read operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec readsResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a Create operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec createsResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a CreateOrReplace operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec createsOrReplacesResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a CreatesOrUpdate operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec createsOrUpdatesResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a Update operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec updatesResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a Delete operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec deletesResource(target: Operation, resourceType: Model);

/**
 * Specify that this is a List operation for a given resource.
 *
 * @param resourceType Resource marked with \`@resource\`
 */
extern dec listsResource(target: Operation, resourceType: Model);

/**
 * Specify this operation is an action. (Scoped to a resource item /pets/{petId}/my-action)
 * @param name Name of the action. If not specified, the name of the operation will be used.
 */
extern dec action(target: Operation, name?: valueof string);

/**
 * Specify this operation is a collection action. (Scopped to a resource, /pets/my-action)
 * @param resourceType Resource marked with \`@resource\`
 * @param name Name of the action. If not specified, the name of the operation will be used.
 */
extern dec collectionAction(target: Operation, resourceType: Model, name?: valueof string);

/**
 * Copy the resource key parameters on the model
 * @param filter Filter to exclude certain properties.
 */
extern dec copyResourceKeyParameters(target: Model, filter?: valueof string);

namespace Private {
  extern dec resourceLocation(target: string, resourceType: Model);
  extern dec validateHasKey(target: unknown, value: unknown);
  extern dec validateIsError(target: unknown, value: unknown);
  extern dec actionSegment(target: Operation, value: valueof string);
  extern dec resourceTypeForKeyParam(entity: ModelProperty, resourceType: Model);
}
`,"lib/rest.tsp":`import "@typespec/http";
import "./rest-decorators.tsp";
import "./resource.tsp";
import "../dist/src/tsp-index.js";

namespace TypeSpec.Rest;

/**
 * A URL that points to a resource.
 * @template Resource The type of resource that the URL points to.
 */
@doc("The location of an instance of {name}", Resource)
@Private.resourceLocation(Resource)
scalar ResourceLocation<Resource extends {}> extends url;
`}},"@typespec/openapi":{version:"1.16.0",files:{"package.json":`{
  "name": "@typespec/openapi",
  "version": "1.16.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library providing OpenAPI concepts",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0",
    "@typespec/http": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/http": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/rest": "^0.86.0",
    "@typespec/tspd": "^0.77.1"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library && pnpm api-extractor",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/openapi/reference",
    "api-extractor": "api-extractor run --local --verbose"
  }
}`,"lib/decorators.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.OpenAPI;

/**
 * Specify the OpenAPI \`operationId\` property for this operation.
 *
 * @param operationId Operation id value.
 *
 * @example
 *
 * \`\`\`typespec
 * @operationId("download")
 * op read(): string;
 * \`\`\`
 */
extern dec operationId(target: Operation, operationId: valueof string);

/**
 * Attach some custom data to the OpenAPI element generated from this type.
 *
 * @param key Extension key.
 * @param value Extension value.
 *
 * @example
 *
 * \`\`\`typespec
 * @extension("x-custom", "My value")
 * @extension("x-pageable", #{nextLink: "x-next-link"})
 * op read(): string;
 * \`\`\`
 */
extern dec extension(target: unknown, key: valueof string, value: valueof unknown);

/**
 * Specify that this model is to be treated as the OpenAPI \`default\` response.
 * This differs from the compiler built-in \`@error\` decorator as this does not necessarily represent an error.
 *
 * @example
 *
 * \`\`\`typespec
 * @defaultResponse
 * model PetStoreResponse is object;
 *
 * op listPets(): Pet[] | PetStoreResponse;
 * \`\`\`
 */
extern dec defaultResponse(target: Model);

/**
 * Specify the OpenAPI \`externalDocs\` property for this type.
 *
 * @param url Url to the docs
 * @param description Description of the docs
 *
 * @example
 * \`\`\`typespec
 * @externalDocs("https://example.com/detailed.md", "Detailed information on how to use this operation")
 * op listPets(): Pet[];
 * \`\`\`
 */
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);

/** Additional information for the OpenAPI document. */
model AdditionalInfo {
  /** The title of the API. Overrides the \`@service\` title. */
  title?: string;

  /** A short summary of the API. Overrides the \`@summary\` provided on the service namespace. */
  summary?: string;

  /** The version of the OpenAPI document (which is distinct from the OpenAPI Specification version or the API implementation version). */
  version?: string;

  /** A URL to the Terms of Service for the API. MUST be in the format of a URL. */
  termsOfService?: url;

  /** The contact information for the exposed API. */
  contact?: Contact;

  /** The license information for the exposed API. */
  license?: License;

  ...Record<unknown>;
}

/** Contact information for the exposed API. */
model Contact {
  /** The identifying name of the contact person/organization. */
  name?: string;

  /** The URL pointing to the contact information. MUST be in the format of a URL. */
  url?: url;

  /** The email address of the contact person/organization. MUST be in the format of an email address. */
  email?: string;

  ...Record<unknown>;
}

/** License information for the exposed API. */
model License {
  /** The license name used for the API. */
  name: string;

  /** A URL to the license used for the API. MUST be in the format of a URL. Mutually exclusive with \`identifier\`. */
  url?: url;

  /** An SPDX license expression for the API. Mutually exclusive with \`url\`. Only supported in OpenAPI 3.1+. For OpenAPI 3.0, this will be emitted as \`x-oai-license-identifier\`. */
  identifier?: string;

  ...Record<unknown>;
}

/**
 * Specify OpenAPI additional information.
 * The service \`title\` is already specified using \`@service\`.
 * @param additionalInfo Additional information
 */
extern dec info(target: Namespace, additionalInfo: valueof AdditionalInfo);

/** Metadata to a single tag that is used by operations. */
model TagMetadata {
  /** A description of the tag. */
  description?: string;

  /** External documentation information for the tag. */
  externalDocs?: ExternalDocs;

  /** The name of a tag that this tag is nested under. Only supported in OpenAPI 3.2. For 3.0 and 3.1, this will be converted to \`x-parent\`. */
  parent?: string;

  /** A short summary of the tag, used for display purposes. Only supported natively in OpenAPI 3.2. For 3.0 and 3.1, this will be emitted as \`x-oai-summary\`. */
  summary?: string;

  /** A machine-readable string to categorize what sort of tag it is. Any string value can be used. Only supported natively in OpenAPI 3.2. For 3.0 and 3.1, this will be emitted as \`x-oai-kind\`. */
  kind?: string;

  /** Attach some custom data, The extension key must start with \`x-\`. */
  ...Record<unknown>;
}

/** Metadata for a tag that includes the name of the tag. Used with the array form of \`@tagMetadata\`. */
model TagMetadataWithName {
  /** The name of the tag. */
  name: string;

  ...TagMetadata;
}

/** External Docs information. */
model ExternalDocs {
  /** Documentation url */
  url: string;

  /** Optional description */
  description?: string;

  /** Attach some custom data, The extension key must start with \`x-\`. */
  ...Record<unknown>;
}

/**
 * Specify OpenAPI tag metadata. Can be used in two forms:
 * - Inline form: specify a single tag by name with optional metadata.
 * - Array form: specify an ordered list of tags with their metadata in a single decorator call.
 *
 * @param name Tag name (inline form) or array of tags with metadata (array form).
 * @param tagMetadata Additional information for the tag. Only used in inline form.
 *
 * @example Inline form
 * \`\`\`typespec
 * @service()
 * @tagMetadata("Tag Name", #{description: "Tag description", externalDocs: #{url: "https://example.com", description: "More info.", \`x-custom\`: "string"}, \`x-custom\`: "string"})
 * @tagMetadata("Child Tag", #{description: "Child tag description", parent: "Tag Name"})
 * namespace PetStore {}
 * \`\`\`
 *
 * @example Array form (preserves explicit tag order)
 * \`\`\`typespec
 * @service()
 * @tagMetadata(#[
 *   #{ name: "First Tag", description: "First tag description" },
 *   #{ name: "Second Tag", description: "Second tag description" },
 * ])
 * namespace PetStore {}
 * \`\`\`
 */
extern dec tagMetadata(
  target: Namespace,
  name: valueof string | TagMetadataWithName[],
  tagMetadata?: valueof TagMetadata
);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./decorators.tsp";
`}},"@typespec/streams":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/streams",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library providing stream bindings",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/tspd": "^0.77.1",
    "@typespec/library-linter": "^0.86.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test-official": "vitest run --coverage --reporter=junit --reporter=default --no-file-parallelism",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/streams/reference"
  }
}`,"lib/decorators.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.Streams;

/**
 * Specify that a model represents a stream protocol type whose data is described
 * by \`Type\`.
 *
 * @param type The type that models the underlying data of the stream.
 *
 * @example
 *
 * \`\`\`typespec
 * model Message {
 *   id: string;
 *   text: string;
 * }
 *
 * @streamOf(Message)
 * model Response {
 *   @body body: string;
 * }
 * \`\`\`
 */
extern dec streamOf(target: Model, type: unknown);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./decorators.tsp";
import "./types.tsp";
`,"lib/types.tsp":`namespace TypeSpec.Streams;

/**
 * Defines a model that represents a stream protocol type whose data is described
 * by \`Type\`.
 *
 * This can be useful when the underlying data type is not relevant, or to serve as
 * a base type for custom streams.
 *
 * @template Type The type of the stream's data.
 */
@doc("")
@streamOf(Type)
model Stream<Type> {}
`}},"@typespec/graphql":{version:"0.3.0",files:{"package.json":`{
  "name": "@typespec/graphql",
  "version": "0.3.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library for emitting GraphQL",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "tspMain": "lib/main.tsp",
  "main": "dist/src/index.js",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./mutation-engine": {
      "types": "./dist/src/mutation-engine/index.d.ts",
      "default": "./dist/src/mutation-engine/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@alloy-js/core": "^0.24.1",
    "@alloy-js/typescript": "^0.24.0",
    "@pinterest/alloy-graphql": "^1.1.1",
    "change-case": "^5.4.4",
    "graphql": "^17.0.2"
  },
  "files": [
    "lib/*.tsp",
    "tspconfig.yaml",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "~1.16.0",
    "@typespec/http": "~1.16.0",
    "@typespec/emitter-framework": "~0.21.0",
    "@typespec/mutator-framework": "~0.17.1"
  },
  "devDependencies": {
    "@alloy-js/cli": "^0.24.0",
    "@alloy-js/rollup-plugin": "^0.1.2",
    "@types/node": "^26.3.0",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "~1.16.0",
    "@typespec/http": "~1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/mutator-framework": "~0.17.1",
    "@typespec/tspd": "~0.77.1",
    "@typespec/emitter-framework": "~0.21.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && alloy build && pnpm lint-typespec-library",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "watch": "alloy build --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc . --enable-experimental --output-dir ../../website/src/content/docs/docs/emitters/graphql/reference"
  }
}`,"lib/input-type.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Mark a model as a GraphQL input type in the emitted schema.
 *
 * This decorator is applied automatically by the mutation engine when it produces
 * a model that is used in input position. The emitter uses this to emit the model
 * as an \`input\` type rather than an object \`type\`.
 */
internal auto dec inputType(target: Model);
`,"lib/interface.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Mark this model as a GraphQL Interface. Interfaces can be implemented by other models
 * using the \`@compose\` decorator.
 *
 * @param options.interfaceOnly When true, the model will only be emitted as an interface
 * (no "Interface" suffix is added to the name). Use this for abstract interfaces that
 * will never be used directly as output/input types (e.g., Node, Connection). Defaults to false.
 *
 * @example
 *
 * \`\`\`typespec
 * @graphqlInterface(#{ interfaceOnly: true })
 * model Node {
 *   id: string;
 * }
 *
 * @compose(Node)
 * model User {
 *   ...Node;
 *   name: string;
 * }
 * // Emits: interface Node { id: String! }
 * //        type User implements Node { id: String!; name: String! }
 * \`\`\`
 */
extern dec graphqlInterface(
  target: Model,
  options?: valueof {
    interfaceOnly?: boolean,
  }
);

/**
 * Specify the GraphQL interfaces that should be implemented by a model.
 * The interfaces must be decorated with the \`@graphqlInterface\` decorator,
 * and all of the interfaces' properties must be present and compatible.
 *
 * @example
 *
 * \`\`\`typespec
 * @graphqlInterface(#{ interfaceOnly: true })
 * model Node {
 *   id: string;
 * }
 *
 * @compose(Node)
 * model User {
 *   ...Node;
 *   name: string;
 * }
 * \`\`\`
 *
 * @param interfaces The models to compose into the target, each emitted as a GraphQL interface.
 */
extern dec compose(target: Model, ...interfaces: Model[]);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./interface.tsp";
import "./input-type.tsp";
import "./nullable.tsp";
import "./one-of.tsp";
import "./operation-fields.tsp";
import "./operation-kind.tsp";
import "./scalars.tsp";
import "./schema.tsp";
import "./specified-by.tsp";
`,"lib/nullable.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Mark a field, operation, or type as nullable in the emitted GraphQL schema.
 *
 * Applied automatically by the mutation engine when it strips \`| null\` from
 * union types, and can also be applied directly in TypeSpec source.
 */
internal auto dec nullable(target: ModelProperty | Operation | Union | Model);

/**
 * Mark a field or operation as having nullable array elements in the emitted GraphQL schema.
 *
 * Applied automatically by the mutation engine when it detects \`Array<T | null>\`
 * patterns. Causes the emitter to emit \`[T]\` instead of \`[T!]\`.
 */
internal auto dec nullableElements(target: ModelProperty | Operation);
`,"lib/one-of.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Mark a model as a \`@oneOf\` input object in the emitted GraphQL schema.
 *
 * This decorator is applied automatically by the mutation engine when it converts
 * a union type in input context to a synthetic input object (since GraphQL unions
 * are output-only). The emitter uses this to emit the \`@oneOf\` directive.
 *
 * @see https://spec.graphql.org/September2025/#sec-OneOf-Input-Objects
 */
internal auto dec oneOf(target: Model);
`,"lib/operation-fields.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

alias OperationOrInterface = Operation | Interface;

/**
 * Assign one or more operations or interfaces to act as fields with arguments on a model.
 * The operations become fields on the GraphQL type with their parameters as arguments.
 *
 * @example
 *
 * \`\`\`typespec
 * op followers(query: string): Person[];
 *
 * @operationFields(followers)
 * model Person {
 *   name: string;
 * }
 * // Emits: type Person { name: String!; followers(query: String!): [Person!]! }
 * \`\`\`
 *
 * @param operations The operations, or interfaces of operations, to add to the target as fields.
 */
extern dec operationFields(target: Model, ...operations: OperationOrInterface[]);
`,"lib/operation-kind.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Specify the GraphQL Operation kind for the target operation to be \`MUTATION\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @mutation op createUser(name: string): User;
 * \`\`\`
 */
extern dec mutation(target: Operation);

/**
 * Specify the GraphQL Operation kind for the target operation to be \`QUERY\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @query op getUser(id: string): User;
 * \`\`\`
 */
extern dec query(target: Operation);

/**
 * Specify the GraphQL Operation kind for the target operation to be \`SUBSCRIPTION\`.
 *
 * @example
 *
 * \`\`\`typespec
 * @subscription op onUserCreated(): User;
 * \`\`\`
 */
extern dec subscription(target: Operation);
`,"lib/scalars.tsp":`namespace TypeSpec.GraphQL;

/**
 * Represents a GraphQL ID scalar — a unique identifier serialized as a string.
 *
 * @see https://spec.graphql.org/September2025/#sec-ID
 *
 * @example
 *
 * \`\`\`typespec
 * model User {
 *   id: GraphQL.ID;
 *   name: string;
 * }
 * \`\`\`
 */
scalar ID extends string;
`,"lib/schema.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

namespace Schema {
  /** Options for configuring a GraphQL schema. */
  model SchemaOptions {
    /**
     * The name of the GraphQL schema. Used in the output filename when emitting
     * multiple schemas (e.g., \`{name}.graphql\`). Defaults to \`"schema"\`.
     */
    name?: string;
  }
}

/**
 * Mark this namespace as describing a GraphQL schema and configure schema properties.
 * All types and operations within the namespace will be emitted to a single GraphQL schema file.
 *
 * @example
 *
 * \`\`\`typespec
 * @schema(#{ name: "MyAPI" })
 * namespace MyAPI {
 *   model User { id: string; name: string; }
 *   @query op getUser(id: string): User;
 * }
 * // Emits: MyAPI.graphql
 * \`\`\`
 *
 * @param options Options for the schema, such as its name.
 */
extern dec schema(target: Namespace, options?: valueof Schema.SchemaOptions);
`,"lib/specified-by.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.GraphQL;

/**
 * Provide a specification URL for a custom GraphQL scalar type.
 * This maps to the \`@specifiedBy\` directive in the emitted GraphQL schema.
 *
 * @param url URL to the scalar type specification
 * @example
 *
 * \`\`\`typespec
 * @specifiedBy("https://scalars.graphql.org/andimarek/date-time")
 * scalar DateTime extends utcDateTime;
 * \`\`\`
 */
extern dec specifiedBy(target: Scalar, url: valueof url);
`,"tspconfig.yaml":"# Opt this library into the experimental `auto-decorators` feature so that\n# `@nullable` / `@nullableElements` (declared as `auto dec` in lib/nullable.tsp)\n# are permitted in this library's own source. Per-package feature enablement is\n# resolved from the owning package's config, so consumers do not need to enable it.\nkind: project\nfeatures:\n  - auto-decorators\n"}},"@typespec/json-schema":{version:"1.16.0",files:{"package.json":`{
  "name": "@typespec/json-schema",
  "version": "1.16.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library for emitting TypeSpec to JSON Schema and converting JSON Schema to TypeSpec",
  "homepage": "https://github.com/microsoft/typespec",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "TypeSpec",
    "json schema"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "tspMain": "lib/main.tsp",
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "ajv": "^8.20.0",
    "ajv-formats": "^3.0.1",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/internal-build-utils": "^0.86.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/tspd": "^0.77.1"
  },
  "dependencies": {
    "yaml": "^2.9.0",
    "@typespec/asset-emitter": "^0.79.2"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library && pnpm api-extractor",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt  --output-dir ../../website/src/content/docs/docs/emitters/json-schema/reference",
    "api-extractor": "api-extractor run --local --verbose"
  }
}`,"lib/main.tsp":`import "../dist/src/tsp-index.js";

namespace TypeSpec.JsonSchema;

/**
 * Add to namespaces to emit models within that namespace to JSON schema.
 * Add to another declaration to emit that declaration to JSON schema.
 *
 * Optionally, for namespaces, you can provide a baseUri, and for other declarations,
 * you can provide the id.
 *
 * @param baseUri Schema IDs are interpreted as relative to this URI.
 */
extern dec jsonSchema(target: unknown, baseUri?: valueof string);

/**
 * Set the base URI for any schemas emitted from types within this namespace.
 *
 * @param baseUri The base URI. Schema IDs inside this namespace are relative to this URI.
 */
extern dec baseUri(target: Reflection.Namespace, baseUri: valueof string);

/**
 * Specify the JSON Schema id. If this model or a parent namespace has a base URI,
 * the provided ID will be relative to that base URI.
 *
 * By default, the id will be constructed based on the declaration's name.
 *
 * @param id The id of the JSON schema for this declaration.
 */
extern dec id(target: unknown, id: valueof string);

/**
 * Specify that \`oneOf\` should be used instead of \`anyOf\` for that union.
 */
extern dec oneOf(target: Reflection.Union | Reflection.ModelProperty);

/**
 * Specify that the numeric type must be a multiple of some numeric value.
 *
 * @param value The numeric type must be a multiple of this value.
 */
extern dec multipleOf(target: numeric | Reflection.ModelProperty, value: valueof numeric);

/**
 * Specify that the array must contain at least one instance of the provided type.
 * Use \`@minContains\` and \`@maxContains\` to customize how many instances to expect.
 *
 * @param value The type the array must contain.
 */
extern dec contains(target: unknown[] | Reflection.ModelProperty, value: unknown);

/**
 * Used in conjunction with the \`@contains\` decorator,
 * specifies that the array must contain at least a certain number of the types provided by the \`@contains\` decorator.
 *
 * @param value The minimum number of instances the array must contain
 */
extern dec minContains(target: unknown[] | Reflection.ModelProperty, value: valueof int32);

/**
 * Used in conjunction with the \`@contains\` decorator,
 * specifies that the array must contain at most a certain number of the types provided by the \`@contains\` decorator.
 *
 * @param value The maximum number of instances the array must contain
 */
extern dec maxContains(target: unknown[] | Reflection.ModelProperty, value: valueof int32);

/**
 * Specify that every item in the array must be unique.
 */
extern dec uniqueItems(target: unknown[] | Reflection.ModelProperty);

/**
 * Specify the minimum number of properties this object can have.
 *
 * @param value The minimum number of properties this object can have.
 */
extern dec minProperties(target: Record<unknown> | Reflection.ModelProperty, value: valueof int32);

/**
 * Specify the maximum number of properties this object can have.
 *
 * @param value The maximum number of properties this object can have.
 */
extern dec maxProperties(target: Record<unknown> | Reflection.ModelProperty, value: valueof int32);

/**
 * Specify the encoding used for the contents of a string.
 * @param value
 */
extern dec contentEncoding(target: string | Reflection.ModelProperty, value: valueof string);

/**
 * Specify that the target array must begin with the provided types.
 *
 * @param value A tuple containing the types that must be present at the start of the array
 */
extern dec prefixItems(target: unknown[] | Reflection.ModelProperty, value: unknown[]);

/**
 * Specify the content type of content stored in a string.
 *
 * @param value The media type of the string contents
 *
 */
extern dec contentMediaType(target: string | Reflection.ModelProperty, value: valueof string);

/**
 * Specify the schema for the contents of a string when interpreted according to the content's
 * media type and encoding.
 *
 * @param value The schema of the string contents
 */
extern dec contentSchema(target: string | Reflection.ModelProperty, value: unknown);

/**
 * Specify a custom property to add to the emitted schema. This is useful for adding custom keywords
 * and other vendor-specific extensions. Scalar values need to be specified using \`typeof\` to be converted to a schema.
 * 
 * For example, \`@extension("x-schema", typeof "foo")\` will emit a JSON schema value for \`x-schema\`,
 * whereas \`@extension("x-schema", "foo")\` will emit the raw code \`"foo"\`.
 *
 * The value will be treated as a raw value if any of the following are true:
 * - The value is a scalar value (e.g. string, number, boolean, etc.)
 * - The value is wrapped in the \`Json<Data>\` template
 * - The value is provided using the value syntax (e.g. \`#{}\`, \`#[]\`)
 
 * For example, \`@extension("x-schema", { x: "value" })\` will emit a JSON schema value for \`x-schema\`,
 * whereas \`@extension("x-schema", #{x: "value"})\` and \`@extension("x-schema", Json<{x: "value"}>)\`
 * will emit the raw JSON code \`{x: "value"}\`.
 *
 * @param key The name of the keyword of vendor extension, e.g. \`x-custom\`.
 * @param value The value of the keyword.
 */
extern dec extension(target: unknown, key: valueof string, value: (valueof unknown) | unknown);

/**
 * Well-known JSON Schema formats.
 */
enum Format {
  /** A date and time, as defined by the \`date-time\` production in [RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339#section-5.6). */
  dateTime: "date-time",

  /** A calendar date, as defined by the \`full-date\` production in [RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339#section-5.6). */
  date: "date",

  /** A time of day, as defined by the \`full-time\` production in [RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339#section-5.6). */
  time: "time",

  /** An ISO 8601 duration such as \`P3DT4H5M\`, as defined by the \`duration\` production in [RFC 3339, appendix A](https://datatracker.ietf.org/doc/html/rfc3339#appendix-A). */
  duration: "duration",

  /** An email address, as defined by the \`addr-spec\` production in [RFC 5322](https://datatracker.ietf.org/doc/html/rfc5322#section-3.4.1). */
  email: "email",

  /** An internationalized email address, as defined by [RFC 6531](https://datatracker.ietf.org/doc/html/rfc6531). */
  idnEmail: "idn-email",

  /** A host name, as defined by [RFC 1123](https://datatracker.ietf.org/doc/html/rfc1123#section-2.1). */
  hostname: "hostname",

  /** An internationalized host name, as defined by [RFC 5890](https://datatracker.ietf.org/doc/html/rfc5890#section-2.3.2.3). */
  idnHostname: "idn-hostname",

  /** An IPv4 address, as defined by the \`dotted-quad\` production in [RFC 2673](https://datatracker.ietf.org/doc/html/rfc2673#section-3.2). */
  ipv4: "ipv4",

  /** An IPv6 address, as defined by [RFC 4291](https://datatracker.ietf.org/doc/html/rfc4291#section-2.2). */
  ipv6: "ipv6",

  /** A URI, as defined by [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986). */
  uri: "uri",

  /** A URI reference, which may be relative, as defined by [RFC 3986](https://datatracker.ietf.org/doc/html/rfc3986#section-4.1). */
  uriReference: "uri-reference",

  /** An internationalized resource identifier, as defined by [RFC 3987](https://datatracker.ietf.org/doc/html/rfc3987). */
  iri: "iri",

  /** An internationalized resource identifier reference, which may be relative, as defined by [RFC 3987](https://datatracker.ietf.org/doc/html/rfc3987). */
  iriReference: "iri-reference",

  /** A universally unique identifier, as defined by [RFC 4122](https://datatracker.ietf.org/doc/html/rfc4122). */
  uuid: "uuid",

  /** A JSON pointer, as defined by [RFC 6901](https://datatracker.ietf.org/doc/html/rfc6901). */
  jsonPointer: "json-pointer",

  /** A relative JSON pointer, as defined by the [relative JSON pointer draft](https://datatracker.ietf.org/doc/html/draft-handrews-relative-json-pointer-01). */
  relativeJsonPointer: "relative-json-pointer",

  /** A regular expression, as defined by [ECMA-262](https://www.ecma-international.org/publications-and-standards/standards/ecma-262/). */
  regex: "regex",
}

/**
 * Specify that the provided template argument should be emitted as raw JSON or YAML
 * as opposed to a schema. Use in combination with the \`@extension\` decorator. For example,
 * \`@extension("x-schema", { x: "value" })\` will emit a JSON schema value for \`x-schema\`,
 * whereas \`@extension("x-schema", Json<{x: "value"}>)\` will emit the raw JSON code
 * \`{x: "value"}\`.
 *
 * @template Data the type to convert to raw JSON
 */
@Private.validatesRawJson(Data)
model Json<Data> {
  /** The value to emit as raw JSON or YAML. */
  value: Data;
}

namespace Private {
  extern dec validatesRawJson(target: Reflection.Model, value: unknown);
}
`}},"@typespec/protobuf":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/protobuf",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library and emitter for Protobuf (gRPC)",
  "homepage": "https://github.com/microsoft/typespec",
  "readme": "https://github.com/microsoft/typespec/blob/main/packages/protobuf/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec",
    "protobuf",
    "grpc"
  ],
  "main": "dist/src/index.js",
  "exports": {
    ".": {
      "typespec": "./lib/proto.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": "./dist/src/testing/index.js"
  },
  "type": "module",
  "tspMain": "lib/proto.tsp",
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0"
  },
  "devDependencies": {
    "@types/micromatch": "^4.0.10",
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "micromatch": "^4.0.8",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/tspd": "^0.77.1"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "test": "vitest run",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/emitters/protobuf/reference"
  }
}`,"lib/proto.tsp":'import "../dist/src/tsp-index.js";\n\nnamespace TypeSpec.Protobuf;\n\n/**\n * A model that represents an external Protobuf reference. This type can be used to import and utilize Protobuf\n * declarations that are not declared in TypeSpec within TypeSpec sources. When the emitter encounters an `Extern`, it\n * will insert an `import` statement for the corresponding `Path` and refer to the type by `Name`.\n *\n * #### Usage\n *\n * If you have a file called `test.proto` that declares a package named `test` and a message named `Widget`, you can\n * use the `Extern` type to declare a model in TypeSpec that refers to your external definition of `test.Widget`. See\n * the example below.\n *\n * When the TypeSpec definition of `Widget` is encountered, the Protobuf emitter will represent it as a reference to\n * `test.Widget` and insert an import for it, rather than attempt to convert the model to an equivalent message.\n *\n * @template Path the relative path to a `.proto` file to import\n * @template Name the fully-qualified reference to the type this model represents within the `.proto` file\n *\n * @example\n *\n * ```typespec\n * model Widget is Extern<"path/to/test.proto", "test.Widget">;\n * ```\n */\n@Private.externRef(Path, Name)\nmodel Extern<Path extends string, Name extends string> {\n  /**\n   * Never present. This property exists only so that `getEffectiveModelType` has something to look\n   * up: without it, an `Extern` model spread into an operation parameter yields an empty model that\n   * cannot be related back to its original definition.\n   */\n  _extern: never;\n}\n\n/**\n * Contains some common well-known Protobuf types defined by the google.protobuf library.\n */\nnamespace WellKnown {\n  /**\n   * An empty message.\n   *\n   * This model references `google.protobuf.Empty` from `google/protobuf/empty.proto`.\n   */\n  model Empty is Extern<"google/protobuf/empty.proto", "google.protobuf.Empty">;\n\n  /**\n   * A timestamp.\n   *\n   * This model references `google.protobuf.Timestamp` from `google/protobuf/timestamp.proto`.\n   */\n  model Timestamp is Extern<"google/protobuf/timestamp.proto", "google.protobuf.Timestamp">;\n\n  /**\n   * Any value.\n   *\n   * This model references `google.protobuf.Any` from `google/protobuf/any.proto`.\n   */\n  model Any is Extern<"google/protobuf/any.proto", "google.protobuf.Any">;\n\n  /**\n   * A latitude and longitude.\n   *\n   * This model references `google.type.LatLng` from `google/type/latlng.proto`.\n   */\n  model LatLng is Extern<"google/type/latlng.proto", "google.type.LatLng">;\n}\n\n/**\n * A signed 32-bit integer that will use the `sint32` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Uses variable-length encoding. These more efficiently encode negative numbers than regular int32s.\n */\nscalar sint32 extends int32;\n\n/**\n * A signed 64-bit integer that will use the `sint64` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Uses variable-length encoding. These more efficiently encode negative numbers than regular `int64s`.\n */\nscalar sint64 extends int64;\n\n/**\n * A signed 32-bit integer that will use the `sfixed32` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Always four bytes.\n */\nscalar sfixed32 extends int32;\n\n/**\n * A signed 64-bit integer that will use the `sfixed64` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Always eight bytes.\n */\nscalar sfixed64 extends int64;\n\n/**\n * An unsigned 32-bit integer that will use the `fixed32` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Always four bytes. More efficient than `uint32` if values are often greater than 2<sup>28</sup>.\n */\nscalar fixed32 extends uint32;\n\n/**\n * An unsigned 64-bit integer that will use the `fixed64` encoding when used in a Protobuf message.\n *\n * #### Protobuf binary format\n *\n * Always eight bytes. More efficient than `uint64` if values are often greater than 2<sup>56</sup>.\n */\nscalar fixed64 extends uint64;\n\n/**\n * Types recognized as "integral" types\n */\nalias integral = int32 | int64 | uint32 | uint64 | boolean;\n\n/**\n * A type representing a Protobuf `map`. Instances of this type in models will be converted to the built-in `map` type\n * in Protobuf.\n *\n * The key type of a Protobuf `map` must be any integral type or `string`. The value type can be any type other than\n * another `Map`.\n *\n * @template Key the key type (any integral type or string)\n * @template Value the value type (any type other than another map)\n */\n@Private._map\nmodel Map<Key extends integral | string, Value> {}\n\n/**\n * Declares that a model is a Protobuf message.\n *\n * Messages can be detected automatically if either of the following two conditions are met:\n *\n * - The model has a `@field` annotation on all of its properties.\n * - The model is referenced by any service operation.\n *\n * This decorator will force the emitter to check and emit a model.\n */\nextern dec message(target: {});\n\n/**\n * Defines the field index of a model property for conversion to a Protobuf\n * message.\n *\n * The field index of a Protobuf message must:\n *   - fall between 1 and 2<sup>29</sup> - 1, inclusive.\n *   - not fall within the implementation reserved range of 19000 to 19999, inclusive.\n *   - not fall within any range that was [marked reserved](#%40TypeSpec.Protobuf.reserve).\n *\n * #### API Compatibility Note\n *\n * Fields are accessed by index, so changing the index of a field is an API breaking change.\n *\n * #### Encoding\n *\n * Field indices between 1 and 15 are encoded using a single byte, while field indices from 16 through 2047 require two\n * bytes, so those indices between 1 and 15 should be preferred and reserved for elements that are frequently or always\n * set in the message. See the [Protobuf binary format](https://protobuf.dev/programming-guides/encoding/).\n *\n * @param index The whole-number index of the field.\n *\n * @example\n *\n * ```typespec\n * model ExampleMessage {\n *   @field(1)\n *   test: string;\n * }\n * ```\n */\nextern dec field(target: TypeSpec.Reflection.ModelProperty, index: valueof uint32);\n\n/**\n * Reserve a field index, range, or name. If a field definition collides with a reservation, the emitter will produce\n * an error.\n *\n * This decorator accepts multiple reservations. Each reservation is one of the following:\n *\n * - a `string`, in which case the reservation refers to a field name.\n * - a `uint32`, in which case the reservation refers to a field index.\n * - a tuple `[uint32, uint32]`, in which case the reservation refers to a field range that is _inclusive_ of both ends.\n *\n * Unlike in Protobuf, where field name and index reservations must be separated, you can mix string and numeric field\n * reservations in a single `@reserve` call in TypeSpec.\n *\n * #### API Compatibility Note\n *\n * Field reservations prevent users of your Protobuf specification from using the given field names or indices. This can\n * be useful if a field is removed, as it will further prevent adding a new, incompatible field and will prevent users\n * from utilizing the field index at runtime in a way that may break compatibility with users of older specifications.\n *\n * See _[Protobuf Language Guide - Reserved Fields](https://protobuf.dev/programming-guides/proto3/#reserved)_ for more\n * information.\n *\n * @param reservations a list of field reservations\n *\n * @example\n *\n * ```typespec\n * // Reserve the fields 8-15 inclusive, 100, and the field name "test" within a model.\n * @reserve([8, 15], 100, "test")\n * model Example {\n *   // ...\n * }\n * ```\n */\nextern dec reserve(target: {}, ...reservations: valueof (string | [uint32, uint32] | uint32)[]);\n\n/**\n * Declares that a TypeSpec interface constitutes a Protobuf service. The contents of the interface will be converted to\n * a `service` declaration in the resulting Protobuf file.\n */\nextern dec service(target: TypeSpec.Reflection.Interface);\n\n// FIXME: cannot link to the package decorator directly because it is detected as a broken link.\n/**\n * Details applied to a package definition by the [`@package`](./decorators#%40TypeSpec.Protobuf.package) decorator.\n */\nmodel PackageDetails {\n  /**\n   * The package\'s name.\n   *\n   * By default, the package\'s name is constructed from the namespace it is applied to.\n   */\n  name?: string;\n\n  /**\n   * The package\'s top-level options.\n   *\n   * See the [Protobuf Language Guide - Options](https://protobuf.dev/programming-guides/proto3/#options) for more information.\n   *\n   * Currently, only string, boolean, and numeric options are supported.\n   */\n  options?: Record<string | boolean | numeric>;\n}\n\n/**\n * Declares that a TypeSpec namespace constitutes a Protobuf package. The contents of the namespace will be emitted to a\n * single Protobuf file.\n *\n * @param details the optional details of the package\n */\nextern dec `package`(target: TypeSpec.Reflection.Namespace, details?: PackageDetails);\n\n/**\n * The streaming mode of an operation. One of:\n *\n * - `Duplex`: both the input and output of the operation are streaming.\n * - `In`: the input of the operation is streaming.\n * - `Out`: the output of the operation is streaming.\n * - `None`: neither the input nor the output are streaming.\n *\n * See the [`@stream`](./decorators#%40TypeSpec.Protobuf.stream) decorator.\n */\nenum StreamMode {\n  /**\n   * Both the input and output of the operation are streaming. Both the client and service will stream messages to each\n   * other until the connections are closed.\n   */\n  Duplex,\n\n  /**\n   * The input of the operation is streaming. The client will send a stream of events; and, once the stream is closed,\n   * the service will respond with a message.\n   */\n  In,\n\n  /**\n   * The output of the operation is streaming. The client will send a message to the service, and the service will send\n   * a stream of events back to the client.\n   */\n  Out,\n\n  /**\n   * Neither the input nor the output are streaming. This is the default mode of an operation without the `@stream`\n   * decorator.\n   */\n  None,\n}\n\n/**\n * Set the streaming mode of an operation. See [StreamMode](./data-types#TypeSpec.Protobuf.StreamMode) for more information.\n *\n * @param mode The streaming mode to apply to this operation.\n *\n * @example\n *\n * ```typespec\n * @stream(StreamMode.Out)\n * op logs(...LogsRequest): LogEvent;\n * ```\n *\n * @example\n *\n * ```typespec\n * @stream(StreamMode.Duplex)\n * op connectToMessageService(...Message): Message;\n * ```\n */\nextern dec stream(target: TypeSpec.Reflection.Operation, mode: StreamMode);\n\nnamespace Private {\n  extern dec externRef(target: Reflection.Model, path: string, name: string);\n  extern dec _map(target: Reflection.Model);\n}\n'}},"@typespec/versioning":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/versioning",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library for declaring and emitting versioned APIs",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/tspd": "^0.77.1",
    "@typespec/library-linter": "^0.86.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/versioning/reference"
  }
}`,"lib/decorators.tsp":`import "../dist/src/decorators.js";

using TypeSpec.Reflection;

namespace TypeSpec.Versioning;

/**
 * Identifies that the decorated namespace is versioned by the provided enum.
 * @param versions The enum that describes the supported versions.
 *
 * @example
 *
 * \`\`\`tsp
 * @versioned(Versions)
 * namespace MyService;
 * enum Versions {
 *   v1,
 *   v2,
 *   v3,
 * }
 * \`\`\`
 */
extern dec versioned(target: Namespace, versions: Enum);

/**
 * Identifies that a namespace or a given versioning enum member relies upon a versioned package.
 * @param versionRecords The dependent library version(s) for the target namespace or version.
 *
 * @example Select a single version of \`MyLib\` to use
 *
 * \`\`\`tsp
 * @useDependency(MyLib.Versions.v1_1)
 * namespace NonVersionedService;
 * \`\`\`
 *
 * @example Select which version of the library match to which version of the service.
 *
 * \`\`\`tsp
 * @versioned(Versions)
 * namespace MyService1;
 * enum Version {
 *   @useDependency(MyLib.Versions.v1_1) // V1 use lib v1_1
 *   v1,
 *   @useDependency(MyLib.Versions.v1_1) // V2 use lib v1_1
 *   v2,
 *   @useDependency(MyLib.Versions.v2) // V3 use lib v2
 *   v3,
 * }
 * \`\`\`
 */
extern dec useDependency(target: EnumMember | Namespace, ...versionRecords: EnumMember[]);

/**
 * Identifies when the target was added.
 * @param version The version that the target was added in.
 *
 * @example
 *
 * \`\`\`tsp
 * @added(Versions.v2)
 * op addedInV2(): void;
 *
 * @added(Versions.v2)
 * model AlsoAddedInV2 {}
 *
 * model Foo {
 *   name: string;
 *
 *   @added(Versions.v3)
 *   addedInV3: string;
 * }
 * \`\`\`
 */
extern dec added(
  target:
    | Model
    | ModelProperty
    | Operation
    | Enum
    | EnumMember
    | Union
    | UnionVariant
    | Scalar
    | Interface,
  version: EnumMember
);

/**
 * Identifies when the target was removed.
 * @param version The version that the target was removed in.
 *
 * @example
 * \`\`\`tsp
 * @removed(Versions.v2)
 * op removedInV2(): void;
 *
 * @removed(Versions.v2)
 * model AlsoRemovedInV2 {}
 *
 * model Foo {
 *   name: string;
 *
 *   @removed(Versions.v3)
 *   removedInV3: string;
 * }
 * \`\`\`
 */
extern dec removed(
  target:
    | Model
    | ModelProperty
    | Operation
    | Enum
    | EnumMember
    | Union
    | UnionVariant
    | Scalar
    | Interface,
  version: EnumMember
);

/**
 * Identifies when the target has been renamed.
 * @param version The version that the target was renamed in.
 * @param oldName The previous name of the target.
 *
 * @example
 * \`\`\`tsp
 * @renamedFrom(Versions.v2, "oldName")
 * op newName(): void;
 * \`\`\`
 */
extern dec renamedFrom(
  target:
    | Model
    | ModelProperty
    | Operation
    | Enum
    | EnumMember
    | Union
    | UnionVariant
    | Scalar
    | Interface,
  version: EnumMember,
  oldName: valueof string
);

/**
 * Identifies when a target was made optional.
 * @param version The version that the target was made optional in.
 *
 * @example
 *
 * \`\`\`tsp
 * model Foo {
 *   name: string;
 *   @madeOptional(Versions.v2)
 *   nickname?: string;
 * }
 * \`\`\`
 */
extern dec madeOptional(target: ModelProperty, version: EnumMember);

/**
 * Identifies when a target was made required.
 * @param version The version that the target was made required in.
 *
 * @example
 *
 * \`\`\`tsp
 * model Foo {
 *   name: string;
 *   @madeRequired(Versions.v2)
 *   nickname: string;
 * }
 * \`\`\`
 */
extern dec madeRequired(target: ModelProperty, version: EnumMember);

/**
 * Declares that the type of a model property has changed starting at a given version,
 * while keeping earlier versions consistent with the previous type.
 *
 * This decorator is used to track type changes across API versions. When applied,
 * the property will use \`oldType\` in versions before the specified \`version\`,
 * and the current type definition in the specified version and later.
 *
 * @param version The version when the type change takes effect. The new type applies
 *                from this version onwards, while the old type applies to earlier versions.
 * @param oldType The previous type used before the specified version.
 *
 * @example
 *
 * \`\`\`tsp
 * model Foo {
 *   // In v1: id is a string
 *   // In v2+: id is an int32
 *   @typeChangedFrom(Versions.v2, string)
 *   id: int32;
 * }
 * \`\`\`
 */
extern dec typeChangedFrom(target: ModelProperty, version: EnumMember, oldType: unknown);

/**
 * Declares that the return type of an operation has changed starting at a given version,
 * while keeping earlier versions consistent with the previous return type.
 *
 * This decorator is used to track return type changes across API versions. When applied,
 * the operation will return \`oldType\` in versions before the specified \`version\`,
 * and the current return type definition in the specified version and later.
 *
 * @param version The version when the return type change takes effect. The new return type applies
 *                from this version onwards, while the old return type applies to earlier versions.
 * @param oldType The previous return type used before the specified version.
 *
 * @example
 *
 * \`\`\`tsp
 * // In v1: returns a string
 * // In v2+: returns an int32
 * @returnTypeChangedFrom(Versions.v2, string)
 * op getUserId(): int32;
 * \`\`\`
 */
extern dec returnTypeChangedFrom(target: Operation, version: EnumMember, oldType: unknown);
`,"lib/main.tsp":`import "./decorators.tsp";
import "../dist/src/validate.js";
`}},"@typespec/openapi3":{version:"1.16.0",files:{"package.json":`{
  "name": "@typespec/openapi3",
  "version": "1.16.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library for emitting OpenAPI 3.0 and OpenAPI 3.1 from the TypeSpec REST protocol binding and converting OpenAPI3 to TypeSpec",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "bin": {
    "tsp-openapi3": "cmd/tsp-openapi3.js"
  },
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "types": "./dist/src/index.d.ts",
      "default": "./dist/src/index.js"
    },
    "./testing": {
      "types": "./dist/src/testing/index.d.ts",
      "default": "./dist/src/testing/index.js"
    }
  },
  "imports": {
    "#test/*": "./test/*"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "dependencies": {
    "@scalar/json-magic": "^0.13.2",
    "@scalar/openapi-parser": "^0.28.16",
    "@scalar/openapi-types": "^0.9.5",
    "yaml": "^2.9.0",
    "@typespec/asset-emitter": "^0.79.2"
  },
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0",
    "@typespec/events": "^0.86.0",
    "@typespec/http": "^1.16.0",
    "@typespec/json-schema": "^1.16.0",
    "@typespec/openapi": "^1.16.0",
    "@typespec/sse": "^0.86.0",
    "@typespec/streams": "^0.86.0",
    "@typespec/versioning": "^0.86.0"
  },
  "peerDependenciesMeta": {
    "@typespec/json-schema": {
      "optional": true
    },
    "@typespec/xml": {
      "optional": true
    },
    "@typespec/versioning": {
      "optional": true
    },
    "@typespec/streams": {
      "optional": true
    },
    "@typespec/events": {
      "optional": true
    },
    "@typespec/sse": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@types/yargs": "^17.0.35",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "cross-env": "^10.1.0",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/json-schema": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/rest": "^0.86.0",
    "@typespec/sse": "^0.86.0",
    "@typespec/openapi": "^1.16.0",
    "@typespec/streams": "^0.86.0",
    "@typespec/xml": "^0.86.0",
    "@typespec/versioning": "^0.86.0",
    "@typespec/tspd": "^0.77.1",
    "@typespec/events": "^0.86.0",
    "@typespec/http": "^1.16.0",
    "@typespec/compiler": "^1.16.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && pnpm quickbuild && pnpm lint-typespec-library",
    "quickbuild": "tsc -p tsconfig.build.json",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test:ci": "vitest run --coverage --reporter=junit --reporter=default",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/emitters/openapi3/reference",
    "regen-specs": "cross-env RECORD=true vitest run",
    "api-extractor": "api-extractor run --local --verbose"
  }
}`,"lib/decorators.tsp":`import "../dist/src/tsp-index.js";

namespace TypeSpec.OpenAPI;

using TypeSpec.Reflection;

/**
 * Specify that \`oneOf\` should be used instead of \`anyOf\` for that union.
 */
extern dec oneOf(target: Union | ModelProperty);
/**
 * Specify an external reference that should be used inside of emitting this type.
 * @param ref External reference(e.g. "../../common.json#/components/schemas/Foo")
 */
extern dec useRef(target: Model | ModelProperty, ref: valueof string);
`,"lib/main.tsp":`import "./decorators.tsp";
`}},"@typespec/sse":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/sse",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library providing server sent events bindings",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "default": "./dist/src/index.js"
    },
    "./testing": "./dist/src/testing/index.js"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0",
    "@typespec/events": "^0.86.0",
    "@typespec/http": "^1.16.0",
    "@typespec/streams": "^0.86.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/events": "^0.86.0",
    "@typespec/http": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/tspd": "^0.77.1",
    "@typespec/streams": "^0.86.0"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test-official": "vitest run --coverage --reporter=junit --reporter=default --no-file-parallelism",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental  --output-dir ../../website/src/content/docs/docs/libraries/sse/reference"
  }
}`,"lib/decorators.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.SSE;

/**
 * Indicates that the presence of this event is a terminal event,
 * and the client should disconnect from the server.
 */
extern dec terminalEvent(target: UnionVariant);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./decorators.tsp";
import "./types.tsp";
`,"lib/types.tsp":`import "@typespec/http/streams";

using Http.Streams;

namespace TypeSpec.SSE;

/**
 * Describes a stream of server-sent events.
 *
 * The content-type is set to \`text/event-stream\`.
 *
 * The server-sent events are described by \`Type\`.
 * The event type for any event can be defined by using named union variants.
 * When a union variant is not named, it is considered a 'message' event.
 *
 * @template Type The set of models describing the server-sent events.
 *
 * @example Mix of named union variants and terminal event
 *
 * \`\`\`typespec
 * model UserConnect {
 *   username: string;
 *   time: string;
 * }
 *
 * model UserMessage {
 *   username: string;
 *   time: string;
 *   text: string;
 * }
 *
 * model UserDisconnect {
 *   username: string;
 *   time: string;
 * }
 *
 * @TypeSpec.Events.events
 * union ChannelEvents {
 *   userconnect: UserConnect,
 *   usermessage: UserMessage,
 *   userdisconnect: UserDisconnect,
 *
 *   @Events.contentType("text/plain")
 *   @terminalEvent
 *   "[unsubscribe]",
 * }
 *
 * op subscribeToChannel(): SSEStream<ChannelEvents>;
 * \`\`\`
 */
@doc("")
model SSEStream<Type extends TypeSpec.Reflection.Union> is HttpStream<Type, "text/event-stream">;
`}},"@typespec/events":{version:"0.86.0",files:{"package.json":`{
  "name": "@typespec/events",
  "version": "0.86.0",
  "author": "Microsoft Corporation",
  "description": "TypeSpec library providing events bindings",
  "homepage": "https://typespec.io",
  "readme": "https://github.com/microsoft/typespec/blob/main/README.md",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/microsoft/typespec.git"
  },
  "bugs": {
    "url": "https://github.com/microsoft/typespec/issues"
  },
  "keywords": [
    "typespec"
  ],
  "type": "module",
  "main": "dist/src/index.js",
  "tspMain": "lib/main.tsp",
  "exports": {
    ".": {
      "typespec": "./lib/main.tsp",
      "default": "./dist/src/index.js"
    },
    "./testing": "./dist/src/testing/index.js",
    "./experimental": {
      "types": "./dist/src/experimental/index.d.ts",
      "default": "./dist/src/experimental/index.js"
    }
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "files": [
    "lib/*.tsp",
    "dist/**",
    "!dist/test/**"
  ],
  "peerDependencies": {
    "@typespec/compiler": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^26.3.0",
    "@vitest/coverage-v8": "^4.1.11",
    "@vitest/ui": "^4.1.11",
    "rimraf": "^6.1.3",
    "typescript": "~6.0.2",
    "vitest": "^4.1.11",
    "@typespec/compiler": "^1.16.0",
    "@typespec/library-linter": "^0.86.0",
    "@typespec/tspd": "^0.77.1"
  },
  "scripts": {
    "clean": "rimraf ./dist ./temp",
    "build": "pnpm gen-extern-signature && tsc -p tsconfig.build.json && pnpm lint-typespec-library",
    "watch": "tsc -p tsconfig.build.json --watch",
    "gen-extern-signature": "tspd --enable-experimental gen-extern-signature .",
    "lint-typespec-library": "tsp compile . --warn-as-error --import @typespec/library-linter --no-emit",
    "test": "vitest run",
    "test:watch": "vitest -w",
    "test:ui": "vitest --ui",
    "test-official": "vitest run --coverage --reporter=junit --reporter=default --no-file-parallelism",
    "lint": "oxlint . --deny-warnings",
    "lint:fix": "oxlint . --fix",
    "regen-docs": "tspd doc .  --enable-experimental --llmstxt --output-dir ../../website/src/content/docs/docs/libraries/events/reference"
  }
}`,"lib/decorators.tsp":`using TypeSpec.Reflection;

namespace TypeSpec.Events;

/**
 * Specify that this union describes a set of events.
 *
 * @example
 *
 * \`\`\`typespec
 * @events
 * union MixedEvents {
 *   pingEvent: string;
 *
 *   doneEvent: "done";
 * }
 * \`\`\`
 */
extern dec events(target: Union);

/**
 * Specifies the content type of the event envelope, event body, or event payload.
 * When applied to an event payload, that field must also have a corresponding \`@data\`
 * decorator.
 *
 * @example
 *
 * \`\`\`typespec
 * @events union MixedEvents {
 *   @contentType("application/json")
 *   message: { id: string, text: string, }
 * }
 * \`\`\`
 *
 * @example Specify the content type of the event payload.
 *
 * \`\`\`typespec
 * @events union MixedEvents {
 *   { done: true },
 *
 *   { done: false, @data @contentType("text/plain") value: string,}
 * }
 * \`\`\`
 *
 * @param contentType The content type of the event or event payload.
 */
extern dec contentType(target: UnionVariant | ModelProperty, contentType: valueof string);

/**
 * Identifies the payload of an event.
 * Only one field in an event can be marked as the payload.
 *
 * @example
 *
 * \`\`\`typespec
 * @events union MixedEvents {
 *   { metadata: Record<string>, @data payload: string,}
 * }
 * \`\`\`
 */
extern dec data(target: ModelProperty);
`,"lib/main.tsp":`import "../dist/src/tsp-index.js";
import "./decorators.tsp";
`}}};var typeSpecLibraries=libraries_default;var package_default={id:"umf.typespec",version:"0.1.0",coreVersion:"0.10.0",description:"TypeSpec source bundles with pinned syntax and supplied-file compilation",schema:{$schema:"https://json-schema.org/draft/2020-12/schema",$id:"urn:umf:typespec:0.1.0",type:"object",required:["profile","entrypoint","files"],properties:{profile:{const:"typespec-1.16.0-sources"},entrypoint:{type:"string",minLength:1},files:{type:"object",minProperties:1,propertyNames:{type:"string",minLength:1},additionalProperties:{type:"string"}},libraries:{type:"object",propertyNames:{type:"string",minLength:1},additionalProperties:{type:"string",minLength:1}}}},scopes:["element"],semantics:"CONTRACT-013. Exact source files and explicit entrypoint; compiler validity and downstream projection fidelity are separate.",capabilities:{validation:"semantic",directions:["import","export"],native:{system:"TypeSpec",version:"1.16.0",subset:"Supplied .tsp sources with pinned compiler/standard library and eleven explicitly selected official library versions; library-owned configuration retained; separate pinned JSON Schema emission API; no arbitrary project JavaScript or lossless projection claim"},evidence:["tests/typespec/native.test.ts","fixtures/typespec/compiler-oracle-results.json","spec/extensions/typespec/standard-manifest.json","tests/typespec/semantic.test.ts","fixtures/typespec/semantic-oracle-results.json","tests/typespec/corpus.test.ts","fixtures/typespec/upstream/manifest.json","fixtures/typespec/corpus-results.json","fixtures/typespec/corpus-oracle-results.json","tests/typespec/libraries.test.ts","spec/extensions/typespec/libraries-manifest.json","fixtures/typespec/library-corpus-results.json","fixtures/typespec/library-corpus-oracle-results.json","tests/typespec/all-libraries.test.ts","fixtures/typespec/all-library-corpus-results.json","fixtures/typespec/all-library-corpus-oracle-results.json","tests/typespec/emission.test.ts","fixtures/typespec/emission-oracle-results.json","fixtures/typespec/emission-json-oracle-results.json","fixtures/typespec/emission/numeric.tsp","fixtures/typespec/emission/numeric-oracle-results.json","tests/typespec/projection.test.ts","fixtures/typespec/emission/projection-oracle-results.json"]}};var noContext=new Set(["modelPropertyReference","enumMemberReference"]);var noReferenceContext=new Set([...noContext,"booleanLiteral","stringTemplate","stringLiteral","numericLiteral","scalarInstantiation","enumMember","enumMembers","intrinsic"]);var placeholderSym=Symbol("placeholder"),setSym=Symbol("ObjectBuilder.set");var TYPESPEC_EXTENSION="umf.typespec",typespecPackage=package_default;var structure=createValidator().compile(package_default.schema);function inspect(value){let p=value,out=[];for(let key of Object.keys(p))if(!["profile","entrypoint","files","libraries"].includes(key))out.push({code:"TYPESPEC_REPRESENTATION",path:"/"+pointer(key),severity:"warning",message:"Unknown source representation field cannot be emitted natively"});for(let[name,version]of Object.entries(p.libraries??{}))if(!Object.hasOwn(typeSpecLibraries,name)||typeSpecLibraries[name].version!==version)out.push({code:"TYPESPEC_LIBRARY_UNAVAILABLE",path:"/libraries/"+pointer(name),severity:"warning",message:"Unregistered library selection retained: "+name+"@"+version});if(!Object.hasOwn(p.files,p.entrypoint))out.push({code:"TYPESPEC_ENTRYPOINT",path:"/entrypoint",severity:"error",message:"Entrypoint must name a supplied file"});let size=0;for(let[path,text]of Object.entries(p.files)){if(!/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.tsp$/.test(path)||path.split("/").some((x)=>x==="."||x==="..")){out.push({code:"TYPESPEC_PATH",path:"/files/"+pointer(path),severity:"error",message:"Source paths must be relative .tsp paths without traversal"});continue}if(size+=text.length,size>LIMITS.maxTextLength){out.push({code:"LIMIT",path:"/files",severity:"error",message:"Source bundle exceeds text limit"});break}try{for(let d of parse2(text,{comments:!0,docs:!0}).parseDiagnostics)out.push({code:"TYPESPEC_"+d.code,path:"/files/"+pointer(path),severity:d.severity,message:d.message})}catch(error){out.push({code:"TYPESPEC_PARSE",path:"/files/"+pointer(path),severity:"error",message:String(error)})}}return out.push({code:"TYPESPEC_COMPILATION_REQUIRED",path:"",severity:"warning",message:"Syntax preservation does not establish compiler validity; call compileTypeSpecDocument with supplied imports"}),out}function typespecRegistry(){return new Registry().register(typespecPackage,inspect)}function inspectTypeSpec(document){return validateDocument(document,typespecRegistry())}function payload(document){let checked=inspectTypeSpec(document);if(!checked.valid)throw new UmfError("TYPESPEC_DOCUMENT",JSON.stringify(checked.diagnostics));let value=document.modules.find((m)=>m.id==="schema")?.elements.find((e)=>e.id==="schema")?.extensions[TYPESPEC_EXTENSION];if(document.vocabularies[TYPESPEC_EXTENSION]?.version!=="0.1.0"||!structure(value))throw new UmfError("TYPESPEC_PAYLOAD","Missing TypeSpec source bundle");return copyJson(value)}function exportTypeSpecSources(document){let p=payload(document);if(inspectTypeSpec(document).diagnostics.some((d)=>d.code==="TYPESPEC_REPRESENTATION"))throw new UmfError("TYPESPEC_REPRESENTATION","Native export would discard unknown content");return{entrypoint:p.entrypoint,files:p.files,...p.libraries?{libraries:p.libraries}:{}}}export{exportTypeSpecSources};
