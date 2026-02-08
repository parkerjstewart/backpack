"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormLabel } from "@/components/ui/form-label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function LoginForm() {
  // Sign In state
  const [signInEmail, setSignInEmail] = useState("");
  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpName, setSignUpName] = useState("");

  const {
    isLoading,
    error,
    loginWithEmail,
    registerWithEmail,
    hasHydrated,
    isAuthenticated,
  } = useAuthStore();

  const [configInfo, setConfigInfo] = useState<{
    apiUrl: string;
    version: string;
    buildTime: string;
  } | null>(null);
  const router = useRouter();

  // Load config info for debugging
  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfigInfo({
          apiUrl: cfg.apiUrl,
          version: cfg.version,
          buildTime: cfg.buildTime,
        });
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
      });
  }, []);

  // If already authenticated (cached session), redirect to dashboard
  useEffect(() => {
    if (hasHydrated && isAuthenticated) {
      const redirectPath = sessionStorage.getItem("redirectAfterLogin");
      if (redirectPath) {
        sessionStorage.removeItem("redirectAfterLogin");
        router.push(redirectPath);
      } else {
        router.push("/courses");
      }
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Show loading while hydrating from localStorage
  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  // If authenticated, show loading while redirecting
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner />
      </div>
    );
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim()) return;

    const user = await loginWithEmail(signInEmail.trim());
    if (user) {
      const redirectPath = sessionStorage.getItem("redirectAfterLogin");
      if (redirectPath) {
        sessionStorage.removeItem("redirectAfterLogin");
        router.push(redirectPath);
      } else {
        router.push("/courses");
      }
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpEmail.trim() || !signUpName.trim()) return;

    const user = await registerWithEmail(
      signUpEmail.trim(),
      signUpName.trim()
    );
    if (user) {
      router.push("/courses");
    }
  };

  const signInValid = signInEmail.trim().length > 0;
  const signUpValid = signUpEmail.trim().length > 0 && signUpName.trim().length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-hero">Backpack</CardTitle>
          <CardDescription>Sign in to your account or create a new one</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="sign-in" onValueChange={() => useAuthStore.setState({ error: null })}>
            <TabsList className="w-full">
              <TabsTrigger value="sign-in" className="flex-1">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="sign-up" className="flex-1">
                Sign Up
              </TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="sign-in">
              <form onSubmit={handleSignIn} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <FormLabel htmlFor="sign-in-email">Email</FormLabel>
                  <Input
                    id="sign-in-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  variant={signInValid ? "accent" : "light"}
                  disabled={isLoading || !signInValid}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="sign-up">
              <form onSubmit={handleSignUp} className="space-y-4 pt-2">
                <div className="space-y-2">
                  <FormLabel htmlFor="sign-up-name">Name</FormLabel>
                  <Input
                    id="sign-up-name"
                    type="text"
                    placeholder="Your name"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-2">
                  <FormLabel htmlFor="sign-up-email">Email</FormLabel>
                  <Input
                    id="sign-up-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  variant={signUpValid ? "accent" : "light"}
                  disabled={isLoading || !signUpValid}
                >
                  {isLoading ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {configInfo && (
            <div className="text-xs text-center text-muted-foreground pt-4 mt-4 border-t">
              <div>Version {configInfo.version}</div>
              <div className="font-mono text-[10px]">{configInfo.apiUrl}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
