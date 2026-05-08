import { lazy, Suspense, Component } from 'react';

// The literal `import('remote/Widget')` is what triggers the bug. The plugin's
// proxyRemotes.resolveRemoteId hook (lib/index.mjs ~3489) calls
// addUsedRemote('remote', 'remote/Widget') for this specifier, so 'remote/Widget'
// ends up in usedRemotesMap as a non-bare entry. In 1.15 that entry is emitted
// as a runtime.loadRemote(...) call inside __mfRemotePreloads (lib/index.mjs ~1846),
// which is awaited via Promise.all BEFORE the host entry is imported. If the
// remote is unreachable, the preload rejects and the host entry never runs.
const RemoteWidget = lazy(() => import('remote/Widget'));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, border: '1px solid red' }}>
          Remote failed to load (handled locally by the host): {String(this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <main style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Host mounted</h1>
      <p>
        If you can read this, the host React app rendered. The box below should
        either show the remote widget (if the remote is up) or a local error
        message (if the remote is down). On 1.15 you will see neither, because
        React never mounts at all.
      </p>
      <ErrorBoundary>
        <Suspense fallback={<div>Loading remote...</div>}>
          <RemoteWidget />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
}
