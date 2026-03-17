"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FlashcardsData } from "@/lib/api/study-tools";

interface FlashcardViewerProps {
  data: FlashcardsData;
}

export function FlashcardViewer({ data }: FlashcardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const cards = data.cards;
  const total = cards.length;
  const card = cards[currentIndex];

  const goToPrev = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => (i - 1 + total) % total);
  };

  const goToNext = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => (i + 1) % total);
  };

  const handleFlip = () => setIsFlipped((f) => !f);

  const handleFlipKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleFlip();
    }
  };

  if (!cards.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No flashcards available.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-muted-foreground">
        {currentIndex + 1} of {total} — click card or press Enter to flip
      </p>

      {/* Flip card */}
      <div
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? `Answer: ${card.answer}` : `Question: ${card.question}. Press Enter to reveal answer.`}
        className="w-full max-w-2xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        style={{ perspective: "1000px" }}
        onClick={handleFlip}
        onKeyDown={handleFlipKeyDown}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            minHeight: "220px",
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-sm border border-border bg-card text-center"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Question
            </span>
            <p className="text-base font-medium leading-relaxed">{card.question}</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-sm border border-border bg-secondary text-center"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Answer
            </span>
            <p className="text-base leading-relaxed">{card.answer}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrev}
          disabled={total <= 1}
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFlip}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Flip
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNext}
          disabled={total <= 1}
          aria-label="Next card"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-1" role="tablist" aria-label="Flashcard navigation">
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-label={`Card ${i + 1}`}
            aria-selected={i === currentIndex}
            onClick={() => {
              setIsFlipped(false);
              setCurrentIndex(i);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === currentIndex
                ? "w-4 bg-foreground"
                : "w-1.5 bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
    </div>
  );
}
