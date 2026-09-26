import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
/*
 * The `legacy` subpath, deliberately, and this is not cosmetic.
 *
 * In expo-media-library 57 the package's main entry is the new `Query`/`Asset` API.
 * `getAssetsAsync` and `getAssetInfoAsync` are still re-exported from it (via
 * `legacyWarnings`), but **`MediaType` and `SortBy` are not exported from the main entry at
 * all** — so `MediaLibrary.MediaType.photo` off the main entry is a property read on
 * `undefined` and throws the moment this screen runs. A bundle cannot catch that; it is a
 * runtime property access. The `legacy` subpath is declared in the package's `exports` map
 * and provides the functions and the constants together, which is the only coherent surface.
 * `getAssetsAsync` validates `mediaType` against `Object.values(MediaType)` and throws
 * `Invalid mediaType` otherwise, so the constants are not optional.
 */
import * as MediaLibrary from 'expo-media-library/legacy';

import ImportApi from '../api/ImportApi';
import MediaApi from '../api/MediaApi';
import JournalApi from '../api/JournalApi';
import DatabaseService from '../services/DatabaseService';
import { contentHash } from '../utils/contentHash';
import { buildPhotoMetadata } from '../utils/photoMetadata';
import { resolveImportJournal } from '../utils/resolveImportJournal';
import { runPhotoImport, LIBRARY_PAGE_SIZE } from '../utils/runPhotoImport';

const PRIMARY_COLOR = '#5BA0F2';

/**
 * Bringing the phone's photograph library in (User Story 3, FR-001, FR-009).
 *
 * <p>
 * The counterpart of the web client's Settings → Import panel, reached the same way and
 * following the same contract. What differs is only the door: a browser is handed a folder,
 * and a phone enumerates a library it never holds all of at once.
 * </p>
 *
 * <p>
 * <b>Deliberately thin.</b> Every rule lives in `runPhotoImport`, which imports none of the
 * modules above — `expo-media-library`, `ApiClient` and `DatabaseService` all throw the moment
 * they load under jest, so anything sharing a file with them cannot be tested. This file is
 * the wiring: it supplies the real implementations and shows what happened. It is the part
 * that has to be checked on a device, because it is the part no test can reach.
 * </p>
 *
 * <p>
 * Reading the journal list happens on mount; <b>creating one waits for the button</b>. Opening
 * a screen is not consent to write anything.
 * </p>
 */
