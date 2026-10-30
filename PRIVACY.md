# Privacy policy

freeWrite is designed to keep your notes on your machine. This document
describes exactly what leaves your device and what does not.

## Summary

| Where the data goes | What is sent | When |
| --- | --- | --- |
| The OpenCode server started by the plugin | The note you are rewriting | Only while a rewrite is running |
| The model provider you configured | The prompt and the note text | Only while a rewrite is running |
| The publishing endpoint you configured | The generated drafts and their images | Only when you publish |
| The platform compose page in your browser | Nothing | Only when you open the page yourself |

There is no telemetry, no analytics, no crash reporting and no third-party
service that freeWrite contacts on its own.

## The local OpenCode server

freeWrite starts a headless `opencode serve` process and talks to it over
HTTP on `127.0.0.1`. The server binds to the loopback interface only, so it is
not reachable from other machines on your network. The plugin stops the process
when Obsidian closes.

The plugin writes its provider configuration into that server through the
`OPENCODE_CONFIG_CONTENT` environment variable. This is applied above your own
global and project OpenCode configuration and is never written to disk by
freeWrite, so your own `opencode.json` files are left untouched.

## Model providers

freeWrite never talks to a model provider itself. All model requests are made
by OpenCode, using the credentials stored in your own OpenCode profile, so
they follow whatever provider you chose and whatever configuration that
provider has.

API keys you type into the freeWrite settings are stored in the plugin's local
data file, inside your vault's `.obsidian` folder, and are pushed into
OpenCode's own credential store when you use **Sync credentials to OpenCode**.
They are never sent to the publishing endpoint and never sent to Obsidian.

## The publishing service

This is optional and off by default.

When you enable **Use a publishing service** and configure an endpoint, the
plugin sends one JSON document to that endpoint. It contains the drafts that
were generated, the titles, the tags, the images that were referenced by the
note, and — if you keep **Include the source note** switched on — the body of
the source note.

The plugin sends nothing to this endpoint until you press **Publish**, unless
you switch on **Send automatically**.

The endpoint is a service you operate. freeWrite has no opinion about what
runs behind it, and it never falls back to a different address if the request
fails.

## Platforms

freeWrite does not post to any social platform. When you publish through the
clipboard channel, the plugin puts the finished draft on your clipboard and
opens the platform's own compose page in your browser. You press publish there,
from a session you are signed in to. No credentials are shared with the
plugin, and the platform sees exactly what your browser sends it.

## Local data

freeWrite stores the following inside your vault:

- Plugin settings, including the provider profiles and any API keys, in
  `.obsidian/plugins/freewrite/data.json`.
- The generated drafts, as Markdown notes in the folder you configured
  (default: `freewrite/`).

Both live in your vault and are covered by whatever backup or sync you already
use for it. Nothing else is written.

## Removing the data

Uninstall the plugin and delete `.obsidian/plugins/freewrite/`. Delete the
draft folder if you do not want the generated notes. To remove the API keys
from OpenCode, remove the providers from the plugin settings and sync, or
remove them from OpenCode's own credential store.

## Contact

Questions about this policy can be raised as an issue on the plugin's
repository.
