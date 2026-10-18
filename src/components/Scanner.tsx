import { useEffect, useRef, useState } from 'react';
import { BarcodeDetector as BarcodeDetectorPonyfill } from 'barcode-detector/ponyfill';
import { pickConsumeTarget } from '../inventory';
import { fetchOffProduct } from '../off';
import type { ChangeFn, Notify, Product, StockItem } from '../types';
import { AddForm, type AddInitial } from './AddForm';

const SAME_CODE_PAUSE_MS = 2000;

type Mode = 'add' | 'consume';

// ponytail: native detector where it really reads EAN (Chrome Android), zxing-wasm otherwise (iOS Safari)
async function createDetector() {
  const Native = (globalThis as { BarcodeDetector?: typeof BarcodeDetectorPonyfill }).BarcodeDetector;
  const formats: readonly string[] = Native ? await Native.getSupportedFormats().catch(() => []) : [];
  const Ctor = Native && formats.includes('ean_13') ? Native : BarcodeDetectorPonyfill;
  return new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
}

interface Props {
  products: Product[];
  stock: StockItem[];
  onChange: ChangeFn;
  onSaved: () => Promise<void>;
  notify: Notify;
}

export function Scanner({ products, stock, onChange, onSaved, notify }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('add');
  const [pending, setPending] = useState<AddInitial | null>(null);
  const [manual, setManual] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const last = useRef({ code: '', at: 0 });
  const busy = useRef(false);
  const paused = useRef(false);
  paused.current = !!pending || manual; // no detection while a form is open (saves CPU on iOS)

  async function handleCode(code: string) {
    const now = Date.now();
    const seenRecently = code === last.current.code && now - last.current.at < SAME_CODE_PAUSE_MS;
    last.current = { code, at: now }; // refreshed on every sighting: a code must leave the view to count again
    if (seenRecently || busy.current || pending) return;
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
        setLookup(code);
        try {
          const off = await fetchOffProduct(code);
          setPending({ name: off?.name ?? '', category: off?.category ?? 'Sonstiges', barcode: code });
        } finally {
          setLookup(null);
        }
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
    const fail = (message: string) => {
      stream?.getTracks().forEach((t) => t.stop());
      if (!stopped) setCamError(message);
    };

    void (async () => {
      try {
        const detector = await createDetector();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        video.play().catch(() => fail('Kamera konnte nicht gestartet werden.'));
        const tick = async () => {
          if (stopped) return;
          if (video.readyState >= 2 && !paused.current && !busy.current) {
            const codes = await detector.detect(video).catch(() => []);
            if (stopped) return;
            if (codes[0]) void handler.current(codes[0].rawValue);
          }
          timer = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        fail('Kamera nicht verfügbar oder nicht erlaubt.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (pending || manual) formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pending, manual]);

  const closeForm = () => {
    setPending(null);
    setManual(false);
    last.current = { ...last.current, at: Date.now() }; // item still in view must not reopen the form
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    closeForm();
  };

  return (
    <>
      <div className="segmented" role="group" aria-label="Scan-Modus">
        <button aria-pressed={mode === 'add'} onClick={() => switchMode('add')}>
          Hinzufügen
        </button>
        <button aria-pressed={mode === 'consume'} onClick={() => switchMode('consume')}>
          Verbrauchen
        </button>
      </div>
      {camError ? (
        <div className="card">
          <p className="error">{camError}</p>
          <button onClick={() => setManual(true)}>Manuell eintragen</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="camera" muted playsInline autoPlay aria-hidden="true" />
          <p className="hint">Barcode etwa 20 cm vor die Kamera halten.</p>
        </>
      )}
      {lookup && (
        <p className="hint" role="status">
          Suche Produkt {lookup} …
        </p>
      )}
      <div ref={formRef}>
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
      </div>
    </>
  );
}
