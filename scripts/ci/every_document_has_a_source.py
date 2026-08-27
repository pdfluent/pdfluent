#!/usr/bin/env python3
"""Every binary document in this repository has a stated origin.

This repository is public. A file committed here is published to anyone, and
"we found it on the internet" is not a licence.

WHAT THIS CAUGHT
On 2026-08-27 `src-tauri/tests/fixtures/imm5257e_dynamic_xfa.pdf` was found in
this repository. It was a government form from a third party and had been here
since 2026-07-14. Nobody had put it here deliberately in the sense that matters:
it arrived as a test fixture, and the question of whether we may redistribute it
was never asked. It was purged from the history.

The four tests that used it went with it. That is what an unasked question costs
when it is answered late.

HOW A FILE PASSES
By being named in SOURCES.md with where it came from. Nothing else. A file that
nobody can account for cannot ship, and the point of this check is that the
accounting happens before the commit rather than after the publication.
"""
import pathlib
import re
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[2]
SOURCES = REPO / "SOURCES.md"

# Documents and fonts: things that carry someone else's copyright far more often
# than a source file does.
SOORTEN = {".pdf", ".docx", ".xlsx", ".pptx", ".ttf", ".otf", ".woff", ".woff2", ".pfb"}

# FLOOR: at least 10 such files exist. If the walk finds fewer, it is broken
# rather than the repository being empty -- and a check that inspects nothing
# passes every time.
MIN_BESTANDEN = 10


def bestanden() -> list[str]:
    uit = subprocess.run(
        ["git", "-C", str(REPO), "ls-files"], capture_output=True, text=True, check=True
    ).stdout.split("\n")
    return [p for p in uit if p and pathlib.PurePosixPath(p).suffix.lower() in SOORTEN]


def main() -> int:
    alle = bestanden()
    if len(alle) < MIN_BESTANDEN:
        print(
            f"sources: found {len(alle)} documents, fewer than {MIN_BESTANDEN}. "
            "The walk is broken, not the repository empty.",
            file=sys.stderr,
        )
        return 1

    if not SOURCES.exists():
        print(f"sources: {SOURCES.name} is missing.", file=sys.stderr)
        return 1

    genoemd = set(re.findall(r"`([^`]+)`", SOURCES.read_text(encoding="utf-8")))
    ontbreekt = [p for p in alle if p not in genoemd
                 and not any(p.startswith(g.rstrip("*")) for g in genoemd if g.endswith("*"))]

    if ontbreekt:
        print(
            f"sources: {len(ontbreekt)} document(s) with no stated origin.",
            file=sys.stderr,
        )
        for p in ontbreekt[:20]:
            print(f"  {p}", file=sys.stderr)
        print(
            "\nThis repository is public. Add each file to SOURCES.md with where it\n"
            "came from and under what terms it may be redistributed -- or do not\n"
            "commit it. A file nobody can account for cannot ship.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: all {len(alle)} documents have a stated origin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
