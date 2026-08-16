import { NextResponse } from 'next/server';
import { getHeatmap, getSpots } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** GET /api/spots/:id/heatmap — 7×24 historical heatmap cells (§9.5). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getSpots().some((s) => s.id === id)) {
    return NextResponse.json({ error: 'Unknown spot' }, { status: 404 });
  }
  return NextResponse.json({ cells: await getHeatmap(id) }, { headers: { 'cache-control': 'no-store' } });
}
