/**
 * AJO Cross-Device Cast & Remote Synchronization Engine
 * Ultra-resilient, multi-transport real-time bridge:
 * - High-speed WebSocket relay (wss://ntfy.sh)
 * - Server-Sent Events (SSE fallback)
 * - BroadcastChannel (local network / same origin)
 * - LocalStorage StorageEvent
 * - Intelligent message deduplication & auto-reconnect
 */

const STORAGE_KEY_DEVICE_ID = 'ajo_device_id';
const STORAGE_KEY_ROOM_ID = 'ajo_cast_room_id';
const DEFAULT_ROOM = 'AJO-7788';

export function getDeviceId() {
  let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
  }
  return id;
}

export function getPairingRoom() {
  return localStorage.getItem(STORAGE_KEY_ROOM_ID) || DEFAULT_ROOM;
}

export function setPairingRoom(roomId) {
  const clean = (roomId || DEFAULT_ROOM).trim().toUpperCase();
  localStorage.setItem(STORAGE_KEY_ROOM_ID, clean);
  return clean;
}

export function sanitizeCastItem(item) {
  if (!item) return null;
  return {
    id: item.id || item.movie_id || item.tmdb_id,
    tmdb_id: item.tmdb_id,
    title: item.title_en || item.title || item.name,
    title_en: item.title_en || item.title || item.name,
    poster_url: item.poster_url || item.poster || item.logo || '',
    backdrop_url: item.backdrop_url || item.poster_url || item.poster || '',
    type: item.type || 'movie',
    category: item.category || 'Movies',
    year: item.year || '2026',
    url: item.url || '',
    is_live: !!(item.is_live || item.type === 'live' || item.year === 'LIVE' || item.category === 'Live TV' || item.category === 'Live Channels' || item.category === 'Sports' || item.category === 'News'),
    players: Array.isArray(item.players) ? item.players.slice(0, 3).map(p => ({
      name: p.name || p.translator,
      url: p.url,
      source: p.source
    })) : []
  };
}

class CastSyncService {
  constructor() {
    this.roomId = getPairingRoom();
    this.deviceId = getDeviceId();
    this.listeners = new Set();
    this.seenMsgIds = new Set();
    this.bc = null;
    this.ws = null;
    this.es = null;
    this.pollTimer = null;
    this.lastPollTimestamp = Math.floor(Date.now() / 1000) - 10;
    this.isDestroyed = false;

    this.initBroadcastChannel();
    this.initRealtimeConnections();
    this.initStorageListener();
  }

