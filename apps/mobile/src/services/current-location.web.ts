export interface CurrentCoordinates {
  latitude: number;
  longitude: number;
}

export async function getCurrentCoordinates(): Promise<CurrentCoordinates> {
  if (!navigator.geolocation) throw new Error("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(new Error(error.message || "현재 위치를 확인하지 못했습니다.")),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
