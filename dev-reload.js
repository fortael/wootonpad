// dev-reload.js — running from source, pick up edits without a manual restart.
//
// Two kinds of change, two responses:
//
//   main-process code  every local module main.js has loaded by the time this
//                      runs — the process has to start over, so the app
//                      relaunches
//   renderer           public/vue-bundle.js and style.css, rebuilt by
//                      `vite build --watch` — the window reloads
//
// Never in a packaged app, which does not ship chokidar (a dev dependency).

const path = require('path');

/** Local source files among loaded modules: inside `root`, outside node_modules. */
function mainProcessFiles(loaded, root) {
  const inside = root.endsWith(path.sep) ? root : root + path.sep;
  return loaded.filter(f => f.startsWith(inside) && !f.split(path.sep).includes('node_modules'));
}

/**
 * @param {object} opts
 * @param {Electron.App} opts.app
 * @param {string} opts.root  the app's source folder
 * @param {() => Electron.BrowserWindow|null} opts.getWindow
 */
function watchForDevReload({ app, root, getWindow }) {
  if (app.isPackaged) return;
  let chokidar;
  try { chokidar = require('chokidar'); } catch { return; }

  let relaunching = false;
  const main = chokidar.watch(mainProcessFiles(Object.keys(require.cache), root), { ignoreInitial: true })
    .on('change', () => {
      if (relaunching) return;
      relaunching = true;
      app.relaunch();
      app.exit(0);
    });

  let timer;
  // The bundle, and the stylesheets the page loads as files — a CSS edit that
  // needed a manual reload was an edit easy to think had not worked.
  const renderer = chokidar.watch(
    [
      path.join(root, 'public', 'vue-bundle.js'),
      path.join(root, 'public', 'style.css'),
      path.join(root, 'public', 'css'),
    ],
    { ignoreInitial: true },
  ).on('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.reloadIgnoringCache();
    }, 400);
  });

  app.on('quit', () => { main.close(); renderer.close(); });
}

module.exports = { watchForDevReload, mainProcessFiles };
