import { NextResponse } from 'next/server';
import { getLive, DEMO_MODE } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/live — every spot's aggregates in one response (~6 KB gzip).
 * Clients poll every 30 s; with Supabase configured they also get pushed
 * invalidations over a realtime channel.
 */
export async function GET() {
  return NextResponse.json(
    { demo: DEMO_MODE, at: new Date().toISOString(), spots: await getLive() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
