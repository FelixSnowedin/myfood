import { useEffect, useRef, useState } from 'react';
import { BarcodeDetector as BarcodeDetectorPonyfill } from 'barcode-detector/ponyfill';
import { pickConsumeTarget } from '../inventory';
import { fetchOffProduct } from '../off';
import type { ChangeFn, Notify, Product, StockItem } from '../types';
import { AddForm, type AddInitial } from './AddForm';

// ponytail: native detector where the browser has one (Chrome Android), zxing-wasm otherwise (iOS Safari)
const Detector: typeof BarcodeDetectorPonyfill =
  'BarcodeDetector' in globalThis
    ? (globalThis as unknown as { BarcodeDetector: typeof BarcodeDetectorPonyfill }).BarcodeDetector
    : BarcodeDetectorPonyfill;

const SAME_CODE_PAUSE_MS = 2000;

type Mode = 'add' | 'consume';

interface Props {
  products: Product[];
  stock: StockItem[];
  onChange: ChangeFn;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function Scanner({ products, stock, onChange, onSaved, notify }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('add');
  const [pending, setPending] = useState<AddInitial | null>(null);
  const [manual, setManual] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const last = useRef({ code: '', at: 0 });
  const busy = useRef(false);

  async function handleCode(code: string) {
    const now = Date.now();
    if (busy.current || pending) return;
    if (code === last.current.code && now - last.current.at < SAME_CODE_PAUSE_MS) return;
    last.current = { code, at: now };
    busy.current = true;
    try {
      const product = products.find((p) => p.barcode === code);
      if (mode === 'consume') {
        const target = product && pickConsumeTarget(stock, product.id);
        if (product && target) await onChange('consume', target, product);
        else notify({ text: 'Nicht im Bestand' });
      } else if (product) {
        setPending({ name: product.name, category: product.category, barcode: code });
      } else {
        const off = await fetchOffProduct(code);
        setPending({ name: off?.name ?? '', category: off?.category ?? 'Sonstiges', barcode: code });
      }
    } finally {
      busy.current = false;
    }
  }

  // The camera loop runs once; it always calls the latest handleCode (current mode, products, stock).
  const handler = useRef(handleCode);
  handler.current = handleCode;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Diese Seite hat keinen Kamerazugriff (HTTPS nötig).');
      return;
    }
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        void video.play();
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2) {
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]) void handler.current(codes[0].rawValue);
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      })
      .catch(() => setCamError('Kamera nicht verfügbar oder nicht erlaubt.'));

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const closeForm = () => {
    setPending(null);
    setManual(false);
  };

  return (
    <>
      <div className="segmented" role="group" aria-label="Scan-Modus">
        <button aria-pressed={mode === 'add'} onClick={() => setMode('add')}>
          Hinzufügen
        </button>
        <button aria-pressed={mode === 'consume'} onClick={() => setMode('consume')}>
          Verbrauchen
        </button>
      </div>
      {camError ? (
        <div className="card">
          <p className="error">{camError}</p>
          <button onClick={() => setManual(true)}>Manuell eintragen</button>
        </div>
      ) : (
        <video ref={videoRef} className="camera" muted playsInline />
      )}
      {(pending || manual) && (
        <AddForm
          key={pending?.barcode ?? 'manual'}
          products={products}
          initial={pending ?? undefined}
          onSaved={onSaved}
          notify={notify}
          onDone={closeForm}
        />
      )}
    </>
  );
}
