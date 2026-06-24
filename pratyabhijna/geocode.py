import logging
from geopy.geocoders import Nominatim

logger = logging.getLogger(__name__)

# In-memory geocode cache with pre-defined local mappings
_GEOCODE_CACHE = {
    "kathmandu, nepal": {
        "place": "Kathmandu, Nepal",
        "latitude": 27.7172,
        "longitude": 85.3240
    },
    "wichita, kansas": {
        "place": "Wichita, Kansas",
        "latitude": 37.6872,
        "longitude": -97.3301
    },
    "ujjain, india": {
        "place": "Ujjain, India",
        "latitude": 23.1760,
        "longitude": 75.7885
    }
}

def geocode_place(place_name: str) -> dict:
    """
    Geocodes a place name to latitude and longitude.
    First checks local dictionary, then uses geopy Nominatim.
    Returns:
        dict: {"place": str, "latitude": float, "longitude": float} or None
    """
    if not place_name:
        return None
    
    place_key = place_name.strip().lower()
    
    # Try local cache/known mappings first
    for key, value in _GEOCODE_CACHE.items():
        if key == place_key or place_key.startswith(key) or key.startswith(place_key):
            logger.info(f"Geocode cache hit for: {place_name} -> {value['place']}")
            return value
            
    try:
        logger.info(f"Geocoding via Nominatim: {place_name}")
        geolocator = Nominatim(user_agent="pratyabhijna_observatory")
        location = geolocator.geocode(place_name, timeout=10)
        if location:
            result = {
                "place": location.address,
                "latitude": location.latitude,
                "longitude": location.longitude
            }
            # Cache the result
            _GEOCODE_CACHE[place_key] = result
            return result
    except Exception as e:
        logger.error(f"Geocoding error for {place_name}: {e}")
        
    return None
