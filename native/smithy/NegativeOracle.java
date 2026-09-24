import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.model.shapes.ModelSerializer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
public class NegativeOracle {
 public static void main(String[] paths) throws Exception {
  for(String path:paths){
   try {
   var result=Model.assembler().addImport(path).assemble();
   var row=Node.objectNode().withMember("path",path).withMember("valid",!result.isBroken());
   var events=Node.arrayNode();
   for(var event:result.getValidationEvents())events=events.withValue(Node.from(event.getSeverity()+":"+event.getId()));
   row=row.withMember("events",events);
   if(!result.isBroken()){
    var serialized=Node.printJson(ModelSerializer.builder().build().serialize(result.unwrap()));
    row=row.withMember("modelSha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(serialized.getBytes(StandardCharsets.UTF_8))));
   }
   System.out.println(Node.printJson(row));
   } catch (RuntimeException error) {
    System.out.println(Node.printJson(Node.objectNode().withMember("path",path).withMember("valid",false).withMember("events",Node.arrayNode()).withMember("exceptionClass",error.getClass().getName()).withMember("exceptionMessage",error.getMessage())));
   }
  }
 }
}
