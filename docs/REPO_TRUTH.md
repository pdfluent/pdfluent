# One truth: the source people read and the binaries they run

_Written 2026-09-07 (#396). Every number below carries the command that produced
it and the date it was produced._

On 2026-09-07 this repository had three answers to the question "where is the
editor's source", and no two of them agreed:

| Where | What was there |
|---|---|
| `gitlab/release/ga-readiness` | 321 commits, version 1.0.0-beta.21, the branch the shipped binaries were built from |
| `pdfluent/pdfluent` `main` (public) | 58 commits ending at `65de567`, last touched 2026-09-04, **no common ancestor with the branch** (`git merge-base` returns nothing) |
| `origin/main` (internal tracker) | a third state, 12 commits the branch does not have |

Nobody had lied. Each state was reachable and each was reasonable on its own.
There was simply nothing that compared them, and four and a half months went by.

## The branch model

- **`release/ga-readiness` on GitLab is the trunk.** Work lands there by
  fast-forward. It is the only branch a release is built from.
- **`pdfluent/pdfluent` `main` is the published face of that trunk.** It is not a
  mirror: it carries the product's source and leaves out the machinery around it.
  What is which is declared in [`PUBLIC_TREE.json`](PUBLIC_TREE.json), one entry
  per exception, each with the reason it is one. Everything is published unless
  an entry says otherwise — a new file is public by default and somebody has to
  write down why it is not.
- **The public repository keeps its own history.** Publication adds one snapshot
  commit on top of it, carrying a `Published-from: <sha>` trailer that names the
  trunk commit it came from. That trailer is the only thing that makes "is the
  public repository current" answerable at all: the two histories share no
  ancestor, so git cannot tell you and a version number is a claim, not a
  measurement.

## Which remote is primary

**GitHub is the primary remote for every PDFluent repository. GitLab holds the
CI project and the nightly backup.** That was decided on 2026-08-25, and until
2026-09-08 the editor's working trunk did not follow it (#455). Measured that
morning with `git ls-remote`:

| Remote | `release/ga-readiness` | `main` |
|---|---|---|
| `gitlab` (the CI project) | `140906d` — the trunk, and every phase-2 landing | `4a697af` |
| `origin` (`pdfluent/pdfluent-internal`, private) | **absent** | `d5db1f0`, 2026-08-21 |
| `pdfluent/pdfluent` (public) | n/a | snapshot `98e23d1` |

So the only copy of the trunk, with every landing since 2026-08-21, was on
GitLab. Lose that group and the public snapshot survives while the trunk
history, the internal tests, the quality ratchets and the store material do not.
The nightly mirror could not repair it either: it copies GitHub to GitLab, and
there was nothing on GitHub to copy.

The reason it drifted is real and still holds — the editor's CI runs on our own
GitLab runner and zero hosted GitHub-Actions minutes is a standing rule, so the
code has to be on GitLab to be built. The fix is not to move CI. It is to stop
treating the CI project as the only place the trunk lives:

- **`scripts/cos/editor_land.sh` pushes GitHub first, then GitLab.** A push that
  reaches GitLab but not GitHub is a failed landing, not a partial one
  (`LAND_EXIT=github-push-failed`), and the GitLab push is never attempted. CI
  therefore never sees a commit the primary does not have.
- **The reverse half — GitHub written, GitLab refused — leaves the commit landed**
  (`LAND_EXIT=gitlab-push-failed`). That is the correct half to keep, and the
  ancestry check at the top of a landing reads *both* remotes, so rebasing on
  whichever is ahead carries the other forward on the next try instead of
  wedging the queue. `scripts/cos/tests/editor_land_remotes.sh` holds all four
  cases against throwaway repositories. (`scripts/cos/` is the operations
  notes repository, not this one: the landing script drives this repository from
  outside it.)
- **`scripts/ci/remotes-agree.mjs` runs in `quality-gates-fast` on the trunk** and
  asks whether the commit CI is testing is contained in the *other* copy.
  Behind is red; ahead is fine. Which copy that is depends on where the gate
  runs: it lived on GitLab and asked about GitHub, and since #465 it runs on
  GitHub and asks about the GitLab backup — pointed at the host it runs on it
  would be asking whether a commit is where it obviously is. It reads the backup
  with a deploy token that can do nothing but read that one repository, and it
  redacts every URL it prints, because a token in a job log has left the
  building. It is the half that notices when something writes one copy and not
  the other: a push by hand, a landing finished manually, this script edited
  back.

Between them those two cover different failures, and it is worth being precise
about which. The landing script is what makes both copies happen, and it checks
its own work by reading each push back — but a script that has been edited,
bypassed or run from an older checkout cannot report on itself, and that is what
the gate above is for. The gate in turn only sees what reaches CI, so a push
that never triggers a pipeline is invisible to it; the nightly GitHub-to-GitLab
mirror and its `STATUS.md` are the backstop for that, one night later.
- **`pdfluent-editor` is deliberately NOT on the nightly mirror's list.** The
  mirror force-pushes GitHub's state, which on the CI project would overwrite an
  in-flight landing. `pdfluent-internal` is on the list, so once the trunk is on
  GitHub the GitLab copy is refreshed from it anyway.

### The tags

All 45 tags are on the primary as of 2026-09-08, and every one of them is an
annotated tag whose tagger is the `@users.noreply.github.com` alias. That is not
tidiness. GitHub refuses a ref whose tip would publish a private address
(`GH007`) and judges the **tip**, not the history — which is why the trunk goes
through on a tip written with the alias while 300 of its commits carry a
personal one, and why `rc30` did not:

    ! [remote rejected] rc30 -> rc30 (push declined due to email privacy restrictions)

44 of the 45 were lightweight tags. A lightweight tag has no tagger, so GitHub
judges the commit it points at, and every tag older than the switch to the alias
points at a commit with a personal address. An annotated tag carries its own
tagger and is accepted on the strength of that, even on an old commit — measured
before the work, not assumed. So each tag was re-made at **the same commit**,
with the alias as tagger and the tag's date taken from that commit rather than
from the day of the repair:

    GIT_COMMITTER_DATE="$(git log -1 --format=%cI "$name^{commit}")" \
      git -c user.email=<alias> tag -a -f -m "<what it is>" "$name" "$name^{commit}"

`scripts/ci/tags-are-pushable.mjs` refuses a tag that is not one of those, in the
fast gate, so a new release tag cannot repeat it. **The repair is never to switch
off the account setting that blocks the push.** That setting is the only thing
standing between a personal address and a repository we mean to keep clean;
turning it off publishes every address that follows.

**GitLab keeps its lightweight tags.** Re-pointing them there would rewrite what
a release was built from for no gain, so the two remotes agree on every tag's
target commit and disagree on the object type of 44 of them. Written down here
rather than discovered later.

**Tags do not travel with a landing.** The first version of this pushed the
branch with `--follow-tags`, which also offers every annotated tag reachable
from it. This repository carries 45 tags, some tagged long enough ago to carry a
personal address, and GitHub refuses those on the command line (`GH007: Your
push would publish a private email address`). On 2026-09-08 that cost a landing:
the branch arrived, one tag from June was rejected, `git push` exited non-zero,
and a landing that had in fact landed reported `github-push-failed` and skipped
GitLab. So a landing pushes the branch and nothing else, and
`scripts/cos/tests/editor_land_remotes.sh` holds a case against a remote that
takes branches and refuses tags. Getting the existing tags onto the primary was
its own job, done on 2026-09-08 and written up above.

The runner has a GitLab token and no GitHub credential — which is a large part
of how this happened — so the guard reads the primary through a **read-only
deploy key** for `pdfluent-internal`, held base64-encoded in the masked CI/CD
variable `PDFLUENT_PRIMARY_SSH_KEY_B64` (base64 because a masked variable has to
fit on one line, and an unmasked private key is a private key in every job log).
It connects over `ssh.github.com:443` with GitHub's host key pinned in the
script: outbound 22 is the port a network is most likely to have closed, and a
key should not be offered to whatever answers on an unverified address.

The guard cannot pass without reading the primary. A check that shrugs when it
cannot reach the other side has not compared anything, and "nobody looked" is
the exact state it exists to catch.

### Why a snapshot and not this branch's history

Pushing the trunk onto the public repository looks like the honest option — the
same commits, publicly readable. It is the opposite, and three measurements say
so (2026-09-07):

- The histories have **no common ancestor**. Pushing the trunk is not a
  fast-forward but a force-push that discards 58 commits of public history,
  including the ones that removed content on purpose.
- **300 of 321 commits** carry a personal e-mail address in their author or
  committer field (`git log --format='%ae %ce'`). The public repository refuses
  those in CI (`scripts/ci/commits_use_the_noreply_alias.py`), and an address in
  a commit is readable by anyone, no login and no clone needed.
- A **third-party form withdrawn from the public repository** is still reachable
  as a blob from the trunk's history (`git rev-list --objects HEAD` finds one).
  It is not named here: this document is itself published, and a path is all
  anyone needs to fetch the blob. The public repository's own guard
  (`no_withdrawn_blobs.py`) holds the list and walks every object. The current
  tree no longer references that fixture — the tests were pointed at one we own
  in `36b2efd` — but a history transplant brings the blob back regardless.

A snapshot keeps the public lineage, publishes exactly the tree the manifest
calls public, and carries no blob outside it (verified: 249 new objects, 0 on the
withdrawn list). What it costs is per-commit history on the public side, which
was never there to begin with.

## Versions and tags

There is no `v1.0.0-beta.21` tag and there will not be one. `1.0.0-beta.21` says
"final" and "not final" in the same breath; the decision on 2026-09-07 was to
stop compounding that. **The next editor release is `1.0.0`, tagged `v1.0.0`,
cut once the quality gates it claims are actually green** — the editor's version
is its own and does not track the SDK's.

### The state between the bump and the record

A cut takes two commits and cannot take one. The bumps land first; the record
of what was built lands second, because it has to name the first one's sha and
that does not exist until the commit does. Between them `package.json` names a
version `SHIPPED.json` has never heard of.

That is every release, not a mistake, and this guard used to call it a failure —
which meant the only way to land a version bump was to skip the gate that exists
to catch exactly this kind of mismatch. It knows the state now, and knows it
narrowly: the version must have moved **forward**, and the tag for it must not
exist yet. Once `v<version>` is tagged, a `SHIPPED.json` that has not followed
is the drift this leg is for, and it is red again.

That leaves the currently shipped binaries with no tag naming their source, so
[`SHIPPED.json`](SHIPPED.json) names it instead, with the evidence, and
`scripts/ci/repo-truth.mjs` checks that the commit is on the trunk and that the
public repository contains it.

## The release-in-progress window

A release is cut, the binaries are built and signed off-pipeline, and only then
is the snapshot published. Work keeps landing in between, so the public side is
allowed to lag — but bounded, on both axes:

- at most **25 commits** on the trunk since the last publication;
- the oldest unpublished commit at most **14 days** old.

Both are the argument from the merge-request staleness rule: at two weeks
republishing is an afternoon, at four months it is the work again. The numbers
live in `scripts/ci/repo-truth.mjs` and a test fails if this document and the
script stop agreeing.

### Changing a file that exists only on the public side

`SOURCES.md`, the public repository's own workflows and the guards they run are
`public_only`: the snapshot carries them over from the public head rather than
publishing them from here. That left no way to change one. The only edit that
reached them was a commit made directly on the public repository — which is
exactly how a public head came to carry no `Published-from:` trailer on
2026-09-09, with nothing able to say for two hours which trunk commit the public
side held.

They are edited in `docs/public-only/` instead. A file there replaces, or adds,
the public-only entry at the same path, so a change to any of them passes this
repository's gate and its review and then arrives inside a snapshot commit that
carries the trailer like every other. **A public-only file is never changed by
committing to the public repository.**

A file under `docs/public-only/` that the manifest does not name as
`public_only` is refused: without that the directory is a second way to publish
anything, which is the one thing `PUBLIC_TREE.json` exists to prevent. The
directory itself is `internal`, or every overlaid file would appear twice.

## Publishing

1. `node scripts/ci/internal-terms.mjs --tree` — nothing internal in the tree
   that goes out. Red on any hit.
2. `node scripts/ci/publish-public-snapshot.mjs` — builds the snapshot commit on
   top of the current public head. It refuses first if git would sign it with
   anything but a `@users.noreply.github.com` alias, and it never pushes.
   Before it offers anything to push, it runs the public repository's own
   guards against the snapshot tree — the address scan and the sources
   requirement — and refuses if either says no. Not copies of them: the snapshot
   carries those files forward, so the guards inside the tree judge the tree,
   and whatever the public side will run on the pushed commit has already run
   here on the same bytes. Two of them were failing on published snapshots
   before this existed, one of them since the snapshot before that, because this
   side published without ever asking what that side checks.
3. `git push --dry-run <public> <commit>:refs/heads/main` — read what it says.
4. Push, then run `node scripts/ci/repo-truth.mjs`. Green is the receipt.

The commit messages of the trunk are not published by this route, so the
internal-names guard over them (`--range`) is a check on our own hygiene rather
than a gate on publication. It is worth running anyway: three messages currently
name the Windows build host, and the day someone does publish history that is
what would go out with it.

It is a local hook rather than a CI job, and that is a decision. The customer
and partner names live in a list outside the tree
(`~/.config/pdfluent/interne-termen.txt`) on purpose; a CI variable store is not
a better place for them, and a runner without the list cannot judge the rule —
the script says `SKIPPED (not a pass)` and exits non-zero rather than approving.
So it runs where the list is:

```
git config core.hooksPath .githooks
```

`.githooks/commit-msg` then refuses a message before it becomes a commit. The
tree rule, the one that does gate publication, is built into
`publish-public-snapshot.mjs` and cannot be skipped.

## What each guard refuses

| Guard | Refuses |
|---|---|
| `scripts/ci/repo-truth.mjs` | a public repository that does not say what it was published from, does not carry what it claims, does not contain the shipped source, or has fallen outside the window |
| `scripts/ci/public-tree.mjs` | a manifest entry without a reason, or one that matches no file any more |
| `scripts/ci/internal-terms.mjs` | commercial statements, customer and partner names, and our own machines and key stores, in a message or in a published file. Technique goes through: `password` is a feature here and `Adobe` is a fact about the world |
| `scripts/ci/legacy-shell-fenced.mjs` | a production bundle containing the retired V1 shell |
| `scripts/ci/remotes-agree.mjs` | a trunk commit that reached CI without reaching the other copy of the trunk, and a run that could not read that copy at all |
| `scripts/ci/tags-are-pushable.mjs` | a tag the primary would refuse: a lightweight one, or an annotated one made with a personal address |
| `scripts/ci/publish-public-snapshot.mjs` | building a snapshot git would sign with a personal address. The public side has that rule too, in its own CI — but there it runs after the push, with the address already published |

## The binaries were judged before they were published

`docs/SHIPPED.json` carries a `quality_reports` object naming the release
quality suite's report for each platform (`quality/reports/<version>-<platform>.json`).
`scripts/ci/repo-truth.mjs` checks that each named report exists, parses, judged
this version, and says `PASS`; an override file counts only when it names a
ticket number.

`null` is allowed for one reason and one reason only: the release predates the
suite. The date is a literal in the script. A release recorded after it that
names no report was published without one, and that is what this leg is for.
