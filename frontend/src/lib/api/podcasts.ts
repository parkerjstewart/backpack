import apiClient from './client'
import { getApiUrl } from '@/lib/config'
import {
  PodcastEpisode,
  EpisodeProfile,
  SpeakerProfile,
  PodcastGenerationRequest,
  PodcastGenerationResponse,
} from '@/lib/types/podcasts'

export type EpisodeProfileInput = Omit<EpisodeProfile, 'id'>
export type SpeakerProfileInput = Omit<SpeakerProfile, 'id'>

export async function resolvePodcastAssetUrl(path?: string | null): Promise<string | undefined> {
  if (!path) {
    return undefined
  }

  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const base = await getApiUrl()

  if (path.startsWith('/')) {
    return `${base}${path}`
  }

  return `${base}/${path}`
}

/**
 * Resolve a podcast audio path to an absolute URL, fetch it with the user's
 * auth token, and return a local blob URL that the browser can play without
 * any further auth headers.  The caller is responsible for calling
 * URL.revokeObjectURL() on the returned string when done.
 *
 * Returns undefined if the path is empty, the fetch fails, or no URL could be
 * resolved.
 */
export async function fetchProtectedAudioBlobUrl(path?: string | null): Promise<string | undefined> {
  if (!path) return undefined

  // For relative /api/... paths, use them directly so the request goes through the
  // Next.js proxy (same-origin). Only resolve external/absolute URLs via getApiUrl().
  let resolvedUrl: string
  if (path.startsWith('/api/') || /^https?:\/\//i.test(path)) {
    resolvedUrl = path
  } else {
    const resolved = await resolvePodcastAssetUrl(path)
    if (!resolved) return undefined
    resolvedUrl = resolved
  }

  try {
    let token: string | undefined
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('auth-storage')
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { state?: { token?: string } }
          token = parsed?.state?.token
        } catch {
          // ignore malformed storage
        }
      }
    }

    const headers: HeadersInit = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(resolvedUrl, { headers })
    if (!response.ok) {
      console.error(
        `Audio fetch failed: status=${response.status}, url=${resolvedUrl}, ` +
        `content-type=${response.headers.get('content-type')}`
      )
      return undefined
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('Unable to load podcast audio', { url: resolvedUrl, error })
    return undefined
  }
}

export const podcastsApi = {
  listEpisodes: async () => {
    const response = await apiClient.get<PodcastEpisode[]>('/podcasts/episodes')
    return response.data
  },

  deleteEpisode: async (episodeId: string) => {
    await apiClient.delete(`/podcasts/episodes/${episodeId}`)
  },

  listEpisodeProfiles: async () => {
    const response = await apiClient.get<EpisodeProfile[]>('/episode-profiles')
    return response.data
  },

  createEpisodeProfile: async (payload: EpisodeProfileInput) => {
    const response = await apiClient.post<EpisodeProfile>(
      '/episode-profiles',
      payload
    )
    return response.data
  },

  updateEpisodeProfile: async (profileId: string, payload: EpisodeProfileInput) => {
    const response = await apiClient.put<EpisodeProfile>(
      `/episode-profiles/${profileId}`,
      payload
    )
    return response.data
  },

  deleteEpisodeProfile: async (profileId: string) => {
    await apiClient.delete(`/episode-profiles/${profileId}`)
  },

  duplicateEpisodeProfile: async (profileId: string) => {
    const response = await apiClient.post<EpisodeProfile>(
      `/episode-profiles/${profileId}/duplicate`
    )
    return response.data
  },

  listSpeakerProfiles: async () => {
    const response = await apiClient.get<SpeakerProfile[]>('/speaker-profiles')
    return response.data
  },

  createSpeakerProfile: async (payload: SpeakerProfileInput) => {
    const response = await apiClient.post<SpeakerProfile>(
      '/speaker-profiles',
      payload
    )
    return response.data
  },

  updateSpeakerProfile: async (profileId: string, payload: SpeakerProfileInput) => {
    const response = await apiClient.put<SpeakerProfile>(
      `/speaker-profiles/${profileId}`,
      payload
    )
    return response.data
  },

  deleteSpeakerProfile: async (profileId: string) => {
    await apiClient.delete(`/speaker-profiles/${profileId}`)
  },

  duplicateSpeakerProfile: async (profileId: string) => {
    const response = await apiClient.post<SpeakerProfile>(
      `/speaker-profiles/${profileId}/duplicate`
    )
    return response.data
  },

  generatePodcast: async (payload: PodcastGenerationRequest) => {
    const response = await apiClient.post<PodcastGenerationResponse>(
      '/podcasts/generate',
      payload
    )
    return response.data
  },
}
