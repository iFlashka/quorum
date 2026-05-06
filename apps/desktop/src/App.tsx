import { CustomTitlebar } from '@/components/titlebar/CustomTitlebar';
import { AppShell } from '@/components/shell/AppShell';

export function App(): JSX.Element {
  return (
    <div className="flex h-screen flex-col bg-bg-default text-text-primary">
      <CustomTitlebar />
      <AppShell />
    </div>
  );
}
