"use client";

import * as React from "react";
import { LuCheck, LuChevronsUpDown, LuPlus } from "react-icons/lu";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Sentinel value for "my university isn't listed". */
export const OTHER_UNIVERSITY = "__other__";

export interface UniversityOption {
  id: string;
  name: string;
  abbreviation: string;
}

interface UniversityComboboxProps {
  id: string;
  universities: UniversityOption[];
  /** A university id, OTHER_UNIVERSITY, or "" for nothing chosen. */
  value: string;
  /** `typed` is what the user had typed when they chose — used to prefill "Other". */
  onChange: (value: string, typed?: string) => void;
  onBlur?: () => void;
  allowOther?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

/**
 * University picker that supports both typing and scrolling.
 *
 * Type to filter by name or abbreviation ("uniben", "benin"), or open the list
 * and scroll it. "Other (not listed)" sits at the end of every result set so
 * nobody is stuck when their school is missing; choosing it hands whatever was
 * typed back to the form to prefill the free-text field.
 *
 * Implements the ARIA 1.2 combobox pattern: the input owns focus, the list is
 * a listbox driven by `aria-activedescendant`, and Arrow keys / Enter / Escape
 * behave as a screen reader expects. Options are 48px tall for touch.
 */
export function UniversityCombobox({
  id,
  universities,
  value,
  onChange,
  onBlur,
  allowOther = true,
  invalid = false,
  placeholder = "Type or choose your university",
}: UniversityComboboxProps) {
  const listId = `${id}-listbox`;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const selected = universities.find((u) => u.id === value);
  const display =
    value === OTHER_UNIVERSITY
      ? "Other (not listed)"
      : selected
        ? `${selected.name} (${selected.abbreviation})`
        : "";

  const q = query.trim().toLowerCase();
  const matches = q
    ? universities.filter(
        (u) => u.name.toLowerCase().includes(q) || u.abbreviation.toLowerCase().includes(q)
      )
    : universities;

  const options = [
    ...matches.map((u) => ({ value: u.id, label: u.name, hint: u.abbreviation })),
    ...(allowOther
      ? [
          {
            value: OTHER_UNIVERSITY,
            label: q && matches.length === 0 ? `Use “${query.trim()}”` : "Other (not listed)",
            hint: "",
          },
        ]
      : []),
  ];

  // Keep the highlighted option in range and in view.
  React.useEffect(() => {
    if (active >= options.length) setActive(Math.max(0, options.length - 1));
  }, [options.length, active]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Close on any press outside the control.
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const choose = (optionValue: string) => {
    onChange(optionValue, optionValue === OTHER_UNIVERSITY ? query.trim() : undefined);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) setOpen(true);
        else setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (open && options[active]) {
          event.preventDefault();
          choose(options[active].value);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
          setQuery("");
        }
        break;
      case "Tab":
        setOpen(false);
        setQuery("");
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={open ? query : display}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cn("flex h-12 px-3.5 pr-11", fieldClasses)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Close university list" : "Show all universities"}
        onPointerDown={(e) => {
          // Keep focus in the input; toggle the list instead.
          e.preventDefault();
          setOpen((o) => !o);
          setQuery("");
        }}
        className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center text-subtle transition-colors hover:text-foreground"
      >
        <LuChevronsUpDown className="size-4" aria-hidden />
      </button>

      {open ? (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Universities"
          className="absolute inset-x-0 top-full z-overlay mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-xl bg-popover p-1 text-popover-foreground shadow-lift"
        >
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">No university matches.</li>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isOther = opt.value === OTHER_UNIVERSITY;
              return (
                <li
                  key={opt.value}
                  id={`${id}-option-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(opt.value)}
                  onPointerEnter={() => setActive(i)}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[15px]",
                    i === active && "bg-zone",
                    isOther && "mt-1 text-primary"
                  )}
                >
                  {isOther ? <LuPlus className="size-4 shrink-0" aria-hidden /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{opt.label}</span>
                  </span>
                  {opt.hint ? (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{opt.hint}</span>
                  ) : null}
                  {isSelected ? <LuCheck className="size-4 shrink-0 text-primary" aria-hidden /> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
