# Workflows

This repository holds the editor's source. It does not hold the pipeline that
gates a release.

Two workflows were removed when this repository was published, and neither could
have worked here:

- `ci.yml` checked out a private repository with a token, so it fails for anyone
  who is not us — including on every pull request from a fork.
- `release.yml` signed and published builds. Signing keys do not belong in a
  public workflow: a workflow file is editable in a pull request, and a secret
  that a pull request can reach is a secret that has left the building.

What runs here is what a reader can run: the compliance check and the core
module tests. Release builds are cut elsewhere, and the binaries they produce
are the ones published on pdfluent.com.
