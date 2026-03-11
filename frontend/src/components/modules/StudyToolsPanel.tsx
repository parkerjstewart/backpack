"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Headphones,
  Layers,
  ClipboardCheck,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { SimplePodcastDialog } from "@/components/modules/SimplePodcastDialog";
import {
  useGenerateFlashcards,
  useGenerateKeyConcepts,
  useGenerateQuiz,
} from "@/lib/hooks/use-study-tools";
import { cn } from "@/lib/utils";

type ToolId = "podcast" | "flashcards" | "quiz" | "key_concepts";

interface Tool {
  id: ToolId;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: Tool[] = [
  {
    id: "podcast",
    label: "Podcast",
    description: "Generate an audio discussion on this module's content.",
    Icon: Headphones,
  },
  {
    id: "flashcards",
    label: "Flashcards",
    description: "Generate Q&A flashcards from module content.",
    Icon: Layers,
  },
  {
    id: "quiz",
    label: "Quiz",
    description: "Take a multiple-choice practice quiz.",
    Icon: ClipboardCheck,
  },
  {
    id: "key_concepts",
    label: "Key Concepts",
    description: "Review key terms and definitions.",
    Icon: Lightbulb,
  },
];

interface StudyToolsPanelProps {
  moduleId: string;
  moduleName: string;
}

export function StudyToolsPanel({ moduleId, moduleName }: StudyToolsPanelProps) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [results, setResults] = useState<Partial<Record<ToolId, string>>>({});
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false);

  const flashcardsMutation = useGenerateFlashcards();
  const quizMutation = useGenerateQuiz();
  const keyConceptsMutation = useGenerateKeyConcepts();

  const isLoading =
    (activeTool === "flashcards" && flashcardsMutation.isPending) ||
    (activeTool === "quiz" && quizMutation.isPending) ||
    (activeTool === "key_concepts" && keyConceptsMutation.isPending);

  const error =
    (activeTool === "flashcards" && flashcardsMutation.error) ||
    (activeTool === "quiz" && quizMutation.error) ||
    (activeTool === "key_concepts" && keyConceptsMutation.error);

  const handleGenerate = async (toolId: ToolId, forceRegenerate = false) => {
    if (toolId === "podcast") {
      setPodcastDialogOpen(true);
      return;
    }

    setActiveTool(toolId);

    if (results[toolId] && !forceRegenerate) {
      return;
    }

    const generate = async () => {
      let data: { content: string } | undefined;
      if (toolId === "flashcards") {
        data = await flashcardsMutation.mutateAsync(moduleId);
      } else if (toolId === "quiz") {
        data = await quizMutation.mutateAsync(moduleId);
      } else if (toolId === "key_concepts") {
        data = await keyConceptsMutation.mutateAsync(moduleId);
      }
      if (data) {
        setResults((prev) => ({ ...prev, [toolId]: data!.content }));
      }
    };

    generate();
  };

  const handleToolClick = (toolId: ToolId) => {
    if (toolId === "podcast") {
      setPodcastDialogOpen(true);
      return;
    }
    setActiveTool(toolId);
    if (!results[toolId]) {
      handleGenerate(toolId);
    }
  };

  const loadingLabel =
    activeTool === "flashcards"
      ? "Generating flashcards…"
      : activeTool === "quiz"
        ? "Generating quiz…"
        : activeTool === "key_concepts"
          ? "Generating key concepts…"
          : "Generating…";

  return (
    <>
      <div className="grid grid-cols-[auto_1fr] gap-6 items-start">
        {/* Left: Tool Cards */}
        <div className="grid grid-cols-2 gap-3 w-[320px]">
          {TOOLS.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleToolClick(id)}
              className={cn(
                "flex flex-col items-start gap-2 p-4 rounded-sm border border-border",
                "bg-card text-left transition-all duration-200 cursor-pointer",
                "hover:bg-secondary",
                activeTool === id && id !== "podcast" && "ring-2 ring-accent"
              )}
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted-foreground leading-snug">
                {description}
              </span>
            </button>
          ))}
        </div>

        {/* Right: Result Panel */}
        <div className="flex-1 min-w-0">
          {!activeTool ? (
            <div className="flex items-center justify-center h-48 rounded-md bg-secondary text-sm text-muted-foreground">
              Select a study tool to get started
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 h-48 rounded-md border border-border bg-card">
              <LoadingSpinner size="md" />
              <p className="text-sm text-muted-foreground">{loadingLabel}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 h-48 rounded-md border border-destructive/30 bg-destructive/5">
              <p className="text-sm text-destructive">
                Something went wrong. Please try again.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => activeTool && handleGenerate(activeTool, true)}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : results[activeTool] ? (
            <div className="relative rounded-md bg-secondary p-6">
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-3 right-3 text-xs"
                onClick={() => handleGenerate(activeTool, true)}
                disabled={isLoading}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </Button>
              <div className="prose prose-sm max-w-none pr-24">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {results[activeTool]}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 rounded-md bg-secondary text-sm text-muted-foreground">
              Select a study tool to get started
            </div>
          )}
        </div>
      </div>

      <SimplePodcastDialog
        open={podcastDialogOpen}
        onOpenChange={setPodcastDialogOpen}
        moduleId={moduleId}
        moduleName={moduleName}
      />
    </>
  );
}
