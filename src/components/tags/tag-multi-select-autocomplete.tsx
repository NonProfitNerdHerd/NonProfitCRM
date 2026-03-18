"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";

export type TagMultiSelectOption = {
  id: string;
  name: string;
  label?: string;
};

export function TagMultiSelectAutocomplete({
  label,
  selected,
  options = [],
  loadOptions,
  placeholder,
  onChange,
  onCreateOption,
  emptyHint,
  loadingHint = "Loading tags...",
  disabled = false,
  maxSelections,
  debounceMs = 250
}: {
  label?: string;
  selected: TagMultiSelectOption[];
  options?: TagMultiSelectOption[];
  loadOptions?: (query: string) => Promise<TagMultiSelectOption[]>;
  placeholder?: string;
  onChange: (next: TagMultiSelectOption[]) => void;
  onCreateOption?: (value: string) => Promise<TagMultiSelectOption | null>;
  emptyHint?: string;
  loadingHint?: string;
  disabled?: boolean;
  maxSelections?: number;
  debounceMs?: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [asyncOptions, setAsyncOptions] = useState<TagMultiSelectOption[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestCounter = useRef(0);
  const listboxId = useId();

  const selectedIds = useMemo(() => new Set(selected.map((entry) => entry.id)), [selected]);
  const selectedNames = useMemo(
    () => new Set(selected.map((entry) => entry.name.trim().toLowerCase()).filter(Boolean)),
    [selected]
  );

  const sourceOptions = loadOptions ? asyncOptions : options;
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const unselected = sourceOptions.filter((entry) => !selectedIds.has(entry.id));
    if (!normalized) {
      return unselected.slice(0, 20);
    }
    return unselected
      .filter((entry) => {
        const labelText = (entry.label || entry.name).toLowerCase();
        return labelText.includes(normalized) || entry.name.toLowerCase().includes(normalized);
      })
      .slice(0, 20);
  }, [sourceOptions, query, selectedIds]);

  const canCreate =
    Boolean(onCreateOption) &&
    query.trim().length > 0 &&
    !selectedNames.has(query.trim().toLowerCase()) &&
    !suggestions.some((entry) => entry.name.toLowerCase() === query.trim().toLowerCase());

  useEffect(() => {
    if (!open || !loadOptions || disabled) return;
    const handle = window.setTimeout(async () => {
      const currentRequest = ++requestCounter.current;
      setLoading(true);
      setRequestError(null);
      try {
        const fetched = await loadOptions(query.trim());
        if (currentRequest !== requestCounter.current) return;
        setAsyncOptions(Array.isArray(fetched) ? fetched : []);
      } catch (error) {
        if (currentRequest !== requestCounter.current) return;
        setAsyncOptions([]);
        setRequestError(error instanceof Error ? error.message : "Unable to load tag options.");
      } finally {
        if (currentRequest === requestCounter.current) {
          setLoading(false);
        }
      }
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [open, query, loadOptions, disabled, debounceMs]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  function focusInput() {
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  function addOption(option: TagMultiSelectOption) {
    if (selectedIds.has(option.id)) return;
    if (typeof maxSelections === "number" && maxSelections > 0) {
      onChange([...selected.slice(0, Math.max(0, maxSelections - 1)), option]);
    } else {
      onChange([...selected, option]);
    }
    setQuery("");
    setOpen(true);
    setHighlightedIndex(0);
    focusInput();
  }

  function removeOption(id: string) {
    onChange(selected.filter((entry) => entry.id !== id));
    focusInput();
  }

  async function createFromQuery() {
    if (!onCreateOption || creating) return;
    const value = query.trim();
    if (!value) return;
    setCreating(true);
    setRequestError(null);
    try {
      const created = await onCreateOption(value);
      if (created) {
        addOption(created);
      } else {
        setQuery("");
        focusInput();
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to create tag.");
    } finally {
      setCreating(false);
    }
  }

  async function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const maxIndex = suggestions.length > 0 ? suggestions.length - 1 : 0;
      setHighlightedIndex((index) => Math.min(index + 1, maxIndex));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Backspace" && !query) {
      const last = selected[selected.length - 1];
      if (last) removeOption(last.id);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      if (!open) return;
      const highlighted = suggestions[Math.min(highlightedIndex, Math.max(0, suggestions.length - 1))];
      if (highlighted) {
        event.preventDefault();
        addOption(highlighted);
        return;
      }
      if (canCreate) {
        event.preventDefault();
        await createFromQuery();
      }
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
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(event) => void handleKeyDown(event)}
            placeholder={placeholder ?? "Type to search tags..."}
            className="h-7 min-w-[180px] flex-1 border-0 px-1 py-0 text-sm shadow-none focus-visible:ring-0"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={open && suggestions[highlightedIndex] ? `${listboxId}-option-${highlightedIndex}` : undefined}
            disabled={disabled}
          />
        </div>
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow"
        >
          {loading ? <div className="px-3 py-2 text-xs text-slate-500">{loadingHint}</div> : null}
          {!loading &&
            suggestions.map((entry, index) => (
              <button
                key={entry.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
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
          {!loading && suggestions.length === 0 ? (
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
              {creating ? "Creating..." : `Create tag "${query.trim()}"`}
            </button>
          ) : null}
          {requestError ? (
            <div className="border-t border-slate-100 px-3 py-2 text-xs text-red-700" aria-live="polite">
              {requestError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
