"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEpisodeProfiles, useSpeakerProfiles } from "@/lib/hooks/use-podcasts";
import { useGeneratePodcastStudyTool } from "@/lib/hooks/use-study-tools";

interface SimplePodcastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  moduleName: string;
}

export function SimplePodcastDialog({
  open,
  onOpenChange,
  moduleId,
  moduleName,
}: SimplePodcastDialogProps) {
  const router = useRouter();
  const [episodeProfileName, setEpisodeProfileName] = useState("");
  const [speakerProfileName, setSpeakerProfileName] = useState("");
  const [episodeName, setEpisodeName] = useState(moduleName);
  const [briefingSuffix, setBriefingSuffix] = useState("");

  const { episodeProfiles, isLoading: profilesLoading } = useEpisodeProfiles();
  const { speakerProfiles, isLoading: speakersLoading } = useSpeakerProfiles(episodeProfiles);
  const podcastMutation = useGeneratePodcastStudyTool();

  const hasProfiles = episodeProfiles.length > 0 && speakerProfiles.length > 0;
  const isLoading = profilesLoading || speakersLoading;

  useEffect(() => {
    if (episodeProfiles.length > 0 && !episodeProfileName) {
      const preferred = episodeProfiles.find((p) => p.name === "solo_expert") ?? episodeProfiles[0];
      setEpisodeProfileName(preferred.name);
    }
    if (speakerProfiles.length > 0 && !speakerProfileName) {
      const preferred = speakerProfiles.find((p) => p.name === "solo_expert") ?? speakerProfiles[0];
      setSpeakerProfileName(preferred.name);
    }
  }, [episodeProfiles, speakerProfiles, episodeProfileName, speakerProfileName]);

  useEffect(() => {
    setEpisodeName(moduleName);
  }, [moduleName]);

  const handleSubmit = async () => {
    if (!episodeProfileName || !speakerProfileName || !episodeName) return;

    try {
      await podcastMutation.mutateAsync({
        moduleId,
        body: {
          episode_profile: episodeProfileName,
          speaker_profile: speakerProfileName,
          episode_name: episodeName,
          briefing_suffix: briefingSuffix || null,
        },
      });
      onOpenChange(false);
      toast.success("Podcast generation started", {
        description: "Your podcast is being generated. It will appear in the results when ready.",
        action: {
          label: "Go to Podcasts",
          onClick: () => router.push("/podcasts"),
        },
      });
    } catch {
      toast.error("Failed to start podcast generation");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Podcast</DialogTitle>
          <DialogDescription>
            Create an audio discussion based on this module&apos;s content.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasProfiles ? (
          <div className="py-4 text-sm text-muted-foreground text-center space-y-1">
            <p className="font-medium text-foreground">Setup required</p>
            <p>
              You need at least one episode profile and one speaker profile to
              generate podcasts.
            </p>
            <Button
              variant="link"
              className="mt-2"
              onClick={() => {
                onOpenChange(false);
                router.push("/podcasts");
              }}
            >
              Set up profiles →
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="episode-name">Episode name</Label>
              <Input
                id="episode-name"
                value={episodeName}
                onChange={(e) => setEpisodeName(e.target.value)}
                placeholder="Episode name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="episode-profile">Episode profile</Label>
              <Select
                value={episodeProfileName}
                onValueChange={setEpisodeProfileName}
              >
                <SelectTrigger id="episode-profile">
                  <SelectValue placeholder="Select a profile…" />
                </SelectTrigger>
                <SelectContent>
                  {episodeProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="speaker-profile">Speaker profile</Label>
              <Select
                value={speakerProfileName}
                onValueChange={setSpeakerProfileName}
              >
                <SelectTrigger id="speaker-profile">
                  <SelectValue placeholder="Select speakers…" />
                </SelectTrigger>
                <SelectContent>
                  {speakerProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="briefing">
                Additional briefing{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="briefing"
                value={briefingSuffix}
                onChange={(e) => setBriefingSuffix(e.target.value)}
                placeholder="Any specific focus or instructions for the podcast…"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={podcastMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  podcastMutation.isPending ||
                  !episodeProfileName ||
                  !speakerProfileName ||
                  !episodeName
                }
              >
                {podcastMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Generate
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
