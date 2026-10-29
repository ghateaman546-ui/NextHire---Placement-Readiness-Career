export default function Card({ children, className = '', ...rest }) {
  return (
    <div className={`glass-card ${className}`} {...rest}>
      {children}
    </div>
  );
}
