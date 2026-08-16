'use client';

import { useEffect, useRef } from 'react';
import { Map as MLMap, Marker, NavigationControl, GeolocateControl, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Scored } from '@/lib/types';
import { crowdColor, crowdWord } from '@/lib/ui';

/**
 * OpenFreeMap vector tiles: fully free, no API key, no card, no quota —
 * genuinely zero-maintenance (the reason the doc picks it over Mapbox).
 * Light/dark are a matched pair of styles.
 */
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export type Viewport = { west: number; south: number; east: number; north: number };

type Props = {
  results: Scored[];
  selectedId: string | null;
  hoveredId: string | null;
  origin: { lat: number; lng: number } | null;
  theme: 'light' | 'dark';
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onViewportChange: (v: Viewport) => void;
};

export function MapCanvas({ results, selectedId, hoveredId, origin, theme, onSelect, onHover, onViewportChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const originMarkerRef = useRef<Marker | null>(null);
  const readyRef = useRef(false);

  /** Tags move origin so programmatic moves don't echo back. */
  const sourceRef = useRef<'user' | 'sync'>('user');

  // Callbacks live in a ref so the map initializes exactly once
  const cbRef = useRef({ onSelect, onHover, onViewportChange });
  cbRef.current = { onSelect, onHover, onViewportChange };

  /* ── init (once) ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MLMap({
      container: containerRef.current,
      style: STYLE[theme],
      center: [-89.4045, 43.0745],
      zoom: 14.1,
      minZoom: 11,
      maxZoom: 18,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on('error', (e) => console.error('[maplibre]', e.error?.message ?? e));
    if (process.env.NODE_ENV === 'development') (window as unknown as { __map?: MLMap }).__map = map;

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new GeolocateControl({ trackUserLocation: false, showAccuracyCircle: true }), 'bottom-right');

    // The list is the accessible path; the canvas itself is not focusable
    map.getCanvas().setAttribute('tabindex', '-1');

    map.on('load', () => {
      readyRef.current = true;
      emitViewport(map);
    });

    // moveend (not move): don't recompute the list mid-drag
    map.on('moveend', () => {
      if (sourceRef.current === 'sync') {
        sourceRef.current = 'user';
        return;
      }
      emitViewport(map);
    });

    map.on('click', (e: MapMouseEvent) => {
      // Click on empty map clears the selection
      if (!(e.originalEvent.target as HTMLElement)?.closest('.bd-marker')) cbRef.current.onSelect(null);
    });

    function emitViewport(m: MLMap) {
      const b = m.getBounds();
      cbRef.current.onViewportChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    }

    const markers = markersRef.current;
    return () => {
      markers.forEach((mk) => mk.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── theme switch ── */
  const appliedTheme = useRef(theme);
  useEffect(() => {
    if (appliedTheme.current === theme) return;
    appliedTheme.current = theme;
    const map = mapRef.current;
    if (!map) return;
    // setStyle before load aborts the initial tile requests; defer it
    if (readyRef.current) map.setStyle(STYLE[theme]);
    else map.once('load', () => map.setStyle(STYLE[theme]));
  }, [theme]);

  /* ── marker diff: add/update/remove against the desired set; never rebuild all ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const next = new Map(results.map((r) => [r.spot.id, r]));
    const current = markersRef.current;

    for (const [id, marker] of current) {
      if (!next.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }

    for (const [id, scored] of next) {
      const existing = current.get(id);
      if (existing) {
        updateMarkerStyle(existing.getElement(), scored);
      } else {
        const el = createMarkerEl(scored);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          cbRef.current.onSelect(id);
        });
        el.addEventListener('pointerenter', () => cbRef.current.onHover(id));
        el.addEventListener('pointerleave', () => cbRef.current.onHover(null));
        const marker = new Marker({ element: el, anchor: 'center' })
          .setLngLat([scored.spot.lng, scored.spot.lat])
          .addTo(map);
        current.set(id, marker);
      }
    }
  }, [results]);

  /* ── selection/hover styling only; no marker rebuild ── */
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement();
      el.classList.toggle('is-selected', id === selectedId);
      el.classList.toggle('is-hovered', id === hoveredId);
      el.style.zIndex = id === selectedId ? '30' : id === hoveredId ? '20' : '';
    }
  }, [selectedId, hoveredId, results]);

  /* ── ease the map to an off-screen selection (tagged sync) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId || !readyRef.current) return;
    const r = results.find((x) => x.spot.id === selectedId);
    if (!r) return;
    if (map.getBounds().contains([r.spot.lng, r.spot.lat])) return;
    sourceRef.current = 'sync';
    map.easeTo({
      center: [r.spot.lng, r.spot.lat],
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600,
    });
  }, [selectedId, results]);

  /* ── origin marker ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!origin) {
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
      return;
    }
    if (!originMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'bd-origin';
      el.setAttribute('aria-hidden', 'true');
      originMarkerRef.current = new Marker({ element: el, anchor: 'center' }).setLngLat([origin.lng, origin.lat]).addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
    }
  }, [origin]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of UW–Madison study spots. Every dot on the map has a matching item in the list, which is fully keyboard-operable."
      className="size-full"
    />
  );
}

/* ─────────────────────── marker DOM ─────────────────────── */

function createMarkerEl(s: Scored): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'bd-marker';
  el.setAttribute('aria-hidden', 'true'); // the list is the accessible path
  el.innerHTML = '<span class="bd-dot"></span><span class="bd-label"></span>';
  updateMarkerStyle(el, s);
  return el;
}

/** Update style properties only; the DOM structure stays put. */
function updateMarkerStyle(el: HTMLElement, s: Scored) {
  const crowd = s.live.live.crowd;
  const unknown = crowd === null;

  el.classList.toggle('is-unknown', unknown);
  el.classList.toggle('is-closed', s.openState.state === 'closed');
  el.style.setProperty('--m', crowdColor(crowd));

  const label = el.querySelector('.bd-label');
  if (label) label.textContent = `${s.spot.name} · ${crowdWord(crowd)}`;
}
