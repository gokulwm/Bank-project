/*
  ============================================================
  MOCK VOICE AI SERVICE
  ============================================================
  This file stands in for the real Voice AI module (Module 2),
  which isn't built yet. It follows the FIXED interface contract
  from kiosk_module_interfaces.md exactly:

  WE SEND (once, at session start):
    { session_id, preferred_language, sample_rate }

  WE RECEIVE (after every user utterance):
    { session_id, spoken_text, language }

  In the real system this metadata rides alongside a binary
  16kHz mono PCM/WAV audio stream over WebSocket. Since the real
  Voice AI intent/entity model isn't built yet, this mock:
    1. Pretends to open a WebSocket ("connect").
    2. Accepts a transcript - either typed text, a tapped quick
       phrase, or a real transcript from the browser's
       SpeechRecognition API (see BankingAssistant.jsx) - and runs
       it through three separate stages: normalize -> detect
       intent -> extract amount. It never guesses an amount or
       intent it isn't reasonably sure about.
    3. Resolves after a short delay to simulate network + AI
       processing time.

  IMPORTANT: Do not rename any of the fields below. If the real
  Voice AI module ever needs a different shape, that's a team
  decision - flag it, don't quietly change it here.
*/

// Recognizable sample phrases per language, used by the mic button
// (since we can't do real speech-to-text locally yet).
export const SAMPLE_PHRASES = {
  en: [
    'Withdraw 5000 rupees',
    'Deposit 10000 rupees',
    'Check my balance',
    'Send 2000 rupees',
  ],
  ta: [
    'ஐந்தாயிரம் ரூபாய் எடுக்க வேண்டும்',
    'என் இருப்பை பார்க்க வேண்டும்',
  ],
  tanglish: [
    'Enakku 5000 rupees withdraw pannanum',
    'Balance check pannanum',
  ],
}

export function numberToTamilWords(num) {
  const map = {
    1000: 'ஆயிரம்',
    2000: 'இரண்டாயிரம்',
    5000: 'ஐந்தாயிரம்',
    10000: 'பத்தாயிரம்',
  }
  return map[num] || num
}

// Word-to-number map for Tamil phrases that spell the amount out instead
// of using digits (e.g. "ஐந்தாயிரம் ரூபாய்" = "five thousand rupees").
// Only used when no digit sequence is found in the transcript at all.
const WORD_AMOUNTS = [
  { pattern: /ஆயிரம்/, amount: 1000 },
  { pattern: /ஐந்தாயிரம்/, amount: 5000 },
  { pattern: /பத்தாயிரம்/, amount: 10000 },
  { pattern: /இரண்டாயிரம்/, amount: 2000 },
  { pattern: /\bfive thousand\b/i, amount: 5000 },
  { pattern: /\bten thousand\b/i, amount: 10000 },
  { pattern: /\btwo thousand\b/i, amount: 2000 },
  { pattern: /\bone thousand\b/i, amount: 1000 },
]

// Intents this kiosk supports actually need a rupee amount attached.
// balance_check deliberately does not.
const AMOUNT_REQUIRED_INTENTS = ['withdraw', 'deposit', 'send_money']

// Keyword patterns per intent, covering English, Tamil script, and Tanglish.
// English/Tanglish (Latin-script) keywords use \b word boundaries so we
// only match whole words, e.g. "send" won't fire on an unrelated word that
// happens to contain those letters. Tamil-script keywords use substring
// matching since JS regex \b doesn't understand Tamil word boundaries.
// balance_check is checked FIRST and ONLY matches on an explicit balance
// keyword - it is never used as a fallback/default intent.
const INTENT_PATTERNS = [
  ['balance_check', [/\bbalance\b/i, 'இருப்பு', 'இருப்பை', /\biruppu\w*/i]],
  ['withdraw', [/\bwithdraw\w*/i, 'எடுக்க', 'எடுக்கனும்', /\bedukka\w*/i]],
  ['deposit', [/\bdeposit\w*/i, 'டெபாசிட்', 'செலுத்த', 'போடு', /\bpodu\w*/i, /\bpodanum\b/i]],
  ['send_money', [/\bsend\b/i, /\btransfer\w*/i, 'அனுப்பு', /\banuppu\w*/i]],
]

