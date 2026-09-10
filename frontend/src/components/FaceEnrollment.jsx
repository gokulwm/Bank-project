import { useState, useEffect, useRef } from 'react'
import { translate } from '../services/translations.js'

const FAKE_ACCOUNTS_URL = 'http://localhost:8002/face-auth/fake-accounts'
const ENROLL_URL = 'http://localhost:8002/face-auth/enroll'

const FALLBACK_ACCOUNTS = [
  { customer_id: 'acc_00981234', display_name: 'Test Customer 1' },
  { customer_id: 'acc_00981235', display_name: 'Test Customer 2' },
  { customer_id: 'acc_00981236', display_name: 'Test Customer 3' },
  { customer_id: 'acc_00981237', display_name: 'Test Customer 4' },
  { customer_id: 'acc_00981238', display_name: 'Test Customer 5' },
  { customer_id: 'acc_00981239', display_name: 'Test Customer 6' },
]

export default function FaceEnrollment({
  preferredLanguage = 'en',
  onComplete,
  onExit,
}) {
  // Steps: 'intro' | 'account' | 'capture' | 'success'
  const [currentStep, setCurrentStep] = useState('intro')
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [enrolledData, setEnrolledData] = useState(null)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  // Fetch preregistered fake accounts from Face Auth service
  useEffect(() => {
    let mounted = true
    async function fetchAccounts() {
      try {
        const resp = await fetch(FAKE_ACCOUNTS_URL)
        if (resp.ok) {
          const data = await resp.json()
          if (mounted && data.rows && data.rows.length > 0) {
            setAccounts(data.rows)
            setSelectedAccount(data.rows[0])
            setLoadingAccounts(false)
            return
          }
        }
      } catch (err) {
        console.warn('[FaceEnrollment] Could not fetch fake-accounts, using fallback:', err)
      }
      if (mounted) {
        setAccounts(FALLBACK_ACCOUNTS)
        setSelectedAccount(FALLBACK_ACCOUNTS[0])
        setLoadingAccounts(false)
      }
    }
    fetchAccounts()
    return () => {
      mounted = false
    }
  }, [])

  // Camera management for capture step
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraReady(false)
  }

  const startCamera = async () => {
    setErrorMessage(null)
    setCameraReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraReady(true)
    } catch (err) {
      console.error('[FaceEnrollment] Camera start error:', err)
      setErrorMessage(
        preferredLanguage === 'ta'
          ? 'கேமராவை அணுக முடியவில்லை. தயவுசெய்து கேமரா அனுமதியை சரிபார்க்கவும்.'
          : 'Could not access camera. Please allow camera permissions in your browser and try again.'
      )
    }
  }

  useEffect(() => {
    if (currentStep === 'capture') {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      stopCamera()
    }
  }, [currentStep])

  const captureFrameBase64 = () => {
    if (!videoRef.current || !canvasRef.current) return null
    const video = videoRef.current
    const canvas = canvasRef.current
    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
  }

  const handleCaptureAndEnroll = async () => {
    if (!selectedAccount) {
      setErrorMessage('Please select an account identity first.')
      return
    }

    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      const imageB64 = captureFrameBase64()
      if (!imageB64) {
        throw new Error('Could not capture frame from camera.')
      }

      const resp = await fetch(ENROLL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedAccount.customer_id,
          image_b64: imageB64,
        }),
      })

      const data = await resp.json()
      if (!resp.ok) {
        const detail = data.detail || (typeof data === 'string' ? data : 'Enrollment failed')
        throw new Error(detail)
      }

      setEnrolledData({
        customer_id: selectedAccount.customer_id,
        display_name: selectedAccount.display_name,
        timestamp: new Date().toLocaleTimeString(),
      })
      stopCamera()
      setCurrentStep('success')
    } catch (err) {
      console.error('[FaceEnrollment] Enrollment failed:', err)
      setErrorMessage(
        err.message ||
          (preferredLanguage === 'ta'
            ? 'முகப்பதிவு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.'
            : 'Enrollment failed. Please ensure your face is centered with good lighting and retry.')
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const stepsList = [
    { key: 'intro', label: translate(preferredLanguage, 'enrollStepIntro'), number: 1 },
    { key: 'account', label: translate(preferredLanguage, 'enrollStepAccount'), number: 2 },
    { key: 'capture', label: translate(preferredLanguage, 'enrollStepCapture'), number: 3 },
    { key: 'success', label: translate(preferredLanguage, 'enrollStepSuccess'), number: 4 },
  ]

  const currentStepIndex = stepsList.findIndex((s) => s.key === currentStep)

  return (
    <section className="screen screen--enroll">
      {/* Portal Top Progress Indicator */}
      <nav className="enroll-stepper" aria-label="Enrollment Steps">
        <ol className="enroll-stepper__list">
          {stepsList.map((step, idx) => {
            const isCurrent = idx === currentStepIndex
            const isCompleted = idx < currentStepIndex
            return (
              <li
                key={step.key}
                className={`enroll-stepper__item ${isCurrent ? 'is-current' : ''} ${isCompleted ? 'is-completed' : ''}`}
              >
                <div className="enroll-stepper__marker">
                  {isCompleted ? '✓' : step.number}
                </div>
                <span className="enroll-stepper__label">{step.label}</span>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* STEP 1: INTRO */}
      {currentStep === 'intro' && (
        <div className="enroll-card enroll-card--intro">
          <div className="enroll-intro__header">
            <p className="eyebrow">{translate(preferredLanguage, 'enrollEyebrow')}</p>
            <h2 className="screen__title">{translate(preferredLanguage, 'enrollIntroTitle')}</h2>
            <p className="screen__subtitle">{translate(preferredLanguage, 'enrollIntroSubtitle')}</p>
          </div>

          <div className="enroll-features-grid">
            <div className="enroll-feature-item">
              <div className="enroll-feature-item__icon">⚡</div>
              <div className="enroll-feature-item__content">
                <h3>{preferredLanguage === 'ta' ? '2 வினாடி அங்கீகாரம்' : '2-Second Verification'}</h3>
                <p>
                  {preferredLanguage === 'ta'
                    ? 'கேமராவைப் பார்த்து உடனடியாக உங்கள் வங்கி பரிவர்த்தனைகளைத் தொடங்குங்கள்.'
                    : 'Look at the camera for frictionless, instantaneous authentication.'}
                </p>
              </div>
            </div>

            <div className="enroll-feature-item">
              <div className="enroll-feature-item__icon">🔒</div>
              <div className="enroll-feature-item__content">
                <h3>{preferredLanguage === 'ta' ? 'குறியாக்கப்பட்ட உயிர்மொறி' : 'Encrypted ArcFace Vector'}</h3>
                <p>
                  {preferredLanguage === 'ta'
                    ? 'உங்கள் படம் பாதுகாப்பான கணித குறியீடாக மட்டுமே சேமிக்கப்படுகிறது.'
                    : 'Biometric embeddings are encrypted mathematically, never raw photos.'}
                </p>
              </div>
            </div>

            <div className="enroll-feature-item">
              <div className="enroll-feature-item__icon">🛡️</div>
              <div className="enroll-feature-item__content">
                <h3>{preferredLanguage === 'ta' ? 'பாதுகாப்பு & போலி தடுப்பு' : 'Active Anti-Spoofing'}</h3>
                <p>
                  {preferredLanguage === 'ta'
                    ? 'புகைப்படம் அல்லது வீடியோக்கள் மூலமாக நடைபெறும் போலியான உள்நுழைவுகளைத் தடுக்கிறது.'
                    : 'Protects your account against photos, video replays, and mask spoofing.'}
                </p>
              </div>
            </div>
          </div>

          <div className="enroll-actions-row">
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              onClick={onExit}
            >
              {translate(preferredLanguage, 'backToHome')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => setCurrentStep('account')}
            >
              {translate(preferredLanguage, 'getStarted')} →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: ACCOUNT SELECTION */}
      {currentStep === 'account' && (
        <div className="enroll-card enroll-card--account">
          <div className="enroll-header-compact">
            <p className="eyebrow">{translate(preferredLanguage, 'enrollEyebrow')}</p>
            <h2 className="screen__title">{translate(preferredLanguage, 'enrollSelectTitle')}</h2>
            <p className="screen__subtitle">{translate(preferredLanguage, 'enrollSelectSubtitle')}</p>
          </div>

          {loadingAccounts ? (
            <div className="enroll-loading-state">
              <div className="enroll-spinner" />
              <p>{preferredLanguage === 'ta' ? 'கணக்குகளை ஏற்றுகிறது...' : 'Loading demo accounts...'}</p>
            </div>
          ) : (
            <div className="enroll-account-grid">
              {accounts.map((acc, index) => {
                const isSelected = selectedAccount?.customer_id === acc.customer_id
                const initials = acc.display_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()

                return (
                  <button
                    key={acc.customer_id}
                    type="button"
                    className={`enroll-account-card ${isSelected ? 'enroll-account-card--selected' : ''}`}
                    onClick={() => setSelectedAccount(acc)}
                    aria-pressed={isSelected}
                  >
                    <div className="enroll-account-card__avatar">
                      {initials || `C${index + 1}`}
                    </div>
                    <div className="enroll-account-card__info">
                      <div className="enroll-account-card__name">{acc.display_name}</div>
                      <div className="enroll-account-card__id">{acc.customer_id}</div>
                    </div>
                    <div className="enroll-account-card__badge">
                      {isSelected ? (
                        <span className="badge-selected">✓ Selected</span>
                      ) : (
                        <span className="badge-ready">Select</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="enroll-actions-row">
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              onClick={() => setCurrentStep('intro')}
            >
              ← {translate(preferredLanguage, 'backStep')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!selectedAccount || loadingAccounts}
              onClick={() => setCurrentStep('capture')}
            >
              {translate(preferredLanguage, 'continueToCapture')} →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: GUIDED CAPTURE */}
      {currentStep === 'capture' && (
        <div className="enroll-card enroll-card--capture">
          <div className="enroll-header-compact">
            <p className="eyebrow">{translate(preferredLanguage, 'enrollEyebrow')}</p>
            <h2 className="screen__title">{translate(preferredLanguage, 'enrollCaptureTitle')}</h2>
            <p className="screen__subtitle">
              {preferredLanguage === 'ta'
                ? `இணைக்கப்படும் கணக்கு: ${selectedAccount?.display_name} (${selectedAccount?.customer_id})`
                : `Enrolling identity for: ${selectedAccount?.display_name} (${selectedAccount?.customer_id})`}
            </p>
          </div>

          <div className="enroll-capture-container">
            <div className="enroll-camera-viewport">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="enroll-camera-video"
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Centered Face Oval Framing Overlay */}
              <div className="face-guide-overlay">
                <div className="face-guide-oval">
                  <div className="face-guide-corner top-left" />
                  <div className="face-guide-corner top-right" />
                  <div className="face-guide-corner bottom-left" />
                  <div className="face-guide-corner bottom-right" />
                </div>
              </div>

              {/* Scanning Active Laser Effect */}
              {isSubmitting && (
                <div className="enroll-scan-laser" />
              )}

              {/* Framing Status Hint */}
              <div className="enroll-live-status">
                {isSubmitting ? (
                  <span className="status-pill status-pill--active">
                    <span className="status-dot-pulse" />
                    {translate(preferredLanguage, 'enrollingStatus')}
                  </span>
                ) : cameraReady ? (
                  <span className="status-pill status-pill--ready">
                    <span className="status-dot" />
                    {preferredLanguage === 'ta' ? 'முகத்தை வட்டத்தின் நடுவே வைக்கவும்' : 'Keep face centered in the oval'}
                  </span>
                ) : (
                  <span className="status-pill status-pill--waiting">
                    {preferredLanguage === 'ta' ? 'கேமரா தொடங்குகிறது...' : 'Starting camera feed...'}
                  </span>
                )}
              </div>
            </div>

            {/* Framing & Lighting Tips */}
            <div className="enroll-tips-panel">
              <h4>{preferredLanguage === 'ta' ? 'வழிகாட்டுதல் குறிப்புகள்' : 'Framing Guidelines'}</h4>
              <ul className="enroll-tips-list">
                <li>
                  <span className="tip-icon">☀️</span>
                  <span>{translate(preferredLanguage, 'tipLighting')}</span>
                </li>
                <li>
                  <span className="tip-icon">🎯</span>
                  <span>{translate(preferredLanguage, 'tipCenter')}</span>
                </li>
                <li>
                  <span className="tip-icon">👁️</span>
                  <span>{translate(preferredLanguage, 'tipHoldStill')}</span>
                </li>
              </ul>
            </div>
          </div>

          {errorMessage && (
            <div className="enroll-error-alert" role="alert">
              <div className="enroll-error-alert__icon">⚠️</div>
              <div className="enroll-error-alert__text">
                <strong>{preferredLanguage === 'ta' ? 'பதிவு பிழை' : 'Enrollment Issue'}</strong>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          <div className="enroll-actions-row">
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              disabled={isSubmitting}
              onClick={() => {
                setErrorMessage(null)
                setCurrentStep('account')
              }}
            >
              ← {translate(preferredLanguage, 'backStep')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg enroll-capture-btn"
              disabled={!cameraReady || isSubmitting}
              onClick={handleCaptureAndEnroll}
            >
              {isSubmitting ? (
                <span>⏳ {preferredLanguage === 'ta' ? 'பதிவு செய்கிறது...' : 'Registering...'}</span>
              ) : (
                <span>📸 {translate(preferredLanguage, 'captureAndEnroll')}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {currentStep === 'success' && (
        <div className="enroll-card enroll-card--success">
          <div className="enroll-success-icon-badge">
            <div className="success-checkmark">✓</div>
          </div>

          <div className="enroll-success-header">
            <p className="eyebrow">{translate(preferredLanguage, 'enrollEyebrow')}</p>
            <h2 className="screen__title">{translate(preferredLanguage, 'enrollSuccessTitle')}</h2>
            <p className="screen__subtitle">{translate(preferredLanguage, 'enrollSuccessSubtitle')}</p>
          </div>

          <div className="enroll-success-details-card">
            <div className="detail-row">
              <span className="detail-label">{preferredLanguage === 'ta' ? 'வாடிக்கையாளர் பெயர்' : 'Customer Name'}</span>
              <strong className="detail-value">{enrolledData?.display_name || selectedAccount?.display_name}</strong>
            </div>
            <div className="detail-row">
              <span className="detail-label">{preferredLanguage === 'ta' ? 'கணக்கு எண்' : 'Account ID'}</span>
              <span className="detail-code">{enrolledData?.customer_id || selectedAccount?.customer_id}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">{preferredLanguage === 'ta' ? 'உயிர்மொறி நிலை' : 'Biometric Status'}</span>
              <span className="detail-status-badge">✓ Active & Enrolled</span>
            </div>
          </div>

          <div className="enroll-actions-row">
            <button
              type="button"
              className="btn btn--ghost btn--lg"
              onClick={onExit}
            >
              {translate(preferredLanguage, 'returnHome')}
            </button>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={onComplete || onExit}
            >
              {translate(preferredLanguage, 'startBanking')} →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
