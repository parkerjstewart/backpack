"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Headphones,
  Layers,
  ClipboardCheck,
  Network,
  Trash2,
  Loader2,
  Settings2,
  AlertCircle,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  MoreVertical,
  Pencil,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { SimplePodcastDialog } from "@/components/modules/SimplePodcastDialog";
import { FlashcardViewer } from "@/components/modules/study-tools/FlashcardViewer";
import { QuizViewer } from "@/components/modules/study-tools/QuizViewer";
import { MindMapViewer } from "@/components/modules/study-tools/MindMapViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useStudyToolResults,
  useGenerateFlashcards,
  useGenerateQuiz,
  useGenerateMindMap,
  useGeneratePodcastStudyTool,
  useDeleteStudyToolResult,
  useRenameStudyToolResult,
} from "@/lib/hooks/use-study-tools";
import { useEpisodeProfiles, useSpeakerProfiles } from "@/lib/hooks/use-podcasts";

import { cn } from "@/lib/utils";
import type {
  StudyToolResultResponse,
  FlashcardsData,
  QuizData,
  MindMapData,
  PodcastStudyToolData,
} from "@/lib/api/study-tools";

type ToolType = "podcast" | "flashcards" | "quiz" | "mind_map";

interface Tool {
  id: ToolType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TOOLS: Tool[] = [
  { id: "podcast", label: "Podcast", Icon: Headphones, description: "Generate an audio discussion" },
  { id: "flashcards", label: "Flashcards", Icon: Layers, description: "Q&A flashcards to review" },
  { id: "quiz", label: "Quiz", Icon: ClipboardCheck, description: "Practice multiple-choice quiz" },
  { id: "mind_map", label: "Mind Map", Icon: Network, description: "Visualize key concepts" },
];

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  podcast: Headphones,
  flashcards: Layers,
  quiz: ClipboardCheck,
  mind_map: Network,
};

// ── Mini podcast player ───────────────────────────────────────────────────────

interface PodcastPlayerProps {
  title: string;
  audioUrl: string;
  onClose: () => void;
  onRetry?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];

