/**
 * Realtime Context
 * 
 * React context provider for real-time SignalR functionality.
 * Manages connection lifecycle, provides real-time state, and exposes
 * event subscriptions to components.
 * 
 * Usage:
 * ```jsx
 * // Wrap your app
 * <RealtimeProvider>
 *   <App />
 * </RealtimeProvider>
 * 
 * // Use in components
 * const { connectionState, notifications, presence } = useRealtime();
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { SignalRService, ConnectionState, SignalREvents } from '../services/SignalRService';
import { useAuth } from './AuthContext';

const RealtimeContext = createContext(null);

/**
 * Maximum notifications to keep in memory
 */
const MAX_NOTIFICATIONS = 50;

/**
 * Realtime Provider Component
 * Manages SignalR connection and provides real-time state
 */
export function RealtimeProvider({ children }) {
  const { accessToken, isAuthenticated } = useAuth();
  
  // Connection state
  const [connectionState, setConnectionState] = useState(ConnectionState.DISCONNECTED);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  
  // Real-time data
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState(new Map()); // userId -> { userName, lastSeen }
  const [typingUsers, setTypingUsers] = useState(new Map()); // conversationId -> Set<userId>
  
  // Conversation state
  const [activeConversations, setActiveConversations] = useState(new Map()); // conversationId -> conversation data
  
  // App state tracking
  const appStateRef = useRef(AppState.currentState);
  
  // Event handlers ref to avoid recreating
  const eventHandlersRef = useRef([]);

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connectSignalR();
    } else {
      disconnectSignalR();
    }

    return () => {
      disconnectSignalR();
    };
  }, [isAuthenticated, accessToken]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [accessToken, isAuthenticated]);

  /**
   * Handle app state changes
   */
  const handleAppStateChange = useCallback((nextAppState) => {
    const previousState = appStateRef.current;
    appStateRef.current = nextAppState;

    // App coming to foreground
    if (previousState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('[Realtime] App came to foreground');
      if (isAuthenticated && accessToken && !SignalRService.isConnected) {
        connectSignalR();
      }
    }
    
    // App going to background - keep connection for a short time
    // SignalR will handle reconnection when app comes back
    if (nextAppState === 'background') {
      console.log('[Realtime] App went to background');
    }
  }, [isAuthenticated, accessToken]);

  /**
   * Connect to SignalR hub
   */
  const connectSignalR = useCallback(async () => {
    if (!accessToken) return;

    try {
      // Clean up any existing handlers
      cleanupEventHandlers();
      
      // Set up state change handler
      const unsubState = SignalRService.onStateChange((newState, prevState) => {
        setConnectionState(newState);
        if (newState === ConnectionState.RECONNECTING) {
          setReconnectAttempt(prev => prev + 1);
        } else if (newState === ConnectionState.CONNECTED) {
          setReconnectAttempt(0);
        }
      });
      eventHandlersRef.current.push(unsubState);

      // Set up event handlers
      setupEventHandlers();

      // Connect
      const connected = await SignalRService.connect(accessToken);
      console.log('[Realtime] Connection result:', connected);
    } catch (error) {
      console.error('[Realtime] Connection error:', error);
    }
  }, [accessToken]);

  /**
   * Disconnect from SignalR hub
   */
  const disconnectSignalR = useCallback(async () => {
    cleanupEventHandlers();
    await SignalRService.disconnect();
    setConnectionState(ConnectionState.DISCONNECTED);
  }, []);

  /**
   * Clean up event handlers
   */
  const cleanupEventHandlers = () => {
    eventHandlersRef.current.forEach(unsub => {
      if (typeof unsub === 'function') {
        unsub();
      }
    });
    eventHandlersRef.current = [];
  };

  /**
   * Set up SignalR event handlers
   */
  const setupEventHandlers = () => {
    // Notification received
    const unsubNotification = SignalRService.on(SignalREvents.RECEIVE_NOTIFICATION, (notification) => {
      setNotifications(prev => {
        const updated = [notification, ...prev].slice(0, MAX_NOTIFICATIONS);
        return updated;
      });
      setUnreadNotificationCount(prev => prev + 1);
    });
    eventHandlersRef.current.push(unsubNotification);

    // Presence update
    const unsubPresence = SignalRService.on(SignalREvents.RECEIVE_PRESENCE, (presence) => {
      setOnlineUsers(prev => {
        const updated = new Map(prev);
        if (presence.isOnline) {
          updated.set(presence.userId, {
            userName: presence.userName,
            lastSeen: null,
          });
        } else {
          updated.set(presence.userId, {
            userName: presence.userName,
            lastSeen: presence.lastSeen,
          });
        }
        return updated;
      });
    });
    eventHandlersRef.current.push(unsubPresence);

    // Typing indicator
    const unsubTyping = SignalRService.on(SignalREvents.RECEIVE_TYPING, (typing) => {
      setTypingUsers(prev => {
        const updated = new Map(prev);
        const conversationTyping = updated.get(typing.conversationId) || new Set();
        
        if (typing.isTyping) {
          conversationTyping.add(typing.userId);
        } else {
          conversationTyping.delete(typing.userId);
        }
        
        if (conversationTyping.size > 0) {
          updated.set(typing.conversationId, conversationTyping);
        } else {
          updated.delete(typing.conversationId);
        }
        
        return updated;
      });
    });
    eventHandlersRef.current.push(unsubTyping);

    // Conversation updated
    const unsubConversation = SignalRService.on(SignalREvents.CONVERSATION_UPDATED, (update) => {
      setActiveConversations(prev => {
        const updated = new Map(prev);
        const existing = updated.get(update.conversationId) || {};
        updated.set(update.conversationId, {
          ...existing,
          lastMessagePreview: update.lastMessagePreview,
          unreadCount: update.unreadCount,
          updatedAt: update.updatedAt,
        });
        return updated;
      });
    });
    eventHandlersRef.current.push(unsubConversation);

    // Friend request
    const unsubFriendRequest = SignalRService.on(SignalREvents.RECEIVE_FRIEND_REQUEST, (request) => {
      // Add as notification
      const notification = {
        notificationId: request.requestId,
        type: 'friend_request',
        title: 'Friend Request',
        body: `${request.fromUserName} sent you a friend request`,
        actorId: request.fromUserId,
        actorName: request.fromUserName,
        actorAvatar: request.fromUserAvatar,
        createdAt: new Date().toISOString(),
        data: request,
      };
      setNotifications(prev => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));
      setUnreadNotificationCount(prev => prev + 1);
    });
    eventHandlersRef.current.push(unsubFriendRequest);
  };

  /**
   * Subscribe to a specific event
   * @param {string} eventName - Event from SignalREvents
   * @param {function} handler - Event handler
   * @returns {function} Unsubscribe function
   */
  const subscribeToEvent = useCallback((eventName, handler) => {
    return SignalRService.on(eventName, handler);
  }, []);

  /**
   * Check if a user is online
   * @param {string} userId - User ID
   * @returns {boolean} True if user is online
   */
  const isUserOnline = useCallback((userId) => {
    const user = onlineUsers.get(userId);
    return user && user.lastSeen === null;
  }, [onlineUsers]);

  /**
   * Get typing users for a conversation
   * @param {string} conversationId - Conversation ID
   * @returns {Set<string>} Set of user IDs currently typing
   */
  const getTypingUsers = useCallback((conversationId) => {
    return typingUsers.get(conversationId) || new Set();
  }, [typingUsers]);

  /**
   * Mark notifications as read
   * @param {string[]} notificationIds - IDs to mark as read (or null for all)
   */
  const markNotificationsRead = useCallback((notificationIds = null) => {
    if (notificationIds) {
      setUnreadNotificationCount(prev => Math.max(0, prev - notificationIds.length));
    } else {
      setUnreadNotificationCount(0);
    }
  }, []);

  /**
   * Clear all notifications
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadNotificationCount(0);
  }, []);

  /**
   * Force reconnect
   */
  const reconnect = useCallback(async () => {
    await disconnectSignalR();
    if (isAuthenticated && accessToken) {
      await connectSignalR();
    }
  }, [isAuthenticated, accessToken, connectSignalR, disconnectSignalR]);

  // Context value
  const value = {
    // Connection state
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
    isConnecting: connectionState === ConnectionState.CONNECTING,
    isReconnecting: connectionState === ConnectionState.RECONNECTING,
    reconnectAttempt,
    
    // Real-time data
    notifications,
    unreadNotificationCount,
    onlineUsers,
    typingUsers,
    activeConversations,
    
    // Methods
    subscribeToEvent,
    isUserOnline,
    getTypingUsers,
    markNotificationsRead,
    clearNotifications,
    reconnect,
    
    // SignalR methods (direct access)
    sendMessage: SignalRService.sendMessage.bind(SignalRService),
    sendTyping: SignalRService.sendTyping.bind(SignalRService),
    markMessageRead: SignalRService.markMessageRead.bind(SignalRService),
    markConversationRead: SignalRService.markConversationRead.bind(SignalRService),
    joinConversation: SignalRService.joinConversation.bind(SignalRService),
    leaveConversation: SignalRService.leaveConversation.bind(SignalRService),
    
    // Constants
    ConnectionState,
    SignalREvents,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Hook to access realtime context
 * @returns {object} Realtime context value
 */
export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

/**
 * Hook to subscribe to a specific SignalR event
 * @param {string} eventName - Event name from SignalREvents
 * @param {function} handler - Event handler
 */
export function useRealtimeEvent(eventName, handler) {
  const { subscribeToEvent } = useRealtime();
  
  useEffect(() => {
    const unsubscribe = subscribeToEvent(eventName, handler);
    return unsubscribe;
  }, [eventName, handler, subscribeToEvent]);
}

export default RealtimeContext;
