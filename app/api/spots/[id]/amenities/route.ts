import { NextResponse } from 'next/server';
import { addAmenityVote, getSpots } from '@/lib/store';
import { VOTE_FIELDS, type AmenityValue, type VoteField } from '@/lib/types';

export const dynamic = 'force-dynamic';

const OUTLETS = ['none', 'sparse', 'moderate', 'abundant'];

function validate(field: VoteField, value: unknown): AmenityValue | null {
  if (field === 'outlets') return typeof value === 'string' && OUTLETS.includes(value) ? (value as AmenityValue) : null;
  if (field === 'noise_base') {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }
  return typeof value === 'boolean' ? value : null;
}

/**
 * POST /api/spots/:id/amenities
 * body: { field, value }   headers: x-device-id
 * → 200 { field, verdict, live, nextQuestion }
 *
 * "Not sure / skip" never reaches this endpoint — skips are not votes.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!getSpots().some((s) => s.id === id)) {
    return NextResponse.json({ error: 'Unknown spot' }, { status: 404 });
  }

  const deviceId = req.headers.get('x-device-id');
  if (!deviceId) return NextResponse.json({ error: 'Missing x-device-id header' }, { status: 400 });

  let body: { field?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const field = body.field as VoteField;
  if (!VOTE_FIELDS.includes(field)) {
    return NextResponse.json({ error: `Unknown field ${body.field}` }, { status: 400 });
  }

  const value = validate(field, body.value);
  if (value === null) {
    return NextResponse.json({ error: `Invalid value for field ${field}` }, { status: 400 });
  }

  const res = await addAmenityVote(id, deviceId, field, value);
  if (!res.ok) {
    return NextResponse.json({ error: res.reason, retryAfterSec: res.retryAfterSec }, { status: 429 });
  }

  return NextResponse.json({ field, verdict: res.verdict, live: res.live, nextQuestion: res.nextQuestion });
}
