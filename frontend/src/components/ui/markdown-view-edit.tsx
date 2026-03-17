"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathMarkdown } from "@/components/ui/math-markdown";

interface MarkdownViewEditProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  minHeight?: string;
}

export function MarkdownViewEdit({
  value,
  onChange,
  onBlur,
  placeholder = "Click to edit...",
  className,
  disabled = false,
  readOnly = false,
  minHeight = "60px",
}: MarkdownViewEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const enterEdit = useCallback(() => {
    if (disabled || readOnly) return;
    setIsEditing(true);
  }, [disabled, readOnly]);

  const exitEdit = useCallback(() => {
    setIsEditing(false);
    onBlur?.();
  }, [onBlur]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
      autoResize(textareaRef.current);
    }
  }, [isEditing]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      exitEdit();
    }
  };

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          autoResize(e.target);
        }}
        onBlur={exitEdit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ minHeight }}
        className={cn(
          "flex w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm transition-all outline-none resize-none",
          "border-input placeholder:text-muted-foreground",
          "selection:bg-sage-500 selection:text-foreground",
          "focus-visible:border-2 focus-visible:border-sage-500 focus-visible:ring-sage-500/30 focus-visible:ring-[3px]",
          className
        )}
      />
    );
  }

  return (
    <div
      role={readOnly || disabled ? undefined : "button"}
      tabIndex={readOnly || disabled ? undefined : 0}
      onClick={enterEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") enterEdit();
      }}
      style={{ minHeight }}
      className={cn(
        "group relative w-full rounded-md border border-input bg-white px-3 py-2 text-sm transition-all",
        !disabled && !readOnly && "cursor-text hover:bg-secondary",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {value ? (
        <div className="prose prose-sm max-w-none text-primary [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5">
          <MathMarkdown>{value}</MathMarkdown>
        </div>
      ) : (
        <span className="text-muted-foreground italic text-sm">{placeholder}</span>
      )}
      {!disabled && !readOnly && (
        <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </span>
      )}
    </div>
  );
}
