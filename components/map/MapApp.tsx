'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { fetchLive } from '@/lib/api';
import { CAMPUS_CENTER } from '@/lib/geo';
import { filterAndRank } from '@/lib/scoring';
import { AMENITY_FIELDS, type AmenityField, type FilterTri, type Filters, type Spot, type VoteField } from '@/lib/types';
import { getFavorites, getTheme, setTheme as persistTheme, toggleFavorite } from '@/lib/device';
import { MapCanvas, type Viewport } from './MapCanvas';
import { FilterBar } from './FilterBar';
import { SpotCard } from './SpotCard';
import { DetailPanel } from './DetailPanel';
import { ReportDialog } from './ReportDialog';
import { BottomSheet, type SnapIndex } from './BottomSheet';

// Filters and selection are encoded in the query string (shareable links)
type AmenityKey = 'outlets' | 'groupRooms' | 'silentZone' | 'light' | 'food' | 'coffee' | 'restroom' | 'wiscard';

const URL_KEY: Record<AmenityField, AmenityKey> = {
  outlets: 'outlets',
  group_rooms: 'groupRooms',
  silent_zone: 'silentZone',
  natural_light: 'light',
  food_ok: 'food',
  coffee: 'coffee',
  restroom: 'restroom',
  needs_wiscard: 'wiscard',
};

const tri = () => parseAsInteger.withDefault(0);

const parsers = {
  maxWalk: parseAsInteger.withDefault(15),
  open: parseAsBoolean.withDefault(false),
  noise: parseAsInteger.withDefault(2),
  spot: parseAsString,
  outlets: tri(),
  groupRooms: tri(),
  silentZone: tri(),
  light: tri(),
  food: tri(),
  coffee: tri(),
  restroom: tri(),
  wiscard: tri(),
};

