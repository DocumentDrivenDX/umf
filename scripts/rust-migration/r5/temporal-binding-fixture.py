"""Independent binding fixture using Python's calendar and datetime libraries."""
import datetime as dt
import json

dates = ["0001-01-01", "1900-02-28", "2000-02-29", "2024-12-31", "9999-12-31"]
instants = [
    "0001-01-01T00:00:00Z", "1969-12-31T23:59:59.5000Z",
    "2000-02-29t12:34:56.123400+05:30", "2024-01-01T00:00:00-00:00",
    "9999-12-31T23:59:59.0000000000000000001Z",
]
epoch = dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)
rows = []
for token in dates:
    value = dt.date.fromisoformat(token)
    rows.append({"kind": "date", "token": token, "year": value.year, "month": value.month, "day": value.day,
                 "yearStart": f"{value.year:04d}-01-01", "quarterStart": f"{value.year:04d}-{((value.month - 1) // 3) * 3 + 1:02d}-01",
                 "monthStart": f"{value.year:04d}-{value.month:02d}-01"})
for token in instants:
    base = token[:19]
    if "." in token:
        base = token[:token.index(".")]
    suffix = token[-6:] if token[-6] in "+-" else "+00:00"
    value = dt.datetime.fromisoformat(base + suffix)
    delta = value.astimezone(dt.timezone.utc) - epoch
    seconds = delta.days * 86400 + delta.seconds
    fraction = token.split(".", 1)[1] if "." in token else ""
    fraction = fraction.rstrip("Zz")
    if "+" in fraction:
        fraction = fraction.split("+", 1)[0]
    if "-" in fraction:
        fraction = fraction.split("-", 1)[0]
    fraction = fraction.rstrip("0")
    offset = token[-6:] if token[-6] in "+-" else token[-1:]
    rows.append({"kind": "instant", "token": token, "utcSeconds": str(seconds), "fractionalDigits": fraction,
                 "originalOffset": offset, "localOffsetKnown": offset != "-00:00"})
print(json.dumps(rows, separators=(",", ":"), ensure_ascii=True))
