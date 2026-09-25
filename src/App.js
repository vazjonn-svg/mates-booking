// ─────────────────────────────────────────────────────────────────────────────
// Mates Studios Booking Manager — App.js
// 100% Free — no AI API needed
//
// SETUP:
//   1. In Google Cloud Console (console.cloud.google.com):
//        - Create a project → APIs & Services → Library → enable:
//            Google Calendar API, Gmail API, Google Drive API
//        - APIs & Services → OAuth consent screen → add every staff Google
//          account (e.g. rehearsals@matesinc.com) as a Test User, unless/until
//          the app is published
//        - APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web app)
//            Authorized JavaScript origins: http://localhost:3000
//            (add your live URL here too once deployed)
//        - Copy the Client ID
//
//   2. Create a .env file in the project root (copy .env.example) with:
//        REACT_APP_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
//
//   3. npm install
//   4. npm start  (for local testing)
//   5. npm run deploy  (builds + pushes to GitHub Pages, via gh-pages)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Room & Gear Configuration ────────────────────────────────────────────────
// Editable at runtime from the Settings tab. Defaults below are the seed data;
// live edits are cached in memory and persisted to THIS BROWSER's localStorage.
// That means settings changes made on one computer won't automatically show up
// on the other (no shared backend/database in this app) — re-apply the same
// edit on each staff computer, or export/import the config JSON between them.
const CONFIG_STORAGE_KEY = "matesBookingConfig_v1";

// HOW TO FIND EACH ROOM'S CALENDAR ID:
//   1. Open Google Calendar (as the account that owns/has access to that room's calendar)
//   2. Hover the calendar name in the left sidebar → click the 3-dot menu → "Settings and sharing"
//   3. Scroll to "Integrate calendar" → copy the "Calendar ID"
//      (it usually looks like a long string ending in @group.calendar.google.com)
//   4. Paste it in via the Settings tab, or directly below
const DEFAULT_ROOMS = {
  "Studio A":      { address: "",     locationName: "",    gateCode: "",     accessNote: "", description: "",                                                       calendarId: "REPLACE_WITH_STUDIO_A_CALENDAR_ID",      hourly: null, daily: null },
  "Studio B":      { address: "",     locationName: "",    gateCode: "",     accessNote: "", description: "",                                                       calendarId: "REPLACE_WITH_STUDIO_B_CALENDAR_ID",      hourly: null, daily: null },
  "Stage C":       { address: "",     locationName: "",    gateCode: "",     accessNote: "", description: "",                                                       calendarId: "REPLACE_WITH_STAGE_C_CALENDAR_ID",       hourly: null, daily: null },
  "Chandler Room": { address: "",     locationName: "",    gateCode: "",     accessNote: "", description: "",                                                       calendarId: "REPLACE_WITH_CHANDLER_ROOM_CALENDAR_ID", hourly: null, daily: null },
  "Gold Room":     { address: "",  locationName: "",  gateCode: "", accessNote: "This location has a gated entrance. Use the gate code below upon arrival.", description: "", calendarId: "REPLACE_WITH_GOLD_ROOM_CALENDAR_ID",     hourly: null, daily: null },
  "Chino Room":    { address: "",  locationName: "",  gateCode: "", accessNote: "This location has a gated entrance. Use the gate code below upon arrival.", description: "", calendarId: "REPLACE_WITH_CHINO_ROOM_CALENDAR_ID",    hourly: null, daily: null },
  "Stage D":       { address: "",  locationName: "",  gateCode: "", accessNote: "This location has a gated entrance. Use the gate code below upon arrival.", description: "", calendarId: "REPLACE_WITH_STAGE_D_CALENDAR_ID",       hourly: null, daily: null },
  "Stage West":    { address: "",        locationName: "", gateCode: "",     accessNote: "", description: "",                                                       calendarId: "REPLACE_WITH_STAGE_WEST_CALENDAR_ID",    hourly: null, daily: null },
};

const DEFAULT_GEAR = [
  { name: "Wireless Mic",    rate: 0 },
  { name: "In-Ear Monitors", rate: 0 },
  { name: "Drum Kit",        rate: 0 },
  { name: "Bass Amp",        rate: 0 },
  { name: "Guitar Amp",      rate: 0 },
  { name: "Cymbals",         rate: 0 },
  { name: "Snare Drum",      rate: 0 },
  { name: "Keyboard",        rate: 0 },
];

const DEFAULT_NIGHT_CREW = []; // { name, email } — managed in Settings, checked off per rundown
const DEFAULT_CLOSING_NOTES = "Thank you for everything you do to keep this place running smoothly. A couple of reminders before you close out: please reach out to your crew mate if you need a hand with anything tonight — no one should have to handle a busy night solo. And please make sure the bathrooms and coffee bar/kitchen are clean and fully restocked before you leave; that first impression sets the tone for the next crew and every client walking in tomorrow.";

// Module-level cache so non-component functions (email/calendar builders, which
// run outside React render) always read the latest saved config too.
let _configCache = null;
function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt/blocked storage */ }
  return null;
}
function getConfig() {
  if (!_configCache) {
    const stored = loadStoredConfig();
    // Merge with defaults so anyone with a config saved before a field
    // existed (e.g. nightCrew) doesn't crash on the missing key.
    _configCache = { rooms: DEFAULT_ROOMS, gear: DEFAULT_GEAR, nightCrew: DEFAULT_NIGHT_CREW, closingNotes: DEFAULT_CLOSING_NOTES, bookingsLogSheetId: null, hourlyPolicyFile: null, lockoutPolicyFile: null, contactsSheetId: null, ...stored };
  }
  return _configCache;
}
function setConfig(next) {
  _configCache = next;
  try { localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage full/blocked */ }
}
function getRoomLocation(room) {
  return getConfig().rooms[room] || { address: "Contact us for address details", locationName: "", gateCode: "", accessNote: "" };
}
function getRoomRates(room) {
  const r = getConfig().rooms[room];
  return r ? { hourly: r.hourly, daily: r.daily } : { hourly: null, daily: null };
}

// ─── Room color coding (Availability panel) ───────────────────────────────────
// Deterministic hash → color, so a room's color stays stable even as rooms are
// added/removed/reordered in Settings.
const EVENT_PALETTE = ["#e08a8a", "#e0b48a", "#dcd08a", "#a3d88a", "#8ad8c2", "#8ab8d8", "#a88ad8", "#d88ac9"];
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function getRoomColor(room) {
  return EVENT_PALETTE[hashStr(room || "") % EVENT_PALETTE.length];
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Kept out of the public source the same way the Google Client ID already is
// — real values live in your own .env (git-ignored), generic fallbacks here
// so the code itself doesn't identify which business is running it.
const STUDIO_NAME  = process.env.REACT_APP_STUDIO_NAME  || "Your Studio Name";
const STUDIO_EMAIL = process.env.REACT_APP_STUDIO_EMAIL || "bookings@example.com";
const STUDIO_PHONE = process.env.REACT_APP_STUDIO_PHONE || "";
const STUDIO_ZELLE  = process.env.REACT_APP_STUDIO_ZELLE || "";
const STUDIO_PORTAL_URL = process.env.REACT_APP_STUDIO_PORTAL_URL || "";

const STEPS = ["details", "review", "confirm"];

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m of [0, 30]) {
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    TIME_OPTIONS.push({ value: `${hh}:${mm}`, label: `${hr}:${mm} ${ampm}` });
  }
}
// Business hours: 9:00 AM – 11:00 PM. Start times stop at 8:00 PM so the
// 3-hour minimum booking always fits before close (8pm + 3hrs = 11pm).
const START_TIME_OPTIONS = TIME_OPTIONS.filter(o => {
  const m = timeToMins(o.value);
  return m >= 9 * 60 && m <= 20 * 60;
});
const END_TIME_OPTIONS = TIME_OPTIONS.filter(o => {
  const m = timeToMins(o.value);
  return m >= 9 * 60 + 30 && m <= 23 * 60;
});

const EMPTY_FORM = {
  bandName: "", contactEmail: "", contactName: "", room: "",
  bookingType: "hourly",
  eventDate: "", endDate: "", startTime: "", endTime: "",
  hourlyRate: "", dailyRate: "",
  rentalRates: {}, // filled in per-booking from the live gear config on reset
  calendarNotes: "", hasRentals: false, rentals: {},
  depositAmount: "", depositDue: "",
  stagePlotFile: null, // File object, in-memory only — uploaded to Drive on confirm
  stagePlotAttachment: null, // set once uploaded, so re-previewing doesn't re-upload
  replyThreadId: null, replyMessageId: null, replyCc: "", // set when staff pick a thread to reply into
  staffAttention: false, // manual "needs booking staff attention" flag
  discountEnabled: false, discountMode: "percent", discountTarget: "total", discountValue: "",
  hidePricingInEmail: true, // defaults ON — pricing/rentals stay off the client email unless staff opts in; the Review screen still shows real numbers to staff either way
  customGreeting: "", // empty = use the auto-generated "Hi [First Name]..." line
  attachPolicy: true, // whether to attach the relevant booking policy PDF (if one's configured in Settings)
  createdEventId: null, createdEventCalendarId: null, // tentative event created at Preview time
  multiSession: false, sessions: [], // batch mode: one client, several hourly sessions (rooms/dates/times can differ)
};

let _sessionKeyCounter = 0;
function newSessionRow(room = "", rates = { hourly: null, daily: null }, type = "hourly") {
  _sessionKeyCounter += 1;
  return {
    key: `s${Date.now()}_${_sessionKeyCounter}`,
    type, // "hourly" | "daily" — each row picks its own, independent of the others
    room, eventDate: "", endDate: "", startTime: "", endTime: "",
    hourlyRate: rates.hourly ?? "", dailyRate: rates.daily ?? "",
    createdEventId: null, createdEventCalendarId: null,
  };
}
// A candidate date/time a client could work with — Quote checks every
// eligible room against each of these, independent of the others.
let _quoteSlotKeyCounter = 0;
function newQuoteSlot() {
  _quoteSlotKeyCounter += 1;
  return { key: `q${Date.now()}_${_quoteSlotKeyCounter}`, eventDate: "", endDate: "", startTime: "", endTime: "" };
}