export function MapApp({ spots }: { spots: Spot[] }) {
  const qc = useQueryClient();
  const [q, setQ] = useQueryStates(parsers, { history: 'replace', clearOnDefault: true });

  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<Spot | null>(null);
  const [askField, setAskField] = useState<VoteField | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [snap, setSnap] = useState<SnapIndex>(1);
  const [now, setNow] = useState(() => new Date());

  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  /** Tags scroll/highlight origin so programmatic scrolls don't echo back. */
  const scrollSource = useRef<'user' | 'sync'>('user');

  useEffect(() => {
    setThemeState(getTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    setFavorites(getFavorites());
  }, []);

  // Recompute "open now" every minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['live'],
    queryFn: fetchLive,
    refetchInterval: 30_000, // §5.1 — polling is the baseline; realtime below just makes it instant
  });

  /*
   * Supabase Realtime: when configured, browsers subscribe to INSERTs on
   * reports/amenity_votes and refetch immediately — submit a report in one
   * window, the other window's markers recolor without waiting for the poll.
   * The anon key can only read + insert (RLS); the SDK loads lazily so the
   * chunk costs nothing when Supabase isn't configured.
   */
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    import('@supabase/supabase-js').then(({ createClient }) => {
      if (cancelled) return;
      const client = createClient(url, key);
      const invalidate = () => qc.invalidateQueries({ queryKey: ['live'] });
      const channel = client
        .channel('live-updates')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, invalidate)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'amenity_votes' }, invalidate)
        .subscribe();
      cleanup = () => {
        client.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [qc]);

  const filters = useMemo<Filters>(
    () => ({
      maxWalk: q.maxWalk,
      openNow: q.open,
      noisePref: q.noise,
      categories: [],
      amenities: Object.fromEntries(AMENITY_FIELDS.map((f) => [f, (q[URL_KEY[f]] ?? 0) as FilterTri])) as Filters['amenities'],
    }),
    [q],
  );

  const effectiveOrigin = origin ?? CAMPUS_CENTER;

  // Filtering and ranking run fully client-side
  const results = useMemo(
    () => filterAndRank(spots, data?.spots ?? {}, filters, effectiveOrigin, now),
    [spots, data, filters, effectiveOrigin, now],
  );

  // List is filtered to the map viewport; the map renders all results
  const listed = useMemo(() => {
    if (!viewport) return results;
    const inView = results.filter(
      (r) =>
        r.spot.lng >= viewport.west && r.spot.lng <= viewport.east && r.spot.lat >= viewport.south && r.spot.lat <= viewport.north,
    );
    // Fall back to all results when the viewport is empty
    return inView.length ? inView : results;
  }, [results, viewport]);

  const selected = results.find((r) => r.spot.id === q.spot) ?? null;

  // Marker click → scroll the list to the card
  useEffect(() => {
    if (!q.spot) return;
    if (scrollSource.current === 'user') {
      scrollSource.current = 'sync';
      itemRefs.current.get(q.spot)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      requestAnimationFrame(() => {
        scrollSource.current = 'user';
      });
    }
    if (window.innerWidth < 1024) setSnap(2);
  }, [q.spot]);

  const select = useCallback(
    (id: string | null) => {
      scrollSource.current = 'user';
      setAskField(null);
      setQ({ spot: id });
    },
    [setQ],
  );

  const patch = useCallback(
    (p: Partial<Filters>) => {
      const next: Record<string, unknown> = {};
      if (p.maxWalk !== undefined) next.maxWalk = p.maxWalk;
      if (p.openNow !== undefined) next.open = p.openNow;
      if (p.noisePref !== undefined) next.noise = p.noisePref;
      if (p.amenities) for (const f of AMENITY_FIELDS) next[URL_KEY[f]] = p.amenities[f] ?? 0;
      setQ(next);
    },
    [setQ],
  );

  const reset = useCallback(() => {
    setQ({ maxWalk: 15, open: false, noise: 2, ...Object.fromEntries(AMENITY_FIELDS.map((f) => [URL_KEY[f], 0])) });
  }, [setQ]);

  // Per filtered field: how many listed spots are still unknown
  const unknownForFiltered = useMemo(
    () =>
      AMENITY_FIELDS.filter((f) => (filters.amenities[f] ?? 0) > 0).map(
        (f) => [f, listed.filter((r) => (r.live.amenities[f]?.state ?? 'unknown') === 'unknown').length] as [AmenityField, number],
      ),
    [filters, listed],
  );

  const openFill = useCallback(
    (spotId: string, field: VoteField) => {
      select(spotId);
      setAskField(field);
    },
    [select],
  );

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  const list = (
    <>
      {isError && (
        <p className="px-3 py-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>
          Live data is unreachable right now. The map, distance ranking and hours still work.
        </p>
      )}
      {isLoading && !data && (
        <ul className="space-y-2 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="h-[148px] animate-pulse rounded-xl" style={{ background: 'var(--surface-2)' }} />
          ))}
        </ul>
      )}
      {!isLoading && listed.length === 0 && (
        <div className="px-5 py-12 text-center">
          <p className="text-[14px]">Nothing matches these filters</p>
          <button type="button" onClick={reset} className="mt-3 text-[13px] underline" style={{ color: 'var(--accent)' }}>
            Clear filters
          </button>
        </div>
      )}
      <ul ref={listRef} className="space-y-2 p-3">
        {listed.map((s) => (
          <SpotCard
            key={s.spot.id}
            ref={(el) => {
              if (el) itemRefs.current.set(s.spot.id, el);
              else itemRefs.current.delete(s.spot.id);
            }}
            s={s}
            filters={filters}
            selected={q.spot === s.spot.id}
            hovered={hoveredId === s.spot.id}
            onSelect={() => select(s.spot.id)}
            onHover={(on) => setHoveredId(on ? s.spot.id : null)}
            onFill={(f) => openFill(s.spot.id, f)}
            onReport={() => setReportFor(s.spot)}
          />
        ))}
      </ul>
    </>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ── header ── */}
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Back to home">
          <span className="relative grid size-6 place-items-center">
            <span className="absolute inset-0 rounded" style={{ background: 'var(--accent)', opacity: 0.14 }} />
            <span className="size-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
          </span>
          <span className="text-[14px] font-semibold tracking-tight">BadgerDesk</span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          {data?.demo && (
            <span
              className="hidden rounded-md border-[1.5px] border-dashed px-2 py-1 text-[11px] sm:inline"
              style={{ borderColor: 'var(--unknown)', color: 'var(--unknown-ink)' }}
              title="Simulated activity for demo purposes. Set BADGERDESK_DEMO=0 for the true cold start (everything unknown)"
            >
              Simulated data
            </span>
          )}
          <button
            type="button"
            onClick={locate}
            className="rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors"
            style={{ borderColor: origin ? 'var(--accent)' : 'var(--line)', color: origin ? 'var(--accent)' : undefined }}
          >
            {locating ? 'Locating…' : origin ? '✓ My location' : '📍 My location'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setThemeState(next);
              persistTheme(next);
            }}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="grid size-8 place-items-center rounded-lg border text-[13px]"
            style={{ borderColor: 'var(--line)' }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        patch={patch}
        reset={reset}
        resultCount={listed.length}
        unknownForFiltered={unknownForFiltered}
        onFillUnknown={(f) => {
          const target = listed.find((r) => (r.live.amenities[f]?.state ?? 'unknown') === 'unknown');
          if (target) openFill(target.spot.id, f);
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* ── desktop list ── */}
        <aside
          className="thin-scroll hidden w-[400px] shrink-0 overflow-y-auto border-r lg:block"
          style={{ borderColor: 'var(--line)' }}
          aria-label="Study spot list"
        >
          {list}
        </aside>

        {/* ── map ── */}
        <div className="relative min-w-0 flex-1">
          <MapCanvas
            results={results}
            selectedId={q.spot}
            hoveredId={hoveredId}
            origin={origin}
            theme={theme}
            onSelect={select}
            onHover={setHoveredId}
            onViewportChange={setViewport}
          />

          {/* desktop detail panel */}
          {selected && (
            <div
              className="absolute right-3 top-3 z-20 hidden max-h-[calc(100%-1.5rem)] w-[368px] overflow-hidden rounded-2xl border lg:block"
              style={{ background: 'var(--bg)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-pop)' }}
            >
              <DetailPanel
                s={selected}
                askField={askField}
                onAsk={setAskField}
                onClose={() => select(null)}
                onReport={() => setReportFor(selected.spot)}
                favorite={favorites.includes(selected.spot.id)}
                onToggleFavorite={() => setFavorites(toggleFavorite(selected.spot.id))}
              />
            </div>
          )}
        </div>

        {/* ── mobile bottom sheet ── */}
        <BottomSheet
          snap={snap}
          onSnapChange={setSnap}
          header={
            selected ? (
              <p className="truncate text-[13px] font-semibold">{selected.spot.name}</p>
            ) : (
              <p className="truncate text-[13px]">
                <span className="font-semibold">{listed.length}</span> spot{listed.length === 1 ? '' : 's'} found
              </p>
            )
          }
        >
          {selected ? (
            <DetailPanel
              s={selected}
              askField={askField}
              onAsk={setAskField}
              onClose={() => select(null)}
              onReport={() => setReportFor(selected.spot)}
              favorite={favorites.includes(selected.spot.id)}
              onToggleFavorite={() => setFavorites(toggleFavorite(selected.spot.id))}
            />
          ) : (
            list
          )}
        </BottomSheet>
      </div>

      <ReportDialog spot={reportFor} open={!!reportFor} onOpenChange={(o) => !o && setReportFor(null)} />
    </div>
  );
}