export default function ImportScreen({ navigation }) {
  const [journalName, setJournalName] = useState(null);
  const [library, setLibrary] = useState(null);
  const [permission, setPermission] = useState(null);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  // Read-only. `resolveImportJournal` is what can create one, and it is not called here.
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

  /**
   * Ask for the library and count what is in it, so somebody sees the size of the job before
   * agreeing to it — and sees that the videos are being left alone rather than lost.
   */
  const inspect = useCallback(async () => {
    setError(null);
    const granted = await MediaLibrary.requestPermissionsAsync();
    setPermission(granted.status);

    if (granted.status !== 'granted') {
      return;
    }

    try {
      const [photos, videos] = await Promise.all([
        MediaLibrary.getAssetsAsync({ first: 1, mediaType: MediaLibrary.MediaType.photo }),
        MediaLibrary.getAssetsAsync({ first: 1, mediaType: MediaLibrary.MediaType.video }),
      ]);
      setLibrary({ photos: photos.totalCount ?? 0, videos: videos.totalCount ?? 0 });
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  const start = useCallback(async () => {
    setRunning(true);
    setError(null);
    setSummary(null);

    try {
      const journal = await resolveImportJournal();
      setJournalName(journal.name);

      setSummary(await runPhotoImport({
        journalId: journal.id,
        onProgress: setProgress,
        deps: {
          listAssets: ({ first, after }) => MediaLibrary.getAssetsAsync({
            first: first ?? LIBRARY_PAGE_SIZE,
            after: after ?? undefined,
            mediaType: MediaLibrary.MediaType.photo,
            /*
             * Oldest first. `true` is ascending — the library builds the string as
             * `${key} ${asc ? 'ASC' : 'DESC'}`, so `false` here would mean newest first and
             * every new photograph taken mid-import would shift the pages underneath the
             * cursor, which is exactly what resume must not depend on.
             */
            sortBy: [[MediaLibrary.SortBy.creationTime, true]],
          }),
          // `getAssetInfoAsync` is the only call that returns EXIF and a readable `localUri`;
          // the asset from the page listing has neither.
          assetInfo: (asset) => MediaLibrary.getAssetInfoAsync(asset),
          hashOf: (asset) => contentHash(asset.localUri ?? asset.uri),
          buildPhotoMetadata,
          uploadImage: ({ asset, metadata }) => MediaApi.uploadMedia({
            localUri: asset.localUri ?? asset.uri,
            type: 'image',
            filename: asset.filename,
            width: asset.width,
            height: asset.height,
            photoMetadata: metadata,
          }),
          createBatch: (journalId) => ImportApi.createBatch(journalId),
          registerPhotos: (batchId, photos) => ImportApi.registerPhotos(batchId, photos),
          finalizeBatch: (batchId) => ImportApi.finalizeBatch(batchId),
          listBatches: (status) => ImportApi.listBatches(status),
          listBatchPhotos: (batchId) => ImportApi.listBatchPhotos(batchId),
          // The durable local copy, finally wired up: the table and these methods have
          // existed since schema v4 with nothing calling them.
          savePhotoMetadata: (assetId, metadata) => DatabaseService.savePhotoMetadata(assetId, metadata),
          confirmPhotoMetadata: (assetId) => DatabaseService.confirmPhotoMetadata(assetId),
          countVideos: async () => {
            const videos = await MediaLibrary.getAssetsAsync({
              first: 1, mediaType: MediaLibrary.MediaType.video,
            });
            return videos.totalCount ?? 0;
          },
        },
      }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import photos</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lede}>
          Your photographs will be grouped into entries by where and when they were taken.
          Nothing is published — every entry is private until you say otherwise.
        </Text>

        <Text style={styles.destination}>
          {journalName
            ? `Entries will go into ${journalName}.`
            : 'A journal will be created for these entries.'}
        </Text>

        {permission === null && (
          <TouchableOpacity style={styles.button} onPress={inspect} disabled={running}>
            <Text style={styles.buttonText}>Choose photos</Text>
          </TouchableOpacity>
        )}

        {permission === 'denied' && (
          <Text style={styles.error}>
            FootPrint needs access to your photos to import them. You can grant it in Settings.
          </Text>
        )}

        {library && (
          <View style={styles.found}>
            <Text style={styles.foundCount}>
              {`${library.photos.toLocaleString()} ${library.photos === 1 ? 'photograph' : 'photographs'}`}
            </Text>
            {/* Named, not hidden. Videos are not photographs and are not silently treated
                as them — saying so is the difference between "not supported yet" and
                "where did those go". */}
            {library.videos > 0 && (
              <Text style={styles.foundAside}>
                {`${library.videos.toLocaleString()} ${library.videos === 1 ? 'video' : 'videos'} will not be imported.`}
              </Text>
            )}
          </View>
        )}

        {library && (
          <TouchableOpacity
            style={[styles.button, (running || library.photos === 0) && styles.buttonDisabled]}
            onPress={start}
            disabled={running || library.photos === 0}
          >
            <Text style={styles.buttonText}>{running ? 'Importing…' : 'Import'}</Text>
          </TouchableOpacity>
        )}

        {/* Twenty thousand photographs with no progress looks like a frozen app. */}
        {running && (
          <View style={styles.progress}>
            <ActivityIndicator color={PRIMARY_COLOR} />
            <Text style={styles.progressText}>
              {progress?.phase === 'reading' && `Reading and uploading ${progress.done}…`}
              {progress?.phase === 'grouping' && `Grouping — ${progress.entriesCreated} entries so far`}
              {!progress && 'Starting…'}
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {summary && (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Done</Text>
            <Text style={styles.summaryLine}>{summary.entriesCreated} entries created</Text>
            <Text style={styles.summaryLine}>{summary.duplicates} already in your library</Text>
            {/* Waiting, not lost: a held photograph needs a date only a person can supply. */}
            <Text style={styles.summaryLine}>{summary.held} waiting for a date</Text>
            {summary.skipped > 0 && (
              <Text style={styles.summaryLine}>{summary.skipped} already uploaded earlier</Text>
            )}
            {summary.videos > 0 && (
              <Text style={styles.summaryLine}>{summary.videos} videos were not imported</Text>
            )}
            {summary.failed > 0 && (
              <Text style={styles.summaryLine}>{summary.failed} could not be read or uploaded</Text>
            )}
            {summary.incomplete && (
              <Text style={styles.error}>
                Some photographs are still ungrouped. Import again to finish them — nothing
                already created will be duplicated.
              </Text>
            )}
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
  body: { padding: 16 },
  lede: { fontSize: 15, color: '#3C3C43', lineHeight: 21, marginBottom: 16 },
  destination: { fontSize: 14, color: '#636366', marginBottom: 20 },
  button: {
    backgroundColor: PRIMARY_COLOR, borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginBottom: 16,
  },
  buttonDisabled: { backgroundColor: '#C7D6EA' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  found: {
    backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 16,
  },
  foundCount: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  foundAside: { fontSize: 13, color: '#8E8E93', marginTop: 6 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressText: { fontSize: 14, color: '#3C3C43' },
  error: { color: '#C0392B', fontSize: 14, marginBottom: 12 },
  summary: { backgroundColor: '#FFF', borderRadius: 10, padding: 16 },
  summaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#1C1C1E' },
  summaryLine: { fontSize: 14, color: '#3C3C43', marginBottom: 4 },
});
