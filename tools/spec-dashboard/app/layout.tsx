import type { Metadata } from 'next';
import Link from 'next/link';
import { LiveRefresh } from '@/components/LiveRefresh';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spec Dashboard',
  description: 'Roadmap, feature progress and project memory for the spec-driven workflow.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">S</span> Spec Dashboard
          </Link>
          <nav aria-label="Main">
            <Link href="/">Overview</Link>
            <Link href="/memory">Memory</Link>
          </nav>
          <LiveRefresh />
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
