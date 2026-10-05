/**
 * "Are we online?" without a NetInfo native module: a tiny hint kept by the app's own network calls (config fetch, ad loads).
 * Starts optimistic (true); ads that cannot load simply render nothing, so a wrong guess costs nothing.
 */
let online = true;
export const isOnlineHint = () => online;
export const markOnline = (v: boolean) => {
  online = v;
};
