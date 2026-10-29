# Chemical formulas and equations in "Insert formula"

[简体中文](2026-10-28-chemistry-formulas.zh-CN.md)

## Problem and outcome

Implements [Issue #717](https://github.com/tianma-if/edgeever/issues/717). Chemistry had to be written by hand with subscripts, superscripts, arrow commands and `\mathrm{}`. Note math now understands the KaTeX `mhchem` extension: `\ce{…}` for formulas and equations and `\pu{…}` for quantities with units. The "Insert formula" dialog has a Math / Chemistry switch with one-click examples.

## Behavior

| ID | Behavior | Acceptance |
| --- | --- | --- |
| C01 | `katex/contrib/mhchem` is registered by the shared math extensions, so `\ce` and `\pu` render in the web and desktop editor, the Android and iOS editors, public share pages and notebook sites. The dialog preview and the WeChat copy register it as well. `trust: false` still applies; commands such as `\href` inside `\ce` stay inert text. | Shared tests render every example inline and as a display formula through the shared module only, and fail without the registration. |
| C02 | Formulas are stored unchanged as inline or display math (`$\ce{H2O}$`, `$$…$$`). There is no data, API or migration change. | Markdown round-trip test. |
| C03 | The dialog's Math / Chemistry switch is shown for new and existing formulas. Chemistry uses the LaTeX source field, because the visual math editor would rewrite `\ce`; a formula containing `\ce` or `\pu` opens in this mode, and the visual editor toggle is hidden while the source contains them. | Browser test: insert, edit and reopen inline and display chemistry. |
| C04 | Ten examples (formula, ion, reaction, equilibrium, conditions on the arrow, gas/precipitate, states of matter, isotope, hydrate, units) insert at the caret; inside an open `\ce{…}` only the example's content is inserted. Each example has a Tooltip with its source. Copy is in all shipped locales. | Unit tests for insertion and labels; browser test in `pl-PL` at 1280 px and 390 px. |

## Risk and rollback

The editor bundle grows by the mhchem module (about 34 KB minified). Older app versions show existing `\ce` formulas as render errors until they update; the stored text is unchanged. The committed iOS editor bundle (`apps/ios/EditorBundle`) has to be rebuilt in the usual iOS release step to include the extension. Rollback is a revert; stored chemistry formulas then show as render errors again.
