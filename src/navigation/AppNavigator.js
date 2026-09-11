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
import LoginScreen from '../screens/LoginScreen';
import InterviewModeScreen from '../screens/InterviewModeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import EventFormScreen from '../screens/EventFormScreen';

// Auth context
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
});
