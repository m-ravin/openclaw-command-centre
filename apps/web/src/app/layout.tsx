import type { Metadata } from 'next';
import './globals.css';
import { Sidebar }  from '@/components/layout/Sidebar';
import { TopBar }   from '@/components/layout/TopBar';
import { Toaster }  from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'OpenClaw Command Centre',
  description: 'Enterprise AI Agent Operations Command Centre',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden bg-surface">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#1f2433',
              color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
            },
          }}
        />
      </body>
    </html>
  );
}
