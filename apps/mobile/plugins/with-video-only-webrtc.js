const { AndroidConfig, withInfoPlist } = require("expo/config-plugins");

module.exports = function withVideoOnlyWebRtc(config) {
  config.ios = { ...config.ios, bitcode: false };
  config = withInfoPlist(config, (iosConfig) => {
    iosConfig.modResults.NSCameraUsageDescription ??= "Allow $(PRODUCT_NAME) to access your camera";
    delete iosConfig.modResults.NSMicrophoneUsageDescription;
    return iosConfig;
  });

  return AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CAMERA",
    "android.permission.INTERNET",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.WAKE_LOCK",
  ]);
};