  initBroadcastChannel() {
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        if (this.bc) this.bc.close();
        this.bc = new BroadcastChannel(`ajo_cast_${this.roomId}`);
        this.bc.onmessage = (event) => {
          if (event.data) this.handleIncomingMessage(event.data);
        };
      }
    } catch (e) {
      console.warn('[CastSync] BroadcastChannel init:', e);
    }
  }

  initStorageListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (e) => {
      if (e.key === 'ajo_cast_last_cmd' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data) this.handleIncomingMessage(data);
        } catch (_) {}
      }
    });
  }

  initRealtimeConnections() {
    this.connectWebSocket();
    this.connectEventSource();
    this.startPollingFallback();
  }

  connectWebSocket() {
    try {
      if (typeof WebSocket === 'undefined') return;
      if (this.ws) {
        try { this.ws.close(); } catch (_) {}
      }

      const wsUrl = `wss://ntfy.sh/ajo_cast_${this.roomId}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === 'message') {
            const parsed = await this.parseRawData(data);
            if (parsed) this.handleIncomingMessage(parsed);
          }
        } catch (_) {}
      };

      this.ws.onclose = () => {
        if (!this.isDestroyed) {
          setTimeout(() => this.connectWebSocket(), 4000);
        }
      };

      this.ws.onerror = () => {
        try { this.ws.close(); } catch (_) {}
      };
    } catch (e) {
      console.warn('[CastSync] WS connection notice:', e);
    }
  }

  connectEventSource() {
    try {
      if (typeof EventSource === 'undefined') return;
      if (this.es) {
        try { this.es.close(); } catch (_) {}
      }

      const sseUrl = `https://ntfy.sh/ajo_cast_${this.roomId}/sse`;
      this.es = new EventSource(sseUrl);

      this.es.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.event === 'message') {
            const parsed = await this.parseRawData(data);
            if (parsed) this.handleIncomingMessage(parsed);
          }
        } catch (_) {}
      };

      this.es.onerror = () => {
        if (this.es) {
          try { this.es.close(); } catch (_) {}
          this.es = null;
        }
        if (!this.isDestroyed) {
          setTimeout(() => this.connectEventSource(), 6000);
        }
      };
    } catch (e) {
      console.warn('[CastSync] SSE connection notice:', e);
    }
  }

  startPollingFallback() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      try {
        const since = this.lastPollTimestamp;
        const res = await fetch(`https://ntfy.sh/ajo_cast_${this.roomId}/json?poll=1&since=${since}`);
        if (!res.ok) return;
        const text = await res.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.time) this.lastPollTimestamp = data.time;
            if (data.event === 'message') {
              const parsed = await this.parseRawData(data);
              if (parsed) this.handleIncomingMessage(parsed);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }, 3500);
  }

  async parseRawData(data) {
    if (!data) return null;
    if (data.attachment && data.attachment.url && (!data.message || data.message.includes('attachment.json'))) {
      try {
        const res = await fetch(data.attachment.url);
        return await res.json();
      } catch (_) {}
    }
    if (data.message) {
      try {
        return typeof data.message === 'string' ? JSON.parse(data.message) : data.message;
      } catch (_) {
        return data.message;
      }
    }
    return data;
  }

  updateRoom(newRoomId) {
    this.roomId = setPairingRoom(newRoomId);
    this.initBroadcastChannel();
    this.initRealtimeConnections();
  }

  sendToTV(payload) {
    const timestamp = Date.now();
    const msgId = `${this.deviceId}_${timestamp}_${Math.random().toString(36).substring(2, 6)}`;
    
    let sanitizedPayload = { ...payload };
    if (payload.item) {
      sanitizedPayload.item = sanitizeCastItem(payload.item);
    }

    const message = {
      ...sanitizedPayload,
      msg_id: msgId,
      sender: this.deviceId,
      room: this.roomId,
      timestamp: timestamp
    };

    const rawJson = JSON.stringify(message);

    // Mark as seen by self
    this.seenMsgIds.add(msgId);

    // 1. BroadcastChannel for local / intra-app
    if (this.bc) {
      try { this.bc.postMessage(message); } catch (_) {}
    }

    // 2. LocalStorage StorageEvent
    try {
      localStorage.setItem('ajo_cast_last_cmd', rawJson);
    } catch (_) {}

    // 3. Cloud Relay (POST to ntfy.sh with compact JSON body)
    try {
      fetch(`https://ntfy.sh/ajo_cast_${this.roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: rawJson
      }).catch(() => {});
    } catch (_) {}
  }

  handleIncomingMessage(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'object') return;
    
    // Ignore self messages
    if (rawMessage.sender === this.deviceId) return;
    
    // Verify room
    if (rawMessage.room && rawMessage.room !== this.roomId) return;

    // Deduplication check
    const id = rawMessage.msg_id || `${rawMessage.sender}_${rawMessage.timestamp}_${rawMessage.type}`;
    if (this.seenMsgIds.has(id)) return;
    
    this.seenMsgIds.add(id);
    if (this.seenMsgIds.size > 150) {
      const arr = Array.from(this.seenMsgIds);
      this.seenMsgIds = new Set(arr.slice(arr.length - 75));
    }

    this.notifyListeners(rawMessage);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  notifyListeners(data) {
    this.listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.warn('[CastSync] Callback error:', e);
      }
    });
  }
}

export const castEngine = new CastSyncService();
