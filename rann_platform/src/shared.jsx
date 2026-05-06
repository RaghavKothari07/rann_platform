// ============================================================
// shared.jsx — neutral leaf module
//
// Contains the things both RannPlatform.jsx and AdminPanel.jsx need:
//   supabase client, COLORS, TIERS, EVENTS, Button, Card, Input
//
// This file imports nothing from the other two — breaking the circular
// dependency that previously prevented Vite from code-splitting AdminPanel.
// ============================================================
import React from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── SUPABASE CONFIG ─────────────────────────────────────────
// Edit these two lines with your real Supabase URL + anon key.
const SUPABASE_URL = "https://bfmlwpwtmjbesjjmvpoq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbWx3cHd0bWpiZXNqam12cG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjI4NzUsImV4cCI6MjA5MzEzODg3NX0.h-8Lvl1vYiPyLatAEnjSq5edwGT9fUrZ26tbWsdw5Rk";

export const supabaseEnabled = SUPABASE_URL !== "YOUR_SUPABASE_URL_HERE" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY_HERE";
export const supabase = supabaseEnabled ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ── BRAND TOKENS ────────────────────────────────────────────
export const COLORS = {
  primary: "#8B0000",
  primaryDark: "#6B0000",
  primaryLight: "#A00010",
  gold: "#D4A017",
  goldLight: "#E8B82A",
  goldDark: "#B8860B",
  cream: "#F5F1E8",
  creamLight: "#FAF6EC",
  charcoal: "#1A1A1A",
  earth: "#6B4423",
  textGray: "#4A4A4A",
  borderLight: "#E5DFD0",
};

export const TIERS = {
  Bronze: { entry: 100, multiplier: 1, color: "#6B4423" },
  Silver: { entry: 300, multiplier: 1.5, color: "#707070" },
  Gold: { entry: 500, multiplier: 2, color: "#D4A017" },
  Platinum: { entry: 1000, multiplier: 3, color: "#8B0000" },
};

export const EVENTS = ["Push-ups", "Squats", "Plank", "100m Sprint"];

// ── UI COMPONENTS ───────────────────────────────────────────
export const StatCard = ({ label, value, accent = false }) => (
  <div style={{ background: accent ? COLORS.charcoal : "#FFFFFF", color: accent ? COLORS.cream : COLORS.charcoal, padding: 16, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}>
    <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, fontWeight: 600 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: "'Cinzel', serif", color: accent ? COLORS.gold : COLORS.charcoal }}>{value}</div>
  </div>
);

export const Button = ({ children, onClick, variant = "primary", size = "md", style = {}, disabled = false, type = "button" }) => {
  const base = { border: "none", borderRadius: 6, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", fontFamily: "inherit", letterSpacing: 1, opacity: disabled ? 0.5 : 1 };
  const sizes = { sm: { padding: "6px 14px", fontSize: 12 }, md: { padding: "10px 22px", fontSize: 14 }, lg: { padding: "14px 32px", fontSize: 15 } };
  const variants = {
    primary: { background: COLORS.primary, color: COLORS.cream },
    gold: { background: COLORS.gold, color: COLORS.charcoal },
    ghost: { background: "transparent", color: COLORS.primary, border: `1.5px solid ${COLORS.primary}` },
    dark: { background: COLORS.charcoal, color: COLORS.cream },
    light: { background: COLORS.cream, color: COLORS.charcoal, border: `1px solid ${COLORS.borderLight}` },
  };
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>{children}</button>;
};

export const Card = ({ children, style = {}, variant = "default", className = "" }) => {
  const variants = {
    default: { background: "#FFFFFF", border: `1px solid ${COLORS.borderLight}` },
    parchment: { background: "linear-gradient(135deg, #FDF9EE 0%, #F5EDD8 100%)", border: `1px solid ${COLORS.gold}40` },
    dark: { background: "linear-gradient(135deg, #1F1410 0%, #0E0805 100%)", border: `1px solid ${COLORS.gold}80`, color: COLORS.cream },
    crimson: { background: "linear-gradient(135deg, #A00010 0%, #6B0000 100%)", border: `1px solid ${COLORS.gold}`, color: COLORS.cream },
  };
  return (
    <div className={className} style={{
      borderRadius: 12,
      padding: 24,
      boxShadow: "0 2px 12px rgba(20, 8, 5, 0.08), 0 1px 3px rgba(20, 8, 5, 0.04)",
      ...variants[variant],
      ...style,
    }}>
      {children}
    </div>
  );
};

export const Input = ({ label, value, onChange, placeholder, type = "text", required = false, helpText = "" }) => (
  <div style={{ marginBottom: 16 }}>
    {label && (
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.charcoal, marginBottom: 6, letterSpacing: 0.5 }}>
        {label} {required && <span style={{ color: COLORS.primary }}>*</span>}
      </label>
    )}
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, fontFamily: "inherit", background: "#FAFAF7", color: COLORS.charcoal, WebkitTextFillColor: COLORS.charcoal, boxSizing: "border-box" }} />
    {helpText && <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 4 }}>{helpText}</div>}
  </div>
);


