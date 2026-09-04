// Central TTS Service handling browser SpeechSynthesis
import { translate } from './translations.js'

const LANGUAGE_TAGS = { en: 'en-IN', ta: 'ta-IN', tanglish: 'en-IN' }
let activeAudio = null
let audioUnlocked = false

// Autoplay policy unlocker: unlocks browser HTML5 Audio on first user interaction
export function unlockAudioContext() {
  if (audioUnlocked || typeof window === 'undefined') return
  try {
    const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA')
    silentAudio.play().then(() => {
      audioUnlocked = true
    }).catch(() => {})
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  ['click', 'touchstart', 'keydown'].forEach((event) => {
    window.addEventListener(event, unlockAudioContext, { once: true })
  })
}

export function stopSpeechOutput() {
  if (typeof window === 'undefined') return
  window.speechSynthesis?.cancel()
  if (activeAudio) {
    try {
      activeAudio.pause()
      activeAudio.currentTime = 0
    } catch (e) {}
    activeAudio = null
  }
}

function getAvailableVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices()
}

function waitForVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([])

  const synthesis = window.speechSynthesis
  const currentVoices = getAvailableVoices()
  if (currentVoices.length > 0) return Promise.resolve(currentVoices)

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      synthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve(getAvailableVoices())
    }
    const handleVoicesChanged = () => finish()
    synthesis.addEventListener('voiceschanged', handleVoicesChanged)
    setTimeout(finish, 1000)
  })
}

async function findPreferredVoice(language) {
  const voices = await waitForVoices()

  if (language === 'ta') {
    const tamilVoice =
      voices.find((v) => v.lang.toLowerCase().replace('_', '-') === 'ta-in') ||
      voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ta')) ||
      null
    return tamilVoice
  }

  const languageTag = LANGUAGE_TAGS[language] || LANGUAGE_TAGS.en
  return (
    voices.find((voice) => voice.lang.toLowerCase().replace('_', '-') === languageTag.toLowerCase()) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ||
    voices[0] ||
    null
  )
}

// Speaks translated UI guidance with installed browser voice
export async function speakText(text, language = 'en') {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return false

  unlockAudioContext()
  stopSpeechOutput()
  const voice = await findPreferredVoice(language)

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = LANGUAGE_TAGS[language] || LANGUAGE_TAGS.en
  if (voice) utterance.voice = voice

  return new Promise((resolve) => {
    utterance.onend = () => resolve(true)
    utterance.onerror = () => resolve(false)
    window.speechSynthesis.speak(utterance)
  })
}

export function speakTranslation(language, key) {
  const text = translate(language, key)
  speakText(typeof text === 'function' ? text() : text, language)
}

export function speakGuidance(language, stage) {
  const translations = translate(language, 'voiceGuidance')
  speakText(translations?.[stage], language)
}

export function replayVoiceResponse(response, preferredLanguage = 'en') {
  if (!response) return
  speakText(response.spoken_text, response.language || preferredLanguage)
}