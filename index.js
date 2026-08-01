// Polyfill crypto.getRandomValues() — required by uuid on Hermes/SDK 54.
import 'react-native-get-random-values';

import React from 'react';
import { registerRootComponent } from 'expo';
import { View, Text, ScrollView } from 'react-native';
import App from './App';

// --- Diagnostic startup guard -------------------------------------------------
// Renders the real launch/render error on screen instead of a blank screen.
// Works now that we're on the New Architecture (JS render errors are catchable).
// Remove once the blank-screen issue is resolved.
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

class StartupGuard extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: pendingError };
  }

  componentDidMount() {
    notify = (e) => this.setState((s) => (s.error ? s : { error: e }));
    if (pendingError && !this.state.error) this.setState({ error: pendingError });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const err = this.state.error;
    if (err) {
      const message = String((err && err.message) || err);
      const stack = String((err && err.stack) || '').slice(0, 2500);
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#2b0000' }} contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>Startup Error</Text>
          <Text selectable style={{ color: '#ffd0d0', marginTop: 16, fontSize: 15 }}>{message}</Text>
          <Text selectable style={{ color: '#ffa0a0', marginTop: 16, fontSize: 11 }}>{stack}</Text>
        </ScrollView>
      );
    }
    return <App />;
  }
}

registerRootComponent(StartupGuard);
