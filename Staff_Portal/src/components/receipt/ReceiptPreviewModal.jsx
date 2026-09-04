import React, { useState } from 'react';
import { formatCurrency, maskCustomerId, formatDateTime } from '../../utils/formatters';
import { printReceipt } from '../../services/printing/printService';
import { Printer, CheckCircle, X, Download } from 'lucide-react';

export const ReceiptPreviewModal = ({ isOpen, receiptData, onClose }) => {
  const [printStatus, setPrintStatus] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || !receiptData) return null;

  const handlePrintAction = async () => {
    setIsPrinting(true);
    setPrintStatus('Sending receipt to local python-escpos thermal printer service...');

    // 1. Call local Python ESC/POS print bridge
    const result = await printReceipt(receiptData);

    if (result.success && result.hardwareConnected) {
      setPrintStatus('✓ Thermal receipt printed via python-escpos hardware driver.');
    } else {
      setPrintStatus('Opening browser receipt print window...');
      // 2. Fallback to browser print window.print()
      setTimeout(() => {
        window.print();
      }, 300);
    }
    setIsPrinting(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 440 }}>
        <div className="modal-header flex justify-between items-center">
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#12355B' }}>
              Official Bank Receipt
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#64748B' }}>
              Nexa Bank Secure Operations Kiosk
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#64748B' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Receipt Printable Container */}
          <div 
            id="printable-receipt-section"
            style={{ 
              backgroundColor: '#FAFAFA', 
              border: '1px dashed #CBD5E1', 
              padding: '1.5rem',
              borderRadius: 'var(--radius-sm)',
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '0.85rem'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: 1 }}>NEXA BANK</div>
              <div style={{ fontSize: '0.75rem', color: '#475569' }}>SECURE TRANSACTION RECEIPT</div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '0.2rem' }}>Branch 014 · Terminal ST-042</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
              <div className="flex justify-between">
                <span>Token ID:</span>
                <span style={{ fontWeight: 600 }}>{receiptData.token_id?.slice(0, 14)}...</span>
              </div>
              <div className="flex justify-between">
                <span>Customer:</span>
                <span style={{ fontWeight: 600 }}>{maskCustomerId(receiptData.customer_display_name)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transaction:</span>
                <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{receiptData.transaction_type}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span style={{ fontWeight: 700 }}>{formatCurrency(receiptData.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span style={{ fontWeight: 700, color: '#059669' }}>✓ COMPLETED</span>
              </div>
              <div className="flex justify-between">
                <span>Issued At:</span>
                <span>{formatDateTime(receiptData.issued_at || new Date().toISOString())}</span>
              </div>
              <div className="flex justify-between">
                <span>Staff ID:</span>
                <span>STAFF-042</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', borderTop: '1px solid #E2E8F0', paddingTop: '0.75rem', fontSize: '0.75rem', color: '#64748B' }}>
              <div>================================</div>
              <div style={{ fontWeight: 700, margin: '0.2rem 0' }}>THANK YOU FOR BANKING WITH US</div>
              <div>================================</div>
            </div>
          </div>

          {printStatus && (
            <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#1E4976', textAlign: 'center', fontStyle: 'italic' }}>
              {printStatus}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={handlePrintAction} disabled={isPrinting}>
            <Printer size={16} />
            <span>{isPrinting ? 'Printing...' : 'Print Receipt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
