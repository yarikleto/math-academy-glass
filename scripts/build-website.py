"""Build the static GitHub Pages site; no dependencies, tracking, or remote assets."""
import html
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
BASE = "https://yarikleto.github.io/math-academy-glass/"
REPO = "https://github.com/yarikleto/math-academy-glass"


def inline(value):
    value = html.escape(value)
    value = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", value)
    value = re.sub(r"\[([^\]]+)\]\((https://[^\s)]+)\)", r'<a href="\2">\1</a>', value)
    return re.sub(r"`(.+?)`", r"<code>\1</code>", value)


def policy_content():
    blocks = []
    for block in (ROOT / "PRIVACY.md").read_text().strip().split("\n\n"):
        if block.startswith("# "):
            blocks.append(f"<h1>{inline(block[2:])}</h1>")
        elif block.startswith("## "):
            blocks.append(f"<h2>{inline(block[3:])}</h2>")
        elif block.startswith("- "):
            items = re.split(r"\n- ", block[2:])
            blocks.append("<ul>" + "".join(f"<li>{inline(' '.join(item.splitlines()))}</li>" for item in items) + "</ul>")
        else:
            blocks.append(f"<p>{inline(' '.join(block.splitlines()))}</p>")
    return '\n'.join(blocks)


def page(title, description, filename, body):
    navigation = []
    for url, label in [('index.html', 'Overview'), ('support.html', 'Support'), ('privacy.html', 'Privacy')]:
        current = ' aria-current="page"' if url == filename else ''
        navigation.append(f'<a href="{url}"{current}>{label}</a>')
    links = ''.join(navigation)
    return f'''<!doctype html>
<html lang="en" data-ma-glass-enabled="true">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{html.escape(description, quote=True)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{html.escape(description, quote=True)}">
<meta property="og:image" content="{BASE}assets/readme-banner.png">
<meta property="og:type" content="website">
<link rel="canonical" href="{BASE}{'' if filename == 'index.html' else filename}">
<link rel="icon" type="image/svg+xml" href="assets/icon.svg">
<link rel="stylesheet" href="site.css">
<title>{html.escape(title)}</title>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header wrap">
 <a class="brand" href="index.html"><img src="assets/icon.svg" width="36" height="36" alt=""><span>Math Academy <strong>Glass</strong></span></a>
 <nav aria-label="Main navigation">{links}<a href="{REPO}">GitHub ↗</a></nav>
</header>
<main id="main" class="wrap">{body}</main>
<footer class="site-footer wrap">
 <div><strong>Math Academy Glass</strong><p>An independent, unofficial study companion.<br>Not affiliated with, endorsed by, or sponsored by Math Academy.</p></div>
 <div class="footer-links"><a href="{REPO}/blob/main/LICENSE">MIT licensed</a><a href="support.html">Get help</a><a href="privacy.html">Privacy policy</a><span>© 2026 Yarik Leto</span></div>
</footer>
</body></html>
'''


HOME = f'''
<section class="hero" aria-labelledby="hero-title">
 <p class="eyebrow"><span class="status-dot"></span> Free &amp; open source · Chrome extension</p>
 <h1 id="hero-title">A calmer space<br>to study.</h1>
 <p class="hero-copy">Give Math Academy a clear glass appearance and a set of thoughtful tools for working through your next idea.</p>
 <div class="actions"><a class="button primary" href="#install">Get the extension <span aria-hidden="true">↗</span></a><a class="button secondary" href="{REPO}">Explore the source</a></div>
 <p class="small">Light, dark, or your system appearance. Always your choice.</p>
</section>
<figure class="banner"><img src="assets/readme-banner.png" width="2172" height="724" alt="Math Academy Glass: clear glass geometry instruments against light and dark backgrounds."><figcaption>Clear thinking. Clear tools.</figcaption></figure>
<section class="features section" aria-labelledby="features-title">
 <div class="section-heading"><p class="eyebrow">Made for the way you learn</p><h2 id="features-title">Less friction.<br>More room to think.</h2></div>
 <div class="feature-grid">
  <article class="card"><span class="feature-symbol" aria-hidden="true">◐</span><h3>Find your light</h3><p>Comfortable light and dark themes, readable lessons, and quiet glass surfaces. Follow your system appearance or switch whenever you like.</p></article>
  <article class="card"><span class="feature-symbol" aria-hidden="true">∠</span><h3>Work it out here</h3><p>Draw, erase, and undo right on the page. Combine a ruler, a 180° or 360° protractor, and a compass to explore lengths and angles.</p></article>
  <article class="card"><span class="feature-symbol" aria-hidden="true">↗</span><h3>Keep your flow</h3><p>See local task timers and course counters. Send a selected instructional card to Chrome’s print preview to save it as a PDF.</p></article>
 </div>
</section>
<section class="privacy-callout section" aria-labelledby="local-title"><div><p class="eyebrow">Your work stays yours</p><h2 id="local-title">Local by design.</h2></div><div><p>Lesson content, drawings, and study counters stay in your browser. Only your two appearance preferences use Chrome sync. No ads, analytics, or extension-operated servers.</p><a class="text-link" href="privacy.html">Read the privacy policy <span aria-hidden="true">→</span></a></div></section>
<section id="install" class="install section" aria-labelledby="install-title"><div class="section-heading"><p class="eyebrow">Start your next study session</p><h2 id="install-title">Make yourself<br>at home.</h2><p>Install from the public source while the Chrome Web Store listing is being prepared.</p><a class="button primary" href="{REPO}/archive/refs/heads/main.zip">Download source ZIP <span aria-hidden="true">↓</span></a></div>
<div class="card"><ol class="steps"><li><strong>Download and unzip</strong><p>Keep the extracted folder somewhere permanent.</p></li><li><strong>Load in Chrome</strong><p>Open <code>chrome://extensions</code>, turn on Developer mode, select <strong>Load unpacked</strong>, and choose the folder containing <code>manifest.json</code>.</p></li><li><strong>Make it yours</strong><p>Refresh Math Academy. Open the extension popup to choose a theme, then use the study-tools button on the page.</p></li></ol></div></section>
<p class="requirements">Requires Chrome 111 or newer. Learning features require your own Math Academy account and access to its content. This extension does not include a Math Academy subscription.</p>
'''

