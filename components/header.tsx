'use client';

/**
 * The header: brand, navigation to the pages this person may open, the
 * data-through note, the Data (CSV) and Export PDF buttons for those who may
 * export, and sign out.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { PAGES } from '@/lib/access';
import { fyLabel, fyOf, mLabel, type Model } from '@/lib/model';
import { signOut, useAccess } from '@/lib/use-dashboard';
import { downloadCSV } from './ui';

/** `m` is null until the sheets have been read. */
export function Header({ asOf, m }: { asOf: string; m: Model | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useAccess();

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
          {PAGES.filter((page) => access.pages.includes(page.key)).map((page) => (
            <Link key={page.href} href={page.href} className={pathname === page.href ? 'on' : ''}>
              {page.label}
            </Link>
          ))}
        </nav>
        <div className="hdr-ctl">
          <div className="asof">
            Data through <b>{m ? mLabel(m.dataThrough) : '—'}</b>
            <br />
            as of <span>{asOf}</span>
          </div>
          {access.canExport ? (
            <>
              <button type="button" className="hbtn" onClick={downloadData} title="Download the full dataset as CSV">
                ⬇ Data
              </button>
              <button type="button" className="hbtn pri" onClick={() => window.print()} title="Print the current view to PDF">
                Export PDF
              </button>
            </>
          ) : null}
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
