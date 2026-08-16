import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import { Suspense } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryProvider } from '@/components/QueryProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-instrument-serif', display: 'swap' });

export const metadata: Metadata = {
  title: 'BadgerDesk — UW–Madison study spots',
  description: 'Live crowd and noise levels for study spots across the UW–Madison campus. Crowdsourced, no account needed.',
  applicationName: 'BadgerDesk',
  openGraph: {
    title: 'BadgerDesk — UW–Madison study spots',
    description: 'Live crowd and noise levels for study spots across the UW–Madison campus.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfcf8' },
    { media: '(prefers-color-scheme: dark)', color: '#232227' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Resolve the theme before hydration to avoid a light-mode flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('bd-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Font variable classes live on <html> so :root-level custom properties
    // (--font-display / --font-body) can resolve var(--font-inter) etc. —
    // substitution inside a custom property happens where it is DEFINED, not used.
    <html lang="en" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[999] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
        >
          Skip to main content
        </a>
        <QueryProvider>
          <Suspense>
            <NuqsAdapter>{children}</NuqsAdapter>
          </Suspense>
        </QueryProvider>
      </body>
    </html>
  );
}
