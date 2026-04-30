import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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

// ============================================================
// SHARED UI COMPONENTS
// ============================================================
const RannLogo = ({ size = "md", inverted = false }) => {
  const sizes = {
    sm: { rann: 28, dev: 14, sub: 9 },
    md: { rann: 44, dev: 20, sub: 11 },
    lg: { rann: 72, dev: 32, sub: 14 },
    xl: { rann: 110, dev: 48, sub: 18 },
  };
  const s = sizes[size];
  const mainColor = inverted ? COLORS.cream : COLORS.charcoal;
  const accentColor = inverted ? COLORS.gold : COLORS.primary;
  return (
    <div style={{ textAlign: "center", lineHeight: 1 }}>
      <div style={{ fontSize: s.dev, color: accentColor, fontWeight: 700, fontFamily: "'Noto Serif Devanagari', serif", marginBottom: 2 }}>रण</div>
      <div style={{ fontSize: s.rann, fontFamily: "'Cinzel', 'Times New Roman', serif", fontWeight: 600, letterSpacing: s.rann * 0.04, color: mainColor }}>RANN</div>
      {size !== "sm" && (
        <div style={{ fontSize: s.sub, color: accentColor, letterSpacing: 2, marginTop: 6, fontWeight: 500 }}>STEP INTO THE ARENA</div>
      )}
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

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#FFFFFF", borderRadius: 10, border: `1px solid ${COLORS.borderLight}`, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>
    {children}
  </div>
);

const Input = ({ label, value, onChange, placeholder, type = "text", required = false, helpText = "" }) => (
  <div style={{ marginBottom: 16 }}>
    {label && (
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: COLORS.charcoal, marginBottom: 6, letterSpacing: 0.5 }}>
        {label} {required && <span style={{ color: COLORS.primary }}>*</span>}
      </label>
    )}
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, fontFamily: "inherit", background: "#FAFAF7", boxSizing: "border-box" }} />
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

