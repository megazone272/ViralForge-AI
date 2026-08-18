import fs from "node:fs/promises";

export interface Publisher {
  publish(args: { videoPath: string; title: string; caption: string; accessToken: string }): Promise<{ remoteId: string }>;
}

/**
 * Platform publishers — scaffold implementations.
 * Each publisher will throw if not fully configured.
 * DO NOT use browser automation, scraping, or unofficial APIs.
 * Production: implement each platform's official video upload API.
 */

class YouTubePublisher implements Publisher {
  async publish(args: { videoPath: string; title: string; caption: string; accessToken: string }) {
    if (!args.accessToken) throw new Error("YouTube: OAuth token missing — connect account in Accounts section");
    await fs.access(args.videoPath);
    // TODO: Implement Google APIs videos.insert with resumable upload
    // Docs: https://developers.google.com/youtube/v3/docs/videos/insert
    throw new Error("YouTube publishing requires YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET in .env and OAuth account connection");
  }
}

class TikTokPublisher implements Publisher {
  async publish(args: { videoPath: string; title: string; caption: string; accessToken: string }) {
    if (!args.accessToken) throw new Error("TikTok: OAuth token missing — connect account in Accounts section");
    await fs.access(args.videoPath);
    // TODO: Implement TikTok Content Posting API (Direct Post)
    // Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
    throw new Error("TikTok publishing requires TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET in .env and OAuth account connection");
  }
}

class InstagramPublisher implements Publisher {
  async publish(args: { videoPath: string; title: string; caption: string; accessToken: string }) {
    if (!args.accessToken) throw new Error("Instagram: OAuth token missing — connect account in Accounts section");
    await fs.access(args.videoPath);
    // TODO: Implement Meta Graph API Reels publishing
    // Docs: https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
    throw new Error("Instagram publishing requires META_APP_ID + META_APP_SECRET in .env and OAuth account connection");
  }
}

class FacebookPublisher implements Publisher {
  async publish(args: { videoPath: string; title: string; caption: string; accessToken: string }) {
    if (!args.accessToken) throw new Error("Facebook: OAuth token missing — connect account in Accounts section");
    await fs.access(args.videoPath);
    // TODO: Implement Facebook Graph API video publishing
    // Docs: https://developers.facebook.com/docs/video-api/guides/reels-publishing
    throw new Error("Facebook publishing requires META_APP_ID + META_APP_SECRET in .env and OAuth account connection");
  }
}

export const publishers: Record<string, Publisher> = {
  YouTube: new YouTubePublisher(),
  TikTok: new TikTokPublisher(),
  Instagram: new InstagramPublisher(),
  Facebook: new FacebookPublisher(),
};