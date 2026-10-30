# Contributing

Thanks for looking at freeWrite.

## Getting set up

```bash
npm install
npm run dev
```

`npm run dev` watches the sources and rebuilds `main.js`. Copy `main.js`,
`manifest.json` and `styles.css` into `<your-vault>/.obsidian/plugins/freewrite/`
to try a build, or point that folder at the repository with a symbolic link.

## Before you open a pull request

```bash
npm run check
```

That runs the type checker, the linter (including the Obsidian plugin rules),
the unit tests and the production build. `npm run release` then packages the
three plugin files into `dist/`, and `node scripts/verify-release.mjs` checks
them against the community plugin guidelines.

## House rules

- Keep the plugin free of third-party services. The only outbound requests are
  to the local OpenCode server and to the publishing endpoint the user
  configures. Anything else needs to be argued for in the pull request.
- Use the Obsidian API rather than direct DOM access, and let the theme
  variables style the interface rather than hard-coding colours.
- Do not use `innerHTML`. Build elements with `createEl` and `createDiv`.
- Register every listener and interval with the plugin so that it is cleaned
  up on unload.
- Add a test for anything that parses, counts or formats text.

## Reporting a bug

Open an issue and include the Obsidian version, the freeWrite version, your
platform and the OpenCode version. If the rewrite produced something wrong,
paste the model output as well.
