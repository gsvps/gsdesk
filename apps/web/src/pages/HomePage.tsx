import BackendSettings from '../components/BackendSettings';
import ControllerPanel from '../components/ControllerPanel';
import LocalDevicePanel from '../components/LocalDevicePanel';
import { isDesktopClient } from '../lib/runtime-config';

export default function HomePage() {
  const desktop = isDesktopClient();

  if (!desktop) {
    return (
      <div className="grid h-full grid-rows-[auto_1fr] gap-2 overflow-hidden p-2">
        <BackendSettings compact />
        <ControllerPanel compact />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-12 grid-rows-1 gap-2 overflow-hidden p-2">
      <div className="col-span-3 min-h-0 overflow-hidden">
        <LocalDevicePanel compact />
      </div>
      <div className="col-span-4 min-h-0 overflow-hidden">
        <BackendSettings compact />
      </div>
      <div className="col-span-5 min-h-0 overflow-hidden">
        <ControllerPanel compact />
      </div>
    </div>
  );
}
