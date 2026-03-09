/**
 * Hook useFeedbackFlow — encapsula feedback en tiempo real y cola local.
 */
import { useState, useCallback, useEffect } from 'react';
import { sendFeedback, enqueueFeedback, getFeedbackQueue, flushFeedbackQueue } from '../services/api';
import { updateHistoryByInputId } from '../utils/storage';

export function useFeedbackFlow() {
  const [feedbackPendingCount, setFeedbackPendingCount] = useState(0);

  const refreshFeedbackCount = useCallback(() => {
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  useEffect(() => {
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleSendFeedback = useCallback(async (payload) => {
    await sendFeedback(payload);
    const inputId = payload.input_id;
    updateHistoryByInputId(inputId, {
      selected_rank: payload.selected_rank,
      correction_used: Boolean(payload.correction),
    });
  }, []);

  const handleQueueFeedback = useCallback(async (payload) => {
    await enqueueFeedback({
      ...payload,
      created_at: new Date().toISOString(),
    });
    updateHistoryByInputId(payload.input_id, {
      selected_rank: payload.selected_rank,
      correction_used: Boolean(payload.correction),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
  }, []);

  const handleFlushQueue = useCallback(async (opts = {}) => {
    const res = await flushFeedbackQueue({
      onProgress: (sent, remaining) => {
        setFeedbackPendingCount(getFeedbackQueue().length);
        opts.onProgress?.(sent, remaining);
      },
      onSent: (p) => updateHistoryByInputId(p.input_id, { selected_rank: p.selected_rank, correction_used: Boolean(p.correction) }),
    });
    setFeedbackPendingCount(getFeedbackQueue().length);
    return res;
  }, []);

  return {
    handleSendFeedback,
    handleQueueFeedback,
    handleFlushQueue,
    feedbackPendingCount,
    refreshFeedbackCount,
  };
}
