"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@/lib/hooks/use-translation";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Search, ChevronDown, Save, MessageCircleQuestion } from "lucide-react";
import { useSearch } from "@/lib/hooks/use-search";
import { useAsk } from "@/lib/hooks/use-ask";
import { useModalManager } from "@/lib/hooks/use-modal-manager";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { StreamingResponse } from "@/components/search/StreamingResponse";
import { SaveToModulesDialog } from "@/components/search/SaveToModulesDialog";

export default function SearchPage() {
  const { t } = useTranslation();
  // URL params
  const searchParams = useSearchParams();
  const urlQuery = searchParams?.get("q") || "";
  const rawMode = searchParams?.get("mode");
  const urlMode = rawMode === "search" ? "search" : "ask";

  // Tab state (controlled)
  const [activeTab, setActiveTab] = useState<"ask" | "search">(
    urlMode === "search" ? "search" : "ask"
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState(
    urlMode === "search" ? urlQuery : ""
  );
  const [searchType, setSearchType] = useState<"text" | "vector">("text");
  const [searchSources, setSearchSources] = useState(true);
  const [searchNotes, setSearchNotes] = useState(true);

  // Ask state
  const [askQuestion, setAskQuestion] = useState(
    urlMode === "ask" ? urlQuery : ""
  );

  // Save to modules dialog
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Hooks
  const searchMutation = useSearch();
  const ask = useAsk();
  const { openModal } = useModalManager();

  // Track if we've already auto-triggered from URL params
  const hasAutoTriggeredRef = useRef(false);
  const lastUrlParamsRef = useRef({ q: "", mode: "" });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;

    searchMutation.mutate({
      query: searchQuery,
      type: searchType,
      limit: 100,
      search_sources: searchSources,
      search_notes: searchNotes,
      minimum_score: 0.2,
    });
  }, [searchQuery, searchType, searchSources, searchNotes, searchMutation]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handleAsk = useCallback(() => {
    if (!askQuestion.trim()) return;

    // Use default models (configured via environment variables on the backend)
    // Pass empty strings to indicate "use defaults"
    ask.sendAsk(askQuestion, {
      strategy: "",
      answer: "",
      finalAnswer: "",
    });
  }, [askQuestion, ask]);

  // Auto-trigger search/ask when arriving with URL params
  useEffect(() => {
    // Skip if already triggered or no query
    if (hasAutoTriggeredRef.current || !urlQuery) return;

    if (urlMode === "search") {
      handleSearch();
      hasAutoTriggeredRef.current = true;
    } else if (urlMode === "ask") {
      handleAsk();
      hasAutoTriggeredRef.current = true;
    }
  }, [urlQuery, urlMode, handleSearch, handleAsk]);

  // Handle URL param changes while on page (e.g., from command palette again)
  useEffect(() => {
    const currentQ = searchParams?.get("q") || "";
    const rawCurrentMode = searchParams?.get("mode");
    const currentMode = rawCurrentMode === "search" ? "search" : "ask";

    // Check if URL params have changed
    if (
      currentQ !== lastUrlParamsRef.current.q ||
      currentMode !== lastUrlParamsRef.current.mode
    ) {
      lastUrlParamsRef.current = { q: currentQ, mode: currentMode };

      if (currentQ) {
        // Update state based on mode
        if (currentMode === "search") {
          setSearchQuery(currentQ);
          setActiveTab("search");
          // Reset trigger flag so we auto-trigger with new params
          hasAutoTriggeredRef.current = false;
        } else {
          setAskQuestion(currentQ);
          setActiveTab("ask");
          hasAutoTriggeredRef.current = false;
        }
      }
    }
  }, [searchParams]);

  return (
    <AppShell>
      <div className="p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">
          {t.searchPage.askAndSearch}
        </h1>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "ask" | "search")}
          className="w-full space-y-6"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.searchPage.chooseAMode}
            </p>
            <TabsList
              aria-label={t.common.accessibility.searchKB}
              className="w-full max-w-xl"
            >
              <TabsTrigger value="ask">
                <MessageCircleQuestion className="h-4 w-4" />
                {t.searchPage.askBeta}
              </TabsTrigger>
              <TabsTrigger value="search">
                <Search className="h-4 w-4" />
                {t.searchPage.search}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ask" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {t.searchPage.askYourKb}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t.searchPage.askYourKbDesc}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Question Input */}
                <div className="space-y-2">
                  <Label htmlFor="ask-question">{t.searchPage.question}</Label>
                  <Textarea
                    id="ask-question"
                    name="ask-question"
                    placeholder={t.searchPage.enterQuestionPlaceholder}
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      // Submit on Cmd/Ctrl+Enter
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === "Enter" &&
                        !ask.isStreaming &&
                        askQuestion.trim()
                      ) {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    disabled={ask.isStreaming}
                    rows={3}
                    aria-label={t.common.accessibility.enterQuestion}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.searchPage.pressToSubmit}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleAsk}
                    disabled={ask.isStreaming || !askQuestion.trim()}
                    className="w-full"
                  >
                    {ask.isStreaming ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        {t.searchPage.processing}
                      </>
                    ) : (
                      t.searchPage.ask
                    )}
                  </Button>

                  {ask.finalAnswer && (
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveDialog(true)}
                      className="w-full"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {t.searchPage.saveToModules}
                    </Button>
                  )}
                </div>

                {/* Streaming Response */}
                <StreamingResponse
                  isStreaming={ask.isStreaming}
                  strategy={ask.strategy}
                  answers={ask.answers}
                  finalAnswer={ask.finalAnswer}
                />

                {/* Save to Modules Dialog */}
                {ask.finalAnswer && (
                  <SaveToModulesDialog
                    open={showSaveDialog}
                    onOpenChange={setShowSaveDialog}
                    question={askQuestion}
                    answer={ask.finalAnswer}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t.searchPage.search}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t.searchPage.searchDesc}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search Input */}
                <div className="space-y-2">
                  <Label htmlFor="search-query" className="sr-only">
                    {t.searchPage.search}
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="search-query"
                      name="search-query"
                      placeholder={t.searchPage.enterSearchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={searchMutation.isPending}
                      className="flex-1"
                      aria-label={t.common.accessibility.enterSearch}
                      autoComplete="off"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searchMutation.isPending || !searchQuery.trim()}
                      aria-label={t.common.accessibility.searchKBBtn}
                      className="w-full sm:w-auto"
                    >
                      {searchMutation.isPending ? (
                        <LoadingSpinner size="sm" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      {t.searchPage.search}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.searchPage.pressToSearch}
                  </p>
                </div>

                {/* Search Options */}
                <div className="space-y-4">
                  {/* Search Type */}
                  <div
                    className="space-y-2"
                    role="group"
                    aria-labelledby="search-type-label"
                  >
                    <span
                      id="search-type-label"
                      className="text-sm font-medium leading-none"
                    >
                      {t.searchPage.searchType}
                    </span>
                    <RadioGroup
                      name="search-type"
                      value={searchType}
                      onValueChange={(value: "text" | "vector") =>
                        setSearchType(value)
                      }
                      disabled={searchMutation.isPending}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="text" id="text" />
                        <Label
                          htmlFor="text"
                          className="font-normal cursor-pointer"
                        >
                          {t.searchPage.textSearch}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="vector"
                          id="vector"
                          disabled={searchMutation.isPending}
                        />
                        <Label
                          htmlFor="vector"
                          className="font-normal cursor-pointer"
                        >
                          {t.searchPage.vectorSearch}
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Search Locations */}
                  <div
                    className="space-y-2"
                    role="group"
                    aria-labelledby="search-in-label"
                  >
                    <span
                      id="search-in-label"
                      className="text-sm font-medium leading-none"
                    >
                      {t.searchPage.searchIn}
                    </span>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sources"
                          name="sources"
                          checked={searchSources}
                          onCheckedChange={(checked) =>
                            setSearchSources(checked as boolean)
                          }
                          disabled={searchMutation.isPending}
                        />
                        <Label
                          htmlFor="sources"
                          className="font-normal cursor-pointer"
                        >
                          {t.searchPage.searchSources}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="notes"
                          name="notes"
                          checked={searchNotes}
                          onCheckedChange={(checked) =>
                            setSearchNotes(checked as boolean)
                          }
                          disabled={searchMutation.isPending}
                        />
                        <Label
                          htmlFor="notes"
                          className="font-normal cursor-pointer"
                        >
                          {t.searchPage.searchNotes}
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {searchMutation.data && (
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">
                        {t.searchPage.resultsFound.replace(
                          "{count}",
                          searchMutation.data.total_count.toString()
                        )}
                      </h3>
                      <Badge variant="outline">
                        {searchMutation.data.search_type === "text"
                          ? t.searchPage.textSearch
                          : t.searchPage.vectorSearch}
                      </Badge>
                    </div>

                    {searchMutation.data.results.length === 0 ? (
                      <Card>
                        <CardContent className="pt-6 text-center text-muted-foreground">
                          {t.searchPage.noResultsFor.replace(
                            "{query}",
                            searchQuery
                          )}
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                        {searchMutation.data.results.map((result, index) => {
                          // Parse type from parent_id (format: "source:id" or "note:id" or "source_insight:id")
                          // Handle null parent_id gracefully (orphaned records)
                          if (!result.parent_id) {
                            console.warn(
                              "Search result with null parent_id:",
                              result
                            );
                            return null;
                          }
                          const [type, id] = result.parent_id.split(":");
                          const modalType =
                            type === "source_insight"
                              ? "insight"
                              : (type as "source" | "note" | "insight");

                          return (
                            <Card key={index}>
                              <CardContent className="pt-4">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1">
                                    <button
                                      onClick={() => openModal(modalType, id)}
                                      className="text-primary hover:underline font-medium"
                                    >
                                      {result.title}
                                    </button>
                                    <Badge variant="secondary" className="ml-2">
                                      {result.final_score.toFixed(2)}
                                    </Badge>
                                  </div>
                                </div>

                                {result.matches &&
                                  result.matches.length > 0 && (
                                    <Collapsible className="mt-3">
                                      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                                        <ChevronDown className="h-4 w-4" />
                                        {t.searchPage.matches.replace(
                                          "{count}",
                                          result.matches.length.toString()
                                        )}
                                      </CollapsibleTrigger>
                                      <CollapsibleContent className="mt-2 space-y-1">
                                        {result.matches.map((match, i) => (
                                          <div
                                            key={i}
                                            className="text-sm pl-6 py-1 border-l-2 border-muted"
                                          >
                                            {match}
                                          </div>
                                        ))}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
