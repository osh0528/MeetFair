export interface AddressSelection {
  address: string;
  latitude: number;
  longitude: number;
}

export interface AddressCandidate extends AddressSelection {
  title: string;
}
