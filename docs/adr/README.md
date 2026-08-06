# Architecture Decision Records

Records of non-trivial design decisions, in [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
Status / Context / Decision / Alternatives rejected / Consequences.

Rules:

- One file per decision, named `NNNN-kebab-title.md`, numbered sequentially.
- An ADR is immutable once **Accepted**. To change a decision, write a new ADR
  that supersedes it and update the old one's Status to `Superseded by NNNN`.
- Keep each record to roughly one page.
- Specs under `docs/specs/` describe how something is built today and may rot.
  ADRs record *why* a choice was made and must not.

## Index

| ADR                                                              | Title                                                     | Status   |
|------------------------------------------------------------------|-----------------------------------------------------------|----------|
| [0001](0001-stage-windows-build-before-release-pipeline.md)      | Stage the Windows build behind a PR workflow before release | Accepted |
| [0002](0002-wsl-backed-accounts.md)                              | WSL-backed accounts, with the POSIX path kept canonical     | Accepted |
