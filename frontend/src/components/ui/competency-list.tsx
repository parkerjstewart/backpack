"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Parse a competencies string (dash-prefixed lines) into individual items. */
export function parseCompetencies(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.replace(/^[\-\*•]\s*/, "").trim())
    .filter(Boolean);
}

/** Serialize items back to dash-prefixed multiline string. */
export function serializeCompetencies(items: string[]): string {
  return items
    .filter((item) => item.trim())
    .map((item) => `- ${item}`)
    .join("\n");
}

interface CompetencyListProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

export function CompetencyList({
  value,
  onChange,
  onBlur,
  placeholder = "Abilities to apply learned concepts...",
  disabled = false,
  readOnly = false,
  className,
}: CompetencyListProps) {
  const [localItems, setLocalItems] = useState<string[]>(() =>
    parseCompetencies(value)
  );
  const internalChangeRef = useRef(false);

  // Sync from external value changes, but not when we triggered the change
  useEffect(() => {
    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    setLocalItems(parseCompetencies(value));
  }, [value]);

  const update = useCallback(
    (newItems: string[]) => {
      internalChangeRef.current = true;
      setLocalItems(newItems);
      onChange(serializeCompetencies(newItems));
    },
    [onChange]
  );

  const handleChange = (index: number, newValue: string) => {
    const next = [...localItems];
    next[index] = newValue;
    update(next);
  };

  const handleRemove = (index: number) => {
    const next = localItems.filter((_, i) => i !== index);
    update(next);
    onBlur?.();
  };

  const handleAdd = () => {
    internalChangeRef.current = true;
    setLocalItems((prev) => [...prev, ""]);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...localItems];
      next.splice(index + 1, 0, "");
      internalChangeRef.current = true;
      setLocalItems(next);
      // Focus new item after render
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          "[data-competency-input]"
        );
        inputs[index + 1]?.focus();
      }, 0);
    } else if (e.key === "Backspace" && localItems[index] === "" && localItems.length > 1) {
      e.preventDefault();
      const next = localItems.filter((_, i) => i !== index);
      update(next);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>(
          "[data-competency-input]"
        );
        inputs[Math.max(0, index - 1)]?.focus();
      }, 0);
    }
  };

  if (readOnly || disabled) {
    const readOnlyItems = parseCompetencies(value);
    return (
      <div
        className={cn(
          "w-full rounded-md border border-input bg-white px-3 py-2 text-sm",
          disabled && "opacity-50",
          className
        )}
      >
        {readOnlyItems.length === 0 ? (
          <span className="text-muted-foreground italic">{placeholder}</span>
        ) : (
          <ul className="space-y-1">
            {readOnlyItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-primary">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {localItems.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">{placeholder}</p>
      )}
      {localItems.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[10px] font-medium text-muted-foreground">
            {index + 1}
          </span>
          <Input
            data-competency-input
            value={item}
            onChange={(e) => handleChange(index, e.target.value)}
            onBlur={onBlur}
            onKeyDown={(e) => handleKeyDown(e, index)}
            placeholder={`Competency ${index + 1}`}
            className="flex-1 h-8 text-sm"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="flex-shrink-0 p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove competency"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAdd}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
      >
        <Plus className="h-3 w-3 mr-1" />
        Add competency
      </Button>
    </div>
  );
}
