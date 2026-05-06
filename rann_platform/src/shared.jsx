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
