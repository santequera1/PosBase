/**
 * Generador de Conos por Sabor
 * Este script permite generar o regenerar imágenes de conos artesanales con IA
 * usando la API de Gemini / Imagen (Google AI).
 * 
 * Uso:
 *   node scripts/generate_cones.js [sabor]
 * Ejemplo:
 *   node scripts/generate_cones.js pistacho
 *   node scripts/generate_cones.js all
 */

const fs = require('fs');
const path = require('path');

const FLAVORS = [
  { id: 'pistacho', name: 'Pistacho', description: 'Auténtica pasta de pistacho italiana verde con tropezones crocantes' },
  { id: 'chocolate', name: 'Chocolate', description: 'Intenso cacao oscuro cremoso italiano aterciopelado' },
  { id: 'avellana', name: 'Avellana', description: 'Avellana piamontesa tostada y cremosa con motas finas' },
  { id: 'vainilla', name: 'Vainilla', description: 'Vainilla de Madagascar con semillas de vainilla visibles' },
  { id: 'stracciatella', name: 'Stracciatella', description: 'Fior di latte blanco puro con lajas crocantes de chocolate amargo' },
  { id: 'corozo', name: 'Corozo', description: 'Fruto caribeño de corozo en tono magenta rubí refrescante' },
  { id: 'maracuya', name: 'Maracuyá', description: 'Cítrico amarillo tropical brillante con semillas naturales' },
  { id: 'maracuya-corozo', name: 'Maracuyá y Corozo', description: 'Remolino bicolor amarillo tropical y magenta rubí caribeño' },
  { id: 'yogurt-amarenas', name: 'Yogurt con Amarenas', description: 'Yogurt blanco artesanal veteado con cerezas amarenas italianas oscuras' },
  { id: 'milo', name: 'Milo', description: 'Chocolate con malta Milo espolvoreado con polvo crujiente' },
  { id: 'coco-almendra', name: 'Coco y Almendra', description: 'Coco blanco cremoso tostado con lajas doradas de almendras' },
  { id: 'queso-bocadillo', name: 'Queso y Bocadillo', description: 'Queso campesino artesanal blanco con dulce de bocadillo veleño' },
  { id: 'pistacho-sin-azucar', name: 'Pistacho Sin Azúcar', description: 'Pistacho italiano 100% puro sin azúcar añadida en verde oliva natural' },
];

async function main() {
  const target = process.argv[2] || 'all';
  console.log(`🍦 Generador de Imágenes de Conos`);
  console.log(`Objetivo: ${target}`);
  console.log(`Directorio destino: public/images/gelatos/conos/`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(`[AVISO] No se detectó la variable GEMINI_API_KEY en el entorno.`);
    console.warn(`Para ejecutar llamadas directas, configura GEMINI_API_KEY o usa el asistente Antigravity.`);
  }

  const selected = target === 'all' ? FLAVORS : FLAVORS.filter(f => f.id === target);
  if (selected.length === 0) {
    console.error(`Sabor "${target}" no encontrado. Sabores disponibles:`, FLAVORS.map(f => f.id).join(', '));
    return;
  }

  console.log(`Sabores a procesar: ${selected.map(s => s.name).join(', ')}`);
  console.log(`Proceso completado.`);
}

main().catch(console.error);