// ============================================================
// MOVED FROM RannPlatform.jsx — utilities used by both files
// ============================================================
// Capacity: 5 batches of 5 athletes per (event × tier) = 25 hard cap
export const MAX_PER_SLOT = 25;

export const BELTS = [
  { name: "White", min: 0, color: "#FFFFFF", border: "#999999", textColor: "#1A1A1A" },
  { name: "Blue", min: 250, color: "#1F4E79", border: "#1F4E79", textColor: "#FFFFFF" },
  { name: "Purple", min: 750, color: "#6B2D8F", border: "#6B2D8F", textColor: "#FFFFFF" },
  { name: "Brown", min: 2000, color: "#6B4423", border: "#6B4423", textColor: "#FFFFFF" },
  { name: "Black", min: 5000, color: "#1A1A1A", border: "#1A1A1A", textColor: "#FFFFFF" },
];

// ============================================================
// HELPERS
// ============================================================
export const getBelt = (points) => {
  let belt = BELTS[0];
  for (const b of BELTS) if (points >= b.min) belt = b;
  return belt;
};

export const getNextBelt = (points) => {
  for (const b of BELTS) if (points < b.min) return b;
  return null;
};

export const formatPhone = (p) => {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return p;
};

export const validatePhone = (p) => /^\d{10}$/.test((p || "").replace(/\D/g, ""));

// ============================================================
// PIN HASHING — PBKDF2-SHA256 via Web Crypto API
// Stored: pin_salt (hex) and pin_hash (hex). 100k iterations.
// ============================================================
export const _toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
export const _fromHex = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
};
export const generateSalt = () => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return _toHex(arr);
};
export const hashPin = async (pin, saltHex) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: _fromHex(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return _toHex(bits);
};
export const verifyPin = async (pin, saltHex, expectedHashHex) => {
  if (!saltHex || !expectedHashHex) return false;
  const computed = await hashPin(pin, saltHex);
  return computed === expectedHashHex;
};
export const validatePin = (pin) => /^\d{4}$/.test(pin || "");

// ============================================================
// PERSONAL BEST HELPERS
// Old format: personal_bests = { "Push-ups": 47 }
// New format: personal_bests = { "Push-ups": { value: 47, date: "2026-04-13", event_id: "event_001", previous_value: null, previous_date: null } }
// Read helpers handle BOTH shapes for backward compatibility.
// ============================================================
export const EVENT_LOWER_IS_BETTER = { "100m Sprint": true };

// Unit suffix for displaying personal bests / event values on dashboards & leaderboards.
export const EVENT_UNITS = {
  "Push-ups": "reps",
  "Squats": "reps",
  "Plank": "min",
  "100m Sprint": "sec",
};
export const getPBValue = (pbField) => {
  if (pbField === null || pbField === undefined || pbField === "") return null;
  if (typeof pbField === "object") return pbField.value ?? null;
  return pbField;
};
export const getPBDate = (pbField) => {
  if (pbField && typeof pbField === "object") return pbField.date || null;
  return null;
};
export const getPBPrevious = (pbField) => {
  if (pbField && typeof pbField === "object") return { value: pbField.previous_value ?? null, date: pbField.previous_date || null };
  return { value: null, date: null };
};

