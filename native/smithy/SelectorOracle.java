import software.amazon.smithy.model.Model;
import software.amazon.smithy.model.node.Node;
import software.amazon.smithy.model.selector.Selector;
import java.util.ArrayList;
import java.util.Collections;
public class SelectorOracle {
 public static void main(String[] paths) {
  for(String path:paths){
   var model=Model.assembler().addImport(path).assemble().unwrap();
   for(var item:model.getMetadataProperty("selectorTests").get().expectArrayNode().getElements()){
    var test=item.expectObjectNode();var expression=test.expectStringMember("selector").getValue();
    var ids=new ArrayList<String>();for(var shape:Selector.parse(expression).select(model))ids.add(shape.getId().toString());Collections.sort(ids);
    var values=Node.arrayNode();for(var id:ids)values=values.withValue(Node.from(id));
    System.out.println(Node.printJson(Node.objectNode().withMember("file",path).withMember("selector",expression).withMember("shapeIds",values).withMember("test",test)));
   }
  }
 }
}
