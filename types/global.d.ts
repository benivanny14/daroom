declare global {
  namespace google.maps {
    interface MapOptions {
      center: { lat: number; lng: number };
      zoom: number;
      styles?: {
        featureType: string;
        elementType: string;
        stylers: { visibility: string }[];
      }[];
    }

    interface MarkerOptions {
      position: { lat: number; lng: number };
      map: Map;
      title: string;
    }

    interface InfoWindowOptions {
      content: HTMLElement;
    }

    class Map {
      constructor(element: HTMLElement, options: MapOptions);
    }

    class Marker {
      constructor(options: MarkerOptions);
      addListener(event: string, handler: () => void): void;
    }

    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(options: { map: Map; anchor: Marker }): void;
    }
  }

  interface Window {
    google?: {
      maps: {
        Map: typeof google.maps.Map;
        Marker: typeof google.maps.Marker;
        InfoWindow: typeof google.maps.InfoWindow;
      };
    };
    initMap?: () => void;
  }
}

export {};
