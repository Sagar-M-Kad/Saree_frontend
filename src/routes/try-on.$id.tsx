import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { ArrowLeft, Camera, Upload, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { getSaree } from "@/data/sarees";
import { saveEntry, newId } from "@/lib/tryon-store";
import { composeTryOn } from "@/lib/composite";

export const Route = createFileRoute("/try-on/$id")({
  loader: ({ params }) => {
    const saree = getSaree(params.id);
    if (!saree) throw notFound();
    return { saree };
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: TryOn,
});

type Mode = "choose" | "camera" | "preview" | "processing";

function TryOn() {
  const { saree } = Route.useLoaderData();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("choose");
  const [photo, setPhoto] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      // wait for element mount
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      alert("Camera access denied. Please upload a photo instead.");
    }
  }

  function capture() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    
    const ctx = c.getContext("2d")!;
    // Fix mirror effect from front-facing camera
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    
    setPhoto(c.toDataURL("image/jpeg", 0.9));
    stopCamera();
    setMode("preview");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result as string);
      setMode("preview");
    };
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!photo) return;
    setMode("processing");
    setProgress(0);
    const start = Date.now();
    const total = 3200;
    let resultPhoto: string | null = null;
    // Kick off the real composite in parallel with the progress animation
    const composePromise = composeTryOn(photo, saree.image)
      .then((r) => {
        resultPhoto = r;
      })
      .catch(() => {
        resultPhoto = photo;
      });
    const tick = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / total) * 100);
      setProgress(p);
      if (p >= 100 && resultPhoto) {
        clearInterval(tick);
        const id = newId();
        saveEntry({
          id,
          sareeId: saree.id,
          sareeName: saree.name,
          sareeImage: saree.image,
          userPhoto: photo,
          resultPhoto,
          createdAt: Date.now(),
        });
        navigate({ to: "/result/$id", params: { id } });
      }
    }, 90);
    await composePromise;
  }

  return (
    <div className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <Link
          to="/saree/$id"
          params={{ id: saree.id }}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to saree
        </Link>

        <div className="mt-6 flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Virtual Fitting Room
        </div>
        <h1 className="mt-2 font-serif text-4xl sm:text-5xl">
          Drape the <span className="text-gold-gradient">{saree.name}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a full-body photo — front facing, plain background works best.
        </p>

        <div className="glass mt-8 overflow-hidden rounded-3xl p-6 sm:p-8">
          {mode === "choose" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-10 text-center transition hover:border-primary hover:bg-primary/10"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 transition group-hover:scale-105">
                  <Upload className="h-6 w-6" />
                </span>
                <div>
                  <div className="font-serif text-xl">Upload a photo</div>
                  <div className="text-xs text-muted-foreground">JPG or PNG, up to 10 MB</div>
                </div>
              </button>
              <button
                onClick={startCamera}
                className="group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-10 text-center transition hover:border-primary hover:bg-primary/10"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 transition group-hover:scale-105">
                  <Camera className="h-6 w-6" />
                </span>
                <div>
                  <div className="font-serif text-xl">Use camera</div>
                  <div className="text-xs text-muted-foreground">
                    Capture instantly with your device
                  </div>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
              />
            </div>
          )}

          {mode === "camera" && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-full overflow-hidden rounded-2xl border border-border/60">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="aspect-[3/4] w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/30" />
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    stopCamera();
                    setMode("choose");
                  }}
                  className="rounded-full border border-border/70 px-5 py-2.5 text-sm hover:border-primary/60"
                >
                  Cancel
                </button>
                <button
                  onClick={capture}
                  className="btn-gold inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium"
                >
                  <Camera className="h-4 w-4" /> Capture
                </button>
              </div>
            </div>
          )}

          {mode === "preview" && photo && (
            <div className="flex flex-col items-center gap-5">
              <div className="relative overflow-hidden rounded-2xl border border-border/60">
                <img src={photo} alt="Your photo" className="max-h-[60vh] object-contain" />
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => {
                    setPhoto(null);
                    setMode("choose");
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 px-5 py-2.5 text-sm hover:border-primary/60"
                >
                  <RefreshCw className="h-4 w-4" /> Retake
                </button>
                <button
                  onClick={submit}
                  className="btn-gold inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-medium tracking-[0.16em] uppercase"
                >
                  <Sparkles className="h-4 w-4" /> Generate try-on
                </button>
              </div>
            </div>
          )}

          {mode === "processing" && (
            <div className="flex flex-col items-center gap-8 py-8 reveal-up">
              <div className="relative w-full max-w-sm overflow-hidden border border-border bg-card p-2 shadow-xl">
                <div className="relative overflow-hidden bg-card/40">
                  {photo && <img src={photo} alt="Processing" className="w-full max-h-[50vh] object-contain opacity-90 contrast-[1.05]" />}
                  {/* Scanning line */}
                  <div className="scan-line absolute left-0 top-0 h-32 w-full bg-gradient-to-b from-transparent via-primary/10 to-primary/30 border-b border-primary shadow-[0_4px_20px_rgba(122,16,34,0.2)]" />
                  {/* Grid overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                </div>
                <div className="absolute top-4 right-4 grid h-10 w-10 place-items-center bg-card border border-border shadow-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              </div>
              
              <div className="text-center">
                <div className="font-serif text-3xl text-primary animate-pulse">AI Synthesis</div>
                <div className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {progress < 35 ? "Analysing body topology..." : progress < 70 ? "Draping virtual fabric..." : "Matching ambient lighting..."}
                </div>
              </div>
              
              <div className="w-full max-w-md relative mt-4">
                <div className="h-1 overflow-hidden bg-border/40 shadow-inner">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out relative"
                    style={{ width: `${progress}%` }}
                  >
                     <div className="absolute top-0 right-0 h-full w-4 bg-white/40 blur-[2px]" />
                  </div>
                </div>
                <div className="mt-3 flex justify-between text-[10px] uppercase tracking-[0.3em] text-primary/70 font-semibold">
                  <span>Processing</span>
                  <span className="text-primary font-bold text-xs">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}