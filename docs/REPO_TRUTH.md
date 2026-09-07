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
  as a blob from the trunk's history (`git rev-list --objects HEAD`, one hit:
  `src-tauri/tests/fixtures/imm5257e_dynamic_xfa.pdf`). Its own guard there
  (`no_withdrawn_blobs.py`) walks every object and refuses it. The current tree
  no longer references that fixture — the tests were pointed at one we own in
  `36b2efd` — but a history transplant brings the blob back regardless.

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

## Publishing

1. `node scripts/ci/internal-terms.mjs --tree` — nothing internal in the tree
   that goes out. Red on any hit.
2. `node scripts/ci/publish-public-snapshot.mjs` — builds the snapshot commit on
   top of the current public head. It refuses first if git would sign it with
   anything but a `@users.noreply.github.com` alias, and it never pushes.
3. `git push --dry-run <public> <commit>:refs/heads/main` — read what it says.
4. Push, then run `node scripts/ci/repo-truth.mjs`. Green is the receipt.

The commit messages of the trunk are not published by this route, so the
internal-names guard over them (`--range`) is a check on our own hygiene rather
than a gate on publication. It is worth running anyway: three messages currently
name the Windows build host, and the day someone does publish history that is
what would go out with it.

## What each guard refuses

| Guard | Refuses |
|---|---|
| `scripts/ci/repo-truth.mjs` | a public repository that does not say what it was published from, does not carry what it claims, does not contain the shipped source, or has fallen outside the window |
| `scripts/ci/public-tree.mjs` | a manifest entry without a reason, or one that matches no file any more |
| `scripts/ci/internal-terms.mjs` | commercial statements, customer and partner names, and our own machines and key stores, in a message or in a published file. Technique goes through: `password` is a feature here and `Adobe` is a fact about the world |
| `scripts/ci/legacy-shell-fenced.mjs` | a production bundle containing the retired V1 shell |
| `scripts/ci/publish-public-snapshot.mjs` | building a snapshot git would sign with a personal address. The public side has that rule too, in its own CI — but there it runs after the push, with the address already published |
