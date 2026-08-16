import { NextResponse } from 'next/server';
import { addReport, getSpots } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * POST /api/spots/:id/reports
 * body: { crowd?: 1..5, noise?: 1..5 }   headers: x-device-id
 * → 200 { live, nextQuestion }   → 429 { retryAfterSec }
 *
 * Returns the UPDATED aggregate rather than a bare success, so the client's
 * optimistic update gets corrected by server truth.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!getSpots().some((s) => s.id === id)) {
    return NextResponse.json({ error: 'Unknown spot' }, { status: 404 });
  }

  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return NextResponse.json({ error: 'Missing x-device-id header' }, { status: 400 });

  let body: { crowd?: number; noise?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  if (body.crowd == null && body.noise == null) {
    return NextResponse.json({ error: 'At least one of crowd / noise is required' }, { status: 400 });
  }

  const res = await addReport(id, deviceId, body);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason, retryAfterSec: res.retryAfterSec }, { status: 429 });
  }

  return NextResponse.json({ live: res.live, nextQuestion: res.nextQuestion });
}
