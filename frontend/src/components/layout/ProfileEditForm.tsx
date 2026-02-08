"use client";

import { useState, useRef, useEffect } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUpdateProfile } from "@/lib/hooks/use-user-profile";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * ProfileEditForm - Editable profile form with avatar upload and name editing.
 * Designed to be embedded in the settings page.
 */
export function ProfileEditForm() {
  const { currentUser } = useAuthStore();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(currentUser?.name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync form when currentUser changes (e.g. after a save)
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name ?? "");
    }
  }, [currentUser]);

  const displayName = currentUser?.name || currentUser?.email?.split("@")[0] || "User";
  const displayEmail = currentUser?.email || "";
  const currentAvatarUrl = currentUser?.avatar_url || null;

  const isDirty =
    name !== (currentUser?.name ?? "") || avatarFile !== null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Please upload a JPEG, PNG, GIF, or WebP image.");
      return;
    }

    if (file.size > MAX_SIZE) {
      setFileError("Image must be smaller than 5MB.");
      return;
    }

    setAvatarFile(file);
    // Create preview URL
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!isDirty) return;

    const data: { name?: string; avatar?: File } = {};
    if (name !== (currentUser?.name ?? "")) {
      data.name = name.trim();
    }
    if (avatarFile) {
      data.avatar = avatarFile;
    }

    updateProfile.mutate(data, {
      onSuccess: () => {
        setAvatarFile(null);
        setAvatarPreview(null);
      },
    });
  };

  const previewSrc = avatarPreview || currentAvatarUrl;

  return (
    <div className="flex flex-col gap-6">
      {/* Avatar section */}
      <div className="flex items-center gap-6">
        <div className="relative group">
          <Avatar className="h-20 w-20">
            {previewSrc ? (
              <AvatarImage
                src={previewSrc}
                alt={displayName}
                className="object-cover"
              />
            ) : (
              <AvatarFallback className="bg-muted text-2xl font-medium text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            )}
          </Avatar>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-full",
              "bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity",
              "cursor-pointer"
            )}
            aria-label="Upload profile picture"
          >
            <Camera className="h-6 w-6 text-white" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-xl font-medium text-foreground">
            {displayName}
          </p>
          <p className="text-sm text-muted-foreground">{displayEmail}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-primary/60 hover:text-primary transition-colors text-left cursor-pointer"
          >
            Change photo
          </button>
        </div>
      </div>
      {fileError && (
        <p className="text-sm text-destructive">{fileError}</p>
      )}

      {/* Name field */}
      <div className="flex flex-col gap-3">
        <FormLabel htmlFor="profile-name">Name</FormLabel>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      {/* Email field (read-only) */}
      <div className="flex flex-col gap-3">
        <FormLabel htmlFor="profile-email">Email</FormLabel>
        <Input
          id="profile-email"
          value={displayEmail}
          disabled
          className="opacity-60"
        />
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          variant={isDirty ? "accent" : "light"}
          onClick={handleSave}
          disabled={!isDirty || updateProfile.isPending || !name.trim()}
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
