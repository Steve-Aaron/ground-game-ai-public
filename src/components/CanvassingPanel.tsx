"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "next-themes";
import { CalendarDays, Clock, ImagePlus, MapPin, Trash2, X } from "lucide-react";
import { useConstituency, withConstituency } from "@/hooks/useConstituency";
import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import { useMe } from "@/hooks/useMe";
import { getFullData } from "@/data";
import { SESSION_TYPES, SESSION_TYPE_COLORS, type SessionType } from "@/lib/canvassing-types";
import PanelSkeleton from "@/components/ui/PanelSkeleton";
import PanelEmpty from "@/components/ui/PanelEmpty";
import PanelError from "@/components/ui/PanelError";
import { DateInput, FileInput, FormError, Select, TextArea, TextInput, TimeInput } from "@/components/ui/FormField";
import { ActionButton } from "@/components/ui/ActionButton";
import { Chip } from "@/components/ui/Chip";
import { formatGbDate } from "@/lib/format";

// Mirrors CanvassingSession in src/app/api/canvassing/route.ts.
interface CanvassingSession {
  id: string;
  date: string;
  name: string;
  lat: number;
  lng: number;
  durationMins: number;
  type: SessionType;
  notes: string;
  imageUrls: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

const MAX_IMAGES = 4;

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** Map with session pins; in add mode a click drops the new-session pin. */
function SessionsMap({
  sessions,
  draftPin,
  onPick,
  onSelect,
}: {
  sessions: CanvassingSession[];
  draftPin: { lat: number; lng: number } | null;
  onPick: ((lat: number, lng: number) => void) | null;
  onSelect: (id: string) => void;
}) {
  const { slug } = useConstituency();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null);
  // Refs keep the map's click handler pointing at fresh callbacks without
  // re-initialising the map.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init once per slug/theme
  useEffect(() => {
    if (!slug || !containerRef.current) return;
    const geo = getFullData(slug)?.geo;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style:
        resolvedTheme === "light"
          ? "https://tiles.openfreemap.org/styles/liberty"
          : "https://tiles.openfreemap.org/styles/dark",
      center: geo ? [geo.lng, geo.lat] : [-0.55, 51.87],
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("click", (e) => {
      onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [slug, resolvedTheme]);

  // Session markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = sessions.map((s) => {
      const el = document.createElement("button");
      el.setAttribute("data-component", "canvassingPin");
      el.setAttribute("aria-label", s.name);
      el.style.cssText = `width:14px;height:14px;border-radius:9999px;border:2px solid #fff;cursor:pointer;background:${SESSION_TYPE_COLORS[s.type] ?? "#9ca3af"};box-shadow:0 1px 4px rgba(0,0,0,.5)`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(s.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
    });
  }, [sessions]);

  // Draft pin (new session location)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    if (draftPin) {
      draftMarkerRef.current = new maplibregl.Marker({ color: "#10b981", draggable: false })
        .setLngLat([draftPin.lng, draftPin.lat])
        .addTo(map);
    }
  }, [draftPin]);

  return (
    <div className="relative">
      <div ref={containerRef} data-component="canvassingMap" className="h-72 w-full" />
      {onPick ? (
        <div className="absolute top-2 left-2 bg-emerald-500/90 text-black text-[0.611rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded shadow">
          Click the map to drop the session pin
        </div>
      ) : null}
    </div>
  );
}

/** New-session form; location comes from the map's draft pin. */
function SessionForm({
  draftPin,
  onCancel,
  onCreated,
}: {
  draftPin: { lat: number; lng: number } | null;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { slug } = useConstituency();
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Duration entered as hh:mm; converted to minutes for the API.
  const [duration, setDuration] = useState("02:00");
  const [type, setType] = useState<SessionType>(SESSION_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!draftPin) {
      setError("Click the map to set the session location.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("name", name);
      body.append("date", date);
      body.append("lat", String(draftPin.lat));
      body.append("lng", String(draftPin.lng));
      const [h, m] = duration.split(":").map(Number);
      const durationMins = (h || 0) * 60 + (m || 0);
      if (durationMins <= 0) {
        throw new Error("Set a duration (hh:mm).");
      }
      body.append("durationMins", String(durationMins));
      body.append("type", type);
      body.append("notes", notes);
      files.slice(0, MAX_IMAGES).forEach((f) => body.append("photos", f));
      const res = await fetch(withConstituency("/api/canvassing", slug), { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-component="canvassingSessionForm"
      onSubmit={submit}
      className="px-4 py-3 border-b border-border/50 space-y-2 bg-muted/20"
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.611rem] uppercase tracking-wider text-zinc-500">New session</span>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-zinc-500 hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Event name (required)"
          className="col-span-2"
        />
        <DateInput
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TimeInput
          label="Duration (hh:mm)"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          step={900}
        />
        <div className="col-span-2">
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as SessionType)}
            className="capitalize"
          >
            {SESSION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </div>
      </div>

      <p className="text-[0.611rem] flex items-center gap-1 text-zinc-500">
        <MapPin className="h-3 w-3" />
        {draftPin
          ? `Pinned at ${draftPin.lat.toFixed(4)}, ${draftPin.lng.toFixed(4)}`
          : "Click the map above to set the location"}
      </p>

      <TextArea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes — meeting point, target streets, what to bring…"
        maxLength={1000}
        rows={2}
      />

      <label className="block">
        <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500 flex items-center gap-1 mb-1">
          <ImagePlus className="h-3 w-3" /> Photos (up to {MAX_IMAGES})
        </span>
        <FileInput
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_IMAGES))}
        />
      </label>
      {files.length > 0 ? (
        <p className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">{files.length} photo{files.length > 1 ? "s" : ""} attached</p>
      ) : null}

      <FormError message={error} />

      <ActionButton type="submit" disabled={busy || !name.trim() || !draftPin}>
        {busy ? "Saving…" : "Add session"}
      </ActionButton>
    </form>
  );
}

