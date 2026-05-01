import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";
import QRCode from "https://esm.sh/qrcode@1.5.3";

// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
// Replace these two values with your own Supabase project's:
//   1. Project URL  (Settings → API → Project URL)
//   2. anon key     (Settings → API → Project API keys → anon public)
// See Rann_Platform_Setup_Guide.docx for step-by-step instructions.
// ============================================================
const SUPABASE_URL = "https://bfmlwpwtmjbesjjmvpoq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmbWx3cHd0bWpiZXNqam12cG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NjI4NzUsImV4cCI6MjA5MzEzODg3NX0.h-8Lvl1vYiPyLatAEnjSq5edwGT9fUrZ26tbWsdw5Rk";

const supabaseEnabled = SUPABASE_URL !== "YOUR_SUPABASE_URL_HERE" && SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY_HERE";
const supabase = supabaseEnabled ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ============================================================
// CONSTANTS — Brand & Business Logic
// ============================================================
const WHATSAPP_COMMUNITY_URL = "https://chat.whatsapp.com/I7eGvUhn3GuEPu1mbk5fB0";
const INSTAGRAM_URL = "https://instagram.com/rann.league";

const COLORS = {
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

const TIERS = {
  Bronze: { entry: 100, multiplier: 1, color: "#6B4423" },
  Silver: { entry: 300, multiplier: 1.5, color: "#707070" },
  Gold: { entry: 500, multiplier: 2, color: "#D4A017" },
  Platinum: { entry: 1000, multiplier: 3, color: "#8B0000" },
};

const EVENTS = ["Push-ups", "Squats", "Plank", "100m Sprint"];

// Capacity: 5 batches of 5 athletes per (event × tier) = 25 hard cap
const MAX_PER_SLOT = 25;

const BELTS = [
  { name: "White", min: 0, color: "#FFFFFF", border: "#999999", textColor: "#1A1A1A" },
  { name: "Blue", min: 250, color: "#1F4E79", border: "#1F4E79", textColor: "#FFFFFF" },
  { name: "Purple", min: 750, color: "#6B2D8F", border: "#6B2D8F", textColor: "#FFFFFF" },
  { name: "Brown", min: 2000, color: "#6B4423", border: "#6B4423", textColor: "#FFFFFF" },
  { name: "Black", min: 5000, color: "#1A1A1A", border: "#1A1A1A", textColor: "#FFFFFF" },
];

// ============================================================
// HELPERS
// ============================================================
const getBelt = (points) => {
  let belt = BELTS[0];
  for (const b of BELTS) if (points >= b.min) belt = b;
  return belt;
};

const getNextBelt = (points) => {
  for (const b of BELTS) if (points < b.min) return b;
  return null;
};

const formatPhone = (p) => {
  const digits = (p || "").replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return p;
};

const validatePhone = (p) => /^\d{10}$/.test((p || "").replace(/\D/g, ""));

// ============================================================
// PIN HASHING — PBKDF2-SHA256 via Web Crypto API
// Stored: pin_salt (hex) and pin_hash (hex). 100k iterations.
// ============================================================
const _toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const _fromHex = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
};
const generateSalt = () => {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return _toHex(arr);
};
const hashPin = async (pin, saltHex) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: _fromHex(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return _toHex(bits);
};
const verifyPin = async (pin, saltHex, expectedHashHex) => {
  if (!saltHex || !expectedHashHex) return false;
  const computed = await hashPin(pin, saltHex);
  return computed === expectedHashHex;
};
const validatePin = (pin) => /^\d{4}$/.test(pin || "");

