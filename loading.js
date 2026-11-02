import './loading.css';

const referenceArt = new URL('./assets/racing-reference.png', import.meta.url).href;

/** Real initialization milestones, followed by a user-controlled cinematic title screen. */
export function createLoader() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let root = document.getElementById('boot-loader');
  if (!root) { root = document.createElement('section'); root.id = 'boot-loader'; document.body.append(root); }
  root.className = 'boot-loader';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'APEX Arena cinematic start screen');
  root.tabIndex = -1;
  root.innerHTML = `<div class="boot-picture" aria-hidden="true"><img class="boot-art-photo" src="${referenceArt}" alt="" decoding="async" fetchpriority="high" /><div class="boot-light"></div></div><div class="boot-vignette" aria-hidden="true"></div><div class="boot-atmosphere" aria-hidden="true"><i class="boot-smoke boot-smoke-left"></i><i class="boot-smoke boot-smoke-right"></i><i class="boot-smoke boot-smoke-front"></i>${Array.from({length:12},(_,i)=>`<i class="boot-spark" style="--spark:${i};--spark-x:${4+(i*29)%91}%;--spark-delay:${-(i*.63)}s"></i>`).join('')}</div><header class="boot-header"><span class="boot-brand">APEX <b>ARENA</b></span><button class="boot-skip" type="button">Skip animation <span aria-hidden="true">↗</span></button></header><div class="boot-launch"><p class="boot-caption">TWO RACERS. ONE ARENA. ALL OUT.</p><button class="boot-start" type="button" disabled><span>STARTING ENGINES</span><b aria-hidden="true">↗</b></button><div class="boot-progress"><div class="boot-progress-row"><span class="boot-stage" role="status" aria-live="polite">WARMING UP THE ENGINE</span><span class="boot-number"><b data-boot-percent>0</b>%</span></div><div class="boot-meter" role="progressbar" aria-label="Game loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div><p class="boot-input-hint">KEYBOARD · TOUCH · GAMEPAD</p><div class="boot-error" hidden><p></p><button type="button">RETRY ENGINE ↗</button></div></div><footer class="boot-footer"><span>DRIFT. BOOST. BREAK EVERYTHING.</span><span>BUILT TO RACE <b>✦</b></span></footer>`;

  const image = root.querySelector('.boot-art-photo');
  const percent = root.querySelector('[data-boot-percent]');
  const meter = root.querySelector('.boot-meter');
  const fill = meter.firstElementChild;
  const label = root.querySelector('.boot-stage');
  const start = root.querySelector('.boot-start');
  const skip = root.querySelector('.boot-skip');
  let value = 0, ready = false, failed = false, open = true, closing = false;
  let resolveDismissal;
  let dismissed = new Promise(resolve => { resolveDismissal = resolve; });
  const imageReady = image.decode ? image.decode() : new Promise((resolve,reject) => {
    if (image.complete) { image.naturalWidth ? resolve() : reject(new Error('Title artwork failed to load')); return; }
    image.addEventListener('load',resolve,{once:true}); image.addEventListener('error',reject,{once:true});
  });
  imageReady.catch(() => {});

  const setProgress = (next, text) => {
    if (ready || failed) return;
    value = Math.max(value, Math.min(100, Number(next) || 0));
    percent.textContent = String(Math.round(value)).padStart(2,'0');
    meter.setAttribute('aria-valuenow',String(Math.round(value)));
    fill.style.width = `${value}%`;
    if (text) label.textContent = text;
  };
  const stopMotion = () => { root.classList.add('boot-still'); skip.hidden = true; };
  skip.addEventListener('click', stopMotion);
  if (reduced) stopMotion();

  async function dismiss() {
    if (!ready || failed || closing || !open) return;
    closing = true;
    // Keep gameplay gated until the fade is over; this click cannot start a race.
    root.classList.add('boot-complete');
    if (!reduced) await new Promise(resolve => setTimeout(resolve,420));
    root.hidden = true; open = false; closing = false;
    resolveDismissal();
  }
  start.addEventListener('click', dismiss);
  root.addEventListener('keydown', event => {
    if (event.code === 'Enter' && ready) { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); stopMotion(); }
    if (event.code === 'Tab') {
      const focusable = [...root.querySelectorAll('button:not([disabled])')].filter(button=>!button.hidden&&!button.closest('[hidden]'));
      const first = focusable[0], last = focusable.at(-1);
      if(event.shiftKey && (document.activeElement===first || document.activeElement===root)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  root.focus({preventScroll:true});

  function fail(message = 'The engine could not start. Reload to try again.') {
    if (failed || ready) return;
    failed = true; root.classList.add('boot-failed','boot-still');
    label.textContent = 'ENGINE CHECK REQUIRED'; start.hidden = true;
    const error = root.querySelector('.boot-error'); error.hidden = false; error.querySelector('p').textContent = message;
    error.querySelector('button').addEventListener('click',()=>location.reload(),{once:true});
  }

  return {
    setProgress,
    isOpen: () => open,
    async finish() {
      if (failed) return;
      if (!ready) {
        try { await imageReady; } catch { fail('The title artwork could not load. Check your connection and reload.'); return; }
        setProgress(100,'ENGINE READY · YOUR NEXT RACE STARTS HERE');
        ready = true; start.disabled = false;
        start.querySelector('span').textContent = 'ENTER GARAGE';
        root.classList.add('boot-ready');
      }
      return dismissed;
    },
    open() {
      if (open) return dismissed;
      open = true; root.hidden = false; root.classList.remove('boot-complete');
      dismissed = new Promise(resolve => { resolveDismissal = resolve; });
      start.focus({preventScroll:true});
      return dismissed;
    },
    fail,
  };
}
