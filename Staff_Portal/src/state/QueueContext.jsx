import React, { createContext, useContext, useEffect, useState } from 'react';
import { wsClient } from '../services/websocket/wsClient';

const QueueContext = createContext({
  queueMap: {},
  queueList: [],
  selectedTokenId: null,
  setSelectedTokenId: () => {},
  auditLogs: [],
  addAuditLog: () => {},
  currentTellerId: 't_02'
});

const initialSeedAuditLogs = [
  {
    id: 1,
    time: new Date().toLocaleTimeString(),
    event: 'System Init',
    details: 'Teller Terminal ST-042 initialized and connected to branch WebSocket server.'
  }
];

export const QueueProvider = ({ children }) => {
  const [queueMap, setQueueMap] = useState({});
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [auditLogs, setAuditLogs] = useState(initialSeedAuditLogs);
  const currentTellerId = 't_02';

  const addAuditLog = (event, details) => {
    const newEntry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      event,
      details
    };
    setAuditLogs((prev) => [newEntry, ...prev]);
  };

  useEffect(() => {
    const unsubscribe = wsClient.onMessage((data) => {
      if (!data || !data.event) return;

      const eventType = data.event;
      const tokenId = data.token_id;

      if (!tokenId) {
        console.warn('[QueueContext] Event missing token_id:', data);
        return;
      }

      setQueueMap((prevMap) => {
        const nextMap = { ...prevMap };
        const existing = nextMap[tokenId] || {};

        const nextPosition = () => {
          const maxPos = Object.values(nextMap).reduce((m, e) => Math.max(m, e.queue_position || 0), 0);
          return maxPos + 1;
        };

        if (eventType === 'new_queue_entry') {
          const pos = data.queue_position || existing.queue_position || nextPosition();
          nextMap[tokenId] = {
            ...existing,
            token_id: data.token_id,
            customer_display_name: data.customer_display_name || existing.customer_display_name || `Customer #${tokenId.slice(-4)}`,
            transaction_type: data.transaction_type || existing.transaction_type || 'withdraw',
            amount: data.amount !== undefined ? data.amount : (existing.amount !== undefined ? existing.amount : 5000),
            queue_position: pos,
            issued_at: data.issued_at || new Date().toISOString(),
            ui_status: 'WAITING'
          };
          addAuditLog('New Queue Entry', `${data.customer_display_name || tokenId} joined queue at position #${pos}`);
        } else if (eventType === 'queue_called') {
          const pos = existing.queue_position || nextPosition();
          nextMap[tokenId] = {
            ...existing,
            token_id: tokenId,
            customer_display_name: data.customer_display_name || existing.customer_display_name || `Customer #${tokenId.slice(-4)}`,
            transaction_type: data.transaction_type || existing.transaction_type || 'withdraw',
            amount: data.amount !== undefined ? data.amount : (existing.amount !== undefined ? existing.amount : 5000),
            queue_position: pos,
            issued_at: existing.issued_at || new Date().toISOString(),
            ui_status: 'CALLED',
            called_teller_id: data.teller_id || 't_02'
          };
          addAuditLog('Queue Called', `Customer token ${tokenId.slice(0, 8)} called by Teller ${data.teller_id || 't_02'}`);
        } else if (eventType === 'transaction_completed') {
          const pos = data.queue_position || existing.queue_position || nextPosition();
          nextMap[tokenId] = {
            ...existing,
            token_id: tokenId,
            customer_display_name: data.customer_display_name || existing.customer_display_name || `Customer #${tokenId.slice(-4)}`,
            transaction_type: data.transaction_type || existing.transaction_type || 'withdraw',
            amount: data.amount !== undefined ? data.amount : (existing.amount !== undefined ? existing.amount : 5000),
            queue_position: pos,
            issued_at: existing.issued_at || new Date().toISOString(),
            ui_status: 'COMPLETED',
            completed_at: new Date().toISOString()
          };
          addAuditLog('Transaction Completed', `Token ${tokenId.slice(0, 8)} completed successfully.`);
        } else if (eventType === 'token_expired') {
          const pos = existing.queue_position || nextPosition();
          nextMap[tokenId] = {
            ...existing,
            token_id: tokenId,
            customer_display_name: data.customer_display_name || existing.customer_display_name || `Customer #${tokenId.slice(-4)}`,
            transaction_type: data.transaction_type || existing.transaction_type || 'withdraw',
            amount: data.amount !== undefined ? data.amount : (existing.amount !== undefined ? existing.amount : 5000),
            queue_position: pos,
            issued_at: existing.issued_at || new Date().toISOString(),
            ui_status: 'EXPIRED'
          };
          addAuditLog('Token Expired', `Token ${tokenId.slice(0, 8)} marked EXPIRED by backend.`);
        }

        return nextMap;
      });
    });

    return () => unsubscribe();
  }, []);

  const queueList = Object.values(queueMap).sort((a, b) => (a.queue_position || 99) - (b.queue_position || 99));

  return (
    <QueueContext.Provider
      value={{
        queueMap,
        queueList,
        selectedTokenId,
        setSelectedTokenId,
        auditLogs,
        addAuditLog,
        currentTellerId
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => useContext(QueueContext);
