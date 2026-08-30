/**
 * FamilyScreen - Family Tree View
 *
 * Displays family connections in two views:
 * - List: Flat list of family members
 * - Me/Branch: Hierarchical tree showing generations
 *
 * Matches web app (footprint-web-app) functionality.
 *
 * Presentation comes entirely from the active theme (see src/theme). Nothing in
 * here names a colour, a font or a border width -- swapping the theme in
 * Settings restyles this screen without touching it.
 */

import React, { useState, memo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useFamilyTree } from '../hooks/useFamilyTree';
import {
  useTheme,
  useThemedStyles,
  ThemeAvatar,
  ThemeBackground,
  ThemeCard,
  ThemeFloatingButton,
  ThemeHeader,
  ThemeIcon,
  ThemeTabBar,
  ThemeText,
} from '../theme';

const VIEW_TABS = [
  { key: 'list', label: 'List' },
  { key: 'me', label: 'Me' },
];

/**
 * Small circular "add person" affordance used on every member row.
 */
const AddPersonButton = memo(({ onPress, label }) => {
  const theme = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label || 'Add person'}
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        borderWidth: theme.borders.avatar.width > 1 ? 1 : 0,
        borderColor: theme.colors.accent,
      }}
    >
      <ThemeIcon name="add-person" size={13} color={theme.colors.onPrimary} active />
    </TouchableOpacity>
  );
});

/**
 * Family Member Row - Used in spouse/children list
 */
const FamilyMemberRow = memo(({ member, role, onPress }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.memberRow} onPress={() => onPress?.(member)}>
      <ThemeAvatar uri={member.avatar} name={member.name} size={36} style={styles.rowAvatar} />
      <ThemeText role="body" style={styles.memberName} numberOfLines={1}>
        {member.name}
        {role ? <ThemeText role="label" style={styles.roleLabel}> ({role})</ThemeText> : null}
      </ThemeText>
      <AddPersonButton label={`Add relative of ${member.name}`} />
    </TouchableOpacity>
  );
});

/**
 * Family Head Card - Left side card showing head of family unit
 * Tapping this opens the WHOLE FAMILY's journal (group mode)
 */
const FamilyHeadCard = memo(({ head, isLast, onFamilyPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const firstName = head.name.split(' ')[0];
  const lastName = head.name.split(' ').slice(1).join(' ');

  return (
    <View style={styles.headCardWrapper}>
      <TouchableOpacity
        onPress={() => onFamilyPress?.(head)}
        accessibilityRole="button"
        accessibilityLabel={`${head.name} family journal`}
      >
        <ThemeCard selected={head.isMe} style={styles.headCard} contentStyle={styles.headCardInner}>
          <ThemeAvatar uri={head.avatar} name={head.name} size={50} style={styles.headAvatar} />
          <ThemeText role="body" style={styles.headFirstName}>{firstName}</ThemeText>
          <ThemeText role="label" style={styles.headLastName}>{lastName}</ThemeText>
          <ThemeText role="caption" style={styles.headBirthYear}>Born {head.birthYear}</ThemeText>
        </ThemeCard>

        {/* Badge sits outside the card body so the card's inner rule stays intact */}
        <View style={[styles.headBadge, { backgroundColor: theme.colors.primary }]}>
          <ThemeIcon name="add-person" size={12} color={theme.colors.onPrimary} active />
        </View>
      </TouchableOpacity>

      {/* Vertical connector to next head (dashed line) */}
      {!isLast && <View style={styles.verticalConnector} />}
    </View>
  );
});

/**
 * Family Branch Members - Right side showing spouse and children
 */
const FamilyBranchMembers = memo(({ spouse, children, onMemberPress }) => {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.branchMembersContainer}>
      {/* Horizontal connector line */}
      <View style={styles.horizontalConnector} />

      <ThemeCard style={styles.branchMembersList} contentStyle={styles.branchMembersInner}>
        {spouse && (
          <FamilyMemberRow member={spouse} role={spouse.role} onPress={onMemberPress} />
        )}

        {children && children.length > 0 && (
          <>
            <ThemeText role="caption" style={styles.childrenLabel}>Childrens</ThemeText>
            {children.map((child) => (
              <FamilyMemberRow key={child.id} member={child} onPress={onMemberPress} />
            ))}
          </>
        )}
      </ThemeCard>
    </View>
  );
});

/**
 * Family Head Group - Complete family unit (head + spouse + children)
 * - Tap head card = view family journal (group)
 * - Tap spouse/children = view individual journal
 */
