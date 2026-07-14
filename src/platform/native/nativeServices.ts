// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

import { isTauriRuntime } from '../../lib/tauri-detection';
import { baseLanguage, detectTextLanguage } from '../../lib/textIntelligence';

export type NativePlatform = 'macos' | 'windows' | 'linux' | 'web' | 'unknown';
export type NativeFeatureStatus = 'available' | 'fallback' | 'unavailable' | 'planned';

export interface NativeFeatureCapability {
  readonly status: NativeFeatureStatus;
  readonly available: boolean;
  readonly provider: string;
  readonly detail: string;
  readonly localOnly: boolean;
}

export interface NativeCapabilities {
  readonly platform: NativePlatform;
  readonly ocr: NativeFeatureCapability;
  readonly tts: NativeFeatureCapability;
  readonly scanner: NativeFeatureCapability;
  readonly spellcheck: NativeFeatureCapability;
  readonly dictation: NativeFeatureCapability;
  readonly share: NativeFeatureCapability;
  readonly secureStorage: NativeFeatureCapability;
}

export interface SpeakTextOptions {
  readonly rate?: number;
  readonly voice?: string;
  readonly language?: string;
  /** Called at each word boundary. charIndex is the offset in the spoken text string. */
  readonly onBoundary?: (charIndex: number, charLength: number) => void;
}

export interface SpeakTextResult {
  readonly provider: string;
  readonly language?: string;
  readonly voice?: string;
}

const isTauri = isTauriRuntime();

function capability(
  status: NativeFeatureStatus,
  provider: string,
  detail: string,
  localOnly = true,
): NativeFeatureCapability {
  return { status, available: status === 'available' || status === 'fallback', provider, detail, localOnly };
}

function detectWebPlatform(): NativePlatform {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux') || userAgent.includes('linux')) return 'linux';
  return 'web';
}

function webCapabilities(): NativeCapabilities {
  const webSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return {
    platform: detectWebPlatform(),
    ocr: capability('unavailable', 'Geen browser-OS OCR', 'OCR vereist de desktop runtime of de PDFluent OCR-fallback.'),
    tts: webSpeech
      ? capability('fallback', 'Web Speech API', 'Browser gebruikt lokale systeemstemmen wanneer de browser die beschikbaar stelt.')
      : capability('unavailable', 'Geen spraakprovider', 'Deze browser exposeert geen lokale text-to-speech provider.'),
    scanner: capability('unavailable', 'Geen browser-scanner', 'Scannen vereist desktoptoegang tot ImageCaptureCore, WIA of SANE.'),
    spellcheck: capability('fallback', 'Browser spellcheck', 'Formuliervelden en tekstinvoer gebruiken de spellcheck van de browser.'),
    dictation: capability('planned', 'OS-dictatie', 'Dictatie wordt alleen getoond wanneer de desktopadapter een lokale provider meldt.'),
    share: share
      ? capability('fallback', 'Web Share API', 'Delen gebruikt de browser-share sheet zonder documentupload.')
      : capability('fallback', 'Bestandsdownload', 'Delen blijft lokaal via opslaan, exporteren of mailto.'),
    secureStorage: capability('unavailable', 'Geen browser secret store', 'Licentiegeheimen horen in de desktop keychain/credential store.'),
  };
}

export async function detectNativeCapabilities(): Promise<NativeCapabilities> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NativeCapabilities>('get_native_capabilities');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[PDFluent] Native capability detection fell back to web:', error);
      }
    }
  }
  return webCapabilities();
}

export async function speakText(text: string, options: SpeakTextOptions = {}): Promise<SpeakTextResult> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    throw new Error('Geen tekst beschikbaar om voor te lezen.');
  }
  const languageGuess = options.language
    ? { bcp47: options.language }
    : detectTextLanguage(cleaned);
  const language = languageGuess.bcp47;

  // Native TTS (say/SAPI) never calls back into JS, so skip it when word-boundary
  // tracking is needed — Web Speech API inside WKWebView uses the same system voices
  // and does fire onboundary events.
  if (isTauri && !options.onBoundary) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SpeakTextResult>('native_tts_speak', {
        payload: { text: cleaned, rate: options.rate ?? 1, voice: options.voice ?? null, language },
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[PDFluent] Native TTS failed, trying browser speech:', error);
      }
    }
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    throw new Error('Voorlezen is niet beschikbaar op deze runtime.');
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(cleaned.slice(0, 20000));
  utterance.rate = options.rate ?? 1;
  utterance.lang = language;
  if (options.voice) {
    const voice = (await getBrowserVoices()).find(candidate => candidate.name === options.voice);
    if (voice) utterance.voice = voice;
  } else {
    const voice = chooseBrowserVoice(language, await getBrowserVoices());
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || language;
    }
  }
  if (options.onBoundary) {
    const cb = options.onBoundary;
    utterance.onboundary = (e) => {
      if (e.name === 'word') cb(e.charIndex, e.charLength ?? 0);
    };
  }
  window.speechSynthesis.speak(utterance);
  return { provider: 'Web Speech API', language: utterance.lang, voice: utterance.voice?.name };
}

async function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const current = window.speechSynthesis.getVoices();
  if (current.length > 0) return current;
  return await new Promise(resolve => {
    const timer = window.setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
      resolve(window.speechSynthesis.getVoices());
    }, 350);
    function handleVoices() {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
      resolve(window.speechSynthesis.getVoices());
    }
    window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
  });
}

function chooseBrowserVoice(language: string, voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const desired = language.toLowerCase();
  const desiredBase = baseLanguage(desired);
  return voices.find(voice => voice.lang.toLowerCase() === desired)
    ?? voices.find(voice => baseLanguage(voice.lang) === desiredBase && voice.default)
    ?? voices.find(voice => baseLanguage(voice.lang) === desiredBase)
    ?? null;
}

export async function pauseSpeech(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('native_tts_pause');
      return;
    } catch {
      // Browser fallback below is useful when Web Speech handled the utterance.
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.pause();
  }
}

export async function resumeSpeech(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('native_tts_resume');
      return;
    } catch {
      // Browser fallback below is useful when Web Speech handled the utterance.
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.resume();
  }
}

export async function stopSpeech(): Promise<void> {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('native_tts_stop');
    } catch {
      // The web fallback below is still useful when desktop TTS was not active.
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
