TARANIS CRM — INSTALLING THE BRAND FONTS
========================================

Right now the app uses free stand-ins that are close in feel:

    GT Flexa Ext Rg      ->  Archivo Expanded   (titles)
    AktivGrotesk-Light   ->  Inter Light        (body)

To use the real ones, put these files in a folder called "fonts"
next to index.html, named EXACTLY like this:

    fonts/GT-Flexa-Expanded-Regular.woff2
    fonts/AktivGrotesk-Light.woff2
    fonts/AktivGrotesk-Regular.woff2      (optional)
    fonts/AktivGrotesk-Medium.woff2       (optional)

Nothing else needs changing. The app already looks for them and
switches over the moment they appear.


BEFORE YOU DO THAT — READ THIS
------------------------------

Both are commercial typefaces:

    GT Flexa       Grilli Type      gt-flexa.com
    Aktiv Grotesk  Dalton Maag      daltonmaag.com

Taranis almost certainly already holds licences, since these are the
brand fonts. But two things to check with whoever owns the brand
assets or handles the licences:

1. Does the licence cover WEB use? A desktop licence (for InDesign,
   PowerPoint) does not automatically allow webfonts. They are sold
   separately, and web licences are usually capped by pageviews.

2. THE REPOSITORY IS PUBLIC. Anyone can download any file in it,
   including font files. Most webfont licences forbid redistributing
   the font files, and a public repo is arguably doing exactly that.

If either answer is uncertain, one of these fixes it:

   a) Make the repository private. GitHub Pages then needs a paid
      plan (Pro, Team or Enterprise).
   b) Host the fonts on the foundry's own service. Both foundries
      offer this, and it keeps the files off your repo entirely.
   c) Leave the free stand-ins in place for the internal tool, and
      keep the licensed fonts for client-facing material.

Do not just drop the files in and hope. Ask first. A font licence
breach is an easy thing to avoid and an awkward thing to explain.
