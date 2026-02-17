
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Image as ImageIcon, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  RefreshCw, 
  WifiOff, 
  ChevronRight,
  LockKeyhole,
  ShieldCheck,
  Maximize2
} from 'lucide-react';
import { copy } from '../utils/copy';

/**
 * Lead Engineer - High-Fidelity Scan Interface
 * Diseño inmersivo estilo Revolut con superposiciones técnicas de precisión.
 */

const optimizeImage = (base64Str, maxSize = 1280) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const ScanFlow = ({ onComplete, onCancel, isOnline, onManualCorrection }) => {
  const [activeSide, setActiveSide] = useState('A'); 
  const [photos, setPhotos] = useState({ A: null, B: null });
  const [hasCamera, setHasCamera] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const SECRET_PIN = "08800";

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasCamera(true);
      }
    } catch (err) {
      setHasCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const handleCapture = useCallback(async () => {
    if (canvasRef.current && videoRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const rawData = canvasRef.current.toDataURL('image/jpeg', 1.0);
      const optimized = await optimizeImage(rawData);
      
      const newPhotos = { ...photos, [activeSide]: { optimized, original: rawData } };
      setPhotos(newPhotos);
      if (activeSide === 'A' && !photos.B) {
        setTimeout(() => setActiveSide('B'), 400);
      }
    }
  }, [photos, activeSide]);

  const handleGalleryPick = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawData = event.target?.result;
        const optimized = await optimizeImage(rawData);
        const newPhotos = { ...photos, [activeSide]: { optimized, original: rawData } };
        setPhotos(newPhotos);
        if (activeSide === 'A' && !photos.B) setActiveSide('B');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleKeyPress = (num) => {
    if (pin.length < 5) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 5) {
        if (newPin === SECRET_PIN) {
          setShowPinModal(false);
          setPin('');
          onManualCorrection();
        } else {
          setPinError(true);
          setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 800);
        }
      }
    }
  };

  const isReady = photos.A && photos.B && isOnline;

  return (
    <div className="flex flex-col h-screen bg-black text-white relative overflow-hidden">
      {/* Top Overlay Controls */}
      <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex items-center justify-center z-50 pointer-events-none">
        <button 
          onClick={onCancel} 
          aria-label={copy.common.cancel}
          className="absolute left-6 p-3 bg-black/40 backdrop-blur-md rounded-full border border-white/10 active:scale-90 transition-all pointer-events-auto"
        >
          <X size={24} />
        </button>
        <div className="bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 pointer-events-auto">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/90">
            {activeSide === 'A' ? copy.scan.sideA : copy.scan.sideB}
          </span>
        </div>
        {!isOnline && (
          <div className="absolute right-6 flex items-center space-x-2 bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-auto">
            <WifiOff size={14} className="text-red-500" />
            <span className="text-[9px] font-black uppercase text-red-500 tracking-widest">OFFLINE</span>
          </div>
        )}
      </div>

      {/* Main Camera Viewport */}
      <div className="flex-1 relative bg-zinc-950 flex items-center justify-center overflow-hidden">
        {hasCamera ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className={`w-full h-full object-cover transition-all duration-700 ${photos[activeSide] ? 'opacity-30 blur-sm scale-110' : 'opacity-80'}`} 
          />
        ) : (
          <div className="flex flex-col items-center p-12 text-center space-y-6">
             <AlertCircle size={64} className="text-zinc-800" />
             <p className="text-zinc-500 text-lg font-bold tracking-tight">Acceso a cámara denegado o no disponible.</p>
          </div>
        )}

        {/* Technical Overlay - Frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[85%] aspect-[1/1.2] max-w-sm relative">
            <div className="absolute inset-0 border-2 border-white/20 rounded-[3rem]"></div>
            {/* Corners */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-[4px] border-l-[4px] border-white rounded-tl-[3rem] -mt-[2px] -ml-[2px]"></div>
            <div className="absolute top-0 right-0 w-12 h-12 border-t-[4px] border-r-[4px] border-white rounded-tr-[3rem] -mt-[2px] -mr-[2px]"></div>
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-[4px] border-l-[4px] border-white rounded-bl-[3rem] -mb-[2px] -ml-[2px]"></div>
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-[4px] border-r-[4px] border-white rounded-br-[3rem] -mb-[2px] -mr-[2px]"></div>
            
            {/* Punta Label */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-black px-4 py-1 rounded-full uppercase tracking-widest">
              ← Punta de la llave
            </div>
            {/* Center Cross */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <div className="w-10 h-[1px] bg-white"></div>
              <div className="h-10 w-[1px] bg-white absolute"></div>
            </div>
          </div>
        </div>

        {/* Capture Snapshot Preview */}
        {photos[activeSide] && (
          <div className="absolute inset-0 flex items-center justify-center p-12 animate-in zoom-in-95 duration-300">
             <div className="bg-emerald-500 rounded-full p-4 shadow-2xl shadow-emerald-500/50">
                <CheckCircle2 size={48} />
             </div>
          </div>
        )}
      </div>

      {/* Bottom Bar: Thumbnails and Shutter */}
      <div className="bg-black border-t border-zinc-900 pb-12 pt-8 px-8 flex flex-col items-center space-y-8 z-40">
        <div className="flex items-center justify-center space-x-6 w-full max-w-xs">
          {['A', 'B'].map(side => (
            <button 
              key={side}
              onClick={() => setActiveSide(side)}
              className={`flex-1 flex flex-col items-center space-y-2 transition-all duration-300 ${activeSide === side ? 'scale-110' : 'opacity-40 grayscale'}`}
            >
              <div className={`w-full aspect-square rounded-2xl border-2 flex items-center justify-center overflow-hidden ${photos[side] ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                {photos[side] ? (
                  <img src={photos[side].optimized} className="w-full h-full object-cover" />
                ) : (
                  <ShieldCheck size={24} className="text-zinc-700" />
                )}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Lado {side}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between w-full max-w-sm px-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 text-zinc-400 active:scale-90 transition-all"
          >
            <ImageIcon size={24} />
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleGalleryPick} />
          </button>

          <button 
            onClick={handleCapture}
            disabled={!!photos[activeSide]}
            className="group relative"
          >
             <div className="w-24 h-24 rounded-full border-4 border-white flex items-center justify-center p-2 transition-transform active:scale-90">
                <div className="w-full h-full bg-white rounded-full group-disabled:opacity-20"></div>
             </div>
             {photos[activeSide] && (
               <button 
                onClick={(e) => { e.stopPropagation(); setPhotos({...photos, [activeSide]: null}); }} 
                className="absolute -top-2 -right-2 bg-red-500 p-2 rounded-full border-2 border-black"
               >
                 <RefreshCw size={14} />
               </button>
             )}
          </button>

          <button 
            onClick={() => setShowPinModal(true)}
            className="w-14 h-14 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 text-zinc-400 active:scale-90 transition-all"
          >
            <LockKeyhole size={24} />
          </button>
        </div>

        <button 
          onClick={() => onComplete(photos)}
          disabled={!isReady}
          className={`w-full h-18 rounded-2xl font-black text-lg uppercase tracking-widest flex items-center justify-center space-x-3 transition-all duration-300 ${isReady ? 'bg-white text-black shadow-2xl' : 'bg-zinc-900 text-zinc-700 border border-zinc-800 opacity-50'}`}
        >
          <span>{copy.scan.analyze}</span>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* PIN Security Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[60] flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
           <div className="mb-12 text-center">
              <LockKeyhole size={48} className="mx-auto mb-4 text-zinc-500" />
              <h3 className="text-2xl font-black uppercase tracking-tighter">Acceso Taller</h3>
              <p className="text-zinc-500 text-sm mt-2">Introduce el código de seguridad</p>
           </div>
           <div className="flex space-x-4 mb-16">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 border-zinc-700 transition-all duration-300 ${pin.length > i ? (pinError ? 'bg-red-500 border-red-500 animate-bounce' : 'bg-white border-white') : ''}`} />
              ))}
           </div>
           <div className="grid grid-cols-3 gap-6 max-w-xs w-full">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} onClick={() => handleKeyPress(n.toString())} className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center text-3xl font-black active:bg-zinc-800 active:scale-90 transition-all">
                  {n}
                </button>
              ))}
              <div />
              <button onClick={() => handleKeyPress('0')} className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center text-3xl font-black active:bg-zinc-800 active:scale-90 transition-all">
                0
              </button>
              <button onClick={() => { setPin(''); setShowPinModal(false); }} className="w-20 h-20 flex items-center justify-center text-zinc-500 active:scale-90 transition-all">
                <X size={32} />
              </button>
           </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
