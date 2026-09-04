import React, { useState, useEffect } from 'react';
import { useQueue } from '../../state/QueueContext';
import { verifyToken, markTokenUsed, markTokenCancelled, completeTransaction } from '../../services/verification/verificationService';
import { TokenScanner } from '../../components/scanner/TokenScanner';
import { VerificationPanel } from '../../components/verification/VerificationPanel';
import { SecurityStatusCard } from '../../components/verification/SecurityStatusCard';
import { ConfirmationModal } from '../../components/receipt/ConfirmationModal';
import { ReceiptPreviewModal } from '../../components/receipt/ReceiptPreviewModal';
import { QueueCalledAlert } from '../../components/queue/QueueCalledAlert';
import { wsClient } from '../../services/websocket/wsClient';

export const VerificationPage = ({ simulatedQrPayload }) => {
  const { queueMap, addAuditLog } = useQueue();
  const [verificationState, setVerificationState] = useState('READY'); // READY, VERIFYING, VERIFIED, INVALID, EXPIRED, ALREADY_USED, INSUFFICIENT_FUNDS
  const [activePayload, setActivePayload] = useState(null);
  const [verifiedData, setVerifiedData] = useState(null);
  const [lastVerifiedTime, setLastVerifiedTime] = useState('');

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [completedReceiptData, setCompletedReceiptData] = useState(null);

  const handleScanSuccess = async (scannedRawText) => {
    if (!scannedRawText) return;
    setVerificationState('VERIFYING');
    addAuditLog('QR Scanned', `Scanned raw token payload: ${scannedRawText.slice(0, 25)}...`);

    const result = await verifyToken(scannedRawText);

    if (result.status === 'VERIFIED') {
      const existingInQueue = Object.values(queueMap).find(
        (q) => q.token_id === result.token_id
      );

      const matchingQueue = {
        token_id: result.token_id || existingInQueue?.token_id || `TXN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        token: result.token || existingInQueue?.token,
        customer_display_name: result.customer_display_name || existingInQueue?.customer_display_name || `Customer #${(result.token_id || '4821').slice(-4)}`,
        transaction_type: result.transaction_type || existingInQueue?.transaction_type || 'withdraw',
        amount: result.amount !== undefined ? result.amount : (existingInQueue?.amount !== undefined ? existingInQueue.amount : 5000),
        // account_balance is bank-internal only — never forwarded to receipt
        account_balance: result.account_balance !== undefined ? result.account_balance : (existingInQueue?.account_balance || 150000),
        // Do NOT default to 1 — let QueueContext's nextPosition() assign a proper unique number
        queue_position: result.queue_position || existingInQueue?.queue_position || undefined
      };

      setVerifiedData(matchingQueue);
      setVerificationState('VERIFIED');
      setLastVerifiedTime(new Date().toLocaleTimeString());
      addAuditLog('Token Verified', `HMAC verified signature for token ${matchingQueue.token_id}`);
    } else {
      setVerificationState(result.status);
      addAuditLog('Verification Failed', result.message || 'Invalid or expired token.');

      if (result.status === 'EXPIRED' && result.token_id) {
        wsClient.emitDevEvent({
          event: 'token_expired',
          token_id: result.token_id
        });
      }
    }
  };

  useEffect(() => {
    if (simulatedQrPayload) {
      handleScanSuccess(simulatedQrPayload);
    }
  }, [simulatedQrPayload]);

  const handleSelectFromQueueAlert = (queueEntry) => {
    handleScanSuccess(JSON.stringify({ token_id: queueEntry.token_id, token: 'VALID_HMAC_SIG' }));
  };

  const handleConfirmTransaction = async () => {
    setIsConfirmModalOpen(false);

    if (!verifiedData) return;

    // Emit transaction_completed event via WS with full details so QueueContext updates ledger/receipts/dashboard
    // Omit queue_position if unknown — QueueContext will assign the correct next position
    const eventPayload = {
      event: 'transaction_completed',
      token_id: verifiedData.token_id,
      customer_display_name: verifiedData.customer_display_name,
      transaction_type: verifiedData.transaction_type,
      amount: verifiedData.amount,
    };
    if (verifiedData.queue_position) {
      eventPayload.queue_position = verifiedData.queue_position;
    }
    await wsClient.emitDevEvent(eventPayload);

    // Complete transaction with Backend
    await completeTransaction(verifiedData.token_id);

    // Mark the token as spent — any future scan of the same QR will be rejected as ALREADY_USED
    markTokenUsed(verifiedData);
    addAuditLog('Staff Confirmed', `Transaction ${verifiedData.token_id} authorized by Teller ST-042. Token invalidated for reuse.`);

    // Explicitly strip account_balance — it is bank-internal and must NEVER appear on the customer receipt
    // eslint-disable-next-line no-unused-vars
    const { account_balance: _stripped, ...receiptSafeData } = verifiedData;
    setCompletedReceiptData(receiptSafeData);
    setIsReceiptModalOpen(true);
    setVerificationState('READY');
    setVerifiedData(null);
  };

  const handleCancelAndInvalidateTransaction = async () => {
    if (!verifiedData) return;

    const cancelledTokenId = verifiedData.token_id;

    // 1. Mark token as cancelled in sessionStorage registry so scanning it again returns status: 'INVALID'
    markTokenCancelled(verifiedData);

    // 2. Add Audit log entry
    addAuditLog('Transaction Cancelled', `Transaction ${cancelledTokenId} cancelled by teller ST-042. QR token permanently cancelled & invalidated.`);

    // 3. Emit Dev Event / WS event so queue entry is removed/expired
    await wsClient.emitDevEvent({
      event: 'token_expired',
      token_id: cancelledTokenId
    });

    // 4. Reset Verification Panel state to READY
    setIsConfirmModalOpen(false);
    setVerificationState('READY');
    setVerifiedData(null);
  };

  return (
    <div>
      <QueueCalledAlert onProceedToVerification={handleSelectFromQueueAlert} />

      <div className="verification-grid">
        <TokenScanner 
          onScanSuccess={handleScanSuccess} 
          onScanError={(err) => addAuditLog('Camera Error', err.message)} 
        />

        <VerificationPanel 
          verificationState={verificationState}
          verifiedData={verifiedData}
          onConfirmClick={() => setIsConfirmModalOpen(true)}
          onCancelClick={handleCancelAndInvalidateTransaction}
          onResetScan={() => {
            setVerificationState('READY');
            setVerifiedData(null);
          }}
        />
      </div>

      <SecurityStatusCard 
        lastVerifiedTime={lastVerifiedTime}
        isTokenVerified={verificationState === 'VERIFIED'}
      />

      <ConfirmationModal 
        isOpen={isConfirmModalOpen}
        transactionData={verifiedData}
        onCancel={() => setIsConfirmModalOpen(false)}
        onCancelAndDelete={handleCancelAndInvalidateTransaction}
        onConfirm={handleConfirmTransaction}
      />

      <ReceiptPreviewModal 
        isOpen={isReceiptModalOpen}
        receiptData={completedReceiptData}
        onClose={() => setIsReceiptModalOpen(false)}
      />
    </div>
  );
};
