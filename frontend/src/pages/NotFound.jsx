import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl font-extrabold bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent mb-3">404</div>
      <p className="text-gray-400 mb-6">This page doesn't exist — check the URL or head back to your dashboard.</p>
      <Link to="/dashboard" className="text-primary font-semibold hover:underline">← Back to Dashboard</Link>
    </div>
  );
}
