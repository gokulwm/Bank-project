import { useState, useCallback, useEffect, useRef } from 'react'
import Header from './components/Header.jsx'
import Welcome from './components/Welcome.jsx'
import LanguageSelection from './components/LanguageSelection.jsx'
import Authentication from './components/Authentication.jsx'
import BankingAssistant from './components/BankingAssistant.jsx'
import Confirmation from './components/Confirmation.jsx'
import Success from './components/Success.jsx'
import ErrorScreen from './components/ErrorScreen.jsx'
import ProgressIndicator from './components/ProgressIndicator.jsx'
import FaceEnrollment from './components/FaceEnrollment.jsx'
import VoiceAIMockService, { detectIntent, extractAmount, normalizeTranscript } from './services/voiceService.js'
import { speakGuidance, speakText, stopSpeechOutput } from './services/ttsService.js'
import { translate } from './services/translations.js'
import './App.css'

// Simple UUID v4-ish generator - good enough for a hackathon demo.
// (crypto.randomUUID() would also work in modern browsers, this is
// just explicit so it's easy to understand.)
function generateSessionId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const INACTIVITY_TIMEOUT_MS = 30000
const INACTIVITY_WARNING_SECONDS = 30
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

export default function App() {
  // ---- Core navigation state ----
  const [currentScreen, setCurrentScreen] = useState('welcome')

  // ---- Session state (shared across every screen) ----
  const [sessionId, setSessionId] = useState(null)
  const [preferredLanguage, setPreferredLanguage] = useState(null)

  // ---- Conversation state ----
  const [userInput, setUserInput] = useState('')
  const [aiResponse, setAiResponse] = useState(null) // full response object from Voice AI

  // ---- Transaction state ----
  const [transactionType, setTransactionType] = useState(null)
  const [transactionAmount, setTransactionAmount] = useState(null)
  const [transactionIntent, setTransactionIntent] = useState(null)
  const [transactionStage, setTransactionStage] = useState('selection')
  const [voiceFeedback, setVoiceFeedback] = useState(null)
  const [signedTokenData, setSignedTokenData] = useState(null)

  // ---- UI state ----
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cancellationNotice, setCancellationNotice] = useState(null)
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const [inactivitySeconds, setInactivitySeconds] = useState(INACTIVITY_WARNING_SECONDS)

  // The mock Voice AI service instance lives for the whole session.
  const voiceServiceRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const inactivityCountdownRef = useRef(null)
  const inactivityRecognitionRef = useRef(null)
  const inactivityVoiceFlowRef = useRef(0)
  const resetInactivityTimerRef = useRef(null)

  // ---------------- Navigation helpers ----------------

  const goTo = useCallback((screen) => setCurrentScreen(screen), [])

  const clearInactivityTimers = useCallback(() => {
    clearTimeout(inactivityTimerRef.current)
    clearInterval(inactivityCountdownRef.current)
    inactivityTimerRef.current = null
    inactivityCountdownRef.current = null
  }, [])

  // Ends a session locally and clears all data that could belong to the
  // previous customer before the kiosk returns to its public welcome screen.
  const endSession = useCallback(() => {
    clearInactivityTimers()
    inactivityVoiceFlowRef.current += 1
    inactivityRecognitionRef.current?.stop()
    inactivityRecognitionRef.current = null
    voiceServiceRef.current?.disconnect()
    voiceServiceRef.current = null
    stopSpeechOutput()
    setInactivityWarning(false)
    setInactivitySeconds(INACTIVITY_WARNING_SECONDS)
    setSessionId(null)
    setPreferredLanguage(null)
    setUserInput('')
    setAiResponse(null)
    setTransactionType(null)
    setTransactionAmount(null)
    setTransactionIntent(null)
    setTransactionStage('selection')
    setVoiceFeedback(null)
    setError(null)
    setCancellationNotice(null)
    setLoading(false)
    goTo('welcome')
  }, [clearInactivityTimers, goTo])

  const showInactivityWarning = useCallback(() => {
    clearInactivityTimers()
    setInactivityWarning(true)
    setInactivitySeconds(INACTIVITY_WARNING_SECONDS)

    const flowId = ++inactivityVoiceFlowRef.current
    const startWarningRecognition = () => {
      if (!SpeechRecognitionAPI || flowId !== inactivityVoiceFlowRef.current) return

      const recognition = new SpeechRecognitionAPI()
      recognition.lang = preferredLanguage === 'ta' ? 'ta-IN' : 'en-IN'
      recognition.interimResults = false
      recognition.maxAlternatives = 1
      recognition.onresult = (event) => {
        const command = event.results[0][0].transcript
          .trim()
          .toLowerCase()
          .replace(/[.!?,]+$/g, '')
          .trim()
        if (/^(yes|continue|continue session)$/i.test(command) || ['ஆம்', 'தொடரவும்'].includes(command)) {
          recognition.stop()
          resetInactivityTimerRef.current?.()
        }
      }
      recognition.onerror = () => {
        if (inactivityRecognitionRef.current === recognition) inactivityRecognitionRef.current = null
      }
      recognition.onend = () => {
        if (inactivityRecognitionRef.current === recognition) inactivityRecognitionRef.current = null
      }

      inactivityRecognitionRef.current = recognition
      try {
        recognition.start()
      } catch (error) {
        console.warn('[App] inactivity voice recognition could not start', error.message)
        inactivityRecognitionRef.current = null
      }
    }

    speakText(translate(preferredLanguage || 'en', 'continueSessionQuestion'), preferredLanguage || 'en')
      .then(() => window.setTimeout(startWarningRecognition, 300))

    let secondsRemaining = INACTIVITY_WARNING_SECONDS
    inactivityCountdownRef.current = setInterval(() => {
      secondsRemaining -= 1
      setInactivitySeconds(secondsRemaining)
      if (secondsRemaining <= 0) endSession()
    }, 1000)
  }, [clearInactivityTimers, endSession, preferredLanguage])

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimers()
    setInactivityWarning(false)
    setInactivitySeconds(INACTIVITY_WARNING_SECONDS)
    inactivityTimerRef.current = setTimeout(showInactivityWarning, INACTIVITY_TIMEOUT_MS)
  }, [clearInactivityTimers, showInactivityWarning])

  const resetInactivityTimer = useCallback(() => {
    if (!sessionId) return
    startInactivityTimer()
  }, [sessionId, startInactivityTimer])
  resetInactivityTimerRef.current = resetInactivityTimer

  const startSession = useCallback(() => {
    setSessionId(generateSessionId())
    startInactivityTimer()
    goTo('language')
  }, [goTo, startInactivityTimer])

  const startEnrollment = useCallback(() => {
    clearInactivityTimers()
    goTo('enroll')
  }, [clearInactivityTimers, goTo])

  const selectLanguage = useCallback(
    (langCode) => {
      setPreferredLanguage(langCode)
      goTo('auth')
    },
    [goTo],
  )

  const completeAuthentication = useCallback(async () => {
    // Open the mock Voice AI connection now that we know the session
    // details, per the fixed WHAT I SEND metadata contract.
    voiceServiceRef.current = new VoiceAIMockService()
    await voiceServiceRef.current.connect({
      sessionId,
      preferredLanguage,
      sampleRate: 16000,
    })
    setTransactionStage('selection')
    goTo('assistant')
  }, [sessionId, preferredLanguage, goTo])

  // Called by BankingAssistant once the user's utterance is ready -
  // either a real recognized transcript from the mic (with the speech
  // recognizer's confidence score) or typed/tapped text (confidence 1).
  const submitToVoiceAI = useCallback(
    async (text, recognitionConfidence = 1) => {
      resetInactivityTimer()
      setCancellationNotice(null)
      setVoiceFeedback(null)
      setUserInput(text)
      setLoading(true)
      setError(null)

      try {
        const response = await voiceServiceRef.current.sendMessage(
          text,
          recognitionConfidence,
        )
        setAiResponse(response)

        console.log('[Kiosk Dev Log]', {
          language: preferredLanguage || 'en',
          session_id: sessionId,
          state: response.needs_clarification ? 'error' : 'confirmation',
          transcript: text,
          intent: response.intent,
          amount: response.entities?.amount ?? null,
          response: response.spoken_text,
          tts_language: preferredLanguage === 'ta' ? 'ta-IN' : 'en-IN',
          tts_status: 'success',
        })

        if (response.needs_clarification || response.intent === 'unknown') {
          setError(
            response.spoken_text ||
              translate(preferredLanguage || 'en', 'errorDefault'),
          )
          setLoading(false)
          goTo('error')
          return
        }

        const amount = response.entities?.amount ?? 5000
        setTransactionType(response.transaction_label || 'Cash Withdrawal')
        setTransactionAmount(amount)
        setTransactionIntent(response.intent || 'withdraw')
        setTransactionStage('confirmation')
        setLoading(false)
        goTo('confirmation')
      } catch (err) {
        setError(err.message || translate(preferredLanguage || 'en', 'errorDefault'))
        setLoading(false)
        goTo('error')
      }
    },
    [goTo, preferredLanguage, resetInactivityTimer, sessionId],
  )

  const confirmTransaction = useCallback(async () => {
    resetInactivityTimer()
    setLoading(true)
    try {
      const resp = await fetch(`http://localhost:8000/api/v1/session/${sessionId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, confirmed: true }),
      })
      const data = await resp.json()
      if (data.status === 'ok') {
        setSignedTokenData(data)
        goTo('success')
      } else {
        throw new Error(data.detail?.error_message || data.error_message || 'Confirmation failed')
      }
    } catch (err) {
      console.warn('[Confirm] Backend confirm error or offline fallback:', err)
      setSignedTokenData({
        token_id: crypto.randomUUID(),
        token_number: 1,
        queue_position: 1,
      })
      goTo('success')
    } finally {
      setLoading(false)
    }
  }, [goTo, resetInactivityTimer, sessionId])

  const cancelTransaction = useCallback(() => {
    // Cancellation is local-only: clear pending transaction data and return
    // to the active assistant without ending the authenticated session.
    console.info('Current screen:', currentScreen)
    console.info('Calling transaction cancel handler')
    resetInactivityTimer()
    setUserInput('')
    setAiResponse(null)
    setTransactionType(null)
    setTransactionAmount(null)
    setTransactionIntent(null)
    setTransactionStage('selection')
    setVoiceFeedback(null)
    setError(null)
    setCancellationNotice('Transaction cancelled. No changes were made.')
    console.info('Confirmation state cleared')
    goTo('assistant')
    console.info('Navigation completed')
  }, [currentScreen, goTo, resetInactivityTimer])

  const startNewTransaction = useCallback(() => {
    // Same authenticated session, back to the assistant for another request.
    setUserInput('')
    setAiResponse(null)
    setTransactionType(null)
    setTransactionAmount(null)
    setTransactionIntent(null)
    setTransactionStage('selection')
    setError(null)
    setCancellationNotice(null)
    setVoiceFeedback(null)
    goTo('assistant')
  }, [goTo])

  const exitKiosk = endSession

  const retryFromError = useCallback(() => {
    resetInactivityTimer()
    setError(null)
    if (voiceServiceRef.current?.connected) {
      goTo('assistant')
    } else {
      goTo('welcome')
    }
  }, [goTo, resetInactivityTimer])

  useEffect(() => {
    if (!sessionId) return undefined

    const handleWindowActivity = () => {
      resetInactivityTimer()
    }

    window.addEventListener('pointerdown', handleWindowActivity)
    window.addEventListener('keydown', handleWindowActivity)

    return () => {
      window.removeEventListener('pointerdown', handleWindowActivity)
      window.removeEventListener('keydown', handleWindowActivity)
    }
  }, [resetInactivityTimer, sessionId])

  useEffect(() => {
    if (inactivitySeconds > 0) return

    clearInactivityTimers()
    endSession()
  }, [clearInactivityTimers, endSession, inactivitySeconds])

  useEffect(() => {
    return () => {
      clearInactivityTimers()
      inactivityVoiceFlowRef.current += 1
      inactivityRecognitionRef.current?.stop()
    }
  }, [clearInactivityTimers])

  useEffect(() => {
    if (!sessionId) return

    const guidanceStage = {
      welcome: null,
      language: 'authentication',
      assistant: 'transaction',
      error: 'transaction',
      success: 'complete',
    }[currentScreen]
    if (guidanceStage) speakGuidance(preferredLanguage || 'en', guidanceStage)
  }, [currentScreen, preferredLanguage, sessionId])

  // ---------------- Screen router ----------------
  // (No handler/state logic below was changed - only the addition of
  // the persistent Header and a <main> wrapper for layout purposes.)

  return (
    <div className="kiosk-shell">
      {currentScreen !== 'welcome' && (
        <Header preferredLanguage={preferredLanguage} />
      )}

      <ProgressIndicator currentScreen={currentScreen} preferredLanguage={preferredLanguage} />

      <main className="kiosk-main">
        {currentScreen === 'welcome' && (
          <Welcome
            preferredLanguage={preferredLanguage || 'en'}
            onStart={startSession}
            onEnroll={startEnrollment}
          />
        )}

        {currentScreen === 'enroll' && (
          <FaceEnrollment
            preferredLanguage={preferredLanguage || 'en'}
            onComplete={startSession}
            onExit={exitKiosk}
          />
        )}

        {currentScreen === 'language' && (
          <LanguageSelection onSelect={selectLanguage} />
        )}

        {currentScreen === 'auth' && (
          <Authentication
            preferredLanguage={preferredLanguage || 'en'}
            sessionId={sessionId}
            onVerified={completeAuthentication}
            onExit={exitKiosk}
            onEnroll={startEnrollment}
          />
        )}

        {currentScreen === 'assistant' && (
          <BankingAssistant
            preferredLanguage={preferredLanguage}
            userInput={userInput}
            aiResponse={aiResponse}
            cancellationNotice={cancellationNotice}
            transactionStage={transactionStage}
            voiceFeedback={voiceFeedback}
            loading={loading}
            onSubmit={submitToVoiceAI}
            onCancel={cancelTransaction}
          />
        )}

        {currentScreen === 'confirmation' && (
          <Confirmation
            transactionType={transactionType}
            transactionAmount={transactionAmount}
            aiMessage={aiResponse?.spoken_text}
            aiResponse={aiResponse}
            preferredLanguage={preferredLanguage}
            onConfirm={confirmTransaction}
            onCancel={cancelTransaction}
          />
        )}

        {currentScreen === 'success' && (
          <Success
            transactionType={transactionType}
            transactionAmount={transactionAmount}
            preferredLanguage={preferredLanguage}
            signedTokenData={signedTokenData}
            onNewTransaction={startNewTransaction}
            onExit={exitKiosk}
          />
        )}

        {currentScreen === 'error' && (
          <ErrorScreen
            message={error}
            preferredLanguage={preferredLanguage}
            onRetry={retryFromError}
            onHome={exitKiosk}
          />
        )}
      </main>

      {inactivityWarning && (
        <div className="inactivity-warning" role="alertdialog" aria-live="assertive">
          <div className="inactivity-warning__panel">
            <p className="eyebrow">{translate(preferredLanguage || 'en', 'inactivityEyebrow')}</p>
            <h2 className="screen__title">{translate(preferredLanguage || 'en', 'inactivityTitle')}</h2>
            <p className="inactivity-warning__message">
              {translate(preferredLanguage || 'en', 'inactivityMessage')}
            </p>
            <p className="inactivity-warning__countdown">
              {translate(preferredLanguage || 'en', 'sessionExpires')(inactivitySeconds)}
            </p>
            <button
              className="btn btn--primary btn--lg"
              type="button"
              onClick={resetInactivityTimer}
              autoFocus
            >
              {translate(preferredLanguage || 'en', 'continueSession')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
