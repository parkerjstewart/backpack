"use client";

import { useState, useRef, useId, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2, Mic } from "lucide-react";

// Max lines before the textarea scrolls instead of growing
const MAX_LINES = 4;

interface ChatInputProps {
  /** Called with the trimmed message text when the user submits. */
  onSend: (message: string) => void;
  placeholder?: string;
  /** Disables the textarea and send button (e.g. while a response is streaming). */
  disabled?: boolean;
  // --- Voice ---
  /** When undefined, the mic button is hidden. */
  sessionId?: string | null;
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  /** Text shown above the input while recording or transcribing. */
  voiceStatus?: string;
  // --- Suggestions ---
  suggestions?: string[];
  isSuggestionsLoading?: boolean;
  /** When true, removes the card border/background so it can be embedded inside a parent card. */
  noCard?: boolean;
  className?: string;
}

/**
 * Shared chat input.
 *
 * Single-line:  [Mic?] [Textarea ·············] [Send]
 * Multi-line:   [Textarea full-width            ]
 *               [Mic?]                   [Send]
 *
 * Grows up to MAX_LINES then scrolls. Textarea height animates smoothly.
 */
export function ChatInput({
  onSend,
  placeholder = "Type your response…",
  disabled = false,
  sessionId,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  voiceStatus,
  suggestions = [],
  isSuggestionsLoading = false,
  noCard = false,
  className,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  const showMic =
    sessionId !== undefined && onStartRecording && onStopRecording;

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const computed = window.getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight) || 24;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const singleLineHeight = lineHeight + paddingTop + paddingBottom;
    const maxHeight = lineHeight * MAX_LINES + paddingTop + paddingBottom;
    const scrollH = el.scrollHeight;
    const shouldScroll = scrollH > maxHeight;
    el.style.height = `${Math.min(scrollH, maxHeight)}px`;
    el.style.overflowY = shouldScroll ? "scroll" : "hidden";
    setIsScrollable(shouldScroll);
    // +1px tolerance avoids false multiline toggles from subpixel rounding.
    setIsMultiLine(scrollH > singleLineHeight + 1);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea(e.target);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.overflowY = "hidden";
      }
      setIsScrollable(false);
      setIsMultiLine(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const MicButton = showMic ? (
    <Button
      type="button"
      variant={isRecording ? "destructive" : "ghost"}
      size="icon"
      className="h-8 w-8 rounded-full flex-shrink-0"
      disabled={!sessionId || disabled}
      onClick={() => (isRecording ? onStopRecording!() : onStartRecording!())}
      title={
        isRecording ? "Click to stop and send" : "Click to start recording"
      }
    >
      <Mic className="h-4 w-4" />
    </Button>
  ) : null;

  const SendButton = (
    <Button
      type="button"
      onClick={handleSend}
      disabled={!input.trim() || disabled}
      size="icon"
      className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
    >
      {disabled ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowUp className="h-4 w-4" />
      )}
    </Button>
  );

  const sharedTextareaProps = {
    ref: textareaRef,
    id: inputId,
    name: "chat-message" as const,
    autoComplete: "off" as const,
    wrap: "soft" as const,
    value: input,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    placeholder,
    disabled,
    rows: 1,
    className: `bg-transparent resize-none outline-none text-sm placeholder:text-muted-foreground leading-6 py-0 transition-[height] duration-200 ease-in-out break-words [overflow-wrap:anywhere] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border ${isScrollable ? "[&::-webkit-scrollbar-thumb]:opacity-100" : "[&::-webkit-scrollbar-thumb]:opacity-0"}`,
  };

  return (
    <div className={className}>
      {/* Suggestion pills */}
      {(isSuggestionsLoading || suggestions.length > 0) && !disabled && (
        <div className="flex flex-wrap gap-2 mb-2">
          {isSuggestionsLoading && suggestions.length === 0
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-7 rounded-full bg-muted animate-pulse"
                  style={{ width: `${60 + i * 20}px` }}
                />
              ))
            : suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSend(s)}
                  className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  {s}
                </button>
              ))}
        </div>
      )}

      {/* Voice status */}
      {voiceStatus && (
        <p className="text-xs text-muted-foreground px-1 mb-1">{voiceStatus}</p>
      )}

      {/* Input box */}
      <div
        className={
          noCard
            ? "p-4"
            : "bg-white border border-border rounded-2xl p-4 transition-all duration-200"
        }
      >
        {isMultiLine ? (
          /* Multi-line: textarea full-width, buttons on bottom row */
          <>
            {/* pl-2 aligns first character with mic glyph (not the button edge). */}
            <textarea
              {...sharedTextareaProps}
              className={`${sharedTextareaProps.className} w-full pl-2`}
            />
            <div className="flex items-center justify-between mt-3">
              {MicButton ?? <span />}
              {SendButton}
            </div>
          </>
        ) : (
          /* Single-line: mic | textarea | send all inline */
          <div className="flex items-center gap-2">
            {MicButton}
            <textarea
              {...sharedTextareaProps}
              className={`${sharedTextareaProps.className} flex-1 w-0`}
            />
            {SendButton}
          </div>
        )}
      </div>
    </div>
  );
}
