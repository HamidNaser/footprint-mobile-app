/**
 * SignalR Service
 * 
 * Manages WebSocket connection to the Footprint Hub for real-time updates.
 * Handles connection lifecycle, reconnection, and event subscriptions.
 * 
 * Events:
 * - ReceiveMessage: New chat message
 * - ReceiveTyping: Typing indicator update
 * - ReceivePresence: User online/offline status
 * - ReceiveNotification: New notification
 * - ConversationUpdated: Conversation update (new message, read status)
 * - ReceiveFriendRequest: Friend request update
 * - MessageRead: Message read confirmation
 * - ConversationRead: Conversation read confirmation
 */

import * as signalR from '@microsoft/signalr';
import { API_CONFIG } from '../config/api.config';

// Hub URL - uses API config for consistency
const HUB_URL = API_CONFIG.SIGNALR_URL;

/**
 * Connection states
 */
export const ConnectionState = {
  DISCONNECTED: 'Disconnected',
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  RECONNECTING: 'Reconnecting',
  DISCONNECTING: 'Disconnecting',
};

/**
 * Event types that can be subscribed to
 */
export const SignalREvents = {
  RECEIVE_MESSAGE: 'ReceiveMessage',
  RECEIVE_TYPING: 'ReceiveTyping',
  RECEIVE_PRESENCE: 'ReceivePresence',
  RECEIVE_NOTIFICATION: 'ReceiveNotification',
  CONVERSATION_UPDATED: 'ConversationUpdated',
  RECEIVE_FRIEND_REQUEST: 'ReceiveFriendRequest',
  MESSAGE_READ: 'MessageRead',
  CONVERSATION_READ: 'ConversationRead',
  SYNC_AVAILABLE: 'SyncAvailable',
};

/**
 * SignalR Service for real-time communication
 */
class SignalRServiceClass {
  constructor() {
    this._connection = null;
    this._connectionState = ConnectionState.DISCONNECTED;
    this._accessToken = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 10;
    this._eventHandlers = new Map();
    this._stateChangeHandlers = [];
    this._isManualDisconnect = false;
  }

  /**
   * Get current connection state
   * @returns {string} Current connection state
   */
  get connectionState() {
    return this._connectionState;
  }

  /**
   * Check if connected
   * @returns {boolean} True if connected
   */
  get isConnected() {
    return this._connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Initialize and connect to SignalR hub
   * @param {string} accessToken - JWT access token for authentication
   * @returns {Promise<boolean>} True if connection successful
   */
  async connect(accessToken) {
    if (!accessToken) {
      console.warn('[SignalR] Cannot connect without access token');
      return false;
    }

    if (this._connection && this._connectionState === ConnectionState.CONNECTED) {
      console.log('[SignalR] Already connected');
      return true;
    }

    this._accessToken = accessToken;
    this._isManualDisconnect = false;
    this._reconnectAttempts = 0;

    try {
      await this._createConnection();
      await this._startConnection();
      return true;
    } catch (error) {
      console.error('[SignalR] Connection failed:', error);
      return false;
    }
  }

  /**
   * Create SignalR connection with configuration
   */
  _createConnection() {
    const hubUrl = HUB_URL;
    
    console.log('[SignalR] Creating connection to:', hubUrl);

    this._connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => this._accessToken,
        // Use WebSockets with fallback to Server-Sent Events and Long Polling
        transport: signalR.HttpTransportType.WebSockets | 
                   signalR.HttpTransportType.ServerSentEvents |
                   signalR.HttpTransportType.LongPolling,
        skipNegotiation: false,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Custom retry delays: 0s, 2s, 5s, 10s, 30s, then 60s intervals
          const delays = [0, 2000, 5000, 10000, 30000];
          const attempt = retryContext.previousRetryCount;
          
          if (attempt < delays.length) {
            return delays[attempt];
          }
          
          // After initial delays, retry every 60 seconds up to max attempts
          if (attempt < this._maxReconnectAttempts) {
            return 60000;
          }
          
          // Stop retrying
          return null;
        }
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Set up connection event handlers
    this._setupConnectionHandlers();
  }

