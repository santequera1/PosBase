import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/** Archivo principal (con su huella) de una página publicada: /assets/index-XXXX.js */
const mainScript = (html: string) => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0] || '';

/**
 * Avisa cuando se publica una versión nueva del sistema (los equipos que dejan la página abierta todo el día
 * seguían con la versión vieja). Revisa cada 3 minutos y al volver a la pestaña; muestra "Actualizar".
 */
export const UpdateNotifier = () => {
  const shown = useRef(false);
  useEffect(() => {
    const current = mainScript(document.documentElement.innerHTML);
    if (!current) return; // modo desarrollo: no hay archivos con huella
    const check = async () => {
      if (shown.current) return;
      try {
        const html = await (await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' })).text();
        const latest = mainScript(html);
        if (latest && latest !== current) {
          shown.current = true;
          toast('Hay una versión nueva del sistema', {
            description: 'Toca Actualizar para ver los últimos cambios (no se pierde nada de lo guardado).',
            duration: Infinity,
            action: { label: 'Actualizar', onClick: () => window.location.reload() },
          });
        }
      } catch { /* sin conexión: se revisa en la próxima vuelta */ }
    };
    const t = setInterval(check, 3 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return null;
};

export default UpdateNotifier;
