/* Atelier Lumière · U3.4 · taxonomía visual de oficios
 * Presentación únicamente: el tipo de taller sigue siendo texto libre y persistente.
 */
(() => {
  const families = Object.freeze([
    {
      key: 'CERAMICS',
      label: 'Cerámica · horno y patio',
      suggestions: ['Cerámica', 'Alfarería', 'Barro', 'Arcilla'],
      terms: ['ceramica', 'alfareria', 'barro', 'arcilla', 'pottery']
    },
    {
      key: 'TEXTILE',
      label: 'Textil · telar y pérgola',
      suggestions: ['Bordado', 'Textil', 'Costura', 'Tejido'],
      terms: ['bordado', 'textil', 'costura', 'tejido', 'telar', 'lana', 'hilo']
    },
    {
      key: 'JEWELRY',
      label: 'Joyería · atelier de luz',
      suggestions: ['Joyería', 'Orfebrería', 'Metal'],
      terms: ['joyeria', 'orfebreria', 'orfebre', 'metal', 'plateria']
    },
    {
      key: 'WOOD',
      label: 'Madera · patio de oficio',
      suggestions: ['Madera', 'Carpintería', 'Ebanistería'],
      terms: ['madera', 'carpinteria', 'ebanisteria', 'ebanista']
    },
    {
      key: 'FLORAL',
      label: 'Botánica · invernadero',
      suggestions: ['Floristería', 'Flores', 'Botánica'],
      terms: ['floristeria', 'flores', 'floral', 'botanica', 'jardin']
    },
    {
      key: 'PAPER',
      label: 'Papel · galería de secado',
      suggestions: ['Papelería', 'Encuadernación', 'Papel'],
      terms: ['papeleria', 'encuadernacion', 'papel', 'grabado', 'imprenta']
    },
    {
      key: 'CANDLE',
      label: 'Velas · taller de faroles',
      suggestions: ['Velas', 'Cera'],
      terms: ['vela', 'velas', 'cera', 'candela']
    },
    {
      key: 'LEATHER',
      label: 'Cuero · marquesina de trabajo',
      suggestions: ['Cuero', 'Marroquinería'],
      terms: ['cuero', 'marroquineria', 'piel']
    },
    {
      key: 'FAN',
      label: 'Abanicos · pabellón radial',
      suggestions: ['Abanicos'],
      terms: ['abanico', 'abanicos']
    },
    {
      key: 'GLASS',
      label: 'Vidrio · estudio luminoso',
      suggestions: ['Vidrio', 'Cristal', 'Vitral'],
      terms: ['vidrio', 'cristal', 'vitral', 'vidriera']
    }
  ]);

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function resolve(value) {
    const normalized = normalize(value);
    if (!normalized) return { key: 'NEUTRAL', label: 'Atelier neutro', matched: false };
    for (const family of families) {
      if (family.terms.some((term) => normalized.includes(term))) {
        return { key: family.key, label: family.label, matched: true };
      }
    }
    return { key: 'NEUTRAL', label: 'Atelier neutro', matched: false };
  }

  const suggestions = Object.freeze([...new Set(families.flatMap((family) => family.suggestions))]);

  window.AtelierCraftTaxonomy = Object.freeze({
    families,
    suggestions,
    normalize,
    resolve
  });
})();