  /**
   * Set up connection lifecycle event handlers
   */
  _setupConnectionHandlers() {
    // Connection closed
    this._connection.onclose((error) => {
      console.log('[SignalR] Connection closed', error ? `Error: ${error}` : '');
      this._setConnectionState(ConnectionState.DISCONNECTED);
      
      if (!this._isManualDisconnect && error) {
        console.log('[SignalR] Will attempt to reconnect...');
      }
    });

    // Reconnecting
    this._connection.onreconnecting((error) => {
      console.log('[SignalR] Reconnecting...', error ? `Error: ${error}` : '');
      this._setConnectionState(ConnectionState.RECONNECTING);
      this._reconnectAttempts++;
    });

    // Reconnected
    this._connection.onreconnected((connectionId) => {
      console.log('[SignalR] Reconnected with ID:', connectionId);
      this._setConnectionState(ConnectionState.CONNECTED);
      this._reconnectAttempts = 0;
    });

    // Register all event handlers
    this._registerHubEventHandlers();
  }

  /**
   * Register handlers for hub events
   */
  _registerHubEventHandlers() {
    // Chat message received
    this._connection.on(SignalREvents.RECEIVE_MESSAGE, (message) => {
      console.log('[SignalR] Message received:', message.messageId);
      this._notifyHandlers(SignalREvents.RECEIVE_MESSAGE, message);
    });

    // Typing indicator
    this._connection.on(SignalREvents.RECEIVE_TYPING, (typing) => {
      this._notifyHandlers(SignalREvents.RECEIVE_TYPING, typing);
    });

    // Presence update (online/offline)
    this._connection.on(SignalREvents.RECEIVE_PRESENCE, (presence) => {
      console.log('[SignalR] Presence update:', presence.userId, presence.isOnline ? 'online' : 'offline');
      this._notifyHandlers(SignalREvents.RECEIVE_PRESENCE, presence);
    });

    // Notification received
    this._connection.on(SignalREvents.RECEIVE_NOTIFICATION, (notification) => {
      console.log('[SignalR] Notification received:', notification.type, notification.title);
      this._notifyHandlers(SignalREvents.RECEIVE_NOTIFICATION, notification);
    });

    // Conversation updated
    this._connection.on(SignalREvents.CONVERSATION_UPDATED, (update) => {
      console.log('[SignalR] Conversation updated:', update.conversationId);
      this._notifyHandlers(SignalREvents.CONVERSATION_UPDATED, update);
    });

    // Friend request
    this._connection.on(SignalREvents.RECEIVE_FRIEND_REQUEST, (request) => {
      console.log('[SignalR] Friend request:', request.status, 'from', request.fromUserName);
      this._notifyHandlers(SignalREvents.RECEIVE_FRIEND_REQUEST, request);
    });

    // Message read confirmation
    this._connection.on(SignalREvents.MESSAGE_READ, (conversationId, messageId, readByUserId) => {
      this._notifyHandlers(SignalREvents.MESSAGE_READ, { conversationId, messageId, readByUserId });
    });

    // Conversation read confirmation
    this._connection.on(SignalREvents.CONVERSATION_READ, (conversationId, readByUserId) => {
      this._notifyHandlers(SignalREvents.CONVERSATION_READ, { conversationId, readByUserId });
    });

    // Sync available notification (journal entries created/updated/deleted)
    this._connection.on(SignalREvents.SYNC_AVAILABLE, (syncEvent) => {
      console.log('[SignalR] Sync available:', syncEvent.type, syncEvent.action, syncEvent.entityId);
      this._notifyHandlers(SignalREvents.SYNC_AVAILABLE, syncEvent);
    });
  }

  /**
   * Start the connection
   */
  async _startConnection() {
    this._setConnectionState(ConnectionState.CONNECTING);

    try {
      await this._connection.start();
      console.log('[SignalR] Connected successfully');
      this._setConnectionState(ConnectionState.CONNECTED);
    } catch (error) {
      console.error('[SignalR] Failed to start connection:', error);
      this._setConnectionState(ConnectionState.DISCONNECTED);
      throw error;
    }
  }