function PodcastPlayer({ title, audioUrl, onClose, onRetry }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  };

  const cycleSpeed = () => {
    const idx = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const next = PLAYBACK_SPEEDS[(idx + 1) % PLAYBACK_SPEEDS.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => { setDuration(audio.duration); setLoading(false); };
    const onEnded = () => setIsPlaying(false);
    const onError = () => { setLoading(false); setError(true); };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  // Auto-play when mounted
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      void audio.play().catch(() => {/* autoplay blocked */});
    }
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-3 rounded-sm border border-border bg-card px-3 py-2.5 flex flex-col gap-2">
      <audio ref={audioRef} key={audioUrl} src={audioUrl} preload="metadata" />

      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium truncate leading-none">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Close player"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      {error ? (
        <p className="text-xs text-destructive">
          Failed to load audio
          {onRetry && (
            <>
              {" — "}
              <button
                type="button"
                onClick={onRetry}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </>
          )}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 accent-foreground cursor-pointer"
            style={{
              background: `linear-gradient(to right, currentColor ${progress}%, transparent ${progress}%)`,
            }}
          />
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {formatTime(currentTime)}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => skip(-15)}
          disabled={loading || error}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Rewind 15s"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          disabled={loading || error}
          className="h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : error ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => skip(15)}
          disabled={loading || error}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          title="Forward 15s"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={cycleSpeed}
          disabled={loading || error}
          className="min-w-[2.75rem] text-[11px] font-medium tabular-nums text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 text-center"
          title="Playback speed"
        >
          {playbackRate === 1 ? "1×" : `${playbackRate}×`}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface StudyToolsPanelProps {
  moduleId: string;
  moduleName: string;
}

export function StudyToolsPanel({ moduleId, moduleName }: StudyToolsPanelProps) {
  const [viewingResult, setViewingResult] = useState<StudyToolResultResponse | null>(null);
  const [podcastDialogOpen, setPodcastDialogOpen] = useState(false);
  const [playingPodcast, setPlayingPodcast] = useState<{
    resultId: string;
    title: string;
    audioUrl: string;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: results = [], isError, refetch } = useStudyToolResults(moduleId);
  const flashcardsMutation = useGenerateFlashcards();
  const quizMutation = useGenerateQuiz();
  const mindMapMutation = useGenerateMindMap();
  const podcastMutation = useGeneratePodcastStudyTool();
  const deleteMutation = useDeleteStudyToolResult();
  const renameMutation = useRenameStudyToolResult();

  const { episodeProfiles } = useEpisodeProfiles();
  const { speakerProfiles } = useSpeakerProfiles(episodeProfiles);

  // Track previous statuses to detect generating → completed/failed transitions
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  const deleteMutateAsyncRef = useRef(deleteMutation.mutateAsync);
  useEffect(() => {
    deleteMutateAsyncRef.current = deleteMutation.mutateAsync;
  });

  useEffect(() => {
    const prevStatuses = prevStatusesRef.current;
    for (const result of results) {
      const prev = prevStatuses.get(result.id);
      if (prev === "generating") {
        if (result.status === "completed") {
          toast.success(`${result.title} is ready`);
        } else if (result.status === "failed") {
          toast.error(`${result.title} failed to generate`);
          const bare = result.id.split(":").pop() ?? result.id;
          void deleteMutateAsyncRef.current({ resultId: bare, moduleId });
        }
      }
    }
    const next = new Map<string, string>();
    for (const result of results) {
      next.set(result.id, result.status);
    }
    prevStatusesRef.current = next;
  }, [results, moduleId]);

  const getPreferredProfile = useCallback(
    (profiles: { name: string }[], preferred = "solo_expert") =>
      profiles.find((p) => p.name === preferred) ?? profiles[0],
    []
  );

  const handlePodcastRetry = useCallback(() => {
    if (!playingPodcast) return;
    const base = playingPodcast.audioUrl.split("?")[0];
    setPlayingPodcast({ ...playingPodcast, audioUrl: `${base}?t=${Date.now()}` });
  }, [playingPodcast]);

  const handlePodcastClick = useCallback(
    (result: StudyToolResultResponse) => {
      if (playingPodcast?.resultId === result.id) {
        setPlayingPodcast(null);
        return;
      }

      const podData = result.data as PodcastStudyToolData;
      const audioUrl =
        podData?.audio_url ||
        (podData?.episode_id
          ? `/api/podcasts/episodes/${podData.episode_id}/audio`
          : null);
      if (!audioUrl) {
        toast.error("No audio URL available for this podcast");
        return;
      }

      setPlayingPodcast({ resultId: result.id, title: result.title, audioUrl });
    },
    [playingPodcast]
  );

  const handleToolClick = async (toolId: ToolType) => {
    if (toolId === "podcast") {
      const hasProfiles = episodeProfiles.length > 0 && speakerProfiles.length > 0;
      if (hasProfiles) {
        const epProfile = getPreferredProfile(episodeProfiles);
        const spProfile = getPreferredProfile(speakerProfiles);
        try {
          await podcastMutation.mutateAsync({
            moduleId,
            body: {
              episode_profile: epProfile.name,
              speaker_profile: spProfile.name,
              episode_name: moduleName,
              briefing_suffix: null,
            },
          });
          toast.success("Podcast generation started", {
            description: "It will appear in the results when ready.",
          });
        } catch {
          toast.error("Failed to start podcast generation");
        }
      } else {
        setPodcastDialogOpen(true);
      }
      return;
    }

    try {
      if (toolId === "flashcards") {
        await flashcardsMutation.mutateAsync(moduleId);
      } else if (toolId === "quiz") {
        await quizMutation.mutateAsync(moduleId);
      } else {
        await mindMapMutation.mutateAsync(moduleId);
      }
    } catch {
      toast.error("Failed to start generation. Please try again.");
    }
  };

  const handleDelete = async (result: StudyToolResultResponse) => {
    const bare = result.id.split(":").pop() ?? result.id;
    await deleteMutation.mutateAsync({ resultId: bare, moduleId });
    if (viewingResult?.id === result.id) setViewingResult(null);
    if (playingPodcast?.resultId === result.id) {
      setPlayingPodcast(null);
    }
  };

  const handleRenameStart = (result: StudyToolResultResponse) => {
    setRenamingId(result.id);
    setRenameValue(result.title);
  };

  const handleRenameCommit = async (result: StudyToolResultResponse) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== result.title) {
      const bare = result.id.split(":").pop() ?? result.id;
      try {
        await renameMutation.mutateAsync({ resultId: bare, moduleId, title: trimmed });
      } catch {
        toast.error("Failed to rename");
      }
    }
    setRenamingId(null);
  };

  const handleResultClick = (result: StudyToolResultResponse) => {
    if (renamingId === result.id) return;
    if (result.tool_type === "podcast") {
      void handlePodcastClick(result);
    } else {
      setViewingResult(result);
    }
  };

  const renderViewer = (result: StudyToolResultResponse) => {
    if (result.tool_type === "flashcards") {
      return <FlashcardViewer data={result.data as FlashcardsData} />;
    }
    if (result.tool_type === "quiz") {
      return <QuizViewer data={result.data as QuizData} />;
    }
    if (result.tool_type === "mind_map") {
      return <MindMapViewer data={result.data as MindMapData} />;
    }
    return null;
  };

  const hasActivity = results.length > 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Tool buttons — 2-column grid */}
        <div className="grid grid-cols-2 gap-2">
          {TOOLS.map(({ id, label, Icon }) => {
            const isGenerating = results.some(
              (r) => r.tool_type === id && r.status === "generating"
            );
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleToolClick(id)}
                disabled={isGenerating}
                className={cn(
                  "relative flex flex-col gap-3 p-3 rounded-sm border border-border",
                  "bg-card text-left transition-all duration-200",
                  "hover:bg-secondary cursor-pointer",
                  isGenerating && "opacity-60 cursor-not-allowed"
                )}
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium">{label}</p>
                  {id === "podcast" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPodcastDialogOpen(true);
                      }}
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Customize podcast settings"
                    >
                      <Settings2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {isGenerating && (
                  <Loader2 className="absolute top-2 right-2 h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>

        {/* Error banner when backend is unreachable */}
        {isError && results.some((r) => r.status === "generating") && (
          <div className="flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive flex-1">
              Unable to reach server — generation status unknown
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="shrink-0 p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
              title="Retry"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Results list */}
        {hasActivity && (
          <div className="flex flex-col">
            <div className="border-t border-border mb-1" />
            {results.map((result) => {
              const Icon = TOOL_ICONS[result.tool_type] ?? Layers;
              const isGenerating = result.status === "generating";
              const isFailed = result.status === "failed";
              const isPodcast = result.tool_type === "podcast";
              const podData = isPodcast ? (result.data as PodcastStudyToolData) : null;
              const hasAudio = !!(podData?.audio_url || podData?.episode_id);
              const isActivePodcast = playingPodcast?.resultId === result.id;

              const isRenaming = renamingId === result.id;

              if (isGenerating) {
                const createdMs = result.created ? new Date(result.created).getTime() : 0;
                const isStale = createdMs > 0 && Date.now() - createdMs > 10 * 60 * 1000;
                return (
                  <div
                    key={result.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-sm",
                      !isStale && "animate-pulse"
                    )}
                  >
                    {isStale ? (
                      <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-muted-foreground">
                        {result.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isStale ? "Generation may have stalled" : "Generating…"}
                      </p>
                    </div>
                    {isStale ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(result)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        title="Delete stalled result"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    )}
                  </div>
                );
              }

              if (isFailed) {
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-sm"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-muted-foreground line-through">
                        {result.title}
                      </p>
                      <p className="text-xs text-destructive">Generation failed</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => void handleDelete(result)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              }

              return (
                <div key={result.id} className="flex flex-col">
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-sm transition-colors",
                      !isRenaming && (!isPodcast || hasAudio) && "hover:bg-secondary cursor-pointer",
                      isActivePodcast && "bg-secondary",
                      isPodcast && !hasAudio && "opacity-60"
                    )}
                    onClick={() => (!isPodcast || hasAudio) ? handleResultClick(result) : undefined}
                  >
                    {isPodcast ? (
                      <div className="shrink-0">
                        {isActivePodcast ? (
                          <Pause className="h-4 w-4 text-foreground" />
                        ) : (
                          <Play className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}

                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleRenameCommit(result)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleRenameCommit(result);
                            } else if (e.key === "Escape") {
                              setRenamingId(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-sm font-medium bg-transparent border-b border-border outline-none"
                        />
                      ) : (
                        <p className="text-sm font-medium truncate">{result.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {result.created
                          ? formatDistanceToNow(new Date(result.created), { addSuffix: true })
                          : ""}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRenameStart(result);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(result);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Inline podcast player expands below the row */}
                  {isActivePodcast && playingPodcast && (
                    <PodcastPlayer
                      title={playingPodcast.title}
                      audioUrl={playingPodcast.audioUrl}
                      onRetry={handlePodcastRetry}
                      onClose={() => setPlayingPodcast(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!hasActivity && (
          <p className="text-sm text-muted-foreground italic">
            Click a tool above to generate content for this module.
          </p>
        )}
      </div>

      {/* Result viewer dialog (flashcards, quiz, mind map) */}
      <Dialog
        open={viewingResult !== null}
        onOpenChange={(open) => {
          if (!open) setViewingResult(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingResult?.title}</DialogTitle>
          </DialogHeader>
          {viewingResult && renderViewer(viewingResult)}
        </DialogContent>
      </Dialog>

      {/* Podcast configuration dialog */}
      <SimplePodcastDialog
        open={podcastDialogOpen}
        onOpenChange={setPodcastDialogOpen}
        moduleId={moduleId}
        moduleName={moduleName}
      />
    </>
  );
}
