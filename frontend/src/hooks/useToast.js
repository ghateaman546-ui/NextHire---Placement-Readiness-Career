import { useState, useCallback } from 'react';

export function useToast() {
  const [message, setMessage] = useState(null);
  const show = useCallback((msg) => setMessage(msg), []);
  const clear = useCallback(() => setMessage(null), []);
  return { message, show, clear };
}
