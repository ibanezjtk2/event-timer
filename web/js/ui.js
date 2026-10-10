/* Shared UI helpers: element builder, icons, toast, two-step confirm, i18n. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- i18n
  // German is the source language; English translations below.
  const EN = {
    "Display": "display",
    "Ablaufplan": "Run of show",
    "Uhr": "Clock",
    "Verbunden": "Connected",
    "Verbinde …": "Connecting …",
    "Nur dieses Gerät": "This device only",
    "Timer hinzufügen": "Add timer",
    "Start": "Start",
    "Pause": "Pause",
    "Läuft": "Running",
    "Pausiert": "Paused",
    "Bereit": "Ready",
    "Abgelaufen": "Expired",
    "Countdown": "Countdown",
    "Dauer": "Duration",
    "Minuten oder mm:ss": "Minutes or mm:ss",
    "Zielzeit": "Target time",
    "Zielzeit setzen": "Set target time",
    "Senden": "Send",
    "Blinken": "Flash",
    "Ausblenden": "Hide",
    "Einblenden": "Show",
    "Löschen": "Clear",
    "Design": "Design",
    "Kopieren": "Copy",
    "Öffnen": "Open",
    "Kopiert": "Copied",
    "Planbeginn": "Planned start",
    "Im Plan": "On schedule",
    "hinter Plan": "behind plan",
    "vor Plan": "ahead of plan",
    "Titel": "Title",
    "Sprecher*in": "Speaker",
    "Hinzufügen": "Add",
    "Speichern": "Save",
    "Abbrechen": "Cancel",
    "Importieren": "Import",
    "Zurück": "Back",
    "Ablauf starten": "Start the show",
    "Ablauf beendet": "Show finished",
    "Ablauf zurücksetzen": "Reset run of show",
    "läuft": "live",
    "als Nächstes": "up next",
    "Ersetzt den bisherigen Ablauf.": "Replaces the current run of show.",
    "Laden": "Load",
    "Hoch": "Up",
    "Runter": "Down",
    "Bearbeiten": "Edit",
    "Entfernen": "Remove",
    "Sicherheit": "Security",
    "Companion": "Companion",
    "Mit dem Handy scannen, um zu steuern oder anzuzeigen.": "Scan with a phone to control or display.",
    "Ablauf-Display": "Run-of-show display",
    "von": "of",
    "Ansicht": "Layout",
    "Vollbild-Timer": "Full-screen timer",
    "Uhrzeit groß": "Large clock",
    "Bauchbinde (Keying)": "Lower third (keying)",
    "Ablauf (Backstage)": "Run of show (backstage)",
    "Transparenter Hintergrund": "Transparent background",
    "Klappt der Link nicht? Beim ersten Start fragt Windows nach der Firewall – „Private Netzwerke“ erlauben.": "Link not working? On first start Windows asks about the firewall – allow \"private networks\".",
    "Standalone-Modus: Alles läuft in diesem Browser. Displays im selben Browser (neues Fenster, z. B. auf dem zweiten Bildschirm) laufen automatisch mit.": "Standalone mode: everything runs in this browser. Displays in the same browser (a new window, e.g. on a second screen) follow automatically.",
    "Für mehrere Geräte das Event-Timer-Programm auf einem Rechner starten.": "For several devices, run the Event Timer program on one computer.",
    "Design wählen": "Choose design",
    "Name": "Name",
    "Hintergrund": "Background",
    "Ziffern": "Digits",
    "Fortschritt": "Progress",
    "Warnung": "Warning",
    "Kritisch": "Critical",
    "Schrift": "Typeface",
    "Stärke": "Weight",
    "Fläche": "Fill",
    "Einfarbig": "Solid",
    "Leuchten": "Glow",
    "Transparent": "Transparent",
    "Fortschrittsbalken": "Progress bar",
    "Uhrzeit": "Clock",
    "Titel und Sprecher*in": "Title and speaker",
    "Hinweise": "Notices",
    "Text bei Warnung": "Warning text",
    "Text bei Ablauf": "Expired text",
    "Als neues Design speichern": "Save as new design",
    "Design löschen": "Delete design",
    "Für diesen Timer verwenden": "Use for this timer",
    "Eingebaute Designs bleiben unverändert – Änderungen werden als neues Design gespeichert.": "Built-in designs stay unchanged – edits are saved as a new design.",
    "Schnellnachrichten": "Quick messages",
    "PIN setzen": "Set PIN",
    "PIN entfernen": "Remove PIN",
    "Mit PIN dürfen nur Geräte steuern, die sie kennen. Displays brauchen nie eine PIN; am Rechner selbst ist keine nötig.": "With a PIN, only devices that know it can control. Displays never need one; the host computer itself doesn't either.",
    "Keine PIN gesetzt – jedes Gerät im Netzwerk kann steuern.": "No PIN set – every device on the network can control.",
    "PIN im Standalone-Modus nicht nötig.": "No PIN needed in standalone mode.",
    "PIN eingeben": "Enter PIN",
    "Entsperren": "Unlock",
    "Nur ansehen": "View only",
    "Falsche PIN": "Wrong PIN",
    "Bitfocus Companion: Modul „Generic HTTP“, Aktion GET auf diese Adressen.": "Bitfocus Companion: use the \"Generic HTTP\" module with GET requests to these URLs.",
    "Sprache": "Language",
    "Tastenkürzel": "Keyboard shortcuts",
    "Version": "Version",
    "Leertaste": "Space",
    "Start/Pause": "Start/pause",
    "Timer wählen": "Select timer",
    "Show zurücksetzen": "Reset show",
    "Löscht alle Timer, den Ablauf und eigene Designs in diesem Browser.": "Deletes all timers, the run of show and custom designs in this browser.",
    "Danach": "Next",
    "bis": "until",
    "Displays": "displays",
    "Vollbild": "Full screen",
    "Speichern im Browser nicht möglich (privates Fenster?). Nach dem Schließen ist alles weg.": "Cannot save in this browser (private window?). Everything is lost after closing.",
    "Speicherort": "Saved at",
    "Speichert in diesem Browser.": "Saved in this browser.",
    "Live-Vorschau": "Live preview",
    "Eingebaut": "Built-in",
    "Eigenes": "Custom",
    "Cues": "Cues",
    "Cue": "Cue",
    "Cue-Display": "Cue display",
    "wartet": "waiting",
    "offen": "open",
    "Min. vor Ende": "min before end",
    "bei Ende": "at end",
    "Min. vor Start": "min before start",
    "Min. nach Start": "min after start",
    "bei Start": "at start",
    "vor Start": "before start",
    "nach Start": "after start",
    "vor Ende": "before end",
    "Wann": "When",
    "Minuten": "Minutes",
    "Neuer Cue": "New cue",
    "Cue hinzufügen": "Add cue",
    "Moderation": "Presenter",
    "Name ändern": "Change name",
    "Gesendet": "Sent",
    "gesendet": "sent",
    "Noch nichts gesendet.": "Nothing sent yet.",
    "oder Dauer (Min.)": "or duration (min)",
    "Fortsetzen": "Resume",
    "Laufender Punkt": "Current slot",
    "verschoben um": "moved by",
    "noch": "remaining",
    "Ende": "End",
    "Weiter um": "Resumes at",
    "Programm beendet": "Programme finished",
    "Gleich geht es los": "Starting soon",
    "Einfach im Browser eintippen": "Just type it into the browser",
    "Netzwerkname nicht verfügbar – bitte IP-Adresse oder QR-Code nutzen.": "Network name unavailable – use the IP address or QR code.",
    "Nur a–z, 0–9 und Bindestrich.": "Only a–z, 0–9 and hyphens.",
    "Gespeichert": "Saved",
    "Ohne Portnummer (Port 80)": "Without port number (port 80)",
    "Klappt auf iPhone, iPad, Mac, Windows und Linux. Manche Android-Geräte kennen .local-Namen nicht – dann QR-Code oder IP nutzen. Laufen zwei Event Timer im selben Netz, jedem einen eigenen Namen geben.": "Works on iPhone, iPad, Mac, Windows and Linux. Some Android devices don't resolve .local names – use the QR code or IP there. Running two Event Timers on one network? Give each its own name.",
    "Nur Uhrzeit": "Clock only",
    "Zeigt die Uhrzeit": "Showing the time of day",
    "Per Rechnername": "By computer name",
    "Name der Veranstaltung": "Event name",
    "All Blackout": "All blackout",
    "Menü": "Menu",
    "Timer löschen": "Delete timer",
    "Reset": "Reset",
    "Set": "Set",
    "Set & Go": "Set & Go",
    "Text für DSM": "Text for the DSM",
    "DSM-Einblendung": "DSM overlay",
    "Optionen": "Options",
    "Vorwarnung (Min.)": "Warning (min)",
    "Kritisch (Min.)": "Critical (min)",
    "Überzeit anzeigen": "Show overtime",
    "DSM-Link": "DSM link",
    "Verknüpfter Timer": "Linked timer",
    "Beginn": "Start",
    "Eine Zeile pro Programmpunkt: [Beginn-Ende;] Titel; Sprecher*in; [Minuten]. Auch direkt aus Excel kopierbar.": "One line per item: [start-end;] title; speaker; [minutes]. Pasting from Excel works too.",
    "Punkt jetzt beenden": "End item now",
    "Nachfolgende Punkte mitverschieben": "Move following items",
    "Gesamtplan": "Whole plan",
    "Originalplan wiederherstellen": "Restore original plan",
    "Programmpunkt hinzufügen": "Add item",
    "Timer automatisch starten": "Start timer automatically",
    "Als Text exportieren": "Export as text",
    "Auf Abruf": "On call",
    "Keine offenen Cues": "No open cues",
    "Freitext an die Moderation": "Free text to the presenter",
    "Verlauf löschen": "Clear history",
    "Talkback": "Talkback",
    "an die Moderation": "to the presenter",
    "Meldung": "Message",
    "Bestätigen": "Acknowledge",
    "Alle bestätigen": "Acknowledge all",
    "Regie": "Control room",
    "Regie gesperrt": "Control room locked",
    "Schließen": "Close",
    "Neues Fenster wurde blockiert – nutze „DSM hier öffnen“.": "New window was blocked – use \"Open DSM here\".",
    "Noch kein Ablauf. Füge den ersten Programmpunkt hinzu oder importiere eine Liste.": "No run of show yet. Add the first item or import a list.",
    "Limit (optional)": "Limit (optional)",
    "Keine Einblendung aktiv": "No overlay active",
    "LIVE auf DSM": "LIVE on DSM",
    "Ausgeblendet": "Hidden",
    "Vorwarnung": "Warning",
    "Überzeit an": "overtime on",
    "Überzeit aus": "overtime off",
    "Programmpunkte beginnen und enden nach ihren Uhrzeiten. Eingreifen mit Hold, ± Minuten oder „Punkt jetzt beenden“.": "Items start and end at their clock times. Step in with Hold, ± minutes or \"End item now\".",
    "Du schaltest jeden Programmpunkt selbst weiter (Taste G). Der verknüpfte Timer zählt die geplante Dauer herunter.": "You advance every item yourself (key G). The linked timer counts down the planned duration.",
    "Hold": "Hold",
    "Nächster Punkt": "Next item",
    "Verbindung getrennt – verbinde neu …": "Disconnected – reconnecting …",
    "Nur ansehen: Zum Steuern PIN eingeben.": "View only: enter the PIN to control.",
    "Überzeit": "Overtime",
    "Hold aktiv": "On hold",
    "Ablaufplan ohne Uhrzeiten": "Run of show has no times",
    "im Plan": "on schedule",
    "Abweichung vom Plan": "Deviation from plan",
    "Voraussichtliches Ende": "Expected end",
    "Gesamtdauer": "Total duration",
    "Restzeit": "Remaining",
    "Pause – weiter in": "Break – resumes in",
    "DSM /1 bis /8 · Ablauf /plan · Uhr /uhr · Regie /control": "DSM /1 to /8 · run of show /plan · clock /uhr · control room /control",
    "Netzwerkname": "Network name",
    "DSM in neuem Fenster": "DSM in new window",
    "DSM hier öffnen": "Open DSM here",
    "DSM-Link erstellen": "Create DSM link",
    "Regie ist mit PIN geschützt.": "Control room is protected by a PIN.",
    "Regie-PIN": "Control room PIN",
    "Signalton bei Meldungen": "Sound for messages",
    "Verbindung unterbrochen – Zeit läuft weiter": "Connection interrupted – time keeps running",
    "DSM-Ansicht verlassen": "Leave DSM view",
    "Timer, Einblendungen, Ablaufplan, Cues": "Timers, overlays, run of show, cues",
    "DSM": "DSM",
    "Talkback und Meldungen": "Talkback and messages",
    "Verstanden": "Understood",
    "Bitte kurz warten": "Please wait a moment",
    "Freitext an die Regie": "Free text to the control room",
    "Meldung an die Regie": "Message to the control room",
    "bestätigt": "acknowledged",
    "verstanden": "understood",
    "Dein Ernst? Nochmal tippen": "Seriously? Tap again",
    "Count-up": "Count-up",
    "Manuell weiterschalten": "Advance manually",
    "Automatisch nach Uhrzeit": "Automatically by the clock",
    "Verbindung": "Connection",
    "System": "System",
    "Ablaufplan (Moderation)": "Run of show (presenter)",
    "Nächster Programmpunkt": "Next item",
    "Nächsten Cue auslösen (GO)": "Fire next cue (GO)",
    "Überzeit Hintergrund": "Overtime background",
    "Überzeit Ziffern": "Overtime digits",
    "Einblendung Fläche": "Overlay box",
    "Einblendung Text": "Overlay text",
    "Nächsten Programmpunkt anzeigen": "Show next item",
    "Blinken bei Überzeit": "Flash on overtime",
    "Text bei Überzeit": "Overtime text",
    "Schnellnachrichten an den DSM": "Quick messages to the DSM",
    "Talkback-Presets": "Talkback presets",
    "Schnellmeldungen (/moderation)": "Quick messages (/moderation)",
    "Regie → DSM. Eine pro Zeile, höchstens 12.": "Control room → DSM. One per line, up to 12.",
    "Regie → Moderation (/moderation). Eine pro Zeile, höchstens 12.": "Control room → presenter (/moderation). One per line, up to 12.",
    "Bühne → Regie: Knöpfe auf dem Handy der Moderation. Eine pro Zeile, höchstens 12.": "Stage → control room: buttons on the presenter's phone. One per line, up to 12.",
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
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    talk: '<path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
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
      btn.textContent = t('Dein Ernst? Nochmal tippen');
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
