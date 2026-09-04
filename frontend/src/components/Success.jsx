import { useEffect } from 'react'
import { translate } from '../services/translations.js'
import { speakGuidance } from '../services/ttsService.js'

export default function Success({
  transactionType,
  transactionAmount,
  preferredLanguage,
  signedTokenData,
  onNewTransaction,
  onExit,
}) {
  useEffect(() => {
    speakGuidance(preferredLanguage || 'en', 'complete')
  }, [preferredLanguage])

  const transactionTypeLabel =
    transactionType === 'Cash Withdrawal'
      ? translate(preferredLanguage, 'labelWithdraw')
      : transactionType === 'Cash Deposit'
        ? translate(preferredLanguage, 'labelDeposit')
        : transactionType === 'Money Transfer'
          ? translate(preferredLanguage, 'labelSend')
          : transactionType || '—'

  const tokenNumber = signedTokenData?.token_number || 1
  const qrImage = signedTokenData?.qr_image_base64

  const handlePrint = () => {
    window.print()
  }

  return (
    <section className="screen screen--success">
      <div className="success-stage" aria-hidden="true">
        <span className="success-stage__ring" />
        <span className="success-stage__ring success-stage__ring--2" />
        <span className="success-stage__ring success-stage__ring--3" />
        <div className="success-stage__icon">
          <svg viewBox="0 0 64 64" width="52" height="52" fill="none">
            <circle cx="32" cy="32" r="24" stroke="#34d399" strokeWidth="3" />
            <path
              d="M22 33l7 7 14-14"
              stroke="#34d399"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <p className="eyebrow">{translate(preferredLanguage, 'stepComplete')}</p>
      <h2 className="screen__title">{translate(preferredLanguage, 'transactionSuccessful')}</h2>
      <p className="success__lede">
        {preferredLanguage === 'ta' ? `உங்கள் டோக்கன் எண்: ${tokenNumber}. தயவுசெய்து ரசீதை பெற்றுக்கொள்ளுங்கள்.` : `Your Token Number is ${tokenNumber}. Please collect your printed receipt.`}
      </p>

      {/* 58mm Thermal Receipt Slip */}
      <div
        className="thermal-slip"
        style={{
          margin: '20px auto',
          maxWidth: '320px',
          background: '#fff',
          color: '#111',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          fontFamily: 'monospace',
          textAlign: 'center',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', borderBottom: '1px dashed #444', paddingBottom: '8px', marginBottom: '8px' }}>
          AI SMART BANK KIOSK
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#0f766e', margin: '8px 0' }}>
          TOKEN {tokenNumber}
        </div>
        <div style={{ textAlign: 'left', margin: '12px 0', lineHeight: '1.6' }}>
          <div><strong>Date:</strong> {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</div>
          <div><strong>Account:</strong> 3155XXXX4787</div>
          <div><strong>Type:</strong> {transactionTypeLabel}</div>
          <div><strong>Amount:</strong> {transactionAmount != null ? `₹${transactionAmount.toLocaleString('en-IN')}` : '—'}</div>
          <div><strong>Token ID:</strong> <span style={{ fontSize: '0.7rem' }}>{signedTokenData?.token_id || 'tok_ephemeral'}</span></div>
        </div>

        {qrImage ? (
          <div style={{ margin: '14px 0' }}>
            <img
              src={`data:image/png;base64,${qrImage}`}
              alt="Signed Security QR"
              style={{ width: '160px', height: '160px', display: 'inline-block', border: '1px solid #ddd' }}
            />
            <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>[HMAC-SHA256 Signed Security QR]</div>
          </div>
        ) : (
          <div style={{ padding: '16px', background: '#f5f5f5', border: '1px dashed #ccc', margin: '12px 0' }}>
            [Security Signed QR Code]
          </div>
        )}

        <div style={{ marginTop: '16px', borderTop: '1px dashed #444', paddingTop: '12px', textAlign: 'left' }}>
          <div style={{ fontSize: '0.75rem', marginBottom: '24px' }}>Customer Signature:</div>
          <div style={{ borderBottom: '1px solid #333', width: '100%', height: '1px' }}></div>
        </div>
        <div style={{ fontSize: '0.7rem', color: '#555', marginTop: '10px' }}>
          Present this slip to the bank teller counter.
        </div>
      </div>

      <div className="action-bar" style={{ marginTop: '20px' }}>
        <button className="btn btn--secondary btn--lg" onClick={handlePrint}>
          🖨 {preferredLanguage === 'ta' ? 'ரசீதை அச்சிடுக' : 'Print Slip'}
        </button>
        <button className="btn btn--ghost btn--lg" onClick={onExit}>
          {translate(preferredLanguage, 'exitSession')}
        </button>
        <button className="btn btn--primary btn--lg" onClick={onNewTransaction}>
          {translate(preferredLanguage, 'newTransaction')}
        </button>
      </div>
    </section>
  )
}
