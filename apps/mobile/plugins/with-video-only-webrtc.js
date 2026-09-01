const { AndroidConfig, withInfoPlist } = require("expo/config-plugins");

module.exports = function withVideoOnlyWebRtc(config) {
  config.ios = { ...config.ios, bitcode: false };
  config = withInfoPlist(config, (iosConfig) => {
    iosConfig.modResults.NSCameraUsageDescription ??= "Allow $(PRODUCT_NAME) to access your camera";
    iosConfig.modResults.NSMicrophoneUsageDescription ??= "Allow $(PRODUCT_NAME) to access your microphone for voice during video calls";
    return iosConfig;
  });

  return AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.INTERNET",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.WAKE_LOCK",
  ]);
};
