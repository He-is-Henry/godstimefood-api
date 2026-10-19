'use client';

import { useAuth } from '@/context/AuthContext';
import { getUnreadCount } from '@/lib/messages';
import { useEffect, useState } from 'react';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let isMounted = true;

    const fetchCount = async () => {
      try {
        const res = await getUnreadCount();
        if (isMounted && res && typeof res.count === 'number') {
          setUnreadCount(res.count);
        }
      } catch {
        // Silently swallow unauthenticated or network errors
      }
    };

    fetchCount();

    // Refetch on window focus
    const onFocus = () => fetchCount();
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

  return { unreadCount, setUnreadCount };
}
