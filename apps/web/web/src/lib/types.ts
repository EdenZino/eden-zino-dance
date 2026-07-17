export interface Workshop {
  id: string; public_code: string; slug: string; title: string; short_description: string; full_description: string;
  image_url: string; gallery: string[]; location_name: string; location_address: string; map_url: string;
  starts_at: string; ends_at: string; registration_opens_at?: string | null; registration_closes_at?: string | null;
  capacity: number; available: number; occupied?: number; price_agorot: number; early_bird_price_agorot?: number | null;
  early_bird_ends_at?: string | null; deposit_agorot?: number | null; currency: string; level: string; audience: string;
  minimum_age?: number | null; max_participants_per_order: number; allow_waitlist: boolean; status: string;
  terms_version: string; privacy_version: string; cancellation_policy_version: string;
  instructors?: Array<{ id: string; name: string; bio?: string; imageUrl?: string; instagramUrl?: string }>;
}

export interface SiteData {
  settings: Record<string, string>;
  content: { home?: Record<string, any>; instructor?: Record<string, any>; legal?: Record<string, any> };
  legal: Array<{ type: string; version: string; title: string; content: string }>;
}
