#!/usr/bin/env python3
"""Refuse content that was withdrawn from this repository once before.

`every_document_has_a_source.py` checks the working tree: a file arrives, it
must be accounted for. That leaves one path open. A file that was removed for a
reason still exists in the object store of every old clone, and

    git checkout <old-sha> -- <path>

brings it back under any name. The next person adds a line to SOURCES.md in good
faith, because nothing tells them the file was withdrawn.

This check closes that path. It walks every blob reachable from HEAD and refuses
the ones on the list below.

WHY THE LIST IS HASHED
The entries are one-way fingerprints, not the identifiers themselves. Publishing
"do not commit object X" in a public repository is a signpost to X, and X is
still fetchable from the forge by identifier. The check works the same either
way; the pointer does not.

What each entry stands for is recorded internally, with the reason it was
withdrawn.
"""
import hashlib
import subprocess
import sys

# One-way fingerprints of withdrawn content. Add an entry with
#   python3 -c "import hashlib;print(hashlib.sha256(('pdfluent-denylist:'+SHA).encode()).hexdigest())"
# and record what it is and why in the internal tracker -- never here.
INGETROKKEN = {
    "f728869474487fcb6b8ceef8c0f3e21ece6b7f176c5db5169b9e1d20e4961f07",
}

# FLOOR: a repository of this size has thousands of objects. If the walk returns
# far fewer, it is broken rather than the repository empty -- and a check that
# inspects nothing passes every time.
MIN_OBJECTEN = 500


def vinger(sha: str) -> str:
    return hashlib.sha256(("pdfluent-denylist:" + sha).encode()).hexdigest()


def main() -> int:
    uit = subprocess.run(
        ["git", "rev-list", "--objects", "--all"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()

    if len(uit) < MIN_OBJECTEN:
        print(
            f"denylist: walked {len(uit)} objects, fewer than {MIN_OBJECTEN}. "
            "The walk is broken, not the repository empty.",
            file=sys.stderr,
        )
        return 1

    gevonden = []
    for regel in uit:
        deel = regel.split(maxsplit=1)
        if vinger(deel[0]) in INGETROKKEN:
            gevonden.append((deel[0], deel[1] if len(deel) > 1 else "(no path)"))

    if gevonden:
        print(
            f"denylist: {len(gevonden)} object(s) that were withdrawn from this "
            "repository are present again.",
            file=sys.stderr,
        )
        for sha, pad in gevonden:
            print(f"  {sha}  {pad}", file=sys.stderr)
        print(
            "\nThis content was taken out deliberately. It did not come back by\n"
            "itself: something restored it from an old commit, or a clone that\n"
            "still had it pushed it forward. Do not add it to SOURCES.md -- find\n"
            "out why it is here. The reason it was withdrawn is in the internal\n"
            "tracker.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {len(uit)} objects walked, none withdrawn.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
