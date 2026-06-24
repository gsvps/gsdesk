import { Link } from 'react-router-dom';
import { isDesktopClient } from '../lib/runtime-config';

export default function DesktopLayout({
  title,
  subtitle,
  backTo,
  backLabel = '返回',
  actionTo,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  actionTo?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  if (!isDesktopClient()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6">
        <div className="mx-auto max-w-4xl">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            {backTo && (
              <Link to={backTo} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                {backLabel}
              </Link>
            )}
            {actionTo && (
              <Link to={actionTo} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
                {actionLabel}
              </Link>
            )}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
