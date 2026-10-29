import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_15%_0%,rgba(37,99,235,0.18),transparent_40%),radial-gradient(circle_at_85%_15%,rgba(6,182,212,0.12),transparent_35%)]">
      <Outlet />
    </div>
  );
}
