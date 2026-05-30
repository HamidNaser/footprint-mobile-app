import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { googleAuthConfig, isGoogleOAuthConfigured, GOOGLE_SCOPES } from '../config/oauth.config';

// Complete auth session for web browser redirect
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register, loginWithGoogle, loginWithApple, loginWithFacebook } = useAuth();

  // Google Auth Request setup
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: googleAuthConfig.expoClientId,
    iosClientId: googleAuthConfig.iosClientId,
    androidClientId: googleAuthConfig.androidClientId,
    webClientId: googleAuthConfig.webClientId,
    scopes: GOOGLE_SCOPES,
  });

  // Handle Google auth response
  useEffect(() => {
    handleGoogleAuthResponse();
  }, [response]);

  const handleGoogleAuthResponse = async () => {
    if (response?.type === 'success') {
      setIsGoogleLoading(true);
      setError('');
      
      try {
        const { authentication } = response;
        
        if (authentication?.accessToken) {
          // Send the access token to our backend
          await loginWithGoogle(authentication.accessToken);
        } else {
          throw new Error('No access token received from Google');
        }
      } catch (err) {
        console.error('Google login error:', err);
        setError(err.message || 'Google login failed. Please try again.');
      } finally {
        setIsGoogleLoading(false);
      }
    } else if (response?.type === 'error') {
      console.error('Google auth error:', response.error);
      setError('Google login failed. Please try again.');
    } else if (response?.type === 'dismiss') {
      // User cancelled - no error needed
      console.log('Google login cancelled by user');
    }
  };

  // Cross-platform alert that works on web too
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleGoogleLogin = async () => {
    // Check if OAuth is configured
    if (!isGoogleOAuthConfigured()) {
      showAlert(
        'Google Sign In Not Configured',
        'To enable Google Sign In, you need to:\n\n' +
        '1. Go to Google Cloud Console\n' +
        '2. Create OAuth 2.0 Client IDs\n' +
        '3. Update src/config/oauth.config.js with your client IDs\n\n' +
        'See the config file for detailed instructions.'
      );
      return;
    }

    // Check if request is ready
    if (!request) {
      setError('Google Sign In is initializing. Please try again.');
      return;
    }

    setError('');
    setIsGoogleLoading(true);
    
    try {
      await promptAsync();
    } catch (err) {
      console.error('Google prompt error:', err);
      setError('Failed to open Google Sign In. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && !name) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (isSignUp) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message || (isSignUp ? 'Registration failed' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    // Apple Sign In will be implemented later
    // Requires expo-apple-authentication package
    showAlert(
      'Apple Sign In',
      'Apple Sign In is coming soon. Please use email/password or Google Sign In for now.'
    );
  };

  const handleFacebookLogin = async () => {
    // Facebook Sign In will be implemented later
    // Requires expo-facebook package
    showAlert(
      'Facebook Sign In',
      'Facebook Sign In is coming soon. Please use email/password or Google Sign In for now.'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoEmoji}>👣</Text>
            </View>
            <Text style={styles.logoText}>Journal</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </Text>

          {/* Name Input (Sign Up only) */}
          {isSignUp && (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          {/* Email Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity 
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons 
                name={showPassword ? 'eye' : 'eye-off'} 
                size={22} 
                color="#999" 
              />
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Submit Button */}
          <TouchableOpacity 
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={handleEmailAuth}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isSignUp ? 'Create Account' : 'Log In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Sign Up / Log In */}
          <TouchableOpacity 
            style={styles.toggleContainer}
            onPress={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
          >
            <Text style={styles.toggleText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.toggleLink}>
                {isSignUp ? 'Log in' : 'Sign up'}
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social Login Buttons */}
          <TouchableOpacity 
            style={styles.socialButton}
            onPress={handleAppleLogin}
          >
            <Ionicons name="logo-apple" size={22} color="#000" style={styles.socialIcon} />
            <Text style={styles.socialButtonText}>Continue with Apple</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.socialButton, isGoogleLoading && styles.socialButtonDisabled]}
            onPress={handleGoogleLogin}
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color="#4285F4" style={styles.socialIcon} />
            ) : (
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
            )}
            <Text style={styles.socialButtonText}>
              {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.socialButton}
            onPress={handleFacebookLogin}
          >
            <Ionicons name="logo-facebook" size={22} color="#1877F2" style={styles.socialIcon} />
            <Text style={styles.socialButtonText}>Continue with Facebook</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoIcon: {
    marginBottom: 8,
  },
  logoEmoji: {
    fontSize: 48,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 16,
    position: 'relative',
  },
  input: {
    height: 56,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  passwordToggle: {
    position: 'absolute',
    right: 16,
    top: 17,
  },
  errorText: {
    color: '#E53935',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  submitButton: {
    height: 56,
    backgroundColor: '#2B7DE9',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 15,
    color: '#666',
  },
  toggleLink: {
    color: '#2B7DE9',
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 28,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#999',
  },
  socialButton: {
    height: 56,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  socialButtonDisabled: {
    opacity: 0.7,
  },
  socialIcon: {
    marginRight: 12,
  },
  googleIconContainer: {
    width: 22,
    height: 22,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
});
