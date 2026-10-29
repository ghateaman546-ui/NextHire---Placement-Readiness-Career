const variants = {
  primary: 'bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40',
  ghost: 'bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25',
};

export default function Button({ children, variant = 'primary', className = '', ...rest }) {
  return (
    <button
      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
