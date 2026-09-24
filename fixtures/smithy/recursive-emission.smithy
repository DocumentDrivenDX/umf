$version: "2"
namespace recursive

structure Node {
    @required
    name: String
    children: Nodes
    snapshot: String = "{\"$ref\":\"#/$defs/Node\"}"
    count: Long = 9007199254740993
}

list Nodes {
    member: Node
}

structure Envelope {
    @required
    root: Node
}
