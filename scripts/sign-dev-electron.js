#!/usr/bin/env node
// Make the Electron in node_modules an app macOS will send notifications for.
//
// Running from source, three things stand between a session that wants your
// answer and a banner on screen, and all three are about the bundle rather
// than the code:
//
//   1. The download is only linker-signed — ad-hoc, with its Info.plist
//      unbound and no sealed resources. macOS runs it, but does not accept it
//      as an app.
//   2. It calls itself com.github.Electron, an identity shared by every
//      Electron project on the machine and, once refused, remembered as
//      refused. Notifications come back "Notifications are not allowed for
//      this application".
//   3. LaunchServices has never heard of it.
//
// So: give it this app's own dev identity and name, sign it ad-hoc (nothing
// about who signed it changes — the point is the sealed bundle), and register
// it. After that `new Notification()` is shown by the system, which also
// means a click on it can open the session; without it main.js falls back to
// AppleScript, whose banners cannot.
//
// Runs on install and before `npm start`. Skipped when the bundle is already
// set up, and when that Electron is running — rewriting the signature of a
// mapped executable gets the process killed.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
const plist = path.join(app, 'Contents', 'Info.plist');
const pkg = require(path.join(root, 'package.json'));

// Its own identity, beside the packaged app's rather than instead of it: a
// dev build and an installed one can then be allowed separately.
const BUNDLE_ID = `${pkg.build?.appId || 'app.wootonpad'}.dev`;
const NAME = pkg.build?.productName || 'WootonPad';

const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/'
  + 'LaunchServices.framework/Support/lsregister';

function main() {
  if (process.platform !== 'darwin') return;
  if (!fs.existsSync(plist)) return;                   // packaged, or not installed yet
  if (done()) return;

  if (running()) {
    console.log('Electron is running from node_modules — leaving its bundle alone.');
    console.log('Notifications will come through AppleScript until the next restart.');
    return;
  }

  try {
    plistSet('CFBundleIdentifier', BUNDLE_ID);
    plistSet('CFBundleName', NAME);
    plistSet('CFBundleDisplayName', NAME);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
    if (fs.existsSync(LSREGISTER)) execFileSync(LSREGISTER, ['-f', app], { stdio: 'ignore' });
    console.log(`Prepared node_modules/electron as ${BUNDLE_ID} for notifications.`);
  } catch (err) {
    console.error('Could not prepare node_modules/electron:', err.message);
  }
}

/** Both halves already in place: our identity, and a sealed signature. */
function done() {
  if (plistGet('CFBundleIdentifier') !== BUNDLE_ID) return false;
  return /Sealed Resources version/.test(signature());
}

// `codesign -dv` reports on stderr, which is why this reads both streams —
// reading stdout alone came back empty and re-signed a bundle already done.
function signature() {
  const out = spawnSync('codesign', ['-dv', '--verbose=2', app], { encoding: 'utf8' });
  return `${out.stdout || ''}${out.stderr || ''}`;
}

function plistGet(key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function plistSet(key, value) {
  const command = plistGet(key) === null ? `Add :${key} string ${value}` : `Set :${key} ${value}`;
  execFileSync('/usr/libexec/PlistBuddy', ['-c', command, plist], { stdio: 'ignore' });
}

/** Is that Electron the one behind a live process? */
function running() {
  try {
    execFileSync('pgrep', ['-f', path.join(app, 'Contents', 'MacOS', 'Electron')], { stdio: 'ignore' });
    return true;
  } catch {
    return false;                                      // pgrep exits 1 with no match
  }
}

main();
