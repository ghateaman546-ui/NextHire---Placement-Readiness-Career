import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import Topbar from './Topbar.jsx';

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
