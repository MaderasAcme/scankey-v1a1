/**
 * Barrel export — mantiene compatibilidad con imports desde services/api
 */
export {
  getApiConfig,
  getApiBase,
  setApiBase,
  getApiKey,
  setApiKey,
} from './config.js';

export {
  getDeployPing,
  getBuildInfo,
  getHealth,
  getMotorHealth,
} from './health.js';

export { analyzeKey } from './analyze.js';

export {
  sendFeedback,
  enqueueFeedback,
  flushFeedbackQueue,
  getFeedbackQueue,
  computeFeedbackIdempotencyKey,
  isRetryableError,
} from './feedback.js';
