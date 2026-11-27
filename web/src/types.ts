export type Asset = {
  id: string; kind: string; url: string; mime: string; width: number | null; height: number | null; duration: number | null;
  credit?: { name: string; profile: string; source: string } | null;
};

export type User = { id: string; email: string; name: string; role: string; plan: string; credits: number; creditsResetAt: string; onboarded: boolean; createdAt: string };

export type Profile = {
  kind: "business" | "personal"; displayName: string; category: string; description: string; audience: string; location: string;
  website: string; contact: string; tone: string; language: string; colors: string[]; fontStyle: string; voiceGender: string;
  voiceStyle: string; cta: string; hashtags: string; timezone: string; logo: Asset | null; music: Asset | null;
};

export type Instagram = { mode: "live" | "demo"; username: string; name: string | null; picture: string | null; accountType: string | null; followers: number | null; mediaCount: number | null; connectedAt: string; tokenExpiresAt: string | null };

export type System = { writer: string; image: string; voice: string[]; instagram: "live" | "demo" | "off"; photos?: string; video?: string; publicUrl: string; publicUrlOk: boolean };

export type Product = { id: string; name: string; description: string; price: string; offer: string; link: string; features: string[]; images: Asset[]; active: boolean; posts: number; createdAt: string; updatedAt: string };

export type Format = "image" | "carousel" | "reel" | "story";
export type Style = "auto" | "studio" | "bold" | "luxury" | "lifestyle" | "playful";
export type Brief = {
  format: Format; productId?: string | null; topic?: string; goal: string; style: Style; language: string; slides?: number;
  voice: { enabled: boolean; gender: "female" | "male"; style: string }; aiScene: boolean; premium?: boolean; music: boolean; extra?: string; photoAssetId?: string;
};
export type Slide = { kicker: string; headline: string; body: string; voiceover: string };
export type PostStatus = "draft" | "generating" | "ready" | "needs_approval" | "scheduled" | "publishing" | "published" | "failed";
export type Post = {
  id: string; format: Format; status: PostStatus; source: string; brief: Brief;
  content: null | { hook: string; caption: string; hashtags: string[]; cta: string; altText: string; slides: Slide[]; writer: string; style: string; notes: string[]; hasScene: boolean; voiced: boolean };
  media: Asset[]; cover: Asset | null; progress: { steps?: string[]; step?: string; done?: string[] }; product: { id: string; name: string } | null;
  scheduledAt: string | null; publishedAt: string | null; permalink: string | null; stats: Record<string, number>; error: string | null; createdAt: string; updatedAt: string;
};
export type AutopilotCfg = { enabled: boolean; days: number[]; time: string; formats: Format[]; productIds: string[]; goals: string[]; requireApproval: boolean; lastRunAt: string | null };
