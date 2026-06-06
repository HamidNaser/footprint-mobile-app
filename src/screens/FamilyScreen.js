/**
 * FamilyScreen - Family Tree View
 * 
 * Displays family connections in two views:
 * - List: Flat list of family members
 * - Me/Branch: Hierarchical tree showing generations
 * 
 * Matches web app (footprint-web-app) functionality.
 */

import React, { useState, memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FAMILY_BRANCH_DATA, FAMILY_LIST_DATA } from '../data/familyData';
import { useAuth } from '../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const BORDER_COLOR = '#e0e0e0';
const TEXT_COLOR = '#333';
const TEXT_MUTED = '#888';
const SURFACE_COLOR = '#fff';

/**
 * Tab Toggle Component
 */
const ViewToggle = memo(({ activeView, onViewChange }) => {
  return (
    <View style={styles.toggleContainer}>
      <TouchableOpacity
        style={[styles.toggleButton, activeView === 'list' && styles.toggleButtonActive]}
        onPress={() => onViewChange('list')}
      >
        <Text style={[styles.toggleText, activeView === 'list' && styles.toggleTextActive]}>
          List
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleButton, activeView === 'me' && styles.toggleButtonActive]}
        onPress={() => onViewChange('me')}
      >
        <Text style={[styles.toggleText, activeView === 'me' && styles.toggleTextActive]}>
          Me
        </Text>
      </TouchableOpacity>
    </View>
  );
});

/**
 * Family Member Row - Used in spouse/children list
 */
