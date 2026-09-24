import "@typespec/json-schema";
using TypeSpec.JsonSchema;

// Authored boundary fixture: exact source must survive native emitter losses.
@jsonSchema
model NumericBoundary {
  signed: int64;
  unsigned: uint64;
  literal: 9007199254740993;
  @minValue(0) @maxValue(100)
  percent: int32;
}
