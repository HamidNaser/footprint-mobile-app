import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLifeline, getLifelineYear, mockLifeline } from '../api/LifelineApi';
import { useAuth } from '../context/AuthContext';

const C = {
  bg: '#0a1424',
  surface: '#111f36',
  surface2: '#16263f',
  border: '#1f3355',
  text: '#e8eefc',
  textMuted: '#8ea3c7',
  accent: '#3b82f6',
  gold: '#e0b978',
  pink: '#ec4899',
};

// How many year-nodes are visible on the axis at once.
const WINDOW = 5;

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const monthYear = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

function Avatar({ src, name, size = 32, style }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (src) {
    return <Image source={{ uri: src }} style={[dim, style]} />;
  }
  return (
    <View style={[dim, styles.avatarFallback, style]}>
      <Text style={[styles.avatarFallbackText, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

/**
 * A simple audio row for a year's narration. The backend doesn't return an audio
 * URL yet, so this renders a play affordance when `url` is present and a subtle
 * "no recording yet" state otherwise. Playback wiring can attach to `url` later.
 */
function AudioBar({ url }) {
  const [playing, setPlaying] = useState(false);
  if (!url) {
    return (
      <View style={[styles.audio, styles.audioEmpty]}>
        <Ionicons name="mic-off-outline" size={16} color={C.textMuted} />
        <Text style={styles.audioEmptyText}>No voice recording for this year yet</Text>
      </View>
    );
  }
  return (
    <View style={styles.audio}>
      <TouchableOpacity style={styles.audioBtn} onPress={() => setPlaying((p) => !p)}>
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#fff" />
      </TouchableOpacity>
      <View style={styles.audioTrack}>
        <View style={styles.audioFill} />
        <View style={styles.audioKnob} />
      </View>
      <Text style={styles.audioTime}>0:42</Text>
    </View>
  );
}

/**
 * The centered timeline axis: a horizontal line with circular year "nodes" and
 * left/right arrows that page a fixed-size window across the person's years.
 * `years` is newest-first, so paging left reveals older years.
 */
function TimelineAxis({ years, activeYear, onSelect, windowStart, onPageLeft, onPageRight }) {
  const visible = years.slice(windowStart, windowStart + WINDOW);
  const canLeft = windowStart + WINDOW < years.length; // older years further in the list
  const canRight = windowStart > 0;

  return (
    <View style={styles.axisWrap}>
      <TouchableOpacity
        style={[styles.axisArrow, !canLeft && styles.axisArrowOff]}
        onPress={canLeft ? onPageLeft : undefined}
        disabled={!canLeft}
      >
        <Ionicons name="chevron-back" size={20} color={canLeft ? C.text : C.border} />
      </TouchableOpacity>

      <View style={styles.axisTrackWrap}>
        <View style={styles.axisLine} />
        <View style={styles.axisNodes}>
          {visible.map((y) => {
            const active = y.year === activeYear;
            return (
              <TouchableOpacity
                key={y.year}
                style={styles.axisNodeCol}
                onPress={() => onSelect(y.year)}
                activeOpacity={0.8}
              >
                <View style={[styles.node, active && styles.nodeActive, y.isBirthYear && styles.nodeBirth]}>
                  {y.isBirthYear ? (
                    <Text style={styles.nodeEmoji}>🎉</Text>
                  ) : (
                    <Text style={[styles.nodeCount, active && styles.nodeCountActive]}>
                      {y.momentCount}
                    </Text>
                  )}
                </View>
                <Text style={[styles.nodeYear, active && styles.nodeYearActive]}>{y.year}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.axisArrow, !canRight && styles.axisArrowOff]}
        onPress={canRight ? onPageRight : undefined}
        disabled={!canRight}
      >
        <Ionicons name="chevron-forward" size={20} color={canRight ? C.text : C.border} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * TimelineScreen — the "Timeline" (Lifeline) tab.
 * Three zones: the year's STORY (text + audio) up top, a centered TIMELINE AXIS
 * in the middle (circular year nodes + paging arrows), and the year's MEDIA
 * (photos + videos) at the bottom. A lineage lane keeps the generational story.
 */
export default function TimelineScreen({ navigation }) {
  const { user } = useAuth();
  const [personId, setPersonId] = useState(null); // null = current user
  const [year, setYear] = useState(null);
  const [windowStart, setWindowStart] = useState(0);
  const [overview, setOverview] = useState(() => mockLifeline('you'));
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const { person } = overview;
  const years = overview.years || [];
  const lineage = overview.lineage || [];

  // Load the overview whenever the focused person changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    getLifeline(personId)
      .then((data) => {
        if (!active) return;
        setOverview(data);
        const nextYears = data.years || [];
        setYear(nextYears.length ? nextYears[0].year : null);
        setWindowStart(0);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [personId]);

  // Load the focused year's detail.
  useEffect(() => {
    if (!person?.personId || year == null) {
      setDetail(null);
      return;
    }
    let active = true;
    getLifelineYear(person.personId, year).then((data) => {
      if (active) setDetail(data);
    });
    return () => {
      active = false;
    };
  }, [person?.personId, year]);

  const switchPerson = (p) => {
    setPersonId(p.isSelf ? null : p.personId);
    setYear(null);
  };

  // Keep the active year inside the visible window when it changes.
  useEffect(() => {
    if (year == null) return;
    const idx = years.findIndex((y) => y.year === year);
    if (idx < 0) return;
    if (idx < windowStart || idx >= windowStart + WINDOW) {
      setWindowStart(Math.max(0, Math.min(idx, years.length - WINDOW)));
    }
  }, [year, years]); // eslint-disable-line react-hooks/exhaustive-deps

  const age = detail?.age ?? 0;
  const moments = detail?.moments || [];
  const gateway = detail?.gateway || [];
  const atAge = detail?.atAge || [];
  const world = detail?.world || null;

  const storyText = useMemo(() => {
    const first = moments.find((m) => m.text || m.title);
    if (first) return first.text || first.title;
    if (detail?.isBirthYear) return `The year ${person?.name || 'this story'} begins.`;
    return 'No written reflection for this year yet.';
  }, [moments, detail, person]);

  const headerTitle = person?.isSelf ? `Your ${ordinal(age)} year` : person?.name || '';

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerRow}>
            <Ionicons name="git-branch" size={20} color={C.accent} />
            <Text style={styles.headerBrand}>Lifeline</Text>
          </View>
          <TouchableOpacity onPress={() => navigation?.navigate('Profile')}>
            <Avatar
              src={user?.avatarUrl}
              name={user?.name || user?.firstName}
              size={36}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          {headerTitle}
          {year ? ` · ${year}` : ''}
        </Text>
      </View>

      {/* Lineage lane */}
      <View style={styles.laneWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lane}>
          {lineage.map((p, i) => (
            <React.Fragment key={p.personId}>
              {i > 0 && <Text style={styles.laneSep}>‹</Text>}
              <TouchableOpacity
                style={[styles.laneChip, p.personId === person?.personId && styles.laneChipActive]}
                onPress={() => switchPerson(p)}
              >
                <Avatar src={p.avatar} name={p.name} size={18} />
                <Text
                  style={[
                    styles.laneChipText,
                    p.personId === person?.personId && styles.laneChipTextActive,
                  ]}
                >
                  {p.isSelf ? 'You' : p.name.replace(/^.*·\s*/, '')}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </ScrollView>
      </View>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={C.accent} />
        </View>
      )}

      {/* ZONE 1 — STORY (text + audio), scrolls internally */}
      <View style={styles.storyZone}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.storyBody}>
          <Text style={styles.storyEyebrow}>
            {detail?.isBirthYear ? 'The beginning' : `Age ${age}`}
          </Text>
          <Text style={styles.storyText}>{storyText}</Text>

          <AudioBar url={detail?.audioUrl} />

          {/* World + At-my-age folded in as compact chips */}
          {world && (
            <View style={styles.worldChip}>
              <Ionicons name="earth" size={15} color="#7fa8e6" />
              <Text style={styles.worldChipText} numberOfLines={2}>
                <Text style={styles.worldChipBold}>{world.headline}. </Text>
                {world.summary}
              </Text>
            </View>
          )}

          {atAge.length > 0 && (
            <View style={styles.atAgeInline}>
              <Text style={styles.atAgeInlineTitle}>⏳ At age {age}</Text>
              {atAge.map((row) => (
                <View style={styles.atAgeInlineRow} key={row.personId}>
                  <Text style={styles.atAgeInlineName} numberOfLines={1}>
                    {row.isSelf ? 'You' : row.name.replace(/^.*·\s*/, '')}
                  </Text>
                  <Text style={styles.atAgeInlineWhat} numberOfLines={1}>
                    {row.highlight ||
                      (row.momentCount > 0
                        ? `${row.momentCount} moment${row.momentCount === 1 ? '' : 's'}`
                        : '—')}
                  </Text>
                  <Text style={styles.atAgeInlineYear}>{row.year ?? ''}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* ZONE 2 — TIMELINE AXIS (centered) */}
      <TimelineAxis
        years={years}
        activeYear={year}
        onSelect={setYear}
        windowStart={windowStart}
        onPageLeft={() =>
          setWindowStart((s) => Math.min(s + WINDOW, Math.max(0, years.length - WINDOW)))
        }
        onPageRight={() => setWindowStart((s) => Math.max(0, s - WINDOW))}
      />

      {/* ZONE 3 — MEDIA (photos + video), scrolls internally */}
      <View style={styles.mediaZone}>
        <View style={styles.mediaHeaderRow}>
          <Text style={styles.mediaTitle}>Photos &amp; Videos</Text>
          <Text style={styles.mediaCount}>{moments.length}</Text>
        </View>

        {moments.length === 0 && gateway.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={28} color={C.textMuted} />
            <Text style={styles.emptyText}>No media for this year yet.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mediaGrid}>
            {moments.map((m) => (
              <View style={styles.media} key={m.entryId}>
                <View style={styles.mediaPhotoWrap}>
                  {m.photos && m.photos[0] ? (
                    <Image source={{ uri: m.photos[0] }} style={styles.mediaPhoto} />
                  ) : (
                    <View style={[styles.mediaPhoto, styles.mediaPhotoEmpty]} />
                  )}
                  {m.type === 'milestone' && (
                    <View style={styles.mediaBadge}>
                      <Text style={styles.mediaBadgeText}>★</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.mediaCaption} numberOfLines={1}>
                  {m.title || m.text || 'Memory'}
                </Text>
                <Text style={styles.mediaDate}>{monthYear(m.date)}</Text>
              </View>
            ))}

            {/* Generational gateway as inline end-cards */}
            {gateway.map((parent) => (
              <TouchableOpacity
                key={parent.personId}
                style={[styles.media, styles.gatewayCard]}
                onPress={() => setPersonId(parent.personId)}
              >
                <Avatar src={parent.avatar} name={parent.name} size={40} />
                <Text style={styles.gatewayName} numberOfLines={1}>
                  {parent.name.replace(/^.*·\s*/, '')}&apos;s life
                </Text>
                <Text style={styles.gatewayYear}>from {parent.birthYear} →</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: { paddingTop: 54, paddingHorizontal: 18, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatar: { borderWidth: 2, borderColor: C.accent },
  headerBrand: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  headerSub: { color: C.textMuted, fontSize: 13, marginTop: 3, textTransform: 'capitalize' },

  laneWrap: { borderBottomWidth: 1, borderBottomColor: C.border },
  lane: { paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center', gap: 6 },
  laneSep: { color: '#4a6390', fontSize: 15, marginHorizontal: 2 },
  laneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
  },
  laneChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  laneChipText: { color: C.textMuted, fontSize: 12.5 },
  laneChipTextActive: { color: '#fff', fontWeight: '700' },

  loading: { position: 'absolute', top: 60, right: 20, zIndex: 5 },

  // ZONE 1 — story
  storyZone: { flex: 1.05, paddingHorizontal: 18 },
  storyBody: { paddingVertical: 14 },
  storyEyebrow: {
    color: C.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase',
  },
  storyText: { color: C.text, fontSize: 16, lineHeight: 23, marginTop: 6, marginBottom: 12 },

  audio: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.surface, borderColor: C.border, borderWidth: 1,
    borderRadius: 12, padding: 10,
  },
  audioEmpty: { justifyContent: 'center' },
  audioEmptyText: { color: C.textMuted, fontSize: 12 },
  audioBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  audioTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.surface2, justifyContent: 'center' },
  audioFill: { width: '35%', height: 4, borderRadius: 2, backgroundColor: C.accent },
  audioKnob: {
    position: 'absolute', left: '35%', width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#fff', marginLeft: -5,
  },
  audioTime: { color: C.textMuted, fontSize: 11, minWidth: 30, textAlign: 'right' },

  worldChip: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.28)',
    borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12,
  },
  worldChipText: { color: C.textMuted, fontSize: 12, lineHeight: 17, flex: 1 },
  worldChipBold: { color: C.text, fontWeight: '700' },

  atAgeInline: {
    backgroundColor: 'rgba(224,185,120,0.09)', borderColor: 'rgba(224,185,120,0.30)',
    borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12,
  },
  atAgeInlineTitle: { color: C.gold, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  atAgeInlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  atAgeInlineName: { color: C.text, fontSize: 12.5, fontWeight: '700', width: 66 },
  atAgeInlineWhat: { color: C.textMuted, fontSize: 11.5, flex: 1 },
  atAgeInlineYear: { color: C.gold, fontSize: 13, fontWeight: '800' },

  // ZONE 2 — axis
  axisWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border,
    backgroundColor: C.surface,
  },
  axisArrow: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  axisArrowOff: { opacity: 0.4 },
  axisTrackWrap: { flex: 1, justifyContent: 'center' },
  axisLine: {
    position: 'absolute', left: 6, right: 6, top: 21, height: 2, backgroundColor: C.border,
  },
  axisNodes: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  axisNodeCol: { alignItems: 'center', width: 52 },
  node: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface2,
    borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  nodeActive: {
    backgroundColor: C.accent, borderColor: '#bcd4ff', width: 38, height: 38, borderRadius: 19,
  },
  nodeBirth: { borderColor: C.gold },
  nodeEmoji: { fontSize: 13 },
  nodeCount: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  nodeCountActive: { color: '#fff', fontSize: 14 },
  nodeYear: { color: C.textMuted, fontSize: 11, marginTop: 6 },
  nodeYearActive: { color: C.text, fontWeight: '800' },

  // ZONE 3 — media
  mediaZone: { flex: 1.15, paddingHorizontal: 16, paddingTop: 12 },
  mediaHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  mediaTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  mediaCount: {
    color: C.textMuted, fontSize: 11, fontWeight: '700', backgroundColor: C.surface2,
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 1, overflow: 'hidden',
  },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: 16 },
  media: { width: '31.5%', marginBottom: 12 },
  mediaPhotoWrap: { position: 'relative' },
  mediaPhoto: { width: '100%', height: 84, borderRadius: 10 },
  mediaPhotoEmpty: { backgroundColor: '#274063' },
  mediaBadge: {
    position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(59,130,246,0.92)',
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  mediaBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  mediaCaption: { color: C.text, fontSize: 11.5, fontWeight: '700', marginTop: 5 },
  mediaDate: { color: C.textMuted, fontSize: 10, marginTop: 1 },

  gatewayCard: {
    alignItems: 'center', justifyContent: 'center', gap: 4, height: 128,
    borderWidth: 1.5, borderColor: C.accent, borderStyle: 'dashed', borderRadius: 12,
    backgroundColor: 'rgba(59,130,246,0.07)',
  },
  gatewayName: { color: C.text, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  gatewayYear: { color: C.textMuted, fontSize: 10 },

  empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyText: { color: C.textMuted, fontSize: 13 },

  avatarFallback: { backgroundColor: '#3a527a', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '700' },
});
