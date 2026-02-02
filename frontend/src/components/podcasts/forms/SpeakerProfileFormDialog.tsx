"use client";

import { useCallback, useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { FieldErrorsImpl } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";

import { SpeakerProfile } from "@/lib/types/podcasts";
import {
  useCreateSpeakerProfile,
  useUpdateSpeakerProfile,
} from "@/lib/hooks/use-podcasts";
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
import { Separator } from "@/components/ui/separator";

import { TranslationKeys } from "@/lib/locales";
import { useTranslation } from "@/lib/hooks/use-translation";

const speakerConfigSchema = (t: TranslationKeys) =>
  z.object({
    name: z.string().min(1, t.common.nameRequired || "Name is required"),
    voice_id: z
      .string()
      .min(1, t.podcasts.voiceIdRequired || "Voice ID is required"),
    backstory: z
      .string()
      .min(1, t.podcasts.backstoryRequired || "Backstory is required"),
    personality: z
      .string()
      .min(1, t.podcasts.personalityRequired || "Personality is required"),
  });

const speakerProfileSchema = (t: TranslationKeys) =>
  z.object({
    name: z.string().min(1, t.common.nameRequired || "Name is required"),
    description: z.string().optional(),
    tts_provider: z
      .string()
      .min(1, t.models.providerRequired || "Provider is required"),
    tts_model: z.string().min(1, t.models.modelRequired || "Model is required"),
    speakers: z
      .array(speakerConfigSchema(t))
      .min(1, t.podcasts.speakerCountMin || "At least one speaker is required")
      .max(
        4,
        t.podcasts.speakerCountMax || "You can configure up to 4 speakers"
      ),
  });

export type SpeakerProfileFormValues = z.infer<
  ReturnType<typeof speakerProfileSchema>
>;

interface SpeakerProfileFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: SpeakerProfile;
}

const EMPTY_SPEAKER = {
  name: "",
  voice_id: "",
  backstory: "",
  personality: "",
};

export function SpeakerProfileFormDialog({
  mode,
  open,
  onOpenChange,
  initialData,
}: SpeakerProfileFormDialogProps) {
  const { t } = useTranslation();
  const createProfile = useCreateSpeakerProfile();
  const updateProfile = useUpdateSpeakerProfile();

  const getDefaults = useCallback((): SpeakerProfileFormValues => {
    if (initialData) {
      return {
        name: initialData.name,
        description: initialData.description ?? "",
        tts_provider: initialData.tts_provider,
        tts_model: initialData.tts_model,
        speakers: initialData.speakers?.map((speaker) => ({ ...speaker })) ?? [
          { ...EMPTY_SPEAKER },
        ],
      };
    }

    return {
      name: "",
      description: "",
      tts_provider: "openai",
      tts_model: "tts-1",
      speakers: [{ ...EMPTY_SPEAKER }],
    };
  }, [initialData]);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SpeakerProfileFormValues>({
    resolver: zodResolver(speakerProfileSchema(t)),
    defaultValues: getDefaults(),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "speakers",
  });

  const speakersArrayError = (
    errors.speakers as
      | FieldErrorsImpl<{ root?: { message?: string } }>
      | undefined
  )?.root?.message;

  useEffect(() => {
    if (!open) {
      return;
    }
    reset(getDefaults());
  }, [open, reset, getDefaults]);

  const onSubmit = async (values: SpeakerProfileFormValues) => {
    const payload = {
      ...values,
      description: values.description ?? "",
    };

    if (mode === "create") {
      await createProfile.mutateAsync(payload);
    } else if (initialData) {
      await updateProfile.mutateAsync({
        profileId: initialData.id,
        payload,
      });
    }

    onOpenChange(false);
  };

  const isSubmitting = createProfile.isPending || updateProfile.isPending;
  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t.podcasts.editSpeakerProfile
              : t.podcasts.createSpeakerProfile}
          </DialogTitle>
          <DialogDescription>
            {t.podcasts.speakerProfileFormDesc}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t.podcasts.profileName} *</Label>
              <Input
                id="name"
                placeholder={t.podcasts.profileNamePlaceholder}
                {...register("name")}
              />
              {errors.name ? (
                <p className="text-xs text-red-600">{errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts_provider">{t.models.provider} *</Label>
              <Input
                id="tts_provider"
                placeholder="openai, elevenlabs..."
                {...register("tts_provider")}
                autoComplete="off"
              />
              {errors.tts_provider ? (
                <p className="text-xs text-red-600">
                  {errors.tts_provider.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts_model">{t.common.model} *</Label>
              <Input
                id="tts_model"
                placeholder="tts-1, tts-1-hd..."
                {...register("tts_model")}
                autoComplete="off"
              />
              {errors.tts_model ? (
                <p className="text-xs text-red-600">
                  {errors.tts_model.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t.common.description}</Label>
              <Textarea
                id="description"
                rows={3}
                placeholder={t.podcasts.descriptionPlaceholder}
                {...register("description")}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.podcasts.speakers}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t.podcasts.speakersDesc}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...EMPTY_SPEAKER })}
                disabled={fields.length >= 4}
              >
                <Plus className="mr-2 h-4 w-4" /> {t.podcasts.addSpeaker}
              </Button>
            </div>
            <Separator />

            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {t.podcasts.speakerNumber.replace(
                      "{number}",
                      (index + 1).toString()
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> {t.common.remove}
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`speaker-name-${index}`}>
                      {t.common.name} *
                    </Label>
                    <Input
                      id={`speaker-name-${index}`}
                      {...register(`speakers.${index}.name` as const)}
                      placeholder={t.podcasts.hostPlaceholder.replace(
                        "{number}",
                        (index + 1).toString()
                      )}
                      autoComplete="off"
                    />
                    {errors.speakers?.[index]?.name ? (
                      <p className="text-xs text-red-600">
                        {errors.speakers[index]?.name?.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`speaker-voice-${index}`}>
                      {t.podcasts.voiceId} *
                    </Label>
                    <Input
                      id={`speaker-voice-${index}`}
                      {...register(`speakers.${index}.voice_id` as const)}
                      placeholder="voice_123"
                      autoComplete="off"
                    />
                    {errors.speakers?.[index]?.voice_id ? (
                      <p className="text-xs text-red-600">
                        {errors.speakers[index]?.voice_id?.message}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`speaker-backstory-${index}`}>
                    {t.podcasts.backstory} *
                  </Label>
                  <Textarea
                    id={`speaker-backstory-${index}`}
                    rows={3}
                    placeholder={t.podcasts.backstoryPlaceholder}
                    {...register(`speakers.${index}.backstory` as const)}
                    autoComplete="off"
                  />
                  {errors.speakers?.[index]?.backstory ? (
                    <p className="text-xs text-red-600">
                      {errors.speakers[index]?.backstory?.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`speaker-personality-${index}`}>
                    {t.podcasts.personality} *
                  </Label>
                  <Textarea
                    id={`speaker-personality-${index}`}
                    rows={3}
                    placeholder={t.podcasts.personalityPlaceholder}
                    {...register(`speakers.${index}.personality` as const)}
                    autoComplete="off"
                  />
                  {errors.speakers?.[index]?.personality ? (
                    <p className="text-xs text-red-600">
                      {errors.speakers[index]?.personality?.message}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}

            {speakersArrayError ? (
              <p className="text-xs text-red-600">{speakersArrayError}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t.common.saving
                : isEdit
                ? t.common.saveChanges
                : t.podcasts.createProfile}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
