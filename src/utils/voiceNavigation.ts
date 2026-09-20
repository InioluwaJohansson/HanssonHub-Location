/**
 * Voice Delivery Utility using Web Speech API (SpeechSynthesis)
 */

let voiceMuted = false;

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
 * Clean direction speech text to handle slashes (/) representing alternate route names.
 * Picks only the first route name option instead of reading out all slashed names.
 * Example: "Kobape Road / Sagamu Expressway" -> "Kobape Road"
 * Example: "Head south on Kobape Rd / Sagamu Expy toward Governor's Office" -> "Head south on Kobape Rd toward Governor's Office"
 */
export function cleanDirectionSpeech(text: string): string {
  if (!text) return '';
  if (!text.includes('/')) return text;

  // Preserve trailing "toward..." or "towards..." or "for..." clauses if present
  const towardMatch = text.match(/\s+(toward|towards|for)\s+.*$/i);
  const towardSuffix = towardMatch ? towardMatch[0] : '';

  // Isolate the main slashed clause
  const mainPart = towardSuffix ? text.slice(0, text.indexOf(towardSuffix)) : text;

  // Pick only the first route name before the slash
  const firstOption = mainPart.split('/')[0].trim();

  return `${firstOption}${towardSuffix}`;
}

export function speakVoice(text: string, force = false): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
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
  return `${Math.round(meters)} meters`;
}

/**
 * Exact voice thresholds requested by user
 */
export const VOICE_THRESHOLDS = [1000, 500, 200, 100, 50];