const SectionHeader = ({ title, subtitle, inline = false }) => (
  <div style={{ marginBottom: inline ? 0 : 16 }}>
    <div style={{ fontSize: 11, color: COLORS.gold, letterSpacing: 2, fontWeight: 700 }}>{subtitle?.toUpperCase()}</div>
    <div style={{ fontSize: 22, fontFamily: "'Cinzel', serif", fontWeight: 600, color: COLORS.charcoal, marginTop: 2 }}>{title}</div>
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
    <div style={{ background: `linear-gradient(180deg, ${COLORS.primaryLight} 0%, ${COLORS.primaryDark} 100%)`, padding: "60px 20px 50px", textAlign: "center", borderRadius: 12, marginBottom: 32 }}>
      <RannLogo size="xl" inverted />
      <div style={{ fontStyle: "italic", color: COLORS.cream, opacity: 0.9, marginTop: 16, fontSize: 14 }}>Where warriors are made</div>
    </div>

    {athlete ? (
      <Card style={{ marginBottom: 24, background: COLORS.creamLight, borderColor: COLORS.gold }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.textGray, letterSpacing: 1, fontWeight: 600 }}>WELCOME BACK</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.charcoal, marginTop: 2 }}>{athlete.name}</div>
            <div style={{ marginTop: 8 }}><BeltBadge points={athlete.total_points || 0} /></div>
          </div>
          <Button onClick={() => onNav("dashboard")} variant="primary">My Dashboard →</Button>
        </div>
      </Card>
    ) : (
      <Card style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 14, color: COLORS.textGray }}>Already a warrior?</div>
        <Button onClick={() => onNav("login")} variant="ghost" size="sm">Log in with phone →</Button>
      </Card>
    )}

    <Card style={{ marginBottom: 32, padding: 32, background: COLORS.charcoal, color: COLORS.cream, borderColor: COLORS.gold }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ color: COLORS.gold, fontSize: 12, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>NEXT EVENT · {event?.status?.toUpperCase() || "OPEN"}</div>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: 0.5, marginBottom: 10 }}>{event?.event_date || "Date TBA"}</div>
          <div style={{ fontSize: 14, marginBottom: 4, opacity: 0.9 }}>📍 {event?.venue || "TBA"}</div>
          <div style={{ fontSize: 14, opacity: 0.9 }}>⏰ {event?.start_time || "6:30 AM"} · Registration closes {event?.registration_deadline || "—"}</div>
        </div>
        <div>
          {event?.status === "open" ? (
            <Button onClick={() => onNav("register")} variant="gold" size="lg">Register Now →</Button>
          ) : (
            <div style={{ background: COLORS.primary, color: COLORS.cream, padding: "12px 22px", borderRadius: 6, fontWeight: 600, fontSize: 13 }}>
              Registration {event?.status === "closed" ? "Closed" : "Coming Soon"}
            </div>
          )}
        </div>
      </div>
    </Card>

    <div style={{ marginBottom: 32 }}>
      <SectionHeader title="The Four Events" subtitle="Each Sunday morning · 5-person batches" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { name: "Push-ups", spec: "60 sec · max reps" },
          { name: "Squats", spec: "90 sec · max reps" },
          { name: "Plank", spec: "Max hold time" },
          { name: "100m Sprint", spec: "Fastest wins" },
        ].map((e) => (
          <Card key={e.name} style={{ textAlign: "center", padding: 18, borderLeft: `3px solid ${COLORS.primary}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.primary, fontFamily: "'Cinzel', serif", letterSpacing: 1, marginBottom: 4 }}>{e.name.toUpperCase()}</div>
            <div style={{ fontSize: 12, color: COLORS.textGray, fontStyle: "italic" }}>{e.spec}</div>
          </Card>
        ))}
      </div>
    </div>

    <div style={{ marginBottom: 32 }}>
      <SectionHeader title="Choose Your Tier" subtitle="5 compete. Everyone wins something." />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: COLORS.charcoal, color: COLORS.cream }}>
              <th style={{ padding: 12, textAlign: "left", fontWeight: 600, letterSpacing: 1 }}>TIER</th>
              <th style={{ padding: 12, textAlign: "center", fontWeight: 600, letterSpacing: 1 }}>ENTRY</th>
              <th style={{ padding: 12, textAlign: "center", fontWeight: 600, letterSpacing: 1 }}>1ST PRIZE</th>
              <th style={{ padding: 12, textAlign: "center", fontWeight: 600, letterSpacing: 1 }}>2ND</th>
              <th style={{ padding: 12, textAlign: "center", fontWeight: 600, letterSpacing: 1 }}>3-5 EACH</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(TIERS).map(([name, t], i) => (
              <tr key={name} style={{ background: i % 2 === 0 ? COLORS.creamLight : "#FFFFFF" }}>
                <td style={{ padding: 12, fontWeight: 700, color: t.color }}>{name}</td>
                <td style={{ padding: 12, textAlign: "center" }}>₹{t.entry}</td>
                <td style={{ padding: 12, textAlign: "center", fontWeight: 700, color: COLORS.primary }}>₹{t.entry * 2}</td>
                <td style={{ padding: 12, textAlign: "center" }}>₹{t.entry}</td>
                <td style={{ padding: 12, textAlign: "center" }}>₹{Math.round(t.entry * 0.3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>

    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionHeader title="Top Warriors" subtitle="Live leaderboard" inline />
        <Button onClick={() => onNav("leaderboard")} variant="ghost" size="sm">View Full →</Button>
      </div>
      {leaderboardPreview && leaderboardPreview.length > 0 ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {leaderboardPreview.slice(0, 5).map((a, i) => (
            <div key={a.phone} style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, borderBottom: i < 4 ? `1px solid ${COLORS.borderLight}` : "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? COLORS.gold : COLORS.creamLight, color: COLORS.charcoal, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div></div>
              <BeltBadge points={a.total_points || 0} size="sm" />
              <div style={{ fontWeight: 700, color: COLORS.primary, fontSize: 14, minWidth: 60, textAlign: "right" }}>{a.total_points || 0} pts</div>
            </div>
          ))}
        </Card>
      ) : (
        <Card style={{ textAlign: "center", padding: 32, color: COLORS.textGray, fontStyle: "italic" }}>
          The leaderboard begins after Event #1. Be the first warrior on the wall.
        </Card>
      )}
    </div>
  </div>
);

// ============================================================
// LOGIN — phone OTP via Supabase
// ============================================================
const LoginPage = ({ onLogin, onNav }) => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!validatePhone(phone)) { setError("Please enter a valid 10-digit phone number"); return; }
    setLoading(true); setError(""); setInfo("");
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const { data: athlete, error: athleteError } = await supabase
        .from("athletes")
        .select("*")
        .eq("phone", cleanPhone)
        .single();

      if (athleteError || !athlete) {
        setError("No warrior found with this number. Register first to step into the Rann.");
        setLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: `+91${cleanPhone}`,
      });

      if (otpError) {
        if (otpError.message?.toLowerCase().includes("provider") || otpError.message?.toLowerCase().includes("not enabled")) {
          localStorage.setItem("rann_session_phone", cleanPhone);
          onLogin(athlete);
        } else {
          setError(otpError.message);
        }
        setLoading(false);
        return;
      }
      setInfo("OTP sent. Check your messages.");
      setStep(2);
    } catch (e) {
      setError("Something went wrong. Try again.");
    }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!otp || otp.length < 4) { setError("Enter the OTP you received"); return; }
    setLoading(true); setError("");
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        phone: `+91${cleanPhone}`, token: otp, type: "sms",
      });
      if (vErr) { setError("Wrong OTP. Try again."); setLoading(false); return; }
      const { data: athlete } = await supabase.from("athletes").select("*").eq("phone", cleanPhone).single();
      localStorage.setItem("rann_session_phone", cleanPhone);
      onLogin(athlete);
    } catch (e) { setError("Verification failed. Try again."); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}><RannLogo size="md" /></div>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.charcoal, marginBottom: 6, fontFamily: "'Cinzel', serif" }}>Welcome back, warrior</div>
        <div style={{ fontSize: 13, color: COLORS.textGray, marginBottom: 24 }}>{step === 1 ? "Enter your registered phone number." : `OTP sent to +91 ${phone.slice(0, 5)} ${phone.slice(5)}`}</div>

        {step === 1 ? (
          <Input label="Phone Number" value={phone} onChange={(v) => { setPhone(v); setError(""); }} placeholder="10-digit Indian mobile" type="tel" required />
        ) : (
          <Input label="6-digit OTP" value={otp} onChange={(v) => { setOtp(v); setError(""); }} placeholder="Enter OTP" type="tel" required />
        )}

        {info && <div style={{ background: "#D6F0DC", color: "#1F7A3A", padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{info}</div>}
        {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <Button onClick={step === 1 ? sendOtp : verifyOtp} variant="primary" size="lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Please wait..." : step === 1 ? "Send OTP" : "Verify & Log In"}
        </Button>
        {step === 2 && <Button onClick={() => { setStep(1); setOtp(""); setError(""); setInfo(""); }} variant="ghost" size="sm" style={{ width: "100%", marginTop: 10 }}>← Use a different number</Button>}

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: COLORS.textGray }}>
          New warrior? <span onClick={() => onNav("register")} style={{ color: COLORS.primary, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>Register here</span>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// REGISTRATION
// ============================================================
const RegisterPage = ({ event, upiId, onComplete, onNav, athlete }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(athlete?.name || "");
  const [phone, setPhone] = useState(athlete?.phone || "");
  const [email, setEmail] = useState(athlete?.email || "");
  const [age, setAge] = useState(athlete?.age || "");
  const [gender, setGender] = useState(athlete?.gender || "");
  const [emergencyName, setEmergencyName] = useState(athlete?.emergency_name || "");
  const [emergencyPhone, setEmergencyPhone] = useState(athlete?.emergency_phone || "");
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [tiers, setTiers] = useState({});
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
    } else {
      setSelectedEvents([...selectedEvents, e]);
      setTiers({ ...tiers, [e]: "Bronze" });
    }
  };

  const validateStep1 = () => {
    if (!name.trim()) return "Name is required";
    if (!validatePhone(phone)) return "Valid 10-digit phone required";
    if (!age || parseInt(age) < 16) return "Must be 16 or older";
    if (!gender) return "Please select gender";
    if (!emergencyName.trim() || !validatePhone(emergencyPhone)) return "Emergency contact required";
    return null;
  };

  const validateStep2 = () => {
    if (selectedEvents.length === 0) return "Select at least one event";
    for (const e of selectedEvents) if (!tiers[e]) return `Choose tier for ${e}`;
    return null;
  };

  const submit = async () => {
    if (!paymentNote.trim()) { setError("Payment reference is required. Please pay first, then enter the UTR/transaction ID from your UPI app."); return; }
    if (!waiverAccepted || !medicalOk) { setError("You must accept the waiver and medical declaration"); return; }
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
      const { error: aErr } = await supabase.from("athletes").upsert(athleteRecord, { onConflict: "phone" });
      if (aErr) throw aErr;

      const registration = {
        event_id: event.id, phone: cleanPhone, name: name.trim(),
        events_selected: selectedEvents, tiers, is_all_rounder: isAllRounder,
        total_cost: totalCost, payment_note: paymentNote.trim() || null,
        payment_status: "pending",
      };
      const { error: rErr } = await supabase.from("registrations").upsert(registration, { onConflict: "event_id,phone" });
      if (rErr) throw rErr;

      localStorage.setItem("rann_session_phone", cleanPhone);
      onComplete(athleteRecord, registration);
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
            {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <Button onClick={() => { const e = validateStep1(); if (e) setError(e); else { setError(""); setStep(2); } }} variant="primary" size="lg" style={{ width: "100%" }}>Next: Choose Events →</Button>
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
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Choose tier for each event</div>
                {selectedEvents.map((e) => (
                  <div key={e} style={{ marginBottom: 12, padding: 12, background: COLORS.creamLight, borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{e}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(TIERS).map(([n, t]) => (
                        <div key={n} onClick={() => setTiers({ ...tiers, [e]: n })} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: tiers[e] === n ? t.color : "#FFFFFF", color: tiers[e] === n ? "#FFFFFF" : t.color, border: `1px solid ${t.color}` }}>{n} · ₹{t.entry}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isAllRounder && (
              <div style={{ background: COLORS.gold, color: COLORS.charcoal, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>🏆 All-Rounder bonus: 1.5× points multiplier on the day's total</div>
            )}

            <div style={{ background: COLORS.charcoal, color: COLORS.cream, padding: 16, borderRadius: 8, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Total entry fee</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.gold }}>₹{totalCost}</div>
            </div>

            {error && <div style={{ background: "#FDE8E8", color: COLORS.primary, padding: "10px 12px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => setStep(1)} variant="light">← Back</Button>
              <Button onClick={() => { const e = validateStep2(); if (e) setError(e); else { setError(""); setStep(3); } }} variant="primary" style={{ flex: 1 }}>Next: Payment →</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ background: COLORS.creamLight, padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: COLORS.gold, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>PAY VIA UPI</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: COLORS.charcoal, marginBottom: 12 }}>{upiId}</div>
              <div style={{ background: "#FFFFFF", padding: 12, borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}>
                Amount: <span style={{ color: COLORS.primary, fontWeight: 700 }}>₹{totalCost}</span>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textGray, marginTop: 10, lineHeight: 1.5 }}>
                Send ₹{totalCost} via any UPI app · Enter your name in the note field. We'll verify and confirm via WhatsApp within 24 hours.
              </div>
            </div>

            <Input label="Payment reference / UPI transaction ID" value={paymentNote} onChange={setPaymentNote} placeholder="Last 6 digits of UTR or transaction ID" required helpText="Required. After paying, find this in your UPI app's transaction history." />

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
              <Button onClick={submit} variant="primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Registering..." : "Step into the Rann →"}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

// ============================================================
// SUCCESS PAGE
// ============================================================
const SuccessPage = ({ registration, onNav, upiId }) => (
  <div style={{ maxWidth: 500, margin: "40px auto", textAlign: "center" }}>
    <div style={{ fontSize: 64, marginBottom: 8 }}>⚔️</div>
    <div style={{ fontSize: 14, color: COLORS.gold, letterSpacing: 3, fontWeight: 700, marginBottom: 6 }}>YOU'RE IN</div>
    <div style={{ fontSize: 32, fontFamily: "'Cinzel', serif", fontWeight: 600, marginBottom: 16, color: COLORS.charcoal }}>Step into the Rann</div>
    <Card style={{ textAlign: "left", marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: COLORS.textGray, marginBottom: 8 }}>Your registration:</div>
      <div style={{ marginBottom: 12 }}>
        {registration?.events_selected?.map((e) => (
          <div key={e} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderBottom: `1px dashed ${COLORS.borderLight}` }}>
            <span>{e}</span>
            <span style={{ fontWeight: 600 }}>{registration.tiers[e]} · ₹{TIERS[registration.tiers[e]]?.entry}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, fontWeight: 700 }}>
        <span>Total to pay</span><span style={{ color: COLORS.primary }}>₹{registration?.total_cost}</span>
      </div>
    </Card>
    <Card style={{ background: COLORS.creamLight, textAlign: "left", marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Next steps:</div>
      <ol style={{ fontSize: 13, lineHeight: 1.8, marginLeft: 20, padding: 0 }}>
        <li>Pay <strong>₹{registration?.total_cost}</strong> to <strong style={{ fontFamily: "monospace" }}>{upiId}</strong> via any UPI app</li>
        <li>You'll get a WhatsApp confirmation within 24 hours</li>
        <li>Show up Sunday morning. 6:15 AM. Bring ID, water, workout clothes.</li>
      </ol>
    </Card>
    <Button onClick={() => onNav("dashboard")} variant="primary" size="lg" style={{ width: "100%" }}>Go to my dashboard →</Button>
  </div>
);

// ============================================================
// DASHBOARD
// ============================================================
const DashboardPage = ({ athlete, currentRegistration, eventResults, onNav, allAthletes }) => {
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
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Cinzel', serif", marginBottom: 8 }}>{athlete.name}</div>
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

      {currentRegistration && (
        <>
          <SectionHeader title="Upcoming Event" subtitle="You're registered" />
          <Card style={{ marginBottom: 24, borderLeft: `4px solid ${COLORS.gold}` }}>
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
                      <td style={{ padding: 12, fontSize: 14 }}>{a.name} {isMe && <span style={{ fontSize: 11, color: COLORS.primary, marginLeft: 6 }}>(YOU)</span>}</td>
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
const AdminPanel = ({ onLogout, refreshData, allAthletes, allRegistrations, event, upiId, allResults }) => {
  const [tab, setTab] = useState("registrations");
  const [csvInput, setCsvInput] = useState("");
  const [csvStatus, setCsvStatus] = useState("");
  const [eventDate, setEventDate] = useState(event?.event_date || "");
  const [eventVenue, setEventVenue] = useState(event?.venue || "");
  const [eventStatus, setEventStatus] = useState(event?.status || "open");
  const [newUpi, setNewUpi] = useState(upiId);
  const [exporting, setExporting] = useState(false);

  const verifyPayment = async (eventId, phone) => {
    await supabase.from("registrations").update({ payment_status: "verified", verified_at: new Date().toISOString() }).eq("event_id", eventId).eq("phone", phone);
    refreshData();
  };
  const unverifyPayment = async (eventId, phone) => {
    await supabase.from("registrations").update({ payment_status: "pending", verified_at: null }).eq("event_id", eventId).eq("phone", phone);
    refreshData();
  };

  const saveEventConfig = async () => {
    await supabase.from("events").update({ event_date: eventDate, venue: eventVenue, status: eventStatus }).eq("id", event.id);
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
        for (const r of results) {
          if (r.value) {
            if (!personalBests[r.event] || r.isPB) personalBests[r.event] = r.value;
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
        Phone: a.phone, Name: a.name, Email: a.email || "", Age: a.age || "",
        Gender: a.gender || "", "Emergency Name": a.emergency_name || "",
        "Emergency Phone": a.emergency_phone || "", "Total Points": a.total_points || 0,
        "Events Attended": a.events_attended || 0, "Belt": getBelt(a.total_points || 0).name,
        "Joined": a.join_date ? new Date(a.join_date).toLocaleDateString("en-IN") : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(athletesData), "Athletes");

      const regsData = allRegistrations.map((r) => ({
        "Event ID": r.event_id, Phone: r.phone, Name: r.name,
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
            "Event ID": er.event_id, Date: er.event_date, Phone: er.phone, Name: er.name,
            "Sub-Event": r.event, Tier: r.tier, Position: r.position || "", Value: r.value || "",
            PB: r.isPB ? "Yes" : "No", "Day Points": er.total_points,
          });
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultsRows), "Results");

      const lbData = [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).map((a, i) => ({
        Rank: i + 1, Name: a.name, Phone: a.phone, Belt: getBelt(a.total_points || 0).name,
        Points: a.total_points || 0, Events: a.events_attended || 0,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lbData), "Leaderboard");

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
              {regsList.map((r) => (
                <div key={r.phone} style={{ borderBottom: `1px solid ${COLORS.borderLight}`, padding: "12px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textGray }}>{formatPhone(r.phone)} · {(r.events_selected || []).join(", ")}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>₹{r.total_cost} · ref: <span style={{ fontFamily: "monospace", color: COLORS.primary }}>{r.payment_note || "—"}</span></div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {r.payment_status === "pending" ? (
                      <Button onClick={() => verifyPayment(r.event_id, r.phone)} variant="primary" size="sm">Mark Paid</Button>
                    ) : (
                      <>
                        <span style={{ background: "#D6F0DC", color: "#1F7A3A", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>VERIFIED</span>
                        <Button onClick={() => unverifyPayment(r.event_id, r.phone)} variant="light" size="sm">Undo</Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "results" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Import results for {event?.id}</div>
          <div style={{ fontSize: 12, color: COLORS.textGray, marginBottom: 12, lineHeight: 1.6 }}>
            Paste CSV with columns: <span style={{ fontFamily: "monospace", background: COLORS.creamLight, padding: "1px 6px", borderRadius: 3 }}>phone,event,position,value,isPB</span>
          </div>
          <div style={{ background: COLORS.creamLight, padding: 12, borderRadius: 6, fontSize: 12, fontFamily: "monospace", marginBottom: 12, whiteSpace: "pre-wrap" }}>
{`phone,event,position,value,isPB
9876543210,Push-ups,1,52,true
9876543210,Squats,2,68,false
9988776655,Push-ups,2,48,true
9988776655,100m Sprint,1,12.4,true`}
          </div>
          <textarea value={csvInput} onChange={(e) => setCsvInput(e.target.value)} placeholder="Paste CSV here..."
            style={{ width: "100%", minHeight: 180, padding: 12, fontSize: 13, fontFamily: "monospace", border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={importResults} variant="primary">Import & Calculate Points</Button>
            <Button onClick={() => { setCsvInput(""); setCsvStatus(""); }} variant="light">Clear</Button>
          </div>
          {csvStatus && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 6, fontSize: 13, background: csvStatus.startsWith("✓") ? "#D6F0DC" : "#FDE8E8", color: csvStatus.startsWith("✓") ? "#1F7A3A" : COLORS.primary }}>{csvStatus}</div>
          )}
        </Card>
      )}

      {tab === "event" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Current Event Configuration</div>
          <Input label="Event Date" value={eventDate} onChange={setEventDate} placeholder="e.g., Sunday, May 18, 2026" />
          <Input label="Venue" value={eventVenue} onChange={setEventVenue} placeholder="e.g., Central Park, Jaipur" />
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Status</label>
            <select value={eventStatus} onChange={(e) => setEventStatus(e.target.value)} style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${COLORS.borderLight}`, borderRadius: 6, background: "#FAFAF7", boxSizing: "border-box", fontFamily: "inherit" }}>
              <option value="open">Open for registration</option>
              <option value="closed">Closed (registrations locked)</option>
              <option value="results">Results published</option>
            </select>
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
// ROOT APP
// ============================================================
export default function App() {
  const [view, setView] = useState("home");
  const [event, setEvent] = useState(null);
  const [upiId, setUpiId] = useState("rann.league@upi");
  const [athlete, setAthlete] = useState(null);
  const [allAthletes, setAllAthletes] = useState([]);
  const [allRegistrations, setAllRegistrations] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [eventResults, setEventResults] = useState([]);
  const [eventRecords, setEventRecords] = useState([]);
  const [lastRegistration, setLastRegistration] = useState(null);
  const [isAdminAuthed, setIsAdminAuthed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refreshData = useCallback(async () => {
    if (!supabaseEnabled) { setLoaded(true); return; }
    try {
      const [{ data: events }, { data: cfg }, { data: athletes }, { data: regs }, { data: results }, { data: records }] = await Promise.all([
        supabase.from("events").select("*").eq("is_current", true).order("created_at", { ascending: false }).limit(1),
        supabase.from("config").select("*").eq("key", "upi_id").single(),
        supabase.from("athletes").select("*"),
        supabase.from("registrations").select("*"),
        supabase.from("event_results").select("*"),
        supabase.from("event_records").select("*"),
      ]);
      const cur = events?.[0] || null;
      setEvent(cur);
      if (cfg?.value) setUpiId(cfg.value);
      setAllAthletes(athletes || []);
      setAllRegistrations(regs || []);
      setAllResults(results || []);
      setEventRecords(records || []);

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
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleLogin = (a) => { setAthlete(a); setView("dashboard"); refreshData(); };
  const handleLogout = () => { localStorage.removeItem("rann_session_phone"); setAthlete(null); setEventResults([]); setView("home"); };
  const handleRegistrationComplete = (a, reg) => { setAthlete(a); setLastRegistration(reg); setView("success"); setTimeout(() => refreshData(), 100); };

  const myCurrentRegistration = useMemo(() => {
    if (!athlete || !event) return null;
    return allRegistrations.find((r) => r.phone === athlete.phone && r.event_id === event.id);
  }, [athlete, allRegistrations, event]);

  const leaderboardPreview = useMemo(() => [...allAthletes].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5), [allAthletes]);

  if (!supabaseEnabled) return <SetupRequired />;
  if (!loaded) return <div style={{ textAlign: "center", padding: 80, color: COLORS.textGray }}>Loading the arena...</div>;

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: COLORS.creamLight, minHeight: "100vh", color: COLORS.charcoal }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Noto+Serif+Devanagari:wght@600;700&display=swap');
        * { box-sizing: border-box; }
        button:hover:not(:disabled) { filter: brightness(1.1); }
        button:active:not(:disabled) { transform: scale(0.98); }
        input:focus, select:focus, textarea:focus { outline: 2px solid ${COLORS.gold}; outline-offset: 1px; border-color: ${COLORS.gold}; }
      `}</style>

      <div style={{ background: "#FFFFFF", borderBottom: `1px solid ${COLORS.borderLight}`, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div onClick={() => setView("home")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: COLORS.primary, fontFamily: "'Noto Serif Devanagari', serif", fontWeight: 700 }}>रण</div>
          <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, letterSpacing: 2, color: COLORS.charcoal }}>RANN</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button onClick={() => setView("home")} variant={view === "home" ? "primary" : "light"} size="sm">Home</Button>
          <Button onClick={() => setView("leaderboard")} variant={view === "leaderboard" ? "primary" : "light"} size="sm">Leaderboard</Button>
          {athlete ? (
            <>
              <Button onClick={() => setView("dashboard")} variant={view === "dashboard" ? "primary" : "light"} size="sm">My Profile</Button>
              <Button onClick={handleLogout} variant="ghost" size="sm">Logout</Button>
            </>
          ) : (
            <Button onClick={() => setView("login")} variant="ghost" size="sm">Login</Button>
          )}
          <Button onClick={() => setView(isAdminAuthed ? "admin" : "admin-login")} variant="dark" size="sm">Admin</Button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 60px" }}>
        {view === "home" && <HomePage event={event} athlete={athlete} onNav={setView} leaderboardPreview={leaderboardPreview} />}
        {view === "register" && <RegisterPage event={event} upiId={upiId} onComplete={handleRegistrationComplete} onNav={setView} athlete={athlete} />}
        {view === "login" && <LoginPage onLogin={handleLogin} onNav={setView} />}
        {view === "success" && <SuccessPage registration={lastRegistration} onNav={setView} upiId={upiId} />}
        {view === "dashboard" && athlete && <DashboardPage athlete={athlete} currentRegistration={myCurrentRegistration} eventResults={eventResults} onNav={setView} allAthletes={allAthletes} />}
        {view === "leaderboard" && <LeaderboardPage allAthletes={allAthletes} eventRecords={eventRecords} onNav={setView} currentAthletePhone={athlete?.phone} />}
        {view === "admin-login" && <AdminLogin onLogin={() => { setIsAdminAuthed(true); setView("admin"); }} onCancel={() => setView("home")} />}
        {view === "admin" && isAdminAuthed && <AdminPanel onLogout={() => { setIsAdminAuthed(false); setView("home"); }} refreshData={refreshData} allAthletes={allAthletes} allRegistrations={allRegistrations} allResults={allResults} event={event} upiId={upiId} />}
      </div>

      <div style={{ borderTop: `1px solid ${COLORS.borderLight}`, padding: "20px", textAlign: "center", fontSize: 12, color: COLORS.textGray }}>
        <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, letterSpacing: 2, fontSize: 14, color: COLORS.charcoal, marginBottom: 4 }}>RANN</div>
        <div style={{ fontStyle: "italic" }}>Step into the Arena · Jaipur · @rann.league</div>
      </div>
    </div>
  );
}