const FamilyHeadGroup = memo(({ head, isLast, onFamilyPress, onMemberPress }) => {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.headGroup}>
      <FamilyHeadCard head={head} isLast={isLast} onFamilyPress={onFamilyPress} />
      <FamilyBranchMembers
        spouse={head.spouse}
        children={head.children}
        onMemberPress={onMemberPress}
      />
    </View>
  );
});

/**
 * Branch View - Hierarchical tree view ("Me" tab)
 */
const BranchView = memo(({ data, onFamilyPress, onMemberPress }) => {
  const styles = useThemedStyles(makeStyles);
  const branches = data?.branches || [];

  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.branchTree}>
        {branches.map((head, index) => (
          <FamilyHeadGroup
            key={head.id}
            head={head}
            isLast={index === branches.length - 1}
            onFamilyPress={onFamilyPress}
            onMemberPress={onMemberPress}
          />
        ))}
      </View>
    </ScrollView>
  );
});

/**
 * List View Family Card - Expandable card for list view
 * - Tap primary (head) = view family journal (group)
 * - Tap spouse/children = view individual journal
 */
const ListFamilyCard = memo(({ family, onFamilyPress, onMemberPress }) => {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [expanded, setExpanded] = useState(family.isMe || false);
  const hasChildren = family.children && family.children.length > 0;

  return (
    <ThemeCard selected={family.isMe} style={styles.listCard} contentStyle={styles.listCardInner}>
      {/* Primary member - Tap for family journal */}
      <TouchableOpacity
        style={styles.listMemberRow}
        onPress={() => onFamilyPress?.(family)}
        accessibilityRole="button"
        accessibilityLabel={`${family.name} family journal`}
      >
        <ThemeAvatar uri={family.avatar} name={family.name} size={40} style={styles.rowAvatar} />
        <ThemeText role="body" style={styles.listMemberName} numberOfLines={1}>
          {family.name}
          {family.role ? (
            <ThemeText role="label" style={styles.roleLabel}> ({family.role})</ThemeText>
          ) : null}
        </ThemeText>
        <AddPersonButton label={`Add relative of ${family.name}`} />
      </TouchableOpacity>

      {/* Spouse */}
      {family.spouse && (
        <TouchableOpacity
          style={[styles.listMemberRow, styles.listMemberRowIndent]}
          onPress={() => onMemberPress?.(family.spouse)}
          accessibilityRole="button"
          accessibilityLabel={`${family.spouse.name} journal`}
        >
          <ThemeAvatar
            uri={family.spouse.avatar}
            name={family.spouse.name}
            size={40}
            style={styles.rowAvatar}
          />
          <ThemeText role="body" style={styles.listMemberName} numberOfLines={1}>
            {family.spouse.name}
            <ThemeText role="label" style={styles.roleLabel}> ({family.spouse.role})</ThemeText>
          </ThemeText>
          {hasChildren && (
            <TouchableOpacity
              style={styles.chevronButton}
              onPress={() => setExpanded(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Hide children' : 'Show children'}
              accessibilityState={{ expanded }}
            >
              <ThemeIcon
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          <AddPersonButton label={`Add relative of ${family.spouse.name}`} />
        </TouchableOpacity>
      )}

      {/* Children (expanded) */}
      {hasChildren && expanded && (
        <View style={styles.listChildrenSection}>
          <ThemeText role="caption" style={styles.listChildrenLabel}>Children</ThemeText>
          {family.children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[styles.listMemberRow, styles.listMemberRowIndent]}
              onPress={() => onMemberPress?.(child)}
              accessibilityRole="button"
              accessibilityLabel={`${child.name} journal`}
            >
              <ThemeAvatar uri={child.avatar} name={child.name} size={40} style={styles.rowAvatar} />
              <ThemeText role="body" style={styles.listMemberName} numberOfLines={1}>
                {child.name}
              </ThemeText>
              <AddPersonButton label={`Add relative of ${child.name}`} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ThemeCard>
  );
});

/**
 * List View - Flat list of families ("List" tab)
 */
const ListView = memo(({ data, onFamilyPress, onMemberPress }) => {
  const styles = useThemedStyles(makeStyles);
  const families = data?.families || [];

  return (
    <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
      <View style={styles.listContainer}>
        {families.map((family) => (
          <ListFamilyCard
            key={family.id}
            family={family}
            onFamilyPress={onFamilyPress}
            onMemberPress={onMemberPress}
          />
        ))}
      </View>
    </ScrollView>
  );
});

/**
 * Main FamilyScreen Component
 */
export default function FamilyScreen({ navigation }) {
  const { user } = useAuth();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { branchData, listData } = useFamilyTree();
  const [activeView, setActiveView] = useState('me');

  // Handle tapping head card - opens family journal (group)
  const handleFamilyPress = useCallback((head) => {
    console.log('Selected family:', head.name);

    // Collect all family members for this family unit. `id` is the linked user
    // account (falls back to the tree-node id) so PersonJournal can fetch their
    // live entries.
    const familyMembers = [
      { id: head.linkedUserId || head.id, name: head.name, avatar: head.avatar },
    ];
    if (head.spouse) {
      familyMembers.push({ id: head.spouse.linkedUserId || head.spouse.id, name: head.spouse.name, avatar: head.spouse.avatar });
    }
    if (head.children) {
      head.children.forEach(child => {
        familyMembers.push({ id: child.linkedUserId || child.id, name: child.name, avatar: child.avatar });
      });
    }

    // Navigate to PersonJournalScreen in group mode
    navigation.navigate('PersonJournal', {
      persons: familyMembers,
      isGroup: true,
      groupName: `${head.name.split(' ')[0]}'s Family`,
    });
  }, [navigation]);

  // Handle tapping spouse/children - opens individual journal
  const handleMemberPress = useCallback((member) => {
    console.log('Selected member:', member.name);
    // Navigate to PersonJournalScreen to view their individual journal
    navigation.navigate('PersonJournal', {
      person: {
        id: member.linkedUserId || member.id,
        name: member.name,
        avatar: member.avatar,
      },
      isGroup: false,
    });
  }, [navigation]);

  const handleLocationPress = useCallback(() => {
    console.log('Location FAB pressed');
    // TODO: Show family members on map
  }, []);

  return (
    <ThemeBackground edges={['top']}>
      <ThemeHeader
        title="Family"
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

      {activeView === 'me' ? (
        <BranchView
          data={branchData}
          onFamilyPress={handleFamilyPress}
          onMemberPress={handleMemberPress}
        />
      ) : (
        <ListView
          data={listData}
          onFamilyPress={handleFamilyPress}
          onMemberPress={handleMemberPress}
        />
      )}

      <ThemeFloatingButton
        icon="location"
        onPress={handleLocationPress}
        accessibilityLabel="Show family on map"
        style={styles.fab}
      />
    </ThemeBackground>
  );
}

/**
 * All layout below is theme-driven. Anything visual (colour, weight, radius,
 * border) is read from the token set; only geometry that is genuinely specific
 * to the family tree (connector lengths, card widths) is literal here.
 */
const makeStyles = (theme) =>
  StyleSheet.create({
    headerIcon: { padding: 4 },

    viewToggle: {
      marginHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },

    scrollView: { flex: 1 },

    // Branch view
    branchTree: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      paddingTop: theme.spacing.sm,
    },
    headGroup: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: theme.spacing.lg,
    },
    headCardWrapper: { alignItems: 'center' },
    headCard: { width: 100 },
    headCardInner: { alignItems: 'center', padding: theme.spacing.md },
    headBadge: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    headAvatar: { marginBottom: theme.spacing.sm },
    headFirstName: { textAlign: 'center' },
    headLastName: { textAlign: 'center', marginBottom: theme.spacing.xs },
    headBirthYear: { color: theme.colors.textSecondary },

    verticalConnector: {
      width: 0,
      height: 80,
      borderLeftWidth: 2,
      borderLeftColor: theme.colors.border,
      borderStyle: 'dashed',
      marginTop: theme.spacing.xs,
    },

    branchMembersContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingTop: 20,
    },
    horizontalConnector: {
      width: 16,
      height: 0,
      borderTopWidth: 2,
      borderTopColor: theme.colors.border,
      borderStyle: 'dashed',
      marginTop: 25,
    },
    branchMembersList: { flex: 1 },
    branchMembersInner: { padding: theme.spacing.sm },

    // Shared member rows
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: theme.spacing.xs,
    },
    rowAvatar: { marginRight: 10 },
    memberName: { flex: 1 },
    roleLabel: { color: theme.colors.textSecondary },
    childrenLabel: {
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      marginLeft: theme.spacing.xs,
    },

    // List view
    listContainer: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    listCard: { marginBottom: theme.spacing.md },
    listCardInner: { padding: theme.spacing.sm + 2 },
    listMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: theme.spacing.xs,
    },
    listMemberRowIndent: { marginLeft: theme.spacing.lg },
    listMemberName: { flex: 1 },
    chevronButton: { padding: theme.spacing.xs, marginRight: theme.spacing.sm },
    listChildrenSection: { marginLeft: theme.spacing.lg, marginTop: theme.spacing.xs },
    listChildrenLabel: {
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
      marginLeft: theme.spacing.xs,
    },

    // The nav bar floats on ornate themes, so lift the FAB clear of it.
    fab: { bottom: theme.borders.nav.width > 0 ? 88 : 20 },
  });
