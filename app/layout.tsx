import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'btg. Finance',
  description: 'BTG Studios finance dashboard: executive summary, forecast, insights, P&L, history and projects.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@300;400;500;600;700&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
