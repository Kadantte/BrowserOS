import type { Browser } from '@browseros/server/browser'

const CROSSHAIR_ID = '__browseros_showcase_crosshair__'

export async function injectCrosshair(
  browser: Browser,
  pageId: number,
  coords: { x: number; y: number },
  toolName: string,
): Promise<void> {
  const x = Math.round(coords.x)
  const y = Math.round(coords.y)
  const label = toolName.replace(/_/g, ' ')
  const labelWidth = Math.round(label.length * 9 + 24)
  const labelX = x + 32
  const labelY = y - 32

  await browser.evaluate(
    pageId,
    `(() => {
      const existing = document.getElementById('${CROSSHAIR_ID}');
      if (existing) existing.remove();

      const el = document.createElement('div');
      el.id = '${CROSSHAIR_ID}';
      el.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647';
      el.innerHTML = '<svg style="position:absolute;top:0;left:0;width:100%;height:100%" xmlns="http://www.w3.org/2000/svg">'
        + '<defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
        + '<circle cx="${x}" cy="${y}" r="28" fill="rgba(255,59,48,0.12)" stroke="none"/>'
        + '<line x1="${x - 40}" y1="${y}" x2="${x - 12}" y2="${y}" stroke="#FF3B30" stroke-width="3" filter="url(#glow)"/>'
        + '<line x1="${x + 12}" y1="${y}" x2="${x + 40}" y2="${y}" stroke="#FF3B30" stroke-width="3" filter="url(#glow)"/>'
        + '<line x1="${x}" y1="${y - 40}" x2="${x}" y2="${y - 12}" stroke="#FF3B30" stroke-width="3" filter="url(#glow)"/>'
        + '<line x1="${x}" y1="${y + 12}" x2="${x}" y2="${y + 40}" stroke="#FF3B30" stroke-width="3" filter="url(#glow)"/>'
        + '<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#FF3B30" stroke-width="3" filter="url(#glow)"/>'
        + '<circle cx="${x}" cy="${y}" r="4" fill="#FF3B30"/>'
        + '<rect x="${labelX}" y="${labelY}" rx="6" ry="6" width="${labelWidth}" height="28" fill="rgba(0,0,0,0.85)"/>'
        + '<text x="${labelX + 12}" y="${labelY + 19}" font-family="system-ui,-apple-system,sans-serif" font-size="14" fill="white" font-weight="600">${label}</text>'
        + '</svg>';
      document.body.appendChild(el);
    })()`,
  )
}

export async function removeCrosshair(
  browser: Browser,
  pageId: number,
): Promise<void> {
  await browser.evaluate(
    pageId,
    `document.getElementById('${CROSSHAIR_ID}')?.remove()`,
  )
}
