"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { QuizData } from "@/lib/api/study-tools";

interface QuizViewerProps {
  data: QuizData;
}

export function QuizViewer({ data }: QuizViewerProps) {
  const questions = data.questions;
  const [answers, setAnswers] = useState<Record<number, string>>({});
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
  const total = questions.length;
  const allAnswered = Object.keys(answers).length === total;

  const handleSelect = (questionIdx: number, letter: string) => {
    if (showResults) return;
    setAnswers((prev) => ({ ...prev, [questionIdx]: letter }));
  };

  const handleSubmit = () => setShowResults(true);

  const handleReset = () => {
    setAnswers({});
    setShowResults(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {showResults && (
        <div className="flex items-center justify-between rounded-sm border border-border bg-card p-4">
          <div>
            <p className="text-sm font-medium">
              Score: {score}/{total}
            </p>
            <p className="text-xs text-muted-foreground">
              {Math.round((score / total) * 100)}% correct
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Retake quiz
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {questions.map((q, qi) => {
          const selected = answers[qi];
          const isCorrect = selected === q.correct_answer;

          return (
            <div key={qi} className="flex flex-col gap-3">
              <p className="text-sm font-medium leading-snug">
                <span className="text-muted-foreground mr-1.5">{qi + 1}.</span>
                {q.question}
              </p>

              <div className="flex flex-col gap-1.5">
                {q.options.map((opt) => {
                  const isSelected = selected === opt.letter;
                  const isAnswer = opt.letter === q.correct_answer;
                  let optClass = "border border-border bg-card hover:bg-secondary";

                  if (showResults && isAnswer) {
                    optClass = "border border-green-500/60 bg-green-50 text-green-800";
                  } else if (showResults && isSelected && !isAnswer) {
                    optClass = "border border-red-500/60 bg-red-50 text-red-800";
                  } else if (!showResults && isSelected) {
                    optClass = "border border-foreground/40 bg-secondary";
                  }

                  return (
                    <button
                      key={opt.letter}
                      type="button"
                      onClick={() => handleSelect(qi, opt.letter)}
                      disabled={showResults}
                      className={cn(
                        "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-left transition-colors",
                        optClass,
                        !showResults && "cursor-pointer"
                      )}
                    >
                      <span className="shrink-0 w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-medium">
                        {opt.letter}
                      </span>
                      <span className="flex-1">{opt.text}</span>
                      {showResults && isAnswer && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                      )}
                      {showResults && isSelected && !isAnswer && (
                        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {showResults && (
                <p className="text-xs text-muted-foreground pl-1">
                  {q.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!showResults && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!allAnswered}
          >
            Submit answers
          </Button>
        </div>
      )}
    </div>
  );
}
