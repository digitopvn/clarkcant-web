// cf runs local D1 commands in Miniflare, which watches the dev registry
// directory, and cf 1.0.0-beta.12 never disposes it. On Linux CI that watcher
// keeps Node alive after the command has finished. Unref'd watchers still work
// but no longer hold the process open. Remove once cf disposes its local runtime.
const fs = require('node:fs');
const watch = fs.watch;
fs.watch = function (...args) {
  const watcher = watch.apply(this, args);
  watcher.unref?.();
  return watcher;
};
