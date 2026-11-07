/* Public, non-secret Tencent IM settings.
 * Only enable after real IM + CloudBase auth tests on domestic networks.
 * NEVER put IM_SECRET_KEY or IM_SESSION_SECRET here.
 */
window.MMJJ_CN_CONFIG = Object.freeze({
  enabled: false,
  sdkAppID: 1600171481, // public identifier; cloud login service still required
  authEndpoint: ''
});
