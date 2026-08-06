# 0001 — Stage the Windows build behind a PR workflow before release

## Status

Accepted

## Context

Windows packaging was added straight into `release.yml` as a `build-win` job
that runs on a `v*` tag push and uploads its output to the GitHub Release. That
job had never executed. Several of its assumptions were unverified and only
observable from a real run on a Windows runner:

- the exact artifact names electron-builder emits for the NSIS target, and
  therefore whether the upload globs match anything;
- whether `--publish never` still writes the auto-update metadata
  (`latest.yml`, `*.blockmap`);
- whether `npm ci` can compile `node-pty` and `better-sqlite3` on
  `windows-latest` without extra toolchain setup;
- whether the packaged app starts at all — the native modules are `asarUnpack`ed,
  and a load failure there produces a build that packages cleanly and dies on
  launch.

A tag push is the worst place to discover any of this: the release is already
public, partially populated, and the only way to retry is another tag. The Mac
job in the same workflow already failed twice on tags (`v0.3.0`) for comparable
reasons.

## Decision

Windows packaging lives in its own PR-triggered workflow,
`.github/workflows/build-windows.yml`, and is not part of the release pipeline
yet. It publishes nothing: the installer is exposed as a run artifact, and the
run itself is the source of truth for the open questions above — it lists the
contents of `dist/`, asserts that both native modules were unpacked from the
asar, launches the packaged `.exe` and requires it to survive 30 seconds, and
dumps the app log unconditionally.

`release.yml` is reverted to Mac-only. Windows is promoted into it once this
workflow is green and an artifact has been installed and exercised by hand — at
which point the upload globs are copied from an observed `dist/` listing rather
than guessed.

## Alternatives rejected

- **Fix the release job in place and push a tag to test it.** Every iteration
  costs a version number and leaves a half-populated public release behind.
- **Harden the release job speculatively** (pin `setup-python`, broaden globs,
  tolerate a missing `latest.yml`). Compensates for unknowns instead of
  resolving them, and the workarounds become permanent because nobody can tell
  later which were ever needed.
- **Add the Windows build to the existing `Test` workflow.** Couples a
  multi-minute packaging job to the fast unit-test signal on every PR, and gives
  the packaging job no independent `workflow_dispatch` trigger.

## Consequences

- Windows is absent from releases until the staging workflow has proven itself.
  Windows users have no installer in the meantime.
- Every PR into `main` pays for a Windows packaging run. The repository is
  public, so Actions minutes are free; wall-clock time is the only cost.
- The smoke test depends on a GUI process staying alive on a hosted runner. If
  it proves flaky it should be narrowed, not removed — a packaged app that
  cannot start is the failure mode this whole workflow exists to catch.
- Once Windows moves into `release.yml`, this workflow stays as the pre-merge
  gate; the release job is then a copy of an already-proven build.

The first run (Actions run `31078021971`, PR #2) settled every open question and
already invalidated one assumption that had been carried into `release.yml`:

- `npm ci` compiles nothing by hand — `@electron/rebuild` resolves both
  `better-sqlite3` and `node-pty` from prebuilds for x64 *and* arm64. No extra
  Python or MSVC setup is needed.
- `--publish never` does emit `latest.yml` (347 B) and `WootonPad Setup
  0.4.0.exe.blockmap` (226 KB).
- The arch list in `build.win.target[].arch` overrides the CLI arch flag: the
  `--x64` that `release.yml` carried was a no-op, and the NSIS target emits a
  single 218 MB installer covering both architectures.
- The packaged app starts and stays up, so the `asarUnpack`ed native modules
  load correctly from the installed layout.
