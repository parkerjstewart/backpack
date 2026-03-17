"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, ChevronRight, RotateCcw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { QuizData } from "@/lib/api/study-tools";

interface QuizViewerProps {
  data: QuizData;
}

export function QuizViewer({ data }: QuizViewerProps) {
  const questions = data.questions;
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [showResults, setShowResults] = useState(false);

  if (!questions.length) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No quiz questions available.
      </div>
    );
  }

  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correct_answer ? 1 : 0),
    0
  );

  const handleSelect = (letter: string) => {
    if (revealed[currentIndex]) return;
    setAnswers((prev) => ({ ...prev, [currentIndex]: letter }));
    setRevealed((prev) => ({ ...prev, [currentIndex]: true }));
  };

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setShowResults(true);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setAnswers({});
    setRevealed({});
    setShowResults(false);
  };

  const answeredCount = Object.keys(revealed).length;

  // Results screen
  if (showResults) {
    const pct = Math.round((score / total) * 100);
    const color =
      pct >= 80
        ? "text-green-600"
        : pct >= 50
          ? "text-amber-600"
          : "text-red-600";

    return (
      <div className="flex flex-col items-center gap-6">
        {/* Score hero */}
        <div className="flex flex-col items-center gap-2 py-4">
          <Trophy className={cn("h-10 w-10", color)} />
          <p className={cn("text-3xl font-bold tabular-nums", color)}>
            {score}/{total}
          </p>
          <p className="text-sm text-muted-foreground">
            {pct}% correct
          </p>
        </div>

        {/* Question summary */}
        <div className="w-full flex flex-col gap-1.5">
          {questions.map((q, i) => {
            const isCorrect = answers[i] === q.correct_answer;
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 px-3 py-2 rounded-sm text-sm"
              >
                {isCorrect ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                )}
                <span className="flex-1 leading-snug">{q.question}</span>
              </div>
            );
          })}
        </div>

        {/* Retake */}
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Retake Quiz
        </Button>
      </div>
    );
  }

  // Question card
  const q = questions[currentIndex];
  const selected = answers[currentIndex];
  const isRevealed = revealed[currentIndex];
  const isCorrect = selected === q.correct_answer;
  const isLastQuestion = currentIndex === total - 1;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Question */}
      <div className="w-full flex flex-col gap-4">
        <p className="text-base font-medium leading-snug text-center px-2">
          {q.question}
        </p>

        {/* Options */}
        <div className="flex flex-col gap-1.5">
          {q.options.map((opt) => {
            const isSelected = selected === opt.letter;
            const isAnswer = opt.letter === q.correct_answer;

            let optClass = "border border-border bg-card hover:bg-secondary";
            if (isRevealed && isAnswer) {
              optClass = "border border-green-500/60 bg-green-50 text-green-800";
            } else if (isRevealed && isSelected && !isAnswer) {
              optClass = "border border-red-500/60 bg-red-50 text-red-800";
            } else if (!isRevealed && isSelected) {
              optClass = "border border-foreground/40 bg-secondary";
            }

            return (
              <button
                key={opt.letter}
                type="button"
                onClick={() => handleSelect(opt.letter)}
                disabled={isRevealed}
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-left transition-colors",
                  optClass,
                  !isRevealed && "cursor-pointer"
                )}
              >
                <span className="shrink-0 w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-medium">
                  {opt.letter}
                </span>
                <span className="flex-1">{opt.text}</span>
                {isRevealed && isAnswer && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                )}
                {isRevealed && isSelected && !isAnswer && (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Explanation (shown after reveal) */}
        {isRevealed && (
          <div className="px-1 space-y-2">
            {!isCorrect && (
              <p className="text-xs text-muted-foreground">
                Correct answer: {q.correct_answer}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {q.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Next / See Results button */}
      {isRevealed && (
        <Button
          size="sm"
          onClick={handleNext}
          className="gap-1.5"
        >
          {isLastQuestion ? "See Results" : "Next"}
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Progress + Dot indicators */}
      <p className="text-xs text-muted-foreground">
        Question {currentIndex + 1} of {total}
      </p>
      <div className="flex gap-1" role="tablist" aria-label="Quiz progress">
        {questions.map((_, i) => (
          <div
            key={i}
            className={cn(
              "rounded-full transition-all",
              i === currentIndex
                ? "w-4 h-1.5 bg-foreground"
                : revealed[i]
                  ? answers[i] === questions[i].correct_answer
                    ? "w-1.5 h-1.5 bg-green-500"
                    : "w-1.5 h-1.5 bg-red-400"
                  : "w-1.5 h-1.5 bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
    </div>
  );
}
