"use client";

import { defineSound, ensureReady, type SoundDefinition } from "@web-kits/audio";
import { getPreferences } from "./preferences";

/* ─────────────────────────────────────────────────────────
 * SFX — synthesized interface sounds (@web-kits/audio).
 * craft "Interface SFX" + "Layering Sounds": short, quiet, a click
 * layer for the transient plus a tone layer for the body.
 * Off by default; nothing plays until the viewer turns it on.
 * ───────────────────────────────────────────────────────── */

export type SfxName = "tap" | "toggle" | "open" | "close" | "tick" | "success" | "error";

const DEFS: Record<SfxName, SoundDefinition> = {
  tap: {
    layers: [
      { source: { type: "noise", color: "white" }, filter: { type: "highpass", frequency: 4200 }, envelope: { decay: 0.012 }, gain: 0.05 },
      { source: { type: "sine", frequency: { start: 1250, end: 420 } }, envelope: { attack: 0.001, decay: 0.05 }, gain: 0.12 },
    ],
  },
  toggle: {
    layers: [
      { source: { type: "noise", color: "pink" }, filter: { type: "bandpass", frequency: 3000 }, envelope: { decay: 0.01 }, gain: 0.05 },
      { source: { type: "triangle", frequency: 880 }, envelope: { attack: 0.001, decay: 0.06 }, gain: 0.1 },
    ],
  },
  open: {
    layers: [
      { source: { type: "triangle", frequency: { start: 520, end: 780 } }, envelope: { attack: 0.004, decay: 0.12 }, gain: 0.09 },
      { source: { type: "sine", frequency: 1560 }, envelope: { decay: 0.05 }, gain: 0.03, delay: 0.03 },
    ],
  },
  close: {
    layers: [{ source: { type: "triangle", frequency: { start: 780, end: 480 } }, envelope: { attack: 0.004, decay: 0.1 }, gain: 0.08 }],
  },
  tick: {
    source: { type: "sine", frequency: 2100 },
    envelope: { decay: 0.018 },
    gain: 0.04,
  },
  success: {
    layers: [
      { source: { type: "sine", frequency: 523.25 }, envelope: { attack: 0.005, decay: 0.32 }, gain: 0.08 },
      { source: { type: "sine", frequency: 659.25 }, envelope: { attack: 0.005, decay: 0.32 }, gain: 0.07, delay: 0.06 },
      { source: { type: "sine", frequency: 783.99 }, envelope: { attack: 0.005, decay: 0.4 }, gain: 0.07, delay: 0.12 },
      { source: { type: "noise", color: "white" }, filter: { type: "highpass", frequency: 6000 }, envelope: { decay: 0.02 }, gain: 0.03 },
    ],
  },
  error: {
    layers: [
      { source: { type: "square", frequency: { start: 240, end: 170 } }, filter: { type: "lowpass", frequency: 1100 }, envelope: { decay: 0.16 }, gain: 0.06 },
    ],
  },
};

const players = new Map<SfxName, ReturnType<typeof defineSound>>();

function player(name: SfxName) {
  let p = players.get(name);
  if (!p) {
    p = defineSound(DEFS[name]);
    players.set(name, p);
  }
  return p;
}

/** Plays a sound if the viewer has sound on. Safe to call anywhere on the client. */
export function playSfx(name: SfxName, volume = 1) {
  if (typeof window === "undefined" || !getPreferences().sfx) return;
  ensureReady()
    .then(() => player(name)({ volume }))
    .catch(() => {
      // autoplay blocked or no audio device; stay silent
    });
}

/** Plays regardless of the pref (used for the "sound on" confirmation). */
export function previewSfx(name: SfxName) {
  ensureReady()
    .then(() => player(name)())
    .catch(() => {});
}
