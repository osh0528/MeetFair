import AsyncStorage from "@react-native-async-storage/async-storage";

const POKE_SOUND_KEY = "meetfair.poke-sound-enabled";

export async function isPokeSoundEnabled() {
  return await AsyncStorage.getItem(POKE_SOUND_KEY) !== "false";
}

export async function setPokeSoundEnabled(enabled: boolean) {
  await AsyncStorage.setItem(POKE_SOUND_KEY, String(enabled));
}
