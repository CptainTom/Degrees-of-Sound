// regions.js — simple place names from coordinates (coordinate boxes, checked in order).
//
//   import { regionName } from './regions.js';
//   regionName(40, 23, 'el')  → 'Ελλάδα'
//   regionName(40, 23, 'en')  → 'Greece'
//
// Boxes are rough on purpose: good enough to know "where am I" with eyes closed.
// The FIRST box that matches wins, so small/specific places go before big ones.

// [latMin, latMax, lonMin, lonMax, English, Greek]
const BOXES = [
  [34, 42, 19, 29, 'Greece', 'Ελλάδα'],
  [36, 42, 29, 45, 'Turkey', 'Τουρκία'],
  [60, 84, -73, -12, 'Greenland', 'Γροιλανδία'],
  [-90, -62, -180, 180, 'Antarctica', 'Ανταρκτική'],
  [54, 72, -170, -130, 'Alaska', 'Αλάσκα'],
  [49, 75, -140, -55, 'Canada', 'Καναδάς'],
  [25, 49, -125, -67, 'United States', 'Ηνωμένες Πολιτείες'],
  [14, 25, -118, -86, 'Mexico', 'Μεξικό'],
  [7, 14, -92, -77, 'Central America', 'Κεντρική Αμερική'],
  [10, 25, -86, -60, 'Caribbean', 'Καραϊβική'],
  [-56, -20, -76, -48, 'southern South America', 'νότια Νότια Αμερική'],
  [-20, 12, -82, -35, 'Amazon and northern South America', 'Αμαζόνιος και βόρεια Νότια Αμερική'],
  [63, 67, -25, -13, 'Iceland', 'Ισλανδία'],
  [55, 72, 4, 32, 'Scandinavia', 'Σκανδιναβία'],
  [36, 72, -10, 40, 'Europe', 'Ευρώπη'],
  [12, 38, 35, 60, 'Middle East', 'Μέση Ανατολή'],
  [15, 36, -17, 35, 'Sahara', 'Σαχάρα'],
  [-5, 15, -17, 52, 'central Africa', 'κεντρική Αφρική'],
  [-26, -12, 43, 51, 'Madagascar', 'Μαδαγασκάρη'],
  [-35, -5, 10, 42, 'southern Africa', 'νότια Αφρική'],
  [45, 78, 40, 60, 'Russia', 'Ρωσία'],
  [50, 78, 60, 180, 'Siberia', 'Σιβηρία'],
  [35, 50, 46, 90, 'Central Asia', 'Κεντρική Ασία'],
  [6, 35, 60, 92, 'India', 'Ινδία'],
  [30, 46, 125, 146, 'Japan and Korea', 'Ιαπωνία και Κορέα'],
  [20, 50, 90, 125, 'East Asia', 'Ανατολική Ασία'],   // named by region, not country (hackathon rules)
  [-10, 20, 92, 140, 'Southeast Asia', 'Νοτιοανατολική Ασία'],
  [-40, -10, 112, 154, 'Australia', 'Αυστραλία'],
  [-48, -34, 165, 179, 'New Zealand', 'Νέα Ζηλανδία'],
  [30, 46, -6, 36, 'Mediterranean Sea', 'Μεσόγειος'],
];

// Everything not in a box is ocean.
function ocean(lat, lon) {
  if (lat >= 66) return ['Arctic Ocean', 'Αρκτικός Ωκεανός'];
  if (lat <= -45) return ['Southern Ocean', 'Νότιος Ωκεανός'];
  if (lon >= -70 && lon < 20) return lat >= 0 ? ['North Atlantic', 'Βόρειος Ατλαντικός'] : ['South Atlantic', 'Νότιος Ατλαντικός'];
  if (lon >= 20 && lon < 120 && lat < 30) return ['Indian Ocean', 'Ινδικός Ωκεανός'];
  return lat >= 0 ? ['North Pacific', 'Βόρειος Ειρηνικός'] : ['South Pacific', 'Νότιος Ειρηνικός'];
}

export function regionName(lat, lon, lang = 'en') {
  const b = BOXES.find(([a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);
  const [en, el] = b ? [b[4], b[5]] : ocean(lat, lon);
  return lang === 'el' ? el : en;
}
