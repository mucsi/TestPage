/* Fixed destinations only: QR data never supplies a redirect target. */
(function () {
  const path = location.pathname;
  if (!path.startsWith('/c/')) return;
  const message = document.getElementById('message');
  const token = path.slice(3);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(token)) {
    message.textContent = 'This challenge link is incomplete. Please scan the original QR code again.';
    return;
  }
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!apple && !android) {
    message.textContent = 'Scan this QR with your phone to get Expo Quest. After installing, scan it again inside the app.';
    return;
  }
  message.textContent = 'Opening your app store… After installing Expo Quest, scan this QR again.';
  // Verified Universal/App Links are intercepted by the OS before this page loads.
  location.replace(apple ? 'https://apps.apple.com/app/id6809481571' :
    'https://play.google.com/store/apps/details?id=com.laserox.quest');
})();