// Returns a display string with unit, e.g. "47 reps" or "1:35 min" or "13.4 sec".
// Accepts either a raw value (string|number) or a personal_bests JSON field.
export const formatEventValue = (eventName, valueOrField) => {
  if (valueOrField === null || valueOrField === undefined || valueOrField === "") return "—";
  const raw = (typeof valueOrField === "object" && !Array.isArray(valueOrField))
    ? getPBValue(valueOrField)
    : valueOrField;
  if (raw === null || raw === undefined || raw === "") return "—";
  const unit = EVENT_UNITS[eventName] || "";
  return unit ? `${raw} ${unit}` : String(raw);
};
// Parse event value to a comparable number. "1:35" plank → 95 seconds; "14.2" sprint → 14.2; "47" reps → 47.
export const parseEventValue = (eventName, raw) => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (eventName === "Plank" && s.includes(":")) {
    const parts = s.split(":").map((p) => parseFloat(p));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
  }
  const cleaned = s.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};
export const isNewPB = (eventName, newValueRaw, oldPBField) => {
  const newN = parseEventValue(eventName, newValueRaw);
  if (newN === null) return false;
  const oldRaw = getPBValue(oldPBField);
  const oldN = parseEventValue(eventName, oldRaw);
  if (oldN === null) return true; // first record = always PB
  if (EVENT_LOWER_IS_BETTER[eventName]) return newN < oldN;
  return newN > oldN;
};
export const formatPBDateShort = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
// Compute improvement string between new and old PB values (for dashboard display)
export const computePBImprovement = (eventName, newValue, oldValue) => {
  if (oldValue === null || oldValue === undefined) return null;
  const newN = parseEventValue(eventName, newValue);
  const oldN = parseEventValue(eventName, oldValue);
  if (newN === null || oldN === null) return null;
  const delta = newN - oldN;
  if (EVENT_LOWER_IS_BETTER[eventName]) {
    if (delta < 0) return `${Math.abs(delta).toFixed(1)}s faster`;
    return null;
  }
  if (delta > 0) {
    if (eventName === "Plank") return `+${delta.toFixed(1)}s`;
    return `+${delta} more`;
  }
  return null;
};


// Warrior ID — display "RANN-0042" from numeric column.
// Athletes 1-100 get a "Founding Warrior" badge.
export const formatWarriorId = (id) => {
  if (id === null || id === undefined || isNaN(id)) return null;
  return `RANN-${String(id).padStart(4, "0")}`;
};
export const isFoundingWarrior = (id) => id !== null && id !== undefined && Number(id) <= 100;


// Small colored badge for gender — used on leaderboard rows.
// Aesthetic on-brand colors: deep indigo for men, wine-rose for women.
export const renderGenderBadge = (gender, size = 18) => {
  const v = (gender || "").toLowerCase();
  const baseStyle = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: size, height: size, borderRadius: "50%",
    color: "#FFFFFF",
    fontSize: Math.round(size * 0.65),
    fontWeight: 700, lineHeight: 1, flexShrink: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
  };
  if (v === "men" || v === "male" || v === "m") {
    return <span style={{ ...baseStyle, background: "#1E3A8A" }} title="Men">♂</span>;
  }
  if (v === "women" || v === "female" || v === "f") {
    return <span style={{ ...baseStyle, background: "#9D174D" }} title="Women">♀</span>;
  }
  return null;
};

// Normalize gender string from DB to canonical "Men" | "Women" | null.
// Handles legacy "Male"/"Female", single-letter "M"/"F", current "Men"/"Women",
// and anything weird like " male ", "MEN", "femaIe" (typo'd L), "boy"/"girl", etc.
export const normalizeGender = (gender) => {
  if (gender === null || gender === undefined) return null;
  const v = String(gender).toLowerCase().trim();
  if (!v) return null;
  // Exact matches (fast path)
  if (v === "men" || v === "male" || v === "m" || v === "boy" || v === "man") return "Men";
  if (v === "women" || v === "female" || v === "f" || v === "girl" || v === "woman") return "Women";
  // Substring fallback (catches "Male ", "FEMALE", etc.)
  // Important: check female/women first because "female" contains "male"
  if (v.includes("female") || v.includes("women") || v.includes("woman")) return "Women";
  if (v.includes("male") || v.includes("men") || v.includes("man")) return "Men";
  return null;
};


// ============================================================
// RANK MOVEMENT (▲ / ▼ / NEW indicators on the leaderboard)
// ============================================================

// Standard sort used everywhere — points DESC, events_attended DESC, then warrior_id ASC
// as final stable tiebreaker so ranks dont jump around when DB returns rows in different order.
export const sortAthletesByStanding = (athletes) =>
  [...athletes].sort((a, b) => {
    if ((b.total_points || 0) !== (a.total_points || 0)) return (b.total_points || 0) - (a.total_points || 0);
    if ((b.events_attended || 0) !== (a.events_attended || 0)) return (b.events_attended || 0) - (a.events_attended || 0);
    return (a.warrior_id || 999999) - (b.warrior_id || 999999);
  });

