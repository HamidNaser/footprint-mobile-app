import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { RealtimeProvider } from './src/context/RealtimeContext';
import { SyncProvider } from './src/context/SyncContext';

export default function App() {
  return (
    <SafeAreaProvider>
      {/*
        This branch ships with Enchanted Storybook on so it can be evaluated on
        a device without digging through Settings. Change this to 'default' (or
        drop the prop) to make the current look the out-of-the-box one; the
        Settings > Appearance picker switches it live either way.
      */}
      <ThemeProvider initialThemeKey="enchantedStorybook">
      <AuthProvider>
        <SyncProvider>
          <RealtimeProvider>
            <AppNavigator />
            <StatusBar style="auto" />
          </RealtimeProvider>
        </SyncProvider>
      </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
