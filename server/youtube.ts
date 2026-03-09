export interface VideoInfo {
  videoId: string;
  title: string;
  url: string;
}

export interface TranscriptResult {
  videoId: string;
  title: string;
  transcript: string;
}

function extractChannelIdentifier(url: string): { type: "channel" | "handle" | "user" | "id"; value: string } | null {
  const cleaned = url.trim().replace(/\/+$/, "");

  const handleMatch = cleaned.match(/@([\w.-]+)/);
  if (handleMatch) return { type: "handle", value: handleMatch[1] };

  const channelIdMatch = cleaned.match(/\/channel\/(UC[\w-]+)/);
  if (channelIdMatch) return { type: "id", value: channelIdMatch[1] };

  const userMatch = cleaned.match(/\/user\/([\w.-]+)/);
  if (userMatch) return { type: "user", value: userMatch[1] };

  const cMatch = cleaned.match(/\/c\/([\w.-]+)/);
  if (cMatch) return { type: "handle", value: cMatch[1] };

  if (/^[\w.-]+$/.test(cleaned)) return { type: "handle", value: cleaned };

  return null;
}

export async function getChannelVideos(channelUrl: string, maxVideos: number = 10): Promise<{ channelName: string; videos: VideoInfo[] }> {
  const identifier = extractChannelIdentifier(channelUrl);
  if (!identifier) {
    throw new Error("Could not parse channel URL. Please provide a valid YouTube channel URL (e.g. https://youtube.com/@ChannelName)");
  }

  let pageUrl: string;
  if (identifier.type === "id") {
    pageUrl = `https://www.youtube.com/channel/${identifier.value}/videos`;
  } else if (identifier.type === "user") {
    pageUrl = `https://www.youtube.com/user/${identifier.value}/videos`;
  } else {
    pageUrl = `https://www.youtube.com/@${identifier.value}/videos`;
  }

  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch channel page: ${res.status}`);
  }

  const html = await res.text();

  const channelNameMatch = html.match(/"channelName":"([^"]+)"/);
  const channelName = channelNameMatch ? channelNameMatch[1] : identifier.value;

  const videoIds: string[] = [];
  const videoTitles: Map<string, string> = new Map();

  const regex = /"videoId":"([\w-]{11})"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const vid = match[1];
    if (!videoIds.includes(vid)) {
      videoIds.push(vid);
    }
  }

  const titleRegex = /"title":\{"runs":\[\{"text":"([^"]+)"\}\].*?"videoId":"([\w-]{11})"/g;
  while ((match = titleRegex.exec(html)) !== null) {
    videoTitles.set(match[2], match[1]);
  }

  const titleRegex2 = /"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}\]/g;
  while ((match = titleRegex2.exec(html)) !== null) {
    if (!videoTitles.has(match[1])) {
      videoTitles.set(match[1], match[2]);
    }
  }

  const videos: VideoInfo[] = videoIds.slice(0, maxVideos).map((id, i) => ({
    videoId: id,
    title: videoTitles.get(id) || `Video ${i + 1}`,
    url: `https://www.youtube.com/watch?v=${id}`,
  }));

  if (videos.length === 0) {
    throw new Error("Could not find any videos on this channel. Make sure the URL is correct and the channel has public videos.");
  }

  return { channelName, videos };
}

const TRANSCRIPT_API_URL = "https://www.youtube-transcript.io/api/transcripts";

export async function getVideoTranscript(videoId: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_TRANSCRIPT_API_KEY not set");
    return "";
  }

  try {
    const res = await fetch(TRANSCRIPT_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [videoId] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Transcript API error for ${videoId}: ${res.status} - ${errText}`);
      return "";
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].text) {
      return data[0].text;
    }

    console.error(`No transcript returned for ${videoId}`);
    return "";
  } catch (err: any) {
    console.error(`Failed to get transcript for ${videoId}:`, err.message);
    return "";
  }
}

export async function getVideoTranscriptsBatch(videoIds: string[]): Promise<Map<string, { text: string; title: string }>> {
  const apiKey = process.env.YOUTUBE_TRANSCRIPT_API_KEY;
  if (!apiKey) {
    console.error("YOUTUBE_TRANSCRIPT_API_KEY not set");
    return new Map();
  }

  const results = new Map<string, { text: string; title: string }>();

  const batchSize = 50;
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);

    try {
      const res = await fetch(TRANSCRIPT_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: batch }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Transcript API batch error: ${res.status} - ${errText}`);
        continue;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.id && item.text) {
            results.set(item.id, {
              text: item.text,
              title: item.title || `Video ${item.id}`,
            });
          }
        }
      }
    } catch (err: any) {
      console.error(`Transcript API batch failed:`, err.message);
    }

    if (i + batchSize < videoIds.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

export async function extractChannelTranscripts(
  channelUrl: string,
  maxVideos: number = 10,
  onProgress?: (current: number, total: number, videoTitle: string) => void,
  onVideoExtracted?: (video: { videoId: string; title: string; wordCount: number }) => void,
  filterVideoIds?: string[]
): Promise<{ channelName: string; transcripts: TranscriptResult[] }> {
  const { channelName, videos: allVideos } = await getChannelVideos(channelUrl, Math.max(maxVideos, filterVideoIds?.length || 0));

  const videos = filterVideoIds && filterVideoIds.length > 0
    ? allVideos.filter(v => filterVideoIds.includes(v.videoId))
    : allVideos.slice(0, maxVideos);

  onProgress?.(0, videos.length, "Fetching transcripts via API...");

  const videoIds = videos.map(v => v.videoId);
  const batchResults = await getVideoTranscriptsBatch(videoIds);

  const transcripts: TranscriptResult[] = [];
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    onProgress?.(i + 1, videos.length, video.title);

    const result = batchResults.get(video.videoId);
    const transcript = result?.text || "";

    if (transcript.trim().length > 100) {
      const title = result?.title || video.title;
      const wordCount = transcript.split(/\s+/).length;
      transcripts.push({
        videoId: video.videoId,
        title,
        transcript,
      });
      onVideoExtracted?.({ videoId: video.videoId, title, wordCount });
    }
  }

  return { channelName, transcripts };
}

export async function extractSelectedVideoTranscripts(
  selectedVideos: Array<{ videoId: string; title: string }>,
  channelName: string,
  onProgress?: (current: number, total: number, videoTitle: string) => void,
  onVideoExtracted?: (video: { videoId: string; title: string; wordCount: number }) => void,
): Promise<{ channelName: string; transcripts: TranscriptResult[] }> {
  onProgress?.(0, selectedVideos.length, "Fetching transcripts for selected videos...");

  const videoIds = selectedVideos.map(v => v.videoId);
  const batchResults = await getVideoTranscriptsBatch(videoIds);

  const transcripts: TranscriptResult[] = [];
  for (let i = 0; i < selectedVideos.length; i++) {
    const video = selectedVideos[i];
    onProgress?.(i + 1, selectedVideos.length, video.title);

    const result = batchResults.get(video.videoId);
    const transcript = result?.text || "";

    if (transcript.trim().length > 100) {
      const title = result?.title || video.title;
      const wordCount = transcript.split(/\s+/).length;
      transcripts.push({
        videoId: video.videoId,
        title,
        transcript,
      });
      onVideoExtracted?.({ videoId: video.videoId, title, wordCount });
    }
  }

  return { channelName, transcripts };
}
