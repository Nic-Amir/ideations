import { AppShell } from '@/components/layout/app-shell';

export default function LobbyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
