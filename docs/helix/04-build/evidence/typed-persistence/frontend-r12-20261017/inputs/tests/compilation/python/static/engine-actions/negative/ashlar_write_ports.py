from ashlar.access import AshlarTarget
from commerce import Actions, ReplayingActions

def unsupported(target: AshlarTarget) -> None:
    Actions(target)
    ReplayingActions(target)
