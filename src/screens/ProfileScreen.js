import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import ProfileService from '../services/ProfileService';
import { pickEditableProfileFields } from '../utils/profileFields';

// ==================== SECTION COMPONENTS ====================

const SectionHeader = ({ title, onAdd, editable = true }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {editable && (
      <TouchableOpacity onPress={onAdd} style={styles.addButton}>
        <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
      </TouchableOpacity>
    )}
  </View>
);

const EditableField = ({ label, value, onEdit, multiline = false }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.fieldValueContainer}>
      <Text style={[styles.fieldValue, !value && styles.emptyValue]} numberOfLines={multiline ? 4 : 1}>
        {value || 'Not set'}
      </Text>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} style={styles.editFieldButton}>
          <Ionicons name="pencil" size={16} color="#007AFF" />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const EducationCard = ({ education, onEdit, onDelete }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.cardIconContainer}>
        <Ionicons name="school" size={20} color="#007AFF" />
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={onEdit} style={styles.cardAction}>
          <Ionicons name="pencil" size={16} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.cardAction}>
          <Ionicons name="trash" size={16} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
    <Text style={styles.cardTitle}>{education.institution}</Text>
    {education.degree && <Text style={styles.cardSubtitle}>{education.degree}{education.field ? ` in ${education.field}` : ''}</Text>}
    <View style={styles.cardMetaRow}>
      {education.startYear && (
        <Text style={styles.cardMeta}>
          {education.startYear}{education.endYear ? ` - ${education.endYear}` : ' - Present'}
        </Text>
      )}
      {education.gpa && <Text style={styles.cardMeta}>GPA: {education.gpa}</Text>}
    </View>
    {education.description && <Text style={styles.cardDescription}>{education.description}</Text>}
  </View>
);

const EmploymentCard = ({ employment, onEdit, onDelete }) => {
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconContainer}>
          <Ionicons name="briefcase" size={20} color="#34C759" />
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={onEdit} style={styles.cardAction}>
            <Ionicons name="pencil" size={16} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.cardAction}>
            <Ionicons name="trash" size={16} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.cardTitle}>{employment.title || 'Position'}</Text>
      <Text style={styles.cardSubtitle}>{employment.company}</Text>
      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>
          {formatDate(employment.startDate)}{employment.isCurrent ? ' - Present' : employment.endDate ? ` - ${formatDate(employment.endDate)}` : ''}
        </Text>
        {employment.location && <Text style={styles.cardMeta}>{employment.location}</Text>}
      </View>
      {employment.description && <Text style={styles.cardDescription}>{employment.description}</Text>}
    </View>
  );
};

const AddressCard = ({ address, onEdit, onDelete }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.cardIconContainer}>
        <Ionicons name="location" size={20} color="#FF9500" />
      </View>
      <View style={[styles.cardLabelBadge, { backgroundColor: '#FF950020' }]}>
        <Text style={[styles.cardLabelText, { color: '#FF9500' }]}>{address.label}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={onEdit} style={styles.cardAction}>
          <Ionicons name="pencil" size={16} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.cardAction}>
          <Ionicons name="trash" size={16} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
    {address.street && <Text style={styles.cardTitle}>{address.street}</Text>}
    <Text style={styles.cardSubtitle}>
      {[address.city, address.state, address.country].filter(Boolean).join(', ')}
    </Text>
    {address.postalCode && <Text style={styles.cardMeta}>Postal: {address.postalCode}</Text>}
    {address.startYear && (
      <Text style={styles.cardMeta}>
        {address.startYear}{address.endYear ? ` - ${address.endYear}` : ' - Present'}
      </Text>
    )}
  </View>
);

const EthnicityBar = ({ component }) => (
  <View style={styles.ethnicityItem}>
    <View style={styles.ethnicityHeader}>
      <Text style={styles.ethnicityName}>{component.name}</Text>
      <Text style={styles.ethnicityPercent}>{component.percentage}%</Text>
    </View>
    <View style={styles.ethnicityBarBg}>
      <View style={[styles.ethnicityBarFill, { width: `${component.percentage}%`, backgroundColor: component.color || '#007AFF' }]} />
    </View>
  </View>
);

