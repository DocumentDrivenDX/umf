import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import java.nio.file.*;
import org.apache.iceberg.types.Types;
import org.apache.iceberg.transforms.Transforms;
public class IcebergTransformOracle {
 public static void main(String[] args) throws Exception {
  ObjectMapper mapper=new ObjectMapper();ArrayNode out=mapper.createArrayNode();
  for(var c:mapper.readTree(Files.readString(Path.of(args[0])))){
   ObjectNode r=((ObjectNode)c).deepCopy();
   try {var type=c.get("sourceType").asText().equals("variant")?Types.VariantType.get():Types.fromPrimitiveString(c.get("sourceType").asText());var t=Transforms.fromString(type,c.get("transform").asText());r.put("nativeCompatible",t.canTransform(type));if(t.canTransform(type))r.put("nativeResultType",t.getResultType(type).toString());}
   catch(Exception e){r.put("nativeCompatible",false);r.put("nativeError",e.getClass().getSimpleName()+": "+e.getMessage());}
   out.add(r);
  }
  Files.writeString(Path.of(args[1]),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(out)+"\n");
 }
}
