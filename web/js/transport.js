/* SPDX-License-Identifier: GPL-3.0-or-later
   Copyright (C) 2026 Felix Spindler <f-spindler@pm.me> */
/*
 * Transport: where the state lives.
 *  - server:     WebSocket to the Event Timer program (multi-device)
 *  - standalone: engine runs in this browser tab, state in localStorage;
 *                display windows/tabs on the same device follow along
 */
(function (root) {
  'use strict';
  const E = root.ETEngine;

  function emitter() {
    const fns = new Set();
    return { on: fn => (fns.add(fn), () => fns.delete(fn)), emit: (...a) => fns.forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }) };
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ------------------------------------------------------------- server
  function serverTransport(role) {
    const ev = emitter();
    const authEv = emitter();
    let ws = null, state = null, meta = null, you = { canControl: false };
    let status = 'connecting', retry = 0, offset = 0, samples = [], pingTimer = null, everConnected = false;

    function send(obj) {
      if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
      return false;
    }
    function ping() { send({ type: 'ping', t0: Date.now() }); }

    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { schedule(); return; }
      ws.onopen = () => {
        retry = 0; status = 'online'; everConnected = true;
        send({ type: 'hello', role });
        const pin = session.get('et-pin');
        if (pin && role === 'control') send({ type: 'auth', pin });
        samples = [];
        [0, 150, 300, 450, 600].forEach(d => setTimeout(ping, d));
        clearInterval(pingTimer);
        pingTimer = setInterval(ping, 4000);
        ev.emit();
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'state') {
          state = m.state; meta = m.meta; you = m.you || you;
          if (!samples.length) offset = m.now - Date.now();
          ev.emit();
        } else if (m.type === 'pong') {
          const t1 = Date.now(), rtt = t1 - m.t0;
          samples.push({ rtt, off: m.now - (m.t0 + rtt / 2) });
          if (samples.length > 10) samples.shift();
          // the fastest round trip gives the most trustworthy offset
          offset = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).off;
        } else if (m.type === 'auth') {
          authEv.emit(m.ok, !!m.locked);
        } else if (m.type === 'error' && m.code === 'auth') {
          you = { canControl: false };
          authEv.emit(false);
          ev.emit();
        }
      };
      ws.onclose = () => { clearInterval(pingTimer); status = 'offline'; ev.emit(); schedule(); };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    }
    function schedule() { setTimeout(connect, Math.min(4000, 300 * 2 ** retry++)); }
    connect();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 0; connect(); }
    });

    return {
      mode: 'server',
      get state() { return state; },
      get meta() { return meta; },
      get status() { return everConnected ? status : 'connecting'; },
      canControl: () => Boolean(you.canControl),
      /** this browser runs on the same computer as Event Timer (may shut it down) */
      isLocal: () => Boolean(you.local),
      now: () => Date.now() + offset,
      act(a) {
        if (!you.canControl) return;
        if (send({ type: 'action', action: a }) && state) {
          // optimistic: show the result immediately, the server snapshot follows
          if (E.apply(state, a, Date.now() + offset)) ev.emit();
        }
      },
      auth(pin) { session.set('et-pin', pin); send({ type: 'auth', pin }); },
      setPin(pin) { session.set('et-pin', pin); send({ type: 'setPin', pin }); },
      setName(name) { send({ type: 'setName', name }); },
      /** stage → control room; allowed without control rights */
      request(text, from) { send({ type: 'action', action: { type: 'request.send', text, from } }); },
      /** presenter confirms talkback; allowed without control rights */
      talkAck(id) {
        const a = id ? { type: 'talkback.ack', talkbackId: id } : { type: 'talkback.ack' };
        if (send({ type: 'action', action: a }) && state && E.apply(state, a, Date.now() + offset)) ev.emit();
      },
      setPort80(on) { send({ type: 'setPort80', on: Boolean(on) }); },
      onAuth: authEv.on,
      subscribe: ev.on,
    };
  }

  // --------------------------------------------------------- standalone
  const KEY = 'event-timer-standalone-v1';

  function localTransport(role) {
    const ev = emitter();
    let state = null;
    const children = new Set();
    let storageOk = true;

    function load() {
      const raw = store.get(KEY);
      if (!raw) return null;
      try { const s = JSON.parse(raw); return s && Array.isArray(s.timers) ? E.normalize(s) : null; } catch { return null; }
    }
    state = load();
    const isChild = role === 'display' && window.opener && window.opener !== window;
    if (!state && !isChild) { state = E.defaultState(); storageOk = store.set(KEY, JSON.stringify(state)); }

    function pushToChildren() {
      for (const w of children) {
        try { if (w.closed) children.delete(w); else w.postMessage({ et: 'state', state }, '*'); } catch { children.delete(w); }
      }
    }
    window.addEventListener('message', e => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.et === 'hello' && e.source && state) { children.add(e.source); e.source.postMessage({ et: 'state', state }, '*'); }
      if (d.et === 'state' && d.state && role === 'display') { state = E.normalize(d.state); ev.emit(); }
    });
    window.addEventListener('storage', e => {
      if (e.key !== KEY || !e.newValue) return;
      try { state = E.normalize(JSON.parse(e.newValue)); ev.emit(); } catch { /* ignore */ }
    });
    if (isChild) { try { window.opener.postMessage({ et: 'hello' }, '*'); } catch { /* ignore */ } }

    return {
      mode: 'standalone',
      get state() { return state; },
      get meta() { return { standalone: true, storageOk, displays: children.size }; },
      get status() { return state ? 'online' : 'connecting'; },
      canControl: () => role !== 'display',
      isLocal: () => false,
      now: () => Date.now(),
      act(a) {
        if (!state) return;
        if (E.apply(state, a, Date.now())) {
          storageOk = store.set(KEY, JSON.stringify(state));
          ev.emit();
          pushToChildren();
        }
      },
      openWindow(url) {
        const w = window.open(url, '_blank');
        if (w) children.add(w);
        return w;
      },
      replaceState(s) {
        state = s;
        storageOk = store.set(KEY, JSON.stringify(state));
        ev.emit();
        pushToChildren();
      },
      request(text, from) { this.act({ type: 'request.send', text, from }); },
      talkAck(id) { this.act(id ? { type: 'talkback.ack', talkbackId: id } : { type: 'talkback.ack' }); },
      auth() {}, setPin() {}, onAuth: () => () => {},
      subscribe: ev.on,
    };
  }

  function create(role) {
    const standalone = root.ET_STANDALONE === true || location.protocol === 'file:';
    return standalone ? localTransport(role) : serverTransport(role);
  }

  root.ETTransport = { create, store };
})(globalThis);
