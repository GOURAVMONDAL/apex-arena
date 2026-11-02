import './loading.css';

const carArt = `<svg class="boot-car" viewBox="0 0 600 380" aria-hidden="true"><defs><linearGradient id="boot-paint" x2=".5" y2="1"><stop stop-color="#e8ff99"/><stop offset="1" stop-color="#799526"/></linearGradient><linearGradient id="boot-dark" y2="1"><stop stop-color="#465441"/><stop offset="1" stop-color="#101710"/></linearGradient></defs><ellipse cx="300" cy="306" rx="199" ry="27" fill="#000" opacity=".45"/><g class="boot-car-body"><g fill="#111710" stroke="#64724e" stroke-width="3"><path d="m151 203-30 20v48l35 21 35-20v-49z"/><path d="m392 230-30 20v48l35 21 35-20v-49z"/><path d="m384 113-30 20v48l35 21 35-20v-49z"/></g><path d="m127 192 158-102 176 99-158 111z" fill="url(#boot-paint)"/><path d="m127 192 176 108v30L127 222z" fill="#7d962e"/><path d="m303 300 158-111v31L303 330z" fill="#b8d64b"/><path d="m220 153 64-41 91 50-62 45z" fill="#152016"/><path d="m225 154 11-46 61-35 68 38 10 51-62 45z" fill="url(#boot-dark)"/><path d="m238 112 59-33 56 32-54 36z" fill="#7b8d61"/><path d="m299 147 54-36 7 42-55 36z" fill="#263629"/><path d="m245 178 25-16 140 81-26 18z" fill="#172016"/><path d="m283 201 13-9 139 80-13 10z" fill="#f4f8d7" opacity=".7"/><path d="m153 191 25-16 31 18-25 17z" fill="#f5ffd1"/><path d="m244 246 25-17 31 18-25 17z" fill="#f5ffd1"/><path d="m124 174 67-43 16 9-67 43z" fill="#252f20"/><path d="m130 168 5-13 73-45 2 17z" fill="#a9c14b"/><g fill="#101710" stroke="#64724e" stroke-width="3"><path d="m305 266-30 20v48l35 21 35-20v-49z"/><path d="m447 169-30 20v48l35 21 35-20v-49z"/></g><g fill="#9bb849"><ellipse cx="312" cy="314" rx="14" ry="22"/><ellipse cx="454" cy="217" rx="14" ry="22"/></g><path d="m164 223 20 12v10l-20-12zm81 49 20 12v10l-20-12z" fill="#e5ff9f"/></g></svg>`;

/** Progress follows actual initialization milestones supplied by the application. */
export function createLoader() {
  const started = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let root = document.getElementById('boot-loader');
  if (!root) { root = document.createElement('section'); root.id = 'boot-loader'; document.body.append(root); }
  root.className = 'boot-loader'; root.setAttribute('aria-label', 'Loading APEX Arena');
  root.innerHTML = `<div class="boot-haze boot-haze-a"></div><div class="boot-haze boot-haze-b"></div><header class="boot-header"><span class="boot-brand">APEX<span>ARENA.</span></span><span class="boot-edition">FULL CONTACT / NO FINISH LINE<br>ORIGINAL ARCADE DRIVING EXPERIENCE</span></header><div class="boot-main"><div class="boot-art"><div class="boot-orbit"></div><div class="boot-grid"></div>${carArt}<span class="boot-coordinate">VEHICLE SYSTEM / 001</span><span class="boot-coordinate boot-coordinate-right">READY TO BREAK ↗</span></div><div class="boot-copy"><span class="boot-kicker">A LITTLE DRIVING. A LOT OF DESTRUCTION.</span><h1>CHAOS IS<br><em>LOADING.</em></h1><div class="boot-progress-row"><span class="boot-stage" role="status" aria-live="polite">WARMING UP THE ENGINE</span><span class="boot-number"><b data-boot-percent>0</b><small>%</small></span></div><div class="boot-meter" role="progressbar" aria-label="Game loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="boot-checks"><span data-boot-check="25">01 / MACHINE</span><span data-boot-check="60">02 / PLAYGROUND</span><span data-boot-check="100">03 / LET LOOSE</span></div><div class="boot-error" hidden><p></p><button type="button">RETRY ENGINE ↗</button></div></div></div><footer class="boot-footer"><span>DRIFT. BOOST. BREAK EVERYTHING.</span><span>BUILT FOR YOUR BROWSER <b>↗</b></span></footer>`;
  const percent = root.querySelector('[data-boot-percent]'), meter = root.querySelector('.boot-meter'), fill = meter.firstElementChild, label = root.querySelector('.boot-stage');
  let value = 0, settled = false;
  const setProgress = (next, text) => {
    if (settled) return;
    value = Math.max(value, Math.min(100, Number(next) || 0));
    percent.textContent = String(Math.round(value)).padStart(2, '0'); meter.setAttribute('aria-valuenow', String(Math.round(value))); fill.style.width = `${value}%`;
    root.style.setProperty('--boot-progress', value / 100);
    if (text) label.textContent = text;
    root.querySelectorAll('[data-boot-check]').forEach(check => check.classList.toggle('is-ready', value >= Number(check.dataset.bootCheck)));
  };
  return {
    setProgress,
    async finish() {
      if (settled) return;
      setProgress(100, 'ENGINE READY. MAKE SOME TROUBLE.'); settled = true;
      const remaining = Math.max(0, (reduced ? 0 : 900) - (performance.now() - started));
      if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
      root.classList.add('boot-complete');
      if (!reduced) await new Promise(resolve => setTimeout(resolve, 450));
      root.remove();
    },
    fail(message = 'The engine could not start. Reload to try again.') {
      if (settled) return;
      settled = true; root.classList.add('boot-failed'); label.textContent = 'ENGINE CHECK REQUIRED';
      const error = root.querySelector('.boot-error'); error.hidden = false; error.querySelector('p').textContent = message;
      error.querySelector('button').addEventListener('click', () => location.reload());
    },
  };
}
