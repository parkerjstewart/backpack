'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isAxiosError } from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { normalizeLatexDelimiters } from '@/lib/utils'
import { sourcesApi } from '@/lib/api/sources'
import { insightsApi, SourceInsightResponse } from '@/lib/api/insights'
import { SourceDetailResponse } from '@/lib/types/api'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Link as LinkIcon,
  ExternalLink,
  Download,
  Copy,
  CheckCircle,
  X,
  Sparkles,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/utils/date-locale'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'

interface SourceDetailContentProps {
  sourceId: string
  onClose?: () => void
  onRemove?: (sourceId: string) => void
}

export function SourceDetailContent({
  sourceId,
  onClose,
  onRemove,
}: SourceDetailContentProps) {
  const { t, language } = useTranslation()
  const [source, setSource] = useState<SourceDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isDownloadingFile, setIsDownloadingFile] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [fileAvailable, setFileAvailable] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<string>('guide')

  // Insights for Source Guide
  const [insights, setInsights] = useState<SourceInsightResponse[]>([])
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const summaryGenerationAttempted = useRef(false)

  // PDF viewer blob URL (only for file sources)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  const fetchSource = useCallback(async () => {
    try {
      setLoading(true)
      const data = await sourcesApi.get(sourceId)
      setSource(data)
      if (typeof data.file_available === 'boolean') {
        setFileAvailable(data.file_available)
      } else {
        setFileAvailable(null)
      }
      return data
    } catch (err) {
      console.error('Failed to fetch source:', err)
      setError(t.sources.loadFailed)
      return null
    } finally {
      setLoading(false)
    }
  }, [sourceId, t])

  const fetchInsights = useCallback(async () => {
    try {
      const data = await insightsApi.listForSource(sourceId)
      setInsights(data)
      return data
    } catch {
      // Non-critical — insights may not exist yet
      return []
    }
  }, [sourceId])

  const generateDenseSummary = useCallback(async (currentSource: typeof source) => {
    if (summaryGenerationAttempted.current) return
    if (!currentSource?.full_text) return
    summaryGenerationAttempted.current = true
    try {
      setGeneratingSummary(true)
      await insightsApi.create(sourceId, { transformation_id: 'transformation:dense_summary' })
      const updated = await insightsApi.listForSource(sourceId)
      setInsights(updated)
    } catch {
      // Non-critical — generation may fail silently
    } finally {
      setGeneratingSummary(false)
    }
  }, [sourceId])

  useEffect(() => {
    if (sourceId) {
      summaryGenerationAttempted.current = false
      const init = async () => {
        const [sourceData, insightData] = await Promise.all([fetchSource(), fetchInsights()])
        const hasDenseSummary = (insightData ?? []).some(
          (i) => i.insight_type.toLowerCase() === 'dense summary'
        )
        if (!hasDenseSummary) {
          void generateDenseSummary(sourceData ?? null)
        }
      }
      void init()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  // Load PDF blob when Document tab is activated for file sources
  useEffect(() => {
    if (activeTab === 'document' && source?.asset?.file_path && !pdfBlobUrl && !pdfLoading) {
      setPdfLoading(true)
      sourcesApi.downloadFile(source.id)
        .then((response) => {
          const blob = new Blob([response.data], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          setPdfBlobUrl(url)
        })
        .catch(() => {
          setFileAvailable(false)
        })
        .finally(() => {
          setPdfLoading(false)
        })
    }
  }, [activeTab, source, pdfBlobUrl, pdfLoading])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    }
  }, [pdfBlobUrl])

  const denseSummary = useMemo(
    () => insights.find((i) => i.insight_type.toLowerCase() === 'dense summary'),
    [insights]
  )

  const handleUpdateTitle = async (title: string) => {
    if (!source || title === source.title) return
    try {
      await sourcesApi.update(sourceId, { title })
      toast.success(t.common.success)
      setSource({ ...source, title })
    } catch (err) {
      console.error('Failed to update source title:', err)
      toast.error(t.common.error)
      await fetchSource()
    }
  }

  const extractFilename = (pathOrUrl: string | undefined, fallback: string) => {
    if (!pathOrUrl) return fallback
    const segments = pathOrUrl.split(/[/\\]/)
    return segments.pop() || fallback
  }

  const parseContentDisposition = (header?: string | null) => {
    if (!header) return null
    const match = header.match(/filename\*?=([^;]+)/i)
    if (!match) return null
    const value = match[1].trim()
    if (value.toLowerCase().startsWith("utf-8''")) {
      return decodeURIComponent(value.slice(7))
    }
    return value.replace(/^["']|["']$/g, '')
  }

  const handleDownloadFile = async () => {
    if (!source?.asset?.file_path || isDownloadingFile || fileAvailable === false) return
    try {
      setIsDownloadingFile(true)
      const response = await sourcesApi.downloadFile(source.id)
      const filenameFromHeader = parseContentDisposition(
        response.headers?.['content-disposition'] as string | undefined
      )
      const fallbackName = extractFilename(source.asset.file_path, `source-${source.id}`)
      const filename = filenameFromHeader || fallbackName
      const blobUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
      setFileAvailable(true)
      toast.success(t.common.success)
    } catch (err) {
      console.error('Failed to download file:', err)
      if (isAxiosError(err) && err.response?.status === 404) {
        setFileAvailable(false)
        toast.error(t.sources.fileUnavailable)
      } else {
        toast.error(t.common.error)
      }
    } finally {
      setIsDownloadingFile(false)
    }
  }

  const handleRemoveFile = async () => {
    if (!onRemove || isRemoving) return
    try {
      setIsRemoving(true)
      onRemove(sourceId)
    } finally {
      setIsRemoving(false)
    }
  }

  const getSourceType = () => {
    if (!source) return 'unknown'
    if (source.asset?.url) return 'link'
    if (source.asset?.file_path) return 'file'
    return 'text'
  }

  const handleCopyUrl = useCallback(() => {
    if (source?.asset?.url) {
      navigator.clipboard.writeText(source.asset.url)
      setCopied(true)
      toast.success(t.sources.urlCopied)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [source, t])

  const handleOpenExternal = useCallback(() => {
    if (source?.asset?.url) {
      window.open(source.asset.url, '_blank')
    }
  }, [source])

  const getYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const isYouTubeUrl = useMemo(() => {
    if (!source?.asset?.url) return false
    return !!(getYouTubeVideoId(source.asset.url))
  }, [source?.asset?.url])

  const youTubeVideoId = useMemo(() => {
    if (!source?.asset?.url) return null
    return getYouTubeVideoId(source.asset.url)
  }, [source?.asset?.url])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !source) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive">{error || t.sources.notFound}</p>
      </div>
    )
  }

  const hasFile = !!source.asset?.file_path
  const contentText = source.full_text || ''

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="pb-3 pr-8">
        <div className="flex items-center gap-3">
          <h1 className="text-card-title text-primary flex-1 min-w-0 truncate">
            {source.title || <span className="text-muted-foreground">{t.sources.untitledSource}</span>}
          </h1>
          <Badge variant="secondary" className="text-base px-3 py-1 flex-shrink-0">
            {getSourceType()}
          </Badge>
        </div>
      </div>

      {/* Topic badges */}
      {source.topics && source.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          {source.topics.map((topic, idx) => (
            <Badge key={idx} variant="outline" className="text-xs truncate max-w-[160px]">
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {/* Tabs: Guide | Document | Details */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0 bg-transparent border border-border/50 p-0.5">
            <TabsTrigger value="guide">
              <Sparkles className="h-3.5 w-3.5" />
              Guide
            </TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="details">{t.sources.details}</TabsTrigger>
          </TabsList>

          {/* Guide Tab — Dense Summary */}
          <TabsContent value="guide" className="flex-1 min-h-0 flex flex-col">
            {denseSummary ? (
              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="prose max-w-none text-primary [&_h1]:font-sans [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-5 [&_h1]:mb-2 [&_h2]:font-sans [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:font-sans [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2 [&_blockquote]:not-italic [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {normalizeLatexDelimiters(denseSummary.content)}
                  </ReactMarkdown>
                </div>
              </div>
            ) : generatingSummary ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <LoadingSpinner size="sm" />
                <p className="text-sm font-medium text-muted-foreground">Generating guide...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No source guide yet</p>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Run the &ldquo;Dense Summary&rdquo; transformation on this source to generate a guide.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Document Tab — PDF for files, raw text for links/text */}
          <TabsContent value="document" className="mt-3 flex-1 min-h-0 flex flex-col">
            {hasFile ? (
              /* File source: PDF iframe */
              pdfLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              ) : fileAvailable === false ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <p className="text-sm">{t.sources.fileUnavailable}</p>
                  <Button variant="secondary" size="sm" onClick={handleDownloadFile}>
                    <Download className="h-4 w-4" />
                    {t.sources.downloadFile}
                  </Button>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={`${pdfBlobUrl}#toolbar=0&navpanes=0&zoom=130`}
                  className="w-full flex-1 rounded-md border border-border"
                  title={source.title || 'Document'}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              )
            ) : (
              /* Link / text source: raw extracted content */
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* URL bar for link sources */}
                {source.asset?.url && !isYouTubeUrl && (
                  <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <LinkIcon className="h-4 w-4 flex-shrink-0" />
                    <a
                      href={source.asset.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-info truncate"
                    >
                      {source.asset.url}
                    </a>
                  </div>
                )}

                {/* YouTube embed */}
                {isYouTubeUrl && youTubeVideoId && (
                  <div className="mb-4">
                    <div className="aspect-video rounded-lg overflow-hidden bg-black">
                      <iframe
                        src={`https://www.youtube.com/embed/${youTubeVideoId}`}
                        title={t.common.accessibility.ytVideo}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                    {source.asset?.url && (
                      <div className="mt-2">
                        <a
                          href={source.asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t.sources.openOnYoutube}
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Raw extracted text */}
                <div className="prose prose-sm max-w-none text-primary [&_p]:mb-3 [&_p:last-child]:mb-0 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_a]:text-info [&_a]:underline [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {contentText || t.sources.noContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-3 flex-1 min-h-0 overflow-y-auto space-y-4">
            {(hasFile || onRemove) && (
              <div className="flex items-center gap-2">
                {hasFile && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownloadFile}
                    disabled={isDownloadingFile || fileAvailable === false}
                  >
                    <Download className="h-4 w-4" />
                    {fileAvailable === false
                      ? t.sources.fileUnavailable
                      : isDownloadingFile
                        ? t.sources.preparing
                        : t.sources.downloadFile}
                  </Button>
                )}
                {onRemove && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveFile}
                    disabled={isRemoving}
                  >
                    <X className="h-4 w-4" />
                    {isRemoving ? 'Removing...' : 'Remove File'}
                  </Button>
                )}
              </div>
            )}

            {source.asset?.url && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t.common.url}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-1.5 text-sm truncate">
                    {source.asset.url}
                  </code>
                  <Button size="sm" variant="ghost" onClick={handleCopyUrl}>
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleOpenExternal}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {source.topics && source.topics.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t.sources.topics}</p>
                <div className="flex flex-wrap gap-2">
                  {source.topics.map((topic, idx) => (
                    <Badge key={idx} variant="outline">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t.sources.metadata}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t.common.created_label}</p>
                  <p className="text-sm font-medium">
                    {formatDistanceToNow(new Date(source.created), {
                      addSuffix: true,
                      locale: getDateLocale(language)
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(source.created).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.common.updated_label}</p>
                  <p className="text-sm font-medium">
                    {formatDistanceToNow(new Date(source.updated), {
                      addSuffix: true,
                      locale: getDateLocale(language)
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(source.updated).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