const TRANSACTION_LABELS = {
  withdraw: 'Cash Withdrawal',
  deposit: 'Cash Deposit',
  send_money: 'Money Transfer',
  balance_check: 'Balance Inquiry',
  unknown: 'Unknown Request',
}

// Confirmation phrasing per language, keyed by intent.
function buildSpokenText(intent, amount, language) {
  const amountText = amount != null ? (language === 'ta' ? numberToTamilWords(amount) : amount) : ''
  const phrases = {
    en: {
      withdraw: `Please confirm: withdraw ${amount} rupees?`,
      deposit: `Please confirm: deposit ${amount} rupees?`,
      send_money: `Please confirm: send ${amount} rupees?`,
      balance_check: `Sure, let me check your account balance.`,
      unknown: `Sorry, I didn't understand that request. Could you please repeat it?`,
    },
    ta: {
      withdraw: `நீங்கள் ${amountText} ரூபாய் எடுக்க விரும்புகிறீர்களா?`,
      deposit: `நீங்கள் ${amountText} ரூபாய் டெபாசிட் செய்ய விரும்புகிறீர்களா?`,
      send_money: `நீங்கள் ${amountText} ரூபாய் அனுப்ப விரும்புகிறீர்களா?`,
      balance_check: `சரி, உங்கள் கணக்கு இருப்பை சரிபார்க்கிறேன்.`,
      unknown: `மன்னிக்கவும், புரியவில்லை. மீண்டும் சொல்ல முடியுமா?`,
    },
    tanglish: {
      withdraw: `Confirm pannunga: ${amount} rupees withdraw pannalaama?`,
      deposit: `Confirm pannunga: ${amount} rupees deposit pannalaama?`,
      send_money: `Confirm pannunga: ${amount} rupees send pannalaama?`,
      balance_check: `Sari, unga balance check panren.`,
      unknown: `Sorry, puriyala. Innoru muraiyaa sollunga?`,
    },
  }
  const set = phrases[language] || phrases.en
  return set[intent] || set.unknown
}

const AMOUNT_UNCLEAR_MESSAGE = "I couldn't clearly understand the amount. Please try again."

/**
 * STAGE 1 — Normalize the raw transcript before any matching happens.
 * lowercase, trim, collapse repeated whitespace. Kept as its own function
 * so intent detection and amount extraction always work off the same
 * clean text, and so the UI can display exactly what will be matched.
 */
