import type { Metadata } from 'next';
import { getSpots } from '@/lib/store';
import { MapApp } from '@/components/map/MapApp';

export const metadata: Metadata = {
  title: 'BadgerDesk — map',
  description: 'Live crowd, noise and amenity levels for 39 UW–Madison study spots.',
};

/**
 * Static data is read once on the server and shipped with the RSC payload
 * (§5.2: the client holds all spots). Filtering, distance and ranking then
 * run fully client-side — no further network round-trips.
 */
export default function MapPage() {
  return (
    <main id="main">
      <MapApp spots={getSpots()} />
    </main>
  );
}
