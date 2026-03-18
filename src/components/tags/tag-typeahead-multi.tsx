"use client";

import {
  TagMultiSelectAutocomplete,
  type TagMultiSelectOption
} from "@/components/tags/tag-multi-select-autocomplete";

export type TagTypeaheadOption = TagMultiSelectOption;

export function TagTypeaheadMulti({
  label,
  selected,
  options,
  loadOptions,
  placeholder,
  onChange,
  onCreateOption,
  emptyHint,
  maxSelections
}: {
  label?: string;
  selected: TagTypeaheadOption[];
  options?: TagTypeaheadOption[];
  loadOptions?: (query: string) => Promise<TagTypeaheadOption[]>;
  placeholder?: string;
  onChange: (next: TagTypeaheadOption[]) => void;
  onCreateOption?: (value: string) => Promise<TagTypeaheadOption | null>;
  emptyHint?: string;
  maxSelections?: number;
}) {
  return (
    <TagMultiSelectAutocomplete
      label={label}
      selected={selected}
      options={options ?? []}
      loadOptions={loadOptions}
      placeholder={placeholder}
      onChange={onChange}
      onCreateOption={onCreateOption}
      emptyHint={emptyHint}
      maxSelections={maxSelections}
    />
  );
}
