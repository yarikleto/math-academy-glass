# Privacy Policy for Math Academy Glass

Effective date: October 2, 2026

Math Academy Glass changes the appearance of Math Academy and provides in-page
study tools. Its functionality runs locally in the browser.

Math Academy Glass is an independent, unofficial project. It is not affiliated
with, endorsed by, or sponsored by Math Academy.

## Data processed locally

The extension reads Math Academy page structure, styles, visible course progress,
and task identifiers to render the theme, study tools, course counters, and
task timers. It records task start and finish times locally for the timer.
When the user chooses **Save card as PDF**, it prepares the selected instructional card for
Chrome's native print preview. It does not transmit lesson text, answers,
course progress, activity history, drawings, exported cards, or browsing
history.

The extension stores only:

- the enabled/paused setting and light/dark/system preference in Chrome synced
  storage;
- page-local drawings and tool state for the current document; and
- short-lived course counters and task timers in temporary extension storage,
  kept separately for each tab.

Drawings and tool positions are discarded when the page is reloaded or
replaced. Math Academy page scripts cannot access the extension-owned session
values. Tab state is scheduled for removal when its tab closes. A task timer
older than 12 hours or course-counter state older than 36 hours is rejected and
purged on the next access to that tab state. Session values are also cleared by
Chrome when the browser session ends or the extension is reloaded, updated, or
disabled in Chrome. Chrome controls the retention and synchronization of
appearance settings; when Chrome sync is enabled, Chrome may transmit those
two preferences through Google's sync service. The developer does not receive
them. Lesson content, drawings, task timers, and course counters are never
placed in synced storage.

Card export happens only when you request it. The extension prepares the
selected card for printing and clears its temporary print state when the
preview closes or the operation is cancelled, interrupted, or fails. It does
not save the card or print state in browser storage.

## Network and sharing

The extension has access only to `mathacademy.com` and its subdomains. It does
not include analytics, advertising, tracking, or a remote backend, and it does
not make network requests of its own. It does not sell or share personal data.

The card-export action uses Chrome's native print preview and requires no new
extension permission. If the user selects **Save as PDF**, Chrome handles the
filename, destination, and saved file. The extension does not receive the saved
PDF, its path, or a copy of its contents.

The **Open site** link in the popup opens Math Academy, and the optional
**LinkedIn** creator link opens LinkedIn. Both are explicit user-initiated
actions in a normal browser tab. Those sites and Chrome operate under their own
privacy terms.

The extension's use of information received from Chrome APIs is limited to
providing its disclosed, user-facing theme and study-tool features. It does not
use or transfer user data for advertising, creditworthiness, lending, or any
unrelated purpose, and no developer or third party can read locally processed
lesson data through an extension backend because no such backend exists.

## Project website

The project website is hosted on GitHub Pages. Visits to the website are handled
by GitHub under its [privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
The website contains no analytics, advertising, or account forms.

## User choices

Users can pause the extension from its popup, clear extension storage through
Chrome, or remove the extension at any time. Privacy questions can be sent to
[the project's GitHub support page](https://github.com/yarikleto/math-academy-glass/issues).
GitHub issues are public; do not include personal account details, lesson
content, or credentials. GitHub handles information you submit there under
its own privacy terms.
