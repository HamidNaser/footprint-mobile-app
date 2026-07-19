import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { RealtimeProvider } from './src/context/RealtimeContext';
import { SyncProvider } from './src/context/SyncContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <RealtimeProvider>
            <AppNavigator />
            <StatusBar style="auto" />
          </RealtimeProvider>
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
