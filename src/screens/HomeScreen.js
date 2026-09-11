/**
 * HomeScreen
 *
 * Landing screen. Presentation is entirely theme-driven -- see src/theme.
 */
import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  useTheme,
  useThemedStyles,
  ThemeAvatar,
  ThemeBackground,
  ThemeCard,
  ThemeHeader,
  ThemeIcon,
  ThemeText,
} from '../theme';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <ThemeBackground edges={['top']} variant="full">
      <ThemeHeader
        title="Home"
        right={
          <>
            <TouchableOpacity
              style={styles.headerIcon}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <ThemeIcon name="notification" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Profile"
            >
              <ThemeAvatar uri={user?.avatarUrl} name={user?.name} size={36} />
            </TouchableOpacity>
          </>
        }
      />

      <View style={styles.content}>
        <ThemeText role="display" style={styles.title}>Welcome to FootPrint</ThemeText>
        <ThemeText role="label" style={styles.subtitle}>Your personal journal awaits</ThemeText>

        <TouchableOpacity
          onPress={() => navigation.navigate('Events')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Events. Create and manage invitations"
          style={styles.quickActionPress}
        >
          <ThemeCard contentStyle={styles.quickAction}>
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.primary }]}>
              <ThemeIcon name="calendar" size={22} color={theme.colors.onPrimary} active />
            </View>
            <View style={styles.quickActionText}>
              <ThemeText role="title" style={styles.quickActionTitle}>Events</ThemeText>
              <ThemeText role="label" style={styles.quickActionSubtitle}>
                Create &amp; manage invitations
              </ThemeText>
            </View>
            <ThemeIcon name="chevron-down" size={20} color={theme.colors.textSecondary} />
          </ThemeCard>
        </TouchableOpacity>
      </View>
    </ThemeBackground>
  );
}

const makeStyles = (theme) =>
  StyleSheet.create({
    headerIcon: { padding: 4 },

    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: theme.spacing.xl,
    },
    title: { marginBottom: theme.spacing.sm, textAlign: 'center' },
    subtitle: { color: theme.colors.textSecondary },

    quickActionPress: { alignSelf: 'stretch', marginTop: theme.spacing.xxl },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.lg,
    },
    quickActionIcon: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.thumb + 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: theme.spacing.md,
    },
    quickActionText: { flex: 1 },
    quickActionTitle: { marginBottom: 2 },
    quickActionSubtitle: { color: theme.colors.textSecondary },
  });