// ============================================================
// PERSONAL BEST HELPERS
// Old format: personal_bests = { "Push-ups": 47 }
// New format: personal_bests = { "Push-ups": { value: 47, date: "2026-04-13", event_id: "event_001", previous_value: null, previous_date: null } }
// Read helpers handle BOTH shapes for backward compatibility.
// ============================================================
const EVENT_LOWER_IS_BETTER = { "100m Sprint": true };
const getPBValue = (pbField) => {
  if (pbField === null || pbField === undefined || pbField === "") return null;
  if (typeof pbField === "object") return pbField.value ?? null;
  return pbField;
};
const getPBDate = (pbField) => {
  if (pbField && typeof pbField === "object") return pbField.date || null;
  return null;
};
const getPBPrevious = (pbField) => {
  if (pbField && typeof pbField === "object") return { value: pbField.previous_value ?? null, date: pbField.previous_date || null };
  return { value: null, date: null };
};
// Parse event value to a comparable number. "1:35" plank → 95 seconds; "14.2" sprint → 14.2; "47" reps → 47.
const parseEventValue = (eventName, raw) => {
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
const isNewPB = (eventName, newValueRaw, oldPBField) => {
  const newN = parseEventValue(eventName, newValueRaw);
  if (newN === null) return false;
  const oldRaw = getPBValue(oldPBField);
  const oldN = parseEventValue(eventName, oldRaw);
  if (oldN === null) return true; // first record = always PB
  if (EVENT_LOWER_IS_BETTER[eventName]) return newN < oldN;
  return newN > oldN;
};
const formatPBDateShort = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
// Compute improvement string between new and old PB values (for dashboard display)
const computePBImprovement = (eventName, newValue, oldValue) => {
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
const formatWarriorId = (id) => {
  if (id === null || id === undefined || isNaN(id)) return null;
  return `RANN-${String(id).padStart(4, "0")}`;
};
const isFoundingWarrior = (id) => id !== null && id !== undefined && Number(id) <= 100;


// Registration deadline helpers
const isRegistrationOpen = (event) => {
  if (!event) return false;
  if (event.status !== "open") return false;
  if (event.registration_deadline_at) {
    const deadline = new Date(event.registration_deadline_at);
    if (isNaN(deadline.getTime())) return true; // invalid date, allow
    if (deadline.getTime() <= Date.now()) return false; // past deadline
  }
  return true;
};

const getDeadlineInfo = (event) => {
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
const getEventDateStatus = (event) => {
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

const formatDeadlineDisplay = (event) => {
  if (!event?.registration_deadline_at) return event?.registration_deadline || "—";
  const d = new Date(event.registration_deadline_at);
  if (isNaN(d.getTime())) return event.registration_deadline || "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
};

const calculatePoints = (results, tiers) => {
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
const slotKey = (event, tier) => `${event}|${tier}`;
const getSlotInfo = (slotCounts, event, tier) => {
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
const getSlotColor = (status) => {
  if (status === "full") return { bg: "#7B1A1A", text: "#FFFFFF", label: "FULL · Waitlist" };
  if (status === "almost-full") return { bg: "#C97F12", text: "#FFFFFF", label: "Almost full" };
  if (status === "filling") return { bg: "#5C8A2A", text: "#FFFFFF", label: "Filling fast" };
  return { bg: "#2D7A47", text: "#FFFFFF", label: "Open" };
};

// Token format: B-PU-M-2-04 = Tier letter, Event code, Gender, Batch, Position (zero-padded)
const TIER_LETTERS = { Bronze: "B", Silver: "S", Gold: "G", Platinum: "P" };
const EVENT_CODES = { "Push-ups": "PU", "Squats": "SQ", "Plank": "PL", "100m Sprint": "SP" };
const GENDER_CATEGORIES = ["Men", "Women", "Mixed"];
const GENDER_LETTERS = { Men: "M", Women: "W", Mixed: "X" };
const GENDER_COLORS = { Men: "#1F4E79", Women: "#B83280", Mixed: "#5C8A2A" };
const BATCH_SIZE = 5;
const formatToken = (tier, eventName, gender, batch, position) => {
  const t = TIER_LETTERS[tier] || "X";
  const e = EVENT_CODES[eventName] || "XX";
  const g = GENDER_LETTERS[gender] || "X";
  const b = String(batch);
  const p = String(position).padStart(2, "0");
  return `${t}-${e}-${g}-${b}-${p}`;
};
// Compute next batch & position for an (event×tier×gender)
const nextBatchSlot = (existingAssignments, eventName, tier, gender) => {
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

// Crossed swords emblem - the warrior mark of Rann
const SwordsEmblem = ({ size = 80, color = "#D4A017", strokeWidth = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`swordGrad${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F0C840" />
        <stop offset="50%" stopColor={color} />
        <stop offset="100%" stopColor="#8B6508" />
      </linearGradient>
    </defs>
    {/* Sword 1 - top-left to bottom-right */}
    <g transform="rotate(45 50 50)">
      {/* Blade */}
      <path d="M 50 8 L 53 15 L 53 60 L 50 65 L 47 60 L 47 15 Z" fill={`url(#swordGrad${size})`} stroke={color} strokeWidth={strokeWidth} />
      {/* Crossguard */}
      <rect x="38" y="63" width="24" height="4" fill={color} stroke="#6B4423" strokeWidth="0.5" />
      {/* Handle */}
      <rect x="48" y="67" width="4" height="14" fill="#6B4423" />
      {/* Pommel */}
      <circle cx="50" cy="84" r="3.5" fill={color} stroke="#6B4423" strokeWidth="0.5" />
      {/* Tip detail */}
      <path d="M 50 8 L 51 11 L 49 11 Z" fill="#FFFFFF" opacity="0.6" />
    </g>
    {/* Sword 2 - top-right to bottom-left */}
    <g transform="rotate(-45 50 50)">
      <path d="M 50 8 L 53 15 L 53 60 L 50 65 L 47 60 L 47 15 Z" fill={`url(#swordGrad${size})`} stroke={color} strokeWidth={strokeWidth} />
      <rect x="38" y="63" width="24" height="4" fill={color} stroke="#6B4423" strokeWidth="0.5" />
      <rect x="48" y="67" width="4" height="14" fill="#6B4423" />
      <circle cx="50" cy="84" r="3.5" fill={color} stroke="#6B4423" strokeWidth="0.5" />
      <path d="M 50 8 L 51 11 L 49 11 Z" fill="#FFFFFF" opacity="0.6" />
    </g>
    {/* Center medallion */}
    <circle cx="50" cy="50" r="8" fill="#1A1A1A" stroke={color} strokeWidth="1.5" />
    <circle cx="50" cy="50" r="3" fill={color} />
  </svg>
);

// Ornamental divider for sections
const OrnamentDivider = ({ color = "#D4A017", width = 200 }) => (
  <svg width={width} height="20" viewBox="0 0 200 20" style={{ display: "block", margin: "0 auto" }}>
    <line x1="0" y1="10" x2="80" y2="10" stroke={color} strokeWidth="1" />
    <circle cx="90" cy="10" r="2" fill={color} />
    <path d="M 95 10 L 100 5 L 105 10 L 100 15 Z" fill={color} />
    <circle cx="110" cy="10" r="2" fill={color} />
    <line x1="120" y1="10" x2="200" y2="10" stroke={color} strokeWidth="1" />
  </svg>
);

const RannLogo = ({ size = "md", inverted = false, showEmblem = true }) => {
  const sizes = {
    sm: { rann: 26, dev: 14, sub: 9, emblem: 32, spacing: 0.04 },
    md: { rann: 44, dev: 22, sub: 11, emblem: 50, spacing: 0.05 },
    lg: { rann: 72, dev: 32, sub: 13, emblem: 80, spacing: 0.05 },
    xl: { rann: 92, dev: 40, sub: 14, emblem: 130, spacing: 0.04 },
  };
  const s = sizes[size];
  const mainColor = inverted ? COLORS.cream : COLORS.charcoal;
  const accentColor = inverted ? COLORS.gold : COLORS.primary;
  return (
    <div style={{ textAlign: "center", lineHeight: 1, position: "relative", display: "inline-block", maxWidth: "100%" }}>
      {showEmblem && size !== "sm" && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: inverted ? 0.32 : 0.15, zIndex: 0, pointerEvents: "none" }}>
          <SwordsEmblem size={s.emblem * 1.6} color={inverted ? COLORS.gold : COLORS.primary} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: s.dev, color: accentColor, fontWeight: 700, fontFamily: "'Noto Serif Devanagari', serif", marginBottom: 4, letterSpacing: 2 }}>रण</div>
        <div style={{
          fontSize: `clamp(${Math.round(s.rann * 0.55)}px, ${s.rann * 0.11}vw, ${s.rann}px)`,
          fontFamily: "'Cinzel', 'Times New Roman', serif",
          fontWeight: 700,
          letterSpacing: `${s.spacing}em`,
          color: mainColor,
          lineHeight: 1,
          textShadow: inverted ? `0 2px 8px rgba(0,0,0,0.4)` : "none",
          whiteSpace: "nowrap",
        }}>RANN</div>
        {size !== "sm" && (
          <>
            <div style={{ marginTop: 14, marginBottom: 10 }}>
              <OrnamentDivider color={accentColor} width={size === "xl" ? 200 : size === "lg" ? 160 : 130} />
            </div>
            <div style={{ fontSize: s.sub, color: accentColor, letterSpacing: 4, fontWeight: 600, whiteSpace: "nowrap" }}>STEP INTO THE ARENA</div>
          </>
        )}
      </div>
    </div>
  );
};

const Button = ({ children, onClick, variant = "primary", size = "md", style = {}, disabled = false, type = "button" }) => {
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

const Card = ({ children, style = {}, variant = "default" }) => {
  const variants = {
    default: { background: "#FFFFFF", border: `1px solid ${COLORS.borderLight}` },
    parchment: { background: "linear-gradient(135deg, #FDF9EE 0%, #F5EDD8 100%)", border: `1px solid ${COLORS.gold}40` },
    dark: { background: "linear-gradient(135deg, #1F1410 0%, #0E0805 100%)", border: `1px solid ${COLORS.gold}80`, color: COLORS.cream },
    crimson: { background: "linear-gradient(135deg, #A00010 0%, #6B0000 100%)", border: `1px solid ${COLORS.gold}`, color: COLORS.cream },
  };
  return (
    <div style={{
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

// UPI QR code component — generates a scannable UPI deep-link QR
const UPIQrCode = ({ upiId, amount, name = "Rann League", size = 180 }) => {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    if (!upiId) return;
    const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}${amount ? `&am=${amount}` : ""}&cu=INR`;
    QRCode.toDataURL(upiLink, { width: size * 2, margin: 1, color: { dark: "#1A1A1A", light: "#FFFFFF" } })
      .then((url) => setDataUrl(url))
      .catch(() => setDataUrl(null));
  }, [upiId, amount, name, size]);
  if (!dataUrl) return <div style={{ width: size, height: size, background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, fontSize: 11, color: COLORS.textGray }}>Generating QR...</div>;
  return <img src={dataUrl} alt="UPI QR" width={size} height={size} style={{ display: "block", borderRadius: 8, border: `2px solid ${COLORS.gold}` }} />;
};

const Input = ({ label, value, onChange, placeholder, type = "text", required = false, helpText = "" }) => (
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

const BeltBadge = ({ points, size = "md" }) => {
  const belt = getBelt(points);
  const sizes = { sm: { padding: "3px 10px", fontSize: 11 }, md: { padding: "5px 14px", fontSize: 13 }, lg: { padding: "8px 20px", fontSize: 16 } };
  return (
    <span style={{ display: "inline-block", background: belt.color, color: belt.textColor, border: `1px solid ${belt.border}`, borderRadius: 14, fontWeight: 700, letterSpacing: 0.5, ...sizes[size] }}>
      {belt.name} Belt
    </span>
  );
};

const SectionHeader = ({ title, subtitle, inline = false, centered = false }) => (
  <div style={{ marginBottom: inline ? 0 : 20, textAlign: centered ? "center" : "left" }}>
    <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 3, fontWeight: 700 }}>◆ {subtitle?.toUpperCase()} ◆</div>
    <div style={{ fontSize: 26, fontFamily: "'Cinzel', serif", fontWeight: 600, color: COLORS.charcoal, marginTop: 6, letterSpacing: 0.5 }}>{title}</div>
    {centered && <div style={{ marginTop: 10 }}><OrnamentDivider color={COLORS.gold} width={120} /></div>}
  </div>
);

const StatCard = ({ label, value, accent = false }) => (
  <div style={{ background: accent ? COLORS.charcoal : "#FFFFFF", color: accent ? COLORS.cream : COLORS.charcoal, padding: 16, borderRadius: 8, border: `1px solid ${COLORS.borderLight}` }}>
    <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, fontWeight: 600 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, fontFamily: "'Cinzel', serif", color: accent ? COLORS.gold : COLORS.charcoal }}>{value}</div>
  </div>
);

// ============================================================
// SETUP REQUIRED SCREEN — shown if Supabase not configured
// ============================================================
const SetupRequired = () => (
  <div style={{ maxWidth: 640, margin: "60px auto", padding: 20 }}>
    <div style={{ textAlign: "center", marginBottom: 24 }}><RannLogo size="md" /></div>
    <Card style={{ borderTop: `4px solid ${COLORS.gold}` }}>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Cinzel', serif", color: COLORS.charcoal, marginBottom: 12 }}>Setup Required</div>
      <div style={{ fontSize: 14, color: COLORS.textGray, lineHeight: 1.6, marginBottom: 20 }}>
        Before this platform works, you need to connect it to your free Supabase backend. This is a one-time, 30-minute setup.
      </div>
      <div style={{ background: COLORS.creamLight, padding: 16, borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quick steps:</div>
        <ol style={{ fontSize: 13, lineHeight: 1.8, marginLeft: 18, padding: 0 }}>
          <li>Open <strong>Rann_Platform_Setup_Guide.docx</strong> for the full walkthrough</li>
          <li>Create a free account at <strong>supabase.com</strong></li>
          <li>Run the SQL from <strong>Rann_Supabase_Schema.sql</strong> in the SQL editor</li>
          <li>Copy your Project URL and anon key</li>
          <li>Paste them at the top of this code (lines 14–15)</li>
          <li>Reload — you're live</li>
        </ol>
      </div>
      <div style={{ fontSize: 12, color: COLORS.textGray, fontStyle: "italic" }}>
        Once connected, athletes can register from any phone, and you can manage everything from the Admin panel.
      </div>
    </Card>
  </div>
);

// ============================================================
// HOME PAGE
// ============================================================
const HomePage = ({ event, athlete, onNav, leaderboardPreview }) => (
  <div>
    {/* HERO — cinematic with crossed swords */}
    <div style={{
      position: "relative",
      background: `radial-gradient(ellipse at center, ${COLORS.primaryLight} 0%, ${COLORS.primary} 40%, ${COLORS.primaryDark} 80%, #3A0000 100%)`,
      padding: "50px 20px 60px",
      textAlign: "center",
      borderRadius: 16,
      marginBottom: 32,
      overflow: "hidden",
      boxShadow: `0 8px 32px rgba(75, 0, 0, 0.35), inset 0 1px 0 ${COLORS.gold}40`,
      border: `1px solid ${COLORS.gold}60`,
    }}>
      {/* Decorative corner ornaments */}
      <div style={{ position: "absolute", top: 10, left: 10, width: 28, height: 28, borderTop: `2px solid ${COLORS.gold}`, borderLeft: `2px solid ${COLORS.gold}`, opacity: 0.7 }} />
      <div style={{ position: "absolute", top: 10, right: 10, width: 28, height: 28, borderTop: `2px solid ${COLORS.gold}`, borderRight: `2px solid ${COLORS.gold}`, opacity: 0.7 }} />
      <div style={{ position: "absolute", bottom: 10, left: 10, width: 28, height: 28, borderBottom: `2px solid ${COLORS.gold}`, borderLeft: `2px solid ${COLORS.gold}`, opacity: 0.7 }} />
      <div style={{ position: "absolute", bottom: 10, right: 10, width: 28, height: 28, borderBottom: `2px solid ${COLORS.gold}`, borderRight: `2px solid ${COLORS.gold}`, opacity: 0.7 }} />

      {/* Subtle dot pattern overlay */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `radial-gradient(circle, ${COLORS.gold}15 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
        opacity: 0.5,
        pointerEvents: "none",
      }} />

      {/* The big logo with swords */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <RannLogo size="xl" inverted />
        <div style={{ fontStyle: "italic", color: COLORS.cream, opacity: 0.85, marginTop: 22, fontSize: 14, fontFamily: "Georgia, serif", letterSpacing: 1 }}>
          ~ Where warriors are made ~
        </div>
      </div>
    </div>

    {/* Welcome back / Login row */}
    {athlete ? (
      <Card variant="parchment" style={{ marginBottom: 24, borderColor: COLORS.gold }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.earth, letterSpacing: 2, fontWeight: 700 }}>◆ WELCOME BACK ◆</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.charcoal, marginTop: 4, fontFamily: "'Cinzel', serif" }}>{athlete.name}</div>
            <div style={{ marginTop: 10 }}><BeltBadge points={athlete.total_points || 0} /></div>
          </div>
          <Button onClick={() => onNav("dashboard")} variant="primary">Enter Your Dashboard →</Button>
        </div>
      </Card>
    ) : (
      <Card style={{
        marginBottom: 24,
        padding: "22px 24px",
        background: `linear-gradient(135deg, #FFFFFF 0%, ${COLORS.creamLight} 100%)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
          {/* New Warrior side */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "1 1 240px", minWidth: 0 }}>
            <SwordsEmblem size={36} color={COLORS.gold} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 1.5, fontWeight: 700, marginBottom: 2 }}>NEW TO RANN?</div>
              <div style={{ fontSize: 14, color: COLORS.charcoal, fontWeight: 700 }}>Step into the arena</div>
            </div>
            <Button onClick={() => onNav("register")} variant="gold" size="sm" style={{ whiteSpace: "nowrap", marginLeft: 8 }}>Register →</Button>
          </div>
          {/* Divider */}
          <div style={{ width: 1, height: 48, background: COLORS.borderLight }}></div>
          {/* Returning Warrior side */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "1 1 240px", minWidth: 0 }}>
            <SwordsEmblem size={36} color={COLORS.primary} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: COLORS.primary, letterSpacing: 1.5, fontWeight: 700, marginBottom: 2 }}>RETURNING WARRIOR?</div>
              <div style={{ fontSize: 14, color: COLORS.charcoal, fontWeight: 700 }}>Welcome back</div>
            </div>
            <Button onClick={() => onNav("login")} variant="ghost" size="sm" style={{ whiteSpace: "nowrap", marginLeft: 8 }}>Login →</Button>
          </div>
        </div>
      </Card>
    )}

    {/* Next event hero — dark dramatic */}
    <Card variant="dark" style={{ marginBottom: 40, padding: "28px 20px", position: "relative", overflow: "hidden" }}>
      {/* Background swords */}
      <div style={{ position: "absolute", right: -30, top: -30, opacity: 0.08, pointerEvents: "none" }}>
        <SwordsEmblem size={280} color={COLORS.gold} />
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ color: COLORS.gold, fontSize: 12, letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>
            ◆ {getEventDateStatus(event).label} ◆
          </div>
          <div style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: 0.5, marginBottom: 14, lineHeight: 1.2, wordBreak: "break-word" }}>
            {event?.event_date || "Date TBA"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 14, opacity: 0.9, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: COLORS.gold }}>◆</span> {event?.venue || "Venue TBA"}
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: COLORS.gold }}>◆</span> {event?.start_time || "6:30 AM"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, fontStyle: "italic", marginTop: 4 }}>
              Registration closes {formatDeadlineDisplay(event)}
            </div>
            {(() => {
              const info = getDeadlineInfo(event);
              if (!info || info.past) return null;
              if (!info.urgent) return null;
              return (
                <div style={{ marginTop: 8, padding: "6px 12px", background: COLORS.gold, color: COLORS.charcoal, borderRadius: 4, fontSize: 12, fontWeight: 700, letterSpacing: 1, display: "inline-block", alignSelf: "flex-start" }}>
                  ⏰ {info.label}
                </div>
              );
            })()}
          </div>
        </div>
        <div>
          {isRegistrationOpen(event) ? (
            <Button onClick={() => onNav("register")} variant="gold" size="lg" style={{ fontSize: "clamp(13px, 4vw, 16px)", padding: "14px 20px", whiteSpace: "nowrap" }}>
              ⚔ ENTER THE ARENA →
            </Button>
          ) : (
            <div style={{ background: COLORS.primary, color: COLORS.cream, padding: "14px 24px", borderRadius: 6, fontWeight: 600, fontSize: 13, textAlign: "center" }}>
              {event?.status === "results" ? "View Results" : (event?.status === "closed" || (getDeadlineInfo(event)?.past)) ? "Gates Closed" : "Coming Soon"}
            </div>
          )}
        </div>
      </div>
    </Card>

    {/* The four events — themed cards */}
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="The Four Trials" subtitle="Sunday morning · 5-warrior heats" centered />
      <div className="rann-event-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14, marginTop: 24 }}>
        {[
          { name: "Push-ups", spec: "60 sec · max reps", icon: "💪", desc: "Chest to block" },
          { name: "Squats", spec: "90 sec · max reps", icon: "🏋", desc: "Hip below knee" },
          { name: "Plank", spec: "Max hold time", icon: "⏱", desc: "Forearm · straight" },
          { name: "100m Sprint", spec: "Fastest wins", icon: "⚡", desc: "Standing start" },
        ].map((e, i) => (
          <Card key={e.name} variant="parchment" style={{ textAlign: "center", padding: 24, position: "relative", overflow: "hidden", transition: "transform 0.2s" }}>
            <div style={{ position: "absolute", top: -10, right: -10, width: 60, height: 60, borderRadius: "50%", background: `${COLORS.primary}10`, pointerEvents: "none" }} />
            <div style={{ fontSize: 32, marginBottom: 8, position: "relative", zIndex: 1 }}>{e.icon}</div>
            <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>EVENT {i + 1}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.primary, fontFamily: "'Cinzel', serif", letterSpacing: 1, marginBottom: 8 }}>
              {e.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, color: COLORS.earth, fontStyle: "italic", marginBottom: 4 }}>{e.spec}</div>
            <div style={{ fontSize: 11, color: COLORS.textGray, fontWeight: 600, letterSpacing: 0.5 }}>{e.desc}</div>
          </Card>
        ))}
      </div>
    </div>

    {/* Tier cards — dramatic, each tier its own card not a flat table */}
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="Choose Your Tier" subtitle="5 compete · Everyone wins" centered />
      <div style={{ fontSize: 13, color: COLORS.textGray, fontStyle: "italic", textAlign: "center", marginTop: -8, marginBottom: 24 }}>
        Pay your entry · Win double · Even 5th place keeps 30%
      </div>
      <div className="rann-tier-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {Object.entries(TIERS).map(([name, t], i) => (
          <Card key={name} className="rann-tier-card" style={{
            padding: 0,
            overflow: "hidden",
            border: name === "Gold" ? `3px solid ${COLORS.gold}` : `2px solid ${t.color}`,
            boxShadow: name === "Gold"
              ? `0 8px 24px rgba(212, 160, 23, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08)`
              : `0 1px 3px rgba(0, 0, 0, 0.05)`,
            transform: name === "Gold" ? "translateY(-4px)" : "none",
            position: "relative",
          }}>
            <div style={{ background: t.color, color: name === "Silver" ? "#FFFFFF" : (name === "Gold" ? COLORS.charcoal : "#FFFFFF"), padding: "14px 12px", textAlign: "center", fontFamily: "'Cinzel', serif", fontSize: 17, fontWeight: 700, letterSpacing: 2 }}>
              {name.toUpperCase()}
            </div>
            <div style={{ padding: 18, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: COLORS.textGray, letterSpacing: 1, fontWeight: 600 }}>ENTRY</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: COLORS.charcoal, fontFamily: "'Cinzel', serif", marginTop: 2, marginBottom: 12 }}>₹{t.entry}</div>
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10, fontSize: 13, lineHeight: 1.8, color: COLORS.charcoal }}>
                <div style={{ fontSize: 10, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>◆ PRIZES ◆</div>
                <div><span style={{ color: COLORS.gold, fontWeight: 700 }}>1st</span> · <strong>₹{t.entry * 2}</strong></div>
                <div><span style={{ color: COLORS.textGray, fontWeight: 700 }}>2nd</span> · ₹{t.entry}</div>
                <div><span style={{ color: COLORS.textGray, fontWeight: 700 }}>3-5</span> · ₹{Math.round(t.entry * 0.3)} each</div>
              </div>
              <div style={{ marginTop: 12, padding: "6px 10px", background: `${t.color}15`, borderRadius: 4, fontSize: 11, color: t.color, fontWeight: 700, letterSpacing: 1 }}>
                {t.multiplier}× POINTS
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>

    {/* HOW IT WORKS — Points & Belts explainer */}
    <div style={{ marginBottom: 40 }}>
      <SectionHeader title="How You Climb" subtitle="Points · Belts · Glory" centered />

      {/* The big picture intro */}
      <Card variant="parchment" style={{ marginBottom: 20, padding: 24 }}>
        <div style={{ fontSize: 15, lineHeight: 1.7, color: COLORS.charcoal, fontFamily: "Georgia, serif" }}>
          Every Sunday you compete, you earn <strong style={{ color: COLORS.primary }}>points</strong>. Points stack up over time. As your total grows, you climb the <strong style={{ color: COLORS.primary }}>belt ranks</strong> — White → Blue → Purple → Brown → Black. Higher belts unlock perks like free entries and priority registration. The top warrior of the year wins the <strong style={{ color: COLORS.primary }}>Pink City Champion</strong> title and ₹50,000.
        </div>
      </Card>

      {/* How to earn points */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>◆ HOW POINTS WORK ◆</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <Card style={{ padding: 18, borderTop: `3px solid ${COLORS.primary}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>Just Show Up</div>
            <div style={{ fontSize: 13, color: COLORS.textGray, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.primary }}>+10 points</strong> for every event you compete in. Showing up is half the battle.
            </div>
          </Card>
          <Card style={{ padding: 18, borderTop: `3px solid ${COLORS.gold}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>Win Your Heat</div>
            <div style={{ fontSize: 13, color: COLORS.textGray, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.gold }}>+50</strong> for 1st · <strong>+30</strong> for 2nd · <strong>+20</strong> for 3rd
            </div>
          </Card>
          <Card style={{ padding: 18, borderTop: `3px solid ${COLORS.earth}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>Beat Your Best</div>
            <div style={{ fontSize: 13, color: COLORS.textGray, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.earth }}>+25 bonus</strong> when you set a personal best — beat your own previous score.
            </div>
          </Card>
          <Card style={{ padding: 18, borderTop: `3px solid ${COLORS.primaryDark}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>Compete in All 4</div>
            <div style={{ fontSize: 13, color: COLORS.textGray, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.primary }}>1.5× multiplier</strong> on your day's points if you compete in all four events.
            </div>
          </Card>
        </div>
      </div>

      {/* Tier multipliers note */}
      <Card style={{ marginBottom: 20, padding: 16, background: COLORS.charcoal, color: COLORS.cream, borderColor: COLORS.gold }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>⚡</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: COLORS.gold, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>HIGHER TIERS = MORE POINTS</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.9 }}>
              Bronze 1× · Silver 1.5× · Gold 2× · Platinum 3× — your tier choice multiplies all the points you earn that day.
            </div>
          </div>
        </div>
      </Card>

      {/* The belt journey — vertical ladder with full perks */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>◆ THE BELT JOURNEY ◆</div>
        <div style={{ fontSize: 12, color: COLORS.textGray, fontStyle: "italic", textAlign: "center", marginBottom: 16 }}>
          Every belt unlocks real rewards · Physical · Social · Financial · Competitive
        </div>
        <div className="rann-belt-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            {
              name: "White Belt", min: "0+ pts", num: 1,
              tagline: "Welcome to the Arena",
              color: "#FFFFFF", textColor: COLORS.charcoal, border: "#999",
              perks: ["Warrior ID + roster entry", "Full access to all events", "Discord/WhatsApp community"],
            },
            {
              name: "Blue Belt", min: "250+ pts", num: 2,
              tagline: "Earned your stripes",
              color: "#1F4E79", textColor: "#FFFFFF", border: "#1F4E79",
              perks: ["Branded Rann wristband", "Name on the Wall of Warriors", "Story shoutout on @rann.league"],
            },
            {
              name: "Purple Belt", min: "750+ pts", num: 3,
              tagline: "Now they know your name",
              color: "#6B2D8F", textColor: "#FFFFFF", border: "#6B2D8F",
              perks: ["Official Rann T-shirt", "1 free Bronze entry per month", "Reserved batch slot (skip queue)"],
            },
            {
              name: "Brown Belt", min: "2000+ pts", num: 4,
              tagline: "A veteran of the Rann",
              color: "#6B4423", textColor: "#FFFFFF", border: "#6B4423",
              perks: ["Premium Rann hoodie", "1 free Silver entry per month", "\"Veteran\" tag on profile", "Priority registration (24h early access)"],
            },
            {
              name: "Black Belt", min: "5000+ pts", num: 5,
              tagline: "Legend status",
              color: "#1A1A1A", textColor: "#FFFFFF", border: "#1A1A1A",
              perks: ["Custom warrior medal", "1 free Gold entry per month", "Free coaching session quarterly", "Featured reel on Rann's socials"],
            },
            {
              name: "Pink City Champion", min: "Top 1 / year", num: 6,
              tagline: "The crown of the Rann",
              color: COLORS.gold, textColor: COLORS.charcoal, border: COLORS.goldDark,
              perks: ["₹50,000 cash prize", "Champion's belt (custom)", "Lifetime free entry to all events", "Direct intro to Rann's sponsors"],
              isChampion: true,
            },
          ].map((b) => (
            <Card key={b.name} variant={b.isChampion ? "parchment" : "default"} style={{
              padding: 16,
              borderLeft: `4px solid ${b.color === "#FFFFFF" ? "#999" : b.color}`,
              position: "relative",
              ...(b.isChampion ? { background: `linear-gradient(135deg, #FFF8E0 0%, #FAEBC4 100%)`, border: `2px solid ${COLORS.gold}` } : {}),
            }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* Belt badge */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: "50%",
                    background: b.color, border: `2.5px solid ${b.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: b.textColor,
                    fontFamily: "'Cinzel', serif",
                    fontSize: 18, fontWeight: 700,
                    boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
                  }}>{b.num}</div>
                  <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, color: COLORS.gold, fontWeight: 700, letterSpacing: 0.5 }}>{b.min}</div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.charcoal, fontFamily: "'Cinzel', serif", letterSpacing: 0.5 }}>
                      {b.name}
                    </div>
                    {b.isChampion && (
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "2px 8px", background: COLORS.primary, color: COLORS.cream, borderRadius: 3 }}>ELITE</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.primary, fontStyle: "italic", marginBottom: 10 }}>{b.tagline}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {b.perks.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: COLORS.charcoal, lineHeight: 1.5 }}>
                        <span style={{ color: COLORS.gold, fontWeight: 700, marginTop: 1 }}>◆</span>
                        <span>{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Example calc */}
      <Card variant="parchment" style={{ padding: 18 }}>
        <div style={{ fontSize: 13, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>◆ EXAMPLE ◆</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: COLORS.charcoal }}>
          You enter all 4 events at <strong>Silver tier</strong>. You finish 1st in Push-ups (PB!), 2nd in Sprint, 3rd in Squats, and 4th in Plank.
        </div>
        <div style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.6)", borderRadius: 6, fontSize: 13, fontFamily: "monospace", color: COLORS.charcoal, lineHeight: 1.7 }}>
          Push-ups: 10 + 50 (1st) + 25 (PB) = <strong>85</strong><br/>
          Sprint: 10 + 30 (2nd) = <strong>40</strong><br/>
          Squats: 10 + 20 (3rd) = <strong>30</strong><br/>
          Plank: <strong>10</strong> (just for showing up)<br/>
          <span style={{ color: COLORS.textGray }}>Subtotal: 165 pts</span><br/>
          × 1.5 (Silver tier) = <strong style={{ color: COLORS.primary }}>247.5 pts</strong><br/>
          × 1.5 (all-rounder bonus) = <strong style={{ color: COLORS.primary, fontSize: 16 }}>≈371 pts</strong>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: COLORS.textGray, fontStyle: "italic" }}>
          One Sunday — almost a Blue Belt earned. That's the Rann.
        </div>
      </Card>
    </div>

    {/* Leaderboard preview — themed */}
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <SectionHeader title="Top Warriors" subtitle="Live leaderboard" inline />
        <Button onClick={() => onNav("leaderboard")} variant="ghost" size="sm">View Full →</Button>
      </div>
      {leaderboardPreview && leaderboardPreview.length > 0 ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {leaderboardPreview.slice(0, 5).map((a, i) => (
            <div key={a.phone} style={{
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              gap: 16,
              borderBottom: i < 4 ? `1px solid ${COLORS.borderLight}` : "none",
              background: i < 3 ? `linear-gradient(90deg, ${COLORS.gold}10 0%, transparent 50%)` : "transparent",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: i === 0 ? COLORS.gold : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : COLORS.creamLight,
                color: COLORS.charcoal,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14,
                border: i < 3 ? `2px solid ${COLORS.charcoal}` : `1px solid ${COLORS.borderLight}`,
                fontFamily: "'Cinzel', serif",
              }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Cinzel', serif" }}>{a.name}</div>
              </div>
              <BeltBadge points={a.total_points || 0} size="sm" />
              <div style={{ fontWeight: 700, color: COLORS.primary, fontSize: 16, minWidth: 70, textAlign: "right", fontFamily: "'Cinzel', serif" }}>{a.total_points || 0}</div>
            </div>
          ))}
        </Card>
      ) : (
        <Card variant="parchment" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ marginBottom: 16 }}><SwordsEmblem size={60} color={COLORS.gold} /></div>
          <div style={{ fontSize: 16, color: COLORS.charcoal, fontStyle: "italic", fontFamily: "Georgia, serif", marginBottom: 6 }}>
            The leaderboard awaits its first warriors.
          </div>
          <div style={{ fontSize: 13, color: COLORS.textGray }}>
            Be the first to step into the Rann.
          </div>
        </Card>
      )}
    </div>

    {/* WhatsApp Community CTA */}
    <div style={{ marginBottom: 40 }}>
      <Card variant="dark" style={{ padding: 28, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -30, top: -30, opacity: 0.06, pointerEvents: "none" }}>
          <SwordsEmblem size={180} color={COLORS.gold} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>◆ JOIN THE BROTHERHOOD ◆</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 24, fontWeight: 700, color: COLORS.cream, marginBottom: 10 }}>The Warriors' Circle</div>
          <div style={{ fontSize: 13, color: COLORS.cream, opacity: 0.85, marginBottom: 18, lineHeight: 1.6, maxWidth: 460, margin: "0 auto 18px" }}>
            Join the Rann WhatsApp community for event updates, training tips, fellow warriors,
            and the inside scoop on what's coming next.
          </div>
          <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 22px",
            background: "#128C7E", color: "#FFFFFF",
            borderRadius: 8, fontSize: "clamp(12px, 3.5vw, 14px)", fontWeight: 700, letterSpacing: 0.3,
            textDecoration: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(18, 140, 126, 0.4)",
          }}>
            <span style={{ fontSize: 16 }}>💬</span>
            Join WhatsApp Community
          </a>
        </div>
      </Card>
    </div>
  </div>
);

// ============================================================
// LOGIN — Phone + 4-digit PIN
// ============================================================
const LoginPage = ({ onLogin, onNav }) => {
  // step 1 = phone, step 2 = enter PIN, step 3 = first-time PIN setup
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [foundAthlete, setFoundAthlete] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const lookupPhone = async () => {
    if (!validatePhone(phone)) { setError("Please enter a valid 10-digit phone number"); return; }
    setLoading(true); setError(""); setInfo("");
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const { data: athlete, error: aErr } = await supabase
        .from("athletes").select("*").eq("phone", cleanPhone).single();
      if (aErr || !athlete) {
        setError("No warrior found with this number. Register first to step into the Rann.");
        setLoading(false);
        return;
      }
      setFoundAthlete(athlete);
      // Existing athlete with no PIN yet → first-time setup
      if (!athlete.pin_hash) {
        setStep(3);
        setInfo("First time logging in? Set a 4-digit PIN to secure your account.");
      } else {
        setStep(2);
      }
    } catch (e) {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  };

  const verifyAndLogin = async () => {
    if (!validatePin(pin)) { setError("PIN must be exactly 4 digits"); return; }
    setLoading(true); setError("");
    try {
      const ok = await verifyPin(pin, foundAthlete.pin_salt, foundAthlete.pin_hash);
      if (!ok) {
        setError("Wrong PIN. Try again.");
        setLoading(false);
        return;
      }
      localStorage.setItem("rann_session_phone", foundAthlete.phone);
      onLogin(foundAthlete);
    } catch (e) {
      setError("Login failed. Try again.");
    }
    setLoading(false);
  };

  const setupPinAndLogin = async () => {
    if (!validatePin(pin)) { setError("PIN must be exactly 4 digits"); return; }
    if (pin !== pinConfirm) { setError("PINs don't match. Re-enter."); return; }
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashPin(pin, salt);
      const { error: uErr } = await supabase.from("athletes")
        .update({ pin_hash: hash, pin_salt: salt, pin_set_at: new Date().toISOString() })
        .eq("phone", foundAthlete.phone);
      if (uErr) { setError("Could not save PIN: " + uErr.message); setLoading(false); return; }
      localStorage.setItem("rann_session_phone", foundAthlete.phone);
      onLogin({ ...foundAthlete, pin_hash: hash, pin_salt: salt });
    } catch (e) {
      setError("Could not save PIN. Try again.");
    }
    setLoading(false);
  };

  const goBack = () => {
    setStep(1); setPin(""); setPinConfirm(""); setFoundAthlete(null); setError(""); setInfo("");
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}><RannLogo size="md" /></div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.charcoal, marginBottom: 6, fontFamily: "'Cinzel', serif" }}>
          {step === 3 ? "Set your PIN" : "Welcome back, warrior"}
        </div>
        <div style={{ fontSize: 13, color: COLORS.textGray, marginBottom: 24 }}>
          {step === 1 && "Enter your registered phone number."}
          {step === 2 && `Enter your 4-digit PIN for +91 ${foundAthlete?.phone?.slice(0, 5)} ${foundAthlete?.phone?.slice(5)}`}
          {step === 3 && `Welcome ${foundAthlete?.name?.split(" ")[0] || "warrior"}! Set a 4-digit PIN to secure your account.`}
        </div>

        {step === 1 && (
          <Input label="Phone Number" value={phone} onChange={(v) => { setPhone(v); setError(""); }} placeholder="10-digit Indian mobile" type="tel" required />
        )}

        {step === 2 && (
          <Input label="4-digit PIN" value={pin} onChange={(v) => { setPin(v.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" type="password" required />
        )}

        {step === 3 && (
          <>
            <Input label="Choose 4-digit PIN" value={pin} onChange={(v) => { setPin(v.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" type="password" required helpText="Don't use 0000, 1234, or your birth year. Pick something memorable but not obvious." />
            <Input label="Confirm PIN" value={pinConfirm} onChange={(v) => { setPinConfirm(v.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" type="password" required />
          </>
        )}

        {info && <div style={{ background: "#FFF4D4", color: "#7B5500", padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{info}</div>}
        {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <Button
          onClick={step === 1 ? lookupPhone : (step === 2 ? verifyAndLogin : setupPinAndLogin)}
          variant="primary" size="lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Please wait..." : step === 1 ? "Continue →" : (step === 2 ? "Log In" : "Set PIN & Log In")}
        </Button>

        {step !== 1 && (
          <Button onClick={goBack} variant="ghost" size="sm" style={{ width: "100%", marginTop: 10 }}>← Use a different number</Button>
        )}

        {step === 2 && (
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: COLORS.textGray, lineHeight: 1.5 }}>
            Forgot your PIN? <span onClick={() => onNav("forgot-pin")} style={{ color: COLORS.primary, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>Reset it here</span>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: COLORS.textGray }}>
          New warrior? <span onClick={() => onNav("register")} style={{ color: COLORS.primary, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>Register here</span>
        </div>
      </Card>
    </div>
  );
};


// ============================================================
// FORGOT PIN — Self-service reset using security questions
// ============================================================
const MAX_RESET_ATTEMPTS = 3;
const LOCKOUT_HOURS = 1;

const ForgotPinPage = ({ onNav, onLogin }) => {
  // step 1 = phone lookup, 2 = answer questions, 3 = set new PIN, 4 = locked
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [foundAthlete, setFoundAthlete] = useState(null);
  const [questionPair, setQuestionPair] = useState(null); // { q1Id, q2Id }
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);

  const QUESTIONS = {
    emergency_name: { label: "Emergency contact's first name", placeholder: "First name only", helpText: "The first name you gave during registration." },
    emergency_phone: { label: "Emergency contact's phone (last 4 digits)", placeholder: "Last 4 digits", helpText: "Just the last 4 digits of the emergency contact phone you gave at registration.", maxLength: 4 },
    age: { label: "Your age (as registered)", placeholder: "e.g., 24", helpText: "The age you gave when you first registered." },
  };

  // Pick 2 questions deterministically from the 3 — based on phone hash so retries get same questions.
  // This prevents an attacker from re-rolling to find easy questions.
  const pickQuestions = (athletePhone) => {
    const ids = ["emergency_name", "emergency_phone", "age"];
    // Simple deterministic shuffle: skip one based on last digit of phone
    const skip = parseInt(athletePhone.slice(-1), 10) % 3;
    const picked = ids.filter((_, i) => i !== skip);
    return { q1Id: picked[0], q2Id: picked[1] };
  };

  // Step 1: look up athlete + check lockout
  const lookupPhone = async () => {
    if (!validatePhone(phone)) { setError("Please enter a valid 10-digit phone number"); return; }
    setLoading(true); setError(""); setInfo("");
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const { data: athlete, error: aErr } = await supabase
        .from("athletes").select("*").eq("phone", cleanPhone).single();
      if (aErr || !athlete) {
        // Don't reveal whether the phone exists — generic error to prevent enumeration
        setError("If a warrior with this number exists, you'll be able to reset. Check the number and try again.");
        setLoading(false);
        return;
      }
      // Check lockout
      if (athlete.pin_reset_locked_until) {
        const until = new Date(athlete.pin_reset_locked_until);
        if (until.getTime() > Date.now()) {
          setLockedUntil(until);
          setStep(4);
          setLoading(false);
          return;
        }
      }
      // Athlete has no PIN set yet — they should just log in normally
      if (!athlete.pin_hash) {
        setError("This account doesn't have a PIN set. Just log in normally — you'll be prompted to set one.");
        setLoading(false);
        return;
      }
      setFoundAthlete(athlete);
      setQuestionPair(pickQuestions(cleanPhone));
      setStep(2);
    } catch (e) {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  };

  // Step 2: verify answers
  const verifyAnswers = async () => {
    if (!a1.trim() || !a2.trim()) { setError("Please answer both questions"); return; }
    setLoading(true); setError("");

    const checkAnswer = (questionId, userAnswer) => {
      const ans = (userAnswer || "").trim();
      if (questionId === "emergency_name") {
        const expected = (foundAthlete.emergency_name || "").trim().split(/\s+/)[0].toLowerCase();
        const got = ans.split(/\s+/)[0].toLowerCase();
        return expected && got === expected;
      }
      if (questionId === "emergency_phone") {
        const expected = (foundAthlete.emergency_phone || "").replace(/\D/g, "").slice(-4);
        const got = ans.replace(/\D/g, "").slice(-4);
        return expected.length === 4 && got === expected;
      }
      if (questionId === "age") {
        const expected = parseInt(foundAthlete.age, 10);
        const got = parseInt(ans, 10);
        return !isNaN(expected) && !isNaN(got) && expected === got;
      }
      return false;
    };

    const correct1 = checkAnswer(questionPair.q1Id, a1);
    const correct2 = checkAnswer(questionPair.q2Id, a2);

    if (correct1 && correct2) {
      // Success — clear attempts, advance to PIN setting
      try {
        await supabase.from("athletes").update({
          pin_reset_attempts: 0, pin_reset_locked_until: null, pin_reset_last_attempt_at: new Date().toISOString(),
        }).eq("phone", foundAthlete.phone);
      } catch (e) {}
      setError(""); setInfo("Identity verified. Now set your new PIN.");
      setStep(3);
      setLoading(false);
      return;
    }

    // Failure — increment attempts, possibly lock
    const newAttempts = (foundAthlete.pin_reset_attempts || 0) + 1;
    const updates = { pin_reset_attempts: newAttempts, pin_reset_last_attempt_at: new Date().toISOString() };
    if (newAttempts >= MAX_RESET_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_HOURS * 60 * 60 * 1000);
      updates.pin_reset_locked_until = lockUntil.toISOString();
    }
    try {
      await supabase.from("athletes").update(updates).eq("phone", foundAthlete.phone);
      setFoundAthlete({ ...foundAthlete, ...updates });
    } catch (e) {}

    if (newAttempts >= MAX_RESET_ATTEMPTS) {
      setLockedUntil(new Date(Date.now() + LOCKOUT_HOURS * 60 * 60 * 1000));
      setStep(4);
    } else {
      const remaining = MAX_RESET_ATTEMPTS - newAttempts;
      setError(`Verification failed. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before this account is locked for ${LOCKOUT_HOURS} hour.`);
    }
    setLoading(false);
  };

  // Step 3: set new PIN
  const saveNewPin = async () => {
    if (!validatePin(newPin)) { setError("PIN must be exactly 4 digits"); return; }
    if (newPin !== newPinConfirm) { setError("PINs don't match"); return; }
    setLoading(true); setError("");
    try {
      const salt = generateSalt();
      const hash = await hashPin(newPin, salt);
      const { error: uErr } = await supabase.from("athletes").update({
        pin_hash: hash, pin_salt: salt, pin_set_at: new Date().toISOString(),
        pin_reset_attempts: 0, pin_reset_locked_until: null,
      }).eq("phone", foundAthlete.phone);
      if (uErr) { setError("Could not save: " + uErr.message); setLoading(false); return; }
      // Auto-login after successful reset
      localStorage.setItem("rann_session_phone", foundAthlete.phone);
      onLogin({ ...foundAthlete, pin_hash: hash, pin_salt: salt });
    } catch (e) {
      setError("Could not save new PIN. Try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 460, margin: "40px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}><RannLogo size="md" /></div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.charcoal, marginBottom: 6, fontFamily: "'Cinzel', serif" }}>
          {step === 4 ? "Account temporarily locked" : "Reset your PIN"}
        </div>
        <div style={{ fontSize: 13, color: COLORS.textGray, marginBottom: 20, lineHeight: 1.5 }}>
          {step === 1 && "We'll verify your identity using info you gave at registration."}
          {step === 2 && "Answer both questions correctly to reset your PIN. You have 3 attempts."}
          {step === 3 && "Pick a new 4-digit PIN."}
          {step === 4 && "Too many failed attempts. For security, this account can't reset its PIN for the next hour. If you can't wait, contact admin."}
        </div>

        {step === 1 && (
          <>
            <Input label="Phone Number" value={phone} onChange={(v) => { setPhone(v); setError(""); }} placeholder="10-digit Indian mobile" type="tel" required />
          </>
        )}

        {step === 2 && questionPair && (
          <>
            <div style={{ background: COLORS.creamLight, padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 12, color: COLORS.textGray, lineHeight: 1.5 }}>
              ◆ Verifying: <strong style={{ color: COLORS.charcoal }}>{foundAthlete?.name?.split(" ")[0] || "warrior"}</strong> · +91 {foundAthlete?.phone?.slice(0, 5)} {foundAthlete?.phone?.slice(5)}
            </div>
            <Input label={QUESTIONS[questionPair.q1Id].label}
              value={a1} onChange={(v) => { setA1(v); setError(""); }}
              placeholder={QUESTIONS[questionPair.q1Id].placeholder}
              helpText={QUESTIONS[questionPair.q1Id].helpText}
              required />
            <Input label={QUESTIONS[questionPair.q2Id].label}
              value={a2} onChange={(v) => { setA2(v); setError(""); }}
              placeholder={QUESTIONS[questionPair.q2Id].placeholder}
              helpText={QUESTIONS[questionPair.q2Id].helpText}
              required />
          </>
        )}

        {step === 3 && (
          <>
            <Input label="New 4-digit PIN" value={newPin} onChange={(v) => { setNewPin(v.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" type="password" required helpText="Don't reuse the old PIN. Avoid 0000, 1234, or your birth year." />
            <Input label="Confirm new PIN" value={newPinConfirm} onChange={(v) => { setNewPinConfirm(v.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" type="password" required />
          </>
        )}

        {step === 4 && (
          <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: 14, borderRadius: 6, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
            Locked until: <strong>{lockedUntil ? lockedUntil.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, day: "numeric", month: "short" }) : "—"}</strong>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              If this is your account and you need urgent access, contact admin via WhatsApp. Otherwise, try again later.
            </div>
          </div>
        )}

        {info && <div style={{ background: "#D6F0DC", color: "#1F7A3A", padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{info}</div>}
        {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>}

        {step !== 4 && (
          <Button
            onClick={step === 1 ? lookupPhone : (step === 2 ? verifyAnswers : saveNewPin)}
            variant="primary" size="lg" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Please wait..." : step === 1 ? "Continue →" : (step === 2 ? "Verify Identity" : "Save New PIN")}
          </Button>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center", fontSize: 13, color: COLORS.textGray }}>
          <span onClick={() => onNav("login")} style={{ color: COLORS.primary, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>← Back to login</span>
        </div>
      </Card>
    </div>
  );
};


// ============================================================
// REGISTRATION
// ============================================================
const RegisterPage = ({ event, upiId, onComplete, onNav, athlete, slotCounts = {}, allBatches = [] }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(athlete?.name || "");
  const [phone, setPhone] = useState(athlete?.phone || "");
  const [email, setEmail] = useState(athlete?.email || "");
  const [age, setAge] = useState(athlete?.age || "");
  const [gender, setGender] = useState(athlete?.gender || "");
  const [emergencyName, setEmergencyName] = useState(athlete?.emergency_name || "");
  const [emergencyPhone, setEmergencyPhone] = useState(athlete?.emergency_phone || "");
  // PIN — only required for brand-new athletes (no existing pin_hash)
  const isReturningWithPin = !!athlete?.pin_hash;
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [tiers, setTiers] = useState({});
  const [genders, setGenders] = useState({}); // per-event: "Men" | "Women" | "Mixed"
  // Suggest default gender from athlete's gender field
  const defaultGender = (gender || "").toLowerCase().startsWith("f") ? "Women" : (gender || "").toLowerCase().startsWith("m") ? "Men" : "Mixed";
  const [paymentNote, setPaymentNote] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [medicalOk, setMedicalOk] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const totalCost = selectedEvents.reduce((sum, e) => sum + (TIERS[tiers[e]]?.entry || 0), 0);
  const isAllRounder = selectedEvents.length === 4;

  const toggleEvent = (e) => {
    if (selectedEvents.includes(e)) {
      setSelectedEvents(selectedEvents.filter((x) => x !== e));
      const newTiers = { ...tiers }; delete newTiers[e]; setTiers(newTiers);
      const newGenders = { ...genders }; delete newGenders[e]; setGenders(newGenders);
    } else {
      setSelectedEvents([...selectedEvents, e]);
      setTiers({ ...tiers, [e]: "Bronze" });
      setGenders({ ...genders, [e]: defaultGender });
    }
  };

  const validateStep1 = () => {
    if (!name.trim()) return "Name is required";
    if (!validatePhone(phone)) return "Valid 10-digit phone required";
    if (!age || parseInt(age) < 16) return "Must be 16 or older";
    if (!gender) return "Please select gender";
    if (!emergencyName.trim() || !validatePhone(emergencyPhone)) return "Emergency contact required";
    if (!isReturningWithPin) {
      if (!validatePin(pin)) return "Set a 4-digit PIN";
      if (pin !== pinConfirm) return "PINs don't match";
    }
    return null;
  };

  const validateStep2 = () => {
    if (selectedEvents.length === 0) return "Select at least one event";
    for (const e of selectedEvents) if (!tiers[e]) return `Choose tier for ${e}`;
    return null;
  };

  const submit = async () => {
    // Split selected events into confirmed (slots available) vs waitlist (full)
    const confirmedEvents = [];
    const waitlistEvents = [];
    for (const e of selectedEvents) {
      const t = tiers[e]; if (!t) continue;
      const slot = getSlotInfo(slotCounts, e, t);
      if (slot.isFull) waitlistEvents.push(e); else confirmedEvents.push(e);
    }
    const confirmedTiers = {};
    for (const e of confirmedEvents) confirmedTiers[e] = tiers[e];
    const confirmedCost = confirmedEvents.reduce((sum, e) => sum + (TIERS[tiers[e]]?.entry || 0), 0);

    // Validate: payment ref required only if anything is confirmed
    if (confirmedEvents.length > 0) {
      const cleanRef = (paymentNote || "").replace(/\D/g, "");
      if (!cleanRef) {
        setError("Payment reference is required for confirmed slots. Please pay first, then enter the UTR/transaction ID from your UPI app.");
        return;
      }
      if (cleanRef.length < 6) {
        setError("Payment reference must be at least 6 digits (last 6 digits of your UTR / transaction ID).");
        return;
      }
    }
    if (!waiverAccepted || !medicalOk) { setError("You must accept the waiver and medical declaration"); return; }
    if (confirmedEvents.length === 0 && waitlistEvents.length === 0) { setError("No events selected"); return; }
    // Defense in depth: refuse if registration deadline has passed
    if (!isRegistrationOpen(event)) {
      setError("Registration just closed. Sorry — you missed the deadline by a hair.");
      return;
    }

    setLoading(true); setError("");
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const athleteRecord = {
        phone: cleanPhone, name: name.trim(), email: email.trim() || null,
        age: parseInt(age), gender,
        emergency_name: emergencyName.trim(),
        emergency_phone: emergencyPhone.replace(/\D/g, ""),
        total_points: athlete?.total_points || 0,
        events_attended: athlete?.events_attended || 0,
        personal_bests: athlete?.personal_bests || {},
        updated_at: new Date().toISOString(),
      };
      // If brand-new athlete, hash and store their PIN
      if (!isReturningWithPin && validatePin(pin)) {
        const salt = generateSalt();
        const hash = await hashPin(pin, salt);
        athleteRecord.pin_hash = hash;
        athleteRecord.pin_salt = salt;
        athleteRecord.pin_set_at = new Date().toISOString();
      }
      const { error: aErr } = await supabase.from("athletes").upsert(athleteRecord, { onConflict: "phone" });
      if (aErr) throw aErr;

      // Re-fetch to get assigned warrior_id (auto-generated by DB sequence on insert)
      const { data: refreshedAthlete } = await supabase.from("athletes").select("*").eq("phone", cleanPhone).single();
      const fullAthleteRecord = refreshedAthlete || athleteRecord;

      let registration = null;
      const batchTokens = [];
      // Build gender categories per event (only for confirmed)
      const confirmedGenders = {};
      for (const e of confirmedEvents) confirmedGenders[e] = genders[e] || "Mixed";
      if (confirmedEvents.length > 0) {
        registration = {
          event_id: event.id, phone: cleanPhone, name: name.trim(),
          events_selected: confirmedEvents, tiers: confirmedTiers,
          gender_categories: confirmedGenders,
          is_all_rounder: confirmedEvents.length === 4,
          total_cost: confirmedCost, payment_note: paymentNote.trim() || null,
          payment_status: "pending",
        };
        const { error: rErr } = await supabase.from("registrations").upsert(registration, { onConflict: "event_id,phone" });
        if (rErr) throw rErr;

        // Re-fetch latest batch_assignments to avoid stale state when many register simultaneously
        const { data: freshBatches } = await supabase.from("batch_assignments").select("*").eq("event_id", event.id);
        const liveBatches = freshBatches || [];

        for (const evName of confirmedEvents) {
          const evTier = confirmedTiers[evName];
          const evGender = confirmedGenders[evName] || "Mixed";
          // Skip if this athlete already has a token for this slot (re-registration)
          const existingForMe = liveBatches.find((b) => b.phone === cleanPhone && b.event_name === evName && b.tier === evTier);
          if (existingForMe) {
            batchTokens.push(existingForMe);
            continue;
          }
          const slot = nextBatchSlot(liveBatches, evName, evTier, evGender);
          if (!slot) continue;
          const token = formatToken(evTier, evName, evGender, slot.batch, slot.position);
          const newAssignment = {
            event_id: event.id, phone: cleanPhone, name: name.trim(),
            event_name: evName, tier: evTier, gender_category: evGender,
            batch_number: slot.batch, position: slot.position, token,
          };
          const { error: bErr } = await supabase.from("batch_assignments").insert(newAssignment);
          if (!bErr) {
            batchTokens.push(newAssignment);
            liveBatches.push(newAssignment);
          }
        }
      }

      const waitlistEntries = [];
      for (const e of waitlistEvents) {
        const entry = {
          event_id: event.id, phone: cleanPhone, name: name.trim(),
          event_name: e, tier: tiers[e],
          gender_category: genders[e] || "Mixed",
        };
        const { error: wErr } = await supabase.from("waitlist").upsert(entry, { onConflict: "event_id,phone,event_name,tier" });
        if (!wErr) waitlistEntries.push(entry);
      }

      localStorage.setItem("rann_session_phone", cleanPhone);
      onComplete(fullAthleteRecord, registration, waitlistEntries, batchTokens);
    } catch (err) {
      setError("Could not save registration: " + (err?.message || "unknown error"));
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: "20px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}><RannLogo size="sm" /></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3].map((s) => <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? COLORS.primary : COLORS.borderLight }} />)}
      </div>
      <div style={{ fontSize: 12, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>STEP {step} OF 3</div>
      <div style={{ fontSize: 22, fontFamily: "'Cinzel', serif", fontWeight: 600, marginBottom: 24, color: COLORS.charcoal }}>
        {step === 1 ? "Who are you?" : step === 2 ? "Choose your battles" : "Confirm & pay"}
      </div>
      <Card>
        {step === 1 && (
          <>
            <Input label="Full Name" value={name} onChange={setName} required />
            <Input label="Phone (WhatsApp)" value={phone} onChange={setPhone} type="tel" required helpText="10-digit Indian mobile" />
            <Input label="Email" value={email} onChange={setEmail} type="email" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Input label="Age" value={age} onChange={setAge} type="number" required helpText="Must be 16+" />
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Gender <span style={{ color: COLORS.primary }}>*</span></label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box", fontFamily: "inherit" }}>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 8, paddingTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 0.5 }}>EMERGENCY CONTACT</div>
              <Input label="Name" value={emergencyName} onChange={setEmergencyName} required />
              <Input label="Phone" value={emergencyPhone} onChange={setEmergencyPhone} type="tel" required />
            </div>
            {!isReturningWithPin && (
              <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, marginTop: 8, paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>SET YOUR LOGIN PIN</div>
                <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 12, lineHeight: 1.5 }}>
                  Choose a 4-digit PIN. You'll use this with your phone number to log in. Don't use 0000, 1234, or your birth year.
                </div>
                <Input label="4-digit PIN" value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" type="password" required />
                <Input label="Confirm PIN" value={pinConfirm} onChange={(v) => setPinConfirm(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" type="password" required />
              </div>
            )}
            {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <Button onClick={async () => {
              const e = validateStep1(); if (e) { setError(e); return; }
              setError(""); setLoading(true);
              try {
                const cleanPhone = phone.replace(/\D/g, "");
                const { data: existing } = await supabase.from("athletes").select("phone, name, pin_hash").eq("phone", cleanPhone).maybeSingle();
                if (existing) {
                  // Phone already registered — block to prevent overwrite
                  if (existing.pin_hash) {
                    setError(`This phone is already registered to ${existing.name}. Please log in instead, or use a different phone number.`);
                  } else {
                    setError(`This phone is already registered to ${existing.name}. Please log in to set your PIN, or use a different phone number.`);
                  }
                  setLoading(false);
                  return;
                }
                setLoading(false);
                setStep(2);
              } catch (err) {
                setLoading(false);
                setError("Could not verify phone availability. Please try again.");
              }
            }} variant="primary" size="lg" style={{ width: "100%" }} disabled={loading}>{loading ? "Checking..." : "Next: Choose Events →"}</Button>
            {error && error.includes("already registered") && (
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button onClick={() => onNav("login")} variant="ghost" size="sm">Go to login →</Button>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Select your events</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {EVENTS.map((e) => {
                  const sel = selectedEvents.includes(e);
                  return (
                    <div key={e} onClick={() => toggleEvent(e)} style={{ padding: 14, border: sel ? `2px solid ${COLORS.primary}` : `1px solid ${COLORS.borderLight}`, borderRadius: 8, cursor: "pointer", background: sel ? COLORS.creamLight : "#FFFFFF" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? COLORS.primary : COLORS.borderLight}`, background: sel ? COLORS.primary : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.cream, fontSize: 12 }}>{sel && "✓"}</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{e}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedEvents.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Choose tier for each event</div>
                <div style={{ fontSize: 11, color: COLORS.textGray, marginBottom: 12, fontStyle: "italic" }}>
                  ◆ 25 spots per tier · 5 batches of 5 athletes each ◆
                </div>
                {selectedEvents.map((e) => (
                  <div key={e} style={{ marginBottom: 12, padding: 12, background: COLORS.creamLight, borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{e}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
                      {Object.entries(TIERS).map(([n, t]) => {
                        const slot = getSlotInfo(slotCounts, e, n);
                        const sc = getSlotColor(slot.status);
                        const selected = tiers[e] === n;
                        return (
                          <div key={n} onClick={() => setTiers({ ...tiers, [e]: n })} style={{
                            padding: "8px 10px",
                            borderRadius: 6,
                            cursor: "pointer",
                            background: selected ? t.color : "#FFFFFF",
                            color: selected ? "#FFFFFF" : t.color,
                            border: `1.5px solid ${t.color}`,
                            position: "relative",
                            opacity: slot.isFull && !selected ? 0.92 : 1,
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{n} · ₹{t.entry}</div>
                            <div style={{
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              padding: "2px 5px",
                              borderRadius: 3,
                              background: selected ? "rgba(255,255,255,0.25)" : sc.bg,
                              color: selected ? "#FFFFFF" : sc.text,
                              display: "inline-block",
                              marginTop: 2,
                            }}>
                              {slot.isFull ? `${sc.label}` : `${slot.spotsLeft} spot${slot.spotsLeft === 1 ? "" : "s"} left`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Gender category picker */}
                    {tiers[e] && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.borderLight}` }}>
                        <div style={{ fontSize: 11, color: COLORS.gold, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>◆ COMPETE AGAINST ◆</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                          {GENDER_CATEGORIES.map((g) => {
                            const sel = genders[e] === g;
                            return (
                              <div key={g} onClick={() => setGenders({ ...genders, [e]: g })} style={{
                                padding: "6px 8px",
                                borderRadius: 5,
                                cursor: "pointer",
                                background: sel ? GENDER_COLORS[g] : "#FFFFFF",
                                color: sel ? "#FFFFFF" : GENDER_COLORS[g],
                                border: `1.5px solid ${GENDER_COLORS[g]}`,
                                fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                                textAlign: "center",
                              }}>{g}</div>
                            );
                          })}
                        </div>
                        <div style={{ fontSize: 10, color: COLORS.textGray, marginTop: 6, fontStyle: "italic", lineHeight: 1.5 }}>
                          {genders[e] === "Men" && "You'll race in men-only batches."}
                          {genders[e] === "Women" && "You'll race in women-only batches."}
                          {genders[e] === "Mixed" && "Open category — anyone can join, any gender competes."}
                        </div>
                      </div>
                    )}
                    {tiers[e] && getSlotInfo(slotCounts, e, tiers[e]).isFull && (
                      <div style={{ fontSize: 11, color: "#7B5500", background: "#FFF4D4", padding: "6px 10px", borderRadius: 4, marginTop: 8, lineHeight: 1.5 }}>
                        ⚠ This tier is full. You'll be added to the waitlist for {e} · {tiers[e]}. If someone drops, we promote you in order and notify via WhatsApp. <strong>You will not be charged unless promoted.</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAllRounder && (
              <div style={{ background: COLORS.gold, color: COLORS.charcoal, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>🏆 All-Rounder bonus: 1.5× points multiplier on the day's total</div>
            )}

            <div style={{ background: COLORS.charcoal, color: COLORS.cream, padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Total entry fee (confirmed slots only)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.gold }}>
                  ₹{(() => {
                    let total = 0;
                    for (const e of selectedEvents) {
                      const t = tiers[e]; if (!t) continue;
                      const slot = getSlotInfo(slotCounts, e, t);
                      if (!slot.isFull) total += TIERS[t].entry;
                    }
                    return total;
                  })()}
                </div>
              </div>
              {(() => {
                const wl = selectedEvents.filter((e) => tiers[e] && getSlotInfo(slotCounts, e, tiers[e]).isFull);
                if (wl.length === 0) return null;
                return <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6, fontStyle: "italic" }}>
                  {wl.length} event{wl.length === 1 ? "" : "s"} on waitlist (no charge unless promoted)
                </div>;
              })()}
            </div>

            {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setStep(1)} variant="light">← Back</Button>
              <Button onClick={() => { const e = validateStep2(); if (e) setError(e); else { setError(""); setStep(3); } }} variant="primary" style={{ flex: 1 }}>Next: Payment →</Button>
            </div>
          </>
        )}

        {step === 3 && (() => {
          const confirmedEvents = selectedEvents.filter((e) => tiers[e] && !getSlotInfo(slotCounts, e, tiers[e]).isFull);
          const waitlistEvents = selectedEvents.filter((e) => tiers[e] && getSlotInfo(slotCounts, e, tiers[e]).isFull);
          const confirmedCost = confirmedEvents.reduce((s, e) => s + TIERS[tiers[e]].entry, 0);
          const allWaitlist = confirmedCost === 0 && waitlistEvents.length > 0;
          return (
          <>
            {allWaitlist ? (
              <div style={{ background: "#FFF4D4", border: `1px solid ${COLORS.gold}`, padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#7B5500", fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>WAITLIST ONLY</div>
                <div style={{ fontSize: 13, color: COLORS.charcoal, lineHeight: 1.6 }}>
                  All your selected slots are full. You'll join the waitlist for {waitlistEvents.length} event{waitlistEvents.length === 1 ? "" : "s"}. <strong>No payment needed now.</strong> If a spot opens, we'll WhatsApp you with a payment link.
                </div>
              </div>
            ) : (
              <div style={{ background: COLORS.creamLight, padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: COLORS.gold, fontWeight: 700, letterSpacing: 2, marginBottom: 12, textAlign: "center" }}>◆ PAY VIA UPI ◆</div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                  <UPIQrCode upiId={upiId} amount={confirmedCost} size={160} />
                  <div style={{ flex: "1 1 200px", minWidth: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: COLORS.textGray, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>SCAN OR PAY TO</div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: COLORS.charcoal, marginBottom: 12, wordBreak: "break-all" }}>{upiId}</div>
                    <div style={{ background: "#FFFFFF", padding: 12, borderRadius: 6, fontSize: 14, fontFamily: "monospace", border: `1px solid ${COLORS.borderLight}` }}>
                      Amount: <span style={{ color: COLORS.primary, fontWeight: 700, fontSize: 16 }}>₹{confirmedCost}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textGray, marginTop: 12, lineHeight: 1.5, textAlign: "center" }}>
                  Scan the QR or send ₹{confirmedCost} to the UPI ID above. Enter your name in the note field. Slot will be confirmed once we verify the payment (typically within 15 minutes).
                </div>
                {waitlistEvents.length > 0 && (
                  <div style={{ fontSize: 12, color: "#7B5500", background: "#FFF4D4", padding: "8px 10px", borderRadius: 4, marginTop: 10, lineHeight: 1.5 }}>
                    ⚠ {waitlistEvents.length} event{waitlistEvents.length === 1 ? " is" : "s are"} full and will be added to the waitlist. You're not charged for those — only the ₹{confirmedCost} above.
                  </div>
                )}
              </div>
            )}

            {!allWaitlist && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.charcoal, marginBottom: 6, letterSpacing: 0.5 }}>
                  Payment reference / UPI transaction ID <span style={{ color: COLORS.primary }}>*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="Last 6 digits of UTR or transaction ID"
                  style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, fontFamily: "inherit", background: "#FAFAF7", color: COLORS.charcoal, WebkitTextFillColor: COLORS.charcoal, boxSizing: "border-box", letterSpacing: 1 }}
                />
                <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 4 }}>
                  Numbers only. After paying, find this in your UPI app's transaction history (UTR / Transaction ID).
                </div>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 16, marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, letterSpacing: 0.5 }}>DECLARATIONS</div>
              <label style={{ display: "flex", gap: 10, marginBottom: 12, cursor: "pointer", fontSize: 13, lineHeight: 1.5 }}>
                <input type="checkbox" checked={medicalOk} onChange={(e) => setMedicalOk(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I confirm I have no known heart condition, recent surgery, or active injury that would prevent safe participation.</span>
              </label>
              <label style={{ display: "flex", gap: 10, marginBottom: 16, cursor: "pointer", fontSize: 13, lineHeight: 1.5 }}>
                <input type="checkbox" checked={waiverAccepted} onChange={(e) => setWaiverAccepted(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I have read and agree to the Rann Participant Waiver. I understand the physical risks and accept full responsibility. Photos/video may be used for marketing.</span>
              </label>
            </div>

            {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setStep(2)} variant="light">← Back</Button>
              <Button onClick={submit} variant="primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Registering..." : (allWaitlist ? "Join Waitlist →" : "Step into the Rann →")}</Button>
            </div>
          </>
          );
        })()}
      </Card>
    </div>
  );
};

// ============================================================
// SUCCESS PAGE
// ============================================================
const SuccessPage = ({ athlete, registration, waitlistEntries = [], batchTokens = [], onNav, upiId }) => {
  const hasConfirmed = registration && registration.events_selected?.length > 0;
  const hasWaitlist = waitlistEntries && waitlistEntries.length > 0;
  const hasTokens = batchTokens && batchTokens.length > 0;
  const onlyWaitlist = !hasConfirmed && hasWaitlist;
  const warriorId = formatWarriorId(athlete?.warrior_id);
  const founding = isFoundingWarrior(athlete?.warrior_id);
  return (
  <div style={{ maxWidth: 520, margin: "40px auto", textAlign: "center" }}>
    <div style={{ fontSize: 64, marginBottom: 8 }}>{onlyWaitlist ? "⏳" : "⚔️"}</div>
    <div style={{ fontSize: 14, color: COLORS.gold, letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>
      {onlyWaitlist ? "ON THE WAITLIST" : "YOU'RE IN"}
    </div>
    <div style={{ fontSize: 30, fontFamily: "'Cinzel', serif", fontWeight: 600, marginBottom: 16, color: COLORS.charcoal }}>
      {onlyWaitlist ? "Waiting in the wings" : "Step into the Rann"}
    </div>

    {warriorId && (
      <Card variant="dark" style={{ marginBottom: 18, padding: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: -20, top: -20, opacity: 0.08, pointerEvents: "none" }}>
          <SwordsEmblem size={120} color={COLORS.gold} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, color: COLORS.gold, letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>◆ YOUR WARRIOR ID ◆</div>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 32, fontWeight: 700, color: COLORS.cream, letterSpacing: 4, marginBottom: founding ? 6 : 0 }}>
            {warriorId}
          </div>
          {founding && (
            <div style={{ display: "inline-block", padding: "3px 10px", background: COLORS.gold, color: COLORS.charcoal, borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
              ✦ FOUNDING WARRIOR ✦
            </div>
          )}
          <div style={{ fontSize: 11, color: COLORS.cream, opacity: 0.7, marginTop: 8, fontStyle: "italic" }}>
            Yours forever. Wear it with pride.
          </div>
        </div>
      </Card>
    )}

    {hasConfirmed && (
      <Card style={{ textAlign: "left", marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#7B5500", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>◆ PAYMENT PENDING VERIFICATION ◆</div>
        <div style={{ background: "#FFF4D4", border: "1px solid #E8B82A", padding: "10px 12px", borderRadius: 6, fontSize: 12, color: "#7B5500", lineHeight: 1.5, marginBottom: 14 }}>
          ⏳ Your slot will be confirmed once we verify your payment. This typically takes <strong>15 minutes</strong>. If we can't verify it, the amount will be refunded to your account. Check back here in 15 minutes — the status will update automatically.
        </div>
        <div style={{ marginBottom: 12 }}>
          {registration?.events_selected?.map((e) => (
            <div key={e} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderBottom: `1px dashed ${COLORS.borderLight}` }}>
              <span>{e}</span>
              <span style={{ fontWeight: 600 }}>{registration.tiers[e]} · ₹{TIERS[registration.tiers[e]]?.entry}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontWeight: 700 }}>
          <span>Total Paid</span><span style={{ color: COLORS.primary }}>₹{registration?.total_cost}</span>
        </div>
      </Card>
    )}

    {hasTokens && (
      <Card variant="dark" style={{ textAlign: "left", marginBottom: 16, padding: 22, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -20, top: -20, opacity: 0.08, pointerEvents: "none" }}>
          <SwordsEmblem size={140} color={COLORS.gold} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>◆ YOUR BATTLE TOKENS ◆</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 14, lineHeight: 1.5 }}>
            Show these at the venue. Each token tells the volunteers your tier, event, batch, and position.
          </div>
          {batchTokens.map((t, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 12px",
              background: i % 2 === 0 ? "rgba(212, 160, 23, 0.08)" : "rgba(212, 160, 23, 0.04)",
              borderRadius: 6, marginBottom: 6,
              border: `1px solid ${COLORS.gold}40`,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.cream }}>{t.event_name}</div>
                <div style={{ fontSize: 11, color: COLORS.gold, opacity: 0.85 }}>{t.tier} · {t.gender_category || "Mixed"} · Batch {t.batch_number} · Position {t.position}</div>
              </div>
              <div style={{
                fontFamily: "'Cinzel', monospace", fontSize: 18, fontWeight: 700,
                color: COLORS.gold, letterSpacing: 1,
                padding: "6px 12px",
                background: "rgba(0,0,0,0.3)",
                borderRadius: 4,
                border: `1px solid ${COLORS.gold}`,
              }}>{t.token}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 10, fontStyle: "italic", lineHeight: 1.5 }}>
            Save a screenshot of this page or check your dashboard anytime.
          </div>
        </div>
      </Card>
    )}

    {hasWaitlist && (
      <Card variant="parchment" style={{ textAlign: "left", marginBottom: 16, borderColor: COLORS.gold }}>
        <div style={{ fontSize: 11, color: "#7B5500", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>◆ WAITLISTED ◆</div>
        <div style={{ fontSize: 13, color: COLORS.charcoal, marginBottom: 12, lineHeight: 1.6 }}>
          These slots were full when you registered. We'll WhatsApp you the moment a spot opens — no charge unless promoted.
        </div>
        {waitlistEntries.map((w, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderBottom: i < waitlistEntries.length - 1 ? `1px dashed ${COLORS.borderLight}` : "none" }}>
            <span>{w.event_name}</span>
            <span style={{ fontWeight: 600, color: TIERS[w.tier]?.color }}>{w.tier} · waiting</span>
          </div>
        ))}
      </Card>
    )}

    {hasConfirmed && (
      <Card style={{ background: COLORS.creamLight, textAlign: "left", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Next steps:</div>
        <ol style={{ fontSize: 13, lineHeight: 1.8, marginLeft: 20, padding: 0 }}>
          <li>Pay <strong>₹{registration?.total_cost}</strong> to <strong style={{ fontFamily: "monospace" }}>{upiId}</strong> via any UPI app</li>
          <li>You'll get a WhatsApp confirmation within 24 hours</li>
          <li>Show up Sunday. 6:15 AM. Bring ID, water, workout clothes.</li>
          {hasTokens && <li>Volunteer will call out your token <strong style={{ fontFamily: "monospace", color: COLORS.primary }}>{batchTokens[0]?.token}</strong> when your heat is up.</li>}
        </ol>
      </Card>
    )}
    {onlyWaitlist && (
      <Card style={{ background: COLORS.creamLight, textAlign: "left", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>What happens next:</div>
        <ol style={{ fontSize: 13, lineHeight: 1.8, marginLeft: 20, padding: 0 }}>
          <li>You're queued in order — first in, first promoted</li>
          <li>If a spot opens, we'll WhatsApp you with payment instructions</li>
          <li>You only pay if you're promoted — no risk</li>
        </ol>
      </Card>
    )}

    <Button onClick={() => onNav("dashboard")} variant="primary" size="lg" style={{ width: "100%" }}>Go to my dashboard →</Button>

    {/* WhatsApp Community — high-conversion moment */}
    <Card style={{ marginTop: 18, padding: 18, borderLeft: `4px solid #128C7E`, textAlign: "left" }}>
      <div style={{ fontSize: 12, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>◆ ONE LAST THING ◆</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Join the Warriors' Circle</div>
      <div style={{ fontSize: 12, color: COLORS.textGray, lineHeight: 1.5, marginBottom: 12 }}>
        Get event updates, training tips, and connect with fellow warriors on WhatsApp.
      </div>
      <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 18px",
        background: "#128C7E", color: "#FFFFFF",
        borderRadius: 6, fontSize: 13, fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}>
        <span style={{ fontSize: 16 }}>💬</span>
        Join WhatsApp Community
      </a>
    </Card>
  </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const DashboardPage = ({ athlete, currentRegistration, eventResults, onNav, allAthletes, myBatchTokens = [], myWaitlist = [] }) => {
  const points = athlete.total_points || 0;
  const belt = getBelt(points);
  const nextBelt = getNextBelt(points);
  const progress = nextBelt ? Math.min(100, (points - belt.min) / (nextBelt.min - belt.min) * 100) : 100;
  const myRank = useMemo(() => {
    const sorted = [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    return sorted.findIndex((a) => a.phone === athlete.phone) + 1;
  }, [allAthletes, athlete]);

  return (
    <div>
      <Card style={{ marginBottom: 24, background: belt.color, color: belt.textColor, borderColor: belt.border, padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 2, opacity: 0.8, fontWeight: 700, marginBottom: 4 }}>WARRIOR PROFILE</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>{athlete.name}</div>
            {formatWarriorId(athlete.warrior_id) && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, letterSpacing: 2, padding: "3px 10px", background: "rgba(0,0,0,0.18)", borderRadius: 3, border: `1px solid ${belt.textColor}30` }}>
                  {formatWarriorId(athlete.warrior_id)}
                </div>
                {isFoundingWarrior(athlete.warrior_id) && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "3px 8px", background: COLORS.gold, color: COLORS.charcoal, borderRadius: 3 }}>✦ FOUNDING</span>
                )}
              </div>
            )}
            <div style={{ fontSize: 13, opacity: 0.85 }}>{formatPhone(athlete.phone)} · Joined {athlete.join_date ? new Date(athlete.join_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, letterSpacing: 1, opacity: 0.7, fontWeight: 600 }}>CURRENT BELT</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Cinzel', serif" }}>{belt.name}</div>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Points" value={points} accent />
        <StatCard label="Rank" value={myRank > 0 ? `#${myRank}` : "—"} />
        <StatCard label="Events Done" value={athlete.events_attended || 0} />
        <StatCard label="Belt" value={belt.name} />
      </div>

      {nextBelt && (
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: COLORS.textGray, fontWeight: 600 }}>Progress to {nextBelt.name} Belt</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary }}>{nextBelt.min - points} points to go</div>
          </div>
          <div style={{ height: 10, background: COLORS.borderLight, borderRadius: 5, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.primary})` }} />
          </div>
        </Card>
      )}

      <SectionHeader title="Your Belt Journey" subtitle="The path of a warrior" />
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          {BELTS.map((b) => {
            const reached = points >= b.min;
            return (
              <div key={b.name} style={{ flex: 1, textAlign: "center", opacity: reached ? 1 : 0.35 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: b.color, border: `2px solid ${b.border}`, margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "center", color: b.textColor, fontSize: 11, fontWeight: 700 }}>{reached ? "✓" : ""}</div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{b.name}</div>
                <div style={{ fontSize: 10, color: COLORS.textGray }}>{b.min}+</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Personal Bests Section — auto-tracks each event's PB with date & previous record */}
      <SectionHeader title="Your Personal Bests" subtitle="Records you've set in the arena" />
      <Card style={{ marginBottom: 24, padding: 0, overflow: "hidden" }}>
        {(() => {
          const pbs = athlete.personal_bests || {};
          const hasAnyPB = EVENTS.some((ev) => {
            const v = getPBValue(pbs[ev]);
            return v !== null && v !== undefined && v !== "";
          });
          if (!hasAnyPB) {
            return (
              <div style={{ padding: 32, textAlign: "center", background: COLORS.creamLight }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏁</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.charcoal, marginBottom: 6 }}>No records yet</div>
                <div style={{ fontSize: 12, color: COLORS.textGray, fontStyle: "italic" }}>Compete in your first event to set your personal bests.</div>
              </div>
            );
          }
          return (
            <div>
              {EVENTS.map((ev, i) => {
                const pbField = pbs[ev];
                const value = getPBValue(pbField);
                const date = getPBDate(pbField);
                const prev = getPBPrevious(pbField);
                const hasPB = value !== null && value !== undefined && value !== "";
                const improvement = hasPB && prev.value !== null ? computePBImprovement(ev, value, prev.value) : null;
                return (
                  <div key={ev} style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "14px 18px",
                    borderBottom: i < EVENTS.length - 1 ? `1px solid ${COLORS.borderLight}` : "none",
                    background: hasPB ? "#FFFFFF" : COLORS.creamLight,
                  }}>
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.charcoal }}>{ev}</div>
                      {hasPB && date && (
                        <div style={{ fontSize: 10, color: COLORS.textGray, marginTop: 2 }}>
                          Set {formatPBDateShort(date)}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: "0 0 auto", textAlign: "center", minWidth: 70 }}>
                      {hasPB ? (
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: 22, fontWeight: 700, color: COLORS.primary, lineHeight: 1 }}>
                          {value}
                          {ev === "100m Sprint" && <span style={{ fontSize: 14, opacity: 0.7 }}>s</span>}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: COLORS.textGray, fontStyle: "italic" }}>—</div>
                      )}
                    </div>
                    <div style={{ flex: "1 1 140px", textAlign: "right" }}>
                      {hasPB && improvement && (
                        <div style={{ display: "inline-block", padding: "4px 10px", background: "#D6F0DC", color: "#1F7A3A", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                          ▲ {improvement}
                        </div>
                      )}
                      {hasPB && !improvement && prev.value === null && (
                        <div style={{ display: "inline-block", padding: "4px 10px", background: COLORS.creamLight, color: COLORS.gold, borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${COLORS.gold}40` }}>
                          ✦ FIRST RECORD
                        </div>
                      )}
                      {hasPB && prev.value !== null && (
                        <div style={{ fontSize: 10, color: COLORS.textGray, marginTop: 4 }}>
                          Prev: {prev.value}{prev.date ? ` · ${formatPBDateShort(prev.date)}` : ""}
                        </div>
                      )}
                      {!hasPB && (
                        <div style={{ fontSize: 11, color: COLORS.textGray, fontStyle: "italic" }}>
                          Compete to set your first record
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>

      {currentRegistration && (
        <>
          <SectionHeader title="Upcoming Event" subtitle="You're registered" />
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${COLORS.gold}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: COLORS.textGray, fontWeight: 600 }}>EVENT #{currentRegistration.event_id?.replace("event_", "")}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{currentRegistration.events_selected?.length} event{currentRegistration.events_selected?.length !== 1 ? "s" : ""} · ₹{currentRegistration.total_cost}</div>
              </div>
              <div style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 1, background: currentRegistration.payment_status === "verified" ? "#D6F0DC" : "#FCE7C0", color: currentRegistration.payment_status === "verified" ? "#1F7A3A" : "#7B5500" }}>
                {currentRegistration.payment_status?.toUpperCase()}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, paddingTop: 10 }}>
              {currentRegistration.events_selected?.map((e) => (
                <div key={e} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span>{e}</span>
                  <span style={{ fontWeight: 600, color: TIERS[currentRegistration.tiers?.[e]]?.color }}>{currentRegistration.tiers?.[e]}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {myBatchTokens && myBatchTokens.length > 0 && (
        <Card variant="dark" style={{ marginBottom: 24, padding: 22, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -20, top: -20, opacity: 0.1, pointerEvents: "none" }}>
            <SwordsEmblem size={150} color={COLORS.gold} />
          </div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>◆ YOUR BATTLE TOKENS ◆</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 14, lineHeight: 1.5 }}>
              Show these at the venue check-in. Each token tells volunteers your tier, event, batch, and position.
            </div>
            {myBatchTokens.map((t, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px",
                background: i % 2 === 0 ? "rgba(212, 160, 23, 0.08)" : "rgba(212, 160, 23, 0.04)",
                borderRadius: 6, marginBottom: 6,
                border: `1px solid ${COLORS.gold}40`,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.cream }}>{t.event_name}</div>
                  <div style={{ fontSize: 11, color: COLORS.gold, opacity: 0.85 }}>{t.tier} · {t.gender_category || "Mixed"} · Batch {t.batch_number} · Position {t.position}</div>
                </div>
                <div style={{
                  fontFamily: "'Cinzel', monospace", fontSize: 18, fontWeight: 700,
                  color: COLORS.gold, letterSpacing: 1,
                  padding: "6px 12px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 4,
                  border: `1px solid ${COLORS.gold}`,
                }}>{t.token}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {myWaitlist && myWaitlist.length > 0 && (
        <Card variant="parchment" style={{ marginBottom: 24, borderColor: COLORS.gold }}>
          <div style={{ fontSize: 11, color: "#7B5500", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>◆ ON WAITLIST ◆</div>
          <div style={{ fontSize: 12, color: COLORS.charcoal, marginBottom: 12, lineHeight: 1.6 }}>
            These slots were full when you registered. We'll WhatsApp if a spot opens.
          </div>
          {myWaitlist.map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: i < myWaitlist.length - 1 ? `1px dashed ${COLORS.borderLight}` : "none" }}>
              <span>{w.event_name}</span>
              <span style={{ fontWeight: 600, color: TIERS[w.tier]?.color }}>{w.tier} · waiting</span>
            </div>
          ))}
        </Card>
      )}

      {eventResults && eventResults.length > 0 && (
        <>
          <SectionHeader title="Your Battle History" subtitle="Past events" />
          <Card style={{ marginBottom: 24, padding: 0 }}>
            {eventResults.map((er, i) => (
              <div key={i} style={{ padding: 16, borderBottom: i < eventResults.length - 1 ? `1px solid ${COLORS.borderLight}` : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{er.event_date || er.event_id}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.primary }}>+{er.total_points} pts</div>
                </div>
                {er.results?.map((r, j) => (
                  <div key={j} style={{ fontSize: 13, color: COLORS.textGray, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                    <span>{r.event} · {r.tier}</span>
                    <span>{r.position && <span style={{ marginRight: 8 }}>#{r.position}</span>}{r.value && <span>{r.value}</span>}</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </>
      )}

      <Card style={{ marginBottom: 16, padding: 14, background: COLORS.creamLight, borderLeft: `3px solid #128C7E`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 22 }}>💬</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.charcoal }}>Warriors' Circle on WhatsApp</div>
          <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 2 }}>Updates, tips, fellow warriors</div>
        </div>
        <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" style={{
          padding: "8px 16px", background: "#128C7E", color: "#FFFFFF",
          borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: "none",
        }}>Join →</a>
      </Card>

      <Button onClick={() => onNav("home")} variant="ghost" style={{ width: "100%" }}>← Back to home</Button>
    </div>
  );
};

// ============================================================
// LEADERBOARD
// ============================================================
const LeaderboardPage = ({ allAthletes, eventRecords, onNav, currentAthletePhone }) => {
  const [view, setView] = useState("overall");
  const sorted = useMemo(() => [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)), [allAthletes]);

  return (
    <div>
      <SectionHeader title="The Leaderboard" subtitle="Public rankings · Updated weekly" />
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <Button onClick={() => setView("overall")} variant={view === "overall" ? "primary" : "light"} size="sm">Overall</Button>
        <Button onClick={() => setView("records")} variant={view === "records" ? "primary" : "light"} size="sm">Event Records</Button>
      </div>
      {view === "overall" && (
        sorted.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 48, color: COLORS.textGray, fontStyle: "italic" }}>The leaderboard begins after Event #1.</Card>
        ) : (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: COLORS.charcoal, color: COLORS.cream, fontSize: 12, letterSpacing: 1 }}>
                  <th style={{ padding: 12, textAlign: "left", fontWeight: 600 }}>RANK</th>
                  <th style={{ padding: 12, textAlign: "left", fontWeight: 600 }}>WARRIOR</th>
                  <th style={{ padding: 12, textAlign: "center", fontWeight: 600 }}>BELT</th>
                  <th style={{ padding: 12, textAlign: "center", fontWeight: 600 }}>EVENTS</th>
                  <th style={{ padding: 12, textAlign: "right", fontWeight: 600 }}>POINTS</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a, i) => {
                  const isMe = a.phone === currentAthletePhone;
                  return (
                    <tr key={a.phone} style={{ background: isMe ? COLORS.creamLight : (i % 2 === 0 ? "#FFFFFF" : "#FAFAF7"), fontWeight: isMe ? 700 : 400 }}>
                      <td style={{ padding: 12, fontSize: 14 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: i < 3 ? COLORS.gold : "transparent", fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 14 }}>
                        <div>{a.name} {isMe && <span style={{ fontSize: 11, color: COLORS.primary, marginLeft: 6 }}>(YOU)</span>}</div>
                        {formatWarriorId(a.warrior_id) && (
                          <div style={{ fontSize: 10, color: COLORS.textGray, fontFamily: "'Cinzel', monospace", letterSpacing: 1, marginTop: 2 }}>
                            {formatWarriorId(a.warrior_id)}{isFoundingWarrior(a.warrior_id) ? " ✦" : ""}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: 12, textAlign: "center" }}><BeltBadge points={a.total_points || 0} size="sm" /></td>
                      <td style={{ padding: 12, textAlign: "center", fontSize: 14 }}>{a.events_attended || 0}</td>
                      <td style={{ padding: 12, textAlign: "right", fontWeight: 700, color: COLORS.primary, fontSize: 14 }}>{a.total_points || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      )}
      {view === "records" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {EVENTS.map((ev) => {
            const rec = eventRecords.find((r) => r.event_name === ev);
            return (
              <Card key={ev} style={{ borderTop: `3px solid ${COLORS.primary}` }}>
                <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700 }}>EVENT RECORD</div>
                <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, marginBottom: 12 }}>{ev}</div>
                {rec ? (
                  <><div style={{ fontSize: 32, fontWeight: 700, color: COLORS.primary }}>{rec.value}</div><div style={{ fontSize: 13, color: COLORS.textGray, marginTop: 4 }}>{rec.holder}</div></>
                ) : (<div style={{ fontSize: 13, color: COLORS.textGray, fontStyle: "italic" }}>No record yet — claim it</div>)}
              </Card>
            );
          })}
        </div>
      )}
      <Button onClick={() => onNav("home")} variant="ghost" style={{ width: "100%", marginTop: 24 }}>← Back to home</Button>
    </div>
  );
};

// ============================================================
// ADMIN PANEL — registrations, results CSV import, Excel export, event mgmt
// ============================================================
const AdminPanel = ({ onLogout, refreshData, allAthletes, allRegistrations, event, upiId, allResults, slotCounts = {}, allWaitlist = [], allBatches = [] }) => {
  const [tab, setTab] = useState("registrations");
  const [csvInput, setCsvInput] = useState("");
  const [csvStatus, setCsvStatus] = useState("");
  const [eventDate, setEventDate] = useState(event?.event_date || "");
  const [eventVenue, setEventVenue] = useState(event?.venue || "");
  const [eventStatus, setEventStatus] = useState(event?.status || "open");
  // Convert ISO timestamp from DB to "YYYY-MM-DDTHH:mm" for datetime-local input (in user's local TZ)
  const isoToLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [eventDeadlineLocal, setEventDeadlineLocal] = useState(isoToLocalInput(event?.registration_deadline_at));
  const [newUpi, setNewUpi] = useState(upiId);
  const [exporting, setExporting] = useState(false);

  // Re-sync state when event prop changes (e.g., after a save+refresh)
  useEffect(() => {
    setEventDate(event?.event_date || "");
    setEventVenue(event?.venue || "");
    setEventStatus(event?.status || "open");
    setEventDeadlineLocal(isoToLocalInput(event?.registration_deadline_at));
  }, [event?.id, event?.event_date, event?.venue, event?.status, event?.registration_deadline_at]);

  const verifyPayment = async (eventId, phone) => {
    await supabase.from("registrations").update({ payment_status: "verified", verified_at: new Date().toISOString() }).eq("event_id", eventId).eq("phone", phone);
    refreshData();
  };
  const unverifyPayment = async (eventId, phone) => {
    await supabase.from("registrations").update({ payment_status: "pending", verified_at: null }).eq("event_id", eventId).eq("phone", phone);
    refreshData();
  };

  // Clear an athlete's PIN — they'll be prompted to set a new one on next login
  const resetAthletePin = async (phone, name) => {
    if (!confirm(`Reset PIN for ${name} (+91${phone})? They'll set a new PIN on their next login. WhatsApp them to confirm.`)) return;
    const { error } = await supabase.from("athletes").update({ pin_hash: null, pin_salt: null, pin_set_at: null }).eq("phone", phone);
    if (error) { alert("Reset failed: " + error.message); return; }
    refreshData();
    alert(`✓ PIN cleared for ${name}. Tell them to log in with their phone — they'll be prompted to set a new PIN.`);
  };

  // Promote a waitlisted athlete to a confirmed registration for that event×tier
  const promoteFromWaitlist = async (waitlistRow) => {
    if (!confirm(`Promote ${waitlistRow.name} into ${waitlistRow.event_name} (${waitlistRow.tier})? They'll be added to the registration and need to pay separately.`)) return;
    try {
      const { data: existing } = await supabase.from("registrations")
        .select("*").eq("event_id", waitlistRow.event_id).eq("phone", waitlistRow.phone);
      const reg = existing?.[0];
      if (reg) {
        const newEvents = Array.from(new Set([...(reg.events_selected || []), waitlistRow.event_name]));
        const newTiers = { ...(reg.tiers || {}), [waitlistRow.event_name]: waitlistRow.tier };
        const newCost = newEvents.reduce((s, e) => s + (TIERS[newTiers[e]]?.entry || 0), 0);
        await supabase.from("registrations").update({
          events_selected: newEvents, tiers: newTiers, total_cost: newCost,
          is_all_rounder: newEvents.length === 4, payment_status: "pending",
        }).eq("event_id", waitlistRow.event_id).eq("phone", waitlistRow.phone);
      } else {
        await supabase.from("registrations").insert({
          event_id: waitlistRow.event_id, phone: waitlistRow.phone, name: waitlistRow.name,
          events_selected: [waitlistRow.event_name], tiers: { [waitlistRow.event_name]: waitlistRow.tier },
          is_all_rounder: false, total_cost: TIERS[waitlistRow.tier]?.entry || 0,
          payment_status: "pending",
        });
      }

      // Generate batch token for the promoted athlete
      const { data: freshBatches } = await supabase.from("batch_assignments").select("*").eq("event_id", waitlistRow.event_id);
      const liveBatches = freshBatches || [];
      const wlGender = waitlistRow.gender_category || "Mixed";
      const slot = nextBatchSlot(liveBatches, waitlistRow.event_name, waitlistRow.tier, wlGender);
      let assignedToken = null;
      if (slot) {
        assignedToken = formatToken(waitlistRow.tier, waitlistRow.event_name, wlGender, slot.batch, slot.position);
        await supabase.from("batch_assignments").insert({
          event_id: waitlistRow.event_id, phone: waitlistRow.phone, name: waitlistRow.name,
          event_name: waitlistRow.event_name, tier: waitlistRow.tier, gender_category: wlGender,
          batch_number: slot.batch, position: slot.position, token: assignedToken,
        });
      }

      await supabase.from("waitlist").update({ promoted: true }).eq("id", waitlistRow.id);
      refreshData();
      alert(`Promoted! Token: ${assignedToken || "(could not assign — check capacity)"}\nSend WhatsApp to ${waitlistRow.name} (+91${waitlistRow.phone}) with token + payment instructions.`);
    } catch (err) {
      alert("Failed to promote: " + err.message);
    }
  };

  const removeFromWaitlist = async (id) => {
    if (!confirm("Remove from waitlist?")) return;
    await supabase.from("waitlist").delete().eq("id", id);
    refreshData();
  };

  // Swap two athletes' batch positions within the same (event × tier)
  const swapBatchPositions = async (a, b) => {
    if (a.event_name !== b.event_name || a.tier !== b.tier) {
      alert("Can only swap athletes within the same event and tier.");
      return;
    }
    if (!confirm(`Swap ${a.name} (${a.token}) ↔ ${b.name} (${b.token})?`)) return;
    try {
      // Two-step swap to avoid unique constraint collision
      await supabase.from("batch_assignments").update({
        batch_number: -1, position: -1, token: "TEMP-" + a.id,
      }).eq("id", a.id);
      await supabase.from("batch_assignments").update({
        batch_number: a.batch_number, position: a.position, token: a.token,
      }).eq("id", b.id);
      await supabase.from("batch_assignments").update({
        batch_number: b.batch_number, position: b.position, token: b.token,
      }).eq("id", a.id);
      refreshData();
    } catch (err) {
      alert("Swap failed: " + err.message);
    }
  };

  // Reassign an athlete to specific batch+position (used in manual move)
  const moveBatchPosition = async (a, newBatch, newPosition) => {
    const newToken = formatToken(a.tier, a.event_name, newBatch, newPosition);
    // Check if target is occupied
    const { data: occupant } = await supabase.from("batch_assignments")
      .select("*").eq("event_id", a.event_id).eq("event_name", a.event_name).eq("tier", a.tier)
      .eq("batch_number", newBatch).eq("position", newPosition).maybeSingle();
    if (occupant) {
      // Swap them
      return swapBatchPositions(a, occupant);
    }
    try {
      await supabase.from("batch_assignments").update({
        batch_number: newBatch, position: newPosition, token: newToken,
      }).eq("id", a.id);
      refreshData();
    } catch (err) {
      alert("Move failed: " + err.message);
    }
  };

  // Regenerate ALL tokens for the current event in registration order (admin nuclear option)
  const regenerateAllTokens = async () => {
    if (!confirm("Regenerate ALL batch tokens for this event? This rebuilds tokens in registration order. Use only if assignments got messy.")) return;
    try {
      // Build ordered list from registrations, sorted by registered_at
      const { data: regs } = await supabase.from("registrations").select("*").eq("event_id", event.id).order("registered_at", { ascending: true });
      const allOrdered = [];
      for (const r of (regs || [])) {
        for (const evName of (r.events_selected || [])) {
          allOrdered.push({
            phone: r.phone, name: r.name, event_name: evName,
            tier: r.tiers?.[evName],
            gender_category: r.gender_categories?.[evName] || "Mixed",
          });
        }
      }
      // Wipe all existing for this event
      await supabase.from("batch_assignments").delete().eq("event_id", event.id);
      // Reassign in order
      const live = [];
      for (const item of allOrdered) {
        if (!item.tier) continue;
        const slot = nextBatchSlot(live, item.event_name, item.tier, item.gender_category);
        if (!slot) continue;
        const token = formatToken(item.tier, item.event_name, item.gender_category, slot.batch, slot.position);
        const newRow = {
          event_id: event.id, phone: item.phone, name: item.name,
          event_name: item.event_name, tier: item.tier,
          gender_category: item.gender_category,
          batch_number: slot.batch, position: slot.position, token,
        };
        await supabase.from("batch_assignments").insert(newRow);
        live.push(newRow);
      }
      refreshData();
      alert(`Regenerated ${allOrdered.length} tokens.`);
    } catch (err) {
      alert("Regenerate failed: " + err.message);
    }
  };

  const saveEventConfig = async () => {
    // Convert local datetime input to ISO. Empty string = clear deadline (= no auto-close).
    let deadlineIso = null;
    if (eventDeadlineLocal && eventDeadlineLocal.trim()) {
      const d = new Date(eventDeadlineLocal);
      if (!isNaN(d.getTime())) deadlineIso = d.toISOString();
    }
    const { error } = await supabase.from("events").update({
      event_date: eventDate, venue: eventVenue, status: eventStatus,
      registration_deadline_at: deadlineIso,
    }).eq("id", event.id);
    if (error) { alert("Save failed: " + error.message); return; }
    await supabase.from("config").upsert({ key: "upi_id", value: newUpi });
    refreshData();
    alert("Saved");
  };

  const importResults = async () => {
    setCsvStatus("Processing...");
    try {
      const lines = csvInput.trim().split("\n").filter(Boolean);
      if (lines.length < 2) throw new Error("Need header row + at least 1 data row");
      const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
      const dataRows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((s) => s.trim());
        const row = {};
        header.forEach((h, i) => { row[h] = cols[i]; });
        return row;
      });

      const byPhone = {};
      for (const r of dataRows) {
        if (!r.phone || !r.event) continue;
        const p = r.phone.replace(/\D/g, "");
        if (!byPhone[p]) byPhone[p] = [];
        byPhone[p].push({
          event: r.event, position: parseInt(r.position) || null,
          value: r.value || "", isPB: r.ispb === "true" || r.ispb === "1" || r.ispb === "yes",
        });
      }

      let updated = 0, skipped = 0;
      const recordUpdates = {};

      for (const [phone, results] of Object.entries(byPhone)) {
        const { data: regs } = await supabase.from("registrations").select("*").eq("event_id", event.id).eq("phone", phone);
        const reg = regs?.[0];
        const { data: aths } = await supabase.from("athletes").select("*").eq("phone", phone);
        const athlete = aths?.[0];
        if (!athlete) { skipped++; continue; }

        const tiers = reg?.tiers || {};
        for (const r of results) if (!tiers[r.event]) tiers[r.event] = "Bronze";

        const dayPoints = calculatePoints(results, tiers);
        const newTotal = (athlete.total_points || 0) + dayPoints;
        const newAttended = (athlete.events_attended || 0) + 1;
        const personalBests = athlete.personal_bests || {};
        const eventDateStr2 = event?.event_date || new Date().toISOString().slice(0, 10);
        for (const r of results) {
          const oldField = personalBests[r.event];
          // CSV "isPB" field provided manually; if blank, auto-detect
          const finalIsPB = r.isPB ? true : isNewPB(r.event, r.value, oldField);
          if (finalIsPB && r.value) {
            personalBests[r.event] = {
              value: r.value, date: eventDateStr2, event_id: event.id,
              previous_value: getPBValue(oldField), previous_date: getPBDate(oldField),
            };
          }
          if (r.value && r.position === 1) {
            recordUpdates[r.event] = { event_name: r.event, value: r.value, holder: athlete.name, phone, set_on: event.event_date };
          }
        }

        await supabase.from("athletes").update({
          total_points: newTotal, events_attended: newAttended, personal_bests: personalBests, updated_at: new Date().toISOString(),
        }).eq("phone", phone);

        await supabase.from("event_results").upsert({
          event_id: event.id, phone, name: athlete.name, event_date: event.event_date,
          results: results.map((r) => ({ ...r, tier: tiers[r.event] || "Bronze" })),
          total_points: dayPoints,
        }, { onConflict: "event_id,phone" });

        updated++;
      }

      for (const rec of Object.values(recordUpdates)) {
        await supabase.from("event_records").upsert(rec, { onConflict: "event_name" });
      }

      setCsvStatus(`✓ Updated ${updated} athlete${updated !== 1 ? "s" : ""}, skipped ${skipped} (not registered)`);
      setCsvInput("");
      refreshData();
    } catch (err) {
      setCsvStatus(`✗ Error: ${err.message}`);
    }
  };

  // Generate pre-filled Excel template for event-day results entry
  const downloadResultsTemplate = async () => {
    try {
      const phoneToWid = {};
      const phoneToVerified = {};
      const phoneToAthlete = {};
      for (const a of allAthletes) {
        phoneToWid[a.phone] = formatWarriorId(a.warrior_id) || "";
        phoneToAthlete[a.phone] = a;
      }
      for (const r of allRegistrations) phoneToVerified[r.phone] = r.payment_status === "verified";

      // Build tree: event → tier → gender → batch → [rows]
      const tree = {};
      const batchesForEvent = (allBatches || []).filter((b) => b.event_id === event?.id);
      for (const b of batchesForEvent) {
        const g = b.gender_category || "Mixed";
        if (!tree[b.event_name]) tree[b.event_name] = {};
        if (!tree[b.event_name][b.tier]) tree[b.event_name][b.tier] = {};
        if (!tree[b.event_name][b.tier][g]) tree[b.event_name][b.tier][g] = {};
        if (!tree[b.event_name][b.tier][g][b.batch_number]) tree[b.event_name][b.tier][g][b.batch_number] = [];
        tree[b.event_name][b.tier][g][b.batch_number].push(b);
      }

      // Brand colors
      const C = {
        crimson: "FF8B0000", goldLight: "FFFCF3D9", gold: "FFD4A017",
        charcoal: "FF1A1A1A", cream: "FFF5F1E8", creamDark: "FFEFE7D2",
        yellow: "FFFFF4B0", white: "FFFFFFFF",
        tier: { Bronze: "FF8B5A2B", Silver: "FF8E8E93", Gold: "FFD4A017", Platinum: "FF8B0000" },
        tierText: { Bronze: "FFFFFFFF", Silver: "FFFFFFFF", Gold: "FF1A1A1A", Platinum: "FFFFFFFF" },
        gender: { Men: "FF1F4E79", Women: "FFB83280", Mixed: "FF5C8A2A" },
      };

      const wb = new ExcelJS.Workbook();
      wb.creator = "Rann Platform";
      wb.created = new Date();

      const ws = wb.addWorksheet("Results Entry", {
        views: [{ state: "frozen", ySplit: 3 }],
      });

      // Column widths (10 columns: + Previous Best)
      ws.columns = [
        { width: 16 }, { width: 14 }, { width: 24 }, { width: 14 }, { width: 8 },
        { width: 8 }, { width: 18 }, { width: 16 }, { width: 18 }, { width: 12 },
      ];

      // === Title row ===
      const dateStr = event?.event_date || "Event Day";
      const venue = event?.venue || "";
      ws.mergeCells("A1:J1");
      const titleCell = ws.getCell("A1");
      titleCell.value = `⚔  RANN  ·  RESULTS ENTRY  ·  ${dateStr}${venue ? "  ·  " + venue : ""}  ⚔`;
      titleCell.font = { name: "Arial", bold: true, size: 14, color: { argb: C.white } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.charcoal } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 32;

      // === Instructions row ===
      ws.mergeCells("A2:J2");
      const instrCell = ws.getCell("A2");
      instrCell.value = "Fill ONLY the yellow cells: Position (1-5) for the heat winner-to-loser, and Y/N for personal best. Leave Position blank for no-shows.";
      instrCell.font = { name: "Arial", italic: true, size: 10, color: { argb: C.charcoal } };
      instrCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.goldLight } };
      instrCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      ws.getRow(2).height = 30;

      let r = 4;
      const thinBorder = { style: "thin", color: { argb: "FFCCCCCC" } };
      const allBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

      const fillRow = (rowNum, colStart, colEnd, color) => {
        for (let c = colStart; c <= colEnd; c++) {
          ws.getCell(rowNum, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        }
      };

      for (const evName of EVENTS) {
        if (!tree[evName]) continue;

        // Event band (dark with gold text)
        ws.mergeCells(r, 1, r, 10);
        const evCell = ws.getCell(r, 1);
        evCell.value = `◆  ${evName.toUpperCase()}  ◆`;
        evCell.font = { name: "Arial", bold: true, size: 14, color: { argb: C.gold } };
        evCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.charcoal } };
        evCell.alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(r).height = 26;
        r++;

        for (const tierName of Object.keys(TIERS)) {
          if (!tree[evName][tierName]) continue;

          // Tier band
          ws.mergeCells(r, 1, r, 10);
          const tCell = ws.getCell(r, 1);
          tCell.value = `${tierName.toUpperCase()} TIER`;
          tCell.font = { name: "Arial", bold: true, size: 11, color: { argb: C.tierText[tierName] } };
          tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.tier[tierName] } };
          tCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
          ws.getRow(r).height = 22;
          r++;

          for (const gender of GENDER_CATEGORIES) {
            if (!tree[evName][tierName][gender]) continue;

            // Gender sub-band
            ws.mergeCells(r, 1, r, 10);
            const gCell = ws.getCell(r, 1);
            gCell.value = `   ◆ ${gender.toUpperCase()} ◆`;
            gCell.font = { name: "Arial", bold: true, size: 10, color: { argb: C.white } };
            gCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.gender[gender] } };
            gCell.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
            ws.getRow(r).height = 20;
            r++;

            const batches = tree[evName][tierName][gender];
            const batchNums = Object.keys(batches).map(Number).sort((a, b) => a - b);
            for (const bn of batchNums) {
              const rows = batches[bn].sort((a, b) => a.position - b.position);

              // Batch label row
              ws.mergeCells(r, 1, r, 10);
              const bCell = ws.getCell(r, 1);
              bCell.value = `      Batch ${bn}  ·  Heat of ${rows.length} warrior${rows.length === 1 ? "" : "s"}`;
              bCell.font = { name: "Arial", bold: true, italic: true, size: 10, color: { argb: C.charcoal } };
              bCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.creamDark } };
              bCell.alignment = { horizontal: "left", vertical: "middle", indent: 3 };
              ws.getRow(r).height = 18;
              r++;

              // Header row (10 cols: + Previous Best)
              const headers = ["Token", "Warrior ID", "Name", "Phone", "Batch", "Pos in Batch", "Previous Best", "Position (1-5)", "Value (reps/secs)", "PB? (Y/N)"];
              headers.forEach((h, i) => {
                const c = ws.getCell(r, i + 1);
                c.value = h;
                c.font = { name: "Arial", bold: true, size: 9, color: { argb: C.white } };
                c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.charcoal } };
                c.alignment = { horizontal: "center", vertical: "middle" };
                c.border = allBorders;
              });
              ws.getRow(r).height = 22;
              r++;

              // Data rows
              for (const row of rows) {
                const phone = row.phone;
                const verified = phoneToVerified[phone];
                // Look up athlete's previous PB for this event
                const ath = phoneToAthlete[phone];
                const pbField = ath?.personal_bests?.[row.event_name];
                const pbVal = getPBValue(pbField);
                const pbDate = getPBDate(pbField);
                const prevBestStr = pbVal !== null && pbVal !== undefined && pbVal !== ""
                  ? (pbDate ? `${pbVal} · ${formatPBDateShort(pbDate)}` : `${pbVal}`)
                  : "— first event";
                const cells = [
                  row.token,
                  phoneToWid[phone] || "",
                  row.name,
                  phone,
                  row.batch_number,
                  row.position,
                  prevBestStr,   // Previous Best (read-only, gray)
                  "", "", "",    // yellow input cells
                ];
                cells.forEach((v, i) => {
                  const c = ws.getCell(r, i + 1);
                  c.value = v;
                  c.border = allBorders;
                  if (i === 0) {
                    c.font = { name: "Consolas", size: 10, color: { argb: C.crimson }, bold: true };
                    c.alignment = { horizontal: "center", vertical: "middle" };
                  } else if (i === 2) {
                    c.font = { name: "Arial", size: 10, color: { argb: C.charcoal } };
                    c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
                  } else if (i === 6) {
                    // Previous Best — gray bg, italic, smaller
                    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
                    const isFirstEvent = pbVal === null || pbVal === undefined || pbVal === "";
                    c.font = { name: "Arial", italic: isFirstEvent, size: 9, color: { argb: isFirstEvent ? "FF999999" : C.charcoal } };
                    c.alignment = { horizontal: "center", vertical: "middle" };
                  } else if (i === 7 || i === 8 || i === 9) {
                    // Yellow input cells
                    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.yellow } };
                    c.font = { name: "Arial", bold: true, size: 10, color: { argb: C.charcoal } };
                    c.alignment = { horizontal: "center", vertical: "middle" };
                  } else {
                    c.font = { name: "Arial", size: 10, color: { argb: C.charcoal } };
                    c.alignment = { horizontal: "center", vertical: "middle" };
                  }
                });
                if (!verified) {
                  ws.getCell(r, 4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE5E5" } };
                  ws.getCell(r, 4).font = { name: "Arial", size: 10, color: { argb: "FF8B0000" }, italic: true };
                }
                ws.getRow(r).height = 20;
                r++;
              }

              // Empty slots
              const emptyCount = BATCH_SIZE - rows.length;
              for (let i = 0; i < emptyCount; i++) {
                for (let col = 1; col <= 10; col++) {
                  const c = ws.getCell(r, col);
                  c.value = col === 3 ? "(empty slot)" : "";
                  c.font = { name: "Arial", italic: true, size: 9, color: { argb: "FF999999" } };
                  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
                  c.border = allBorders;
                  c.alignment = { horizontal: "center", vertical: "middle" };
                }
                ws.getRow(r).height = 18;
                r++;
              }
              r++; // spacer between batches
            }
          }
        }
      }

      // === Instructions sheet ===
      const ws2 = wb.addWorksheet("Instructions");
      ws2.columns = [{ width: 100 }];
      const lines = [
        { t: "⚔ RANN — Event-Day Results Entry", bold: true, size: 16, fg: C.gold, bg: C.charcoal },
        { t: "" },
        { t: "HOW TO USE THIS SHEET:", bold: true, size: 12, bg: C.goldLight },
        { t: "" },
        { t: "1. Print this workbook OR open on a tablet/laptop at the venue." },
        { t: "2. As each batch finishes its heat, fill in the YELLOW cells only:" },
        { t: "       • Position (1-5)  →  1 = winner, 2 = 2nd, 3-5 = 3rd / 4th / 5th in their heat" },
        { t: "       • Value  →  actual number (e.g., 47 reps, 14.2 seconds, 1:35 plank time)" },
        { t: "       • PB? (Y/N)  →  Y if they beat their own previous best; otherwise leave blank" },
        { t: "" },
        { t: "3. For no-shows: leave Position blank. Platform skips them." },
        { t: "" },
        { t: "4. After event: open Admin → Import Results → Upload Filled Excel. Done." },
        { t: "" },
        { t: "RULES:", bold: true, size: 12, bg: C.goldLight },
        { t: "" },
        { t: "   • DO NOT change Token, Warrior ID, Name, Phone, Batch, or Pos in Batch columns — they identify the athlete." },
        { t: "   • Empty slots show as '(empty slot)' — leave them alone, they are ignored on upload." },
        { t: "   • Section headers (PUSH-UPS, BRONZE TIER, MEN, etc.) are visual guides — only data rows are read." },
        { t: "   • Phone numbers in PINK ITALIC indicate payment-pending registrations." },
        { t: "     If they show up and pay cash at the venue, fill in their position normally." },
        { t: "" },
        { t: "POINTS FORMULA:", bold: true, size: 12, bg: C.goldLight },
        { t: "" },
        { t: "       Base: 10 just for showing up" },
        { t: "       Position bonus: +50 (1st), +30 (2nd), +20 (3rd) within their heat" },
        { t: "       Personal best: +25" },
        { t: "       Tier multiplier: ×1 Bronze, ×1.5 Silver, ×2 Gold, ×3 Platinum" },
        { t: "       All-rounder: ×1.5 if athlete competed in all 4 events that day" },
        { t: "" },
        { t: "रण में उतरो।", bold: true, size: 12, fg: C.crimson },
      ];
      lines.forEach((line, i) => {
        const c = ws2.getCell(i + 1, 1);
        c.value = line.t;
        c.font = { name: "Arial", bold: !!line.bold, size: line.size || 11, color: { argb: line.fg || C.charcoal } };
        if (line.bg) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: line.bg } };
        c.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
        ws2.getRow(i + 1).height = line.bold ? 22 : 18;
      });

      // Generate buffer and trigger download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rann_Results_${event?.id || "event"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Could not generate template: " + e.message);
      console.error(e);
    }
  };

  // Upload filled Excel template and process
  const handleResultsExcelUpload = async (file) => {
    if (!file) return;
    setCsvStatus("Reading Excel file...");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes("result")) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      // Read as 2D array — we walk row by row since headers repeat per batch
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (!data.length) throw new Error("Sheet has no rows");

      // Reverse maps for parsing tokens like "B-PU-M-1-04"
      const tierByLetter = {}; for (const k of Object.keys(TIER_LETTERS)) tierByLetter[TIER_LETTERS[k]] = k;
      const eventByCode = {}; for (const k of Object.keys(EVENT_CODES)) eventByCode[EVENT_CODES[k]] = k;
      const genderByLetter = {}; for (const k of Object.keys(GENDER_LETTERS)) genderByLetter[GENDER_LETTERS[k]] = k;

      // Group by phone
      const byPhone = {};
      let validRows = 0;
      for (const row of data) {
        if (!row || row.length < 8) continue;
        const tokenStr = String(row[0] || "").trim();
        const phoneStr = String(row[3] || "").replace(/\D/g, "");
        // Columns: 0 Token | 1 Warrior ID | 2 Name | 3 Phone | 4 Batch | 5 Pos in Batch | 6 Previous Best | 7 Position(1-5) | 8 Value | 9 PB?
        const positionRaw = row[7];
        // Skip section bands, headers, empty slots — they have no valid token + phone
        if (!tokenStr) continue;
        if (phoneStr.length !== 10) continue;
        if (positionRaw === "" || positionRaw === null || positionRaw === undefined) continue;

        // Parse token: T-EE-G-B-PP
        const parts = tokenStr.split("-");
        if (parts.length !== 5) continue;
        const tier = tierByLetter[parts[0]];
        const evName = eventByCode[parts[1]];
        const gender = genderByLetter[parts[2]] || "Mixed";
        if (!tier || !evName) continue;

        const position = parseInt(positionRaw, 10);
        if (isNaN(position) || position < 1 || position > 5) continue;

        // Manual PB override: "Y" / "N" forces; blank = auto-detect at upload time
        const pbOverrideRaw = String(row[9] || "").trim().toLowerCase();
        let pbOverride = null; // null = auto, true = force Y, false = force N
        if (pbOverrideRaw.startsWith("y")) pbOverride = true;
        else if (pbOverrideRaw.startsWith("n")) pbOverride = false;

        if (!byPhone[phoneStr]) byPhone[phoneStr] = [];
        byPhone[phoneStr].push({
          event: evName, position,
          value: String(row[8] || "").trim(),
          pbOverride, tier, gender_category: gender,
        });
        validRows++;
      }
      if (validRows === 0) throw new Error("No valid result rows found. Make sure you filled the yellow Position cells.");

      let updated = 0, skipped = 0;
      const recordUpdates = {};
      const eventDateStr = event?.event_date || new Date().toISOString().slice(0, 10);
      for (const [phone, results] of Object.entries(byPhone)) {
        const { data: regs } = await supabase.from("registrations").select("*").eq("event_id", event.id).eq("phone", phone);
        const reg = regs?.[0];
        const { data: aths } = await supabase.from("athletes").select("*").eq("phone", phone);
        const athlete = aths?.[0];
        if (!athlete) { skipped++; continue; }
        const tiers = reg?.tiers || {};
        for (const r of results) if (!tiers[r.event]) tiers[r.event] = r.tier || "Bronze";

        // Auto-detect PB for each result (with manual override taking precedence)
        const personalBests = athlete.personal_bests || {};
        for (const r of results) {
          const oldField = personalBests[r.event];
          let isPB;
          if (r.pbOverride !== null) {
            isPB = r.pbOverride; // user said Y or N — respect it
          } else {
            isPB = isNewPB(r.event, r.value, oldField); // auto-detect
          }
          r.isPB = isPB; // store for points calc

          // If PB, update structured personal_bests with previous-value tracking
          if (isPB && r.value) {
            const oldVal = getPBValue(oldField);
            const oldDate = getPBDate(oldField);
            personalBests[r.event] = {
              value: r.value,
              date: eventDateStr,
              event_id: event.id,
              previous_value: oldVal,
              previous_date: oldDate,
            };
          }
        }

        const dayPoints = calculatePoints(results, tiers);
        const newTotal = (athlete.total_points || 0) + dayPoints;
        const newAttended = (athlete.events_attended || 0) + 1;
        for (const r of results) {
          if (r.value && r.position === 1) {
            recordUpdates[r.event] = { event_name: r.event, value: r.value, holder: athlete.name, phone, set_on: event.event_date };
          }
        }
        await supabase.from("athletes").update({
          total_points: newTotal, events_attended: newAttended, personal_bests: personalBests, updated_at: new Date().toISOString(),
        }).eq("phone", phone);
        await supabase.from("event_results").upsert({
          event_id: event.id, phone, name: athlete.name, event_date: event.event_date,
          results: results.map((r) => ({ ...r, tier: tiers[r.event] || "Bronze" })),
          total_points: dayPoints,
        }, { onConflict: "event_id,phone" });
        updated++;
      }
      for (const rec of Object.values(recordUpdates)) {
        await supabase.from("event_records").upsert(rec, { onConflict: "event_name" });
      }
      setCsvStatus(`✓ Updated ${updated} athlete${updated !== 1 ? "s" : ""}, skipped ${skipped} (not registered or invalid). Leaderboard refreshed.`);
      refreshData();
    } catch (err) {
      setCsvStatus(`✗ Error: ${err.message}`);
    }
  };

  const closeEvent = async () => {
    if (!confirm("Close this event? Athletes won't be able to register.")) return;
    await supabase.from("events").update({ status: "closed" }).eq("id", event.id);
    setEventStatus("closed");
    refreshData();
  };

  const startNewEvent = async () => {
    const newId = `event_${String(parseInt(event.id.replace("event_", "")) + 1).padStart(3, "0")}`;
    const newDate = prompt("New event date (e.g., 'Sunday, June 1, 2026'):");
    if (!newDate) return;
    const newVenue = prompt("Venue:", event.venue) || event.venue;
    await supabase.from("events").update({ is_current: false }).eq("id", event.id);
    await supabase.from("events").insert({
      id: newId, event_date: newDate, venue: newVenue, start_time: "6:30 AM",
      registration_deadline: "TBD", status: "open", is_current: true,
    });
    refreshData();
    alert(`New event ${newId} started`);
  };

  const exportToExcel = () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      const athletesData = allAthletes.map((a) => ({
        "Warrior ID": formatWarriorId(a.warrior_id) || "",
        Phone: a.phone, Name: a.name, Email: a.email || "", Age: a.age || "",
        Gender: a.gender || "", "Emergency Name": a.emergency_name || "",
        "Emergency Phone": a.emergency_phone || "", "Total Points": a.total_points || 0,
        "Events Attended": a.events_attended || 0, "Belt": getBelt(a.total_points || 0).name,
        "Founding Warrior": isFoundingWarrior(a.warrior_id) ? "Yes" : "",
        "Joined": a.join_date ? new Date(a.join_date).toLocaleDateString("en-IN") : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(athletesData), "Athletes");

      const phoneToWid = {};
      for (const a of allAthletes) phoneToWid[a.phone] = formatWarriorId(a.warrior_id) || "";

      const regsData = allRegistrations.map((r) => ({
        "Event ID": r.event_id, "Warrior ID": phoneToWid[r.phone] || "",
        Phone: r.phone, Name: r.name,
        Events: (r.events_selected || []).join(", "),
        Tiers: Object.entries(r.tiers || {}).map(([e, t]) => `${e}:${t}`).join(", "),
        "Total Cost": r.total_cost, "All Rounder": r.is_all_rounder ? "Yes" : "No",
        "Payment Status": r.payment_status, "Payment Note": r.payment_note || "",
        Registered: r.registered_at ? new Date(r.registered_at).toLocaleString("en-IN") : "",
        Verified: r.verified_at ? new Date(r.verified_at).toLocaleString("en-IN") : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(regsData), "Registrations");

      const resultsRows = [];
      for (const er of (allResults || [])) {
        for (const r of (er.results || [])) {
          resultsRows.push({
            "Event ID": er.event_id, Date: er.event_date,
            "Warrior ID": phoneToWid[er.phone] || "",
            Phone: er.phone, Name: er.name,
            "Sub-Event": r.event, Tier: r.tier, Position: r.position || "", Value: r.value || "",
            PB: r.isPB ? "Yes" : "No", "Day Points": er.total_points,
          });
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultsRows), "Results");

      const lbData = [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).map((a, i) => ({
        Rank: i + 1, "Warrior ID": formatWarriorId(a.warrior_id) || "",
        Name: a.name, Phone: a.phone, Belt: getBelt(a.total_points || 0).name,
        Points: a.total_points || 0, Events: a.events_attended || 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lbData), "Leaderboard");

      // Batch sheet: tokens for the venue
      const batchRows = (allBatches || [])
        .filter((b) => b.event_id === event?.id)
        .sort((a, b) => {
          const evOrder = EVENTS.indexOf(a.event_name) - EVENTS.indexOf(b.event_name);
          if (evOrder !== 0) return evOrder;
          const tierOrder = Object.keys(TIERS).indexOf(a.tier) - Object.keys(TIERS).indexOf(b.tier);
          if (tierOrder !== 0) return tierOrder;
          if (a.batch_number !== b.batch_number) return a.batch_number - b.batch_number;
          return a.position - b.position;
        })
        .map((b) => ({
          Token: b.token, Event: b.event_name, Tier: b.tier,
          Batch: b.batch_number, Position: b.position,
          Name: b.name, Phone: b.phone,
        }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchRows), "Batches");

      const today = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `Rann_Backup_${today}.xlsx`);
    } catch (e) {
      alert("Export failed: " + e.message);
    }
    setExporting(false);
  };

  const regsList = useMemo(() => allRegistrations.filter((r) => r.event_id === event?.id), [allRegistrations, event]);
  const pendingCount = regsList.filter((r) => r.payment_status === "pending").length;
  const totalRevenue = regsList.filter((r) => r.payment_status === "verified").reduce((s, r) => s + r.total_cost, 0);

  return (
    <div>
      <Card style={{ marginBottom: 24, background: COLORS.charcoal, color: COLORS.cream, borderColor: COLORS.gold }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700 }}>ADMIN PANEL</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontFamily: "'Cinzel', serif" }}>{event?.id} · {event?.event_date}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={exportToExcel} variant="gold" size="sm" disabled={exporting}>{exporting ? "Exporting..." : "📥 Export to Excel"}</Button>
            <Button onClick={onLogout} variant="ghost" size="sm" style={{ color: COLORS.cream, borderColor: COLORS.cream }}>Log Out</Button>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Registrations" value={regsList.length} />
        <StatCard label="Pending Verify" value={pendingCount} accent={pendingCount > 0} />
        <StatCard label="Verified Revenue" value={`₹${totalRevenue}`} />
        <StatCard label="All Athletes" value={allAthletes.length} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <Button onClick={() => setTab("registrations")} variant={tab === "registrations" ? "primary" : "light"} size="sm">Registrations</Button>
        <Button onClick={() => setTab("capacity")} variant={tab === "capacity" ? "primary" : "light"} size="sm">Capacity</Button>
        <Button onClick={() => setTab("waitlist")} variant={tab === "waitlist" ? "primary" : "light"} size="sm">Waitlist</Button>
        <Button onClick={() => setTab("batches")} variant={tab === "batches" ? "primary" : "light"} size="sm">Batch Sheet</Button>
        <Button onClick={() => setTab("results")} variant={tab === "results" ? "primary" : "light"} size="sm">Import Results</Button>
        <Button onClick={() => setTab("event")} variant={tab === "event" ? "primary" : "light"} size="sm">Event Config</Button>
        <Button onClick={() => setTab("danger")} variant={tab === "danger" ? "primary" : "light"} size="sm">Danger Zone</Button>
      </div>

      {tab === "registrations" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Registrations for {event?.id}</div>
          {regsList.length === 0 ? (
            <div style={{ color: COLORS.textGray, fontStyle: "italic", padding: 16, textAlign: "center" }}>No registrations yet.</div>
          ) : (
            <div>
              {regsList.map((r) => {
                const athlete = (allAthletes || []).find((a) => a.phone === r.phone);
                const wid = formatWarriorId(athlete?.warrior_id);
                return (
                <div key={r.phone} style={{ borderBottom: `1px solid ${COLORS.borderLight}`, padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                      {wid && <div style={{ fontSize: 10, fontFamily: "'Cinzel', monospace", color: COLORS.gold, fontWeight: 700, letterSpacing: 1, padding: "1px 6px", background: COLORS.charcoal, borderRadius: 3 }}>{wid}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textGray }}>{formatPhone(r.phone)} · {(r.events_selected || []).join(", ")}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>₹{r.total_cost} · ref: <span style={{ fontFamily: "monospace", color: COLORS.primary }}>{r.payment_note || "—"}</span></div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {r.payment_status === "pending" ? (
                      <Button onClick={() => verifyPayment(r.event_id, r.phone)} variant="primary" size="sm">Mark Paid</Button>
                    ) : (
                      <>
                        <span style={{ background: "#D6F0DC", color: "#1F7A3A", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>VERIFIED</span>
                        <Button onClick={() => unverifyPayment(r.event_id, r.phone)} variant="light" size="sm">Undo</Button>
                      </>
                    )}
                    <Button onClick={() => resetAthletePin(r.phone, r.name)} variant="ghost" size="sm" title="Clear their PIN — they'll set a new one on next login">🔑 Reset PIN</Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "capacity" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Capacity overview · {event?.id}</div>
          <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 16, lineHeight: 1.6 }}>
            Hard cap of <strong>{MAX_PER_SLOT} spots per (event × tier)</strong> = 5 batches of 5. Once full, new registrations route to the waitlist.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 500 }}>
              <thead>
                <tr style={{ background: COLORS.charcoal, color: COLORS.cream }}>
                  <th style={{ padding: 10, textAlign: "left", fontWeight: 600, letterSpacing: 1 }}>EVENT</th>
                  {Object.keys(TIERS).map((t) => (
                    <th key={t} style={{ padding: 10, textAlign: "center", fontWeight: 600, color: TIERS[t].color === "#D4A017" ? COLORS.gold : COLORS.cream }}>{t.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((e, i) => (
                  <tr key={e} style={{ background: i % 2 === 0 ? COLORS.creamLight : "#FFFFFF" }}>
                    <td style={{ padding: 10, fontWeight: 700 }}>{e}</td>
                    {Object.keys(TIERS).map((t) => {
                      const slot = getSlotInfo(slotCounts, e, t);
                      const sc = getSlotColor(slot.status);
                      return (
                        <td key={t} style={{ padding: 8, textAlign: "center" }}>
                          <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 4, background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 700, minWidth: 60 }}>
                            {slot.registered}/{MAX_PER_SLOT}
                          </div>
                          {slot.waitlisted > 0 && (
                            <div style={{ fontSize: 10, color: COLORS.textGray, marginTop: 3 }}>+{slot.waitlisted} waiting</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: COLORS.creamLight, borderRadius: 6, fontSize: 12, color: COLORS.textGray, lineHeight: 1.6 }}>
            <strong>Legend:</strong> <span style={{ color: "#2D7A47" }}>Open</span> · <span style={{ color: "#5C8A2A" }}>Filling fast</span> · <span style={{ color: "#C97F12" }}>Almost full</span> · <span style={{ color: "#7B1A1A" }}>Full (waitlist active)</span>
          </div>
        </Card>
      )}

      {tab === "waitlist" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Waitlist · {event?.id}</div>
          <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 16, lineHeight: 1.6 }}>
            Athletes queued for full slots. Promote in order of join time. Promoting adds them to the registration as <strong>pending payment</strong> — send them a WhatsApp with payment instructions.
          </div>
          {(() => {
            const wlForEvent = (allWaitlist || []).filter((w) => w.event_id === event?.id && !w.promoted);
            if (wlForEvent.length === 0) {
              return <div style={{ color: COLORS.textGray, fontStyle: "italic", padding: 16, textAlign: "center" }}>No one waiting. All slots have room.</div>;
            }
            // Group by event_name + tier, sort by joined_at
            const groups = {};
            for (const w of wlForEvent) {
              const k = `${w.event_name}|${w.tier}`;
              if (!groups[k]) groups[k] = [];
              groups[k].push(w);
            }
            for (const k of Object.keys(groups)) {
              groups[k].sort((a, b) => (a.joined_at || "").localeCompare(b.joined_at || ""));
            }
            return Object.entries(groups).map(([k, rows]) => {
              const [evName, tier] = k.split("|");
              return (
                <div key={k} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: TIERS[tier]?.color }}>
                    {evName} · {tier} <span style={{ color: COLORS.textGray, fontWeight: 400 }}>({rows.length} waiting)</span>
                  </div>
                  {rows.map((w, idx) => (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: idx === 0 ? COLORS.creamLight : "#FFFFFF", border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, marginBottom: 4 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: idx === 0 ? COLORS.gold : COLORS.borderLight, color: COLORS.charcoal, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{w.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.textGray }}>{formatPhone(w.phone)} · joined {new Date(w.joined_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                      </div>
                      <Button onClick={() => promoteFromWaitlist(w)} variant="primary" size="sm">Promote</Button>
                      <Button onClick={() => removeFromWaitlist(w.id)} variant="light" size="sm">Remove</Button>
                    </div>
                  ))}
                </div>
              );
            });
          })()}
        </Card>
      )}

      {tab === "batches" && (
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Sunday Morning Batch Sheet</div>
                <div style={{ fontSize: 12, color: COLORS.textGray, lineHeight: 1.6 }}>
                  Print this and bring to the venue. Each athlete has a token like <span style={{ fontFamily: "monospace", color: COLORS.primary }}>B-PU-2-04</span> = Bronze, Push-ups, Batch 2, Position 4.
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Button onClick={() => window.print()} variant="dark" size="sm">🖨 Print</Button>
                <Button onClick={regenerateAllTokens} variant="light" size="sm">↻ Regenerate</Button>
              </div>
            </div>
          </Card>

          {(() => {
            const batchesForEvent = (allBatches || []).filter((b) => b.event_id === event?.id);
            if (batchesForEvent.length === 0) {
              return <Card style={{ textAlign: "center", color: COLORS.textGray, padding: 32, fontStyle: "italic" }}>No batch tokens yet. Tokens are generated automatically as athletes register.</Card>;
            }
            // Group: event_name -> tier -> batch_number -> [rows sorted by position]
            const tree = {};
            for (const b of batchesForEvent) {
              const g = b.gender_category || "Mixed";
              if (!tree[b.event_name]) tree[b.event_name] = {};
              if (!tree[b.event_name][b.tier]) tree[b.event_name][b.tier] = {};
              if (!tree[b.event_name][b.tier][g]) tree[b.event_name][b.tier][g] = {};
              if (!tree[b.event_name][b.tier][g][b.batch_number]) tree[b.event_name][b.tier][g][b.batch_number] = [];
              tree[b.event_name][b.tier][g][b.batch_number].push(b);
            }
            return EVENTS.map((evName) => {
              const tierGroups = tree[evName];
              if (!tierGroups) return null;
              return (
                <div key={evName} style={{ marginBottom: 28, pageBreakInside: "avoid" }}>
                  <div style={{ background: COLORS.charcoal, color: COLORS.cream, padding: "10px 16px", borderRadius: 6, marginBottom: 10, fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
                    {evName.toUpperCase()}
                  </div>
                  {Object.keys(TIERS).map((tier) => {
                    const genderGroups = tierGroups[tier];
                    if (!genderGroups) return null;
                    return (
                      <div key={tier} style={{ marginBottom: 16, paddingLeft: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TIERS[tier].color, marginBottom: 6, letterSpacing: 0.5 }}>{tier} Tier</div>
                        {GENDER_CATEGORIES.map((gender) => {
                          const batches = genderGroups[gender];
                          if (!batches) return null;
                          return (
                            <div key={gender} style={{ marginBottom: 12, paddingLeft: 6 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: GENDER_COLORS[gender], marginBottom: 4, letterSpacing: 1 }}>
                                ◆ {gender.toUpperCase()} ◆
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                                {Object.keys(batches).sort((a, b) => Number(a) - Number(b)).map((bn) => {
                                  const rows = batches[bn].sort((a, b) => a.position - b.position);
                                  return (
                                    <Card key={bn} style={{ padding: 12, borderTop: `3px solid ${GENDER_COLORS[gender]}` }}>
                                      <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>BATCH {bn}</div>
                                      {rows.map((r) => (
                                        <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 12, borderBottom: `1px dashed ${COLORS.borderLight}` }}>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600 }}>{r.position}. {r.name}</div>
                                            <div style={{ fontSize: 10, color: COLORS.textGray }}>{formatPhone(r.phone)}</div>
                                          </div>
                                          <div style={{ fontFamily: "monospace", fontSize: 11, color: COLORS.primary, fontWeight: 700 }}>{r.token}</div>
                                        </div>
                                      ))}
                                      {Array.from({ length: BATCH_SIZE - rows.length }).map((_, i) => (
                                        <div key={`empty-${i}`} style={{ padding: "5px 0", fontSize: 11, color: COLORS.textGray, fontStyle: "italic", borderBottom: `1px dashed ${COLORS.borderLight}` }}>
                                          {rows.length + i + 1}. (empty slot)
                                        </div>
                                      ))}
                                    </Card>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      {tab === "results" && (
        <div>
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${COLORS.gold}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📊 Excel Workflow (Recommended)</div>
            <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 14, lineHeight: 1.6 }}>
              <strong>Saturday night:</strong> Download the template — pre-filled with every athlete's name, token, and batch.<br/>
              <strong>Sunday at venue:</strong> Print or open on tablet. Fill in positions (1-5) and Y for personal bests.<br/>
              <strong>After event:</strong> Upload the filled .xlsx — platform calculates all points & updates leaderboard.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Button onClick={downloadResultsTemplate} variant="dark">⬇ Download Template</Button>
              <label style={{ display: "inline-block" }}>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleResultsExcelUpload(f);
                    e.target.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <span style={{
                  display: "inline-block", padding: "10px 20px",
                  background: COLORS.primary, color: COLORS.cream,
                  borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", border: "none",
                }}>⬆ Upload Filled Excel</span>
              </label>
            </div>
            {csvStatus && (
              <div style={{ marginTop: 4, padding: "10px 12px", borderRadius: 6, fontSize: 13, background: csvStatus.startsWith("✓") ? "#D6F0DC" : "#FDE8E8", color: csvStatus.startsWith("✓") ? "#1F7A3A" : COLORS.primary }}>{csvStatus}</div>
            )}
          </Card>

          <details style={{ marginBottom: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: COLORS.textGray, padding: 8 }}>
              ▸ Power user: paste CSV instead
            </summary>
            <Card style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 12, lineHeight: 1.6 }}>
                Paste CSV with columns: <span style={{ fontFamily: "monospace", background: COLORS.creamLight, padding: "1px 6px", borderRadius: 3 }}>phone,event,position,value,isPB</span>
              </div>
              <div style={{ background: COLORS.creamLight, padding: 12, borderRadius: 6, fontSize: 12, fontFamily: "monospace", marginBottom: 12, whiteSpace: "pre-wrap" }}>
{`phone,event,position,value,isPB
9876543210,Push-ups,1,52,true
9876543210,Squats,2,68,false`}
              </div>
              <textarea value={csvInput} onChange={(e) => setCsvInput(e.target.value)} placeholder="Paste CSV here..."
                style={{ width: "100%", minHeight: 140, padding: 12, fontSize: 13, fontFamily: "monospace", border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button onClick={importResults} variant="primary">Import CSV</Button>
                <Button onClick={() => { setCsvInput(""); setCsvStatus(""); }} variant="light">Clear</Button>
              </div>
            </Card>
          </details>
        </div>
      )}

      {tab === "event" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Current Event Configuration</div>
          <Input label="Event Date (display text)" value={eventDate} onChange={setEventDate} placeholder="e.g., Sunday, May 18, 2026" helpText="What athletes see on homepage. Free text — write it however you want it to appear." />
          <Input label="Venue" value={eventVenue} onChange={setEventVenue} placeholder="e.g., Central Park, Jaipur" />

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Registration Deadline <span style={{ color: COLORS.primary }}>*</span>
            </label>
            <input type="datetime-local" value={eventDeadlineLocal} onChange={(e) => setEventDeadlineLocal(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box", fontFamily: "inherit" }} />
            <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 6, lineHeight: 1.5 }}>
              Platform will auto-refuse registrations after this exact moment. Leave empty if you want no auto-close (manual only).
            </div>
            {(() => {
              if (!eventDeadlineLocal) return null;
              const d = new Date(eventDeadlineLocal);
              if (isNaN(d.getTime())) return null;
              const previewEvent = { ...event, registration_deadline_at: d.toISOString(), status: eventStatus };
              const info = getDeadlineInfo(previewEvent);
              if (!info) return null;
              const stillOpen = isRegistrationOpen(previewEvent);
              return (
                <div style={{ marginTop: 10, padding: "10px 12px", background: info.past ? "#FDE8E8" : (info.urgent ? "#FFF4D4" : COLORS.creamLight), borderRadius: 6, fontSize: 12, color: COLORS.charcoal, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>
                    {info.past ? "⛔ Already passed" : stillOpen ? "✓ Will auto-close in:" : "⛔ Status is not 'open' — registration is closed regardless"}
                  </div>
                  {!info.past && <div style={{ fontFamily: "monospace", color: info.urgent ? "#7B5500" : COLORS.charcoal }}>{info.label}</div>}
                  <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 4 }}>
                    Closes: {d.toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Status</label>
            <select value={eventStatus} onChange={(e) => setEventStatus(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box", fontFamily: "inherit" }}>
              <option value="open">Open for registration</option>
              <option value="closed">Closed (registrations locked)</option>
              <option value="results">Results published</option>
            </select>
            <div style={{ fontSize: 11, color: COLORS.textGray, marginTop: 6, lineHeight: 1.5 }}>
              Manual override. If status is "open" AND deadline is in the future → registration is open. Either condition failing closes registration.
            </div>
          </div>

          <Input label="UPI ID" value={newUpi} onChange={setNewUpi} placeholder="e.g., rann.league@upi" />
          <Button onClick={saveEventConfig} variant="primary">Save</Button>
        </Card>
      )}

      {tab === "danger" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: COLORS.primary }}>Event Lifecycle</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={closeEvent} variant="dark" size="sm">Close Current Event</Button>
            <Button onClick={startNewEvent} variant="gold" size="sm">Start New Event</Button>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textGray, marginTop: 12, lineHeight: 1.6 }}>
            Closing prevents new registrations. Starting a new event auto-increments the ID and opens registrations.
          </div>
        </Card>
      )}
    </div>
  );
};

// ============================================================
// ADMIN LOGIN GATE
// ============================================================
const AdminLogin = ({ onLogin, onCancel }) => {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("config").select("value").eq("key", "admin_passcode").single();
      setIsFirstTime(!data);
    })();
  }, []);

  const submit = async () => {
    if (!pass.trim()) { setError("Enter a passcode"); return; }
    if (isFirstTime) {
      await supabase.from("config").upsert({ key: "admin_passcode", value: pass.trim() });
      onLogin();
      return;
    }
    const { data } = await supabase.from("config").select("value").eq("key", "admin_passcode").single();
    if (data?.value === pass.trim()) onLogin();
    else setError("Wrong passcode");
  };

  return (
    <div style={{ maxWidth: 400, margin: "60px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}><RannLogo size="sm" /></div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Cinzel', serif", marginBottom: 6 }}>{isFirstTime ? "Set Admin Passcode" : "Admin Access"}</div>
        <div style={{ fontSize: 13, color: COLORS.textGray, marginBottom: 16 }}>
          {isFirstTime ? "First time? Choose a passcode. You'll need it to manage the platform." : "Enter the admin passcode."}
        </div>
        <Input value={pass} onChange={(v) => { setPass(v); setError(""); }} type="password" placeholder="Passcode" />
        {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onCancel} variant="light">Cancel</Button>
          <Button onClick={submit} variant="primary" style={{ flex: 1 }}>{isFirstTime ? "Set Passcode" : "Log In"}</Button>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// IN-APP BROWSER DETECTION
// Catches WhatsApp / Instagram / Facebook / LinkedIn webviews on iOS
// where modern React apps frequently fail to render properly.
// Shows a friendly "Open in Safari" prompt with a bypass button.
// ============================================================
const detectInAppBrowser = () => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  const ua = navigator.userAgent || "";
  // Honor force flags via URL
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("nogate") === "1") return null;            // skip gate entirely
    if (params.get("forcegate") === "1") return "Forced (debug)"; // show gate even on Safari
  } catch (e) {}

  // Only catch CONFIRMED in-app browsers via explicit signatures.
  // We default to LETTING USERS THROUGH if we're not sure — better to risk a slightly
  // broken WhatsApp experience than to wrongly gate a legitimate browser.
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Twitter|TwitterAndroid|X\/| Line\/|TelegramiOS/i.test(ua)) return "another app";
  // WhatsApp iOS UA pattern (specific): contains "Mobile/" but lacks "Safari/" entirely
  // This is more permissive than before — only flags clear WhatsApp pattern.
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && /Mobile\//i.test(ua) && !/Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) {
    return "WhatsApp or another app's built-in browser";
  }
  return null; // default: allow through
};

const InAppBrowserGate = ({ children }) => {
  // Detect SYNCHRONOUSLY on first render — before children try to mount.
  // This prevents flicker and ensures the gate shows even if the underlying app crashes.
  const [detected] = useState(() => {
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("rann_bypass_inapp") === "1") {
        return null; // user already bypassed in this session
      }
    } catch (e) {}
    return detectInAppBrowser();
  });
  const [bypassed, setBypassed] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "unknown";

  const handleBypass = () => {
    try { sessionStorage.setItem("rann_bypass_inapp", "1"); } catch (e) {}
    setBypassed(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied! Now open Safari and paste it.");
    } catch (e) {
      alert("Couldn't auto-copy. Long-press the URL bar to copy it manually.");
    }
  };

  if (bypassed || !detected) return children;

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(135deg, #6B0000 0%, #8B0000 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, color: "#F5F1E8",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        maxWidth: 460, width: "100%",
        background: "#1A1A1A",
        borderRadius: 16,
        padding: "32px 24px",
        textAlign: "center",
        border: `2px solid #D4A017`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ marginBottom: 18 }}>
          <SwordsEmblem size={64} color="#D4A017" />
        </div>

        <div style={{ fontSize: 11, color: "#D4A017", letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>
          ◆ STEP INTO RANN ◆
        </div>
        <div style={{ fontSize: 24, fontFamily: "'Cinzel', serif", fontWeight: 700, marginBottom: 16, letterSpacing: 1 }}>
          One quick step
        </div>

        <div style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.92, marginBottom: 22 }}>
          You're viewing this inside <strong>{detected}</strong>, which doesn't fully support our platform.
          <br /><br />
          Please open in <strong style={{ color: "#D4A017" }}>Safari</strong> for the full experience.
        </div>

        <div style={{
          background: "rgba(212, 160, 23, 0.1)",
          border: `1px solid #D4A01740`,
          borderRadius: 8,
          padding: 16, marginBottom: 18,
          textAlign: "left",
        }}>
          <div style={{ fontSize: 12, color: "#D4A017", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>HOW TO OPEN IN SAFARI:</div>
          <div style={{ fontSize: 13, lineHeight: 1.8, opacity: 0.9 }}>
            <div>1. Tap the <strong>•••</strong> menu (usually bottom-right)</div>
            <div>2. Tap <strong>"Open in Safari"</strong> or <strong>"Open in External Browser"</strong></div>
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16, lineHeight: 1.5 }}>
          Or copy the link and paste it in Safari:
        </div>

        <button onClick={copyLink} style={{
          width: "100%", padding: "12px 20px",
          background: "#D4A017", color: "#1A1A1A",
          border: "none", borderRadius: 8,
          fontSize: 14, fontWeight: 700, letterSpacing: 1,
          cursor: "pointer", marginBottom: 10,
          fontFamily: "inherit",
        }}>
          📋 Copy Link
        </button>

        <button onClick={handleBypass} style={{
          width: "100%", padding: "10px 20px",
          background: "transparent", color: "#F5F1E8",
          border: `1px solid #F5F1E840`, borderRadius: 8,
          fontSize: 12, fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
          opacity: 0.7,
        }}>
          Continue Anyway →
        </button>

        <div style={{ fontSize: 10, opacity: 0.5, marginTop: 18, lineHeight: 1.5 }}>
          रण • Where warriors are made
        </div>

        {/* Debug toggle — tap to see browser info, helps diagnose issues */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(245,241,232,0.1)" }}>
          <div onClick={() => setShowDebug(!showDebug)} style={{ fontSize: 9, opacity: 0.4, cursor: "pointer", letterSpacing: 1 }}>
            {showDebug ? "▼ HIDE DEBUG" : "▸ DEBUG INFO"}
          </div>
          {showDebug && (
            <div style={{ marginTop: 8, padding: 10, background: "rgba(0,0,0,0.4)", borderRadius: 4, textAlign: "left", fontSize: 9, lineHeight: 1.4, fontFamily: "monospace", color: "#D4A017", wordBreak: "break-all" }}>
              <div><strong>Detected:</strong> {detected}</div>
              <div style={{ marginTop: 4 }}><strong>UA:</strong> {ua}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// ROOT APP
// ============================================================
export default function App() {
  const [view, setViewRaw] = useState("home");
  const [event, setEvent] = useState(null);
  const [upiId, setUpiId] = useState("rann.league@upi");
  const [athlete, setAthlete] = useState(null);

  // Navigation wrapper: tracks view changes in browser history so back button works.
  const setView = (newView) => {
    if (typeof window !== "undefined" && newView !== view) {
      try {
        window.history.pushState({ view: newView }, "", `#${newView}`);
      } catch (e) {}
    }
    setViewRaw(newView);
  };

  // Listen for browser back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPopState = (e) => {
      const v = e.state?.view || (window.location.hash.replace("#", "") || "home");
      setViewRaw(v);
    };
    window.addEventListener("popstate", onPopState);
    // Initialize hash on first load
    try {
      const initial = window.location.hash.replace("#", "");
      if (initial && initial !== "home") setViewRaw(initial);
      window.history.replaceState({ view: view }, "", window.location.hash || "#home");
    } catch (e) {}
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Force light color scheme and proper viewport at the document level
  // (some iOS in-app browsers ignore or misinterpret CSS-only directives)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ensureMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    ensureMeta("color-scheme", "light");
    ensureMeta("theme-color", "#1A1A1A");
    ensureMeta("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0");
  }, []);
  const [allAthletes, setAllAthletes] = useState([]);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [eventResults, setEventResults] = useState([]);
  const [eventRecords, setEventRecords] = useState([]);
  const [lastRegistration, setLastRegistration] = useState(null);
  const [lastWaitlistEntries, setLastWaitlistEntries] = useState([]);
  const [allWaitlist, setAllWaitlist] = useState([]);
  const [allBatches, setAllBatches] = useState([]);
  const [lastBatchTokens, setLastBatchTokens] = useState([]);
  const [slotCounts, setSlotCounts] = useState({});
  const [isAdminAuthed, setIsAdminAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Admin link visibility — only shows if URL has ?admin=1 OR user has tapped logo 5 times.
  // Athletes never see "Admin" in the nav. Access via bookmarked secret URL.
  const [adminRevealed, setAdminRevealed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("admin") === "1") return true;
      if (sessionStorage.getItem("rann_admin_revealed") === "1") return true;
    } catch (e) {}
    return false;
  });
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [logoTapResetTimer, setLogoTapResetTimer] = useState(null);
  const handleLogoTap = () => {
    const next = logoTapCount + 1;
    if (next >= 5) {
      setAdminRevealed(true);
      try { sessionStorage.setItem("rann_admin_revealed", "1"); } catch (e) {}
      setLogoTapCount(0);
      if (logoTapResetTimer) clearTimeout(logoTapResetTimer);
    } else {
      setLogoTapCount(next);
      if (logoTapResetTimer) clearTimeout(logoTapResetTimer);
      const t = setTimeout(() => setLogoTapCount(0), 2000);
      setLogoTapResetTimer(t);
    }
  };

  const computeSlotCounts = useCallback((regs, waitlist, eventId) => {
    const counts = {};
    for (const r of (regs || [])) {
      if (r.event_id !== eventId) continue;
      for (const evName of (r.events_selected || [])) {
        const tier = r.tiers?.[evName];
        if (!tier) continue;
        const k = slotKey(evName, tier);
        if (!counts[k]) counts[k] = { registered: 0, waitlisted: 0 };
        counts[k].registered += 1;
      }
    }
    for (const w of (waitlist || [])) {
      if (w.event_id !== eventId || w.promoted) continue;
      const k = slotKey(w.event_name, w.tier);
      if (!counts[k]) counts[k] = { registered: 0, waitlisted: 0 };
      counts[k].waitlisted += 1;
    }
    return counts;
  }, []);

  const refreshData = useCallback(async () => {
    if (!supabaseEnabled) { setLoaded(true); return; }
    try {
      const [{ data: events }, { data: cfg }, { data: athletes }, { data: regs }, { data: results }, { data: records }, { data: waitlist }, { data: batches }] = await Promise.all([
        supabase.from("events").select("*").eq("is_current", true).order("created_at", { ascending: false }).limit(1),
        supabase.from("config").select("*").eq("key", "upi_id").single(),
        supabase.from("athletes").select("*"),
        supabase.from("registrations").select("*"),
        supabase.from("event_results").select("*"),
        supabase.from("event_records").select("*"),
        supabase.from("waitlist").select("*"),
        supabase.from("batch_assignments").select("*"),
      ]);
      const cur = events?.[0] || null;
      setEvent(cur);
      if (cfg?.value) setUpiId(cfg.value);
      setAllAthletes(athletes || []);
      setAllRegistrations(regs || []);
      setAllResults(results || []);
      setEventRecords(records || []);
      setAllWaitlist(waitlist || []);
      setAllBatches(batches || []);
      if (cur) setSlotCounts(computeSlotCounts(regs, waitlist, cur.id));

      const sessionPhone = localStorage.getItem("rann_session_phone");
      if (sessionPhone) {
        const a = (athletes || []).find((x) => x.phone === sessionPhone);
        if (a) {
          setAthlete(a);
          setEventResults((results || []).filter((r) => r.phone === sessionPhone).sort((x, y) => (y.recorded_at || "").localeCompare(x.recorded_at || "")));
        }
      }
    } catch (e) {
      console.error("refresh failed", e);
    }
    setLoaded(true);
  }, [computeSlotCounts]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleLogin = (a) => { setAthlete(a); setView("dashboard"); refreshData(); };
  const handleLogout = () => { localStorage.removeItem("rann_session_phone"); setAthlete(null); setEventResults([]); setView("home"); };
  const handleRegistrationComplete = (a, reg, waitlistEntries = [], batchTokens = []) => {
    setAthlete(a); setLastRegistration(reg); setLastWaitlistEntries(waitlistEntries || []); setLastBatchTokens(batchTokens || []);
    setView("success"); setTimeout(() => refreshData(), 100);
  };

  const myCurrentRegistration = useMemo(() => {
    if (!athlete || !event) return null;
    return allRegistrations.find((r) => r.phone === athlete.phone && r.event_id === event.id);
  }, [athlete, allRegistrations, event]);

  const leaderboardPreview = useMemo(() => [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5), [allAthletes]);

  if (!supabaseEnabled) return <SetupRequired />;
  if (!loaded) return (
    <InAppBrowserGate>
      <div style={{
        background: COLORS.creamLight,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        color: COLORS.charcoal,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <SwordsEmblem size={56} color={COLORS.gold} />
        <div style={{ marginTop: 18, fontSize: 11, color: COLORS.gold, letterSpacing: 3, fontWeight: 700 }}>◆ RANN ◆</div>
        <div style={{ marginTop: 6, fontSize: 14, color: COLORS.charcoal, fontFamily: "'Cinzel', serif", letterSpacing: 1 }}>Loading the arena...</div>
        <div style={{ marginTop: 18, fontSize: 11, color: COLORS.textGray, maxWidth: 280, lineHeight: 1.5 }}>
          Taking too long? Try opening{" "}
          <a href="https://rann-platform.vercel.app" style={{ color: COLORS.primary, fontWeight: 600 }}>rann-platform.vercel.app</a>{" "}
          in Safari or Chrome directly.
        </div>
      </div>
    </InAppBrowserGate>
  );

  return (
    <InAppBrowserGate>
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      background: `${COLORS.creamLight}`,
      backgroundImage: `radial-gradient(circle, ${COLORS.gold}08 1px, transparent 1px), radial-gradient(circle, ${COLORS.primary}05 1px, transparent 1px)`,
      backgroundSize: "30px 30px, 60px 60px",
      backgroundPosition: "0 0, 15px 15px",
      minHeight: "100vh",
      color: COLORS.charcoal,
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Noto+Serif+Devanagari:wght@600;700&display=swap');
        :root { color-scheme: light; }
        html, body { overflow-x: hidden; margin: 0; padding: 0; background: ${COLORS.creamLight}; color: ${COLORS.charcoal}; }
        body { width: 100%; }
        * { box-sizing: border-box; }
        img, video, iframe { max-width: 100%; height: auto; }
        button:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        button:active:not(:disabled) { transform: scale(0.98) translateY(0); }
        button { transition: all 0.18s ease; }
        input:not([type="checkbox"]):not([type="radio"]), textarea, select { -webkit-appearance: none; -webkit-user-select: text; user-select: text; touch-action: manipulation; color: ${COLORS.charcoal}; -webkit-text-fill-color: ${COLORS.charcoal}; background-color: #FAFAF7; color-scheme: light; }
        input[type="checkbox"], input[type="radio"] { width: 20px; height: 20px; cursor: pointer; accent-color: ${COLORS.gold}; flex-shrink: 0; }
        input::placeholder, textarea::placeholder { color: #999999; opacity: 1; -webkit-text-fill-color: #999999; }
        input:focus, select:focus, textarea:focus { outline: 2px solid ${COLORS.gold}; outline-offset: 1px; border-color: ${COLORS.gold}; }
        @media (max-width: 600px) {
          .rann-event-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
          .rann-tier-grid { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
        }
        @media (max-width: 480px) {
          .rann-belt-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 900px) {
          .rann-event-grid { grid-template-columns: repeat(4, 1fr) !important; }
          .rann-tier-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>

      {/* Top nav - dramatic brand bar */}
      <div style={{
        background: `linear-gradient(180deg, #FFFFFF 0%, ${COLORS.creamLight} 100%)`,
        borderBottom: `2px solid ${COLORS.gold}`,
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
        position: "relative",
      }}>
        <div onClick={() => setView("home")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <SwordsEmblem size={32} color={COLORS.primary} />
          <div onClick={handleLogoTap} style={{ display: "flex", alignItems: "baseline", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <div style={{ fontSize: 14, color: COLORS.primary, fontFamily: "'Noto Serif Devanagari', serif", fontWeight: 700 }}>रण</div>
            <div style={{ fontSize: 22, fontFamily: "'Cinzel', serif", fontWeight: 700, letterSpacing: 4, color: COLORS.charcoal }}>RANN</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {(() => {
            const navBtn = (label, targetView, onClick, isActive) => (
              <button onClick={onClick} style={{
                background: "transparent",
                color: isActive ? COLORS.primary : COLORS.charcoal,
                border: "none",
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.5,
                cursor: "pointer",
                fontFamily: "inherit",
                position: "relative",
                borderRadius: 4,
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(139, 0, 0, 0.06)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                {label}
                {isActive && <div style={{ position: "absolute", bottom: -2, left: "20%", right: "20%", height: 2, background: COLORS.gold, borderRadius: 1 }} />}
              </button>
            );
            return (
              <>
                {navBtn("Home", "home", () => setView("home"), view === "home")}
                {navBtn("Leaderboard", "leaderboard", () => setView("leaderboard"), view === "leaderboard")}
                {athlete ? (
                  <>
                    {navBtn("My Profile", "dashboard", () => setView("dashboard"), view === "dashboard")}
                    <button onClick={handleLogout} style={{
                      background: "transparent", color: COLORS.textGray, border: `1px solid ${COLORS.borderLight}`,
                      padding: "7px 14px", fontSize: 12, fontWeight: 500, letterSpacing: 0.5,
                      cursor: "pointer", fontFamily: "inherit", borderRadius: 5, marginLeft: 8,
                    }}>Logout</button>
                  </>
                ) : (
                  <>
                    {navBtn("Login", "login", () => setView("login"), view === "login")}
                    <button onClick={() => setView("register")} style={{
                      background: COLORS.gold, color: COLORS.charcoal, border: "none",
                      padding: "8px 18px", fontSize: 13, fontWeight: 700, letterSpacing: 0.8,
                      cursor: "pointer", fontFamily: "inherit", borderRadius: 5, marginLeft: 8,
                      boxShadow: "0 2px 6px rgba(212, 160, 23, 0.25)",
                      transition: "all 0.18s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 10px rgba(212, 160, 23, 0.35)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 6px rgba(212, 160, 23, 0.25)"; }}>
                      Register
                    </button>
                  </>
                )}
                {adminRevealed && (
                  <button onClick={() => setView(isAdminAuthed ? "admin" : "admin-login")} style={{
                    background: COLORS.charcoal, color: COLORS.cream, border: "none",
                    padding: "7px 12px", fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
                    cursor: "pointer", fontFamily: "inherit", borderRadius: 5, marginLeft: 6,
                  }}>Admin</button>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 14px 60px" }}>
        {view === "home" && <HomePage event={event} athlete={athlete} onNav={setView} leaderboardPreview={leaderboardPreview} />}
        {view === "register" && <RegisterPage event={event} upiId={upiId} onComplete={handleRegistrationComplete} onNav={setView} athlete={athlete} slotCounts={slotCounts} allBatches={allBatches} />}
        {view === "login" && <LoginPage onLogin={handleLogin} onNav={setView} />}
        {view === "forgot-pin" && <ForgotPinPage onLogin={handleLogin} onNav={setView} />}
        {view === "success" && <SuccessPage athlete={athlete} registration={lastRegistration} waitlistEntries={lastWaitlistEntries} batchTokens={lastBatchTokens} onNav={setView} upiId={upiId} />}
        {view === "dashboard" && athlete && <DashboardPage athlete={athlete} currentRegistration={myCurrentRegistration} eventResults={eventResults} onNav={setView} allAthletes={allAthletes} myBatchTokens={(allBatches || []).filter((b) => b.phone === athlete.phone && b.event_id === event?.id)} myWaitlist={(allWaitlist || []).filter((w) => w.phone === athlete.phone && w.event_id === event?.id && !w.promoted)} />}
        {view === "leaderboard" && <LeaderboardPage allAthletes={allAthletes} eventRecords={eventRecords} onNav={setView} currentAthletePhone={athlete?.phone} />}
        {view === "admin-login" && <AdminLogin onLogin={() => { setIsAdminAuthed(true); setView("admin"); }} onCancel={() => setView("home")} />}
        {view === "admin" && isAdminAuthed && <AdminPanel onLogout={() => { setIsAdminAuthed(false); setView("home"); }} refreshData={refreshData} allAthletes={allAthletes} allRegistrations={allRegistrations} allResults={allResults} event={event} upiId={upiId} slotCounts={slotCounts} allWaitlist={allWaitlist} allBatches={allBatches} />}
      </div>

      <div style={{
        borderTop: `2px solid ${COLORS.gold}`,
        background: COLORS.charcoal,
        color: COLORS.cream,
        padding: "32px 20px",
        textAlign: "center",
      }}>
        <div style={{ marginBottom: 12 }}>
          <SwordsEmblem size={36} color={COLORS.gold} />
        </div>
        <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, letterSpacing: 4, fontSize: 18, color: COLORS.cream, marginBottom: 6 }}>RANN</div>
        <div style={{ marginBottom: 8 }}>
          <OrnamentDivider color={COLORS.gold} width={120} />
        </div>
        <div style={{ fontStyle: "italic", fontSize: 13, opacity: 0.85 }}>Step into the Arena · Jaipur</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
          <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", background: "#128C7E", color: "#FFFFFF",
            borderRadius: 5, fontSize: 11, fontWeight: 700, textDecoration: "none",
          }}>
            <span style={{ fontSize: 13 }}>💬</span> WhatsApp
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px",
            background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
            color: "#FFFFFF",
            borderRadius: 5, fontSize: 11, fontWeight: 700, textDecoration: "none",
          }}>
            <span style={{ fontSize: 13 }}>📷</span> @rann.league
          </a>
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 12 }}>रण में उतरो।</div>
      </div>
    </div>
    </InAppBrowserGate>
  );
}
