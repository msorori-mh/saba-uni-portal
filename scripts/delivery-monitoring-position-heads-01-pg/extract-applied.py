#!/usr/bin/env python3
"""Print the LAST `CREATE OR REPLACE FUNCTION public.<name>(` statement of an
applied migration verbatim, so the rehearsal patches the body production runs."""
import re
import sys

path, name = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf8").read()
starts = [m.start() for m in re.finditer(
    r"create or replace function public\." + re.escape(name) + r"\(", text, re.I)]
if not starts:
    sys.exit(f"function {name} not found in {path}")
body = text[starts[-1]:]
tag = re.search(r"\bas\s+(\$[a-z_]*\$)", body, re.I).group(1)
first = body.index(tag) + len(tag)
end = body.index(tag, first) + len(tag)
print(body[:end] + ";")