SUPPORT = f'''
<section class="page-intro"><p class="eyebrow">A little help, when you need it</p><h1>Let’s get you<br>back to studying.</h1><p>Quick answers, practical fixes, and a direct line to the project.</p></section>
<section class="support-grid" aria-label="Support options"><article class="card"><h2>Report a problem</h2><p>Found a bug or have an idea? Check existing issues or start a new report on GitHub.</p><a class="button primary" href="{REPO}/issues">Open GitHub Issues ↗</a><p class="small">A GitHub account is needed to post. Issues are public.</p></article><article class="card"><h2>Security or sensitive concerns</h2><p>Use a private security report for vulnerabilities. Don’t include credentials, personal details, or lesson content in public issues.</p><a class="text-link" href="{REPO}/security/advisories/new">Send a private security report →</a></article></section>
<section class="faq section" aria-labelledby="faq-title"><p class="eyebrow">Common questions</p><h2 id="faq-title">A few things to try.</h2>
<details open><summary>The theme isn’t showing up</summary><p>Make sure the extension is enabled in Chrome and switched on in its popup. It works only on HTTPS Math Academy pages. Refresh the page after installing or reloading the extension.</p></details>
<details><summary>How do I return to the original appearance?</summary><p>Switch the extension off from its popup. You can also choose System, Light, or Dark there. Command/Ctrl + Shift + L switches light and dark when you’re not typing in an editable field.</p></details>
<details><summary>Where did my drawings go?</summary><p>Drawings and geometry-tool positions belong to the current page and reset when you reload or navigate. Use Command/Ctrl + Z to undo a mark, erase, or clear action before leaving the page.</p></details>
<details><summary>How do I move or draw with the instruments?</summary><p>Drag a ruler or protractor by its clear body and rotate it using its round handle. Enable Draw to trace the instrument edges. The compass keeps its span when you move its pivot. Press Escape to turn the active tools off.</p></details>
<details><summary>Why don’t all cards have a PDF button?</summary><p>Printing is available for eligible tutorial, worked-example, and noninteractive topic-reference cards. Question and answer cards are intentionally excluded. The button opens Chrome’s print preview, where you choose Save as PDF or cancel.</p></details>
<details><summary>Do I need a Math Academy subscription?</summary><p>You need your own Math Academy account and access to the lessons you want to use. Math Academy Glass is a free, independent extension and doesn’t provide subscription access.</p></details>
</section>
<section class="report-note card"><h2>A useful bug report includes…</h2><p>Your Chrome and extension versions, operating system, selected theme, the kind of page you were on, and steps to reproduce the problem. Remove account details and lesson content from any screenshots.</p><a class="text-link" href="{REPO}/blob/main/README.md">Read the full usage guide →</a></section>
'''


def main():
    DOCS.mkdir(exist_ok=True)
    pages = {
        'index.html': page('Math Academy Glass — A calmer space to study', 'An unofficial, open-source glass theme and local study toolkit for Math Academy.', 'index.html', HOME),
        'support.html': page('Support — Math Academy Glass', 'Get help with themes, drawing tools, installation, and lesson-card printing.', 'support.html', SUPPORT),
        'privacy.html': page('Privacy Policy — Math Academy Glass', 'How Math Academy Glass handles data, appearance preferences, and local study tools.', 'privacy.html', '<article class="policy">' + policy_content() + '</article>'),
    }
    for filename, content in pages.items():
        (DOCS / filename).write_text(content)
    print('Generated homepage, support page, and privacy policy in docs/.')


if __name__ == '__main__':
    main()
