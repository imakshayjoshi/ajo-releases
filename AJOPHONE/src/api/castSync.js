// AJO Unified Cast & Remote Synchronization Protocol Engine (v3.0)

export const CONNECTION_STATES = {
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  PAIRING: 'PAIRING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  FAILED: 'FAILED'
};

export const REMOTE_COMMANDS = {
  DPAD_UP: 'DPAD_UP',
  DPAD_DOWN: 'DPAD_DOWN',
  DPAD_LEFT: 'DPAD_LEFT',
  DPAD_RIGHT: 'DPAD_RIGHT',
  DPAD_CENTER: 'DPAD_CENTER',
  BACK: 'BACK',
  HOME: 'HOME',
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
  PLAY_PAUSE: 'PLAY_PAUSE',
  SEEK_FORWARD: 'SEEK_FORWARD',
  SEEK_BACK: 'SEEK_BACK',
  CHANNEL_UP: 'CHANNEL_UP',
  CHANNEL_DOWN: 'CHANNEL_DOWN',
  STOP: 'STOP'
};

const STORAGE_KEYS = {
  DEVICE_ID: 'ajo_device_id_v3',
  ROOM_CODE: 'ajo_cast_room_v3',
  SESSION_DATA: 'ajo_cast_session_v3',
  LAST_CMD: 'ajo_cast_cmd_v3'
};

const ALLOWED_MESSAGE_TYPES = new Set([
  'PAIR_REQUEST',
  'PAIR_ACCEPTED',
  'PAIR_CONFIRMED',
  'PAIR_REJECTED',
  'UNPAIR',
  'REMOTE_COMMAND',
  'COMMAND_RESULT',
  'PLAY_MEDIA',
  'CAST_STATUS',
  'HEARTBEAT',
  'NAV_TAB'
]);

const memoryStorage = new Map();
function storageGet(key) {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch {}
  return memoryStorage.get(key) || null;
}

function storageSet(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return;
    }
  } catch {}
  if (value === null || value === undefined) memoryStorage.delete(key);
  else memoryStorage.set(key, value);
}

export function generateShortCode(length = 6) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) result += chars[bytes[i] % chars.length];
  } else {
    for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  }
  return `AJO-${result}`;
}

