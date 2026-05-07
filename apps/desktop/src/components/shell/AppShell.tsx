import { useSelection } from '@/state/selection';
import { ServerList } from './ServerList';
import { ChannelSidebar } from './ChannelSidebar';
import { DmSidebar } from './DmSidebar';
import { ChatArea } from './ChatArea';
import { DmChatArea } from './DmChatArea';
import { MemberList } from './MemberList';
import { DmPeerPanel } from './DmPeerPanel';

export function AppShell(): JSX.Element {
  const mode = useSelection((s) => s.mode);
  return (
    <div className="flex min-h-0 flex-1">
      <ServerList />
      {mode === 'dm' ? <DmSidebar /> : <ChannelSidebar />}
      {mode === 'dm' ? <DmChatArea /> : <ChatArea />}
      {mode === 'guild' ? <MemberList /> : <DmPeerPanel />}
    </div>
  );
}