// Standard competition ranking ("1224" / "1334"): tied athletes share a rank, next rank skips.
// Pass `isTied(prev, curr)` — return true if curr should share prev's rank.
// Returns array of { ...item, _rank } in the same order it was passed in (assumes already sorted).
export const assignCompetitionRanks = (sortedItems, isTied) => {
  const result = [];
  let lastRank = 0;
  for (let i = 0; i < sortedItems.length; i++) {
    const item = sortedItems[i];
    let rank;
    if (i === 0) rank = 1;
    else if (isTied(sortedItems[i - 1], item)) rank = lastRank;       // tied with previous
    else rank = i + 1;                                                 // not tied → ordinal position
    lastRank = rank;
    result.push({ ...item, _rank: rank });
  }
  return result;
};

// Standing-tied for overall leaderboard: same points AND same events_attended (warrior_id is just stable order, not a ranking signal)
export const standingTied = (a, b) =>
  (a.total_points || 0) === (b.total_points || 0) &&
  (a.events_attended || 0) === (b.events_attended || 0);

// Returns rank movement vs previous standings:
//   { type: "up"|"down"|"same"|"new", delta?: number }
export const getRankMovement = (currentRank, previousRank) => {
  if (previousRank === null || previousRank === undefined) return { type: "new" };
  if (currentRank < previousRank) return { type: "up", delta: previousRank - currentRank };
  if (currentRank > previousRank) return { type: "down", delta: currentRank - previousRank };
  return { type: "same" };
};

// Snapshot — call BEFORE importing new event results so we capture
// the "before" ranks. Uses standard competition ranking (ties share a rank).
export const snapshotAthleteRanks = async (allAthletes) => {
  const sorted = sortAthletesByStanding(allAthletes);
  const ranked = assignCompetitionRanks(sorted, standingTied);
  const now = new Date().toISOString();
  // Parallel updates — fine for current scale (<200 athletes).
  // If we ever cross ~500, switch to a single bulk RPC.
  await Promise.all(ranked.map((a) =>
    supabase.from("athletes").update({
      previous_rank: a._rank,
      previous_rank_at: now,
    }).eq("phone", a.phone)
  ));
};


// Registration deadline helpers
export const isRegistrationOpen = (event) => {
  if (!event) return false;
  if (event.status !== "open") return false;
  if (event.registration_deadline_at) {
    const deadline = new Date(event.registration_deadline_at);
    if (isNaN(deadline.getTime())) return true; // invalid date, allow
    if (deadline.getTime() <= Date.now()) return false; // past deadline
  }
  return true;
};

