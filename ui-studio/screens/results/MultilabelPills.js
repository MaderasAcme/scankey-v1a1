/**
 * Pills multi-label: orientation, patentada, high_security, tags, etc.
 */
import React from 'react';
import { Pill } from '../../components/ui/Pill';
import { formatAttrDisplay } from './helpers';

export function MultilabelPills({ result: r, modoTaller = false }) {
  if (!r) return null;
  const tags = Array.isArray(r.tags) && r.tags.length > 0 ? r.tags : (Array.isArray(r.compatibility_tags) ? r.compatibility_tags : []);
  const items = [];
  if (r.orientation) items.push({ k: 'orientation', v: formatAttrDisplay(r.orientation, r.orientation_meta, modoTaller) });
  if (r.patentada === true) items.push({ k: 'patentada', v: formatAttrDisplay(true, r.patentada_meta, modoTaller) || 'Sí' });
  if (r.high_security === true) items.push({ k: 'high_security', v: formatAttrDisplay(true, r.high_security_meta, modoTaller) || 'Alta seguridad' });
  if (r.requires_card === true) items.push({ k: 'requires_card', v: formatAttrDisplay(true, r.requires_card_meta, modoTaller) || 'Requiere tarjeta' });
  if (r.head_color) items.push({ k: 'head_color', v: formatAttrDisplay(r.head_color, r.head_color_meta, modoTaller) });
  if (r.visual_state) items.push({ k: 'visual_state', v: formatAttrDisplay(r.visual_state, r.visual_state_meta, modoTaller) });
  if (r.brand_head_text) items.push({ k: 'brand_head', v: formatAttrDisplay(r.brand_head_text, r.brand_head_text_meta, modoTaller) });
  if (r.brand_blade_text) items.push({ k: 'brand_blade', v: formatAttrDisplay(r.brand_blade_text, r.brand_blade_text_meta, modoTaller) });
  tags.forEach((t) => items.push({ k: 'tag', v: t }));
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(({ k, v }, j) => (
        <Pill key={`${k}-${j}`}>{String(v)}</Pill>
      ))}
    </div>
  );
}
