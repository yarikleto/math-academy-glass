"""Build the static GitHub Pages site; no dependencies, tracking, or remote assets."""
import html
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
BASE = "https://yarikleto.github.io/math-academy-glass/"
REPO = "https://github.com/yarikleto/math-academy-glass"
STORE = "https://chromewebstore.google.com/detail/math-academy-glass/lmejjnljjohlghejbclappoijncmbomi"


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
 <div class="footer-links"><a href="{REPO}/blob/main/LICENSE">MIT licensed</a><a href="support.html">Get help</a><a href="privacy.html">Privacy policy</a><span>© 2026 <a href="https://www.linkedin.com/in/yarik-leto">Yarik Leto</a></span></div>
</footer>
</body></html>
'''


HOME = f'''
<section class="hero product-hero" aria-labelledby="hero-title">
 <p class="eyebrow"><span class="status-dot"></span> Free &amp; open source · Chrome extension</p>
 <h1 id="hero-title">Clear your space.<br><span>Explore your ideas.</span></h1>
 <p class="hero-copy">A calmer Math Academy, with drawing, geometry, and study tools right where you need them.</p>
 <div class="actions"><a class="button primary" href="{STORE}">Add to Chrome <span aria-hidden="true">↗</span></a><a class="button secondary" href="{REPO}">Explore the source</a></div>
 <p class="small">Free to use. Open source. Made for Chrome.</p>
</section>
<section class="showcase" aria-label="Explore extension previews">
 <fieldset class="preview-switch"><legend>Take a closer look</legend>
 <input type="radio" name="preview" id="preview-tools" checked><label for="preview-tools">Study tools</label>
 <input type="radio" name="preview" id="preview-light"><label for="preview-light">Light</label>
 <input type="radio" name="preview" id="preview-dark"><label for="preview-dark">Dark</label>
 <div class="preview-window"><div class="window-bar" aria-hidden="true"><span class="window-dots"><i></i><i></i><i></i></span><span>Math Academy Glass · Feature preview</span><span>↗</span></div>
 <img class="preview-image tools-image" src="assets/preview-tools.png" width="1280" height="800" alt="Study tools open beside a sample circle lesson, showing pen controls and a transparent protractor.">
 <img class="preview-image light-image" src="assets/preview-light.png" width="1280" height="800" alt="Light appearance with a readable sample lesson and circle diagram.">
 <img class="preview-image dark-image" src="assets/preview-dark.png" width="1280" height="800" alt="Dark appearance with navy surfaces and preserved diagram colors.">
 </div></fieldset>
 <p class="preview-note">The extension in action on an original sample lesson. Select a preview above.</p>
</section>
<section id="before-after" class="comparison section" aria-labelledby="comparison-title">
 <div class="section-heading"><p class="eyebrow">Before &amp; after</p><h2 id="comparison-title">Same Math Academy.<br>A clearer view.</h2><p>The league menu, before and after switching on Math Academy Glass.</p></div>
 <div class="comparison-grid">
  <figure class="comparison-shot"><figcaption><strong>Before</strong><span>Original Math Academy</span></figcaption><div class="comparison-image"><img src="assets/league-before.png" width="840" height="1004" loading="lazy" decoding="async" alt="Original Math Academy league menu with flat color dots, square borders, and no highlighted current league."></div></figure>
  <figure class="comparison-shot"><figcaption><strong>After</strong><span>Math Academy Glass · Light</span></figcaption><div class="comparison-image"><img src="assets/league-after.png" width="786" height="856" loading="lazy" decoding="async" alt="The same league menu with rounded glass surfaces, gemstone icons, and a blue highlight on the current Ruby League."></div></figure>
 </div>
