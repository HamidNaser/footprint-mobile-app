// Polyfill crypto.getRandomValues() — required by uuid on Hermes/SDK 54.
import 'react-native-get-random-values';

import React from 'react';
import { registerRootComponent } from 'expo';
import { Text, ScrollView } from 'react-native';

// --- Diagnostic startup guard -------------------------------------------------
// Renders the real launch error on screen instead of a blank screen.
//
// IMPORTANT: ./App is pulled in with a lazy require() inside render(), NOT a
// static `import`. Static imports are hoisted and evaluated before any module
// body code runs, so a throw anywhere in App's dependency graph happened before
// this guard existed and was uncatchable. That is why build 11 still showed a
// blank screen despite having an error boundary.
//
// Remove this whole guard once the startup issue is diagnosed.

let pendingError = null;
let notify = null;

try {
  const g = global;
  if (g && g.ErrorUtils && typeof g.ErrorUtils.setGlobalHandler === 'function') {
    g.ErrorUtils.setGlobalHandler((e) => {
      pendingError = e;
      if (notify) notify(e);
    });
  }
} catch (_) {}

function ErrorView({ error, phase }) {
  const message = String((error && error.message) || error);
  const stack = String((error && error.stack) || '(no stack)').slice(0, 4000);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#2b0000' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80 }}
    >
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
        Startup Error [{phase}]
      </Text>
      <Text selectable style={{ color: '#ffd0d0', marginTop: 16, fontSize: 15 }}>
        {message}
      </Text>
      <Text selectable style={{ color: '#ffa0a0', marginTop: 16, fontSize: 11 }}>
        {stack}
      </Text>
    </ScrollView>
  );
}

class StartupGuard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: pendingError, phase: pendingError ? 'global' : null };
  }

  componentDidMount() {
    notify = (e) => this.setState((s) => (s.error ? s : { error: e, phase: 'global' }));
    if (pendingError && !this.state.error) {
      this.setState({ error: pendingError, phase: 'global' });
    }
  }

  static getDerivedStateFromError(error) {
    return { error, phase: 'render' };
  }

  render() {
    if (this.state.error) {
      return <ErrorView error={this.state.error} phase={this.state.phase} />;
    }

    // Phase 1: module evaluation of the whole app dependency graph.
    let App;
    try {
      App = require('./App').default;
    } catch (e) {
      return <ErrorView error={e} phase="import" />;
    }

    if (typeof App !== 'function') {
      return <ErrorView error={new Error(`./App default export is ${typeof App}, expected a component`)} phase="import" />;
    }

    // Phase 2: first render. Errors deeper in the tree are caught by
    // getDerivedStateFromError above; this catches a synchronous throw in App itself.
    try {
      return <App />;
    } catch (e) {
      return <ErrorView error={e} phase="render" />;
    }
  }
}

registerRootComponent(StartupGuard);
