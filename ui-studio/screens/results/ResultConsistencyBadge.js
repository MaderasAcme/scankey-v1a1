/**
 * Badge de consistencia: Alta / Media / Baja.
 */
import React from 'react';
import { Pill } from '../../components/ui/Pill';
import { computeVisionAugmentedConsistency } from '../../utils/consistencyActive';

export function ResultConsistencyBadge({ result, capturedPhotos, modoTaller }) {
  const augmented = capturedPhotos?.A?.snapshots
    ? computeVisionAugmentedConsistency(result, capturedPhotos)
    : null;
  const level = augmented?.consistency_level ?? result?.debug?.consistency_level;
  const conflicts = Array.isArray(augmented?.consistency_conflicts)
    ? augmented.consistency_conflicts
    : (Array.isArray(result?.debug?.consistency_conflicts) ? result.debug.consistency_conflicts : []);
  const weakConflicts = Array.isArray(result?.debug?.consistency_weak_conflicts) ? result.debug.consistency_weak_conflicts : [];
  const supports = Array.isArray(augmented?.consistency_supports)
    ? augmented.consistency_supports
    : (Array.isArray(result?.debug?.consistency_supports) ? result.debug.consistency_supports : []);
  const evidenceNotes = Array.isArray(augmented?.consistency_reasoning)
    ? augmented.consistency_reasoning
    : (Array.isArray(result?.debug?.evidence_notes) ? result.debug.evidence_notes : []);

  if (!level) return null;
  const labels = { high: 'Alta', medium: 'Media', low: 'Baja' };
  const label = labels[level];
  if (!label) return null;
  const pillClass = level === 'high' ? 'border-[var(--success)] text-[var(--success)]' : level === 'low' ? 'border-[var(--warning)] text-[var(--warning)]' : '';
  let detail = '';
  if (modoTaller && (conflicts.length > 0 || weakConflicts.length > 0 || supports.length > 0)) {
    const parts = [];
    if (conflicts.length > 0) parts.push(conflicts.slice(0, 2).map((c) => `conflicto fuerte ${c}`).join(', '));
    if (weakConflicts.length > 0) parts.push(weakConflicts.slice(0, 2).map((c) => `conflicto débil ${c}`).join(', '));
    if (supports.length > 0 && parts.length < 2) parts.push(supports.slice(0, 2).map((s) => `coincidencia ${s}`).join(', '));
    detail = parts.slice(0, 2).join(' · ');
  }
  if (!detail && evidenceNotes.length > 0 && modoTaller) {
    const note = evidenceNotes[0];
    if (note && typeof note === 'string' && note.length < 35) detail = note;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>Consistencia:</span>
      <Pill className={pillClass}>{label}</Pill>
      {detail && <span className="opacity-80">{detail}</span>}
    </div>
  );
}
