/**
 * EventFormScreen — create or edit an event (full-screen modal).
 *
 * Create: pick a template from the horizontal carousel, then fill in the form.
 * Edit: same screen pre-populated from the passed event.
 * Saves via EventsApi when authenticated; in demo mode it explains that sign-in
 * is required and returns.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LocationPicker } from '../components/map';
import { TemplateCard, DateTimeField } from '../components/events';
import { EventsApi } from '../api';
import { EVENT_TEMPLATES, getTemplate } from '../data/eventsData';

const buildInitialForm = (event) => {
  if (event) {
    return {
      templateId: event.templateId || 'party',
      title: event.title || '',
      subtitle: event.subtitle || '',
      date: event.date ? new Date(event.date) : new Date(),
      location: {
        name: event.location?.name || '',
        address: event.location?.address || '',
        lat: event.location?.lat ?? null,
        lng: event.location?.lng ?? null,
      },
      description: event.description || '',
      publish: event.status !== 'draft',
    };
  }
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  soon.setHours(18, 0, 0, 0);
  return {
    templateId: 'party',
    title: '',
    subtitle: '',
    date: soon,
    location: { name: '', address: '', lat: null, lng: null },
    description: '',
    publish: true,
  };
};

const Field = ({ label, children }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

export default function EventFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { mode = 'create', event } = route.params || {};
  const isEdit = mode === 'edit';

  const [form, setForm] = useState(() => buildInitialForm(isEdit ? event : null));
  const [saving, setSaving] = useState(false);
  const [showLocation, setShowLocation] = useState(false);

  const template = useMemo(() => getTemplate(form.templateId), [form.templateId]);

  const update = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const handleSelectTemplate = useCallback(
    (t) => update({ templateId: t.id }),
    [update]
  );

  const handleLocationSelected = useCallback(
    (loc) => {
      update({
        location: {
          name: loc.name || '',
          address: loc.name || '',
          lat: loc.lat,
          lng: loc.lng,
        },
      });
      setShowLocation(false);
    },
    [update]
  );

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      Alert.alert('Title required', 'Please give your event a title.');
      return;
    }

    if (!EventsApi.isAuthenticated()) {
      Alert.alert(
        'Sign in to save',
        'Creating events requires an account. This is a demo preview — sign in to publish real invitations.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    setSaving(true);
    try {
      const payload = { ...form, coverImage: event?.coverImage || template.cover };
      if (isEdit) {
        await EventsApi.updateEvent(event.id, payload);
      } else {
        await EventsApi.createEvent(payload);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [form, isEdit, event, template, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit event' : 'New event'}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: template.accent }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveText}>{isEdit ? 'Save' : 'Create'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Template carousel */}
          <Text style={styles.sectionLabel}>Choose a style</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
            contentContainerStyle={styles.carouselContent}
          >
            {EVENT_TEMPLATES.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={form.templateId === t.id}
                onPress={handleSelectTemplate}
              />
            ))}
          </ScrollView>

          {/* Fields */}
          <Field label="Title">
            <TextInput
              style={styles.input}
              placeholder="e.g. Ava's Birthday"
              placeholderTextColor="#9aa5b6"
              value={form.title}
              onChangeText={(title) => update({ title })}
            />
          </Field>

          <Field label="Subtitle">
            <TextInput
              style={styles.input}
              placeholder="e.g. Backyard party"
              placeholderTextColor="#9aa5b6"
              value={form.subtitle}
              onChangeText={(subtitle) => update({ subtitle })}
            />
          </Field>

          <Field label="Date & time">
            <DateTimeField
              value={form.date}
              onChange={(date) => update({ date })}
              accent={template.accent}
            />
          </Field>

          <Field label="Location">
            <TouchableOpacity style={styles.locationBtn} onPress={() => setShowLocation(true)}>
              <Ionicons
                name={form.location.lat != null ? 'location' : 'location-outline'}
                size={18}
                color={template.accent}
              />
              <Text style={[styles.locationText, !form.location.name && styles.locationPlaceholder]}>
                {form.location.name || 'Pick a location'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </TouchableOpacity>
          </Field>

          <Field label="Description">
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Add details for your guests…"
              placeholderTextColor="#9aa5b6"
              value={form.description}
              onChangeText={(description) => update({ description })}
              multiline
              textAlignVertical="top"
            />
          </Field>

          <View style={styles.publishRow}>
            <View style={styles.flex}>
              <Text style={styles.publishTitle}>Publish now</Text>
              <Text style={styles.publishHint}>
                {form.publish ? 'Guests can see and RSVP.' : 'Saved as a private draft.'}
              </Text>
            </View>
            <Switch
              value={form.publish}
              onValueChange={(publish) => update({ publish })}
              trackColor={{ true: template.accent }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LocationPicker
        visible={showLocation}
        onClose={() => setShowLocation(false)}
        onSelect={handleLocationSelected}
        initialLocation={
          form.location.lat != null
            ? { lat: form.location.lat, lng: form.location.lng, name: form.location.name }
            : undefined
        }
        title="Event location"
        primaryColor={template.accent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  headerBtn: { minWidth: 60 },
  cancelText: { fontSize: 15, color: '#64748b' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  saveBtn: {
    minWidth: 60,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 48 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 10 },
  carousel: { marginBottom: 20, marginHorizontal: -16 },
  carouselContent: { paddingHorizontal: 16 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
  },
  textarea: { height: 100 },
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  locationText: { flex: 1, fontSize: 15, color: '#1e293b' },
  locationPlaceholder: { color: '#9aa5b6' },
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  publishTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  publishHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
});
