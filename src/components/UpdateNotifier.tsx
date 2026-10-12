import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/** Archivo principal (con su huella) de una página publicada: /assets/index-XXXX.js */
const mainScript = (html: string) => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0] || '';

/** Pantallas sin formularios largos donde recargar sola no hace perder nada (p. ej. el celular del domiciliario). */
const SAFE_TO_RELOAD = ['/mis-domicilios', '/kitchen'];

/**
 * Mantiene al día los equipos que dejan la página abierta todo el día (seguían con la versión vieja).
 * Revisa cada 2 minutos y al volver a la pestaña. Si hay versión nueva:
 * - en la pantalla del domiciliario o de cocina se recarga sola;
 * - en las demás, muestra un aviso con el botón "Actualizar" para no interrumpir a quien está escribiendo.
 */
export const UpdateNotifier = () => {
  const pending = useRef(false);
  const toasted = useRef(false);
  useEffect(() => {
    const current = mainScript(document.documentElement.innerHTML);
    if (!current) return; // modo desarrollo: no hay archivos con huella
    const isNew = async () => {
      try {
        const html = await (await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' })).text();
        const latest = mainScript(html);
        return Boolean(latest && latest !== current);
      } catch { return false; } // sin conexión: se revisa en la próxima vuelta
    };
    const check = async () => {
      if (!pending.current) pending.current = await isNew();
      if (!pending.current) return;
      if (SAFE_TO_RELOAD.some(p => window.location.pathname.startsWith(p))) { window.location.reload(); return; }
      if (!toasted.current) {
        toasted.current = true;
        toast('Hay una versión nueva del sistema', {
          description: 'Toca Actualizar para ver los últimos cambios (no se pierde nada de lo guardado).',
          duration: Infinity,
          action: { label: 'Actualizar', onClick: () => window.location.reload() },
        });
      }
    };
    const t = setInterval(check, 2 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return null;
};

export default UpdateNotifier;
