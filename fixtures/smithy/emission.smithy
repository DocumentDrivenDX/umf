$version: "2"
namespace example

@length(min: 1, max: 8)
string Key

@range(min: 0, max: 100)
long Score

enum State {
    OPEN = "open"
    CLOSED = "closed"
}

union Choice {
    text: String
    count: Integer
}

map Labels {
    key: Key
    value: String
}

structure Input {
    @required
    id: Key
    score: Score
    state: State
    choice: Choice
    labels: Labels
}
