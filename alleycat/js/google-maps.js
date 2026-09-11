// Four destinations per link: three intermediate waypoints plus the finish.
// Adjacent batches share an endpoint, preserving every leg of the solved route.
function googleMapsBatches(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) return [];
  const coord = p => `${p.lat},${p.lon}`;
  const batches = [];
  for (let start = 0; start < points.length - 1; start += 4) {
    const end = Math.min(start + 4, points.length - 1);
    const stops = points.slice(start + 1, end + 1);
    const params = new URLSearchParams({
      api: "1", origin: coord(points[start]), destination: coord(points[end]), travelmode: "bicycling",
    });
    if (stops.length > 1) params.set("waypoints", stops.slice(0, -1).map(coord).join("|"));
    batches.push({ url: `https://www.google.com/maps/dir/?${params}`, start, end, stops });
  }
  return batches;
}
