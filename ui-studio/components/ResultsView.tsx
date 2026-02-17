
import React, { useState, memo, useCallback, useMemo, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Settings2, 
  Copy, 
  ChevronRight,
  ShieldCheck,
  X,
  Check,
  Loader2,
  AlertOctagon
} from 'lucide-react';
import { sendFeedback } from '../services/api';
import { copy } from '../utils/copy';

// @ts-ignore
const ResultCard = memo(({ result, isTop, onSelect, photos }: any) => {
  const confidencePct = useMemo(() => Math.round((result.confidence || 0) * 100), [result.confidence]);
  const isHigh = result.confidence >= 0.95;
  const isLow = result.confidence < 0.60;

  const title = useMemo(() => {
    return result.brand || result.model 
      ? `${result.brand || ''} ${result.model || ''}`.trim() 
      : (result.type || 'Modelo Desconocido');
  }, [result.brand, result.model, result.type]);

  const previewImage = photos?.A?.optimized;

  return (
    <button
      onClick={() => onSelect(result)}
      className={`w-full text-left bg-zinc-900/40 border ${isTop && isHigh ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-zinc-800'} rounded-[2.5rem] p-6 mb-4 transition-all active:scale-[0.98] group`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className={`text-[10px] font-black uppercase tracking-widest ${isHigh ? 'text-emerald-500' : isLow ? 'text-amber-500' : 'text-zinc-500'}`}>
              Rank #{result.rank} • {confidencePct}% Confianza
            </span>
          </div>
          <h4 className="text-2xl font-black text-white tracking-tighter uppercase truncate pr-4">{title}</h4>
        </div>
        
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 relative">
          {result.crop_bbox && previewImage ? (
            <div 
              className="absolute inset-0 bg-cover bg-no-repeat"
              style={{
                backgroundImage: `url(${previewImage})`,
                backgroundPosition: `${result.crop_bbox.x * 100}% ${result.crop_bbox.y * 100}%`,
                backgroundSize: `${100 / result.crop_bbox.w}% ${100 / result.crop_bbox.h}%`
              }}
            />
          ) : (
             <div className="w-full h-full flex items-center justify-center">
               <ShieldCheck size={24} className="text-zinc-600" />
             </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {result.type && (
          <span className="px-3 py-1 bg-zinc-800 text-zinc-400 text-[10px] font-black rounded-full border border-zinc-700 uppercase tracking-tight">
            {result.type}
          </span>
        )}
        {result.compatibility_tags?.map((tag: string, i: number) => (
          <span key={i} className="px-3 py-1 bg-zinc-900/50 text-zinc-500 text-[10px] font-black rounded-full border border-zinc-800 uppercase tracking-tight">
            {tag}
          </span>
        ))}
      </div>

      <p className="text-zinc-500 text-xs font-medium leading-relaxed mb-4 italic line-clamp-2">
        "{result.explain_text}"
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
        <div className="flex items-center text-zinc-400 font-black text-[10px] uppercase tracking-widest group-hover:text-white transition-colors">
          <span>Detalles del perfil</span>
          <ChevronRight size={14} className="ml-1" />
        </div>
      </div>
    </button>
  );
});

// @ts-ignore
export const ResultsView = ({ data, onReset, photos }: any) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionData, setCorrectionData] = useState({
    marca: '', modelo: '', tipo: '', orientacion: '', ocr_text: ''
  });

  // OBJETIVO: Abrir corrección automáticamente si la confianza es baja
  useEffect(() => {
    if (data?.low_confidence) {
      setShowCorrection(true);
    }
  }, [data?.low_confidence]);

  const handleAccept = useCallback(async (result: any) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await sendFeedback({
        input_id: data.input_id,
        selected_id: result?.id_model_ref || 'manual',
        correction: false
      });
      onReset();
    } catch (e) {
      console.error("Feedback error", e);
    } finally {
      setIsSubmitting(false);
    }
  }, [data?.input_id, isSubmitting, onReset]);

  const handleSaveCorrection = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await sendFeedback({
        input_id: data.input_id,
        selected_id: 'manual_entry',
        correction: true,
        manual_data: correctionData
      });
      setShowCorrection(false);
      onReset();
    } catch (e) {
      console.error("Manual correction error", e);
    } finally {
      setIsSubmitting(false);
    }
  }, [data?.input_id, correctionData, isSubmitting, onReset]);

  if (!data) return null;

  return (
    <div className="flex-1 flex flex-col bg-black h-full overflow-hidden animate-in fade-in duration-500">
      <div className="px-6 pt-16 pb-6 bg-black border-b border-zinc-900 flex items-center justify-between sticky top-0 z-30">
        <button onClick={onReset} className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 active:scale-90 transition-all">
          <X size={24} />
        </button>
        <h2 className="text-xl font-black tracking-tighter text-white uppercase">{copy.results.title}</h2>
        <button onClick={() => setShowCorrection(true)} className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 active:scale-90 transition-all text-zinc-400">
          <Settings2 size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8 pb-48">
        {data.high_confidence ? (
          <div className="mb-8 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center space-x-4 animate-in slide-in-from-top-2">
            <CheckCircle2 className="text-emerald-500 shrink-0" size={28} />
            <div>
              <p className="text-emerald-500 text-sm font-black uppercase tracking-widest">ALTA CONFIANZA</p>
              <p className="text-zinc-500 text-[11px] font-medium">{copy.results.highConfidenceDesc}</p>
            </div>
          </div>
        ) : data.low_confidence ? (
          <div className="mb-8 p-5 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center space-x-4 animate-in slide-in-from-top-2">
            <AlertTriangle className="text-amber-500 shrink-0" size={28} />
            <div>
              <p className="text-amber-500 text-sm font-black uppercase tracking-widest">RESULTADO DUDOSO</p>
              <p className="text-zinc-500 text-[11px] font-medium">{copy.results.lowConfidenceDesc}</p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {data.results.map((res: any, idx: number) => (
            <ResultCard 
              key={res.id_model_ref || `rank-${idx}`} 
              result={res} 
              isTop={idx === 0} 
              onSelect={(r: any) => handleAccept(r)} 
              photos={photos} 
            />
          ))}
        </div>

        <button 
          onClick={() => setShowCorrection(true)}
          className="w-full mt-6 py-8 border-2 border-dashed border-zinc-900 rounded-[2.5rem] flex flex-col items-center justify-center space-y-3 text-zinc-700 active:bg-zinc-900/50 active:border-zinc-800 transition-all"
        >
          <Settings2 size={28} />
          <span className="text-[11px] font-black uppercase tracking-[0.4em]">CORREGIR MANUALMENTE</span>
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-8 bg-gradient-to-t from-black via-black to-transparent z-40">
        {data.low_confidence ? (
          <button 
            onClick={() => setShowCorrection(true)}
            disabled={isSubmitting}
            className="w-full h-20 rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center space-x-4 bg-amber-500 text-black shadow-2xl active:scale-95 transition-all"
          >
            <AlertOctagon size={28} />
            <span>CORREGIR MANUALMENTE</span>
          </button>
        ) : (
          <button 
            onClick={() => handleAccept(data.results[0])}
            disabled={isSubmitting}
            className={`w-full h-20 rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center space-x-4 transition-all duration-300 shadow-2xl active:scale-95 ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' :
              data.high_confidence ? 'bg-white text-black shadow-white/10' : 'bg-zinc-900 text-white border border-zinc-800'
            }`}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={28} /> : (
              <>
                {data.high_confidence ? <Copy size={28} /> : <Check size={28} />}
                <span>{data.high_confidence ? "ACEPTAR Y DUPLICAR" : "CONFIRMAR SELECCIÓN"}</span>
              </>
            )}
          </button>
        )}
      </div>

      {showCorrection && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-end animate-in fade-in duration-500">
           <div className="w-full bg-zinc-950 rounded-t-[3.5rem] border-t border-zinc-800 p-8 pt-12 flex flex-col max-h-[92vh] shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
              <div className="flex justify-between items-center mb-12">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800">
                    <Settings2 size={24} className="text-zinc-400" />
                  </div>
                  <h3 className="text-3xl font-black text-white tracking-tighter">CORREGIR</h3>
                </div>
                <button onClick={() => setShowCorrection(false)} className="p-3 bg-black rounded-full border border-zinc-800 text-zinc-500">
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-8 pb-12 pr-2">
                {['marca', 'modelo', 'tipo', 'ocr_text'].map(field => (
                  <div key={field} className="space-y-3">
                    <label className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.3em] ml-2">{field.replace('_', ' ')}</label>
                    <input 
                      type="text"
                      value={(correctionData as any)[field]}
                      onChange={(e) => setCorrectionData({...correctionData, [field]: e.target.value})}
                      placeholder={`Introduce ${field}...`}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-[1.5rem] py-6 px-8 text-white font-black text-lg outline-none focus:border-white/40 transition-all placeholder:text-zinc-700"
                    />
                  </div>
                ))}
              </div>
              <button 
                onClick={handleSaveCorrection} 
                disabled={isSubmitting} 
                className="w-full h-20 bg-white text-black rounded-[2rem] font-black text-xl uppercase tracking-widest flex items-center justify-center space-x-4 active:scale-95 transition-all shadow-2xl"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={24} /> : <Check size={24} />}
                <span>{copy.common.save}</span>
              </button>
           </div>
        </div>
      )}
    </div>
  );
};
