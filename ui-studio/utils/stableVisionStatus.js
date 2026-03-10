/**
 * stableVisionStatus — histéresis para estados visuales.
 * No cambia de estado a la primera: requiere persistencia o tiempo mínimo.
 * Estados: searching_key | key_detected | key_ready | low_light | capturing
 */

const MIN_STABILITY_MS = 450;
const COOLDOWN_READY_MS = 500;
const COOLDOWN_CAPTURING_MS = 600;

/** Prioridad para no bajar de nivel durante cooldown */
const PRIORITY = { searching_key: 0, low_light: 1, key_detected: 2, key_ready: 3, capturing: 4 };

/**
 * @param {string} rawStatus - estado crudo del tick actual
 * @param {Object} state - { displayed, rawPrev, firstSeenAt, cooldownUntil }
 * @param {number} now
 * @returns {{ stableStatus: string, nextState: Object }}
 */
export function computeStableStatus(rawStatus, state = {}, now = Date.now()) {
  const displayed = state.displayed ?? 'searching_key';
  const rawPrev = state.rawPrev ?? '';
  const firstSeenAt = state.firstSeenAt ?? now;
  const cooldownUntil = state.cooldownUntil ?? 0;

  const inCooldown = now < cooldownUntil;
  const rawPersisted = rawStatus === rawPrev;
  const elapsed = now - firstSeenAt;

  if (rawStatus === 'capturing') {
    return {
      stableStatus: 'capturing',
      nextState: {
        displayed: 'capturing',
        rawPrev: rawStatus,
        firstSeenAt: now,
        cooldownUntil: now + COOLDOWN_CAPTURING_MS,
      },
    };
  }

  if (rawStatus === displayed) {
    return {
      stableStatus: displayed,
      nextState: {
        displayed,
        rawPrev: rawStatus,
        firstSeenAt: rawPersisted ? firstSeenAt : now,
        cooldownUntil,
      },
    };
  }

  if (inCooldown && PRIORITY[displayed] >= PRIORITY.key_ready) {
    return {
      stableStatus: displayed,
      nextState: { ...state, rawPrev: rawStatus },
    };
  }

  if (!rawPersisted) {
    return {
      stableStatus: displayed,
      nextState: {
        ...state,
        rawPrev: rawStatus,
        firstSeenAt: now,
      },
    };
  }

  if (elapsed >= MIN_STABILITY_MS) {
    const newCooldown = rawStatus === 'key_ready' ? now + COOLDOWN_READY_MS : 0;
    return {
      stableStatus: rawStatus,
      nextState: {
        displayed: rawStatus,
        rawPrev: rawStatus,
        firstSeenAt: now,
        cooldownUntil: newCooldown,
      },
    };
  }

  return {
    stableStatus: displayed,
    nextState: { ...state, rawPrev: rawStatus },
  };
}
