/**
 * Voice Delivery Utility using Web Speech API (SpeechSynthesis)
 */

let voiceMuted = false;
let navigationActive = false;

export function setNavigationActive(active: boolean): void {
  navigationActive = active;
  if (!active && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isNavigationActive(): boolean {
  return navigationActive;
}

export function setVoiceMuted(muted: boolean): void {
  voiceMuted = muted;
  if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isVoiceMuted(): boolean {
  return voiceMuted;
}

/**
 * Clean direction speech text:
 * 1. Expand shorthand distance abbreviations (e.g., "100m" -> "100 meters", "1km" -> "1 kilometer", "2.5km" -> "2.5 kilometers").
 * 2. Handle slashes (/) representing alternate route names.
 *    Picks only the first route name option instead of reading out all slashed names.
 *    Example: "Kobape Road / Sagamu Expressway" -> "Kobape Road"
 *    Example: "Head south on Kobape Rd / Sagamu Expy toward Governor's Office" -> "Head south on Kobape Rd toward Governor's Office"
 */
export function cleanDirectionSpeech(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Clean route name slashes if present
  if (cleaned.includes('/')) {
    const towardMatch = cleaned.match(/\s+(toward|towards|for)\s+.*$/i);
    const towardSuffix = towardMatch ? towardMatch[0] : '';
    const mainPart = towardSuffix ? cleaned.slice(0, cleaned.indexOf(towardSuffix)) : cleaned;
    const firstOption = mainPart.split('/')[0].trim();
    cleaned = `${firstOption}${towardSuffix}`;
  }

  // 2. Expand distance abbreviations so speech synthesis says "meters" and "kilometers" cleanly
  // Replace single kilometer: "1km" or "1 km" or "1.0km" -> "1 kilometer"
  cleaned = cleaned.replace(/\b1(?:\.0)?\s*km\b/gi, '1 kilometer');

  // Replace plural kilometers: "2km" or "2.5 km" -> "2.5 kilometers"
  cleaned = cleaned.replace(/\b(\d+(?:\.\d+)?)\s*km\b/gi, '$1 kilometers');

  // Replace single meter: "1m" or "1 m" -> "1 meter"
  cleaned = cleaned.replace(/\b1\s*m\b/gi, '1 meter');

  // Replace plural meters: "100m", "50m", "200m", "500m" -> "100 meters", "50 meters", etc.
  cleaned = cleaned.replace(/\b(\d+)\s*m\b/gi, '$1 meters');

  return cleaned;
}

export function speakVoice(text: string, force = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!navigationActive) return; // Speech is strictly suppressed unless Start Navigation has been clicked!
  if (voiceMuted && !force) return;

  const spokenText = cleanDirectionSpeech(text);

  try {
    // Cancel any current utterance so the new turn/distance instruction plays immediately
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.rate = 0.95; // Natural clear pace
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Voice synthesis error:', err);
  }
}

/**
 * Format distance for voice delivery
 */
export function formatVoiceDistance(meters: number): string {
  if (meters >= 1000) {
    const km = (meters / 1000).toFixed(1);
    return km === '1.0' ? '1 kilometer' : `${km} kilometers`;
  }
  const rounded = Math.round(meters);
  return `${rounded} ${rounded === 1 ? 'meter' : 'meters'}`;
}

/**
 * Exact voice thresholds requested by user
 */
export const VOICE_THRESHOLDS = [1000, 500, 200, 100, 50];
