import { useEffect, useState } from "react";

/**
 * Raremedia banner — "Always offering productive digital tools that transform hard work into simple."
 *
 * A slim strip that sits in the normal page flow (no fixed positioning, so it never fights
 * sidebars, sticky headers or modals). It carries its own styles, so it looks the same in every
 * Raremedia product whatever CSS framework the product uses. The close button hides it for the
 * rest of the browser session; it comes back on the next visit. Hidden when printing.
 */

const STORAGE_KEY = "raremedia-banner-hidden";
const SITE_URL = "https://www.raremedia.com";
const SLOGAN = "Always offering productive digital tools that transform hard work into simple.";

const CSS = `
.rm-banner{position:relative;z-index:1;display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-height:42px;margin:0;padding:7px 16px;background:linear-gradient(90deg,#0c0a1d 0%,#1e1b4b 55%,#312e81 100%);color:#fff;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.35;text-align:left;border-bottom:1px solid rgba(255,255,255,.14);box-shadow:inset 0 2px 0 0 #22d3ee}
.rm-banner *{box-sizing:border-box}
.rm-banner--rounded{border-radius:12px;border:0;margin:14px 0}
.rm-banner__mark{flex:none;display:block;width:26px;height:26px;border-radius:7px}
.rm-banner__copy{display:flex;flex:1 1 auto;min-width:0;flex-wrap:wrap;align-items:baseline;gap:2px 10px}
.rm-banner__name{color:#fff;font-weight:800;font-size:12px;letter-spacing:.14em;text-decoration:none;white-space:nowrap}
.rm-banner__name:hover{color:#a5f3fc;text-decoration:none}
.rm-banner__text{margin:0;color:#e0e7ff;font-weight:500}
.rm-banner__cta{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border:0;border-radius:999px;background:#22d3ee;color:#0c0a1d;font-weight:700;font-size:12px;line-height:1;text-decoration:none;white-space:nowrap;transition:background .15s ease,transform .15s ease}
.rm-banner__cta:hover{background:#67e8f9;color:#0c0a1d;text-decoration:none;transform:translateY(-1px)}
.rm-banner__cta svg{width:14px;height:14px}
.rm-banner__close{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;margin:0 -6px 0 0;padding:0;border:0;border-radius:999px;background:transparent;color:#c7d2fe;cursor:pointer;transition:background .15s ease,color .15s ease}
.rm-banner__close:hover{background:rgba(255,255,255,.14);color:#fff}
.rm-banner__close svg{width:14px;height:14px}
@media (max-width:640px){.rm-banner{gap:10px;padding:7px 12px}.rm-banner__copy{flex-direction:column;gap:1px}.rm-banner__text{font-size:11.5px;line-height:1.3}.rm-banner__cta{width:30px;height:30px;padding:0;justify-content:center}.rm-banner__cta-label{display:none}}
@media print{.rm-banner{display:none!important}}
`;

function isHidden(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode or storage blocked: the banner simply returns on the next page */
  }
}

export function RaremediaBanner({ className }: { className?: string } = {}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isHidden()) setHidden(true);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    remember();
    setHidden(true);
  };

  return (
    <aside className={className ? `rm-banner ${className}` : "rm-banner"} role="complementary" aria-label="Raremedia">
      <style>{CSS}</style>
      <svg className="rm-banner__mark" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="rmBannerMark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#rmBannerMark)" />
        <text x="16" y="21" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontWeight="800" fontSize="13" fill="#0c0a1d">
          RM
        </text>
      </svg>
      <div className="rm-banner__copy">
        <a className="rm-banner__name" href={SITE_URL} target="_blank" rel="noopener noreferrer">
          RAREMEDIA
        </a>
        <span className="rm-banner__text">{SLOGAN}</span>
      </div>
      <a className="rm-banner__cta" href={SITE_URL} target="_blank" rel="noopener noreferrer" title="Discover Raremedia digital tools">
        <span className="rm-banner__cta-label">Discover our tools</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </a>
      <button type="button" className="rm-banner__close" aria-label="Hide the Raremedia banner for this session" onClick={dismiss}>
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </aside>
  );
}

export default RaremediaBanner;