export function getDeviceId(prefix = 'DEV') {
  let id = storageGet(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    storageSet(STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}

// Phone-remote convenience aliases. The mobile remote view and the TV cast
// panel both use the friendly "pairing room" name; the engine stores the same
// value under the room code, so these are thin wrappers around get/setStoredRoomCode.
export function getPairingRoom() {
  return getStoredRoomCode();
}

export function setPairingRoom(code) {
  return setStoredRoomCode(code);
}

export function getStoredRoomCode() {
  return storageGet(STORAGE_KEYS.ROOM_CODE) || '';
}

export function setStoredRoomCode(code) {
  let clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
  if (clean && !clean.startsWith('AJO-') && clean.length >= 3) {
    clean = `AJO-${clean.replace(/^AJO/i, '')}`;
  }
  storageSet(STORAGE_KEYS.ROOM_CODE, clean);
  return clean;
}

export function getStoredSession() {
  try {
    const raw = storageGet(STORAGE_KEYS.SESSION_DATA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  try {
    if (!session) storageSet(STORAGE_KEYS.SESSION_DATA, null);
    else storageSet(STORAGE_KEYS.SESSION_DATA, JSON.stringify(session));
  } catch {}
}

export function sanitizeCastItem(item) {
  if (!item) return null;
  const players = Array.isArray(item.players) ? item.players : [];
  return {
    id: item.id || item.tmdb_id,
    tmdb_id: item.tmdb_id || null,
    title: item.title_en || item.title || item.name || 'Untitled',
    title_en: item.title_en || item.title || item.name || 'Untitled',
    poster_url: item.poster_url || item.poster || '',
    backdrop_url: item.backdrop_url || item.poster_url || item.poster || '',
    type: item.type || 'movie',
    category: item.category || '',
    year: item.year || null,
    url: item.url || '',
    is_live: Boolean(item.is_live || item.type === 'live' || item.year === 'LIVE'),
    players: players.slice(0, 3).flatMap(player => player?.url && /^https?:\/\//i.test(player.url) ? [{ name: player.name || player.translator || 'Source', url: player.url, source: player.source || player.type || 'hls', headers: player.headers || {} }] : [])
  };
}

// Pure JS MQTT 3.1.1 Packet Encoders & Decoders
function encodeRemainingLength(len) {
  const bytes = [];
  do {
    let encByte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) encByte = encByte | 128;
    bytes.push(encByte);
  } while (len > 0);
  return bytes;
}

function encodeMqttConnect(clientId) {
  const enc = new TextEncoder();
  const cidBytes = enc.encode(clientId);
  const protoBytes = enc.encode("MQTT");
  const varHeader = [0x00, 0x04, ...protoBytes, 0x04, 0x02, 0x00, 0x3c];
  const payload = [0x00, cidBytes.length, ...cidBytes];
  const total = [...varHeader, ...payload];
  return new Uint8Array([0x10, ...encodeRemainingLength(total.length), ...total]);
}

function encodeMqttSubscribe(topic, packetId = 1) {
  const enc = new TextEncoder();
  const tBytes = enc.encode(topic);
  const total = [
    (packetId >> 8) & 0xff, packetId & 0xff,
    (tBytes.length >> 8) & 0xff, tBytes.length & 0xff,
    ...tBytes,
    0x00
  ];
  return new Uint8Array([0x82, ...encodeRemainingLength(total.length), ...total]);
}

function encodeMqttPublish(topic, message) {
  const enc = new TextEncoder();
  const tBytes = enc.encode(topic);
  const mBytes = enc.encode(typeof message === "string" ? message : JSON.stringify(message));
  const total = [
    (tBytes.length >> 8) & 0xff, tBytes.length & 0xff,
    ...tBytes,
    ...mBytes
  ];
  return new Uint8Array([0x30, ...encodeRemainingLength(total.length), ...total]);
}

function parseMqttPublish(uint8Array) {
  if (!uint8Array || uint8Array.length < 3 || (uint8Array[0] >> 4) !== 3) return null;
  try {
    let pos = 1;
    let multiplier = 1;
    let len = 0;
    let digit;
    do {
      digit = uint8Array[pos++];
      len += (digit & 127) * multiplier;
      multiplier *= 128;
    } while ((digit & 128) !== 0 && pos < uint8Array.length);

    const topicLen = (uint8Array[pos] << 8) | uint8Array[pos + 1];
    pos += 2;
    const dec = new TextDecoder();
    const topic = dec.decode(uint8Array.subarray(pos, pos + topicLen));
    pos += topicLen;
    const payloadStr = dec.decode(uint8Array.subarray(pos));
    return { topic, payload: JSON.parse(payloadStr) };
  } catch {
    return null;
  }
}

export class CastSyncEngine {
  constructor(options = {}) {
    this.role = options.role || 'phone';
    this.deviceId = getDeviceId(this.role === 'tv' ? 'TV' : 'PH');
    this.deviceName = options.deviceName || (this.role === 'tv' ? 'AJO Smart TV' : 'AJO Phone');
    this.roomCode = getStoredRoomCode() || (this.role === 'tv' ? generateShortCode(4) : '');
    if (this.role === 'tv' && !getStoredRoomCode()) {
      setStoredRoomCode(this.roomCode);
    }

    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.session = getStoredSession();
    this.listeners = new Set();
    this.stateListeners = new Set();
    this.pendingCommands = new Map();
    this.seenMsgIds = new Set();

    this.ws = null;
    this.bc = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.pairingInterval = null;
    this.reconnectAttempts = 0;
    this.isAppVisible = true;
    this.mqttConnected = false;

    this.storageHandler = (e) => {
      if (e.key === STORAGE_KEYS.LAST_CMD && e.newValue) {
        try {
          this.handleIncoming(JSON.parse(e.newValue));
        } catch {}
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.storageHandler);
      document.addEventListener('visibilitychange', () => {
        this.isAppVisible = document.visibilityState === 'visible';
        if (this.isAppVisible && this.connectionState === CONNECTION_STATES.RECONNECTING) {
          this.connect();
        }
      });
    }

    if (this.roomCode && typeof window !== 'undefined') {
      this.connect();
    }
  }

  setConnectionState(newState) {
    if (this.connectionState !== newState) {
      console.log(`[AJO-CAST] [${this.role.toUpperCase()}] State: ${this.connectionState} -> ${newState}`);
      this.connectionState = newState;
      this.notifyStateListeners();
    }
  }

  notifyStateListeners() {
    const info = {
      state: this.connectionState,
      roomCode: this.roomCode,
      deviceId: this.deviceId,
      session: this.session,
      isPaired: Boolean(this.session?.sessionId)
    };
    for (const listener of this.stateListeners) {
      try { listener(info); } catch (e) {}
    }
  }

  getTopic() {
    if (!this.roomCode) return '';
    return 'ajo_cast_' + this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  connect() {
    if (typeof window === 'undefined' || !this.roomCode) return;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }
    clearTimeout(this.reconnectTimer);
    clearInterval(this.heartbeatTimer);
    this.mqttConnected = false;

    const topic = this.getTopic();
    if (!topic) return;

    // Cross-tab broadcast channel for local instant relay
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel(topic);
        this.bc.onmessage = (event) => {
          if (event.data) this.handleIncoming(event.data);
        };
      } catch {}
    }

    this.setConnectionState(this.session ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.PAIRING);

    const MQTT_BROKERS = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://public.mqtthq.com:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];

    const currentBroker = MQTT_BROKERS[this.reconnectAttempts % MQTT_BROKERS.length];

    try {
      this.ws = new WebSocket(currentBroker, ['mqtt']);
      this.ws.binaryType = 'arraybuffer';

      // Connection timeout fallback
      const connTimeout = setTimeout(() => {
        if (!this.mqttConnected && this.ws) {
          try { this.ws.close(); } catch {}
        }
      }, 4000);

      this.ws.onopen = () => {
        const connectPacket = encodeMqttConnect(this.deviceId + '-' + Math.random().toString(36).slice(2, 6));
        this.ws.send(connectPacket);
      };

      this.ws.onmessage = (event) => {
        const bytes = new Uint8Array(event.data);
        const type = bytes[0] >> 4;
        
        if (type === 2) { // CONNACK
          clearTimeout(connTimeout);
          this.mqttConnected = true;
          this.reconnectAttempts = 0;
          this.ws.send(encodeMqttSubscribe(topic));
          this.setConnectionState(this.session ? CONNECTION_STATES.CONNECTED : CONNECTION_STATES.PAIRING);

          // Start Heartbeat
          this.heartbeatTimer = setInterval(() => {
            if (this.session) {
              this.broadcast({
                type: 'HEARTBEAT',
                senderDeviceId: this.deviceId,
                sessionId: this.session.sessionId,
                timestamp: Date.now()
              });
            }
          }, 8000);
        } else if (type === 3) { // PUBLISH
          const parsed = parseMqttPublish(bytes);
          if (parsed?.payload) {
            this.handleIncoming(parsed.payload);
          }
        }
      };

      this.ws.onclose = () => {
        clearTimeout(connTimeout);
        this.ws = null;
        this.mqttConnected = false;
        if (this.isAppVisible) {
          this.scheduleReconnect();
        } else {
          this.setConnectionState(CONNECTION_STATES.DISCONNECTED);
        }
      };

      this.ws.onerror = () => {
        clearTimeout(connTimeout);
        try { this.ws?.close(); } catch {}
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    this.setConnectionState(CONNECTION_STATES.RECONNECTING);
    this.reconnectAttempts += 1;
    const delays = [800, 1500, 3000, 5000];
    const delay = delays[Math.min(this.reconnectAttempts - 1, delays.length - 1)];
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.isAppVisible) this.connect();
    }, delay);
  }

  /**
   * Switch room code without dropping the WebSocket when the new code is the
   * same as the old one. Used by the phone remote when the user pairs with a
   * different TV.
   */
  updateRoom(newCode) {
    const clean = setStoredRoomCode(newCode);
    if (clean === this.roomCode) return clean;
    this.roomCode = clean;
    this.session = null;
    setStoredSession(null);
    this.connect();
    return clean;
  }

  /**
   * Tiny RPC helper used by the mobile remote view. Translates a UI intent
   * (DPAD_EVENT / NAV_TAB) into a REMOTE_COMMAND or PLAY_MEDIA broadcast so
   * the view code does not have to know the protocol details.
   */
  sendToTV(payload, options = {}) {
    if (!payload || typeof payload !== 'object') return false;

    if (payload.type === 'DPAD_EVENT' && payload.key) {
      return this._sendRemoteKey(payload.key, options.timeoutMs);
    }
    if (payload.type === 'NAV_TAB' && payload.tab) {
      return this.broadcast({
        type: 'NAV_TAB',
        tab: payload.tab,
        senderDeviceId: this.deviceId,
        sessionId: this.session?.sessionId,
        targetDeviceId: this.session?.tvDeviceId,
        timestamp: Date.now()
      });
    }
    if (payload.type === 'PLAY_MEDIA' && payload.item) {
      return this.castMedia(payload.item, payload.options || {});
    }
    return false;
  }

  _sendRemoteKey(key, timeoutMs = 1500) {
    const commandId = `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sent = this.broadcast({
      type: 'REMOTE_COMMAND',
      command: key,
      commandId,
      sessionId: this.session?.sessionId,
      senderDeviceId: this.deviceId,
      targetDeviceId: this.session?.tvDeviceId,
      timestamp: Date.now()
    });
    if (!sent) return false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        resolve({ commandId, status: 'SENT' });
      }, timeoutMs);
      this.pendingCommands.set(commandId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); resolve({ commandId, status: 'REJECTED', reason: err?.message }); },
        timer
      });
    });
  }

  generateNewRoomCode() {
    this.forgetPairing();
    const newCode = generateShortCode(4);
    this.roomCode = newCode;
    setStoredRoomCode(newCode);
    this.connect();
    return newCode;
  }

  joinRoom(targetRoomCode) {
    const clean = setStoredRoomCode(targetRoomCode);
    this.roomCode = clean;
    this.session = null;
    setStoredSession(null);
    this.connect();
    return clean;
  }

  requestPairing() {
    if (!this.roomCode) throw new Error('Enter a TV Room Code first');
    this.setConnectionState(CONNECTION_STATES.PAIRING);

    clearInterval(this.pairingInterval);

    const sendRequest = () => {
      const payload = {
        type: 'PAIR_REQUEST',
        room: this.roomCode,
        phoneDeviceId: this.deviceId,
        phoneName: this.deviceName,
        timestamp: Date.now()
      };
      this.broadcast(payload);
    };

    sendRequest();

    // Active retry loop every 1.5s for 15s until paired
    let attempts = 0;
    this.pairingInterval = setInterval(() => {
      attempts++;
      if (this.session || this.connectionState === CONNECTION_STATES.CONNECTED || attempts > 10) {
        clearInterval(this.pairingInterval);
        this.pairingInterval = null;
      } else {
        sendRequest();
      }
    }, 1500);

    return Promise.resolve(true);
  }

  forgetPairing() {
    clearInterval(this.pairingInterval);
    clearInterval(this.heartbeatTimer);
    if (this.session) {
      this.broadcast({
        type: 'UNPAIR',
        sessionId: this.session.sessionId,
        senderDeviceId: this.deviceId,
        timestamp: Date.now()
      });
    }
    this.session = null;
    setStoredSession(null);
    this.setConnectionState(CONNECTION_STATES.PAIRING);
  }

  sendRemoteCommand(commandName, timeoutMs = 3000) {
    if (!this.roomCode) {
      return Promise.reject(new Error('TV_NOT_CONNECTED'));
    }

    if (!this.ws || this.connectionState === CONNECTION_STATES.DISCONNECTED) {
      this.connect();
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      type: 'REMOTE_COMMAND',
      command: commandName,
      commandId,
      sessionId: this.session?.sessionId,
      senderDeviceId: this.deviceId,
      targetDeviceId: this.session?.tvDeviceId,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        resolve({ commandId, status: 'SENT' });
      }, timeoutMs);

      this.pendingCommands.set(commandId, { resolve, reject, timer });
      const sent = this.broadcast(payload);
      if (!sent) {
        clearTimeout(timer);
        this.pendingCommands.delete(commandId);
        reject(new Error('NETWORK_OFFLINE'));
      }
    });
  }

  castMedia(mediaItem, options = {}) {
    if (!this.roomCode) {
      return Promise.reject(new Error('ENTER_ROOM_CODE'));
    }

    if (!this.ws || this.connectionState === CONNECTION_STATES.DISCONNECTED) {
      this.connect();
    }

    const commandId = `cast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const isLive = Boolean(mediaItem.is_live || mediaItem.type === 'live' || mediaItem.year === 'LIVE');
    const selectedSource = options.server || mediaItem.players?.[0] || mediaItem.player?.[0] || (mediaItem.url ? { url: mediaItem.url, source: 'hls' } : null);

    const payload = {
      type: 'PLAY_MEDIA',
      commandId,
      item: mediaItem,
      server: selectedSource,
      contentType: isLive ? 'live' : (mediaItem.type || 'movie'),
      contentId: mediaItem.id || mediaItem.tmdb_id || null,
      channelId: isLive ? (mediaItem.id || mediaItem.title) : null,
      tmdbId: mediaItem.tmdb_id || null,
      providerId: mediaItem.provider || null,
      title: mediaItem.title_en || mediaItem.title || mediaItem.name || 'Video',
      logo: mediaItem.logo || mediaItem.poster_url || mediaItem.poster || '',
      poster: mediaItem.poster_url || mediaItem.poster || '',
      backdrop: mediaItem.backdrop_url || mediaItem.poster_url || '',
      sourceId: selectedSource?.id || 'source-1',
      sourceUrl: selectedSource?.url || mediaItem.url || '',
      streamType: selectedSource?.source || selectedSource?.type || 'hls',
      headers: selectedSource?.headers || {},
      startPosition: options.startPosition || 0,
      audioTrack: options.audioTrack || null,
      subtitleTrack: options.subtitleTrack || null,
      isLive,
      seriesId: mediaItem.series_id || null,
      seasonNumber: mediaItem.season_number || null,
      seasonId: mediaItem.season_id || null,
      episodeNumber: mediaItem.episode_number || null,
      episodeId: mediaItem.episode_id || null,
      sessionId: this.session?.sessionId,
      senderDeviceId: this.deviceId,
      targetDeviceId: this.session?.tvDeviceId,
      timestamp: Date.now()
    };

    const sent = this.broadcast(payload);
    return sent ? Promise.resolve(commandId) : Promise.reject(new Error('NETWORK_OFFLINE'));
  }

  reportCastStatus(commandId, status, details = {}) {
    const payload = {
      type: 'CAST_STATUS',
      commandId,
      status,
      title: details.title || '',
      position: details.position || 0,
      duration: details.duration || 0,
      sessionId: this.session?.sessionId,
      senderDeviceId: this.deviceId,
      targetDeviceId: this.session?.phoneDeviceId,
      timestamp: Date.now()
    };
    return this.broadcast(payload);
  }

  broadcast(payload) {
    if (!payload?.type || !ALLOWED_MESSAGE_TYPES.has(payload.type)) {
      return false;
    }

    const msgId = `${this.deviceId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const packet = {
      ...payload,
      msgId,
      sender: this.deviceId,
      room: this.roomCode
    };

    this.seenMsgIds.add(msgId);
    storageSet(STORAGE_KEYS.LAST_CMD, JSON.stringify(packet));

    // 1. Post to BroadcastChannel for instant local cross-tab relay
    if (this.bc) {
      try {
        this.bc.postMessage(packet);
      } catch {}
    }

    // 2. Publish via WebSocket MQTT (Zero-Latency, No Rate Limits)
    const topic = this.getTopic();
    if (this.ws && this.mqttConnected && topic) {
      try {
        const pubPacket = encodeMqttPublish(topic, packet);
        this.ws.send(pubPacket);
      } catch {}
    }

    // 3. Fallback POST to ntfy.sh mirror
    if (topic && typeof fetch !== 'undefined') {
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(packet)
      }).catch(() => {});
    }

    return true;
  }

  handleIncoming(msg) {
    if (!msg || typeof msg !== 'object' || !msg.type) return;
    if (msg.sender === this.deviceId) return;
    if (msg.room !== this.roomCode) return;

    if (msg.msgId && this.seenMsgIds.has(msg.msgId)) return;
    if (msg.timestamp && Math.abs(Date.now() - Number(msg.timestamp)) > 60000) return;

    if (msg.msgId) {
      this.seenMsgIds.add(msg.msgId);
      if (this.seenMsgIds.size > 200) {
        this.seenMsgIds = new Set([...this.seenMsgIds].slice(-100));
      }
    }

    if (this.role === 'tv' && msg.type === 'PAIR_REQUEST') {
      const sessionId = `SES-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const newSession = {
        sessionId,
        phoneDeviceId: msg.phoneDeviceId,
        phoneName: msg.phoneName || 'AJO Phone',
        tvDeviceId: this.deviceId,
        tvName: this.deviceName,
        pairedAt: Date.now()
      };
      this.session = newSession;
      setStoredSession(newSession);
      this.setConnectionState(CONNECTION_STATES.CONNECTED);

      this.broadcast({
        type: 'PAIR_ACCEPTED',
        room: this.roomCode,
        tvDeviceId: this.deviceId,
        tvName: this.deviceName,
        phoneDeviceId: msg.phoneDeviceId,
        sessionId,
        timestamp: Date.now()
      });
      return;
    }

    if (this.role === 'phone' && msg.type === 'PAIR_ACCEPTED') {
      if (msg.phoneDeviceId === this.deviceId) {
        const newSession = {
          sessionId: msg.sessionId,
          tvDeviceId: msg.tvDeviceId,
          tvName: msg.tvName || 'AJO Smart TV',
          room: msg.room,
          pairedAt: Date.now()
        };
        this.session = newSession;
        setStoredSession(newSession);
        this.setConnectionState(CONNECTION_STATES.CONNECTED);

        this.broadcast({
          type: 'PAIR_CONFIRMED',
          sessionId: msg.sessionId,
          senderDeviceId: this.deviceId,
          targetDeviceId: msg.tvDeviceId,
          timestamp: Date.now()
        });
      }
      return;
    }

    if (this.role === 'tv' && msg.type === 'PAIR_CONFIRMED') {
      if (this.session && msg.sessionId === this.session.sessionId) {
        this.setConnectionState(CONNECTION_STATES.CONNECTED);
      }
      return;
    }

    if (msg.type === 'UNPAIR') {
      if (this.session && msg.sessionId === this.session.sessionId) {
        this.session = null;
        setStoredSession(null);
        this.setConnectionState(CONNECTION_STATES.PAIRING);
      }
      return;
    }

    if (this.role === 'phone' && msg.type === 'COMMAND_RESULT') {
      const pending = this.pendingCommands.get(msg.commandId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(msg.commandId);
        if (msg.status === 'ACCEPTED') {
          pending.resolve(msg);
        } else {
          pending.reject(new Error(msg.reason || 'COMMAND_REJECTED'));
        }
      }
      return;
    }

    if (this.role === 'tv' && msg.type === 'REMOTE_COMMAND') {
      const isApproved = this.session && (msg.sessionId === this.session.sessionId || msg.senderDeviceId === this.session.phoneDeviceId);
      if (!isApproved) {
        this.broadcast({
          type: 'COMMAND_RESULT',
          commandId: msg.commandId,
          status: 'REJECTED',
          reason: 'UNAPPROVED_DEVICE',
          timestamp: Date.now()
        });
        return;
      }

      this.broadcast({
        type: 'COMMAND_RESULT',
        commandId: msg.commandId,
        status: 'ACCEPTED',
        reason: null,
        timestamp: Date.now()
      });
    }

    for (const listener of this.listeners) {
      try { listener(msg); } catch (e) {}
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  subscribeState(callback) {
    this.stateListeners.add(callback);
    callback({
      state: this.connectionState,
      roomCode: this.roomCode,
      deviceId: this.deviceId,
      session: this.session,
      isPaired: Boolean(this.session?.sessionId)
    });
    return () => this.stateListeners.delete(callback);
  }

  destroy() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageHandler);
    }
    this.listeners.clear();
    this.stateListeners.clear();
    this.pendingCommands.clear();
  }
}

