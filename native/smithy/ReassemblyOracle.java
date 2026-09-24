import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.model.shapes.ModelSerializer;
import software.amazon.smithy.model.transform.ModelTransformer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
public class ReassemblyOracle {
 static String hash(String text)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}
 static String json(Model model){return Node.printJson(ModelSerializer.builder().build().serialize(model));}
 public static void main(String[] paths)throws Exception{
  for(String path:paths){
   var first=Model.assembler().addImport(path).assemble();var row=Node.objectNode().withMember("path",path).withMember("valid",!first.isBroken());
   if(!first.isBroken()){
    String before=json(first.unwrap());var second=Model.assembler().addUnparsedModel("reassembled.json",before).assemble();row=row.withMember("reassemblyValid",!second.isBroken());
    if(!second.isBroken()){
     String after=json(second.unwrap());String flatBefore=json(ModelTransformer.create().flattenAndRemoveMixins(first.unwrap()));String flatAfter=json(ModelTransformer.create().flattenAndRemoveMixins(second.unwrap()));
     row=row.withMember("originalSha256",hash(before)).withMember("reassembledSha256",hash(after)).withMember("serializationStable",before.equals(after)).withMember("flattenedModelStable",flatBefore.equals(flatAfter)).withMember("flattenedBeforeSha256",hash(flatBefore)).withMember("flattenedAfterSha256",hash(flatAfter));
    }
   }
   System.out.println(Node.printJson(row));
  }
 }
}
