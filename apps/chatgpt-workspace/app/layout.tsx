import './styles.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Workspace AI',
  description: 'A ChatGPT-style agent workspace with projects, subagents, artifacts, and citations.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
