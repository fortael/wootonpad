Write release notes for this project. **Only** the notes — nothing else.

Do not bump the version, commit, tag, push, watch a build, or publish a
release. The tag is cut by hand in the GitHub UI; your job ends at the text.

## Steps

1. Find the most recent version tag:
   `git describe --tags --abbrev=0`

2. Collect everything since it:
   `git log {prev_tag}..HEAD --format="===== %h %s%n%b"`

   Squashed merges hide their contents behind one subject line, so when a
   commit body is thin, read what actually changed instead of guessing from
   the subject: `git diff --stat {prev_tag}..HEAD` and
   `git diff --name-status {prev_tag}..HEAD | grep '^A'` for new files.

3. Print the notes in the chat, in the format below. Then stop.

## Format

```
## Highlights

- {the two to four changes that make this release worth installing}

## Added

- {new capability}

## Changed

- {existing behaviour that now works differently}

## Fixed

- {bug that is gone}
```

Rules:

- **Always in English**, whatever language the conversation is in. These notes
  go on a public GitHub release, not into the chat.
- **Highlights first.** Two to four lines, the reasons someone would update.
  Each one a whole thought, not a teaser for a section below.
- Three sections after that: **Added**, **Changed**, **Fixed**. Drop a section
  that would be empty rather than writing "none".
- Cover every commit between the tag and HEAD. A change that landed and is not
  in the notes is a change nobody will know about.
- Write for someone using the app, not reading the diff: what is different for
  them, not which file moved. No commit hashes, no file paths, no internal
  module names.
- One line per change. If a line needs a "because", it belongs in Highlights.
- Plumbing with no user-visible effect — refactors, test additions, renames —
  is left out. Unless it changes something they would notice, in which case it
  is a Changed.
