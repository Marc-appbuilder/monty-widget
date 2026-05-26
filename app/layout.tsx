import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vaughan',
  description: 'Embeddable AI chat widget, powered by Claude.',
};

// Injected in <head> so all pages get Space Grotesk without per-component links
const spaceGrotesk = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href={spaceGrotesk} rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
