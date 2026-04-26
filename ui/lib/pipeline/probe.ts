// Browser-side probe: replaces ffprobe for the metadata we actually use downstream.
// duration / dimensions via <video> element. Asset metadata = File API.

import type { ProbeReport } from './types'

async function videoMeta(file: File): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    const cleanup = () => URL.revokeObjectURL(url)
    video.onloadedmetadata = () => {
      const out = {
        durationSec: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      }
      cleanup()
      resolve(out)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('Failed to read video metadata'))
    }
    video.src = url
  })
}

export async function probe(video: File, assets: File[]): Promise<ProbeReport> {
  const meta = await videoMeta(video)
  return {
    video: {
      name: video.name,
      sizeBytes: video.size,
      mimeType: video.type || 'video/mp4',
      ...meta,
    },
    assets: assets.map(a => ({
      name: a.name,
      sizeBytes: a.size,
      mimeType: a.type || 'application/octet-stream',
    })),
  }
}
