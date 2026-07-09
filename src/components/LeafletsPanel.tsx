"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Trash2, Upload, X } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useMe } from "@/hooks/useMe";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelEmpty from "@/components/ui/PanelEmpty";
import PanelError from "@/components/ui/PanelError";
import { formatGbDate, formatTimeAgo } from "@/lib/format";
import { LEAFLET_CATEGORIES } from "@/lib/leaflet-categories";
import { PARTY_OPTIONS } from "@/lib/palette";

// Mirrors LeafletItem in src/app/api/leaflets/route.ts.
interface LeafletItem {
  id: string;
  kind: "leaflet" | "poster" | "social";
  party: string;
  category: string;
  summary: string;
  notes: string;
  /** Date the user saw the material (YYYY-MM-DD). */
  seenAt: string;
  uploadedBy: string;
  /** Platform display name of the uploader. */
  uploadedByName: string;
  contentType: string;
  createdAt: string;
  imageUrl: string;
}

const KIND_LABELS: Record<LeafletItem["kind"], string> = {
  leaflet: "Leaflet",
  poster: "Poster",
  social: "Social media",
};





/** Upload form — collapsed behind a button until needed. */
function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const { slug } = useConstituency();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [kind, setKind] = useState<LeafletItem["kind"]>("leaflet");
  const [party, setParty] = useState<string>(PARTY_OPTIONS[0]);
  const [category, setCategory] = useState<string>(LEAFLET_CATEGORIES[0]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [seenAt, setSeenAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSummary("");
    setNotes("");
    setSeenAt(new Date().toISOString().slice(0, 10));
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", file);
      body.append("kind", kind);
      body.append("party", party);
      body.append("category", category);
      body.append("summary", summary);
      body.append("notes", notes);
      body.append("seenAt", seenAt);
      const res = await fetch(withConstituency("/api/leaflets", slug), {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Upload failed (${res.status})`);
      }
      reset();
      setOpen(false);
      onUploaded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="px-4 py-3 border-b border-border/50">
        <button
          data-component="leafletUploadTrigger"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[0.611rem] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
        >
          <Camera className="h-3.5 w-3.5" />
          Upload a photo
        </button>
      </div>
    );
  }

  return (
    <form
      data-component="leafletUploadForm"
      onSubmit={submit}
      className="px-4 py-3 border-b border-border/50 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.611rem] uppercase tracking-wider text-zinc-500">
          Upload campaign material
        </span>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label="Close upload form"
          className="text-zinc-500 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        className="block w-full text-[0.611rem] text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:border-0 file:bg-muted file:text-foreground file:text-[0.611rem] file:uppercase file:tracking-wider hover:file:bg-muted/70"
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Upload preview"
          className="max-h-40 rounded border border-border object-contain"
        />
      ) : null}

      <label className="block">
        <span className="block text-[0.5rem] uppercase tracking-wider text-zinc-500 mb-1">
          Seen at
        </span>
        <input
          type="date"
          value={seenAt}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setSeenAt(e.target.value)}
          className="w-full bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 [color-scheme:dark]"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LeafletItem["kind"])}
          aria-label="Material type"
          className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5"
        >
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={party}
          onChange={(e) => setParty(e.target.value)}
          aria-label="Party"
          className="bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5"
        >
          {PARTY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Content category"
        className="w-full bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5"
      >
        {LEAFLET_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Summary — what does the content say or claim?"
        maxLength={1000}
        rows={3}
        className="w-full bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600"
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes — where and when you saw it…"
        maxLength={500}
        rows={2}
        className="w-full bg-muted/40 border border-border text-xs text-foreground px-2 py-1.5 placeholder:text-zinc-600"
      />

      {error ? <p className="text-[0.611rem] text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={!file || submitting}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-[0.611rem] uppercase tracking-wider font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Upload className="h-3.5 w-3.5" />
        {submitting ? "Uploading…" : "Submit"}
      </button>
    </form>
  );
}

/** Single gallery card. */
function LeafletCard({
  item,
  canDelete,
  onDelete,
}: {
  item: LeafletItem;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <figure
      data-component="leafletCard"
      className="relative border border-border bg-muted/20 overflow-hidden flex flex-col group"
    >
      {canDelete ? (
        <button
          data-component="leafletDelete"
          onClick={onDelete}
          aria-label="Delete upload"
          title="Delete upload"
          className="absolute top-1.5 right-1.5 z-10 p-1.5 bg-black/60 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="block">
        {/* Signed URLs expire hourly, so next/image caching hurts here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.imageUrl}
          alt={`${KIND_LABELS[item.kind]} — ${item.party}`}
          loading="lazy"
          className="w-full h-auto hover:opacity-90 transition-opacity"
        />
      </a>
      <figcaption className="px-2.5 py-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.611rem] font-medium text-foreground truncate">{item.party}</span>
          <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500 bg-muted px-1.5 py-0.5 shrink-0">
            {KIND_LABELS[item.kind]}
          </span>
        </div>
        <span className="inline-block text-[0.5rem] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5">
          {item.category}
        </span>
        {item.summary ? (
          <p className="text-[0.611rem] text-zinc-300 line-clamp-3">{item.summary}</p>
        ) : null}
        {item.notes ? (
          <p className="text-[0.611rem] text-zinc-500 line-clamp-2">{item.notes}</p>
        ) : null}
        {item.seenAt ? (
          <p className="text-[0.611rem] text-zinc-400">
            Seen {formatGbDate(item.seenAt)}
          </p>
        ) : null}
        <p
          className="text-[0.5rem] text-zinc-600 uppercase tracking-wider"
          title={`Uploaded ${new Date(item.createdAt).toLocaleString("en-GB")}`}
        >
          {item.uploadedByName} · {formatTimeAgo(item.createdAt)}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Campaign material panel — electionleaflets.org-style upload and gallery of
 * leaflets, posters and social media screenshots seen in the constituency.
 */
export default function LeafletsPanel() {
  const { slug } = useConstituency();
  const { me } = useMe();
  const { data, loading, error, refetch } = useConstituencyResource<{ items: LeafletItem[] }>(
    "/api/leaflets"
  );
  const items = data?.items ?? [];

  async function deleteItem(id: string) {
    if (!window.confirm("Delete this upload? This cannot be undone.")) return;
    const res = await fetch(withConstituency(`/api/leaflets?id=${encodeURIComponent(id)}`, slug), {
      method: "DELETE",
    });
    if (res.ok) refetch();
  }

  return (
    <div data-component="leafletsPanel">
      <UploadForm onUploaded={refetch} />
      {loading ? (
        <PanelSkeleton variant="grid" rows={4} />
      ) : error ? (
        <PanelError message="Unable to load uploads" onRetry={refetch} />
      ) : items.length === 0 ? (
        <PanelEmpty
          icon={ImageIcon}
          title="No campaign material yet"
          description="Photos of leaflets, posters and social media posts seen locally will appear here."
        />
      ) : (
        <div className="p-4 grid grid-cols-3 gap-4">
          {items.map((item) => (
            <LeafletCard
              key={item.id}
              item={item}
              canDelete={me?.role === "admin" || me?.email === item.uploadedBy}
              onDelete={() => deleteItem(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