export function normalizeTranscript(rawText) {
  return String(rawText || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * STAGE 2 — Intent detection, run on the normalized transcript.
 * Checks each intent's keyword patterns in a fixed order. balance_check
 * is checked first but ONLY matches when a balance keyword is actually
 * present - it is never a fallback/default guess.
 */
export function detectIntent(normalizedText) {
  for (const [intent, patterns] of INTENT_PATTERNS) {
    const matched = patterns.some((pattern) =>
      pattern instanceof RegExp ? pattern.test(normalizedText) : normalizedText.includes(pattern),
    )
    if (matched) return intent
  }
  return 'unknown'
}

/**
 * STAGE 3 — Amount extraction, run independently of intent detection.
 * - Strips thousand-separator commas ("1,000" -> "1000") BEFORE matching,
 *   so "1,000" is never misread as "1" and then confused with "10,000".
 * - Uses \b...\b so only whole digit runs are captured (no partial matches).
 * - Falls back to a small Tamil number-word map only when no digits exist
 *   in the transcript at all.
 * - Returns null (not a guess) when no amount can be confidently found.
 */
export function extractAmount(normalizedText) {
  const withoutCommas = normalizedText.replace(/,/g, '')

  const digitMatch = withoutCommas.match(/\b\d+\b/)
  if (digitMatch) {
    return parseInt(digitMatch[0], 10)
  }

  for (const { pattern, amount } of WORD_AMOUNTS) {
    if (pattern.test(normalizedText)) return amount
  }

  return null
}

/**
 * Combines all three stages into the response payload sent back to the
 * kiosk. If the intent needs an amount and we couldn't extract one
 * cleanly, or the speech recognizer itself was unsure, we do NOT guess -
 * we ask the customer to try again instead.
 */
function buildResponsePayload({ sessionId, language, transcript, intent, amount, recognitionConfidence }) {
  const amountRequired = AMOUNT_REQUIRED_INTENTS.includes(intent)
  const amountIsUnclear = amountRequired && amount === null
  const recognitionIsPoor = typeof recognitionConfidence === 'number' && recognitionConfidence < 0.55

  const needsClarification = intent === 'unknown' || amountIsUnclear || recognitionIsPoor

  let spokenText
  if (intent === 'unknown') {
    spokenText = buildSpokenText('unknown', null, language)
  } else if (needsClarification) {
    spokenText = AMOUNT_UNCLEAR_MESSAGE
  } else {
    spokenText = buildSpokenText(intent, amount, language)
  }

  return {
    session_id: sessionId,
    status: 'ok',
    language,
    intent,
    entities: {
      amount,
      account_number: 'XXXX1234',
      recipient: null,
    },
    confidence: needsClarification ? 0.4 : Math.min(0.95, recognitionConfidence ?? 0.9),
    raw_transcript: transcript,
    spoken_text: spokenText,
    transaction_label: TRANSACTION_LABELS[intent] || TRANSACTION_LABELS.unknown,
    needs_clarification: needsClarification,
  }
}

class VoiceAIMockService {
  constructor() {
    this.connected = false
    this.sessionId = null
    this.preferredLanguage = 'en'
  }

  /**
   * Simulates opening the WebSocket connection to Voice AI and sending
   * the one-time session metadata, per the fixed contract:
   * { session_id, preferred_language, sample_rate }
   */
  connect({ sessionId, preferredLanguage, sampleRate = 16000 }) {
    return new Promise((resolve) => {
      this.sessionId = sessionId
      this.preferredLanguage = preferredLanguage
      setTimeout(() => {
        this.connected = true
        console.log('[voiceService] mock WebSocket connected', {
          session_id: sessionId,
          preferred_language: preferredLanguage,
          sample_rate: sampleRate,
        })
        resolve({ status: 'ok' })
      }, 400)
    })
  }

  /**
   * Simulates sending one utterance (from typed text, a quick-phrase
   * chip, or real browser speech recognition) and receiving the Voice AI
   * response back. Runs the transcript through the three clearly
   * separated stages - normalize, detect intent, extract amount - before
   * resolving.
   *
   * @param {string} rawText - the transcript (already recognized speech,
   *   or typed/tapped text).
   * @param {number} [recognitionConfidence] - confidence score from the
   *   browser's speech recognizer (0-1). Typed/tapped input is treated
   *   as fully confident (1) by callers, since there's no ambiguity.
   *
   * Resolves with the FIXED response shape:
   *   { session_id, spoken_text, language }
   * plus extra fields (intent/entities/confidence) that Module 4
   * (Backend) would normally consume - included here so the
   * Confirmation screen has something to display.
   */
  async sendMessage(rawText, recognitionConfidence = 1) {
    if (!this.connected) {
      throw new Error('Voice AI connection is not open yet.')
    }
    if (!rawText || !rawText.trim()) {
      throw new Error('No speech or text was captured.')
    }

    // Try calling the live Voice AI Service at port 8200
    try {
      const resp = await fetch('http://localhost:8200/api/v1/parse-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          raw_transcript: rawText,
          language: this.preferredLanguage,
          forward_to_backend: true,
        }),
      })

      if (resp.ok) {
        const data = await resp.json()
        const payload = data.intent_payload
        if (payload) {
          const intent = payload.intent
          const amount = payload.entities?.amount ?? null
          return buildResponsePayload({
            sessionId: this.sessionId,
            language: this.preferredLanguage,
            transcript: rawText,
            intent,
            amount,
            recognitionConfidence: payload.confidence ?? recognitionConfidence,
          })
        }
      }
    } catch (err) {
      console.warn('[VoiceService] Remote voice service unreachable, using local parser:', err)
    }

    // Fallback: local parser
    const transcript = normalizeTranscript(rawText)
    const intent = detectIntent(transcript)
    const amount = AMOUNT_REQUIRED_INTENTS.includes(intent) ? extractAmount(transcript) : null

    return buildResponsePayload({
      sessionId: this.sessionId,
      language: this.preferredLanguage,
      transcript,
      intent,
      amount,
      recognitionConfidence,
    })
  }

  disconnect() {
    this.connected = false
  }
}

export default VoiceAIMockService
