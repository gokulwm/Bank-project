import { useEffect, useRef, useState } from 'react'
import { translate } from '../services/translations.js'
import { speakText } from '../services/ttsService.js'

const FACE_AUTH_URL = window?.ENV?.FACE_AUTH_URL || 'http://localhost:8002/face-auth/verify-event'
const ENROLL_PORTAL_URL = 'http://localhost:8002/face-auth/enroll'

export default function Authentication({ preferredLanguage = 'en', sessionId, onVerified, onExit }) {
  // 'waiting' -> 'scanning' -> 'verified' | 'failed'
  const [stage, setStage] = useState('waiting')
  const [errorMessage, setErrorMessage] = useState(null)
  const [matchedUser, setMatchedUser] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const isPlayingRef = useRef(false)
  const streamRef = useRef(null)

  const speakAuthText = async (keyOrText) => {
    const text = translate(preferredLanguage, keyOrText) || keyOrText
    if (isPlayingRef.current) return
    isPlayingRef.current = true
    try {
      await speakText(text, preferredLanguage)
    } catch (e) {
      console.warn(`[AUTH-TTS] error speaking ${keyOrText}:`, e)
    } finally {
      isPlayingRef.current = false
    }
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.warn('[FaceAuth] Camera access warning:', err.message)
      setErrorMessage(
        preferredLanguage === 'ta'
          ? 'கேமரா அணுகல் தேவை. தயவுசெய்து கேமராவை அனுமதிக்கவும்.'
          : 'Camera access is required for biometric authentication. Please allow camera permissions.'
      )
      setStage('failed')
    }
  }

  const captureFrames = (count = 12) => {
    const frames = []
    if (!videoRef.current || !canvasRef.current) return frames
    const canvas = canvasRef.current
    const video = videoRef.current
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')

    for (let i = 0; i < count; i++) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const b64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
      frames.push(b64)
    }
    return frames
  }

  const runFaceVerification = async () => {
    setStage('scanning')
    setErrorMessage(null)
    speakAuthText('scanningIdentity')

    try {
      const frames = captureFrames(12)

      if (!frames || frames.length === 0 || !frames[0]) {
        setStage('failed')
        const msg = preferredLanguage === 'ta'
          ? 'கேமராவிலிருந்து படம் எடுக்க முடியவில்லை. கேமராவை அனுமதித்து மீண்டும் முயற்சிக்கவும்.'
          : 'Unable to capture camera feed. Please allow camera access and look directly at the lens.'
        setErrorMessage(msg)
        speakAuthText(msg)
        return
      }

      let resp
      try {
        resp = await fetch(FACE_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId || crypto.randomUUID(),
            frames_b64: frames,
          }),
        })
      } catch (netErr) {
        console.error('[FaceAuth] Remote verification service unreachable:', netErr)
        setStage('failed')
        const msg = preferredLanguage === 'ta'
          ? 'முக அங்கீகார சேவை கிடைக்கவில்லை. சேவை இயங்குகிறதா என்பதை உறுதிப்படுத்தவும் (Port 8002).'
          : 'Face authentication service unreachable. Ensure Face Auth service is running on port 8002.'
        setErrorMessage(msg)
        speakAuthText(msg)
        return
      }

      if (!resp.ok) {
        setStage('failed')
        const msg = preferredLanguage === 'ta'
          ? 'முக அங்கீகாரத்தில் பிழை ஏற்பட்டது. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.'
          : 'Face authentication service returned an error. Please try again.'
        setErrorMessage(msg)
        speakAuthText(msg)
        return
      }

      const data = await resp.json()
      console.log('[FaceAuth Response]', data)

      if (data.auth_status === 'pass' && data.customer_id) {
        setStage('verified')
        setMatchedUser(data.customer_id)
        speakAuthText('identityVerified')
        setTimeout(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
          }
          onVerified(data.customer_id)
        }, 1200)
      } else {
        setStage('failed')
        const failureReason = data.feedback || (
          preferredLanguage === 'ta'
            ? 'முகம் அடையாளம் காணப்படவில்லை. பதிவு செய்யப்பட்ட வாடிக்கையாளர்கள் மட்டுமே பண பரிவர்த்தனை செய்ய முடியும்.'
            : 'Face not recognized. Only enrolled customers are permitted to access transactions.'
        )
        setErrorMessage(failureReason)
        speakAuthText(failureReason)
      }
    } catch (err) {
      console.error('[FaceAuth] Verification execution error:', err)
      setStage('failed')
      setErrorMessage(err.message || 'Verification error')
    }
  }

  useEffect(() => {
    startCamera()
    speakAuthText('faceCamera')

    // Auto trigger verification after 1.5s
    const timer = setTimeout(() => {
      runFaceVerification()
    }, 1500)

    return () => {
      clearTimeout(timer)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [preferredLanguage])

  const steps = [
    { key: 'waiting', label: translate(preferredLanguage, 'readyToVerify') },
    { key: 'scanning', label: translate(preferredLanguage, 'scanningIdentity') },
    { key: 'verified', label: translate(preferredLanguage, 'identityVerified') },
  ]

  const stageIndex = steps.findIndex((s) => s.key === stage)

  return (
    <section className="screen screen--auth">
      <div className="auth-split">
        <div className="auth-left">
          <p className="eyebrow">{translate(preferredLanguage, 'stepAuthentication')}</p>
          <h2 className="screen__title">{translate(preferredLanguage, 'step2Title')}</h2>
          <p className="screen__subtitle">
            {preferredLanguage === 'ta'
              ? 'முக அங்கீகாரம் மூலம் அடையாளம் காணப்படுகிறீர்கள் (பதிவு செய்த வாடிக்கையாளர்களுக்கு மட்டும்)'
              : 'Face biometric verification (enrolled customers only)'}
          </p>

          <ul className="auth-steps">
            {steps.map((step, i) => (
              <li
                key={step.key}
                className={
                  i < stageIndex ? 'is-done' : i === stageIndex ? 'is-active' : ''
                }
              >
                <span className="step-dot" aria-hidden="true" />
                {step.label}
              </li>
            ))}
          </ul>

          {matchedUser && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', color: '#10b981' }}>
              ✓ Customer Identified: <strong>{matchedUser}</strong>
            </div>
          )}

          {stage === 'failed' && (
            <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid #ef4444', borderRadius: '12px', color: '#ef4444' }}>
              <div style={{ fontWeight: '700', fontSize: '1rem', marginBottom: '6px' }}>
                ❌ {translate(preferredLanguage, 'faceAuthFailedTitle') || 'Face Verification Failed'}
              </div>
              <p style={{ margin: '0 0 10px', fontSize: '0.92rem', color: '#fca5a5', lineHeight: 1.4 }}>
                {errorMessage}
              </p>
              <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                {translate(preferredLanguage, 'faceNotEnrolled')}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a
                  href={ENROLL_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#2563eb',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: '600',
                    fontSize: '0.92rem',
                  }}
                >
                  📸 {translate(preferredLanguage, 'openEnrollPortal') || 'Open Face Enrollment Portal'} ↗
                </a>

                <button
                  type="button"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#ef4444',
                    color: '#fff',
                    border: 0,
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.92rem',
                  }}
                  onClick={runFaceVerification}
                >
                  🔄 {translate(preferredLanguage, 'retryFaceScan') || 'Retry Face Scan'}
                </button>

                {onExit && (
                  <button
                    type="button"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'transparent',
                      color: '#94a3b8',
                      border: '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                    }}
                    onClick={onExit}
                  >
                    🏠 {translate(preferredLanguage, 'returnHome') || 'Return to Home'}
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="auth-security-note" style={{ marginTop: '16px' }}>
            {translate(preferredLanguage, 'securityNote')}
          </p>
        </div>

        <div className="auth-right">
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px', borderRadius: '16px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', background: '#000', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            {stage === 'scanning' && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#22d3ee', boxShadow: '0 0 12px #22d3ee', animation: 'scanMove 2s infinite ease-in-out' }} />
            )}

            {stage === 'verified' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>
                ✓
              </div>
            )}

            {stage === 'failed' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(239, 68, 68, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem' }}>
                ✗
              </div>
            )}
          </div>

          <p className="scanner__status" style={{ marginTop: '12px' }}>
            {stage === 'waiting' && (preferredLanguage === 'ta' ? 'கேமராவைப் பாருங்கள்...' : 'Looking for face...')}
            {stage === 'scanning' && translate(preferredLanguage, 'scanningIdentity')}
            {stage === 'verified' && translate(preferredLanguage, 'identityVerified')}
            {stage === 'failed' && (preferredLanguage === 'ta' ? 'சரிபார்ப்பு தோல்வியடைந்தது — பதிவு செய்த பின் முயற்சிக்கவும்' : 'Authentication failed — please enroll or retry')}
          </p>
        </div>
      </div>
    </section>
  )
}