  /**
   * Disconnect from SignalR hub
   */
  async disconnect() {
    if (!this._connection) {
      return;
    }

    this._isManualDisconnect = true;
    this._setConnectionState(ConnectionState.DISCONNECTING);

    try {
      await this._connection.stop();
      console.log('[SignalR] Disconnected');
    } catch (error) {
      console.error('[SignalR] Error disconnecting:', error);
    } finally {
      this._connection = null;
      this._setConnectionState(ConnectionState.DISCONNECTED);
    }
  }

  /**
   * Update connection state and notify listeners
   * @param {string} state - New connection state
   */
  _setConnectionState(state) {
    const previousState = this._connectionState;
    this._connectionState = state;

    if (previousState !== state) {
      console.log(`[SignalR] State changed: ${previousState} -> ${state}`);
      this._stateChangeHandlers.forEach(handler => {
        try {
          handler(state, previousState);
        } catch (error) {
          console.error('[SignalR] State change handler error:', error);
        }
      });
    }
  }

  /**
   * Subscribe to connection state changes
   * @param {function} handler - Callback (newState, previousState)
   * @returns {function} Unsubscribe function
   */
  onStateChange(handler) {
    this._stateChangeHandlers.push(handler);
    return () => {
      const index = this._stateChangeHandlers.indexOf(handler);
      if (index > -1) {
        this._stateChangeHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to a specific event
   * @param {string} eventName - Event name from SignalREvents
   * @param {function} handler - Event handler callback
   * @returns {function} Unsubscribe function
   */
  on(eventName, handler) {
    if (!this._eventHandlers.has(eventName)) {
      this._eventHandlers.set(eventName, []);
    }
    this._eventHandlers.get(eventName).push(handler);

    return () => this.off(eventName, handler);
  }

  /**
   * Unsubscribe from a specific event
   * @param {string} eventName - Event name
   * @param {function} handler - Handler to remove
   */
  off(eventName, handler) {
    const handlers = this._eventHandlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Notify all handlers for an event
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  _notifyHandlers(eventName, data) {
    const handlers = this._eventHandlers.get(eventName) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[SignalR] Handler error for ${eventName}:`, error);
      }
    });
  }

  // ==================== Hub Method Invocations ====================

  /**
   * Send a chat message
   * @param {string} conversationId - Conversation ID
   * @param {string} content - Message content
   * @param {string} mediaUrl - Optional media URL
   * @returns {Promise<object>} Sent message response
   */
  async sendMessage(conversationId, content, mediaUrl = null) {
    if (!this.isConnected) {
      throw new Error('Not connected to SignalR hub');
    }
    return await this._connection.invoke('SendMessage', conversationId, content, mediaUrl);
  }

  /**
   * Send typing indicator
   * @param {string} conversationId - Conversation ID
   * @param {boolean} isTyping - Whether user is typing
   */
  async sendTyping(conversationId, isTyping) {
    if (!this.isConnected) return;
    await this._connection.invoke('SendTyping', conversationId, isTyping);
  }

  /**
   * Mark a message as read
   * @param {string} conversationId - Conversation ID
   * @param {string} messageId - Message ID
   */
  async markMessageRead(conversationId, messageId) {
    if (!this.isConnected) return;
    await this._connection.invoke('MarkMessageRead', conversationId, messageId);
  }

  /**
   * Mark all messages in conversation as read
   * @param {string} conversationId - Conversation ID
   */
  async markConversationRead(conversationId) {
    if (!this.isConnected) return;
    await this._connection.invoke('MarkConversationRead', conversationId);
  }

  /**
   * Join a conversation group
   * @param {string} conversationId - Conversation ID
   */
  async joinConversation(conversationId) {
    if (!this.isConnected) return;
    await this._connection.invoke('JoinConversation', conversationId);
  }

  /**
   * Leave a conversation group
   * @param {string} conversationId - Conversation ID
   */
  async leaveConversation(conversationId) {
    if (!this.isConnected) return;
    await this._connection.invoke('LeaveConversation', conversationId);
  }
}

// Export singleton instance
export const SignalRService = new SignalRServiceClass();

export default SignalRService;
