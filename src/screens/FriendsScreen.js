/**
 * FriendsScreen - Friends Network View
 * 
 * Displays friends in two views:
 * - List: Detailed friend cards with personal info
 * - Tree: Hierarchical view by organization (Education, Work)
 * 
 * Matches web app (footprint-web-app) functionality.
 */

import React, { useState, memo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FRIENDS_LIST_DATA, FRIENDS_TREE_DATA } from '../data/friendsData';
import { useAuth } from '../context/AuthContext';
import { getFriends } from '../services/SocialService';
import {
  useTheme,
  useThemedStyles,
  ThemeAvatar,
  ThemeBackground,
  ThemeFloatingButton,
  ThemeHeader,
  ThemeIcon,
  ThemeTabBar,
} from '../theme';

const VIEW_TABS = [
  { key: 'list', label: 'List' },
  { key: 'tree', label: 'Tree' },
];

/**
 * Friend Detail Row - Shows icon + label + value
 */
const FriendDetailRow = memo(({ iconName, label, value, isLink }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!value) return null;

  return (
    <View style={styles.detailRow}>
      <Ionicons name={iconName} size={14} color={theme.colors.textSecondary} style={styles.detailIcon} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, isLink && styles.detailValueLink]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
});

/**
 * Friend List Card - Detailed card for list view
 */
const FriendListCard = memo(({ friend, isSelected, onPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={[styles.friendListCard, isSelected && styles.friendListCardSelected]}
      onPress={() => onPress?.(friend)}
      activeOpacity={0.7}
    >
      {/* Header with avatar and name */}
      <View style={styles.friendListCardHeader}>
        <Image source={{ uri: friend.avatar }} style={styles.friendListAvatar} />
        <Text style={styles.friendListName} numberOfLines={1}>{friend.name}</Text>
        <TouchableOpacity style={styles.addButton}>
          <ThemeIcon name="add-person" size={14} color={theme.colors.onPrimary} active />
        </TouchableOpacity>
      </View>

      {/* Details */}
      <View style={styles.friendListDetails}>
        <FriendDetailRow
          iconName="location-outline"
          label="Lives in"
          value={friend.location}
          isLink
        />
        <FriendDetailRow
          iconName="gift-outline"
          label="Born"
          value={friend.birthday}
        />
        <FriendDetailRow
          iconName="school-outline"
          label="Went to"
          value={friend.education}
          isLink
        />
        {friend.work && (
          <FriendDetailRow
            iconName="briefcase-outline"
            label="Works at"
            value={friend.work}
            isLink
          />
        )}
      </View>
    </TouchableOpacity>
  );
});

/**
 * List View - Detailed friend cards
 */
const ListView = memo(({ data, selectedFriend, onFriendPress, loading, refreshing, onRefresh }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (loading && (!data || data.length === 0)) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.listScrollView}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
    >
      <View style={styles.listContainer}>
        {data.map((friend) => (
          <FriendListCard
            key={friend.id}
            friend={friend}
            isSelected={selectedFriend?.id === friend.id}
            onPress={onFriendPress}
          />
        ))}
      </View>
    </ScrollView>
  );
});

/**
 * Friend Card - Small card for tree view
 */
const FriendCard = memo(({ friend, onPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity
      style={styles.friendCard}
      onPress={() => onPress?.(friend)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: friend.avatar }} style={styles.friendCardAvatar} />
      <View style={styles.friendCardInfo}>
        <Text style={styles.friendCardName} numberOfLines={1}>{friend.name}</Text>
        <Text style={styles.friendCardLocation} numberOfLines={1}>{friend.location}</Text>
      </View>
      <TouchableOpacity style={styles.friendCardAction}>
        <Ionicons name="person-circle-outline" size={20} color={theme.colors.primary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

/**
 * Organization Panel - Shows org logo/name and friend list
 * - Tap org header = view all friends from this org (group)
 * - Tap individual friend = view that friend's journal
 */
const OrganizationPanel = memo(({ org, onOrgPress, onFriendPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.orgPanel}>
      {/* Org Header - Tap for group journal */}
      <TouchableOpacity 
        style={styles.orgHeader}
        onPress={() => onOrgPress?.(org)}
        activeOpacity={0.7}
      >
        <Image source={{ uri: org.logo }} style={styles.orgLogo} resizeMode="contain" />
        <Text style={styles.orgName}>{org.name}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
      </TouchableOpacity>

      {/* Friends */}
      <View style={styles.orgFriends}>
        {org.friends.map((friend) => (
          <FriendCard key={friend.id} friend={friend} onPress={onFriendPress} />
        ))}
      </View>
    </View>
  );
});

/**
 * Category Icon Card - Left side showing category icon (like FamilyHeadCard)
 */
const CategoryIconCard = memo(({ category, isLast }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.categoryIconWrapper}>
      {/* Category Icon Circle */}
      <View style={styles.categoryIconCircle}>
        <Ionicons name={category.icon} size={18} color={theme.colors.onPrimary} />
      </View>

      {/* Vertical connector to next category (dashed line) */}
      {!isLast && <View style={styles.categoryVerticalConnector} />}
    </View>
  );
});

