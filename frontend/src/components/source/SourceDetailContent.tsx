'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { isAxiosError } from 'axios'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sourcesApi } from '@/lib/api/sources'
import { SourceDetailResponse } from '@/lib/types/api'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { InlineEdit } from '@/components/common/InlineEdit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Link as LinkIcon,
  ExternalLink,
  Download,
  Copy,
  CheckCircle,
  Youtube,
  ChevronDown,
  ChevronUp,
  X,
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
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('content')

  const fetchSource = useCallback(async () => {
    try {
      setLoading(true)
      const data = await sourcesApi.get(sourceId)
      setSource(data)
      if (typeof data.file_available === 'boolean') {
        setFileAvailable(data.file_available)
      } else if (!data.asset?.file_path) {
        setFileAvailable(null)
      } else {
        setFileAvailable(null)
      }
    } catch (err) {
      console.error('Failed to fetch source:', err)
      setError(t.sources.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [sourceId, t])

  useEffect(() => {
    if (sourceId) {
      void fetchSource()
    }
  }, [fetchSource, sourceId])

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
    if (!pathOrUrl) {
      return fallback
    }
    const segments = pathOrUrl.split(/[/\\]/)
    return segments.pop() || fallback
  }

  const parseContentDisposition = (header?: string | null) => {
    if (!header) {
      return null
    }
    const match = header.match(/filename\*?=([^;]+)/i)
    if (!match) {
      return null
    }
    const value = match[1].trim()
    if (value.toLowerCase().startsWith("utf-8''")) {
      return decodeURIComponent(value.slice(7))
    }
    return value.replace(/^["']|["']$/g, '')
  }

  const handleDownloadFile = async () => {
    if (!source?.asset?.file_path || isDownloadingFile || fileAvailable === false) {
      return
    }

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
  const isLongContent = contentText.length > 800

  return (
    <div className="flex flex-col h-full">
      {/* Header — pr-8 leaves room for the dialog's built-in X close button */}
      <div className="pb-4 pr-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <InlineEdit
              value={source.title || ''}
              onSave={handleUpdateTitle}
              className="text-2xl font-bold"
              inputClassName="text-2xl font-bold"
              placeholder={t.sources.titlePlaceholder}
              emptyText={t.sources.untitledSource}
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant="secondary" className="text-base px-3 py-1">
              {getSourceType()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0 bg-transparent border border-border/50 p-0.5">
            <TabsTrigger value="content">{t.sources.content}</TabsTrigger>
            <TabsTrigger value="details">{t.sources.details}</TabsTrigger>
          </TabsList>

          {/* Content Tab */}
          <TabsContent value="content" className="mt-4 overflow-y-auto">
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

            <div className="relative">
              <div
                className={
                  isLongContent && !isContentExpanded
                    ? 'max-h-[260px] overflow-hidden'
                    : undefined
                }
              >
                <div className="prose prose-sm prose-neutral max-w-none prose-headings:font-semibold prose-a:text-info prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-p:mb-4 prose-p:leading-7 prose-li:mb-2">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-4">{children}</p>,
                      h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>,
                      ul: ({ children }) => <ul className="mb-4 list-disc pl-6">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-4 list-decimal pl-6">{children}</ol>,
                      li: ({ children }) => <li className="mb-1">{children}</li>,
                      table: ({ children }) => (
                        <div className="my-4 overflow-x-auto">
                          <table className="min-w-full border-collapse border border-border">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
                      tbody: ({ children }) => <tbody>{children}</tbody>,
                      tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                      th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>,
                      td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
                    }}
                  >
                    {contentText || t.sources.noContent}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Gradient fade + expand button */}
              {isLongContent && !isContentExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              )}
            </div>

            {isLongContent && (
              <button
                type="button"
                onClick={() => setIsContentExpanded((v) => !v)}
                className="mt-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {isContentExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Show more
                  </>
                )}
              </button>
            )}
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-4 overflow-y-auto space-y-4">
            {/* File actions row */}
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

            {/* URL */}
            {source.asset?.url && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{t.common.url}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-1.5 text-sm truncate">
                    {source.asset.url}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopyUrl}>
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleOpenExternal}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Topics */}
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

            {/* Metadata */}
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