const AncestryResultCard = ({ result }) => (
  <View style={styles.ancestryCard}>
    <Text style={styles.ancestryHeritage}>{result.heritage}</Text>
    {result.percentage && <Text style={styles.ancestryPercent}>{result.percentage}%</Text>}
    {result.description && <Text style={styles.ancestryDescription}>{result.description}</Text>}
  </View>
);

// ==================== MAIN COMPONENT ====================

export default function ProfileScreen({ navigation }) {
  const { user, logout, fetchProfile, updateProfile, accessToken, isLoading: authLoading } = useAuth();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  
  // Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalType, setEditModalType] = useState('');
  const [editModalData, setEditModalData] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setError('');
      await fetchProfile();
    } catch (err) {
      console.error('Failed to load profile:', err);
      if (!user) {
        setError('Failed to load profile. Pull to refresh.');
      }
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError('');
    try {
      await fetchProfile();
    } catch (err) {
      setError('Failed to refresh profile.');
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchProfile]);

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) {
        logout();
      }
    } else {
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: logout },
        ]
      );
    }
  };

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const confirmDelete = (title, message, onConfirm) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  // Get initials for avatar placeholder
  const getInitials = () => {
    const firstName = user?.firstName || '';
    const lastName = user?.lastName || '';
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    return firstName ? firstName[0].toUpperCase() : '?';
  };

  const getFullName = () => {
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown';
  };

  const getLocation = () => {
    if (!user?.location) return '';
    return [user.location.city, user.location.state, user.location.country].filter(Boolean).join(', ');
  };

  // ==================== EDIT HANDLERS ====================

  const openEditModal = (type, data = {}) => {
    setEditModalType(type);
    setEditModalData(data);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditModalType('');
    setEditModalData({});
  };

  const handleSaveBasicInfo = async (data) => {
    setIsSaving(true);
    try {
      // Only the fields the editor owns. It is opened with the whole user object, and
      // sending that back posts `_etag`, `id`, `email` and the education, employment and
      // address arrays along with the name -- fields the server does not accept.
      await updateProfile(pickEditableProfileFields(data));
      closeEditModal();
      showAlert('Success', 'Profile updated successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Education handlers
  const handleAddEducation = async (data) => {
    setIsSaving(true);
    try {
      await ProfileService.addEducation(accessToken, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Education added successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to add education');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateEducation = async (id, data) => {
    setIsSaving(true);
    try {
      await ProfileService.updateEducation(accessToken, id, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Education updated successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to update education');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEducation = async (id) => {
    confirmDelete('Delete Education', 'Are you sure you want to delete this education entry?', async () => {
      try {
        await ProfileService.deleteEducation(accessToken, id);
        await fetchProfile();
        showAlert('Success', 'Education deleted');
      } catch (err) {
        showAlert('Error', err.message || 'Failed to delete education');
      }
    });
  };

  // Employment handlers
  const handleAddEmployment = async (data) => {
    setIsSaving(true);
    try {
      await ProfileService.addEmployment(accessToken, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Employment added successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to add employment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateEmployment = async (id, data) => {
    setIsSaving(true);
    try {
      await ProfileService.updateEmployment(accessToken, id, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Employment updated successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to update employment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEmployment = async (id) => {
    confirmDelete('Delete Employment', 'Are you sure you want to delete this employment entry?', async () => {
      try {
        await ProfileService.deleteEmployment(accessToken, id);
        await fetchProfile();
        showAlert('Success', 'Employment deleted');
      } catch (err) {
        showAlert('Error', err.message || 'Failed to delete employment');
      }
    });
  };

  // Address handlers
  const handleAddAddress = async (data) => {
    setIsSaving(true);
    try {
      await ProfileService.addAddress(accessToken, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Address added successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to add address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateAddress = async (id, data) => {
    setIsSaving(true);
    try {
      await ProfileService.updateAddress(accessToken, id, data);
      await fetchProfile();
      closeEditModal();
      showAlert('Success', 'Address updated successfully');
    } catch (err) {
      showAlert('Error', err.message || 'Failed to update address');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddress = async (id) => {
    confirmDelete('Delete Address', 'Are you sure you want to delete this address?', async () => {
      try {
        await ProfileService.deleteAddress(accessToken, id);
        await fetchProfile();
        showAlert('Success', 'Address deleted');
      } catch (err) {
        showAlert('Error', err.message || 'Failed to delete address');
      }
    });
  };

  // ==================== LOADING STATE ====================

  if (authLoading && !user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== RENDER ====================

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#007AFF" />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Header with Avatar */}
        <View style={styles.header}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'))}
          >
            <Ionicons name="chevron-back" size={24} color="#007AFF" />
          </TouchableOpacity>

          {/* Settings Button */}
          <TouchableOpacity 
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
          
          <View style={styles.avatarContainer}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{getInitials()}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.avatarEditButton}>
              <Ionicons name="camera" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{getFullName()}</Text>
          {user?.nameArabic && <Text style={styles.userNameArabic}>{user.nameArabic}</Text>}
          {getLocation() && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color="#666" />
              <Text style={styles.locationText}>{getLocation()}</Text>
            </View>
          )}
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        {/* General Information */}
        <View style={styles.section}>
          <SectionHeader title="General Information" onAdd={() => openEditModal('general', user)} />
          <View style={styles.sectionContent}>
            <EditableField
              label="First Name"
              value={user?.firstName}
              onEdit={() => openEditModal('general', user)}
            />
            <EditableField
              label="Last Name"
              value={user?.lastName}
              onEdit={() => openEditModal('general', user)}
            />
            <EditableField
              label="Name (Arabic)"
              value={user?.nameArabic}
              onEdit={() => openEditModal('general', user)}
            />
            <EditableField
              label="Birth Date"
              value={user?.birthDate ? new Date(user.birthDate).toLocaleDateString() : null}
              onEdit={() => openEditModal('general', user)}
            />
            <EditableField
              label="Phone"
              value={user?.phoneNumber}
              onEdit={() => openEditModal('general', user)}
            />
          </View>
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <SectionHeader title="Bio" onAdd={() => openEditModal('bio', { bio: user?.bio })} />
          <View style={styles.sectionContent}>
            <Text style={[styles.bioText, !user?.bio && styles.emptyValue]}>
              {user?.bio || 'No bio yet. Tell others about yourself!'}
            </Text>
          </View>
        </View>

        {/* Education */}
        <View style={styles.section}>
          <SectionHeader title="Education" onAdd={() => openEditModal('education', {})} />
          <View style={styles.sectionContent}>
            {user?.education?.length > 0 ? (
              user.education.map((edu) => (
                <EducationCard
                  key={edu.id}
                  education={edu}
                  onEdit={() => openEditModal('education', edu)}
                  onDelete={() => handleDeleteEducation(edu.id)}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>No education entries yet</Text>
            )}
          </View>
        </View>

        {/* Employment */}
        <View style={styles.section}>
          <SectionHeader title="Employment" onAdd={() => openEditModal('employment', {})} />
          <View style={styles.sectionContent}>
            {user?.employment?.length > 0 ? (
              user.employment.map((emp) => (
                <EmploymentCard
                  key={emp.id}
                  employment={emp}
                  onEdit={() => openEditModal('employment', emp)}
                  onDelete={() => handleDeleteEmployment(emp.id)}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>No employment history yet</Text>
            )}
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.section}>
          <SectionHeader title="Addresses" onAdd={() => openEditModal('address', {})} />
          <View style={styles.sectionContent}>
            {user?.addresses?.length > 0 ? (
              user.addresses.map((addr) => (
                <AddressCard
                  key={addr.id}
                  address={addr}
                  onEdit={() => openEditModal('address', addr)}
                  onDelete={() => handleDeleteAddress(addr.id)}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>No addresses added yet</Text>
            )}
          </View>
        </View>

        {/* Ethnicity Profile */}
        <View style={styles.section}>
          <SectionHeader
            title="Ethnicity Estimate"
            onAdd={() => openEditModal('ethnicity', user?.ethnicityProfile || {})}
          />
          <View style={styles.sectionContent}>
            {user?.ethnicityProfile?.components?.length > 0 ? (
              user.ethnicityProfile.components.map((comp, idx) => (
                <EthnicityBar key={idx} component={comp} />
              ))
            ) : (
              <Text style={styles.emptyText}>No ethnicity data yet</Text>
            )}
          </View>
        </View>

        {/* Ancestry Results */}
        {user?.ethnicityProfile?.ancestryResults?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Ancestry DNA" editable={false} />
            <View style={styles.sectionContent}>
              {user.ethnicityProfile.ancestryResults.map((result, idx) => (
                <AncestryResultCard key={idx} result={result} />
              ))}
            </View>
          </View>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>User ID: {user?.visibleId || user?.id || 'Unknown'}</Text>
          <Text style={styles.footerText}>
            Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
          </Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <EditModal
        visible={editModalVisible}
        type={editModalType}
        data={editModalData}
        onClose={closeEditModal}
        onSave={async (data) => {
          switch (editModalType) {
            case 'general':
              await handleSaveBasicInfo(data);
              break;
            case 'bio':
              await handleSaveBasicInfo(data);
              break;
            case 'education':
              if (editModalData.id) {
                await handleUpdateEducation(editModalData.id, data);
              } else {
                await handleAddEducation(data);
              }
              break;
            case 'employment':
              if (editModalData.id) {
                await handleUpdateEmployment(editModalData.id, data);
              } else {
                await handleAddEmployment(data);
              }
              break;
            case 'address':
              if (editModalData.id) {
                await handleUpdateAddress(editModalData.id, data);
              } else {
                await handleAddAddress(data);
              }
              break;
          }
        }}
        isSaving={isSaving}
      />
    </SafeAreaView>
  );
}

// ==================== EDIT MODAL COMPONENT ====================

const EditModal = ({ visible, type, data, onClose, onSave, isSaving }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    setFormData(data || {});
  }, [data, type]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const getTitle = () => {
    switch (type) {
      case 'general':
        return 'Edit Profile';
      case 'bio':
        return 'Edit Bio';
      case 'education':
        return data?.id ? 'Edit Education' : 'Add Education';
      case 'employment':
        return data?.id ? 'Edit Employment' : 'Add Employment';
      case 'address':
        return data?.id ? 'Edit Address' : 'Add Address';
      default:
        return 'Edit';
    }
  };

  const renderContent = () => {
    switch (type) {
      case 'general':
        return (
          <>
            <ModalInput label="First Name" value={formData.firstName} onChange={(v) => updateField('firstName', v)} />
            <ModalInput label="Last Name" value={formData.lastName} onChange={(v) => updateField('lastName', v)} />
            <ModalInput label="Name (Arabic)" value={formData.nameArabic} onChange={(v) => updateField('nameArabic', v)} />
            <ModalInput label="Phone Number" value={formData.phoneNumber} onChange={(v) => updateField('phoneNumber', v)} keyboardType="phone-pad" />
          </>
        );
      case 'bio':
        return (
          <ModalInput
            label="Bio"
            value={formData.bio}
            onChange={(v) => updateField('bio', v)}
            multiline
            numberOfLines={5}
          />
        );
      case 'education':
        return (
          <>
            <ModalInput label="Institution *" value={formData.institution} onChange={(v) => updateField('institution', v)} />
            <ModalInput label="Degree" value={formData.degree} onChange={(v) => updateField('degree', v)} />
            <ModalInput label="Field of Study" value={formData.field} onChange={(v) => updateField('field', v)} />
            <View style={styles.modalRow}>
              <ModalInput label="Start Year" value={formData.startYear?.toString()} onChange={(v) => updateField('startYear', parseInt(v) || null)} keyboardType="numeric" style={styles.halfInput} />
              <ModalInput label="End Year" value={formData.endYear?.toString()} onChange={(v) => updateField('endYear', parseInt(v) || null)} keyboardType="numeric" style={styles.halfInput} />
            </View>
            <ModalInput label="GPA" value={formData.gpa} onChange={(v) => updateField('gpa', v)} />
            <ModalInput label="Description" value={formData.description} onChange={(v) => updateField('description', v)} multiline />
          </>
        );
      case 'employment':
        return (
          <>
            <ModalInput label="Company *" value={formData.company} onChange={(v) => updateField('company', v)} />
            <ModalInput label="Title" value={formData.title} onChange={(v) => updateField('title', v)} />
            <ModalInput label="Location" value={formData.location} onChange={(v) => updateField('location', v)} />
            <ModalInput label="Description" value={formData.description} onChange={(v) => updateField('description', v)} multiline />
          </>
        );
      case 'address':
        return (
          <>
            <ModalInput label="Label" value={formData.label} onChange={(v) => updateField('label', v)} placeholder="Home, Work, etc." />
            <ModalInput label="Street" value={formData.street} onChange={(v) => updateField('street', v)} />
            <ModalInput label="City" value={formData.city} onChange={(v) => updateField('city', v)} />
            <ModalInput label="State/Province" value={formData.state} onChange={(v) => updateField('state', v)} />
            <ModalInput label="Country" value={formData.country} onChange={(v) => updateField('country', v)} />
            <ModalInput label="Postal Code" value={formData.postalCode} onChange={(v) => updateField('postalCode', v)} />
            <View style={styles.modalRow}>
              <ModalInput label="From Year" value={formData.startYear?.toString()} onChange={(v) => updateField('startYear', parseInt(v) || null)} keyboardType="numeric" style={styles.halfInput} />
              <ModalInput label="To Year" value={formData.endYear?.toString()} onChange={(v) => updateField('endYear', parseInt(v) || null)} keyboardType="numeric" style={styles.halfInput} />
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalHeaderButton}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{getTitle()}</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving} style={styles.modalHeaderButton}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <Text style={styles.modalSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>
          {renderContent()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const ModalInput = ({ label, value, onChange, multiline = false, numberOfLines = 1, keyboardType = 'default', placeholder, style }) => (
  <View style={[styles.modalInputContainer, style]}>
    <Text style={styles.modalInputLabel}>{label}</Text>
    <TextInput
      style={[styles.modalInput, multiline && styles.modalInputMultiline]}
      value={value || ''}
      onChangeText={onChange}
      multiline={multiline}
      numberOfLines={numberOfLines}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor="#999"
    />
  </View>
);

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#FF3B30',
    textAlign: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#FFF',
    marginBottom: 16,
    position: 'relative',
  },
  settingsButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFF',
  },
  avatarEditButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#007AFF',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  userNameArabic: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },

  // Sections
  section: {
    backgroundColor: '#FFF',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  addButton: {
    padding: 4,
  },
  sectionContent: {
    padding: 16,
  },

  // Fields
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  fieldValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldValue: {
    fontSize: 16,
    color: '#000',
    flex: 1,
  },
  emptyValue: {
    color: '#999',
    fontStyle: 'italic',
  },
  editFieldButton: {
    padding: 8,
  },

  // Bio
  bioText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },

  // Cards
  card: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIconContainer: {
    marginRight: 8,
  },
  cardLabelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 'auto',
  },
  cardLabelText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    marginLeft: 'auto',
  },
  cardAction: {
    padding: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  cardMetaRow: {
    flexDirection: 'row',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 12,
  },
  cardMeta: {
    fontSize: 13,
    color: '#888',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    lineHeight: 20,
  },

  // Ethnicity
  ethnicityItem: {
    marginBottom: 16,
  },
  ethnicityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ethnicityName: {
    fontSize: 14,
    color: '#333',
  },
  ethnicityPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  ethnicityBarBg: {
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
  },
  ethnicityBarFill: {
    height: 8,
    borderRadius: 4,
  },

  // Ancestry
  ancestryCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  ancestryHeritage: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  ancestryPercent: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 2,
  },
  ancestryDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },

  // Empty states
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 16,
    color: '#FF3B30',
    marginLeft: 8,
    fontWeight: '500',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  modalHeaderButton: {
    minWidth: 60,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  modalCancelText: {
    fontSize: 17,
    color: '#007AFF',
  },
  modalSaveText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'right',
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 16,
  },
  modalInputContainer: {
    marginBottom: 16,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  modalInputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
});
