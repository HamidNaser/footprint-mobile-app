import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { dismissCandidate } from '../../api/LifelineApi';

const PRIMARY_COLOR = '#4361ee';

/**
 * A day that might have mattered, put as a question.
 *
 * The detector found several people in one place on one afternoon. It cannot tell whether
 * that was a wedding or a funeral — a crowd looks identical either way — so this states
 * only what is known and asks the rest.
 *
 * Mirrors the web card deliberately, down to the wording. Somebody switching between phone
 * and browser is being asked about one life, and the question should not change shape on
 * the way.
 *
 * Three choices here are about not doing harm:
 *
 * 1. **The headline is facts.** A count, a place, a date. Nothing that characterises the
 *    day, because "Celebration!" lands very badly on the anniversary of a death.
 * 2. **Dismissal is on the card.** Research on these features is explicit that somebody
 *    ambushed by a memory does not then go hunting through a settings screen.
 * 3. **Dismissal is optimistic and permanent.** The card leaves at once; waiting on a
 *    round trip leaves the thing somebody asked to be rid of on screen while it happens.
 */
export default function TimelineCandidateCard({ candidate, onAnswer, onDismissed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!candidate) return null;

  const dismiss = async () => {
    setBusy(true);
    setError(null);
    // Gone before the request finishes.
    onDismissed?.(candidate.candidateKey);
    try {
      await dismissCandidate(candidate.candidateKey, candidate.personId);
    } catch (e) {
      // Back, and says why. Silently losing a dismissal means showing the same memory
      // again to somebody who already asked once.
      setError(e?.message || 'Could not dismiss that.');
      onDismissed?.(null);
    } finally {
      setBusy(false);
    }
  };

  // An async handler left floating is a rejection nobody catches. Everything inside
  // `dismiss` is already handled; this only guarantees nothing leaks past it.
  const handleDismiss = () => { dismiss().catch(() => {}); };

  return (
    <View style={styles.card} accessibilityLabel="Suggested memory">
      <TouchableOpacity
        style={styles.dismiss}
        onPress={handleDismiss}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Never show this again"
        // Generous target: this is the control somebody reaches for when upset.
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={16} color="#8AA0BC" />
      </TouchableOpacity>

      {/* Facts only. Composed by the server, which holds the same rule. */}
      <Text style={styles.headline}>{candidate.headline}</Text>
      <Text style={styles.question}>{candidate.question}</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primary]}
          onPress={() => onAnswer?.(candidate)}
          disabled={busy}
        >
          <Ionicons name="mic-outline" size={14} color="#FFF" />
          <Text style={styles.primaryText}>Tell the story</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondary]}
          onPress={handleDismiss}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Not really</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    padding: 12,
    paddingRight: 34,
    borderRadius: 12,
    // Dashed, so a guess does not look like a fact.
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(67, 97, 238, 0.45)',
    backgroundColor: 'rgba(67, 97, 238, 0.06)',
  },
  dismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
  headline: {
    color: '#E8EEF7',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  question: {
    color: '#8AA0BC',
    fontSize: 13,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primary: {
    backgroundColor: PRIMARY_COLOR,
  },
  primaryText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  secondary: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  secondaryText: {
    color: '#8AA0BC',
    fontSize: 13,
  },
  error: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
  },
});
