import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Upload, ArrowRight, Keyboard } from 'lucide-react';

export const TokenScanner = ({ onScanSuccess, onScanError }) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraState, setCameraState] = useState('CAMERA_READY'); // CAMERA_READY, SCANNING, ERROR
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [manualTokenId, setManualTokenId] = useState('');
  const qrScannerRef = useRef(null);

  const startScanner = async () => {
    setErrorMessage('');
    setCameraState('SCANNING');

    try {
      if (!qrScannerRef.current) {
        qrScannerRef.current = new Html5Qrcode('qr-reader-element');
      }

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const boxSize = Math.max(180, Math.floor(minDim * 0.75));
          return { width: boxSize, height: boxSize };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      await qrScannerRef.current.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          console.log('[QR Code Scanned]:', decodedText);
          if (onScanSuccess) {
            onScanSuccess(decodedText);
          }
        },
        (scanError) => {
          // ignore frame read failures
        }
      );
      setIsCameraActive(true);
    } catch (err) {
      console.error('[Camera Access Error]:', err);
      setCameraState('ERROR');
      setIsCameraActive(false);
      setErrorMessage('Camera access unavailable or permission denied. Try manual entry or upload.');
      if (onScanError) onScanError(err);
    }
  };

  const stopScanner = async () => {
    if (qrScannerRef.current && isCameraActive) {
      try {
        await qrScannerRef.current.stop();
        setIsCameraActive(false);
        setCameraState('CAMERA_READY');
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFileName(file.name);

    try {
      const tempScanner = new Html5Qrcode('qr-reader-file-temp');
      const decodedText = await tempScanner.scanFile(file, true);
      console.log('[QR Image Upload Scanned]:', decodedText);

      if (onScanSuccess) {
        onScanSuccess(decodedText);
      }
      tempScanner.clear();
    } catch (err) {
      console.error('[QR Image Decode Error]:', err);
      alert('Could not decode QR code from selected image. Please ensure the image is clear or enter Token ID manually.');
    } finally {
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualTokenId.trim()) return;
    if (onScanSuccess) {
      onScanSuccess(manualTokenId.trim());
    }
  };

  useEffect(() => {
    return () => {
      if (qrScannerRef.current && isCameraActive) {
        qrScannerRef.current.stop().catch(() => {});
      }
    };
  }, [isCameraActive]);

  return (
    <div className="card">
      <div className="card-title flex items-center justify-between">
        <span>Scan Customer QR Token</span>
        <span 
          style={{ 
            fontSize: '0.75rem', 
            fontWeight: 600,
            padding: '0.2rem 0.6rem',
            borderRadius: 12,
            backgroundColor: isCameraActive ? '#ECFDF5' : '#F1F5F9',
            color: isCameraActive ? '#059669' : '#64748B'
          }}
        >
          {isCameraActive ? '● Camera Active' : cameraState === 'ERROR' ? '✕ Camera Access Denied' : 'Camera Ready'}
        </span>
      </div>
      <div className="card-subtitle">
        Scan the printed receipt QR token, upload an image, or enter Token ID manually.
      </div>

      <div className="scanner-container">
        <div id="qr-reader-element" style={{ width: '100%', height: '100%' }} />
        <div id="qr-reader-file-temp" style={{ display: 'none' }} />

        {/* Framing & Laser Overlay */}
        {isCameraActive && (
          <div className="scanner-frame-overlay">
            <div className="corner-bracket corner-tl" />
            <div className="corner-bracket corner-tr" />
            <div className="corner-bracket corner-bl" />
            <div className="corner-bracket corner-br" />
            <div className="scan-line" />
          </div>
        )}

        {!isCameraActive && cameraState !== 'ERROR' && (
          <div className="flex flex-col items-center gap-3" style={{ color: '#94A3B8' }}>
            <Camera size={48} style={{ opacity: 0.6 }} />
            <p style={{ fontSize: '0.85rem' }}>Camera Stream Standby</p>
          </div>
        )}

        {cameraState === 'ERROR' && (
          <div className="flex flex-col items-center gap-3" style={{ color: '#EF4444', padding: '1.5rem', textAlign: 'center' }}>
            <CameraOff size={44} />
            <p style={{ fontSize: '0.85rem' }}>{errorMessage}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: '1.25rem' }}>
        {!isCameraActive ? (
          <button className="btn btn-primary" onClick={startScanner}>
            <Camera size={16} />
            <span>Start Camera</span>
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={stopScanner}>
            <CameraOff size={16} />
            <span>Stop Camera</span>
          </button>
        )}

        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          <Upload size={16} />
          <span>{uploadedFileName ? `Re-upload (${uploadedFileName.slice(0, 12)}...)` : 'Upload Image'}</span>
          <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Manual Token ID Entry */}
      <form onSubmit={handleManualSubmit} style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Keyboard size={14} />
          <span>Or Manual Token ID Entry:</span>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Paste token_id or JSON payload..." 
            value={manualTokenId}
            onChange={(e) => setManualTokenId(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.75rem',
              fontSize: '0.85rem',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid #CBD5E1',
              fontFamily: 'monospace'
            }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}>
            <span>Verify</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </div>
  );
};