/**
 * Category Organizations - Right side showing organizations (like FamilyBranchMembers)
 */
const CategoryOrganizations = memo(({ organizations, onOrgPress, onFriendPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.categoryOrgsContainer}>
      {/* Horizontal connector line */}
      <View style={styles.categoryHorizontalConnector} />

      <View style={styles.categoryOrgsList}>
        {organizations.map((org) => (
          <OrganizationPanel 
            key={org.id} 
            org={org} 
            onOrgPress={onOrgPress}
            onFriendPress={onFriendPress} 
          />
        ))}
      </View>
    </View>
  );
});

/**
 * Category Section - Complete category unit (icon + organizations)
 * Mirrors FamilyHeadGroup structure
 */
const CategorySection = memo(({ category, isLast, onOrgPress, onFriendPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.categoryGroup}>
      <CategoryIconCard category={category} isLast={isLast} />
      <CategoryOrganizations
        organizations={category.organizations}
        onOrgPress={onOrgPress}
        onFriendPress={onFriendPress}
      />
    </View>
  );
});

/**
 * Tree View - Hierarchical view by organization
 * Mirrors FamilyScreen BranchView structure
 */
const TreeView = memo(({ data, onOrgPress, onFriendPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.treeScrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.treeContainer}>
        {/* User Profile Card with vertical connector */}
        <View style={styles.userGroup}>
          <View style={styles.userCardWrapper}>
            {/* User Card */}
            <View style={styles.userProfileCard}>
              <View style={styles.userAvatarWrapper}>
                <Image source={{ uri: data.user.avatar }} style={styles.userAvatar} />
                <View style={styles.userBadge}>
                  <ThemeIcon name="family" size={12} color={theme.colors.onPrimary} active />
                </View>
              </View>
              <Text style={styles.userName}>{data.user.name}</Text>
              <Text style={styles.userBirth}>{data.user.birthYear}</Text>
            </View>

            {/* Vertical connector from user to first category */}
            <View style={styles.userVerticalConnector} />
          </View>
        </View>

        {/* Categories */}
        <View style={styles.categoriesContainer}>
          {data.categories.map((category, idx) => (
            <CategorySection
              key={category.id}
              category={category}
              isLast={idx === data.categories.length - 1}
              onOrgPress={onOrgPress}
              onFriendPress={onFriendPress}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
});

/**
 * Location FAB
 */
const LocationFAB = memo(({ onPress }) => (
  <ThemeFloatingButton
    icon="location"
    onPress={onPress}
    accessibilityLabel="Show friends on map"
  />
));

/**
 * Main FriendsScreen Component
 */
export default function FriendsScreen({ navigation }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, accessToken } = useAuth();
  const [activeView, setActiveView] = useState('list');
  const [selectedFriend, setSelectedFriend] = useState(null);

  // Live friends (network-first). Falls back to bundled mock data when there's
  // no token or the account has no friends yet.
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!accessToken) {
      setFriends(FRIENDS_LIST_DATA);
      setLoading(false);
      return;
    }
    try {
      const live = await getFriends(accessToken);
      setFriends(live.length > 0 ? live : FRIENDS_LIST_DATA);
    } catch (err) {
      console.warn('[FriendsScreen] Failed to load friends:', err.message);
      setFriends((prev) => (prev.length > 0 ? prev : FRIENDS_LIST_DATA));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFriends();
    setRefreshing(false);
  }, [loadFriends]);

  // Handle tapping organization - opens group journal of all friends from that org
  const handleOrgPress = useCallback((org) => {
    console.log('Selected org:', org.name);
    
    // Collect all friends from this organization
    const orgFriends = org.friends.map(friend => ({
      id: `friend_${friend.id}`,
      name: friend.name,
      avatar: friend.avatar,
    }));
    
    // Navigate to PersonJournalScreen in group mode
    navigation.navigate('PersonJournal', {
      persons: orgFriends,
      isGroup: true,
      groupName: `${org.name} Friends`,
      sourceType: 'friend',
    });
  }, [navigation]);

  // Handle tapping individual friend - opens their personal journal
  const handleFriendPress = useCallback((friend) => {
    setSelectedFriend(friend);
    console.log('Selected friend:', friend.name);
    // Navigate to PersonJournalScreen to view their individual journal. `id` is
    // the friend's real user account so PersonJournal can fetch live entries.
    navigation.navigate('PersonJournal', {
      person: {
        id: friend.id,
        name: friend.name,
        avatar: friend.avatar,
      },
      isGroup: false,
      sourceType: 'friend',
    });
  }, [navigation]);

  const handleLocationPress = useCallback(() => {
    console.log('Location FAB pressed');
    // TODO: Show friends on map
  }, []);

  return (
    <ThemeBackground edges={['top']} variant="full">
      <ThemeHeader
        title="Friends"
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

      <ThemeTabBar
        tabs={VIEW_TABS}
        value={activeView}
        onChange={setActiveView}
        style={styles.viewToggle}
      />

      {/* Content */}
      {activeView === 'list' ? (
        <ListView
          data={friends}
          selectedFriend={selectedFriend}
          onFriendPress={handleFriendPress}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      ) : (
        <TreeView 
          data={FRIENDS_TREE_DATA} 
          onOrgPress={handleOrgPress}
          onFriendPress={handleFriendPress} 
        />
      )}

      {/* Location FAB */}
      <LocationFAB onPress={handleLocationPress} />
    </ThemeBackground>
  );
}

