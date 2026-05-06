import { ServerList } from './ServerList';
import { ChannelSidebar } from './ChannelSidebar';
import { ChatArea } from './ChatArea';
import { MemberList } from './MemberList';

export function AppShell(): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1">
      <ServerList />
      <ChannelSidebar />
      <ChatArea />
      <MemberList />
    </div>
  );
}
