// ============================================================
// AdminPanel.jsx — extracted for lazy loading
// This file + its heavy deps (XLSX ~500KB, ExcelJS ~300KB) are only
// downloaded when an authenticated admin opens the admin panel.
// Public users / athletes never download any of this code.
// ============================================================
import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";

import { supabase, COLORS, TIERS, EVENTS, Button, Card, Input, StatCard } from "./shared.jsx";

// ============================================================
// ADMIN PANEL — registrations, results CSV import, Excel export, event mgmt
// ============================================================
const AdminPanel = ({ onLogout, refreshData, allAthletes, allRegistrations, event, upiId, allResults, slotCounts = {}, allWaitlist = [], allBatches = [] }) => {
  const [tab, setTab] = useState("registrations");
  const [csvInput, setCsvInput] = useState("");
  const [csvStatus, setCsvStatus] = useState("");
  const [eventDate, setEventDate] = useState(event?.event_date || "");
  const [eventVenue, setEventVenue] = useState(event?.venue || "");
  const [eventStartTime, setEventStartTime] = useState(event?.start_time || "");
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
    setEventStartTime(event?.start_time || "");
    setEventStatus(event?.status || "open");
    setEventDeadlineLocal(isoToLocalInput(event?.registration_deadline_at));
  }, [event?.id, event?.event_date, event?.venue, event?.start_time, event?.status, event?.registration_deadline_at]);

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
      event_date: eventDate, venue: eventVenue, start_time: eventStartTime || null, status: eventStatus,
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

      // Snapshot ranks BEFORE applying — captures "before this event" standings
      // so leaderboard ▲▼ arrows show movement caused by these results.
      setCsvStatus("Snapshotting ranks...");
      await snapshotAthleteRanks(allAthletes);
      setCsvStatus("Processing...");

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

        // Idempotency: if results exist for this event×phone, REPLACE rather than ADD
        const { data: existingResults } = await supabase.from("event_results")
          .select("*").eq("event_id", event.id).eq("phone", phone).maybeSingle();
        const isReUpload = !!existingResults;
        const previousDayPoints = isReUpload ? (existingResults.total_points || 0) : 0;

        const dayPoints = calculatePoints(results, tiers);
        const newTotal = (athlete.total_points || 0) - previousDayPoints + dayPoints;
        const newAttended = isReUpload
          ? (athlete.events_attended || 0)
          : (athlete.events_attended || 0) + 1;
        const personalBests = athlete.personal_bests || {};
        const eventDateStr2 = event?.event_date || new Date().toISOString().slice(0, 10);
        for (const r of results) {
          const oldField = personalBests[r.event];
          // If this PB was set by the same event being re-uploaded, compare against the pre-event PB
          const wasSetByThisEvent = oldField && typeof oldField === "object" && oldField.event_id === event.id;
          const effectiveOldField = wasSetByThisEvent
            ? (oldField.previous_value !== null && oldField.previous_value !== undefined
                ? { value: oldField.previous_value, date: oldField.previous_date }
                : null)
            : oldField;
          // CSV "isPB" field provided manually; if blank, auto-detect
          const finalIsPB = r.isPB ? true : isNewPB(r.event, r.value, effectiveOldField);
          if (finalIsPB && r.value) {
            personalBests[r.event] = {
              value: r.value, date: eventDateStr2, event_id: event.id,
              previous_value: getPBValue(effectiveOldField), previous_date: getPBDate(effectiveOldField),
            };
          } else if (wasSetByThisEvent) {
            if (oldField.previous_value !== null && oldField.previous_value !== undefined) {
              personalBests[r.event] = {
                value: oldField.previous_value, date: oldField.previous_date,
                event_id: null, previous_value: null, previous_date: null,
              };
            } else {
              delete personalBests[r.event];
            }
          }
          if (r.value && r.position) {
            // Track best in batch comparison (handles non-1st batch winners and multi-batch events)
            const existing = recordUpdates[r.event];
            const newNumeric = parseEventValue(r.event, r.value);
            const existingNumeric = existing ? parseEventValue(r.event, existing.value) : null;
            const lowerIsBetter = !!EVENT_LOWER_IS_BETTER[r.event];
            const isBetterThanInBatch = existingNumeric === null
              ? true
              : (lowerIsBetter ? newNumeric < existingNumeric : newNumeric > existingNumeric);
            if (newNumeric !== null && !isNaN(newNumeric) && isBetterThanInBatch) {
              recordUpdates[r.event] = { event_name: r.event, value: r.value, holder: athlete.name, phone, set_on: event.event_date };
            }
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
        // Only overwrite event_records if the new value beats the existing all-time record.
        const { data: existingRec } = await supabase.from("event_records")
          .select("*").eq("event_name", rec.event_name).maybeSingle();
        if (existingRec && existingRec.value) {
          const existingNumeric = parseEventValue(rec.event_name, existingRec.value);
          const newNumeric = parseEventValue(rec.event_name, rec.value);
          const lowerIsBetter = !!EVENT_LOWER_IS_BETTER[rec.event_name];
          const isBetter = lowerIsBetter ? newNumeric < existingNumeric : newNumeric > existingNumeric;
          if (!isBetter) continue;
        }
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
                    // Yellow input cells (Position, Value, PB)
                    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.yellow } };
                    c.font = { name: "Arial", bold: true, size: 10, color: { argb: C.charcoal } };
                    c.alignment = { horizontal: "center", vertical: "middle" };
                    // CRITICAL: force Text format on the Value cell (i === 8) so Excel
                    // doesn't auto-interpret "4:00" as 4:00 AM (h:m:s) and store it as
                    // a fraction of a day. With "@" (Text) format, "4:00" stays "4:00".
                    if (i === 8) c.numFmt = "@";
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
                  if (col === 9) c.numFmt = "@"; // Value column → Text
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

      // Snapshot ranks BEFORE applying — captures "before this event" standings
      // so leaderboard ▲▼ arrows show movement caused by these results.
      setCsvStatus("Snapshotting ranks...");
      await snapshotAthleteRanks(allAthletes);
      setCsvStatus("Reading Excel file...");
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

        // Value column normalization — handle Excel's silent "h:m:s → fraction of a day" conversion.
        // If user typed "4:00" (meaning 4 min 0 sec), Excel parsed it as 4:00:00 (4 hours)
        // and stored as 4/24 = 0.16666... of a day. We recover the user's intent here:
        //   fraction × 24 = the leading number the user typed (the minutes)
        //   the decimal remainder × 60 = the seconds.
        // NOTE: this means we treat their input as mm:ss, not hh:mm. A 4-hour plank would
        // be ridiculous; users only ever mean minutes when typing colons in plank.
        const rawVal = row[8];
        let value;
        if (evName === "Plank" && typeof rawVal === "number" && rawVal > 0 && rawVal < 1) {
          const leading = rawVal * 24;        // minutes
          const mins = Math.floor(leading);
          const secs = Math.round((leading - mins) * 60);
          // Handle 60s rollover edge case (e.g., 0.99999 → 23:60 → 24:00)
          if (secs === 60) value = `${mins + 1}:00`;
          else value = `${mins}:${String(secs).padStart(2, "0")}`;
        } else {
          value = String(rawVal || "").trim();
        }

        if (!byPhone[phoneStr]) byPhone[phoneStr] = [];
        byPhone[phoneStr].push({
          event: evName, position,
          value,
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

        // ─── Idempotency: if results already exist for this event×phone, REPLACE not ADD ───
        const { data: existingResults } = await supabase.from("event_results")
          .select("*").eq("event_id", event.id).eq("phone", phone).maybeSingle();
        const isReUpload = !!existingResults;
        const previousDayPoints = isReUpload ? (existingResults.total_points || 0) : 0;

        // Auto-detect PB for each result (with manual override taking precedence)
        const personalBests = athlete.personal_bests || {};
        for (const r of results) {
          const oldField = personalBests[r.event];
          // On re-upload: if the old PB was set by THIS event, "old" should be the previous_value stored back then,
          // not the value being overwritten now. Otherwise we'd compare new value to old value of same event.
          const wasSetByThisEvent = oldField && typeof oldField === "object" && oldField.event_id === event.id;
          const effectiveOldField = wasSetByThisEvent
            ? (oldField.previous_value !== null && oldField.previous_value !== undefined
                ? { value: oldField.previous_value, date: oldField.previous_date }
                : null)
            : oldField;

          let isPB;
          if (r.pbOverride !== null) {
            isPB = r.pbOverride; // user said Y or N — respect it
          } else {
            isPB = isNewPB(r.event, r.value, effectiveOldField); // auto-detect against pre-event PB
          }
          r.isPB = isPB; // store for points calc

          if (isPB && r.value) {
            // Roll forward, keeping the original pre-event PB as previous_value
            const oldVal = getPBValue(effectiveOldField);
            const oldDate = getPBDate(effectiveOldField);
            personalBests[r.event] = {
              value: r.value,
              date: eventDateStr,
              event_id: event.id,
              previous_value: oldVal,
              previous_date: oldDate,
            };
          } else if (wasSetByThisEvent) {
            // Re-upload changed values such that this is no longer a PB → revert to the pre-event PB
            if (oldField.previous_value !== null && oldField.previous_value !== undefined) {
              personalBests[r.event] = {
                value: oldField.previous_value,
                date: oldField.previous_date,
                event_id: null,
                previous_value: null,
                previous_date: null,
              };
            } else {
              delete personalBests[r.event];
            }
          }
        }

        const dayPoints = calculatePoints(results, tiers);
        // Net change: subtract whatever this event contributed last time, then add fresh.
        const newTotal = (athlete.total_points || 0) - previousDayPoints + dayPoints;
        const newAttended = isReUpload
          ? (athlete.events_attended || 0)         // already counted on first upload
          : (athlete.events_attended || 0) + 1;
        for (const r of results) {
          if (r.value && r.position) {
            // Track THIS athlete's best for this event in this batch upload, regardless of position.
            // We'll later compare across all batches AND against the existing record before overwriting.
            const existing = recordUpdates[r.event];
            const newNumeric = parseEventValue(r.event, r.value);
            const existingNumeric = existing ? parseEventValue(r.event, existing.value) : null;
            const lowerIsBetter = !!EVENT_LOWER_IS_BETTER[r.event];
            const isBetterThanInBatch = existingNumeric === null
              ? true
              : (lowerIsBetter ? newNumeric < existingNumeric : newNumeric > existingNumeric);
            if (newNumeric !== null && !isNaN(newNumeric) && isBetterThanInBatch) {
              recordUpdates[r.event] = { event_name: r.event, value: r.value, holder: athlete.name, phone, set_on: event.event_date };
            }
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
        // Only overwrite event_records if the new value beats the existing all-time record.
        const { data: existingRec } = await supabase.from("event_records")
          .select("*").eq("event_name", rec.event_name).maybeSingle();
        if (existingRec && existingRec.value) {
          const existingNumeric = parseEventValue(rec.event_name, existingRec.value);
          const newNumeric = parseEventValue(rec.event_name, rec.value);
          const lowerIsBetter = !!EVENT_LOWER_IS_BETTER[rec.event_name];
          const isBetter = lowerIsBetter ? newNumeric < existingNumeric : newNumeric > existingNumeric;
          if (!isBetter) continue; // existing record holds
        }
        await supabase.from("event_records").upsert(rec, { onConflict: "event_name" });
      }
      setCsvStatus(`✓ Updated ${updated} athlete${updated !== 1 ? "s" : ""}, skipped ${skipped} (not registered or invalid). Leaderboard refreshed. Safe to re-upload — totals replace, not add.`);
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
          <Input label="Start Time" value={eventStartTime} onChange={setEventStartTime} placeholder="e.g., 6:30 AM" helpText="What athletes see on homepage. Free text — write it however you want it to appear." />

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

export default AdminPanel;