const makeStyles = (theme) =>
  StyleSheet.create({
    viewToggle: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },

  // View Toggle
  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 25,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 20,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  toggleTextActive: {
    color: theme.colors.primary,
  },

  // List View
  listScrollView: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },

  // Friend List Card
  friendListCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
  },
  friendListCardSelected: {
    borderColor: theme.colors.primary,
  },
  friendListCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  friendListAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  friendListName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginLeft: 12,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Friend Details
  friendListDetails: {
    marginLeft: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailIcon: {
    width: 18,
  },
  detailLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    width: 60,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  detailValueLink: {
    color: theme.colors.primary,
  },

  // Tree View - mirrors Family screen structure
  treeScrollView: {
    flex: 1,
  },
  treeContainer: {
    padding: 16,
  },

  // User Group (at top)
  userGroup: {
    alignItems: 'flex-start',
    marginBottom: 0, // No gap - connector bridges to categories
  },

  // User Card Wrapper (like headCardWrapper in Family)
  userCardWrapper: {
    alignItems: 'center',
  },

  // User Profile Card
  userProfileCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    padding: 12,
    alignItems: 'center',
    width: 100,
  },
  userAvatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  userBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  userBirth: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },

  // Vertical connector from user card to first category
  userVerticalConnector: {
    width: 2,
    height: 24,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.border,
    borderStyle: 'dashed',
  },

  // Categories Container
  categoriesContainer: {
    paddingLeft: 32, // Align category icons with center of user card
  },

  // Category Group (like headGroup in Family) - row layout
  categoryGroup: {
    flexDirection: 'row',
    alignItems: 'stretch', // Make children stretch to fill height
  },

  // Category Icon Wrapper (like headCardWrapper in Family)
  categoryIconWrapper: {
    alignItems: 'center',
    alignSelf: 'stretch', // Stretch to full height of row
  },

  // Category icon circle
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Vertical connector below category icon - fills available height
  categoryVerticalConnector: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: theme.colors.border,
  },

  // Category Organizations Container (like branchMembersContainer in Family)
  categoryOrgsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Horizontal connector from icon to organizations
  categoryHorizontalConnector: {
    width: 16,
    height: 2,
    backgroundColor: theme.colors.border,
    marginTop: 17, // Center with icon (36/2 - 1)
  },

  // Organizations list
  categoryOrgsList: {
    flex: 1,
    gap: 12,
  },

  // Organization Panel
  orgPanel: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
  },
  orgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  orgLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  orgName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  orgFriends: {
    gap: 8,
  },

  // Friend Card (for tree view)
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  friendCardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  friendCardInfo: {
    flex: 1,
    marginLeft: 10,
  },
  friendCardName: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  friendCardLocation: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  friendCardAction: {
    padding: 4,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
