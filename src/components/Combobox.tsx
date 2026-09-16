"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchStations, type Station } from "@/lib/northern/stations";

type Props = { label: string; value: Station | null; onChange: (station: Station | null) => void; options?: readonly Station[]; disabled?: boolean };
export default function Combobox({ label, value, onChange, options, disabled }: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const lastValueId = useRef(value?.id ?? null);
  const userEdited = useRef(false);
  const id = useId();
  const results = useMemo(() => {
    const allowed = options ?? searchStations("");
    return searchStations(query).filter((station) => allowed.some((candidate) => candidate.id === station.id)).slice(0, 8);
  }, [options, query]);
  const choose = (station: Station) => { userEdited.current = false; lastValueId.current = station.id; setQuery(station.name); onChange(station); setOpen(false); setActive(-1); };
  const optionId = (index: number) => `${id}-option-${index}`;
  useEffect(() => {
    const nextId = value?.id ?? null;
    if (userEdited.current && nextId === null) { lastValueId.current = null; return; }
    if (nextId === lastValueId.current) return;
    lastValueId.current = nextId;
    userEdited.current = false;
    setQuery(value?.name ?? "");
  }, [value]);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 ? optionId(active) : undefined} value={!open && value ? value.name : query} disabled={disabled}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onBlur={() => { window.setTimeout(() => setOpen(false), 0); }}
      onChange={(event) => { userEdited.current = true; setQuery(event.target.value); onChange(null); setOpen(true); setActive(-1); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setActive(-1); return; }
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(results.length - 1, index + 1)); return; }
        if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => Math.max(0, index - 1)); return; }
        if (event.key === "Home" && open) { event.preventDefault(); setActive(0); return; }
        if (event.key === "End" && open) { event.preventDefault(); setActive(Math.max(0, results.length - 1)); return; }
        if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
      }} autoComplete="off" />
    {open && <ul id={`${id}-list`} role="listbox" className="suggestions" aria-label={`${label} stations`}>
      {results.map((station, index) => <li id={optionId(index)} role="option" aria-selected={active === index || value?.id === station.id} key={station.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(station)}>{station.name}</li>)}
      {!results.length && <li className="no-options" aria-live="polite">No matching stations</li>}
    </ul>}
  </div>;
}