// Global Singleton instances per app context.
//
// ROLE DETECTION (bug fix): the old check (window.location.port === '5173')
// never matched inside a built Capacitor APK, so BOTH phone and TV apps
// instantiated as 'phone' and cast messages were silently ignored by both
// sides. The reliable signal is the Capacitor server origin: the TV app runs
// from https://localhost via Capacitor's androidScheme, and we also honor an
// explicit override set at runtime (window.AJO_CAST_ROLE) plus the leanback
// UI-mode flag which is always present on Android TV / Fire TV devices.
function detectCastRole() {
  try {
    if (typeof window === 'undefined') return 'phone';
    if (window.AJO_CAST_ROLE === 'tv' || window.AJO_CAST_ROLE === 'phone') return window.AJO_CAST_ROLE;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(device-can-hover: none) and (display-mode: tv)').matches) return 'tv';
    // Leanback / television UI mode — true on every Android TV & Fire TV
    if (typeof window.matchMedia === 'function' && window.matchMedia('(.d-pad)').matches) return 'tv';
    const ua = String(navigator.userAgent || '').toLowerCase();
    if (/aft[a-z0-9]+|fire\s?tv|firetv|android\s?tv|google\s?tv|leanback/.test(ua)) return 'tv';
  } catch {}
  return 'phone';
}

export const castEngine = new CastSyncEngine({ role: detectCastRole() });

