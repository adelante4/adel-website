// Offline use and install: registers the service worker, offers "save all sounds", the install button,
// and keeps the screen awake while the metronome plays.
const TAG = new URL(import.meta.url).searchParams.get("v") || "dev";

let lock = null;
let wanted = false;

async function acquire() {
  try {
    if (!("wakeLock" in navigator) || lock) return;
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => (lock = null));
  } catch {
    lock = null; // refused (battery saver, hidden tab): the music still plays
  }
}

/** Keep the screen on while playing, so a phone on a music stand does not go dark. */
export function holdScreen() {
  wanted = true;
  acquire();
}
export function releaseScreen() {
  wanted = false;
  try {
    lock?.release();
  } catch {}
  lock = null;
}
document.addEventListener("visibilitychange", () => {
  if (wanted && document.visibilityState === "visible") acquire();
});

const mb = (n) => `${Math.round(n / 1e6)} MB`;

export function initOffline() {
  const root = document.getElementById("offline");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const status = $("offline-status");
  const save = $("offline-save");
  const bar = $("offline-progress");
  const install = $("offline-install");
  const hint = $("offline-hint");

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) hint.textContent = "You are using the installed app.";
  else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) hint.textContent = "To install on iPhone: tap Share, then Add to Home Screen.";

  if (!("serviceWorker" in navigator)) {
    status.textContent = "This browser cannot save the metronome for offline use.";
    save.hidden = true;
    return;
  }

  let worker = null;
  const ask = (type) => (worker || navigator.serviceWorker.controller)?.postMessage({ type });

  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "progress") {
      bar.hidden = false;
      bar.max = m.total;
      bar.value = m.done;
      status.textContent = `Saving sounds: ${m.done} of ${m.total} files.`;
    } else if (m.type === "status" || m.type === "saved") {
      bar.hidden = true;
      save.disabled = false;
      if (m.have === m.total && m.total > 0) {
        status.textContent = `All ${mb(m.totalBytes)} of sounds are saved. The metronome works with no connection.`;
        save.hidden = true;
      } else {
        save.hidden = false;
        save.textContent = `Save all sounds for offline (${mb(m.totalBytes - m.bytes)})`;
        status.textContent = m.have
          ? `The app is saved. ${m.have} of ${m.total} sound files are saved; the rest download when you first use them.`
          : "The app is saved. Sounds you have used work offline; save the rest to use any sound with no connection.";
      }
    } else if (m.type === "error") {
      bar.hidden = true;
      save.disabled = false;
      status.textContent = `Saving stopped: ${m.message}. Try again with a connection.`;
    }
  });

  save.addEventListener("click", () => {
    save.disabled = true;
    status.textContent = "Saving sounds...";
    ask("save-audio");
  });

  let prompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e;
    install.hidden = false;
  });
  install.addEventListener("click", async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice.catch(() => {});
    prompt = null;
    install.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    install.hidden = true;
    hint.textContent = "Installed. Open it from your home screen or app list.";
  });

  navigator.serviceWorker
    .register(`sw.js?v=${TAG}`)
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => {
      worker = reg.active;
      status.textContent = "The app is saved on this device. It opens with no connection.";
      ask("status");
    })
    .catch(() => {
      status.textContent = "Could not set up offline use here (it needs https or localhost).";
      save.hidden = true;
    });
}
