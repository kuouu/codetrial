#!/usr/bin/env python3
"""Write the small interview-agent problem catalogue from the checked-in bank."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "web" / "problems"
DESTINATION = ROOT / "livekit-agent" / "problems.json"

problems = {}
for path in sorted(SOURCE.glob("*.json")):
    source = json.loads(path.read_text(encoding="utf-8"))
    problems[source["page"]] = {
        "page": source["page"],
        "title": source["title"],
        "source": source.get("source", ""),
        "difficulty": source.get("difficulty", "Medium"),
        "brief": source.get("brief", []),
        "examples": source.get("examples", []),
    }

DESTINATION.write_text(
    json.dumps(problems, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"Wrote {len(problems)} problem summaries to {DESTINATION.relative_to(ROOT)}")
