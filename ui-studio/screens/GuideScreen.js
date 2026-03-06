import React from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Card } from '../components/ui/Card';

/**
 * GuideScreen — guía de captura + checklist errores típicos
 */
export function GuideScreen({ onBack }) {
  return (
    <div className="flex flex-col flex-1">
      <ScreenHeader title="Guía" onBack={onBack} />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-2">Antes de la foto</h4>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            <li>Fondo blanco mate o gris neutro</li>
            <li>Buena luz uniforme, sin sombras marcadas</li>
            <li>Evita reflejos y brillos sobre la llave</li>
          </ul>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-2">Durante la captura</h4>
          <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            <li>Encuadre completo: toda la llave visible</li>
            <li>No cortar punta ni cuello</li>
            <li>Mantén el foco nítido</li>
          </ul>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-2">A/B — Dos caras</h4>
          <p className="text-sm text-[var(--text-secondary)]">
            Siempre captura ambos lados (lado A y lado B) para una identificación precisa.
          </p>
        </Card>

        <Card>
          <h4 className="text-sm font-bold text-[var(--text)] mb-2">Errores típicos y solución</h4>
          <table className="w-full text-sm">
            <tbody className="text-[var(--text-secondary)]">
              <tr>
                <td className="py-1 font-medium text-[var(--text)]">Desenfoque</td>
                <td className="py-1">Ajusta el foco antes de disparar. Sujeta el dispositivo con firmeza.</td>
              </tr>
              <tr>
                <td className="py-1 font-medium text-[var(--text)]">Reflejos</td>
                <td className="py-1">Cambia el ángulo o reduce la luz directa sobre la llave.</td>
              </tr>
              <tr>
                <td className="py-1 font-medium text-[var(--text)]">Fondo sucio</td>
                <td className="py-1">Usa una superficie limpia y uniforme. Evita texturas o patrones.</td>
              </tr>
              <tr>
                <td className="py-1 font-medium text-[var(--text)]">Encuadre incompleto</td>
                <td className="py-1">Incluye punta, cuerpo y cabeza de la llave en el encuadre.</td>
              </tr>
              <tr>
                <td className="py-1 font-medium text-[var(--text)]">Solo un lado (A/B)</td>
                <td className="py-1">Captura ambas caras. El modelo necesita los dos lados para identificar correctamente.</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
