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
  kind: "HOME" | "LIVE" | "RECOMMENDED";
}

export interface MapDisplayRoute {
  id: string;
  color?: string;
  dashed?: boolean;
  points: Array<Pick<AddressSelection, "latitude" | "longitude">>;
}
