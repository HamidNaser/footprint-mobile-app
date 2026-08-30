import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Screen imports
import HomeScreen from '../screens/HomeScreen';
import JournalScreen from '../screens/JournalScreen';
import PersonJournalScreen from '../screens/PersonJournalScreen';
import FamilyScreen from '../screens/FamilyScreen';
import FriendsScreen from '../screens/FriendsScreen';
import PlacesScreen from '../screens/PlacesScreen';
import TimelineScreen from '../screens/TimelineScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LoginScreen from '../screens/LoginScreen';
import InterviewModeScreen from '../screens/InterviewModeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import EventFormScreen from '../screens/EventFormScreen';

// Auth context
import { useAuth } from '../context/AuthContext';

// Theme
import { useTheme, ThemeBottomNavigation } from '../theme';

/**
 * Route -> semantic icon name. The active theme decides what each one looks
 * like, so adding a theme never touches this map.
 */
const ROUTE_ICONS = {
  Home: 'home',
  Journal: 'journal',
  Family: 'family',
  Friends: 'friends',
  Places: 'places',
  Timeline: 'timeline',
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <ThemeBottomNavigation {...props} routeIcons={ROUTE_ICONS} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Journal" component={JournalScreen} />
      <Tab.Screen name="Family" component={FamilyScreen} />
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="Places" component={PlacesScreen} />
      <Tab.Screen name="Timeline" component={TimelineScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const theme = useTheme();

  // Show loading screen while checking auth status
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          // Authenticated: Show main app
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen 
              name="Profile" 
              component={ProfileScreen}
              options={{
                presentation: 'card',
              }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{
                presentation: 'card',
              }}
            />
            <Stack.Screen 
              name="InterviewMode" 
              component={InterviewModeScreen}
              options={{
                presentation: 'fullScreenModal',
              }}
            />
            <Stack.Screen 
              name="PersonJournal" 
              component={PersonJournalScreen}
              options={{
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="Events"
              component={EventsScreen}
              options={{
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="EventDetail"
              component={EventDetailScreen}
              options={{
                presentation: 'card',
              }}
            />
            <Stack.Screen
              name="EventForm"
              component={EventFormScreen}
              options={{
                presentation: 'fullScreenModal',
              }}
            />
          </>
        ) : (
          // Not authenticated: Show login
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{
              animationTypeForReplace: 'pop',
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
