'use strict';

import { useState, useEffect } from 'react';

export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const update = () => {
      setLandscape(
        window.innerWidth > window.innerHeight && window.innerHeight < 700,
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return landscape;
}
