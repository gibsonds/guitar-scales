// Cloud sync layer for the practice diary. Mirrors NotationApp's
// src/lib/song-cloud.ts patterns adapted for the simpler last-write-wins
// session model.
//
// Reads window.SCALES_CONFIG.API_BASE (set by config.js). When absent,
// CLOUD_ENABLED is false and every cloud op is a no-op — diary stays
// local-only with no errors.
//
// Lifecycle events on window: diary-cloud-{saving,saved,offline,error}.

(function () {
  'use strict';

  const DEVICE_ID_KEY = 'gse_device_id_v1';
  const QUEUE_KEY = 'gse_diary_cloud_queue_v1';
  const TIMEOUT_MS = 8000;

  const config = (typeof window !== 'undefined' && window.SCALES_CONFIG) || {};
  const API_BASE = (config.API_BASE || '').replace(/\/$/, '');
  const CLOUD_ENABLED = !!API_BASE;

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function getDeviceId() {
    if (typeof window === 'undefined') return '';
    let id = null;
    try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (_) {}
    if (!id) {
      id = newId();
      try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
    }
    return id;
  }

  function setDeviceId(id) {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (_) {}
  }

  function fire(name, detail) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('diary-cloud-' + name, { detail: detail || null }));
  }

  // Fetch wrapper. Throws TransientError (network down, 5xx, timeout) or
  // a plain Error (4xx, terminal) — caller decides whether to queue.
  async function apiFetch(path, init) {
    if (!CLOUD_ENABLED) {
      const e = new Error('cloud disabled');
      e.terminal = true;
      throw e;
    }
    init = init || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_BASE + path, {
        method: init.method || 'GET',
        signal: ctrl.signal,
        headers: Object.assign(
          { 'content-type': 'application/json', 'x-device-id': getDeviceId() },
          init.headers || {}
        ),
        body: init.body
      });
      const text = await res.text();
      let data = {};
      if (text) {
        try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
      }
      if (res.status >= 500) {
        const e = new Error('HTTP ' + res.status);
        e.transient = true;
        throw e;
      }
      if (!res.ok) {
        const e = new Error(data.error || ('HTTP ' + res.status));
        e.terminal = true;
        throw e;
      }
      return data;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const e = new Error('timeout');
        e.transient = true;
        throw e;
      }
      // Browser network errors typically surface as TypeError "Failed to fetch"
      if (err && /Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) {
        const e = new Error('network: ' + err.message);
        e.transient = true;
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Offline queue ──────────────────────────────────────────────
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (_) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (_) {}
  }
  function enqueue(op) {
    const q = getQueue();
    q.push(Object.assign({ queuedAt: Date.now() }, op));
    saveQueue(q);
  }
  function getQueueSize() { return getQueue().length; }

  let draining = false;
  async function drainQueue() {
    if (!CLOUD_ENABLED || draining) return;
    draining = true;
    try {
      let q = getQueue();
      const remaining = [];
      for (const op of q) {
        try {
          if (op.kind === 'put') {
            await apiFetch('/sessions/' + encodeURIComponent(op.id), {
              method: 'PUT',
              body: JSON.stringify(op.session)
            });
          } else if (op.kind === 'delete') {
            await apiFetch('/sessions/' + encodeURIComponent(op.id), { method: 'DELETE' });
          } else if (op.kind === 'clear') {
            await apiFetch('/sessions', { method: 'DELETE' });
          }
        } catch (err) {
          if (err && err.transient) {
            remaining.push(op);
            // Stop draining on first transient — saves repeated timeouts
            // on a flaky connection. We'll try again on the next op.
            break;
          }
          // Terminal — drop the op (it would never succeed)
          console.warn('Diary cloud: dropping op', op, err);
        }
      }
      // Anything we didn't process stays queued
      const idx = q.length - remaining.length;
      saveQueue(remaining.concat(q.slice(idx)).filter(Boolean));
    } finally {
      draining = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────
  async function cloudGetSessions() {
    if (!CLOUD_ENABLED) return null;
    const data = await apiFetch('/sessions');
    return Array.isArray(data.sessions) ? data.sessions : [];
  }

  async function cloudPutSession(session) {
    if (!CLOUD_ENABLED) return;
    if (!session || !session.id) throw new Error('session.id required');
    fire('saving');
    try {
      await apiFetch('/sessions/' + encodeURIComponent(session.id), {
        method: 'PUT',
        body: JSON.stringify(session)
      });
      drainQueue().catch(function () {});
      fire('saved', { ts: Date.now() });
    } catch (err) {
      if (err && err.transient) {
        enqueue({ kind: 'put', id: session.id, session: session });
        fire('offline');
        return;
      }
      fire('error', { message: (err && err.message) || 'unknown' });
      throw err;
    }
  }

  async function cloudDeleteSession(id) {
    if (!CLOUD_ENABLED) return;
    fire('saving');
    try {
      await apiFetch('/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
      drainQueue().catch(function () {});
      fire('saved', { ts: Date.now() });
    } catch (err) {
      if (err && err.transient) {
        enqueue({ kind: 'delete', id: id });
        fire('offline');
        return;
      }
      fire('error', { message: (err && err.message) || 'unknown' });
      throw err;
    }
  }

  async function cloudClearAll() {
    if (!CLOUD_ENABLED) return;
    fire('saving');
    // Clearing supersedes any queued put/delete ops — drop them.
    saveQueue([]);
    try {
      await apiFetch('/sessions', { method: 'DELETE' });
      fire('saved', { ts: Date.now() });
    } catch (err) {
      if (err && err.transient) {
        enqueue({ kind: 'clear' });
        fire('offline');
        return;
      }
      fire('error', { message: (err && err.message) || 'unknown' });
      throw err;
    }
  }

  async function cloudGetDeviceInfo() {
    if (!CLOUD_ENABLED) return null;
    return apiFetch('/devices/me');
  }

  async function cloudSetDeviceLabel(label) {
    if (!CLOUD_ENABLED) return null;
    return apiFetch('/devices/me', {
      method: 'PUT',
      body: JSON.stringify({ label: String(label || '').slice(0, 60) })
    });
  }

  // Drain when network returns
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { drainQueue().catch(function () {}); });
  }

  window.DiaryCloud = {
    CLOUD_ENABLED: CLOUD_ENABLED,
    API_BASE: API_BASE,
    newId: newId,
    getDeviceId: getDeviceId,
    setDeviceId: setDeviceId,
    cloudGetSessions: cloudGetSessions,
    cloudPutSession: cloudPutSession,
    cloudDeleteSession: cloudDeleteSession,
    cloudClearAll: cloudClearAll,
    cloudGetDeviceInfo: cloudGetDeviceInfo,
    cloudSetDeviceLabel: cloudSetDeviceLabel,
    drainQueue: drainQueue,
    getQueueSize: getQueueSize
  };
})();
