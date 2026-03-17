"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";

export type TagTypeaheadOption = {
  id: string;
  name: string;
  label?: string;
};

export function TagTypeaheadMulti({
  label,
  selected,
  options,
  placeholder,
  onChange,
  onCreateOption,
  emptyHint
}: {
  label?: string;
  selected: TagTypeaheadOption[];
  options: TagTypeaheadOption[];
  placeholder?: string;
  onChange: (next: TagTypeaheadOption[]) => void;
  onCreateOption?: (value: string) => Promise<TagTypeaheadOption | null>;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [creating, setCreating] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((entry) => entry.id)), [selected]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const unselected = options.filter((entry) => !selectedIds.has(entry.id));
    if (!normalized) {
      return unselected.slice(0, 12);
    }
    return unselected
      .filter((entry) => {
        const label = (entry.label || entry.name).toLowerCase();
        return label.includes(normalized) || entry.name.toLowerCase().includes(normalized);
      })
      .slice(0, 12);
  }, [options, query, selectedIds]);

  const canCreate =
    Boolean(onCreateOption) &&
    query.trim().length > 0 &&
    !selected.some((entry) => entry.name.toLowerCase() === query.trim().toLowerCase()) &&
    !options.some((entry) => entry.name.toLowerCase() === query.trim().toLowerCase());

  function addOption(option: TagTypeaheadOption) {
    if (selectedIds.has(option.id)) return;
    onChange([...selected, option]);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(0);
  }

  function removeOption(id: string) {
    onChange(selected.filter((entry) => entry.id !== id));
  }

  async function createFromQuery() {
    if (!onCreateOption) return;
    const value = query.trim();
    if (!value) return;
    setCreating(true);
    try {
      const created = await onCreateOption(value);
      if (created) {
        onChange([...selected, created]);
      }
      setQuery("");
      setOpen(false);
      setHighlightedIndex(0);
    } finally {
      setCreating(false);
    }
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(0, suggestions.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Backspace" && !query) {
      const last = selected[selected.length - 1];
      if (last) {
        removeOption(last.id);
      }
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (!open && !canCreate) return;
      if (suggestions.length > 0) {
        event.preventDefault();
        const selectedSuggestion = suggestions[Math.min(highlightedIndex, suggestions.length - 1)];
        if (selectedSuggestion) addOption(selectedSuggestion);
        return;
      }
      if (canCreate && event.key === "Enter") {
        event.preventDefault();
        await createFromQuery();
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      {label ? <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label> : null}
      <div className="min-h-10 rounded-md border border-slate-300 px-2 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((entry) => (
            <span
              key={entry.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800"
            >
              {entry.label || entry.name}
              <button
                type="button"
                className="rounded px-1 text-brand-700 hover:bg-brand-100"
                onClick={() => removeOption(entry.id)}
                aria-label={`Remove ${entry.name}`}
              >
                x
              </button>
            </span>
          ))}
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(event) => void handleKeyDown(event)}
            placeholder={placeholder ?? "Type to search tags..."}
            className="h-7 min-w-[180px] flex-1 border-0 px-1 py-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow">
          {suggestions.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={`block w-full px-3 py-2 text-left ${
                index === highlightedIndex ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50"
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                addOption(entry);
              }}
            >
              <span className="font-medium text-slate-900">{entry.name}</span>
              {entry.label && entry.label !== entry.name ? (
                <span className="ml-2 text-xs text-slate-500">{entry.label}</span>
              ) : null}
            </button>
          ))}
          {suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">{emptyHint ?? "No matching tags."}</div>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              className="block w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-medium text-brand-700 hover:bg-brand-50"
              onMouseDown={(event) => {
                event.preventDefault();
                void createFromQuery();
              }}
              disabled={creating}
            >
              {creating ? "Creating..." : `Create "${query.trim()}"`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
