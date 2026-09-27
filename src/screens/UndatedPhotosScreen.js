import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import HoldingAreaApi from '../api/HoldingAreaApi';
import JournalApi from '../api/JournalApi';
import { resolveImportJournal } from '../utils/resolveImportJournal';
import { parsePeriodDate, formatPeriodDate } from '../utils/periodDate';

const PRIMARY_COLOR = '#5BA0F2';

/**
 * The holding area — photographs waiting for a date (FR-013, User Story 4, T064).
 *
 * <p>
 * The import screen reports "1,203 waiting for a date". Until this existed, nothing on the phone
 * could act on that line: an import started here had to be finished on the web client, or not at
 * all. This is the phone twin of `foot-print-web/src/pages/Import/UndatedPhotosPage.jsx` and
 * follows the same rules, because the two must not disagree about what "1978" means.
 * </p>
 *
 * <p>
 * <b>A standing workspace, not a step in an import</b> (FR-013a). Somebody may date a few today
 * and the rest in a month, so nothing here is scoped to a batch and it is reachable from Settings
 * with no import in sight.
 * </p>
 *
 * <p>
 * <b>Nothing here asserts an occasion.</b> A shared-place hint offers to *select*; only the person
 * creates (Principle I). Revision 1 made an entry per undated photograph dated "today", which
 * turned a shoebox of scans into a thousand entries about nothing.
 * </p>
 *
 * <p>
 * <b>Deliberately thin.</b> Every rule lives in `parsePeriodDate`, `formatPeriodDate` and
 * `resolveImportJournal`, which are tested; this file imports `ApiClient`, which throws under
 * jest, so nothing in it can be. It needs a device.
 * </p>
 */
