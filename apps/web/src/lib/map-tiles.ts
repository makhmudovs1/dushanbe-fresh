export function mapTileConfiguration() {
  // Only the dedicated PUBLIC key may appear in a browser tile URL.
  const key = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_API_KEY;
  const style = process.env.NEXT_PUBLIC_GEOAPIFY_MAP_STYLE === "positron" ? "positron" : "osm-bright";
  return key ? {
    url: `https://maps.geoapify.com/v1/tile/${style}/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(key)}`,
    attribution: '&copy; <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  } : {
    url: process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  };
}
