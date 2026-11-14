// places.js — countries, regions and oceans you can search for. Coordinates are an approximate centre of each country
// (rounded to whole degrees), so they work the same in every year.
// To add one: { name, lat, lon, aliases: ['other names people might type'] }

export const PLACES = [
  { name: 'Whole world', lat: 20, lon: 0, world: true, aliases: ['world', 'earth', 'globe', 'zoom out'] },
  { name: 'Greece', lat: 39, lon: 22, aliases: ['ellada', 'hellas', 'ελλάδα', 'ελλαδα'] },
  { name: 'United States', lat: 39, lon: -98, aliases: ['usa', 'us', 'america', 'united states of america'] },
  { name: 'Canada', lat: 56, lon: -106, aliases: [] },
  { name: 'France', lat: 46, lon: 2, aliases: [] },
  { name: 'Germany', lat: 51, lon: 10, aliases: ['deutschland'] },
  { name: 'Kenya', lat: 0, lon: 38, aliases: [] },
  { name: 'Japan', lat: 36, lon: 138, aliases: ['nippon'] },
  { name: 'United Kingdom', lat: 54, lon: -2, aliases: ['uk', 'britain', 'great britain', 'england'] },
  { name: 'Italy', lat: 42, lon: 12, aliases: ['italia'] },
  { name: 'Spain', lat: 40, lon: -4, aliases: ['espana', 'españa'] },
  { name: 'Norway', lat: 64, lon: 12, aliases: ['norge'] },
  { name: 'Greenland', lat: 72, lon: -40, aliases: ['kalaallit nunaat'] },
  { name: 'Russia', lat: 62, lon: 95, aliases: [] },
  { name: 'India', lat: 22, lon: 79, aliases: ['bharat'] },
  { name: 'Australia', lat: -25, lon: 134, aliases: [] },
  { name: 'Brazil', lat: -10, lon: -52, aliases: ['brasil'] },
  { name: 'Argentina', lat: -36, lon: -65, aliases: [] },
  { name: 'Mexico', lat: 23, lon: -102, aliases: ['méxico'] },
  // regions and oceans (searchable too)
  { name: 'Arctic', lat: 80, lon: 0, region: true, aliases: ['arctic ocean', 'north pole'] },
  { name: 'Antarctica', lat: -80, lon: 0, region: true, aliases: ['south pole'] },
  { name: 'Siberia', lat: 64, lon: 110, region: true, aliases: [] },
  { name: 'Alaska', lat: 64, lon: -150, region: true, aliases: [] },
  { name: 'Sahara', lat: 23, lon: 10, region: true, aliases: ['sahara desert'] },
  { name: 'Amazon', lat: -4, lon: -62, region: true, aliases: ['amazon rainforest'] },
  { name: 'Mediterranean Sea', lat: 36, lon: 18, region: true, aliases: ['mediterranean'] },
  { name: 'Middle East', lat: 28, lon: 45, region: true, aliases: [] },
  { name: 'Southeast Asia', lat: 5, lon: 112, region: true, aliases: [] },
  { name: 'North Atlantic', lat: 40, lon: -40, region: true, aliases: ['atlantic'] },
  { name: 'South Atlantic', lat: -25, lon: -15, region: true, aliases: [] },
  { name: 'North Pacific', lat: 30, lon: -160, region: true, aliases: ['pacific'] },
  { name: 'South Pacific', lat: -25, lon: -130, region: true, aliases: [] },
  { name: 'Indian Ocean', lat: -15, lon: 75, region: true, aliases: [] },
  { name: 'Southern Ocean', lat: -60, lon: 0, region: true, aliases: [] },
];

const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // strip accents

// all matches for what the user typed, best first: exact name/alias, then "starts with", then "contains"
export function searchPlaces(text, limit = 6) {
  const q = norm(text);
  if (!q) return [];
  const names = p => [p.name, ...p.aliases].map(norm);
  const rank = p => names(p).includes(q) ? 0 : names(p).some(n => n.startsWith(q)) ? 1 : names(p).some(n => n.includes(q)) ? 2 : 9;
  return PLACES.map(p => ({ p, r: rank(p) })).filter(x => x.r < 9).sort((a, b) => a.r - b.r).slice(0, limit).map(x => x.p);
}
export const findPlace = text => searchPlaces(text, 1)[0] ?? null;

// the place the cursor is exactly on, if any (used to say "Greece" instead of coordinates)
export const placeAt = (lat, lon) => PLACES.find(p => !p.world && p.lat === lat && p.lon === lon) || null;
