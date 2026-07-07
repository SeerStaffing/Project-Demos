/* Camera presets for "fly to region" navigation.
 * altitude is globe.gl's camera distance (smaller = more zoomed in). */
window.REGIONS = [
  { id: 'world', name: 'World', lat: 20, lng: 10, altitude: 2.5 },
  { id: 'na', name: 'North America', lat: 44, lng: -100, altitude: 1.35 },
  { id: 'sa', name: 'South America', lat: -18, lng: -60, altitude: 1.45 },
  { id: 'eu', name: 'Europe', lat: 52, lng: 15, altitude: 0.95 },
  { id: 'af', name: 'Africa', lat: 3, lng: 21, altitude: 1.55 },
  { id: 'me', name: 'Middle East', lat: 28, lng: 45, altitude: 1.0 },
  { id: 'as', name: 'Asia', lat: 34, lng: 100, altitude: 1.6 },
  { id: 'oc', name: 'Oceania', lat: -25, lng: 140, altitude: 1.5 },
];
