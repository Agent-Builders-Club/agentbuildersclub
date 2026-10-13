# Agent Builders Club design principles

Use dark editorial composition, generous spacing, real photographs, hairline dividers and clear hierarchy. Preserve the meetup-first information architecture; do not add marketing sections or restore Projects as a design cleanup.

[globals.css](src/app/globals.css) owns current color and spacing tokens. [layout.tsx](src/app/layout.tsx) owns typography: Playfair Display headings and Karla body/UI. Do not copy the obsolete `claw-*` palette or Georgia/system-font inventory from older revisions. The [font-loader compatibility note](docs/font-loader-compatibility.md) explains the version-bound build workaround.

Treat wordmarks as identity artwork: fit the complete artwork into a clear region and keep captions outside it. Treat venue photography separately; The Copper Wall must retain the supplied photograph, link and Fort Worth location. Keep FTW DAO centered. The [product contract](docs/site-content-cleanup.md#acceptance) owns these choices.

Essential content must be visible before hydration and without JavaScript. Motion is optional enhancement, not the mechanism that exposes participation content. Avoid glow, glassmorphism, animated meshes, generic SaaS gradients and excessive rounded cards. Give menus a clear boundary from underlying page content.

Accessibility is a measured property of actual text/background states, not a blanket palette certification. Check native 320px/390px views, keyboard focus, contrast, disabled/loading/error states and reduced motion through real browser evidence. Owned CSS does not control Luma iframe text; retain a readable direct calendar fallback without claiming the third-party panel was repaired.
