# `@module-federation/vite` 1.15 — host bootstrap fails entirely when any remote is unreachable

In **1.14.x and earlier**, if a federated remote's `remoteEntry.js` was unreachable at host bootstrap, the host React app still mounted. Individual `import('remote/x')` calls would reject locally, and consumers could catch them (Suspense + Error Boundary, availability probes, etc.) and degrade gracefully.

In **1.15.0 – 1.15.2**, the host's generated bootstrap eagerly preloads every non-bare remote module specifier referenced anywhere in the host source via `Promise.all` **before** the host entry script is imported. If any one of those preloads rejects, the entry import never runs and React never mounts — the page stays blank.

This breaks any host that relies on a "best-effort" availability check (e.g. HEAD-probing each `remoteEntry.js` and hiding nav for dead ones), because the host code that performs the check no longer gets a chance to execute.

## TL;DR

| Version | Remote up | Remote down |
| ------- | --------- | ----------- |
| 1.14.5  | Host renders, widget renders                  | Host renders, error boundary catches the failed `import()` |
| 1.15.2  | Host renders, widget renders                  | **Blank page — host React never mounts** |

## Reproduce

Both apps are vanilla Vite + React 19 + `@module-federation/vite`. Host has a single `lazy(() => import('remote/Widget'))` wrapped in a Suspense + Error Boundary.

```bash
# install
( cd remote && npm install )
( cd host   && npm install )   # installs 1.15.2 by default

# success path: remote up, host on 1.15
( cd remote && npm run dev )      # terminal 1, port 5174
( cd host   && npm run dev )      # terminal 2, port 5173
# open http://localhost:5173 → "Host mounted" + "Widget rendered from remote"
```

### The bug — remote down on 1.15

```bash
# stop the remote (Ctrl+C in terminal 1) and reload http://localhost:5173
```

**Actual:** blank page. DevTools network tab shows the request to `http://localhost:5174/remoteEntry.js` failed (`ERR_CONNECTION_REFUSED`). The host's `/src/main.jsx` is never requested. React never mounts.

### The same code works on 1.14

```bash
( cd host && npm run use:1.14 && npm run dev )
# reload http://localhost:5173 with the remote still down
```

**Actual on 1.14.5:** "Host mounted" renders. The error boundary catches the failed `import('remote/Widget')` and shows a local error message. Graceful degradation works as expected.

Switch back with `npm run use:1.15`.

## Root cause

In `node_modules/@module-federation/vite/lib/index.mjs` (1.15.2):

```js
// ~line 1845
function getBootstrapSource(initSrc, entrySrc, useSystemImportFallback = false) {
    const remotePreloads = Object.entries(getUsedRemotesMap())
        .flatMap(([remoteKey, remotes]) =>
            Array.from(remotes).filter((remote) => remote !== remoteKey))
        .sort()
        .map((remote) => `runtime.loadRemote(${JSON.stringify(remote)})`)
        .join(",");
    // ...
    return `${getRuntimeModuleCacheBootstrapCode()}
${importHelper}(async () => {
  const { initHost } = await ${importExpression(initSrc)};
  const runtime = await initHost();
  const __mfRemotePreloads = [${remotePreloads}];
  await Promise.all(__mfRemotePreloads);
})().then(() => ${importExpression(entrySrc)});
`;
}
```

The host bootstrap runs `await Promise.all(__mfRemotePreloads)` with no `.catch`, **before** the host entry script (`entrySrc`, e.g. `/src/main.jsx`) is ever imported. `Promise.all` rejects on the first failure, the chained `.then(() => import(entrySrc))` never fires, React never mounts.

Entries land in `usedRemotesMap` from two places:

* `pluginProxyRemotes.resolveRemoteId` (~line 3489) — `addUsedRemote(remoteName, source)` is called for **every** literal `import('remote/x')` Vite resolves. `source` here is the full specifier (e.g. `'remote/Widget'`), which is non-bare (`source !== remoteName`), so it survives the `r !== remoteKey` filter on line 1846 and ends up in the preload list.
* The plugin's `config` hook (~line 4334) — `for (const key of Object.keys(remotes)) addUsedRemote(key, key)`. These are bare entries (`source === remoteKey`), so they're filtered out of the preload list.

So *any* host that does a literal `import('remote/exposed')` anywhere in its module graph triggers the eager preload. Hosts that only use `runtime.loadRemote(...)` at runtime (no static `import()` of remote sub-paths) avoid it.

1.14.x has no `getBootstrapSource` and no `__mfRemotePreloads` — the host entry imports immediately after `initHost()` resolves, and individual remote imports succeed-or-fail independently at the call site.

## Suggested fixes (any of these would unblock us)

1. **Wrap each preload in `.catch`** so one dead remote doesn't sink the whole bootstrap. The host's existing per-call error handling (Suspense / Error Boundary / try-catch) can then handle the eventual failure when the consumer actually needs the module:

   ```js
   const __mfRemotePreloads = [
     runtime.loadRemote('remote/Widget').catch(() => {}),
     // ...
   ];
   await Promise.all(__mfRemotePreloads);
   ```

2. **Use `Promise.allSettled`** instead of `Promise.all`. Same effect — the bootstrap completes regardless of individual remote failures, and the host gets to mount.

3. **Add a plugin option** (`preloadUsedRemotes: false` or similar) to opt out of the eager preload entirely. We'd opt out and rely on lazy `import()` like we did on 1.14.

The behavior change should at minimum be documented; even with the preload kept, swallowing failures (or making it opt-in) would restore the existing graceful-degradation pattern.

## Environment

* `@module-federation/vite` 1.15.2 (broken) vs 1.14.5 (works)
* Vite 7.x
* React 19.2.5
* Node 20+
* Reproduces in `vite` (dev mode); also reproduces under `vite build && vite preview`.

## Files of interest in this repro

* `host/src/App.jsx` — the literal `lazy(() => import('remote/Widget'))` that triggers the issue
* `host/vite.config.js` — minimal federation host config
* `remote/vite.config.js` — minimal federation remote exposing `./Widget`
