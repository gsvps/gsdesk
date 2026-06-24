import AgentSettingsPanel from '../components/AgentSettingsPanel';
import BackendSettings from '../components/BackendSettings';
import ControllerTokenSettings from '../components/ControllerTokenSettings';
import DesktopLayout from '../components/DesktopLayout';
import { isDesktopClient } from '../lib/runtime-config';

export default function SettingsPage() {
  const desktop = isDesktopClient();

  return (
    <DesktopLayout title="CloudDesk 设置" subtitle="连接、系统与本机偏好" backTo="/" backLabel="返回主页">
      <div className="space-y-4">
        <BackendSettings />
        <ControllerTokenSettings />
        {desktop ? <AgentSettingsPanel /> : null}
      </div>
    </DesktopLayout>
  );
}
