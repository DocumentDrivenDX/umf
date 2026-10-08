import {generateDatasetSourceSchema} from './source-schema';
/** Portable pack metadata only; implementation references never authorize execution. */
export function generateDomainPackSchema() {
  const text = {type: 'string', minLength: 1};
  const version = {type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$'};
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'urn:umf:domain-pack:1.0.0', type: 'object',
    required: ['id', 'version', 'domain_types'],
    anyOf: [{properties:{generator:{}},required:['generator']},{properties:{sources:{}},required:['sources']}],
    properties: {
      id: text, version, description: {type: 'string'},
      generator: {type: 'object', required: ['id', 'version'],
        properties: {id: text, version}, additionalProperties: true},
      domain_types: {type: 'object', minProperties: 1,
        propertyNames: {type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$'},
        additionalProperties: {type: 'object', properties: {
          description: {type: 'string'},
          sample_generation: {type: 'object', required: ['method'],
            properties: {method: {type: 'string', pattern: '^generate_[A-Za-z0-9_]+$'}},
            additionalProperties: true},
          detection: {type: 'object'},
        }, additionalProperties: true}},
      scale_presets: {type:'object',additionalProperties:{type:'object',required:['roots','children'],properties:{roots:{type:'object',additionalProperties:{type:'integer',minimum:0}},children:{type:'object',additionalProperties:{type:'object',required:['parent','per_parent'],properties:{parent:text,per_parent:{type:'number',minimum:0},distribution:{enum:['uniform','skewed']}},additionalProperties:true}}},additionalProperties:true}},
      sources: {type:'object',minProperties:1,additionalProperties:generateDatasetSourceSchema()},
      source_bindings: {type:'array',items:{type:'object',required:['schema_id','source_id','role'],properties:{schema_id:text,source_id:text,role:{enum:['rows','reference','terminology']}},additionalProperties:true}},
      schemas: {type: 'array', items: {type: 'object', required: ['id','format','reference'],
        properties: {id: text, format: text, reference: text}, additionalProperties: true}},
    }, additionalProperties: true,
  } as const;
}