export default function UndatedPhotosScreen({ navigation }) {
  const [held, setHeld] = useState(null);
  const [selected, setSelected] = useState([]);
  const [dateText, setDateText] = useState('');
  const [journalName, setJournalName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  /**
   * One page. With no cursor this replaces everything, which is what a reload after creating an
   * entry wants — the holding area has just changed. With a cursor it appends, so a selection
   * made on the first page survives loading the second.
   *
   * `locationHints` accumulate too: the server computes them per page, so a hint from page one
   * still describes page one's photographs and is not made wrong by page two arriving.
   */
  const load = useCallback(async (after = null) => {
    try {
      const page = await HoldingAreaApi.listUndated(200, after);
      const safe = {
        photos: page?.photos ?? [],
        total: page?.total ?? 0,
        locationHints: page?.locationHints ?? [],
        // Both, not either. Without a cursor there is nothing to ask for, so "more" would give
        // a Load more that re-fetches the first page for ever — and tapping something that
        // silently does nothing is a worse failure than a missing button. The server sets the
        // two together today; this is not depending on it.
        hasMore: Boolean(page?.hasMore && page?.nextCursor),
        nextCursor: page?.nextCursor ?? null,
      };

      setHeld((current) => (after && current
        ? {
          ...safe,
          photos: [...current.photos, ...safe.photos],
          locationHints: [...current.locationHints, ...safe.locationHints],
        }
        : safe));
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Read-only. `resolveImportJournal` is what can create one, and it waits for the button:
  // opening a screen is not consent to write anything.
  useEffect(() => {
    let live = true;
    JournalApi.listJournals()
      .then((response) => {
        if (!live) return;
        const journals = Array.isArray(response) ? response : response?.items ?? [];
        setJournalName(journals.length > 0 ? journals[journals.length - 1].name : null);
      })
      .catch(() => live && setJournalName(null));
    return () => { live = false; };
  }, []);

  const period = parsePeriodDate(dateText);
  const partial = held ? held.photos.length < held.total : false;

  const toggle = (mediaId) => setSelected((current) =>
    (current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]));

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await load(held?.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  const create = async () => {
    if (!period || selected.length === 0) return;

    setBusy(true);
    setError(null);
    setDone(null);

    try {
      const journal = await resolveImportJournal();
      setJournalName(journal.name);

      const result = await HoldingAreaApi.groupUndated({
        mediaIds: selected,
        journalId: journal.id,
        date: period.date,
        datePrecision: period.datePrecision,
      });

      setDone(result);
      setSelected([]);
      setDateText('');
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Waiting for a date</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lede}>
          These photographs carry no date the import could read. Choose some, say when they were
          taken, and they become one entry. If you only know the year, say the year.
        </Text>

        <Text style={styles.destination}>
          {journalName
            ? `Entries will go into ${journalName}.`
            : 'A journal will be created for these entries.'}
        </Text>

        {/* "1,203" above a grid of 200 was the web defect: the count right, the grid short,
            and nothing admitting the difference. */}
        {held && held.total > 0 && (
          <Text style={styles.count}>
            {partial
              ? `Showing ${held.photos.length.toLocaleString()} of ${held.total.toLocaleString()}`
              : `${held.total.toLocaleString()} ${held.total === 1 ? 'photograph' : 'photographs'}`}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {done && (
          <Text style={styles.done}>
            {`Entry created from ${done.photoCount} ${done.photoCount === 1 ? 'photograph' : 'photographs'}. `}
            {done.remainingUndated > 0
              ? `${done.remainingUndated.toLocaleString()} still waiting.`
              : 'Nothing left waiting.'}
          </Text>
        )}

        {held && held.photos.length === 0 && (
          <Text style={styles.empty}>Nothing is waiting for a date.</Text>
        )}

        {/* Offered, never applied. The wording stays conditional: this says where photographs
            were taken and claims no occasion (Principle I). */}
        {held?.locationHints?.map((hint, index) => (
          <View style={styles.hint} key={`${hint.lat},${hint.lng},${index}`}>
            <Text style={styles.hintText}>
              {`${hint.photoCount} photographs were taken near each other, within ${hint.radiusMetres} metres`}
              {/* Scoped honestly — a hint is computed over one page and cannot see photographs
                  not yet fetched. */}
              {partial ? ` — among the ${held.photos.length.toLocaleString()} loaded so far.` : '.'}
            </Text>
            <TouchableOpacity
              style={styles.hintButton}
              onPress={() => setSelected(hint.mediaIds ?? [])}
            >
              <Text style={styles.hintButtonText}>{`Select these ${hint.photoCount}`}</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.grid}>
          {held?.photos.map((photo) => {
            const isSelected = selected.includes(photo.mediaId);
            return (
              <TouchableOpacity
                key={photo.mediaId}
                style={[styles.tile, isSelected && styles.tileSelected]}
                onPress={() => toggle(photo.mediaId)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`Select ${photo.originalFileName ?? photo.mediaId}`}
              >
                <Image source={{ uri: photo.thumbnailUrl ?? photo.url }} style={styles.thumb} />
                {isSelected && (
                  <View style={styles.tick}>
                    <Ionicons name="checkmark-circle" size={22} color={PRIMARY_COLOR} />
                  </View>
                )}
                {/* Often the only clue there is — "Christmas1978.jpg" is the whole reason
                    somebody can date it at all. */}
                <Text style={styles.tileName} numberOfLines={1}>
                  {photo.originalFileName ?? photo.mediaId}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {held?.hasMore && (
          <TouchableOpacity style={styles.more} onPress={loadMore} disabled={loadingMore || busy}>
            <Text style={styles.moreText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
          </TouchableOpacity>
        )}

        {held && held.photos.length > 0 && (
          <View style={styles.actions}>
            <Text style={styles.label}>When were these taken?</Text>
            <TextInput
              style={styles.input}
              value={dateText}
              onChangeText={setDateText}
              placeholder="1978, 1978-07, or 1978-07-04"
              placeholderTextColor="#A0A0A5"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel="When were these taken?"
            />

            {/* Shown back before anything is created. Otherwise "1978" quietly becoming
                1 January 1978 is something somebody discovers in their journal later. */}
            {dateText.trim() !== '' && (
              <Text style={styles.reading}>
                {period
                  ? `Reads as ${formatPeriodDate(period.date, period.datePrecision)}`
                  : 'Not a date — try a year, a month, or a full date.'}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.create, (busy || !period || selected.length === 0) && styles.createDisabled]}
              onPress={create}
              disabled={busy || !period || selected.length === 0}
            >
              {busy
                ? <ActivityIndicator color="#FFF" />
                : (
                  <Text style={styles.createText}>
                    {`Create an entry from ${selected.length} ${selected.length === 1 ? 'photograph' : 'photographs'}`}
                  </Text>
                )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  body: { padding: 16, paddingBottom: 40 },
  lede: { fontSize: 15, color: '#3C3C43', lineHeight: 21, marginBottom: 12 },
  destination: { fontSize: 14, color: '#636366', marginBottom: 12 },
  count: { fontSize: 15, fontWeight: '600', color: '#1C1C1E', marginBottom: 12 },
  error: { color: '#C0392B', fontSize: 14, marginBottom: 12 },
  done: { color: '#2D6A4F', fontSize: 14, marginBottom: 12 },
  empty: { color: '#636366', fontSize: 15, marginVertical: 12 },
  hint: {
    backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E3E9F2',
  },
  hintText: { fontSize: 14, color: '#3C3C43', marginBottom: 8 },
  hintButton: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: PRIMARY_COLOR,
    borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12,
  },
  hintButtonText: { color: PRIMARY_COLOR, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  tile: {
    width: '31%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFF',
    borderWidth: 2, borderColor: 'transparent',
  },
  tileSelected: { borderColor: PRIMARY_COLOR },
  thumb: { width: '100%', aspectRatio: 1, backgroundColor: '#E9EDF3' },
  tick: { position: 'absolute', top: 4, left: 4 },
  tileName: { fontSize: 11, color: '#636366', padding: 4 },
  more: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: PRIMARY_COLOR,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18, marginBottom: 12,
  },
  moreText: { color: PRIMARY_COLOR, fontSize: 14 },
  actions: { marginTop: 8 },
  label: { fontSize: 13, color: '#636366', marginBottom: 6 },
  input: {
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D5DBE5', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#1C1C1E',
  },
  reading: { fontSize: 13, color: '#636366', marginTop: 6 },
  create: {
    marginTop: 12, backgroundColor: PRIMARY_COLOR, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  createDisabled: { backgroundColor: '#C7D6EA' },
  createText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
