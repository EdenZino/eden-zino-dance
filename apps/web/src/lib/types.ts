export interface Workshop {
  id: string; public_code: string; slug: string; title: string; title_en?: string; short_description: string; short_description_en?: string; full_description: string; full_description_en?: string;
  image_url: string; gallery: string[]; location_name: string; location_name_en?: string; location_address: string; location_address_en?: string; map_url: string;
  starts_at: string; ends_at: string; registration_opens_at?: string | null; registration_closes_at?: string | null;
  capacity: number; available: number; occupied?: number; price_agorot: number; early_bird_price_agorot?: number | null;
  early_bird_ends_at?: string | null; deposit_agorot?: number | null; currency: string; level: string; level_en?: string; audience: string; audience_en?: string; recurrence_label_en?: string;
  minimum_age?: number | null; max_participants_per_order: number; allow_waitlist: boolean; status: string;
  accessibility_entrance?: 'UNKNOWN'|'YES'|'NO'|'NOT_APPLICABLE'; accessibility_elevator?: 'UNKNOWN'|'YES'|'NO'|'NOT_APPLICABLE'; accessibility_restroom?: 'UNKNOWN'|'YES'|'NO'|'NOT_APPLICABLE'; accessibility_parking?: 'UNKNOWN'|'YES'|'NO'|'NOT_APPLICABLE';
  accessibility_passages?: string; accessibility_passages_en?: string; accessibility_notes?: string; accessibility_notes_en?: string; accessibility_verified_at?: string | null; accessibility_source?: string;
  terms_version: string; privacy_version: string; cancellation_policy_version: string;
  instructors?: Array<{ id: string; name: string; name_en?: string; bio?: string; bio_en?: string; imageUrl?: string; instagramUrl?: string }>;
}

export interface SiteData {
  settings: Record<string, string>;
  content: { home?: Record<string, any>; instructor?: Record<string, any>; legal?: Record<string, any> };
  legal: Array<{ type: string; version: string; title: string; content: string }>;
  turnstileSiteKey?: string;
}


export interface GalleryItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO';
  title: string;
  title_en?: string;
  caption: string;
  caption_en?: string;
  alt_text: string;
  alt_text_en?: string;
  display_order: number;
  is_published?: boolean;
  object_key?: string;
  public_url: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}
