// ─────────────────────────────────────────────────────────────
//  Supabase Client & Audio Storage Helpers
// ─────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Singleton client
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      );
    }
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

const BUCKET = 'audio';

// ── Types ───────────────────────────────────────────────────

export interface CloudAudioFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  url: string;
}

// ── Upload ──────────────────────────────────────────────────

export async function uploadAudioFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<CloudAudioFile> {
  const supabase = getSupabase();

  // Generate unique path: audio/<timestamp>_<filename>
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${timestamp}_${safeName}`;

  onProgress?.(10);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'audio/wav',
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  onProgress?.(80);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  onProgress?.(100);

  return {
    name: file.name,
    path,
    size: file.size,
    createdAt: new Date().toISOString(),
    url: urlData.publicUrl,
  };
}

// ── List files ──────────────────────────────────────────────

export async function listAudioFiles(): Promise<CloudAudioFile[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list('', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) throw new Error(`List failed: ${error.message}`);

  return (data ?? [])
    .filter((f) => f.name.endsWith('.wav'))
    .map((f) => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(f.name);

      return {
        name: f.name.replace(/^\d+_/, ''), // Remove timestamp prefix
        path: f.name,
        size: f.metadata?.size ?? 0,
        createdAt: f.created_at ?? '',
        url: urlData.publicUrl,
      };
    });
}

// ── Get URL ─────────────────────────────────────────────────

export function getAudioUrl(path: string): string {
  const supabase = getSupabase();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── Delete ──────────────────────────────────────────────────

export async function deleteAudioFile(path: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

// ── Download file as ArrayBuffer ────────────────────────────

export async function downloadAudioFile(path: string): Promise<ArrayBuffer> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Download failed: ${error?.message}`);
  return data.arrayBuffer();
}
