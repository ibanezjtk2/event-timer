/* Shared UI helpers: element builder, icons, toast, two-step confirm, i18n. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- i18n
  // German is the source language; English translations below.
  const EN = {
    'Steuerung': 'Control', 'Display': 'Display', 'Ablaufplan': 'Run of show', 'Uhr': 'Clock',
    'Verbunden': 'Connected', 'Getrennt – verbinde neu …': 'Disconnected – reconnecting …', 'Verbinde …': 'Connecting …',
    'Nur dieses Gerät': 'This device only', 'Veranstaltung benennen': 'Name the event',
    'Blackout': 'Blackout', 'Einstellungen': 'Settings', 'Timer hinzufügen': 'Add timer',
    'Start': 'Start', 'Pause': 'Pause', 'Weiter': 'Resume', 'Zurücksetzen': 'Reset',
    'Läuft': 'Running', 'Pausiert': 'Paused', 'Bereit': 'Ready', 'Abgelaufen': 'Expired', 'Überzogen': 'Over time',
    'Countdown': 'Countdown', 'Hochzählen': 'Count up', 'Bis Uhrzeit': 'Until time',
    'Dauer': 'Duration', 'Setzen': 'Set', 'Setzen und starten': 'Set and start', 'Minuten oder mm:ss': 'Minutes or mm:ss',
    'Zielzeit': 'Target time', 'Zielzeit setzen': 'Set target time', 'Optionales Limit': 'Optional limit',
    'Nachricht an die Bühne': 'Message to the stage', 'Senden': 'Send', 'Blinken': 'Flash', 'Ausblenden': 'Hide', 'Einblenden': 'Show', 'Löschen': 'Clear',
    'Nachricht eingeben': 'Type a message', 'Keine Nachricht auf dem Display.': 'No message on the display.',
    'Überziehen erlauben': 'Allow overtime', 'Vorwarnung ab': 'Warning from', 'Kritisch ab': 'Critical from', 'Design': 'Design', 'Min.': 'min',
    'Timer entfernen': 'Remove timer', 'Sicher? Nochmal tippen': 'Sure? Tap again',
    'Display-Link': 'Display link', 'Kopieren': 'Copy', 'Öffnen': 'Open', 'Kopiert': 'Copied',
    'Planbeginn': 'Planned start', 'Steuert': 'Drives', 'Automatisch starten': 'Start automatically',
    'Abweichung': 'Drift', 'Ende ca.': 'Ends approx.', 'Geplant': 'Planned', 'Im Plan': 'On schedule', 'hinter Plan': 'behind', 'vor Plan': 'ahead',
    'Slot hinzufügen': 'Add slot', 'Titel': 'Title', 'Sprecher*in': 'Speaker', 'Hinzufügen': 'Add', 'Speichern': 'Save', 'Abbrechen': 'Cancel',
    'Importieren': 'Import', 'Als Text kopieren': 'Copy as text', 'Zurück': 'Back', 'Ablauf starten': 'Start the show', 'Nächster Slot': 'Next slot',
    'Ablauf beendet': 'Show finished', 'Ablauf zurücksetzen': 'Reset run of show', 'läuft': 'live', 'als Nächstes': 'up next',
    'Noch kein Ablauf. Füge den ersten Slot hinzu oder importiere eine Liste.': 'No run of show yet. Add the first slot or import a list.',
    'Eine Zeile pro Slot: Titel; Sprecher*in; Minuten. Auch direkt aus Excel kopierbar.': 'One line per slot: title; speaker; minutes. Pasting from Excel works too.',
    'Ersetzt den bisherigen Ablauf.': 'Replaces the current run of show.',
    'Laden': 'Load', 'Hoch': 'Up', 'Runter': 'Down', 'Bearbeiten': 'Edit', 'Entfernen': 'Remove',
    'Verbinden': 'Connect', 'Nachrichten': 'Messages', 'Sicherheit': 'Security', 'Companion': 'Companion', 'Mehr': 'More',
    'Mit dem Handy scannen, um zu steuern oder anzuzeigen.': 'Scan with a phone to control or display.',
    'Ablauf-Display': 'Run-of-show display', 'von': 'of',
    'Link für Displays bauen': 'Build a display link', 'Ansicht': 'Layout', 'Vollbild-Timer': 'Full-screen timer', 'Uhrzeit groß': 'Large clock', 'Bauchbinde (Keying)': 'Lower third (keying)', 'Ablauf (Backstage)': 'Run of show (backstage)',
    'Transparenter Hintergrund': 'Transparent background',
    'Klappt der Link nicht? Beim ersten Start fragt Windows nach der Firewall – „Private Netzwerke“ erlauben.': 'Link not working? On first start Windows asks about the firewall – allow "private networks".',
    'Display in neuem Fenster': 'Display in new window', 'Bühnenansicht hier': 'Stage view here',
    'Standalone-Modus: Alles läuft in diesem Browser. Displays im selben Browser (neues Fenster, z. B. auf dem zweiten Bildschirm) laufen automatisch mit.': 'Standalone mode: everything runs in this browser. Displays in the same browser (a new window, e.g. on a second screen) follow automatically.',
    'Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.': 'For several devices, run the Event Timer program on one computer.',
    'Design wählen': 'Choose design', 'Name': 'Name', 'Hintergrund': 'Background', 'Ziffern': 'Digits', 'Fortschritt': 'Progress', 'Warnung': 'Warning', 'Kritisch': 'Critical',
    'Überzogen Hintergrund': 'Over time background', 'Überzogen Ziffern': 'Over time digits', 'Nachricht Text': 'Message text', 'Nachricht Fläche': 'Message box',
    'Schrift': 'Typeface', 'Stärke': 'Weight', 'Fläche': 'Fill', 'Einfarbig': 'Solid', 'Leuchten': 'Glow', 'Transparent': 'Transparent',
    'Fortschrittsbalken': 'Progress bar', 'Uhrzeit': 'Clock', 'Titel und Sprecher*in': 'Title and speaker', 'Nächster Slot anzeigen': 'Show next slot', 'Hinweise': 'Notices',
    'Text bei Warnung': 'Warning text', 'Text bei Ablauf': 'Expired text', 'Text beim Überziehen': 'Over time text',
    'Als neues Design speichern': 'Save as new design', 'Design löschen': 'Delete design', 'Für diesen Timer verwenden': 'Use for this timer',
    'Eingebaute Designs bleiben unverändert – Änderungen werden als neues Design gespeichert.': 'Built-in designs stay unchanged – edits are saved as a new design.',
    'Schnellnachrichten': 'Quick messages', 'Eine pro Zeile, höchstens 12.': 'One per line, up to 12.',
    'Steuerungs-PIN': 'Control PIN', 'PIN setzen': 'Set PIN', 'PIN entfernen': 'Remove PIN',
    'Mit PIN dürfen nur Geräte steuern, die sie kennen. Displays brauchen nie eine PIN; am Rechner selbst ist keine nötig.': 'With a PIN, only devices that know it can control. Displays never need one; the host computer itself doesn\'t either.',
    'Steuerung ist mit PIN geschützt.': 'Control is protected by a PIN.', 'Keine PIN gesetzt – jedes Gerät im Netzwerk kann steuern.': 'No PIN set – every device on the network can control.',
    'PIN im Standalone-Modus nicht nötig.': 'No PIN needed in standalone mode.',
    'Steuerung gesperrt': 'Control locked', 'PIN eingeben': 'Enter PIN', 'Entsperren': 'Unlock', 'Nur ansehen': 'View only', 'Falsche PIN': 'Wrong PIN',
    'Nur-Ansicht: Zum Steuern PIN eingeben.': 'View only: enter the PIN to control.',
    'Bitfocus Companion: Modul „Generic HTTP“, Aktion GET auf diese Adressen.': 'Bitfocus Companion: use the "Generic HTTP" module with GET requests to these URLs.',
    'Sprache': 'Language', 'Tastenkürzel': 'Keyboard shortcuts', 'Daten': 'Data', 'Version': 'Version',
    'Leertaste': 'Space', 'Start/Pause': 'Start/pause', 'Timer wählen': 'Select timer', 'Nächster Slot im Ablauf': 'Next slot',
    'Show zurücksetzen': 'Reset show', 'Löscht alle Timer, den Ablauf und eigene Designs in diesem Browser.': 'Deletes all timers, the run of show and custom designs in this browser.',
    'Danach': 'Next', 'bis': 'until', 'Displays': 'displays', 'Display verbunden': 'display connected', 'Displays verbunden': 'displays connected',
    'Bühnenansicht verlassen': 'Leave stage view', 'Vollbild': 'Full screen',
    'Verbindung verloren – Zeit läuft lokal weiter': 'Connection lost – time keeps running locally',
    'Speichern im Browser nicht möglich (privates Fenster?). Nach dem Schließen ist alles weg.': 'Cannot save in this browser (private window?). Everything is lost after closing.',
    'Speicherort': 'Saved at', 'Speichert in diesem Browser.': 'Saved in this browser.',
    'Ablauf verbinden mit': 'Run of show drives', 'Dauer ändern': 'Change duration',
    'Live-Vorschau': 'Live preview', 'Keine Schnellnachrichten.': 'No quick messages.',
    'Eingebaut': 'Built-in', 'Eigenes': 'Custom', 'Uhrzeit (HH:MM)': 'Time (HH:MM)',
    'Display öffnen': 'Open display', 'Nur Uhrzeit': 'Clock only', 'Zeigt die Uhrzeit': 'Showing the time of day', 'Blinken beim Überziehen': 'Flash when over time', 'Neues Fenster wurde blockiert – nutze „Bühnenansicht hier“.': 'New window was blocked – use "Stage view here".', 'Start, Pause, Zeit, Nachrichten, Ablauf': 'Start, pause, time, messages, run of show', 'Diese Steuerung': 'This control page', 'Per Rechnername': 'By computer name',
  };

  let lang = 'de';
  try { lang = localStorage.getItem('et-lang') || ((navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en'); } catch { /* ignore */ }

  const t = s => (lang === 'en' && EN[s]) || s;
  const setLang = l => { lang = l; try { localStorage.setItem('et-lang', l); } catch { /* ignore */ } };

  // ------------------------------------------------------------- builder
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }

  const P = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    up: '<path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    down: '<path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V4H4v12h4" fill="none" stroke="currentColor" stroke-width="2"/>',
    next: '<path d="M5 5v14l10-7zM17 5h2.5v14H17z" fill="currentColor"/>',
    prev: '<path d="M19 5v14L9 12zM4.5 5H7v14H4.5z" fill="currentColor"/>',
    go: '<path d="M6 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  const icon = name => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = P[name] || '';
    return s;
  };

  // Brand mark: a cue light – three lamps, one lit.
  const brandSvg = '<svg class="brand-mark" viewBox="0 0 26 26" aria-hidden="true"><rect x="1" y="1" width="24" height="24" rx="6" fill="#2a3039" stroke="#363e49"/><circle cx="8" cy="13" r="3" fill="#3b434e"/><circle cx="13" cy="13" r="3" fill="#2fd47a"/><circle cx="18" cy="13" r="3" fill="#3b434e"/></svg>';

  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector('.toast');
    if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1600);
  }

  /** Destructive buttons need a second tap within 3 s. */
  function armed(btn, fn) {
    let timer = null;
    const label = btn.innerHTML;
    btn.addEventListener('click', () => {
      if (btn.dataset.armed === '1') { clearTimeout(timer); btn.dataset.armed = ''; btn.innerHTML = label; fn(); return; }
      btn.dataset.armed = '1';
      btn.textContent = t('Sicher? Nochmal tippen');
      timer = setTimeout(() => { btn.dataset.armed = ''; btn.innerHTML = label; }, 3000);
    });
    return btn;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast(t('Kopiert'));
  }

  root.ETUI = { h, icon, toast, armed, copy, t, setLang, get lang() { return lang; }, brandSvg, EN };
})(globalThis);