/** Session details card. */
function SessionCard({
  session,
  highlighted,
  canDelete,
  onDelete,
}: {
  session: CanvassingSession;
  highlighted: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <article
      id={`canvassing-session-${session.id}`}
      data-component="canvassingSessionCard"
      className={`relative border p-3 space-y-1.5 transition-colors group ${
        highlighted ? "border-emerald-500/60 bg-emerald-500/5" : "border-border bg-muted/20"
      }`}
    >
      {canDelete ? (
        <button
          data-component="canvassingSessionDelete"
          onClick={onDelete}
          aria-label="Delete session"
          className="absolute top-2 right-2 p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: SESSION_TYPE_COLORS[session.type] ?? "#9ca3af" }}
        />
        <span className="text-xs font-medium text-foreground truncate">{session.name}</span>
        <Chip className="shrink-0 capitalize">{session.type}</Chip>
      </div>

      <p className="text-[0.611rem] text-zinc-400 flex items-center gap-3">
        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatGbDate(session.date)}</span>
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(session.durationMins)}</span>
      </p>

      {session.notes ? <p className="text-[0.611rem] text-zinc-400">{session.notes}</p> : null}

      {session.imageUrls.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {session.imageUrls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="w-full h-14 object-cover rounded border border-border hover:opacity-90" />
            </a>
          ))}
        </div>
      ) : null}

      <p className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">
        Added by {session.createdByName}
      </p>
    </article>
  );
}

/**
 * Canvassing sessions — ground activity pinned on a map. Any user with
 * constituency access can add sessions (photos optional, up to 4).
 */
export default function CanvassingPanel() {
  const { slug } = useConstituency();
  const { me } = useMe();
  const { data, loading, error, refetch } = useConstituencyResource<{
    sessions: CanvassingSession[];
  }>("/api/canvassing");
  const sessions = data?.sessions ?? [];

  const [adding, setAdding] = useState(false);
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handlePick = useCallback((lat: number, lng: number) => {
    setDraftPin({ lat, lng });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    document
      .getElementById(`canvassing-session-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  async function deleteSession(id: string) {
    if (!window.confirm("Delete this session?")) return;
    const res = await fetch(withConstituency(`/api/canvassing?id=${encodeURIComponent(id)}`, slug), {
      method: "DELETE",
    });
    if (res.ok) refetch();
  }

  return (
    <div data-component="canvassingPanel">
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center justify-between">
        <span className="text-[0.5rem] uppercase tracking-wider text-zinc-500">
          {sessions.length} session{sessions.length === 1 ? "" : "s"}
        </span>
        <ActionButton
          size="sm"
          icon={MapPin}
          onClick={() => {
            setAdding((v) => !v);
            setDraftPin(null);
          }}
        >
          {adding ? "Cancel" : "Add session"}
        </ActionButton>
      </div>

      <SessionsMap
        sessions={sessions}
        draftPin={adding ? draftPin : null}
        onPick={adding ? handlePick : null}
        onSelect={handleSelect}
      />

      {adding ? (
        <SessionForm
          draftPin={draftPin}
          onCancel={() => {
            setAdding(false);
            setDraftPin(null);
          }}
          onCreated={() => {
            setAdding(false);
            setDraftPin(null);
            refetch();
          }}
        />
      ) : null}

      {loading ? (
        <PanelSkeleton variant="cards" rows={3} />
      ) : error ? (
        <PanelError message="Unable to load sessions" onRetry={refetch} />
      ) : sessions.length === 0 ? (
        <PanelEmpty
          icon={MapPin}
          title="No campaign events yet"
          description="Add an event to pin it on the map for the team."
        />
      ) : (
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              highlighted={selectedId === s.id}
              canDelete={me?.role === "admin" || me?.email === s.createdBy}
              onDelete={() => deleteSession(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
