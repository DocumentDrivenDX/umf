package umf;
import org.teavm.jso.JSExport;
import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.model.shapes.ModelSerializer;
public final class SmithyBrowser {
 @JSExport
 public static String jsonSchema(String modelJson, String rootShape) {
  return emitJsonSchema(modelJson,rootShape,false,null);
 }
 @JSExport
 public static String jsonSchemaWithRootDefinition(String modelJson, String rootShape) {
  return emitJsonSchema(modelJson,rootShape,true,null);
 }
 @JSExport
 public static String jsonSchemaForService(String modelJson,String rootShape,String serviceContext,boolean addRootDefinition) {
  return emitJsonSchema(modelJson,rootShape,addRootDefinition,serviceContext);
 }
 private static String emitJsonSchema(String modelJson,String rootShape,boolean addRootDefinition,String serviceContext) {
  var model=Model.assembler().addUnparsedModel("emission.json",modelJson).assemble().unwrap();
  var root=model.expectShape(software.amazon.smithy.model.shapes.ShapeId.from(rootShape));
  if(root.isServiceShape()||root.isResourceShape()||root.isOperationShape()||root.isMemberShape())throw new IllegalArgumentException("JSON Schema root must be a data shape");
  var config=new software.amazon.smithy.jsonschema.JsonSchemaConfig();
  if(serviceContext!=null){
   var service=model.expectShape(software.amazon.smithy.model.shapes.ShapeId.from(serviceContext),software.amazon.smithy.model.shapes.ServiceShape.class);
   if(!new software.amazon.smithy.model.neighbor.Walker(model).walkShapes(service).contains(root))throw new IllegalArgumentException("Root is outside the selected service closure");
   config.setService(service.getId());
  }
  config.setJsonSchemaVersion(software.amazon.smithy.jsonschema.JsonSchemaVersion.DRAFT2020_12);
  config.setSchemaDocumentExtensions(Node.objectNode().withMember("$schema","https://json-schema.org/draft/2020-12/schema"));
  var converter=software.amazon.smithy.jsonschema.JsonSchemaConverter.builder().model(model).rootShape(root).config(config).build();
  var converted=converter.convert();
  if(addRootDefinition){
   var pointer=converter.toPointer(root);
   if(!converter.isTopLevelPointer(pointer)||converted.getDefinition(pointer).isPresent())throw new IllegalArgumentException("Cannot add root definition at occupied or non-top-level pointer: "+pointer);
   converted=converted.toBuilder().putDefinition(pointer,converted.getRootSchema()).build();
  }
  return Node.printJson(converted.toNode());
 }

 @JSExport
 public static String select(String modelJson, String expression) {
  var model=Model.assembler().addUnparsedModel("query.json",modelJson).assemble().unwrap();
  var ids=new java.util.ArrayList<String>();
  for(var shape:software.amazon.smithy.model.selector.Selector.parse(expression).select(model))ids.add(shape.getId().toString());
  java.util.Collections.sort(ids);
  var values=Node.arrayNode();for(var id:ids)values=values.withValue(Node.from(id));
  return Node.printJson(Node.objectNode().withMember("shapeIds",values));
 }

 @JSExport
 public static String assemble(String sourcesJson) {
  var assembler=Model.assembler();
  Node.parse(sourcesJson).expectObjectNode().getMembers().forEach((name,source)->assembler.addUnparsedModel(name.getValue(),source.expectStringNode().getValue()));
  var result=assembler.assemble();var events=Node.arrayNode();
  for(var event:result.getValidationEvents()){
   var at=event.getSourceLocation();
   var item=Node.objectNode().withMember("id",event.getId()).withMember("severity",event.getSeverity().toString()).withMember("message",event.getMessage()).withMember("source",Node.objectNode().withMember("filename",at.getFilename()).withMember("line",at.getLine()).withMember("column",at.getColumn()));
   if(event.getShapeId().isPresent())item=item.withMember("shapeId",event.getShapeId().get().toString());
   events=events.withValue(item);
  }
  var output=Node.objectNode().withMember("valid",!result.isBroken()).withMember("events",events);
  if(!result.isBroken())output=output.withMember("modelJson",Node.printJson(ModelSerializer.builder().build().serialize(result.unwrap())));
  return Node.printJson(output);
 }
}