</section>
<nav class="feature-nav" aria-label="Explore features"><a href="#before-after">Before &amp; after</a><a href="#appearance">Appearance</a><a href="#drawing">Drawing</a><a href="#geometry">Geometry</a><a href="#printing">PDF export</a><a href="#local-title">Privacy</a></nav>
<section class="features section" aria-labelledby="features-title">
 <div class="section-heading"><p class="eyebrow">A little more clarity. A lot more possibility.</p><h2 id="features-title">Everything you need.<br>Right on the page.</h2></div>
 <div class="product-grid">
  <article id="appearance" class="feature-tile wide appearance-tile"><div class="tile-copy"><span class="tile-category">01 / Appearance</span><h3>Find your kind of calm.</h3><p>Near-white glass by day. Deep navy by night. Choose Light, Dark, or System, with comfortable typography made for longer study sessions.</p><span class="detail">Switch with ⌘ / Ctrl + Shift + L</span></div><div class="theme-pair" aria-label="Illustrated light and dark reading surfaces"><div class="reading-sample"><span>Light</span><strong>Room to think.</strong><p>Clear type. Quiet surfaces.</p><div class="sample-equation">A = πr²</div></div><div class="reading-sample night"><span>Dark</span><strong>Stay in your flow.</strong><p>The same clarity, after dark.</p><div class="sample-equation">C = 2πr</div></div></div></article>
  <article id="drawing" class="feature-tile"><div class="tile-copy"><span class="tile-category">02 / Drawing</span><h3>Think with your pen.</h3><p>Sketch an idea over the page. Five colors, three widths, a stroke eraser, and undo when you change your mind.</p></div><div class="ink-preview" aria-hidden="true"><svg viewBox="0 0 440 130" fill="none"><path d="M30 93 C90 95 80 26 147 37 S197 117 252 76 S304 25 342 48 S367 77 413 29" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M61 110 Q196 119 331 99" stroke="#078368" stroke-width="2.5" stroke-linecap="round"/></svg><div class="pen-swatches"><i></i><i></i><i></i><i></i><i></i><span>⌘ Z</span></div></div></article>
  <article id="geometry" class="feature-tile"><div class="tile-copy"><span class="tile-category">03 / Geometry</span><h3>A whole geometry set.<br>Zero desk space.</h3><p>Trace a ruler’s edge. Measure with a 180° or 360° protractor. Move a compass and keep its span.</p></div><div class="geometry-preview" aria-hidden="true"><svg viewBox="0 0 440 190" fill="none"><circle cx="222" cy="102" r="72" stroke="currentColor" stroke-dasharray="4 5"/><path d="M57 156 L222 29 L353 156 Z" stroke="currentColor" stroke-width="2"/><path d="M177 156 A45 45 0 0 1 188 126" stroke="#078368" stroke-width="3"/><circle cx="222" cy="102" r="4" fill="currentColor"/><path d="M222 102 H294" stroke="currentColor" stroke-width="2"/></svg><span>Measure. Trace. Construct.</span></div></article>
  <article id="printing" class="feature-tile print-tile"><div class="tile-copy"><span class="tile-category">04 / Lesson-card PDF</span><h3>Take an idea with you.</h3><p>Save an eligible tutorial, worked example, or topic-reference card through Chrome’s print preview. Keep the title, math, and diagrams together.</p><span class="detail">You choose Save as PDF or a printer.</span></div><div class="paper-preview" aria-hidden="true"><span>Lesson notes <b>↓ PDF</b></span><strong>Explore a circle</strong><div class="sample-equation">A = πr²</div><div class="paper-lines"></div></div></article>
  <article class="feature-tile"><div class="tile-copy"><span class="tile-category">05 / Study rhythm</span><h3>Keep your bearings.</h3><p>Local task timers and course-topic counters help you see where you are. Pause the extension from its popup whenever you like.</p></div><div class="rhythm-preview" aria-hidden="true"><span>Time on task</span><strong>04<span>:</span>32</strong><div class="quiet-track"><i></i></div><span>One step at a time.</span></div></article>
 </div>
</section>
<section class="privacy-callout section" aria-labelledby="local-title"><div><p class="eyebrow">Your work stays yours</p><h2 id="local-title">Local by design.</h2></div><div><p>Lesson content, drawings, and study counters stay in your browser. Only your two appearance preferences use Chrome sync. No ads, analytics, or extension-operated servers.</p><a class="text-link" href="privacy.html">Read the privacy policy <span aria-hidden="true">→</span></a></div></section>
<section id="install" class="install section" aria-labelledby="install-title"><div class="section-heading"><p class="eyebrow">Start your next study session</p><h2 id="install-title">Make yourself<br>at home.</h2><p>Now available in the Chrome Web Store. Install in a few clicks and receive automatic updates.</p><a class="button primary" href="{STORE}">Add to Chrome <span aria-hidden="true">↗</span></a></div>
<div class="card"><ol class="steps"><li><strong>Open the Chrome Web Store</strong><p>Visit the <a href="{STORE}">Math Academy Glass listing</a>.</p></li><li><strong>Add to Chrome</strong><p>Select <strong>Add to Chrome</strong>, then confirm with <strong>Add extension</strong>.</p></li><li><strong>Make it yours</strong><p>Open or refresh Math Academy. Open the extension popup to choose a theme, then use the study-tools button on the page.</p></li></ol></div></section>
<details><summary>Install from source (advanced)</summary><p>For development or testing, <a href="{REPO}/archive/refs/heads/main.zip">download the source ZIP</a>, unzip it, and keep the folder somewhere permanent.</p><p>Open <code>chrome://extensions</code>, turn on Developer mode, select <strong>Load unpacked</strong>, and choose the folder containing <code>manifest.json</code>. Refresh Math Academy to get started.</p><p>Source installations require manual updates: download or pull the latest source, reload the extension, and refresh Math Academy.</p></details>
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
