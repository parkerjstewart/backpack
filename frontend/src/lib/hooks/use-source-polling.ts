import { useQueries } from '@tanstack/react-query'
import { useMemo, useEffect, useRef } from 'react'
import { sourcesApi } from '@/lib/api/sources'
import { SourceStatus, useModuleDraftStore } from '@/lib/stores/module-draft-store'

interface SourcePollingResult {
  /** All sources have completed or failed */
  allComplete: boolean
  /** Number of sources that completed successfully */
  completedCount: number
  /** Number of sources that failed */
  failedCount: number
  /** Number of sources still processing */
  processingCount: number
  /** Total number of sources being tracked */
  totalCount: number
  /** Progress percentage (0-100) */
  progressPercentage: number
  /** Individual status for each source */
  statuses: Record<string, SourceStatus>
  /** Whether any query is currently loading */
  isLoading: boolean
}

/**
 * Hook to poll status for multiple sources and aggregate the results.
 * Automatically updates the draft store with status changes.
 * Stops polling when all sources are complete or failed.
 */
export function useSourcePolling(sourceIds: string[]): SourcePollingResult {
  const updateSourceStatus = useModuleDraftStore((state) => state.updateSourceStatus)

  // Use useQueries to poll multiple sources in parallel
  const queries = useQueries({
    queries: sourceIds.map((sourceId) => ({
      queryKey: ['sources', sourceId, 'status'],
      queryFn: () => sourcesApi.status(sourceId),
      enabled: sourceIds.length > 0,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        // Auto-refresh every 2 seconds if still processing
        const data = query.state.data
        if (data?.status === 'running' || data?.status === 'queued' || data?.status === 'new') {
          return 2000
        }
        // Stop polling when completed or failed
        return false
      },
      staleTime: 0,
      retry: (failureCount: number, error: unknown) => {
        // Don't retry on 404
        const axiosError = error as { response?: { status?: number } }
        if (axiosError?.response?.status === 404) {
          return false
        }
        return failureCount < 3
      },
    })),
  })

  // Extract only the status strings from queries to create a stable dependency
  const queryStatuses = queries.map((q) => q.data?.status)
  
  // Compute aggregated statuses - only recalculate when actual status values change
  const statuses = useMemo(() => {
    const result: Record<string, SourceStatus> = {}
    
    sourceIds.forEach((sourceId, index) => {
      const apiStatus = queryStatuses[index]
      
      // Map API status to our simplified status
      if (apiStatus === 'completed') {
        result[sourceId] = 'completed'
      } else if (apiStatus === 'failed') {
        result[sourceId] = 'failed'
      } else {
        // 'running', 'queued', 'new', 'unknown', or undefined
        result[sourceId] = 'processing'
      }
    })
    
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds.join(','), queryStatuses.join(',')])

  // Track previous statuses to avoid unnecessary updates
  const prevStatusesRef = useRef<Record<string, SourceStatus>>({})

  // Update draft store only when statuses actually change
  useEffect(() => {
    const prevStatuses = prevStatusesRef.current
    let hasChanges = false

    Object.entries(statuses).forEach(([sourceId, status]) => {
      if (prevStatuses[sourceId] !== status) {
        hasChanges = true
        updateSourceStatus(sourceId, status)
      }
    })

    if (hasChanges) {
      prevStatusesRef.current = { ...statuses }
    }
  }, [statuses, updateSourceStatus])

  // Compute aggregated metrics
  const metrics = useMemo(() => {
    const totalCount = sourceIds.length
    const completedCount = Object.values(statuses).filter((s) => s === 'completed').length
    const failedCount = Object.values(statuses).filter((s) => s === 'failed').length
    const processingCount = Object.values(statuses).filter((s) => s === 'processing').length
    const allComplete = totalCount > 0 && processingCount === 0
    const progressPercentage = totalCount > 0 
      ? Math.round(((completedCount + failedCount) / totalCount) * 100)
      : 0

    return {
      allComplete,
      completedCount,
      failedCount,
      processingCount,
      totalCount,
      progressPercentage,
    }
  }, [statuses, sourceIds.length])

  const isLoading = queries.some((q) => q.isLoading)

  return {
    ...metrics,
    statuses,
    isLoading,
  }
}
