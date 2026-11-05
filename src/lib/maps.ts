/** Opens turn-by-turn directions in the native Maps app on Android (a Google Maps link in any browser). */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
