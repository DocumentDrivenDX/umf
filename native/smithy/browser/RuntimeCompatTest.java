import java.util.*;
public class RuntimeCompatTest {
 public static void main(String[] args){
  int checks=0;
  for(String delimiter:new String[]{"",",","::"}){
   var expected=new java.util.StringJoiner(delimiter,"[","]");var actual=new umf.StringJoiner(delimiter,"[","]");
   expected.setEmptyValue("empty");actual.setEmptyValue("empty");
   for(String item:new String[]{null,"","café","abc"}){
    if(!expected.toString().equals(actual.toString())||expected.length()!=actual.length())throw new AssertionError("joiner");checks++;
    expected.add(item);actual.add(item);
   }
   expected.merge(expected);actual.merge(actual);if(!expected.toString().equals(actual.toString()))throw new AssertionError("self merge");checks++;
   expected.merge(new java.util.StringJoiner("!").add("x").add("y"));actual.merge(new umf.StringJoiner("!").add("x").add("y"));if(!expected.toString().equals(actual.toString()))throw new AssertionError("merge");checks++;
  }
  SortedSet<Integer> source=new TreeSet<>(Arrays.asList(1,2,3));SortedSet<Integer> actual=umf.RuntimeCompat.unmodifiableSortedSet(source);source.add(4);
  if(!actual.equals(source)||actual.first()!=1||actual.last()!=4||!actual.subSet(2,4).equals(new TreeSet<>(Arrays.asList(2,3))))throw new AssertionError("sorted view");checks++;
  for(Runnable mutate:new Runnable[]{()->actual.clear(),()->actual.remove(99),()->actual.add(5),()->actual.subSet(2,4).clear(),()->actual.iterator().remove(),()->actual.removeIf(x->false)}){try{mutate.run();throw new AssertionError("mutation accepted");}catch(UnsupportedOperationException expected){checks++;}}
  try{umf.RuntimeCompat.genericSuperclass(ArrayList.class);throw new AssertionError("reflection silently approximated");}catch(UnsupportedOperationException expected){checks++;}
  System.out.println("Compatibility adapters: "+checks+" JVM comparisons/guards passed");
 }
}
