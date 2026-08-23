import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const PRIMARY = '#4361EE';

/**
 * Setting a new password from a code sent by email.
 *
 * The backend has supported this from the start, and the endpoints were already declared in
 * this app's config -- they had simply never been called from anywhere. There was no way to
 * reset a password on a phone at all.
 *
 * Two steps, because the code arrives by email: somebody has to leave the app and come
 * back, and a single form would sit half-filled while they went looking for it.
 */
export default function ForgotPasswordModal({ visible, initialEmail = '', onClose, onDone }) {
  const { requestPasswordReset, resetPasswordWithCode } = useAuth();

  const [step, setStep] = useState('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setStep('request');
    setCode('');
    setPassword('');
    setConfirm('');
    setError('');
    onClose?.();
  };

  const sendCode = async () => {
    setError('');
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setStep('reset');
    } catch (err) {
      setError(err.message || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setError('');

    // Checked here because the server cannot tell a typo from an intention, and would set
    // the mistyped password quite happily.
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      await resetPasswordWithCode(email.trim(), code.trim(), password);
      onDone?.(email.trim());
      close();
    } catch (err) {
      setError(err.message || 'That code was not accepted. It may have expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.panel}>
          <TouchableOpacity style={styles.close} onPress={close} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>

          <ScrollView keyboardShouldPersistTaps="handled">
            {step === 'request' ? (
              <>
                <Text style={styles.title}>Reset your password</Text>
                <Text style={styles.desc}>
                  We will email you a six-digit code. It is good for 15 minutes.
                </Text>

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="you@example.com"
                />

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submit, (busy || !email.trim()) && styles.submitDisabled]}
                  onPress={sendCode}
                  disabled={busy || !email.trim()}
                >
                  {busy
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.submitText}>Send the code</Text>}
                </TouchableOpacity>

                {/* Said plainly: somebody who signed up with Google otherwise assumes this
                    is not for them. It is -- it adds a password to the account they have,
                    and Google sign-in keeps working. */}
                <Text style={styles.note}>
                  This works even if you normally sign in with Google. It adds a password —
                  it does not replace anything.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Enter the code</Text>
                <Text style={styles.desc}>We sent a six-digit code to {email}.</Text>

                <Text style={styles.label}>Code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                />

                <Text style={styles.label}>New password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />

                <Text style={styles.label}>Confirm password</Text>
                <TextInput
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                />

                {!!error && <Text style={styles.error}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submit, (busy || code.length !== 6 || !password) && styles.submitDisabled]}
                  onPress={savePassword}
                  disabled={busy || code.length !== 6 || !password}
                >
                  {busy
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.submitText}>Set the password</Text>}
                </TouchableOpacity>

                {/* The reset revokes every refresh token. Better said before than
                    discovered after. */}
                <Text style={styles.note}>
                  This signs you out everywhere else. You will need to sign in again on
                  your other devices.
                </Text>

                <TouchableOpacity style={styles.secondary} onPress={() => setStep('request')}>
                  <Text style={styles.secondaryText}>Send a new code</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(20,20,20,0.55)',
  },
  panel: {
    maxHeight: '85%',
    padding: 24,
    borderRadius: 14,
    backgroundColor: '#FFF',
  },
  close: { position: 'absolute', top: 10, right: 12, zIndex: 1, padding: 6 },
  title: { fontSize: 20, fontWeight: '600', color: '#222', marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 20, color: '#666', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '500', color: '#444', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  // Six digits read off a screen and typed in one go: spacing them makes a transposed
  // pair visible before it is submitted.
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  submit: {
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: PRIMARY,
    alignItems: 'center',
  },
  submitDisabled: { backgroundColor: '#B9C2E8' },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '500' },
  secondary: { marginTop: 10, paddingVertical: 8, alignItems: 'center' },
  secondaryText: { color: PRIMARY, fontSize: 13 },
  error: {
    marginBottom: 14,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#FDECEA',
    color: '#B3261E',
    fontSize: 13,
  },
  note: { marginTop: 14, fontSize: 12, lineHeight: 18, color: '#777' },
});
