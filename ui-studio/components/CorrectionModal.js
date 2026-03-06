import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

const FIELD_LABELS = {
  marca: 'Marca',
  modelo: 'Modelo',
  tipo: 'Tipo',
  orientacion: 'Orientación',
  ocr_text: 'Texto OCR',
};

/**
 * CorrectionModal — corrección manual guiada por manual_correction_hint.fields
 */
export function CorrectionModal({
  isOpen,
  onClose,
  onSave,
  forceCorrection = false,
  fields = ['marca', 'modelo', 'tipo', 'orientacion', 'ocr_text'],
}) {
  const [draft, setDraft] = useState({ marca: '', modelo: '', tipo: '', orientacion: '', ocr_text: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) setDraft({ marca: '', modelo: '', tipo: '', orientacion: '', ocr_text: '' });
  }, [isOpen]);

  const handleChange = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: String(value || '').trim() }));
    setError('');
  };

  const hasAnyValue = () => fields.some((f) => (draft[f] || '').trim().length > 0);

  const handleSave = () => {
    if (forceCorrection && !hasAnyValue()) {
      setError('Completa al menos un campo para guardar la corrección.');
      return;
    }
    const manual = {};
    fields.forEach((f) => {
      const v = (draft[f] || '').trim();
      if (v) manual[f] = v;
    });
    onSave(manual);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md">
        <h3 className="text-lg font-bold text-[var(--text)] mb-4">Corrección manual</h3>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f}>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {FIELD_LABELS[f] || f}
              </label>
              <input
                type="text"
                value={draft[f] || ''}
                onChange={(e) => handleChange(f, e.target.value)}
                placeholder={`Introduce ${FIELD_LABELS[f] || f}...`}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-[var(--danger)] mt-2">{error}</p>}
        <div className="flex gap-3 mt-6">
          <Button variant="primary" className="flex-1" onClick={handleSave}>
            Guardar corrección
          </Button>
          {!forceCorrection && (
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
