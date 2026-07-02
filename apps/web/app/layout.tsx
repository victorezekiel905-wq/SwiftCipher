import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'ClassSphere SaaS',
  description: 'Enterprise multi-tenant classroom engagement platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
