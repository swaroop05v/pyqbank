import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PYQ Bank',
  description: 'Previous-year question bank with semantic repeat detection',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. Dark Reader) add attributes to <html>/<body>
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
