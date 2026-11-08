import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Screen imports
import HomeScreen from '../screens/HomeScreen';
import JournalScreen from '../screens/JournalScreen';
import PersonJournalScreen from '../screens/PersonJournalScreen';
import FamilySummaryScreen from '../screens/FamilySummaryScreen';
import FamilyScreen from '../screens/FamilyScreen';
import FriendsScreen from '../screens/FriendsScreen';
import PlacesScreen from '../screens/PlacesScreen';
import TimelineScreen from '../screens/TimelineScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ImportScreen from '../screens/ImportScreen';
import UndatedPhotosScreen from '../screens/UndatedPhotosScreen';
import LoginScreen from '../screens/LoginScreen';
import InterviewModeScreen from '../screens/InterviewModeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import EventFormScreen from '../screens/EventFormScreen';
import CaptureScreen from '../screens/capture/CaptureScreen';
import CaptureFab from '../components/capture/CaptureFab';

// Auth context
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * Wraps a tab's screen with the capture FAB (FR-001). Defined once per screen, outside
 * `MainTabs`, so `Tab.Screen`'s `component` prop keeps the same identity across renders --
 * an inline wrapper recreated on every render of `MainTabs` would be a new component type
 * each time, and React would remount the tab (and lose its state) whenever `MainTabs`
 * re-rendered.
 */
function withCaptureFab(ScreenComponent) {
  function TabScreenWithCaptureFab(props) {
    return (
      <View style={styles.tabScreenContainer}>
        <ScreenComponent {...props} />
        <CaptureFab />
      </View>
    );
  }
  TabScreenWithCaptureFab.displayName = `withCaptureFab(${ScreenComponent.displayName || ScreenComponent.name || 'Screen'})`;
  return TabScreenWithCaptureFab;
}

const HomeTab = withCaptureFab(HomeScreen);
const JournalTab = withCaptureFab(JournalScreen);
const FamilyTab = withCaptureFab(FamilyScreen);
const FriendsTab = withCaptureFab(FriendsScreen);
const PlacesTab = withCaptureFab(PlacesScreen);
const TimelineTab = withCaptureFab(TimelineScreen);

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Journal':
              iconName = focused ? 'book' : 'book-outline';
              break;
            case 'Family':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Friends':
              iconName = focused ? 'person-add' : 'person-add-outline';
              break;
            case 'Places':
              iconName = focused ? 'map' : 'map-outline';
              break;
            case 'Timeline':
              iconName = focused ? 'git-branch' : 'git-branch-outline';
              break;
            default:
              iconName = 'ellipse';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2B7DE9',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Journal" component={JournalTab} />
      <Tab.Screen name="Family" component={FamilyTab} />
      <Tab.Screen name="Friends" component={FriendsTab} />
      <Tab.Screen name="Places" component={PlacesTab} />
      <Tab.Screen name="Timeline" component={TimelineTab} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading screen while checking auth status
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2B7DE9" />
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
              name="Import"
              component={ImportScreen}
              options={{
                presentation: 'card',
              }}
            />
            {/*
              * A standing workspace, not a step in an import (FR-013a) — somebody may date a
              * few today and the rest in a month, so it has its own route.
              */}
            <Stack.Screen
              name="UndatedPhotos"
              component={UndatedPhotosScreen}
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
              name="FamilySummary"
              component={FamilySummaryScreen}
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
            <Stack.Screen
              name="Capture"
              component={CaptureScreen}
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
    backgroundColor: '#fff',
  },
  tabScreenContainer: {
    flex: 1,
  },
});
