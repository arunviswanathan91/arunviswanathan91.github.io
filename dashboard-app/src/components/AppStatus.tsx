import { Download, RefreshCw, WifiOff } from "lucide-react";
import { isInstalled, isIos, useInstall, useOnline, useUpdateReady } from "../lib/appShell";

/** Shown above every page: working offline, and a newer release waiting for a reload. */
export function AppStatus() {
  const online = useOnline();
  const update = useUpdateReady();
  return <>
    {!online && <p className="data-notice app-status" role="status"><span><WifiOff aria-hidden /> Offline. Pages you have opened before show what they last held; changes cannot be saved until the connection is back.</span></p>}
    {update && online && <p className="data-notice app-status" role="status">
      <span><RefreshCw aria-hidden /> A new version of the workspace is available.</span>
      <button className="chip-button" onClick={() => window.location.reload()}>Reload</button>
    </p>}
  </>;
}

/** Settings: how to put the workspace on the home screen. Says so when it already is. */
export function InstallPanel() {
  const { canPrompt, install } = useInstall();
  return <section className="panel">
    <header className="panel-head"><h2>App</h2></header>
    {isInstalled()
      ? <p className="muted">This is the installed app. It updates itself when a new version is released.</p>
      : canPrompt
        ? <><p className="muted">Install the workspace on this device to open it from its own icon, full screen.</p>
          <p><button className="chip-button" onClick={() => void install()}><Download aria-hidden /> Install app</button></p></>
        : isIos()
          ? <p className="muted">To install on iPhone or iPad: open this page in Safari, tap Share, then “Add to Home Screen”.</p>
          : <p className="muted">To install: open this page in Chrome or Edge and choose “Install app” (or “Add to Home screen”) from the browser menu.</p>}
  </section>;
}