// ─── Brand Design Tokens (Mates Inc.) ─────────────────────────────────────────
// Every value here is a CSS custom property, not a literal color — the real
// hex values live in the <style> block's [data-theme] rules, so flipping the
// theme in Settings doesn't require touching any of the hundreds of call
// sites that reference C.xxx throughout the app.
const C = {
  bg:            "var(--c-bg)",
  surface:       "var(--c-surface)",
  surface2:      "var(--c-surface2)",
  surface3:      "var(--c-surface3)",
  border:        "var(--c-border)",
  borderSoft:    "var(--c-borderSoft)",
  text:          "var(--c-text)",
  textMuted:     "var(--c-textMuted)",
  textFaint:     "var(--c-textFaint)",
  accent:        "var(--c-accent)",
  accentText:    "var(--c-accentText)",
  success:       "var(--c-success)",
  successBg:     "var(--c-successBg)",
  successBorder: "var(--c-successBorder)",
  warning:       "var(--c-warning)",
  warningBg:     "var(--c-warningBg)",
  warningBorder: "var(--c-warningBorder)",
  danger:        "var(--c-danger)",
  dangerBg:      "var(--c-dangerBg)",
  dangerBorder:  "var(--c-dangerBorder)",
  info:          "var(--c-info)",
  infoBg:        "var(--c-infoBg)",
  infoBorder:    "var(--c-infoBorder)",
};
const FONT = {
  display: "'Bebas Neue', sans-serif",
  mono:    "'IBM Plex Mono', 'Courier New', monospace",
  body:    "'Inter', 'Helvetica Neue', Arial, sans-serif",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function calcHours(start, end) {
  if (!start || !end) return 0;
  const diff = (timeToMins(end) - timeToMins(start)) / 60;
  return diff > 0 ? diff : 0;
}
// Default end time = start + N hours, clamped to business close (11:00 PM).
function addHoursToTime(start, hoursToAdd) {
  if (!start) return "";
  const mins = Math.min(timeToMins(start) + hoursToAdd * 60, 23 * 60);
  const hh = Math.floor(mins / 60), mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function calcDays(s, e) {
  if (!s || !e) return 1;
  const diff = Math.round((new Date(e + "T12:00:00") - new Date(s + "T12:00:00")) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}
// ─── Date-grid helpers (Availability panel) ───────────────────────────────────
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); r.setDate(r.getDate() - r.getDay()); return r; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function isoDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// Parses an event's start/end consistently for BOTH timed and all-day events.
// A bare date-only string like "2026-09-18" is parsed by `new Date()` as UTC
// midnight, not local midnight — in a negative-UTC-offset timezone that lands
// on the *previous* local day, which would make an all-day event spill into
// the wrong day (or an adjacent column) in the panel grid. Parsing it as
// local-midnight components instead avoids that entirely.
function parseEventBoundary(value, isAllDay) {
  if (!value) return null;
  if (isAllDay) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}
// Adds N days to a "YYYY-MM-DD" string, parsed as local time to avoid the
// UTC-midnight drift that plain `new Date("YYYY-MM-DD")` causes.
function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDateKey(d);
}
// Returns the visible day grid + fetch range for a given panel view/anchor date.
function getPanelGrid(view, anchor) {
  const a = new Date(anchor); a.setHours(0, 0, 0, 0);
  if (view === "day") return { days: [a], gridStart: a, gridEnd: addDays(a, 1) };
  if (view === "week") {
    const start = startOfWeek(a);
    return { days: Array.from({ length: 7 }, (_, i) => addDays(start, i)), gridStart: start, gridEnd: addDays(start, 7) };
  }
  const monthStart = startOfMonth(a);
  const gridStart = startOfWeek(monthStart);
  return { days: Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), gridStart, gridEnd: addDays(gridStart, 42), monthStart };
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtShortDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
// Collapses a Lock Out's start/end into a single date when it's a 1-day
// booking, instead of the redundant "Oct 3 – Oct 3".
function formatDateRange(start, end) {
  if (!start) return "";
  if (!end || start === end) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
function calcSessionTotal(form) {
  if (form.multiSession) {
    return form.sessions.reduce((sum, s) => {
      if (s.type === "daily") return sum + calcDays(s.eventDate, s.endDate) * (parseFloat(s.dailyRate) || 0);
      return sum + calcHours(s.startTime, s.endTime) * (parseFloat(s.hourlyRate) || 0);
    }, 0);
  }
  if (form.bookingType === "hourly")
    return calcHours(form.startTime, form.endTime) * (parseFloat(form.hourlyRate) || 0);
  return calcDays(form.eventDate, form.endDate) * (parseFloat(form.dailyRate) || 0);
}
function calcRentalUnits(form) {
  // "Units" the rental rate multiplies by — each Lock Out row contributes its
  // own day count, each Hourly row contributes 1, summed across the whole
  // batch (mixed types included). Consistent with how a single Lock Out
  // already bills rentals by day count, not by booking count.
  if (form.multiSession) {
    return Math.max(1, form.sessions.reduce((sum, s) => sum + (s.type === "daily" ? calcDays(s.eventDate, s.endDate) : 1), 0));
  }
  return form.bookingType === "daily" ? calcDays(form.eventDate, form.endDate) : 1;
}
function calcRentalTotal(form) {
  const units = calcRentalUnits(form);
  return Object.entries(form.rentals || {}).reduce((sum, [item, qty]) => {
    if (qty <= 0) return sum;
    return sum + (parseFloat((form.rentalRates || {})[item]) || 0) * qty * units;
  }, 0);
}
function calcTotal(form) { return Math.max(0, calcPreDiscountTotal(form) - calcDiscountAmount(form)); }
function calcPreDiscountTotal(form) { return calcSessionTotal(form) + calcRentalTotal(form); }
// Discount can target Session, Rentals, or the combined pre-discount total,
// as a percent, a flat dollar amount, or by typing the final price directly
// (in which case the effective percent is back-calculated for display).
function calcDiscountTargetAmount(form) {
  if (form.discountTarget === "session") return calcSessionTotal(form);
  if (form.discountTarget === "rentals") return calcRentalTotal(form);
  return calcPreDiscountTotal(form);
}
function calcDiscountAmount(form) {
  if (!form.discountEnabled || form.discountValue === "" || form.discountValue == null) return 0;
  const val = parseFloat(form.discountValue) || 0;
  if (form.discountMode === "finalTotal") {
    return Math.max(0, calcPreDiscountTotal(form) - val);
  }
  const targetAmount = calcDiscountTargetAmount(form);
  if (form.discountMode === "fixed") return Math.min(val, targetAmount);
  return targetAmount * (Math.min(100, Math.max(0, val)) / 100); // percent, clamped 0–100
}
function calcDiscountPercent(form) {
  const targetAmount = form.discountMode === "finalTotal" ? calcPreDiscountTotal(form) : calcDiscountTargetAmount(form);
  const amt = calcDiscountAmount(form);
  return targetAmount > 0 ? (amt / targetAmount) * 100 : 0;
}
function discountLabel(form) {
  const pct = calcDiscountPercent(form);
  const pctStr = `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
  const targetName = form.discountMode === "finalTotal" ? "Grand Total" : form.discountTarget === "session" ? "Session" : form.discountTarget === "rentals" ? "Rentals" : "Grand Total";
  return `Discount (${pctStr} off ${targetName})`;
}
function rentalSummaryText(form, { includePrices = true } = {}) {
  const days = calcRentalUnits(form);
  // Always "day(s)" — for a mixed multi-session batch, calling it "sessions"
  // was misleading, since a Lock Out row contributes actual days, not one
  // session. Rentals bill by day-rate either way, so "days" is accurate for
  // every case: single booking, all-hourly batch, all-lockout batch, or mixed.
  return Object.entries(form.rentals || {}).filter(([, q]) => q > 0)
    .map(([item, q]) => {
      if (!includePrices) return days > 1 ? `${item} ×${q} × ${days} days` : `${item} ×${q}`;
      const rate = parseFloat((form.rentalRates || {})[item]) || 0;
      const sub = rate * q * days;
      return days > 1 ? `${item} ×${q} × ${days} days ($${sub.toFixed(2)})` : `${item} ×${q} ($${sub.toFixed(2)})`;
    }).join(", ");
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const CLIENTS_KEY = "mates_clients_v1";
function loadClients() { try { return JSON.parse(localStorage.getItem(CLIENTS_KEY) || "[]"); } catch { return []; } }
function persistClient(c) {
  const all = loadClients();
  const idx = all.findIndex(x => x.email === c.email);
  if (idx >= 0) all[idx] = { ...all[idx], ...c }; else all.unshift(c);
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(all.slice(0, 300)));
}
// Merges this browser's locally-saved clients with everyone's shared Contacts
// sheet — by email, so a client saved from either computer shows up for both.
// When both sides know the same client, whichever has the more recent
// "last booked" date wins for the room/date fields (the sheet is usually the
// more complete picture, but a very recent local booking may not have synced
// to the sheet yet).
function mergeClientRecords(local, sheetRows) {
  const byEmail = new Map();
  for (const c of local) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
  }
  for (const row of sheetRows) {
    const [band, name, email, lastRoom, lastBooked] = row;
    if (!email) continue;
    const key = email.toLowerCase();
    const existing = byEmail.get(key);
    const incoming = { band, name, email, lastRoom, lastBooked };
    if (!existing) { byEmail.set(key, incoming); continue; }
    const existingDate = existing.lastBooked ? new Date(existing.lastBooked).getTime() : 0;
    const incomingDate = lastBooked ? new Date(lastBooked).getTime() : 0;
    byEmail.set(key, incomingDate >= existingDate ? { ...existing, ...incoming } : { ...incoming, ...existing });
  }
  return [...byEmail.values()];
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly", // needed to search threads by query — gmail.metadata explicitly forbids the search (q) parameter, per Google's own API docs
  "https://www.googleapis.com/auth/drive.file", // upload stage plots (only touches files this app creates)
].join(" ");

function useGoogleAuth() {
  const [token, setToken] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const clientRef = useRef(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!GOOGLE_CLIENT_ID) return;
      clientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: (resp) => {
          if (resp.access_token) setToken(resp.access_token);
          setAuthLoading(false);
        },
      });
    };
    document.body.appendChild(script);
  }, []);

  const signIn = useCallback(() => {
    if (!clientRef.current) { alert("Google sign-in not ready. Check your Client ID in .env"); return; }
    setAuthLoading(true);
    clientRef.current.requestAccessToken();
  }, []);

  const signOut = useCallback(() => setToken(null), []);
  return { token, authLoading, signIn, signOut };
}

// ─── Google API helpers ───────────────────────────────────────────────────────
async function googleCalendarCreate(token, calendarId, event) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none${event.attachments?.length ? "&supportsAttachments=true" : ""}`;
  const res = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Calendar: ${res.status}`);
  return res.json();
}

// Moves a tentative event to a different room's calendar — used when staff go
// back to Details and change the room after already previewing once.
async function googleCalendarMove(token, calendarId, eventId, destCalendarId) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/move?destination=${encodeURIComponent(destCalendarId)}&sendUpdates=none`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Calendar move: ${res.status}`);
  return res.json();
}

// Updates a previously-created event in place (used to keep the tentative
// event in sync while staff go back and forth between Details and Review).
async function googleCalendarPatch(token, calendarId, eventId, event) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none${event.attachments?.length ? "&supportsAttachments=true" : ""}`;
  const res = await fetch(url, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Calendar patch: ${res.status}`);
  return res.json();
}

// ─── Stage plot uploads (Google Drive → attached to the Calendar event) ──────
// Uploads the file to Drive, makes it link-viewable (stage plots aren't
// sensitive — this just avoids "access denied" for whoever opens the event),
// and returns the {fileId, fileUrl, title, mimeType} shape Calendar wants.
async function driveUploadFile(token, file) {
  const metadata = { name: file.name, mimeType: file.type || "application/octet-stream" };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name,mimeType", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!res.ok) throw new Error(`Drive upload: ${res.status}`);
  const data = await res.json();
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });
  } catch { /* attachment still works for staff who already have Drive access */ }
  return { fileId: data.id, fileUrl: data.webViewLink, title: data.name, mimeType: data.mimeType };
}

// Fetches a Drive file's raw bytes and returns them base64-encoded, for
// embedding as a real email attachment (booking policy PDFs) — chunked to
// avoid call-stack limits when converting large files to a binary string.
async function driveDownloadFileBase64(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ─── Bookings log (Google Sheets) ─────────────────────────────────────────────
// Uses the same drive.file scope as stage plot uploads — Google's own docs
// list drive.file as valid for spreadsheets.values.append, as long as the app
// itself created the spreadsheet (which it does, right here).
async function sheetsCreateSpreadsheet(token, title) {
  const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!res.ok) throw new Error(`Sheets create: ${res.status}`);
  const data = await res.json();
  return { spreadsheetId: data.spreadsheetId, sheetTitle: data.sheets?.[0]?.properties?.title || "Sheet1" };
}
async function sheetsAppendRows(token, spreadsheetId, sheetTitle, rows) {
  const range = encodeURIComponent(`${sheetTitle}!A1`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Sheets append: ${res.status}`);
  return res.json();
}
async function sheetsGetValues(token, spreadsheetId, range) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets get: ${res.status}`);
  const data = await res.json();
  return data.values || [];
}
async function sheetsUpdateRow(token, spreadsheetId, sheetTitle, rowNumber, rowValues) {
  const range = encodeURIComponent(`${sheetTitle}!A${rowNumber}`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [rowValues] }),
  });
  if (!res.ok) throw new Error(`Sheets update: ${res.status}`);
  return res.json();
}
const BOOKINGS_LOG_HEADERS = ["Reference ID", "Logged At", "Session Date", "Room", "Booking Type", "Band Name", "Contact Name", "Contact Email", "Time / Duration", "Rate", "Rentals", "Discount", "Grand Total", "Deposit Amount", "Deposit Due"];
const CONTACTS_SHEET_HEADERS = ["Band Name", "Contact Name", "Email", "Last Room", "Last Booked"];
function slugify(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "booking";
}
// One row per session for a multi-session batch; one row for a single booking.
// Reference ID is shared across every row from the same booking, so they can
// be grouped later (e.g. once a rental-department app exists to join against).
function buildBookingLogRows(form) {
  const now = new Date().toISOString();
  const total = calcTotal(form).toFixed(2);
  const discount = calcDiscountAmount(form).toFixed(2);
  const rentalsText = rentalSummaryText(form) || "";
  const ref = `${slugify(form.bandName)}-${form.multiSession ? (form.sessions[0]?.eventDate || "") : form.eventDate}`;
  if (form.multiSession) {
    return form.sessions.map(s => [
      ref, now, s.eventDate, s.room,
      s.type === "hourly" ? "Hourly" : "Lock Out",
      form.bandName, form.contactName, form.contactEmail,
      s.type === "hourly" ? `${fmtTime(s.startTime)}–${fmtTime(s.endTime)}` : `${calcDays(s.eventDate, s.endDate)} day(s)`,
      s.type === "hourly" ? (s.hourlyRate || "") : (s.dailyRate || ""),
      rentalsText, discount, total, form.depositAmount || "", form.depositDue || "",
    ]);
  }
  return [[
    ref, now, form.eventDate, form.room,
    form.bookingType === "hourly" ? "Hourly" : "Lock Out",
    form.bandName, form.contactName, form.contactEmail,
    form.bookingType === "hourly" ? `${fmtTime(form.startTime)}–${fmtTime(form.endTime)}` : `${calcDays(form.eventDate, form.endDate)} day(s)`,
    form.bookingType === "hourly" ? (form.hourlyRate || "") : (form.dailyRate || ""),
    rentalsText, discount, total, form.depositAmount || "", form.depositDue || "",
  ]];
}

// Adds/replaces the stage-plot attachment on an EXISTING event (used from the
// Availability panel, e.g. when a stage plot arrives after the booking was made).
async function googleCalendarAddAttachment(token, calendarId, eventId, existingAttachments, newAttachment, newSummary) {
  const attachments = [...(existingAttachments || []).filter(a => a.title !== newAttachment.title), newAttachment];
  const body = { attachments, ...(newSummary ? { summary: newSummary } : {}) };
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none&supportsAttachments=true`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Calendar attach: ${res.status}`);
  return res.json();
}

// RFC 2047-encodes header values (Subject, etc.) containing non-ASCII characters
// — an em dash or accented name left raw in a header shows up as garbled text
// like "Ã¢Â€Â"" in some inboxes, even though the HTML body is UTF-8 already.
function encodeMimeHeader(str) {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return `=?UTF-8?B?${b64}?=`;
}

// Builds a raw RFC 2822 message — plain text/html when there's no attachment,
// or a proper multipart/mixed message (with a real, downloadable file, not
// just a link) when one's included. Shared by gmailSend and gmailSendInThread
// so attachments, CC, and threading all work the same way regardless of path.
function buildRawEmailMessage({ to, cc, subject, htmlBody, inReplyToMessageId, attachments }) {
  const headerLines = [`To: ${to}`];
  if (cc) headerLines.push(`Cc: ${cc}`);
  headerLines.push(`Subject: ${encodeMimeHeader(subject)}`, "MIME-Version: 1.0");
  if (inReplyToMessageId) headerLines.push(`In-Reply-To: ${inReplyToMessageId}`, `References: ${inReplyToMessageId}`);

  const list = (attachments || []).filter(Boolean);
  if (list.length === 0) {
    headerLines.push("Content-Type: text/html; charset=utf-8");
    return [...headerLines, "", htmlBody].join("\r\n");
  }
  const boundary = `mates_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const attachmentParts = list.map(a => [
    `--${boundary}`, `Content-Type: ${a.mimeType}; name="${a.filename}"`,
    "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${a.filename}"`,
    "", a.base64Data,
  ].join("\r\n")).join("\r\n");
  const body = [
    `--${boundary}`, "Content-Type: text/html; charset=utf-8", "", htmlBody,
    attachmentParts,
    `--${boundary}--`,
  ].join("\r\n");
  return [...headerLines, "", body].join("\r\n");
}
function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function gmailSendRaw(token, rawMessage, threadId) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: toBase64Url(rawMessage), ...(threadId ? { threadId } : {}) }),
  });
  if (!res.ok) throw new Error(`Gmail: ${res.status}`);
  return res.json();
}

async function gmailSend(token, to, subject, htmlBody, attachments) {
  return gmailSendRaw(token, buildRawEmailMessage({ to, subject, htmlBody, attachments }));
}

// Sends the confirmation as a REPLY inside an existing thread instead of a new
// email — sets threadId (what Gmail actually uses to place it in the
// conversation) plus In-Reply-To/References (for correct threading in other
// mail clients too) and prefixes the subject with "Re:" if it isn't already.
async function gmailSendInThread(token, to, subject, htmlBody, threadId, inReplyToMessageId, cc, attachments) {
  const subjectLine = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const raw = buildRawEmailMessage({ to, cc, subject: subjectLine, htmlBody, inReplyToMessageId, attachments });
  return gmailSendRaw(token, raw, threadId);
}

// Searches this Gmail account for recent threads involving an email address.
// Requires gmail.readonly (not gmail.metadata — that scope blocks the search
// "q" parameter entirely, per Google's docs). We only ever fetch and use the
// subject/date/snippet/Message-ID here — never the message body — even
// though the readonly scope would technically allow reading full content.
// Pulls plain email addresses out of a raw header value like
// `"Band Manager" <manager@x.com>, other@y.com` — handles both quoted-name
// and bare-address forms.
function extractEmails(headerValue) {
  if (!headerValue) return [];
  const matches = headerValue.match(/[^\s<>",]+@[^\s<>",]+/g) || [];
  return [...new Set(matches.map(e => e.toLowerCase()))];
}

async function gmailSearchThreads(token, email) {
  const q = encodeURIComponent(`(from:${email} OR to:${email})`);
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${q}&maxResults=8`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) throw new Error(`Gmail search: ${listRes.status}`);
  const listData = await listRes.json();
  const threads = listData.threads || [];

  const detailed = await Promise.all(threads.map(async t => {
    try {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=To&metadataHeaders=Cc`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return null;
      const full = await r.json();
      const lastMsg = full.messages?.[full.messages.length - 1];
      const headers = lastMsg?.payload?.headers || [];
      const subject = headers.find(h => h.name === "Subject")?.value || "(no subject)";
      const messageId = headers.find(h => h.name === "Message-ID")?.value || null;
      const date = lastMsg?.internalDate ? new Date(parseInt(lastMsg.internalDate, 10)) : null;
      // Everyone who was on the most recent message — CC'd people get the
      // confirmation too, matching how "Reply All" would normally behave.
      const cc = [
        ...extractEmails(headers.find(h => h.name === "To")?.value),
        ...extractEmails(headers.find(h => h.name === "Cc")?.value),
      ].filter((v, i, arr) => arr.indexOf(v) === i && v !== email.toLowerCase());
      return { id: t.id, subject, messageId, date, snippet: t.snippet || "", cc };
    } catch { return null; }
  }));

  return detailed.filter(Boolean).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
}

async function gmailDraft(token, to, subject, htmlBody) {
  const message = [
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\n");
  const encoded = btoa(unescape(encodeURIComponent(message))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: encoded } }),
  });
  if (!res.ok) throw new Error(`Draft: ${res.status}`);
  return res.json();
}

async function listCalendarEvents(token) {
  const now = new Date().toISOString();
  const entries = Object.entries(getConfig().rooms).filter(([, loc]) => loc.calendarId && !loc.calendarId.startsWith("REPLACE_"));

  const results = await Promise.all(
    entries.map(async ([room, loc]) => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(loc.calendarId)}/events?timeMin=${now}&maxResults=25&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items || []).map(ev => ({
          id: ev.id, title: ev.summary, room, calendarId: loc.calendarId,
          start: ev.start?.dateTime || ev.start?.date,
          end: ev.end?.dateTime || ev.end?.date,
          allDay: !ev.start?.dateTime,
          description: ev.description || "",
          location: ev.location || "",
        }));
      } catch { return []; }
    })
  );

  return results.flat().sort((a, b) => parseEventBoundary(a.start, a.allDay) - parseEventBoundary(b.start, b.allDay));
}

// Fetches events across ALL configured room calendars within an explicit date
// range — used by the Availability panel's Day/Week/Month grid.
async function listCalendarEventsInRange(token, timeMinISO, timeMaxISO) {
  const entries = Object.entries(getConfig().rooms).filter(([, loc]) => loc.calendarId && !loc.calendarId.startsWith("REPLACE_"));

  const results = await Promise.all(
    entries.map(async ([room, loc]) => {
      try {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(loc.calendarId)}/events?timeMin=${timeMinISO}&timeMax=${timeMaxISO}&maxResults=250&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items || []).map(ev => ({
          id: ev.id, calendarId: loc.calendarId, room,
          title: ev.summary || "(untitled)",
          start: ev.start?.dateTime || ev.start?.date,
          end: ev.end?.dateTime || ev.end?.date,
          allDay: !ev.start?.dateTime,
          description: ev.description || "",
          location: ev.location || "",
          htmlLink: ev.htmlLink || null,
          attachments: ev.attachments || [],
        }));
      } catch { return []; }
    })
  );

  return results.flat().sort((a, b) => parseEventBoundary(a.start, a.allDay) - parseEventBoundary(b.start, b.allDay));
}

// Patches just the description field of an existing event — used for the
// panel's "staff notes" editor, so it never touches times/title/pricing.
async function googleCalendarUpdateDescription(token, calendarId, eventId, description) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ description }) }
  );
  if (!res.ok) throw new Error(`Calendar update: ${res.status}`);
  return res.json();
}

// ─── Conflict checking ─────────────────────────────────────────────────────────
// Checks a single room's calendar for events that overlap the given time window.
// Non-blocking — just surfaces what's already booked so staff can make the call
// (longer bookings take precedence, hourlies get moved around as needed).
async function checkRoomConflicts(token, calendarId, timeMinISO, timeMaxISO) {
  if (!calendarId || calendarId.startsWith("REPLACE_")) return [];
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMinISO}&timeMax=${timeMaxISO}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(ev => ({
    id: ev.id,
    title: ev.summary || "(untitled event)",
    start: ev.start?.dateTime || ev.start?.date,
    end: ev.end?.dateTime || ev.end?.date,
    allDay: !ev.start?.dateTime,
  }));
}

// ─── Email template builder ───────────────────────────────────────────────────
// Wraps an address in an explicit Google Maps link, rather than leaving it to
// the email client's own auto-detection — Gmail (and others) sometimes only
// link part of an address (e.g. stopping before the zip code), inconsistently
// from one address to the next.
function mapsLinkHtml(address, label, styleAttr = "color:#2563eb;text-decoration:none;") {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return `<a href="${url}" style="${styleAttr}">${label ?? address}</a>`;
}

// Escapes free-typed text before it goes into the email's raw HTML — that
// same HTML is also rendered live via dangerouslySetInnerHTML in the Review
// screen's preview, so unescaped input isn't just a display risk in the
// client's inbox, it's a real script-execution risk in staff's own browser.
function escapeHtml(str) {
  return (str ?? "").toString()
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function firstName(fullName) {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}
// The auto-generated greeting — shown pre-filled wherever staff can customize
// it, and used as-is if they never touch it.
function defaultGreeting(form) {
  const name = firstName(form.contactName) || "there";
  return `Hi ${name}, your booking${form.multiSession ? "s" : ""} at ${STUDIO_NAME} ${form.multiSession ? "are" : "is"} confirmed. Please review the details below and reach out if you have any questions.`;
}

// Builds the "here's what's actually open" email — organized by the candidate
// date/time the client gave, listing only the rooms that came back available
// AND that staff kept checked in the review step. Never touches pricing-hide
// logic (the whole point of a quote is communicating rates) and never creates
// any calendar event or booking record — purely informational.
function buildQuoteEmailHTML(quoteForm, quoteResults, quoteSelections) {
  const isHourly = quoteForm.bookingType === "hourly";
  const greeting = escapeHtml(quoteForm.greeting || `Hi ${firstName(quoteForm.contactName) || "there"}, here's what we've got available for you — let us know which works best and we'll get you booked in.`).replace(/\n/g, "<br>");

  const slotBlocks = quoteForm.slots.map(slot => {
    const slotLabel = isHourly
      ? `${fmtDate(slot.eventDate)} · ${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`
      : formatDateRange(slot.eventDate, slot.endDate);
    const rooms = (quoteResults?.[slot.key] || []).filter(r => r.available && quoteSelections[`${slot.key}__${r.room}`]);
    const roomsHtml = rooms.length === 0
      ? `<p style="margin:0;font-size:13px;color:#9ca3af;">No rooms available for this time.</p>`
      : rooms.map(r => {
          const loc = getRoomLocation(r.room);
          const roomLabel = `${r.room}${loc.locationName ? `, ${loc.locationName}` : ""}`;
          return `
          <div style="border-top:1px solid #f3f4f6;padding:12px 0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;">
              <span style="font-size:14px;font-weight:700;color:#111827;">${roomLabel}</span>
              <span style="font-size:13px;color:#111827;font-weight:600;">${isHourly ? `$${r.rate}/hr` : `$${r.rate}/day`}</span>
            </div>
            ${loc.description ? `<p style="margin:6px 0 0;font-size:12.5px;color:#6b7280;line-height:1.5;">${escapeHtml(loc.description)}</p>` : ""}
          </div>`;
        }).join("");
    return `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:18px 22px;margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${slotLabel}</p>
        ${roomsHtml}
      </div>`;
  }).join("");

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#121212;padding:28px 32px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;color:#f2f2f0;font-size:22px;font-weight:700;letter-spacing:0.02em;">${STUDIO_NAME}</h1>
      <p style="margin:6px 0 0;color:#9c9c9c;font-size:13px;">Room Availability${quoteForm.bandName ? ` for ${escapeHtml(quoteForm.bandName)}` : ""}</p>
    </div>
    <div style="background:#fff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
      <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">${greeting}</p>
      ${slotBlocks}
      <p style="font-size:13px;color:#374151;margin:20px 0 0;line-height:1.6;">
        Questions? Email <a href="mailto:${STUDIO_EMAIL}" style="color:#111827;font-weight:600;">${STUDIO_EMAIL}</a>.
      </p>
    </div>
    <div style="padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">${STUDIO_NAME}</p>
    </div>
  </div>
  </body></html>`;
}

function buildEmailHTML(form) {
  const location = getRoomLocation(form.room);
  const hrs = calcHours(form.startTime, form.endTime);
  const numDays = form.bookingType === "daily" ? calcDays(form.eventDate, form.endDate) : 1;
  const sessionTotal = calcSessionTotal(form);
  const rentalTotal = calcRentalTotal(form);
  const discountAmount = calcDiscountAmount(form);
  const total = calcTotal(form);
  const rentals = rentalSummaryText(form);

  const sessionLine = form.bookingType === "hourly"
    ? `${fmtTime(form.startTime)} – ${fmtTime(form.endTime)} (${hrs} hrs @ $${form.hourlyRate}/hr)`
    : `${numDays} day(s) @ $${form.dailyRate}/day`;

  // Multi-session: gate codes can differ by room, so list every unique room
  // used in the batch instead of a single location block.
  const uniqueRoomLocations = form.multiSession
    ? [...new Map(form.sessions.filter(s => s.room).map(s => [s.room, getRoomLocation(s.room)])).entries()]
    : [];

  const gateBlock = form.multiSession
    ? (uniqueRoomLocations.some(([, loc]) => loc.gateCode) ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:18px 22px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">🔐 Gate Access</p>
      ${uniqueRoomLocations.filter(([, loc]) => loc.gateCode).map(([room, loc]) => `
      <p style="margin:0 0 8px;font-size:13px;color:#78350f;"><strong>${room}:</strong> Gate Code <strong>${loc.gateCode}</strong></p>`).join("")}
    </div>` : "")
    : (location.gateCode ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:18px 22px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">🔐 Gate Access Required</p>
      <p style="margin:0 0 10px;font-size:13px;color:#78350f;line-height:1.5;">${location.accessNote}</p>
      <div style="background:#fff;border:1px solid #fde68a;border-radius:6px;padding:10px 16px;display:inline-block;">
        <span style="font-size:13px;color:#92400e;font-weight:500;">Gate Code: </span>
        <span style="font-size:22px;font-weight:700;color:#92400e;letter-spacing:0.15em;">${location.gateCode}</span>
      </div>
    </div>` : "");

  // Multi-session: one line per unique address (not per room, since several
  // rooms usually share a location) instead of repeating full addresses next
  // to every session row in the table above.
  const uniqueLocations = form.multiSession
    ? [...new Map(uniqueRoomLocations.map(([, loc]) => [loc.address, loc])).values()]
    : [];
  const locationsLegend = form.multiSession && uniqueLocations.length > 0 ? `
    <div style="margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Locations</p>
      ${uniqueLocations.map(loc => `
      <p style="margin:0 0 4px;font-size:12.5px;">${mapsLinkHtml(loc.address, `${loc.locationName ? `<strong>${loc.locationName}</strong> — ` : ""}${loc.address}`, "color:#2563eb;text-decoration:none;")}</p>`).join("")}
    </div>` : "";

  const rentalsRow = rentals ? `
    <tr style="border-top:1px solid #f3f4f6;">
      <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;vertical-align:top;width:130px;">Rentals</td>
      <td style="padding:8px 0;font-size:14px;color:#111827;line-height:1.6;">${rentals}</td>
    </tr>` : "";

  const depositRow = form.depositAmount ? `
    <tr style="border-top:1px solid #f3f4f6;">
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Deposit Due${form.depositDue ? " by " + fmtShortDate(form.depositDue) : ""}</td>
      <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;font-weight:500;">$${parseFloat(form.depositAmount).toFixed(2)}</td>
    </tr>` : "";

  const rentalTotalRow = rentalTotal > 0 ? `
    <tr style="border-top:1px solid #f3f4f6;">
      <td style="padding:6px 0;font-size:13px;color:#6b7280;">Rental Total</td>
      <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;font-weight:500;">$${rentalTotal.toFixed(2)}</td>
    </tr>` : "";

  const bookingRows = form.multiSession ? `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;width:130px;vertical-align:top;">Artist / Band</td>
            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">${escapeHtml(form.bandName)}</td>
          </tr>
          <tr style="border-top:1px solid #f3f4f6;">
            <td colspan="2" style="padding:12px 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${form.sessions.length} Session${form.sessions.length !== 1 ? "s" : ""}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0;">
              <table style="width:100%;border-collapse:collapse;">
                ${form.sessions.map(s => {
                  const sLoc = getRoomLocation(s.room);
                  const roomLabel = `${s.room}${sLoc.locationName ? `, ${sLoc.locationName}` : ""}`;
                  // Lock Out rows get their own full-width block (date range on
                  // one line, room below it) instead of squeezing into the same
                  // 3-column grid as Hourly rows — a long date range forced into
                  // a narrow column with nowrap was overflowing past the card
                  // border rather than wrapping.
                  return s.type === "hourly" ? `
                <tr style="border-top:1px solid #f3f4f6;">
                  <td style="padding:7px 10px 7px 0;font-size:13px;color:#111827;font-weight:600;white-space:nowrap;">${fmtDate(s.eventDate)}</td>
                  <td style="padding:7px 10px;font-size:13px;color:#111827;">${roomLabel}</td>
                  <td style="padding:7px 0;font-size:13px;color:#111827;white-space:nowrap;">${fmtTime(s.startTime)} – ${fmtTime(s.endTime)}</td>
                </tr>` : `
                <tr style="border-top:1px solid #f3f4f6;">
                  <td colspan="3" style="padding:7px 0;font-size:13px;color:#111827;">
                    <div style="font-weight:600;">${formatDateRange(s.eventDate, s.endDate)} <span style="color:#9ca3af;font-weight:400;">(Lock Out)</span></div>
                    <div style="color:#6b7280;font-size:12.5px;margin-top:2px;">${roomLabel}</div>
                  </td>
                </tr>`;
                }).join("")}
              </table>
            </td>
          </tr>
          ${rentalsRow}
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Status</td>
            <td style="padding:8px 0;">
              <span style="background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;border:1px solid #bbf7d0;">Confirmed</span>
            </td>
          </tr>` : `
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;width:130px;">Artist / Band</td>
            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">${escapeHtml(form.bandName)}</td>
          </tr>
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Room</td>
            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">${form.room}</td>
          </tr>
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;vertical-align:top;">Address</td>
            <td style="padding:8px 0;font-size:14px;font-weight:500;line-height:1.5;">${mapsLinkHtml(location.address, location.address, "color:#2563eb;text-decoration:none;")}</td>
          </tr>
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Date</td>
            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">
              ${form.bookingType === "daily" ? formatDateRange(form.eventDate, form.endDate) : fmtDate(form.eventDate)}
            </td>
          </tr>
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;vertical-align:top;">Session</td>
            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${sessionLine}</td>
          </tr>
          ${rentalsRow}
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="padding:8px 0;font-size:13px;color:#6b7280;font-weight:500;">Status</td>
            <td style="padding:8px 0;">
              <span style="background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;border:1px solid #bbf7d0;">Confirmed</span>
            </td>
          </tr>`;

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <div style="background:#121212;padding:28px 32px;border-radius:4px 4px 0 0;border-bottom:2px solid #ffffff;">
      <h1 style="margin:0;color:#f2f2f0;font-size:22px;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;">${STUDIO_NAME}</h1>
      <p style="margin:6px 0 0;color:#9c9c9c;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-family:'Courier New',monospace;">Booking Confirmation</p>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 4px 4px;">
      <p style="font-size:15px;color:#374151;margin:0 0 24px;line-height:1.6;">${escapeHtml(form.customGreeting || defaultGreeting(form)).replace(/\n/g, "<br>")}</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Booking Details</p>
        <table style="width:100%;border-collapse:collapse;">
          ${bookingRows}
        </table>
      </div>
      ${gateBlock}
      ${locationsLegend}
      ${form.hidePricingInEmail ? "" : `
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">Pricing Summary</p>
        <table style="width:100%;border-collapse:collapse;">
          ${sessionTotal > 0 ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280;">Session Total</td><td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;font-weight:500;">$${sessionTotal.toFixed(2)}</td></tr>` : ""}
          ${rentalTotalRow}
          ${discountAmount > 0 ? `<tr style="border-top:1px solid #f3f4f6;"><td style="padding:6px 0;font-size:13px;color:#15803d;">${discountLabel(form)}</td><td style="padding:6px 0;font-size:14px;color:#15803d;text-align:right;font-weight:500;">−$${discountAmount.toFixed(2)}</td></tr>` : ""}
          <tr style="border-top:2px solid #e5e7eb;">
            <td style="padding:10px 0 6px;font-size:14px;color:#111827;font-weight:700;">Grand Total</td>
            <td style="padding:10px 0 6px;font-size:22px;color:#111827;text-align:right;font-weight:700;">$${total.toFixed(2)}</td>
          </tr>
          ${depositRow}
        </table>
      </div>`}
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;margin-bottom:28px;">
        <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">How to Pay</p>
        <a href="${STUDIO_PORTAL_URL}" style="display:inline-block;background:#121212;color:#f2f2f0;font-size:13px;font-weight:600;padding:11px 22px;border-radius:6px;text-decoration:none;margin-bottom:16px;">Pay Online →</a>
        <p style="margin:0 0 4px;font-size:13px;color:#374151;line-height:1.6;">
          <strong>Or pay by Zelle:</strong> ${STUDIO_ZELLE}
        </p>
        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
          Please include "${escapeHtml(form.bandName)}" in the memo so we can match your payment${(!form.hidePricingInEmail && form.depositAmount) ? ` — $${parseFloat(form.depositAmount).toFixed(2)} due${form.depositDue ? ` by ${fmtShortDate(form.depositDue)}` : ""}` : ""}.
        </p>
      </div>
      <p style="font-size:14px;color:#374151;margin:0 0 6px;line-height:1.6;">We look forward to having you at ${STUDIO_NAME}!</p>
      <p style="font-size:14px;color:#374151;margin:0 0 24px;line-height:1.6;">
        Questions? Email <a href="mailto:${STUDIO_EMAIL}" style="color:#111827;font-weight:600;">${STUDIO_EMAIL}</a>.
      </p>
      <p style="font-size:14px;color:#374151;margin:0;">
        Warm regards,<br><strong>The Booking Team</strong><br>
        <span style="color:#9ca3af;">${STUDIO_NAME}</span>
      </p>
    </div>
    <div style="padding:20px 32px;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0 0 3px;">${STUDIO_NAME}</p>
      <p style="font-size:11px;color:#c4c9d4;margin:0;">${[...new Set(Object.values(getConfig().rooms).map(r => r.address).filter(Boolean))].join(" · ")}</p>
    </div>
  </div>`;
}

// ─── Calendar description builder ─────────────────────────────────────────────
// ─── Staff prep flags (event title prefix) ────────────────────────────────────
// Lets closing/setup staff tell what a booking needs at a glance, without
// opening it. Exactly ONE marker per booking — never combined/concatenated:
//   *   = closing/prep staff need to check something (setup notes, stage plot)
//   **  = same, and it also involves equipment rentals (** fully covers *,
//         so a booking with rentals just shows ** — it never also shows *)
//   *** = flagged for the booking staff's attention (set manually) — takes
//         priority over the other two if it's set
const FLAG_ORDER = ["*", "**", "***"];
function buildFlagPrefix({ hasSetup, hasRentals, needsAttention }) {
  if (needsAttention) return "*** ";
  if (hasRentals) return "** ";
  if (hasSetup) return "* ";
  return "";
}
// Adds a flag to an existing event title (used when a stage plot arrives
// after the booking was created, from the Availability panel's upload
// button) — but only if the title doesn't already carry an equal-or-higher
// priority flag, since these are single markers, not a stacked/combined set.
function ensureFlagOnTitle(title, symbol) {
  const m = title.match(/^(\*{1,3})\s(.*)$/);
  if (m) {
    if (FLAG_ORDER.indexOf(m[1]) >= FLAG_ORDER.indexOf(symbol)) return title;
    return `${symbol} ${m[2]}`;
  }
  return `${symbol} ${title}`;
}

// ─── Daily Rundown helpers ─────────────────────────────────────────────────
// Best-effort parsing of events THIS APP created (standard title/description
// format) — an event added manually in Google Calendar won't have a flag or
// a "Rentals:" line, and just falls back to the plain-title, no-flag case.
function parseEventFlag(title) {
  const m = (title || "").match(/^(\*{1,3})\s/);
  return m ? m[1] : null;
}
function stripEventFlag(title) {
  return (title || "").replace(/^\*{1,3}\s/, "");
}
function parseRentalsFromDescription(desc) {
  const m = (desc || "").match(/^Rentals:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}
// Hourly bookings default to using the room's house backline; Lock Outs
// default to none (productions usually bring their own) UNLESS rentals were
// specifically requested, in which case those items need to be set up.
function backlineNoteFor(isAllDay, rentalsText) {
  if (isAllDay) return rentalsText ? `Needs Backline — ${rentalsText}` : "No Backline Required";
  return rentalsText ? `Needs Backline — ${rentalsText}` : "Needs Backline";
}
// For a Lock Out event overlapping the rundown date, returns which day of
// the lockout that date falls on (e.g. "Day 2/2", "Day 3/5"). ev.start/end
// are "YYYY-MM-DD" strings for all-day events — end is exclusive.
function lockoutDayInfo(ev, rundownDate) {
  const lastDayStr = addDaysToDateString(ev.end, -1);
  const totalDays = calcDays(ev.start, lastDayStr);
  const dayNumber = calcDays(ev.start, isoDateKey(rundownDate));
  return { dayNumber: Math.min(Math.max(dayNumber, 1), totalDays), totalDays };
}
// Groups rundown events by physical address (in the order rooms are defined
// in Settings), and within each address: Lock Outs first (by room name),
// then Hourly bookings in chronological order.
function groupRundownByLocation(events, config) {
  const addressOrder = [];
  const seenAddr = new Set();
  Object.keys(config.rooms).forEach(r => {
    const addr = config.rooms[r].address;
    if (addr && !seenAddr.has(addr)) { seenAddr.add(addr); addressOrder.push(addr); }
  });
  return addressOrder
    .map(address => {
      const evs = events.filter(ev => getRoomLocation(ev.room).address === address);
      const lockouts = evs.filter(ev => ev.allDay).sort((a, b) => (a.room || "").localeCompare(b.room || ""));
      const hourlies = evs.filter(ev => !ev.allDay).sort((a, b) => new Date(a.start) - new Date(b.start));
      return { address, events: [...lockouts, ...hourlies] };
    })
    .filter(g => g.events.length > 0);
}
// One box per room instead of two separate Today/Prep lists — shows today's
// booking(s) in that room alongside the instruction for what the room needs
// before the NEXT booking day, with the reasoning built into the sentence
// ("Reset Room — No Backline Required (Lock Out loading in next)"). A Lock
// Out that's still ongoing from today into the prep date is recognized as
// the same booking continuing, not something to reset for.
function buildRoomRundown(todayEvents, prepEvents, config, prepDate) {
  const rooms = new Set([...todayEvents, ...prepEvents].map(e => e.room).filter(Boolean));
  const entries = [...rooms].map(room => {
    const todays = todayEvents.filter(e => e.room === room).sort((a, b) => new Date(a.start) - new Date(b.start));
    const prepEv = prepEvents.find(e => e.room === room) || null;
    const continuing = !!(prepEv && todays.some(t => t.id === prepEv.id));
    let prepLine = null;
    if (prepEv && continuing) {
      prepLine = "Lock Out continues";
    } else if (prepEv) {
      const rentals = parseRentalsFromDescription(prepEv.description);
      const backline = backlineNoteFor(prepEv.allDay, rentals);
      const verb = todays.length > 0 ? "Reset Room" : "Set Up Room";
      const typeLabel = prepEv.allDay ? "Lock Out" : "Hourly booking";
      prepLine = `${verb} — ${backline} (${typeLabel} loading in next)`;
    }
    return { room, address: getRoomLocation(room).address, todays, prepEv, continuing, prepLine, flag: prepEv ? parseEventFlag(prepEv.title) : null };
  });
  const rank = e => !e.prepEv ? 2 : (e.prepEv.allDay ? 0 : 1);
  entries.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return new Date(a.prepEv.start) - new Date(b.prepEv.start);
    return a.room.localeCompare(b.room);
  });
  const addressOrder = [];
  const seenAddr = new Set();
  Object.keys(config.rooms).forEach(r => {
    const addr = config.rooms[r].address;
    if (addr && !seenAddr.has(addr)) { seenAddr.add(addr); addressOrder.push(addr); }
  });
  return addressOrder
    .map(address => ({ address, rooms: entries.filter(e => e.address === address) }))
    .filter(g => g.rooms.length > 0);
}

function buildCalDesc(form) {
  const location = getRoomLocation(form.room);
  const hrs = calcHours(form.startTime, form.endTime);
  const rentals = rentalSummaryText(form, { includePrices: false });
  return [
    `Artist/Band: ${form.bandName}`,
    `Contact: ${form.contactName}`,
    `Room: ${form.room}`,
    location.gateCode ? `Gate Code: ${location.gateCode}` : "",
    form.bookingType === "hourly"
      ? `Session: ${fmtTime(form.startTime)} – ${fmtTime(form.endTime)} (${hrs} hrs)`
      : `Session: ${calcDays(form.eventDate, form.endDate)} day(s)`,
    rentals ? `Rentals: ${rentals}` : "",
    form.depositAmount ? `Deposit due ${fmtShortDate(form.depositDue)}` : "",
    form.calendarNotes ? `\nNotes:\n${form.calendarNotes}` : "",
  ].filter(Boolean).join("\n");
}
// Same as buildCalDesc, but for ONE session inside a multi-session batch —
// includes the rest of the series so staff opening any single event on the
// calendar can see the whole booking at a glance, not just this one date.
function buildSessionCalDesc(session, form, index) {
  const location = getRoomLocation(session.room);
  const hrs = calcHours(session.startTime, session.endTime);
  const rentals = rentalSummaryText(form, { includePrices: false });
  const isHourly = session.type === "hourly";
  const seriesList = form.sessions
    .map((s, i) => s.type === "hourly"
      ? `${i === index ? "→" : " "} ${fmtDate(s.eventDate)}  ${fmtTime(s.startTime)}–${fmtTime(s.endTime)}  ·  ${s.room}`
      : `${i === index ? "→" : " "} ${formatDateRange(s.eventDate, s.endDate)}  ·  ${s.room}  (Lock Out)`)
    .join("\n");
  return [
    `Artist/Band: ${form.bandName}`,
    `Contact: ${form.contactName}`,
    `Room: ${session.room}`,
    location.gateCode ? `Gate Code: ${location.gateCode}` : "",
    isHourly
      ? `Session: ${fmtTime(session.startTime)} – ${fmtTime(session.endTime)} (${hrs} hrs)`
      : `Lockout: ${calcDays(session.eventDate, session.endDate)} day(s)`,
    rentals ? `Rentals: ${rentals}` : "",
    form.depositAmount ? `Deposit due ${fmtShortDate(form.depositDue)}` : "",
    form.calendarNotes ? `\nNotes:\n${form.calendarNotes}` : "",
    `\nPart of a ${form.sessions.length}-booking series:\n${seriesList}`,
  ].filter(Boolean).join("\n");
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  label: { display: "block", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted, marginBottom: 7, fontWeight: "500", fontFamily: FONT.mono },
  input: { width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "10px 13px", fontSize: 14, fontFamily: FONT.body, boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s" },
};
const SEL = { ...S.input, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239c9c9c'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 13px center", paddingRight: 34 };

function Sect({ children }) {
  return <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted, marginBottom: 14, paddingBottom: 9, borderBottom: `1px solid ${C.border}`, fontWeight: "500", fontFamily: FONT.mono }}>{children}</div>;
}
function Inp({ label, value, onChange, type = "text", span, placeholder, disabled }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      {label && <label style={S.label}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={{ ...S.input, opacity: disabled ? 0.5 : 1 }} />
    </div>
  );
}
function Pill({ ok, label, okMsg, failMsg }) {
  return (
    <div style={{ padding: "14px 20px", background: ok ? C.successBg : C.dangerBg, border: `1px solid ${ok ? C.successBorder : C.dangerBorder}`, borderRadius: 3, minWidth: 160 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONT.mono, color: ok ? C.success : C.danger, marginBottom: 5, fontWeight: "500" }}>{label}</div>
      <div style={{ fontSize: 13, color: ok ? C.success : C.danger, fontWeight: "500", fontFamily: FONT.body }}>{ok ? `✓ ${okMsg}` : `⚠ ${failMsg}`}</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { token, authLoading, signIn, signOut } = useGoogleAuth();
  const [tab, setTab]           = useState("booking");
  const [step, setStep]         = useState("details");
  const [theme, setTheme] = useState(() => localStorage.getItem("matesTheme") || "dark");
  useEffect(() => { localStorage.setItem("matesTheme", theme); }, [theme]);
  const [form, setForm]         = useState(() => ({ ...EMPTY_FORM, rentalRates: Object.fromEntries(getConfig().gear.map(g => [g.name, g.rate])) }));
  const [emailPreview, setEmailPreview] = useState(null);
  const [replyMode, setReplyMode] = useState(false); // "reply in existing thread" toggled on in Review step
  const [threadResults, setThreadResults] = useState(null); // null = not searched yet, [] = searched, no matches
  const [searchingThreads, setSearchingThreads] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(null);
  const [toast, setToast]       = useState(null);
  const [calEvents, setCalEvents] = useState([]);
  const [loadingCal, setLoadingCal] = useState(false);

  // ─── Daily Rundown ────────────────────────────────────────────────────────
  const [rundownDate, setRundownDate] = useState(() => addDays(new Date(), 1)); // "Prep" section — defaults to tomorrow, still navigable
  const [rundownEvents, setRundownEvents] = useState([]);
  const [rundownLoading, setRundownLoading] = useState(false);
  const [todayEvents, setTodayEvents] = useState([]); // "Today" section — always the real current date, not navigable
  const [todayLoading, setTodayLoading] = useState(false);
  const [checkedCrew, setCheckedCrew] = useState(() => new Set());
  const [sendingRundown, setSendingRundown] = useState(false);
  const [rundownSent, setRundownSent] = useState(false);

  useEffect(() => {
    if (tab !== "rundown" || !token) return;
    let cancelled = false;
    setRundownLoading(true); setRundownSent(false);
    const dayStart = new Date(rundownDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);
    listCalendarEventsInRange(token, dayStart.toISOString(), dayEnd.toISOString())
      .then(evs => { if (!cancelled) setRundownEvents(evs.sort((a, b) => (a.room || "").localeCompare(b.room || ""))); })
      .catch(() => { if (!cancelled) showToast("Couldn't load bookings for that day", "error"); })
      .finally(() => { if (!cancelled) setRundownLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, rundownDate.getTime()]);

  useEffect(() => {
    if (tab !== "rundown" || !token) return;
    let cancelled = false;
    setTodayLoading(true);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = addDays(dayStart, 1);
    listCalendarEventsInRange(token, dayStart.toISOString(), dayEnd.toISOString())
      .then(evs => { if (!cancelled) setTodayEvents(evs); })
      .catch(() => { if (!cancelled) showToast("Couldn't load today's bookings", "error"); })
      .finally(() => { if (!cancelled) setTodayLoading(false); });
    return () => { cancelled = true; };
  }, [tab, token]);

  const toggleCrewChecked = i => setCheckedCrew(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const sendRundown = async () => {
    const recipients = config.nightCrew.filter((_, i) => checkedCrew.has(i)).map(p => p.email).filter(Boolean);
    if (recipients.length === 0) { showToast("Check off at least one crew member first", "error"); return; }
    setSendingRundown(true);
    try {
      const subject = `${STUDIO_NAME} Daily Rundown — ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
      const roomBoxHtml = r => {
        const stagePlot = r.prepEv ? (r.prepEv.attachments || []).find(a => a.title?.startsWith("Stage Plot")) : null;
        const todayLines = r.todays.length > 0
          ? r.todays.map(ev => {
              const timeStr = ev.allDay
                ? (() => { const { dayNumber, totalDays } = lockoutDayInfo(ev, new Date()); return `All day ${dayNumber}/${totalDays}`; })()
                : `${new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(ev.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
              return `<div style="font-size:13px;color:#111827;">${stripEventFlag(ev.title)} — <span style="color:#6b7280;">${timeStr}</span></div>`;
            }).join("")
          : `<div style="font-size:13px;color:#9ca3af;">Nothing booked today.</div>`;
        return `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;margin-bottom:8px;">
            <div style="font-size:13.5px;font-weight:700;color:#111827;margin-bottom:6px;">${r.room}${r.flag ? ` <span style="color:#b45309;">${r.flag}</span>` : ""}</div>
            ${todayLines}
            ${r.prepLine ? `<div style="font-size:13px;color:${r.continuing ? "#2563eb" : "#b45309"};font-weight:600;margin-top:6px;">→ ${r.prepLine}</div>` : ""}
            ${stagePlot ? `<a href="${stagePlot.fileUrl}" style="display:inline-block;margin-top:4px;font-size:12px;color:#2563eb;text-decoration:none;">📎 View Stage Plot</a>` : ""}
          </div>`;
      };
      const roomGroups = buildRoomRundown(todayEvents, rundownEvents, config, rundownDate);
      const groupsHtml = roomGroups.length === 0 ? `<p style="font-size:14px;color:#6b7280;">Nothing on the calendar for either day.</p>` : roomGroups.map(g => `
        <p style="margin:18px 0 6px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">📍 ${g.address}</p>
        ${g.rooms.map(roomBoxHtml).join("")}`).join("");

      const htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
          <div style="background:#121212;padding:24px 28px;border-radius:4px 4px 0 0;">
            <h1 style="margin:0;color:#f2f2f0;font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">${STUDIO_NAME} Daily Rundown</h1>
            <p style="margin:6px 0 0;color:#9c9c9c;font-size:13px;">Today (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}) → Prepping for ${rundownDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 4px 4px;">
            ${groupsHtml}
            <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">* = check notes/stage plot · ** = rentals to set up · *** = flagged for booking staff</p>
            ${config.closingNotes ? `<div style="margin-top:18px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#374151;line-height:1.6;">${config.closingNotes}</div>` : ""}
          </div>
        </div>`;
      await gmailSend(token, recipients.join(", "), subject, htmlBody);
      setRundownSent(true);
      showToast(`Rundown sent to ${recipients.length} crew member${recipients.length !== 1 ? "s" : ""}`);
    } catch (e) { console.error("Rundown send:", e); showToast("Couldn't send the rundown — check the console", "error"); }
    setSendingRundown(false);
  };

  // ─── Availability side panel (Day/Week/Month) ───────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState("week");
  const [panelDate, setPanelDate] = useState(() => new Date());
  const [panelEvents, setPanelEvents] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingPlot, setUploadingPlot] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem("matesPanelWidth"), 10);
    return saved >= 380 && saved <= 1100 ? saved : 680;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    const onMove = e => {
      if (!resizingRef.current) return;
      setPanelWidth(Math.min(1100, Math.max(380, window.innerWidth - e.clientX)));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPanelWidth(w => { localStorage.setItem("matesPanelWidth", w); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const startResize = () => { resizingRef.current = true; setIsResizing(true); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; };

  const panelGrid = getPanelGrid(panelView, panelDate);

  // Also called manually right after a booking is previewed or confirmed, so
  // the panel never shows stale data just because it happened to already be open.
  const refreshPanelEvents = async () => {
    if (!token) return;
    setPanelLoading(true);
    try { setPanelEvents(await listCalendarEventsInRange(token, panelGrid.gridStart.toISOString(), panelGrid.gridEnd.toISOString())); }
    catch { showToast("Couldn't load calendar", "error"); }
    setPanelLoading(false);
  };

  useEffect(() => {
    if (!panelOpen || !token) return;
    let cancelled = false;
    setPanelLoading(true);
    listCalendarEventsInRange(token, panelGrid.gridStart.toISOString(), panelGrid.gridEnd.toISOString())
      .then(evs => { if (!cancelled) setPanelEvents(evs); })
      .catch(() => { if (!cancelled) showToast("Couldn't load calendar", "error"); })
      .finally(() => { if (!cancelled) setPanelLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, token, panelView, panelGrid.gridStart.getTime(), panelGrid.gridEnd.getTime()]);

  const openEventDetail = ev => { setSelectedEvent(ev); setNoteDraft(ev.description || ""); };
  const closeEventDetail = () => { setSelectedEvent(null); setNoteDraft(""); };
  const saveNote = async () => {
    if (!selectedEvent) return;
    setSavingNote(true);
    try {
      await googleCalendarUpdateDescription(token, selectedEvent.calendarId, selectedEvent.id, noteDraft);
      setPanelEvents(evs => evs.map(e => e.id === selectedEvent.id ? { ...e, description: noteDraft } : e));
      setSelectedEvent(e => e && { ...e, description: noteDraft });
      showToast("Notes saved to calendar event");
    } catch { showToast("Couldn't save notes", "error"); }
    setSavingNote(false);
  };
  const uploadStagePlotToEvent = async file => {
    if (!selectedEvent || !file) return;
    setUploadingPlot(true);
    try {
      const uploaded = await driveUploadFile(token, file);
      const attachment = { fileUrl: uploaded.fileUrl, title: `Stage Plot — ${uploaded.title}`, mimeType: uploaded.mimeType };
      const newTitle = ensureFlagOnTitle(selectedEvent.title, "*");
      await googleCalendarAddAttachment(token, selectedEvent.calendarId, selectedEvent.id, selectedEvent.attachments, attachment, newTitle !== selectedEvent.title ? newTitle : undefined);
      const nextAttachments = [...(selectedEvent.attachments || []).filter(a => a.title !== attachment.title), attachment];
      setPanelEvents(evs => evs.map(e => e.id === selectedEvent.id ? { ...e, attachments: nextAttachments, title: newTitle } : e));
      setSelectedEvent(e => e && { ...e, attachments: nextAttachments, title: newTitle });
      showToast("Stage plot attached");
    } catch { showToast("Couldn't upload stage plot", "error"); }
    setUploadingPlot(false);
  };
  const duplicateAsBooking = ev => {
    const start = parseEventBoundary(ev.start, ev.allDay);
    setForm({
      ...EMPTY_FORM,
      rentalRates: Object.fromEntries(config.gear.map(g => [g.name, g.rate])),
      room: ev.room,
      eventDate: isoDateKey(start),
      hourlyRate: getRoomRates(ev.room).hourly ?? "",
      dailyRate: getRoomRates(ev.room).daily ?? "",
    });
    setTab("booking"); setStep("details"); closeEventDetail(); setPanelOpen(false);
    showToast(`Room & date filled in for ${ev.room} — add the client's details`);
  };
  const [conflicts, setConflicts] = useState([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [sessionConflicts, setSessionConflicts] = useState({}); // { [session.key]: conflictEvents[] }
  const [clients, setClients]   = useState(loadClients);
  const [clientSearch, setClientSearch] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef(null);

  // Live rooms/gear config — seeded from localStorage (or defaults), editable from Settings.
  const [config, setConfigState] = useState(getConfig);

  // Pulls in the shared Contacts sheet once a token's available, merges it
  // with whatever's saved locally, and — importantly — writes the merged
  // result back to local storage too, so a contact synced from the sheet is
  // still there next time even if this fetch fails (offline, API hiccup).
  useEffect(() => {
    if (!token || !config.contactsSheetId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await sheetsGetValues(token, config.contactsSheetId, "A2:E");
        if (cancelled) return;
        const merged = mergeClientRecords(loadClients(), rows);
        localStorage.setItem(CLIENTS_KEY, JSON.stringify(merged.slice(0, 300)));
        setClients(merged);
      } catch (e) { console.error("Contacts sheet fetch:", e); }
    })();
    return () => { cancelled = true; };
  }, [token, config.contactsSheetId]);
  const [gearSearch, setGearSearch] = useState("");
  const [configImportText, setConfigImportText] = useState("");
  const [showConfigImport, setShowConfigImport] = useState(false);
  const updateConfig = updater => {
    setConfigState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setConfig(next); // sync module cache + localStorage so non-render code (email/calendar builders) sees it too
      return next;
    });
  };
  const ROOMS = Object.keys(config.rooms);

  // ─── Quote ────────────────────────────────────────────────────────────────
  const [quoteForm, setQuoteForm] = useState({ bandName: "", contactName: "", contactEmail: "", bookingType: "hourly", slots: [newQuoteSlot()], greeting: "" });
  const setQF = (key, val) => setQuoteForm(f => ({ ...f, [key]: val }));
  const [quoteResults, setQuoteResults] = useState(null); // null = not checked yet; else { [slotKey]: [{room, rate, available}] }
  const [quoteSelections, setQuoteSelections] = useState({}); // { "slotKey__RoomName": boolean }
  const [checkingQuote, setCheckingQuote] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);

  const resetQuote = () => {
    setQuoteForm({ bandName: "", contactName: "", contactEmail: "", bookingType: "hourly", slots: [newQuoteSlot()], greeting: "" });
    setQuoteResults(null); setQuoteSelections({}); setQuoteSent(false);
  };

  const quoteSlotValid = (slot, bookingType) => bookingType === "hourly"
    ? !!(slot.eventDate && slot.startTime && slot.endTime)
    : !!(slot.eventDate && slot.endDate && calcDays(slot.eventDate, slot.endDate) > 0);
  const quoteReadyToCheck = quoteForm.slots.length > 0 && quoteForm.slots.every(s => quoteSlotValid(s, quoteForm.bookingType));

  const checkQuoteAvailability = async () => {
    if (!token) { showToast("Connect Google first", "error"); return; }
    setCheckingQuote(true); setQuoteSent(false);
    try {
      const eligibleRooms = ROOMS.filter(r => {
        const rates = getRoomRates(r);
        return quoteForm.bookingType === "hourly" ? rates.hourly != null : rates.daily != null;
      });
      const results = {};
      for (const slot of quoteForm.slots) {
        const roomChecks = await Promise.all(eligibleRooms.map(async room => {
          const loc = getRoomLocation(room);
          const rates = getRoomRates(room);
          try {
            const timeMinISO = quoteForm.bookingType === "hourly"
              ? new Date(`${slot.eventDate}T${slot.startTime}:00`).toISOString()
              : new Date(`${slot.eventDate}T00:00:00`).toISOString();
            const timeMaxISO = quoteForm.bookingType === "hourly"
              ? new Date(`${slot.eventDate}T${slot.endTime}:00`).toISOString()
              : new Date(`${slot.endDate}T23:59:59`).toISOString();
            const conflicts = await checkRoomConflicts(token, loc.calendarId, timeMinISO, timeMaxISO);
            return { room, rate: quoteForm.bookingType === "hourly" ? rates.hourly : rates.daily, available: conflicts.length === 0 };
          } catch { return { room, rate: quoteForm.bookingType === "hourly" ? rates.hourly : rates.daily, available: false }; }
        }));
        results[slot.key] = roomChecks;
      }
      setQuoteResults(results);
      const sel = {};
      Object.entries(results).forEach(([slotKey, rooms]) => rooms.forEach(r => { if (r.available) sel[`${slotKey}__${r.room}`] = true; }));
      setQuoteSelections(sel);
    } catch (e) { console.error("Quote check:", e); showToast("Couldn't check availability — check the console", "error"); }
    setCheckingQuote(false);
  };

  const sendQuote = async () => {
    if (!token) { showToast("Connect Google first", "error"); return; }
    if (!quoteForm.contactEmail) { showToast("Add a contact email first", "error"); return; }
    setSendingQuote(true);
    try {
      const subject = `${STUDIO_NAME} — Room Availability${quoteForm.bandName ? ` for ${quoteForm.bandName}` : ""}`;
      const htmlBody = buildQuoteEmailHTML(quoteForm, quoteResults, quoteSelections);
      await gmailSend(token, quoteForm.contactEmail, subject, htmlBody);
      setQuoteSent(true);
      showToast("Quote sent");
    } catch (e) { console.error("Quote send:", e); showToast("Couldn't send the quote — check the console", "error"); }
    setSendingQuote(false);
  };


  const renameRoom = (oldName, rawNewName) => {
    const newName = rawNewName.trim();
    if (!newName || newName === oldName) return;
    updateConfig(prev => {
      if (prev.rooms[newName]) { showToast(`A room named "${newName}" already exists`, "error"); return prev; }
      const { [oldName]: data, ...rest } = prev.rooms;
      const rooms = { ...rest, [newName]: data };
      // keep insertion order stable-ish by rebuilding in original key order with the rename applied
      const ordered = {};
      Object.keys(prev.rooms).forEach(k => { ordered[k === oldName ? newName : k] = rooms[k === oldName ? newName : k]; });
      return { ...prev, rooms: ordered };
    });
  };
  const updateRoomField = (room, field, value) => {
    updateConfig(prev => ({ ...prev, rooms: { ...prev.rooms, [room]: { ...prev.rooms[room], [field]: value } } }));
  };
  const addRoom = () => {
    let n = 1, name = "New Room";
    while (config.rooms[name]) { name = `New Room ${++n}`; }
    updateConfig(prev => ({ ...prev, rooms: { ...prev.rooms, [name]: { address: "", locationName: "", gateCode: "", accessNote: "", calendarId: "", hourly: 0, daily: 0 } } }));
  };
  const removeRoom = room => {
    if (!window.confirm(`Remove "${room}" from the room list? This won't affect any calendar events already created.`)) return;
    updateConfig(prev => { const { [room]: _, ...rest } = prev.rooms; return { ...prev, rooms: rest }; });
  };
  const renameGear = (idx, rawNewName) => {
    const newName = rawNewName.trim();
    if (!newName) return;
    updateConfig(prev => ({ ...prev, gear: prev.gear.map((g, i) => i === idx ? { ...g, name: newName } : g) }));
  };
  const updateGearRate = (idx, rate) => {
    updateConfig(prev => ({ ...prev, gear: prev.gear.map((g, i) => i === idx ? { ...g, rate: parseFloat(rate) || 0 } : g) }));
  };
  const addGear = () => {
    updateConfig(prev => ({ ...prev, gear: [...prev.gear, { name: "New Item", rate: 0 }] }));
  };
  const removeGear = idx => {
    updateConfig(prev => ({ ...prev, gear: prev.gear.filter((_, i) => i !== idx) }));
  };
  const resetRoomsToDefault = () => {
    if (!window.confirm("Reset all room settings back to the built-in defaults? This can't be undone.")) return;
    updateConfig(prev => ({ ...prev, rooms: DEFAULT_ROOMS }));
  };
  const resetGearToDefault = () => {
    if (!window.confirm("Reset the gear list back to the built-in defaults? This can't be undone.")) return;
    updateConfig(prev => ({ ...prev, gear: DEFAULT_GEAR }));
  };
  const renameCrewMember = (idx, name) => {
    updateConfig(prev => ({ ...prev, nightCrew: prev.nightCrew.map((p, i) => i === idx ? { ...p, name } : p) }));
  };
  const updateCrewEmail = (idx, email) => {
    updateConfig(prev => ({ ...prev, nightCrew: prev.nightCrew.map((p, i) => i === idx ? { ...p, email } : p) }));
  };
  const addCrewMember = () => {
    updateConfig(prev => ({ ...prev, nightCrew: [...prev.nightCrew, { name: "New Person", email: "" }] }));
  };
  const removeCrewMember = idx => {
    updateConfig(prev => ({ ...prev, nightCrew: prev.nightCrew.filter((_, i) => i !== idx) }));
  };
  const [uploadingPolicy, setUploadingPolicy] = useState(null); // "hourly" | "lockout" | null
  const uploadPolicyFile = async (kind, file) => {
    if (!token || !file) return;
    setUploadingPolicy(kind);
    try {
      const uploaded = await driveUploadFile(token, file);
      updateConfig(prev => ({ ...prev, [kind === "hourly" ? "hourlyPolicyFile" : "lockoutPolicyFile"]: { fileId: uploaded.fileId, fileName: uploaded.title } }));
      showToast(`${kind === "hourly" ? "Hourly" : "Lock Out"} policy uploaded`);
    } catch (e) { console.error("Policy upload:", e); showToast("Couldn't upload the policy PDF", "error"); }
    setUploadingPolicy(null);
  };
  const removePolicyFile = kind => {
    updateConfig(prev => ({ ...prev, [kind === "hourly" ? "hourlyPolicyFile" : "lockoutPolicyFile"]: null }));
  };
  const exportConfig = () => {
    navigator.clipboard?.writeText(JSON.stringify(config, null, 2))
      .then(() => showToast("Config copied — paste it into Settings on your other computer"))
      .catch(() => showToast("Couldn't copy — check clipboard permissions", "error"));
  };
  // Real file download, not just clipboard — cleaner to email/AirDrop as an
  // attachment than pasting a big JSON blob directly into a message.
  const downloadConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(STUDIO_NAME)}-config.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Config file downloaded");
  };
  const applyImportedConfigText = text => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.rooms || !parsed.gear) throw new Error("missing rooms/gear");
      updateConfig(parsed);
      showToast("Settings imported");
      return true;
    } catch {
      showToast("That doesn't look like valid config JSON", "error");
      return false;
    }
  };
  const importConfig = () => {
    if (applyImportedConfigText(configImportText)) { setConfigImportText(""); setShowConfigImport(false); }
  };
  const importConfigFile = file => {
    const reader = new FileReader();
    reader.onload = e => applyImportedConfigText(e.target.result);
    reader.onerror = () => showToast("Couldn't read that file", "error");
    reader.readAsText(file);
  };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4500); };

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filteredClients = clients.filter(c =>
    clientSearch.length > 0 && (
      c.band?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(clientSearch.toLowerCase())
    )
  );

  const selectClient = (c) => {
    const rates = c.lastRoom ? getRoomRates(c.lastRoom) : null;
    setForm(f => ({
      ...f, bandName: c.band, contactName: c.name, contactEmail: c.email,
      ...(rates ? { room: c.lastRoom, hourlyRate: rates.hourly ?? "", dailyRate: rates.daily ?? "" } : {}),
    }));
    setClientSearch(c.band || c.name);
    setShowDrop(false);
  };

  const total = calcTotal(form);
  const location = getRoomLocation(form.room);
  const detailsValid = form.multiSession
    ? form.sessions.length > 0 && form.sessions.every(s => s.type === "hourly"
        ? (s.room && s.eventDate && s.startTime && s.endTime && calcHours(s.startTime, s.endTime) >= 3)
        : (s.room && s.eventDate && s.endDate && calcDays(s.eventDate, s.endDate) > 0))
    : !!(form.room && form.eventDate && (form.bookingType !== "hourly" || calcHours(form.startTime, form.endTime) >= 3) && (form.bookingType !== "daily" || form.endDate));

  // Uploads the stage plot once, shared across every event in a multi-session
  // batch rather than re-uploading per session.
  const ensureStagePlotUploaded = async () => {
    if (!form.stagePlotFile || form.stagePlotAttachment) return { attachment: form.stagePlotAttachment, newlyUploaded: null };
    try {
      const uploaded = await driveUploadFile(token, form.stagePlotFile);
      const attachment = { fileUrl: uploaded.fileUrl, title: `Stage Plot — ${uploaded.title}`, mimeType: uploaded.mimeType };
      return { attachment, newlyUploaded: attachment };
    } catch (e) {
      console.error("Stage plot upload:", e);
      showToast("Stage plot upload failed — you can add it from the Availability panel instead", "error");
      return { attachment: null, newlyUploaded: null };
    }
  };

  // Builds the calendar event body for the single-booking flow.
  const buildEventBody = async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { attachment, newlyUploaded } = await ensureStagePlotUploaded();

    const flagPrefix = buildFlagPrefix({
      hasSetup: !!form.stagePlotFile || !!form.calendarNotes.trim(),
      hasRentals: calcRentalTotal(form) > 0,
      needsAttention: form.staffAttention,
    });

    // Hourly bookings are timed events; Lock Outs are TRUE all-day events
    // (a banner across the day(s), not a 9am–11:59pm time block) — Calendar's
    // all-day "end" date is exclusive, so it's the day AFTER the last day.
    const timing = form.bookingType === "hourly"
      ? {
          start: { dateTime: `${form.eventDate}T${form.startTime || "09:00"}:00`, timeZone: tz },
          end: { dateTime: `${form.eventDate}T${form.endTime || "17:00"}:00`, timeZone: tz },
        }
      : {
          start: { date: form.eventDate },
          end: { date: addDaysToDateString(form.endDate || form.eventDate, 1) },
        };

    const event = {
      summary: `${flagPrefix}${form.bandName} – ${form.room}`,
      description: buildCalDesc(form),
      ...timing,
      guestsCanSeeOtherGuests: false,
      ...(attachment ? { attachments: [attachment] } : {}),
    };
    return { event, newlyUploaded };
  };

  // Same idea, for ONE row of a multi-session batch — room/date/time/rate come
  // from the session itself; everything else (band, notes, rentals, flags,
  // stage plot) is shared across the whole batch.
  const buildSessionEventBody = (session, index, attachment) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const flagPrefix = buildFlagPrefix({
      hasSetup: !!form.stagePlotFile || !!form.calendarNotes.trim(),
      hasRentals: calcRentalTotal(form) > 0,
      needsAttention: form.staffAttention,
    });
    // Hourly sessions are timed events; Lock Out periods are TRUE all-day
    // events, same convention as a single-booking Lock Out. Each row decides
    // for itself — a batch can mix both.
    const timing = session.type === "hourly"
      ? {
          start: { dateTime: `${session.eventDate}T${session.startTime}:00`, timeZone: tz },
          end: { dateTime: `${session.eventDate}T${session.endTime}:00`, timeZone: tz },
        }
      : {
          start: { date: session.eventDate },
          end: { date: addDaysToDateString(session.endDate || session.eventDate, 1) },
        };
    return {
      summary: `${flagPrefix}${form.bandName} – ${session.room}`,
      description: buildSessionCalDesc(session, form, index),
      ...timing,
      guestsCanSeeOtherGuests: false,
      ...(attachment ? { attachments: [attachment] } : {}),
    };
  };

  // Preview → creates (or updates) the calendar event(s) as TENTATIVE right
  // away, so they're visible on the real calendar before the client is ever
  // emailed. Re-clicking Preview after going back to Details updates the same
  // event(s) in place rather than creating duplicates.
  const [savingPreview, setSavingPreview] = useState(false);
  const handlePreview = async () => {
    if (!token) { showToast("Please connect Google first", "error"); return; }
    setSavingPreview(true);

    if (form.multiSession) {
      try {
        const { attachment, newlyUploaded } = await ensureStagePlotUploaded();
        let failCount = 0;
        const updatedSessions = [];
        for (let i = 0; i < form.sessions.length; i++) {
          const s = form.sessions[i];
          try {
            const loc = getRoomLocation(s.room);
            const event = buildSessionEventBody(s, i, attachment);
            let eventId = s.createdEventId, eventCalendarId = s.createdEventCalendarId;
            if (eventId && eventCalendarId && eventCalendarId !== loc.calendarId) {
              await googleCalendarMove(token, eventCalendarId, eventId, loc.calendarId);
              eventCalendarId = loc.calendarId;
            }
            if (eventId) {
              await googleCalendarPatch(token, eventCalendarId, eventId, event);
            } else {
              const created = await googleCalendarCreate(token, loc.calendarId, { ...event, status: "tentative" });
              eventId = created.id; eventCalendarId = loc.calendarId;
            }
            updatedSessions.push({ ...s, createdEventId: eventId, createdEventCalendarId: eventCalendarId });
          } catch (e) {
            console.error(`Session ${i + 1} calendar:`, e);
            failCount++;
            updatedSessions.push(s);
          }
        }
        setForm(f => ({ ...f, sessions: updatedSessions, ...(newlyUploaded ? { stagePlotAttachment: newlyUploaded } : {}) }));
        if (failCount > 0) showToast(`${failCount} of ${form.sessions.length} sessions couldn't be saved — check the console`, "error");
        setEmailPreview(buildEmailHTML({ ...form, sessions: updatedSessions }));
        setReplyMode(false); setThreadResults(null);
        setF("replyThreadId", null); setF("replyMessageId", null); setF("replyCc", "");
        setStep("review");
        refreshPanelEvents();
      } catch (e) {
        console.error("Preview/Calendar (multi):", e);
        showToast("Couldn't save sessions to the calendar — check the console for details", "error");
      }
      setSavingPreview(false);
      return;
    }

    try {
      const { event, newlyUploaded } = await buildEventBody();
      let eventId = form.createdEventId;
      let eventCalendarId = form.createdEventCalendarId;

      if (eventId && eventCalendarId && eventCalendarId !== location.calendarId) {
        // Room changed since the last preview — relocate the tentative event.
        await googleCalendarMove(token, eventCalendarId, eventId, location.calendarId);
        eventCalendarId = location.calendarId;
      }

      if (eventId) {
        await googleCalendarPatch(token, eventCalendarId, eventId, event);
      } else {
        const created = await googleCalendarCreate(token, location.calendarId, { ...event, status: "tentative" });
        eventId = created.id;
        eventCalendarId = location.calendarId;
      }

      setForm(f => ({ ...f, createdEventId: eventId, createdEventCalendarId: eventCalendarId, ...(newlyUploaded ? { stagePlotAttachment: newlyUploaded } : {}) }));
      setEmailPreview(buildEmailHTML(form));
      setReplyMode(false); setThreadResults(null);
      setF("replyThreadId", null); setF("replyMessageId", null); setF("replyCc", "");
      setStep("review");
      refreshPanelEvents();
    } catch (e) {
      console.error("Preview/Calendar:", e);
      showToast("Couldn't save to the calendar — check the console for details", "error");
    }
    setSavingPreview(false);
  };

  const searchForThreads = async () => {
    if (!form.contactEmail) return;
    setSearchingThreads(true);
    try { setThreadResults(await gmailSearchThreads(token, form.contactEmail)); }
    catch { showToast("Couldn't search Gmail", "error"); setThreadResults([]); }
    setSearchingThreads(false);
  };
  const pickThread = t => {
    setForm(f => ({ ...f, replyThreadId: t.id, replyMessageId: t.messageId, replyCc: (t.cc || []).join(", ") }));
  };

  // Confirm — the calendar event(s) already exist (created/updated at Preview
  // time); this just flips them from tentative to confirmed and sends ONE email.
  // Best-effort logging to a running Sheets log — never blocks or shows an
  // error to the user, since a failed log write shouldn't look like a failed
  // booking. Creates the log spreadsheet itself the first time it's needed.
  const logBookingToSheet = async (formSnapshot) => {
    try {
      let sheetId = config.bookingsLogSheetId;
      let sheetTitle = "Sheet1";
      if (!sheetId) {
        const created = await sheetsCreateSpreadsheet(token, `${STUDIO_NAME} Bookings Log`);
        sheetId = created.spreadsheetId; sheetTitle = created.sheetTitle;
        await sheetsAppendRows(token, sheetId, sheetTitle, [BOOKINGS_LOG_HEADERS]);
        updateConfig(prev => ({ ...prev, bookingsLogSheetId: sheetId }));
      }
      const rows = buildBookingLogRows(formSnapshot);
      try {
        await sheetsAppendRows(token, sheetId, sheetTitle, rows);
      } catch {
        // Sheet may have been deleted from Drive — recreate once and retry.
        const recreated = await sheetsCreateSpreadsheet(token, `${STUDIO_NAME} Bookings Log`);
        sheetId = recreated.spreadsheetId; sheetTitle = recreated.sheetTitle;
        await sheetsAppendRows(token, sheetId, sheetTitle, [BOOKINGS_LOG_HEADERS]);
        updateConfig(prev => ({ ...prev, bookingsLogSheetId: sheetId }));
        await sheetsAppendRows(token, sheetId, sheetTitle, rows);
      }
    } catch (e) { console.error("Bookings log:", e); }
  };

  // Best-effort, same pattern as the bookings log — but this one's a real
  // CONTACTS list, not a running log: one row per client, updated in place
  // (matched by email) rather than a fresh row every time they book again.
  const syncContactToSheet = async (client) => {
    if (!client.email) return;
    const rowValues = [client.band || "", client.name || "", client.email, client.lastRoom || "", client.lastBooked || ""];
    const writeRow = async (sheetId, sheetTitle) => {
      const existing = await sheetsGetValues(token, sheetId, `${sheetTitle}!A:E`);
      const idx = existing.findIndex((row, i) => i > 0 && (row[2] || "").toLowerCase() === client.email.toLowerCase());
      if (idx > 0) await sheetsUpdateRow(token, sheetId, sheetTitle, idx + 1, rowValues);
      else await sheetsAppendRows(token, sheetId, sheetTitle, [rowValues]);
    };
    try {
      let sheetId = config.contactsSheetId;
      let sheetTitle = "Sheet1";
      if (!sheetId) {
        const created = await sheetsCreateSpreadsheet(token, `${STUDIO_NAME} Client Contacts`);
        sheetId = created.spreadsheetId; sheetTitle = created.sheetTitle;
        await sheetsAppendRows(token, sheetId, sheetTitle, [CONTACTS_SHEET_HEADERS]);
        updateConfig(prev => ({ ...prev, contactsSheetId: sheetId }));
      }
      try {
        await writeRow(sheetId, sheetTitle);
      } catch {
        // Sheet may have been deleted from Drive — recreate once and retry.
        const recreated = await sheetsCreateSpreadsheet(token, `${STUDIO_NAME} Client Contacts`);
        sheetId = recreated.spreadsheetId; sheetTitle = recreated.sheetTitle;
        await sheetsAppendRows(token, sheetId, sheetTitle, [CONTACTS_SHEET_HEADERS]);
        updateConfig(prev => ({ ...prev, contactsSheetId: sheetId }));
        await writeRow(sheetId, sheetTitle);
      }
    } catch (e) { console.error("Contacts sync:", e); }
  };

  // Fetches the relevant policy PDF's bytes from Drive and shapes them into
  // the {filename, mimeType, base64Data} form gmailSend/gmailSendInThread expect.
  // Which policy PDFs are actually relevant to this booking — for a mixed
  // multi-session batch, that can be BOTH (a batch with an Hourly row and a
  // Lock Out row attaches both policies, not just one).
  const relevantPolicyKinds = () => {
    if (!form.multiSession) return [form.bookingType === "hourly" ? "hourly" : "daily"];
    const kinds = new Set(form.sessions.map(s => s.type));
    return [...kinds];
  };
  const getPolicyAttachments = async () => {
    if (!form.attachPolicy) return [];
    const kinds = relevantPolicyKinds();
    const files = kinds.map(k => k === "hourly" ? config.hourlyPolicyFile : config.lockoutPolicyFile).filter(Boolean);
    const results = [];
    for (const f of files) {
      try {
        const base64Data = await driveDownloadFileBase64(token, f.fileId);
        results.push({ filename: f.fileName, mimeType: "application/pdf", base64Data });
      } catch (e) {
        console.error("Policy attach:", e);
        showToast(`Couldn't attach ${f.fileName} — sent without it`, "error");
      }
    }
    return results;
  };

  const handleConfirm = async () => {
    if (!token) { showToast("Please connect Google first", "error"); return; }
    setStep("confirm");
    setLoading(true);
    let calOk = false, emailOk = false;

    if (form.multiSession) {
      let successCount = 0;
      for (const s of form.sessions) {
        if (!s.createdEventId) continue;
        try {
          await googleCalendarPatch(token, s.createdEventCalendarId, s.createdEventId, { status: "confirmed" });
          successCount++;
        } catch (e) { console.error("Calendar confirm:", e); }
      }
      calOk = successCount > 0 && successCount === form.sessions.length;
      refreshPanelEvents();

      const subject = `${STUDIO_NAME} — Booking Confirmed: ${form.bandName} | ${form.sessions.length} Sessions`;
      const htmlBody = buildEmailHTML(form);
      try {
        const attachments = await getPolicyAttachments();
        if (form.replyThreadId) {
          await gmailSendInThread(token, form.contactEmail, subject, htmlBody, form.replyThreadId, form.replyMessageId, form.replyCc || undefined, attachments);
        } else {
          await gmailSend(token, form.contactEmail, subject, htmlBody, attachments);
        }
        emailOk = true;
      } catch (e) { console.error("Gmail:", e); }

      const lastSession = form.sessions[form.sessions.length - 1];
      const clientRecord = { band: form.bandName, name: form.contactName, email: form.contactEmail, lastBooked: lastSession?.eventDate, lastRoom: lastSession?.room };
      persistClient(clientRecord);
      setClients(loadClients());
      logBookingToSheet(form); // best-effort — logged regardless of partial failures, so there's still a paper trail
      syncContactToSheet(clientRecord); // best-effort — same shared contacts list your boss sees too
      setSuccess({ calendar: calOk, email: emailOk, sessionCount: form.sessions.length, sessionSuccessCount: successCount });
      setLoading(false);
      return;
    }

    const subject = `${STUDIO_NAME} — Booking Confirmed: ${form.bandName} | ${fmtDate(form.eventDate)}`;
    const htmlBody = buildEmailHTML(form);

    try {
      if (form.createdEventId) {
        await googleCalendarPatch(token, form.createdEventCalendarId, form.createdEventId, { status: "confirmed" });
      } else {
        // Fallback in case Preview's write somehow never landed
        const { event } = await buildEventBody();
        await googleCalendarCreate(token, location.calendarId, { ...event, status: "confirmed" });
      }
      calOk = true;
    } catch (e) { console.error("Calendar:", e); }
    refreshPanelEvents();

    // Send email directly (or draft if you prefer — swap gmailSend for gmailDraft)
    try {
      const attachments = await getPolicyAttachments();
      if (form.replyThreadId) {
        await gmailSendInThread(token, form.contactEmail, subject, htmlBody, form.replyThreadId, form.replyMessageId, form.replyCc || undefined, attachments);
      } else {
        await gmailSend(token, form.contactEmail, subject, htmlBody, attachments);
      }
      emailOk = true;
    } catch (e) { console.error("Gmail:", e); }

    const clientRecord = { band: form.bandName, name: form.contactName, email: form.contactEmail, lastBooked: form.eventDate, lastRoom: form.room };
    persistClient(clientRecord);
    setClients(loadClients());
    logBookingToSheet(form); // best-effort — logged regardless of partial failures, so there's still a paper trail
    syncContactToSheet(clientRecord); // best-effort — same shared contacts list your boss sees too
    setSuccess({ calendar: calOk, email: emailOk });
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, rentalRates: Object.fromEntries(config.gear.map(g => [g.name, g.rate])) });
    setEmailPreview(null); setGearSearch(""); setReplyMode(false); setThreadResults(null); setSessionConflicts({});
    setStep("details"); setSuccess(null); setClientSearch(""); setTab("booking");
  };

  // Deliberate, explicit reset from the header button — confirms first if
  // there's actually something to lose, and warns specifically about any
  // tentative calendar event(s) already created at Preview time, since those
  // stay on the calendar (as tentative) rather than being auto-deleted.
  const handleHeaderReset = () => {
    const hasCreatedEvents = !!form.createdEventId || form.sessions.some(s => s.createdEventId);
    const hasAnyInput = form.bandName || form.contactEmail || form.room || form.eventDate || form.sessions.length > 0;
    if (!hasAnyInput) { resetForm(); return; }
    const msg = hasCreatedEvents
      ? "Clear this booking form? Any tentative calendar event(s) already saved will stay on the calendar as tentative — you'll need to delete them yourself in Google Calendar if you don't want them."
      : "Clear everything you've entered in the booking form?";
    if (window.confirm(msg)) resetForm();
  };

  const fetchCalendar = useCallback(async () => {
    if (!token) return;
    setLoadingCal(true);
    try { setCalEvents(await listCalendarEvents(token)); }
    catch { showToast("Could not load calendar", "error"); }
    setLoadingCal(false);
  }, [token]);

  useEffect(() => { if (tab === "calendar") fetchCalendar(); }, [tab, fetchCalendar]);

  // Debounced conflict check — fires whenever room/date/time change in the booking form
  useEffect(() => {
    if (form.multiSession || !token || !form.room || !form.eventDate) { setConflicts([]); return; }

    const location = getRoomLocation(form.room);
    let timeMinISO, timeMaxISO;

    if (form.bookingType === "hourly") {
      if (!form.startTime || !form.endTime) { setConflicts([]); return; }
      timeMinISO = new Date(`${form.eventDate}T${form.startTime}:00`).toISOString();
      timeMaxISO = new Date(`${form.eventDate}T${form.endTime}:00`).toISOString();
    } else {
      if (!form.endDate) { setConflicts([]); return; }
      timeMinISO = new Date(`${form.eventDate}T00:00:00`).toISOString();
      timeMaxISO = new Date(`${form.endDate}T23:59:59`).toISOString();
    }

    const handle = setTimeout(async () => {
      setCheckingConflicts(true);
      try {
        const found = await checkRoomConflicts(token, location.calendarId, timeMinISO, timeMaxISO);
        setConflicts(found.filter(ev => ev.id !== form.createdEventId));
      } catch {
        setConflicts([]);
      }
      setCheckingConflicts(false);
    }, 500);

    return () => clearTimeout(handle);
  }, [form.multiSession, token, form.room, form.eventDate, form.endDate, form.startTime, form.endTime, form.bookingType, form.createdEventId]);

  // Same idea, but for multi-session mode — checks every session row against
  // its OWN room, keyed by session.key so each row's warning is independent.
  const sessionsFingerprint = form.sessions.map(s => `${s.key}:${s.type}:${s.room}:${s.eventDate}:${s.endDate}:${s.startTime}:${s.endTime}:${s.createdEventId || ""}`).join("|");
  useEffect(() => {
    if (!form.multiSession || !token) { setSessionConflicts({}); return; }
    const handle = setTimeout(async () => {
      const results = await Promise.all(form.sessions.map(async s => {
        const isHourly = s.type === "hourly";
        if (!s.room || !s.eventDate || (isHourly ? (!s.startTime || !s.endTime) : !s.endDate)) return [s.key, []];
        try {
          const loc = getRoomLocation(s.room);
          const timeMinISO = isHourly
            ? new Date(`${s.eventDate}T${s.startTime}:00`).toISOString()
            : new Date(`${s.eventDate}T00:00:00`).toISOString();
          const timeMaxISO = isHourly
            ? new Date(`${s.eventDate}T${s.endTime}:00`).toISOString()
            : new Date(`${s.endDate}T23:59:59`).toISOString();
          const found = await checkRoomConflicts(token, loc.calendarId, timeMinISO, timeMaxISO);
          return [s.key, found.filter(ev => ev.id !== s.createdEventId)];
        } catch { return [s.key, []]; }
      }));
      setSessionConflicts(Object.fromEntries(results));
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.multiSession, token, sessionsFingerprint]);

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div data-theme={theme} style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT.body }}>

      {/* Header */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 36px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1, fontWeight: "400", letterSpacing: "0.01em", color: C.text, fontFamily: FONT.display, textTransform: "uppercase" }}>
          Mates <span style={{ color: C.textMuted }}>Studios</span> — Booking Manager
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={handleHeaderReset} title="Clear the booking form and start fresh"
            style={{ padding: "8px 12px", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, fontWeight: "500", display: "flex", alignItems: "center", gap: 6 }}>
            ↻ Reset
          </button>
          <nav style={{ display: "flex", gap: 6 }}>
            {[["booking", "New Booking"], ["quote", "Quote"], ["rundown", "Daily Rundown"], ["clients", "Clients"], ["calendar", "Calendar"], ["settings", "Settings"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ padding: "8px 16px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, transition: "all 0.15s", background: tab === k ? C.accent : "transparent", color: tab === k ? C.accentText : C.textMuted, border: tab === k ? `1px solid ${C.accent}` : `1px solid ${C.border}`, fontWeight: "500" }}>
                {l}
              </button>
            ))}
          </nav>
          {token ? (
            <button onClick={signOut} style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}`, fontWeight: "500" }}>
              ✓ Google Connected
            </button>
          ) : (
            <button onClick={signIn} disabled={authLoading} style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: authLoading ? C.surface2 : C.accent, color: authLoading ? C.textMuted : C.accentText, border: authLoading ? `1px solid ${C.border}` : `1px solid ${C.accent}`, fontWeight: "500" }}>
              {authLoading ? "Connecting…" : "Connect Google"}
            </button>
          )}
        </div>
      </header>

      {/* Toast */}
      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: toast.type === "error" ? C.dangerBg : C.successBg, color: toast.type === "error" ? C.danger : C.success, border: `1px solid ${toast.type === "error" ? C.dangerBorder : C.successBorder}`, padding: "11px 20px", borderRadius: 3, fontSize: 13.5, fontWeight: "500", boxShadow: "0 4px 16px rgba(0,0,0,0.35)", animation: "slideIn 0.2s ease", backdropFilter: "blur(6px)" }}>{toast.msg}</div>}

      {/* Google not connected banner */}
      {!token && (
        <div style={{ background: C.warningBg, borderBottom: `1px solid ${C.warningBorder}`, padding: "10px 36px", fontSize: 13, color: C.warning }}>
          ⚠️ Connect Google above to enable Calendar and email sending.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start" }}>
      <main style={{ flex: 1, minWidth: 0, padding: "32px 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 820 }}>

        {/* ══ BOOKING TAB ══ */}
        {tab === "booking" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>

            {/* Step indicator */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 34, paddingBottom: 28, borderBottom: `1px solid ${C.border}` }}>
              {[["details", "1", "Details"], ["review", "2", "Preview Email"], ["confirm", "3", "Done"]].map(([s, n, l], i) => {
                const done = STEPS.indexOf(step) > STEPS.indexOf(s), active = step === s;
                return (
                  <div key={s} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: FONT.mono, fontWeight: "500", background: active ? C.accent : done ? C.successBg : "transparent", color: active ? C.accentText : done ? C.success : C.textMuted, border: active ? `1px solid ${C.accent}` : done ? `1px solid ${C.successBorder}` : `1px solid ${C.border}` }}>{done ? "✓" : n}</div>
                      <span style={{ fontSize: 11.5, letterSpacing: "0.04em", fontFamily: FONT.mono, fontWeight: active ? "500" : "400", color: active ? C.text : C.textMuted }}>{l}</span>
                    </div>
                    {i < 2 && <div style={{ width: 36, height: 1, background: done ? C.successBorder : C.border, margin: "0 12px" }} />}
                  </div>
                );
              })}
            </div>

            {/* ── Step 1: Details ── */}
            {step === "details" && (
              <div>
                {/* Client autocomplete */}
                <Sect>Client Lookup</Sect>
                <div ref={dropRef} style={{ position: "relative", marginBottom: 22 }}>
                  <label style={S.label}>Search saved clients or type new name</label>
                  <input value={clientSearch}
                    onChange={e => { setClientSearch(e.target.value); setShowDrop(true); setF("bandName", e.target.value); }}
                    onFocus={() => setShowDrop(true)}
                    placeholder="Band name, artist, or email…"
                    style={S.input} />
                  {showDrop && filteredClients.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface2, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 4px 4px", zIndex: 200, maxHeight: 210, overflowY: "auto", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" }}>
                      {filteredClients.map((c, i) => (
                        <div key={i} onClick={() => selectClient(c)}
                          style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${C.borderSoft}` }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surface3}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div style={{ fontSize: 13.5, fontWeight: "500", color: C.text }}>{c.band}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{c.name} · {c.email}{c.lastBooked ? ` · Last booked: ${fmtDate(c.lastBooked)}${c.lastRoom ? ` (${c.lastRoom})` : ""}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Sect>Artist & Contact</Sect>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                  <Inp label="Band / Artist Name *" value={form.bandName} onChange={v => setF("bandName", v)} />
                  <Inp label="Contact Name *" value={form.contactName} onChange={v => setF("contactName", v)} />
                  <Inp label="Contact Email *" value={form.contactEmail} onChange={v => setF("contactEmail", v)} type="email" span={2} />
                </div>

                <Sect>Room & Booking Type</Sect>
                {!form.multiSession && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 6 }}>
                    <div>
                      <label style={S.label}>Room *</label>
                      <select value={form.room} onChange={e => {
                        const rates = getRoomRates(e.target.value);
                        setForm(f => ({ ...f, room: e.target.value, hourlyRate: rates.hourly ?? "", dailyRate: rates.daily ?? "" }));
                      }} style={SEL}>
                        <option value="">Select a room…</option>
                        {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Booking Type *</label>
                      <div style={{ background: C.surface3, borderRadius: 3, padding: 3, display: "flex", border: `1px solid ${C.border}` }}>
                        {[["hourly", "⏱ Hourly"], ["daily", "🔒 Lock Out"]].map(([val, lbl]) => (
                          <button key={val} onClick={() => setF("bookingType", val)}
                            style={{ flex: 1, padding: "9px 0", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: form.bookingType === val ? C.accent : "transparent", color: form.bookingType === val ? C.accentText : C.textMuted, border: "none", fontWeight: form.bookingType === val ? "600" : "400", borderRadius: 2, transition: "all 0.15s" }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", margin: "14px 0 6px" }}
                  onClick={() => setForm(f => {
                    const turningOn = !f.multiSession;
                    return {
                      ...f, multiSession: turningOn,
                      sessions: turningOn && f.sessions.length === 0 ? [newSessionRow(f.room, getRoomRates(f.room), f.bookingType)] : f.sessions,
                    };
                  })}>
                  <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: form.multiSession ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {form.multiSession && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13.5, color: C.text }}>📋 Book multiple sessions for this client <span style={{ color: C.textFaint }}>— mix Hourly and Lock Out freely, one email either way</span></span>
                </label>

                {/* Location preview */}
                {!form.multiSession && form.room && (
                  <div style={{ marginBottom: 22, padding: "10px 14px", background: location.gateCode ? C.warningBg : C.surface3, border: `1px solid ${location.gateCode ? C.warningBorder : C.border}`, borderRadius: 3, fontSize: 13, color: location.gateCode ? C.warning : C.textMuted }}>
                    📍 {location.address}{location.gateCode ? ` — 🔐 Gate Code: ${location.gateCode}` : ""}
                  </div>
                )}

                {!form.multiSession ? (
                  <>
                    <Sect>Schedule</Sect>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                      <div>
                        <Inp label={form.bookingType === "daily" ? "Start Date *" : "Date *"} value={form.eventDate} onChange={v => setF("eventDate", v)} type="date" />
                      </div>
                      {form.bookingType === "daily" ? (
                        <div>
                          <Inp label="End Date *" value={form.endDate} onChange={v => setF("endDate", v)} type="date" />
                          {form.eventDate && form.endDate && (() => {
                            const d = calcDays(form.eventDate, form.endDate);
                            return (
                              <div style={{ marginTop: 8, padding: "8px 12px", background: d > 0 ? C.successBg : C.dangerBg, border: `1px solid ${d > 0 ? C.successBorder : C.dangerBorder}`, borderRadius: 3, fontSize: 12, color: d > 0 ? C.success : C.danger }}>
                                {d > 0 ? `✓ ${d} day${d !== 1 ? "s" : ""} selected` : "⚠️ End date must be on or after start date"}
                              </div>
                            );
                          })()}
                        </div>
                      ) : <div />}
                      {form.bookingType === "hourly" && (() => {
                        const hrs = calcHours(form.startTime, form.endTime);
                        const belowMin = form.startTime && form.endTime && hrs < 3;
                        return (
                          <>
                            <div>
                              <label style={S.label}>Start Time * <span style={{ color: C.textFaint, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(9am–8pm)</span></label>
                              <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value, endTime: addHoursToTime(e.target.value, 3) }))} style={SEL}>
                                <option value="">Select…</option>
                                {START_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={S.label}>End Time *</label>
                              <select value={form.endTime} onChange={e => setF("endTime", e.target.value)} style={SEL}>
                                <option value="">Select…</option>
                                {END_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                            {form.startTime && form.endTime && (
                              <div style={{ gridColumn: "span 2", padding: "8px 14px", background: belowMin ? C.dangerBg : C.successBg, border: `1px solid ${belowMin ? C.dangerBorder : C.successBorder}`, borderRadius: 3, fontSize: 12, color: belowMin ? C.danger : C.success }}>
                                {belowMin ? `⚠️ ${hrs.toFixed(1)} hrs — minimum booking is 3 hours` : `✓ ${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hour${hrs !== 1 ? "s" : ""}`}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Room conflict warning — non-blocking, just surfaces what's already on the calendar */}
                    {checkingConflicts && (
                      <div style={{ marginBottom: 22, padding: "10px 14px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 13, color: C.textMuted }}>
                        Checking {form.room} for conflicts…
                      </div>
                    )}
                    {!checkingConflicts && conflicts.length > 0 && (
                      <div style={{ marginBottom: 22, padding: "14px 16px", background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 3, fontSize: 13, color: C.danger }}>
                        <div style={{ fontWeight: "700", marginBottom: 8 }}>
                          ⚠️ {form.room} already has {conflicts.length} booking{conflicts.length !== 1 ? "s" : ""} in this window:
                        </div>
                        {conflicts.map(c => (
                          <div key={c.id} style={{ padding: "4px 0", fontSize: 12.5, color: C.danger, opacity: 0.85 }}>
                            • {c.title} — {c.allDay ? `${parseEventBoundary(c.start, true).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} (All day)` : new Date(c.start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </div>
                        ))}
                        <div style={{ marginTop: 8, fontSize: 12, color: C.danger, opacity: 0.85, fontStyle: "italic" }}>
                          This won't block the booking — just double-check before confirming.
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Sect>Sessions ({form.sessions.length})</Sect>
                    {form.sessions.map((s, i) => {
                      const hrs = calcHours(s.startTime, s.endTime);
                      const belowMin = s.startTime && s.endTime && hrs < 3;
                      const days = calcDays(s.eventDate, s.endDate);
                      const sConflicts = sessionConflicts[s.key] || [];
                      const updateRow = patch => setF("sessions", form.sessions.map(x => x.key === s.key ? { ...x, ...patch } : x));
                      return (
                        <div key={s.key} style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 16px", marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <span style={{ fontSize: 11, fontFamily: FONT.mono, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.type === "hourly" ? "Session" : "Lockout"} {i + 1}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ background: C.surface2, borderRadius: 3, padding: 2, display: "flex", border: `1px solid ${C.border}` }}>
                                {[["hourly", "⏱ Hourly"], ["daily", "🔒 Lock Out"]].map(([val, lbl]) => (
                                  <button key={val} onClick={() => updateRow({ type: val })}
                                    style={{ padding: "5px 10px", fontSize: 11, fontFamily: FONT.mono, cursor: "pointer", background: s.type === val ? C.accent : "transparent", color: s.type === val ? C.accentText : C.textMuted, border: "none", fontWeight: s.type === val ? "600" : "400", borderRadius: 2 }}>
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                              {form.sessions.length > 1 && (
                                <button onClick={() => setF("sessions", form.sessions.filter(x => x.key !== s.key))} style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase" }}>Remove</button>
                              )}
                            </div>
                          </div>
                          {s.type === "hourly" ? (
                            <>
                              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                                <div>
                                  <label style={S.label}>Room *</label>
                                  <select value={s.room} onChange={e => {
                                    const rates = getRoomRates(e.target.value);
                                    updateRow({ room: e.target.value, hourlyRate: rates.hourly ?? "" });
                                  }} style={{ ...SEL, padding: "10px 30px 10px 11px" }}>
                                    <option value="">Select…</option>
                                    {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={S.label}>Date *</label>
                                  <input type="date" value={s.eventDate} onChange={e => updateRow({ eventDate: e.target.value })} style={S.input} />
                                </div>
                                <div>
                                  <label style={S.label}>Start *</label>
                                  <select value={s.startTime} onChange={e => updateRow({ startTime: e.target.value, endTime: addHoursToTime(e.target.value, 3) })} style={{ ...SEL, padding: "10px 30px 10px 11px" }}>
                                    <option value="">Select…</option>
                                    {START_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={S.label}>End *</label>
                                  <select value={s.endTime} onChange={e => updateRow({ endTime: e.target.value })} style={{ ...SEL, padding: "10px 30px 10px 11px" }}>
                                    <option value="">Select…</option>
                                    {END_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                  <label style={S.label}>Rate ($/hr)</label>
                                  <input type="number" value={s.hourlyRate} onChange={e => updateRow({ hourlyRate: e.target.value })} style={S.input} />
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10 }}>
                                  {s.startTime && s.endTime && (
                                    <span style={{ fontSize: 12, color: belowMin ? C.danger : C.success }}>
                                      {belowMin ? `⚠️ ${hrs.toFixed(1)} hrs — 3 hr minimum` : `✓ ${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hrs · $${(hrs * (parseFloat(s.hourlyRate) || 0)).toFixed(2)}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                                <div>
                                  <label style={S.label}>Room *</label>
                                  <select value={s.room} onChange={e => {
                                    const rates = getRoomRates(e.target.value);
                                    updateRow({ room: e.target.value, dailyRate: rates.daily ?? "" });
                                  }} style={{ ...SEL, padding: "10px 30px 10px 11px" }}>
                                    <option value="">Select…</option>
                                    {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label style={S.label}>Start Date *</label>
                                  <input type="date" value={s.eventDate} onChange={e => updateRow({ eventDate: e.target.value })} style={S.input} />
                                </div>
                                <div>
                                  <label style={S.label}>End Date *</label>
                                  <input type="date" value={s.endDate} onChange={e => updateRow({ endDate: e.target.value })} style={S.input} />
                                </div>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <div>
                                  <label style={S.label}>Rate ($/day)</label>
                                  <input type="number" value={s.dailyRate} onChange={e => updateRow({ dailyRate: e.target.value })} style={S.input} />
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10 }}>
                                  {s.eventDate && s.endDate && (
                                    <span style={{ fontSize: 12, color: days > 0 ? C.success : C.danger }}>
                                      {days > 0 ? `✓ ${days} day${days !== 1 ? "s" : ""} · $${(days * (parseFloat(s.dailyRate) || 0)).toFixed(2)}` : "⚠️ End date must be on or after start date"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                          {sConflicts.length > 0 && (
                            <div style={{ marginTop: 10, padding: "8px 12px", background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 3, fontSize: 12, color: C.danger }}>
                              ⚠️ {s.room} already has {sConflicts.length} booking{sConflicts.length !== 1 ? "s" : ""} in this window
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button onClick={() => {
                      const last = form.sessions[form.sessions.length - 1];
                      setF("sessions", [...form.sessions, newSessionRow(last?.room || "", getRoomRates(last?.room || ""), last?.type || "hourly")]);
                    }} style={{ width: "100%", padding: "11px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 3, color: C.textMuted, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 22 }}>
                      + Add Session
                    </button>
                  </>
                )}

                <Sect>Pricing</Sect>
                {form.multiSession ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 8 }}>
                    <div>
                      <label style={S.label}>Sessions</label>
                      <div style={{ ...S.input, color: C.textMuted, display: "flex", alignItems: "center" }}>
                        {(() => {
                          const nHourly = form.sessions.filter(s => s.type === "hourly").length;
                          const nDaily = form.sessions.length - nHourly;
                          const parts = [];
                          if (nHourly) parts.push(`${nHourly} hourly`);
                          if (nDaily) parts.push(`${nDaily} lock out`);
                          return `${parts.join(", ")} · rates set above`;
                        })()}
                      </div>
                    </div>
                    <div>
                      <label style={S.label}>Session Total</label>
                      <div style={{ ...S.input, color: calcSessionTotal(form) > 0 ? C.text : C.textFaint, fontWeight: "600", display: "flex", alignItems: "center" }}>
                        {calcSessionTotal(form) > 0 ? `$${calcSessionTotal(form).toFixed(2)}` : "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {form.bookingType === "hourly" && getRoomRates(form.room).hourly === null && form.room && (
                      <div style={{ marginBottom: 14, padding: "8px 12px", background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: 3, fontSize: 12, color: C.warning }}>
                        {form.room} has no default hourly rate — enter one manually below.
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 8 }}>
                      {form.bookingType === "hourly" ? (
                        <>
                          <Inp label="Hourly Rate ($) *" value={form.hourlyRate} onChange={v => setF("hourlyRate", v)} type="number" />
                          <div>
                            <label style={S.label}>Hours (auto)</label>
                            <div style={{ ...S.input, color: C.textMuted, display: "flex", alignItems: "center" }}>
                              {calcHours(form.startTime, form.endTime) > 0 ? `${calcHours(form.startTime, form.endTime).toFixed(1)} hrs` : "—"}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <Inp label="Lock Out Rate ($/day) *" value={form.dailyRate} onChange={v => setF("dailyRate", v)} type="number" />
                          <div>
                            <label style={S.label}>Days (auto)</label>
                            <div style={{ ...S.input, color: C.textMuted, display: "flex", alignItems: "center" }}>
                              {form.eventDate && form.endDate ? `${calcDays(form.eventDate, form.endDate)} day${calcDays(form.eventDate, form.endDate) !== 1 ? "s" : ""}` : "—"}
                            </div>
                          </div>
                        </>
                      )}
                      <div>
                        <label style={S.label}>Session Total</label>
                        <div style={{ ...S.input, color: calcSessionTotal(form) > 0 ? C.text : C.textFaint, fontWeight: "600", display: "flex", alignItems: "center" }}>
                          {calcSessionTotal(form) > 0 ? `$${calcSessionTotal(form).toFixed(2)}` : "—"}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Rentals */}
                <Sect>Equipment Rentals</Sect>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14, userSelect: "none" }} onClick={() => setF("hasRentals", !form.hasRentals)}>
                    <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: form.hasRentals ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                      {form.hasRentals && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13.5, color: C.text }}>Client is renting equipment</span>
                  </label>

                  {form.hasRentals && (
                    <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "16px 18px" }}>
                      {(() => {
                        const numDays = form.bookingType === "daily" ? calcDays(form.eventDate, form.endDate) : 1;
                        const q = gearSearch.trim().toLowerCase();
                        const matches = g => !q || g.name.toLowerCase().split(/\s+/).some(w => w.startsWith(q));
                        const visibleGear = config.gear.filter(g => matches(g) || (form.rentals[g.name] || 0) > 0);
                        return (
                          <>
                            {numDays > 1 && (
                              <div style={{ marginBottom: 12, padding: "7px 12px", background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: 3, fontSize: 12, color: C.info }}>
                                📅 Rental rates × {numDays} days
                              </div>
                            )}
                            <input type="text" value={gearSearch} onChange={e => setGearSearch(e.target.value)}
                              placeholder="🔍 Search gear (e.g. “g” → Guitar Amp)…"
                              style={{ ...S.input, marginBottom: 12, fontSize: 13 }} />
                            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: "10px 12px", alignItems: "center", marginBottom: 4 }}>
                              <div /><div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>Item</div>
                              <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>$/Day</div>
                              <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>Qty</div>
                              <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>Subtotal</div>
                            </div>
                            {visibleGear.length === 0 && (
                              <div style={{ padding: "14px 0", fontSize: 12.5, color: C.textFaint, textAlign: "center" }}>No gear matches "{gearSearch}".</div>
                            )}
                            {visibleGear.map(({ name: item, rate: defaultRate }) => {
                              const qty = form.rentals[item] || 0;
                              const checked = qty > 0;
                              const rate = parseFloat(form.rentalRates?.[item] ?? defaultRate) || 0;
                              const sub = rate * qty * numDays;
                              return (
                                <div key={item} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: "0 12px", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                                  <div onClick={() => setF("rentals", { ...form.rentals, [item]: checked ? 0 : 1 })}
                                    style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${C.border}`, background: checked ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
                                    {checked && <span style={{ color: C.accentText, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                                  </div>
                                  <span style={{ fontSize: 13, color: checked ? C.text : C.textFaint }}>{item}</span>
                                  <input type="number" value={form.rentalRates?.[item] ?? defaultRate} onChange={e => setF("rentalRates", { ...form.rentalRates, [item]: e.target.value })}
                                    style={{ ...S.input, width: 72, padding: "6px 8px", fontSize: 13, textAlign: "center", borderRadius: 3 }} />
                                  {checked ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <button onClick={() => setF("rentals", { ...form.rentals, [item]: Math.max(1, qty - 1) })} style={{ width: 22, height: 22, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer", borderRadius: 2, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                                      <span style={{ fontSize: 13, color: C.text, minWidth: 20, textAlign: "center", fontWeight: "600" }}>{qty}</span>
                                      <button onClick={() => setF("rentals", { ...form.rentals, [item]: qty + 1 })} style={{ width: 22, height: 22, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, cursor: "pointer", borderRadius: 2, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                    </div>
                                  ) : <div style={{ width: 70 }} />}
                                  <div style={{ fontSize: 13, color: sub > 0 ? C.text : C.textFaint, textAlign: "right", fontWeight: sub > 0 ? "600" : "normal" }}>
                                    {sub > 0 ? `$${sub.toFixed(2)}` : "—"}
                                  </div>
                                </div>
                              );
                            })}
                            {calcRentalTotal(form) > 0 && (
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 12, color: C.textMuted, fontWeight: "500" }}>Rental Subtotal{numDays > 1 ? ` (${numDays} days)` : ""}</span>
                                <span style={{ fontSize: 13, color: C.text, fontWeight: "600" }}>${calcRentalTotal(form).toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Discount */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginBottom: form.discountEnabled ? 10 : 0 }}
                    onClick={() => setF("discountEnabled", !form.discountEnabled)}>
                    <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: form.discountEnabled ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {form.discountEnabled && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13.5, color: C.text }}>Apply a discount</span>
                  </label>

                  {form.discountEnabled && (
                    <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 16px" }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ background: C.surface2, borderRadius: 3, padding: 3, display: "flex", border: `1px solid ${C.border}` }}>
                          {[["percent", "% Off"], ["fixed", "$ Off"], ["finalTotal", "Set Final Price"]].map(([val, lbl]) => (
                            <button key={val} onClick={() => setF("discountMode", val)}
                              style={{ flex: 1, padding: "7px 0", fontSize: 11.5, fontFamily: FONT.mono, cursor: "pointer", background: form.discountMode === val ? C.accent : "transparent", color: form.discountMode === val ? C.accentText : C.textMuted, border: "none", fontWeight: form.discountMode === val ? "600" : "400", borderRadius: 2, transition: "all 0.15s" }}>
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: form.discountMode === "finalTotal" ? "1fr" : "1fr 1fr", gap: 12 }}>
                        {form.discountMode !== "finalTotal" && (
                          <div>
                            <label style={S.label}>Apply To</label>
                            <select value={form.discountTarget} onChange={e => setF("discountTarget", e.target.value)} style={SEL}>
                              <option value="total">Grand Total</option>
                              <option value="session">Session Only</option>
                              <option value="rentals">Rentals Only</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label style={S.label}>
                            {form.discountMode === "percent" ? "Percent Off" : form.discountMode === "fixed" ? "Amount Off ($)" : "Final Price ($)"}
                          </label>
                          <input type="number" value={form.discountValue} onChange={e => setF("discountValue", e.target.value)}
                            placeholder={form.discountMode === "percent" ? "e.g. 15" : form.discountMode === "fixed" ? "e.g. 50" : "e.g. 900"}
                            style={S.input} />
                        </div>
                      </div>

                      {form.discountValue !== "" && calcDiscountAmount(form) > 0 && (
                        <div style={{ marginTop: 12, padding: "8px 12px", background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 3, fontSize: 12, color: C.success }}>
                          ✓ {discountLabel(form)}: −${calcDiscountAmount(form).toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Grand total */}
                <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 18px", marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: calcRentalTotal(form) > 0 || calcDiscountAmount(form) > 0 ? 6 : 0 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontWeight: "500" }}>Session</span>
                    <span style={{ fontSize: 13, color: C.textMuted }}>{calcSessionTotal(form) > 0 ? `$${calcSessionTotal(form).toFixed(2)}` : "—"}</span>
                  </div>
                  {calcRentalTotal(form) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: calcDiscountAmount(form) > 0 ? 6 : 0 }}>
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: "500" }}>Rentals</span>
                      <span style={{ fontSize: 13, color: C.textMuted }}>${calcRentalTotal(form).toFixed(2)}</span>
                    </div>
                  )}
                  {calcDiscountAmount(form) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: C.success, fontWeight: "500" }}>{discountLabel(form)}</span>
                      <span style={{ fontSize: 13, color: C.success }}>−${calcDiscountAmount(form).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 8, borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, color: C.textMuted, fontWeight: "500" }}>Grand Total</span>
                    <span style={{ fontSize: 30, lineHeight: 1, fontFamily: FONT.display, letterSpacing: "0.01em", color: total > 0 ? C.text : C.textFaint }}>{total > 0 ? `$${total.toFixed(2)}` : "—"}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                  <Inp label="Deposit Amount ($)" value={form.depositAmount} onChange={v => setF("depositAmount", v)} type="number" />
                  <Inp label="Deposit Due Date" value={form.depositDue} onChange={v => setF("depositDue", v)} type="date" />
                </div>

                <Sect>Stage Plot (optional)</Sect>
                <div style={{ marginBottom: 30 }}>
                  {form.stagePlotFile ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                      <span style={{ fontSize: 13, color: C.text }}>📎 {form.stagePlotFile.name}</span>
                      <button onClick={() => setForm(f => ({ ...f, stagePlotFile: null, stagePlotAttachment: null }))} style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 12, fontFamily: FONT.mono, textTransform: "uppercase" }}>Remove</button>
                    </div>
                  ) : (
                    <label style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 3, cursor: "pointer", fontSize: 13, color: C.textMuted }}>
                      📎 Upload a stage plot (image or PDF)
                      <input type="file" accept="image/*,.pdf" onChange={e => setForm(f => ({ ...f, stagePlotFile: e.target.files[0] || null, stagePlotAttachment: null }))} style={{ display: "none" }} />
                    </label>
                  )}
                  <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 6 }}>Attached to the calendar event for whoever's running sound — not included in the client email.</div>
                </div>

                <Sect>Email Greeting</Sect>
                <div style={{ marginBottom: 20 }}>
                  <textarea value={form.customGreeting || defaultGreeting(form)} onChange={e => setF("customGreeting", e.target.value)}
                    rows={2}
                    style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "11px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                  {form.customGreeting && (
                    <button onClick={() => setF("customGreeting", "")} style={{ marginTop: 6, background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 11.5, fontFamily: FONT.mono, textTransform: "uppercase", padding: 0 }}>↺ Reset to default</button>
                  )}
                </div>

                <Sect>Internal Notes (added to calendar event — not sent to client)</Sect>
                <div style={{ marginBottom: 20 }}>
                  <textarea value={form.calendarNotes} onChange={e => setF("calendarNotes", e.target.value)}
                    placeholder="Special setup, access codes, parking, rider notes, internal reminders…"
                    rows={3}
                    style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "11px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                </div>

                <div style={{ marginBottom: 30 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }} onClick={() => setF("staffAttention", !form.staffAttention)}>
                    <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${form.staffAttention ? C.warning : C.border}`, background: form.staffAttention ? C.warning : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                      {form.staffAttention && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13.5, color: C.text }}>🚩 Flag for booking staff attention <span style={{ color: C.textFaint }}>— marks the event *** on the calendar</span></span>
                  </label>
                </div>

                {(form.stagePlotFile || form.calendarNotes.trim() || calcRentalTotal(form) > 0 || form.staffAttention) && (
                  <div style={{ marginBottom: 24, padding: "10px 14px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 12, color: C.textMuted, fontFamily: FONT.mono }}>
                    Calendar title will show: <span style={{ color: C.text }}>{buildFlagPrefix({ hasSetup: !!form.stagePlotFile || !!form.calendarNotes.trim(), hasRentals: calcRentalTotal(form) > 0, needsAttention: form.staffAttention })}{form.bandName || "…"}</span>
                  </div>
                )}

                <button onClick={handlePreview}
                  disabled={savingPreview || !form.bandName || !form.contactEmail || !detailsValid}
                  style={{ width: "100%", padding: "15px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600", cursor: savingPreview ? "default" : "pointer", fontFamily: FONT.mono, transition: "all 0.2s", opacity: (savingPreview || !form.bandName || !form.contactEmail || !detailsValid) ? 0.5 : 1 }}>
                  {savingPreview ? (form.multiSession ? `Saving ${form.sessions.length} sessions to calendar…` : "Saving to calendar…") : "Preview Confirmation Email →"}
                </button>
              </div>
            )}

            {/* ── Step 2: Preview ── */}
            {step === "review" && emailPreview && (
              <div>
                {/* Summary card */}
                {form.multiSession ? (
                  <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "16px 20px", marginBottom: 18 }}>
                    <div style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, color: C.textMuted, fontWeight: "500", marginBottom: 10 }}>Artist: <span style={{ color: C.text }}>{form.bandName}</span> · {form.sessions.length} Sessions</div>
                    {form.sessions.map((s, i) => (
                      <div key={s.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i > 0 ? `1px solid ${C.borderSoft}` : "none", fontSize: 13, color: C.text }}>
                        {s.type === "hourly" ? (
                          <>
                            <span>{fmtDate(s.eventDate)} · {s.room}</span>
                            <span style={{ color: C.textMuted }}>{fmtTime(s.startTime)} – {fmtTime(s.endTime)}</span>
                          </>
                        ) : (
                          <>
                            <span>{formatDateRange(s.eventDate, s.endDate)} <span style={{ color: C.textFaint }}>(Lock Out)</span></span>
                            <span style={{ color: C.textMuted }}>{s.room}</span>
                          </>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, color: C.textMuted, fontWeight: "500" }}>Grand Total</span>
                      <span style={{ fontSize: 15, color: C.text, fontWeight: "600" }}>${calcTotal(form).toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "16px 20px", marginBottom: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                    {[
                      ["Artist", form.bandName],
                      ["Room", form.room],
                      ["Address", location.address],
                      ["Date", form.bookingType === "daily" ? formatDateRange(form.eventDate, form.endDate) : fmtDate(form.eventDate)],
                      ["Session", form.bookingType === "hourly" ? `${fmtTime(form.startTime)} – ${fmtTime(form.endTime)}` : `${calcDays(form.eventDate, form.endDate)} days`],
                      ["Grand Total", `$${calcTotal(form).toFixed(2)}`],
                      calcDiscountAmount(form) > 0 ? ["Discount", `−$${calcDiscountAmount(form).toFixed(2)}`] : null,
                      location.gateCode ? ["Gate Code", location.gateCode] : null,
                    ].filter(Boolean).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, color: C.textMuted, fontWeight: "500", marginBottom: 3 }}>{k}</div>
                        <div style={{ fontSize: 13.5, color: C.text, fontWeight: "500" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Email preview rendered */}
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ background: C.surface3, padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono }}>
                    Email Preview — sending to {form.contactEmail}
                  </div>
                  <div style={{ padding: "20px", background: "#e9e9e6" }}>
                    <div dangerouslySetInnerHTML={{ __html: emailPreview }} />
                  </div>
                </div>

                <div style={{ padding: "11px 16px", background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: 3, marginBottom: 18, fontSize: 12, color: C.success }}>
                  📅 {form.multiSession ? `Saved all ${form.sessions.length} sessions to their calendars as tentative` : `Saved to ${form.room}'s calendar as tentative`} — no invite sent to client. It'll switch to confirmed once you send below.
                </div>

                {/* Reply within an existing email thread */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginBottom: replyMode ? 10 : 0 }}
                    onClick={() => { const next = !replyMode; setReplyMode(next); if (next && threadResults === null) searchForThreads(); if (!next) { setF("replyThreadId", null); setF("replyMessageId", null); setF("replyCc", ""); } }}>
                    <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: replyMode ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {replyMode && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13.5, color: C.text }}>Reply within an existing email thread with {form.contactEmail || "this contact"}</span>
                  </label>

                  {replyMode && (
                    <div style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 16px" }}>
                      {searchingThreads && <div style={{ fontSize: 12.5, color: C.textMuted }}>Searching Gmail…</div>}
                      {!searchingThreads && threadResults?.length === 0 && (
                        <div style={{ fontSize: 12.5, color: C.textFaint }}>No existing threads found with {form.contactEmail}. This will send as a new email instead.</div>
                      )}
                      {!searchingThreads && threadResults?.map(t => (
                        <div key={t.id} onClick={() => pickThread(t)}
                          style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 10px", borderRadius: 3, cursor: "pointer", marginBottom: 4, background: form.replyThreadId === t.id ? C.surface2 : "transparent", border: `1px solid ${form.replyThreadId === t.id ? C.accent : "transparent"}` }}>
                          <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1px solid ${C.border}`, marginTop: 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {form.replyThreadId === t.id && <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: C.text, fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</div>
                            <div style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.date ? t.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " — " : ""}{t.snippet}
                            </div>
                          </div>
                        </div>
                      ))}
                      {!searchingThreads && threadResults?.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: C.textFaint }}>
                          {form.replyThreadId ? "Confirmation will be sent as a reply in the selected thread." : "Pick a thread above, or leave none selected to send as a new email."}
                        </div>
                      )}
                      {form.replyThreadId && (
                        <div style={{ marginTop: 12 }}>
                          <label style={S.label}>CC <span style={{ color: C.textFaint, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— pulled from who was on this thread, edit as needed</span></label>
                          <input type="text" value={form.replyCc} onChange={e => setF("replyCc", e.target.value)}
                            placeholder="comma-separated emails, or leave blank for none"
                            style={{ ...S.input, fontSize: 12.5 }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!token && (
                  <div style={{ padding: "11px 16px", background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: 3, marginBottom: 18, fontSize: 12, color: C.warning }}>
                    ⚠️ Connect Google above to save to Calendar and send this email when you confirm.
                  </div>
                )}

                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginBottom: 18 }}
                  onClick={() => {
                    const next = !form.hidePricingInEmail;
                    const updated = { ...form, hidePricingInEmail: next };
                    setF("hidePricingInEmail", next);
                    setEmailPreview(buildEmailHTML(updated));
                  }}>
                  <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: form.hidePricingInEmail ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {form.hidePricingInEmail && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13.5, color: C.text }}>🙈 Hide pricing/totals in this confirmation email <span style={{ color: C.textFaint }}>— "How to Pay" still shows, just without dollar amounts</span></span>
                </label>

                {(() => {
                  const kinds = form.multiSession ? [...new Set(form.sessions.map(s => s.type))] : [form.bookingType === "hourly" ? "hourly" : "daily"];
                  const files = kinds.map(k => ({ kind: k, file: k === "hourly" ? config.hourlyPolicyFile : config.lockoutPolicyFile })).filter(x => x.file);
                  if (files.length === 0) return null;
                  return (
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", marginBottom: 18 }}
                      onClick={() => setF("attachPolicy", !form.attachPolicy)}>
                      <div style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${C.border}`, background: form.attachPolicy ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {form.attachPolicy && <span style={{ color: C.accentText, fontSize: 11, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13.5, color: C.text }}>
                        📎 Attach Booking Polic{files.length > 1 ? "ies" : "y"} <span style={{ color: C.textFaint }}>— {files.map(x => x.file.fileName).join(", ")}</span>
                      </span>
                    </label>
                  );
                })()}

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setStep("details")} style={{ flex: 1, padding: "13px", background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "500" }}>← Edit</button>
                  <button onClick={handleConfirm} style={{ flex: 2, padding: "13px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600" }}>Confirm & Send →</button>
                </div>
              </div>
            )}

            {/* ── Step 3: Done ── */}
            {step === "confirm" && (
              <div style={{ textAlign: "center", padding: "44px 0" }}>
                {loading ? (
                  <>
                    <div style={{ fontSize: 44, marginBottom: 14 }}>⏳</div>
                    <div style={{ color: C.textMuted, fontSize: 14 }}>Sending email and saving to calendar…</div>
                  </>
                ) : success && (
                  <>
                    <div style={{ fontSize: 52, marginBottom: 14 }}>🎶</div>
                    <h2 style={{ fontSize: 34, lineHeight: 1, fontWeight: "400", margin: "0 0 10px", color: C.text, fontFamily: FONT.display, textTransform: "uppercase", letterSpacing: "0.01em" }}>Booking Confirmed!</h2>
                    <p style={{ color: C.textMuted, fontSize: 13.5, margin: "0 0 28px" }}>
                      {form.multiSession ? `${form.bandName} · ${form.sessions.length} sessions` : `${form.bandName} · ${form.room} · ${fmtDate(form.eventDate)}`}
                    </p>
                    <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 30 }}>
                      <Pill ok={success.calendar} label="Calendar" okMsg={form.multiSession ? `${success.sessionSuccessCount}/${success.sessionCount} confirmed` : "Confirmed"} failMsg={form.multiSession ? `${success.sessionSuccessCount}/${success.sessionCount} confirmed` : "Check manually"} />
                      <Pill ok={success.email} label="Email" okMsg="Sent to client" failMsg="Check Gmail" />
                    </div>
                    <div style={{ padding: "14px 18px", background: (success.calendar && success.email) ? C.surface3 : C.dangerBg, border: `1px solid ${(success.calendar && success.email) ? C.border : C.dangerBorder}`, borderRadius: 3, fontSize: 13, color: (success.calendar && success.email) ? C.textMuted : C.danger, textAlign: "left", marginBottom: 24 }}>
                      {form.multiSession ? (
                        success.calendar && success.email ? (
                          <><strong style={{ color: C.text }}>Done!</strong> One confirmation email covering all {success.sessionCount} sessions sent to {form.contactName} at {form.contactEmail}.</>
                        ) : !success.email ? (
                          <><strong>{success.sessionSuccessCount}/{success.sessionCount} calendar events confirmed, but the email failed to send.</strong> You'll need to send {form.contactName} their confirmation manually.</>
                        ) : (
                          <><strong>Email sent, but only {success.sessionSuccessCount} of {success.sessionCount} calendar events were marked confirmed.</strong> Check the Availability panel for any still showing tentative and flip them manually.</>
                        )
                      ) : success.calendar && success.email ? (
                        <><strong style={{ color: C.text }}>Done!</strong> Confirmation email sent to {form.contactName} at {form.contactEmail}. Client saved for future bookings.</>
                      ) : !success.calendar && !success.email ? (
                        <><strong>Email failed, and so did marking the calendar event confirmed.</strong> {form.createdEventId ? `The event is still on ${form.room}'s calendar as tentative — check the browser console (right-click → Inspect → Console) for the error, then mark it confirmed manually and send the client their confirmation yourself.` : `Nothing was saved at all — check the console for the error.`}</>
                      ) : !success.calendar ? (
                        <><strong>Email sent, but the calendar event is still marked tentative.</strong> It's on {form.room}'s calendar — just flip its status to Confirmed manually in Google Calendar.</>
                      ) : (
                        <><strong>Calendar event confirmed, but the email failed to send.</strong> The booking is on {form.room}'s calendar — you'll need to send {form.contactName} their confirmation manually.</>
                      )}
                    </div>
                    <button onClick={resetForm} style={{ padding: "12px 32px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "500" }}>Book Another</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ QUOTE TAB ══ */}
        {tab === "quote" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Sect>Quote</Sect>
              <button onClick={resetQuote} style={{ padding: "7px 14px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, fontWeight: "500" }}>↻ New Quote</button>
            </div>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 24 }}>Check one or more candidate dates against every room at once, and send the client a menu of what's actually available — no booking or calendar hold gets created.</p>

            {!token ? (
              <div style={{ color: C.textMuted, fontSize: 14, padding: "20px 0" }}>Connect Google above to check availability.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={S.label}>Band / Client</label>
                    <input value={quoteForm.bandName} onChange={e => setQF("bandName", e.target.value)} placeholder="Optional" style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Contact Name</label>
                    <input value={quoteForm.contactName} onChange={e => setQF("contactName", e.target.value)} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Contact Email *</label>
                    <input type="email" value={quoteForm.contactEmail} onChange={e => setQF("contactEmail", e.target.value)} style={S.input} />
                  </div>
                </div>

                <label style={S.label}>Booking Type *</label>
                <div style={{ background: C.surface3, borderRadius: 3, padding: 3, display: "flex", border: `1px solid ${C.border}`, width: 260, marginBottom: 22 }}>
                  {[["hourly", "⏱ Hourly"], ["daily", "🔒 Lock Out"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => { setQF("bookingType", val); setQuoteResults(null); }}
                      style={{ flex: 1, padding: "9px 0", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: quoteForm.bookingType === val ? C.accent : "transparent", color: quoteForm.bookingType === val ? C.accentText : C.textMuted, border: "none", fontWeight: quoteForm.bookingType === val ? "600" : "400", borderRadius: 2 }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                <Sect>Candidate Dates ({quoteForm.slots.length})</Sect>
                {quoteForm.slots.map((slot, i) => {
                  const updateSlot = patch => { setQF("slots", quoteForm.slots.map(x => x.key === slot.key ? { ...x, ...patch } : x)); setQuoteResults(null); };
                  return (
                    <div key={slot.key} style={{ background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontFamily: FONT.mono, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Option {i + 1}</span>
                        {quoteForm.slots.length > 1 && (
                          <button onClick={() => { setQF("slots", quoteForm.slots.filter(x => x.key !== slot.key)); setQuoteResults(null); }} style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase" }}>Remove</button>
                        )}
                      </div>
                      {quoteForm.bookingType === "hourly" ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 10 }}>
                          <div><label style={S.label}>Date *</label><input type="date" value={slot.eventDate} onChange={e => updateSlot({ eventDate: e.target.value })} style={S.input} /></div>
                          <div><label style={S.label}>Start *</label><select value={slot.startTime} onChange={e => updateSlot({ startTime: e.target.value, endTime: addHoursToTime(e.target.value, 3) })} style={{ ...SEL, padding: "10px 30px 10px 11px" }}><option value="">Select…</option>{START_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                          <div><label style={S.label}>End *</label><select value={slot.endTime} onChange={e => updateSlot({ endTime: e.target.value })} style={{ ...SEL, padding: "10px 30px 10px 11px" }}><option value="">Select…</option>{END_TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div><label style={S.label}>Start Date *</label><input type="date" value={slot.eventDate} onChange={e => updateSlot({ eventDate: e.target.value })} style={S.input} /></div>
                          <div><label style={S.label}>End Date *</label><input type="date" value={slot.endDate} onChange={e => updateSlot({ endDate: e.target.value })} style={S.input} /></div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <button onClick={() => setQF("slots", [...quoteForm.slots, newQuoteSlot()])}
                  style={{ width: "100%", padding: "11px", background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 3, color: C.textMuted, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.03em", textTransform: "uppercase", marginBottom: 22 }}>
                  + Add Another Date Option
                </button>

                <button onClick={checkQuoteAvailability} disabled={!quoteReadyToCheck || checkingQuote}
                  style={{ padding: "12px 28px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600", opacity: (!quoteReadyToCheck || checkingQuote) ? 0.5 : 1, marginBottom: 28 }}>
                  {checkingQuote ? "Checking…" : "Check Availability"}
                </button>

                {quoteResults && (
                  <>
                    <Sect>Available Rooms — Review Before Sending</Sect>
                    {quoteForm.slots.map(slot => {
                      const rooms = quoteResults[slot.key] || [];
                      const available = rooms.filter(r => r.available);
                      const slotLabel = quoteForm.bookingType === "hourly"
                        ? `${fmtDate(slot.eventDate)} · ${fmtTime(slot.startTime)} – ${fmtTime(slot.endTime)}`
                        : formatDateRange(slot.eventDate, slot.endDate);
                      return (
                        <div key={slot.key} style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 13.5, fontWeight: "600", color: C.text, marginBottom: 8 }}>{slotLabel}</div>
                          {available.length === 0 ? (
                            <div style={{ fontSize: 13, color: C.textFaint, padding: "8px 0" }}>Nothing available for this option.</div>
                          ) : available.map(r => {
                            const loc = getRoomLocation(r.room);
                            const selKey = `${slot.key}__${r.room}`;
                            return (
                              <label key={r.room} style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none", padding: "8px 0" }}
                                onClick={() => setQuoteSelections(sel => ({ ...sel, [selKey]: !sel[selKey] }))}>
                                <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${C.border}`, background: quoteSelections[selKey] ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                  {quoteSelections[selKey] && <span style={{ color: C.accentText, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                                </div>
                                <div>
                                  <span style={{ fontSize: 13.5, color: C.text }}>{r.room}{loc.locationName ? `, ${loc.locationName}` : ""}</span>
                                  <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 8 }}>{quoteForm.bookingType === "hourly" ? `$${r.rate}/hr` : `$${r.rate}/day`}</span>
                                  {loc.description && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2 }}>{loc.description}</div>}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}

                    <Sect>Email Message</Sect>
                    <div style={{ marginBottom: 20 }}>
                      <textarea value={quoteForm.greeting} onChange={e => setQF("greeting", e.target.value)} rows={2}
                        placeholder={`Hi ${firstName(quoteForm.contactName) || "there"}, here's what we've got available for you — let us know which works best and we'll get you booked in.`}
                        style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "11px 13px", fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                    </div>

                    <button onClick={sendQuote} disabled={sendingQuote || !quoteForm.contactEmail}
                      style={{ padding: "12px 28px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600", opacity: (sendingQuote || !quoteForm.contactEmail) ? 0.5 : 1 }}>
                      {sendingQuote ? "Sending…" : quoteSent ? "✓ Sent — Send Again" : "Send Quote"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ DAILY RUNDOWN TAB ══ */}
        {tab === "rundown" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Sect>Daily Rundown</Sect>
            </div>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 20 }}>What's happening today, and how to prepare for the next booking day.</p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <button onClick={() => setRundownDate(d => addDays(d, -1))} style={{ width: 28, height: 28, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 3, cursor: "pointer", fontSize: 14 }}>‹</button>
              <button onClick={() => setRundownDate(addDays(new Date(), 1))} style={{ padding: "0 14px", height: 28, background: C.surface3, border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.03em" }}>Tomorrow</button>
              <button onClick={() => setRundownDate(d => addDays(d, 1))} style={{ width: 28, height: 28, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 3, cursor: "pointer", fontSize: 14 }}>›</button>
              <span style={{ fontSize: 13, color: C.textMuted, marginLeft: 6 }}>
                Today ({new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}) → prepping for <strong style={{ color: C.text }}>{rundownDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</strong>
              </span>
            </div>

            {!token ? (
              <div style={{ color: C.textMuted, fontSize: 14, padding: "20px 0" }}>Connect Google above to build a rundown.</div>
            ) : (rundownLoading || todayLoading) ? (
              <div style={{ color: C.textMuted, fontSize: 14, padding: "20px 0" }}>Loading bookings…</div>
            ) : (todayEvents.length === 0 && rundownEvents.length === 0) ? (
              <div style={{ color: C.textFaint, fontSize: 14, padding: "20px 0" }}>Nothing on the calendar for either day.</div>
            ) : (
              <div style={{ marginBottom: 26 }}>
                {buildRoomRundown(todayEvents, rundownEvents, config, rundownDate).map((group, gi) => (
                  <div key={gi} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMuted, marginBottom: 8 }}>📍 {group.address}</div>
                    {group.rooms.map((r, i) => {
                      const stagePlot = r.prepEv ? (r.prepEv.attachments || []).find(a => a.title?.startsWith("Stage Plot")) : null;
                      return (
                        <div key={i} style={{ padding: "13px 14px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 8 }}>
                          <div style={{ fontSize: 13.5, fontWeight: "600", color: C.text, marginBottom: 6 }}>
                            {r.room}{r.flag && <span style={{ marginLeft: 6, color: C.warning, fontFamily: FONT.mono }}>{r.flag}</span>}
                          </div>
                          {r.todays.length > 0 ? r.todays.map((ev, ti) => (
                            <div key={ti} style={{ fontSize: 13, color: C.text, marginBottom: 2 }}>
                              {stripEventFlag(ev.title)} — <span style={{ color: C.textMuted }}>
                                {ev.allDay ? (() => { const { dayNumber, totalDays } = lockoutDayInfo(ev, new Date()); return `All day ${dayNumber}/${totalDays}`; })() : `${new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(ev.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                              </span>
                            </div>
                          )) : (
                            <div style={{ fontSize: 13, color: C.textFaint, marginBottom: 2 }}>Nothing booked today.</div>
                          )}
                          {r.prepLine && (
                            <div style={{ fontSize: 13, color: r.continuing ? C.info : C.warning, marginTop: 6, fontWeight: "500" }}>
                              → {r.prepLine}
                            </div>
                          )}
                          {stagePlot && (
                            <a href={stagePlot.fileUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 4, fontSize: 12, color: C.info, textDecoration: "none" }}>
                              📎 View Stage Plot
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 11, color: C.textFaint }}>* = check notes/stage plot · ** = rentals to set up · *** = flagged for booking staff</div>
              </div>
            )}

            {config.closingNotes && (
              <div style={{ padding: "14px 16px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 26, fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
                {config.closingNotes}
              </div>
            )}

            <Sect>Send to Night Crew</Sect>
            {config.nightCrew.length === 0 ? (
              <div style={{ color: C.textFaint, fontSize: 13, padding: "8px 0 20px" }}>No one's on the roster yet — add crew members in Settings first.</div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", padding: "6px 0 10px", marginBottom: 4, borderBottom: `1px solid ${C.borderSoft}` }}
                  onClick={() => setCheckedCrew(checkedCrew.size === config.nightCrew.length ? new Set() : new Set(config.nightCrew.map((_, i) => i)))}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${C.border}`, background: checkedCrew.size === config.nightCrew.length ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {checkedCrew.size === config.nightCrew.length && <span style={{ color: C.accentText, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12.5, color: C.textMuted, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.03em" }}>Select All</span>
                </label>
                {config.nightCrew.map((p, i) => (
                  <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", padding: "6px 0" }} onClick={() => toggleCrewChecked(i)}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${C.border}`, background: checkedCrew.has(i) ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checkedCrew.has(i) && <span style={{ color: C.accentText, fontSize: 10, fontWeight: "bold", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13.5, color: C.text }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: C.textMuted }}>{p.email || "(no email set)"}</span>
                  </label>
                ))}
              </div>
            )}

            <button onClick={sendRundown} disabled={sendingRundown || !token || (rundownEvents.length === 0 && todayEvents.length === 0)}
              style={{ padding: "12px 28px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600", opacity: (sendingRundown || !token || (rundownEvents.length === 0 && todayEvents.length === 0)) ? 0.5 : 1 }}>
              {sendingRundown ? "Sending…" : rundownSent ? "✓ Sent — Send Again" : "Send Rundown"}
            </button>
          </div>
        )}

        {/* ══ CLIENTS TAB ══ */}
        {tab === "clients" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>
            <Sect>Saved Clients ({clients.length})</Sect>
            <p style={{ color: C.textMuted, fontSize: 13.5, marginTop: -8, marginBottom: 22 }}>Auto-saved after each confirmed booking. Click any client to pre-fill a new booking.</p>
            {clients.length === 0
              ? <div style={{ color: C.textFaint, fontSize: 14, padding: "20px 0" }}>No saved clients yet. Complete a booking to save one.</div>
              : clients.map((c, i) => (
                <div key={i} onClick={() => { setTab("booking"); resetForm(); setTimeout(() => selectClient(c), 50); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = C.surface2; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface3; }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: "500", color: C.text, marginBottom: 2 }}>{c.band}</div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>{c.name} · {c.email}</div>
                  </div>
                  {c.lastBooked && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11.5, color: C.textFaint }}>Last booked {fmtDate(c.lastBooked)}</div>
                      {c.lastRoom && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{c.lastRoom}</div>}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* ══ CALENDAR TAB ══ */}
        {tab === "calendar" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <Sect>Upcoming Events</Sect>
              <button onClick={fetchCalendar} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "7px 16px", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "500" }}>↻ Refresh</button>
            </div>
            {!token
              ? <div style={{ color: C.textMuted, fontSize: 14, padding: "20px 0" }}>Connect Google above to view your calendar.</div>
              : loadingCal
                ? <div style={{ color: C.textMuted, fontSize: 14, padding: "20px 0" }}>Loading calendar…</div>
                : calEvents.length === 0
                  ? <div style={{ color: C.textFaint, fontSize: 14, padding: "20px 0" }}>No upcoming events found.</div>
                  : calEvents.map((ev, i) => {
                    const start = ev.start ? parseEventBoundary(ev.start, ev.allDay) : null;
                    return (
                      <div key={i} style={{ display: "flex", gap: 20, padding: "16px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                        <div style={{ minWidth: 48, textAlign: "center", paddingTop: 2 }}>
                          <div style={{ fontSize: 9.5, color: C.textMuted, fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT.mono }}>{start?.toLocaleDateString("en-US", { month: "short" })}</div>
                          <div style={{ fontSize: 26, color: C.text, fontFamily: FONT.display, lineHeight: 1.1 }}>{start?.getDate()}</div>
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <div style={{ fontSize: 14, fontWeight: "500", color: C.text }}>{ev.title || "Untitled"}</div>
                            {ev.room && (
                              <span style={{ fontSize: 10, fontWeight: "500", color: C.textMuted, background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 20, padding: "2px 9px", fontFamily: FONT.mono, letterSpacing: "0.03em" }}>
                                {ev.room}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMuted }}>
                            {ev.allDay ? "All day" : (
                              <>
                                {start?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                                {ev.end ? ` – ${new Date(ev.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
                              </>
                            )}
                          </div>
                          {ev.location && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>📍 {ev.location}</div>}
                          {ev.description && <div style={{ fontSize: 12, color: C.textFaint, marginTop: 3, maxWidth: 520, lineHeight: 1.55 }}>{ev.description.slice(0, 120)}{ev.description.length > 120 ? "…" : ""}</div>}
                        </div>
                      </div>
                    );
                  })}
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {tab === "settings" && (
          <div style={{ background: C.surface, borderRadius: 4, border: `1px solid ${C.border}`, padding: "32px 36px" }}>

            <div style={{ marginBottom: 24, padding: "10px 14px", background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: 3, fontSize: 12.5, color: C.info, lineHeight: 1.6 }}>
              ℹ️ Settings are saved in this browser only — they won't automatically show up on the owner's/other computer. Use <strong>Copy Config</strong> below and paste it into Settings → Import on the other machine to keep them in sync.
            </div>

            {/* Appearance */}
            <Sect>Appearance</Sect>
            <div style={{ display: "flex", background: C.surface3, borderRadius: 3, padding: 3, border: `1px solid ${C.border}`, width: 220, marginBottom: 34 }}>
              {[["dark", "🌙 Dark"], ["light", "☀️ Light"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setTheme(val)}
                  style={{ flex: 1, padding: "9px 0", fontSize: 13, fontFamily: "inherit", cursor: "pointer", background: theme === val ? C.accent : "transparent", color: theme === val ? C.accentText : C.textMuted, border: "none", fontWeight: theme === val ? "600" : "400", borderRadius: 2, transition: "all 0.15s" }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Rooms */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Sect>Rooms &amp; Pricing</Sect>
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, marginTop: -2, marginBottom: 10 }}>Location Name is a short nickname for the address (e.g. "Mates Cleon") — shown next to the room in multi-session confirmation emails instead of repeating the full address on every line.</p>
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <div style={{ minWidth: 900 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1.4fr 0.8fr 0.8fr 0.8fr 1.2fr auto", gap: 8, padding: "0 0 8px", fontSize: 10, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMuted }}>
                  <div>Room</div><div>Location Name</div><div>Address</div><div>Gate Code</div><div>Hourly $</div><div>Daily $</div><div>Calendar ID</div><div></div>
                </div>
                {Object.entries(config.rooms).map(([room, r]) => (
                  <div key={room} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1.4fr 0.8fr 0.8fr 0.8fr 1.2fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                    <input defaultValue={room} onBlur={e => renameRoom(room, e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input defaultValue={r.locationName} onBlur={e => updateRoomField(room, "locationName", e.target.value)} placeholder="e.g. Mates Cleon" style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input defaultValue={r.address} onBlur={e => updateRoomField(room, "address", e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input defaultValue={r.gateCode} onBlur={e => updateRoomField(room, "gateCode", e.target.value)} placeholder="—" style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input type="number" defaultValue={r.hourly ?? ""} onBlur={e => updateRoomField(room, "hourly", e.target.value === "" ? null : parseFloat(e.target.value))} placeholder="n/a" style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input type="number" defaultValue={r.daily ?? ""} onBlur={e => updateRoomField(room, "daily", e.target.value === "" ? null : parseFloat(e.target.value))} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                    <input defaultValue={r.calendarId} onBlur={e => updateRoomField(room, "calendarId", e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 11.5, fontFamily: FONT.mono, color: r.calendarId?.startsWith("REPLACE_") ? C.warning : C.text }} />
                    <button onClick={() => removeRoom(room)} title="Remove room" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.danger, width: 28, height: 28, borderRadius: 3, cursor: "pointer", fontSize: 13 }}>🗑</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 34 }}>
              <button onClick={addRoom} style={{ padding: "8px 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: C.accent, color: C.accentText, border: "none", fontWeight: "500" }}>+ Add Room</button>
              <button onClick={resetRoomsToDefault} style={{ padding: "8px 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, fontWeight: "500" }}>Reset to Defaults</button>
            </div>

            {/* Room Descriptions (for Quotes) */}
            <Sect>Room Descriptions</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 14 }}>Size, PA specs, backline, whatever's worth telling a client comparing rooms — shown automatically in quote emails.</p>
            <div style={{ marginBottom: 34 }}>
              {ROOMS.map(room => (
                <div key={room} style={{ marginBottom: 12 }}>
                  <label style={S.label}>{room}</label>
                  <textarea defaultValue={config.rooms[room]?.description || ""} onBlur={e => updateRoomField(room, "description", e.target.value)} rows={2}
                    placeholder="e.g. ~400 sq ft, full PA with 2 monitor mixes, house drum kit"
                    style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "9px 11px", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                </div>
              ))}
            </div>

            {/* Gear */}
            <Sect>Rental Gear &amp; Default Rates</Sect>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, padding: "0 0 8px", fontSize: 10, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMuted }}>
                <div>Item Name</div><div>Rate ($/day)</div><div></div>
              </div>
              {config.gear.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                  <input defaultValue={g.name} onBlur={e => renameGear(i, e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                  <input type="number" defaultValue={g.rate} onBlur={e => updateGearRate(i, e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                  <button onClick={() => removeGear(i)} title="Remove item" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.danger, width: 28, height: 28, borderRadius: 3, cursor: "pointer", fontSize: 13 }}>🗑</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 34 }}>
              <button onClick={addGear} style={{ padding: "8px 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: C.accent, color: C.accentText, border: "none", fontWeight: "500" }}>+ Add Gear Item</button>
              <button onClick={resetGearToDefault} style={{ padding: "8px 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, fontWeight: "500" }}>Reset to Defaults</button>
            </div>

            {/* Night Crew roster */}
            <Sect>Night Crew Roster</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>Names/emails available to check off when sending a Daily Rundown.</p>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr auto", gap: 8, padding: "0 0 8px", fontSize: 10, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMuted }}>
                <div>Name</div><div>Email</div><div></div>
              </div>
              {config.nightCrew.length === 0 && (
                <div style={{ padding: "10px 0", fontSize: 12.5, color: C.textFaint }}>No one added yet.</div>
              )}
              {config.nightCrew.map((p, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                  <input defaultValue={p.name} onBlur={e => renameCrewMember(i, e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                  <input type="email" defaultValue={p.email} onBlur={e => updateCrewEmail(i, e.target.value)} style={{ ...S.input, padding: "7px 9px", fontSize: 12.5 }} />
                  <button onClick={() => removeCrewMember(i)} title="Remove" style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.danger, width: 28, height: 28, borderRadius: 3, cursor: "pointer", fontSize: 13 }}>🗑</button>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 34 }}>
              <button onClick={addCrewMember} style={{ padding: "8px 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: C.accent, color: C.accentText, border: "none", fontWeight: "500" }}>+ Add Crew Member</button>
            </div>

            {/* Rundown closing notes */}
            {/* Booking Policy PDFs */}
            <Sect>Booking Policy PDFs</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>The relevant policy attaches automatically to every confirmation email, based on booking type — staff can uncheck it per-booking on the Review screen if needed.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 34 }}>
              {[["hourly", "Hourly Policy"], ["lockout", "Lock Out Policy"]].map(([kind, label]) => {
                const file = kind === "hourly" ? config.hourlyPolicyFile : config.lockoutPolicyFile;
                return (
                  <div key={kind}>
                    <label style={S.label}>{label}</label>
                    {file ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3 }}>
                        <span style={{ fontSize: 12.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {file.fileName}</span>
                        <button onClick={() => removePolicyFile(kind)} style={{ background: "transparent", border: "none", color: C.danger, cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase", flexShrink: 0, marginLeft: 8 }}>Remove</button>
                      </div>
                    ) : (
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px", background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 3, cursor: uploadingPolicy ? "default" : "pointer", fontSize: 12.5, color: C.textMuted }}>
                        {uploadingPolicy === kind ? "Uploading…" : "📎 Upload PDF"}
                        <input type="file" accept=".pdf,application/pdf" disabled={!!uploadingPolicy} onChange={e => e.target.files[0] && uploadPolicyFile(kind, e.target.files[0])} style={{ display: "none" }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            <Sect>Daily Rundown — Closing Notes</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>Shown at the bottom of every rundown, on-screen and in the emailed version.</p>
            <div style={{ marginBottom: 34 }}>
              <textarea defaultValue={config.closingNotes} onBlur={e => updateConfig(prev => ({ ...prev, closingNotes: e.target.value }))} rows={4}
                style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "11px 13px", fontSize: 13, fontFamily: FONT.body, resize: "vertical", boxSizing: "border-box" }} />
            </div>

            {/* Bookings Log */}
            <Sect>Bookings Log</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>
              Every confirmed booking writes a row here automatically — reference ID, room, dates, rates, rentals, totals. {config.bookingsLogSheetId ? "Created the first time a booking was confirmed." : "Gets created automatically the next time you confirm a booking."}
            </p>
            <div style={{ marginBottom: 34 }}>
              {config.bookingsLogSheetId ? (
                <a href={`https://docs.google.com/spreadsheets/d/${config.bookingsLogSheetId}/edit`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500", textDecoration: "none" }}>
                  📊 Open Bookings Log
                </a>
              ) : (
                <div style={{ fontSize: 12.5, color: C.textFaint }}>No log yet — nothing's been confirmed through the app.</div>
              )}
            </div>

            {/* Client Contacts */}
            <Sect>Client Contacts</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>
              One row per client — updated in place (matched by email) every time they book again, not a growing log. {config.contactsSheetId ? "Created the first time a booking was confirmed." : "Gets created automatically the next time you confirm a booking."}
            </p>
            <div style={{ marginBottom: 34 }}>
              {config.contactsSheetId ? (
                <a href={`https://docs.google.com/spreadsheets/d/${config.contactsSheetId}/edit`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500", textDecoration: "none" }}>
                  👥 Open Client Contacts
                </a>
              ) : (
                <div style={{ fontSize: 12.5, color: C.textFaint }}>No contacts yet — nothing's been confirmed through the app.</div>
              )}
            </div>

            {/* Sync between computers */}
            <Sect>Sync Settings Between Computers</Sect>
            <p style={{ fontSize: 12.5, color: C.textMuted, marginTop: -8, marginBottom: 12 }}>Copy/paste works fine between two computers you're sitting at. Download a file instead if you want to email it or send it some other way.</p>
            <div style={{ display: "flex", gap: 8, marginBottom: showConfigImport ? 12 : 0, flexWrap: "wrap" }}>
              <button onClick={exportConfig} style={{ padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500" }}>📋 Copy Config</button>
              <button onClick={downloadConfig} style={{ padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500" }}>💾 Download Config File</button>
              <button onClick={() => setShowConfigImport(s => !s)} style={{ padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500" }}>{showConfigImport ? "Cancel Import" : "⇩ Import Config"}</button>
            </div>
            {showConfigImport && (
              <div>
                <textarea value={configImportText} onChange={e => setConfigImportText(e.target.value)} rows={6}
                  placeholder="Paste the config JSON copied from the other computer here…"
                  style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "11px 13px", fontSize: 12.5, fontFamily: FONT.mono, resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={importConfig} style={{ padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: C.accent, color: C.accentText, border: "none", fontWeight: "500" }}>Apply Pasted Config</button>
                  <span style={{ fontSize: 11.5, color: C.textFaint }}>or</span>
                  <label style={{ padding: "9px 18px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 3, background: "transparent", color: C.text, border: `1px solid ${C.border}`, fontWeight: "500" }}>
                    📁 Choose Config File…
                    <input type="file" accept=".json,application/json" onChange={e => e.target.files[0] && importConfigFile(e.target.files[0])} style={{ display: "none" }} />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* ══ AVAILABILITY PANEL ══ */}
      <div style={{
        width: panelOpen ? panelWidth : 40, flexShrink: 0, position: "sticky", top: 0,
        height: "calc(100vh - 0px)", display: "flex", background: C.surface,
        borderLeft: `1px solid ${C.border}`, transition: isResizing ? "none" : "width 0.2s ease", overflow: "hidden",
      }}>
        {/* Resize handle */}
        {panelOpen && (
          <div onMouseDown={startResize}
            style={{ width: 6, flexShrink: 0, cursor: "col-resize", background: isResizing ? C.accent : "transparent", transition: isResizing ? "none" : "background 0.15s", marginLeft: -3, zIndex: 10 }}
            onMouseEnter={e => { if (!resizingRef.current) e.currentTarget.style.background = C.borderSoft; }}
            onMouseLeave={e => { if (!resizingRef.current) e.currentTarget.style.background = "transparent"; }} />
        )}

        {/* Collapsed tab / toggle */}
        <button onClick={() => setPanelOpen(o => !o)}
          style={{ width: 40, flexShrink: 0, background: "transparent", border: "none", borderRight: panelOpen ? `1px solid ${C.border}` : "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.textMuted, padding: "16px 0" }}>
          <span style={{ fontSize: 15 }}>{panelOpen ? "▸" : "◂"}</span>
          <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 11, letterSpacing: "0.1em", fontFamily: FONT.mono, textTransform: "uppercase" }}>📅 Availability</span>
        </button>

        {panelOpen && (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
            {/* Panel header */}
            <div style={{ padding: "22px 26px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface3 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: FONT.mono, color: C.textMuted, marginBottom: 4 }}>📅 Availability</div>
                  <div style={{ fontSize: 24, fontFamily: FONT.display, letterSpacing: "0.01em", color: C.text, textTransform: "uppercase", lineHeight: 1 }}>
                    {panelView === "month"
                      ? panelDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
                      : panelView === "week"
                        ? `${panelGrid.days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${panelGrid.days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : panelDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </div>
                </div>
                <div style={{ display: "flex", background: C.surface2, borderRadius: 3, padding: 2, border: `1px solid ${C.border}` }}>
                  {["day", "week", "month"].map(v => (
                    <button key={v} onClick={() => setPanelView(v)}
                      style={{ padding: "6px 13px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: FONT.mono, cursor: "pointer", borderRadius: 2, background: panelView === v ? C.accent : "transparent", color: panelView === v ? C.accentText : C.textMuted, border: "none", fontWeight: "500" }}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setPanelDate(d => addDays(d, panelView === "day" ? -1 : panelView === "week" ? -7 : -30))} style={{ width: 28, height: 28, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 3, cursor: "pointer", fontSize: 14 }}>‹</button>
                <button onClick={() => setPanelDate(new Date())} style={{ padding: "0 14px", height: 28, background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 3, cursor: "pointer", fontSize: 11, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.03em" }}>Today</button>
                <button onClick={() => setPanelDate(d => addDays(d, panelView === "day" ? 1 : panelView === "week" ? 7 : 30))} style={{ width: 28, height: 28, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, borderRadius: 3, cursor: "pointer", fontSize: 14 }}>›</button>
              </div>
              {!token && <div style={{ marginTop: 8, fontSize: 11.5, color: C.warning }}>Connect Google to load availability.</div>}
            </div>

            {/* Grid body */}
            <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
              {panelLoading && <div style={{ padding: 16, fontSize: 12, color: C.textMuted }}>Loading…</div>}

              {token && !panelLoading && panelView !== "month" && (() => {
                const HOUR_PX = 46, OPEN_HOUR = 9, CLOSE_HOUR = 23, totalH = (CLOSE_HOUR - OPEN_HOUR) * HOUR_PX;
                const minutesFromOpen = d => Math.max(0, Math.min((d.getHours() * 60 + d.getMinutes()) - OPEN_HOUR * 60, (CLOSE_HOUR - OPEN_HOUR) * 60));
                // Multi-day Lock Outs overlap a day if they start before that day ends and end after it starts.
                const overlapsDay = (ev, day) => {
                  const s = parseEventBoundary(ev.start, ev.allDay), e = parseEventBoundary(ev.end, ev.allDay), dayEnd = addDays(day, 1);
                  return s < dayEnd && e > day;
                };
                const isMultiDay = ev => ev.allDay || new Date(ev.end) - new Date(ev.start) > 20 * 3600000;
                const maxSpanning = Math.max(0, ...panelGrid.days.map(day => panelEvents.filter(ev => overlapsDay(ev, day) && isMultiDay(ev)).length));
                const spanRowH = maxSpanning > 0 ? maxSpanning * 26 + 8 : 0;
                return (
                  <div>
                    {/* Day-of-week header row — kept OUTSIDE the time-axis/day-columns flex row below,
                        so its height never pushes one side down without the other (that mismatch was
                        the earlier bug where events rendered lower than their actual time). */}
                    {panelView === "week" && (
                      <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, background: C.surface }}>
                        <div style={{ width: 48, flexShrink: 0, borderBottom: `1px solid ${C.borderSoft}` }} />
                        {panelGrid.days.map((day, di) => (
                          <div key={di} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: sameDay(day, new Date()) ? C.text : C.textMuted, fontFamily: FONT.mono, fontWeight: sameDay(day, new Date()) ? "600" : "400", padding: "7px 0", borderBottom: `1px solid ${C.borderSoft}`, borderLeft: `1px solid ${C.borderSoft}` }}>
                            {day.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex" }}>
                    <div style={{ width: 48, flexShrink: 0 }}>
                      <div style={{ height: spanRowH }} />
                      <div style={{ position: "relative", height: totalH }}>
                        {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
                          <div key={i} style={{ position: "absolute", top: i * HOUR_PX - 6, right: 8, fontSize: 10.5, color: C.textFaint, fontFamily: FONT.mono }}>
                            {((OPEN_HOUR + i) % 12) || 12}{OPEN_HOUR + i >= 12 ? "p" : "a"}
                          </div>
                        ))}
                      </div>
                    </div>
                    {panelGrid.days.map((day, di) => {
                      const overlapping = panelEvents.filter(ev => overlapsDay(ev, day));
                      const spanning = overlapping.filter(isMultiDay);
                      const timed = overlapping.filter(ev => !isMultiDay(ev));
                      return (
                        <div key={di} style={{ flex: 1, minWidth: 0, borderLeft: `1px solid ${C.borderSoft}` }}>
                          {/* Multi-day (Lock Out) strip */}
                          <div style={{ height: spanRowH, padding: "4px 3px 0" }}>
                            {spanning.map(ev => (
                              <div key={ev.id} onClick={() => openEventDetail(ev)}
                                style={{ height: 21, marginBottom: 3, background: getRoomColor(ev.room), borderRadius: 3, padding: "0 7px", fontSize: 10.5, color: "#161616", fontWeight: 700, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", lineHeight: "21px" }}>
                                🔒 {ev.title}
                              </div>
                            ))}
                          </div>
                          {/* Hourly grid */}
                          <div style={{ position: "relative", height: totalH }}>
                            {Array.from({ length: CLOSE_HOUR - OPEN_HOUR }, (_, i) => (
                              <div key={i} style={{ position: "absolute", top: i * HOUR_PX, left: 0, right: 0, height: HOUR_PX, borderTop: `1px solid ${C.borderSoft}` }} />
                            ))}
                            {timed.map(ev => {
                              const s = new Date(ev.start), e = new Date(ev.end);
                              const top = (minutesFromOpen(s) / 60) * HOUR_PX;
                              const height = Math.max(18, ((minutesFromOpen(e) - minutesFromOpen(s)) / 60) * HOUR_PX);
                              const color = getRoomColor(ev.room);
                              return (
                                <div key={ev.id} onClick={() => openEventDetail(ev)}
                                  style={{ position: "absolute", top, height, left: 3, right: 3, background: color + "cc", border: `1px solid ${color}`, borderRadius: 4, padding: "3px 7px", fontSize: 11, color: "#161616", cursor: "pointer", overflow: "hidden", lineHeight: 1.35, zIndex: 1 }}>
                                  <div style={{ fontWeight: 700 }}>{ev.title}</div>
                                  <div style={{ opacity: 0.85 }}>{ev.room}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                    </div>
                );
              })()}

              {token && !panelLoading && panelView === "month" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 10, color: C.textFaint, fontFamily: FONT.mono, padding: "6px 0", borderBottom: `1px solid ${C.borderSoft}` }}>{d}</div>
                  ))}
                  {panelGrid.days.map((day, i) => {
                    const dayEnd = addDays(day, 1);
                    const dayEvents = panelEvents.filter(ev => parseEventBoundary(ev.start, ev.allDay) < dayEnd && parseEventBoundary(ev.end, ev.allDay) > day);
                    const inMonth = day.getMonth() === panelGrid.monthStart.getMonth();
                    return (
                      <div key={i} onClick={() => { setPanelDate(day); setPanelView("day"); }}
                        style={{ minHeight: 74, borderRight: `1px solid ${C.borderSoft}`, borderBottom: `1px solid ${C.borderSoft}`, padding: "4px 5px", cursor: "pointer", opacity: inMonth ? 1 : 0.35, background: sameDay(day, new Date()) ? C.surface3 : "transparent" }}>
                        <div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: FONT.mono, marginBottom: 3 }}>{day.getDate()}</div>
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id} onClick={e => { e.stopPropagation(); openEventDetail(ev); }}
                            style={{ fontSize: 9.5, color: C.text, background: getRoomColor(ev.room) + "33", borderLeft: `2px solid ${getRoomColor(ev.room)}`, padding: "1px 4px", marginBottom: 2, borderRadius: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 && <div style={{ fontSize: 9, color: C.textFaint }}>+{dayEvents.length - 3} more</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeEventDetail}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: "26px 28px", width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontSize: 19, fontFamily: FONT.display, textTransform: "uppercase", color: C.text, lineHeight: 1.15 }}>{selectedEvent.title}</div>
              <button onClick={closeEventDetail} style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 2 }}>✕</button>
            </div>
            <div style={{ display: "inline-block", fontSize: 10, fontFamily: FONT.mono, textTransform: "uppercase", letterSpacing: "0.05em", color: C.accentText, background: getRoomColor(selectedEvent.room), padding: "3px 9px", borderRadius: 20, margin: "8px 0 16px" }}>
              {selectedEvent.room}
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4 }}>
              {selectedEvent.allDay ? (
                (() => {
                  const startD = parseEventBoundary(selectedEvent.start, true);
                  const lastD = addDays(parseEventBoundary(selectedEvent.end, true), -1); // Calendar's all-day end is exclusive
                  const fmt = d => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                  return sameDay(startD, lastD) ? `${fmt(startD)} · All day` : `${fmt(startD)} – ${fmt(lastD)} · All day`;
                })()
              ) : (
                <>
                  {new Date(selectedEvent.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {` · ${new Date(selectedEvent.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(selectedEvent.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                </>
              )}
            </div>
            {selectedEvent.location && <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 18 }}>📍 {selectedEvent.location}</div>}

            <label style={S.label}>Stage Plot</label>
            <div style={{ marginBottom: 18 }}>
              {(selectedEvent.attachments || []).filter(a => a.title?.startsWith("Stage Plot")).map((a, i) => (
                <a key={i} href={a.fileUrl} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 12.5, color: C.text, textDecoration: "none", marginBottom: 6 }}>
                  <span>📎 {a.title.replace(/^Stage Plot — /, "")}</span>
                  <span style={{ color: C.textFaint, fontSize: 11 }}>Open ↗</span>
                </a>
              ))}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px", background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 3, cursor: uploadingPlot ? "default" : "pointer", fontSize: 12, color: C.textMuted }}>
                {uploadingPlot ? "Uploading…" : "📎 Upload / replace stage plot"}
                <input type="file" accept="image/*,.pdf" disabled={uploadingPlot} onChange={e => e.target.files[0] && uploadStagePlotToEvent(e.target.files[0])} style={{ display: "none" }} />
              </label>
            </div>

            <label style={S.label}>Staff Notes</label>
            <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={5}
              placeholder="Setup notes, rider details, reminders for whoever's on shift…"
              style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.text, padding: "10px 12px", fontSize: 13, fontFamily: FONT.body, resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={saveNote} disabled={savingNote} style={{ flex: 1, padding: "10px", background: C.accent, color: C.accentText, border: "none", borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "600" }}>
                {savingNote ? "Saving…" : "Save Notes"}
              </button>
              <button onClick={() => duplicateAsBooking(selectedEvent)} style={{ flex: 1, padding: "10px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", fontFamily: FONT.mono, fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: "500" }}>
                + New Booking Here
              </button>
            </div>
            {selectedEvent.htmlLink && (
              <a href={selectedEvent.htmlLink} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11.5, color: C.textMuted, textDecoration: "underline", fontFamily: FONT.mono }}>
                🔗 Edit time, title, or price in Google Calendar
              </a>
            )}
          </div>
        </div>
      )}
      </div>


      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes slideIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; }

        /* ─── Theme tokens — dark is the default; [data-theme="light"] overrides ─── */
        [data-theme] {
          --c-bg: #121212; --c-surface: #202020; --c-surface2: #272723; --c-surface3: #181818;
          --c-border: #474741; --c-borderSoft: #33332f;
          --c-text: #f2f2f0; --c-textMuted: #9c9c9c; --c-textFaint: #6f6f6a;
          --c-accent: #ffffff; --c-accentText: #121212;
          --c-success: #8fd6a3; --c-successBg: rgba(143,214,163,0.08); --c-successBorder: rgba(143,214,163,0.28);
          --c-warning: #e8c26a; --c-warningBg: rgba(232,194,106,0.08); --c-warningBorder: rgba(232,194,106,0.30);
          --c-danger: #e58f8f; --c-dangerBg: rgba(229,143,143,0.08); --c-dangerBorder: rgba(229,143,143,0.30);
          --c-info: #9fb7d6; --c-infoBg: rgba(159,183,214,0.08); --c-infoBorder: rgba(159,183,214,0.28);
          --c-focusRing: rgba(255,255,255,0.08);
          --c-iconInvert: 1;
        }
        [data-theme="light"] {
          --c-bg: #f7f7f5; --c-surface: #ffffff; --c-surface2: #f0f0ed; --c-surface3: #ececE8;
          --c-border: #d8d8d2; --c-borderSoft: #e6e6e1;
          --c-text: #171715; --c-textMuted: #686862; --c-textFaint: #9c9c95;
          --c-accent: #171715; --c-accentText: #f7f7f5;
          --c-success: #1f9d4d; --c-successBg: rgba(31,157,77,0.08); --c-successBorder: rgba(31,157,77,0.32);
          --c-warning: #a3720b; --c-warningBg: rgba(163,114,11,0.08); --c-warningBorder: rgba(163,114,11,0.32);
          --c-danger: #c23b3b; --c-dangerBg: rgba(194,59,59,0.08); --c-dangerBorder: rgba(194,59,59,0.32);
          --c-info: #3c6e9e; --c-infoBg: rgba(60,110,158,0.08); --c-infoBorder: rgba(60,110,158,0.32);
          --c-focusRing: rgba(0,0,0,0.08);
          --c-iconInvert: 0;
        }

        body { margin: 0; background: ${C.bg}; }
        input:focus, select:focus, textarea:focus { outline: none !important; border-color: ${C.accent} !important; box-shadow: 0 0 0 3px var(--c-focusRing) !important; }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; filter: invert(var(--c-iconInvert)); }
        select option { background: ${C.surface2}; color: ${C.text}; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${C.surface}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        button:hover { opacity: 0.88; }
        textarea { line-height: 1.6; }
        input::placeholder, textarea::placeholder { color: ${C.textFaint}; }
      `}</style>
    </div>
  );
}