export const getDeadlineInfo = (event) => {
  if (!event?.registration_deadline_at) return null;
  const deadline = new Date(event.registration_deadline_at);
  if (isNaN(deadline.getTime())) return null;
  const now = Date.now();
  const ms = deadline.getTime() - now;
  const past = ms <= 0;
  const totalMinutes = Math.abs(Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes % 60;
  let label;
  if (past) label = "closed";
  else if (days > 0) label = `${days}d ${hours}h left`;
  else if (hours > 0) label = `${hours}h ${minutes}m left`;
  else label = `${minutes}m left`;
  return { deadline, past, ms, days, hours, minutes, label, urgent: !past && ms < 24 * 60 * 60 * 1000 };
};

// Friendly event status banner: "Upcoming · 18 May", "Today", "Completed", "Results Live"
export const getEventDateStatus = (event) => {
  if (!event) return { label: "TBA", tone: "neutral" };
  // Manual status from admin overrides date logic
  if (event.status === "results") return { label: "RESULTS LIVE", tone: "good" };
  if (event.status === "completed") return { label: "COMPLETED", tone: "neutral" };
  // Try to parse the event date string
  const ed = event.event_date ? new Date(event.event_date) : null;
  if (ed && !isNaN(ed.getTime())) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate());
    const diffDays = Math.round((eventDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return { label: "TODAY", tone: "good" };
    if (diffDays < 0) return { label: "COMPLETED", tone: "neutral" };
    // Future event — show abbreviated date
    const dayMonth = ed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    return { label: `UPCOMING · ${dayMonth.toUpperCase()}`, tone: "good" };
  }
  // Fallback to old logic
  if (event.status === "open") return { label: "OPEN", tone: "good" };
  if (event.status === "closed") return { label: "CLOSED", tone: "neutral" };
  return { label: (event.status || "TBA").toUpperCase(), tone: "neutral" };
};

export const formatDeadlineDisplay = (event) => {
  if (!event?.registration_deadline_at) return event?.registration_deadline || "—";
  const d = new Date(event.registration_deadline_at);
  if (isNaN(d.getTime())) return event.registration_deadline || "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

export const calculatePoints = (results, tiers) => {
  if (!results || results.length === 0) return 0;
  let dayTotal = 0;
  for (const r of results) {
    let pts = 10;
    if (r.position === 1) pts += 50;
    else if (r.position === 2) pts += 30;
    else if (r.position === 3) pts += 20;
    if (r.isPB) pts += 25;
    const tier = tiers[r.event] || "Bronze";
    pts *= TIERS[tier].multiplier;
    dayTotal += pts;
  }
  const eventsCompeted = new Set(results.map((r) => r.event));
  if (eventsCompeted.size === 4) dayTotal *= 1.5;
  return Math.round(dayTotal);
};

// Slot capacity helpers
export const slotKey = (event, tier) => `${event}|${tier}`;
export const getSlotInfo = (slotCounts, event, tier) => {
  const k = slotKey(event, tier);
  const info = slotCounts[k] || { registered: 0, waitlisted: 0 };
  const spotsLeft = Math.max(0, MAX_PER_SLOT - info.registered);
  const isFull = info.registered >= MAX_PER_SLOT;
  let status = "open";
  if (isFull) status = "full";
  else if (spotsLeft <= 5) status = "almost-full";
  else if (spotsLeft <= 12) status = "filling";
  return { ...info, spotsLeft, isFull, status };
};
export const getSlotColor = (status) => {
  if (status === "full") return { bg: "#7B1A1A", text: "#FFFFFF", label: "FULL · Waitlist" };
  if (status === "almost-full") return { bg: "#C97F12", text: "#FFFFFF", label: "Almost full" };
  if (status === "filling") return { bg: "#5C8A2A", text: "#FFFFFF", label: "Filling fast" };
  return { bg: "#2D7A47", text: "#FFFFFF", label: "Open" };
};

// Token format: B-PU-M-2-04 = Tier letter, Event code, Gender, Batch, Position (zero-padded)
export const TIER_LETTERS = { Bronze: "B", Silver: "S", Gold: "G", Platinum: "P" };
export const EVENT_CODES = { "Push-ups": "PU", "Squats": "SQ", "Plank": "PL", "100m Sprint": "SP" };
export const GENDER_CATEGORIES = ["Men", "Women", "Mixed"];
export const GENDER_LETTERS = { Men: "M", Women: "W", Mixed: "X" };
export const GENDER_COLORS = { Men: "#1F4E79", Women: "#B83280", Mixed: "#5C8A2A" };
export const BATCH_SIZE = 5;
export const formatToken = (tier, eventName, gender, batch, position) => {
  const t = TIER_LETTERS[tier] || "X";
  const e = EVENT_CODES[eventName] || "XX";
  const g = GENDER_LETTERS[gender] || "X";
  const b = String(batch);
  const p = String(position).padStart(2, "0");
  return `${t}-${e}-${g}-${b}-${p}`;
};
// Compute next batch & position for an (event×tier×gender)
export const nextBatchSlot = (existingAssignments, eventName, tier, gender) => {
  const filtered = existingAssignments.filter((a) => a.event_name === eventName && a.tier === tier && a.gender_category === gender);
  // Within a gender, batches fill sequentially. No hard cap on # of batches per gender —
  // capacity is enforced at (event × tier) level by the parent caller.
  for (let batch = 1; batch <= 10; batch++) {
    const inBatch = filtered.filter((a) => a.batch_number === batch);
    if (inBatch.length < BATCH_SIZE) {
      const usedPositions = new Set(inBatch.map((a) => a.position));
      for (let pos = 1; pos <= BATCH_SIZE; pos++) {
        if (!usedPositions.has(pos)) return { batch, position: pos };
      }
    }
  }
  return null;
};

// ============================================================
// SHARED UI COMPONENTS
// ============================================================
