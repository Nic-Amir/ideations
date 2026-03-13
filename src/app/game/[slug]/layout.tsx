import { AppShell } from '@/components/layout/app-shell';

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
