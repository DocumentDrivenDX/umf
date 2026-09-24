import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.model.neighbor.Walker;
import software.amazon.smithy.jsonschema.*;
public class ServiceJsonSchemaOracle {
 public static void main(String[] paths){
  for(String path:paths){
   var model=Model.assembler().addImport(path).assemble().unwrap();
   var roots=model.shapes().filter(s->!s.getId().getNamespace().equals("smithy.api")&&!s.isMemberShape()&&!s.isServiceShape()&&!s.isResourceShape()&&!s.isOperationShape()).sorted((a,b)->a.getId().toString().compareTo(b.getId().toString())).toList();
   for(var service:model.getServiceShapes().stream().sorted((a,b)->a.getId().toString().compareTo(b.getId().toString())).toList())for(var root:roots){
    var row=Node.objectNode().withMember("file",path).withMember("rootShape",root.getId().toString()).withMember("serviceContext",service.getId().toString());
    try{
     if(!new Walker(model).walkShapes(service).contains(root))throw new IllegalArgumentException("Root is outside the selected service closure");
     var config=new JsonSchemaConfig();config.setJsonSchemaVersion(JsonSchemaVersion.DRAFT2020_12);config.setSchemaDocumentExtensions(Node.objectNode().withMember("$schema","https://json-schema.org/draft/2020-12/schema"));config.setService(service.getId());
     var converter=JsonSchemaConverter.builder().model(model).rootShape(root).config(config).build();var schema=converter.convert();row=row.withMember("schema",Node.printJson(schema.toNode()));
     var pointer=converter.toPointer(root);if(!converter.isTopLevelPointer(pointer)||schema.getDefinition(pointer).isPresent())throw new IllegalArgumentException("Cannot add root definition at occupied or non-top-level pointer: "+pointer);
     row=row.withMember("adaptedSchema",Node.printJson(schema.toBuilder().putDefinition(pointer,schema.getRootSchema()).build().toNode()));
    }catch(RuntimeException error){row=row.withMember("error",error.toString());}
    System.out.println(Node.printJson(row));
   }
  }
 }
}
