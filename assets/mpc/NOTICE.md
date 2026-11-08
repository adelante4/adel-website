# MPC project template

`skeleton.json.gz` is the project the MPC export starts from: an Akai MPC Sample project with all pads blank. The export fills in the pads, the sample list and one sequence.

It is made by `tools/build-mpc-template.mjs` from `src/xpj/template.skeleton.json` of [WorldLinkStudio/mpcsample](https://github.com/WorldLinkStudio/mpcsample), which is licensed under the **GNU General Public License v3**. Float numbers in it are replaced by marker strings so that `1.0` is not written as `1` (the firmware needs the point). Nothing else in it is changed.

Because this file is derived from GPL-3 material, treat it as GPL-3. Everything else in the site is not affected as long as this file stays a separate data file.

## Using a template of your own instead

Save any project on your own MPC Sample (one drum program, one sample on a pad, one sequence) and either:

- pick the `.xpj` in the "Template for the MPC project" field on the metronome page (used for that export only), or
- run `node tools/build-mpc-template.mjs my-project.xpj` to replace `skeleton.json.gz`, then delete this notice.

A template saved on your own device also fixes any mismatch with your firmware version.