const FamilyMemberRow = memo(({ member, role, onPress }) => {
  return (
    <TouchableOpacity style={styles.memberRow} onPress={() => onPress?.(member)}>
      <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
      <Text style={styles.memberName} numberOfLines={1}>
        {member.name}
        {role && <Text style={styles.roleLabel}> ({role})</Text>}
      </Text>
      <TouchableOpacity style={styles.memberActionButton}>
        <Ionicons name="person-add" size={14} color="#fff" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

/**
 * Family Head Card - Left side card showing head of family unit
 * Tapping this opens the WHOLE FAMILY's journal (group mode)
 */
const FamilyHeadCard = memo(({ head, isLast, onFamilyPress }) => {
  const firstName = head.name.split(' ')[0];
  const lastName = head.name.split(' ').slice(1).join(' ');

  return (
    <View style={styles.headCardWrapper}>
      {/* Head Card - Tap for family journal */}
      <TouchableOpacity
        style={[styles.headCard, head.isMe && styles.headCardMe]}
        onPress={() => onFamilyPress?.(head)}
      >
        {/* Badge */}
        <View style={styles.headBadge}>
          <Ionicons name="person-add" size={12} color="#fff" />
        </View>

        <Image source={{ uri: head.avatar }} style={styles.headAvatar} />
        <Text style={styles.headFirstName}>{firstName}</Text>
        <Text style={styles.headLastName}>{lastName}</Text>
        <Text style={styles.headBirthYear}>Born {head.birthYear}</Text>
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
  return (
    <View style={styles.branchMembersContainer}>
      {/* Horizontal connector line */}
      <View style={styles.horizontalConnector} />

      <View style={styles.branchMembersList}>
        {/* Spouse */}
        {spouse && (
          <FamilyMemberRow
            member={spouse}
            role={spouse.role}
            onPress={onMemberPress}
          />
        )}

        {/* Children label */}
        {children && children.length > 0 && (
          <>
            <Text style={styles.childrenLabel}>Childrens</Text>
            {children.map((child) => (
              <FamilyMemberRow
                key={child.id}
                member={child}
                onPress={onMemberPress}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );
});

/**
 * Family Head Group - Complete family unit (head + spouse + children)
 * - Tap head card = view family journal (group)
 * - Tap spouse/children = view individual journal
 */
const FamilyHeadGroup = memo(({ head, isLast, onFamilyPress, onMemberPress }) => {
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
  const branches = data?.branches || [];

  return (
    <ScrollView style={styles.branchScrollView} showsVerticalScrollIndicator={false}>
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
  const [expanded, setExpanded] = useState(family.isMe || false);
  const hasChildren = family.children && family.children.length > 0;

  return (
    <View style={[styles.listCard, family.isMe && styles.listCardMe]}>
      {/* Primary member - Tap for family journal */}
      <TouchableOpacity
        style={styles.listMemberRow}
        onPress={() => onFamilyPress?.(family)}
      >
        <Image source={{ uri: family.avatar }} style={styles.listMemberAvatar} />
        <Text style={styles.listMemberName} numberOfLines={1}>
          {family.name}
          {family.role && <Text style={styles.roleLabel}> ({family.role})</Text>}
        </Text>
        <TouchableOpacity style={styles.memberActionButton}>
          <Ionicons name="person-add" size={14} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Spouse */}
      {family.spouse && (
        <TouchableOpacity
          style={[styles.listMemberRow, styles.listMemberRowIndent]}
          onPress={() => onMemberPress?.(family.spouse)}
        >
          <Image source={{ uri: family.spouse.avatar }} style={styles.listMemberAvatar} />
          <Text style={styles.listMemberName} numberOfLines={1}>
            {family.spouse.name}
            <Text style={styles.roleLabel}> ({family.spouse.role})</Text>
          </Text>
          {hasChildren && (
            <TouchableOpacity
              style={styles.chevronButton}
              onPress={() => setExpanded(!expanded)}
            >
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.memberActionButton}>
            <Ionicons name="person-add" size={14} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Children (expanded) */}
      {hasChildren && expanded && (
        <View style={styles.listChildrenSection}>
          <Text style={styles.listChildrenLabel}>Children</Text>
          {family.children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={[styles.listMemberRow, styles.listMemberRowIndent]}
              onPress={() => onMemberPress?.(child)}
            >
              <Image source={{ uri: child.avatar }} style={styles.listMemberAvatar} />
              <Text style={styles.listMemberName} numberOfLines={1}>
                {child.name}
              </Text>
              <TouchableOpacity style={styles.memberActionButton}>
                <Ionicons name="person-add" size={14} color="#fff" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

/**
 * List View - Flat list of families ("List" tab)
 */
const ListView = memo(({ data, onFamilyPress, onMemberPress }) => {
  const families = data?.families || [];

  return (
    <ScrollView style={styles.listScrollView} showsVerticalScrollIndicator={false}>
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
 * Location FAB
 */
const LocationFAB = memo(({ onPress }) => {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress}>
      <Ionicons name="location" size={24} color="#fff" />
    </TouchableOpacity>
  );
});

/**
 * Main FamilyScreen Component
 */
export default function FamilyScreen({ navigation }) {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('me');

  // Handle tapping head card - opens family journal (group)
  const handleFamilyPress = useCallback((head) => {
    console.log('Selected family:', head.name);
    
    // Collect all family members for this family unit
    const familyMembers = [
      { id: head.id, name: head.name, avatar: head.avatar },
    ];
    if (head.spouse) {
      familyMembers.push({ id: head.spouse.id, name: head.spouse.name, avatar: head.spouse.avatar });
    }
    if (head.children) {
      head.children.forEach(child => {
        familyMembers.push({ id: child.id, name: child.name, avatar: child.avatar });
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
        id: member.id,
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Avatar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Family</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Image
              source={{ uri: user?.avatarUrl }}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* View Toggle */}
      <ViewToggle activeView={activeView} onViewChange={setActiveView} />

      {/* Content */}
      {activeView === 'me' ? (
        <BranchView 
          data={FAMILY_BRANCH_DATA} 
          onFamilyPress={handleFamilyPress}
          onMemberPress={handleMemberPress} 
        />
      ) : (
        <ListView 
          data={FAMILY_LIST_DATA} 
          onFamilyPress={handleFamilyPress}
          onMemberPress={handleMemberPress} 
        />
      )}

      {/* Location FAB */}
      <LocationFAB onPress={handleLocationPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: TEXT_COLOR,
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
    borderColor: PRIMARY_COLOR,
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
    backgroundColor: SURFACE_COLOR,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  toggleTextActive: {
    color: PRIMARY_COLOR,
  },

  // Branch View
  branchScrollView: {
    flex: 1,
  },
  branchTree: {
    padding: 16,
    paddingTop: 8,
  },

  // Head Group
  headGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },

  // Head Card Wrapper
  headCardWrapper: {
    alignItems: 'center',
  },

  // Head Card
  headCard: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
    padding: 12,
    alignItems: 'center',
    width: 100,
    position: 'relative',
  },
  headCardMe: {
    borderColor: PRIMARY_COLOR,
  },
  headBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 8,
  },
  headFirstName: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_COLOR,
    textAlign: 'center',
  },
  headLastName: {
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_COLOR,
    textAlign: 'center',
    marginBottom: 4,
  },
  headBirthYear: {
    fontSize: 11,
    color: TEXT_MUTED,
  },

  // Vertical Connector (dashed line between heads)
  verticalConnector: {
    width: 0,
    height: 80,
    borderLeftWidth: 2,
    borderLeftColor: BORDER_COLOR,
    borderStyle: 'dashed',
    marginTop: 4,
  },

  // Branch Members (spouse + children)
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
    borderTopColor: BORDER_COLOR,
    borderStyle: 'dashed',
    marginTop: 25,
  },
  branchMembersList: {
    flex: 1,
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    padding: 8,
  },

  // Member Row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  memberName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  roleLabel: {
    fontWeight: '400',
    color: TEXT_MUTED,
    fontSize: 12,
  },
  memberActionButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Children Label
  childrenLabel: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },

  // List View
  listScrollView: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  listCard: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
    padding: 10,
    marginBottom: 12,
  },
  listCardMe: {
    borderColor: PRIMARY_COLOR,
  },
  listMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  listMemberRowIndent: {
    marginLeft: 16,
  },
  listMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  listMemberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  chevronButton: {
    padding: 4,
    marginRight: 8,
  },
  listChildrenSection: {
    marginLeft: 16,
    marginTop: 4,
  },
  listChildrenLabel: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 4,
    marginLeft: 4,
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

