export interface AddressSelection {
  address: string;
  latitude: number;
  longitude: number;
}

export interface AddressCandidate extends AddressSelection {
  title: string;
}

export interface MapDisplayMarker extends AddressSelection {
  id: string;
  label: string;
  kind: "HOME" | "LIVE" | "PLACE";
}
