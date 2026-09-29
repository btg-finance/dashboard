'use client';

/**
 * The header: brand, six-page navigation, the data-through note, the Data
 * (CSV) and Export PDF buttons, and sign out.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { fyLabel, fyOf, mLabel, type Model } from '@/lib/model';
import { signOut } from '@/lib/use-dashboard';
import { downloadCSV } from './ui';

export const NAV = [
  { href: '/exec', label: 'Executive Summary' },
  { href: '/forecast', label: 'Forecast' },
  { href: '/insights', label: 'Business Insights' },
  { href: '/pl', label: 'P&L' },
  { href: '/history', label: 'Historical Performance' },
  { href: '/projects', label: 'Projects' },
];

/** `m` is null until the sheets have been read. */
export function Header({ asOf, m }: { asOf: string; m: Model | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const downloadData = () => {
    if (!m) return;
    downloadCSV(
      m.P.map((p) => [fyLabel(fyOf(p.ym)), p.ym, p.name, p.client, p.industry, p.scat, p.de, p.recurring ? 'Retainer' : 'One-off', p.revenue, p.cost, p.grossProfit]),
      ['FY', 'Month', 'Project', 'Client', 'Industry', 'Vertical', 'Market', 'Model', 'Revenue', 'Cost', 'GP'],
      'btg-finance-data.csv',
    );
  };

  return (
    <header className="hdr">
      <div className="hdr-in">
        <div className="brand">
          <span className="brand-mark">
            btg<span>.</span>
          </span>
          <span className="brand-sub">Finance</span>
        </div>
        <nav className="nav" id="nav">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname === item.href ? 'on' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-ctl">
          <div className="asof">
            Data through <b>{m ? mLabel(m.dataThrough) : '—'}</b>
            <br />
            as of <span>{asOf}</span>
          </div>
          <button type="button" className="hbtn" onClick={downloadData} title="Download the full dataset as CSV">
            ⬇ Data
          </button>
          <button type="button" className="hbtn pri" onClick={() => window.print()} title="Print the current view to PDF">
            Export PDF
          </button>
          <button
            type="button"
            className="hbtn"
            title="Sign out"
            onClick={async () => {
              await signOut();
              queryClient.clear();
              router.replace('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
