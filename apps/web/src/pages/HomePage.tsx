import ControllerPanel from '../components/ControllerPanel';
import DesktopLayout from '../components/DesktopLayout';
import LocalDevicePanel from '../components/LocalDevicePanel';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isDesktopClient } from '../lib/runtime-config';

export default function HomePage() {
  const desktop = isDesktopClient();
  const { tokenVerified, loading: authLoading } = useAuth();

  if (!desktop) {
    return (
      <DesktopLayout title="CloudDesk" subtitle="远程桌面控制端">
        <ControllerPanel />
      </DesktopLayout>
    );
  }

  return (
    <DesktopLayout title="CloudDesk" subtitle="本机被控 · 远程连接" actionTo="/settings" actionLabel="设置">
      <div className="space-y-6">
        {!authLoading && !tokenVerified && (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            远程连接其他设备需先在
            <Link to="/settings" className="mx-1 text-sky-300 underline hover:text-sky-200">
              设置
            </Link>
            中配置并验证控制器令牌。下方「服务已连接」仅表示本机 Agent 已连上 Worker，与令牌无关。
          </div>
        )}
        <LocalDevicePanel />
        <ControllerPanel />
      </div>
    </DesktopLayout>
  );
}
