import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.jsonschema.*;
public class JsonSchemaOracle {
 public static void main(String[] paths){
  boolean addRootDefinition=paths.length>0&&paths[0].equals("--root-definition");
  if(addRootDefinition)paths=java.util.Arrays.copyOfRange(paths,1,paths.length);
  for(String path:paths){
   try{
    var model=Model.assembler().addImport(path).assemble().unwrap();
    var shapes=model.shapes().filter(s->!s.getId().getNamespace().equals("smithy.api")&&!s.isMemberShape()&&!s.isServiceShape()&&!s.isResourceShape()&&!s.isOperationShape()).sorted((a,b)->a.getId().toString().compareTo(b.getId().toString())).toList();
    for(var shape:shapes){
     var row=Node.objectNode().withMember("file",path).withMember("rootShape",shape.getId().toString());
     try{
      var config=new JsonSchemaConfig();config.setJsonSchemaVersion(JsonSchemaVersion.DRAFT2020_12);config.setSchemaDocumentExtensions(Node.objectNode().withMember("$schema","https://json-schema.org/draft/2020-12/schema"));
      var converter=JsonSchemaConverter.builder().model(model).rootShape(shape).config(config).build();
      var schema=converter.convert();
      row=row.withMember("schema",Node.printJson(schema.toNode()));
      if(addRootDefinition){
       var pointer=converter.toPointer(shape);
       if(!converter.isTopLevelPointer(pointer)||schema.getDefinition(pointer).isPresent())throw new IllegalArgumentException("Cannot add root definition at occupied or non-top-level pointer: "+pointer);
       row=row.withMember("adaptedSchema",Node.printJson(schema.toBuilder().putDefinition(pointer,schema.getRootSchema()).build().toNode()));
      }
     }catch(RuntimeException error){row=row.withMember("error",error.toString());}
     System.out.println(Node.printJson(row));
    }
   }catch(RuntimeException error){System.out.println(Node.printJson(Node.objectNode().withMember("file",path).withMember("assemblyError",error.toString())));}
  }
 }
}
