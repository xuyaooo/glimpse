// Spoken hints. The engine will use a local TTS (Piper); until then the browser's own
// voices work offline on macOS and are good enough for short sentences.

const VOICE: Record<string, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-CH',
  it: 'it-IT',
  tr: 'tr-TR',
  ar: 'ar-SA',
}

export function speak(text: string, lang: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = VOICE[lang] ?? lang
  utterance.rate = 0.95
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
